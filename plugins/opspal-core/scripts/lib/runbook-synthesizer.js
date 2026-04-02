#!/usr/bin/env node

/**
 * Runbook Synthesizer (LLM Intelligence Layer)
 *
 * Purpose: Use LLM to synthesize observations and reflections into actionable runbook content
 * Usage: node scripts/lib/runbook-synthesizer.js --org <org-alias> [options]
 *
 * Features:
 * - Loads observations and reflection sections
 * - Generates LLM prompts for intelligent analysis
 * - Synthesizes platform descriptions, workflow summaries, and recommendations
 * - Rule-based synthesis for patterns and aggregations
 * - LLM-enhanced synthesis for complex narrative sections
 *
 * Synthesis Capabilities:
 * - Platform Overview: Intelligent summary of instance characteristics
 * - Workflow Analysis: Behavior patterns and exception detection
 * - Integration Insights: Connection analysis and issue identification
 * - Exception Documentation: Root cause analysis and recommendations
 * - Best Practices: Context-aware operational guidance
 *
 * Output Schema:
 * {
 *   platform_description: string,
 *   workflow_insights: [{name, analysis, exceptions}],
 *   integration_analysis: [{name, health, recommendations}],
 *   exception_summaries: [{name, context, prevention}],
 *   operational_recommendations: [string],
 *   best_practices: [string]
 * }
 *
 * Exit Codes:
 *   0 - Success
 *   1 - Error
 */

const fs = require('fs');
const path = require('path');
const { getObservationsDir } = require('./path-conventions');
const noopLog = { loadLog: () => [], summarizeLog: () => ({ totalEntries: 0, recent: [] }) };

let { loadLog: loadMetricLog, summarizeLog: summarizeMetricLog } = noopLog;
try { ({ loadLog: loadMetricLog, summarizeLog: summarizeMetricLog } = require('./metric-semantic-log')); } catch (e) { /* optional */ }

let { loadLog: loadDiagnosticsLog, summarizeLog: summarizeDiagnosticsLog } = noopLog;
try { ({ loadLog: loadDiagnosticsLog, summarizeLog: summarizeDiagnosticsLog } = require('./report-diagnostics-log')); } catch (e) { /* optional */ }

let { loadLog: loadPersonaLog, summarizeLog: summarizePersonaLog } = noopLog;
try { ({ loadLog: loadPersonaLog, summarizeLog: summarizePersonaLog } = require('./persona-kpi-log')); } catch (e) { /* optional */ }

/**
 * Detect the workspace root (where instances are stored)
 * This is different from pluginRoot - instances are in the user's workspace, not the plugin dir
 */
function detectWorkspaceRoot() {
  // Check for explicit workspace directory
  if (process.env.WORKSPACE_DIR) {
    return process.env.WORKSPACE_DIR;
  }

  // Use current working directory - this is where the user is running from
  // NOT the plugin installation directory
  return process.cwd();
}

/**
 * Normalize an observation to ensure it has required structure
 * @param {Object} obs - Raw observation object
 * @returns {Object} Normalized observation with guaranteed context structure
 */
function normalizeObservation(obs) {
  if (!obs) return null;

  // Ensure context exists
  if (!obs.context) {
    obs.context = {};
  }

  // Ensure objects array exists
  if (!obs.context.objects || !Array.isArray(obs.context.objects)) {
    obs.context.objects = [];
  }

  // Ensure workflows array exists
  if (!obs.context.workflows || !Array.isArray(obs.context.workflows)) {
    obs.context.workflows = [];
  }

  return obs;
}

/**
 * Load observations from disk
 * @param {string} workspaceRoot - Workspace directory (where instances are stored)
 * @param {string} org - Org alias
 */
function loadObservations(workspaceRoot, org) {
  const observationsDir = getObservationsDir('salesforce', org, workspaceRoot);

  if (!fs.existsSync(observationsDir)) {
    return [];
  }

  const files = fs.readdirSync(observationsDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => path.join(observationsDir, f));

  return files.map(file => {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      return normalizeObservation(raw);
    } catch (err) {
      console.warn(`⚠️  Failed to parse ${file}: ${err.message}`);
      return null;
    }
  }).filter(Boolean);
}

/**
 * Generate LLM prompt for platform overview synthesis
 */
