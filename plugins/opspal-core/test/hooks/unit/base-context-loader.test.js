#!/usr/bin/env node

/**
 * Unit Tests for base-context-loader.sh
 *
 * Validates syntax, strict-mode guardrails, and safe cache path usage.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = 'plugins/opspal-core/hooks/context-loader/base-context-loader.sh';
const HOOK_FILE_PATH = path.join(PROJECT_ROOT, HOOK_PATH);
const CACHE_FILE = '/tmp/platform-context.json';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, contents: null };
  }
  return { exists: true, contents: fs.readFileSync(filePath, 'utf8') };
}

function restoreFile(filePath, backup) {
  if (backup.exists) {
    fs.writeFileSync(filePath, backup.contents, 'utf8');
  } else if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
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
  console.log('\n[Tests] base-context-loader.sh Tests\n');

  const tester = createTester();
  const results = [];
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-context-home-'));
  const cacheBackup = backupFile(CACHE_FILE);

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Uses /tmp for cache file', async () => {
    const contents = fs.readFileSync(HOOK_FILE_PATH, 'utf8');
    assert(
      contents.includes('CACHE_FILE="/tmp/platform-context.json"'),
      'Cache file should be scoped to /tmp/platform-context.json'
    );
  }));

  results.push(await runTest('Returns empty JSON when platform unknown', async () => {
    const result = await tester.run({
      input: {},
      env: {
        HOME: tempHome,
        CONTEXT_CACHE_TTL: '0',
        CONTEXT_STRICT: '0',
        CONTEXT_VERBOSE: '0',
        SF_TARGET_ORG: '',
        SFDX_DEFAULTUSERNAME: '',
        HUBSPOT_PORTAL_ID: '',
        HUBSPOT_PORTAL_NAME: '',
        MARKETO_CLIENT_ID: '',
        MARKETO_INSTANCE: ''
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Should return empty JSON output');
  }));

  results.push(await runTest('Strict mode blocks unknown platform', async () => {
    const result = await tester.run({
      input: {},
      env: {
        HOME: tempHome,
        CONTEXT_CACHE_TTL: '0',
        CONTEXT_STRICT: '1',
        CONTEXT_VERBOSE: '0',
        SF_TARGET_ORG: '',
        SFDX_DEFAULTUSERNAME: '',
        HUBSPOT_PORTAL_ID: '',
        HUBSPOT_PORTAL_NAME: '',
        MARKETO_CLIENT_ID: '',
        MARKETO_INSTANCE: ''
      }
    });

    assert.strictEqual(result.exitCode, 1, 'Should exit with 1 when strict mode blocks');
    assert(
      result.stderr.includes('No platform context detected'),
      'Should report strict mode platform detection failure'
    );
  }));

  restoreFile(CACHE_FILE, cacheBackup);
  fs.rmSync(tempHome, { recursive: true, force: true });

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`
Results: ${passed} passed, ${failed} failed
`);

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
