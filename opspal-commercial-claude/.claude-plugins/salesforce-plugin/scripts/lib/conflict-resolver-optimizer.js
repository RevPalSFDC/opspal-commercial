#!/usr/bin/env node
/**
 * Conflict Resolver Optimizer
 *
 * Purpose: Optimize sfdc-conflict-resolver agent using proven patterns from Week 2
 * Performance: 50-60% improvement expected (6.26s → 3.0-3.5s)
 *
 * BEFORE: Sequential field comparisons with individual metadata fetches
 * AFTER: Batch metadata + parallel comparison + pre-computed rules
 *
 * Phase 1: Batch metadata integration (20-25% improvement)
 * Phase 2: Parallel comparison + pre-computed rules (30-35% improvement)
 *
 * @version 1.0.0
 * @phase Performance Optimization (sfdc-conflict-resolver)
 */

const BatchFieldMetadata = require('./batch-field-metadata');

/**
 * Optimized conflict resolver with batch metadata
 */
class ConflictResolverOptimizer {
  constructor(options = {}) {
    // Phase 1: Use batch metadata with cache from Week 2
    this.batchMetadata = options.batchMetadata || BatchFieldMetadata.withCache({
      maxSize: options.cacheSize || 1000,
      ttl: options.cacheTtl || 3600000 // 1 hour default
    });

    this.stats = {
      resolutions: 0,
      conflicts: 0,
      criticalConflicts: 0,
      warningConflicts: 0,
      totalDuration: 0,
      metadataFetchDuration: 0,
      comparisonDuration: 0
    };
  }

  /**
   * Resolve conflicts for multiple field pairs
   *
   * Phase 1: Uses batch metadata
   * Phase 2: Will add parallel comparison
   *
   * @param {Object[]} fieldPairs - Array of {source, target} field pairs
   * @param {Object} options - Resolution options
   * @returns {Promise<Object[]>} Conflict resolution results
   */
  async resolveConflicts(fieldPairs, options = {}) {
    const startTime = Date.now();

    if (!fieldPairs || fieldPairs.length === 0) {
      return [];
    }

    console.log(`🔍 Resolving conflicts for ${fieldPairs.length} field pairs...`);

    // Phase 1: Batch fetch all field metadata (Week 2 optimization)
    const metadataStart = Date.now();
    const allFields = this._extractAllFields(fieldPairs);
    const metadata = await this.batchMetadata.getMetadata(allFields);
    const metadataMap = this._createMetadataMap(metadata);
    const metadataDuration = Date.now() - metadataStart;

    console.log(`📦 Fetched metadata for ${allFields.length} fields in ${metadataDuration}ms`);

    // Phase 1: Sequential comparison (will be optimized in Phase 2)
    const comparisonStart = Date.now();
    const results = [];

    for (const pair of fieldPairs) {
      const result = await this._resolveFieldPairConflict(pair, metadataMap, options);
      results.push(result);
    }

    const comparisonDuration = Date.now() - comparisonStart;

    // Update statistics
    const totalDuration = Date.now() - startTime;
    this.stats.resolutions++;
    this.stats.conflicts += results.reduce((sum, r) => sum + r.conflicts.length, 0);
    this.stats.criticalConflicts += results.reduce((sum, r) =>
      sum + r.conflicts.filter(c => c.severity === 'critical').length, 0);
    this.stats.warningConflicts += results.reduce((sum, r) =>
      sum + r.conflicts.filter(c => c.severity === 'warning').length, 0);
    this.stats.totalDuration += totalDuration;
    this.stats.metadataFetchDuration += metadataDuration;
    this.stats.comparisonDuration += comparisonDuration;

    console.log(`✅ Conflict resolution complete: ${this.stats.conflicts} conflicts found in ${totalDuration}ms`);
    console.log(`   Metadata: ${metadataDuration}ms, Comparison: ${comparisonDuration}ms`);

    return results;
  }

  /**
   * Extract all unique fields from field pairs
   * @private
   */
  _extractAllFields(fieldPairs) {
    const fields = new Set();

    for (const pair of fieldPairs) {
      if (pair.source) fields.add(pair.source);
      if (pair.target) fields.add(pair.target);
    }

    return Array.from(fields);
  }

  /**
   * Create metadata lookup map for O(1) access
   * @private
   */
  _createMetadataMap(metadata) {
    const map = new Map();

    for (const meta of metadata) {
      map.set(meta.fullName, meta);
    }

    return map;
  }

