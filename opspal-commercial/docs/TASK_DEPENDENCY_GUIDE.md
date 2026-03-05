# Task Dependency System Guide

## Overview

Claude Code v2.1.16 introduced a new task management system with dependency tracking. This guide covers how to leverage these tools in orchestrator agents for improved workflow visibility and error handling.

## Available Tools

| Tool | Purpose |
|------|---------|
| `TaskCreate` | Create a new task with optional dependencies |
| `TaskUpdate` | Update task status, add dependencies, mark complete |
| `TaskList` | View all tasks with their status and dependencies |
| `TaskGet` | Get full details of a specific task |

## When to Use Task Dependencies

### Use Dependencies For:
- Multi-phase workflows where phases must execute sequentially
- Parallel operations that converge on a common checkpoint
- Saga patterns with compensating transactions
- Complex orchestrations with approval gates
- Operations that require explicit rollback tracking

### Skip Dependencies For:
- Simple single-step operations
- Fully independent parallel tasks
- Quick lookups or validations

## Task Lifecycle

```
pending → in_progress → completed
                ↓
            (or deleted if no longer needed)
```

### Status Transitions
1. **pending**: Task created, waiting to start (may be blocked)
2. **in_progress**: Actively being worked on
3. **completed**: Successfully finished
4. **deleted**: Removed (use for cleanup)

## Core Patterns

### Pattern 1: Sequential Dependencies

Use when tasks must execute in order.

```javascript
// Phase 1: Data Validation
const dataValidation = TaskCreate({
  subject: "DATA-001: Validate data quality",
  description: "Ensure ≥95% completeness, ≤5% duplicates",
  activeForm: "Validating data quality"
});

// Phase 2: Attribution (blocked until validation complete)
const attribution = TaskCreate({
  subject: "ATTR-001: Define attribution policy",
  description: "Configure attribution rules",
  activeForm: "Configuring attribution"
});

// Set dependency
TaskUpdate({
  taskId: attribution.id,
  addBlockedBy: [dataValidation.id]
});
```

### Pattern 2: Parallel with Convergence

Use when multiple independent tasks must all complete before proceeding.

```javascript
// Create parallel tasks
const deployFlows = TaskCreate({
  subject: "Deploy Flows (batch 1)",
  activeForm: "Deploying flows"
});

const deployLayouts = TaskCreate({
  subject: "Deploy Layouts (batch 1)",
  activeForm: "Deploying layouts"
});

const deployRules = TaskCreate({
  subject: "Deploy Validation Rules (batch 1)",
  activeForm: "Deploying validation rules"
});

// Verification waits for ALL deployments
const verify = TaskCreate({
  subject: "Verify all deployments",
  activeForm: "Verifying deployments"
});

TaskUpdate({
  taskId: verify.id,
  addBlockedBy: [deployFlows.id, deployLayouts.id, deployRules.id]
});
```

### Pattern 3: Saga with Compensating Transactions

Use for transactional workflows that need rollback capability.

```javascript
// Main transaction steps
const step1 = TaskCreate({
  subject: "Update reflections to under_review",
  activeForm: "Updating reflection status",
  metadata: { type: "saga-step", order: 1 }
});

const step2 = TaskCreate({
  subject: "Create processing log entry",
  activeForm: "Creating log entry",
  metadata: { type: "saga-step", order: 2 }
});

TaskUpdate({ taskId: step2.id, addBlockedBy: [step1.id] });

// Compensating transaction (only runs on failure)
const compensate = TaskCreate({
  subject: "Rollback: Revert status to 'new'",
  activeForm: "Rolling back changes",
  metadata: { type: "compensating-action", compensatesFor: step1.id }
});
```

### Pattern 4: Approval Gates

Use for workflows requiring human approval between phases.

```javascript
// Work phase
const analysisWork = TaskCreate({
  subject: "SCEN-001: Run quota scenarios",
  activeForm: "Running scenarios"
});

// Approval checkpoint
const approval = TaskCreate({
  subject: "SCEN-001-APPROVAL: Review scenario results",
  description: "Requires user approval before proceeding",
  activeForm: "Awaiting approval",
  metadata: { requiresApproval: true }
});

TaskUpdate({ taskId: approval.id, addBlockedBy: [analysisWork.id] });

// Next phase (blocked until approval)
const nextPhase = TaskCreate({
  subject: "TERR-001: Design territories",
  activeForm: "Designing territories"
});

TaskUpdate({ taskId: nextPhase.id, addBlockedBy: [approval.id] });
```

## Converting Existing Patterns

### From Saga Pattern

**Before (saga-utils.js pattern):**
```javascript
const saga = new Saga({ name: `Process Cohort ${cohort.id}` });
saga.addStep(
  async () => { /* forward action */ },
  async (result) => { /* compensating action */ },
  'description'
);
await saga.execute();
```

