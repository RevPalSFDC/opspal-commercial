#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  'plugins/opspal-gtm-planning/hooks/session-start-gtm-context-loader.sh'
);

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gtm-session-start-'));
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
  console.log('\n[Tests] GTM session-start context loader\n');

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
      // Hook emits {} noop JSON (preferred) or stays silent (legacy)
      const out = result.stdout.trim();
      assert(out === '' || out === '{}', 'Should emit {} noop or stay silent without ORG_SLUG');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Prints the active GTM cycle banner', async () => {
    const tempRoot = createTempRoot();
    try {
      const cycleDir = path.join(tempRoot, 'orgs/acme/platforms/gtm-planning/FY2027');
      fs.mkdirSync(cycleDir, { recursive: true });
      fs.writeFileSync(
        path.join(cycleDir, 'cycle-state.json'),
        JSON.stringify({
          current_phase: 'quota-modeling',
          status: 'active'
        }),
        'utf8'
      );

      const result = spawnSync('bash', [HOOK_PATH], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ORG_SLUG: 'acme',
          CLAUDE_PROJECT_ROOT: tempRoot
        }
      });

      assert.strictEqual(result.status, 0, 'Should exit with 0');
      // Banner text is now emitted to stderr (not stdout) to avoid "Hook output does not start with {"
      const combined = result.stdout + result.stderr;
      assert(combined.includes('GTM Planning Context: org=acme'), 'Should print the GTM context banner');
      assert(combined.includes('cycle=FY2027'), 'Should identify the active cycle');
      assert(combined.includes('phase=quota-modeling'), 'Should include the active phase');
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
