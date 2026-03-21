#!/usr/bin/env node

/**
 * Unit Tests for pre-task-graph-trigger.sh
 *
 * Syntax validation + skip-path validation (safe, non-executing).
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/hooks/pre-task-graph-trigger.sh');

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
  console.log('\n[Tests] pre-task-graph-trigger.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when task graph disabled', async () => {
    const result = spawnSync('bash', [HOOK_PATH, 'Review the integration plan for this complex migration.'], {
      encoding: 'utf8',
      env: { ...process.env, TASK_GRAPH_ENABLED: '0' }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert.strictEqual(result.stdout.trim(), '{}', 'Should emit JSON no-op output');
  }));

  results.push(await runTest('Continues when primary log path is not writable', async () => {
    const result = spawnSync('bash', [HOOK_PATH, '[SIMPLE] Keep this direct and quick.'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_HOOK_LOG_ROOT: '/proc/1/forbidden-log-root',
        TASK_GRAPH_ENABLED: '1'
      }
    });

    assert.strictEqual(result.status, 0, 'Should continue via fallback log path');
  }));

  results.push(await runTest('Routes formatter output to stderr and keeps stdout JSON-only', async () => {
    const result = spawnSync('bash', [HOOK_PATH, '[SEQUENTIAL] Decompose this task into a plan.'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TASK_GRAPH_ENABLED: '1'
      }
    });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert.strictEqual(result.stdout.trim(), '{}', 'Should keep stdout as JSON-only noop output');
    assert(result.stderr.length > 0, 'Should route formatter output to stderr');
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
