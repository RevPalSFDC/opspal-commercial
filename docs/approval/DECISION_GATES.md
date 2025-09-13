# Decision Gates

This document defines when agents must stop and request human approval.

## Triggers
- Subscription/permission blocker detected during preflight.
- Fundamental architecture changes (object model, auth model, associations).
- Destructive or non‑idempotent schema changes.
- Any unexpected 4xx/5xx from HubSpot when mutating state.

## Required Artifacts
- Preflight report output.
- Options brief (2–3 paths with pros/cons & pre‑reqs).
- ACR (see ACR_TEMPLATE.md) for architectural shifts.
- Rollback strategy outline.

## Process
1. Abort execution (non‑zero exit) and emit a “BLOCKED” report.
2. Open/attach ACR with options.
3. Await explicit approval before proceeding with `--apply`.

