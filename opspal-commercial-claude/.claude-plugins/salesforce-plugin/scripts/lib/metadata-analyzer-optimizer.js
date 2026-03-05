#!/usr/bin/env node
/**
 * Metadata Analyzer Optimizer
 *
 * Purpose: Optimize sfdc-metadata-analyzer agent using Phase 1 batch metadata pattern
 * Performance: 40-50% improvement expected (14.96s → 7.5-9.0s)
 *
 * BEFORE: Individual field metadata fetches (N+1 pattern, 14.96s)
 * AFTER: Batch field metadata with cache (7.5-9.0s)
 *
 * Phase 1: Batch Field Metadata Integration (80% code reuse from Week 2!)
 *
 * @version 1.0.0
 * @phase Performance Optimization (sfdc-metadata-analyzer - Phase 1)
 */

const BatchFieldMetadata = require('./batch-field-metadata'); // Week 2 reuse!

/**
 * Metadata Analyzer Optimizer using batch field metadata
 *
 * Eliminates N+1 field metadata pattern in object analysis
 */
class MetadataAnalyzerOptimizer {
  constructor(options = {}) {
    // Phase 1: Reuse Week 2 batch metadata with cache
    this.batchMetadata = options.batchMetadata || BatchFieldMetadata.withCache({
      maxSize: options.cacheSize || 1000,
      ttl: options.cacheTtl || 3600000 // 1 hour
    });

    this.stats = {
      objectsAnalyzed: 0,
      fieldsAnalyzed: 0,
      totalDuration: 0,
      metadataFetchDuration: 0,
      analysisDuration: 0
    };
  }

  /**
   * Analyze single object metadata using batch field fetching
   *
   * BEFORE: Individual metadata fetch per field (N+1 pattern)
   * AFTER: Single batch fetch for all fields
   *
   * @param {string} objectName - Object API name (e.g., 'Account', 'Opportunity')
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeObject(objectName, options = {}) {
    const startTime = Date.now();

    console.log(`🔍 Analyzing ${objectName}...`);

    // Get all field names for object (fast describe call)
    const objectDesc = await this._describeObject(objectName);
    const fieldNames = objectDesc.fields.map(f => `${objectName}.${f.name}`);

    console.log(`   Found ${fieldNames.length} fields`);

    // Phase 1: Batch fetch all field metadata (Week 2 optimization!)
    const metadataStart = Date.now();
    const metadata = await this.batchMetadata.getMetadata(fieldNames);
    const metadataMap = this._createMetadataMap(metadata);
    const metadataDuration = Date.now() - metadataStart;

    console.log(`   Fetched metadata in ${metadataDuration}ms`);

    // Analyze fields using metadata
    const analysisStart = Date.now();
    const analysis = this._analyzeFields(objectName, objectDesc, metadataMap, options);
    const analysisDuration = Date.now() - analysisStart;

    console.log(`   Analyzed in ${analysisDuration}ms`);

    // Update statistics
    const totalDuration = Date.now() - startTime;
    this.stats.objectsAnalyzed++;
    this.stats.fieldsAnalyzed += fieldNames.length;
    this.stats.totalDuration += totalDuration;
    this.stats.metadataFetchDuration += metadataDuration;
    this.stats.analysisDuration += analysisDuration;

    console.log(`✅ ${objectName} analyzed in ${totalDuration}ms\n`);

    return {
      object: objectName,
      fieldCount: fieldNames.length,
      analysis,
      duration: totalDuration,
      metadataDuration,
      analysisDuration
    };
  }

  /**
   * Analyze multiple objects
   *
   * Phase 1: Sequential analysis (will be optimized in Phase 2 with parallel processing)
   *
   * @param {string[]} objectNames - Array of object API names
   * @param {Object} options - Analysis options
   * @returns {Promise<Object[]>} Analysis results
   */
  async analyzeObjects(objectNames, options = {}) {
    const startTime = Date.now();

    console.log(`\n🔍 Analyzing ${objectNames.length} objects...\n`);

    const results = [];

    // Phase 1: Sequential (will become parallel in Phase 2)
    for (const objectName of objectNames) {
      const result = await this.analyzeObject(objectName, options);
      results.push(result);
    }

    const totalDuration = Date.now() - startTime;

    console.log(`✅ Analyzed ${objectNames.length} objects in ${totalDuration}ms`);
    console.log(`   Average: ${Math.round(totalDuration / objectNames.length)}ms per object\n`);

    return results;
  }

