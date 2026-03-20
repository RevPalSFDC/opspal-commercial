#!/usr/bin/env node

/**
 * Unit Tests for post-assessment-work-index.sh
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
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/hooks/post-assessment-work-index.sh');

function createTester() {
  return new HookTester('plugins/opspal-core/hooks/post-assessment-work-index.sh', {
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
  } catch (e) {
    console.log('FAIL');
    console.log(`    Error: ${e.message}`);
    return { passed: false, name, error: e.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] post-assessment-work-index.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when auto-capture disabled', async () => {
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      env: { ...process.env, WORK_INDEX_AUTO_CAPTURE: '0' }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
  }));

  results.push(await runTest('Stays silent for non-whitelisted Agent completions', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Agent',
        tool_input: {
          description: 'Hook smoke test',
          prompt: 'Run the hook smoke test validation.',
          subagent_type: 'opspal-core:hook-smoke-agent'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.stdout.trim(), '', 'Should not emit hook output for non-whitelisted agents by default');
    assert.strictEqual(result.stderr.trim(), '', 'Should not emit stderr warnings for non-whitelisted agents by default');
  }));

  results.push(await runTest('Emits structured PostToolUse context when ORG_SLUG is missing for a tracked agent', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PostToolUse',
        agent_name: 'sfdc-cpq-assessor',
        tool_name: 'Agent',
        tool_input: {
          subagent_type: 'opspal-salesforce:sfdc-cpq-assessor'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON output');
    assert.strictEqual(result.output.suppressOutput, true, 'Should suppress verbose stdout noise');
    assert.strictEqual(result.output.hookSpecificOutput.hookEventName, 'PostToolUse', 'Should target PostToolUse');
    assert(
      result.output.hookSpecificOutput.additionalContext.includes('ORG_SLUG'),
      'Should surface the missing ORG_SLUG guidance in additionalContext'
    );
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
