# Asana Auto‑Update Plan (Confirmation‑First)

Status: Draft (documentation only)

Owner: Principal Engineer Agent System

Last updated: 2025-09-09

## Purpose

Enable agents and scripts to safely update Asana when explicitly told or implicitly inferred, while always asking for human confirmation first. The design reuses repo‑native Node utilities and ClaudeSFDC’s Asana manager; it does not depend on OpsPal.

## Scope

- Repo‑native implementation only (Node + YAML).
- Uses `ClaudeSFDC/utils/asana-enhanced-manager.js` for all Asana I/O.
- Adds a small decision layer and a bridge script (to be implemented later) behind confirmations.

Out of scope:

- OpsPal directory and MCP servers.
- Automatic, non‑interactive updates without explicit approval.

## Goals

- Make it easy for agents to propose Asana updates, but only apply after confirmation.
- Resolve the correct Asana project and task for a given instance/environment.
- Avoid duplicates via idempotency markers.
- Provide safe defaults and a clear rollback path.

## High‑Level Architecture

1) Decision Layer (intent detector)

- A pure function that determines whether an Asana update is appropriate and recommends an action.
- Inputs: task text/flags/links, event class (release/migration/etc.), complexity summary.
- Output: decision contract with `should_update`, `reason`, `action`, `target`, `metadata`.

2) Action Layer (bridge)

- A small Node script that accepts a single JSON event on stdin, calls the decision layer, prompts for confirmation, and then performs the chosen action via `AsanaEnhancedManager` (create/update/comment/complete).

3) Policy Config (optional)

- JSON mapping for instance→project GID, default actions per event, naming conventions, strictness.

4) Hook points (emit events)

- `scripts/publish-release.sh` after Slack notification.
- `scripts/hubspot/apply-migration.js` after migration success/rollback.
- Agent execution boundary (post‑plan/execute) using complexity signals.

## Confirmation‑First Workflow

1) Detect intent

- Explicit commands: mentions of “asana”, “update task”, “mark complete”, “assign”, “due date”, Asana URL/GID, flags `[ASANA]` / `asana.update=true`.
- Linked context: `links.asanaTask.gid` present or text contains Asana URL.
- Operation class: `release_published`, `migration_applied|migration_rolled_back`, `incident`, `pr_merged`.
- Compliance/risk: complexity analyzer indicates production impact or rollback needed.

2) Ask for confirmation

- Interactive agents: “Ready to update Asana?”
- Scripts/CI: require `--confirm-asana` or `APPROVAL_TOKEN` env var. Otherwise, log and exit (no changes).

3) Resolve instance context

- Determine `instance` and `env` from task payload or env vars (`SALESFORCE_INSTANCE`, `SALESFORCE_ENVIRONMENT`).

4) Project resolution (confirm)

- If policy maps instance→project, show and confirm.
- Else search workspace projects (name contains instance/env markers) and present top 3–5 recommendations; confirm selection or create new project (with proposed name template, e.g., `[PROD] <Instance> – <Area>`).

5) Task resolution (confirm)

- Search selected project for a matching open task (dedupe). If found, show a brief diff and confirm update.
- If none, propose creation with title/fields and confirm.

6) Apply change

- Perform action via `AsanaEnhancedManager`.
- Include idempotency key (e.g., version or migration path hash) in a comment to avoid duplicates.

7) Report result

- Print structured JSON: decision, confirmation answers, action taken, links.

## Decision Contract

Input shape (event → decision engine):

```json
{
  "event": { "type": "release_published", "id": "v2.2.0" },
  "task": {
    "title": "Release v2.2.0 – ClaudeSFDC",
    "description": "Release complete",
    "flags": { "ASANA": true },
    "links": { "asanaTask": { "gid": "123456789" } },
    "asana": { "project_gid": "1122334455", "assignee": "user@example.com", "due_on": "2025-09-10" },
    "env": "production"
  },
  "complexity": { "productionImpact": true, "rollbackNeeded": false },
  "owner": { "email": "owner@example.com" },
  "runId": "rel_v2.2.0"
}
```

Output shape (from decision engine):

