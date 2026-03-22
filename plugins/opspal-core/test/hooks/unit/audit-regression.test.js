#!/usr/bin/env node

/**
 * Regression Tests for Preventative Reliability Audit (2026-03-21)
 *
 * Covers findings C1, C3, C6, C7, H1, H5 to prevent recurrence.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const path = require('path');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const CORE_PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');
const SF_PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-salesforce');

// =============================================================================
// Helpers
// =============================================================================

function createTester(hookPath, timeout = 15000) {
  return new HookTester(hookPath, { timeout, verbose: process.env.VERBOSE === '1' });
}

function createBashEvent(command) {
  return {
    tool_name: 'Bash',
    tool_input: { command }
  };
}

function createSubagentBashEvent(command, agentType) {
  return {
    tool_name: 'Bash',
    tool_input: { command },
    agent_type: agentType
  };
}

function createIsolatedEnv(extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-regression-'));
  return {
    CLAUDE_PLUGIN_ROOT: CORE_PLUGIN_ROOT,
    HOME: home,
    CLAUDE_SESSION_ID: `audit-test-${Date.now()}`,
    OPSPAL_BASH_BUDGET_ENABLED: '1',
    OPSPAL_BASH_BUDGET_WINDOW_SECONDS: '180',
    OPSPAL_BASH_BUDGET_MAX_COMMANDS: '24',
    OPSPAL_BASH_BUDGET_MAX_REPEATS: '5',
    ROUTING_ENFORCEMENT_ENABLED: '0',
    ...extra
  };
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ${name}... ✅`);
    return { name, passed: true };
  } catch (error) {
    console.log(`  ${name}... ❌`);
    console.log(`    Error: ${error.message}`);
    return { name, passed: false, error: error.message };
  }
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  const results = [];

  console.log('\n=== Audit Regression Tests (2026-03-21) ===\n');

  // -------------------------------------------------------------------------
  // C7: flow-xml-validator.js no longer has DUPLICATE_ASSIGNMENT check
  // -------------------------------------------------------------------------

  results.push(await runTest('C7: flow-xml-validator.js does not contain checkDuplicateFieldAssignments function', async () => {
    const validatorPath = path.join(SF_PLUGIN_ROOT, 'scripts/lib/flow-xml-validator.js');
    const content = fs.readFileSync(validatorPath, 'utf8');

    assert(
      !content.includes('checkDuplicateFieldAssignments(doc)'),
      'flow-xml-validator.js should not contain checkDuplicateFieldAssignments function — duplicate detection delegated to flow-field-reference-validator.js'
    );

    assert(
      !content.includes("this.checkDuplicateFieldAssignments(doc)"),
      'flow-xml-validator.js should not invoke checkDuplicateFieldAssignments'
    );
  }));

  // -------------------------------------------------------------------------
  // H1: flow-decision-logic-analyzer.js supports --json flag
  // -------------------------------------------------------------------------

  results.push(await runTest('H1: flow-decision-logic-analyzer.js --json flag is parsed', async () => {
    const analyzerPath = path.join(SF_PLUGIN_ROOT, 'scripts/lib/flow-decision-logic-analyzer.js');
    const content = fs.readFileSync(analyzerPath, 'utf8');

    assert(
      content.includes("'--json'") || content.includes('"--json"'),
      'flow-decision-logic-analyzer.js should parse --json flag'
    );

    assert(
      content.includes('jsonOutput'),
      'flow-decision-logic-analyzer.js should have jsonOutput variable for JSON mode'
    );
  }));

  // -------------------------------------------------------------------------
  // C1: pre-tool-use-contract-validation.sh emits WARNING when jq missing
  // -------------------------------------------------------------------------

  results.push(await runTest('C1: contract validation jq guard emits WARNING not silent skip', async () => {
    const hookPath = path.join(CORE_PLUGIN_ROOT, 'hooks/pre-tool-use-contract-validation.sh');
    const content = fs.readFileSync(hookPath, 'utf8');

    // Find the jq guard block
    const jqGuardMatch = content.match(/if ! command -v jq[\s\S]*?\nfi/);
    assert(jqGuardMatch, 'Should have a jq availability guard');

    const guardBlock = jqGuardMatch[0];
    assert(
      guardBlock.includes('WARNING'),
      'jq guard should emit WARNING message, not silently skip'
    );
    assert(
      guardBlock.includes('additionalContext') || guardBlock.includes('hookSpecificOutput'),
      'jq guard should emit structured output with additionalContext'
    );
  }));

  // -------------------------------------------------------------------------
  // C3: Budget enforcer does NOT gate on channel_in_hardening_scope
  // -------------------------------------------------------------------------

  results.push(await runTest('C3: enforce_bash_loop_budget does not gate on channel_in_hardening_scope', async () => {
    const hookPath = path.join(CORE_PLUGIN_ROOT, 'hooks/pre-tool-use-contract-validation.sh');
    const content = fs.readFileSync(hookPath, 'utf8');

    // The enforce_bash_loop_budget function should not call channel_in_hardening_scope
    // to gate budget enforcement. The comment about removal should be present instead.
    const funcStart = content.indexOf('enforce_bash_loop_budget()');
    assert(funcStart > -1, 'Should have enforce_bash_loop_budget function');

    const funcBody = content.slice(funcStart, funcStart + 2000);

    // The old pattern was: if ! channel_in_hardening_scope "$channel_id"; then return 0; fi
    // After C3 fix, this should be replaced with a comment about removal
    assert(
      !funcBody.includes('if ! channel_in_hardening_scope'),
      'enforce_bash_loop_budget should NOT gate on channel_in_hardening_scope — budget must run for all contexts'
    );
    assert(
      funcBody.includes('channel_in_hardening_scope gate removed') || !funcBody.includes('channel_in_hardening_scope "$channel_id"'),
      'Should have removal comment or no active channel gate call'
    );
  }));

  // -------------------------------------------------------------------------
  // H5: Budget block emits structured JSON deny
  // -------------------------------------------------------------------------

  results.push(await runTest('H5: budget block path emits structured JSON deny with BASH_BUDGET_EXCEEDED', async () => {
    const hookPath = path.join(CORE_PLUGIN_ROOT, 'hooks/pre-tool-use-contract-validation.sh');
    const content = fs.readFileSync(hookPath, 'utf8');

    // Find the budget enforcement section after enforce_bash_loop_budget call
    const budgetCallIdx = content.indexOf('enforce_bash_loop_budget "$TOOL_COMMAND"');
    assert(budgetCallIdx > -1, 'Should have enforce_bash_loop_budget call');

    const afterBudgetCall = content.slice(budgetCallIdx, budgetCallIdx + 500);
    assert(
      afterBudgetCall.includes('BASH_BUDGET_EXCEEDED') || afterBudgetCall.includes('permissionDecision'),
      'Budget block should emit structured JSON deny with error code, not just exit 2'
    );
    assert(
      !afterBudgetCall.includes('exit "$HOOK_BLOCK_EXIT_CODE"'),
      'Budget block should NOT use exit $HOOK_BLOCK_EXIT_CODE (exit 2) — should use structured JSON deny + exit 0'
    );
  }));

  // -------------------------------------------------------------------------
  // C6: dataFreshness excludes Salesforce read-only timestamp fields
  // -------------------------------------------------------------------------

  results.push(await runTest('C6: pre-operation-data-validator excludes SF read-only timestamps from hardStaleGate', async () => {
    const hookPath = path.join(CORE_PLUGIN_ROOT, 'hooks/pre-operation-data-validator.sh');
    const content = fs.readFileSync(hookPath, 'utf8');

    assert(
      content.includes('CreatedDate') && content.includes('LastModifiedDate') && content.includes('SystemModstamp'),
      'Should have SF read-only date field exclusion list'
    );

    assert(
      content.includes('SF_READONLY_DATES') || content.includes('READ_ONLY_DATE_FIELDS'),
      'Should have a named exclusion set for SF read-only date fields'
    );
  }));

  // -------------------------------------------------------------------------
  // C4: Budget state file uses atomic write
  // -------------------------------------------------------------------------

  results.push(await runTest('C4: budget state file write is atomic (tmp + mv)', async () => {
    const hookPath = path.join(CORE_PLUGIN_ROOT, 'hooks/pre-tool-use-contract-validation.sh');
    const content = fs.readFileSync(hookPath, 'utf8');

    // The old pattern was: > "$state_file" 2>/dev/null || true
    // The new pattern should use a temp file + mv
    assert(
      content.includes('.tmp.$$') || content.includes('tmp_state'),
      'Budget state write should use atomic temp file + mv pattern'
    );
    assert(
      content.includes('mv -f'),
      'Budget state write should use mv -f for atomic rename'
    );
  }));

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  console.log('');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
