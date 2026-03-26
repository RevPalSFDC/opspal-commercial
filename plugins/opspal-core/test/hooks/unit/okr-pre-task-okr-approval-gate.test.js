#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-okrs/hooks/pre-task-okr-approval-gate.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createAgentInput(subagentType, prompt = '') {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: subagentType,
      prompt
    }
  };
}

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'okr-approval-gate-'));
}

function writeCycleState(tempRoot, status) {
  const cycleDir = path.join(tempRoot, 'orgs', 'acme', 'platforms', 'okr', 'Q3-2026');
  fs.mkdirSync(cycleDir, { recursive: true });
  fs.writeFileSync(
    path.join(cycleDir, 'cycle-state.json'),
    JSON.stringify({
      org: 'acme',
      cycle: 'Q3-2026',
      status,
      updated_at: new Date().toISOString()
    }),
    'utf8'
  );
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
  console.log('\n[Tests] OKR pre-task approval gate\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips non-OKR agents', async () => {
    const result = await tester.run({
      input: createAgentInput('opspal-core:implementation-planner', 'Summarize the roadmap')
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Should emit structured no-op JSON for non-OKR agents');
  }));

  results.push(await runTest('Blocks reporting agents before the cycle is active in strict mode', async () => {
    const tempRoot = createTempRoot();

    try {
      writeCycleState(tempRoot, 'draft');

      const result = await tester.run({
        input: createAgentInput(
          'opspal-okrs:okr-progress-tracker',
          'Refresh status for --org acme --cycle Q3-2026'
        ),
        env: {
          HOME: tempRoot,
          CLAUDE_PROJECT_ROOT: tempRoot,
          ORG_SLUG: 'acme',
          OKR_ACTIVE_CYCLE: 'Q3-2026',
          OKR_PHASE_GATE_STRICT: '1'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Strict mode should return structured denial without shell failure');
      assert(result.stderr.includes('[OKR-GATE] BLOCKED'), 'Should explain the OKR gate block');
      assert.strictEqual(
        result.output?.hookSpecificOutput?.permissionDecision,
        'deny',
        'Inactive-cycle reporting should be denied in strict mode'
      );
      assert(
        (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('OKR_PHASE_GATE_BLOCKED'),
        'Should expose the structured OKR phase gate reason'
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Allows activation handoff agents once the cycle is approved', async () => {
    const tempRoot = createTempRoot();

    try {
      writeCycleState(tempRoot, 'approved');

      const result = await tester.run({
        input: createAgentInput(
          'opspal-okrs:okr-asana-bridge',
          'Sync approved cycle into Asana for --org acme --cycle Q3-2026'
        ),
        env: {
          HOME: tempRoot,
          CLAUDE_PROJECT_ROOT: tempRoot,
          ORG_SLUG: 'acme',
          OKR_ACTIVE_CYCLE: 'Q3-2026'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Approved-cycle handoff should be allowed');
      assert.deepStrictEqual(result.output, {}, 'Allowed OKR lifecycle steps should emit JSON no-op');
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
