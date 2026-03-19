#!/usr/bin/env node

/**
 * Unit Tests for permission-request-handler.sh
 *
 * Validates permission auto-approval behavior for safe read/query operations.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const path = require('path');
const assert = require('assert');
const fs = require('fs');
const os = require('os');

const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/permission-request-handler.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 10000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'permission-hook-test-home-'));
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
  console.log('\n[Tests] permission-request-handler.sh Tests\n');

  const tester = createTester();
  const results = [];
  const tempHome = createTempHome();

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Auto-approves safe sf data query requests', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: { command: 'sf data query --query "SELECT Id FROM Account LIMIT 1"' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Hook should exit successfully');
    assert.deepStrictEqual(result.output, {
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: {
          behavior: 'allow'
        }
      }
    }, 'Safe query should be auto-approved with the live PermissionRequest contract');
  }));

  results.push(await runTest('Leaves write/deploy commands as pass-through', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: { command: 'sf project deploy start --target-org prod' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Hook should exit successfully');
    assert(
      result.stdout.trim() === '',
      'Write/deploy operations should remain pass-through (no allow decision)'
    );
  }));

  results.push(await runTest('Auto-approves read-only MCP request names', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'mcp__salesforce__query_records',
        tool_input: {}
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Hook should exit successfully');
    assert.deepStrictEqual(result.output, {
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: {
          behavior: 'allow'
        }
      }
    }, 'Read-only MCP operations should be auto-approved');
  }));

  fs.rmSync(tempHome, { recursive: true, force: true });

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    for (const result of results.filter(r => !r.passed)) {
      console.log(`  - ${result.name}: ${result.error}`);
    }
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