  /**
   * Describe object (simulated - would call Salesforce API in production)
   */
  async _describeObject(objectName) {
    // Simulate API call (50-100ms)
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));

    // Simulate object description with fields
    const fieldCount = objectName === 'Account' ? 50 : objectName === 'Opportunity' ? 40 : 30;

    return {
      name: objectName,
      fields: Array.from({ length: fieldCount }, (_, i) => ({
        name: `Field${i + 1}__c`,
        type: i % 3 === 0 ? 'Text' : i % 3 === 1 ? 'Number' : 'Date',
        label: `Field ${i + 1}`,
        required: i % 5 === 0,
        unique: i % 10 === 0
      }))
    };
  }

  /**
   * Create metadata map for fast lookup
   */
  _createMetadataMap(metadata) {
    const map = new Map();

    for (const field of metadata) {
      const key = `${field.entityName}.${field.fieldName}`;
      map.set(key, field);
    }

    return map;
  }

  /**
   * Analyze fields using metadata
   */
  _analyzeFields(objectName, objectDesc, metadataMap, options = {}) {
    const analysis = {
      requiredFields: [],
      uniqueFields: [],
      formulaFields: [],
      relationshipFields: [],
      customFields: [],
      standardFields: []
    };

    for (const field of objectDesc.fields) {
      const fieldKey = `${objectName}.${field.name}`;
      const metadata = metadataMap.get(fieldKey);

      // Categorize field
      if (field.required) {
        analysis.requiredFields.push(field.name);
      }

      if (field.unique) {
        analysis.uniqueFields.push(field.name);
      }

      if (metadata?.calculatedFormula) {
        analysis.formulaFields.push(field.name);
      }

      if (field.type === 'Lookup' || field.type === 'MasterDetail') {
        analysis.relationshipFields.push(field.name);
      }

      if (field.name.endsWith('__c')) {
        analysis.customFields.push(field.name);
      } else {
        analysis.standardFields.push(field.name);
      }
    }

    return analysis;
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const batchStats = this.batchMetadata.getStats();

    return {
      ...this.stats,
      avgDurationPerObject: this.stats.objectsAnalyzed > 0
        ? Math.round(this.stats.totalDuration / this.stats.objectsAnalyzed)
        : 0,
      avgFieldsPerObject: this.stats.objectsAnalyzed > 0
        ? Math.round(this.stats.fieldsAnalyzed / this.stats.objectsAnalyzed)
        : 0,
      metadataPercentage: this.stats.totalDuration > 0
        ? ((this.stats.metadataFetchDuration / this.stats.totalDuration) * 100).toFixed(1)
        : 0,
      analysisPercentage: this.stats.totalDuration > 0
        ? ((this.stats.analysisDuration / this.stats.totalDuration) * 100).toFixed(1)
        : 0,
      batchMetadataStats: batchStats
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      objectsAnalyzed: 0,
      fieldsAnalyzed: 0,
      totalDuration: 0,
      metadataFetchDuration: 0,
      analysisDuration: 0
    };
    this.batchMetadata.resetStats();
  }
}

/**
 * Compare baseline vs Phase 1 optimization
 */
async function compareBaselineVsPhase1(objectNames) {
  console.log('\n📊 Performance Comparison: Baseline vs Phase 1\n');
  console.log(`Objects: ${objectNames.join(', ')}\n`);

  // Simulate baseline (individual field metadata fetches)
  console.log('❌ BASELINE (Individual Field Metadata Fetches):');
  const baselineStart = Date.now();

  for (const objectName of objectNames) {
    // Simulate object describe (50-100ms)
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));

    // Simulate individual field metadata fetches (50 fields × 200-400ms each)
    const fieldCount = objectName === 'Account' ? 50 : objectName === 'Opportunity' ? 40 : 30;
    for (let i = 0; i < fieldCount; i++) {
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 200));
    }
  }

  const baselineDuration = Date.now() - baselineStart;
  console.log(`   Total: ${baselineDuration}ms\n`);

  // Phase 1: Batch metadata with cache
  console.log('✅ PHASE 1 (Batch Field Metadata + Cache):');
  const optimizer = new MetadataAnalyzerOptimizer();
  const phase1Start = Date.now();

  await optimizer.analyzeObjects(objectNames);

  const phase1Duration = Date.now() - phase1Start;
  const stats = optimizer.getStats();

  console.log(`   Total: ${phase1Duration}ms`);
  console.log(`   Metadata fetch: ${stats.metadataFetchDuration}ms (${stats.metadataPercentage}%)`);
  console.log(`   Analysis: ${stats.analysisDuration}ms (${stats.analysisPercentage}%)`);
  console.log(`   Cache hit rate: ${stats.batchMetadataStats.cacheHitRate}%`);
  console.log(`   Avg per object: ${stats.avgDurationPerObject}ms\n`);

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
Metadata Analyzer Optimizer - Phase 1

