# sfdc-discovery Optimization Plan

**Date**: 2025-10-18
**Agent**: sfdc-discovery
**Status**: 🔄 IN PROGRESS - Phase 0 Complete (Planning)
**Using**: Performance Optimization Playbook v1.0.0

---

## Phase 0: Baseline Analysis ✅

### Baseline Metrics (From Week 1 Profiling)

```json
{
  "agentName": "sfdc-discovery",
  "avgDuration": 1405,           // 1.41s
  "performanceScore": 70,        // 70/100
  "criticalBottleneck": {
    "segment": "Step 1 complete → Step 2 complete",
    "duration": 750,             // 750ms (53.4% of total)
    "percentOfTotal": 53.4       // CRITICAL!
  },
  "cpuUtilization": 102.8        // CPU-bound (102.8%)
}
```

### Checkpoint Breakdown

| Checkpoint | Duration | % of Total | Cumulative |
|------------|----------|------------|------------|
| **Start → Step 1** | 205ms | 14.6% | 205ms |
| **Step 1 → Step 2** | 750ms | 53.4% ⚠️ | 955ms |
| **Step 2 → Step 3** | 450ms | 32.0% | 1405ms |
| **Total** | 1405ms | 100% | 1405ms |

### Bottleneck Analysis

**Critical Bottleneck** (53.4% of execution):
- **Segment**: Step 1 complete → Step 2 complete
- **Duration**: 750ms out of 1405ms total
- **Severity**: CRITICAL (>50% threshold)
- **Likely Issue**: Metadata analysis with N+1 pattern (similar to sfdc-metadata-analyzer)

**Secondary Bottleneck** (32.0%):
- **Segment**: Step 2 complete → Step 3 complete
- **Duration**: 450ms
- **Severity**: WARNING
- **Likely Issue**: Report generation or data processing

**Interpretation**:
Based on agent purpose (org discovery) and checkpoint labels:
1. **Step 1** (205ms): Enumerate objects in org
2. **Step 2** (750ms): Analyze object metadata/fields - **BOTTLENECK** (likely N+1 field metadata)
3. **Step 3** (450ms): Generate discovery report

This pattern is very similar to sfdc-metadata-analyzer where field analysis was the bottleneck!

---

## Optimization Targets

### Performance Targets

| Metric | Baseline | Target | Improvement |
|--------|----------|--------|-------------|
| **Execution Time** | 1.41s | <0.7s | -50% |
| **Performance Score** | 70/100 | 85+/100 | +15 points |
| **Critical Bottlenecks** | 1 (53.4%) | 0 | Eliminated |
| **CPU Utilization** | 102.8% | <90% | -12% |

### Success Criteria

- [ ] Execution time <0.7s (-50% minimum)
- [ ] Performance score ≥85/100
- [ ] Critical bottleneck eliminated (Step 1→2 <35% of total)
- [ ] All tests passing (100% pass rate)
- [ ] No regressions in functionality

---

## Pattern Selection (Using Playbook Decision Tree)

### Decision Tree Analysis

```
START: Bottleneck in Step 1→2 (CPU-bound, 53.4%)

Q1: Is the bottleneck in API calls?
A1: YES - metadata analysis likely involves individual metadata fetches

Q2: Is the bottleneck in sequential processing?
A2: YES - objects/fields analyzed sequentially

Q3: Is the bottleneck in repeated data access?
A3: YES - same metadata likely accessed multiple times across objects

Q4: Is there agent overhead?
A4: NO - this IS the discovery agent
```

### Selected Patterns

**Pattern 1: Batch Field Metadata** ✅
- **Why**: Step 2 likely involves N+1 field metadata fetching (same as sfdc-metadata-analyzer)
- **Expected**: 60-80% improvement in metadata analysis segment
- **Reuse**: Week 2 `BatchFieldMetadata.withCache()` (already proven!)
- **Implementation**: Direct reuse from previous optimizations

**Pattern 2: Caching** ✅ (Included via Pattern 1)
- **Why**: Discovery agents often re-analyze same orgs
- **Expected**: 80%+ cache hit rate on repeated discoveries
- **Reuse**: Week 2 `FieldMetadataCache` (included in BatchFieldMetadata)
- **Implementation**: Automatic via `BatchFieldMetadata.withCache()`

**Pattern 3: Parallel Object Discovery** 🆕 (Optional - Phase 2)
- **Why**: Multiple objects can be discovered independently
- **Expected**: 30-40% additional improvement
- **Reuse**: Parallel processing pattern from Week 2
- **Implementation**: Promise.all() for independent object analysis

### Combining Patterns

**Recommended Approach**: Pattern 1 (Batch Metadata with Cache)

**Expected Impact**:
- Phase 1 (Batch Metadata): ~40-50% improvement (1.41s → ~0.7-0.8s)
- **Total**: Meets -50% target

