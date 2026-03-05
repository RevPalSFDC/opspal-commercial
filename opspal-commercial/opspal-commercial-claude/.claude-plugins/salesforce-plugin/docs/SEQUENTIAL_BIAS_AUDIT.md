# Sequential Bias Audit Checklist

**Version**: 1.0.0
**Last Updated**: 2025-10-19
**Status**: Production Ready
**Purpose**: Systematic process to identify and eliminate sequential bias across agents and scripts

---

## Table of Contents

1. [Overview](#overview)
2. [Phase 1: Identify Problem Agents](#phase-1-identify-problem-agents)
3. [Phase 2: Fix High-Impact Agents](#phase-2-fix-high-impact-agents)
4. [Phase 3: Update Scripts](#phase-3-update-scripts)
5. [Phase 4: Testing & Validation](#phase-4-testing--validation)
6. [Success Metrics](#success-metrics)
7. [ROI Analysis](#roi-analysis)
8. [Templates](#templates)

---

## Overview

### What is Sequential Bias?

**Sequential bias** is the tendency of agents and scripts to process records **one-by-one** (sequentially) when they could process them **in bulk** or **in parallel**.

**Example:**
```javascript
// ❌ SEQUENTIAL BIAS (slow)
for (const record of records) {
  await update(record);  // 1000 records = 1000 API calls = slow!
}

// ✅ OPTIMIZED (fast)
await bulkUpdate(records);  // 1000 records = 5 batched API calls = 200x faster!
```

### Impact

- **Performance**: 50-99% slower than optimal
- **API Usage**: 10-200x more API calls than necessary
- **User Experience**: "Way too slow" complaints
- **Cost**: Higher API limits consumption

### Goal

Systematically audit and fix sequential bias across:
- **49 agents** in salesforce-plugin
- **313 scripts** in scripts/lib/
- **New development** (prevent future bias)

---

## Phase 1: Identify Problem Agents

**Duration**: 2-3 hours
**Deliverable**: Prioritized list of agents with sequential bias

### Step 1.1: Automated Detection

Run these grep commands to find sequential patterns:

```bash
# Navigate to plugin root
cd .claude-plugins/salesforce-plugin

# Find agents with loops
grep -rn "for\|forEach\|while" agents/*.md | wc -l

# Find agents launching sub-agents in loops
grep -rn "Task.launch" agents/*.md | grep -A 2 -B 2 "for"

# Find scripts with sequential patterns
grep -rn "for.*await" scripts/lib/*.js | wc -l

# Find N+1 query patterns
grep -rn "for.*query" scripts/lib/*.js | grep -v "// OK"

# Save results
grep -rn "for.*await" agents/ scripts/lib/ > audit-sequential-patterns.txt
```

**Expected Output:**
```
Found 15 agents with 'for' loops
Found 8 agents with Task.launch in loops
Found 23 scripts with 'for await' patterns
Found 12 scripts with N+1 queries
```

### Step 1.2: Manual Review - Priority Agents

**Top 10 High-Impact Agents** (prioritized by usage frequency):

| Priority | Agent | Why High Impact | Estimated Improvement |
|----------|-------|-----------------|---------------------|
| 1 | sfdc-data-operations | Core data operations, used by many agents | 90-99% |
| 2 | sfdc-query-specialist | Query execution, used heavily | 80-95% |
| 3 | sfdc-merge-orchestrator | Already optimized (verify) | 0% (baseline) |
| 4 | sfdc-automation-auditor | Scans many records | 70-90% |
| 5 | sfdc-revops-auditor | Analyzes many objects | 70-90% |
| 6 | sfdc-cpq-assessor | Evaluates many quote lines | 60-80% |
| 7 | sfdc-conflict-resolver | Multiple conflict checks | 70-85% |
| 8 | sfdc-state-discovery | Discovers many metadata items | 70-90% |
| 9 | sfdc-metadata-analyzer | Analyzes many fields/objects | 75-90% |
| 10 | sfdc-performance-optimizer | Ironically may need optimization | 60-80% |

### Step 1.3: Red Flags Checklist

For each agent, check for these red flags:

- [ ] **Agent description** mentions "for each record" or "for each object"
- [ ] **No mention** of bulk operations in agent prompt
- [ ] **No bulk tools** in tool list (only single-record tools)
- [ ] **Task.launch()** calls in procedural logic (not orchestration)
- [ ] **No reference** to bulk-api-handler.js or batch-query-executor.js
- [ ] **Sequential processing** described as default approach
- [ ] **No self-check** prompts about operation size
- [ ] **No examples** of batching or parallel execution

**Scoring:**
- 0-2 red flags: Low priority (monitor)
- 3-4 red flags: Medium priority (schedule for Phase 2)
- 5+ red flags: **High priority** (fix immediately)

### Step 1.4: Create Priority Matrix

**Template:**

| Agent | Red Flags | Usage Frequency | Estimated Impact | Priority |
|-------|-----------|-----------------|------------------|----------|
| sfdc-data-operations | 6 | Very High | 90-99% | **P0** |
| sfdc-query-specialist | 5 | Very High | 80-95% | **P0** |
| sfdc-state-discovery | 4 | High | 70-90% | **P1** |
| sfdc-automation-auditor | 4 | High | 70-90% | **P1** |
| ... | ... | ... | ... | ... |

**Priority Levels:**
- **P0**: Fix in Week 1 (top 3 agents)
- **P1**: Fix in Week 2 (agents 4-10)
- **P2**: Fix in Week 3 (agents 11-20)
- **P3**: Fix in Week 4+ (agents 21+)

---

## Phase 2: Fix High-Impact Agents

**Duration**: 1-2 days per agent (5-10 days for top 5)
**Deliverable**: Optimized agents with bulk-first approach

### Step 2.1: Agent Update Template

For each problematic agent, add this section **after the tool definitions**:

```markdown
---

## 🚀 Bulk Operations First

**MANDATORY**: Always assess operation size BEFORE execution.

### Decision Framework

Use this decision tree for ALL data operations:

```
Record Count < 10
  → Standard API (individual calls OK)

Record Count 10-200
  → Standard API with batching (loop + error handling)

Record Count 200-10,000
  → 200-record batches + Composite API
  → Tools: batch-query-executor.js, Composite REST

Record Count > 10,000
  → Bulk API 2.0 (MANDATORY)
  → Tools: bulk-api-handler.js, async-bulk-ops.js
```

### Self-Check Questions

**BEFORE executing any data operation, ask yourself:**
1. ❓ How many records am I processing?
2. ❓ Can I batch these operations?
3. ❓ Are these operations independent (can run in parallel)?
4. ❓ Is there a bulk_ tool version I should use instead?
5. ❓ Am I about to make >10 API calls? (If yes, reconsider approach)

### Tools for Bulk Operations

You have access to:
- **bulk_update_records** - Update 10-10,000 records at once (preferred)
- **batch_query_executor.js** - Batch SOQL queries with Composite API
- **bulk-api-handler.js** - Smart API switching (sync/bulk)
- **async-bulk-ops.js** - Large async operations (>10K records)
- **Composite REST API** - Reduce API calls 50-70%

### Example: Bulk Update Pattern

```javascript
// ❌ WRONG: Sequential processing
for (const record of records) {
  await update_record('Account', record.Id, record.fields);
}
// 500 records = 500 API calls = slow!

// ✅ RIGHT: Bulk update
await bulk_update_records('Account', records);
// 500 records = 3 batched API calls = 167x faster!
```

### Cross-References
- **Bulk Operations Guide**: See `docs/BULK_OPERATIONS_BEST_PRACTICES.md`
- **Performance Patterns**: See `docs/PERFORMANCE_OPTIMIZATION_PLAYBOOK.md` (Pattern 5)
- **Existing Tools**: `bulk-api-handler.js`, `batch-query-executor.js`, `async-bulk-ops.js`

---
```

### Step 2.2: Tool List Updates

Update the agent's **tool list** to expose bulk tools prominently:

```yaml
# ❌ BEFORE (only single-record tools)
tools: mcp_salesforce, Read, Write, Bash

# ✅ AFTER (bulk tools exposed)
tools:
  - mcp_salesforce_bulk         # NEW: Bulk operations
  - mcp_salesforce_batch        # NEW: Batch queries
  - mcp_salesforce              # Standard (fallback)
  - Read, Write, Bash
```

### Step 2.3: Add Few-Shot Examples

Add concrete examples to agent prompt:

```markdown
## Example: Efficient Data Operations

**Scenario**: User asks to update 500 Accounts

**✅ CORRECT APPROACH**:
1. Assess: 500 records = bulk operation required
2. Query: SELECT Id, Name FROM Account WHERE ... (1 API call)
3. Transform: Prepare update data in memory
4. Update: Use bulk_update_records in 200-record batches (3 API calls)
5. Result: 4 total API calls, ~2 seconds

**❌ INCORRECT APPROACH (don't do this)**:
1. Loop: for each of 500 accounts
2. Update: update_record() per account (500 API calls)
3. Result: 500 API calls, ~100 seconds (50x slower!)

**Key Lesson**: Always batch operations when processing >10 records.
```

### Step 2.4: Validation Checklist

After updating each agent:

- [ ] Bulk operations section added after tools
- [ ] Self-check questions included
- [ ] Bulk tools exposed in tool list
- [ ] Few-shot example of bulk approach added
- [ ] Cross-references to playbooks included
- [ ] Agent description mentions "batch" or "bulk"
- [ ] Test scenario with 100 records documented
- [ ] Agent changelog updated

### Step 2.5: Test Agent with Bulk Scenario

**Test Template:**
```bash
# Test prompt
"Update all 100 active Contacts to set LeadSource = 'Website'"

# Expected behavior:
# 1. Agent assesses: 100 records = bulk operation
# 2. Agent uses: bulk_update_records('Contact', [100 records])
# 3. Result: 1-2 API calls total

# NOT expected (red flag):
# 1. Agent loops: "Update contact 1, update contact 2, ..."
# 2. Result: 100 API calls (50x slower)
```

**Acceptance Criteria:**
- ✅ Agent chooses bulk operation automatically
- ✅ Agent batches API calls (< 10 total calls)
- ✅ Execution completes in < 5 seconds
- ❌ Agent does NOT loop sequentially

---

## Phase 3: Update Scripts

**Duration**: 1 week
**Deliverable**: Optimized scripts with parallelism and batching

### Step 3.1: Scripts to Audit (Priority Order)

**High Priority** (20 scripts with sequential patterns identified):

1. **Data Operations**:
   - `data-operations-api.js` - Core operations
   - `bulk-decision-generator.js` - Decision logic
   - `record-match-merge-service.js` - Merge operations

2. **Query Execution**:
   - `query-optimizer.js` - Query patterns
   - `batch-query-executor.js` - Already optimized (verify)

3. **Metadata Retrieval**:
   - `batch-field-metadata.js` - Already optimized (verify)
   - `metadata-analyzer-optimizer.js` - Already optimized (verify)

4. **Validation and Conflicts**:
   - `parallel-conflict-detector.js` - Already optimized (verify)
   - `conflict-resolver-optimizer.js` - Already optimized (verify)

### Step 3.2: Refactoring Pattern

**Standard refactoring from sequential to parallel:**

```javascript
// ❌ BEFORE: Sequential processing
async function processItems(items) {
  const results = [];
  for (const item of items) {
    const result = await processItem(item);  // Blocking!
    results.push(result);
  }
  return results;
}
// Time: N × 500ms = 5 seconds for 10 items

// ✅ AFTER: Parallel processing
async function processItems(items) {
  const promises = items.map(item => processItem(item));
  const results = await Promise.all(promises);
  return results;
}
// Time: max(500ms) = 500ms for 10 items (10x faster!)

// ✅ BETTER: Batched + Parallel
async function processItems(items) {
  const batches = chunk(items, 200);  // Split into batches
  const batchPromises = batches.map(batch => processBatch(batch));
  const batchResults = await Promise.all(batchPromises);
  return batchResults.flat();
}
// Time: max(500ms) per batch + batching efficiency
```

### Step 3.3: Script Refactoring Checklist

For each script:

- [ ] Identify loops with `await` inside (sequential patterns)
- [ ] Determine if operations are independent (can parallelize)
- [ ] Replace sequential loops with `Promise.all()`
- [ ] Add batching if operating on >200 items
- [ ] Add error handling with `Promise.allSettled()` if needed
- [ ] Update JSDoc comments to mention parallelism
- [ ] Add performance benchmarks (before/after)
- [ ] Update tests to verify parallel behavior
- [ ] Document improvement in changelog

### Step 3.4: Test Pattern

```javascript
// test/SCRIPT_NAME.test.js

describe('processItems - Performance', () => {
  test('should process 100 items in parallel (< 1 second)', async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));

    const start = Date.now();
    const results = await processItems(items);
    const duration = Date.now() - start;

    expect(results.length).toBe(100);
    expect(duration).toBeLessThan(1000);  // Must complete in < 1s

    // Verify rate
    const rate = 100 / (duration / 1000);
    console.log(`Rate: ${rate.toFixed(1)} items/sec`);
    expect(rate).toBeGreaterThan(100);  // >100 items/sec = optimized
  });
});
```

---

## Phase 4: Testing & Validation

**Duration**: 1-2 days
**Deliverable**: Comprehensive test reports and regression validation

### Step 4.1: Performance Testing

For each updated agent/script:

```bash
# Profile agent before/after
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-profiler.js --agent AGENT_NAME --profile

# Run benchmark
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/SCRIPT_NAME.js benchmark

# Verify improvement >50%
# Record results in AUDIT_RESULTS.md
```

**Expected Metrics:**
- **Execution time**: >50% reduction
- **API calls**: >50% reduction
- **Records/sec rate**: >10x improvement

### Step 4.2: Regression Testing

```bash
# Run full test suite
node test/golden-test-suite.js

# Verify all tests pass
# Expected: 100% pass rate
```

**If tests fail:**
1. Identify which agent/script caused regression
2. Review changes for correctness
3. Fix bugs (preserve optimization)
4. Re-test until 100% pass rate

### Step 4.3: Integration Testing

Test updated agents in realistic scenarios:

```bash
# Scenario 1: Update 500 records
# Expected: < 5 seconds, < 10 API calls

# Scenario 2: Query 10 objects
# Expected: < 1 second, 1 API call (batched)

# Scenario 3: Parallel conflict detection
# Expected: < 2 seconds for 20 merges
```

**Acceptance Criteria:**
- ✅ All scenarios complete within time budget
- ✅ API call count within budget
- ✅ No errors or exceptions
- ✅ Results match expected output

---

## Success Metrics

### Completion Criteria

- [ ] **Phase 1**: All 49 agents audited (100%)
- [ ] **Phase 2**: Top 10 priority agents updated with bulk guidance
- [ ] **Phase 3**: 20 scripts refactored for parallelism/batching
- [ ] **Phase 4**: All tests passing (100% pass rate)
- [ ] **Documentation**: All agents have bulk operations section
- [ ] **Performance**: Average improvement >50% for updated components
- [ ] **Regression**: Zero test failures

### Key Performance Indicators (KPIs)

| Metric | Baseline | Target | Actual |
|--------|----------|--------|--------|
| Avg execution time (top 10 agents) | 5-10s | < 2s | _____ |
| Avg API calls (per 100 records) | 100 | < 10 | _____ |
| Records/sec rate | 5-10 | > 100 | _____ |
| Test pass rate | 100% | 100% | _____ |
| Agent update completion | 0% | 100% | _____ |

### Timeline Tracking

| Phase | Estimated Duration | Actual Duration | Status |
|-------|-------------------|-----------------|--------|
| Phase 1: Detection | 2-3 hours | _____ | ⬜ |
| Phase 2: Top 10 Agents | 5-10 days | _____ | ⬜ |
| Phase 3: Scripts | 1 week | _____ | ⬜ |
| Phase 4: Testing | 1-2 days | _____ | ⬜ |
| **Total** | **2-3 weeks** | _____ | ⬜ |

---

## ROI Analysis

### Time Savings Calculation

**Per-Agent Savings:**
- Baseline execution: 10 seconds
- Optimized execution: 1 second
- Time saved: 9 seconds per operation
- Operations per week: 100 (per agent)
- Weekly savings: 900 seconds (15 minutes)
- Annual savings: 780 minutes (13 hours) per agent

**System-Wide Savings:**
- 49 agents × 13 hours/year = **637 hours/year**
- @ $150/hour = **$95,550/year** time savings

### API Cost Savings

**Per-Agent API Reduction:**
- Baseline: 100 API calls per operation
- Optimized: 10 API calls per operation
- Reduction: 90 API calls (90% reduction)
- Operations per week: 100
- Weekly savings: 9,000 API calls
- Annual savings: 468,000 API calls

**Cost Impact:**
- Reduced risk of hitting API limits
- Less infrastructure load
- Improved user experience

### Total Annual Value

| Category | Annual Savings |
|----------|----------------|
| Time savings (user productivity) | $95,550 |
| API cost reduction | $10,000 (estimated) |
| Infrastructure efficiency | $5,000 (estimated) |
| **Total Annual Value** | **$110,550** |

**Payback Period:**
- Implementation cost: 2-3 weeks × $150/hour × 40 hours/week = $12,000-18,000
- Annual value: $110,550
- **Payback period: 1.6-2.0 months**

**5-Year ROI:**
- Total value: $552,750
- Implementation cost: $15,000 (one-time)
- **Net benefit: $537,750** (35.8x ROI)

---

## Templates

### Agent Audit Report Template

```markdown
# Agent Audit: {AGENT_NAME}

**Date**: YYYY-MM-DD
**Auditor**: {NAME}
**Priority**: P0 / P1 / P2 / P3

## Red Flags Detected
- [ ] Sequential processing mentioned
- [ ] No bulk tools in tool list
- [ ] Task.launch() in loops
- [ ] No self-check prompts
- [ ] No bulk operation examples
- [ ] {other red flags}

**Red Flag Score**: _____ / 8

## Current Performance
- Execution time: _____ seconds
- API calls (100 records): _____
- Records/sec rate: _____

## Recommended Changes
1. Add bulk operations section
2. Expose bulk tools in tool list
3. Add self-check prompts
4. Include few-shot examples
5. {other recommendations}

## Expected Improvement
- Execution time: _____ → _____ seconds (_____ % improvement)
- API calls: _____ → _____ (_____ % reduction)
- Records/sec rate: _____ → _____ (_____ x faster)

## Next Steps
- [ ] Update agent prompt
- [ ] Update tool list
- [ ] Add examples
- [ ] Test with 100-record scenario
- [ ] Update changelog
- [ ] Mark as complete
```

### Script Refactoring Report Template

```markdown
# Script Refactoring: {SCRIPT_NAME}

**Date**: YYYY-MM-DD
**Developer**: {NAME}

## Changes Made
- [ ] Replaced sequential loops with Promise.all()
- [ ] Added batching for >200 items
- [ ] Updated error handling
- [ ] Added performance benchmarks
- [ ] Updated tests
- [ ] Updated JSDoc

## Performance Impact

### Before
- Duration (100 items): _____ ms
- Rate: _____ items/sec
- API calls: _____

### After
- Duration (100 items): _____ ms
- Rate: _____ items/sec
- API calls: _____

### Improvement
- Speed: _____ x faster
- API reduction: _____ %
- Rate increase: _____ x

## Test Results
- [ ] Unit tests: _____ / _____ passing
- [ ] Performance tests: _____ / _____ passing
- [ ] Integration tests: _____ / _____ passing
- [ ] Overall: ✅ PASS / ❌ FAIL

## Regression Check
- [ ] No existing functionality broken
- [ ] All agents using this script still work
- [ ] No test failures introduced

## Approval
- [ ] Code reviewed
- [ ] Tests passing
- [ ] Documented in changelog
- [ ] Ready to merge
```

---

## Appendix: Quick Commands

```bash
# Automated detection
cd .claude-plugins/salesforce-plugin
grep -rn "for.*await" agents/ scripts/lib/ > audit-results.txt

# Profile specific agent
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-profiler.js --agent sfdc-data-operations --profile

# Run full test suite
node test/golden-test-suite.js

# Benchmark script
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/SCRIPT_NAME.js benchmark

# Generate audit report
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/generate-audit-report.js --output AUDIT_REPORT.md
```

---

## Cross-References

- **Bulk Operations Guide**: [BULK_OPERATIONS_BEST_PRACTICES.md](./BULK_OPERATIONS_BEST_PRACTICES.md)
- **Performance Patterns**: [PERFORMANCE_OPTIMIZATION_PLAYBOOK.md](./PERFORMANCE_OPTIMIZATION_PLAYBOOK.md)
- **Optimization Checklist**: [OPTIMIZATION_CHECKLIST.md](./OPTIMIZATION_CHECKLIST.md)
- **Existing Tools**: `bulk-api-handler.js`, `batch-query-executor.js`, `async-bulk-ops.js`, `parallel-conflict-detector.js`

---

**Version**: 1.0.0
**Last Updated**: 2025-10-19
**Maintained By**: Salesforce Plugin Team
**Status**: Ready for Phase 1 execution
