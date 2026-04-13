---
name: flow-diagnostics-observability-framework
description: Salesforce Flow diagnostics and observability framework for test strategy, execution tracing, failure triage, production monitoring, and rollback signals. Use when flows fail or degrade in runtime.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Flow Diagnostics and Observability Framework

## When to Use This Skill

Use this skill when:
- A Flow is throwing runtime errors in production or sandbox
- Users report unexpected behavior from automated processes
- You need to identify which Flow version is causing failures
- Flow execution latency is degrading and needs investigation
- You need to set up monitoring for Flow health after deployment

**Not for**: Building new Flows (use `flow-xml-lifecycle-framework`), splitting complex Flows (use `flow-segmentation-guide`), or planned Flow deployments (use `deployment-validation-framework`).

## Quick Reference

| Diagnostic Query | Purpose |
|------------------|---------|
| `SELECT Id, InterviewLabel, CurrentElement, InterviewStatus FROM FlowInterview WHERE InterviewStatus = 'Error'` | Find failed Flow interviews |
| `SELECT DeveloperName, ActiveVersionId, LatestVersionId FROM FlowDefinition` | Check active vs latest version alignment (Tooling API) |
| `SELECT Id, FlowDefinitionViewId, Status, VersionNumber FROM FlowVersionView` | List all Flow versions and their status (Tooling API) |
| `SELECT Id, DeveloperName, ProcessType, TriggerType FROM FlowDefinitionView` | Inventory all Flows by type (Tooling API) |

**Important**: FlowDefinition, FlowDefinitionView, and FlowVersionView require `--use-tooling-api`.

## Failure Taxonomy

| Failure Class | Symptoms | Root Cause Pattern | Fix Path |
|---------------|----------|-------------------|----------|
| **Data/Validation** | "FIELD_CUSTOM_VALIDATION_EXCEPTION", null reference | Missing required field, bad data shape | Add null checks, fault paths |
| **Dependency/Reference** | "ENTITY_IS_DELETED", "INVALID_CROSS_REFERENCE_KEY" | Deleted record, stale ID reference | Fix hardcoded IDs, add lookup validation |
| **Governor Limit** | "Too many SOQL queries: 101", "Too many DML: 151" | SOQL/DML inside loops, unbounded collections | Bulkify with Get Records outside loop |
| **Permission** | "INSUFFICIENT_ACCESS_OR_READONLY" | Running user lacks FLS or object access | Check Flow run context (system vs user mode) |
| **Concurrency** | "UNABLE_TO_LOCK_ROW" | Parallel updates on same record | Add retry logic or serialize operations |

## Workflow

### Step 1: Identify the Failing Flow

```bash
# List all Flows with errors in the last 24 hours (debug logs)
sf apex log list --target-org <org> | head -20

# Query active Flow definitions to find the suspect
sf data query --query "SELECT DeveloperName, ActiveVersion.VersionNumber, ProcessType, TriggerType FROM FlowDefinition WHERE ActiveVersionId != null" --target-org <org> --use-tooling-api
```

### Step 2: Trace Execution Path

```bash
# Enable debug logging for the running user
sf apex log tail --target-org <org> --color

# Check Flow interview status (paused, waiting, error)
sf data query --query "SELECT Id, InterviewLabel, CurrentElement, InterviewStatus, CreatedDate FROM FlowInterview WHERE InterviewStatus = 'Error' ORDER BY CreatedDate DESC LIMIT 10" --target-org <org>
```

### Step 3: Isolate and Reproduce

- Identify the specific element (`CurrentElement` from FlowInterview) where failure occurs
- Check if the Flow runs in **System Mode** (runs as automation user) vs **User Mode** (respects FLS/sharing)
- Test with the same record data in a sandbox with debug logging enabled
- Verify fault paths exist for all Decision elements and Get Records operations

### Step 4: Monitor and Set Rollback Triggers

| Signal | Threshold | Action |
|--------|-----------|--------|
| Error rate | >5% of executions in 1 hour | Alert and investigate |
| Error rate | >20% of executions in 15 minutes | Deactivate Flow version |
| Latency P95 | >10s increase from baseline | Investigate bulkification |
| Volume anomaly | >3x normal execution count | Check trigger conditions |

```bash
# Emergency: deactivate a Flow via Tooling API
sf data query --query "SELECT Id, ActiveVersionId FROM FlowDefinition WHERE DeveloperName = '<FlowName>'" --target-org <org> --use-tooling-api --json
# Then PATCH FlowDefinition to set ActiveVersionId = null or to a known-good version
```

## Routing Boundaries

Use this skill for diagnostics/monitoring in runtime.
Use `flow-xml-lifecycle-framework` for standard authoring/deployment lifecycle.
Use `flow-segmentation-guide` for structural decomposition work.
Use `flow-production-incident-response-framework` for active incidents requiring immediate containment.

## References

- [testing diagnostics playbook](./testing-diagnostics-playbook.md)
- [monitoring signals](./monitoring-signals.md)
- [failure taxonomy and triage](./failure-taxonomy-triage.md)
- [rollback signal model](./rollback-signal-model.md)
