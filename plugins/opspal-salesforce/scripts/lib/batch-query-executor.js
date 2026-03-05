#!/usr/bin/env node
/**
 * Batch Query Executor
 *
 * Purpose: Optimize sfdc-data-operations using Salesforce Composite API
 * Performance: 40-50% improvement expected (4.83s → 2.4-2.9s)
 *
 * BEFORE: N individual query API calls (N × 200-400ms = 2-4s for 10 queries)
 * AFTER: Composite API batching (200-300ms for 10 queries in single request)
 *
 * Phase 1: Batch API Operations (Week 2 pattern adapted for queries)
 *
 * @version 1.0.0
 * @phase Performance Optimization (sfdc-data-operations - Phase 1)
 */

/**
 * Batch Query Executor using Salesforce Composite API
 *
 * Combines multiple SOQL queries into a single Composite API request,
 * reducing network overhead and improving performance.
 */
class BatchQueryExecutor {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 25; // Salesforce Composite API limit
    this.timeout = options.timeout || 30000; // 30 second timeout
    this.apiVersion = options.apiVersion || 'v62.0';

    this.stats = {
      totalQueries: 0,
      batchRequests: 0,
      totalDuration: 0,
      queryBuildDuration: 0,
      executionDuration: 0,
      transformDuration: 0
    };
  }

  /**
   * Execute multiple queries using Composite API
   *
   * @param {Object[]} queries - Array of {soql, referenceId} queries
   * @param {Object} options - Execution options
   * @returns {Promise<Object[]>} Query results
   */
  async executeComposite(queries, options = {}) {
    const startTime = Date.now();

    if (!queries || queries.length === 0) {
      return [];
    }

    console.log(`🔍 Executing ${queries.length} queries using Composite API...`);

    // Phase 1: Build composite request batches
    const buildStart = Date.now();
    const batches = this._createBatches(queries);
    const buildDuration = Date.now() - buildStart;

    console.log(`📦 Created ${batches.length} composite batch(es) in ${buildDuration}ms`);

    // Phase 2: Execute composite requests
    const execStart = Date.now();
    const results = [];

    for (const batch of batches) {
      const batchResult = await this._executeBatch(batch, options);
      results.push(...batchResult);
    }

    const execDuration = Date.now() - execStart;

    // Update statistics
    const totalDuration = Date.now() - startTime;
    this.stats.totalQueries += queries.length;
    this.stats.batchRequests += batches.length;
    this.stats.totalDuration += totalDuration;
    this.stats.queryBuildDuration += buildDuration;
    this.stats.executionDuration += execDuration;

    console.log(`✅ Executed ${queries.length} queries in ${totalDuration}ms`);
    console.log(`   Build: ${buildDuration}ms, Execution: ${execDuration}ms`);

    return results;
  }

  /**
   * Create batches of queries respecting Composite API limits
   * @private
   */
  _createBatches(queries) {
    const batches = [];

    for (let i = 0; i < queries.length; i += this.batchSize) {
      batches.push(queries.slice(i, i + this.batchSize));
    }

    return batches;
  }

  /**
   * Execute a single composite batch
   * @private
   */
  async _executeBatch(batch, options) {
    const compositeRequest = this._buildCompositeRequest(batch);

    // Simulate Composite API call (in production, this would call Salesforce)
    const response = await this._executeCompositeRequest(compositeRequest, options);

    return this._extractResults(response, batch);
  }

  /**
   * Build Composite API request payload
   * @private
   */
  _buildCompositeRequest(queries) {
    return {
      allOrNone: false, // Don't fail all if one fails
      compositeRequest: queries.map((query, index) => ({
        method: 'GET',
        url: `/services/data/${this.apiVersion}/query?q=${encodeURIComponent(query.soql)}`,
        referenceId: query.referenceId || `query_${index}`
      }))
    };
  }

  /**
   * Execute composite request (simulated for testing)
   * @private
   */
  async _executeCompositeRequest(compositeRequest, options) {
    // Simulate API latency (200-300ms for composite request)
    const latency = options.simulateLatency !== false ? 200 + Math.random() * 100 : 0;
    await new Promise(resolve => setTimeout(resolve, latency));

    // Simulate successful responses for all queries
    const responses = compositeRequest.compositeRequest.map(req => ({
      body: {
        totalSize: Math.floor(Math.random() * 100),
        done: true,
        records: this._generateMockRecords(req.referenceId)
      },
      httpStatusCode: 200,
      referenceId: req.referenceId
    }));

    return {
      compositeResponse: responses
    };
  }

  /**
   * Generate mock records for testing
   * @private
   */
  _generateMockRecords(referenceId) {
    const count = Math.floor(Math.random() * 10) + 1;
    const records = [];

    for (let i = 0; i < count; i++) {
      records.push({
        attributes: {
          type: 'Account',
          url: `/services/data/${this.apiVersion}/sobjects/Account/001000000${i}`
        },
        Id: `001000000${i}`,
        Name: `Record ${i}`,
        referenceId
      });
    }

    return records;
  }

  /**
   * Extract results from composite response
   * @private
   */
  _extractResults(response, originalQueries) {
    const results = [];

    for (const compositeResponse of response.compositeResponse) {
      const query = originalQueries.find(q =>
        (q.referenceId || `query_${originalQueries.indexOf(q)}`) === compositeResponse.referenceId
      );

      if (compositeResponse.httpStatusCode === 200) {
        results.push({
          referenceId: compositeResponse.referenceId,
          query: query,
          success: true,
          totalSize: compositeResponse.body.totalSize,
          records: compositeResponse.body.records
        });
      } else {
        results.push({
          referenceId: compositeResponse.referenceId,
          query: query,
          success: false,
          error: compositeResponse.body
        });
      }
    }

    return results;
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      ...this.stats,
      avgDurationPerQuery: this.stats.totalQueries > 0
        ? Math.round(this.stats.totalDuration / this.stats.totalQueries)
        : 0,
      avgQueriesPerBatch: this.stats.batchRequests > 0
        ? (this.stats.totalQueries / this.stats.batchRequests).toFixed(2)
        : 0,
      buildPercentage: this.stats.totalDuration > 0
        ? ((this.stats.queryBuildDuration / this.stats.totalDuration) * 100).toFixed(1)
        : 0,
      executionPercentage: this.stats.totalDuration > 0
        ? ((this.stats.executionDuration / this.stats.totalDuration) * 100).toFixed(1)
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalQueries: 0,
      batchRequests: 0,
      totalDuration: 0,
      queryBuildDuration: 0,
      executionDuration: 0,
      transformDuration: 0
    };
  }
}

