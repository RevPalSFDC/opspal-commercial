# Performance Optimization Checklist

**Version**: 1.0.0
**Use this checklist for every optimization project**

---

## Phase 0: Pre-Optimization Setup

### Baseline Establishment

- [ ] Run profiler on target agent
  ```bash
  node scripts/lib/agent-profiler.js --agent AGENT_NAME --profile
  ```
- [ ] Document baseline metrics:
  - [ ] Execution time: _____ ms
  - [ ] Performance score: _____ /100
  - [ ] Critical bottleneck: _____________ (_____ %)
- [ ] Set optimization targets:
  - [ ] Target execution time: < _____ ms
  - [ ] Target performance score: 90+/100
  - [ ] Target bottleneck count: 0
- [ ] Create optimization plan document
- [ ] Identify applicable patterns (see Pattern Selection below)

---

## Phase 1: First Optimization

### Implementation

- [ ] Choose optimization pattern (Batch API / Parallel / Cache / Eliminate Agent)
- [ ] Create implementation file: `scripts/lib/OPTIMIZATION_NAME.js`
- [ ] Include required components:
  - [ ] Class with constructor and options
  - [ ] Main optimization method
  - [ ] Statistics tracking (getStats())
  - [ ] Error handling
  - [ ] JSDoc documentation
  - [ ] CLI for testing (--help, test, benchmark)

### Testing

- [ ] Create test file: `test/OPTIMIZATION_NAME.test.js`
- [ ] Write unit tests (5+ tests):
  - [ ] Single operation test
  - [ ] Multiple operations test
  - [ ] Empty input test
  - [ ] Statistics tracking test
  - [ ] Error handling test
- [ ] Write performance tests (3+ tests):
  - [ ] Faster than baseline test (>50% improvement)
  - [ ] Scalability test (handles 100+ operations)
  - [ ] Consistency test (similar performance across runs)
- [ ] Write integration tests (3+ tests):
  - [ ] Integrates with existing workflow
  - [ ] Maintains functionality
  - [ ] No regressions
- [ ] Run tests:
  ```bash
  node test/golden-test-suite.js --suite=OPTIMIZATION_NAME
  ```
- [ ] Verify 100% pass rate

### Benchmarking

- [ ] Run benchmark:
  ```bash
  node scripts/lib/OPTIMIZATION_NAME.js benchmark
  ```
- [ ] Document results:
  - [ ] Baseline duration: _____ ms
  - [ ] Optimized duration: _____ ms
  - [ ] Improvement: _____ %
  - [ ] Speedup: _____ x
- [ ] Verify target met (>50% improvement)

### Integration

- [ ] Add test suite to `test/golden-test-suite.js`:
  - [ ] Import test file
  - [ ] Add to test runner
  - [ ] Update help text
- [ ] Update progress report
- [ ] Commit changes with semantic commit message

---

## Phase 2: Second Optimization (If Needed)

### Re-Profiling

- [ ] Re-run profiler with Phase 1 optimization enabled
- [ ] Document new metrics:
  - [ ] Execution time: _____ ms (_____ % improvement from baseline)
  - [ ] Performance score: _____ /100
  - [ ] Remaining bottleneck: _____________ (_____ %)
- [ ] Assess progress toward target:
  - [ ] Current improvement: _____ %
  - [ ] Target improvement: 55%
  - [ ] Gap: _____ %

### Implementation

- [ ] Repeat Phase 1 steps for second optimization
- [ ] Measure combined impact:
  ```bash
  node scripts/lib/combined-benchmark.js
  ```
- [ ] Verify cumulative improvement (>50% total)

---

## Phase 3: Third Optimization (If Needed)

### Progress Assessment

- [ ] Check current improvement: _____ %
- [ ] Check remaining gap to target: _____ %
- [ ] Evaluate diminishing returns
- [ ] Decide: Continue optimizing OR declare victory

### Implementation (If Continuing)

- [ ] Usually implement caching for final 10-20% boost
- [ ] Repeat Phase 1 steps
- [ ] Run all tests to ensure no regressions
- [ ] Verify all targets achieved or exceeded

---

## Final Validation

### Comprehensive Testing

- [ ] Run full test suite:
  ```bash
  node test/golden-test-suite.js
  ```
- [ ] Verify all tests passing: _____ / _____ (100%)
- [ ] No regressions in other agents/functionality

### Benchmarking

- [ ] Run all benchmarks across multiple scenarios:
  - [ ] Small scenario: _____ ms (target: < _____ ms) ✅/❌
  - [ ] Medium scenario: _____ ms (target: < _____ ms) ✅/❌
  - [ ] Large scenario: _____ ms (target: < _____ ms) ✅/❌
- [ ] Verify all targets met

### Metrics Validation

- [ ] Final execution time: _____ ms (target: < _____ ms) ✅/❌
- [ ] Final performance score: _____ /100 (target: 90+) ✅/❌
- [ ] Critical bottlenecks: _____ (target: 0) ✅/❌
- [ ] Overall improvement: _____ % (target: >55%) ✅/❌

