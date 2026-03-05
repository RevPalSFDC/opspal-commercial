# sfdc-data-operations Optimization Plan

**Date**: 2025-10-18
**Agent**: sfdc-data-operations
**Status**: 🔄 IN PROGRESS - Phase 0 Complete (Planning)
**Using**: Performance Optimization Playbook v1.0.0

---

## Phase 0: Baseline Analysis ✅

### Baseline Metrics (From Week 1 Profiling)

```json
{
  "agentName": "sfdc-data-operations",
  "avgDuration": 4821,           // 4.83s
  "performanceScore": 80,        // 80/100
  "criticalBottleneck": {
    "segment": "Query built → Query executed",
    "duration": 2500,            // 2.5s
    "percentOfTotal": 51.9       // 51.9% - CRITICAL!
  },
  "cpuUtilization": 100.6        // CPU-bound (100.6%)
}
```

### Bottleneck Analysis

**Critical Bottleneck** (51.9% of execution):
- **Segment**: Query built → Query executed
- **Duration**: 2.5s out of 4.83s total
- **Severity**: CRITICAL (>50% threshold)
- **Issue**: Query execution is sequential and likely involves N+1 patterns

**Secondary Issues**:
- High CPU utilization (100.6%)
- Data transformation takes 800ms (16.6%)
- Batch processing takes 1.4s (29%)
- Likely multiple individual queries instead of batch operations

---

## Optimization Targets

### Performance Targets

| Metric | Baseline | Target | Improvement |
|--------|----------|--------|-------------|
| **Execution Time** | 4.83s | <2.5s | -48% |
| **Performance Score** | 80/100 | 90+/100 | +10 points |
| **Critical Bottlenecks** | 1 (51.9%) | 0 | Eliminated |
| **CPU Utilization** | 100.6% | <80% | -20% |

### Success Criteria

- [ ] Execution time <2.5s (-48% minimum)
- [ ] Performance score ≥90/100
- [ ] Critical bottleneck eliminated (query execution <30% of total)
- [ ] All tests passing (100% pass rate)
- [ ] No regressions in functionality

---

## Pattern Selection (Using Playbook Decision Tree)

### Decision Tree Analysis

```
START: Bottleneck in query execution (CPU-bound, 51.9%)

Q1: Is the bottleneck in API calls?
A1: YES - query execution involves multiple API calls to Salesforce

Q2: Is the bottleneck in sequential processing?
A2: YES - queries likely executed sequentially

Q3: Is the bottleneck in repeated data access?
A3: YES - same queries may be executed multiple times

Q4: Is there agent overhead?
A4: NO - this IS the data operations agent
```

### Selected Patterns

**Pattern 1: Batch API Operations** ✅
- **Why**: Query execution involves multiple individual API calls
- **Expected**: 80-90% reduction in query time
- **Reuse**: Week 2 batch patterns + Salesforce Composite API
- **Implementation**: Replace sequential queries with composite requests

**Pattern 2: Query Result Caching** ✅
- **Why**: Same queries may be executed repeatedly
- **Expected**: 60-80% improvement with warm cache
- **Reuse**: Week 2 `FieldMetadataCache` pattern adapted for query results
- **Implementation**: LRU cache with TTL for query results

**Pattern 3: Parallel Query Execution** ⚠️ (Optional - Phase 2)
- **Why**: Independent queries can run concurrently
- **Expected**: 40-60% reduction in total query time
- **Implementation**: Use Promise.all() for independent queries
- **Risk**: API rate limits may be hit with too much parallelization

**Pattern 4: Query Optimization** ✅
- **Why**: CPU-bound suggests query construction overhead
- **Expected**: 20-30% reduction in query building time
- **Implementation**: Pre-computed SOQL templates, query builder caching

### Combining Patterns

**Recommended Approach**: Patterns 1 + 2 + 4 (Batch + Cache + Optimization)

**Expected Combined Impact**:
- Phase 1 (Batch API + Query Optimization): ~40-50% improvement
- Phase 2 (Query Result Caching): ~20-30% additional improvement
- **Total**: ~60-80% improvement (exceeds -48% target)

