#!/usr/bin/env node

/**
 * Unit Tests for Salesforce pre-bash-jq-validator.sh
 *
 * Validates jq warning detection and pass-through behavior.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  'plugins/opspal-salesforce/hooks/pre-bash-jq-validator.sh'
);

function hasJq() {
  const result = spawnSync('jq', ['--version'], { encoding: 'utf8' });
  return result.status === 0;
}

function runHook(payload) {
  return spawnSync('bash', ['-c', 'printf \'%s\' "$HOOK_INPUT" | bash "$HOOK_PATH"'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOOK_PATH,
      HOOK_INPUT: JSON.stringify(payload)
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
  console.log('\n[Tests] Salesforce pre-bash-jq-validator.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Passes through non-jq commands', async () => {
    if (!hasJq()) {
      return;
    }

    const result = runHook({
      tool_input: {
        command: 'echo hello'
      }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert.strictEqual(result.stdout.trim(), '', 'Should not emit warnings for non-jq commands');
  }));

  results.push(await runTest('Warns and returns exit code 2 for incomplete jq pipe expressions', async () => {
    if (!hasJq()) {
      return;
    }

    const result = runHook({
      tool_input: {
        command: 'echo {} | jq ".foo |"'
      }
    });

    assert.strictEqual(result.status, 2, 'Should return warning exit code 2');
    const output = JSON.parse(result.stdout.trim());
    assert(
      output.systemMessage && output.systemMessage.includes('incomplete pipe'),
      'Should warn about incomplete jq pipe expressions'
    );
  }));

  results.push(await runTest('Handles empty payload gracefully', async () => {
    if (!hasJq()) {
      return;
    }

    const result = runHook({});
    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert.strictEqual(result.stdout.trim(), '', 'Should not emit warnings for empty payload');
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