function generatePlatformOverviewPrompt(org, observations, reflectionSections) {
  const observationSummary = observations.map(obs => {
    const objects = obs.context?.objects || [];
    const workflows = obs.context?.workflows || [];
    return `- ${obs.operation || 'unknown'} by ${obs.agent || 'unknown'}: ${objects.length} objects, ${workflows.length} workflows (${obs.outcome || 'unknown'})`;
  }).join('\n');

  const reflectionSummary = reflectionSections?.reflections_analyzed
    ? `${reflectionSections.reflections_analyzed} reflections with ${reflectionSections.patterns.common_errors.length} error patterns`
    : 'No reflections available';

  return `# Platform Overview Synthesis

**Context**: Salesforce instance "${org}"

**Observed Operations**:
${observationSummary || 'No operations observed yet'}

**Reflection Analysis**:
${reflectionSummary}

**Task**: Write a 2-3 paragraph platform overview that:
1. Describes the primary use case/purpose of this instance
2. Highlights key characteristics observed from operations
3. Notes any unique configurations or patterns
4. Mentions operational maturity based on automation observed

**Style**: Professional, concise, actionable. Focus on "what makes this instance unique."`;
}

/**
 * Generate LLM prompt for workflow synthesis
 */
function generateWorkflowSynthesisPrompt(workflows, observations) {
  if (workflows.length === 0) {
    return null;
  }

  const workflowContext = workflows.map(wf => {
    const relatedObs = observations.filter(obs => {
      const obsWorkflows = obs.context?.workflows || [];
      return obsWorkflows.includes(wf.name);
    });
    return `- ${wf.name}: ${relatedObs.length} operations observed`;
  }).join('\n');

  return `# Workflow Analysis Synthesis

**Workflows Detected**:
${workflowContext}

**Task**: For each workflow, provide:
1. **Purpose**: What this workflow likely does (infer from name and context)
2. **Trigger**: When it executes (if known or can be inferred)
3. **Observed Behavior**: Patterns from operations
4. **Exception Cases**: Any unusual behavior or manual overrides

**Output Format**: JSON array of workflow objects with {name, purpose, trigger, observed_behavior, exception_cases}`;
}

/**
 * Generate LLM prompt for exception analysis
 */
function generateExceptionAnalysisPrompt(knownExceptions, reflections) {
  if (!knownExceptions || knownExceptions.length === 0) {
    return null;
  }

  const exceptionContext = knownExceptions.map(exc =>
    `- ${exc.name}: ${exc.frequency} occurrence(s) - ${exc.context}`
  ).join('\n');

  return `# Exception Analysis Synthesis

**Known Exceptions**:
${exceptionContext}

**Task**: For each exception, provide:
1. **Root Cause**: Technical explanation (1-2 sentences)
2. **Prevention Strategy**: How to prevent recurrence
3. **Manual Override**: If manual intervention was used, document the process
4. **Automation Opportunity**: Can this be automated?

**Output Format**: JSON array with {name, root_cause, prevention_strategy, manual_override, automation_opportunity}`;
}

/**
 * Generate LLM prompt for recommendations synthesis
 */
function generateRecommendationsPrompt(observations, reflections, knownExceptions) {
  const errorPatterns = reflections?.patterns?.common_errors || [];
  const topErrors = errorPatterns.slice(0, 3).map(err =>
    `- ${err.taxonomy}: ${err.count} occurrences`
  ).join('\n');

  return `# Operational Recommendations Synthesis

**Context**:
- Total Operations: ${observations.length}
- Error Patterns: ${errorPatterns.length} types
${topErrors}
- Known Exceptions: ${knownExceptions?.length || 0}

**Task**: Generate 5-10 actionable recommendations prioritized by:
1. **Impact**: Prevents recurring issues or improves efficiency
2. **Effort**: Quick wins first, then strategic improvements
3. **Risk**: Addresses high-priority patterns

**Categories to consider**:
- Validation automation (prevent errors before deployment)
- Process improvements (reduce manual steps)
- Monitoring enhancements (detect issues earlier)
- Documentation updates (knowledge gaps)
- Technical debt (structural improvements)

**Output Format**: JSON array of strings, each starting with action verb (e.g., "Implement", "Add", "Automate")`;
}

/**
 * Rule-based synthesis for basic patterns
 */
