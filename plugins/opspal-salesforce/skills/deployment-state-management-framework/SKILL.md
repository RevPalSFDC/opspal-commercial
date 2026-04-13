---
name: deployment-state-management-framework
description: Stateful Salesforce deployment control for retrieve-compare-validate-deploy-verify loops with idempotent re-runs and rollback checkpoints. Use when deployments span multiple cycles or require strict state verification.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Deployment State Management Framework

## When to Use This Skill

Use this skill when:
- A deployment spans multiple cycles and needs checkpoint/resume capability
- You need to verify post-deploy state matches expected outcomes
- Rollback criteria must be defined before deployment begins
- Concurrent deployment conflicts need detection and resolution
- Idempotent re-deployment is required (same deploy converges to same state)

**Not for**: Metadata validation rules (use `deployment-validation-framework`), quality gate enforcement (use `salesforce-deployment-quality-gates-framework`), or one-shot simple deployments.

## Deployment State Machine

```
Retrieve → Compare → Validate → Deploy → Verify → Complete
    ↑                              ↓         ↓
    └──────── Rollback ←───── Checkpoint ────┘
```

## Workflow

### Step 1: Retrieve Current Org State

```bash
# Retrieve specific components to establish baseline
sf project retrieve start --metadata "Flow:My_Flow" --target-org <org> --output-dir ./baseline/

# Or retrieve by manifest
sf project retrieve start --manifest package.xml --target-org <org> --output-dir ./baseline/
```

### Step 2: Compare Local vs Org State

```bash
# Preview what would change without deploying
sf project deploy start --source-dir force-app --target-org <org> --dry-run --json

# Compare metadata with a diff tool
diff -rq ./baseline/force-app ./force-app
```

### Step 3: Deploy with Checkpoint

```bash
# Start tracked deployment (returns job ID for status polling)
sf project deploy start --source-dir force-app --target-org <org> --async --json
# Returns: {"result":{"id":"0Af..."}}

# Check deployment status
sf project deploy report --job-id <deployId> --target-org <org>

# Deployment states: Queued → InProgress → Succeeded | Failed | Canceled
```

Record the deploy job ID, timestamp, and component list as the checkpoint.

### Step 4: Verify Post-Deploy State

```bash
# Verify deployed components exist and are active
sf data query --query "SELECT DeveloperName, ActiveVersion.VersionNumber FROM FlowDefinition WHERE DeveloperName IN ('Flow_A','Flow_B')" --target-org <org> --use-tooling-api

# Verify custom fields deployed
sf data query --query "SELECT QualifiedApiName, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '<Object>'" --target-org <org> --use-tooling-api
```

### Step 5: Rollback Decision

| Verification Result | Action |
|---------------------|--------|
| All components verified active and correct | Clear checkpoint, mark complete |
| Partial failure (some components missing) | Re-deploy failed subset from checkpoint |
| Critical failure (wrong versions active) | Full rollback from baseline snapshot |
| Deployment lock conflict | Wait and retry, or cancel competing deploy |

```bash
# Cancel an in-progress deployment
sf project deploy cancel --job-id <deployId> --target-org <org>
```

## Idempotency Rules

- Re-running the same deployment must converge to the same target state
- Use `--ignore-conflicts` only when you have verified the checkpoint baseline
- Never deploy without a retrievable baseline — the baseline IS the rollback

## Routing Boundaries

Use this skill for stateful orchestration and idempotency.
Use `deployment-validation-framework` for metadata validation specifics without broader state lifecycle concerns.

## References

- [lifecycle checkpoints](./lifecycle-checkpoints.md)
- [state verification](./state-verification.md)
- [idempotency and rollback](./idempotency-rollback.md)
