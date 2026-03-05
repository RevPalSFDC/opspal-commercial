# Bulk Operations for Orchestration - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on "bulk", "batch", "parallel", "large dataset" keywords)
**Priority**: High
**Trigger**: When orchestrating multiple sub-agents or operations

---

## 🎯 Overview

**CRITICAL**: Orchestration operations often involve coordinating 6-10 sub-agents, validating 30+ dependencies, and merging 15+ results. LLMs default to sequential processing ("delegate to agent A, wait, then delegate to agent B"), which results in 70-90s orchestration times. This guide provides bulk operations patterns to achieve 18-25s orchestration (3-4x faster).

---

## 🌳 Decision Tree: When to Parallelize Orchestration

```
START: Orchestration task requested
│
├─ Multiple sub-agents needed? (>2 agents)
│  ├─ YES → Are delegations independent?
│  │  ├─ YES → Use Pattern 1: Parallel Agent Delegation ✅
│  │  └─ NO → Delegate with dependency ordering
│  └─ NO → Single agent delegation (sequential OK)
│
├─ Multiple dependency checks? (>10 dependencies)
│  ├─ YES → Same dependency types?
│  │  ├─ YES → Use Pattern 2: Batched Dependency Validation ✅
│  │  └─ NO → Multiple validation types needed
│  └─ NO → Simple dependency check OK
│
├─ Orchestration metadata needed?
│  ├─ YES → First time loading?
│  │  ├─ YES → Query and cache → Use Pattern 3: Cache-First Orchestration State ✅
│  │  └─ NO → Load from cache (100x faster)
│  └─ NO → Skip metadata loading
│
└─ Multiple result merges? (>3 results)
   ├─ YES → Are merges independent?
   │  ├─ YES → Use Pattern 4: Parallel Result Aggregation ✅
   │  └─ NO → Sequential merge required
   └─ NO → Single result merge OK
```

**Key Principle**: If delegating to 8 agents sequentially at 9000ms/agent = 72 seconds. If delegating to 8 agents in parallel = 12 seconds (6x faster!).

---

## 📋 4 Mandatory Patterns

### Pattern 1: Parallel Agent Delegation

**❌ WRONG: Sequential agent delegation**
```javascript
// Sequential: Delegate to one agent at a time
const results = [];
for (const task of tasks) {
  const result = await Task({
    subagent_type: task.agentType,
    description: task.description,
    prompt: task.prompt
  });
  results.push(result);
}
// 8 agents × 9000ms = 72,000ms (72 seconds) ⏱️
```

**✅ RIGHT: Parallel agent delegation**
```javascript
// Parallel: Delegate to all agents simultaneously
const results = await Promise.all(
  tasks.map(task =>
    Task({
      subagent_type: task.agentType,
      description: task.description,
      prompt: task.prompt
    })
  )
);
// 8 agents in parallel = ~12,000ms (max agent time) - 6x faster! ⚡
```

**Improvement**: 6x faster (72s → 12s)
**When to Use**: Delegating to >2 agents
**Tool**: `Promise.all()` with Task delegation

---

### Pattern 2: Batched Dependency Validation

**❌ WRONG: Validate dependencies one at a time**
```javascript
// N+1 pattern: Check each dependency individually
const validDeps = [];
for (const dep of dependencies) {
  const exists = await query(`SELECT Id FROM ${dep.objectType} WHERE Id = '${dep.recordId}'`);
  validDeps.push({ dep, valid: exists.length > 0 });
}
// 30 dependencies × 700ms = 21,000ms (21 seconds) ⏱️
```

**✅ RIGHT: Single batched validation query**
```javascript
// Batch: Validate all dependencies at once
const depsByType = groupBy(dependencies, 'objectType');
const validations = await Promise.all(
  Object.entries(depsByType).map(async ([objType, deps]) => {
    const ids = deps.map(d => d.recordId);
    const existing = await query(`
      SELECT Id FROM ${objType} WHERE Id IN ('${ids.join("','")}')
    `);
    const existingSet = new Set(existing.map(r => r.Id));
    return deps.map(dep => ({ dep, valid: existingSet.has(dep.recordId) }));
  })
);
const validDeps = validations.flat();
// 3 object types in parallel = ~1500ms - 14x faster! ⚡
```

**Improvement**: 14x faster (21s → 1.5s)
**When to Use**: Validating >10 dependencies
**Tool**: SOQL IN clause + `Promise.all()`

