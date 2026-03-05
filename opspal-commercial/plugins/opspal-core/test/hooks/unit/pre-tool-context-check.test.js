#!/usr/bin/env node

/**
 * Unit Tests for pre-tool-context-check.sh
 *
 * Validates syntax and token threshold behavior using a stubbed claude CLI.
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
  'plugins/.claude/hooks/pre-tool-context-check.sh'
);

function createClaudeStub() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-stub-'));
  const stubPath = path.join(dir, 'claude');
  fs.writeFileSync(
    stubPath,
    '#!/bin/bash\n' +
      'echo "${CLAUDE_STATUS_OUTPUT}"\n'
  );
  fs.chmodSync(stubPath, 0o755);
  return dir;
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
  console.log('\n[Tests] pre-tool-context-check.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Allows execution under threshold', async () => {
    const stubDir = createClaudeStub();
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${stubDir}:${process.env.PATH}`,
        CLAUDE_STATUS_OUTPUT: '90k/200k tokens'
      }
    });
    fs.rmSync(stubDir, { recursive: true, force: true });

    assert.strictEqual(result.status, 0, 'Should exit with 0 under threshold');
  }));

  results.push(await runTest('Blocks execution over threshold', async () => {
    const stubDir = createClaudeStub();
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${stubDir}:${process.env.PATH}`,
        CLAUDE_STATUS_OUTPUT: '120k/200k tokens'
      }
    });
    fs.rmSync(stubDir, { recursive: true, force: true });

    assert.strictEqual(result.status, 1, 'Should exit with 1 over threshold');
    assert(
      result.stdout.includes('CONTEXT WARNING'),
      'Should emit context warning'
    );
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
