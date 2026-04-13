---
name: salesforce-hook-governance-framework
description: Salesforce hook governance framework for risk scoring, approval gating, tiered tool restrictions, and audit-trail enforcement across agent operations. Use when defining or troubleshooting policy enforcement hooks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Hook Governance Framework

## When to Use This Skill

Use this skill when:
- Defining which hooks can block tool execution vs only advise
- Implementing risk-tiered tool restrictions (e.g., block `sf data delete` in production)
- Building approval gating for high-risk operations (destructive changes, production deploys)
- Setting up audit trail logging for governance decisions
- Troubleshooting hooks that incorrectly block or allow operations

**Not for**: Org-level Salesforce security (use `security-governance-framework`), hook reliability patterns (use `salesforce-hook-reliability-circuit-breaker-framework`), or general hook development (use `hook-inline-node-execution-hardening-framework`).

## Governance Tiers

| Tier | Risk Level | Hook Behavior | Examples |
|------|-----------|---------------|----------|
| **T0 - Observe** | None | Log only, never block | Read queries, metadata inspection |
| **T1 - Advise** | Low | Log + surface advisory banner | Sandbox deploys, non-destructive updates |
| **T2 - Warn** | Medium | Log + require acknowledgment | Production deploys, bulk updates >100 records |
| **T3 - Gate** | High | Block until explicit approval | `sf data delete`, production permission changes |

## Advisory vs Blocking Pattern

```bash
# ADVISORY hook (exit 0 always, surface message via stderr or JSON)
echo '{"decision":"allow","reason":"Advisory: this targets production"}' 
exit 0

# BLOCKING hook (exit 1 with explanation to deny the tool call)
echo '{"decision":"deny","reason":"Blocked: delete operations require --confirm flag"}'
exit 1

# IMPORTANT: Routing hooks must ALWAYS be advisory (exit 0)
# Only safety hooks may block (exit 1)
```

## Audit Trail Format

```jsonl
{"ts":"2026-04-12T14:30:00Z","hook":"pre-tool-execution","tool":"Bash","command":"sf data delete","decision":"deny","tier":"T3","org":"acme-prod","reason":"Production delete requires approval"}
```

## Workflow

1. Classify each tool call by risk tier using the tool name and arguments
2. Apply the corresponding governance behavior (observe/advise/warn/gate)
3. Log all decisions to `~/.claude/logs/audit-log.jsonl`
4. For T3 operations, require explicit user confirmation before allowing

## Routing Boundaries

Use this skill for hook-level policy enforcement.
Use `security-governance-framework` for org security model design.

## References

- [risk and approval gating](./risk-approval-gating.md)
- [tier restriction enforcement](./tier-restriction-enforcement.md)
- [audit trail operations](./audit-trail-operations.md)
