#!/usr/bin/env node

/**
 * Unit Tests for hook-circuit-breaker.sh
 *
 * Validates HOOK_SCRIPT requirement and pass-through behavior.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-salesforce/hooks/hook-circuit-breaker.sh');
const DEFAULT_TIMEOUT = 5000;

function runHook(args, { input = '', env = {}, timeout = DEFAULT_TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', args, {
      env: { ...process.env, ...env }
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
  console.log('\n[Tests] hook-circuit-breaker.sh Tests\n');

  const results = [];

  results.push(await runTest('Requires HOOK_SCRIPT environment variable', async () => {
    const result = await runHook([HOOK_PATH], { input: '{}' });

    assert.strictEqual(result.exitCode, 1, 'Should exit with 1 when HOOK_SCRIPT missing');
    assert(
      result.stderr.includes('HOOK_SCRIPT') || result.stderr.includes('HOOK_SCRIPT environment variable required'),
      'Should report missing HOOK_SCRIPT'
    );
  }));

  results.push(await runTest('Passes through successful hook output', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-circuit-'));
    const hookFile = path.join(tempDir, 'echo-hook.sh');
    fs.writeFileSync(hookFile, '#!/bin/bash\ncat\n', 'utf8');
    fs.chmodSync(hookFile, 0o755);

    const input = '{"ok":true}';
    try {
      const result = await runHook([HOOK_PATH], {
        input,
        env: {
          HOOK_SCRIPT: hookFile,
          CLAUDE_PLUGIN_ROOT: tempDir
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0 on success');
      assert(
        result.stdout.includes('\"ok\":true'),
        'Should return hook output'
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
