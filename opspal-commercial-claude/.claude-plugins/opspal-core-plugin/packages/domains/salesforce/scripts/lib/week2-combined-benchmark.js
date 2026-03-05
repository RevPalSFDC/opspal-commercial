#!/usr/bin/env node
/**
 * Week 2 Combined Optimization Benchmark
 *
 * Purpose: Measure combined impact of all three optimizations
 * - Phase 1: Batch metadata retrieval
 * - Phase 2: Parallel conflict detection
 * - Phase 3: Metadata caching
 *
 * Expected: 55%+ overall improvement, <3.0s execution time
 *
 * @version 1.0.0
 * @phase Performance Optimization (Week 2 - Combined)
 */

const BatchFieldMetadata = require('./batch-field-metadata');
const ParallelConflictDetector = require('./parallel-conflict-detector');
const FieldMetadataCache = require('./field-metadata-cache');

/**
 * Benchmark configurations
 */
const MERGE_SCENARIOS = {
  small: {
    name: 'Small (5 merges)',
    merges: 5,
    expectedDuration: 500 // ms
  },
  medium: {
    name: 'Medium (10 merges)',
    merges: 10,
    expectedDuration: 800 // ms
  },
  large: {
    name: 'Large (20 merges)',
    merges: 20,
    expectedDuration: 1500 // ms
  }
};

/**
 * Generate test merge operations
 */
function generateMergeOperations(count) {
  return Array.from({ length: count }, (_, i) => ({
    source: `Account.SourceField${i + 1}__c`,
    target: `Account.TargetField${i + 1}__c`,
    operation: 'merge'
  }));
}

/**
 * Simulate individual metadata fetches (BEFORE optimization)
 */
async function simulateIndividualFetches(merges) {
  // Each merge requires 2 field metadata fetches
  const totalFetches = merges.length * 2;

  for (let i = 0; i < totalFetches; i++) {
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100)); // 100-200ms per fetch
  }
}

/**
 * Simulate sequential agent Task.launch() calls (BEFORE optimization)
 */
async function simulateSequentialAgentCalls(merges) {
  for (const merge of merges) {
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000)); // 1-2s per agent
  }
}

/**
 * BEFORE: Baseline (no optimizations)
 */
async function benchmarkBaseline(merges) {
  console.log('\n❌ BASELINE (No Optimizations):');

  const start = Date.now();

  // Sequential agent calls
  await simulateSequentialAgentCalls(merges);

  // Individual metadata fetches
  await simulateIndividualFetches(merges);

  const duration = Date.now() - start;

  console.log(`   Total: ${duration}ms`);
  console.log(`   Breakdown:`);
  console.log(`     Agent calls: ~${merges.length * 1500}ms (1.5s avg per merge)`);
  console.log(`     Metadata fetches: ~${merges.length * 2 * 150}ms (150ms avg per field)`);

  return duration;
}

/**
 * AFTER Phase 1: Batch metadata only
 */
async function benchmarkPhase1(merges) {
  console.log('\n🔄 PHASE 1 (Batch Metadata):');

  const start = Date.now();

  // Still using sequential agents
  await simulateSequentialAgentCalls(merges);

  // Batch metadata (Phase 1 optimization)
  const batchMeta = new BatchFieldMetadata();
  const allFields = merges.flatMap(m => [m.source, m.target]);
  await batchMeta.getMetadata(allFields);

  const duration = Date.now() - start;
  const stats = batchMeta.getStats();

  console.log(`   Total: ${duration}ms`);
  console.log(`   Metadata duration: ${stats.totalDuration}ms (batch)`);

  return duration;
}

/**
 * AFTER Phase 2: Batch metadata + parallel detection
 */
async function benchmarkPhase2(merges) {
  console.log('\n🔄 PHASE 2 (Batch + Parallel):');

  const start = Date.now();

  // Parallel conflict detection (Phase 2 optimization)
  const detector = new ParallelConflictDetector({ batchMetadata: new BatchFieldMetadata() });
  await detector.detectBatch(merges);

  const duration = Date.now() - start;
  const stats = detector.getStats();

  console.log(`   Total: ${duration}ms`);
  console.log(`   Conflicts detected: ${stats.totalConflicts}`);

  return duration;
}

/**
 * AFTER Phase 3: All optimizations + caching
 */
async function benchmarkPhase3(merges, withWarmCache = false) {
  console.log(`\n✅ PHASE 3 (All Optimizations${withWarmCache ? ' + Warm Cache' : ''}):`)  ;

  // Create cache-enabled detector
  const detector = new ParallelConflictDetector({
    cacheSize: 1000,
    cacheTtl: 3600000
  });

  if (withWarmCache) {
    // Prime cache with first run
    await detector.detectBatch(merges);
  }

  const start = Date.now();

  // Run with caching enabled
  await detector.detectBatch(merges);

  const duration = Date.now() - start;
  const stats = detector.getStats();
  const batchStats = detector.batchMetadata.getStats();

  console.log(`   Total: ${duration}ms`);
  console.log(`   Conflicts detected: ${stats.totalConflicts}`);
  console.log(`   Cache hit rate: ${batchStats.cacheHitRate}%`);

  return duration;
}

/**
 * Run comprehensive benchmark for a scenario
 */
