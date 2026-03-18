#!/usr/bin/env node

/**
 * Runbook Renderer
 *
 * Purpose: Render runbook template with observation and reflection data
 * Usage: node scripts/lib/runbook-renderer.js --org <org-alias> [options]
 *
 * Features:
 * - Loads runbook template
 * - Merges observation data and reflection sections
 * - Renders markdown runbook
 * - Supports custom template paths
 *
 * Template Variables:
 * - {{org_name}}, {{org_alias}}, {{platform}}, {{last_updated}}
 * - {{observation_count}}, {{reflection_count}}, {{version}}
 * - {{#if variable}}...{{/if}} - Conditional sections
 * - {{#each array}}...{{/each}} - Loop sections
 *
 * Exit Codes:
 *   0 - Success
 *   1 - Error (missing template, invalid data)
 */

const fs = require('fs');
const path = require('path');

/**
 * Simple template renderer (lightweight, no external dependencies)
 * Supports:
 * - {{variable}} - Simple substitution
 * - {{#if variable}}...{{else}}...{{/if}} - Conditionals
 * - {{#each array}}...{{/each}} - Loops with {{this.property}} or {{this}}
 * - {{@index}} - Loop index (0-based)
 */
class SimpleTemplateEngine {
  constructor(template) {
    this.template = template;
  }

  render(data) {
    const ast = this.parseTemplate(this.template);
    return this.renderNodes(ast, {
      root: data,
      this: data,
      '@index': null
    });
  }

  parseTemplate(template) {
    const root = { type: 'root', children: [] };
    const stack = [{ node: root, branch: 'children' }];
    const tagRegex = /\{\{([\s\S]*?)\}\}/g;
    let cursor = 0;

    const pushNode = (node) => {
      const current = stack[stack.length - 1];
      if (current.node.type === 'if') {
        current.node[current.branch].push(node);
      } else {
        current.node.children.push(node);
      }
    };

    for (const match of template.matchAll(tagRegex)) {
      const [fullTag, rawTag] = match;
      const tagStart = match.index || 0;
      const tag = (rawTag || '').trim();

      if (tagStart > cursor) {
        pushNode({ type: 'text', value: template.slice(cursor, tagStart) });
      }

      if (tag.startsWith('#if ')) {
        const expression = tag.slice(4).trim();
        const ifNode = { type: 'if', expression, truthy: [], falsy: [] };
        pushNode(ifNode);
        stack.push({ node: ifNode, branch: 'truthy' });
      } else if (tag === 'else') {
        const current = stack[stack.length - 1];
        if (current?.node?.type === 'if') {
          current.branch = 'falsy';
        } else {
          pushNode({ type: 'text', value: fullTag });
        }
      } else if (tag === '/if') {
        const current = stack[stack.length - 1];
        if (current?.node?.type === 'if') {
          stack.pop();
        } else {
          pushNode({ type: 'text', value: fullTag });
        }
      } else if (tag.startsWith('#each ')) {
        const expression = tag.slice(6).trim();
        const eachNode = { type: 'each', expression, children: [] };
        pushNode(eachNode);
        stack.push({ node: eachNode, branch: 'children' });
      } else if (tag === '/each') {
        const current = stack[stack.length - 1];
        if (current?.node?.type === 'each') {
          stack.pop();
        } else {
          pushNode({ type: 'text', value: fullTag });
        }
      } else {
        pushNode({ type: 'var', expression: tag });
      }

      cursor = tagStart + fullTag.length;
    }

    if (cursor < template.length) {
      pushNode({ type: 'text', value: template.slice(cursor) });
    }

    return root.children;
  }

  renderNodes(nodes, scope) {
    return nodes.map(node => {
      if (node.type === 'text') {
        return node.value;
      }

      if (node.type === 'var') {
        return this.stringifyValue(this.resolveValue(node.expression, scope));
      }

      if (node.type === 'if') {
        const value = this.resolveValue(node.expression, scope);
        if (this.isTruthy(value)) {
          return this.renderNodes(node.truthy, scope);
        }
        return this.renderNodes(node.falsy, scope);
      }

      if (node.type === 'each') {
        const value = this.resolveValue(node.expression, scope);
        if (!Array.isArray(value) || value.length === 0) {
          return '';
        }

        return value.map((item, index) => this.renderNodes(node.children, {
          ...scope,
          this: item,
          '@index': index + 1
        })).join('');
      }

      return '';
    }).join('');
  }

