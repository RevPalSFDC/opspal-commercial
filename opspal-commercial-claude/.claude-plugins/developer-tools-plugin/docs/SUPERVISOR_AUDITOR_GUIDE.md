# Supervisor-Auditor System - User Guide

## Overview

The **Supervisor-Auditor** is an intelligent orchestration system that maximizes parallelization, enforces sub-agent usage, and audits execution compliance for complex multi-agent workflows.

**Status**: ✅ Production Ready (v1.0.0)
**Location**: `.claude-plugins/developer-tools-plugin/`

## What It Does

The Supervisor-Auditor system:

1. **Decomposes** complex tasks into atomic, parallelizable units
2. **Matches** the best agents from a 156-agent INVENTORY based on capabilities
3. **Plans** execution with parallel groups and sequential barriers
4. **Executes** units in parallel using Promise.all() with timeouts and fallbacks
5. **Audits** execution compliance, calculating utilization scores and detecting gaps
6. **Recommends** improvements for parallelization and agent selection

## When to Use

The Supervisor-Auditor **automatically** triggers via auto-agent-router when:

- **Complexity ≥ 0.7** (e.g., "Deploy metadata to production")
- **Multiple actions** (e.g., "Analyze AND generate reports")
- **Explicit parallelization** (e.g., "Process all 8 plugins in parallel")
- **Multiple targets** (e.g., "Generate READMEs for plugin-a, plugin-b, plugin-c")
- **"All X" pattern** (e.g., "Analyze all 10 reflections")

**Manual Usage**:
```bash
# Plan a complex task
node .claude-plugins/developer-tools-plugin/scripts/supervisor-cli.js plan "Generate READMEs for all 8 plugins"

# Full workflow (plan + execute + audit)
node .claude-plugins/developer-tools-plugin/scripts/supervisor-cli.js full "Analyze quality across all plugins"
```

## How It Works

### 1. Task Decomposition

The Supervisor breaks tasks into units:

**Input**: "Generate READMEs for salesforce-plugin, hubspot-plugin, gtm-planning-plugin"

**Output**:
```
Unit 1: Generate salesforce-plugin
Unit 2: Generate hubspot-plugin
Unit 3: Generate gtm-planning-plugin
```

**Independence Check**:
- ✓ U1, U2, U3 can run in PARALLEL (no shared side effects, independent inputs)

### 2. Agent Matching

For each unit, the Supervisor finds the best agent from INVENTORY:

**Scoring** (0-1.0):
- **Capability match** (70% weight): Strengths align with task
- **Latency** (20% weight): Fast execution preferred
- **Success rate** (10% weight): Historical reliability

**Example**:
```
Unit 1 → plugin-documenter (85% match)
  Why: Strong capability match, fast execution
  Alternatives: readme-generator (72%), general-purpose (50%)
```

### 3. Execution Plan

The Supervisor creates parallel groups:

```json
{
  "parallel_groups": [
    {
      "group_id": "G1",
      "runs_in_parallel": true,
      "units": [
        {"unit_id": "U1", "agent_or_tool": "plugin-documenter"},
        {"unit_id": "U2", "agent_or_tool": "plugin-documenter"},
        {"unit_id": "U3", "agent_or_tool": "plugin-documenter"}
      ]
    }
  ]
}
```

**Sequential Barriers** (if dependencies exist):
```json
{
  "sequential_barriers": [
    {
      "after_groups": ["G1"],
      "reason": "G2 requires output from G1"
    }
  ]
}
```

### 4. Parallel Execution

Units within a group execute concurrently:

```javascript
// Execute G1 units in parallel
await Promise.all([
  executeUnit(U1),
  executeUnit(U2),
  executeUnit(U3)
]);
```

**Features**:
- **Timeout**: 60s default per unit
- **Fallbacks**: Auto-retry with alternative agents
- **Circuit Breaker**: Stop after 3 consecutive failures

### 5. Audit Report

After execution, the Supervisor generates an audit report:

