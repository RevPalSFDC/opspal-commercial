#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/session-start-dispatcher.sh';
const PLUGIN_ROOT = path.resolve(__dirname, '../../../../..');

function createTester() {
  return new HookTester(HOOK_PATH, { timeout: 30000, verbose: process.env.VERBOSE === '1' });
}

async function runTest(name, fn) {
  process.stdout.write('  ' + name + '... ');
  try { await fn(); console.log('OK'); return { passed: true, name }; }
  catch (e) { console.log('FAIL'); console.log('    Error: ' + e.message); return { passed: false, name }; }
}

async function runAllTests() {
  console.log('\n[Tests] session-start-dispatcher.sh\n');
  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const v = tester.validate();
    assert(v.exists, 'Hook file should exist');
    assert(v.executable, 'Hook should be executable');
    assert(v.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Empty input returns {}', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'session-start-dispatcher-'));
    try {
      const result = await tester.run({ input: {}, env: { HOME: home, CLAUDE_PLUGIN_ROOT: path.join(PLUGIN_ROOT, 'plugins/opspal-core') } });
      assert.strictEqual(result.exitCode, 0);
      const stdout = result.stdout.trim();
      assert(stdout === '{}' || stdout === '', 'Should return {} or empty');
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed\n');
  if (failed > 0) process.exit(1);
}

runAllTests().catch(e => { console.error('Test runner error:', e); process.exit(1); });