  /**
   * Resolve conflicts for a single field pair
   * @private
   */
  async _resolveFieldPairConflict(pair, metadataMap, options) {
    const sourceMeta = metadataMap.get(pair.source);
    const targetMeta = metadataMap.get(pair.target);

    if (!sourceMeta || !targetMeta) {
      return {
        pair,
        conflicts: [],
        resolution: 'error',
        error: `Missing metadata for ${!sourceMeta ? pair.source : pair.target}`
      };
    }

    const conflicts = [];

    // Type mismatch check (critical)
    if (sourceMeta.type !== targetMeta.type) {
      conflicts.push({
        type: 'type_mismatch',
        severity: 'critical',
        source: pair.source,
        target: pair.target,
        message: `Field types don't match: ${sourceMeta.type} vs ${targetMeta.type}`,
        resolution: 'Cannot merge fields with different types',
        autoResolvable: false
      });
    }

    // Required field conflict (warning)
    if (sourceMeta.required && !targetMeta.required) {
      conflicts.push({
        type: 'required_mismatch',
        severity: 'warning',
        source: pair.source,
        target: pair.target,
        message: 'Source field is required but target is not',
        resolution: 'Make target field required or handle null values',
        autoResolvable: true,
        suggestedAction: 'update_target_required'
      });
    }

    // Unique field conflict (critical)
    if (sourceMeta.unique && targetMeta.unique) {
      conflicts.push({
        type: 'unique_conflict',
        severity: 'critical',
        source: pair.source,
        target: pair.target,
        message: 'Both fields are unique - potential duplicate key violations',
        resolution: 'Remove unique constraint or validate data uniqueness',
        autoResolvable: false
      });
    }

    // External ID conflict (warning)
    if (sourceMeta.externalId && targetMeta.externalId) {
      conflicts.push({
        type: 'external_id_conflict',
        severity: 'warning',
        source: pair.source,
        target: pair.target,
        message: 'Both fields are external IDs',
        resolution: 'Keep one as external ID',
        autoResolvable: true,
        suggestedAction: 'keep_target_external_id'
      });
    }

    // Field history tracking conflict (warning)
    if (sourceMeta.trackHistory && !targetMeta.trackHistory) {
      conflicts.push({
        type: 'history_tracking_mismatch',
        severity: 'warning',
        source: pair.source,
        target: pair.target,
        message: 'Source field tracks history but target does not',
        resolution: 'Enable field history on target or accept history loss',
        autoResolvable: true,
        suggestedAction: 'enable_target_history'
      });
    }

    // Determine overall resolution
    const hasCritical = conflicts.some(c => c.severity === 'critical');
    const resolution = hasCritical ? 'blocked' :
                      conflicts.length > 0 ? 'review' : 'approved';

    return {
      pair,
      conflicts,
      resolution,
      conflictCount: conflicts.length,
      criticalCount: conflicts.filter(c => c.severity === 'critical').length,
      warningCount: conflicts.filter(c => c.severity === 'warning').length,
      autoResolvable: conflicts.every(c => c.autoResolvable === true)
    };
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      ...this.stats,
      avgDurationPerResolution: this.stats.resolutions > 0
        ? Math.round(this.stats.totalDuration / this.stats.resolutions)
        : 0,
      avgConflictsPerResolution: this.stats.resolutions > 0
        ? (this.stats.conflicts / this.stats.resolutions).toFixed(2)
        : 0,
      metadataPercentage: this.stats.totalDuration > 0
        ? ((this.stats.metadataFetchDuration / this.stats.totalDuration) * 100).toFixed(1)
        : 0,
      comparisonPercentage: this.stats.totalDuration > 0
        ? ((this.stats.comparisonDuration / this.stats.totalDuration) * 100).toFixed(1)
        : 0,
      batchMetadataStats: this.batchMetadata.getStats()
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      resolutions: 0,
      conflicts: 0,
      criticalConflicts: 0,
      warningConflicts: 0,
      totalDuration: 0,
      metadataFetchDuration: 0,
      comparisonDuration: 0
    };
  }
}

/**
 * Compare baseline vs Phase 1 optimization
 */
