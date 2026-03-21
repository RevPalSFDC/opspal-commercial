#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-gtm-planning/hooks/pre-task-gtm-approval-gate.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createAgentInput(subagentType) {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: subagentType
    }
  };
}

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gtm-approval-gate-'));
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
  console.log('\n[Tests] GTM pre-task approval gate\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips non-GTM agents', async () => {
    const result = await tester.run({
      input: createAgentInput('opspal-core:implementation-planner')
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Should emit structured no-op JSON for non-GTM agents');
  }));

  results.push(await runTest('Blocks out-of-order GTM phases in strict mode', async () => {
    const tempRoot = createTempRoot();
    try {
      const cycleDir = path.join(tempRoot, 'orgs/acme/platforms/gtm-planning/FY2027');
      fs.mkdirSync(cycleDir, { recursive: true });
      fs.writeFileSync(
        path.join(cycleDir, 'cycle-state.json'),
        JSON.stringify({
          current_phase: 1,
          phases: {
            '1': { status: 'completed' },
            '2': { status: 'not_started' },
            '3': { status: 'not_started' },
            '4': { status: 'not_started' }
          }
        }),
        'utf8'
      );

      const result = await tester.run({
        input: createAgentInput('opspal-gtm-planning:gtm-comp-planner'),
        env: {
          ORG_SLUG: 'acme',
          CLAUDE_PROJECT_ROOT: tempRoot,
          GTM_APPROVAL_GATE_STRICT: '1',
          GTM_ACTIVE_CYCLE: 'FY2027'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Strict mode should return structured denial without shell failure');
      assert(result.stderr.includes('[GTM-GATE] BLOCKED'), 'Should explain the GTM gate block');
      assert(result.stderr.includes('Phase 2'), 'Should identify missing prerequisite phases');
      assert.strictEqual(
        result.output?.hookSpecificOutput?.permissionDecision,
        'deny',
        'Strict mode should deny out-of-order GTM agents'
      );
      assert(
        (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('GTM_APPROVAL_GATE_BLOCKED'),
        'Should expose the structured GTM approval gate reason'
      );
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
