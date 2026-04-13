---
name: rollback-executor-safeguard
description: Generate safe rollback execution plans with verification gates and evidence capture.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:solution-deployment-orchestrator
version: 1.0.0
---

# rollback-executor-safeguard

## When to Use This Skill

- A Salesforce metadata deployment (Flow, Apex, permission set) has failed or caused a regression and needs to be reversed
- A plugin update or hook change has broken production behavior and must be rolled back to the prior version
- Running a rollback drill before a high-risk production deployment to validate that the rollback procedure works
- An n8n workflow promotion has caused downstream integration failures and the prior workflow version must be restored
- Validating that a rollback was fully complete: all changed components are back to last-known-good state

**Not for**: Planning the forward fix after rollback — use the relevant build or deployment skill for that once the system is stabilized.

## Required Inputs

| Input | Description |
|-------|-------------|
| Target release / change ID | Deployment ID, git commit hash, plugin version, or workflow ID |
| Last known good version | The specific prior version to restore (must be confirmed, not assumed) |
| Rollback scope | List of components, files, or records affected by the change |

## Output Artifacts

- Rollback runbook with ordered, step-by-step execution commands
- Verification checklist: pre-rollback state snapshot and post-rollback validation checks
- Post-rollback evidence bundle ready for the postmortem (see `postmortem-rca-writer`)

## Workflow

1. Capture the pre-rollback state snapshot: list current versions of all in-scope components and record them as baseline evidence.
2. Confirm the last-known-good version exists and is accessible (check deployment history, git log, or n8n version archive).
3. Assess blast radius: identify all downstream systems, integrations, and data that will be affected by the rollback.
4. Generate the rollback runbook: ordered steps with exact commands, expected outputs, and abort criteria for each step.
5. Execute the rollback step by step — pause after each step and verify the expected output before proceeding.
6. Run the verification checklist: confirm all rolled-back components match the target version and downstream integrations are functioning.
7. Package post-rollback evidence and hand off to the incident commander or postmortem owner.

## Safety Checks

- Require pre/post state snapshots — never rollback without capturing current state first
- Enforce blast-radius check before execution: confirm no in-flight transactions will be corrupted by the rollback
- Abort immediately on any unexpected output during rollback steps — do not continue through errors
