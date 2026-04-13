---
name: hook-context-pruning-patterns
description: Design deterministic context trimming for hooks to prevent oversized prompt injection and degraded routing quality.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hook-context-pruning-patterns

## When to Use This Skill

- A PreToolUse or PostToolUse hook is injecting more than ~4 KB of context into the prompt
- Routing quality degrades because the transcript payload overwhelms the routing signal
- A hook script is piping full tool output into Claude's stdin without truncation
- You are adding a new hook that may receive unbounded file content or API responses
- Context compaction is being triggered prematurely due to hook-injected bloat

**Not for**: business-logic trimming, user-facing output formatting, or summarization tasks unrelated to hook stdin.

## Thresholds Quick Reference

| Signal | Warn Threshold | Block Threshold | Action |
|--------|---------------|-----------------|--------|
| Hook stdin byte size | 8 KB | 32 KB | Truncate to last N lines + append `[TRUNCATED]` |
| Injected field count | 20 fields | 50 fields | Drop low-priority fields, keep required schema keys |
| Nested JSON depth | 4 levels | 6 levels | Flatten to top-level key-value pairs |
| Array length in payload | 25 items | 100 items | Slice to first N, append count summary |

## Workflow

1. **Identify the hook and its payload source**: read the hook script to find where stdin or injected context originates (tool output, file read, API response).
2. **Measure current payload size**: run the hook in isolation with representative input and capture byte count using `wc -c`.
3. **Apply pruning strategy**: choose field-drop, line-truncation, or depth-flattening based on payload type. Reference `./pruning-order.md` for priority ordering.
4. **Add size guard**: insert a byte-budget check at the top of the hook script that hard-truncates before passing to Claude's stdin.
5. **Emit a structured pruning notice**: append a JSON metadata line (`{"pruned": true, "original_bytes": N, "kept_bytes": M}`) so downstream hooks and observability tooling can detect truncation.
6. **Run before/after comparison**: capture routing decision quality with full payload vs. pruned payload; confirm routing output is stable.
7. **Add negative-path test**: send a payload that exceeds the block threshold and assert the hook outputs the truncation notice without crashing.

## References

- [Deterministic Pruning Order](./pruning-order.md)
- [Fallback Semantics](./fallback-semantics.md)
- [Verification Checklist](./verification-checklist.md)
