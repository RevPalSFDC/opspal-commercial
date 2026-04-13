---
name: data-quality-operations-framework
description: Continuous Salesforce data-quality operations for field population monitoring, integration health checks, null handling governance, and anomaly response. Use when running recurring data-quality management rather than one-time readiness checks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Data Quality Operations Framework

## When to Use This Skill

Use this skill when:
- Running recurring data-quality checks on Salesforce data (not one-time audits)
- Monitoring field population rates across critical objects
- Investigating data anomalies (sudden null spikes, duplicate surges, integration drift)
- Setting up continuous data-quality health monitoring
- Managing null-handling policies for required vs optional fields

**Not for**: One-time preflight environment checks (use `operations-readiness-framework`), deduplication operations (use `/dedup`), or field metadata dependencies (use `field-metadata-dependency-matrix-integrity-framework`).

## Key Quality Metrics

| Metric | Query | Target |
|--------|-------|--------|
| Field population rate | `SELECT COUNT(Id) FROM Account WHERE Industry != null` / `SELECT COUNT(Id) FROM Account` | >90% for critical fields |
| Duplicate rate | Count records with matching email/domain | <2% |
| Orphan records | `SELECT COUNT(Id) FROM Contact WHERE AccountId = null` | 0 for B2B orgs |
| Stale records | `SELECT COUNT(Id) FROM Lead WHERE LastActivityDate < LAST_N_DAYS:180` | Monitor trend |
| Integration sync health | Compare record counts across platforms | <1% variance |

## Workflow

### Step 1: Baseline Quality Metrics

```bash
# Field population report for critical Account fields
sf data query --query "SELECT 
  COUNT(Id) total,
  COUNT(Industry) has_industry,
  COUNT(BillingState) has_state,
  COUNT(Website) has_website,
  COUNT(AnnualRevenue) has_revenue
  FROM Account" --target-org <org>
```

### Step 2: Monitor Field Population

Run population checks on a schedule. Flag fields that drop below threshold:
- **Critical fields** (>95%): Name, Email, Phone, Stage, Amount
- **Important fields** (>80%): Industry, Source, Territory, Owner
- **Nice-to-have fields** (>50%): Website, Description, Revenue

### Step 3: Null-Handling Governance

| Scenario | Policy | Action |
|----------|--------|--------|
| Required field is null on insert | Block | Validation rule |
| Required field null on existing records | Remediate | Bulk update campaign |
| Optional field null | Allow | Track in quality dashboard |
| Null from integration sync | Investigate | Check field mapping |

### Step 4: Anomaly Response

When quality metrics deviate from baseline by >10%, investigate:
1. Check recent data loads or integration syncs
2. Review validation rule changes that may have been deactivated
3. Identify the user or process responsible for the change
4. Remediate and restore baseline

## Routing Boundaries

Use this skill for ongoing quality operations.
Use `operations-readiness-framework` for preflight environment/readiness checks.

## References

- [field population operations](./field-population-operations.md)
- [integration health operations](./integration-health-operations.md)
- [null-handling governance](./null-handling-governance.md)
- [anomaly response loop](./anomaly-response-loop.md)
