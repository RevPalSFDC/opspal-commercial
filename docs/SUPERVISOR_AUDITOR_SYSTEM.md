# Supervisor-Auditor System

**Status**: ✅ Production Ready (v1.0.0)
**Last Updated**: 2025-10-19
**Implementation Date**: 2025-10-19

## Overview

The **Supervisor-Auditor** is an intelligent orchestration system that maximizes parallelization, enforces sub-agent usage, and audits execution compliance for complex multi-agent workflows.

**Purpose**: Eliminate sequential bias, maximize parallel execution, and ensure high sub-agent utilization for complex tasks.

## What It Does

1. **Decomposes** complex tasks into atomic, parallelizable units
2. **Matches** best agents from 156-agent INVENTORY based on capabilities + performance
3. **Plans** execution with parallel groups (fan-out) and sequential barriers (dependencies)
4. **Executes** units in parallel using Promise.all() with timeouts, fallbacks, circuit breakers
5. **Audits** execution compliance, calculating utilization scores and detecting gaps
6. **Recommends** improvements for parallelization and agent selection

## Automatic Triggers

The Supervisor **automatically** activates via auto-agent-router when:

- **Complexity ≥ 0.7** (e.g., "Deploy metadata to production")
- **Multiple actions** (e.g., "Analyze AND generate reports")
- **Explicit parallelization** (e.g., "Process all 8 plugins in parallel")
- **Multiple targets** (e.g., "Generate READMEs for plugin-a, plugin-b, plugin-c")
- **"All X" pattern** (e.g., "Analyze all 10 reflections")

## Key Metrics

### Utilization Targets (enforced via audit)

- **Sub-agent Utilization**: ≥70% (units delegated to agents vs direct execution)
- **Parallelization Ratio**: ≥60% (units in parallel vs sequential)

### Performance Benchmarks

- Plan Generation: < 1 second
- INVENTORY Build: < 5 seconds (cached for 1 hour)
- Parallel Execution: N units in ~max(unit_duration) [not sum]

**Example**:
- **Sequential**: 8 plugins × 300ms = 2400ms total
- **Parallel**: 8 plugins in parallel = ~300ms total (**8x faster**)

## Architecture

### Core Components

1. **inventory-builder.js**: Auto-generates agent INVENTORY from 156 agents across 8 plugins
2. **inventory-cache.js**: TTL-based cache (1 hour) for fast lookups
3. **supervisor-auditor.js**: Task decomposition, agent matching, plan generation
4. **supervisor-executor.js**: Parallel execution with Promise.all(), circuit breakers
5. **audit-reporter.js**: Plan vs actual analysis, gap detection, recommendations

### Integration Points

- **auto-agent-router.js**: Delegates to Supervisor when complexity/pattern triggers
- **CLI**: `supervisor-cli.js` for standalone usage

## Usage Examples

### Via Auto-Router (Automatic)

```bash
node auto-agent-router.js route "Generate READMEs for all 8 plugins"

# Output:
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
    🔄 G1: 8 units (runs in parallel)
       - U1: plugin-documenter
       - U2: plugin-documenter
       ...

Utilization Targets:
  Sub-agent Utilization: ≥70%
  Parallelization Ratio: ≥60%

📋 PLAN READY FOR EXECUTION
```

### Via CLI (Manual)

```bash
# Plan only
node supervisor-cli.js plan "Analyze quality across all plugins"

# Full workflow (plan + execute + audit)
node supervisor-cli.js full "Generate READMEs for all 8 plugins" --output-dir /tmp/supervisor

# Test suite
node supervisor-cli.js test
```

### Programmatic Usage

```javascript
const SupervisorAuditor = require('./lib/supervisor-auditor');
const SupervisorExecutor = require('./lib/supervisor-executor');

const supervisor = new SupervisorAuditor();
const plan = supervisor.plan({
  task: 'Generate READMEs for all 8 plugins',
  complexity: 0.6
});

const executor = new SupervisorExecutor();
const results = await executor.execute(plan, agentInvoker);

// Results:
// - 8 units executed in parallel
// - Total duration: ~300ms (vs 2400ms sequential)
// - 100% parallelization ratio
```

