---
name: okr-generate
description: Generate data-driven OKRs from live revenue data across all connected platforms
argument-hint: "--org <org-slug> --cycle <Q3-2026|H2-2026> [--stance aggressive|base|conservative]"
intent: Start the full OKR drafting workflow for a cycle using live platform data and schema-governed output.
dependencies: [opspal-okrs:okr-strategy-orchestrator, Salesforce org access, optional HubSpot/Gong/product analytics]
failure_modes: [org_not_provided, insufficient_platform_data, schema_validation_failure, manual_baseline_required]
visibility: user-invocable
aliases:
  - generate-okrs
  - create-okrs
tags:
  - okr
  - strategy
  - revenue
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
---

# /okr-generate Command

Generate a complete OKR set derived from live revenue data across Salesforce, HubSpot, and other connected platforms.

## Usage

```bash
# Generate OKRs for a specific org and cycle
/okr-generate --org acme-corp --cycle Q3-2026

# Generate with a specific stance
/okr-generate --org acme-corp --cycle H2-2026 --stance aggressive

# Generate for current org (uses ORG_SLUG env var)
/okr-generate --cycle Q3-2026
```

## What This Does

1. **Collects revenue snapshot** — Pulls live data from Salesforce, HubSpot, Gong, and product analytics
2. **Analyzes current state** — Identifies strengths, weaknesses, opportunities, and threats
3. **Generates draft OKRs** — Creates 3-5 objectives with 2-5 key results each
4. **Three stances** — Aggressive, Base, and Conservative targets for every KR
5. **Benchmark comparison** — Calibrates targets against industry benchmarks by stage/ACV/GTM model
6. **Presents for approval** — Shows summary and waits for human approval

## Output

| File | Location | Description |
|------|----------|-------------|
| Revenue Snapshot | `orgs/{org}/platforms/okr/{cycle}/snapshots/revenue-snapshot.json` | Raw platform data |
| Draft OKR Set | `orgs/{org}/platforms/okr/{cycle}/drafts/okr-draft-{cycle}.json` | Schema-compliant OKR tree |
| Summary | `orgs/{org}/platforms/okr/{cycle}/reports/okr-summary-{cycle}.md` | Human-readable summary |

## Execution

This command invokes the `okr-strategy-orchestrator` agent which coordinates:
- `okr-data-aggregator` for multi-platform data collection
- `okr-generator` for OKR creation from snapshot data

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-strategy-orchestrator',
  prompt: `Generate OKRs for org: ${org || process.env.ORG_SLUG}
    Cycle: ${cycle}
    Stance: ${stance || 'base'}

    Follow the full /okr-generate workflow:
    1. Initialize workspace
    2. Collect revenue snapshot
    3. Generate draft OKRs with three stances
    4. Present summary for approval`
});
```

## Requirements

- Salesforce org connected (minimum requirement)
- Recommended: HubSpot, Gong, product analytics for richer OKRs
- `ORG_SLUG` environment variable set or `--org` flag provided

## Related Commands

- `/okr-snapshot` — Pull revenue snapshot without generating OKRs
- `/okr-approve` — Approve and activate a draft OKR set (Phase 2)
- `/okr-status` — Check progress of active OKRs (Phase 2)
- `/okr-score-initiative` — Score a proposed initiative (Phase 2)
