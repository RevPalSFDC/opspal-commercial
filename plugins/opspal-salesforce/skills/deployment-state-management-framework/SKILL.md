---
name: deployment-state-management-framework
description: Stateful Salesforce deployment control for retrieve-compare-validate-deploy-verify loops with idempotent re-runs and rollback checkpoints. Use when deployments span multiple cycles or require strict state verification.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Deployment State Management Framework

Use this skill for multi-cycle deployment reliability.

## Workflow

1. Retrieve current org state.
2. Compare local vs org state.
3. Validate dependencies and preconditions.
4. Deploy with checkpoint.
5. Verify state and clear or execute rollback.

## Routing Boundaries

Use this skill for stateful orchestration and idempotency.
Use `deployment-validation-framework` for metadata validation specifics without broader state lifecycle concerns.

## References

- [lifecycle checkpoints](./lifecycle-checkpoints.md)
- [state verification](./state-verification.md)
- [idempotency and rollback](./idempotency-rollback.md)
