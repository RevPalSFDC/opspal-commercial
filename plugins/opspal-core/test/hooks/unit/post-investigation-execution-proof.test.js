#!/usr/bin/env node

/**
 * Unit Tests for post-investigation-execution-proof.sh
 *
 * Verifies that the execution-proof hook correctly:
 * - Detects plan-only output from investigation specialists
 * - Rejects narrative-only output even when it looks like execution evidence
 * - Skips non-investigation agents
 * - Produces structured context messages for the parent
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.resolve(__dirname, '..', '..', '..', '..', '..',
  'plugins/opspal-core/hooks/post-investigation-execution-proof.sh');

function runHook(stdinContent, env = {}) {
  const result = spawnSync('bash', [HOOK_PATH], {
    input: stdinContent,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: process.env.PATH,
      ...env
    }
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
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

async function main() {
  console.log('');
  console.log('=== Execution Proof Hook Tests ===');
  console.log('');
  const results = [];

  // --- Section 1: Skip non-investigation agents ---
  console.log('[1] Non-investigation agents are skipped');

  results.push(await runTest('skips unknown agent (no detection)', () => {
    const r = runHook('This is some generic output from a random agent with enough text to pass the length check.');
    assert.strictEqual(r.exitCode, 0);
    assert.ok(!r.stdout.includes('EXECUTION_PROOF'), 'Should not contain execution proof message');
  }));

  results.push(await runTest('skips short output', () => {
    const r = runHook('Short sfdc-automation-auditor output');
    assert.strictEqual(r.exitCode, 0);
  }));

  // --- Section 2: Narrative execution evidence still fails without receipt ---
  console.log('');
  console.log('[2] Narrative execution evidence still fails without receipt');

  results.push(await runTest('record counts without receipt fail for sfdc-automation-auditor', () => {
    const output = `sfdc-automation-auditor completed analysis.
Found 47 flows in the org.
Found 12 triggers active.
Found 89 validation rules.
Query returned totalSize: 47 with records array.
Audit methodology: all queries executed successfully with 148 records retrieved.`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(
      r.stdout.includes('INVESTIGATION_RECEIPT_REQUIRED_MISSING') ||
      r.stdout.includes('INVESTIGATION_EXECUTION_PROOF_WEAK'),
      'Narrative counts without receipt must fail proof'
    );
  }));

  results.push(await runTest('JSON markers without receipt still fail proof', () => {
    const output = `sfdc-territory-discovery completed.
Territory2Model query returned "totalSize": 3
"records": [ { "Id": "0MT..." } ]
Found 3 territory models in the org.`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(
      r.stdout.includes('INVESTIGATION_RECEIPT_REQUIRED_MISSING') ||
      r.stdout.includes('INVESTIGATION_EXECUTION_PROOF_WEAK'),
      'Receipt-less JSON snippets must fail proof'
    );
  }));

  results.push(await runTest('query error messages without receipt still fail proof', () => {
    const output = `sfdc-automation-auditor attempted investigation.
FlowDefinitionView query returned INVALID_TYPE error.
Fell back to Flow object. Found 23 records.
sObject type FlowDefinitionView is not supported in this org.`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(
      r.stdout.includes('INVESTIGATION_RECEIPT_REQUIRED_MISSING') ||
      r.stdout.includes('INVESTIGATION_EXECUTION_PROOF_WEAK'),
      'Execution-attempt narrative without receipt must fail proof'
    );
  }));

  // --- Section 3: Detect plan-only output ---
  console.log('');
  console.log('[3] Plan-only output detection');

  results.push(await runTest('detects plan-only output from sfdc-automation-auditor', () => {
    const output = `sfdc-automation-auditor analysis complete.
Here are the queries that should be executed against the org:
1. SELECT Id FROM FlowDefinitionView -- this should be run
2. SELECT Id FROM WorkflowRule -- this should be run
These queries would need to be executed to complete the investigation.
The suggested SOQL commands will inventory all automation.`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(r.stdout.includes('INVESTIGATION_EXECUTION_PROOF_MISSING') ||
              r.stdout.includes('INVESTIGATION_EXECUTION_PROOF_WEAK'),
              'Should flag plan-only output');
  }));

  results.push(await runTest('detects "should be run" language from sfdc-territory-discovery', () => {
    const output = `sfdc-territory-discovery analysis.
The following queries should be run against the production org:
SELECT Id FROM Territory2Model -- this could be executed
To investigate territory configuration, execute these SOQL queries against the org.
These steps should be performed to discover the territory hierarchy.`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(r.stdout.includes('INVESTIGATION_EXECUTION_PROOF'),
              'Should detect plan-only language');
  }));

  // --- Section 4: Anti-improvisation context message ---
  console.log('');
  console.log('[4] Parent context message content');

  results.push(await runTest('context message tells parent NOT to run queries directly', () => {
    const output = `sfdc-automation-auditor investigation.
Here are the recommended queries to run:
These queries should be executed against the production org.
The suggested approach would need to be run to get results.`;
    const r = runHook(output);
    if (r.stdout.includes('INVESTIGATION_EXECUTION_PROOF')) {
      assert.ok(r.stdout.includes('Do NOT run these queries from the parent context') ||
                r.stdout.includes('re-delegate'),
                'Context message should warn against parent execution');
    }
  }));

  // --- Section 5: Mixed output (some execution, some planning) ---
  console.log('');
  console.log('[5] Mixed execution + planning output');

  results.push(await runTest('mixed execution/planning output still fails without receipt', () => {
    const output = `sfdc-automation-auditor investigation complete.
Found 47 flows in the org. Query returned "totalSize": 47.
Success: 89 validation rules retrieved.
Note: the following additional queries could be run for deeper analysis.
These suggested queries would provide more detail.`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(
      r.stdout.includes('INVESTIGATION_RECEIPT_REQUIRED_MISSING') ||
      r.stdout.includes('INVESTIGATION_EXECUTION_PROOF_WEAK'),
      'Mixed narrative without receipt must fail deterministically'
    );
  }));

  // --- Summary ---
  console.log('');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} tests`);

  if (failed > 0) {
    console.log('');
    console.log('Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  x ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }

  process.exit(0);
}

main();