---

## Implementation Strategy

### Phase 1: Batch API Operations + Query Optimization (3-4 hours)

**Goal**: Eliminate N+1 query pattern and optimize query construction

**Part A: Composite API Integration**

**Implementation**:
```javascript
class BatchQueryExecutor {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 25; // Salesforce limit
    this.timeout = options.timeout || 30000;
  }

  /**
   * Execute multiple queries in a single composite API call
   *
   * BEFORE: N individual queries (N × 200-400ms = 2-4s for 10 queries)
   * AFTER: 1 composite request (200-300ms for 10 queries)
   */
  async executeComposite(queries) {
    // Group queries into composite request batches
    const batches = this._createBatches(queries);

    // Execute composite requests
    const results = [];
    for (const batch of batches) {
      const compositeRequest = this._buildCompositeRequest(batch);
      const response = await this._executeComposite(compositeRequest);
      results.push(...this._extractResults(response));
    }

    return results;
  }

  _buildCompositeRequest(queries) {
    return {
      allOrNone: false,
      compositeRequest: queries.map((query, index) => ({
        method: 'GET',
        url: `/services/data/v62.0/query?q=${encodeURIComponent(query.soql)}`,
        referenceId: `query_${index}`
      }))
    };
  }
}
```

**Part B: Query Optimization**

**Implementation**:
```javascript
class QueryOptimizer {
  constructor() {
    // Pre-compute common SOQL templates
    this.templates = {
      'Account_Basic': 'SELECT Id, Name, Type, Industry FROM Account WHERE {condition}',
      'Contact_Standard': 'SELECT Id, FirstName, LastName, Email FROM Contact WHERE {condition}',
      'Opportunity_Pipeline': 'SELECT Id, Name, StageName, Amount, CloseDate FROM Opportunity WHERE {condition}'
    };

    // Cache parsed query ASTs
    this.queryCache = new Map();
  }

  /**
   * Build optimized SOQL query using templates
   *
   * BEFORE: Parse + validate + construct on every call (50-100ms)
   * AFTER: Template substitution (5-10ms)
   */
  buildQuery(template, params) {
    const cacheKey = `${template}:${JSON.stringify(params)}`;

    if (this.queryCache.has(cacheKey)) {
      return this.queryCache.get(cacheKey);
    }

    const soql = this.templates[template].replace('{condition}', params.condition);
    this.queryCache.set(cacheKey, soql);

    return soql;
  }
}
```

**Tasks**:
- [ ] Create `batch-query-executor.js` (composite API integration)
- [ ] Create `query-optimizer.js` (template-based query building)
- [ ] Write 10+ tests (5 unit + 3 performance + 2 integration)
- [ ] Benchmark improvement (target: 40-50%)
- [ ] Expected: 4.83s → ~2.4-2.9s

---

### Phase 2: Query Result Caching (2-3 hours)

**Goal**: Cache query results to avoid repeated execution

**Implementation**:
```javascript
class QueryResultCache {
  constructor(options = {}) {
    // Reuse Week 2 cache pattern
    this.cache = new LRUCache({
      maxSize: options.maxSize || 500,
      ttl: options.ttl || 300000,  // 5 minutes default
      onEviction: (key, value) => {
        console.log(`Evicted query result: ${key}`);
      }
    });

    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  /**
   * Get query result from cache or execute
   *
   * CACHE HIT: <1ms (instant)
   * CACHE MISS: 200-400ms (execute query)
   */
  async execute(query, executor) {
    const cacheKey = this._computeKey(query);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.hits++;
      return cached;
    }

    // Execute query
    this.stats.misses++;
    const result = await executor(query);

    // Store in cache
    this.cache.set(cacheKey, result);

    return result;
  }

  _computeKey(query) {
    // Hash SOQL + params for cache key
    return `${query.soql}:${JSON.stringify(query.params || {})}`;
  }

  getCacheHitRate() {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? (this.stats.hits / total * 100).toFixed(1) : 0;
  }
}
```

