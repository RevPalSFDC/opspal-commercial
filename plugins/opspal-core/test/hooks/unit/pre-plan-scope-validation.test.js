#!/usr/bin/env node

/**
 * Unit Tests for pre-plan-scope-validation.sh
 *
 * Validates scope checks for plan mode inputs.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const path = require('path');
const assert = require('assert');
const fs = require('fs');

const { HookTester } = require('../runner');

// =============================================================================
// Test Configuration
// =============================================================================

const HOOK_PATH = 'plugins/opspal-core/hooks/pre-plan-scope-validation.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_DIR = path.join(PROJECT_ROOT, 'plugins/opspal-core/hooks');

// =============================================================================
// Test Helpers
// =============================================================================

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
  console.log('\n[Tests] pre-plan-scope-validation.sh Tests\n');

  const tester = createTester();
  const results = [];

  // Test 1: Hook validation
  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  // Test 2: Non-plan mode exits cleanly
  results.push(await runTest('Skips when not in plan mode', async () => {
    const result = await tester.run({
      stdin: 'mode=chat\nrequest=Just chatting\n'
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  // Test 3: Bounded plan request passes
  results.push(await runTest('Allows bounded plan request', async () => {
    const requirementsDir = path.join(HOOK_DIR, '.requirements');
    const requirementsExisted = fs.existsSync(requirementsDir);

    const result = await tester.run({
      stdin: 'mode=plan\nrequest=Add a Usage section to README.md with 3 bullet points: install, run, test.\n'
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');

    if (!requirementsExisted && fs.existsSync(requirementsDir)) {
      fs.rmSync(requirementsDir, { recursive: true, force: true });
    }
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
