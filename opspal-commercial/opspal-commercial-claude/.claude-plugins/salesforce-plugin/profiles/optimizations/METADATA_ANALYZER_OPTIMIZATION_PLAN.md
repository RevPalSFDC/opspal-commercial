# sfdc-metadata-analyzer Optimization Plan

**Date**: 2025-10-18
**Agent**: sfdc-metadata-analyzer
**Status**: 🔄 IN PROGRESS - Phase 0 Complete (Planning)
**Using**: Performance Optimization Playbook v1.0.0

---

## Phase 0: Baseline Analysis ✅

### Baseline Metrics (From Week 1 Profiling)

```json
{
  "agentName": "sfdc-metadata-analyzer",
  "avgDuration": 14963,          // 14.96s
  "performanceScore": 80,        // 80/100
  "criticalBottleneck": {
    "segment": "Objects enumerated → Fields analyzed",
    "duration": 7500,            // 7.5s
    "percentOfTotal": 50.1       // 50.1% - CRITICAL!
  },
  "cpuUtilization": 100.5        // CPU-bound (100.5%)
}
```

### Bottleneck Analysis

**Critical Bottleneck** (50.1% of execution):
- **Segment**: Objects enumerated → Fields analyzed
- **Duration**: 7.5s out of 14.96s total
- **Severity**: CRITICAL (>50% threshold)
- **Issue**: Field analysis likely involves N+1 metadata fetching pattern

**Secondary Issues**:
- High CPU utilization (100.5%)
- Long overall execution time (14.96s)
- Relationships mapping takes 3.3s (22%)
- No evidence of caching or batch operations

---

## Optimization Targets

### Performance Targets

| Metric | Baseline | Target | Improvement |
|--------|----------|--------|-------------|
| **Execution Time** | 14.96s | <7.0s | -53% |
| **Performance Score** | 80/100 | 90+/100 | +10 points |
| **Critical Bottlenecks** | 1 (50.1%) | 0 | Eliminated |
| **CPU Utilization** | 100.5% | <80% | -20% |

### Success Criteria

- [ ] Execution time <7.0s (-53% minimum)
- [ ] Performance score ≥90/100
- [ ] Critical bottleneck eliminated (field analysis <30% of total)
- [ ] All tests passing (100% pass rate)
- [ ] No regressions in functionality

---

## Pattern Selection (Using Playbook Decision Tree)

### Decision Tree Analysis

```
START: Bottleneck in field analysis (CPU-bound, 50.1%)

Q1: Is the bottleneck in API calls?
A1: YES - field analysis likely involves individual metadata fetches

Q2: Is the bottleneck in sequential processing?
A2: YES - fields analyzed sequentially

Q3: Is the bottleneck in repeated data access?
A3: YES - same field metadata likely accessed multiple times

Q4: Is there agent overhead?
A4: NO - this IS the metadata analyzer agent
```

### Selected Patterns

**Pattern 1: Batch Field Metadata** ✅
- **Why**: Field analysis involves N+1 metadata fetching
- **Expected**: 80-96% improvement in field analysis segment
- **Reuse**: Week 2 `BatchFieldMetadata.withCache()` (already proven!)
- **Implementation**: Direct reuse from sfdc-merge-orchestrator optimization

**Pattern 2: Parallel Object Analysis** ✅
- **Why**: Objects can be analyzed independently
- **Expected**: 40-60% improvement in overall execution
- **Reuse**: Week 2 parallel processing pattern
- **Implementation**: Use Promise.all() for independent object analysis

**Pattern 3: Metadata Caching** ✅ (Included via Pattern 1)
- **Why**: Same metadata accessed repeatedly
- **Expected**: 80%+ cache hit rate, near-zero latency for hits
- **Reuse**: Week 2 `FieldMetadataCache` (included in BatchFieldMetadata)
- **Implementation**: Automatic via `BatchFieldMetadata.withCache()`

**Pattern 4: Progressive Analysis** 🆕 (Optional - Phase 2)
- **Why**: Large orgs may have 100+ objects to analyze
- **Expected**: Better UX, ability to cancel/resume
- **Implementation**: Analyze objects in batches, yield progress

### Combining Patterns

**Recommended Approach**: Patterns 1 + 2 (Batch Metadata + Parallel Analysis)

**Expected Combined Impact**:
- Phase 1 (Batch Metadata): ~40-50% improvement
- Phase 2 (Parallel Analysis): ~30-40% additional improvement
- **Total**: ~70-90% improvement (exceeds -53% target)

---

## Implementation Strategy

### Phase 1: Batch Field Metadata Integration (2-3 hours)

**Goal**: Eliminate N+1 field metadata pattern in field analysis

