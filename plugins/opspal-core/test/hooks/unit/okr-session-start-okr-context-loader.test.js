#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  'plugins/opspal-okrs/hooks/session-start-okr-context-loader.sh'
);

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'okr-session-start-'));
}

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false, name, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] OKR session-start context loader\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when ORG_SLUG is not set', async () => {
    const tempRoot = createTempRoot();
    try {
      const result = spawnSync('bash', [HOOK_PATH], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CLAUDE_PROJECT_ROOT: tempRoot
        }
      });

      assert.strictEqual(result.status, 0, 'Should exit with 0');
      assert.strictEqual(result.stdout.trim(), '', 'Should not emit output without ORG_SLUG');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Prints the active OKR cycle banner', async () => {
    const tempRoot = createTempRoot();
    try {
      const approvedDir = path.join(tempRoot, 'orgs/acme/platforms/okr/FY2027/approved');
      fs.mkdirSync(approvedDir, { recursive: true });
      fs.writeFileSync(path.join(approvedDir, 'company-okrs.md'), '# Approved OKRs\n', 'utf8');

      const result = spawnSync('bash', [HOOK_PATH], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ORG_SLUG: 'acme',
          CLAUDE_PROJECT_ROOT: tempRoot
        }
      });

      assert.strictEqual(result.status, 0, 'Should exit with 0');
      assert(result.stdout.includes('OKR Context: org=acme'), 'Should print the OKR context banner');
      assert(result.stdout.includes('active_cycle=FY2027'), 'Should identify the active cycle');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
