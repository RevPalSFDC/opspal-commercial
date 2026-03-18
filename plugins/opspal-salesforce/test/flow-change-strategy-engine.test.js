#!/usr/bin/env node

const assert = require('assert');
const { FlowChangeStrategyEngine } = require('../scripts/lib/flow-change-strategy-engine');

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    process.exitCode = 1;
  }
}

function baseInput(overrides = {}) {
  return {
    proposedAction: 'auto',
    capabilityDomain: 'account_enrichment',
    entryCriteria: "Type = 'Customer'",
    requiresAsyncOrdering: false,
    flowMetadata: {
      apiName: 'Account_Enrichment',
      label: 'Account Enrichment',
      description: 'Account enrichment capability',
      processType: 'Workflow'
    },
    versionInfo: {
      totalVersions: 6,
      activeVersion: { VersionNumber: 5 },
      latestVersion: { VersionNumber: 6 },
      versionSkew: 1
    },
    competingAutomation: {
      flows: [{ apiName: 'Account_Enrichment', triggerOrder: 100 }],
      triggers: [],
      conflicts: []
    },
    entryCriteriaAnalysis: {
      summary: { contradictions: 0 }
    },
    security: {
      runContext: 'system_without_sharing',
      expandsPrivilegedScope: false,
      hasGuardConditions: true
    },
    complexity: {
      score: 5
    },
    totalAutomation: 1,
    ...overrides
  };
}

console.log('\n=== Flow Change Strategy Engine Tests ===\n');

runTest('High-overlap low-complexity recommends update_existing', () => {
  const engine = new FlowChangeStrategyEngine();
  const result = engine.evaluate(baseInput());
  assert.strictEqual(result.recommendedStrategy, 'update_existing');
});

runTest('Distinct capability with clear criteria recommends create_new', () => {
  const engine = new FlowChangeStrategyEngine();
  const result = engine.evaluate(
    baseInput({
      capabilityDomain: 'renewal_notifications',
      flowMetadata: {
        apiName: 'Account_Enrichment',
        label: 'Account Enrichment',
        description: 'Normalizes account data',
        processType: 'Workflow'
      },
      complexity: { score: 6 },
      totalAutomation: 3
    })
  );

  assert.strictEqual(result.recommendedStrategy, 'create_new');
});

runTest('High complexity recommends refactor_with_subflow', () => {
  const engine = new FlowChangeStrategyEngine();
  const result = engine.evaluate(
    baseInput({
      proposedAction: 'update',
      complexity: { score: 15 },
      totalAutomation: 6
    })
  );

  assert.strictEqual(result.recommendedStrategy, 'refactor_with_subflow');
});

runTest('Tie within threshold applies tie-break policy', () => {
  const engine = new FlowChangeStrategyEngine({ tieThreshold: 100 });
  const result = engine.evaluate(
    baseInput({
      capabilityDomain: '',
      entryCriteria: "Status = 'Active'",
      flowMetadata: {
        apiName: 'Account_Mixed',
        label: 'Account Processing',
        description: 'Mixed account flow',
        processType: 'Workflow'
      },
      complexity: { score: 8 },
      totalAutomation: 4
    })
  );

  assert(result.tieBreakApplied);
  assert(['update_existing', 'create_new'].includes(result.recommendedStrategy));
});

runTest('Strict async ordering dependency creates blocking issue', () => {
  const engine = new FlowChangeStrategyEngine();
  const result = engine.evaluate(
    baseInput({
      requiresAsyncOrdering: true
    })
  );

  assert(result.blockingIssues.length > 0);
  assert(
    result.blockingIssues.some(issue => issue.toLowerCase().includes('asynchronous ordering'))
  );
});

if (!process.exitCode) {
  console.log('\n✅ All strategy engine tests passed!');
}
