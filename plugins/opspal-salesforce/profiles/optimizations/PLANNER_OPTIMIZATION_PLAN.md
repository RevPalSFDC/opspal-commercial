# sfdc-planner Optimization Plan

**Date**: 2025-10-19
**Agent**: sfdc-planner
**Status**: 🔄 IN PROGRESS - Phase 0 Complete (Planning)
**Using**: Performance Optimization Playbook v1.0.0

---

## Phase 0: Baseline Analysis ✅

### Baseline Metrics (From Week 1 Profiling)

```json
{
  "agentName": "sfdc-planner",
  "avgDuration": 1464,           // 1.46s
  "performanceScore": 70,        // 70/100
  "criticalBottleneck": {
    "segment": "Step 1 complete → Step 2 complete",
    "duration": 750,             // 750ms (51.2% of total)
    "percentOfTotal": 51.2       // CRITICAL!
  },
  "cpuUtilization": 103.1        // CPU-bound (103.1%)
}
```

### Checkpoint Breakdown

| Checkpoint | Duration | % of Total | Cumulative |
|------------|----------|------------|------------|
| **Start → Step 1** | 264ms | 18.0% | 264ms |
| **Step 1 → Step 2** | 750ms | 51.2% ⚠️ | 1014ms |
| **Step 2 → Step 3** | 450ms | 30.7% | 1464ms |
| **Total** | 1464ms | 100% | 1464ms |

### Bottleneck Analysis

**Critical Bottleneck** (51.2% of execution):
- **Segment**: Step 1 complete → Step 2 complete
- **Duration**: 750ms out of 1464ms total
- **Severity**: CRITICAL (>50% threshold)
- **Likely Issue**: Plan generation with N+1 metadata/dependency pattern

**Secondary Bottleneck** (30.7%):
- **Segment**: Step 2 complete → Step 3 complete
- **Duration**: 450ms
- **Severity**: WARNING
- **Likely Issue**: Plan validation or finalization

**Interpretation**:
Based on agent purpose (planning) and checkpoint labels:
1. **Step 1** (264ms): Initialize planning, identify scope
2. **Step 2** (750ms): Plan generation, metadata/dependency gathering - **BOTTLENECK** (N+1 metadata queries)
3. **Step 3** (450ms): Plan validation, finalization

This pattern is **identical** to previous 6 optimizations where metadata gathering was the bottleneck!

---

## Optimization Targets

### Performance Targets

| Metric | Baseline | Target | Improvement |
|--------|----------|--------|-------------|
| **Execution Time** | 1.46s | <0.7s | -52% |
| **Performance Score** | 70/100 | 85+/100 | +15 points |
| **Critical Bottlenecks** | 1 (51.2%) | 0 | Eliminated |
| **CPU Utilization** | 103.1% | <90% | -13% |

### Success Criteria

- [ ] Execution time <0.7s (-52% minimum)
- [ ] Performance score ≥85/100
- [ ] Critical bottleneck eliminated (Step 1→2 <35% of total)
- [ ] All tests passing (100% pass rate)
- [ ] No regressions in functionality

---

## Pattern Selection (Using Playbook Decision Tree)

### Decision Tree Analysis

```
START: Bottleneck in Step 1→2 (CPU-bound, 51.2%)

Q1: Is the bottleneck in API calls?
A1: YES - planning likely involves metadata/dependency queries

Q2: Is the bottleneck in sequential processing?
A2: YES - plan items queried/analyzed sequentially

Q3: Is the bottleneck in repeated data access?
A3: YES - same metadata accessed for multiple plan items

Q4: Is there agent overhead?
A4: POSSIBLY - planner may delegate to other agents
```

### Selected Patterns

**Pattern 1: Batch Metadata/Dependency Fetching** ✅
- **Why**: Step 2 likely involves N+1 metadata or dependency fetching for plan generation
- **Expected**: 60-80% improvement in planning segment
- **Reuse**: Week 2 `BatchFieldMetadata.withCache()` pattern (proven 6 times!)
- **Implementation**: Adapt batch pattern for planning context/dependencies

