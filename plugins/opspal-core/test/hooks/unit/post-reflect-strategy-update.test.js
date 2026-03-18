#!/usr/bin/env node

/**
 * Unit Tests for post-reflect-strategy-update.sh
 *
 * Validates non-blocking behavior when skill tracking disabled.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const path = require('path');
const assert = require('assert');
const fs = require('fs');
const os = require('os');

const { HookTester } = require('../runner');

// =============================================================================
// Test Configuration
// =============================================================================

const HOOK_PATH = 'plugins/opspal-core/hooks/post-reflect-strategy-update.sh';

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
  console.log('\n[Tests] post-reflect-strategy-update.sh Tests\n');

  const tester = createTester();
  const results = [];
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));

  // Test 1: Hook validation
  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  // Test 2: Disabled tracking exits cleanly
  results.push(await runTest('Skips when tracking disabled', async () => {
    const result = await tester.run({
      input: {},
      env: {
        ENABLE_SKILL_TRACKING: '0',
        HOME: tempHome
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  // Cleanup temp home
  fs.rmSync(tempHome, { recursive: true, force: true });

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
