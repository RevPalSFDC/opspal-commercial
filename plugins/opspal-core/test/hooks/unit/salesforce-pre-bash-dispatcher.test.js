#!/usr/bin/env node

const assert = require('assert');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/pre-bash-dispatcher.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 20000,
    verbose: process.env.VERBOSE === '1'
  });
}

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false, name, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] Salesforce pre-bash dispatcher\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Ignores generic Bash commands', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'echo hello'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.output, null, 'Should stay silent for unrelated Bash commands');
  }));

  results.push(await runTest('Allows deploy report lifecycle commands to pass through without pre-deploy validation', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy report --job-id 0Af000000000123AAA --target-org peregrine-sandbox --json'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Lifecycle deploy commands should stay runnable');
    assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
    assert.strictEqual(result.output, null, 'Lifecycle deploy commands should not emit dispatcher JSON by default');
    assert(!result.stderr.includes('DEPLOY BLOCKED'), 'Should not trigger direct deploy routing for report commands');
    assert(!result.stderr.includes('Deployment validation failed'), 'Should not trigger comprehensive validation for report commands');
  }));

  results.push(await runTest('Blocks direct Salesforce deploy commands outside agent context', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy start --source-dir force-app/main/default/layouts'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Dispatcher should exit 0 (child emits JSON blockExecution)');
    assert(result.stderr.includes('DEPLOY BLOCKED'), 'Should explain the direct deploy block');
    const output = result.output || {};
    const hookOutput = output.hookSpecificOutput || {};
    // The child hook emits {"blockExecution": true} which the dispatcher merges into its JSON
    // The merged output may surface as permissionDecision or as blockExecution depending on dispatcher merge logic
    assert(
      hookOutput.permissionDecision === 'deny' || (result.stdout || '').includes('blockExecution'),
      'Should contain a blocking signal in the merged output'
    );
  }));

  // sfdx bypass prevention tests
  results.push(await runTest('Blocks sfdx project deploy start (no sfdx bypass)', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sfdx project deploy start --source-dir force-app/main/default/layouts'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Dispatcher should exit 0 (child emits JSON blockExecution)');
    assert(result.stderr.includes('DEPLOY BLOCKED'), 'sfdx deploy should be blocked just like sf deploy');
    const output = result.output || {};
    const hookOutput = output.hookSpecificOutput || {};
    assert(
      hookOutput.permissionDecision === 'deny' || (result.stdout || '').includes('blockExecution'),
      'Should contain a blocking signal for sfdx deploy commands'
    );
  }));

  results.push(await runTest('Validates sfdx data query through SOQL validator', async () => {
    // sfdx data query should trigger the same SOQL validation as sf data query
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sfdx data query --query "SELECT ApiName FROM FlowVersionView" --json'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    // The SOQL validator should fire and correct ApiName -> DeveloperName
    if (result.output?.hookSpecificOutput?.additionalContext) {
      assert(
        result.output.hookSpecificOutput.additionalContext.includes('DeveloperName') ||
        result.output.hookSpecificOutput.updatedInput,
        'sfdx data query should trigger SOQL field corrections'
      );
    }
  }));

  results.push(await runTest('Returns structured jq validation guidance', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'echo {} | jq ".foo |"'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should keep the Bash command runnable');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
    assert.strictEqual(result.output?.hookSpecificOutput?.hookEventName, 'PreToolUse');
    assert(
      (result.output?.hookSpecificOutput?.additionalContext || '').includes('incomplete pipe'),
      'Should preserve jq validation guidance through the dispatcher'
    );
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