**Tasks**:
- [ ] Create `query-result-cache.js` (adapted from Week 2 cache)
- [ ] Integrate with `BatchQueryExecutor`
- [ ] Write 8+ tests (cache hit/miss, TTL, eviction)
- [ ] Benchmark with cold/warm cache
- [ ] Expected: 2.4-2.9s (cold) → ~1.0-1.5s (warm)

---

### Phase 3: Parallel Query Execution (Optional, 2-3 hours)

**Goal**: Execute independent queries in parallel

**Implementation**:
```javascript
class ParallelQueryExecutor {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 5; // Respect rate limits
    this.batchExecutor = options.batchExecutor;
  }

  /**
   * Execute independent queries in parallel
   *
   * BEFORE: Sequential execution (N × 200ms = 2s for 10 queries)
   * AFTER: Parallel execution (200ms total with 5 workers)
   */
  async executeParallel(queries) {
    // Group into independent query batches
    const batches = this._groupByDependencies(queries);

    // Execute each batch in parallel
    const results = [];
    for (const batch of batches) {
      const promises = batch.map(q => this.batchExecutor.execute(q));
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    return results;
  }

  _groupByDependencies(queries) {
    // Analyze queries for dependencies
    // Group independent queries together
    // Return batches that can run in parallel

    // Placeholder: For now, assume all queries are independent
    return [queries];
  }
}
```

**Tasks**:
- [ ] Create `parallel-query-executor.js`
- [ ] Implement dependency analysis
- [ ] Rate limit protection (max 5 concurrent)
- [ ] Write 6+ tests (parallel execution, rate limits, error handling)
- [ ] Benchmark improvement (target: 20-30%)
- [ ] Expected: 1.0-1.5s → ~0.7-1.0s

---

## Test Strategy

### Minimum Test Coverage

Following playbook standards:

**Phase 1 Tests** (10+ tests):
- **Unit Tests (5)**:
  - [ ] Composite request building
  - [ ] Query template substitution
  - [ ] Query cache functionality
  - [ ] Batch grouping logic
  - [ ] Error handling

- **Performance Tests (3)**:
  - [ ] Batch API faster than sequential (>40% improvement)
  - [ ] Query optimization faster than dynamic construction
  - [ ] Scales well with query count (50+ queries)

- **Integration Tests (2)**:
  - [ ] Integrates with existing data operations API
  - [ ] Maintains all query functionality

**Phase 2 Tests** (8+ tests):
- **Cache Tests (5)**:
  - [ ] Cache hit/miss tracking
  - [ ] TTL expiration works correctly
  - [ ] LRU eviction works correctly
  - [ ] Cache improves performance for repeated queries
  - [ ] Cache hit rate >60% with realistic workload

- **Integration Tests (3)**:
  - [ ] Cache integrates with batch executor
  - [ ] Cache invalidation on data changes
  - [ ] Statistics tracking accurate

**Phase 3 Tests** (6+ tests - if implemented):
- [ ] Parallel execution faster than sequential
- [ ] Rate limit protection works
- [ ] Error in one query doesn't fail all
- [ ] Dependency analysis correct
- [ ] Max concurrent workers respected
- [ ] Performance scales with worker count

**Total**: 24+ tests minimum

---

## Benchmarking Plan

### Scenarios

**Small (5 queries)**:
- Baseline: ~1.2s
- Target: <0.6s (-50%)

**Medium (10 queries)**:
- Baseline: ~2.4s
- Target: <1.2s (-50%)

**Large (25 queries)**:
- Baseline: ~4.8s
- Target: <2.4s (-50%)

### Metrics to Track

For each scenario:
- [ ] Baseline duration
- [ ] Phase 1 duration (batch + optimization)
- [ ] Phase 2 duration (batch + optimization + cache warm)
- [ ] Phase 3 duration (all + parallel) - if implemented
- [ ] Improvement percentage
- [ ] Speedup multiplier
- [ ] Cache hit rate (Phase 2)

---