function synthesizeBasicPatterns(observations, reflectionSections) {
  const synthesis = {
    total_operations: observations.length,
    operation_types: {},
    agents_used: new Set(),
    objects_touched: new Set(),
    workflows_modified: new Set(),
    success_rate: 0,
    timeframe: {
      first: null,
      last: null
    }
  };

  observations.forEach(obs => {
    // Count operation types
    const operation = obs.operation || 'unknown';
    synthesis.operation_types[operation] = (synthesis.operation_types[operation] || 0) + 1;

    // Track agents
    if (obs.agent && obs.agent !== 'unknown') {
      synthesis.agents_used.add(obs.agent);
    }

    // Track objects (with defensive null check)
    const objects = obs.context?.objects || [];
    objects.forEach(obj => synthesis.objects_touched.add(obj));

    // Track workflows (with defensive null check)
    const workflows = obs.context?.workflows || [];
    workflows.forEach(wf => synthesis.workflows_modified.add(wf));

    // Calculate success rate
    if (obs.outcome === 'success') {
      synthesis.success_rate++;
    }

    // Track timeframe
    const timestamp = new Date(obs.timestamp);
    if (!synthesis.timeframe.first || timestamp < synthesis.timeframe.first) {
      synthesis.timeframe.first = timestamp;
    }
    if (!synthesis.timeframe.last || timestamp > synthesis.timeframe.last) {
      synthesis.timeframe.last = timestamp;
    }
  });

  synthesis.success_rate = observations.length > 0
    ? Math.round((synthesis.success_rate / observations.length) * 100)
    : 0;

  // Convert sets to arrays
  synthesis.agents_used = Array.from(synthesis.agents_used);
  synthesis.objects_touched = Array.from(synthesis.objects_touched);
  synthesis.workflows_modified = Array.from(synthesis.workflows_modified);

  // Synthesize Flow Scanner usage patterns (v3.56.0)
  if (observations.some(obs => obs.context?.flow_scanner?.auto_fix_used)) {
    const autoFixObs = observations.filter(obs => obs.context?.flow_scanner?.auto_fix_used);
    const patterns = {};

    autoFixObs.forEach(obs => {
      (obs.context.flow_scanner.auto_fix_patterns || []).forEach(pattern => {
        patterns[pattern] = (patterns[pattern] || 0) + 1;
      });
    });

    const sortedPatterns = Object.entries(patterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    synthesis.flowScanner = {
      adoptionRate: ((autoFixObs.length / observations.length) * 100).toFixed(1) + '%',
      totalAutoFixes: autoFixObs.length,
      mostCommonPatterns: sortedPatterns.map(([pattern, count]) => ({
        pattern,
        count,
        percentage: ((count / autoFixObs.length) * 100).toFixed(1) + '%'
      })),
      sarifUsage: observations.filter(obs => obs.context?.flow_scanner?.sarif_output).length,
      configFileUsage: observations.filter(obs => obs.context?.flow_scanner?.config_file_used).length
    };
  }

  return synthesis;
}

function synthesizeMetricSemantics(org, workspaceRoot) {
  try {
    const log = loadMetricLog(org, { workspaceRoot });
    const summary = summarizeMetricLog(log, { recentCount: 8 });
    const entries = summary.recent.map(entry => ({
      timestamp: entry.timestamp,
      type: entry.type,
      metricId: entry.metricId,
      reportName: entry.reportName || '',
      warningSummary: (entry.warnings || []).slice(0, 2).join('; ')
    }));

    return {
      summary,
      entries,
      process_notes: [
        'Field conventions are inferred at report creation time with standard fields prioritized.',
        'Ambiguous mappings require explicit confirmation and are persisted per org.',
        'Semantic and failure-mode warnings are logged for governance review.'
      ].join(' ')
    };
  } catch (err) {
    return {
      summary: {
        totalEntries: 0,
        lastUpdated: null,
        mappingDecisions: 0,
        semanticWarnings: 0,
        failureModeWarnings: 0,
        recent: []
      },
      entries: [],
      process_notes: 'Metric semantics logging is enabled but no entries were captured yet.'
    };
  }
}

function synthesizeReportDiagnostics(org, workspaceRoot) {
  try {
    const log = loadDiagnosticsLog(org, { workspaceRoot });
    const summary = summarizeDiagnosticsLog(log, { recentCount: 8 });
    const entries = summary.recent.map(entry => ({
      timestamp: entry.timestamp,
      reportName: entry.reportName || '',
      overallStatus: entry.overallStatus || 'unknown',
      primaryIntent: entry.primaryIntent || 'Unclear',
      issueSummary: (entry.issues || []).slice(0, 2).join('; ')
    }));

    return {
      summary,
      entries,
      process_notes: [
        'Report intent is inferred from groupings, filters, bucket fields, formulas, and charts.',
        'Health scoring evaluates clarity, correctness risk, performance risk, and reusability.',
        'Fail or warn statuses should trigger report design review before broad rollout.'
      ].join(' ')
    };
  } catch (err) {
    return {
      summary: {
        totalEntries: 0,
        lastUpdated: null,
        passCount: 0,
        warnCount: 0,
        failCount: 0,
        intentCounts: {},
        recent: []
      },
      entries: [],
      process_notes: 'Report diagnostics logging is enabled but no entries were captured yet.'
    };
  }
}

function synthesizePersonaKpi(org, workspaceRoot) {
  try {
    const log = loadPersonaLog(org, { workspaceRoot });
    const summary = summarizePersonaLog(log, { recentCount: 8 });
    const entries = summary.recent.map(entry => ({
      timestamp: entry.timestamp,
      dashboardName: entry.dashboardName || '',
      persona: entry.persona || 'Unspecified',
      status: entry.status || 'warn',
      issueSummary: (entry.issues || []).slice(0, 2).join('; ')
    }));

    return {
      summary,
      entries,
      process_notes: [
        'Persona is inferred from dashboard titles, folders, and template metadata when not explicitly provided.',
        'KPI contracts verify required and disallowed metrics by role and flag missing targets.',
        'Results are warn-only and meant to guide dashboard revisions before executive rollout.'
      ].join(' ')
    };
  } catch (err) {
    return {
      summary: {
        totalEntries: 0,
        lastUpdated: null,
        passCount: 0,
        warnCount: 0,
        personaCounts: {},
        issueCounts: {},
        recent: []
      },
      entries: [],
      process_notes: 'Persona KPI logging is enabled but no entries were captured yet.'
    };
  }
}

/**
 * Generate intelligent platform description
 */
function generatePlatformDescription(org, basicPatterns, reflectionSections) {
  const daysSinceFirst = basicPatterns.timeframe.first
    ? Math.round((Date.now() - basicPatterns.timeframe.first.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const operationTypes = Object.entries(basicPatterns.operation_types)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${count} ${type} operation${count > 1 ? 's' : ''}`)
    .join(', ');

  let description = `This Salesforce instance has been observed over ${daysSinceFirst} day${daysSinceFirst !== 1 ? 's' : ''}, `;
  description += `with ${basicPatterns.total_operations} recorded operation${basicPatterns.total_operations !== 1 ? 's' : ''} `;
  description += `(${operationTypes}). `;

  if (basicPatterns.success_rate > 0) {
    description += `Operations have a ${basicPatterns.success_rate}% success rate. `;
  }

  if (basicPatterns.objects_touched.length > 0) {
    description += `Primary objects include ${basicPatterns.objects_touched.slice(0, 3).join(', ')}`;
    if (basicPatterns.objects_touched.length > 3) {
      description += `, and ${basicPatterns.objects_touched.length - 3} more`;
    }
    description += '. ';
  }

  if (basicPatterns.agents_used.length > 0) {
    description += `Agents deployed: ${basicPatterns.agents_used.join(', ')}. `;
  }

  if (reflectionSections?.patterns?.common_errors?.length > 0) {
    const topError = reflectionSections.patterns.common_errors[0];
    description += `Most common issue: ${topError.taxonomy} (${topError.count} occurrence${topError.count > 1 ? 's' : ''}). `;
  }

  return description;
}

/**
 * Generate workflow insights
 */
function generateWorkflowInsights(observations) {
  const workflows = {};

  observations.forEach(obs => {
    // Defensive null check for context.workflows
    const obsWorkflows = obs.context?.workflows || [];
    obsWorkflows.forEach(wf => {
      if (!workflows[wf]) {
        workflows[wf] = {
          name: wf,
          observations: [],
          operations: new Set(),
          success_count: 0,
          total_count: 0
        };
      }

      workflows[wf].observations.push(obs);
      workflows[wf].operations.add(obs.operation || 'unknown');
      workflows[wf].total_count++;
      if (obs.outcome === 'success') {
        workflows[wf].success_count++;
      }
    });
  });

  return Object.values(workflows).map(wf => {
    const successRate = Math.round((wf.success_count / wf.total_count) * 100);
    const operations = Array.from(wf.operations).join(', ');

    return {
      name: wf.name,
      type: wf.operations.has('workflow-create') ? 'Custom' : 'Standard',
      trigger: 'TBD - Needs manual documentation',
      status: successRate === 100 ? 'Active' : 'Active (with issues)',
      observed_behavior: `Observed in ${wf.total_count} operation(s): ${operations}. Success rate: ${successRate}%.`,
      exception_cases: successRate < 100
        ? [`Some operations failed - review logs for details`]
        : []
    };
  });
}

/**
 * Generate exception summaries
 */
function generateExceptionSummaries(knownExceptions, observations) {
  if (!knownExceptions || knownExceptions.length === 0) {
    return [];
  }

  return knownExceptions.map(exc => {
    // Find first occurrence
    const firstObservation = observations.find(obs =>
      obs.notes && obs.notes.includes(exc.name)
    );

    return {
      name: exc.name,
      first_observed: firstObservation?.timestamp || 'Unknown',
      frequency: exc.frequency,
      context: exc.context,
      manual_override: exc.recommendation.includes('manual') ? 'Yes - document specific steps' : null,
      recommendation: exc.recommendation
    };
  });
}

/**
 * Generate operational recommendations
 */
function generateOperationalRecommendations(basicPatterns, reflectionSections) {
  const recommendations = [];

  // Success rate recommendations
  if (basicPatterns.success_rate < 100 && basicPatterns.success_rate > 0) {
    recommendations.push(
      `Improve operation success rate from ${basicPatterns.success_rate}% to >95% by adding pre-flight validation`
    );
  }

  // Error pattern recommendations
  if (reflectionSections?.patterns?.common_errors) {
    reflectionSections.patterns.common_errors.slice(0, 2).forEach(err => {
      recommendations.push(
        `Address recurring ${err.taxonomy} errors (${err.count} occurrences) - implement validation guards`
      );
    });
  }

  // Manual workaround recommendations
  if (reflectionSections?.patterns?.manual_workarounds?.length > 0) {
    recommendations.push(
      `Automate ${reflectionSections.patterns.manual_workarounds.length} manual workaround(s) identified in reflections`
    );
  }

  // User intervention recommendations
  if (reflectionSections?.patterns?.user_interventions?.length > 0) {
    const suggestions = reflectionSections.patterns.user_interventions
      .filter(i => i.classification === 'suggestion');
    if (suggestions.length > 0) {
      recommendations.push(
        `Implement ${suggestions.length} user-suggested improvement(s) from feedback`
      );
    }
  }

  // General recommendations based on patterns
  if (basicPatterns.total_operations < 10) {
    recommendations.push(
      'Increase observation coverage by triggering runbook capture after more operations'
    );
  }

  if (basicPatterns.objects_touched.length > 10) {
    recommendations.push(
      'Consider data model documentation - multiple objects in use without detailed runbook entries'
    );
  }

  // Default recommendations if none generated
  if (recommendations.length === 0) {
    recommendations.push(
      'Continue capturing observations through agent operations',
      'Document workflows manually in runbook for reference',
      'Enable `/reflect` after sessions to improve pattern detection'
    );
  }

  return recommendations;
}

/**
 * Generate best practices
 */
function generateBestPractices(basicPatterns, reflectionSections) {
  const practices = [
    'Review this runbook before major deployments to avoid known exceptions',
    'Run `/reflect` after development sessions to capture patterns and improve runbook quality',
    'Update workflow documentation when making configuration changes',
    'Document manual interventions immediately for future automation opportunities'
  ];

  // Add context-specific practices
  if (reflectionSections?.known_exceptions?.length > 3) {
    practices.push(
      'High number of exceptions detected - schedule quarterly runbook review'
    );
  }

  if (basicPatterns.success_rate < 95) {
    practices.push(
      'Implement pre-deployment validation checklist to improve success rate'
    );
  }

  return practices;
}

/**
 * Main synthesis function
 */
function synthesizeRunbookContent(org, observations, reflectionSections, options = {}) {
  console.log('🧠 Starting LLM synthesis...');
  console.log('');

  // Step 1: Rule-based pattern analysis
  console.log('📊 Analyzing patterns...');
  const basicPatterns = synthesizeBasicPatterns(observations, reflectionSections);
  console.log(`   Operations: ${basicPatterns.total_operations}`);
  console.log(`   Success Rate: ${basicPatterns.success_rate}%`);
  console.log(`   Objects: ${basicPatterns.objects_touched.length}`);
  console.log(`   Agents: ${basicPatterns.agents_used.length}`);
  console.log('');

  // Step 2: Generate platform description
  console.log('📝 Synthesizing platform overview...');
  const platformDescription = generatePlatformDescription(org, basicPatterns, reflectionSections);
  console.log(`   Generated ${platformDescription.length} character description`);
  console.log('');

  // Step 3: Generate workflow insights
  console.log('🔄 Analyzing workflows...');
  const workflowInsights = generateWorkflowInsights(observations);
  console.log(`   Found ${workflowInsights.length} workflow(s)`);
  console.log('');

  // Step 3.5: Generate Flow pattern insights (NEW v3.42.0)
  console.log('⚡ Analyzing Flow development patterns...');
  const flowPatterns = synthesizeFlowPatterns(observations);
  if (flowPatterns) {
    console.log(`   Flow operations: ${flowPatterns.total_flow_operations}`);
    console.log(`   Flows worked on: ${flowPatterns.flows_worked_on.length}`);
    console.log(`   Templates used: ${flowPatterns.templates_used.length}`);
    console.log(`   Success rate: ${flowPatterns.success_rate}%`);
  } else {
    console.log('   No Flow operations observed');
  }
  console.log('');

  // Step 4: Generate exception summaries
  console.log('⚠️  Processing exceptions...');
  const knownExceptions = reflectionSections?.known_exceptions || [];
  const exceptionSummaries = generateExceptionSummaries(knownExceptions, observations);
  console.log(`   Documented ${exceptionSummaries.length} exception(s)`);
  console.log('');

  // Step 5: Generate recommendations
  console.log('💡 Generating recommendations...');
  const recommendations = generateOperationalRecommendations(basicPatterns, reflectionSections);
  console.log(`   Created ${recommendations.length} recommendation(s)`);
  console.log('');

  // Step 6: Generate best practices
  console.log('✅ Creating best practices...');
  const bestPractices = generateBestPractices(basicPatterns, reflectionSections);
  console.log(`   Generated ${bestPractices.length} practice(s)`);
  console.log('');

  console.log('📊 Capturing metric semantics decisions...');
  const metricSemantics = synthesizeMetricSemantics(org, options.workspaceRoot);
  console.log(`   Metric entries: ${metricSemantics.entries.length}`);
  console.log('');

  console.log('📈 Capturing report diagnostics...');
  const reportDiagnostics = synthesizeReportDiagnostics(org, options.workspaceRoot);
  console.log(`   Report diagnostics entries: ${reportDiagnostics.entries.length}`);
  console.log('');

  console.log('🧭 Capturing persona KPI diagnostics...');
  const personaKpi = synthesizePersonaKpi(org, options.workspaceRoot);
  console.log(`   Persona KPI entries: ${personaKpi.entries.length}`);
  console.log('');

  // Compile synthesis output
  const synthesis = {
    org,
    generated_at: new Date().toISOString(),
    basic_patterns: basicPatterns,
    platform_description: platformDescription,
    workflow_insights: workflowInsights,
    flow_patterns: flowPatterns, // NEW v3.42.0
    exception_summaries: exceptionSummaries,
    operational_recommendations: recommendations,
    best_practices: bestPractices,
    metric_semantics: metricSemantics,
    report_diagnostics: reportDiagnostics,
    persona_kpi: personaKpi,
    llm_prompts: options.generatePrompts ? {
      platform_overview: generatePlatformOverviewPrompt(org, observations, reflectionSections),
      workflow_analysis: generateWorkflowSynthesisPrompt(workflowInsights, observations),
      flow_pattern_analysis: generateFlowPatternAnalysisPrompt(flowPatterns), // NEW v3.42.0
      exception_analysis: generateExceptionAnalysisPrompt(knownExceptions, reflectionSections),
      recommendations: generateRecommendationsPrompt(observations, reflectionSections, knownExceptions)
    } : null
  };

  return synthesis;
}

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    org: null,
    output: null,
    reflectionSections: null,
    generatePrompts: false,
    supplementalDir: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--org':
        options.org = next;
        i++;
        break;
      case '--output':
        options.output = next;
        i++;
        break;
      case '--reflection-sections':
        try {
          options.reflectionSections = JSON.parse(fs.readFileSync(next, 'utf-8'));
        } catch (err) {
          console.error(`❌ Failed to load reflection sections: ${err.message}`);
          process.exit(1);
        }
        i++;
        break;
      case '--generate-prompts':
        options.generatePrompts = true;
        break;
      case '--supplemental':
      case '--supplemental-dir':
        options.supplementalDir = next;
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
 * Synthesize Flow-specific patterns (NEW v3.42.0)
 *
 * Analyzes Flow XML operations to extract:
 * - Flow creation/modification patterns
 * - Template usage statistics
 * - Common Flow types and triggers
 * - Validation issues and best practice violations
 * - Deployment patterns and success rates
 *
 * @param {Array} observations - All observations (filtered to flow-operation type)
 * @returns {Object} Flow-specific synthesis data
 */
function synthesizeFlowPatterns(observations) {
  // Filter to Flow operations only
  const flowObs = observations.filter(obs => obs.operation === 'flow-operation');

  if (flowObs.length === 0) {
    return null; // No Flow operations observed
  }

  const synthesis = {
    total_flow_operations: flowObs.length,
    flow_operation_types: {}, // create, modify, validate, deploy, batch
    flows_worked_on: new Set(),
    templates_used: new Set(),
    template_usage_count: 0,
    common_flow_types: {},
    success_rate: 0,
    validation_issues: [],
    deployment_patterns: {
      direct_activation: 0,
      staged_activation: 0,
      batch_deployments: 0
    },
    timeframe: {
      first: null,
      last: null
    }
  };

  flowObs.forEach(obs => {
    // Count Flow operation types
    const flowOpType = obs.context.flow_operation || 'unknown';
    synthesis.flow_operation_types[flowOpType] = (synthesis.flow_operation_types[flowOpType] || 0) + 1;

    // Track Flows worked on
    if (obs.context.flows && obs.context.flows.length > 0) {
      obs.context.flows.forEach(flow => synthesis.flows_worked_on.add(flow));
    }

    // Track template usage
    if (obs.context.templates_used && obs.context.templates_used.length > 0) {
      obs.context.templates_used.forEach(template => {
        synthesis.templates_used.add(template);
        synthesis.template_usage_count++;
      });
    }

    // Calculate success rate
    if (obs.outcome === 'success') {
      synthesis.success_rate++;
    }

    // Extract validation issues from notes
    if (obs.notes && obs.notes.includes('validation')) {
      synthesis.validation_issues.push({
        flow: obs.context.flows?.[0] || 'unknown',
        issue: obs.notes,
        timestamp: obs.timestamp
      });
    }

    // Detect deployment patterns from notes/operation type
    if (flowOpType === 'deploy') {
      if (obs.notes && obs.notes.includes('activate')) {
        synthesis.deployment_patterns.direct_activation++;
      } else if (obs.notes && obs.notes.includes('staged')) {
        synthesis.deployment_patterns.staged_activation++;
      }
    } else if (flowOpType === 'batch') {
      synthesis.deployment_patterns.batch_deployments++;
    }

    // Track timeframe
    const timestamp = new Date(obs.timestamp);
    if (!synthesis.timeframe.first || timestamp < synthesis.timeframe.first) {
      synthesis.timeframe.first = timestamp;
    }
    if (!synthesis.timeframe.last || timestamp > synthesis.timeframe.last) {
      synthesis.timeframe.last = timestamp;
    }
  });

  // Calculate success rate
  synthesis.success_rate = flowObs.length > 0
    ? Math.round((synthesis.success_rate / flowObs.length) * 100)
    : 0;

  // Convert sets to arrays
  synthesis.flows_worked_on = Array.from(synthesis.flows_worked_on);
  synthesis.templates_used = Array.from(synthesis.templates_used);

  return synthesis;
}

/**
 * Generate LLM prompt for Flow pattern analysis (NEW v3.42.0)
 *
 * Creates prompt for intelligent Flow development pattern analysis
 *
 * @param {Object} flowSynthesis - Flow-specific synthesis data
 * @returns {string} LLM prompt for Flow pattern analysis
 */
function generateFlowPatternAnalysisPrompt(flowSynthesis) {
  if (!flowSynthesis) {
    return null;
  }

  const operationBreakdown = Object.entries(flowSynthesis.flow_operation_types)
    .map(([type, count]) => `- ${type}: ${count} operations`)
    .join('\n');

  const templateUsageInfo = flowSynthesis.templates_used.length > 0
    ? `Templates used: ${flowSynthesis.templates_used.join(', ')} (${flowSynthesis.template_usage_count} total applications)`
    : 'No templates used (custom XML development)';

  return `# Flow Development Pattern Analysis

**Context**: Flow XML development patterns observed

**Flow Operations Performed**:
${operationBreakdown}

**Flows Worked On**: ${flowSynthesis.flows_worked_on.length} unique Flows
- ${flowSynthesis.flows_worked_on.join(', ') || 'None'}

**Template Usage**:
${templateUsageInfo}

**Success Rate**: ${flowSynthesis.success_rate}%

**Deployment Patterns**:
- Direct activation: ${flowSynthesis.deployment_patterns.direct_activation}
- Staged activation: ${flowSynthesis.deployment_patterns.staged_activation}
- Batch deployments: ${flowSynthesis.deployment_patterns.batch_deployments}

**Validation Issues**: ${flowSynthesis.validation_issues.length}

**Task**: Analyze Flow development patterns and provide:
1. **Development Approach**: How are Flows being developed? (template-driven, NLP, direct XML)
2. **Maturity Assessment**: Based on patterns, is this novice, intermediate, or advanced Flow development?
3. **Best Practice Adherence**: Are best practices being followed? (validation, staged deployment, etc.)
4. **Recommendations**: 3-5 specific recommendations to improve Flow development workflow
5. **Template Adoption**: Should more templates be used? Which ones?

**Style**: Actionable, specific to observed patterns. Reference Flow XML Development Runbooks where helpful.

**Output Format**: JSON object with {development_approach, maturity_level, best_practice_score, recommendations[], template_recommendations[]}`;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log('Usage: runbook-synthesizer.js --org <org-alias> [options]');
  console.log('');
  console.log('Required Arguments:');
  console.log('  --org <alias>                Salesforce org alias');
  console.log('');
  console.log('Optional Arguments:');
  console.log('  --output <file>              Save synthesis output to JSON file');
  console.log('  --reflection-sections <file> Load reflection sections from JSON');
  console.log('  --generate-prompts           Include LLM prompts in output for manual review');
  console.log('  --supplemental <dir>         Load supplemental data files (assessment findings, audit details)');
  console.log('');
  console.log('Examples:');
  console.log('  # Synthesize runbook content for delta-sandbox');
  console.log('  node runbook-synthesizer.js --org delta-sandbox');
  console.log('');
  console.log('  # With reflection data and save output');
  console.log('  node runbook-synthesizer.js --org acme-production \\');
  console.log('    --reflection-sections instances/acme-production/reflection-sections.json \\');
  console.log('    --output instances/acme-production/synthesis.json');
}

/**
 * Detect plugin root (where the plugin code lives)
 */
function detectPluginRoot() {
  return path.resolve(__dirname, '../..');
}

/**
 * Main execution
 */
async function main() {
  // Debug logging to identify unknown callers (if DEBUG_RUNBOOK_SYNTHESIZER is set)
  if (process.env.DEBUG_RUNBOOK_SYNTHESIZER) {
    console.error('[DEBUG] runbook-synthesizer called with:');
    console.error('[DEBUG]   argv:', process.argv);
    console.error('[DEBUG]   cwd:', process.cwd());
    console.error('[DEBUG]   CLAUDE_PLUGIN_ROOT:', process.env.CLAUDE_PLUGIN_ROOT);
    console.error('[DEBUG]   WORKSPACE_DIR:', process.env.WORKSPACE_DIR);
  }

  const options = parseArgs();

  if (!options.org) {
    console.error('❌ Missing required argument: --org');
    printUsage();
    process.exit(1);
  }

  // IMPORTANT: Use workspace root for instances, not plugin root
  // Instances are stored in the user's workspace directory, not the plugin installation
  const workspaceRoot = detectWorkspaceRoot();

  if (process.env.DEBUG_RUNBOOK_SYNTHESIZER) {
    console.error('[DEBUG]   workspaceRoot:', workspaceRoot);
  }

  try {
    // Load observations from workspace
    const observations = loadObservations(workspaceRoot, options.org);

    if (observations.length === 0) {
      console.log('⚠️  No observations found for this org');
      console.log('   Operations must be performed and captured before synthesis');
      process.exit(0);
    }

    // Load supplemental data (detailed assessment findings, audit data, etc.)
    let supplementalData = [];
    const supplementalDir = options.supplementalDir ||
      path.join(workspaceRoot, 'instances', 'salesforce', options.org, 'supplemental');
    if (fs.existsSync(supplementalDir)) {
      try {
        const files = fs.readdirSync(supplementalDir)
          .filter(f => f.endsWith('.json'))
          .sort();
        for (const file of files) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(supplementalDir, file), 'utf8'));
            supplementalData.push({ source: file, ...data });
          } catch (e) {
            console.error(`Warning: Could not parse supplemental file ${file}: ${e.message}`);
          }
        }
        if (supplementalData.length > 0) {
          console.log(`📎 Loaded ${supplementalData.length} supplemental data file(s) from ${supplementalDir}`);
        }
      } catch (e) {
        console.error(`Warning: Could not read supplemental directory: ${e.message}`);
      }
    }

    // Synthesize content
    const synthesis = synthesizeRunbookContent(
      options.org,
      observations,
      options.reflectionSections,
      { generatePrompts: options.generatePrompts, workspaceRoot }
    );

    // Merge supplemental findings into synthesis output
    if (supplementalData.length > 0) {
      synthesis.supplemental_findings = supplementalData;
    }

    console.log('✅ Synthesis complete');
    console.log('');

    // Output results
    if (options.output) {
      const outputDir = path.dirname(options.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(options.output, JSON.stringify(synthesis, null, 2), 'utf-8');
      console.log(`📁 Saved to: ${options.output}`);
    } else {
      console.log('📄 Synthesis Output:');
      console.log(JSON.stringify(synthesis, null, 2));
    }

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
  synthesizeRunbookContent,
  synthesizeBasicPatterns,
  generatePlatformDescription,
  generateWorkflowInsights,
  generateExceptionSummaries,
  generateOperationalRecommendations,
  generateBestPractices,
  // Flow-specific exports (NEW v3.42.0)
  synthesizeFlowPatterns,
  generateFlowPatternAnalysisPrompt,
  // Utility exports (v3.65.0)
  detectWorkspaceRoot,
  normalizeObservation,
  loadObservations
};
