# Metric Ontology Governance

> **Version**: 1.0.0
> **Last Updated**: 2026-01-15
> **Schema Version**: 1.4.0
> **Related Files**:
> - `config/metric-definitions.json` - Canonical metric definitions
> - `config/persona-kpi-contracts.json` - Persona-to-metric mapping
> - `config/decision-kpi-matrix.json` - Decision-driven KPI requirements

## Overview

The Metric Ontology provides canonical definitions for revenue, pipeline, and operational metrics used across Salesforce reports and dashboards. This governance document establishes:

1. **Metric tiers** - Core vs Extension vs Custom
2. **Introduction process** - How to add new metrics
3. **Versioning rules** - Backward compatibility guarantees
4. **Sprawl prevention** - Keeping the ontology focused

---

## Metric Classification Tiers

### Tier 1: Core Metrics (Locked)

Core metrics are the foundation of the ontology. They are **locked** and cannot be modified without a major version bump.

| Metric ID | Category | Status |
|-----------|----------|--------|
| `pipeline.arr` | Pipeline | Locked |
| `pipeline.tcv` | Pipeline | Locked |
| `pipeline.weighted` | Pipeline | Locked |
| `bookings.tcv` | Bookings | Locked |
| `bookings.acv` | Bookings | Locked |
| `revenue.recognized` | Revenue | Locked |
| `arr.subscription` | ARR | Locked |
| `acv.contract` | ACV | Locked |
| `tcv.contract` | TCV | Locked |
| `win_rate.count` | Performance | Locked |
| `win_rate.value` | Performance | Locked |
| `sales_cycle_length.won` | Performance | Locked |

**Rules for Core Metrics:**
- No field mapping changes without major version
- No calculation formula changes
- No category reclassification
- Only additive changes (new highRiskPatterns, new labelHints)

### Tier 2: Extension Metrics (Approved)

Extension metrics are officially supported additions that have passed review.

| Metric ID | Category | Status | Added In |
|-----------|----------|--------|----------|
| `quota_attainment` | Performance | Approved | v1.4.0 |
| `forecast_accuracy` | Performance | Approved | v1.4.0 |
| `stage_conversion_rate` | Performance | Approved | v1.4.0 |
| `renewal_rate` | Retention | Approved | v1.4.0 |
| `gross_churn` | Retention | Approved | v1.4.0 |
| `net_revenue_retention` | Retention | Approved | v1.4.0 |
| `logo_churn` | Retention | Approved | v1.4.0 |

**Rules for Extension Metrics:**
- Follow the Introduction Process below
- Subject to revision in minor versions
- May be promoted to Core in major versions
- Deprecation requires 2 minor versions notice

### Tier 3: Custom Metrics (Org-Specific)

Custom metrics are organization-specific definitions not tracked in the central ontology.

**Examples:**
- `partner_influenced_pipeline` (org-specific attribution model)
- `net_30_collection_rate` (org-specific payment terms)
- `customer_health_score` (proprietary formula)

**Rules for Custom Metrics:**
- Not version-controlled centrally
- Should be documented in org runbooks
- May conflict with Core/Extension definitions
- Not eligible for cross-org reports

---

## Metric Introduction Process

### Step 1: RFC (Request for Comment)

Submit a metric proposal with:

```yaml
metric_rfc:
  proposed_id: "metric_name"
  category: "Pipeline|Bookings|Revenue|ARR|ACV|TCV|Performance|Retention"
  description: "What this metric measures and why it's needed"
  calculation: "SUM(field) WHERE conditions / COUNT(*) WHERE conditions"
  field_roles:
    primary_field:
      required: true
      preferred_fields: ["Field1__c", "Field2__c"]
      label_hints: ["common", "label", "variations"]
    secondary_field:
      required: false
      preferred_fields: ["Field3__c"]
  high_risk_patterns:
    - "Common mistake that produces wrong results"
  requesting_personas:
    - "cro"
    - "revops"
  decision_support:
    - "What decision does this metric help make?"
  similar_existing_metrics:
    - "metric_id that could be confused with this"
  differentiation: "Why this can't be derived from existing metrics"
```

### Step 2: Review Criteria

RFCs are evaluated against:

| Criteria | Weight | Passing Score |
|----------|--------|---------------|
| **Uniqueness** - Not derivable from existing metrics | 25% | ≥80% |
| **Decision Support** - Links to specific decisions | 25% | ≥70% |
| **Field Mapping Clarity** - Unambiguous field roles | 20% | ≥90% |
| **Risk Documentation** - High-risk patterns identified | 15% | ≥70% |
| **Persona Demand** - Multiple personas require it | 15% | ≥2 personas |

