---
name: okr-history
description: Review historical OKR accuracy, calibration state, and target-setting reliability across completed cycles
argument-hint: "--org <org-slug> [--metric <metric-id>] [--format table|markdown|json]"
intent: Expose the OKR learning history so future targets can be calibrated from evidence rather than memory.
dependencies: [opspal-okrs:okr-learning-engine, config/okr-outcomes.json, scripts/lib/okr-outcome-calibrator.js]
failure_modes: [org_not_provided, no_history_available, metric_not_found, calibration_store_invalid]
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
visibility: user-invocable
aliases:
  - okr-calibration-history
  - okr-accuracy
tags:
  - okr
  - history
  - calibration
---

# /okr-history Command

Review stored OKR outcomes and calibration history for an org. This command shows where the team consistently over- or under-shoots targets and how reliable the learning signal actually is.

## Usage

```bash
# See overall history for the org
/okr-history --org acme-corp

# Focus on one metric only
/okr-history --org acme-corp --metric activation_rate

# Export machine-readable calibration data
/okr-history --org acme-corp --format json
```

## What This Does

1. **Loads historical OKR outcomes** from the learning store
2. **Summarizes hit rate and variance** by metric and cycle
3. **Reports calibration state** including smoothed attainment and Bayesian confidence
4. **Warns when history is still thin** and not yet decision-grade
5. **Highlights which metrics are stable enough** to influence new target-setting

## Output

| Artifact | Location | Purpose |
|----------|----------|---------|
| History summary | `orgs/{org}/platforms/okr/reports/okr-history-{date}.md` | Human-readable accuracy and calibration view |
| History data | `orgs/{org}/platforms/okr/reports/okr-history-{date}.json` | Metric-by-metric calibration payload |

## Execution

This command invokes the `okr-learning-engine` agent.

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-learning-engine',
  prompt: `Show OKR history for org: ${org || process.env.ORG_SLUG}
    Metric filter: ${metric || 'all'}
    Format: ${format || 'table'}

    Produce:
    1. Completed-cycle accuracy summary
    2. Metric-level calibration state
    3. 4-cycle minimum warning where applicable
    4. Which metrics are stable enough to influence next-cycle targets`
});
```

## Related Commands

- `/okr-retrospective` - Capture the newest learning into history
- `/okr-benchmark` - Compare history against external peer ranges
- `/okr-generate` - Use history to calibrate the next draft