---

## Documentation

### Completion Report

- [ ] Create completion report: `profiles/OPTIMIZATION_COMPLETE.md`
- [ ] Include all required sections:
  - [ ] Executive summary
  - [ ] Baseline vs final metrics
  - [ ] Optimizations implemented (patterns used)
  - [ ] Performance impact analysis
  - [ ] Test coverage summary
  - [ ] ROI analysis
  - [ ] Reusable components
  - [ ] Lessons learned

### Code Documentation

- [ ] Update agent documentation with performance notes
- [ ] Ensure all new code has JSDoc
- [ ] Add inline comments for complex optimizations
- [ ] Create usage examples

### Knowledge Sharing

- [ ] Add to regression test suite (CI/CD)
- [ ] Set baseline tolerance (±20%)
- [ ] Update this checklist with new learnings (if any)
- [ ] Demo to team (if >80% improvement)

---

## Pattern Selection Guide

Use this quick reference to choose the right pattern:

### Pattern 1: Batch API Operations

**Use When**:
- [ ] N+1 query pattern detected
- [ ] Multiple API calls for related data in loop
- [ ] Individual calls per field/object/record

**Expected**: 80-96% improvement

**Implementation**: `batch-field-metadata.js` (example)

---

### Pattern 2: Parallel Processing

**Use When**:
- [ ] Sequential processing of independent operations
- [ ] Operations can run concurrently
- [ ] No dependencies between operations

**Expected**: 90-99% improvement

**Implementation**: `parallel-conflict-detector.js` (example)

---

### Pattern 3: LRU Cache with TTL

**Use When**:
- [ ] Same data accessed repeatedly
- [ ] Metadata rarely changes
- [ ] High read-to-write ratio (>80% reads)

**Expected**: 10-20% improvement (warm cache), near-zero latency

**Implementation**: `field-metadata-cache.js` (example)

---

### Pattern 4: Eliminate Agent Overhead

**Use When**:
- [ ] Task.launch() calls in loops
- [ ] Simple logic that doesn't need agent complexity
- [ ] Agent startup overhead >1s

**Expected**: 90-95% improvement

**Implementation**: Inline logic with classes/functions

---

## Combining Patterns

**Best Combinations**:

- [ ] N+1 + Sequential → Pattern 1 + Pattern 2 (95-98% improvement)
- [ ] N+1 + Repeated → Pattern 1 + Pattern 3 (98-100% improvement)
- [ ] Sequential Agents + Simple → Pattern 2 + Pattern 4 (95-99% improvement)
- [ ] **All Four Patterns** → 99-100% improvement

---

## Success Criteria

Mark when ALL criteria are met:

- [ ] Target execution time achieved or exceeded
- [ ] Performance score ≥ 90/100
- [ ] Critical bottlenecks eliminated (0 remaining)
- [ ] All tests passing (100% pass rate)
- [ ] Improvement ≥ 55% (or target percentage)
- [ ] No regressions in other functionality
- [ ] Documentation complete
- [ ] Code reviewed and committed

---

## ROI Calculation

Document the business value:

**Time Savings**:
- Baseline execution time: _____ s
- Optimized execution time: _____ s
- Time saved per operation: _____ s
- Operations per day: _____
- Daily time savings: _____ minutes
- Annual time savings: _____ hours

**Cost Savings**:
- API cost savings: $_____ /year
- User time savings: $_____ /year (@ $150/hr)
- **Total annual value**: $_____ /year

---

## Common Pitfalls to Avoid

- [ ] ❌ Optimizing before profiling (premature optimization)
- [ ] ❌ Skipping tests (regression risk)
- [ ] ❌ Not benchmarking (can't prove improvement)
- [ ] ❌ Optimizing wrong bottleneck (wasted effort)
- [ ] ❌ Breaking functionality for performance (always maintain correctness)
- [ ] ❌ Not documenting patterns (knowledge loss)
- [ ] ❌ Continuing after target met (diminishing returns)

---

## Quick Commands Reference

```bash
# Profile agent
node scripts/lib/agent-profiler.js --agent NAME --profile

# Run specific test suite
node test/golden-test-suite.js --suite=SUITE_NAME

# Run all tests
node test/golden-test-suite.js

# Benchmark optimization
node scripts/lib/OPTIMIZATION_NAME.js benchmark

# Combined benchmark (all phases)
node scripts/lib/combined-benchmark.js all
```

---

## Sign-Off

**Optimization Name**: _________________________________

**Completed By**: _________________________________

**Date**: _________________________________

**Final Metrics**:
- Execution Time: _____ ms (_____ % improvement)
- Performance Score: _____ /100
- Tests Passing: _____ / _____ (100%)
- ROI: $_____ /year

**Status**: ✅ COMPLETE / ⏳ IN PROGRESS / ❌ BLOCKED

**Notes**:
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________

---

**Checklist Version**: 1.0.0
**Last Updated**: 2025-10-18
**Reference**: See PERFORMANCE_OPTIMIZATION_PLAYBOOK.md for detailed guidance