## Audit Reports

After execution, the Supervisor generates compliance reports:

### Report Metrics

- **Plan vs Actual**: Which agents ran, duration, success/failure
- **Utilization Scores**: Sub-agent usage %, parallelization ratio %
- **Gap Analysis**: Missed parallelization, agent mismatches, failures
- **Recommendations**: Prioritized actions (critical, high, medium, low)

### Example Audit Report

```
AUDIT REPORT
═══════════════════════════════════════════════════

Duration: 315ms
Success: ✓

Plan vs Actual:
  ✓ U1: plugin-documenter (340ms)
  ✓ U2: plugin-documenter (298ms)
  ✓ U3: plugin-documenter (315ms)

Utilization Scores:
  Sub-agent Utilization: 100.0% (target: ≥70%) ✓
  Parallelization Ratio: 100.0% (target: ≥60%) ✓

Gaps Detected:
  [INFO] No significant gaps detected
    Impact: Execution met quality targets
    Recommendation: Continue current approach

Next Actions:
  - proceed
  - log_success
  - update_metrics
```

## Core Heuristics (Built-in)

### Parallelization Gate

Units are parallel IFF:
1. Independent inputs (no shared variables)
2. Independent side effects (different files/orgs)
3. Deterministic merge (outputs can be combined)

### Sub-Agent Enforcement

- Force sub-agent usage if capability match ≥ 70%
- Require non_use_justification if skipping recommended agent

### Tool Preference

- If 2+ tools overlap, pick: `min(latency × failure_rate)`

### Sequential Depth Cap

- If depth > 3 without dependencies → demand re-decomposition

### Fallback Strategy

- Primary agent → Fallback 1 → Fallback 2 → Retry with backoff
- Circuit breaker: stop after 3 consecutive failures

## Documentation

### User Guide

**Location**: `.claude-plugins/developer-tools-plugin/docs/SUPERVISOR_AUDITOR_GUIDE.md`

**Topics**:
- When to use Supervisor
- How to read audit reports
- Troubleshooting low parallelization
- Understanding utilization scores
- Best practices

### Developer Guide

Coming in v1.1.0

## File Locations

```
.claude-plugins/developer-tools-plugin/
├── scripts/
│   ├── supervisor-cli.js                    # CLI interface
│   └── lib/
│       ├── inventory-builder.js             # Agent INVENTORY auto-generation
│       ├── inventory-cache.js               # TTL-based cache
│       ├── supervisor-auditor.js            # Core engine (decomposition, matching, planning)
│       ├── supervisor-executor.js           # Parallel execution with Promise.all
│       └── audit-reporter.js                # Compliance auditing
└── docs/
    └── SUPERVISOR_AUDITOR_GUIDE.md          # User guide

.claude-plugins/opspal-salesforce/
└── scripts/
    └── auto-agent-router.js                 # Enhanced with Supervisor integration
```

## Success Criteria

- [x] INVENTORY auto-generated from 156 agents
- [x] Task decomposition identifies ≥2 independent units
- [x] Parallel execution via Promise.all()
- [x] Sub-agent utilization ≥ 70% enforced
- [x] Parallelization ratio ≥ 60% for independent units
- [x] Audit report shows plan vs actual
- [x] Integration with auto-agent-router
- [x] CLI interface (plan, execute, audit, full)
- [x] Comprehensive user documentation

## Roadmap

### v1.1.0 (Planned)

- Developer guide with architecture details
- Test suite with 80%+ coverage
- Adaptive complexity scoring (ML from execution history)
- Dynamic timeout adjustment (per-agent historical data)

### v1.2.0 (Planned)

- Real-time execution monitoring (progress bars)
- Multi-level parallelization (nested parallel groups)
- Intelligent fallback ordering (success correlation analysis)

## Version History

- **v1.0.0** (2025-10-19): Initial production release
  - Core parallelization engine
  - Agent INVENTORY system
  - Audit reporting
  - Auto-router integration
  - CLI interface