**Minimum passing total: 75%**

### Step 3: Trial Period

Approved metrics enter a 90-day trial:
- Implemented as Extension metric
- Monitored for usage patterns
- Field mappings validated against real orgs
- High-risk patterns expanded based on observed errors

### Step 4: Promotion or Rejection

After trial:
- **Promote**: Move to permanent Extension status
- **Revise**: Modify definition based on feedback, restart trial
- **Reject**: Document learnings, remove from ontology

---

## Versioning Rules

### Semantic Versioning

The metric ontology follows semver: `MAJOR.MINOR.PATCH`

| Version Type | When to Bump | Examples |
|--------------|--------------|----------|
| **MAJOR** | Breaking changes to Core metrics | Change win_rate.count formula |
| **MINOR** | New Extension metrics, non-breaking changes | Add quota_attainment |
| **PATCH** | Bug fixes, documentation, labelHints | Fix typo in highRiskPatterns |

### Backward Compatibility Guarantees

| Change Type | Guarantee |
|-------------|-----------|
| Core metric field mapping | Never changes within major version |
| Core metric calculation | Never changes within major version |
| Extension metric field mapping | Stable within minor version |
| labelHints additions | Always backward compatible |
| highRiskPatterns additions | Always backward compatible |
| New metric addition | Always backward compatible |

### Deprecation Process

1. **Announce**: Mark metric with `deprecated: true` and `deprecatedIn: "x.y.z"`
2. **Grace Period**: 2 minor versions minimum
3. **Remove**: Only in major version bump
4. **Migration**: Provide mapping to replacement metric

**Deprecation annotation:**
```json
{
  "metricId": "old_metric",
  "deprecated": true,
  "deprecatedIn": "1.5.0",
  "removalPlanned": "2.0.0",
  "replacedBy": "new_metric",
  "migrationNotes": "Rename field mappings and update filters"
}
```

---

## Sprawl Prevention

### Metric Count Thresholds

| Tier | Max Count | Current | Status |
|------|-----------|---------|--------|
| Core | 15 | 12 | Healthy |
| Extension | 20 | 7 | Healthy |
| Custom (per org) | 10 | N/A | Monitored |

**Alerts:**
- Core > 12: Requires governance review before additions
- Extension > 15: Prioritize promotion or retirement
- Custom > 10: Flag for consolidation review

### Anti-Sprawl Rules

1. **No synonyms**: If a metric can be expressed as a variant, use variants
   ```json
   "win_rate": {
     "variants": {
       "count": { "calculation": "COUNT(Won) / COUNT(*)" },
       "value": { "calculation": "SUM(Amount WHERE Won) / SUM(Amount)" }
     }
   }
   ```

2. **No segment-specific metrics**: Use filters, not new metrics
   - **Bad**: `enterprise_pipeline`, `smb_pipeline`, `commercial_pipeline`
   - **Good**: `pipeline.arr` with segment filter

3. **No calculated combos**: Derived metrics should be calculated, not defined
   - **Bad**: `ltv_cac_ratio` as separate metric
   - **Good**: Calculate from `ltv` and `cac` at query time

4. **Consolidation reviews**: Quarterly review of metric usage
   - Metrics with <10% usage across orgs → deprecation candidate
   - Metrics with >80% overlap → consolidation candidate

### Similarity Detection

Before adding new metrics, check for similarity:

```bash
# Check if proposed metric is too similar to existing
node scripts/lib/metric-similarity-checker.js \
  --proposed "renewal_pipeline" \
  --threshold 0.7
```

Similarity factors:
- Field role overlap (>70% same fields)
- Calculation overlap (same aggregation, similar filters)
- Label similarity (Levenshtein distance <3)

---

## Metric Registry Structure

### Required Fields

```json
{
  "metricId": "unique_identifier",
  "metricName": "Human Readable Name",
  "category": "one of: Pipeline|Bookings|Revenue|ARR|ACV|TCV|Performance|Retention",
  "tier": "one of: core|extension|custom",
  "baseObject": "Salesforce object (e.g., Opportunity)",
  "calculation": {
    "aggregation": "SUM|COUNT|AVG|MAX|MIN",
    "formula": "Optional formula description"
  },
  "fieldRoles": {
    "roleName": {
      "required": true,
      "preferredFields": ["Field1__c", "Field2__c"],
      "alternativeFields": ["Field3__c"],
      "labelHints": ["common", "variations"]
    }
  },
  "recommendedFilters": {
    "filterName": {
      "field": "FieldName",
      "operator": "equals|in|not equals",
      "value": "expected value"
    }
  },
  "highRiskPatterns": [
    "Description of common mistake"
  ]
}
```