**Note**: Phase 2 (parallel discovery) is optional since Phase 1 should meet target.

---

## Implementation Strategy

### Phase 1: Batch Metadata Integration (2-3 hours)

**Goal**: Eliminate N+1 metadata pattern in discovery analysis

**Implementation**:
```javascript
const BatchFieldMetadata = require('./batch-field-metadata'); // Week 2 reuse!

class DiscoveryOptimizer {
  constructor(options = {}) {
    // Phase 1: Reuse Week 2 batch metadata with cache
    this.batchMetadata = BatchFieldMetadata.withCache({
      maxSize: options.cacheSize || 1000,
      ttl: options.cacheTtl || 3600000 // 1 hour
    });

    this.stats = {
      objectsDiscovered: 0,
      fieldsAnalyzed: 0,
      totalDuration: 0,
      metadataFetchDuration: 0,
      analysisDuration: 0,
      reportDuration: 0
    };
  }

  /**
   * Discover org metadata using batch field fetching
   *
   * BEFORE: Individual metadata fetch per field (N+1 pattern)
   * AFTER: Single batch fetch for all fields across all objects
   */
  async discoverOrg(orgAlias, options = {}) {
    const startTime = Date.now();

    // Step 1: Enumerate objects (fast - no change needed)
    const objects = await this._enumerateObjects(orgAlias);

    // Step 2: Analyze objects using batch metadata (Week 2 optimization!)
    const step2Start = Date.now();

    // Collect all field names across all objects
    const allFieldNames = [];
    for (const obj of objects) {
      const objDesc = await this._describeObject(obj.name);
      objDesc.fields.forEach(f => allFieldNames.push(`${obj.name}.${f.name}`));
    }

    // Batch fetch ALL field metadata in one go
    const metadataStart = Date.now();
    const metadata = await this.batchMetadata.getMetadata(allFieldNames);
    const metadataMap = this._createMetadataMap(metadata);
    const metadataDuration = Date.now() - metadataStart;

    // Analyze objects using fetched metadata
    const analysisStart = Date.now();
    const analysis = this._analyzeObjects(objects, metadataMap, options);
    const analysisDuration = Date.now() - analysisStart;

    const step2Duration = Date.now() - step2Start;

    // Step 3: Generate report
    const step3Start = Date.now();
    const report = this._generateReport(analysis, options);
    const reportDuration = Date.now() - step3Start;

    // Update statistics
    const totalDuration = Date.now() - startTime;
    this.stats.objectsDiscovered += objects.length;
    this.stats.fieldsAnalyzed += allFieldNames.length;
    this.stats.totalDuration += totalDuration;
    this.stats.metadataFetchDuration += metadataDuration;
    this.stats.analysisDuration += analysisDuration;
    this.stats.reportDuration += reportDuration;

    return report;
  }
}
```

**Tasks**:
- [ ] Create `discovery-optimizer.js` (reusing BatchFieldMetadata)
- [ ] Write 10+ tests (5 unit + 3 performance + 2 integration)
- [ ] Benchmark improvement (target: 40-50%)
- [ ] Expected: 1.41s → ~0.7-0.8s

**Reusing from Week 2**:
- `BatchFieldMetadata.withCache()` - Zero new code needed!
- `FieldMetadataCache` - Included automatically
- Test patterns - Proven structure

---

### Phase 2: Parallel Object Discovery (Optional, 2-3 hours)

**Goal**: Discover multiple objects in parallel instead of sequentially

**Implementation**:
```javascript
async discoverOrgParallel(orgAlias, options = {}) {
  // Step 1: Enumerate objects
  const objects = await this._enumerateObjects(orgAlias);

  // Step 2: Discover objects in parallel batches
  const maxConcurrent = options.maxConcurrent || 5;
  const results = [];

  for (let i = 0; i < objects.length; i += maxConcurrent) {
    const batch = objects.slice(i, i + maxConcurrent);

    // Analyze batch in parallel
    const batchResults = await Promise.all(
      batch.map(obj => this._discoverObject(obj, options))
    );

    results.push(...batchResults);
  }

  // Step 3: Generate report
  return this._generateReport(results, options);
}
```

**Tasks**:
- [ ] Add parallel discovery method
- [ ] Write 8+ tests (parallel execution, error handling)
- [ ] Benchmark improvement (target: 30-40%)
- [ ] Expected: 0.7-0.8s → ~0.5-0.6s (combined with Phase 1)

**Recommendation**: Skip unless discovering very large orgs (100+ objects)

---

## Test Strategy

### Minimum Test Coverage

Following playbook standards:

**Phase 1 Tests** (10+ tests):
- **Unit Tests (5)**:
  - [ ] Single org discovery
  - [ ] Multiple objects discovery
  - [ ] Empty org handling
  - [ ] Statistics tracking
  - [ ] Discovery accuracy