**Utilization Scores**:
- **Sub-agent Utilization**: 100% (3/3 units via agents, target: ≥70%)
- **Parallelization Ratio**: 100% (3/3 units in parallel, target: ≥60%)

**Plan vs Actual**:
```
✓ U1: plugin-documenter (340ms, as planned)
✓ U2: plugin-documenter (298ms, as planned)
✓ U3: plugin-documenter (315ms, as planned)
```

**Gaps Detected**:
- None (execution met quality targets)

**Recommendations**:
- Continue current approach

## CLI Commands

### Plan a Task
```bash
node supervisor-cli.js plan "Generate READMEs for all 8 plugins"
```

**Output**:
- Task decomposition (units)
- Agent matching (best agents for each unit)
- Execution plan (parallel groups)
- Risk checks

**Options**:
```bash
--output plan.json   # Save plan to file
```

### Execute a Plan
```bash
node supervisor-cli.js execute plan.json
```

**Output**:
- Execution results (success/failure per unit)
- Duration per unit
- Agent used (primary or fallback)

**Options**:
```bash
--output results.json   # Save results to file
```

### Generate Audit Report
```bash
node supervisor-cli.js audit plan.json results.json
```

**Output**:
- Plan vs actual comparison
- Utilization scores
- Gap analysis
- Recommendations

**Options**:
```bash
--output audit.json   # Save report to file
```

### Full Workflow
```bash
node supervisor-cli.js full "Analyze quality and generate reports" --output-dir /tmp/supervisor
```

**Output**:
- Plan → execute → audit in one command
- Saves all artifacts (plan.json, results.json, audit.json)

### Test Suite
```bash
node supervisor-cli.js test
```

**Tests**:
- Parallel units (comma-separated targets)
- Sequential actions (analyze THEN deploy)
- High complexity (production deployments)

## Understanding Audit Reports

### Utilization Scores

**Sub-agent Utilization** = (units via agents / total units) × 100%
- **Target**: ≥70%
- **Purpose**: Ensure work is delegated to specialized agents (not direct execution)

**Parallelization Ratio** = (units in parallel / total units) × 100%
- **Target**: ≥60%
- **Purpose**: Maximize parallel execution for faster results

### Gap Types

**1. Missed Parallelization**
- **Description**: Units ran sequentially despite being independent
- **Impact**: Slower execution than necessary
- **Fix**: Improve task decomposition, check for false dependencies

**2. Low Parallelization**
- **Description**: Parallelization ratio < 60%
- **Impact**: Performance opportunity missed
- **Fix**: Break large units into smaller parallelizable chunks

**3. Agent Mismatch**
- **Description**: Fallback agents used instead of primary
- **Impact**: Potential capability mismatch or slower execution
- **Fix**: Improve INVENTORY accuracy, check primary agent reliability

**4. High Failure Rate**
- **Description**: Multiple units failed to execute
- **Impact**: Incomplete results, data inconsistency
- **Fix**: Investigate root causes, improve error handling

### Recommendation Priorities

- **Critical**: Immediate action required (high failure rate, circuit breaker)
- **High**: Significant improvement opportunity (low parallelization)
- **Medium**: Performance optimization (slow execution, agent mismatches)
- **Low**: Fine-tuning (agent selection, minor inefficiencies)
- **Info**: No issues detected

## Integration with Auto-Agent-Router

The Supervisor integrates seamlessly with auto-agent-router.js:

**Automatic Trigger**:
```bash
# This automatically uses Supervisor if complexity ≥ 0.7
node auto-agent-router.js route "Generate READMEs for all 8 plugins"
```

**Output**:
```
🧠 SUPERVISOR-AUDITOR PLAN

Operation: Generate READMEs for all 8 plugins
Complexity Score: 60%
Task Units: 8

Decomposition:
  1. generate salesforce-plugin... 🔄 PARALLEL
  2. generate hubspot-plugin... 🔄 PARALLEL
  ...

Execution Plan:
  Parallel Groups: 1
    🔄 G1: 8 units
       - U1: plugin-documenter
       - U2: plugin-documenter
       ...

📋 PLAN READY FOR EXECUTION
```

