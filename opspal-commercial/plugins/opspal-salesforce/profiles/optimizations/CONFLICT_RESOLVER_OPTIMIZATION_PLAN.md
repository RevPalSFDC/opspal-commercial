# sfdc-conflict-resolver Optimization Plan

**Date**: 2025-10-18
**Agent**: sfdc-conflict-resolver
**Status**: 🔄 IN PROGRESS - Phase 0 Complete (Planning)
**Using**: Performance Optimization Playbook v1.0.0

---

## Phase 0: Baseline Analysis ✅

### Baseline Metrics (From Week 1 Profiling)

```json
{
  "agentName": "sfdc-conflict-resolver",
  "avgDuration": 6257.5,    // 6.26s
  "performanceScore": 80,    // 80/100
  "criticalBottleneck": {
    "segment": "Field metadata loaded → Field comparison complete",
    "duration": 4000,        // 4.0s
    "percentOfTotal": 63.6   // 63.6% - CRITICAL!
  },
  "cpuUtilization": 100.9    // CPU-bound (100.9%)
}
```

### Bottleneck Analysis

**Critical Bottleneck** (63.6% of execution):
- **Segment**: Field metadata loaded → Field comparison complete
- **Duration**: 4.0s out of 6.26s total
- **Severity**: CRITICAL (>50% threshold)
- **Issue**: Field comparison logic is CPU-bound and likely sequential

**Secondary Issues**:
- High CPU utilization (100.9%)
- Likely involves repeated field comparisons
- Potential for N+1 metadata access patterns

---

## Optimization Targets

### Performance Targets

| Metric | Baseline | Target | Improvement |
|--------|----------|--------|-------------|
| **Execution Time** | 6.26s | <3.0s | -52% |
| **Performance Score** | 80/100 | 90+/100 | +10 points |
| **Critical Bottlenecks** | 1 (63.6%) | 0 | Eliminated |
| **CPU Utilization** | 100.9% | <80% | -20% |

### Success Criteria

- [ ] Execution time <3.0s (-52% minimum)
- [ ] Performance score ≥90/100
- [ ] Critical bottleneck eliminated (field comparison <30% of total)
- [ ] All tests passing (100% pass rate)
- [ ] No regressions in functionality

---

## Pattern Selection (Using Playbook Decision Tree)

### Decision Tree Analysis

```
START: Bottleneck in field comparison (CPU-bound, 63.6%)

Q1: Is the bottleneck in API calls?
A1: Partially - field metadata loading present

Q2: Is the bottleneck in sequential processing?
A2: YES - field comparisons likely done sequentially

Q3: Is the bottleneck in repeated data access?
A3: YES - same fields compared multiple times

Q4: Is there agent overhead?
A4: NO - this IS the conflict resolver agent
```

### Selected Patterns

Based on decision tree analysis:

**Pattern 1: Batch API Operations** ✅
- **Why**: Field metadata loading in critical path
- **Expected**: 80-90% reduction in metadata fetch time
- **Reuse**: Week 2 `batch-field-metadata.js` (already implemented!)

**Pattern 2: Parallel Processing** ✅
- **Why**: Field comparisons are independent operations
- **Expected**: 50-70% reduction in comparison time
- **Implementation**: Parallelize field comparison logic with Promise.all()

**Pattern 3: Pre-computed Comparison Rules** ✅ (New Pattern!)
- **Why**: CPU-bound suggests repeated calculations
- **Expected**: 30-50% reduction in comparison time
- **Implementation**: Pre-compute field compatibility matrix

**Pattern 4: LRU Cache with TTL** ⚠️ (Optional - Phase 3)
- **Why**: Field metadata rarely changes
- **Expected**: Additional 10-15% with warm cache
- **Implementation**: Reuse `field-metadata-cache.js` from Week 2

### Combining Patterns

**Recommended Approach**: Patterns 1 + 2 + 3 (Batch + Parallel + Pre-computed)

**Expected Combined Impact**:
- Phase 1 (Batch): ~20-25% improvement
- Phase 2 (Parallel + Pre-computed): ~30-35% improvement
- **Total**: ~50-60% improvement (exceeds -52% target)

---

## Implementation Strategy

### Phase 1: Batch Field Metadata (2-3 hours)

**Goal**: Eliminate N+1 metadata fetch pattern

**Tasks**:
- [x] Baseline established (6.26s)
- [ ] Integrate `BatchFieldMetadata` (already exists from Week 2)
- [ ] Update conflict resolver to use batched metadata
- [ ] Write 5+ integration tests
- [ ] Benchmark improvement (target: 20-25%)
- [ ] Expected: 6.26s → ~4.7-5.0s

**Reusing from Week 2**:
```javascript
const BatchFieldMetadata = require('./batch-field-metadata');

// Replace individual metadata fetches
const batchMeta = BatchFieldMetadata.withCache({ maxSize: 1000, ttl: 3600000 });
const allFields = conflicts.flatMap(c => [c.sourceField, c.targetField]);
const metadata = await batchMeta.getMetadata(allFields);
```

