---
name: okr-status
description: Report current OKR progress with health states, confidence bands, and evidence-backed risk flags
argument-hint: "--org <org-slug> --cycle <Q3-2026|H2-2026> [--audience exec|team|board] [--format table|markdown|json]"
intent: Show whether an active OKR cycle is actually on track, at risk, or off track using current evidence.
dependencies: [opspal-okrs:okr-progress-tracker, approved_or_active_cycle, current_metric_refresh]
failure_modes: [cycle_not_active, current_values_missing, stale_data, confidence_projection_unavailable]
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
visibility: user-invocable
aliases:
  - okr-health
  - okr-progress
tags:
  - okr
  - status
  - tracking
---

# /okr-status Command

Show the current state of an active OKR cycle. This command summarizes objective and key result health in terminal-friendly form while preserving the evidence and confidence needed for review meetings.

## Usage

```bash
# Current OKR health for a cycle
/okr-status --org acme-corp --cycle Q3-2026

# Executive summary view
/okr-status --org acme-corp --cycle Q3-2026 --audience exec

# Machine-readable health payload
/okr-status --org acme-corp --cycle Q3-2026 --format json
```

## What This Does

1. **Loads the active OKR set** and latest initiative execution context
2. **Refreshes key metrics** from the underlying revenue, pipeline, retention, and product data
3. **Calculates health** for each KR using actuals, trajectory, and confidence bands
4. **Rolls up objective health** with evidence gaps, blockers, and trend direction
5. **Publishes a concise status report** for terminal review, standups, or executive syncs

## Health States

| Health | Meaning |
|--------|---------|
| On Track | Current trajectory supports the base target with acceptable confidence |
| At Risk | Outcome is still recoverable, but trajectory, confidence, or dependencies are weak |
| Off Track | Current evidence indicates the target will likely be missed without intervention |

## Output

| Artifact | Location | Purpose |
|----------|----------|---------|
| Status snapshot | `orgs/{org}/platforms/okr/{cycle}/reports/okr-status-{date}.md` | Readable summary with objective and KR health |
| Status data | `orgs/{org}/platforms/okr/{cycle}/reports/okr-status-{date}.json` | Health states, confidence bands, blockers, and notes |

## Execution

This command invokes the `okr-progress-tracker` agent.

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-progress-tracker',
  prompt: `Report OKR status for org: ${org || process.env.ORG_SLUG}
    Cycle: ${cycle}
    Audience: ${audience || 'exec'}
    Format: ${format || 'table'}

    Produce:
    1. Objective and KR health states
    2. P10/P50/P90 confidence commentary where available
    3. Top blockers, dependencies, and evidence gaps
    4. Recommended interventions for at-risk and off-track items`
});
```

## Typical Sections

- Company-level scoreline for the cycle
- Objective-by-objective health with weighted KR rollups
- At-risk initiative list with owner/action
- Evidence quality notes for missing or stale data

## Related Commands

- `/okr-generate` - Create a new draft OKR set
- `/okr-approve` - Activate a draft cycle before tracking begins
- `/okr-report` - Produce a board-ready status report