  resolveValue(expression, scope) {
    if (!expression) {
      return undefined;
    }

    if (expression === '@index') {
      return scope['@index'];
    }

    if (expression === 'this') {
      return scope.this;
    }

    const parts = expression.split('.');
    let value;

    if (parts[0] === 'this') {
      value = scope.this;
      parts.shift();
    } else {
      value = scope.root;
    }

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  stringifyValue(value) {
    if (value === undefined || value === null) {
      return '';
    }
    if (typeof value === 'object') {
      return '';
    }
    return String(value);
  }

  isTruthy(value) {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return Boolean(value);
  }
}

/**
 * Load observation data using standardized path conventions
 */
function loadObservationData(workspaceRoot, org) {
  const { getInstancePathWithFallback } = require('./path-conventions');
  const observationsDir = getInstancePathWithFallback('salesforce', org, {
    org: process.env.ORG_SLUG || process.env.CLIENT_ORG,
    subdir: 'observations',
    pluginRoot: workspaceRoot
  });

  if (!fs.existsSync(observationsDir)) {
    return [];
  }

  const files = fs.readdirSync(observationsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(observationsDir, f));

  const observations = files.map(file => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (err) {
      console.warn(`⚠️  Failed to parse ${file}: ${err.message}`);
      return null;
    }
  }).filter(Boolean);

  return observations;
}

/**
 * Aggregate observations into runbook data structure
 */
function aggregateObservations(observations) {
  const aggregated = {
    objects: {},
    workflows: {},
    operations_count: observations.length,
    last_operation: observations.length > 0 ? observations[observations.length - 1].timestamp : null
  };

  observations.forEach(obs => {
    if (!obs || typeof obs !== 'object') {
      return;
    }

    const context = (obs.context && typeof obs.context === 'object') ? obs.context : {};
    const objects = Array.isArray(context.objects) ? context.objects : [];
    const workflows = Array.isArray(context.workflows) ? context.workflows : [];

    // Aggregate objects
    objects.forEach(obj => {
      if (!aggregated.objects[obj]) {
        aggregated.objects[obj] = {
          name: obj,
          api_name: obj,
          observations: 0
        };
      }
      aggregated.objects[obj].observations++;
    });

    // Aggregate workflows
    workflows.forEach(workflow => {
      if (!aggregated.workflows[workflow]) {
        aggregated.workflows[workflow] = {
          name: workflow,
          type: obs.operation === 'workflow-create' ? 'Active' : 'Unknown',
          observations: 0
        };
      }
      aggregated.workflows[workflow].observations++;
    });
  });

  // Convert to arrays
  aggregated.objects = Object.values(aggregated.objects);
  aggregated.workflows = Object.values(aggregated.workflows);

  return aggregated;
}

/**
 * Merge observation data with reflection sections
 */