async function runScenarioBenchmark(scenario) {
  console.log('\n' + '═'.repeat(70));
  console.log(`\n📊 Scenario: ${scenario.name}\n`);

  const merges = generateMergeOperations(scenario.merges);

  // Baseline (no optimizations)
  const baselineDuration = await benchmarkBaseline(merges);

  // Phase 1: Batch metadata
  const phase1Duration = await benchmarkPhase1(merges);
  const phase1Improvement = ((baselineDuration - phase1Duration) / baselineDuration) * 100;

  // Phase 2: Batch + Parallel
  const phase2Duration = await benchmarkPhase2(merges);
  const phase2Improvement = ((baselineDuration - phase2Duration) / baselineDuration) * 100;

  // Phase 3: All optimizations (cold cache)
  const phase3ColdDuration = await benchmarkPhase3(merges, false);
  const phase3ColdImprovement = ((baselineDuration - phase3ColdDuration) / baselineDuration) * 100;

  // Phase 3: All optimizations (warm cache)
  const phase3WarmDuration = await benchmarkPhase3(merges, true);
  const phase3WarmImprovement = ((baselineDuration - phase3WarmDuration) / baselineDuration) * 100;

  // Print summary
  console.log('\n📈 Results Summary:\n');
  console.log('Phase                         | Duration | Improvement | Speedup');
  console.log('------------------------------|----------|-------------|--------');
  console.log(`Baseline (No Optimizations)   | ${String(baselineDuration).padStart(6)}ms | ${String('-').padStart(10)} | ${String('-').padStart(6)}`);
  console.log(`Phase 1 (Batch Metadata)      | ${String(phase1Duration).padStart(6)}ms | ${String('-' + Math.round(phase1Improvement) + '%').padStart(10)} | ${String((baselineDuration / phase1Duration).toFixed(2) + 'x').padStart(6)}`);
  console.log(`Phase 2 (Batch + Parallel)    | ${String(phase2Duration).padStart(6)}ms | ${String('-' + Math.round(phase2Improvement) + '%').padStart(10)} | ${String((baselineDuration / phase2Duration).toFixed(2) + 'x').padStart(6)}`);
  console.log(`Phase 3 (All + Cold Cache)    | ${String(phase3ColdDuration).padStart(6)}ms | ${String('-' + Math.round(phase3ColdImprovement) + '%').padStart(10)} | ${String((baselineDuration / phase3ColdDuration).toFixed(2) + 'x').padStart(6)}`);
  console.log(`Phase 3 (All + Warm Cache)    | ${String(phase3WarmDuration).padStart(6)}ms | ${String('-' + Math.round(phase3WarmImprovement) + '%').padStart(10)} | ${String((baselineDuration / phase3WarmDuration).toFixed(2) + 'x').padStart(6)}`);

  // Target validation
  console.log('\n🎯 Target Validation:\n');
  console.log(`Expected: <${scenario.expectedDuration}ms`);
  console.log(`Actual (Phase 3 Warm): ${phase3WarmDuration}ms`);
  console.log(`Status: ${phase3WarmDuration < scenario.expectedDuration ? '✅ TARGET MET' : '⚠️  NEEDS OPTIMIZATION'}`);

  return {
    scenario: scenario.name,
    baseline: baselineDuration,
    phase1: phase1Duration,
    phase2: phase2Duration,
    phase3Cold: phase3ColdDuration,
    phase3Warm: phase3WarmDuration,
    improvement: phase3WarmImprovement,
    targetMet: phase3WarmDuration < scenario.expectedDuration
  };
}

/**
 * Main benchmark runner
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
Week 2 Combined Optimization Benchmark

Usage:
  node week2-combined-benchmark.js [scenario]

Scenarios:
  small       5 merge operations (target: <500ms)
  medium      10 merge operations (target: <800ms)
  large       20 merge operations (target: <1500ms)
  all         Run all scenarios (default)

Examples:
  # Run all scenarios
  node week2-combined-benchmark.js

  # Run specific scenario
  node week2-combined-benchmark.js medium
    `);
    process.exit(0);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('Week 2 Combined Optimization Benchmark');
  console.log('═'.repeat(70));

  const scenario = args[0] || 'all';
  const results = [];

  if (scenario === 'all') {
    // Run all scenarios
    for (const [key, config] of Object.entries(MERGE_SCENARIOS)) {
      const result = await runScenarioBenchmark(config);
      results.push(result);
    }

    // Print overall summary
    console.log('\n' + '═'.repeat(70));
    console.log('\n📊 Overall Summary\n');
    console.log('Scenario    | Phase 3 Warm | Improvement | Target');
    console.log('------------|--------------|-------------|--------');
    results.forEach(r => {
      console.log(
        `${r.scenario.padEnd(11)} | ${String(r.phase3Warm).padStart(10)}ms | ${String('-' + Math.round(r.improvement) + '%').padStart(10)} | ${r.targetMet ? '✅' : '⚠️ '}`
      );
    });

    const allTargetsMet = results.every(r => r.targetMet);
    const avgImprovement = results.reduce((sum, r) => sum + r.improvement, 0) / results.length;

    console.log(`\nAverage Improvement: ${Math.round(avgImprovement)}%`);
    console.log(`All Targets Met: ${allTargetsMet ? '✅ YES' : '⚠️  NO'}`);

  } else {
    // Run specific scenario
    const config = MERGE_SCENARIOS[scenario];

    if (!config) {
      console.error(`\nError: Unknown scenario '${scenario}'`);
      console.log('Run with --help for available scenarios');
      process.exit(1);
    }

    await runScenarioBenchmark(config);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('\n✅ Benchmark Complete\n');
}

if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = { runScenarioBenchmark, MERGE_SCENARIOS };
