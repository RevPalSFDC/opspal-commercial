#!/usr/bin/env node

/**
 * Unit Tests for pre-task-work-context.sh
 *
 * Syntax validation + skip-path validation (safe, non-executing).
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/hooks/pre-task-work-context.sh');

function createTester() {
  return new HookTester('plugins/opspal-core/hooks/pre-task-work-context.sh', {
    timeout: 10000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createAgentEvent(toolInput = {}) {
  return {
    tool_name: 'Agent',
    tool_input: toolInput
  };
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
  console.log('\n[Tests] pre-task-work-context.sh Tests\n');

  const results = [];
  const tester = createTester();

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when work context disabled', async () => {
    const result = await tester.run({
      input: createAgentEvent({ subagent_type: 'sfdc-object-auditor' }),
      env: { WORK_CONTEXT_ENABLED: '0' }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Disabled hook should emit a no-op response');
    assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
  }));

  results.push(await runTest('Skips when no org context is available', async () => {
    const result = await tester.run({
      input: createAgentEvent({ subagent_type: 'sfdc-object-auditor', prompt: 'Inspect metadata' }),
      env: { WORK_CONTEXT_ENABLED: '1' }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'No org context should produce a no-op response');
    assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
  }));

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
