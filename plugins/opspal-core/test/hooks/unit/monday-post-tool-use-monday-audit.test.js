#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-monday/hooks/post-tool-use-monday-audit.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'monday-post-tool-use-'));
}

function createPostToolInput(toolName, toolInput = {}) {
  return {
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_response: {
      success: true
    }
  };
}

function readNewestAuditEntry(tempRoot) {
  const logDir = path.join(tempRoot, '.claude', 'logs', 'hooks');
  const logFile = fs.readdirSync(logDir).find((file) => file.startsWith('monday-mcp-audit-'));
  const lines = fs.readFileSync(path.join(logDir, logFile), 'utf8').trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
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
  console.log('\n[Tests] Monday post-tool-use-monday-audit\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips non-Monday tools without stdout noise', async () => {
    const result = await tester.run({
      input: createPostToolInput('Read', { file_path: 'README.md' })
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.stdout.trim(), '', 'Non-Monday tools should not emit stdout');
  }));

  results.push(await runTest('Classifies Monday read tools as read-only', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: createPostToolInput('mcp__monday__get_items', { board_id: '123' }),
        env: {
          HOME: tempRoot,
          CLAUDE_PROJECT_ROOT: tempRoot
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Read audit path should exit cleanly');
      assert.strictEqual(result.stdout.trim(), '', 'Audit hook should keep stdout empty');

      const auditEntry = readNewestAuditEntry(tempRoot);
      assert.strictEqual(auditEntry.tool_name, 'mcp__monday__get_items', 'Should log the tool name');
      assert.strictEqual(auditEntry.classification, 'read', 'Should classify get_items as read');
      assert.strictEqual(auditEntry.mutating, false, 'Read tools should not be marked mutating');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Classifies Monday create tools as mutating and logs warning text to stderr', async () => {
    const tempRoot = createTempRoot();

    try {
      const result = await tester.run({
        input: createPostToolInput('mcp__monday__create_item', {
          board_id: '123',
          item_name: 'Quarterly plan'
        }),
        env: {
          HOME: tempRoot,
          CLAUDE_PROJECT_ROOT: tempRoot
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Mutating audit path should exit cleanly');
      assert.strictEqual(result.stdout.trim(), '', 'Audit hook should not write stdout');
      assert(result.stderr.includes('mutating operation'), 'Should record a mutating audit warning on stderr');

      const auditEntry = readNewestAuditEntry(tempRoot);
      assert.strictEqual(auditEntry.classification, 'write', 'Should classify create_item as mutating');
      assert.strictEqual(auditEntry.mutating, true, 'Mutating tools should be marked mutating');
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
