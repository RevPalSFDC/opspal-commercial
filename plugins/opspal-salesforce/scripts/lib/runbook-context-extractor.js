#!/usr/bin/env node

/**
 * Runbook Context Extractor
 *
 * Purpose: Extract relevant context from runbooks for agent consumption
 * Usage: node scripts/lib/runbook-context-extractor.js --org <org-alias> [options]
 *
 * Features:
 * - Fast extraction of specific runbook sections
 * - Condensed summaries for agent context
 * - Filters by operation type or object
 * - Graceful handling when runbook doesn't exist
 *
 * Output:
 * - JSON object with relevant context
 * - Ready for agent prompt injection
 *
 * Exit Codes:
 *   0 - Success (runbook found)
 *   0 - Success (no runbook, returns empty context)
 *   1 - Error (invalid arguments)
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract sections from markdown runbook
 */
function extractSections(content) {
  const sections = {};
  const lines = content.split('\n');
  let currentSection = null;
  let currentContent = [];

  lines.forEach(line => {
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = headerMatch[1].trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  });

  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return sections;
}

/**
 * Extract metadata from runbook header
 */
function extractMetadata(content) {
  const metadata = {};

  const versionMatch = content.match(/\*\*Version\*\*:\s*(.+)/);
  const lastUpdatedMatch = content.match(/\*\*Last Updated\*\*:\s*(.+)/);
  const operationsMatch = content.match(/\*\*Generated From\*\*:\s*(\d+)\s+observations/);

  if (versionMatch) metadata.version = versionMatch[1].trim();
  if (lastUpdatedMatch) metadata.lastUpdated = lastUpdatedMatch[1].trim();
  if (operationsMatch) metadata.observationCount = parseInt(operationsMatch[1], 10);

  return metadata;
}

/**
 * Extract known exceptions
 */