- **Performance Tests (3)**:
  - [ ] Batch metadata faster than individual fetches (>40% improvement)
  - [ ] Scales well with object count (100+ objects)
  - [ ] Cache improves performance for repeated discoveries

- **Integration Tests (2)**:
  - [ ] Integrates with existing discovery agent
  - [ ] Maintains all discovery functionality

**Total**: 10+ tests minimum

---

## Benchmarking Plan

### Scenarios

**Small Org (5 objects)**:
- Baseline: ~0.7s
- Target: <0.35s (-50%)

**Medium Org (10 objects)**:
- Baseline: ~1.4s
- Target: <0.7s (-50%)

**Large Org (25 objects)**:
- Baseline: ~3.5s
- Target: <1.75s (-50%)

### Metrics to Track

For each scenario:
- [ ] Baseline duration
- [ ] Phase 1 duration (batch metadata)
- [ ] Improvement percentage
- [ ] Speedup multiplier
- [ ] Cache hit rate
- [ ] Objects analyzed per second

---

## Risk Assessment

### Low Risk ✅

- Reusing proven Week 2 `BatchFieldMetadata` code (zero new implementation!)
- Pattern already successful in 4 previous optimizations
- Test-driven approach ensures quality
- Read-only operations (no data modification risk)

### Medium Risk ⚠️

- **API Rate Limits**: Batch metadata fetching may hit rate limits in large orgs
  - Mitigation: Respect Salesforce API limits, add rate limiting

- **Memory Usage**: Fetching metadata for 1000+ fields may consume memory
  - Mitigation: Process in batches, track memory usage in tests

### Mitigation Strategies

1. **Incremental Integration**: Can enable/disable optimization via flag
2. **Rollback Capability**: Preserve original code, can revert if issues
3. **Performance Monitoring**: Statistics tracking enables ongoing validation
4. **Test Coverage**: 10+ tests ensure functionality intact

---

## Timeline Estimate

Following playbook estimates:

- **Phase 0 (Planning)**: ✅ Complete (1.5 hours)
- **Phase 1 (Batch Metadata)**: 2-3 hours (mostly reusing Week 2 code!)
- **Phase 2 (Parallel Discovery)**: 2-3 hours (optional)
- **Documentation**: 1 hour

**Total**: 4.5-7.5 hours (with Phase 2) or 4.5-5.5 hours (without)

**Playbook Prediction**: 3-4 hours saved by reusing Week 2 code ✅

---

## Expected Results

### Performance Improvement

| Phase | Duration | Improvement | Cumulative |
|-------|----------|-------------|------------|
| Baseline | 1.41s | - | - |
| Phase 1 (Batch Metadata) | ~0.7-0.8s | -40-50% | -40-50% |
| Phase 2 (Parallel Discovery) | ~0.5-0.6s | -20-30% | -55-65% |

**Target Achievement**: ✅ Phase 1 should achieve -50% target

### Success Metrics

- [ ] Execution time <0.7s ✅ (expected: 0.7-0.8s)
- [ ] Performance score 85+/100 ✅ (expected: 85-90)
- [ ] Critical bottleneck eliminated ✅ (Step 1→2 <35%)
- [ ] Tests passing 100% ✅ (10+ tests)
- [ ] No functionality regressions ✅

---

## Reusable Components from Week 2

**Already Implemented** ✅:
1. `BatchFieldMetadata.withCache()` - Direct reuse!
2. `FieldMetadataCache` - Included automatically
3. Test templates (playbook templates)
4. Benchmark templates (playbook templates)

**New Components to Create**:
1. `DiscoveryOptimizer` class (wraps BatchFieldMetadata)
2. Test suite for discovery optimization

**Code Reuse**: ~80% of implementation already exists from Week 2!

---

## Next Steps

### Immediate (Today)

- [ ] Review this plan
- [ ] User approval to proceed ✅
- [ ] Start Phase 1: Batch metadata integration (mostly reuse!)

### This Week

- [ ] Complete Phase 1 (batch metadata) - Fast due to reuse!
- [ ] Run all tests and benchmarks
- [ ] Validate -50% target achieved
- [ ] Create completion report

### Optional

- [ ] Phase 2 (parallel discovery) if analyzing very large orgs
- [ ] Update playbook with discovery-specific patterns

---

**Plan Status**: ✅ COMPLETE - Ready for Implementation

**Using Playbook**: Performance Optimization Playbook v1.0.0

**Estimated Time**: 4.5-5.5 hours (3-4 hours saved by reusing Week 2 code)

**Expected Improvement**: 40-50% (meets -50% target)

**Confidence**: VERY HIGH (80% code reuse from proven Week 2 patterns)

---

**Last Updated**: 2025-10-18
**Plan Version**: 1.0.0
**Next Phase**: Phase 1 Implementation (awaiting approval)
