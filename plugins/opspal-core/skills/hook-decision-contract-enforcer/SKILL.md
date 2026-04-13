---
name: hook-decision-contract-enforcer
description: Standardize hook decision envelopes and exit-code semantics across policy enforcement paths.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hook-decision-contract-enforcer

## When to Use This Skill

- A hook script returns inconsistent JSON decision envelopes (missing `action`, `reason`, or `confidence` keys)
- Exit codes from hook scripts are not mapped to block/warn/allow semantics consistently
- A new policy hook is being authored and needs a standard output contract
- Hook decision output is being parsed by downstream routing or audit logic that requires a stable schema
- A hook exits 0 on error, causing silent policy bypasses

**Not for**: hooks that emit human-readable text only, or hooks whose output is not consumed by routing or audit agents.

## Decision Envelope Schema

```json
{
  "action": "block | warn | allow",
  "reason": "string (required, max 120 chars)",
  "confidence": 0.0,
  "tags": ["policy:boundary", "severity:high"],
  "exit_code": 0
}
```

| Exit Code | Semantic | Hook Behavior |
|-----------|----------|---------------|
| 0 | allow | Execution proceeds normally |
| 1 | warn | Advisory message emitted; execution continues |
| 2 | block | Execution halted; reason surfaced to user |
| 3 | degraded | Hook could not evaluate; fallback to allow with warning |

## Workflow

1. **Read the hook script and identify its output path**: find every `echo`, `printf`, or `jq` call that writes to stdout and determine if it produces valid JSON.
2. **Validate the existing envelope**: run `hook_output | jq 'has("action") and has("reason")'` — any `false` result is a contract gap.
3. **Add envelope normalization**: wrap the hook's decision logic in a function that always writes the canonical envelope to stdout, even on unexpected errors (emit `action: degraded`, exit 3).
4. **Map exit codes**: ensure the hook's `exit` calls match the semantic table above; replace raw `exit 1` with a named constant or comment.
5. **Add observability tags**: include at least one `policy:*` tag and one `severity:*` tag drawn from `./observability-tags.md`.
6. **Test all four exit paths**: write a test case for allow, warn, block, and degraded; assert that `jq .action` returns the expected value for each.

## References

- [Decision Envelope](./decision-envelope.md)
- [Exit-Code Mapping](./exit-code-mapping.md)
- [Observability Tags](./observability-tags.md)
