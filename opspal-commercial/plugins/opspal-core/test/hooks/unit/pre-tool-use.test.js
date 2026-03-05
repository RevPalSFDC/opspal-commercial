#!/usr/bin/env node

/**
 * Unit Tests for pre-tool-use.sh
 *
 * Validates disallowedTools enforcement for Task tool invocations.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/pre-tool-use.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
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
  console.log('\n[Tests] pre-tool-use.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips non-Task tool', async () => {
    const result = await tester.run({
      input: {
        tool: 'ReadFile',
        parameters: {}
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  results.push(await runTest('Allows Task when no agent specified', async () => {
    const result = await tester.run({
      input: {
        tool: 'Task',
        parameters: {}
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  results.push(await runTest('Blocks agent with disallowed tools', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-tool-use-'));
    const agentDir = path.join(tempRoot, 'agents');
    fs.mkdirSync(agentDir, { recursive: true });

    const agentPath = path.join(agentDir, 'test-agent.md');
    fs.writeFileSync(
      agentPath,
      [
        '---',
        'name: Test Agent',
        'tools: Bash',
        'disallowedTools:',
        '  - Bash',
        '---',
        '',
        'Test agent body.',
        ''
      ].join('\n'),
      'utf8'
    );

    try {
      const result = await tester.run({
        input: {
          tool: 'Task',
          parameters: { subagent_type: 'test-agent' }
        },
        env: {
          CLAUDE_PLUGIN_ROOT: tempRoot
        }
      });

      assert.strictEqual(result.exitCode, 1, 'Should block with exit code 1');
      assert(result.output && result.output.blocked === true, 'Should set blocked true');
      assert(result.output && result.output.agent === 'test-agent', 'Should echo agent name');
      assert(result.output && result.output.violationCount === 1, 'Should record violation count');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

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
