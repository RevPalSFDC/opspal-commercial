#!/usr/bin/env node

/**
 * Unit Tests for pre-task-routing-clarity.sh
 *
 * Validates routing clarity hook execution and safe defaults.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const { HookTester } = require('../runner');

// =============================================================================
// Test Configuration
// =============================================================================

const HOOK_PATH = 'plugins/opspal-core/hooks/pre-task-routing-clarity.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_ABS_PATH = path.join(PROJECT_ROOT, HOOK_PATH);

// =============================================================================
// Test Helpers
// =============================================================================

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
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

// =============================================================================
// Tests
// =============================================================================

async function runAllTests() {
  console.log('\n[Tests] pre-task-routing-clarity.sh Tests\n');

  const tester = createTester();
  const results = [];

  // Test 1: Hook validation
  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  // Test 2: Runs with routing inputs without failure
  results.push(await runTest('Runs with routing inputs without failure', async () => {
    const result = spawnSync('bash', [
      HOOK_ABS_PATH,
      'Run a CPQ assessment for Acme',
      'opspal-salesforce:sfdc-cpq-assessor'
    ], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        ROUTING_CLARITY_ENABLED: '1',
        ROUTING_CLARITY_VERBOSE: '0'
      },
      encoding: 'utf8'
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
  }));

  // Test 3: Accepts JSON payload from stdin (real hook invocation style)
  results.push(await runTest('Accepts JSON payload from stdin', async () => {
    const result = await tester.run({
      input: {
        message: 'Run a CPQ assessment for Acme',
        subagent_type: 'opspal-salesforce:sfdc-cpq-assessor'
      },
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: path.join(PROJECT_ROOT, 'plugins/opspal-core'),
        ROUTING_CLARITY_ENABLED: '1',
        ROUTING_CLARITY_VERBOSE: '0'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  // Test 4: Accepts raw prompt from stdin (prevention orchestrator style)
  results.push(await runTest('Accepts raw prompt from stdin', async () => {
    const result = await tester.run({
      stdin: 'Investigate routing confusion for CPQ and pipeline work',
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: path.join(PROJECT_ROOT, 'plugins/opspal-core'),
        ROUTING_CLARITY_ENABLED: '1',
        ROUTING_CLARITY_VERBOSE: '0'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  // Summary
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
