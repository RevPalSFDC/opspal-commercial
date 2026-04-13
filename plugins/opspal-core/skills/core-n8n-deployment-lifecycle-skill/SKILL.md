---
name: core-n8n-deployment-lifecycle-skill
description: Manage n8n workflow promotion lifecycle with validation gates, environment diffing, and rollback readiness.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:n8n-lifecycle-manager
version: 1.0.0
---

# core-n8n-deployment-lifecycle-skill

## When to Use This Skill

- Promoting an n8n workflow from staging to production using `/n8n-lifecycle`
- Running a preflight diff to identify credential, webhook URL, or node version mismatches between environments
- Rolling back a failed n8n workflow deployment to the last known good version
- Auditing n8n workflow health and activation status across environments via `/n8n-status`
- Optimizing an n8n workflow for performance or reliability before production promotion (`/n8n-optimize`)

**Not for**: Building new n8n workflows from scratch — this skill governs promotion, validation, and rollback of existing workflows.

## Required Inputs

| Input | Description |
|-------|-------------|
| Workflow bundle | Exported n8n JSON or workflow ID |
| Source / target environment | e.g., `staging` → `production` |
| Dependency map | Credential names, webhook paths, external service URLs |

## Output Artifacts

- Promotion checklist with environment diff highlighted
- Validated credential-reference audit (no staging credentials in prod bundle)
- Rollback procedure with the prior version pinned by workflow ID and activation timestamp

## Workflow

1. Export the workflow bundle from the source environment (n8n export API or UI export).
2. Run preflight: diff credential references, webhook URLs, and node versions against the target environment using `/n8n-lifecycle preflight`.
3. Resolve all diffs: substitute production credential names, update webhook base URLs, pin any `@latest` node versions.
4. Promote the workflow: import into target environment, activate, and confirm activation status with `/n8n-status`.
5. Run a smoke test on the first execution (verify trigger fires, nodes complete, output matches expected schema).
6. If promotion fails: capture the error log, deactivate the imported workflow, and restore the prior version using the rollback procedure.

## Safety Checks

- Block promotion when any credential reference points to a staging-environment variable
- Validate all webhook URLs are reachable in the target environment before activation
- Require a pinned rollback version before any production promotion proceeds
