---
description: Generate full Attio workspace health report
argument-hint: "[--scope full|quick] [--compare-previous]"
---

# /attio-workspace-report

Generate a comprehensive health report for your Attio workspace.

## Usage

```
/attio-workspace-report [--scope full|quick] [--compare-previous]
```

## Overview

`/attio-workspace-report` produces a structured assessment of workspace health across five dimensions: schema integrity, data quality, access controls, webhook inventory, and pipeline health. Results are saved as a timestamped assessment file for tracking over time.

Delegates to the `attio-assessment-analyzer` agent. Historical comparison is handled by `scripts/lib/assessment-history-tracker.js`.

## Report Dimensions

### 1. Schema Health
- Object and attribute inventory (count, naming conventions)
- Attribute naming compliance (snake_case enforcement, reserved names)
- Orphaned attributes (defined but unused across all records)
- Unused objects (created but containing no records)
- Required attribute coverage per object

### 2. Data Quality
- Field completeness scores by object (people, companies)
- Stale records (no activity within the configurable window)
- Duplicate detection summary (delegates to `attio-data-hygiene-specialist`)
- Empty key-field distribution

### 3. Access Controls
- Member permission levels and role distribution
- List access controls (public vs. member-restricted)
- API key inventory and scope review
- Overly permissive access flags

### 4. Webhook Inventory
- Active webhooks and their target URLs
- Last delivery status and consecutive failure counts
- Unused or unresponsive webhooks flagged for removal
- Event type coverage gaps

### 5. Pipeline Health
- Stage distribution across all list pipelines
- Records stuck in a stage beyond expected velocity
- Average time-in-stage per pipeline
- Open vs. closed entry ratios

## Scope

| Scope | Dimensions Covered |
|-------|--------------------|
| `quick` | Schema health + basic data quality only |
| `full` (default) | All five dimensions |

## Comparison Mode

```
/attio-workspace-report --compare-previous
```

Diffs the current report against the most recent saved assessment. Highlights:
- New or removed objects/attributes since last run
- Completeness score changes per object
- New stale record counts
- Webhook status changes

Comparison history is managed by `scripts/lib/assessment-history-tracker.js`.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--scope` | `full` | `full` for all five dimensions; `quick` for schema + basic data only |
| `--compare-previous` | off | Diff current results against the last saved assessment |

## Output

A summary is printed to the terminal with pass/warn/fail indicators per dimension:

```
Attio Workspace Health Report — 2026-04-10
Workspace: production

[PASS] Schema Health       — 4 objects, 47 attributes, 0 naming violations
[WARN] Data Quality        — 87 people records missing key fields (40.7%)
[PASS] Access Controls     — 12 members, no overly permissive API keys detected
[WARN] Webhook Inventory   — 2 webhooks with >5 consecutive delivery failures
[PASS] Pipeline Health     — 3 pipelines, 8 open entries, avg 4.2 days/stage

Overall: 2 warnings, 0 failures
```

Assessment saved to:
```
workspaces/{name}/assessments/report-{YYYY-MM-DD}.json
```

## Agent Delegation

| Dimension | Agent |
|-----------|-------|
| Data quality, duplicate detection | `attio-data-hygiene-specialist` |
| Schema governance, access controls | `attio-governance-enforcer` |
| Full report orchestration | `attio-assessment-analyzer` |

## Examples

### Full Workspace Report (Default)
```
/attio-workspace-report
```

### Quick Schema and Data Check
```
/attio-workspace-report --scope quick
```

### Compare Against Previous Assessment
```
/attio-workspace-report --compare-previous
```

### Quick Check + Comparison
```
/attio-workspace-report --scope quick --compare-previous
```

## When to Run

- Monthly as part of regular workspace maintenance
- After a bulk import or major schema change
- Before integrating Attio with an external platform
- Quarterly for executive-level workspace health reviews
- When onboarding a new workspace administrator
