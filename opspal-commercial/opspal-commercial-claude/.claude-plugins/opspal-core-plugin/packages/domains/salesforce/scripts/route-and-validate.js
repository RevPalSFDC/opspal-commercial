#!/usr/bin/env node

/**
 * Route and Validate - Integrated Workflow
 *
 * Demonstrates the complete workflow of routing an operation to an agent
 * and then validating the agent's response for accuracy.
 *
 * Usage:
 *   node route-and-validate.js route "deploy metadata to production"
 *   node route-and-validate.js validate --response response.txt --operation "field analysis"
 *   node route-and-validate.js full --operation "analyze orphaned accounts" --response response.txt
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Load auto-agent-router
const AutoAgentRouter = require('./auto-agent-router');

// Load validation integration
const AutoRouterValidatorIntegration = require('./lib/auto-router-validator-integration');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  purple: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help') {
    displayHelp();
    process.exit(0);
  }

  // Initialize router and integration
  const router = new AutoAgentRouter();
  const integration = new AutoRouterValidatorIntegration(router);

  if (command === 'route') {
    // Route operation to agent (no validation)
    const operation = args[1];
    if (!operation) {
      console.error('Error: operation required');
      process.exit(1);
    }

    const result = await router.routeOperation(operation);
    displayRoutingResult(result);

  } else if (command === 'validate') {
    // Validate a response file
    const responseFile = getArg(args, '--response');
    const operation = getArg(args, '--operation') || 'unknown operation';

    if (!responseFile) {
      console.error('Error: --response required');
      process.exit(1);
    }

    const response = fs.readFileSync(responseFile, 'utf8');

    // Create dummy routing context
    const context = {
      agent: getArg(args, '--agent') || 'unknown',
      operation: operation,
      org: getArg(args, '--org') || 'unknown',
      complexity: parseFloat(getArg(args, '--complexity')) || 0.5
    };

    const result = await integration.validateAgentResponse(response, context);
    integration.displayValidationResult(result);

    if (result.action === 'retry_needed') {
      console.log('\n📝 RE-VALIDATION PROMPT:');
      console.log('─'.repeat(60));
      console.log(result.revalidationPrompt);
      console.log('─'.repeat(60));
    }

  } else if (command === 'full') {
    // Full workflow: route + validate
    const operation = getArg(args, '--operation');
    const responseFile = getArg(args, '--response');

    if (!operation || !responseFile) {
      console.error('Error: --operation and --response required');
      process.exit(1);
    }

    const response = fs.readFileSync(responseFile, 'utf8');

    const result = await integration.routeAndValidate(operation, response);

    if (result.requiresRetry) {
      console.log('\n' + colors.red + colors.bold + '🔄 RE-VALIDATION REQUIRED' + colors.reset);
      console.log('\nPlease re-invoke the agent with this prompt:');
      console.log('─'.repeat(60));
      console.log(result.revalidationPrompt);
      console.log('─'.repeat(60));
    } else if (result.validation.action === 'warned') {
      console.log('\n' + colors.yellow + '⚠️  RESPONSE CONTAINS WARNINGS' + colors.reset);
      console.log('Review the concerns above before proceeding.');
    } else {
      console.log('\n' + colors.green + '✅ VALIDATION PASSED' + colors.reset);
      console.log('Response is ready for user.');
    }

  } else if (command === 'stats') {
    // Display statistics
    console.log(router.generateReport());
    console.log(integration.generateValidationReport());

  } else if (command === 'test') {
    // Run test suite with example responses
    await runTestSuite(router, integration);

  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Use --help for usage information');
    process.exit(1);
  }
}

/**
 * Display help
 */
