---
name: data-quality-audit
description: Run comprehensive data quality audit on CRM data
argument-hint: "[--object Account|Contact|Lead] [--scope full|quick] [--output report|actions]"
visibility: user-invocable
aliases:
  - dq-audit
  - audit-data
tags:
  - data-quality
  - audit
  - revops
---

# /data-quality-audit Command

Run a comprehensive data quality audit across CRM data including normalization analysis, duplicate detection, enrichment gaps, anomaly detection, and governance compliance.

## Usage

```bash
# Full audit on all objects
/data-quality-audit

# Audit specific object type
/data-quality-audit --object Account

# Quick scan (population and staleness only)
/data-quality-audit --scope quick

# Output actionable items instead of report
/data-quality-audit --output actions

# Combined options
/data-quality-audit --object Contact --scope full --output report
```

## Options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `--object` | Account, Contact, Lead, all | all | Target object type |
| `--scope` | full, quick | quick | Audit depth |
| `--output` | report, actions, both | report | Output format |
| `--org` | [org-alias] | default | Salesforce org alias |
| `--format` | json, markdown, csv | markdown | Report format |
| `--input` | [path] | - | JSON input data file (required for CLI) |

## Audit Dimensions

### Quick Scope
- **Population Rate** - Percentage of records with populated fields
- **Staleness Analysis** - Records with outdated data based on decay rates

### Full Scope (includes Quick)
- **Normalization Check** - Data canonicalization issues
- **Duplicate Detection** - Potential duplicate records
- **Enrichment Gaps** - Missing data that could be enriched
- **Anomaly Detection** - Data quality anomalies
- **Compliance Status** - GDPR/CCPA compliance check
- **Relationship Integrity** - Missing parent/child relationships

## Output Example

### Report Format (Markdown)
```markdown
# Data Quality Audit Report

## Summary
**Overall Score:** 78/100 (Grade: C)
**Records Analyzed:** 15,432
**Audit Date:** 2025-01-15T10:30:00Z

## Dimension Scores
| Dimension | Score | Status |
|-----------|-------|--------|
| Population | 82 | ✅ Good |
| Staleness | 71 | ⚠️ Fair |
| Anomalies | 85 | ✅ Good |
| Compliance | 90 | ✅ Good |
| Consistency | 62 | ⚠️ Fair |

## Top Issues
1. **Email population low** (Priority: High)
   - 23% of contacts missing email
   - Recommendation: Run enrichment pipeline

2. **Stale phone data** (Priority: Medium)
   - 15% of phone numbers >12 months old
   - Recommendation: Validation campaign

## Quick Wins
- Fill 500 missing Industry values (Est. 2 hours)
- Merge 45 duplicate accounts (Est. 1 hour)
- Fix 12 role-account mismatches (Est. 30 min)
```

### Actions Format (JSON)
```json
{
  "pendingActions": [
    {
      "type": "enrichment",
      "target": "Contact",
      "field": "Email",
      "recordCount": 3500,
      "estimatedTime": "2 hours",
      "confidence": 0.85
    },
    {
      "type": "merge",
      "target": "Account",
      "clusters": 45,
      "recordCount": 98,
      "confidence": 0.92
    }
  ],
  "reviewRequired": [...],
  "blocked": [...]
}
```

## Governance Integration

This command respects governance policies:
- Protected fields are excluded from enrichment suggestions
- Compliance violations are flagged but not auto-fixed
- All analysis is logged to audit trail

## Related Commands

- `/data-health` - Quick health scorecard without full audit
- `/deduplicate` - Run deduplication workflow
- `/enrich-data` - Trigger enrichment pipeline
- `/review-queue` - Process pending data quality actions

## CLI Usage

You can also run the audit directly via script:

```bash
node .claude-plugins/cross-platform-plugin/scripts/lib/governance/run-audit.js \
  --object Account \
  --scope full \
  --org production \
  --input ./reports/account-export.json
```

## Configuration

```bash
# Set default scope
export DQ_AUDIT_SCOPE=full

# Set output format
export DQ_AUDIT_FORMAT=markdown

# Enable verbose output
export DQ_AUDIT_VERBOSE=1
```

## Examples

### Audit accounts for duplicates
```bash
/data-quality-audit --object Account --scope full
```

### Quick health check before data migration
```bash
/data-quality-audit --scope quick --output report
```

### Generate action items for data steward
```bash
/data-quality-audit --output actions --format json
```