function mergeData(org, observations, reflectionSections) {
  const aggregated = aggregateObservations(observations);
  const metricSemantics = reflectionSections?.metric_semantics || {};
  const metricSummary = metricSemantics.summary || {};
  const metricEntries = Array.isArray(metricSemantics.entries) ? metricSemantics.entries : [];
  const reportDiagnostics = reflectionSections?.report_diagnostics || {};
  const personaKpi = reflectionSections?.persona_kpi || {};
  const reportSummary = reportDiagnostics.summary || {};
  const reportEntries = Array.isArray(reportDiagnostics.entries) ? reportDiagnostics.entries : [];
  const intentSummaryEntries = Object.entries(reportSummary.intentCounts || {});
  const intentSummaryText = intentSummaryEntries.length > 0
    ? intentSummaryEntries.map(([label, count]) => `${label} (${count})`).join(', ')
    : '';

  const personaSummary = personaKpi.summary || {};
  const personaEntries = Array.isArray(personaKpi.entries) ? personaKpi.entries : [];
  const personaCountsEntries = Object.entries(personaSummary.personaCounts || {});
  const personaCountsText = personaCountsEntries.length > 0
    ? personaCountsEntries.map(([label, count]) => `${label} (${count})`).join(', ')
    : '';

  return {
    org_name: org.charAt(0).toUpperCase() + org.slice(1),
    org_alias: org,
    platform: 'Salesforce',
    last_updated: new Date().toISOString().split('T')[0],
    observation_count: observations.length,
    reflection_count: reflectionSections?.reflections_analyzed || 0,
    version: '1.0.0',

    // Platform overview
    org_type: 'Production',  // TODO: Auto-detect from org info
    api_version: 'v62.0',    // TODO: Auto-detect
    last_assessment_date: aggregated.last_operation ? new Date(aggregated.last_operation).toISOString().split('T')[0] : 'N/A',
    total_objects: aggregated.objects.length,
    total_fields: 0,  // TODO: Calculate from observations
    active_workflows: aggregated.workflows.length,

    // Data model
    objects: aggregated.objects.map(obj => ({
      name: obj.name,
      api_name: obj.api_name,
      record_count: 'TBD',
      key_fields: 'TBD',
      custom_fields_count: 0
    })),

    // Workflows
    workflows: aggregated.workflows.map(wf => ({
      name: wf.name,
      type: wf.type,
      trigger: 'TBD',
      status: 'Active'
    })),

    // Integrations (placeholder)
    integrations: [],

    // Known exceptions (from reflections)
    known_exceptions: reflectionSections?.known_exceptions || [],

    // Common errors (from reflections)
    common_errors: (reflectionSections?.patterns?.common_errors || []).map(err => ({
      taxonomy: err.taxonomy,
      count: err.count,
      priority: err.examples[0]?.priority || 'P2',
      examples: err.examples.map(ex => ({ description: ex.description })),
      prevention: 'Add validation to prevent recurrence'
    })),

    // Recommendations (from reflections)
    recommendations: reflectionSections?.recommendations || reflectionSections?.operational_recommendations || [],

    // Operational notes
    operational_notes: `This runbook is based on ${observations.length} observed operations and ${reflectionSections?.reflections_analyzed || 0} user reflections.`,

    // Metric semantics
    metric_semantics_entries: metricEntries.map(entry => ({
      timestamp: entry.timestamp || '',
      type: entry.type || '',
      metricId: entry.metricId || '',
      reportName: entry.reportName || '',
      warningSummary: entry.warningSummary || ''
    })),
    metric_semantics_last_updated: metricSummary.lastUpdated || '',
    metric_semantics_mapping_count: metricSummary.mappingDecisions || 0,
    metric_semantics_semantic_warning_count: metricSummary.semanticWarnings || 0,
    metric_semantics_failure_warning_count: metricSummary.failureModeWarnings || 0,
    metric_semantics_process_notes: metricSemantics.process_notes || '',

    // Report diagnostics
    report_diagnostics_entries: reportEntries.map(entry => ({
      timestamp: entry.timestamp || '',
      reportName: entry.reportName || '',
      overallStatus: entry.overallStatus || '',
      primaryIntent: entry.primaryIntent || '',
      issueSummary: entry.issueSummary || ''
    })),
    report_diagnostics_last_updated: reportSummary.lastUpdated || '',
    report_diagnostics_pass_count: reportSummary.passCount || 0,
    report_diagnostics_warn_count: reportSummary.warnCount || 0,
    report_diagnostics_fail_count: reportSummary.failCount || 0,
    report_diagnostics_intent_summary: intentSummaryText,
    report_diagnostics_process_notes: reportDiagnostics.process_notes || '',

    // Persona KPI diagnostics
    persona_kpi_entries: personaEntries.map(entry => ({
      timestamp: entry.timestamp || '',
      dashboardName: entry.dashboardName || '',
      persona: entry.persona || '',
      status: entry.status || '',
      issueSummary: entry.issueSummary || ''
    })),
    persona_kpi_last_updated: personaSummary.lastUpdated || '',
    persona_kpi_pass_count: personaSummary.passCount || 0,
    persona_kpi_warn_count: personaSummary.warnCount || 0,
    persona_kpi_persona_summary: personaCountsText,
    persona_kpi_process_notes: personaKpi.process_notes || '',

    // Best practices
    best_practices: [
      'Review this runbook before major deployments',
      'Update runbook after significant changes',
      'Document manual interventions for future automation',
      'Capture exceptions in `/reflect` for trend analysis'
    ],

    // Revision history
    revision_history: []
  };
}

/**
 * Render runbook from template and data
 */
