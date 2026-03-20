#!/usr/bin/env node

/**
 * Unit Tests for post-opspal-usage.sh
 *
 * Validates usage tracking warnings and structured PostToolUse output.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-mcp-client/hooks/post-opspal-usage.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 10000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'post-opspal-usage-home-'));
}

function currentLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function seedUsageFile(homeDir, calls) {
  const usageDir = path.join(homeDir, '.claude', 'api-limits');
  const usageFile = path.join(usageDir, 'opspal-daily.json');

  fs.mkdirSync(usageDir, { recursive: true });
  fs.writeFileSync(usageFile, JSON.stringify({
    date: currentLocalDate(),
    calls,
    tools: {
      score_customer_health: calls
    }
  }), 'utf8');
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
  console.log('\n[Tests] post-opspal-usage.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Stays silent below warning threshold', async () => {
    const homeDir = createTempHome();

    try {
      seedUsageFile(homeDir, 10);

      const result = await tester.run({
        input: {
          hook_event_name: 'PostToolUse',
          tool_name: 'mcp__opspal__score_customer_health'
        },
        env: {
          HOME: homeDir,
          OPSPAL_TIER: 'free'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.stdout.trim(), '', 'Should not emit output below the warning threshold');
      assert.strictEqual(result.output, null, 'Should not emit a JSON payload below the warning threshold');
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Emits structured PostToolUse warning at 80% daily usage', async () => {
    const homeDir = createTempHome();

    try {
      seedUsageFile(homeDir, 39);

      const result = await tester.run({
        input: {
          hook_event_name: 'PostToolUse',
          tool_name: 'mcp__opspal__score_customer_health'
        },
        env: {
          HOME: homeDir,
          OPSPAL_TIER: 'free'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.parseError, null, 'Should emit valid JSON for PostToolUse');
      assert.strictEqual(result.output.suppressOutput, true, 'Should suppress verbose stdout noise');
      assert.strictEqual(result.output.hookSpecificOutput.hookEventName, 'PostToolUse', 'Should target PostToolUse');
      assert(
        result.output.hookSpecificOutput.additionalContext.includes('80% of daily budget used (40/50)'),
        'Should surface the threshold warning in additionalContext'
      );
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
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
