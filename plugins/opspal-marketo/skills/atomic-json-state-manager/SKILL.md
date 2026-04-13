---
name: atomic-json-state-manager
description: Use atomic, race-safe JSON state persistence patterns for Marketo hooks and observability flows.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# atomic-json-state-manager

## When to Use This Skill

- Implementing state files shared across Marketo hook executions (e.g., session tokens, quota trackers, bulk export job IDs)
- Reviewing hook scripts that read-modify-write JSON without explicit locking
- Diagnosing corrupted or zero-byte state files after concurrent hook runs
- Adding crash recovery to observability or import-tracking flows
- Designing fallback behavior when state is absent or unparseable

**Not for**: business logic decisions, campaign configuration, or lead field mapping.

## Atomic Write Quick Reference

| Pattern | Use When | Risk if Skipped |
|---------|----------|-----------------|
| Write-to-temp + rename | Any shared state file | Torn writes under concurrent hooks |
| Schema version field | State evolves over releases | Silent deserialization failures |
| Null-safe parse + default | Hook may run before state exists | Fatal crash on first execution |
| Checksum or sentinel | Large state blobs (>10 KB) | Undetected partial corruption |
| Max-age eviction | Long-lived cache files | Stale data driving wrong decisions |

## Workflow

1. **Audit the read path**: confirm JSON.parse is wrapped in try/catch with a typed default return value.
2. **Audit the write path**: confirm writes go to a `.tmp` file first, then `fs.renameSync` to the real path — never direct overwrite.
3. **Validate schema contract**: check that required top-level keys are present after parse; reject and reset if any are missing.
4. **Add corruption recovery**: if parse fails, log the raw content for forensics, then initialize fresh state — do not abort the hook.
5. **Verify under concurrent load**: simulate two hook processes firing simultaneously; confirm only one wins the rename and state remains coherent.
6. **Test degraded mode**: remove state file mid-run and confirm hook degrades gracefully without throwing.

## Routing Boundaries

Use this skill when the concern is state file integrity and concurrency safety.
Defer to `marketo-instance-lifecycle-operations` for session bootstrap sequencing.
Defer to `marketo-change-safety-guardrails` when the state file gates a mutation operation.

## References

- [Atomic Write Pattern](./atomic-write-pattern.md)
- [Concurrency Controls](./concurrency-controls.md)
- [Corruption Recovery](./corruption-recovery.md)