async function compareBaselineVsPhase1(fieldPairs) {
  console.log('\n📊 Performance Comparison: Baseline vs Phase 1\n');
  console.log(`Field pairs: ${fieldPairs.length}\n`);

  // Simulate baseline (individual metadata fetches)
  console.log('❌ BASELINE (Individual Metadata Fetches):');
  const baselineStart = Date.now();

  for (const pair of fieldPairs) {
    await simulateIndividualMetadataFetch(pair.source);
    await simulateIndividualMetadataFetch(pair.target);
    await simulateFieldComparison(); // Sequential comparison
  }

  const baselineDuration = Date.now() - baselineStart;
  console.log(`   Total: ${baselineDuration}ms\n`);

  // Phase 1: Batch metadata
  console.log('✅ PHASE 1 (Batch Metadata):');
  const optimizer = new ConflictResolverOptimizer();
  const phase1Start = Date.now();

  await optimizer.resolveConflicts(fieldPairs);

  const phase1Duration = Date.now() - phase1Start;
  const stats = optimizer.getStats();
  console.log(`\n   Total: ${phase1Duration}ms`);
  console.log(`   Metadata: ${stats.metadataFetchDuration}ms (${stats.metadataPercentage}%)`);
  console.log(`   Comparison: ${stats.comparisonDuration}ms (${stats.comparisonPercentage}%)\n`);

  // Calculate improvement
  const improvement = Math.round(((baselineDuration - phase1Duration) / baselineDuration) * 100);
  const speedup = (baselineDuration / phase1Duration).toFixed(2);

  console.log('📈 Results:');
  console.log(`   Baseline: ${baselineDuration}ms`);
  console.log(`   Phase 1: ${phase1Duration}ms`);
  console.log(`   Improvement: -${improvement}%`);
  console.log(`   Speedup: ${speedup}x faster`);
  console.log(`   Cache hit rate: ${stats.batchMetadataStats.cacheHitRate}%\n`);

  return { baselineDuration, phase1Duration, improvement, speedup };
}

/**
 * Simulate individual metadata fetch (for baseline comparison)
 */
async function simulateIndividualMetadataFetch(field) {
  // Simulate API call latency (100-200ms per field)
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
}

/**
 * Simulate field comparison (for baseline)
 */
async function simulateFieldComparison() {
  // Simulate comparison logic (50-100ms)
  await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
}

/**
 * CLI for testing
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Conflict Resolver Optimizer - Phase 1

Usage:
  node conflict-resolver-optimizer.js <command> [options]

Commands:
  test <count>        Test conflict resolution for N field pairs
  compare <count>     Compare baseline vs Phase 1
  benchmark           Run performance benchmark suite

Examples:
  # Test with 10 field pairs
  node conflict-resolver-optimizer.js test 10

  # Compare baseline vs Phase 1
  node conflict-resolver-optimizer.js compare 10

  # Run full benchmark
  node conflict-resolver-optimizer.js benchmark
    `);
    process.exit(0);
  }

  const command = args[0];
  const count = parseInt(args[1] || '10', 10);

  // Generate test field pairs
  const generateFieldPairs = (n) => {
    return Array.from({ length: n }, (_, i) => ({
      source: `Account.SourceField${i + 1}__c`,
      target: `Account.TargetField${i + 1}__c`
    }));
  };

  switch (command) {
    case 'test':
      console.log(`\n🧪 Testing conflict resolution for ${count} field pairs...\n`);
      const optimizer = new ConflictResolverOptimizer();
      const testPairs = generateFieldPairs(count);
      const start = Date.now();
      const results = await optimizer.resolveConflicts(testPairs);
      const duration = Date.now() - start;
      const stats = optimizer.getStats();

      console.log(`\n✅ Resolved conflicts for ${count} field pairs in ${duration}ms`);
      console.log(`   Total conflicts: ${stats.conflicts}`);
      console.log(`   Critical: ${stats.criticalConflicts}`);
      console.log(`   Warnings: ${stats.warningConflicts}`);
      console.log(`   Metadata: ${stats.metadataFetchDuration}ms (${stats.metadataPercentage}%)`);
      console.log(`   Comparison: ${stats.comparisonDuration}ms (${stats.comparisonPercentage}%)`);
      break;

    case 'compare':
      const comparePairs = generateFieldPairs(count);
      await compareBaselineVsPhase1(comparePairs);
      break;

    case 'benchmark':
      console.log('\n🏃 Running performance benchmark suite...\n');

      const testSizes = [5, 10, 20];
      const benchmarkResults = [];

      for (const size of testSizes) {
        const pairs = generateFieldPairs(size);
        const { improvement, speedup } = await compareBaselineVsPhase1(pairs);
        benchmarkResults.push({ size, improvement, speedup });
      }

      console.log('\n📊 Benchmark Results Summary:\n');
      console.log('Field Pairs | Improvement | Speedup');
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

module.exports = ConflictResolverOptimizer;
