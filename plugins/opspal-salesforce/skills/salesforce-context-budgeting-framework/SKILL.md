---
name: salesforce-context-budgeting-framework
description: Control Salesforce hook-injected context size with deterministic prioritization, token budgets, and overflow markers.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Context Budgeting Framework

## When to Use This Skill

Use this skill when:
- Hook-injected context (org metadata, runbook data, field dictionaries) is inflating prompt size
- Implementing token budget limits for pre-task context injection
- Prioritizing which context to include when budget is constrained
- Adding overflow markers when context is truncated

**Not for**: API quota tracking (use `salesforce-runtime-telemetry-and-api-quota-framework`), general operations readiness (use `operations-readiness-framework`), or org context detection (use `salesforce-org-context-detection-framework`).

## Context Budget Tiers

| Priority | Context Type | Max Tokens | Truncation Strategy |
|----------|-------------|------------|---------------------|
| 1 (Critical) | Org identity and type | 200 | Never truncate |
| 2 (High) | Active org quirks | 500 | Truncate to top 5 quirks |
| 3 (Medium) | Field dictionary context | 1,000 | Truncate to requested fields only |
| 4 (Low) | Work history / runbook | 2,000 | Truncate to last 3 entries |
| 5 (Optional) | Full metadata cache | 5,000 | Omit entirely if budget exceeded |

**Total budget target**: <10,000 tokens injected per task start.

## Overflow Handling

When context exceeds budget, inject a truncation marker:
```
[CONTEXT TRUNCATED: {type} exceeded {budget} token budget. {omitted_count} items omitted. Use /query-field-dictionary or /view-runbook for full context.]
```

## Workflow

1. Calculate available token budget based on model context window
2. Prioritize context sources by the tier table above
3. Inject highest-priority context first, tracking cumulative token count
4. When budget is reached, add overflow notice and stop injecting

## References

- [Injection Priority](./injection-priority.md)
- [Budget Thresholds](./budget-thresholds.md)
- [Overflow Notices](./overflow-notices.md)