**Implementation**:
```javascript
const BatchFieldMetadata = require('./batch-field-metadata'); // Week 2 reuse!

class MetadataAnalyzerOptimizer {
  constructor(options = {}) {
    // Phase 1: Reuse Week 2 batch metadata with cache
    this.batchMetadata = BatchFieldMetadata.withCache({
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
   * Analyze object metadata using batch field fetching
   *
   * BEFORE: Individual metadata fetch per field (N+1 pattern)
   * AFTER: Single batch fetch for all fields
   */
  async analyzeObject(objectName, options = {}) {
    const startTime = Date.now();

    // Get all field names for object (fast describe call)
    const objectDesc = await this._describeObject(objectName);
    const fieldNames = objectDesc.fields.map(f => `${objectName}.${f.name}`);

    // Phase 1: Batch fetch all field metadata
    const metadataStart = Date.now();
    const metadata = await this.batchMetadata.getMetadata(fieldNames);
    const metadataMap = this._createMetadataMap(metadata);
    const metadataDuration = Date.now() - metadataStart;

    // Analyze fields using metadata
    const analysisStart = Date.now();
    const analysis = this._analyzeFields(objectName, metadataMap, options);
    const analysisDuration = Date.now() - analysisStart;

    // Update statistics
    const totalDuration = Date.now() - startTime;
    this.stats.objectsAnalyzed++;
    this.stats.fieldsAnalyzed += fieldNames.length;
    this.stats.totalDuration += totalDuration;
    this.stats.metadataFetchDuration += metadataDuration;
    this.stats.analysisDuration += analysisDuration;

    return analysis;
  }
}
```

**Tasks**:
- [ ] Create `metadata-analyzer-optimizer.js` (reusing BatchFieldMetadata)
- [ ] Write 10+ tests (5 unit + 3 performance + 2 integration)
- [ ] Benchmark improvement (target: 40-50%)
- [ ] Expected: 14.96s → ~7.5-9.0s

**Reusing from Week 2**:
- `BatchFieldMetadata.withCache()` - Zero new code needed!
- `FieldMetadataCache` - Included automatically
- Test patterns - Proven structure

---

### Phase 2: Parallel Object Analysis (2-3 hours)

**Goal**: Analyze multiple objects in parallel instead of sequentially

**Implementation**:
```javascript
class ParallelMetadataAnalyzer {
  constructor(optimizer, options = {}) {
    this.optimizer = optimizer;
    this.maxConcurrent = options.maxConcurrent || 5; // Respect rate limits
  }

  /**
   * Analyze multiple objects in parallel
   *
   * BEFORE: Sequential object analysis (N × 1.5s = 15s for 10 objects)
   * AFTER: Parallel object analysis (1.5s total with 5 workers)
   */
  async analyzeObjects(objectNames, options = {}) {
    const results = [];

    // Process in batches to respect concurrency limit
    for (let i = 0; i < objectNames.length; i += this.maxConcurrent) {
      const batch = objectNames.slice(i, i + this.maxConcurrent);

      // Analyze batch in parallel
      const batchResults = await Promise.all(
        batch.map(obj => this.optimizer.analyzeObject(obj, options))
      );

      results.push(...batchResults);
    }

    return results;
  }
}
```

**Tasks**:
- [ ] Add parallel analysis method to optimizer
- [ ] Write 8+ tests (parallel execution, error handling, rate limits)
- [ ] Benchmark improvement (target: 30-40%)
- [ ] Expected: 7.5-9.0s → ~4.5-6.0s (combined with Phase 1)

**Reusing from Week 2**:
- Parallel processing pattern (Promise.all())
- Rate limit protection pattern
- Error handling for parallel operations

---

### Phase 3: Progressive Analysis (Optional, 1-2 hours)

**Goal**: Provide progress feedback for large analysis operations

**Implementation**:
```javascript
async analyzeObjectsProgressively(objectNames, onProgress) {
  for (let i = 0; i < objectNames.length; i++) {
    const result = await this.optimizer.analyzeObject(objectNames[i]);

    // Yield progress
    onProgress({
      current: i + 1,
      total: objectNames.length,
      percent: ((i + 1) / objectNames.length * 100).toFixed(1),
      object: objectNames[i],
      result
    });
  }
}
```

**Tasks**:
- [ ] Add progress callback support
- [ ] Write 5+ tests (progress events, cancellation)
- [ ] User testing for UX improvement

**Recommendation**: Skip unless analyzing very large orgs (100+ objects)

---

## Test Strategy

### Minimum Test Coverage

Following playbook standards:

**Phase 1 Tests** (10+ tests):
- **Unit Tests (5)**:
  - [ ] Single object analysis
  - [ ] Multiple objects analysis
  - [ ] Empty object handling
  - [ ] Statistics tracking
  - [ ] Field analysis accuracy

- **Performance Tests (3)**:
  - [ ] Batch metadata faster than individual fetches (>40% improvement)
  - [ ] Scales well with field count (100+ fields)
  - [ ] Cache improves performance for repeated analysis

- **Integration Tests (2)**:
  - [ ] Integrates with existing metadata analyzer agent
  - [ ] Maintains all analysis functionality

