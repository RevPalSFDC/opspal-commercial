---
description: Duplicate detection wizard for Attio records
argument-hint: "[--object=people|companies] [--dry-run]"
---

# /attio-dedup

Run duplicate detection across Attio people or company records.

## Usage

```
/attio-dedup [--object=people|companies] [--dry-run]
```

## Overview

The dedup command operates in two phases:

1. **Scan** — Detect duplicate candidates using `record-dedup-detector.js`
2. **Report** — Output duplicate clusters with confidence scores and recommended actions

Runs in dry-run mode by default. No records are modified unless explicitly confirmed.

> **Note**: Attio does not expose a merge API. Auto-merge is not supported. The output provides structured duplicate clusters so your team can review and merge manually inside the Attio UI.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--object` | `people` | Object type to scan: `people` or `companies` |
| `--dry-run` | `true` | Report duplicates without modifying records |

## Matching Logic

### People
- Matched by: **email address** (exact), then **full name** (normalized)
- Confidence scoring based on field overlap and match quality

### Companies
- Matched by: **domain** (exact), then **company name** (normalized/fuzzy)
- Confidence scoring based on domain match + name similarity

## Output

Duplicate clusters are written to `workspaces/{name}/assessments/dedup-{timestamp}.json` and printed as a summary table:

```
Cluster 1 (confidence: 0.97)
  Record A: Alice Johnson <alice@acme.com>  [id: rec_abc123]
  Record B: Alice Johnson <alice.johnson@acme.com>  [id: rec_def456]
  Recommendation: review — email domains differ

Cluster 2 (confidence: 1.00)
  Record A: Acme Corp  [domain: acme.com, id: rec_ghi789]
  Record B: ACME Corp  [domain: acme.com, id: rec_jkl012]
  Recommendation: high-confidence duplicate
```

## Agent Delegation

This command delegates to the `attio-data-hygiene-specialist` agent for scan orchestration and report generation.

## Examples

### Scan People (Dry Run)
```
/attio-dedup --object=people
```

### Scan Companies
```
/attio-dedup --object=companies
```

## Security Notes

- No records are auto-merged; all changes require manual action in the Attio UI
- Output files are written locally and gitignored
