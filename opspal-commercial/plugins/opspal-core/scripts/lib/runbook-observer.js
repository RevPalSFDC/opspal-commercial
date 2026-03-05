#!/usr/bin/env node

/**
 * Runbook Observer
 *
 * Purpose: Capture structured telemetry from agent operations to feed the Living Runbook System
 * Usage: node scripts/lib/runbook-observer.js --org <org-alias> --operation <operation-type> [options]
 *
 * Features:
 * - Captures agent observations (configs, workflows, automations)
 * - Stores timestamped observation logs
 * - Auto-detects context from operation type
 * - Non-blocking, graceful error handling
 *
 * Observation Schema:
 * {
 *   timestamp: ISO-8601,
 *   org: string,
 *   agent: string,
 *   operation: string,
 *   context: {
 *     objects: [],
 *     fields: [],
 *     workflows: [],
 *     automations: [],
 *     metadata: {}
 *   },
 *   outcome: 'success|failure|partial',
 *   notes: string
 * }
 *
 * Storage:
 *   instances/{org}/observations/{operation}-{timestamp}.json
 *
 * Exit Codes:
 *   0 - Success
 *   1 - Error (invalid args, write failure)
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    org: null,
    operation: null,
    agent: null,
    context: {},
    outcome: 'success',
    notes: null,
    interactive: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--org':
        options.org = next;
        i++;
        break;
      case '--operation':
        options.operation = next;
        i++;
        break;
      case '--agent':
        options.agent = next;
        i++;
        break;
      case '--outcome':
        options.outcome = next;
        i++;
        break;
      case '--notes':
        options.notes = next;
        i++;
        break;
      case '--context':
        // Accept JSON string for context
        try {
          options.context = JSON.parse(next);
        } catch (err) {
          console.error('❌ Invalid JSON for --context:', err.message);
          process.exit(1);
        }
        i++;
        break;
      case '--objects':
        options.context.objects = next.split(',').map(s => s.trim());
        i++;
        break;
      case '--fields':
        options.context.fields = next.split(',').map(s => s.trim());
        i++;
        break;
      case '--workflows':
        options.context.workflows = next.split(',').map(s => s.trim());
        i++;
        break;
      case '--interactive':
        options.interactive = true;
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
  console.log('Usage: runbook-observer.js --org <org-alias> --operation <type> [options]');
  console.log('');
  console.log('Required Arguments:');
  console.log('  --org <alias>          Salesforce org alias (e.g., delta-sandbox)');
  console.log('  --operation <type>     Operation type (e.g., deployment, workflow-create, field-audit)');
  console.log('');
  console.log('Optional Arguments:');
  console.log('  --agent <name>         Agent that performed the operation');
  console.log('  --outcome <status>     Outcome: success (default), failure, partial');
  console.log('  --notes <text>         Additional notes or observations');
  console.log('  --context <json>       Full context as JSON string');
  console.log('  --objects <list>       Comma-separated object names (e.g., Account,Contact)');
  console.log('  --fields <list>        Comma-separated field names (e.g., CustomField__c)');
  console.log('  --workflows <list>     Comma-separated workflow names');
  console.log('  --interactive          Prompt for missing information');
  console.log('');
  console.log('Examples:');
  console.log('  # Deployment observation');
  console.log('  node runbook-observer.js --org delta-sandbox --operation deployment \\');
  console.log('    --agent sfdc-orchestrator --objects "Account,Contact" --outcome success');
  console.log('');
  console.log('  # Workflow creation');
  console.log('  node runbook-observer.js --org acme-production --operation workflow-create \\');
  console.log('    --workflows "Lead Assignment,Opportunity Routing" --notes "Custom routing logic"');
  console.log('');
  console.log('  # Field audit with full context');
  console.log('  node runbook-observer.js --org eta-corp --operation field-audit \\');
  console.log('    --context \'{"objects": ["Quote__c"], "fields": ["Status__c"], "audit_type": "usage"}\'');
}

/**
 * Detect plugin root directory
 */
function detectPluginRoot() {
  // This script is at: .claude-plugins/opspal-salesforce/scripts/lib/runbook-observer.js
  // Plugin root is 2 levels up
  return path.resolve(__dirname, '../..');
}

/**
 * Get instances directory path
 */
function getInstancesDir(pluginRoot) {
  return path.join(pluginRoot, 'instances');
}

/**
 * Get observations directory for a specific org
 */
