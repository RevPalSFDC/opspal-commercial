#!/usr/bin/env node

/**
 * Unit Tests for prereq-check.sh (AI Consult)
 *
 * Validates prerequisite checks with stubbed binaries.
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
  'plugins/opspal-ai-consult/scripts/lib/prereq-check.sh'
);

function createStubBin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-consult-prereq-'));
  const writeStub = (name, body) => {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, body);
    fs.chmodSync(filePath, 0o755);
  };

  writeStub('node', '#!/bin/bash\necho v20.0.0\n');
  writeStub('gemini', '#!/bin/bash\necho gemini 1.0.0\n');

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
  console.log('\n[Tests] prereq-check.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Fails when GEMINI_API_KEY missing', async () => {
    const stubDir = createStubBin();
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${stubDir}:${process.env.PATH}`,
        GEMINI_API_KEY: ''
      }
    });

    fs.rmSync(stubDir, { recursive: true, force: true });

    assert.strictEqual(result.status, 1, 'Should exit with 1');
    assert(
      result.stdout.includes('prerequisite(s) missing'),
      'Should report missing prerequisites'
    );
  }));

  results.push(await runTest('Succeeds when prerequisites set', async () => {
    const stubDir = createStubBin();
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${stubDir}:${process.env.PATH}`,
        GEMINI_API_KEY: 'abcd1234efgh'
      }
    });

    fs.rmSync(stubDir, { recursive: true, force: true });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert(
      result.stdout.includes('All prerequisites met'),
      'Should report success'
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