```json
{
  "should_update": true,
  "reason": "operation_class",
  "action": "comment",
  "target": { "task_gid": null, "project_gid": "1122334455" },
  "metadata": {
    "assignee": "user@example.com",
    "due_on": "2025-09-10",
    "tags": [],
    "env": "production",
    "operation_id": "rel_v2.2.0"
  }
}
```

## Policy Configuration

File: `shared-infrastructure/configs/asana-policy.json` (proposed)

```json
{
  "strict": true,
  "events": {
    "release_published": { "default_action": "comment" },
    "migration_applied": { "default_action": "status_change" },
    "migration_rolled_back": { "default_action": "comment" },
    "incident": { "default_action": "create" }
  },
  "instances": {
    "wedgewood-sb": { "project_gid": "<gid>", "tags": ["Salesforce", "Sandbox"] }
  },
  "naming": { "prefixes": { "production": "[PROD]", "sandbox": "[SB]" } }
}
```

## Hook Points

- `scripts/publish-release.sh`: after Slack notification, emit an event to the bridge. Require `--confirm-asana` or `APPROVAL_TOKEN`.
- `scripts/hubspot/apply-migration.js`: after `up()`/rollback, emit an event including migration file path and active environment.
- Agents (principal/management): after plan/execute, build the `task` object (including complexity summary from `shared-infrastructure/complexity-assessment/complexity-analyzer.js`), then prompt for confirmation before invoking the bridge.

## Environment Variables

- `ASANA_ACCESS_TOKEN`
- `ASANA_WORKSPACE_GID`
- `ASANA_DEFAULT_PROJECT_GID`
- `SALESFORCE_INSTANCE` (e.g., `wedgewood`)
- `SALESFORCE_ENVIRONMENT` (`sandbox` | `production`)
- `ASANA_DRY_RUN=true` (recommended during rollout)
- `APPROVAL_TOKEN` (required for non‑interactive confirmations)

## Safety & Idempotency

- Dry run by default in early phases (`ASANA_DRY_RUN=true`).
- Idempotency: include `operation_id` in comments to make retries no‑ops.
- Hard stops when project is ambiguous or missing without explicit human “Create New” confirmation.

## Testing Strategy

Unit (Jest) for decision layer:

- Explicit command → should update (reason: explicit_command).
- Linked task → should update (reason: linked_task).
- Release event → should update (reason: operation_class).
- Prod impact only → should update (reason: compliance).
- Negative case → should_update=false.

Integration (dry‑run):

- Bridge prints proposed action and target without API calls when `ASANA_DRY_RUN=true`.

E2E manual confirmation:

- Agent prompt asks for confirmation, recommends projects, and shows create/update choice.

Idempotency:

- Re‑emit same event; the bridge should detect `operation_id` and avoid duplicate comments.

## Rollout Plan

Phase 1 — Dry run + human confirmation (default):

- Wire hooks in release/migration paths; require confirmation every time; `ASANA_DRY_RUN=true`.

Phase 2 — Opt‑in auto‑comment for releases:

- If policy has a mapped project and `strict=false`, allow auto‑comment for `release_published` only; still require confirmation for create/close.

Phase 3 — Broader automation (optional):

- Trusted CI paths with `APPROVAL_TOKEN` and policy gates; still respect idempotency and project resolution rules.

## Operational Runbook (once implemented)

Quick start (dry‑run):

1. Set env vars in `.env`:
   - `ASANA_ACCESS_TOKEN`, `ASANA_WORKSPACE_GID`, `ASANA_DEFAULT_PROJECT_GID`, `ASANA_DRY_RUN=true`.
2. Trigger a release: `./scripts/publish-release.sh --project=ClaudeSFDC --version=vTEST --skip-github --skip-slack`.
3. Observe: a confirmation prompt and a printed decision; no API calls made.
4. Re‑run with `--confirm-asana` or set `APPROVAL_TOKEN` to apply changes.

## References (existing code used)

- Asana I/O: `ClaudeSFDC/utils/asana-enhanced-manager.js`
- Complexity: `shared-infrastructure/complexity-assessment/complexity-analyzer.js`
- Release hook: `scripts/publish-release.sh`
- Migration hook: `scripts/hubspot/apply-migration.js`

## Future Enhancements

- Project search heuristics based on custom fields/tags.
- Section/board placement rules per environment.
- Telemetry into `control-center` dashboards for visibility.

