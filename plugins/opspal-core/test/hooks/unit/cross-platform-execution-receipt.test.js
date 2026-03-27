#!/usr/bin/env node

/**
 * Cross-Platform Execution Receipt Tests
 *
 * Verifies:
 * - execution-receipt.js is accessible from opspal-core (canonical location)
 * - mcp-investigation-fan-out.js generates valid receipts
 * - Proof hook covers HubSpot and Marketo agents
 * - Salesforce re-export still works
 * - Receipt verification is platform-agnostic
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const CORE_LIB = path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib');
const SF_LIB = path.join(PROJECT_ROOT, 'plugins/opspal-salesforce/scripts/lib');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/hooks/post-investigation-execution-proof.sh');

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

function runHook(stdinContent) {
  const result = spawnSync('bash', [HOOK_PATH], {
    input: stdinContent,
    encoding: 'utf8',
    env: { ...process.env, PATH: process.env.PATH }
  });
  return { exitCode: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

async function main() {
  console.log('');
  console.log('=== Cross-Platform Execution Receipt Tests ===');
  console.log('');
  const results = [];

  // --- Section 1: Shared library accessibility ---
  console.log('[1] Shared library in opspal-core');

  results.push(await runTest('execution-receipt.js exists in opspal-core', () => {
    assert.ok(fs.existsSync(path.join(CORE_LIB, 'execution-receipt.js')));
  }));

  results.push(await runTest('mcp-investigation-fan-out.js exists in opspal-core', () => {
    assert.ok(fs.existsSync(path.join(CORE_LIB, 'mcp-investigation-fan-out.js')));
  }));

  results.push(await runTest('core execution-receipt.js is loadable', () => {
    const lib = require(path.join(CORE_LIB, 'execution-receipt.js'));
    assert.ok(typeof lib.generateReceipt === 'function');
    assert.ok(typeof lib.verifyReceipt === 'function');
    assert.ok(typeof lib.formatReceiptBlock === 'function');
    assert.ok(typeof lib.extractReceiptFromOutput === 'function');
  }));

  results.push(await runTest('salesforce re-export resolves to core library', () => {
    const sfLib = require(path.join(SF_LIB, 'execution-receipt.js'));
    assert.ok(typeof sfLib.generateReceipt === 'function');
    assert.ok(typeof sfLib.verifyReceipt === 'function');
  }));

  // --- Section 2: MCP fan-out receipt generation ---
  console.log('');
  console.log('[2] MCP investigation fan-out');

  const { buildMcpInvestigationReceipt, verifyMcpReceipt } = require(path.join(CORE_LIB, 'mcp-investigation-fan-out.js'));

  results.push(await runTest('generates HubSpot receipt from MCP results', () => {
    const result = buildMcpInvestigationReceipt({
      platform: 'hubspot',
      orgIdentifier: 'portal-12345',
      helper: 'hubspot-assessment-analyzer',
      branches: [
        { name: 'contacts', success: true, recordCount: 250, tool: 'hubspot_search' },
        { name: 'deals', success: true, recordCount: 100, tool: 'hubspot_search' }
      ]
    });
    assert.ok(result.receipt);
    assert.ok(result.receiptBlock);
    assert.strictEqual(result.status, 'complete');
    assert.strictEqual(result.platform, 'hubspot');
    assert.ok(result.receipt.integrityHash.startsWith('sha256:'));
  }));

  results.push(await runTest('generates Marketo receipt from MCP results', () => {
    const result = buildMcpInvestigationReceipt({
      platform: 'marketo',
      orgIdentifier: 'mkt-instance-001',
      helper: 'marketo-automation-auditor',
      branches: [
        { name: 'campaigns', success: true, recordCount: 45, tool: 'campaign_list' },
        { name: 'programs', success: true, recordCount: 30, tool: 'program_list' },
        { name: 'smart_lists', success: false, recordCount: 0, error: 'API rate limit', tool: 'smart_list_list' }
      ]
    });
    assert.strictEqual(result.status, 'partial');
    assert.strictEqual(result.succeededCount, 2);
    assert.strictEqual(result.failedCount, 1);
  }));

  results.push(await runTest('MCP receipt passes verification', () => {
    const result = buildMcpInvestigationReceipt({
      platform: 'hubspot',
      orgIdentifier: 'portal-99',
      helper: 'test',
      branches: [{ name: 'test', success: true, recordCount: 5, tool: 'test_tool' }]
    });
    const v = verifyMcpReceipt(result.receipt);
    assert.strictEqual(v.valid, true);
    assert.strictEqual(v.classification, 'valid_complete');
  }));

  results.push(await runTest('tampered MCP receipt fails verification', () => {
    const result = buildMcpInvestigationReceipt({
      platform: 'marketo',
      orgIdentifier: 'test',
      helper: 'test',
      branches: [{ name: 'test', success: true, recordCount: 10, tool: 'test' }]
    });
    // Tamper via serialization round-trip
    let json = JSON.stringify(result.receipt);
    json = json.replace('"succeeded":1', '"succeeded":99');
    const tampered = JSON.parse(json);
    const v = verifyMcpReceipt(tampered);
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.classification, 'tampered_receipt');
  }));

  // --- Section 3: Proof hook agent coverage ---
  console.log('');
  console.log('[3] Proof hook cross-platform agent coverage');

  const hookSource = fs.readFileSync(HOOK_PATH, 'utf8');

  results.push(await runTest('hook covers hubspot-assessment-analyzer', () => {
    assert.ok(hookSource.includes('hubspot-assessment-analyzer'));
  }));

  results.push(await runTest('hook covers hubspot-workflow-auditor', () => {
    assert.ok(hookSource.includes('hubspot-workflow-auditor'));
  }));

  results.push(await runTest('hook covers marketo-automation-auditor', () => {
    assert.ok(hookSource.includes('marketo-automation-auditor'));
  }));

  results.push(await runTest('hook covers marketo-instance-discovery', () => {
    assert.ok(hookSource.includes('marketo-instance-discovery'));
  }));

  results.push(await runTest('hook covers marketo-analytics-assessor', () => {
    assert.ok(hookSource.includes('marketo-analytics-assessor'));
  }));

  results.push(await runTest('hook covers marketo-lead-quality-assessor', () => {
    assert.ok(hookSource.includes('marketo-lead-quality-assessor'));
  }));

  results.push(await runTest('hook resolves receipt lib from opspal-core first', () => {
    assert.ok(hookSource.includes('${PLUGIN_ROOT}/scripts/lib'));
    // Core path should be checked before salesforce path
    const coreIdx = hookSource.indexOf('${PLUGIN_ROOT}/scripts/lib');
    const sfIdx = hookSource.indexOf('opspal-salesforce/scripts/lib');
    assert.ok(coreIdx < sfIdx, 'Core path should be resolved before SF path');
  }));

  results.push(await runTest('hook has HubSpot heuristic patterns', () => {
    assert.ok(hookSource.includes('paginationToken') || hookSource.includes('"total"'));
  }));

  results.push(await runTest('hook has Marketo heuristic patterns', () => {
    assert.ok(hookSource.includes('MARKETO_ERROR') || hookSource.includes('moreResult'));
  }));

  // --- Section 4: Agent contract verification ---
  console.log('');
  console.log('[4] Agent execution-completion contracts');

  results.push(await runTest('core shared execution-completion-contract.md exists', () => {
    assert.ok(fs.existsSync(path.join(PROJECT_ROOT, 'plugins/opspal-core/agents/shared/execution-completion-contract.md')));
  }));

  const hsAgent = fs.readFileSync(path.join(PROJECT_ROOT, 'plugins/opspal-hubspot/agents/hubspot-assessment-analyzer.md'), 'utf8');
  results.push(await runTest('hubspot-assessment-analyzer imports execution contract', () => {
    assert.ok(hsAgent.includes('execution-completion-contract'));
  }));

  const mkAutoAgent = fs.readFileSync(path.join(PROJECT_ROOT, 'plugins/opspal-marketo/agents/marketo-automation-auditor.md'), 'utf8');
  results.push(await runTest('marketo-automation-auditor imports execution contract', () => {
    assert.ok(mkAutoAgent.includes('execution-completion-contract'));
  }));

  const mkDiscAgent = fs.readFileSync(path.join(PROJECT_ROOT, 'plugins/opspal-marketo/agents/marketo-instance-discovery.md'), 'utf8');
  results.push(await runTest('marketo-instance-discovery imports execution contract', () => {
    assert.ok(mkDiscAgent.includes('execution-completion-contract'));
  }));

  // --- Section 5: Hook behavior with MCP receipts ---
  console.log('');
  console.log('[5] Hook behavior with HubSpot/Marketo receipts');

  const { formatReceiptBlock } = require(path.join(CORE_LIB, 'execution-receipt.js'));

  results.push(await runTest('valid HubSpot receipt passes hook', () => {
    const result = buildMcpInvestigationReceipt({
      platform: 'hubspot',
      orgIdentifier: 'portal-123',
      helper: 'hubspot-assessment-analyzer',
      branches: [
        { name: 'contacts', success: true, recordCount: 250, tool: 'hubspot_search' },
        { name: 'deals', success: true, recordCount: 100, tool: 'hubspot_search' }
      ]
    });
    const output = `hubspot-assessment-analyzer completed assessment.\n${result.receiptBlock}\n`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(!r.stdout.includes('RECEIPT_INVALID'));
    assert.ok(!r.stdout.includes('PROOF_MISSING'));
  }));

  results.push(await runTest('valid Marketo receipt passes hook', () => {
    const result = buildMcpInvestigationReceipt({
      platform: 'marketo',
      orgIdentifier: 'mkt-001',
      helper: 'marketo-automation-auditor',
      branches: [
        { name: 'campaigns', success: true, recordCount: 45, tool: 'campaign_list' },
        { name: 'programs', success: true, recordCount: 30, tool: 'program_list' }
      ]
    });
    const output = `marketo-automation-auditor completed audit.\n${result.receiptBlock}\n`;
    const r = runHook(output);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(!r.stdout.includes('RECEIPT_INVALID'));
  }));

  results.push(await runTest('plan-only HubSpot output without receipt fails', () => {
    const output = `hubspot-assessment-analyzer analysis complete.
Here are the queries that should be executed against the portal:
1. hubspot_search contacts -- this should be run
2. hubspot_search deals -- this should be run
These queries would need to be executed to complete the investigation.`;
    const r = runHook(output);
    assert.ok(r.stdout.includes('EXECUTION_PROOF'));
  }));

  // --- Section 6: CLI receipt generation adapter ---
  console.log('');
  console.log('[6] CLI receipt generation adapter');

  results.push(await runTest('CLI generate mode produces valid receipt block', () => {
    const input = JSON.stringify({
      platform: 'marketo',
      orgIdentifier: 'mkt-test',
      helper: 'marketo-instance-discovery',
      branches: [
        { name: 'programs', success: true, recordCount: 30, tool: 'program_list' },
        { name: 'campaigns', success: true, recordCount: 45, tool: 'campaign_list' }
      ]
    });
    const cliPath = path.join(CORE_LIB, 'mcp-investigation-fan-out.js');
    const result = spawnSync('node', [cliPath, 'generate'], {
      input,
      encoding: 'utf8',
      env: { ...process.env, PATH: process.env.PATH }
    });
    assert.strictEqual(result.status, 0, `CLI should exit 0: ${result.stderr}`);
    assert.ok(result.stdout.includes('EXECUTION_RECEIPT_V1'), 'Should contain receipt marker');

    // Verify the block is extractable and valid
    const { extractReceiptFromOutput, verifyReceipt } = require(path.join(CORE_LIB, 'execution-receipt.js'));
    const extracted = extractReceiptFromOutput(result.stdout);
    assert.ok(extracted, 'Receipt should be extractable');
    const v = verifyReceipt(extracted);
    assert.strictEqual(v.valid, true, `Receipt should be valid: ${v.reason}`);
  }));

  results.push(await runTest('CLI generate mode with partial failure produces partial receipt', () => {
    const input = JSON.stringify({
      platform: 'hubspot',
      orgIdentifier: 'portal-partial',
      helper: 'hubspot-assessment-analyzer',
      branches: [
        { name: 'contacts', success: true, recordCount: 250, tool: 'hubspot_search' },
        { name: 'workflows', success: false, recordCount: 0, error: '401 Unauthorized', tool: 'workflow_enumerate' }
      ]
    });
    const cliPath = path.join(CORE_LIB, 'mcp-investigation-fan-out.js');
    const result = spawnSync('node', [cliPath, 'generate'], {
      input,
      encoding: 'utf8',
      env: { ...process.env, PATH: process.env.PATH }
    });
    assert.strictEqual(result.status, 0);
    const { extractReceiptFromOutput, verifyReceipt } = require(path.join(CORE_LIB, 'execution-receipt.js'));
    const extracted = extractReceiptFromOutput(result.stdout);
    assert.ok(extracted);
    const v = verifyReceipt(extracted);
    assert.strictEqual(v.valid, true);
    assert.strictEqual(v.classification, 'valid_partial');
  }));

  results.push(await runTest('execution-completion-contract includes CLI instructions', () => {
    const contract = fs.readFileSync(
      path.join(PROJECT_ROOT, 'plugins/opspal-core/agents/shared/execution-completion-contract.md'), 'utf8'
    );
    assert.ok(contract.includes('mcp-investigation-fan-out.js generate'));
    assert.ok(contract.includes('branches'));
    assert.ok(contract.includes('hubspot'));
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
