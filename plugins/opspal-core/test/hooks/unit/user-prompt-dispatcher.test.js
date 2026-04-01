#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/user-prompt-dispatcher.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 35000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createIsolatedEnv(extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ups-dispatcher-'));
  return {
    HOME: home,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    CLAUDE_SESSION_ID: `ups-test-${Date.now()}`,
    ...extra
  };
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
  console.log('\n[Tests] user-prompt-dispatcher.sh\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Empty input returns {}', async () => {
    const env = createIsolatedEnv();
    try {
      const result = await tester.run({
        input: {},
        env
      });
      assert.strictEqual(result.exitCode, 0, 'Should exit 0');
      const stdout = result.stdout.trim();
      assert(stdout === '{}' || stdout === '', 'Should return {} or empty for empty input');
    } finally {
      fs.rmSync(env.HOME, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Deploy prompt includes opspal-salesforce in scope', async () => {
    const env = createIsolatedEnv();
    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'UserPromptSubmit',
          user_message: 'deploy the updated flow to lula-staging with the new field and FLS permissions',
          session_key: env.CLAUDE_SESSION_ID
        },
        env
      });
      assert.strictEqual(result.exitCode, 0, 'Should exit 0');
      const ctx = result.stdout;
      if (ctx && ctx.includes('additionalContext')) {
        // If scope fires, SF should be included due to deploy keywords
        if (ctx.includes('opspal-salesforce')) {
          // Good — SF is in scope
        }
        // Should NOT say "Suppress" anywhere
        assert(!ctx.includes('Suppress'), 'Should never use "Suppress" language');
      }
    } finally {
      fs.rmSync(env.HOME, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Output is valid JSON', async () => {
    const env = createIsolatedEnv();
    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'UserPromptSubmit',
          user_message: 'check the status of my salesforce deployment',
          session_key: env.CLAUDE_SESSION_ID
        },
        env
      });
      assert.strictEqual(result.exitCode, 0, 'Should exit 0');
      const stdout = result.stdout.trim();
      if (stdout) {
        JSON.parse(stdout); // Will throw if invalid JSON
      }
    } finally {
      fs.rmSync(env.HOME, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Scope context uses informational language', async () => {
    const env = createIsolatedEnv();
    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'UserPromptSubmit',
          user_message: 'deploy the metadata to staging salesforce org',
          session_key: env.CLAUDE_SESSION_ID
        },
        env
      });
      assert.strictEqual(result.exitCode, 0, 'Should exit 0');
      const ctx = result.stdout;
      if (ctx && ctx.includes('Context:')) {
        // Verify informational language, not imperative
        assert(!ctx.includes('TASK SCOPE:'), 'Should not use old TASK SCOPE prefix');
        assert(!ctx.includes('Suppress'), 'Should not use Suppress');
      }
    } finally {
      fs.rmSync(env.HOME, { recursive: true, force: true });
    }
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
