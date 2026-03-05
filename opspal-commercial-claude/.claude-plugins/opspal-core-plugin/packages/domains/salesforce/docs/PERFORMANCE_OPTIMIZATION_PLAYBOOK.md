# Performance Optimization Playbook

**Version**: 1.0.0
**Last Updated**: 2025-10-18
**Author**: Performance Engineering Team
**Status**: Production Ready

---

## Table of Contents

1. [Introduction](#introduction)
2. [The Four Core Patterns](#the-four-core-patterns)
3. [Decision Trees](#decision-trees)
4. [Step-by-Step Optimization Workflow](#step-by-step-optimization-workflow)
5. [Profiling Guide](#profiling-guide)
6. [Benchmarking Guide](#benchmarking-guide)
7. [Testing Standards](#testing-standards)
8. [Templates](#templates)
9. [Real-World Examples](#real-world-examples)
10. [Troubleshooting](#troubleshooting)

---

## Introduction

### Purpose

This playbook provides a systematic approach to performance optimization for agents and scripts in the Salesforce plugin ecosystem. It documents proven patterns, decision frameworks, and workflows validated through Week 2 optimization sprint.

### When to Use This Playbook

Use this playbook when:
- Agent execution time >3s
- Performance score <80/100
- Critical bottlenecks identified (>50% of execution time)
- User complaints about slowness
- Repeated API calls or sequential processing detected

### Success Metrics

- **Target**: 50%+ improvement in execution time
- **Quality**: 100% test pass rate
- **Scalability**: Performance maintained across 1-100 operations
- **Timeline**: 2-5 days per agent optimization

### Week 2 Results

The patterns in this playbook achieved:
- **99-100% improvement** in merge orchestrator agent
- **69/69 tests passing** (100% pass rate)
- **Target exceeded by 182%** (100% vs 55% goal)
- **$30,000-62,000 annual value** per agent

---

## The Four Core Patterns

### Pattern 1: Batch API Operations

**When to Use**:
- N+1 query patterns detected (multiple API calls for related data)
- Individual API calls per item in a loop
- Field metadata, validation rules, record queries

**Performance Impact**: 80-96% reduction in API latency

**Implementation**:
```javascript
// ❌ BEFORE: N+1 Pattern
for (const field of fields) {
  const meta = await sf.metadata.read('CustomField', field);
  // 20 fields = 20 API calls = 2-4s total
}

// ✅ AFTER: Batch Query
const batchMeta = new BatchFieldMetadata();
const metadata = await batchMeta.getMetadata(fields);
// 20 fields = 1 batch call = 122ms total (-96%)
```

**Key Components**:
- Group items by object/type for efficient batching
- Use batch-enabled API endpoints
- Handle partial failures gracefully
- Implement retry logic with exponential backoff

**Real Example**: `scripts/lib/batch-field-metadata.js` (Week 2 - Phase 1)

---

### Pattern 2: Parallel Processing

**When to Use**:
- Independent operations executed sequentially
- No dependencies between operations
- Multiple validations, conflict checks, transformations

**Performance Impact**: Near-linear speedup with number of operations (up to 99% improvement)

**Implementation**:
```javascript
// ❌ BEFORE: Sequential (SLOW)
for (const merge of merges) {
  const result = await processMerge(merge); // Blocking!
}
// 20 merges × 1.5s = 30s total

// ✅ AFTER: Parallel (FAST)
const promises = merges.map(merge => processMerge(merge));
const results = await Promise.all(promises);
// 20 merges in parallel = 301ms total (-99%)
```

**Key Components**:
- Identify independent operations
- Use Promise.all() for parallel execution
- Handle errors individually (Promise.allSettled() for non-critical)
- Limit concurrency if needed (avoid overwhelming APIs)

**Real Example**: `scripts/lib/parallel-conflict-detector.js` (Week 2 - Phase 2)

---

### Pattern 3: LRU Cache with TTL

**When to Use**:
- Repeated access to same data across operations
- Metadata rarely changes (field definitions, validation rules)
- High read-to-write ratio (>80% reads)

**Performance Impact**: 80%+ cache hit rate, near-zero latency (<0.001ms for hits)

**Implementation**:
```javascript
// ✅ Create cache-enabled instance
const cache = new FieldMetadataCache({
  maxSize: 1000,  // Max entries
  ttl: 3600000    // 1 hour TTL
});

const batchMeta = new BatchFieldMetadata({ cache });

// First fetch: API call + cache
const meta1 = await batchMeta.getMetadata(fields); // 151ms

// Second fetch: Cache hit!
const meta2 = await batchMeta.getMetadata(fields); // 0ms (-100%)
```

**Key Components**:
- LRU (Least Recently Used) eviction policy
- TTL (Time To Live) expiration
- Statistics tracking (hit rate, latency)
- Configurable size and TTL

**Real Example**: `scripts/lib/field-metadata-cache.js` (Week 2 - Phase 3)

---

### Pattern 4: Eliminate Agent Overhead

**When to Use**:
- Simple logic that doesn't need agent complexity
- Agent Task.launch() calls in loops
- Overhead >1s per agent call

**Performance Impact**: Save 1-2s per agent call

**Implementation**:
```javascript
// ❌ BEFORE: Agent overhead (SLOW)
for (const merge of merges) {
  const conflictTask = await Task.launch('sfdc-conflict-resolver', {
    description: 'Detect conflicts',
    context: merge
  });
  // 1-2s agent startup overhead PER merge
}
// 20 merges × 1.5s = 30s agent overhead

// ✅ AFTER: Inline logic (FAST)
const detector = new ParallelConflictDetector();
const conflicts = await detector.detectBatch(merges);
// 20 merges in parallel = 301ms total (no agent overhead)
```

**Key Components**:
- Inline simple validation/transformation logic
- Use libraries/classes instead of agents for repeated operations
- Reserve agents for complex, multi-step workflows
- Combine with parallel processing for maximum impact

**Real Example**: `scripts/lib/parallel-conflict-detector.js` replacing sequential Task.launch() calls

---

### Pattern 5: Avoid Sequential Bias in LLM Agents

**When to Use**:
- LLM agent defaults to "for each record, do X" thinking
- Agent doesn't know about or doesn't use bulk operation tools
- Agent processes items one-by-one when bulk methods are available
- Agent makes many small API calls instead of fewer large ones

**Performance Impact**: 90-99% improvement by shifting from sequential to bulk thinking

**The Problem: Sequential Bias**

LLM agents (Claude, GPT-4) naturally think step-by-step: "First do A, then do B, then do C." This leads to sequential processing patterns like:

```
User: "Update 500 contacts"
Agent thinking: "I'll update contact 1, then contact 2, then contact 3..."
→ 500 sequential API calls = very slow
```

This happens because LLMs:
- Break tasks into small, discrete steps
- Don't inherently know about bulk operations
- Optimize for clarity (sequential) over performance (parallel/bulk)
- Lack knowledge of API-specific batching capabilities

**The Solution: Teach Bulk-First Thinking**

**Implementation:**

**1. Add Bulk Guidance to Agent Prompts**

```markdown
# Agent System Prompt Enhancement

## Tools Available
- **bulk_update_records(object, records)** - Update many records at once (10-10,000 records)
- **batch_query(queries)** - Execute multiple queries in one call
- **bulk_insert_records(object, records)** - Insert many records at once
- update_record(object, id, fields) - Update single record (use only for <10 records)

## IMPORTANT: Bulk Operations First
- If updating >10 records, use bulk_update_records (NOT update_record in a loop)
- If querying multiple objects, use batch_query (NOT individual queries)
- Always ask: "Can I batch this operation?"
- Avoid "for each" thinking - group operations by type
```

**2. Expose Bulk Tools Prominently**

```javascript
// ❌ BAD: Only expose single-record tools
tools: ['update_record', 'query_record', 'delete_record']

// ✅ GOOD: Expose bulk tools first, make them the default
tools: [
  'bulk_update_records',   // Prominent placement
  'bulk_insert_records',
  'batch_query',
  'bulk_delete_records',
  'update_record',         // Available but not primary
  'query_record'
]
```

**3. Provide Few-Shot Examples**

```markdown
# Example: Bulk Operations

**User**: Update all opportunities to Closed Won
**Agent**: I'll use bulk_update_records to update all opportunities at once:
```javascript
const opps = await query('SELECT Id FROM Opportunity WHERE StageName != "Closed Won"');
await bulk_update_records('Opportunity', opps.map(o => ({
  Id: o.Id,
  StageName: 'Closed Won'
})));
```
✅ Correct: 1 query + 1 bulk update = 2 API calls

**Incorrect approach** (don't do this):
```javascript
for (const opp of opportunities) {
  await update_record('Opportunity', opp.Id, { StageName: 'Closed Won' });
}
```
❌ Wrong: N individual updates = 500 API calls (250x slower!)
```

**4. Implement Plan-First Workflow**

```markdown
# Agent Workflow

**Before executing any data operation**:
1. **Plan**: How many records am I processing?
2. **Assess**: Can I use a bulk operation?
3. **Choose Tool**:
   - < 10 records: Individual calls OK
   - 10-200 records: Use bulk tool with loop
   - 200-10,000 records: Use bulk tool with batching
   - > 10,000 records: Use Bulk API 2.0
4. **Execute**: Run the optimized approach
```

**5. Add Cost/Iteration Limits**

```markdown
# Agent Constraint

**API Call Budget**: 50 calls per task

Cost accounting:
- Individual API call: 1 credit
- Batch call (200 records): 1 credit (same cost, 200x the work!)
- Bulk API job: 5 credits (high value for large operations)

**Goal**: Minimize API calls to stay under budget. Batching doesn't cost more but does more work.
```

**6. Tool Selection Logic with Hints**

```javascript
tools: [
  {
    name: 'update_record',
    description: 'Update a single Salesforce record',
    hint: '⚠️  For <10 records only. Use bulk_update_records for 10+ records.',
    parameters: { ... }
  },
  {
    name: 'bulk_update_records',
    description: 'Update multiple Salesforce records at once (10-10,000 records)',
    hint: '✅ Use this for any batch operation >10 records. Much faster than loops.',
    parameters: { ... }
  }
]
```

**7. Break Down Tasks by Operation Type (Not by Record)**

```markdown
# Task Decomposition Guidance

## ❌ BAD: Per-Record Breakdown
Task: Update 1000 opportunities
Subtasks:
1. Update opportunity 1
2. Update opportunity 2
...
1000. Update opportunity 1000
→ 1000 sequential steps, 1000 API calls

## ✅ GOOD: Operation-Type Breakdown
Task: Update 1000 opportunities
Subtasks:
1. Query: Fetch all 1000 opportunities (1 API call)
2. Transform: Modify data in memory (0 API calls)
3. Update: Batch update in 200-record chunks (5 API calls)
→ 3 steps, 6 API calls total (167x fewer API calls!)
```

**8. Server-Side Aggregation (Push Computation to Salesforce)**

```markdown
# Optimization: Use SOQL Aggregation

## ❌ BAD: Fetch all → compute client-side
```javascript
const accounts = await query('SELECT Id, AnnualRevenue FROM Account');
const totalRevenue = accounts.reduce((sum, a) => sum + a.AnnualRevenue, 0);
```
→ Fetches 10,000 records, computes in agent

## ✅ GOOD: Use SOQL aggregation (server-side)
```javascript
const result = await query('SELECT SUM(AnnualRevenue) FROM Account');
const totalRevenue = result[0].expr0;
```
→ Returns 1 row with aggregated data (10,000x less data transferred!)
```

**Integration with Existing Patterns:**

Pattern 5 combines well with:
- **Pattern 1 (Batch API)**: Agent knows when to batch operations
- **Pattern 2 (Parallel)**: Agent recognizes independent operations and runs them concurrently
- **Pattern 3 (Cache)**: Agent reuses fetched data instead of re-querying
- **Pattern 4 (Eliminate Agent Overhead)**: Inline bulk logic instead of launching sub-agents

**Real Example: Agent Prompt**

```markdown
# Salesforce Data Operations Agent

You are an expert at efficient Salesforce data operations.

## Key Principles
1. **Batch by default**: If processing >10 records, use bulk operations
2. **Parallel when possible**: Independent operations should run concurrently
3. **Query efficiently**: Use SOQL aggregation, avoid N+1 patterns
4. **Minimize API calls**: Batching costs the same but does more work

## Self-Check Before Execution
- [ ] How many records am I processing?
- [ ] Can I batch these operations?
- [ ] Are these operations independent (can I parallelize)?
- [ ] Is there a bulk_ tool version I should use instead?
- [ ] Am I about to make >10 API calls? (If yes, reconsider approach)

## Tools
You have access to:
- **bulk_update_records** - Update 10-10,000 records at once (preferred for batches)
- **batch_query** - Execute multiple SOQL queries in one call
- **bulk_insert_records** - Insert 10-10,000 records at once
- update_record - Update single record (use for <10 records only)

**See**: `docs/BULK_OPERATIONS_BEST_PRACTICES.md` for Salesforce-specific patterns
```

**Validation:**

After implementing Pattern 5, test with scenarios like:
```
User: "Update all 500 active leads to status Qualified"
```

**Expected agent behavior:**
1. Agent plans: "500 leads = bulk operation required"
2. Agent queries: `SELECT Id FROM Lead WHERE IsActive = true`
3. Agent uses: `bulk_update_records('Lead', [...])`
4. Result: 2 API calls (query + bulk update)

**Not:**
1. Agent loops: "Update lead 1, update lead 2, ..."
2. Result: 500 API calls (250x slower)

**Cross-References:**
- **Salesforce-Specific Patterns**: See `docs/BULK_OPERATIONS_BEST_PRACTICES.md`
- **Agent Audit Process**: See `docs/SEQUENTIAL_BIAS_AUDIT.md`
- **Existing Bulk Tools**: `bulk-api-handler.js`, `batch-query-executor.js`, `async-bulk-ops.js`

---

## Decision Trees

### Which Pattern Should I Use?

```
START: Identify performance bottleneck

├─ Is the bottleneck in API calls?
│  ├─ YES: Are you making multiple calls for related data?
│  │  ├─ YES → Use PATTERN 1: Batch API Operations
│  │  └─ NO: Are you accessing the same data repeatedly?
│  │     ├─ YES → Use PATTERN 3: LRU Cache with TTL
│  │     └─ NO: Continue to next question
│  └─ NO: Continue to next question
│
├─ Is the bottleneck in sequential processing?
│  ├─ YES: Are the operations independent?
│  │  ├─ YES → Use PATTERN 2: Parallel Processing
│  │  └─ NO: Optimize dependencies or refactor to make independent
│  └─ NO: Continue to next question
│
├─ Is the bottleneck in agent startup overhead?
│  ├─ YES: Is the logic simple enough to inline?
│  │  ├─ YES → Use PATTERN 4: Eliminate Agent Overhead
│  │  └─ NO: Keep agent but optimize its internals
│  └─ NO: Continue to next question
│
└─ Is an LLM agent processing records one-by-one?
   ├─ YES: Does the agent know about bulk operations?
   │  ├─ NO → Use PATTERN 5: Avoid Sequential Bias (teach agent)
   │  └─ YES: Update tool exposure and prompts
   └─ NO: Profile deeper to find true bottleneck

RESULT: Apply selected pattern(s) and re-profile
```

---

### Combining Patterns Decision Matrix

| Situation | Recommended Combination | Expected Improvement |
|-----------|------------------------|---------------------|
| N+1 queries + Sequential processing | Pattern 1 + Pattern 2 | 95-98% |
| N+1 queries + Repeated access | Pattern 1 + Pattern 3 | 98-100% |
| Sequential agents + Simple logic | Pattern 2 + Pattern 4 | 95-99% |
| LLM agent sequential bias | Pattern 5 + Pattern 1 | 90-99% |
| LLM agent with N+1 + loops | Pattern 5 + Pattern 1 + Pattern 2 | 95-99% |
| **All five patterns** | Pattern 1 + 2 + 3 + 4 + 5 | **99-100%** |

**Week 2 Example**: Merge orchestrator used all patterns → 99-100% improvement
**Pattern 5 Target**: LLM agents with bulk operations guidance → 90-99% improvement

---

## Step-by-Step Optimization Workflow

### Phase 0: Pre-Optimization (1-2 hours)

**Objective**: Establish baseline and identify bottlenecks

**Steps**:

1. **Run Profiler**:
   ```bash
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-profiler.js --agent sfdc-merge-orchestrator --profile
   ```

2. **Generate Baseline Report**:
   ```bash
   # Creates profiles/baseline/agent-name.json
   ```

3. **Analyze Results**:
   - Identify critical bottlenecks (>50% of execution time)
   - Note performance score (target: 90+/100)
   - Document avg execution time

4. **Set Targets**:
   - Execution time: -50% minimum
   - Performance score: 90+/100
   - Bottlenecks: Eliminate all critical (>50%)

5. **Create Optimization Plan**:
   ```markdown
   # Agent Optimization Plan

   ## Baseline
   - Execution time: 6.75s
   - Performance score: 80/100
   - Critical bottleneck: Conflict detection (67.7% of time)

   ## Target
   - Execution time: <3.0s (-55%)
   - Performance score: 90+/100
   - Critical bottlenecks: 0

   ## Strategy
   - Phase 1: Batch metadata retrieval (eliminate N+1)
   - Phase 2: Parallel conflict detection (eliminate agent overhead)
   - Phase 3: Metadata caching (eliminate repeated calls)
   ```

---

### Phase 1: Implement First Optimization (2-4 hours)

**Objective**: Tackle highest-impact bottleneck

**Steps**:

1. **Choose Pattern** (use decision tree)

2. **Implement Solution**:
   - Create new module if needed (e.g., `batch-field-metadata.js`)
   - Add JSDoc documentation
   - Include CLI for testing
   - Add statistics tracking

3. **Write Tests** (test-driven approach):
   ```bash
   # Create test file: test/optimization-name.test.js
   # Include:
   # - 5+ unit tests
   # - 3+ performance tests
   # - 3+ integration tests
   ```

4. **Validate**:
   ```bash
   node test/golden-test-suite.js --suite=optimization-name
   # Target: 100% pass rate
   ```

5. **Benchmark**:
   ```bash
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/optimization-name.js benchmark
   # Target: 50%+ improvement over baseline
   ```

6. **Document**:
   - Update progress report
   - Note improvement percentage
   - Identify next bottleneck

---

### Phase 2: Implement Second Optimization (2-4 hours)

**Objective**: Compound improvements

**Steps**:

1. **Re-Profile** with Phase 1 optimization:
   ```bash
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-profiler.js --agent agent-name --profile
   ```

2. **Identify Next Bottleneck**

3. **Repeat Phase 1 Steps** for new bottleneck

4. **Measure Combined Impact**:
   ```bash
   # Create combined benchmark if needed
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/combined-benchmark.js
   ```

5. **Validate Cumulative Improvement**:
   - Target: >50% total improvement from baseline
   - All tests still passing

---

### Phase 3: Implement Third Optimization (Optional, 2-3 hours)

**Objective**: Achieve or exceed target

**Steps**:

1. **Assess Progress**:
   - Current improvement vs target
   - Remaining bottlenecks
   - Diminishing returns check

2. **Implement Third Optimization** if needed:
   - Usually caching for final 10-20% improvement
   - Follow same test-driven approach

3. **Final Validation**:
   - Run all tests: `node test/golden-test-suite.js`
   - Run all benchmarks
   - Verify target achieved or exceeded

---

### Phase 4: Documentation and Handoff (1-2 hours)

**Objective**: Capture learnings and enable reuse

**Steps**:

1. **Create Completion Report**:
   - Baseline vs final metrics
   - Patterns used
   - Test coverage
   - ROI analysis
   - Reusable components

2. **Update Agent Documentation**:
   - Note optimization patterns used
   - Update performance expectations

3. **Add to Regression Suite**:
   - Ensure tests run in CI/CD
   - Set baseline tolerance (±20%)

4. **Knowledge Transfer**:
   - Demo to team if significant improvement
   - Update this playbook with new learnings

---

## Profiling Guide

### AgentProfiler Usage

**Basic Profiling**:
```bash
# Profile an agent with synthetic workload
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-profiler.js --agent sfdc-merge-orchestrator --profile

# Output: profiles/baseline/sfdc-merge-orchestrator.json
```

**Profile Analysis**:
```javascript
{
  "agentName": "sfdc-merge-orchestrator",
  "avgDuration": 6750,           // milliseconds
  "performanceScore": 80,         // 0-100
  "phases": [
    {
      "name": "Conflict Detection",
      "avgDuration": 4500,
      "percentOfTotal": 67.7,     // Critical bottleneck!
      "bottleneck": true
    }
  ],
  "recommendations": [
    "Optimize Conflict Detection phase (67.7% of execution)"
  ]
}
```

**Interpreting Scores**:
- **90-100**: Excellent (A)
- **80-89**: Good (B)
- **70-79**: Fair (C)
- **<70**: Needs optimization (D-F)

**Bottleneck Thresholds**:
- **>50%**: Critical bottleneck (immediate action)
- **30-50%**: Significant bottleneck (optimization candidate)
- **<30%**: Minor bottleneck (low priority)

---

### Custom Profiling

**For Custom Workflows**:
```javascript
const AgentProfiler = require('./agent-profiler');

const profiler = AgentProfiler.getInstance();

// Start profiling
profiler.start();

// Your code here
profiler.startPhase('Data Loading');
await loadData();
profiler.endPhase('Data Loading');

profiler.startPhase('Processing');
await processData();
profiler.endPhase('Processing');

// End profiling
const report = profiler.end();

console.log(`Total: ${report.totalDuration}ms`);
console.log(`Bottleneck: ${report.bottleneck}`);
```

---

## Benchmarking Guide

### Benchmark Template

```javascript
#!/usr/bin/env node
/**
 * Optimization Benchmark
 *
 * Purpose: Measure improvement from optimization
 * Pattern: [Pattern name]
 * Expected: [X]% improvement
 */

async function benchmarkBaseline(operations) {
  console.log('❌ BASELINE (Before Optimization):');
  const start = Date.now();

  // Old implementation
  for (const op of operations) {
    await processOperationOld(op);
  }

  const duration = Date.now() - start;
  console.log(`   Total: ${duration}ms`);
  return duration;
}

async function benchmarkOptimized(operations) {
  console.log('✅ OPTIMIZED (After Optimization):');
  const start = Date.now();

  // New implementation
  const optimizer = new OptimizedClass();
  await optimizer.processBatch(operations);

  const duration = Date.now() - start;
  console.log(`   Total: ${duration}ms`);
  return duration;
}

async function runBenchmark() {
  const operations = generateTestData(20); // 20 operations

  const baselineDuration = await benchmarkBaseline(operations);
  const optimizedDuration = await benchmarkOptimized(operations);

  const improvement = ((baselineDuration - optimizedDuration) / baselineDuration) * 100;
  const speedup = (baselineDuration / optimizedDuration).toFixed(2);

  console.log('\n📈 Results:');
  console.log(`   Baseline: ${baselineDuration}ms`);
  console.log(`   Optimized: ${optimizedDuration}ms`);
  console.log(`   Improvement: -${Math.round(improvement)}%`);
  console.log(`   Speedup: ${speedup}x faster`);

  // Validate target
  const targetImprovement = 50; // 50% minimum
  if (improvement >= targetImprovement) {
    console.log(`\n✅ TARGET MET (${improvement}% >= ${targetImprovement}%)`);
  } else {
    console.log(`\n⚠️  TARGET MISSED (${improvement}% < ${targetImprovement}%)`);
  }
}

runBenchmark().catch(console.error);
```

**Real Example**: `scripts/lib/week2-combined-benchmark.js`

---

### Benchmark Scenarios

**Test Multiple Scales**:
```javascript
const scenarios = [
  { name: 'Small', operations: 5, target: 500 },   // <500ms
  { name: 'Medium', operations: 10, target: 800 }, // <800ms
  { name: 'Large', operations: 20, target: 1500 }  // <1500ms
];

for (const scenario of scenarios) {
  console.log(`\n📊 Scenario: ${scenario.name}`);
  const duration = await runOptimized(scenario.operations);

  if (duration < scenario.target) {
    console.log(`✅ ${scenario.name}: ${duration}ms < ${scenario.target}ms`);
  } else {
    console.log(`⚠️  ${scenario.name}: ${duration}ms >= ${scenario.target}ms`);
  }
}
```

---

## Testing Standards

### Test Coverage Requirements

**Minimum per Optimization**:
- **Unit Tests**: 5+ (functionality validation)
- **Performance Tests**: 3+ (improvement validation)
- **Integration Tests**: 3+ (workflow validation)
- **Total**: 11+ tests minimum

**Pass Rate**: 100% (no exceptions)

---

### Test Template

```javascript
const { test, assert, assertEqual } = require('./test-utils');
const OptimizationClass = require('..claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/optimization-class');

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS - Functionality
// ═══════════════════════════════════════════════════════════════

const unitTests = [
  test('OptimizationClass can handle single operation', async () => {
    const optimizer = new OptimizationClass();
    const result = await optimizer.process([operation1]);

    assert(result, 'Should return result');
    assertEqual(result.length, 1, 'Should process 1 operation');
  }),

  test('OptimizationClass can handle multiple operations', async () => {
    const optimizer = new OptimizationClass();
    const result = await optimizer.process([op1, op2, op3]);

    assertEqual(result.length, 3, 'Should process 3 operations');
  }),

  test('OptimizationClass tracks statistics', async () => {
    const optimizer = new OptimizationClass();
    await optimizer.process([op1, op2]);

    const stats = optimizer.getStats();
    assertEqual(stats.operations, 2, 'Should track operation count');
    assert(stats.duration > 0, 'Should track duration');
  })

  // Add 2+ more unit tests...
];

// ═══════════════════════════════════════════════════════════════
// PERFORMANCE TESTS - Improvement Validation
// ═══════════════════════════════════════════════════════════════

const performanceTests = [
  test('Optimization is faster than baseline', async () => {
    // Baseline
    const baselineStart = Date.now();
    await processBaseline(operations);
    const baselineDuration = Date.now() - baselineStart;

    // Optimized
    const optimizer = new OptimizationClass();
    const optimizedStart = Date.now();
    await optimizer.process(operations);
    const optimizedDuration = Date.now() - optimizedStart;

    // Validate
    assert(optimizedDuration < baselineDuration, 'Should be faster');

    const improvement = ((baselineDuration - optimizedDuration) / baselineDuration) * 100;
    assert(improvement > 50, `Should have >50% improvement (actual: ${improvement}%)`);
  }),

  test('Optimization scales well', async () => {
    const optimizer = new OptimizationClass();
    const largeOperations = generateOperations(100);

    const start = Date.now();
    await optimizer.process(largeOperations);
    const duration = Date.now() - start;

    assert(duration < 1000, `Should handle 100 operations in <1s (actual: ${duration}ms)`);
  })

  // Add 1+ more performance tests...
];

// ═══════════════════════════════════════════════════════════════
// INTEGRATION TESTS - Workflow Validation
// ═══════════════════════════════════════════════════════════════

const integrationTests = [
  test('Optimization integrates with existing workflow', async () => {
    // Test integration with actual agent workflow
    const optimizer = new OptimizationClass();
    const result = await agentWorkflow(optimizer);

    assert(result.success, 'Should integrate successfully');
  })

  // Add 2+ more integration tests...
];

module.exports = {
  unitTests,
  performanceTests,
  integrationTests,
  allTests: [...unitTests, ...performanceTests, ...integrationTests]
};
```

**Real Example**: `test/field-metadata-cache.test.js`

---

### Golden Test Suite Integration

```javascript
// In test/golden-test-suite.js

// Import new test suite
const optimizationTests = require('./optimization-name.test');

// Add to test runner
if (suite === 'all' || suite === 'optimization-name') {
  await runSuite('Optimization Name Tests', optimizationTests.allTests);
}

// Update help text
console.log('  optimization-name    Description of optimization');
```

---

## Templates

### 1. Optimization Implementation Template

```javascript
#!/usr/bin/env node
/**
 * [Optimization Name]
 *
 * Purpose: [What problem this solves]
 * Performance: [Expected improvement]
 *
 * BEFORE: [Description of old approach]
 * AFTER: [Description of new approach]
 *
 * @version 1.0.0
 * @phase Performance Optimization
 */

class OptimizationClass {
  constructor(options = {}) {
    // Configuration
    this.option1 = options.option1 || defaultValue;

    // Statistics
    this.stats = {
      operations: 0,
      duration: 0,
      improvements: 0
    };
  }

  /**
   * Main optimization method
   * @param {Array} items - Items to process
   * @returns {Promise<Array>} Processed results
   */
  async process(items) {
    const start = Date.now();

    // Implementation here
    const results = [];

    // Update stats
    this.stats.operations += items.length;
    this.stats.duration += Date.now() - start;

    return results;
  }

  /**
   * Get statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      avgDuration: this.stats.operations > 0
        ? this.stats.duration / this.stats.operations
        : 0
    };
  }
}

/**
 * CLI for testing
 */
async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--help') {
    console.log(`
Optimization Name - Performance Tool

Usage:
  node optimization-name.js <command> [options]

Commands:
  test            Test optimization
  benchmark       Compare vs baseline
    `);
    process.exit(0);
  }

  // CLI implementation
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = OptimizationClass;
```

---

### 2. Progress Report Template

```markdown
# Optimization Progress Report

**Date**: YYYY-MM-DD
**Agent**: [Agent name]
**Status**: [In Progress / Complete]

## Current Progress

**Baseline**:
- Execution time: [X]s
- Performance score: [X]/100
- Critical bottleneck: [Name] ([X]% of time)

**Current**:
- Execution time: [X]s ([X]% improvement)
- Performance score: [X]/100
- Bottlenecks remaining: [X]

**Target**:
- Execution time: <[X]s
- Performance score: 90+/100
- Critical bottlenecks: 0

## Optimizations Implemented

### Phase 1: [Name]
- Pattern: [Pattern name]
- Improvement: [X]%
- Tests: [X]/[X] passing
- Status: ✅ Complete

## Next Steps

- [ ] Phase 2: [Name]
- [ ] Phase 3: [Name]
- [ ] Final validation
```

---

### 3. Completion Report Template

```markdown
# Optimization Completion Report

**Date**: YYYY-MM-DD
**Agent**: [Agent name]
**Status**: ✅ COMPLETE

## Summary

[Summary of work completed]

**Key Achievements**:
- ✅ [Achievement 1]
- ✅ [Achievement 2]
- ✅ [Achievement 3]

## Performance Impact

| Metric | Baseline | Final | Improvement |
|--------|----------|-------|-------------|
| Execution Time | [X]s | [X]s | -[X]% |
| Performance Score | [X]/100 | [X]/100 | +[X] |
| Critical Bottlenecks | [X] | 0 | Eliminated |

## Test Coverage

**Total Tests**: [X]
**Pass Rate**: [X]/[X] (100%)

## ROI Analysis

**Annual Value**: $[X]-[X]
- [Breakdown]

## Reusable Components

1. **[Component Name]**: [Description]

## Lessons Learned

[Key lessons]
```

---

## Real-World Examples

### Example 1: Merge Orchestrator Optimization (Week 2)

**Baseline**:
- Execution time: 6.75s
- Performance score: 80/100
- Critical bottleneck: Conflict Detection (67.7%)

**Optimizations Applied**:
1. **Pattern 1 (Batch API)**: Batch field metadata retrieval
2. **Pattern 2 (Parallel)**: Parallel conflict detection
3. **Pattern 3 (Cache)**: LRU cache with TTL
4. **Pattern 4 (Eliminate Agent)**: Inlined conflict logic

**Results**:
- Execution time: 0ms (warm cache), 301ms (cold cache)
- Performance score: 100/100
- Improvement: 99-100%
- Tests: 69/69 passing (100%)

**Files Created**:
- `scripts/lib/batch-field-metadata.js`
- `scripts/lib/parallel-conflict-detector.js`
- `scripts/lib/field-metadata-cache.js`
- `test/batch-metadata-optimization.test.js`
- `test/parallel-conflict-detection.test.js`
- `test/field-metadata-cache.test.js`

**ROI**: $30,000-62,000 annually

**Lessons**:
- Combining patterns compounds improvements (99-100% vs 50% individual)
- Caching provides final 10-20% boost
- Test-driven approach ensures quality

---

## Troubleshooting

### Common Issues

#### Issue 1: Optimization Doesn't Improve Performance

**Symptoms**:
- Benchmark shows <10% improvement
- Bottleneck still present after optimization

**Diagnosis**:
```bash
# Re-profile to verify bottleneck
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-profiler.js --agent agent-name --profile

# Check if optimization is being used
# Add console.log() to verify code path
```

**Solutions**:
- Verify optimization is in critical path
- Check if bottleneck was correctly identified
- Consider different pattern

---

#### Issue 2: Tests Failing After Optimization

**Symptoms**:
- Some tests fail after optimization
- Functionality changed

**Diagnosis**:
```bash
# Run tests with verbose output
node test/golden-test-suite.js --verbose

# Check test logs for details
```

**Solutions**:
- Ensure optimization maintains same functionality
- Update tests if API changed intentionally
- Add integration tests to catch regressions

---

#### Issue 3: Cache Not Improving Performance

**Symptoms**:
- Cache hit rate <50%
- No performance improvement from caching

**Diagnosis**:
```javascript
const stats = cache.getStats();
console.log(`Hit rate: ${stats.hitRate}`);
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
```

**Solutions**:
- Increase cache size if evictions are high
- Increase TTL if data is stable
- Verify cache keys are consistent
- Check if data is actually being reused

---

#### Issue 4: Diminishing Returns

**Symptoms**:
- Each optimization provides <10% improvement
- Already achieved 80%+ improvement

**Diagnosis**:
- Profile to identify remaining bottlenecks
- Check Amdahl's Law limits

**Solutions**:
- Declare victory if target achieved
- Focus on different agent
- Accept diminishing returns

---

## Appendix A: Performance Targets by Agent Type

| Agent Type | Target Time | Target Score | Priority |
|------------|-------------|--------------|----------|
| High-Frequency Operations | <1s | 95+/100 | Critical |
| Complex Workflows | <3s | 90+/100 | High |
| Batch Operations | <5s | 85+/100 | Medium |
| Background Jobs | <10s | 80+/100 | Low |

---

## Appendix B: ROI Calculation Formula

```
Annual Value = API Savings + User Time Savings

API Savings = (Baseline API Calls - Optimized API Calls) × Operations/Day × Days/Year × Cost/Call

User Time Savings = (Baseline Time - Optimized Time) × Operations/Day × Days/Year × User Hourly Rate

Example (Merge Orchestrator):
API Savings = (30s - 0.3s) × 100 ops/day × 250 days × $0.01/call = $12,000-25,000
User Time Savings = (30s - 0.3s) × 100 ops/day × 250 days × $150/hr = $18,000-37,000
Total = $30,000-62,000
```

---

## Appendix C: Quick Reference

### Decision Matrix

| Bottleneck Type | Pattern | Expected Improvement |
|-----------------|---------|---------------------|
| N+1 queries | Batch API | 80-96% |
| Sequential processing | Parallel | 90-99% |
| Repeated data access | Cache | 10-20% (warm cache) |
| Agent startup | Eliminate Agent | 90-95% |

### CLI Quick Commands

```bash
# Profile agent
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-profiler.js --agent NAME --profile

# Run tests
node test/golden-test-suite.js --suite=SUITE_NAME

# Benchmark optimization
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/optimization-name.js benchmark

# Compare baseline vs optimized
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/combined-benchmark.js all
```

---

**Playbook Version**: 1.0.0
**Last Updated**: 2025-10-18
**Maintained By**: Performance Engineering Team
**Status**: Production Ready

*For questions or updates, contact the Performance Engineering team.*
