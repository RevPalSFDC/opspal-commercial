#!/usr/bin/env node

/**
 * Unit Tests for post-field-deployment.sh
 *
 * Focus on skip behavior when field validation disabled.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/post-field-deployment.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 10000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createPluginRoot(waiterExitCode) {
  const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'post-field-deployment-plugin-'));
  const scriptDir = path.join(pluginRoot, 'scripts/lib');
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptDir, 'metadata-propagation-waiter.js'),
    `'use strict';\nprocess.exit(${waiterExitCode});\n`,
    'utf8'
  );
  return pluginRoot;
}

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (e) {
    console.log('FAIL');
    console.log(`    Error: ${e.message}`);
    return { passed: false, name, error: e.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] post-field-deployment.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when field validation disabled', async () => {
    const result = await tester.run({
      input: {
        tool_input: {
          command: 'sf project deploy start --metadata CustomField:Account.Test_Field__c'
        }
      },
      env: {
        SKIP_FIELD_VALIDATION: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  results.push(await runTest('Emits structured PostToolUse context when validation succeeds', async () => {
    const pluginRoot = createPluginRoot(0);

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: {
            command: 'sf project deploy start --metadata CustomField:Account.Test_Field__c'
          }
        },
        env: {
          CLAUDE_PLUGIN_ROOT: pluginRoot,
          DEPLOYED_FIELDS: 'Account.Test_Field__c',
          USE_HOOKSPECIFIC_OUTPUT: '1'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.output.suppressOutput, true, 'Should suppress verbose stdout noise');
      assert.strictEqual(result.output.hookSpecificOutput.hookEventName, 'PostToolUse', 'Should target PostToolUse');
      assert(
        result.output.hookSpecificOutput.additionalContext.includes('Account.Test_Field__c'),
        'Should surface the validated field name in the additional context'
      );
    } finally {
      fs.rmSync(pluginRoot, { recursive: true, force: true });
    }
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
