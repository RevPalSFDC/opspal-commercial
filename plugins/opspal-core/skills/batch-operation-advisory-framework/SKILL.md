---
name: batch-operation-advisory-framework
description: Use advisory hooks to steer large data operations toward efficient batch-capable agent patterns.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# batch-operation-advisory-framework

## When to Use This Skill

- A user requests a loop-style operation (e.g., updating every record in an object) that should instead use a bulk API or Bulk 2.0 pattern
- A PreToolUse hook should intercept repetitive single-record `sf data update record` calls and suggest a batch approach
- You are writing advisory hook output that steers users toward the `bulkops` skill without blocking their work
- Reviewing hook advisory messaging for clarity, actionability, and tone (must be informative, not alarming)
- Evaluating whether a detected pattern genuinely warrants a batch advisory vs. is a legitimate single-record flow

**Not for**: Actually executing bulk operations — use `/bulkops` (opspal-salesforce) for that.

## Detection Heuristics

| Pattern | Threshold | Advisory Trigger |
|---------|-----------|-----------------|
| Repeated `sf data update record` | 3+ calls in 60s | Recommend Bulk 2.0 |
| Loop over query result set > 200 rows | Any | Suggest batch agent |
| Single-record deletes on large objects | 5+ calls | Warn of rate limit risk |
| Sequential upsert calls | 10+ | Advisory to consolidate |

## Workflow

1. Confirm the hook fires on PreToolUse for `sf data update record`, `sf data delete record`, and similar single-record write tools.
2. Read the bulk-pattern detection script (see `bulk-pattern-detection.md`) — understand the call-frequency counters it maintains in a temp state file.
3. Simulate the threshold condition: send 3+ rapid single-record updates in a test session and verify the advisory fires.
4. Review the advisory message text for quality: it must name the recommended agent (`/bulkops`), cite the risk (API limits, rate throttling), and include an opt-out signal (`[DIRECT]` prefix).
5. Validate that the hook returns exit code 0 (advisory, not block) so the operation still proceeds.
6. Document any new pattern rules added to the detection logic in `bulk-pattern-detection.md`.

## Routing Boundaries

Use this skill for hook-level batch advisory detection and messaging.
Defer to `rollback-executor-safeguard` if the concern is reversing a bulk operation that already ran.

## References

- [Bulk Pattern Detection](./bulk-pattern-detection.md)
- [Batch Agent Recommendations](./agent-recommendations.md)
- [Advisory Messaging Quality](./advisory-quality.md)
