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
    let output = this.template;

    // Process conditionals {{#if variable}}...{{else}}...{{/if}}
    output = this.processConditionals(output, data);

    // Process loops {{#each array}}...{{/each}}
    output = this.processLoops(output, data);

    // Process simple variables {{variable}}
    output = this.processVariables(output, data);

    return output;
  }

  processConditionals(template, data) {
    const regex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;

    return template.replace(regex, (match, varName, trueBlock, falseBlock) => {
      const value = this.resolveValue(varName, data);
      const isTrue = value && (Array.isArray(value) ? value.length > 0 : true);

      if (isTrue) {
        return trueBlock;
      } else {
        return falseBlock || '';
      }
    });
  }

  processLoops(template, data) {
    const regex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;

    return template.replace(regex, (match, arrayName, loopBlock) => {
      const array = this.resolveValue(arrayName, data);

      if (!Array.isArray(array) || array.length === 0) {
        return '';
      }

      return array.map((item, index) => {
        let itemBlock = loopBlock;

        // Replace {{@index}} with actual index
        itemBlock = itemBlock.replace(/\{\{@index\}\}/g, (index + 1).toString());

        // Replace {{this}} with item value (for simple arrays)
        if (typeof item !== 'object') {
          itemBlock = itemBlock.replace(/\{\{this\}\}/g, item);
        } else {
          // Replace {{this.property}} with item.property
          itemBlock = itemBlock.replace(/\{\{this\.(\w+)\}\}/g, (m, prop) => {
            return item[prop] !== undefined ? item[prop] : '';
          });
        }

        return itemBlock;
      }).join('');
    });
  }

  processVariables(template, data) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = this.resolveValue(varName, data);
      return value !== undefined && value !== null ? value : '';
    });
  }

  resolveValue(varName, data) {
    return data[varName];
  }
}

/**
 * Load observation data using standardized path conventions
 */
function loadObservationData(pluginRoot, org) {
  const { getObservationsDir } = require('./path-conventions');
  const observationsDir = getObservationsDir('salesforce', org, pluginRoot);

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
    // Aggregate objects
    (obs.context.objects || []).forEach(obj => {
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
    (obs.context.workflows || []).forEach(workflow => {
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
    recommendations: reflectionSections?.recommendations || [],

    // Operational notes
    operational_notes: `This runbook is based on ${observations.length} observed operations and ${reflectionSections?.reflections_analyzed || 0} user reflections.`,

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
  console.log('  # Generate runbook for rentable-sandbox');
  console.log('  node runbook-renderer.js --org rentable-sandbox');
  console.log('');
  console.log('  # Generate with reflection sections');
  console.log('  node runbook-renderer.js --org peregrine-main \\');
  console.log('    --reflection-sections instances/peregrine-main/reflection-sections.json');
}

/**
 * Detect plugin root directory
 */
function detectPluginRoot() {
  return path.resolve(__dirname, '../..');
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

  const pluginRoot = detectPluginRoot();

  // Determine template path
  const templatePath = options.template || path.join(pluginRoot, 'templates', 'runbook-template.md');
  if (!fs.existsSync(templatePath)) {
    console.error(`❌ Template not found: ${templatePath}`);
    process.exit(1);
  }

  // Determine output path using standardized path conventions
  const { getInstancePath } = require('./path-conventions');
  const outputPath = options.output || path.join(getInstancePath('salesforce', options.org, null, pluginRoot), 'RUNBOOK.md');

  try {
    console.log(`📊 Generating runbook for: ${options.org}`);
    console.log(`   Template: ${path.basename(templatePath)}`);
    console.log('');

    // Load observation data
    console.log('🔍 Loading observation data...');
    const observations = loadObservationData(pluginRoot, options.org);
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
  loadObservationData,
  aggregateObservations,
  mergeData,
  renderRunbook
};