function displayHelp() {
  console.log(`
${colors.bold}Route and Validate - Integrated Workflow${colors.reset}

${colors.yellow}USAGE:${colors.reset}
  node route-and-validate.js <command> [options]

${colors.yellow}COMMANDS:${colors.reset}
  route <operation>
      Route operation to appropriate agent (no validation)

  validate --response <file> --operation <text> [options]
      Validate an agent response
      Options:
        --agent <name>        Agent name (default: unknown)
        --org <alias>         Org alias (default: unknown)
        --complexity <0-1>    Complexity score (default: 0.5)

  full --operation <text> --response <file>
      Complete workflow: route operation and validate response

  stats
      Display routing and validation statistics

  test
      Run test suite with example responses

${colors.yellow}EXAMPLES:${colors.reset}
  # Route an operation
  node route-and-validate.js route "analyze orphaned accounts in production"

  # Validate a response
  node route-and-validate.js validate \\
    --response response.txt \\
    --operation "field analysis" \\
    --agent "sfdc-field-analyzer" \\
    --org "production"

  # Full workflow
  node route-and-validate.js full \\
    --operation "analyze field usage in rentable-prod" \\
    --response field-analysis-response.txt

  # Show statistics
  node route-and-validate.js stats

  # Run tests
  node route-and-validate.js test
`);
}

/**
 * Display routing result
 */
function displayRoutingResult(result) {
  if (!result.routed) {
    console.log(colors.red + '❌ No agent matched' + colors.reset);
    return;
  }

  console.log('\n' + colors.green + '✅ ROUTING RESULT' + colors.reset);
  console.log('Agent: ' + colors.purple + result.agent + colors.reset);
  console.log('Confidence: ' + (result.confidence * 100).toFixed(0) + '%');
  console.log('Complexity: ' + (result.complexity * 100).toFixed(0) + '%');
  console.log('Auto-Invoke: ' + (result.autoInvoked ? 'Yes' : 'No'));
}

/**
 * Get argument value
 */
function getArg(args, flag) {
  const index = args.indexOf(flag);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

/**
 * Run test suite
 */
async function runTestSuite(router, integration) {
  console.log(colors.bold + '\n🧪 RUNNING TEST SUITE' + colors.reset);
  console.log('═'.repeat(60));

  const tests = [
    {
      name: 'Suspicious Percentage (98% orphaned)',
      operation: 'analyze orphaned accounts in production',
      responseFile: './lib/__tests__/fixtures/response-suspicious-percentage.txt',
      expectedAction: 'retry_needed'
    },
    {
      name: 'Valid Response (45% qualified)',
      operation: 'analyze lead qualification in sandbox',
      responseFile: './lib/__tests__/fixtures/response-valid.txt',
      expectedAction: 'passed'
    },
    {
      name: 'Zero Count (0 records use Email)',
      operation: 'analyze email field usage',
      responseFile: './lib/__tests__/fixtures/response-zero-count.txt',
      expectedAction: 'warned'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log('\n' + colors.yellow + `Test: ${test.name}` + colors.reset);

    try {
      const responseFile = path.join(__dirname, test.responseFile);
      const response = fs.readFileSync(responseFile, 'utf8');

      const result = await integration.routeAndValidate(test.operation, response);

      // Handle validation result
      let actualAction = 'unknown';
      if (result.validation) {
        if (result.validation.passed) {
          actualAction = 'passed';
        } else if (result.validation.action === 'retry_needed') {
          actualAction = 'retry_needed';
        } else if (result.validation.action === 'warned') {
          actualAction = 'warned';
        }
      }

      if (actualAction === test.expectedAction) {
        console.log(colors.green + '✓ PASS' + colors.reset + ` (action: ${actualAction})`);
        passed++;
      } else {
        console.log(colors.red + '✗ FAIL' + colors.reset + ` (expected: ${test.expectedAction}, got: ${actualAction})`);
        failed++;
      }
    } catch (error) {
      console.log(colors.red + '✗ ERROR: ' + error.message + colors.reset);
      failed++;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(colors.bold + `Results: ${passed} passed, ${failed} failed` + colors.reset);
  console.log('═'.repeat(60));
}

// Run main
main().catch(error => {
  console.error(colors.red + 'Error: ' + error.message + colors.reset);
  process.exit(1);
});
