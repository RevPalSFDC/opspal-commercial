#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-monday/hooks/universal-agent-governance.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'monday-agent-governance-'));
}

function createAgentInput(subagentType, prompt) {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: subagentType,
      prompt
    }
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
  console.log('\n[Tests] Monday universal-agent-governance\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips non-Monday agents', async () => {
    const result = await tester.run({
      input: createAgentInput('opspal-core:implementation-planner', 'Summarize the rollout plan')
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.deepStrictEqual(result.output, {}, 'Should emit structured no-op JSON for non-Monday agents');
  }));

  results.push(await runTest('Blocks destructive workspace-wide Monday requests', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: createAgentInput(
          'opspal-monday:monday-batch-operator',
          'Delete all items across the workspace and purge board history.'
        ),
        env: {
          HOME: tempRoot,
          CLAUDE_PROJECT_ROOT: tempRoot
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should return structured denial without shell failure');
      assert(result.stderr.includes('BLOCKED: Monday Agent Governance'), 'Should explain the governance block');
      assert.strictEqual(
        result.output?.hookSpecificOutput?.permissionDecision,
        'deny',
        'Destructive Monday requests should be denied'
      );
      assert(
        (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('MONDAY_GOVERNANCE_BLOCKED'),
        'Structured denial reason should identify Monday governance'
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Allows high-risk batch mutations with explicit approval guidance', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: createAgentInput(
          'opspal-monday:monday-batch-operator',
          'Bulk import 5000 items into board 123 and sync status values.'
        ),
        env: {
          HOME: tempRoot,
          CLAUDE_PROJECT_ROOT: tempRoot
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Approval-recommended path should exit cleanly');
      assert(result.stderr.includes('Approval Recommended'), 'Should emit approval guidance on stderr');
      assert.strictEqual(
        result.output?.hookSpecificOutput?.permissionDecision,
        'allow',
        'High-risk Monday mutations should remain allow with guidance at this phase'
      );
      assert(
        (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('MONDAY_GOVERNANCE_APPROVAL_RECOMMENDED'),
        'Structured reason should identify approval guidance'
      );

      const logDir = path.join(tempRoot, '.claude', 'logs', 'hooks');
      const logFile = fs.readdirSync(logDir).find((file) => file.startsWith('monday-agent-governance-'));
      assert(logFile, 'Should write an audit log entry');
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
