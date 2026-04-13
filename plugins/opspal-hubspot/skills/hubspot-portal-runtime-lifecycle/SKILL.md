---
name: hubspot-portal-runtime-lifecycle
description: Manage portal auth/switch lifecycle hooks and stale credential recovery for stable HubSpot runtime context.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-portal-runtime-lifecycle

## When to Use This Skill

- Managing the HubSpot portal authentication context at session start — ensuring the correct portal ID and access token are loaded before any API call is made
- Detecting stale credentials after a portal switch (e.g., an agent cached a token for portal A but the user switched to portal B mid-session)
- Recovering from a `401 Unauthorized` or `403 Forbidden` error caused by an expired or wrong-portal token without interrupting the user's workflow
- Implementing PostAuth hooks that validate the portal context after `hs auth` completes, catching known quirks (e.g., sandbox portals returning production portal IDs)
- Enforcing lifecycle guardrails — blocking API writes when the runtime portal ID does not match the portal ID declared in the current session config

**Not for**: API rate limit management (use the rate limit throttle), CMS publish lifecycle (use `hubspot-cms-release-operations`), or incident triage (use `hubspot-incident-triage-framework`).

## Portal Lifecycle State Machine

```
[Uninitialized] → [Authenticating] → [Active] → [Stale] → [Recovering]
                                         ↓                      ↓
                                    [Switching]           [Re-authenticated]
                                         ↓
                                   [Stale Check]
```

| State | Trigger | Recovery Action |
|---|---|---|
| Uninitialized | Session start, no env vars | Run `hs auth` or set `HUBSPOT_ACCESS_TOKEN` |
| Authenticating | `hs auth` in progress | Wait; detect postauth quirks on completion |
| Active | Token valid; portal ID confirmed | Normal operations |
| Stale | 401 response or >2h since last auth | Re-auth or token refresh |
| Switching | User targets a different portal ID | Flush cached portal context; re-validate |

## Workflow

1. **Session initialization hook** — on session start, check for `HUBSPOT_ACCESS_TOKEN` and `HUBSPOT_PORTAL_ID` environment variables. If either is absent, emit a structured warning and pause before the first HubSpot tool call.
2. **Postauth quirk detection** — after `hs auth` completes, call `GET /oauth/v1/access-tokens/{token}` to verify the returned `hub_id` matches the expected portal ID. Flag sandbox-to-production mismatches.
3. **Portal switch staleness check** — when `HUBSPOT_PORTAL_ID` changes mid-session, invalidate all cached property metadata, list caches, and workflow caches. Force a live-first refresh on the next API call.
4. **Stale credential recovery** — on a 401 response, attempt a token refresh if `HUBSPOT_REFRESH_TOKEN` is available. If refresh fails, surface a clear re-authentication prompt and pause all pending HubSpot tool calls.
5. **Lifecycle guardrail enforcement** — before any write operation, confirm the runtime portal ID (from the API response header `X-HubSpot-Account-Id`) matches `HUBSPOT_PORTAL_ID`. Mismatch → block with a `portal-mismatch` error code.
6. **Log lifecycle transitions** — write `{ts, event, fromPortalId, toPortalId, tokenAge, outcome}` to `logs/portal-lifecycle.jsonl` for audit purposes.

## Routing Boundaries

Use this skill for portal auth/switch lifecycle and stale credential recovery only.
Defer to `hubspot-agent-governance-runtime` for task safety gating and to `hubspot-hook-input-contracts` for hook input parsing standards.

## References

- [Postauth Quirk Detection](./postauth-quirks.md)
- [Portal Switch Staleness Handling](./switch-staleness.md)
- [Portal Lifecycle Guardrails](./lifecycle-guardrails.md)