Usage:
  node metadata-analyzer-optimizer.js <command> [options]

Commands:
  test <objects...>   Test metadata analysis for objects
  compare <objects...> Compare baseline vs Phase 1
  benchmark           Run performance benchmark suite

Examples:
  # Test with Account object
  node metadata-analyzer-optimizer.js test Account

  # Compare baseline vs Phase 1 for multiple objects
  node metadata-analyzer-optimizer.js compare Account Opportunity Contact

  # Run full benchmark
  node metadata-analyzer-optimizer.js benchmark
    `);
    process.exit(0);
  }

  const command = args[0];
  const objectNames = args.slice(1);

  switch (command) {
    case 'test':
      if (objectNames.length === 0) {
        console.error('Error: No objects specified');
        console.log('Usage: node metadata-analyzer-optimizer.js test Account Opportunity');
        process.exit(1);
      }

      console.log(`\n🧪 Testing metadata analysis for ${objectNames.length} objects...\n`);
      const optimizer = new MetadataAnalyzerOptimizer();
      const start = Date.now();
      const results = await optimizer.analyzeObjects(objectNames);
      const duration = Date.now() - start;
      const stats = optimizer.getStats();

      console.log(`✅ Completed analysis in ${duration}ms`);
      console.log(`   Objects analyzed: ${stats.objectsAnalyzed}`);
      console.log(`   Fields analyzed: ${stats.fieldsAnalyzed}`);
      console.log(`   Avg per object: ${stats.avgDurationPerObject}ms`);
      console.log(`   Metadata fetch: ${stats.metadataFetchDuration}ms (${stats.metadataPercentage}%)`);
      console.log(`   Analysis: ${stats.analysisDuration}ms (${stats.analysisPercentage}%)`);
      console.log(`   Cache hit rate: ${stats.batchMetadataStats.cacheHitRate}%`);

      console.log('\n📊 Analysis Results:');
      results.forEach(result => {
        console.log(`\n   ${result.object}:`);
        console.log(`      Fields: ${result.fieldCount}`);
        console.log(`      Required: ${result.analysis.requiredFields.length}`);
        console.log(`      Unique: ${result.analysis.uniqueFields.length}`);
        console.log(`      Custom: ${result.analysis.customFields.length}`);
        console.log(`      Standard: ${result.analysis.standardFields.length}`);
      });
      break;

    case 'compare':
      if (objectNames.length === 0) {
        console.error('Error: No objects specified');
        console.log('Usage: node metadata-analyzer-optimizer.js compare Account Opportunity');
        process.exit(1);
      }

      await compareBaselineVsPhase1(objectNames);
      break;

    case 'benchmark':
      console.log('\n🏃 Running performance benchmark suite...\n');

      const testCases = [
        ['Account'],
        ['Account', 'Opportunity'],
        ['Account', 'Opportunity', 'Contact', 'Lead', 'Case']
      ];

      const benchmarkResults = [];

      for (const objects of testCases) {
        const { improvement, speedup } = await compareBaselineVsPhase1(objects);
        benchmarkResults.push({ objects: objects.length, improvement, speedup });
      }

      console.log('\n📊 Benchmark Results Summary:\n');
      console.log('Objects | Improvement | Speedup');
      console.log('--------|-------------|--------');
      benchmarkResults.forEach(r => {
        console.log(`${String(r.objects).padStart(7)} | ${String('-' + r.improvement + '%').padStart(11)} | ${String(r.speedup + 'x').padStart(7)}`);
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

module.exports = MetadataAnalyzerOptimizer;
