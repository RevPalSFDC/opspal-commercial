#!/usr/bin/env node

/**
 * Unit Tests for session-end.sh
 *
 * Validates syntax, skip guards, and safe cleanup path usage.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = 'plugins/opspal-core/hooks/session-end.sh';
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
  console.log('\n[Tests] session-end.sh Tests\n');

  const tester = createTester();
  const results = [];
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-session-end-home-'));
  const cacheBackup = backupFile(CACHE_FILE);

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skip guards are present', async () => {
    const contents = fs.readFileSync(HOOK_FILE_PATH, 'utf8');
    assert(
      contents.includes('SKIP_SCRATCHPAD'),
      'Expected SKIP_SCRATCHPAD guard to exist'
    );
    assert(
      contents.includes('SKIP_CLEANUP'),
      'Expected SKIP_CLEANUP guard to exist'
    );
  }));

  results.push(await runTest('Cleanup targets only /tmp paths', async () => {
    const contents = fs.readFileSync(HOOK_FILE_PATH, 'utf8');
    const rmLines = contents
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('rm '));

    rmLines.forEach(line => {
      assert(
        line.includes('/tmp/'),
        `Expected cleanup rm to target /tmp paths, saw: ${line}`
      );
    });

    const findLines = contents
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('find '));

    findLines.forEach(line => {
      assert(
        line.startsWith('find /tmp '),
        `Expected cleanup find to target /tmp, saw: ${line}`
      );
      assert(
        line.includes('-delete'),
        `Expected cleanup find to use -delete, saw: ${line}`
      );
    });
  }));

  results.push(await runTest('Skips scratchpad and cleanup when configured', async () => {
    const result = await tester.run({
      input: {},
      env: {
        HOME: tempHome,
        SKIP_SCRATCHPAD: '1',
        SKIP_CLEANUP: '1',
        DETECTED_PLATFORM: 'unknown'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Should return empty JSON output');
  }));

  results.push(await runTest('Redirects scratchpad child stdout away from hook stdout', async () => {
    const scratchpadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-session-end-scratchpad-'));
    fs.writeFileSync(
      path.join(scratchpadDir, 'state.json'),
      JSON.stringify({
        metadata: {}
      }, null, 2),
      'utf8'
    );

    try {
      const result = await tester.run({
        input: {},
        env: {
          HOME: tempHome,
          SKIP_CLEANUP: '1',
          DETECTED_PLATFORM: 'unknown',
          CLAUDE_SESSION_ID: 'session-end-json-contract',
          CLAUDE_SCRATCHPAD_DIR: scratchpadDir
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
      assert.deepStrictEqual(result.output, {}, 'Should preserve JSON-only stdout even when scratchpad saver runs');
    } finally {
      fs.rmSync(scratchpadDir, { recursive: true, force: true });
    }
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
