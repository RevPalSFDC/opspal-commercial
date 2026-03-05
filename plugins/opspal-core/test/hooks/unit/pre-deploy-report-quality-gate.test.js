#!/usr/bin/env node

/**
 * Unit Tests for pre-deploy-report-quality-gate.sh
 *
 * Focus on skip behavior and empty deploy dir handling.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/pre-deploy-report-quality-gate.sh';

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
  console.log('\n[Tests] pre-deploy-report-quality-gate.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when report quality gate disabled', async () => {
    const result = await tester.run({
      input: {},
      env: {
        SKIP_REPORT_QUALITY_GATE: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert(
      result.stdout.includes('Report quality gate skipped'),
      'Should note skipped validation'
    );
  }));

  results.push(await runTest('Reports no files when deploy dir empty', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-report-gate-'));
    try {
      const result = await tester.run({
        input: {},
        env: {
          SF_DEPLOY_DIR: tempDir
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert(
        result.stdout.includes('No reports or dashboards to validate'),
        'Should report no files to validate'
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
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