---

### Phase 2: Parallel Field Comparison + Pre-computation (3-4 hours)

**Goal**: Parallelize comparisons and reduce CPU-bound calculations

**Part A: Pre-computed Comparison Rules**

**Implementation**:
```javascript
class FieldComparisonRules {
  constructor() {
    // Pre-compute field type compatibility matrix
    this.compatibilityMatrix = this._buildCompatibilityMatrix();
  }

  _buildCompatibilityMatrix() {
    // Pre-compute which field types are compatible
    return {
      'String': ['String', 'Email', 'Phone', 'Url', 'TextArea'],
      'Number': ['Number', 'Currency', 'Percent'],
      'Date': ['Date', 'DateTime'],
      'Boolean': ['Boolean', 'Checkbox'],
      // ... etc
    };
  }

  isCompatible(sourceType, targetType) {
    // O(1) lookup instead of complex logic
    return this.compatibilityMatrix[sourceType]?.includes(targetType) || false;
  }

  getConflictSeverity(sourceField, targetField, metadata) {
    // Pre-computed severity rules
    if (sourceField.type !== targetField.type) return 'critical';
    if (sourceField.required !== targetField.required) return 'warning';
    if (sourceField.unique && targetField.unique) return 'critical';
    return 'none';
  }
}
```

**Part B: Parallel Processing**

**Implementation**:
```javascript
class ParallelFieldComparator {
  constructor(comparisonRules) {
    this.rules = comparisonRules;
  }

  async compareFields(fieldPairs, metadata) {
    // Parallel comparison instead of sequential
    const comparisonPromises = fieldPairs.map(async (pair) => {
      return await this._compareFieldPair(pair, metadata);
    });

    const results = await Promise.all(comparisonPromises);
    return results;
  }

  async _compareFieldPair(pair, metadata) {
    const sourceMeta = metadata.find(m => m.fullName === pair.source);
    const targetMeta = metadata.find(m => m.fullName === pair.target);

    // Use pre-computed rules
    const compatible = this.rules.isCompatible(sourceMeta.type, targetMeta.type);
    const severity = this.rules.getConflictSeverity(sourceMeta, targetMeta, metadata);

    return {
      pair,
      compatible,
      severity,
      conflicts: this._detectConflicts(sourceMeta, targetMeta)
    };
  }

  _detectConflicts(source, target) {
    // Conflict detection logic (from existing agent)
    const conflicts = [];

    // Type mismatch
    if (source.type !== target.type) {
      conflicts.push({
        type: 'type_mismatch',
        severity: 'critical',
        message: `Type mismatch: ${source.type} vs ${target.type}`
      });
    }

    // Required mismatch
    if (source.required && !target.required) {
      conflicts.push({
        type: 'required_mismatch',
        severity: 'warning',
        message: 'Source is required but target is not'
      });
    }

    // Unique conflict
    if (source.unique && target.unique) {
      conflicts.push({
        type: 'unique_conflict',
        severity: 'critical',
        message: 'Both fields are unique'
      });
    }

    return conflicts;
  }
}
```

**Tasks**:
- [ ] Create `field-comparison-rules.js` (pre-computed compatibility matrix)
- [ ] Create `parallel-field-comparator.js` (parallel comparison logic)
- [ ] Write 10+ tests (5 unit + 3 performance + 2 integration)
- [ ] Benchmark improvement (target: 30-35%)
- [ ] Expected: 4.7-5.0s → ~3.0-3.5s (combined with Phase 1)

---

### Phase 3: Metadata Caching (Optional, 1-2 hours)

**Goal**: Achieve <3.0s with warm cache

**Tasks**:
- [ ] Integrate `FieldMetadataCache` from Week 2
- [ ] Update `BatchFieldMetadata` to use cache
- [ ] Write 5+ cache tests
- [ ] Benchmark with cold/warm cache
- [ ] Expected: 3.0-3.5s (cold) → <2.0s (warm)

**Reusing from Week 2**:
```javascript
// Already done! BatchFieldMetadata.withCache() includes caching
const batchMeta = BatchFieldMetadata.withCache({ maxSize: 1000, ttl: 3600000 });
```

---

## Test Strategy

### Minimum Test Coverage

Following playbook standards:

**Phase 1 Tests** (5+ integration tests):
- [ ] Batch metadata integration with conflict resolver
- [ ] Maintains all conflict detection functionality
- [ ] Faster than baseline (>20% improvement)
- [ ] Handles empty field list
- [ ] Handles mixed object types

**Phase 2 Tests** (10+ tests):
- **Unit Tests (5+)**:
  - [ ] Pre-computed rules: type compatibility lookup
  - [ ] Pre-computed rules: severity calculation
  - [ ] Parallel comparator: single pair
  - [ ] Parallel comparator: multiple pairs
  - [ ] Parallel comparator: error handling