## Risk Assessment

### Low Risk ✅

- Reusing proven patterns from Week 2 (batch operations, caching)
- Salesforce Composite API is well-documented and stable
- Test-driven approach ensures quality
- Incremental implementation allows validation at each phase

### Medium Risk ⚠️

- **API Rate Limits**: Parallel execution may hit rate limits
  - Mitigation: Max 5 concurrent workers, respect org limits

- **Cache Invalidation**: Stale cache could return outdated data
  - Mitigation: Short TTL (5 minutes), invalidation on data changes

- **Query Complexity**: Complex queries may not benefit from templates
  - Mitigation: Template optimization optional, fallback to dynamic construction

### Mitigation Strategies

1. **Incremental Integration**: Can enable/disable each optimization via flag
2. **Rollback Capability**: Preserve original code, can revert if issues
3. **Performance Monitoring**: Statistics tracking enables ongoing validation
4. **Test Coverage**: 24+ tests ensure functionality intact

---

## Timeline Estimate

Following playbook estimates:

- **Phase 0 (Planning)**: ✅ Complete (2 hours)
- **Phase 1 (Batch API + Optimization)**: 3-4 hours
- **Phase 2 (Caching)**: 2-3 hours
- **Phase 3 (Parallel)**: 2-3 hours (optional)
- **Documentation**: 1-2 hours

**Total**: 10-14 hours (with Phase 3) or 8-11 hours (without)

**Playbook Prediction**: 2-3 hours saved by following templates ✅

---

## Expected Results

### Performance Improvement

| Phase | Duration | Improvement | Cumulative |
|-------|----------|-------------|------------|
| Baseline | 4.83s | - | - |
| Phase 1 (Batch + Optimization) | ~2.4-2.9s | -40-50% | -40-50% |
| Phase 2 (Cache warm) | ~1.0-1.5s | -50-60% | -70-80% |
| Phase 3 (Parallel) | ~0.7-1.0s | -30-40% | -80-85% |

**Target Achievement**: ✅ Phase 1 should achieve -48% target

### Success Metrics

- [ ] Execution time <2.5s ✅ (expected: 2.4-2.9s)
- [ ] Performance score 90+/100 ✅ (expected: 90-95)
- [ ] Critical bottleneck eliminated ✅ (query execution <30%)
- [ ] Tests passing 100% ✅ (24+ tests)
- [ ] No functionality regressions ✅

---

## Reusable Components from Week 2

**Already Implemented** ✅:
1. `LRUCache` class (can adapt for query result caching)
2. `BatchFieldMetadata` pattern (template for batch query executor)
3. Test templates (playbook templates)
4. Benchmark templates (playbook templates)

**New Components to Create**:
1. `BatchQueryExecutor` class (Salesforce Composite API integration)
2. `QueryOptimizer` class (template-based query building)
3. `QueryResultCache` class (adapted from Week 2 cache)
4. `ParallelQueryExecutor` class (optional - Phase 3)

---

## Next Steps

### Immediate (Today)

- [ ] Review this plan
- [ ] User approval to proceed ✅
- [ ] Start Phase 1: Batch API + Query Optimization

### This Week

- [ ] Complete Phase 1 (batch API + optimization)
- [ ] Complete Phase 2 (query result caching)
- [ ] Run all tests and benchmarks
- [ ] Validate -48% target achieved

### Optional

- [ ] Phase 3 (parallel execution) if needed to exceed target
- [ ] Create completion report
- [ ] Update playbook with Composite API pattern

---

**Plan Status**: ✅ COMPLETE - Ready for Implementation

**Using Playbook**: Performance Optimization Playbook v1.0.0

**Estimated Time**: 10-14 hours (2-3 hours saved by using playbook templates)

**Expected Improvement**: 70-85% (exceeds -48% target)

**Confidence**: HIGH (proven patterns + Salesforce Composite API well-documented)

---

**Last Updated**: 2025-10-18
**Plan Version**: 1.0.0
**Next Phase**: Phase 1 Implementation (awaiting approval)
