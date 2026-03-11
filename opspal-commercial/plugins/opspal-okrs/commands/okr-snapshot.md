---
name: okr-snapshot
description: Pull a live revenue snapshot from all connected platforms for OKR baseline data
argument-hint: "--org <org-slug> [--platforms salesforce,hubspot,gong]"
intent: Collect a normalized baseline snapshot without drafting or activating an OKR cycle.
dependencies: [opspal-okrs:okr-data-aggregator, Salesforce org access, optional HubSpot/Gong/product analytics]
failure_modes: [org_not_provided, salesforce_unavailable, partial_platform_coverage, snapshot_validation_failure]
visibility: user-invocable
aliases:
  - revenue-snapshot
tags:
  - okr
  - snapshot
  - revenue
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
---

# /okr-snapshot Command

Pull a normalized revenue snapshot from all connected platforms without generating OKRs. Useful for reviewing current state before OKR generation or tracking changes between snapshots.

## Usage

```bash
# Full snapshot from all platforms
/okr-snapshot --org acme-corp

# Snapshot from specific platforms only
/okr-snapshot --org acme-corp --platforms salesforce,hubspot

# Quick snapshot (uses ORG_SLUG env var)
/okr-snapshot
```

## What This Does

1. **Queries all connected platforms** — Salesforce, HubSpot, Gong, Product Analytics
2. **Normalizes data** — Converts platform-specific formats to canonical snapshot schema
3. **Assesses data quality** — Reports confidence levels and evidence coverage
4. **Saves snapshot** — Persists for future comparison and OKR generation

## Output

| File | Location | Description |
|------|----------|-------------|
| Snapshot | `orgs/{org}/platforms/okr/snapshots/snapshot-{date}.json` | Normalized revenue data |

## Metrics Collected

| Category | Metrics | Primary Source |
|----------|---------|----------------|
| Revenue | ARR, MRR, bookings | Salesforce |
| Pipeline | Coverage, stage distribution, deal velocity | Salesforce |
| Efficiency | Win rate, sales cycle, quota attainment | Salesforce |
| Retention | NRR, GRR, churn rate, expansion % | Salesforce + HubSpot |
| Acquisition | MQL volume, SQL conversion, lead velocity | HubSpot |
| PLG | PQL count, activation rate, free-to-paid | Product Analytics |
| Competitive | Win/loss themes, competitor mentions | Gong |

## Execution

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-data-aggregator',
  prompt: `Collect revenue snapshot for org: ${org || process.env.ORG_SLUG}
    Platforms: ${platforms || 'all'}
    Output to: orgs/${org}/platforms/okr/snapshots/snapshot-${new Date().toISOString().slice(0,10)}.json
    Display summary table to user after collection.`
});
```

## Related Commands

- `/okr-generate` — Generate OKRs from snapshot data
- `/forecast` — Detailed pipeline forecast (opspal-gtm-planning)