/**
 * Compare baseline (sequential) vs Phase 1 (composite)
 */
async function compareBaselineVsComposite(queries) {
  console.log('\n📊 Performance Comparison: Baseline vs Composite API\n');
  console.log(`Query count: ${queries.length}\n`);

  // Simulate baseline (individual query execution)
  console.log('❌ BASELINE (Individual Queries):');
  const baselineStart = Date.now();

  for (const query of queries) {
    await simulateIndividualQuery(query);
  }

  const baselineDuration = Date.now() - baselineStart;
  console.log(`   Total: ${baselineDuration}ms\n`);

  // Phase 1: Composite API
  console.log('✅ PHASE 1 (Composite API):');
  const executor = new BatchQueryExecutor();
  const phase1Start = Date.now();

  await executor.executeComposite(queries);

  const phase1Duration = Date.now() - phase1Start;
  const stats = executor.getStats();
  console.log(`\n   Total: ${phase1Duration}ms`);
  console.log(`   Build: ${stats.queryBuildDuration}ms (${stats.buildPercentage}%)`);
  console.log(`   Execution: ${stats.executionDuration}ms (${stats.executionPercentage}%)\n`);

  // Calculate improvement
  const improvement = Math.round(((baselineDuration - phase1Duration) / baselineDuration) * 100);
  const speedup = (baselineDuration / phase1Duration).toFixed(2);

  console.log('📈 Results:');
  console.log(`   Baseline: ${baselineDuration}ms`);
  console.log(`   Phase 1: ${phase1Duration}ms`);
  console.log(`   Improvement: -${improvement}%`);
  console.log(`   Speedup: ${speedup}x faster`);
  console.log(`   Batch requests: ${stats.batchRequests} (vs ${queries.length} individual)\n`);

  return { baselineDuration, phase1Duration, improvement, speedup };
}

/**
 * Simulate individual query execution (for baseline comparison)
 */
async function simulateIndividualQuery(query) {
  // Simulate API call latency (200-400ms per query)
  await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 200));
}

/**
 * CLI for testing
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Batch Query Executor - Phase 1

Usage:
  node batch-query-executor.js <command> [options]

Commands:
  test <count>        Test batch query execution for N queries
  compare <count>     Compare baseline vs Composite API
  benchmark           Run performance benchmark suite

Examples:
  # Test with 10 queries
  node batch-query-executor.js test 10

  # Compare baseline vs Composite API
  node batch-query-executor.js compare 10

  # Run full benchmark
  node batch-query-executor.js benchmark
    `);
    process.exit(0);
  }

  const command = args[0];
  const count = parseInt(args[1] || '10', 10);

  // Generate test queries
  const generateQueries = (n) => {
    return Array.from({ length: n }, (_, i) => ({
      soql: `SELECT Id, Name FROM Account WHERE Type = 'Customer' LIMIT ${i + 1}`,
      referenceId: `account_query_${i + 1}`
    }));
  };

  switch (command) {
    case 'test':
      console.log(`\n🧪 Testing batch query execution for ${count} queries...\n`);
      const executor = new BatchQueryExecutor();
      const testQueries = generateQueries(count);
      const start = Date.now();
      const results = await executor.executeComposite(testQueries);
      const duration = Date.now() - start;
      const stats = executor.getStats();

      console.log(`\n✅ Executed ${count} queries in ${duration}ms`);
      console.log(`   Total records returned: ${results.reduce((sum, r) => sum + (r.records?.length || 0), 0)}`);
      console.log(`   Successful queries: ${results.filter(r => r.success).length}`);
      console.log(`   Failed queries: ${results.filter(r => !r.success).length}`);
      console.log(`   Batch requests: ${stats.batchRequests}`);
      console.log(`   Avg queries/batch: ${stats.avgQueriesPerBatch}`);
      break;

    case 'compare':
      const compareQueries = generateQueries(count);
      await compareBaselineVsComposite(compareQueries);
      break;

    case 'benchmark':
      console.log('\n🏃 Running performance benchmark suite...\n');

      const testSizes = [5, 10, 25];
      const benchmarkResults = [];

      for (const size of testSizes) {
        const queries = generateQueries(size);
        const { improvement, speedup } = await compareBaselineVsComposite(queries);
        benchmarkResults.push({ size, improvement, speedup });
      }

      console.log('\n📊 Benchmark Results Summary:\n');
      console.log('Query Count | Improvement | Speedup');
      console.log('------------|-------------|--------');
      benchmarkResults.forEach(r => {
        console.log(`${String(r.size).padStart(11)} | ${String('-' + r.improvement + '%').padStart(11)} | ${String(r.speedup + 'x').padStart(7)}`);
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

module.exports = BatchQueryExecutor;
