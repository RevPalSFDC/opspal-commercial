---
name: task-graph
description: Decompose complex request into a Task Graph (DAG) with explicit dependencies, parallel execution, and verification gates
argument-hint: "[task description]"
visibility: user-invocable
tags:
  - orchestration
  - planning
  - dag
  - decomposition
---

# /task-graph Command

Triggers Task Graph orchestration mode for complex, multi-step requests. The orchestrator will decompose your request into a directed acyclic graph (DAG) of tasks with explicit dependencies, enabling safe parallel execution and deterministic verification.

## When to Use

Use `/task-graph` when your request involves:

- **Multiple domains** (e.g., Apex + Flow, Salesforce + HubSpot)
- **Multiple files/artifacts** (5+ files affected)
- **High-risk operations** (production, permissions, deletes)
- **Unclear scope** (needs discovery before implementation)
- **Long execution** (multi-step, phased rollout)

## Usage

```bash
# Basic usage - describe the complex task
/task-graph Update lead routing to add fallback owner and modify associated trigger

# With complexity hint
/task-graph [COMPLEX] Migrate all custom objects from old naming convention

# Force sequential even for simple tasks
/task-graph [SEQUENTIAL] Add a new field to Account
```

## What Happens

When you invoke `/task-graph`, the orchestrator will:

1. **Assess Complexity** - Score your request using the formal rubric:
   - Multi-domain (2 points): Crosses technology boundaries
   - Multi-artifact (2 points): Affects 5+ files
   - High-risk (2 points): Production/permissions/deletes
   - High-ambiguity (1 point): Needs discovery
   - Long-horizon (1 point): Multi-step execution

2. **Select Playbook** - Choose appropriate decomposition template:
   - `salesforce/flow-work.yaml` - Flow modifications
   - `salesforce/apex-work.yaml` - Apex development
   - `salesforce/metadata-deployment.yaml` - Deployments
   - `salesforce/production-change.yaml` - Production changes
   - `hubspot/workflow-work.yaml` - Workflow automation
   - `hubspot/data-operations.yaml` - Bulk data ops
   - `data/migration.yaml` - Data migrations

3. **Build Task Graph** - Create explicit TaskSpec for each work unit:
   ```yaml
   - id: T-01
     title: Discovery
     domain: salesforce-flow
     dependencies: []
     risk_level: low
   - id: T-02
     title: Implementation
     dependencies: [T-01]
     risk_level: medium
   ```

4. **Present Plan** - Show execution plan with:
   - Task breakdown and dependencies
   - Parallelization waves
   - Stop points for approval
   - Estimated timing

5. **Execute** - Run tasks with:
   - Parallel execution where safe
   - Verification gates per domain
   - Progress tracking
   - Rollback capability

## Output

The command produces:

```markdown
## Task Graph Summary

**Request:** [Your request summary]
**Complexity Score:** 5/10 (multi_domain, multi_artifact)
**Tasks:** 6 tasks across 2 domains

### Execution Plan

| Wave | Tasks | Parallel |
|------|-------|----------|
| 1 | T-01: Discovery, T-02: Requirements | Yes |
| 2 | T-03: Implementation | No |
| 3 | T-04: Testing, T-05: Validation | No |
| 4 | T-06: Review | No |

### Mermaid Diagram
[Visual DAG representation]

Proceed? [Yes/No/Modify]
```

## Control Flags

| Flag | Effect |
|------|--------|
| `[SEQUENTIAL]` | Force Task Graph regardless of complexity |
| `[PLAN_CAREFULLY]` | Extra validation and approval gates |
| `[COMPLEX]` | Hint higher complexity than detected |
| `[SIMPLE]` | Hint lower complexity than detected |

## Examples

### Example 1: Multi-Domain Change
```bash
/task-graph Update the opportunity stage picklist and modify the associated
flow that updates probability, then ensure tests cover the changes
```

Result: 6-task graph spanning salesforce-metadata, salesforce-flow, and salesforce-apex domains.

### Example 2: Production Deployment
```bash
/task-graph [PLAN_CAREFULLY] Deploy the new CPQ pricing rules to production
with full validation and rollback plan
```

Result: 9-task graph with critical risk level, backup tasks, and approval gates.

### Example 3: Data Migration
```bash
/task-graph Migrate contact data from legacy CSV to HubSpot with
deduplication and property mapping
```

Result: 8-task graph spanning data-transform and hubspot-data domains.

## Configuration

Environment variables to customize behavior:

```bash
# Complexity threshold for automatic Task Graph (default: 4)
export TASK_GRAPH_THRESHOLD=4

# Block execution if threshold met (default: 0)
export TASK_GRAPH_BLOCKING=0

# Show detailed complexity breakdown (default: 0)
export TASK_GRAPH_VERBOSE=1
```

## Files

- **Agent**: `agents/task-graph-orchestrator.md`
- **Schemas**: `schemas/task-spec.schema.json`, `schemas/result-bundle.schema.json`
- **Config**: `config/complexity-rubric.json`, `config/tool-policies.json`
- **Playbooks**: `playbooks/**/*.yaml`
- **Engine**: `scripts/lib/task-graph/`

## See Also

- `/complexity` - Check complexity score without full orchestration
- `/agents` - List available specialist agents
- `/route` - Get routing recommendation for a task
