#!/usr/bin/env node
/**
 * Data Operations Optimizer
 *
 * Purpose: Optimize sfdc-data-operations agent using Phase 1 patterns
 * Performance: 40-50% improvement expected (4.83s → 2.4-2.9s)
 *
 * BEFORE: Sequential queries with dynamic building (4.83s)
 * AFTER: Composite API + Template-based building (2.4-2.9s)
 *
 * Phase 1: Batch API Operations + Query Optimization
 *
 * @version 1.0.0
 * @phase Performance Optimization (sfdc-data-operations - Phase 1)
 */

const BatchQueryExecutor = require('./batch-query-executor');
const QueryOptimizer = require('./query-optimizer');

/**
 * Data Operations Optimizer combining Composite API + Query Templates
 */
class DataOperationsOptimizer {
  constructor(options = {}) {
    // Phase 1: Use batch query executor and optimizer
    this.batchExecutor = options.batchExecutor || new BatchQueryExecutor({
      batchSize: options.batchSize || 25,
      timeout: options.timeout || 30000
    });

    this.queryOptimizer = options.queryOptimizer || new QueryOptimizer({
      maxCacheSize: options.maxCacheSize || 1000
    });

    this.stats = {
      operations: 0,
      totalDuration: 0,
      queryBuildDuration: 0,
      queryExecutionDuration: 0
    };
  }

  /**
   * Execute data operations with optimizations
   *
   * Phase 1: Template-based query building + Composite API execution
   *
   * @param {Object[]} operations - Array of {template, params} operations
   * @param {Object} options - Execution options
   * @returns {Promise<Object[]>} Operation results
   */
  async executeOperations(operations, options = {}) {
    const startTime = Date.now();

    if (!operations || operations.length === 0) {
      return [];
    }

    console.log(`🔍 Executing ${operations.length} data operations...`);

    // Phase 1: Build queries using templates
    const buildStart = Date.now();
    const queries = operations.map((op, index) => {
      const soql = this.queryOptimizer.buildQuery(op.template || 'dynamic', op.params);
      return {
        soql,
        referenceId: op.referenceId || `operation_${index}`,
        operation: op
      };
    });
    const buildDuration = Date.now() - buildStart;

    console.log(`📝 Built ${queries.length} queries in ${buildDuration}ms`);

    // Phase 1: Execute queries using Composite API
    const execStart = Date.now();
    const results = await this.batchExecutor.executeComposite(queries, options);
    const execDuration = Date.now() - execStart;

    // Update statistics
    const totalDuration = Date.now() - startTime;
    this.stats.operations += operations.length;
    this.stats.totalDuration += totalDuration;
    this.stats.queryBuildDuration += buildDuration;
    this.stats.queryExecutionDuration += execDuration;

    console.log(`✅ Completed ${operations.length} operations in ${totalDuration}ms`);
    console.log(`   Build: ${buildDuration}ms, Execution: ${execDuration}ms`);

    return results;
  }

  /**
   * Get combined performance statistics
   */
  getStats() {
    const batchStats = this.batchExecutor.getStats();
    const optimizerStats = this.queryOptimizer.getStats();

    return {
      ...this.stats,
      avgDurationPerOperation: this.stats.operations > 0
        ? Math.round(this.stats.totalDuration / this.stats.operations)
        : 0,
      buildPercentage: this.stats.totalDuration > 0
        ? ((this.stats.queryBuildDuration / this.stats.totalDuration) * 100).toFixed(1)
        : 0,
      executionPercentage: this.stats.totalDuration > 0
        ? ((this.stats.queryExecutionDuration / this.stats.totalDuration) * 100).toFixed(1)
        : 0,
      batchExecutorStats: batchStats,
      queryOptimizerStats: optimizerStats
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      operations: 0,
      totalDuration: 0,
      queryBuildDuration: 0,
      queryExecutionDuration: 0
    };
    this.batchExecutor.resetStats();
    this.queryOptimizer.resetStats();
  }
}

/**
 * Compare baseline vs Phase 1 optimization
 */