## Programmatic Usage

```javascript
const SupervisorAuditor = require('./lib/supervisor-auditor');
const SupervisorExecutor = require('./lib/supervisor-executor');
const AuditReporter = require('./lib/audit-reporter');

// Create plan
const supervisor = new SupervisorAuditor();
const plan = supervisor.plan({
  task: 'Generate READMEs for all 8 plugins',
  complexity: 0.6
});

// Execute plan
const executor = new SupervisorExecutor({
  timeout: 60000,
  retries: 1
});

const agentInvoker = (agent, inputs) => {
  // Call Task tool here
  return Task({ subagent_type: agent, prompt: ... });
};

const results = await executor.execute(plan, agentInvoker);

// Generate audit
const reporter = new AuditReporter();
const audit = reporter.generateReport(plan, results);

console.log(reporter.formatReport(audit));
```

## Troubleshooting

### Issue: Low Parallelization Ratio

**Symptom**: Parallelization ratio < 60%, but units seem independent

**Causes**:
1. **False dependencies** detected between units
2. **Shared side effects** incorrectly assumed
3. **Conservative decomposition** (too few units)

**Fix**:
```bash
# Check independence analysis
node supervisor-cli.js plan "your task" | grep "can_run_in_parallel"

# Review dependency logic in supervisor-auditor.js:_checkDependency()
```

### Issue: Agent Mismatches (Fallbacks Used)

**Symptom**: Audit shows "Agent Mismatch" gap, fallbacks frequently used

**Causes**:
1. **Low agent success rate** (primary agent unreliable)
2. **Inaccurate INVENTORY** (strengths don't match reality)
3. **Timeout too short** (agents need more time)

**Fix**:
```bash
# Refresh INVENTORY to get latest success rates
node .claude-plugins/developer-tools-plugin/scripts/lib/inventory-cache.js refresh

# Check agent profiler data
node .claude-plugins/salesforce-plugin/scripts/lib/agent-profiler.js <agent-name>
```

### Issue: Circuit Breaker Triggered

**Symptom**: Execution stops after 3 consecutive failures

**Causes**:
1. **Systemic issue** (database down, API unreachable)
2. **Invalid inputs** across multiple units
3. **Misconfigured agents**

**Fix**:
```bash
# Review error messages in execution results
node supervisor-cli.js execute plan.json

# Check circuit breaker status
# (will show consecutive failures count)
```

### Issue: Low Sub-Agent Utilization

**Symptom**: Sub-agent utilization < 70%

**Causes**:
1. **Direct execution** instead of agent delegation
2. **Tool-only operations** (no agents available)

**Fix**:
- By design, Supervisor always uses agents (100% utilization)
- If <100%, check INVENTORY for missing agents

## Best Practices

1. **Start with "plan" command** to review before execution
2. **Use "full" command** for complete workflows with audit
3. **Save artifacts** (--output-dir) for post-mortem analysis
4. **Monitor utilization scores** - aim for ≥70% sub-agent, ≥60% parallel
5. **Review recommendations** in audit reports for continuous improvement
6. **Refresh INVENTORY** weekly to capture latest agent performance

## Performance Benchmarks

**Target Metrics**:
- **Plan Generation**: < 1 second
- **INVENTORY Build**: < 5 seconds
- **Parallel Execution**: N units in ~max(unit_duration) (not sum)

**Example**:
- Sequential: 3 units × 300ms = 900ms total
- Parallel: 3 units in parallel = ~300ms total (3x faster)

## Future Enhancements

**Planned Features**:
- **Adaptive complexity scoring** (machine learning from execution history)
- **Dynamic timeout adjustment** (per-agent historical data)
- **Intelligent fallback ordering** (based on success correlation)
- **Multi-level parallelization** (nested parallel groups)
- **Real-time execution monitoring** (progress bars, live updates)

## Support

**Issues**: Report at https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues

**Documentation**: See SUPERVISOR_DEVELOPER_GUIDE.md for internals

---

**Last Updated**: 2025-10-19
**Version**: 1.0.0
**Status**: Production Ready