---

### Pattern 3: Cache-First Orchestration State

**❌ WRONG: Query orchestration state on every coordination**
```javascript
// Repeated queries for same orchestration metadata
const orchestrations = [];
for (const workflow of workflows) {
  const state = await query(`SELECT Id, Status FROM OrchestrationType WHERE Name = '${workflow.name}'`);
  const orchestration = await coordinateWorkflow(workflow, state);
  orchestrations.push(orchestration);
}
// 10 workflows × 2 queries × 1000ms = 20,000ms (20 seconds) ⏱️
```

**✅ RIGHT: Cache orchestration state with TTL**
```javascript
// Cache orchestration state for 30-minute TTL
const { MetadataCache } = require('../../scripts/lib/field-metadata-cache');
const cache = new MetadataCache(orgAlias, { ttl: 1800 });
const orchestrationState = await cache.get('orchestration_state', async () => {
  return await query(`SELECT Id, Name, Status, Config FROM OrchestrationType`);
});
const orchestrations = await Promise.all(
  workflows.map(async (workflow) => {
    const state = orchestrationState.find(s => s.Name === workflow.name);
    return coordinateWorkflow(workflow, state);
  })
);
// First coordination: 2500ms (cache), Next 9: ~700ms each (from cache) = 8800ms - 2.3x faster! ⚡
```

**Improvement**: 2.3x faster (20s → 8.8s)
**When to Use**: Coordinating >3 workflows
**Tool**: `field-metadata-cache.js`

---

### Pattern 4: Parallel Result Aggregation

**❌ WRONG: Sequential result aggregation**
```javascript
// Sequential: Aggregate one result at a time
const aggregated = {};
for (const result of results) {
  const summary = await aggregateResult(result);
  Object.assign(aggregated, summary);
}
// 12 results × 2000ms = 24,000ms (24 seconds) ⏱️
```

**✅ RIGHT: Parallel result aggregation**
```javascript
// Parallel: Aggregate all results simultaneously
const summaries = await Promise.all(
  results.map(async (result) => {
    const [metrics, errors, recommendations] = await Promise.all([
      extractMetrics(result),
      analyzeErrors(result),
      generateRecommendations(result)
    ]);
    return { result, metrics, errors, recommendations };
  })
);
const aggregated = summaries.reduce((acc, summary) => ({
  ...acc,
  [summary.result.id]: summary
}), {});
// 12 results in parallel = ~3000ms (max aggregation time) - 8x faster! ⚡
```

**Improvement**: 8x faster (24s → 3s)
**When to Use**: Aggregating >3 results
**Tool**: `Promise.all()` with nested parallel operations

---

## 📊 Performance Targets

| Operation | Sequential (Baseline) | Parallel/Batched | Improvement | Pattern Reference |
|-----------|----------------------|------------------|-------------|---------------------|
| **Delegate to 8 agents** | 72,000ms (72s) | 12,000ms (12s) | 6x faster | Pattern 1 |
| **Dependency validation** (30 deps) | 21,000ms (21s) | 1,500ms (1.5s) | 14x faster | Pattern 2 |
| **Orchestration state queries** (10 workflows) | 20,000ms (20s) | 8,800ms (8.8s) | 2.3x faster | Pattern 3 |
| **Result aggregation** (12 results) | 24,000ms (24s) | 3,000ms (3s) | 8x faster | Pattern 4 |
| **Full orchestration** (10 workflows) | 137,000ms (~137s) | 25,300ms (~25s) | **5.4x faster** | All patterns |

**Expected Overall**: Full orchestration: 70-90s → 18-25s (3-4x faster)

---

## 🔗 Cross-References

**Playbook Documentation**:
- See `ORCHESTRATION_BEST_PRACTICES.md` for coordination patterns
- See `BULK_OPERATIONS_BEST_PRACTICES.md` for batch size tuning

**Related Scripts**:
- `scripts/lib/orchestration-coordinator.js` - Parallel delegation framework
- `scripts/lib/field-metadata-cache.js` - TTL-based caching

---

**When This Context is Loaded**: When user message contains keywords: "bulk", "batch", "parallel", "large dataset", "thousands", "coordinate multiple", "6+ agents"

**Back to Core Agent**: See `sfdc-orchestrator.md` for orchestration overview and when to use bulk patterns
