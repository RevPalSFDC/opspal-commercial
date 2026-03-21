#!/usr/bin/env node

/**
 * Unit Tests for session-end-reliability.sh
 *
 * Validates syntax, skip guards, and non-blocking reliability behavior.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = 'plugins/opspal-core/hooks/session-end-reliability.sh';
const HOOK_FILE_PATH = path.join(PROJECT_ROOT, HOOK_PATH);

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

async function runAllTests() {
  console.log('\n[Tests] session-end-reliability.sh Tests\n');

  const tester = createTester();
  const results = [];
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-reliability-home-'));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-reliability-root-'));

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when auto reliability disabled', async () => {
    const result = await tester.run({
      input: {},
      env: {
        ENABLE_AUTO_RELIABILITY: '0',
        RELIABILITY_VERBOSE: '1',
        HOME: tempHome
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 when disabled');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
    assert.deepStrictEqual(result.output, {}, 'Should emit a JSON no-op envelope');
    assert(
      result.stderr.includes('Auto-reliability disabled'),
      'Should log disabled state'
    );
  }));

  results.push(await runTest('Skips when reliability manager missing', async () => {
    const result = await tester.run({
      input: {},
      env: {
        RELIABILITY_SCRIPT_OVERRIDE: path.join(tempRoot, 'missing-reflection-reliability-manager.js'),
        RELIABILITY_VERBOSE: '1',
        HOME: tempHome
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 when manager missing');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
    assert.deepStrictEqual(result.output, {}, 'Should emit a JSON no-op envelope');
    assert(
      result.stderr.includes('Reliability manager not found'),
      'Should log missing manager path'
    );
  }));

  results.push(await runTest('Runs reliability checks non-blocking with timeout', async () => {
    const contents = fs.readFileSync(HOOK_FILE_PATH, 'utf8');
    assert(
      contents.includes('timeout 60'),
      'Hook should use timeout to avoid hanging'
    );
    assert(
      contents.includes('disown'),
      'Hook should disown background reliability process'
    );
  }));

  fs.rmSync(tempHome, { recursive: true, force: true });
  fs.rmSync(tempRoot, { recursive: true, force: true });

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`
Results: ${passed} passed, ${failed} failed
`);

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
