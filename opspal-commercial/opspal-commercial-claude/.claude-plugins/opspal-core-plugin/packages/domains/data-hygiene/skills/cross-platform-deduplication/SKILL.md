---
name: cross-platform-deduplication
description: Cross-platform deduplication methodology for HubSpot and Salesforce with 6-phase workflow. Use when deduplicating Company/Account records, clustering duplicates, selecting canonical records, executing merges with data preservation, repairing associations, or implementing guardrails to prevent recurrence.
allowed-tools: Read, Grep, Glob
---

# Cross-Platform Deduplication

## When to Use This Skill

- Deduplicating Company/Account records across HubSpot and Salesforce
- Clustering duplicate records by domain or SF Account ID
- Selecting canonical (master) records with weighted scoring
- Executing merges with complete data preservation
- Repairing PRIMARY associations post-merge
- Implementing guardrails to prevent duplicate recurrence

## Quick Reference

### 6-Phase Workflow

```
Phase 0: Safety & Snapshot
    ↓
Phase 1: Clustering (Bundle A: SF-anchored, Bundle B: HS-only)
    ↓
Phase 2: Canonical Selection (Weighted scoring)
    ↓
Phase 3: Execution (Dry-run → Live)
    ↓
Phase 2.5: Association Repair (PRIMARY verification)
    ↓
Phase 4: Guardrails (Prevention)
```

### Canonical Selection Scoring

| Factor | Points | Description |
|--------|--------|-------------|
| Has SF Account ID | 100 | Salesforce-synced |
| Sync Health | 50 | Recent sync + valid |
| Contact Count | 40 | Normalized |
| Deal Count | 25 | Normalized |
| Has Owner | 10 | Owner assigned |
| Age | 5 | Older preferred |

### Critical Prerequisites

- [ ] Auto-associate OFF in HubSpot
- [ ] API tokens configured
- [ ] Snapshot created (Phase 0)
- [ ] User reviewed canonical selections
- [ ] Dry-run executed and reviewed

## Detailed Documentation

See supporting files:
- `matching-algorithms.md` - Clustering logic
- `merge-rules.md` - Survivor selection
- `cross-platform-sync.md` - SF↔HS sync handling
- `quality-scoring.md` - Data quality assessment
