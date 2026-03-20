#!/usr/bin/env node

/**
 * Unit Tests for pre-operation-data-validator.sh
 *
 * Validates data-operation detection and safe exits.
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

const HOOK_PATH = 'plugins/opspal-core/hooks/pre-operation-data-validator.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');

// =============================================================================
// Test Helpers
// =============================================================================

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 20000,
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
  console.log('\n[Tests] pre-operation-data-validator.sh Tests\n');

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

  // Test 2: Non-data operation exits cleanly
  results.push(await runTest('Skips non-data operations', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: { command: 'ls -la' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  // Test 3: Basic data write passes validation
  results.push(await runTest('Validates simple JSON data write', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Write',
        tool_input: {
          file_path: 'data.json',
          content: '{"foo":"bar"}'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        DATA_VALIDATION_ENABLED: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  results.push(await runTest('Falls back when preferred log root is not writable', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Write',
        tool_input: {
          file_path: 'data.json',
          content: '{\"foo\":\"bar\"}'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: '/proc/1/forbidden-log-root',
        DATA_VALIDATION_ENABLED: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should continue with fallback logging');
  }));

  results.push(await runTest('Blocks merge operations with insufficient decision sample', async () => {
    const decisionsFile = path.join(tempHome, 'merge-decisions-small.json');
    fs.writeFileSync(decisionsFile, JSON.stringify({
      decisions: [
        { pair_id: 'pair-1', decision: 'APPROVE', match_confidence: 0.96 }
      ]
    }, null, 2));

    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'node plugins/opspal-salesforce/scripts/lib/bulk-merge-executor.js --org test --decisions ' + decisionsFile + ' --dry-run'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        DATA_VALIDATION_ENABLED: '1',
        DATA_VALIDATION_MERGE_MIN_SAMPLE_SIZE: '2'
      }
    });

    assert.strictEqual(result.exitCode, 1, 'Should block merge with insufficient sample size');
  }));

  results.push(await runTest('Blocks low-confidence merge decisions', async () => {
    const decisionsFile = path.join(tempHome, 'merge-decisions-low-confidence.json');
    fs.writeFileSync(decisionsFile, JSON.stringify({
      decisions: [
        { pair_id: 'pair-1', decision: 'APPROVE', match_confidence: 0.52 },
        { pair_id: 'pair-2', decision: 'APPROVE', match_confidence: 0.61 }
      ]
    }, null, 2));

    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'node plugins/opspal-salesforce/scripts/lib/bulk-merge-executor.js --org test --decisions ' + decisionsFile + ' --dry-run'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        DATA_VALIDATION_ENABLED: '1',
        DATA_VALIDATION_MERGE_MIN_SAMPLE_SIZE: '2',
        DATA_VALIDATION_MERGE_MIN_CONFIDENCE: '0.80'
      }
    });

    assert.strictEqual(result.exitCode, 1, 'Should block merge with low confidence');
  }));

  results.push(await runTest('Allows merge decisions that meet confidence threshold', async () => {
    const decisionsFile = path.join(tempHome, 'merge-decisions-high-confidence.json');
    fs.writeFileSync(decisionsFile, JSON.stringify({
      decisions: [
        { pair_id: 'pair-1', decision: 'APPROVE', match_confidence: 0.91 },
        { pair_id: 'pair-2', decision: 'APPROVE', match_confidence: 0.94 }
      ]
    }, null, 2));

    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'node plugins/opspal-salesforce/scripts/lib/bulk-merge-executor.js --org test --decisions ' + decisionsFile + ' --dry-run'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        DATA_VALIDATION_ENABLED: '1',
        DATA_VALIDATION_MERGE_MIN_SAMPLE_SIZE: '2',
        DATA_VALIDATION_MERGE_MIN_CONFIDENCE: '0.80'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should allow merge when confidence meets threshold');
  }));

  results.push(await runTest('Recognizes live Agent payloads without schema errors', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Agent',
        tool_input: {
          subagent_type: 'opspal-salesforce:sfdc-data-operations'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        DATA_VALIDATION_ENABLED: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Live Agent payloads should parse cleanly');
    assert.strictEqual(result.parseError, null, 'Hook should not emit malformed output');
  }));

  results.push(await runTest('Ignores legacy Task payloads on the live path', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'opspal-salesforce:sfdc-data-operations'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        DATA_VALIDATION_ENABLED: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Legacy Task payload should be ignored safely');
    assert.strictEqual(result.parseError, null, 'Hook should remain well-formed');
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