**Phase 2 Tests** (8+ tests):
- [ ] Parallel analysis faster than sequential
- [ ] Respects concurrency limits
- [ ] Handles errors in one object without failing all
- [ ] All objects analyzed correctly
- [ ] Batch processing works correctly
- [ ] Performance scales with worker count
- [ ] Memory usage is acceptable
- [ ] Integration with Phase 1 works

**Total**: 18+ tests minimum

---

## Benchmarking Plan

### Scenarios

**Small (5 objects)**:
- Baseline: ~7.5s
- Target: <3.5s (-53%)

**Medium (10 objects)**:
- Baseline: ~15s
- Target: <7.0s (-53%)

**Large (25 objects)**:
- Baseline: ~37.5s
- Target: <17.5s (-53%)

### Metrics to Track

For each scenario:
- [ ] Baseline duration
- [ ] Phase 1 duration (batch metadata)
- [ ] Phase 2 duration (batch + parallel)
- [ ] Improvement percentage
- [ ] Speedup multiplier
- [ ] Cache hit rate
- [ ] Fields analyzed per second

---

## Risk Assessment

### Low Risk ✅

- Reusing proven Week 2 `BatchFieldMetadata` code (zero new implementation!)
- Parallel processing pattern already proven in Week 2
- Test-driven approach ensures quality
- Incremental implementation allows validation at each phase

### Medium Risk ⚠️

- **API Rate Limits**: Parallel analysis may hit rate limits
  - Mitigation: Max 5 concurrent workers, respect org limits

- **Memory Usage**: Analyzing many large objects may consume memory
  - Mitigation: Process in batches, track memory usage in tests

### Mitigation Strategies

1. **Incremental Integration**: Can enable/disable each optimization via flag
2. **Rollback Capability**: Preserve original code, can revert if issues
3. **Performance Monitoring**: Statistics tracking enables ongoing validation
4. **Test Coverage**: 18+ tests ensure functionality intact

---

## Timeline Estimate

Following playbook estimates:

- **Phase 0 (Planning)**: ✅ Complete (2 hours)
- **Phase 1 (Batch Metadata)**: 2-3 hours (mostly reusing Week 2 code!)
- **Phase 2 (Parallel Analysis)**: 2-3 hours
- **Phase 3 (Progressive)**: 1-2 hours (optional)
- **Documentation**: 1-2 hours

**Total**: 7-10 hours (with Phase 3) or 6-8 hours (without)

**Playbook Prediction**: 3-4 hours saved by reusing Week 2 code ✅

---

## Expected Results

### Performance Improvement

| Phase | Duration | Improvement | Cumulative |
|-------|----------|-------------|------------|
| Baseline | 14.96s | - | - |
| Phase 1 (Batch Metadata) | ~7.5-9.0s | -40-50% | -40-50% |
| Phase 2 (Parallel Analysis) | ~4.5-6.0s | -30-40% | -60-70% |

**Target Achievement**: ✅ Phase 2 should achieve -53% target

### Success Metrics

- [ ] Execution time <7.0s ✅ (expected: 4.5-6.0s)
- [ ] Performance score 90+/100 ✅ (expected: 90-95)
- [ ] Critical bottleneck eliminated ✅ (field analysis <30%)
- [ ] Tests passing 100% ✅ (18+ tests)
- [ ] No functionality regressions ✅

---

## Reusable Components from Week 2

**Already Implemented** ✅:
1. `BatchFieldMetadata.withCache()` - Direct reuse!
2. `FieldMetadataCache` - Included automatically
3. Parallel processing pattern (Promise.all())
4. Test templates (playbook templates)
5. Benchmark templates (playbook templates)

**New Components to Create**:
1. `MetadataAnalyzerOptimizer` class (wraps BatchFieldMetadata)
2. Parallel object analysis method
3. Test suite for metadata analyzer optimization

**Code Reuse**: ~80% of implementation already exists from Week 2!

---

## Next Steps

### Immediate (Today)

- [ ] Review this plan
- [ ] User approval to proceed ✅
- [ ] Start Phase 1: Batch metadata integration (mostly reuse!)

### This Week

- [ ] Complete Phase 1 (batch metadata) - Fast due to reuse!
- [ ] Complete Phase 2 (parallel analysis)
- [ ] Run all tests and benchmarks
- [ ] Validate -53% target achieved

### Optional

- [ ] Phase 3 (progressive analysis) if analyzing very large orgs
- [ ] Create completion report
- [ ] Update playbook with progressive analysis pattern

---

**Plan Status**: ✅ COMPLETE - Ready for Implementation

**Using Playbook**: Performance Optimization Playbook v1.0.0

**Estimated Time**: 6-8 hours (3-4 hours saved by reusing Week 2 code)

**Expected Improvement**: 60-70% (exceeds -53% target)

**Confidence**: VERY HIGH (80% code reuse from proven Week 2 patterns)

---

**Last Updated**: 2025-10-18
**Plan Version**: 1.0.0
**Next Phase**: Phase 1 Implementation (awaiting approval)
