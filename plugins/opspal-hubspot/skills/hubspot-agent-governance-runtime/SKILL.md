---
name: hubspot-agent-governance-runtime
description: Implement runtime hook governance for HubSpot task safety, mandatory agent routing, and strict-mode behavior.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-agent-governance-runtime

## When to Use This Skill

- Implementing or auditing PreToolUse/PostToolUse hooks that gate destructive HubSpot API calls (bulk deletes, workflow deactivations, contact merges)
- Enforcing mandatory agent routing — ensuring the `hubspot-orchestrator` is invoked before high-blast-radius operations
- Configuring strict-mode behavior where unapproved tool patterns are blocked rather than warned
- Reviewing bypass policies and audit trails when a governance rule is intentionally overridden
- Adding new task safety gates as new HubSpot agents or commands are introduced

**Not for**: General workflow business logic, HubSpot API field mapping, or CMS content operations.

## Governance Decision Matrix

| Operation Type | Risk Level | Gate Required | Bypass Allowed |
|---|---|---|------|
| Bulk contact delete (>100) | Critical | PreToolUse block | Never |
| Workflow deactivation | High | PreToolUse warn + confirm | With audit log |
| Company merge | High | Agent routing check | With justification |
| Property update (single) | Low | PostToolUse log | Always |
| Report/dashboard read | None | None | N/A |

## Workflow

1. **Identify the trigger surface** — determine which hook event (PreToolUse, PostToolUse, Stop) owns the decision. Check `plugin.json` hook matchers against the tool name pattern.
2. **Classify the operation risk** — apply the matrix above. Critical and High operations require explicit gate logic in the hook script.
3. **Implement the gate** — in the hook shell script, parse `$CLAUDE_TOOL_INPUT` JSON, validate against required agent context (`agent_type` from hook JSON), and emit a structured block or warn decision to stdout.
4. **Validate strict-mode flag** — check `HUBSPOT_STRICT_MODE` env var; when set, demote all "warn" decisions to "block".
5. **Capture the audit trail** — append a JSON record `{ts, tool, decision, agent, reason}` to `logs/governance-audit.jsonl`.
6. **Verify rollback path** — confirm the hook exits cleanly on bypass and that the audit log captures the override identity.

## Routing Boundaries

Use this skill for hook enforcement and governance policy only.
Defer to `hubspot-governance-patterns` for org-wide policy design and to `hubspot-hook-input-contracts` for input parsing standards.

## References

- [Task Safety Gating](./task-gating.md)
- [Agent Validation Logic](./agent-validation.md)
- [Strict Mode and Bypass Policy](./strict-mode.md)
