---
name: hubspot-hook-response-contracts
description: Normalize HubSpot pre-hook outputs with machine-readable decision envelopes and human diagnostics.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-hook-response-contracts

## When to Use This Skill

- Designing the JSON envelope that a PreToolUse hook emits to block or allow a HubSpot tool call
- Standardizing the human-readable diagnostic message that appears alongside a machine decision
- Reviewing hook output for correct stdout/stderr channel separation
- Ensuring a PostToolUse hook produces structured telemetry that downstream log aggregators can parse
- Debugging a hook where Claude Code is not honoring the block decision (often a malformed envelope)

**Not for**: Input parsing (use `hubspot-hook-input-contracts`), shell safety (use `hubspot-hook-shell-hardening`), or subprocess management.

## Decision Envelope Schema

All HubSpot PreToolUse hooks must emit a single JSON object to **stdout**:

```json
{
  "decision": "block" | "warn" | "allow",
  "reason": "<human-readable explanation>",
  "tool": "<tool_name>",
  "severity": "critical" | "high" | "medium" | "low",
  "remediation": "<actionable next step or null>"
}
```

Stderr is reserved for **diagnostic noise only** — stack traces, debug logs, verbose API responses. Claude Code reads stdout exclusively for the decision envelope.

## Stdout vs Stderr Channel Rules

| Content Type | Channel | Consumed By |
|---|---|---|
| Decision envelope JSON | stdout | Claude Code hook runtime |
| Human diagnostic message | stdout (inside `reason` field) | Claude Code display |
| Debug/verbose logs | stderr | Operator terminal only |
| Script error traces | stderr | Operator terminal only |
| Audit log writes | File (`logs/`) | Log aggregator |

## Workflow

1. **Determine the decision outcome** — after all validation and governance checks complete, resolve to `block`, `warn`, or `allow`.
2. **Construct the envelope** — populate all required fields. `reason` must be actionable (e.g., "Bulk delete of 312 contacts exceeds 100-record safety threshold. Use `hsdedup` with `--dry-run` first.").
3. **Write envelope to stdout only** — use `process.stdout.write(JSON.stringify(envelope) + '\n')` or `echo "$envelope" >&1`. Never mix diagnostic text with the envelope on stdout.
4. **Write diagnostics to stderr** — any verbose API responses, timing data, or debug flags go to `>&2`.
5. **Set exit code** — exit 0 for `allow` and `warn`; exit 1 for `block` (belt-and-suspenders with the JSON decision field).
6. **Verify with degraded-mode test** — confirm that if the hook script crashes mid-execution, the absence of a valid envelope causes Claude Code to default to `allow` (fail-open) and log the anomaly.

## Routing Boundaries

Use this skill for response envelope design and stdout/stderr channel discipline only.
Defer to `hubspot-hook-input-contracts` for input parsing and to `hubspot-agent-governance-runtime` for governance policy.

## References

- [Decision Schema](./decision-schema.md)
- [Stderr vs Stdout](./stderr-vs-stdout.md)
- [Rejection Guidance](./rejection-guidance.md)
