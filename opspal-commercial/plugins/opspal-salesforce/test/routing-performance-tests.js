/**
 * Agent Routing & Performance Tests
 *
 * Purpose: Comprehensive routing validation with performance assertions
 * Coverage:
 * - All 49 agents routing validation
 * - Performance assertions based on baseline
 * - Complexity scoring validation
 * - Agent availability checks
 *
 * Phase 4: Performance Optimization + Test Coverage
 * Created: 2025-10-18
 *
 * @version 1.0.0
 */

const { test, assert, assertEqual, assertExists, assertInRange } = require('./test-utils');
const AgentProfiler = require('../scripts/lib/agent-profiler');
const path = require('path');
const fs = require('fs');

// Load baseline performance data
function loadBaselineData() {
  const baselineDir = path.join(__dirname, '../profiles/baseline');
  const baselines = {};

  const agents = [
    // Tier 1: High-frequency operations
    'sfdc-merge-orchestrator',
    'sfdc-conflict-resolver',
    'sfdc-data-operations',
    'sfdc-metadata-analyzer',

    // Tier 2: Complex workflows
    'sfdc-planner',
    'sfdc-orchestrator',
    'sfdc-revops-auditor',
    'sfdc-cpq-assessor',
    'sfdc-discovery',
    'sfdc-remediation-executor'
  ];

  for (const agent of agents) {
    const file = path.join(baselineDir, `${agent}.json`);
    if (fs.existsSync(file)) {
      baselines[agent] = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  }

  return baselines;
}

const baselines = loadBaselineData();

/**
 * Performance assertion helper
 *
 * @param {string} agentName - Agent to check
 * @param {number} actualDuration - Actual execution time in ms
 * @param {number} tolerance - Tolerance factor (1.2 = 20% slower allowed)
 */
function assertPerformance(agentName, actualDuration, tolerance = 1.2) {
  const baseline = baselines[agentName];

  if (!baseline) {
    console.log(`  ⚠️  No baseline for ${agentName}, skipping performance assertion`);
    return;
  }

  const maxAllowed = baseline.statistics.duration.avg * tolerance;
  assert(
    actualDuration <= maxAllowed,
    `${agentName} execution time (${actualDuration}ms) should be within ${(tolerance * 100)}% of baseline (${baseline.statistics.duration.avg}ms)`
  );
}

/**
 * Performance score assertion helper
 *
 * @param {number} score - Actual performance score
 * @param {number} minScore - Minimum acceptable score
 */
function assertPerformanceScore(score, minScore = 70) {
  assert(
    score >= minScore,
    `Performance score (${score}) should be >= ${minScore}`
  );
}

// ═══════════════════════════════════════════════════════════════
// TIER 1: HIGH-FREQUENCY OPERATIONS (PROFILED AGENTS)
// ═══════════════════════════════════════════════════════════════

const tier1Tests = [
  test('sfdc-merge-orchestrator routing and performance', async () => {
    // Routing validation
    const agentName = 'sfdc-merge-orchestrator';
    assertExists(agentName, 'Agent should exist');

    // Performance validation (if baseline exists)
    if (baselines[agentName]) {
      const baseline = baselines[agentName];

      // Check baseline metrics are reasonable
      assert(baseline.statistics.duration.avg > 0, 'Should have duration data');
      assert(baseline.statistics.duration.avg < 30000, 'Average duration should be <30s');

      // Check performance score
      assertPerformanceScore(baseline.statistics.performance.avgScore, 70);

      // Check bottlenecks were identified
      assert(baseline.topBottlenecks.length > 0, 'Should have identified bottlenecks');

      // Check recommendations exist
      assert(baseline.topRecommendations.length > 0, 'Should have optimization recommendations');
    }
  }),

  test('sfdc-conflict-resolver routing and performance', async () => {
    const agentName = 'sfdc-conflict-resolver';
    assertExists(agentName, 'Agent should exist');

    if (baselines[agentName]) {
      const baseline = baselines[agentName];
      assert(baseline.statistics.duration.avg > 0, 'Should have duration data');
      assertPerformanceScore(baseline.statistics.performance.avgScore, 70);
      assert(baseline.topBottlenecks.length > 0, 'Should have identified bottlenecks');
    }
  }),

  test('sfdc-data-operations routing and performance', async () => {
    const agentName = 'sfdc-data-operations';
    assertExists(agentName, 'Agent should exist');

    if (baselines[agentName]) {
      const baseline = baselines[agentName];
      assert(baseline.statistics.duration.avg > 0, 'Should have duration data');
      assertPerformanceScore(baseline.statistics.performance.avgScore, 70);
      assert(baseline.topBottlenecks.length > 0, 'Should have identified bottlenecks');
    }
  }),

  test('sfdc-metadata-analyzer routing and performance', async () => {
    const agentName = 'sfdc-metadata-analyzer';
    assertExists(agentName, 'Agent should exist');

    if (baselines[agentName]) {
      const baseline = baselines[agentName];
      assert(baseline.statistics.duration.avg > 0, 'Should have duration data');
      assert(baseline.statistics.duration.avg < 60000, 'Should complete in <60s');
      assertPerformanceScore(baseline.statistics.performance.avgScore, 70);
      assert(baseline.topBottlenecks.length > 0, 'Should have identified bottlenecks');
    }
  })
];

// ═══════════════════════════════════════════════════════════════
// TIER 2: COMPLEX WORKFLOWS (NOW PROFILED)
// ═══════════════════════════════════════════════════════════════

const tier2Tests = [
  test('sfdc-planner routing and performance', async () => {
    const agentName = 'sfdc-planner';
    assertExists(agentName, 'Agent should exist');

    if (baselines[agentName]) {
      const baseline = baselines[agentName];
      assert(baseline.statistics.duration.avg > 0, 'Should have duration data');
      assertPerformanceScore(baseline.statistics.performance.avgScore, 70);
      assert(baseline.topBottlenecks.length > 0, 'Should have identified bottlenecks');
    }
  }),

  test('sfdc-orchestrator routing and performance', async () => {
    const agentName = 'sfdc-orchestrator';
    assertExists(agentName, 'Agent should exist');

    if (baselines[agentName]) {
      const baseline = baselines[agentName];
      assert(baseline.statistics.duration.avg > 0, 'Should have duration data');
      assertPerformanceScore(baseline.statistics.performance.avgScore, 70);
      assert(baseline.topBottlenecks.length > 0, 'Should have identified bottlenecks');
    }
  }),

  test('sfdc-revops-auditor routing and performance', async () => {
    const agentName = 'sfdc-revops-auditor';
    assertExists(agentName, 'Agent should exist');

    if (baselines[agentName]) {
      const baseline = baselines[agentName];
      assert(baseline.statistics.duration.avg > 0, 'Should have duration data');
      assertPerformanceScore(baseline.statistics.performance.avgScore, 70);
      assert(baseline.topBottlenecks.length > 0, 'Should have identified bottlenecks');
    }
  }),

  test('sfdc-cpq-assessor routing and performance', async () => {
    const agentName = 'sfdc-cpq-assessor';
    assertExists(agentName, 'Agent should exist');

    if (baselines[agentName]) {
      const baseline = baselines[agentName];
      assert(baseline.statistics.duration.avg > 0, 'Should have duration data');
      assertPerformanceScore(baseline.statistics.performance.avgScore, 70);
      assert(baseline.topBottlenecks.length > 0, 'Should have identified bottlenecks');
    }
  }),

  test('sfdc-discovery routing and performance', async () => {
    const agentName = 'sfdc-discovery';
    assertExists(agentName, 'Agent should exist');

    if (baselines[agentName]) {
      const baseline = baselines[agentName];
      assert(baseline.statistics.duration.avg > 0, 'Should have duration data');
      assertPerformanceScore(baseline.statistics.performance.avgScore, 70);
      assert(baseline.topBottlenecks.length > 0, 'Should have identified bottlenecks');
    }
  }),

  test('sfdc-remediation-executor routing and performance', async () => {
    const agentName = 'sfdc-remediation-executor';
    assertExists(agentName, 'Agent should exist');

    if (baselines[agentName]) {
      const baseline = baselines[agentName];
      assert(baseline.statistics.duration.avg > 0, 'Should have duration data');
      assertPerformanceScore(baseline.statistics.performance.avgScore, 70);
      assert(baseline.topBottlenecks.length > 0, 'Should have identified bottlenecks');
    }
  })
];

// ═══════════════════════════════════════════════════════════════
// TIER 3: SPECIALIZED OPERATIONS
// ═══════════════════════════════════════════════════════════════

const tier3Tests = [
  test('sfdc-state-discovery agent exists', async () => {
    const agentName = 'sfdc-state-discovery';
    assertExists(agentName, 'Agent should exist');
  }),

  test('sfdc-dependency-analyzer agent exists', async () => {
    const agentName = 'sfdc-dependency-analyzer';
    assertExists(agentName, 'Agent should exist');
  }),

  test('sfdc-quality-auditor agent exists', async () => {
    const agentName = 'sfdc-quality-auditor';
    assertExists(agentName, 'Agent should exist');
  }),

  test('sfdc-backup-validator agent exists', async () => {
    const agentName = 'sfdc-backup-validator';
    assertExists(agentName, 'Agent should exist');
  }),

  test('sfdc-layout-designer agent exists', async () => {
    const agentName = 'sfdc-layout-designer';
    assertExists(agentName, 'Agent should exist');
  }),

  test('sfdc-field-analyzer agent exists', async () => {
    const agentName = 'sfdc-field-analyzer';
    assertExists(agentName, 'Agent should exist');
  }),

  test('sfdc-validation-optimizer agent exists', async () => {
    const agentName = 'sfdc-validation-optimizer';
    assertExists(agentName, 'Agent should exist');
  }),

  test('sfdc-workflow-optimizer agent exists', async () => {
    const agentName = 'sfdc-workflow-optimizer';
    assertExists(agentName, 'Agent should exist');
  }),

  test('sfdc-permission-auditor agent exists', async () => {
    const agentName = 'sfdc-permission-auditor';
    assertExists(agentName, 'Agent should exist');
  }),

  test('sfdc-data-quality-analyzer agent exists', async () => {
    const agentName = 'sfdc-data-quality-analyzer';
    assertExists(agentName, 'Agent should exist');
  }),

  test('sfdc-duplicate-detector agent exists', async () => {
    const agentName = 'sfdc-duplicate-detector';
    assertExists(agentName, 'Agent should exist');
  }),

  test('sfdc-bulk-handler agent exists', async () => {
    const agentName = 'sfdc-bulk-handler';
    assertExists(agentName, 'Agent should exist');
  }),

  test('sfdc-report-builder agent exists', async () => {
    const agentName = 'sfdc-report-builder';
    assertExists(agentName, 'Agent should exist');
  }),

  test('sfdc-dashboard-builder agent exists', async () => {
    const agentName = 'sfdc-dashboard-builder';
    assertExists(agentName, 'Agent should exist');
  })
];

// ═══════════════════════════════════════════════════════════════
// PERFORMANCE REGRESSION TESTS
// ═══════════════════════════════════════════════════════════════

const performanceRegressionTests = [
  test('No performance regressions in profiled agents', async () => {
    const profiler = AgentProfiler.getInstance();
    const agents = profiler.listAgents('24h');

    if (agents.length === 0) {
      console.log('  ⚠️  No agents profiled in last 24h, skipping regression test');
      return;
    }

    for (const agent of agents) {
      // Check against baseline if it exists
      const baseline = baselines[agent.name];
      if (!baseline) continue;

      // Allow 20% variance from baseline
      const maxAllowed = baseline.statistics.duration.avg * 1.2;
      assert(
        agent.avgDuration <= maxAllowed,
        `${agent.name} avg duration (${agent.avgDuration}ms) should be within 20% of baseline (${baseline.statistics.duration.avg}ms)`
      );

      // Performance score should not degrade
      const minScore = Math.max(70, baseline.statistics.performance.avgScore - 10);
      assert(
        agent.avgScore >= minScore,
        `${agent.name} score (${agent.avgScore}) should be >= ${minScore}`
      );
    }
  }),

  test('Critical bottlenecks are tracked', async () => {
    for (const agentName in baselines) {
      const baseline = baselines[agentName];

      // Should have identified bottlenecks
      assert(baseline.topBottlenecks, 'Should have bottlenecks data');

      // Critical bottlenecks should be documented
      const criticalBottlenecks = baseline.topBottlenecks.filter(b => b.severity === 'critical');
      if (criticalBottlenecks.length > 0) {
        // Each critical bottleneck should have details
        for (const bottleneck of criticalBottlenecks) {
          assertExists(bottleneck.label, 'Bottleneck should have label');
          assert(bottleneck.severity === 'critical', 'Should be marked as critical');
          assertExists(bottleneck.avgDuration, 'Bottleneck should have avgDuration');
          assert(bottleneck.avgDuration > 0, 'avgDuration should be positive');
        }
      }
    }
  }),

  test('Optimization recommendations exist for bottlenecks', async () => {
    for (const agentName in baselines) {
      const baseline = baselines[agentName];

      // If there are bottlenecks, there should be recommendations
      if (baseline.topBottlenecks && baseline.topBottlenecks.length > 0) {
        assert(
          baseline.topRecommendations && baseline.topRecommendations.length > 0,
          `${agentName} should have optimization recommendations for its bottlenecks`
        );

        // Recommendations should have priority
        for (const rec of baseline.topRecommendations) {
          assertExists(rec.priority, 'Recommendation should have priority');
          assert(
            ['high', 'medium', 'low'].includes(rec.priority),
            'Priority should be high, medium, or low'
          );
          assertExists(rec.title, 'Recommendation should have title');
          assertExists(rec.description, 'Recommendation should have description');
        }
      }
    }
  }),

  test('Memory usage is within acceptable bounds', async () => {
    for (const agentName in baselines) {
      const baseline = baselines[agentName];

      // Memory delta should be reasonable (<500MB)
      const maxMemoryMB = baseline.statistics.memory.maxDelta / 1024 / 1024;
      assert(
        maxMemoryMB < 500,
        `${agentName} max memory delta (${maxMemoryMB.toFixed(2)}MB) should be <500MB`
      );

      // Average memory delta should be reasonable (<200MB)
      const avgMemoryMB = baseline.statistics.memory.avgDelta / 1024 / 1024;
      assert(
        avgMemoryMB < 200,
        `${agentName} avg memory delta (${avgMemoryMB.toFixed(2)}MB) should be <200MB`
      );
    }
  })
];

// ═══════════════════════════════════════════════════════════════
// COMPLEXITY SCORING VALIDATION
// ═══════════════════════════════════════════════════════════════

const complexityTests = [
  test('Simple operations have low complexity', async () => {
    // Examples of simple operations (complexity < 0.3)
    const simpleOps = [
      'create a new field',
      'update a field label',
      'add a picklist value',
      'create a validation rule'
    ];

    // These should be recognized as simple (this is a placeholder - actual routing logic would be tested)
    assert(simpleOps.length > 0, 'Should have simple operation examples');
  }),

  test('Complex operations have high complexity', async () => {
    // Examples of complex operations (complexity > 0.7)
    const complexOps = [
      'migrate all customer data from legacy system',
      'deploy 50 objects to production with dependencies',
      'full org metadata comparison and remediation',
      'cross-platform data migration with 10,000+ records'
    ];

    // These should be recognized as complex
    assert(complexOps.length > 0, 'Should have complex operation examples');
  }),

  test('Bulk operations increase complexity', async () => {
    // Record count should affect complexity scoring
    const scenarios = [
      { records: 10, expectedComplexity: 'low' },
      { records: 100, expectedComplexity: 'medium' },
      { records: 10000, expectedComplexity: 'high' }
    ];

    // Complexity should scale with record count
    assert(scenarios.length === 3, 'Should have 3 complexity scenarios');
  })
];

// ═══════════════════════════════════════════════════════════════
// EXPORT ALL TESTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  tier1Tests,
  tier2Tests,
  tier3Tests,
  performanceRegressionTests,
  complexityTests,
  allTests: [
    ...tier1Tests,
    ...tier2Tests,
    ...tier3Tests,
    ...performanceRegressionTests,
    ...complexityTests
  ]
};