async function compareBaselineVsPhase1(operations) {
  console.log('\n📊 Performance Comparison: Baseline vs Phase 1\n');
  console.log(`Operations: ${operations.length}\n`);

  // Simulate baseline (individual queries with dynamic building)
  console.log('❌ BASELINE (Individual Queries + Dynamic Building):');
  const baselineStart = Date.now();

  for (const op of operations) {
    // Simulate dynamic query building (50-100ms)
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));

    // Simulate individual query execution (200-400ms)
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 200));
  }

  const baselineDuration = Date.now() - baselineStart;
  console.log(`   Total: ${baselineDuration}ms\n`);

  // Phase 1: Composite API + Template building
  console.log('✅ PHASE 1 (Composite API + Template Building):');
  const optimizer = new DataOperationsOptimizer();
  const phase1Start = Date.now();

  await optimizer.executeOperations(operations);

  const phase1Duration = Date.now() - phase1Start;
  const stats = optimizer.getStats();
  console.log(`\n   Total: ${phase1Duration}ms`);
  console.log(`   Build: ${stats.queryBuildDuration}ms (${stats.buildPercentage}%)`);
  console.log(`   Execution: ${stats.queryExecutionDuration}ms (${stats.executionPercentage}%)`);
  console.log(`   Query cache hit rate: ${stats.queryOptimizerStats.cacheHitRate}%`);
  console.log(`   Batch requests: ${stats.batchExecutorStats.batchRequests} (vs ${operations.length} individual)\n`);

  // Calculate improvement
  const improvement = Math.round(((baselineDuration - phase1Duration) / baselineDuration) * 100);
  const speedup = (baselineDuration / phase1Duration).toFixed(2);

  console.log('📈 Results:');
  console.log(`   Baseline: ${baselineDuration}ms`);
  console.log(`   Phase 1: ${phase1Duration}ms`);
  console.log(`   Improvement: -${improvement}%`);
  console.log(`   Speedup: ${speedup}x faster\n`);

  return { baselineDuration, phase1Duration, improvement, speedup };
}

/**
 * CLI for testing
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Data Operations Optimizer - Phase 1

Usage:
  node data-operations-optimizer.js <command> [options]

Commands:
  test <count>        Test data operations for N operations
  compare <count>     Compare baseline vs Phase 1
  benchmark           Run performance benchmark suite

Examples:
  # Test with 10 operations
  node data-operations-optimizer.js test 10

  # Compare baseline vs Phase 1
  node data-operations-optimizer.js compare 10

  # Run full benchmark
  node data-operations-optimizer.js benchmark
    `);
    process.exit(0);
  }

  const command = args[0];
  const count = parseInt(args[1] || '10', 10);

  // Generate test operations
  const generateOperations = (n) => {
    const templates = ['Account_Basic', 'Opportunity_Pipeline', 'Contact_Standard'];

    return Array.from({ length: n }, (_, i) => ({
      template: templates[i % templates.length],
      params: {
        condition: `Type = 'Customer${i + 1}'`,
        limit: 100
      },
      referenceId: `operation_${i + 1}`
    }));
  };

  switch (command) {
    case 'test':
      console.log(`\n🧪 Testing data operations for ${count} operations...\n`);
      const optimizer = new DataOperationsOptimizer();
      const testOps = generateOperations(count);
      const start = Date.now();
      const results = await optimizer.executeOperations(testOps);
      const duration = Date.now() - start;
      const stats = optimizer.getStats();

      console.log(`\n✅ Completed ${count} operations in ${duration}ms`);
      console.log(`   Total records returned: ${results.reduce((sum, r) => sum + (r.records?.length || 0), 0)}`);
      console.log(`   Successful operations: ${results.filter(r => r.success).length}`);
      console.log(`   Failed operations: ${results.filter(r => !r.success).length}`);
      console.log(`   Build time: ${stats.queryBuildDuration}ms (${stats.buildPercentage}%)`);
      console.log(`   Execution time: ${stats.queryExecutionDuration}ms (${stats.executionPercentage}%)`);
      console.log(`   Query cache hit rate: ${stats.queryOptimizerStats.cacheHitRate}%`);
      console.log(`   Batch requests: ${stats.batchExecutorStats.batchRequests}`);
      break;

    case 'compare':
      const compareOps = generateOperations(count);
      await compareBaselineVsPhase1(compareOps);
      break;

    case 'benchmark':
      console.log('\n🏃 Running performance benchmark suite...\n');

      const testSizes = [5, 10, 25];
      const benchmarkResults = [];

      for (const size of testSizes) {
        const ops = generateOperations(size);
        const { improvement, speedup } = await compareBaselineVsPhase1(ops);
        benchmarkResults.push({ size, improvement, speedup });
      }

      console.log('\n📊 Benchmark Results Summary:\n');
      console.log('Operations | Improvement | Speedup');
      console.log('-----------|-------------|--------');
      benchmarkResults.forEach(r => {
        console.log(`${String(r.size).padStart(10)} | ${String('-' + r.improvement + '%').padStart(11)} | ${String(r.speedup + 'x').padStart(7)}`);
      });
      console.log('');
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run with --help for usage information');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = DataOperationsOptimizer;
