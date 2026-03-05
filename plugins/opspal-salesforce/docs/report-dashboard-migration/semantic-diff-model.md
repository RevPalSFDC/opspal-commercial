# Report/Dashboard Semantic Diff Model

## Purpose

Detect semantic drift in Salesforce report/dashboard migrations even when deployment succeeds. This model compares pre/post metadata and optional runtime evidence to classify structural parity, semantic parity, and drift severity.

## Inputs

- **Pre-migration artifacts**: report metadata (fields, groupings, filters, formulas, buckets, row limits), dashboard metadata (components, source reports, filters).
- **Post-migration artifacts**: same as above.
- **Runtime evidence (optional)**: row counts and key totals for a fixed test window.
- **Org context (optional)**: field mapping and org-mode hints.

## Output Schema

```json
{
  "artifact": { "type": "report|dashboard", "preId": "", "postId": "" },
  "parity": { "structural": "pass|warn|fail", "semantic": "pass|warn|fail" },
  "driftScore": 0,
  "findings": [
    {
      "category": "metric_definition|filters_groupings|date_logic",
      "subtype": "formula_change|field_substitution|operator_change|relative_date_change|grouping_order_change|bucket_change|null_handling_change",
      "before": { "path": "", "value": "" },
      "after": { "path": "", "value": "" },
      "impactHypothesis": "what business meaning likely changed",
      "severity": "low|medium|high|critical",
      "detectability": "metadata_only|requires_runtime_sample|requires_user_intent",
      "recommendedGuardrail": "block|require_review|log_only",
      "suggestedFix": "actionable remediation"
    }
  ],
  "evidence": {
    "runtimeComparison": {
      "testWindow": "",
      "rowCountDeltaPct": 0,
      "keyTotalsDeltaPct": 0,
      "notes": ""
    }
  }
}
```

## CLI Usage

```bash
# Reports
node scripts/lib/report-dashboard-semantic-diff.js \
  --type report \
  --pre /path/to/pre.report-meta.xml \
  --post /path/to/post.report-meta.xml \
  --format json \
  --evidence /path/to/runtime-evidence.json \
  --mapping /path/to/field-mapping.json

# Dashboards
node scripts/lib/report-dashboard-semantic-diff.js \
  --type dashboard \
  --pre /path/to/pre.dashboard-meta.xml \
  --post /path/to/post.dashboard-meta.xml
```

## Runtime Evidence JSON (Optional)

```json
{
  "testWindow": "Q4 FY2024",
  "pre": { "rowCount": 1240, "keyTotals": 5100000 },
  "post": { "rowCount": 980, "keyTotals": 4700000 },
  "notes": "Same running user, same date filter"
}
```

## Drift Scoring

- **Low**: 10 points
- **Medium**: 25 points
- **High**: 45 points
- **Critical**: 70 points

Runtime evidence can add additional drift score weight:

- Row count delta >= 10% -> +15
- Row count delta >= 30% -> +30
- Key totals delta >= 5% -> +20
- Key totals delta >= 15% -> +40

## Semantic Parity Gate

Use the semantic diff output alongside quality parity benchmarking:

- **Structural parity**: layout/format differences.
- **Semantic parity**: meaning preservation.
- **DriftScore**: composite severity + runtime deltas.

Recommended enforcement is warn-only unless governance tier or explicit instructions require blocking.
