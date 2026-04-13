---
name: policy-context-normalizer
description: Normalize policy-enforcement context inputs into stable schemas before routing and rule evaluation.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# policy-context-normalizer

## When to Use This Skill

- A policy enforcement hook receives context from multiple upstream sources (session token, plugin.json, env vars) and the schema is inconsistent between sources
- A routing or boundary hook is making decisions based on inferred context (guessing plugin name from path) rather than an explicit, validated context object
- A hook fails silently when expected context fields are absent instead of degrading gracefully
- You are building a new policy hook and need to define the canonical input context schema it will consume
- Context fields from `env-normalize.sh` and those extracted from JWT claims need to be merged into a single stable object before rule evaluation

**Not for**: normalizing tool input payloads (use `hook-payload-canonicalizer`) or trimming oversized context (use `hook-context-pruning-patterns`).

## Canonical Policy Context Schema

```json
{
  "session_id": "sess_abc123",
  "plugin": "opspal-salesforce",
  "agent": "sfdc-revops-auditor",
  "org_alias": "acme-prod",
  "tier": "enterprise",
  "event_type": "PreToolUse",
  "tool_name": "Bash",
  "source": "session_token | env | inferred"
}
```

## Workflow

1. **Enumerate context sources**: identify every source that contributes fields to the policy context — `CLAUDE_SESSION_ID`, `ORG_SLUG`, JWT claims, `plugin.json` metadata, and env vars from `env-normalize.sh`.
2. **Define the canonical schema**: using `./context-schema.md` as the reference, list required vs optional fields and their expected types.
3. **Write a normalization function**: create a shell or Node.js function that merges all sources into a single JSON object, preferring explicit sources (session token) over inferred ones (path-derived plugin name).
4. **Add inference guards**: for each field that could be inferred rather than explicit, emit a `"source": "inferred"` flag and log a warning — never silently trust inferred values for high-stakes policy decisions; see `./inference-guards.md`.
5. **Implement fail-mode policy**: if required fields (`session_id`, `event_type`, `tool_name`) are missing after normalization, emit a degraded decision rather than crashing; reference `./fail-mode-policy.md` for the canonical degraded envelope.
6. **Test pass, fail, and degraded modes**: (a) full context → correct policy decision; (b) missing required field → degraded with warning; (c) conflicting sources → explicit source wins, conflict logged.

## References

- [Context Schema](./context-schema.md)
- [Inference Guards](./inference-guards.md)
- [Fail-Mode Policy](./fail-mode-policy.md)