**Pattern 2: Caching** ✅ (Included via Pattern 1)
- **Why**: Planners often handle similar scopes/patterns
- **Expected**: 80%+ cache hit rate on repeated planning
- **Reuse**: Week 2 caching pattern
- **Implementation**: Cache plan patterns and metadata

### Combining Patterns

**Recommended Approach**: Pattern 1 (Batch Planning Context/Metadata Fetching)

**Expected Impact**:
- Phase 1 (Batch Planning Context): ~50-60% improvement (1.46s → ~0.6-0.7s)
- **Total**: Exceeds -52% target

---

## Implementation Strategy

### Phase 1: Batch Planning Context (2-3 hours)

**Goal**: Eliminate N+1 metadata/dependency pattern in plan generation

**Implementation**:
```javascript
const BatchFieldMetadata = require('./batch-field-metadata'); // Week 2 reuse!

class PlannerOptimizer {
  constructor(options = {}) {
    // Phase 1: Reuse Week 2 batch metadata with cache (adapted for planning)
    this.batchMetadata = BatchFieldMetadata.withCache({
      maxSize: options.cacheSize || 1000,
      ttl: options.cacheTtl || 3600000 // 1 hour
    });

    this.stats = {
      plansGenerated: 0,
      planItemsCreated: 0,
      totalDuration: 0,
      initDuration: 0,
      planningDuration: 0,
      validationDuration: 0
    };
  }

  /**
   * Generate plan using batch metadata fetching
   *
   * BEFORE: Individual metadata/dependency fetch per plan item (N+1 pattern)
   * AFTER: Single batch fetch for all plan metadata/dependencies
   */
  async generatePlan(scope, options = {}) {
    const startTime = Date.now();

    // Step 1: Initialize and identify scope
    const initStart = Date.now();
    const scopeItems = await this._identifyScope(scope);
    const initDuration = Date.now() - initStart;

    // Step 2: Generate plan using batch metadata (Week 2 optimization!)
    const planningStart = Date.now();

    // Collect all metadata/dependency keys needed for all plan items
    const allMetadataKeys = scopeItems.flatMap(item => this._getMetadataKeys(item));

    // Batch fetch ALL metadata/dependencies in one go
    const metadataStart = Date.now();
    const metadata = await this.batchMetadata.getMetadata(allMetadataKeys);
    const metadataMap = this._createMetadataMap(metadata);
    const metadataD uration = Date.now() - metadataStart;

    // Generate plan items using fetched metadata
    const generateStart = Date.now();
    const planItems = await this._generatePlanItems(scopeItems, metadataMap, options);
    const generateDuration = Date.now() - generateStart;

    const planningDuration = Date.now() - planningStart;

    // Step 3: Validate and finalize plan
    const validationStart = Date.now();
    const plan = this._validateAndFinalize(scope, planItems, options);
    const validationDuration = Date.now() - validationStart;

    // Update statistics
    const totalDuration = Date.now() - startTime;
    this.stats.plansGenerated++;
    this.stats.planItemsCreated += planItems.length;
    this.stats.totalDuration += totalDuration;
    this.stats.initDuration += initDuration;
    this.stats.planningDuration += planningDuration;
    this.stats.validationDuration += validationDuration;

    return plan;
  }
}
```

**Tasks**:
- [ ] Create `planner-optimizer.js` (reusing BatchFieldMetadata pattern)
- [ ] Write 10+ tests (5 unit + 3 performance + 2 integration)
- [ ] Benchmark improvement (target: 50-60%)
- [ ] Expected: 1.46s → ~0.6-0.7s

**Reusing from Week 2**:
- `BatchFieldMetadata.withCache()` pattern (not code, but concept)
- Batch fetching architecture
- Test patterns - Proven structure

---

## Test Strategy

### Minimum Test Coverage

Following playbook standards:

**Phase 1 Tests** (10+ tests):
- **Unit Tests (5)**:
  - [ ] Single scope planning
  - [ ] Multiple scope planning
  - [ ] Empty scope handling
  - [ ] Statistics tracking
  - [ ] Plan accuracy

- **Performance Tests (3)**:
  - [ ] Batch metadata faster than individual fetches (>50% improvement)
  - [ ] Scales well with scope size
  - [ ] Cache improves performance for repeated planning