### Optional Fields

```json
{
  "deprecated": false,
  "deprecatedIn": null,
  "replacedBy": null,
  "addedIn": "1.4.0",
  "variants": {},
  "relatedMetrics": [],
  "governanceTier": "Tier0|Tier1|Tier2|Tier3",
  "dataQualityRequirements": {
    "minCompletionRate": 0.95,
    "requiredFields": []
  }
}
```

---

## Enforcement Mechanisms

### Pre-Report Validation

Reports are validated against the ontology:

```bash
node scripts/lib/report-semantic-validator.js \
  --report MyReport.json \
  --strict
```

Checks:
- Field mappings match canonical definitions
- Filters align with recommendedFilters
- No highRiskPatterns detected in configuration

### Metric Drift Detection

During migration or modification:

```bash
node scripts/lib/report-dashboard-semantic-diff.js \
  --pre original.json \
  --post modified.json
```

Flags:
- Metric type changed (e.g., ARR → TCV)
- Calculation altered (e.g., SUM → COUNT)
- Critical filter removed

### Governance Reporting

Monthly governance report:

```bash
node scripts/lib/metric-governance-reporter.js \
  --output monthly-report.json
```

Includes:
- Metric count by tier
- New additions this period
- Deprecation candidates
- Similarity warnings
- Usage statistics

---

## Roles & Responsibilities

### Metric Steward

- Reviews and approves RFCs
- Manages deprecation process
- Monitors sprawl metrics
- Conducts quarterly reviews

### Report Developers

- Follow ontology definitions
- Report field mapping issues
- Propose new metrics via RFC
- Update reports when metrics deprecated

### RevOps/Analytics Teams

- Validate metric calculations match business definitions
- Identify high-risk pattern candidates
- Provide usage feedback
- Champion consolidation efforts

---

## Migration from Custom to Extension

If an org has custom metrics that should be standardized:

### 1. Document Current State

```yaml
custom_metric_audit:
  org: "example_org"
  custom_metrics:
    - id: "org_specific_pipeline"
      calculation: "SUM(ARR__c) WHERE StageName NOT IN ('Closed Lost')"
      usage: "15 reports, 3 dashboards"
      personas: ["cro", "vp_sales"]
```

### 2. Map to Ontology

| Custom Metric | Maps To | Difference |
|---------------|---------|------------|
| `org_specific_pipeline` | `pipeline.arr` | Filter variation |
| `win_rate_by_count` | `win_rate.count` | Exact match |
| `customer_health` | N/A - org-specific | Keep as custom |

### 3. Migration Plan

For each custom metric:
- **Exact match**: Rename to canonical ID
- **Filter variation**: Use canonical ID + filter annotation
- **Unique logic**: Submit RFC or keep as custom

---

## Appendix: Decision Matrix for New Metrics

```
┌─────────────────────────────────────────────────────────┐
│ "Should this be a new metric?"                          │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ Can it be expressed as existing metric + filter?         │
│ (e.g., pipeline.arr WHERE Segment = 'Enterprise')       │
├─────────────────────────────────────────────────────────┤
│ YES → Use existing metric with filter. NO new metric.   │
│ NO → Continue ↓                                         │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ Can it be expressed as variant of existing metric?       │
│ (e.g., win_rate.count vs win_rate.value)                │
├─────────────────────────────────────────────────────────┤
│ YES → Add as variant to existing metric definition.     │
│ NO → Continue ↓                                         │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ Can it be calculated from existing metrics at runtime?  │
│ (e.g., LTV/CAC ratio from ltv and cac)                  │
├─────────────────────────────────────────────────────────┤
│ YES → Document as calculated metric, not defined.       │
│ NO → Continue ↓                                         │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ Is this org-specific or universally applicable?          │
├─────────────────────────────────────────────────────────┤
│ ORG-SPECIFIC → Keep as Custom (Tier 3). Document in     │
│                org runbook. Do not add to ontology.     │
│ UNIVERSAL → Submit RFC for Extension metric ↓           │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ RFC Process: Propose → Review → Trial → Approve/Reject  │
└─────────────────────────────────────────────────────────┘
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-15 | Initial governance framework |