function extractKnownExceptions(sectionsContent) {
  const exceptions = [];
  const exceptionSection = sectionsContent['Known Exceptions'] || sectionsContent['Common Error Patterns'] || '';

  if (!exceptionSection) return exceptions;

  // Match exception blocks (### heading followed by content)
  const exceptionBlocks = exceptionSection.split(/###\s+/).slice(1);

  exceptionBlocks.forEach(block => {
    const lines = block.trim().split('\n');
    const title = lines[0].trim();
    const content = lines.slice(1).join('\n').trim();

    // Parse exception details
    const frequencyMatch = content.match(/Frequency:\s*(.+)/i);
    const contextMatch = content.match(/Context:\s*(.+)/i);
    const recommendationMatch = content.match(/Recommendation:\s*(.+)/i);

    exceptions.push({
      name: title,
      frequency: frequencyMatch ? frequencyMatch[1].trim() : null,
      context: contextMatch ? contextMatch[1].trim() : null,
      recommendation: recommendationMatch ? recommendationMatch[1].trim() : null,
      isRecurring: title.toLowerCase().includes('recurring')
    });
  });

  return exceptions;
}

/**
 * Extract field policies from runbook
 *
 * Looks for field-related sections and extracts:
 * - Required fields for operations
 * - Sensitive/excluded fields
 * - Field selection guidance per task type
 *
 * Part of the Runbook Policy Infrastructure (Phase 3).
 *
 * @param {Object} sectionsContent - Parsed sections from runbook
 * @returns {Object} Field policy information
 */
function extractFieldPolicies(sectionsContent) {
  const policies = {
    fieldGuidance: [],
    requiredFields: {},
    excludedFields: {},
    taskVariantHints: {}
  };

  // Look for Field Policies section
  const fieldPolicySection = sectionsContent['Field Policies'] ||
                             sectionsContent['Field Selection'] ||
                             sectionsContent['Data Fields'] || '';

  if (fieldPolicySection) {
    // Extract required fields per object
    const requiredMatches = fieldPolicySection.matchAll(/\*\*Required for (\w+)\*\*:\s*([^\n]+)/gi);
    for (const match of requiredMatches) {
      const objectName = match[1].trim();
      const fields = match[2].split(',').map(f => f.trim()).filter(Boolean);
      policies.requiredFields[objectName] = fields;
    }

    // Extract excluded/sensitive fields
    const excludedMatches = fieldPolicySection.matchAll(/\*\*(?:Exclude|Sensitive|Never Export)\*\*:\s*([^\n]+)/gi);
    for (const match of excludedMatches) {
      const fields = match[1].split(',').map(f => f.trim()).filter(Boolean);
      policies.excludedFields['_global'] = [
        ...(policies.excludedFields['_global'] || []),
        ...fields
      ];
    }

    // Extract object-specific exclusions
    const objectExcludeMatches = fieldPolicySection.matchAll(/\*\*Exclude from (\w+)\*\*:\s*([^\n]+)/gi);
    for (const match of objectExcludeMatches) {
      const objectName = match[1].trim();
      const fields = match[2].split(',').map(f => f.trim()).filter(Boolean);
      policies.excludedFields[objectName] = [
        ...(policies.excludedFields[objectName] || []),
        ...fields
      ];
    }

    // Extract task variant hints
    const variantMatches = fieldPolicySection.matchAll(/\*\*For (\w+) operations?\*\*:\s*([^\n]+)/gi);
    for (const match of variantMatches) {
      const taskType = match[1].toLowerCase().trim();
      policies.taskVariantHints[taskType] = match[2].trim();
    }

    // Extract bullet points as general guidance
    const bullets = fieldPolicySection.match(/^[\s]*[-*]\s+(.+)$/gm) || [];
    policies.fieldGuidance = bullets
      .map(b => b.replace(/^[\s]*[-*]\s+/, '').trim())
      .filter(Boolean);
  }

  // Also check Data Classification section for sensitive fields
  const dataClassSection = sectionsContent['Data Classification'] ||
                           sectionsContent['PII Fields'] ||
                           sectionsContent['Compliance'] || '';

  if (dataClassSection) {
    // Extract PII/sensitive fields
    const piiMatches = dataClassSection.matchAll(/\*\*(?:PII|Sensitive|GDPR|HIPAA)\*\*:\s*([^\n]+)/gi);
    for (const match of piiMatches) {
      const fields = match[1].split(',').map(f => f.trim()).filter(Boolean);
      policies.excludedFields['_pii'] = [
        ...(policies.excludedFields['_pii'] || []),
        ...fields
      ];
    }
  }

  // Check Operations section for field hints
  const operationsSection = sectionsContent['Operations'] ||
                            sectionsContent['Common Operations'] || '';

  if (operationsSection) {
    // Extract operation-specific field requirements
    const opFieldMatches = operationsSection.matchAll(/###\s*(\w+)\s*(?:Operation|Task)?\s*\n[\s\S]*?Fields?:\s*([^\n]+)/gi);
    for (const match of opFieldMatches) {
      const opType = match[1].toLowerCase().trim();
      const fields = match[2].split(',').map(f => f.trim()).filter(Boolean);
      if (fields.length > 0) {
        policies.taskVariantHints[opType] = `Recommended fields: ${fields.join(', ')}`;
      }
    }
  }

  return policies;
}

/**
 * Extract key workflows
 */
function extractWorkflows(sectionsContent) {
  const workflows = [];
  const workflowSection = sectionsContent['Key Workflows'] || '';

  if (!workflowSection) return workflows;

  const workflowBlocks = workflowSection.split(/###\s+/).slice(1);

  workflowBlocks.forEach(block => {
    const lines = block.trim().split('\n');
    const title = lines[0].trim();
    const content = lines.slice(1).join('\n').trim();

    const typeMatch = content.match(/Type:\s*(.+)/i);
    const statusMatch = content.match(/Status:\s*(.+)/i);
    const triggerMatch = content.match(/Trigger:\s*(.+)/i);

    workflows.push({
      name: title,
      type: typeMatch ? typeMatch[1].trim() : null,
      status: statusMatch ? statusMatch[1].trim() : null,
      trigger: triggerMatch ? triggerMatch[1].trim() : null
    });
  });

  return workflows;
}

/**
 * Extract operational recommendations
 */
function extractRecommendations(sectionsContent) {
  const recommendations = [];
  const recSection = sectionsContent['Operational Recommendations'] || sectionsContent['Recommendations'] || '';

  if (!recSection) return recommendations;

  // Extract bullet points and numbered items
  const items = recSection.match(/^[\s]*[-*]\s+(.+)$/gm) ||
                recSection.match(/^\d+\.\s+(.+)$/gm) || [];

  items.forEach(item => {
    const cleaned = item.replace(/^[\s]*[-*\d.]+\s+/, '').trim();
    if (cleaned) {
      recommendations.push(cleaned);
    }
  });

  return recommendations;
}

/**
 * Filter context by operation type
 */
function filterByOperationType(context, operationType) {
  if (!operationType) return context;

  const filtered = { ...context };

  // Filter exceptions relevant to operation
  if (operationType === 'deployment' || operationType === 'metadata-deploy') {
    filtered.knownExceptions = context.knownExceptions.filter(ex =>
      ex.name.toLowerCase().includes('schema') ||
      ex.name.toLowerCase().includes('deploy') ||
      ex.name.toLowerCase().includes('metadata')
    );
  } else if (operationType === 'data-operation' || operationType === 'bulk') {
    filtered.knownExceptions = context.knownExceptions.filter(ex =>
      ex.name.toLowerCase().includes('data') ||
      ex.name.toLowerCase().includes('record') ||
      ex.name.toLowerCase().includes('bulk')
    );
  }

  return filtered;
}

/**
 * Filter context by objects
 */
function filterByObjects(context, objects) {
  if (!objects || objects.length === 0) return context;

  const filtered = { ...context };
  const objectNames = objects.map(o => o.toLowerCase());

  // Filter workflows touching these objects
  filtered.workflows = context.workflows.filter(wf =>
    objectNames.some(obj => wf.name.toLowerCase().includes(obj))
  );

  // Filter exceptions related to these objects
  filtered.knownExceptions = context.knownExceptions.filter(ex =>
    objectNames.some(obj =>
      ex.name.toLowerCase().includes(obj) ||
      (ex.context && ex.context.toLowerCase().includes(obj))
    )
  );

  return filtered;
}

/**
 * Create condensed summary for agent prompts
 */
function createCondensedSummary(context) {
  const summary = {
    hasRunbook: context.metadata.observationCount > 0,
    observationCount: context.metadata.observationCount,
    lastUpdated: context.metadata.lastUpdated,

    criticalExceptions: context.knownExceptions
      .filter(ex => ex.isRecurring)
      .map(ex => `${ex.name}: ${ex.recommendation || 'See runbook'}`)
      .slice(0, 3),

    activeWorkflows: context.workflows
      .filter(wf => wf.status === 'Active')
      .map(wf => wf.name)
      .slice(0, 5),

    topRecommendations: context.recommendations.slice(0, 3)
  };

  return summary;
}

/**
 * Load and extract runbook context
 */
function extractRunbookContext(org, options = {}) {
  const pluginRoot = path.resolve(__dirname, '../..');
  const runbookPath = path.join(pluginRoot, 'instances', org, 'RUNBOOK.md');

  // Check if runbook exists
  if (!fs.existsSync(runbookPath)) {
    return {
      exists: false,
      metadata: {},
      knownExceptions: [],
      workflows: [],
      recommendations: [],
      platformOverview: null,
      condensedSummary: {
        hasRunbook: false,
        message: 'No runbook available for this org. Operations will proceed without historical context.'
      }
    };
  }

  const content = fs.readFileSync(runbookPath, 'utf-8');
  const sections = extractSections(content);
  const metadata = extractMetadata(content);

  let context = {
    exists: true,
    metadata,
    knownExceptions: extractKnownExceptions(sections),
    workflows: extractWorkflows(sections),
    recommendations: extractRecommendations(sections),
    platformOverview: sections['Platform Overview'] || null,
    fieldPolicies: extractFieldPolicies(sections)
  };

  // Extract Flow Scanner patterns (v3.56.0)
  const flowScannerSection = sections['Flow Scanner'] || sections['Flow Scanner Usage'] || '';
  if (flowScannerSection) {
    const adoptionMatch = flowScannerSection.match(/Adoption Rate:\s*(.+?)%/);
    const totalFixesMatch = flowScannerSection.match(/Total Auto-Fixes:\s*(\d+)/);
    const sarifMatch = flowScannerSection.match(/SARIF Usage:\s*(\d+)/);
    const configMatch = flowScannerSection.match(/Configuration File Usage:\s*(\d+)/);

    // Extract pattern list (format: "- PatternName (used X times)")
    const patternMatches = flowScannerSection.matchAll(/[-*]\s*(.+?)\s*\(used\s+(\d+)\s+times?\)/gi);
    const patterns = Array.from(patternMatches, match => `${match[1].trim()} (used ${match[2]} times)`).slice(0, 3);

    context.flowScanner = {
      adoptionRate: adoptionMatch ? adoptionMatch[1] + '%' : 'Unknown',
      totalAutoFixes: totalFixesMatch ? parseInt(totalFixesMatch[1], 10) : 0,
      recommendedPatterns: patterns,
      sarifUsage: sarifMatch && parseInt(sarifMatch[1], 10) > 0 ? 'Used in CI/CD' : 'Not used yet',
      configFileUsage: configMatch && parseInt(configMatch[1], 10) > 0 ? 'Has custom rules' : 'Using defaults'
    };
  }

  // Apply filters
  if (options.operationType) {
    context = filterByOperationType(context, options.operationType);
  }

  if (options.objects) {
    context = filterByObjects(context, options.objects);
  }

  // Add condensed summary
  context.condensedSummary = createCondensedSummary(context);

  return context;
}

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    org: null,
    operationType: null,
    objects: [],
    format: 'full', // full, summary
    output: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--org':
        options.org = next;
        i++;
        break;
      case '--operation-type':
      case '--type':
        options.operationType = next;
        i++;
        break;
      case '--objects':
        options.objects = next.split(',').map(o => o.trim());
        i++;
        break;
      case '--format':
        options.format = next;
        i++;
        break;
      case '--output':
        options.output = next;
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
  console.log('Usage: runbook-context-extractor.js --org <org-alias> [options]');
  console.log('');
  console.log('Required Arguments:');
  console.log('  --org <alias>            Salesforce org alias');
  console.log('');
  console.log('Optional Arguments:');
  console.log('  --operation-type <type>  Filter by operation type');
  console.log('                           (deployment, data-operation, workflow, etc.)');
  console.log('  --objects <list>         Comma-separated object names to filter');
  console.log('  --format <type>          Output format: full (default), summary');
  console.log('  --output <file>          Write to file instead of stdout');
  console.log('');
  console.log('Examples:');
  console.log('  # Get full context');
  console.log('  node runbook-context-extractor.js --org delta-sandbox');
  console.log('');
  console.log('  # Get deployment-specific context');
  console.log('  node runbook-context-extractor.js --org delta-sandbox \\');
  console.log('    --operation-type deployment');
  console.log('');
  console.log('  # Get context for specific objects');
  console.log('  node runbook-context-extractor.js --org delta-sandbox \\');
  console.log('    --objects "Account,Contact,Opportunity"');
  console.log('');
  console.log('  # Get condensed summary only');
  console.log('  node runbook-context-extractor.js --org delta-sandbox \\');
  console.log('    --format summary');
}

/**
 * Format output
 */
function formatOutput(context, format) {
  if (format === 'summary') {
    return JSON.stringify(context.condensedSummary, null, 2);
  }

  return JSON.stringify(context, null, 2);
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  if (!options.org) {
    console.error('❌ Missing required argument: --org');
    printUsage();
    process.exit(1);
  }

  try {
    const context = extractRunbookContext(options.org, options);
    const output = formatOutput(context, options.format);

    if (options.output) {
      fs.writeFileSync(options.output, output, 'utf-8');
      console.log(`✅ Context extracted to: ${options.output}`);
    } else {
      console.log(output);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.stack) {
      console.error('   Stack:', err.stack);
    }
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
  extractRunbookContext,
  extractSections,
  extractMetadata,
  extractKnownExceptions,
  extractWorkflows,
  extractRecommendations,
  extractFieldPolicies,
  createCondensedSummary
};
