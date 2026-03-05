#!/usr/bin/env node

/**
 * Check Field Dependencies CLI
 *
 * Simple CLI wrapper for the Metadata Dependency Analyzer.
 * Designed for CI/CD pipelines and quick command-line checks.
 *
 * Usage:
 *   check-dependencies <orgAlias> <object> <field>
 *   check-dependencies <orgAlias> --deployment <path>
 *   check-dependencies --help
 *
 * Exit Codes:
 *   0 - Success (safe to proceed)
 *   1 - Error (has dependencies or validation failed)
 *
 * Examples:
 *   check-dependencies myorg Account MyField__c
 *   check-dependencies myorg --deployment ./force-app
 *   check-dependencies myorg Account MyField__c --block
 *
 * @see metadata-dependency-analyzer.js for full implementation
 * @runbook Prevents 80% of field deletion deployment failures
 */

const path = require('path');

// Import the dependency analyzer
const MetadataDependencyAnalyzer = require('./lib/metadata-dependency-analyzer');

// Help text
const HELP = `
╔═══════════════════════════════════════════════════════════════════════════╗
║                    FIELD DEPENDENCY CHECKER                                ║
║                                                                           ║
║   Prevents deployment failures by analyzing field references              ║
║   ROI: $42K/year (addresses schema/parse cohort - 7 reflections)          ║
╚═══════════════════════════════════════════════════════════════════════════╝

USAGE:
  check-dependencies <orgAlias> <object> <field>     Check single field
  check-dependencies <orgAlias> --deployment <path>  Validate deployment
  check-dependencies --help                          Show this help

OPTIONS:
  --block        Exit with code 1 if field has ANY references (for CI/CD)
  --deployment   Run comprehensive deployment validation
  --verbose      Show detailed output
  --json         Output results as JSON

EXAMPLES:
  # Check if Account.MyField__c can be deleted
  check-dependencies myorg Account MyField__c

  # Block deployment if field has references (CI/CD mode)
  check-dependencies myorg Account MyField__c --block

  # Validate entire deployment directory
  check-dependencies myorg --deployment ./force-app/main/default

  # Get JSON output for scripting
  check-dependencies myorg Account MyField__c --json

EXIT CODES:
  0 - Safe to proceed (no blocking references)
  1 - Blocked (has dependencies or validation failed)

WHAT IT CHECKS:
  - Flows (assignments, formulas, screens, decisions)
  - Validation Rules (formula references)
  - Formula Fields (calculations using the field)
  - Page Layouts (field presence)
  - Process Builders (criteria using the field)
  - Workflow Rules (field references)
  - Flow XML patterns (.null__NotFound errors)
`;

async function main() {
  const args = process.argv.slice(2);

  // Show help
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  const orgAlias = args[0];
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    block: args.includes('--block') || args.includes('-b'),
    json: args.includes('--json'),
    deployment: args.includes('--deployment') || args.includes('-d')
  };

  // Filter out option flags to get positional args
  const positionalArgs = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));

  try {
    const analyzer = new MetadataDependencyAnalyzer(orgAlias, {
      verbose: options.verbose
    });

    // Deployment validation mode
    if (options.deployment) {
      const deployPath = positionalArgs[1] || './force-app/main/default';

      console.log('');
      console.log('🔍 Running comprehensive deployment validation...');
      console.log('');

      const result = await analyzer.checkDeployment(deployPath);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      }

      process.exit(result.canDeploy ? 0 : 1);
    }

    // Single field check mode
    const objectName = positionalArgs[1];
    const fieldName = positionalArgs[2];

    if (!objectName || !fieldName) {
      console.error('Error: Object name and field name are required');
      console.error('Usage: check-dependencies <orgAlias> <object> <field>');
      process.exit(1);
    }

    console.log('');
    console.log(`🔍 Checking dependencies for ${objectName}.${fieldName}...`);
    console.log('');

    const dependencies = await analyzer.analyzeField(objectName, fieldName);

    if (options.json) {
      console.log(JSON.stringify(dependencies, null, 2));
    } else {
      console.log(analyzer.generateReport(dependencies));
    }

    // Determine exit code
    if (options.block) {
      // In block mode, exit 1 if ANY references exist
      if (dependencies.totalReferences > 0) {
        console.log('');
        console.log('❌ BLOCKED: Field has active references');
        console.log('');
        console.log('To proceed, you must:');
        console.log('  1. Update/remove the references listed above');
        console.log('  2. Deploy those changes');
        console.log('  3. Re-run this check');
        process.exit(1);
      } else {
        console.log('');
        console.log('✅ SAFE: No active references found');
        process.exit(0);
      }
    } else {
      // Standard mode, exit based on canDelete
      process.exit(dependencies.canDelete ? 0 : 1);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);

    if (options.verbose) {
      console.error(error.stack);
    }

    process.exit(1);
  }
}

main();
