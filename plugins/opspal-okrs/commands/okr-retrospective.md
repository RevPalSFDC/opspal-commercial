---
name: okr-retrospective
description: Capture close-cycle OKR outcomes and convert them into calibration-ready learning for the next planning cycle
argument-hint: "--org <org-slug> --cycle <Q3-2026|H2-2026> [--format markdown|json] [--include-root-causes]"
intent: Close the loop on an OKR cycle by recording outcomes, classifying misses, and updating calibration history.
dependencies: [opspal-okrs:okr-learning-engine, scripts/lib/okr-outcome-calibrator.js, closed_or_closing_cycle_data]
failure_modes: [cycle_not_closed, final_actuals_missing, metric_lineage_missing, calibration_store_write_failed]
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
visibility: user-invocable
aliases:
  - okr-retro
  - close-cycle-learning
tags:
  - okr
  - retrospective
  - learning
---

# /okr-retrospective Command

Capture what happened in a finished OKR cycle and store it in the learning system. This command is the formal close-cycle step for historical accuracy and calibration.

## Usage

```bash
# Capture retrospective learning for a completed cycle
/okr-retrospective --org acme-corp --cycle Q3-2026

# Include a machine-readable output for later planning automation
/okr-retrospective --org acme-corp --cycle Q3-2026 --format json
```

## What This Does

1. **Loads the closing cycle** and final actuals for each KR
2. **Classifies outcomes** into hit, partial, or miss
3. **Records learning** into `config/okr-outcomes.json`
4. **Updates calibration** using smoothed attainment ratios and Bayesian priors
5. **Publishes a retrospective** with biggest misses, biggest wins, and next-cycle implications

## Output

| Artifact | Location | Purpose |
|----------|----------|---------|
| Retrospective summary | `orgs/{org}/platforms/okr/{cycle}/reports/okr-retrospective-{cycle}.md` | Narrative close-cycle review |
| Retrospective data | `orgs/{org}/platforms/okr/{cycle}/reports/okr-retrospective-{cycle}.json` | Outcome capture and calibration payload |

## Execution

This command invokes the `okr-learning-engine` agent.

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-learning-engine',
  prompt: `Capture OKR retrospective for org: ${org || process.env.ORG_SLUG}
    Cycle: ${cycle}
    Format: ${format || 'markdown'}
    Include root causes: ${includeRootCauses ? 'yes' : 'no'}

    Produce:
    1. KR-level hit / partial / miss outcomes
    2. Largest variance drivers and root causes
    3. Calibration update with 4-cycle warning if needed
    4. Planning implications for the next cycle`
});
```

## Related Commands

- `/okr-history` - Review stored learning and calibration trends
- `/okr-status` - Use before close to verify the cycle has current actuals
- `/okr-approve` - Start the next cycle after the retrospective is complete
