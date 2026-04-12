---
description: Data enrichment workflow for Attio records
argument-hint: "[--object people|companies] [--scope incomplete|all] [--dry-run]"
---

# /attio-enrich

Audit Attio records for data completeness and surface enrichment opportunities.

## Usage

```
/attio-enrich [--object people|companies] [--scope incomplete|all] [--dry-run]
```

## Overview

`/attio-enrich` scans Attio records to identify missing or empty key attributes, calculates per-record completeness scores, and recommends enrichment actions. It operates in dry-run mode by default — no changes are made until explicitly confirmed.

Delegates to the `attio-data-hygiene-specialist` agent.

> **Note**: Auto-enrichment from external data sources is not supported in Phase 1. `/attio-enrich` identifies gaps and suggests actions; cross-platform data bridges are planned for Phase 3.

## Scope

| Scope | Behaviour |
|-------|-----------|
| `incomplete` (default) | Scans only records missing one or more key attributes |
| `all` | Full completeness audit across all records |

## Key Attributes by Object

### People
- First name
- Last name
- Email address
- Job title
- Linked company

### Companies
- Company name
- Domain
- Industry
- Employee count (if tracked)
- Primary contact linked

## Completeness Scoring

Each record receives a completeness score (0–100%) based on the proportion of key attributes that are populated. Scores are grouped into tiers:

| Score | Tier |
|-------|------|
| 90–100% | Complete |
| 70–89% | Mostly complete |
| 50–69% | Partially complete |
| < 50% | Incomplete |

## Output

The command prints a summary table and saves a report:

```
Object: people
Scope: incomplete
Records scanned: 214
Records with gaps: 87 (40.7%)

Completeness Distribution:
  Complete (90-100%):        127 records
  Mostly complete (70-89%):   51 records
  Partially complete (50-69%):24 records
  Incomplete (<50%):          12 records

Top Missing Fields:
  job_title        — missing on 62 records
  linked company   — missing on 38 records
  email_addresses  — missing on 14 records

Recommended Actions:
  1. Review 12 highly incomplete people records manually
  2. Link 38 people records to company records
  3. Source job titles for 62 records from LinkedIn or other sources
```

Report saved to `workspaces/{name}/assessments/enrich-{timestamp}.json`.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--object` | `people` | Object to audit: `people` or `companies` |
| `--scope` | `incomplete` | `incomplete` (gap records only) or `all` (full audit) |
| `--dry-run` | `true` | Report only — no changes made (default) |

## Dry-Run Default

`/attio-enrich` runs in dry-run mode by default. It will never modify records without explicit confirmation. To apply any suggested changes:
1. Review the output report
2. Confirm specific actions with the `attio-data-hygiene-specialist` agent directly

## Examples

### Audit People for Missing Fields (Default)
```
/attio-enrich
```

### Full Audit of All Company Records
```
/attio-enrich --object companies --scope all
```

### Check Completeness Without Dry-Run Label
```
/attio-enrich --object people --scope incomplete
```

## Agent Delegation

This command delegates to the `attio-data-hygiene-specialist` agent for record scanning, completeness calculation, and report generation.

## When to Run

- After a bulk import (verify field coverage)
- Monthly as part of data quality maintenance
- Before migrating data to another platform
- When preparing for a sales or marketing campaign (ensure contact completeness)
