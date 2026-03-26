#!/usr/bin/env node

/**
 * Unit Tests for post-subagent-verification.sh
 *
 * Syntax validation + skip-path validation (safe, non-executing).
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/post-subagent-verification.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');

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
  console.log('\n[Tests] post-subagent-verification.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when verification disabled', async () => {
    const result = await tester.run({
      stdin: 'Short output',
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        SKIP_SUBAGENT_VERIFICATION: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  results.push(await runTest('Warns when cohort output lacks runbook evidence', async () => {
    const output = [
      'Routing quality degraded during execution.',
      'Dark agent detected in keyword index and sub-agent was misrouted repeatedly.',
      'Alternatives returned stale plugin cache entries.'
    ].join(' ');

    const result = await tester.run({
      stdin: output,
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        SUBAGENT_VERIFY_RUNBOOK_EVIDENCE: '1',
        SUBAGENT_VERIFY_RUNBOOK_STRICT: '0'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should remain non-blocking by default');
    assert(
      result.stdout.includes('RUNBOOK EVIDENCE WARNING'),
      'Should emit runbook evidence warning'
    );
  }));

  results.push(await runTest('Fails in strict mode when runbook evidence is missing', async () => {
    const output = [
      'SOQL schema parse issue encountered.',
      'No such column AccountId on ObjectTerritory2Association and parsing failed.'
    ].join(' ');

    const result = await tester.run({
      stdin: output,
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        SUBAGENT_VERIFY_RUNBOOK_EVIDENCE: '1',
        SUBAGENT_VERIFY_RUNBOOK_STRICT: '1'
      }
    });

    assert.notStrictEqual(result.exitCode, 0, 'Strict mode should fail without runbook evidence');
  }));

  // =========================================================================
  // Projection-loss detection tests
  // =========================================================================

  results.push(await runTest('Detects projection loss: "only has Read/Write tools"', async () => {
    const home = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'subagent-verify-'));
    const sessionId = `proj-loss-test-${Date.now()}`;
    const output = [
      'Routed to opspal-salesforce:sfdc-data-operations.',
      'That agent couldn\'t execute the Salesforce CLI command — it only has Read/Write tools.',
      'Attempting to fall back to direct execution.'
    ].join('\n');

    const result = await tester.run({
      stdin: output,
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        CLAUDE_SESSION_ID: sessionId,
        HOME: home
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit 0 (non-blocking)');
    const stdout = result.stdout || '';
    const parsed = (() => { try { return JSON.parse(stdout); } catch { return null; } })();
    const context = parsed?.hookSpecificOutput?.additionalContext || '';
    assert(
      context.includes('SUBAGENT_PROJECTION_LOSS'),
      `Should emit SUBAGENT_PROJECTION_LOSS in additionalContext, got: ${context.substring(0, 200)}`
    );
  }));

  results.push(await runTest('Detects projection loss: tool enumeration without Bash', async () => {
    const home = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'subagent-verify-'));
    const sessionId = `proj-loss-enum-${Date.now()}`;
    const output = 'The sub-agent has access to Read, Write, and TodoWrite tools but no Bash tool is available for executing CLI commands.';

    const result = await tester.run({
      stdin: output,
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        CLAUDE_SESSION_ID: sessionId,
        HOME: home
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit 0');
    const stdout = result.stdout || '';
    const parsed = (() => { try { return JSON.parse(stdout); } catch { return null; } })();
    const context = parsed?.hookSpecificOutput?.additionalContext || '';
    assert(
      context.includes('SUBAGENT_PROJECTION_LOSS') || context.includes('PROJECTION_LOSS'),
      `Should detect projection loss from tool enumeration, got: ${context.substring(0, 200)}`
    );
  }));

  results.push(await runTest('No false positive on clean output mentioning Read/Write', async () => {
    const home = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'subagent-verify-'));
    const sessionId = `proj-loss-clean-${Date.now()}`;
    const output = [
      'Successfully executed the query and returned 15 records.',
      'Used Read tool to examine the schema and Write tool to save the CSV.',
      'All operations completed without errors.'
    ].join('\n');

    const result = await tester.run({
      stdin: output,
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        CLAUDE_SESSION_ID: sessionId,
        HOME: home
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit 0');
    const stdout = result.stdout || '';
    // Should NOT contain projection loss signals
    assert(
      !stdout.includes('PROJECTION_LOSS'),
      `Clean output should not trigger projection loss detection, got: ${stdout.substring(0, 200)}`
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