function renderRunbook(templatePath, data) {
  const template = fs.readFileSync(templatePath, 'utf-8');
  const engine = new SimpleTemplateEngine(template);
  return engine.render(data);
}

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    org: null,
    template: null,
    output: null,
    reflectionSections: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--org':
        options.org = next;
        i++;
        break;
      case '--template':
        options.template = next;
        i++;
        break;
      case '--output':
        options.output = next;
        i++;
        break;
      case '--reflection-sections':
        // Load reflection sections from JSON file
        try {
          options.reflectionSections = JSON.parse(fs.readFileSync(next, 'utf-8'));
        } catch (err) {
          console.error(`❌ Failed to load reflection sections: ${err.message}`);
          process.exit(1);
        }
        i++;
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`❌ Unknown option: ${arg}`);
          printUsage();
          process.exit(1);
        }
    }
  }

  return options;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log('Usage: runbook-renderer.js --org <org-alias> [options]');
  console.log('');
  console.log('Required Arguments:');
  console.log('  --org <alias>                Salesforce org alias');
  console.log('');
  console.log('Optional Arguments:');
  console.log('  --template <path>            Custom template path (default: templates/runbook-template.md)');
  console.log('  --output <file>              Save output to file (default: instances/{org}/RUNBOOK.md)');
  console.log('  --reflection-sections <file> Load reflection sections from JSON file');
  console.log('');
  console.log('Examples:');
  console.log('  # Generate runbook for delta-sandbox');
  console.log('  node runbook-renderer.js --org delta-sandbox');
  console.log('');
  console.log('  # Generate with reflection sections');
  console.log('  node runbook-renderer.js --org acme-production \\');
  console.log('    --reflection-sections instances/acme-production/reflection-sections.json');
}

/**
 * Detect workspace root directory (where instances/ or orgs/ are located)
 */
function detectWorkspaceRoot() {
  const candidates = [
    process.env.WORKSPACE_DIR,
    process.env.CLAUDE_PROJECT_DIR,
    process.env.PWD,
    process.cwd()
  ].filter(Boolean);

  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ? path.resolve(process.env.CLAUDE_PLUGIN_ROOT) : null;

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(path.join(resolved, 'instances')) || fs.existsSync(path.join(resolved, 'orgs'))) {
      return resolved;
    }
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!pluginRoot || resolved !== pluginRoot) {
      return resolved;
    }
  }

  return process.cwd();
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  // Validate required arguments
  if (!options.org) {
    console.error('❌ Missing required argument: --org');
    printUsage();
    process.exit(1);
  }

  const pluginRoot = path.resolve(__dirname, '../..');
  const workspaceRoot = detectWorkspaceRoot();

  // Determine template path
  const templatePath = options.template || path.join(pluginRoot, 'templates', 'runbook-template.md');
  if (!fs.existsSync(templatePath)) {
    console.error(`❌ Template not found: ${templatePath}`);
    process.exit(1);
  }

  // Determine output path using standardized path conventions
  const { getInstancePathWithFallback } = require('./path-conventions');
  const defaultInstanceRoot = getInstancePathWithFallback('salesforce', options.org, {
    org: process.env.ORG_SLUG || process.env.CLIENT_ORG,
    pluginRoot: workspaceRoot
  });
  const outputPath = options.output || path.join(defaultInstanceRoot, 'RUNBOOK.md');

  try {
    console.log(`📊 Generating runbook for: ${options.org}`);
    console.log(`   Template: ${path.basename(templatePath)}`);
    console.log('');

    // Load observation data
    console.log('🔍 Loading observation data...');
    const observations = loadObservationData(workspaceRoot, options.org);
    console.log(`   Found ${observations.length} observations`);

    // Merge data
    console.log('🔄 Merging data...');
    const data = mergeData(options.org, observations, options.reflectionSections);

    // Render template
    console.log('📝 Rendering runbook...');
    const rendered = renderRunbook(templatePath, data);

    // Write output
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, rendered, 'utf-8');

    console.log('✅ Runbook generated successfully');
    console.log('');
    console.log(`📁 Saved to: ${outputPath}`);
    console.log('');
    console.log('📄 Summary:');
    console.log(`   Objects: ${data.total_objects}`);
    console.log(`   Workflows: ${data.active_workflows}`);
    console.log(`   Known Exceptions: ${data.known_exceptions.length}`);
    console.log(`   Recommendations: ${data.recommendations.length}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('   Stack:', err.stack);
    process.exit(1);
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

// Export for use as module
module.exports = {
  SimpleTemplateEngine,
  detectWorkspaceRoot,
  loadObservationData,
  aggregateObservations,
  mergeData,
  renderRunbook
};
