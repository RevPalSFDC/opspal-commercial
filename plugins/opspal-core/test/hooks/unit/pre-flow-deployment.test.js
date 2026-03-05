#!/usr/bin/env node

/**
 * Unit Tests for pre-flow-deployment.sh
 *
 * Covers missing args and skip/warning paths without external validators.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/pre-flow-deployment.sh';

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
  console.log('\n[Tests] pre-flow-deployment.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Fails when flow path missing', async () => {
    const result = await tester.run({ input: {} });
    assert.strictEqual(result.exitCode, 5, 'Should exit with config error');
    assert(result.stdout.includes('Usage: bash pre-flow-deployment.sh'), 'Should print usage');
  }));

  results.push(await runTest('Fails when flow file not found', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-flow-'));
    try {
      const flowPath = path.join(tempDir, 'Missing.flow-meta.xml');

      const { spawn } = require('child_process');
      const procResult = await new Promise((resolve, reject) => {
        const proc = spawn('bash', [tester.hookPath, flowPath], {
          env: { ...process.env, HOOK_TEST_MODE: '1' }
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', data => { stdout += data.toString(); });
        proc.stderr.on('data', data => { stderr += data.toString(); });
        proc.on('close', code => resolve({ code, stdout, stderr }));
        proc.on('error', err => reject(err));
      });

      assert.strictEqual(procResult.code, 1, 'Should exit with validation error');
      assert(procResult.stdout.includes('Flow file not found'), 'Should report missing file');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Emits warning when validators missing', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-flow-'));
    const flowPath = path.join(tempRoot, 'Test.flow-meta.xml');
    fs.writeFileSync(flowPath, '<Flow></Flow>\n', 'utf8');
    const realPluginRoot = path.resolve(__dirname, '../../../../..', 'plugins/opspal-salesforce');
    const helperSrc = path.join(realPluginRoot, 'scripts', 'lib', 'hook-stop-prompt-helper.sh');
    const helperDir = path.join(tempRoot, 'scripts', 'lib');

    try {
      fs.mkdirSync(helperDir, { recursive: true });
      fs.copyFileSync(helperSrc, path.join(helperDir, 'hook-stop-prompt-helper.sh'));

      const { spawn } = require('child_process');
      const procResult = await new Promise((resolve, reject) => {
        const proc = spawn('bash', [tester.hookPath, flowPath], {
          env: {
            ...process.env,
            CLAUDE_PLUGIN_ROOT: tempRoot,
            ENABLE_FLOW_STATE_SNAPSHOT: '0'
          }
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', data => { stdout += data.toString(); });
        proc.stderr.on('data', data => { stderr += data.toString(); });
        proc.on('close', code => resolve({ code, stdout, stderr }));
        proc.on('error', err => reject(err));
      });

      assert.strictEqual(procResult.code, 0, 'Should exit with 0');
      assert(procResult.stdout.includes('Validator not found'), 'Should mention missing validators');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
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
