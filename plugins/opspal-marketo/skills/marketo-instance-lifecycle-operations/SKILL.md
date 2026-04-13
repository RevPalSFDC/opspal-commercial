---
name: marketo-instance-lifecycle-operations
description: Operate Marketo instance lifecycle hooks for session context, auth continuity, and instance quirk detection.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# marketo-instance-lifecycle-operations

## When to Use This Skill

- Initializing session context at the start of a Marketo agent session (auth token, instance URL, workspace defaults)
- Handling token refresh when a 601/602 error is returned mid-session
- Detecting and recording instance-specific quirks (non-standard field names, custom sync behaviors, workspace naming conventions) that affect downstream operations
- Implementing a hook that must confirm auth continuity before allowing write operations to proceed
- Troubleshooting repeated authentication failures or silent token expiry mid-workflow

**Not for**: campaign activation, lead manipulation, or business logic — this skill governs the session layer only.

## Session State Lifecycle

| Phase | Hook Trigger | Key Actions |
|-------|-------------|-------------|
| Session start | PreToolUse (first Marketo call) | Validate token, load instance context from `portals/config.json` |
| Token expiry | API error 601/602 | Auto-refresh token, retry original call, log refresh event |
| Quirk detection | PostToolUse (describe/list calls) | Compare response shape to known patterns, record deviations to `INSTANCE_QUIRKS.json` |
| Session end | Stop hook | Flush state, write updated context, clear in-memory secrets |

## Workflow

1. **Bootstrap session**: on first Marketo MCP call, load stored instance config from `portals/{instance}/INSTANCE_CONTEXT.json`; verify token validity with a low-cost `mcp__marketo__lead_describe` call.
2. **Detect auth state**: if response returns error 601 or 602, trigger token refresh before surfacing any error to the caller.
3. **Capture workspace defaults**: record the active workspace name and any non-default settings that affect campaign or lead behavior (e.g., custom dedup fields, partition assignments).
4. **Record instance quirks**: when a response shape differs from the canonical Marketo REST contract, log the deviation with the API path, expected shape, and actual shape to `INSTANCE_QUIRKS.json`.
5. **Maintain auth continuity**: validate that the token remains valid before each write operation in long-running sessions; proactively refresh if token age exceeds 55 minutes.
6. **Flush session state**: on session end, write any updated context back to disk and clear any in-memory credentials.

## Routing Boundaries

Use this skill for session bootstrap, auth continuity, and instance quirk capture.
Defer to `atomic-json-state-manager` for the safe write mechanics of context files.
Defer to `marketo-change-safety-guardrails` when auth continuity issues affect a pending write operation.

## References

- [Session Bootstrap](./session-bootstrap.md)
- [Auth Lifecycle Controls](./auth-lifecycle.md)
- [Instance Quirk Capture](./quirk-capture.md)
