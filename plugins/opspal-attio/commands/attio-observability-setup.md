---
description: Configure continuous Attio workspace monitoring
argument-hint: "[--type health-snapshot|pipeline-drift|data-quality] [--cron expression]"
---

# /attio-observability-setup

Configure scheduled monitoring for Attio workspaces. Sets up recurring health snapshots, pipeline drift detection, and data quality checks that run automatically on a cron schedule.

## Usage

```
/attio-observability-setup [--type <monitor-type>] [--cron '<expression>']
/attio-observability-setup list
/attio-observability-setup remove <schedule-id>
```

## Monitor Types

| Type | Description | Default Schedule |
|------|-------------|-----------------|
| `health-snapshot` | Full workspace health metrics: member activity, webhook status, record counts, attribute completeness | Daily at 6am |
| `pipeline-drift` | Detects stale deals, stage velocity anomalies, and coverage ratio changes vs. prior period | Weekly (Mondays at 7am) |
| `data-quality` | Identifies missing required attributes, duplicate signals, and enrichment gaps | Weekly (Wednesdays at 7am) |

## Setup Examples

```
/attio-observability-setup --type health-snapshot --cron '0 6 * * *'
/attio-observability-setup --type pipeline-drift --cron '0 7 * * 1'
/attio-observability-setup --type data-quality --cron '0 7 * * 3'
```

Omit `--cron` to apply the default schedule for the selected monitor type.

## Managing Schedules

**List active schedules:**
```
/attio-observability-setup list
```
Displays all configured monitors with schedule ID, type, cron expression, last run time, and status.

**Remove a schedule:**
```
/attio-observability-setup remove <schedule-id>
```
Disables and removes the specified monitor. Schedule ID is shown in the `list` output.

## How It Works

Monitoring schedules are registered via the **opspal-core `/schedule-add`** infrastructure, which manages cron execution and log retention. Each scheduled run produces a snapshot stored for comparison by `/attio-observability-dashboard`.

Results are available immediately after each run and persist for trend analysis across dashboard views.

## Delegation

Delegates to the **attio-observability-orchestrator** agent for schedule registration, monitor configuration, and cron wiring via opspal-core.