- **Performance Tests (3+)**:
  - [ ] Parallel faster than sequential (>50% improvement)
  - [ ] Scales well with field count (100+ pairs)
  - [ ] Pre-computed rules faster than dynamic calculation

- **Integration Tests (2+)**:
  - [ ] Integrates with Phase 1 batch metadata
  - [ ] Maintains conflict resolver functionality

**Phase 3 Tests** (5+ cache tests):
- [ ] Cache hit rate >80% with realistic workload
- [ ] Cache improves performance for repeated comparisons
- [ ] TTL expiration works correctly
- [ ] LRU eviction works correctly
- [ ] Statistics tracking accurate

**Total**: 20+ tests minimum

---

## Benchmarking Plan

### Scenarios

**Small (5 field pairs)**:
- Baseline: ~1.5s
- Target: <0.8s (-47%)

**Medium (10 field pairs)**:
- Baseline: ~3.1s
- Target: <1.5s (-52%)

**Large (20 field pairs)**:
- Baseline: ~6.3s
- Target: <3.0s (-52%)

### Metrics to Track

For each scenario:
- [ ] Baseline duration
- [ ] Phase 1 duration (batch metadata)
- [ ] Phase 2 duration (batch + parallel + pre-computed)
- [ ] Phase 3 duration (all + warm cache)
- [ ] Improvement percentage
- [ ] Speedup multiplier

---

## Risk Assessment

### Low Risk ✅

- Reusing proven patterns from Week 2 (batch metadata, caching)
- Test-driven approach ensures quality
- Incremental implementation allows validation at each phase

### Medium Risk ⚠️

- Pre-computed rules pattern is new (not from Week 2)
- Need to ensure all field type combinations covered
- Mitigation: Comprehensive test coverage, fallback to dynamic calculation

### Mitigation Strategies

1. **Incremental Integration**: Can enable/disable each optimization via flag
2. **Rollback Capability**: Preserve original code, can revert if issues
3. **Performance Monitoring**: Statistics tracking enables ongoing validation
4. **Test Coverage**: 20+ tests ensure functionality intact

---

## Timeline Estimate

Following playbook estimates:

- **Phase 0 (Planning)**: ✅ Complete (2 hours)
- **Phase 1 (Batch Metadata)**: 2-3 hours
- **Phase 2 (Parallel + Pre-computed)**: 3-4 hours
- **Phase 3 (Caching)**: 1-2 hours (optional)
- **Documentation**: 1-2 hours

**Total**: 9-13 hours (with Phase 3) or 8-11 hours (without)

**Playbook Prediction**: 2-4 hours saved by following templates ✅

---

## Expected Results

### Performance Improvement

| Phase | Duration | Improvement | Cumulative |
|-------|----------|-------------|------------|
| Baseline | 6.26s | - | - |
| Phase 1 (Batch) | ~4.7-5.0s | -20-25% | -20-25% |
| Phase 2 (Parallel + Pre-computed) | ~3.0-3.5s | -30-35% | -50-60% |
| Phase 3 (Cache warm) | <2.0s | -40-50% | -68-75% |

**Target Achievement**: ✅ Phase 2 should achieve -52% target

### Success Metrics

- [ ] Execution time <3.0s ✅ (expected: 3.0-3.5s)
- [ ] Performance score 90+/100 ✅ (expected: 90-95)
- [ ] Critical bottleneck eliminated ✅ (field comparison <30%)
- [ ] Tests passing 100% ✅ (20+ tests)
- [ ] No functionality regressions ✅

---

## Reusable Components from Week 2

**Already Implemented** ✅:
1. `BatchFieldMetadata` class (Phase 1 ready to use)
2. `FieldMetadataCache` class (Phase 3 ready to use)
3. Test templates (playbook templates)
4. Benchmark templates (playbook templates)

**New Components to Create**:
1. `FieldComparisonRules` class (pre-computed compatibility)
2. `ParallelFieldComparator` class (parallel field comparison)

---

## Next Steps

### Immediate (Today)

- [ ] Review this plan
- [ ] User approval to proceed ✅
- [ ] Start Phase 1: Batch metadata integration

### This Week

- [ ] Complete Phase 1 (batch metadata)
- [ ] Complete Phase 2 (parallel + pre-computed)
- [ ] Run all tests and benchmarks
- [ ] Validate -52% target achieved

### Optional

- [ ] Phase 3 (caching) if needed to exceed target
- [ ] Create completion report
- [ ] Update playbook with new pattern (pre-computed rules)

---

**Plan Status**: ✅ COMPLETE - Ready for Implementation

**Using Playbook**: Performance Optimization Playbook v1.0.0

**Estimated Time**: 8-13 hours (2-4 hours saved by using playbook templates)

**Expected Improvement**: 50-75% (exceeds -52% target)

**Confidence**: HIGH (proven patterns from Week 2 + new pre-computed rules pattern)

---

**Last Updated**: 2025-10-18
**Plan Version**: 1.0.0
**Next Phase**: Phase 1 Implementation (awaiting approval)
