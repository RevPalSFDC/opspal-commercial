---
description: Full Attio workspace health audit
argument-hint: "[--scope=full|quick] [--focus=schema|data|access]"
---

# /attio-audit

Run a comprehensive health audit of your Attio workspace.

## Usage

```
/attio-audit [--scope=full|quick] [--focus=schema|data|access]
```

## Overview

`/attio-audit` performs a structured assessment of workspace health across four dimensions: schema integrity, data quality, access controls, and webhook inventory. Results are saved as a timestamped assessment file for tracking over time.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--scope` | `full` | `full` for complete audit; `quick` for summary only |
| `--focus` | _(all)_ | Limit audit to a specific dimension: `schema`, `data`, or `access` |

## Audit Dimensions

### Schema Health
- Attribute naming conventions (consistency, reserved names)
- Orphaned attributes (defined but unused across all records)
- Unused objects (created but no records)
- Required attribute coverage per object

### Data Quality
- Field completeness scores by object (people, companies)
- Stale records (no activity within configurable window)
- Duplicate detection summary (delegates to `attio-data-hygiene-specialist`)

### Access Controls
- Member permission levels and role distribution
- List access controls (public vs. restricted)
- API key inventory and scope review

### Webhook Inventory
- Active webhooks and their target URLs
- Last delivery status and failure counts
- Unused or unresponsive webhooks

## Agent Delegation

| Dimension | Agent |
|-----------|-------|
| Data quality, dedup | `attio-data-hygiene-specialist` |
| Access controls, schema governance | `attio-governance-enforcer` |

## Output

Assessment is saved to:
```
workspaces/{name}/assessments/audit-{YYYY-MM-DD}.json
```

A summary is printed to the terminal with pass/warn/fail indicators per dimension.

## Examples

### Full Workspace Audit
```
/attio-audit
```

### Quick Schema Check Only
```
/attio-audit --scope=quick --focus=schema
```

### Data Quality Focus
```
/attio-audit --focus=data
```

## When to Run

- Monthly as part of regular workspace maintenance
- Before major migrations or integrations
- After bulk imports to verify data integrity
- When onboarding new team members (access review)