function getObservationsDir(pluginRoot, org) {
  return path.join(getInstancesDir(pluginRoot), org, 'observations');
}

/**
 * Ensure directory exists (create if needed)
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Generate observation object
 */
function createObservation(options) {
  const observation = {
    timestamp: new Date().toISOString(),
    org: options.org,
    agent: options.agent || detectCurrentAgent(),
    operation: options.operation,
    context: {
      objects: options.context.objects || [],
      fields: options.context.fields || [],
      workflows: options.context.workflows || [],
      automations: options.context.automations || [],
      metadata: options.context.metadata || {}
    },
    outcome: options.outcome,
    notes: options.notes || null
  };

  return observation;
}

/**
 * Auto-detect current agent from environment or process
 */
function detectCurrentAgent() {
  // Try environment variable first (set by agent execution context)
  if (process.env.CLAUDE_AGENT_NAME) {
    return process.env.CLAUDE_AGENT_NAME;
  }

  // Try to detect from parent process (if available)
  if (process.env.CLAUDE_CURRENT_AGENT) {
    return process.env.CLAUDE_CURRENT_AGENT;
  }

  // Fallback
  return 'unknown';
}

/**
 * Save observation to file
 */
function saveObservation(pluginRoot, observation) {
  const observationsDir = getObservationsDir(pluginRoot, observation.org);
  ensureDir(observationsDir);

  // Generate filename: {operation}-{timestamp}.json
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').split('-').slice(0, 6).join('-');
  const filename = `${observation.operation}-${timestamp}.json`;
  const filepath = path.join(observationsDir, filename);

  // Write observation to file
  fs.writeFileSync(filepath, JSON.stringify(observation, null, 2), 'utf-8');

  return filepath;
}

/**
 * Validate required fields
 */
function validateOptions(options) {
  const errors = [];

  if (!options.org) {
    errors.push('Missing required argument: --org');
  }

  if (!options.operation) {
    errors.push('Missing required argument: --operation');
  }

  // Validate outcome
  const validOutcomes = ['success', 'failure', 'partial'];
  if (!validOutcomes.includes(options.outcome)) {
    errors.push(`Invalid outcome: ${options.outcome}. Must be one of: ${validOutcomes.join(', ')}`);
  }

  return errors;
}

/**
 * Interactive prompt for missing information
 */
async function promptForMissingInfo(options) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

  if (!options.org) {
    options.org = await question('Salesforce org alias: ');
  }

  if (!options.operation) {
    options.operation = await question('Operation type (e.g., deployment, workflow-create): ');
  }

  if (!options.agent) {
    const agent = await question('Agent name (press Enter to auto-detect): ');
    if (agent) {
      options.agent = agent;
    }
  }

  if (!options.notes) {
    const notes = await question('Notes (optional, press Enter to skip): ');
    if (notes) {
      options.notes = notes;
    }
  }

  rl.close();
  return options;
}

/**
 * Main execution
 */
async function main() {
  let options = parseArgs();

  // Interactive mode
  if (options.interactive || (!options.org && !options.operation)) {
    options = await promptForMissingInfo(options);
  }

  // Validate options
  const errors = validateOptions(options);
  if (errors.length > 0) {
    console.error('❌ Validation errors:');
    errors.forEach(err => console.error(`   ${err}`));
    console.error('');
    printUsage();
    process.exit(1);
  }

  const pluginRoot = detectPluginRoot();

  try {
    // Create observation object
    const observation = createObservation(options);

    // Save to file
    const filepath = saveObservation(pluginRoot, observation);

    // Success output
    console.log('✅ Observation recorded');
    console.log(`   Org: ${observation.org}`);
    console.log(`   Operation: ${observation.operation}`);
    console.log(`   Agent: ${observation.agent}`);
    console.log(`   Outcome: ${observation.outcome}`);
    if (observation.context.objects.length > 0) {
      console.log(`   Objects: ${observation.context.objects.join(', ')}`);
    }
    if (observation.context.fields.length > 0) {
      console.log(`   Fields: ${observation.context.fields.join(', ')}`);
    }
    if (observation.context.workflows.length > 0) {
      console.log(`   Workflows: ${observation.context.workflows.join(', ')}`);
    }
    console.log('');
    console.log(`📁 Saved to: ${filepath}`);

  } catch (err) {
    console.error('❌ Failed to record observation:', err.message);
    console.error('   Stack trace:', err.stack);
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
  createObservation,
  saveObservation,
  getObservationsDir,
  detectPluginRoot
};
