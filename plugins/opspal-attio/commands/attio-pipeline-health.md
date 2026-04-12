---
description: Pipeline conversion and velocity report for Attio lists
argument-hint: "[--list slug] [--period 30d|90d|all]"
---

# /attio-pipeline-health

Generates a pipeline health report for Attio lists, analyzing conversion rates, velocity, and bottlenecks.

## Usage

```
/attio-pipeline-health
/attio-pipeline-health --list sales-pipeline
/attio-pipeline-health --list sales-pipeline --period 90d
/attio-pipeline-health --period 30d
```

## What It Analyzes

- **Stage distribution** — count and percentage of records at each stage
- **Conversion rates** — stage-to-stage conversion percentages
- **Velocity** — average days spent per stage
- **Bottleneck detection** — stages with high volume or low conversion flagged as bottlenecks
- **Win/loss rate** — overall closed-won vs. closed-lost breakdown

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--list slug` | Target a specific list by its slug | All lists analyzed |
| `--period 30d\|90d\|all` | Filter entries by time period | `all` |

## List Targeting

This command is not limited to a list named "deals." It can target any Attio list that has stages:

```
/attio-pipeline-health --list enterprise-accounts
/attio-pipeline-health --list partner-pipeline --period 30d
/attio-pipeline-health --list renewals --period 90d
```

When no `--list` is specified, the command discovers all lists in the workspace and produces a summary report across all of them.

## Output

- Visual stage funnel (ASCII or Mermaid) showing record flow
- Metrics table: stage name, count, conversion %, avg days, velocity trend
- Bottleneck flags with recommended actions
- Win/loss rate summary with period comparison if multiple periods exist

## Agent Delegation

Delegates to the **attio-pipeline-analyst** agent, which:

1. Fetches list metadata and stage definitions via the Attio API
2. Retrieves list entries with stage and date filters applied
3. Calculates per-stage metrics using entry timestamps and status transitions
4. Identifies bottlenecks where conversion drops below workspace average
5. Renders the funnel visualization and metrics table

## Notes

- Stage velocity is calculated from entry creation date to stage transition timestamps where available; falls back to entry updated_at for stages lacking explicit transition events
- Entries without a stage assignment are grouped under "Unassigned" and excluded from conversion calculations
- Period filtering applies to entry created_at, not stage transition dates
