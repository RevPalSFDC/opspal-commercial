---
name: okr-cadence
description: Manage the OKR operating rhythm — setup cadence, review health, or execute rollout playbook
argument-hint: "--org <org-slug> --cycle <cycle> --action setup|review|rollout [--activate-asana]"
intent: Establish, monitor, and sustain the weekly/monthly/quarterly OKR operating rhythm.
dependencies: [opspal-okrs:okr-cadence-manager, opspal-okrs:okr-asana-bridge]
failure_modes: [org_not_provided, no_active_cycle, asana_not_connected]
visibility: user-invocable
aliases:
  - okr-schedule
  - okr-rhythm
tags:
  - okr
  - cadence
  - operations
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
---

# /okr-cadence Command

Manage the OKR operating rhythm for an active cycle. Three action modes: setup, review, and rollout.

## Usage

```bash
# Set up cadence calendar and Asana tasks
/okr-cadence --org acme-corp --cycle Q3-2026 --action setup --activate-asana

# Review cadence health (missed check-ins, stale data)
/okr-cadence --org acme-corp --cycle Q3-2026 --action review

# Execute the 9-step OKR rollout playbook
/okr-cadence --org acme-corp --cycle Q3-2026 --action rollout

# Use current org (ORG_SLUG env var)
/okr-cadence --cycle Q3-2026 --action setup
```

## Actions

### `setup` — Create Cadence Infrastructure

1. Generates a cadence calendar with all check-in, scorecard, and review dates
2. Creates weekly check-in template from `templates/reports/weekly-kr-update.md`
3. If `--activate-asana`: creates recurring Asana tasks for weekly/monthly/quarterly rhythm
4. Outputs `cadence-calendar.json` to the cycle reports directory

### `review` — Report Cadence Health

1. Checks weekly check-in completion rate
2. Identifies stale KRs (no update in >14 days)
3. Reports on scorecard distribution timeliness
4. Flags red flags: missed check-ins, repeated blockers, suspiciously all-green reports
5. Outputs `cadence-health-{date}.json`

### `rollout` — Execute 9-Step Playbook

1. Assesses current rollout step based on existing artifacts
2. Generates deliverables for the next step
3. Creates a checklist for completion criteria
4. Provides timeline and guidance

## Output

| Artifact | Location |
|----------|----------|
| Cadence calendar | `orgs/{org}/platforms/okr/{cycle}/reports/cadence-calendar.json` |
| Cadence health | `orgs/{org}/platforms/okr/{cycle}/reports/cadence-health-{date}.json` |
| Rollout progress | `orgs/{org}/platforms/okr/{cycle}/reports/rollout-progress.json` |

## Execution

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-cadence-manager',
  prompt: `Manage OKR cadence for org: ${org || process.env.ORG_SLUG}
    Cycle: ${cycle}
    Action: ${action}
    Activate Asana: ${activateAsana || false}`
});
```

## Related Commands

- `/okr-status` — Check current KR and objective health
- `/okr-dashboard` — Generate interactive HTML dashboard
- `/okr-report` — Produce executive report
- `/okr-retrospective` — Close cycle with learning capture
