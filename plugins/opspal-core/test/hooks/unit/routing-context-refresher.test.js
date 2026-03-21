#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/routing-context-refresher.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 10000,
    verbose: process.env.VERBOSE === '1'
  });
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
  console.log('\n[Tests] routing-context-refresher.sh\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Skips periodic refresh for detailed platform-specific prompts', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-refresh-specific-'));
    const user = `routing-refresh-specific-${Date.now()}`;

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'UserPromptSubmit',
          message: 'Audit Salesforce flow deployment blockers in staging and validate force-app metadata paths.'
        },
        env: {
          HOME: home,
          USER: user,
          ROUTING_REFRESH_INTERVAL: '1'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.deepStrictEqual(result.output, {}, 'Should not inject redundant routing context for a detailed prompt');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(`/tmp/.routing-refresh-counter-${user}`, { force: true });
    }
  }));

  results.push(await runTest('Injects periodic refresh for generic continuation prompts', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-refresh-generic-'));
    const user = `routing-refresh-generic-${Date.now()}`;

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'UserPromptSubmit',
          message: 'continue'
        },
        env: {
          HOME: home,
          USER: user,
          ROUTING_REFRESH_INTERVAL: '1'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
      assert.strictEqual(result.output?.hookSpecificOutput?.hookEventName, 'UserPromptSubmit', 'Should target UserPromptSubmit');
      assert(result.output?.hookSpecificOutput?.additionalContext, 'Should inject condensed routing context');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(`/tmp/.routing-refresh-counter-${user}`, { force: true });
    }
  }));

  results.push(await runTest('Always injects after compaction even for specific prompts', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-refresh-compaction-'));
    const sentinelDir = path.join(home, '.claude', 'session-context');
    fs.mkdirSync(sentinelDir, { recursive: true });
    fs.writeFileSync(path.join(sentinelDir, '.needs-routing-refresh'), '1\n', 'utf8');

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'UserPromptSubmit',
          message: 'Deploy Salesforce quick actions from force-app/layouts only.'
        },
        env: {
          HOME: home,
          ROUTING_REFRESH_INTERVAL: '0'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert(result.output?.hookSpecificOutput?.additionalContext, 'Should inject after compaction sentinel is set');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
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
