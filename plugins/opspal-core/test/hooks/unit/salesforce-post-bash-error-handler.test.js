#!/usr/bin/env node

/**
 * Unit Tests for Salesforce post-bash-error-handler.sh
 *
 * Validates runtime hook behavior and structured error logging.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  'plugins/opspal-salesforce/hooks/post-bash-error-handler.sh'
);

function hasJq() {
  const result = spawnSync('jq', ['--version'], { encoding: 'utf8' });
  return result.status === 0;
}

function runHook(payload, env = {}) {
  return spawnSync('bash', ['-c', 'printf \'%s\' "$HOOK_INPUT" | bash "$HOOK_PATH"'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOOK_PATH,
      HOOK_INPUT: JSON.stringify(payload),
      ...env
    }
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
  console.log('\n[Tests] Salesforce post-bash-error-handler.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Passes through successful commands without emitting guidance', async () => {
    if (!hasJq()) {
      return;
    }
    const result = runHook({
      tool: 'Bash',
      result: { exitCode: 0, stdout: '', stderr: '' },
      tool_input: { command: 'sf data query --query "SELECT Id FROM Account"' }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert.strictEqual(result.stdout.trim(), '', 'Should not emit guidance for successful commands');
  }));

  results.push(await runTest('Emits SOQL recovery guidance on INVALID_FIELD errors', async () => {
    if (!hasJq()) {
      return;
    }

    const result = runHook({
      tool: 'Bash',
      result: {
        exitCode: 1,
        stdout: '',
        stderr: "INVALID_FIELD: No such column 'ApiName' on entity 'FlowVersionView'"
      },
      tool_input: {
        command: 'sf data query --query "SELECT ApiName FROM FlowVersionView" --target-org test --json'
      }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    const output = JSON.parse(result.stdout.trim());
    assert(
      output.systemMessage.includes('[SOQL Error Recovery]'),
      'Should emit SOQL recovery guidance'
    );
  }));

  results.push(await runTest('Writes structured error logs to configured log root', async () => {
    if (!hasJq()) {
      return;
    }

    const tempLogRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'salesforce-post-bash-log-'));
    const logFile = path.join(tempLogRoot, 'post-bash-error-handler.jsonl');

    try {
      const result = runHook({
        tool: 'Bash',
        result: {
          exitCode: 1,
          stdout: '',
          stderr: "INVALID_FIELD: No such column 'ApiName' on entity 'FlowVersionView'"
        },
        tool_input: {
          command: 'sf data query --query "SELECT ApiName FROM FlowVersionView" --target-org test --json'
        }
      }, {
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      });

      assert.strictEqual(result.status, 0, 'Should exit with 0');
      assert(fs.existsSync(logFile), 'Should create post-bash-error-handler log file');

      const entries = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
      assert(entries.length >= 1, 'Should write at least one structured log entry');

      const entry = JSON.parse(entries[entries.length - 1]);
      assert.strictEqual(entry.hook, 'post-bash-error-handler', 'Should include hook name');
      assert.strictEqual(entry.errorClass, 'INVALID_FIELD', 'Should classify INVALID_FIELD errors');
      assert.strictEqual(entry.exitCode, '1', 'Should capture exit code from hook payload');
      assert.strictEqual(entry.guidanceProvided, true, 'Should indicate recovery guidance was emitted');
    } finally {
      fs.rmSync(tempLogRoot, { recursive: true, force: true });
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