- **Integration Tests (2)**:
  - [ ] Integrates with existing planner agent
  - [ ] Maintains all planning functionality

**Total**: 10+ tests minimum

---

## Benchmarking Plan

### Scenarios

**Small Plan (5 items)**:
- Baseline: ~0.7s
- Target: <0.35s (-50%)

**Medium Plan (15 items)**:
- Baseline: ~1.5s
- Target: <0.75s (-50%)

**Large Plan (30 items)**:
- Baseline: ~3.0s
- Target: <1.5s (-50%)

### Metrics to Track

For each scenario:
- [ ] Baseline duration
- [ ] Phase 1 duration (batch metadata)
- [ ] Improvement percentage
- [ ] Speedup multiplier
- [ ] Cache hit rate
- [ ] Plan items generated per second

---

## Risk Assessment

### Low Risk ✅

- Reusing proven Week 2 batch pattern (7th application!)
- Pattern already successful in 6 previous optimizations
- Test-driven approach ensures quality
- Planning operations are well-defined

### Medium Risk ⚠️

- **Plan Dependencies**: Some plan items may depend on others (ordering matters)
  - Mitigation: Detect dependencies, maintain ordering, only batch independent items

- **Plan Validation**: Complex validation logic may not be easy to batch
  - Mitigation: Keep validation logic separate, batch only metadata fetching

### Mitigation Strategies

1. **Incremental Integration**: Can enable/disable optimization via flag
2. **Rollback Capability**: Preserve original code, can revert if issues
3. **Performance Monitoring**: Statistics tracking enables ongoing validation
4. **Test Coverage**: 10+ tests ensure functionality intact

---

## Timeline Estimate

Following playbook estimates:

- **Phase 0 (Planning)**: ✅ Complete (1 hour)
- **Phase 1 (Batch Metadata)**: 2-3 hours (adapting Week 2 pattern!)
- **Documentation**: 1 hour

**Total**: 4-5 hours

**Playbook Prediction**: 2-3 hours saved by reusing Week 2 patterns ✅

---

## Expected Results

### Performance Improvement

| Phase | Duration | Improvement | Cumulative |
|-------|----------|-------------|------------|
| Baseline | 1.46s | - | - |
| Phase 1 (Batch Metadata) | ~0.6-0.7s | -50-60% | -50-60% |

**Target Achievement**: ✅ Phase 1 should achieve -52% target

### Success Metrics

- [ ] Execution time <0.7s ✅ (expected: 0.6-0.7s)
- [ ] Performance score 85+/100 ✅ (expected: 85-90)
- [ ] Critical bottleneck eliminated ✅ (Step 1→2 <35%)
- [ ] Tests passing 100% ✅ (10+ tests)
- [ ] No functionality regressions ✅

---

## Reusable Components from Week 2

**Concepts to Reuse** ✅:
1. Batch fetching architecture
2. LRU cache with TTL pattern
3. Test templates (playbook templates)
4. Benchmark templates (playbook templates)

**New Components to Create**:
1. `PlannerOptimizer` class (adapts batch pattern for planning)
2. Test suite for planner optimization

**Pattern Reuse**: ~70% of concepts/architecture from Week 2

---

## Next Steps

### Immediate (Today)

- [ ] Review this plan
- [ ] User approval to proceed ✅
- [ ] Start Phase 1: Batch metadata integration (adapt Week 2 patterns!)

### This Week

- [ ] Complete Phase 1 (batch metadata)
- [ ] Run all tests and benchmarks
- [ ] Validate -52% target achieved
- [ ] Create completion report
- [ ] Move to next agent (sfdc-remediation-executor)

---

**Plan Status**: ✅ COMPLETE - Ready for Implementation

**Using Playbook**: Performance Optimization Playbook v1.0.0

**Estimated Time**: 4-5 hours (2-3 hours saved by reusing Week 2 patterns)

**Expected Improvement**: 50-60% (exceeds -52% target)

**Confidence**: VERY HIGH (similar to 6 previous successful optimizations)

---

**Last Updated**: 2025-10-19
**Plan Version**: 1.0.0
**Next Phase**: Phase 1 Implementation (ready to proceed)