**After (task dependencies):**
```javascript
const step1 = TaskCreate({
  subject: `Process Cohort ${cohort.id}: Step 1`,
  activeForm: "Processing step 1"
});
TaskUpdate({ taskId: step1.id, status: "in_progress" });

try {
  await executeForwardAction();
  TaskUpdate({ taskId: step1.id, status: "completed" });
} catch (error) {
  // Create and execute compensation task
  const compensate = TaskCreate({
    subject: `Rollback Cohort ${cohort.id}: Step 1`,
    activeForm: "Executing rollback"
  });
  await executeCompensatingAction();
  TaskUpdate({ taskId: compensate.id, status: "completed" });
  throw error;
}
```

### From Linear Workflow

**Before:**
```javascript
// Implicit sequential execution
await phase1();
await phase2();
await phase3();
```

**After:**
```javascript
const phase1Task = TaskCreate({ subject: "Phase 1", activeForm: "Running phase 1" });
const phase2Task = TaskCreate({ subject: "Phase 2", activeForm: "Running phase 2" });
const phase3Task = TaskCreate({ subject: "Phase 3", activeForm: "Running phase 3" });

// Explicit dependencies
TaskUpdate({ taskId: phase2Task.id, addBlockedBy: [phase1Task.id] });
TaskUpdate({ taskId: phase3Task.id, addBlockedBy: [phase2Task.id] });

// Execute with visibility
TaskUpdate({ taskId: phase1Task.id, status: "in_progress" });
await phase1();
TaskUpdate({ taskId: phase1Task.id, status: "completed" });

// phase2Task automatically unblocked when phase1Task completes
```

## Best Practices

### 1. Always Set activeForm
The `activeForm` field shows in the spinner while the task is in_progress:
```javascript
TaskCreate({
  subject: "Deploy metadata package",      // Imperative: what to do
  activeForm: "Deploying metadata package" // Present continuous: what's happening
});
```

### 2. Use Metadata for Context
Store additional context that may be needed later:
```javascript
TaskCreate({
  subject: "Process cohort #42",
  metadata: {
    cohortId: 42,
    recordCount: 150,
    estimatedDuration: "5 minutes"
  }
});
```

### 3. Check Dependencies Before Starting
Use TaskGet to verify a task isn't blocked:
```javascript
const task = TaskGet({ taskId: myTaskId });
if (task.blockedBy.length > 0) {
  console.log(`Waiting for: ${task.blockedBy.join(', ')}`);
  return;
}
TaskUpdate({ taskId: myTaskId, status: "in_progress" });
```

### 4. Clean Up on Completion
Mark tasks completed or delete stale ones:
```javascript
// On success
TaskUpdate({ taskId: myTaskId, status: "completed" });

// On cancellation/cleanup
TaskUpdate({ taskId: myTaskId, status: "deleted" });
```

### 5. Use TaskList for Progress Monitoring
Check overall workflow status:
```javascript
const tasks = TaskList();
const blocked = tasks.filter(t => t.blockedBy.length > 0);
const inProgress = tasks.filter(t => t.status === "in_progress");
const completed = tasks.filter(t => t.status === "completed");

console.log(`Progress: ${completed.length}/${tasks.length} tasks complete`);
console.log(`Blocked: ${blocked.length} tasks waiting on dependencies`);
```

## Agent Integration

### Adding Task Tools to Agent Frontmatter

```yaml
---
name: my-orchestrator
description: Orchestrates complex multi-step workflows
tools:
  - Read
  - Write
  - Bash
  - Task
  - TaskCreate      # Add these
  - TaskUpdate      # for dependency
  - TaskList        # tracking
  - TaskGet
---
```

### Example: GTM Planning Orchestrator Usage

```markdown
## Workflow Execution

When executing the 7-phase GTM planning workflow:

1. Create tasks for each phase with dependencies:
   - DATA-001 (no dependencies - starts immediately)
   - ATTR-001 (blocked by DATA-001)
   - SCEN-001 (blocked by ATTR-001)
   - TERR-001 (blocked by DATA-001, can parallel with ATTR/SCEN)
   - GTM-001 (blocked by SCEN-001, TERR-001)
   - COMP-001 (blocked by GTM-001)
   - KPI-001 (blocked by COMP-001)

2. At each approval gate:
   - Mark current task completed
   - Dependent tasks automatically unblock
   - User can see progress via TaskList
```

## Troubleshooting

### Task Stuck in "pending"
Check if it has unresolved dependencies:
```javascript
const task = TaskGet({ taskId: stuckTaskId });
console.log("Blocked by:", task.blockedBy);
// Resolve blocking tasks first
```

### Circular Dependencies
Avoid creating A → B → A cycles. The system will detect these:
```javascript
// DON'T do this:
TaskUpdate({ taskId: taskA, addBlockedBy: [taskB] });
TaskUpdate({ taskId: taskB, addBlockedBy: [taskA] }); // Error!
```

### Task Not Visible
Tasks are scoped to the current session. They won't persist across restarts.

## Environment

Enable the task system (if not already default):
```bash
export CLAUDE_CODE_ENABLE_TASKS=true
```

---

## Related Documentation

- [Claude Code Release Notes](https://code.claude.com/docs/en/release-notes)
- [Agent Development Guide](../AGENTS.md)
- [Workflow Patterns](./WORKFLOW_PATTERNS.md)

---

**Version**: 1.0.0
**Last Updated**: 2026-01-26
**Applies To**: Claude Code v2.1.16+
