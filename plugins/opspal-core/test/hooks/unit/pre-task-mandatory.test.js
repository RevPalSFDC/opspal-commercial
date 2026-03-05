#!/usr/bin/env node

/**
 * Unit Tests for pre-task-mandatory.sh
 *
 * Validates blocking for high-risk operations and allow path for low-risk.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-salesforce/hooks/pre-task-mandatory.sh');
const DEFAULT_TIMEOUT = 5000;

function runHookWithInput(args, input, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', args, {
      cwd: PROJECT_ROOT,
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      stdout += data.toString();
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({ exitCode: 124, stdout, stderr, timedOut: true });
    }, timeout);

    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr });
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
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
  console.log('\n[Tests] pre-task-mandatory.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Blocks high-risk operations', async () => {
    const result = await runHookWithInput([HOOK_PATH, 'delete field on Account'], '\n');

    assert.strictEqual(result.exitCode, 1, 'Should exit with 1 when blocked');
  }));

  results.push(await runTest('Allows low-risk operations when declined', async () => {
    const result = await runHookWithInput([HOOK_PATH, 'run a simple query'], 'n\n');

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0 when declined');
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
