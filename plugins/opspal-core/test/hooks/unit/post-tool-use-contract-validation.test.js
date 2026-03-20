#!/usr/bin/env node

/**
 * Unit Tests for post-tool-use-contract-validation.sh
 *
 * Validates tool output checks and warning emission.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const path = require('path');
const assert = require('assert');
const fs = require('fs');
const os = require('os');

const { HookTester } = require('../runner');

// =============================================================================
// Test Configuration
// =============================================================================

const HOOK_PATH = 'plugins/opspal-core/hooks/post-tool-use-contract-validation.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');

// =============================================================================
// Test Helpers
// =============================================================================

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
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

// =============================================================================
// Tests
// =============================================================================

async function runAllTests() {
  console.log('\n[Tests] post-tool-use-contract-validation.sh Tests\n');

  const tester = createTester();
  const results = [];
  const tempHome = createTempHome();
  const tempLogRoot = path.join(tempHome, '.claude/logs');

  // Test 1: Hook validation
  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  // Test 2: Emits warnings for suspicious output
  results.push(await runTest('Warns on suspicious percentage outputs', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'sf-data-query',
        tool_input: {},
        tool_response: {
          records: [],
          totalSize: 0,
          successRate: 99
        },
        success: true
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert(
      result.stderr.includes('DATA QUALITY WARNING'),
      'Should emit data quality warning'
    );
  }));

  results.push(await runTest('Continues when preferred log root is not writable', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: { command: 'echo hello' },
        tool_response: { successRate: 42 },
        success: true
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: '/proc/1/forbidden-log-root'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should continue with fallback log root');
  }));

  results.push(await runTest('Accepts live PostToolUse input schema', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Write',
        tool_input: {
          file_path: '/tmp/test.txt',
          content: 'hello'
        },
        tool_response: {
          filePath: '/tmp/test.txt',
          success: true
        },
        success: true
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  // Cleanup
  fs.rmSync(tempHome, { recursive: true, force: true });

  // Summary
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
