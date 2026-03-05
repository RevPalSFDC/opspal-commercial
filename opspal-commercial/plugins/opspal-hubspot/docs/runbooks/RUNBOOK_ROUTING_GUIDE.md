# HubSpot Data Quality Runbook - Routing Guide

**Version**: 1.0.0
**Last Updated**: 2026-01-06
**Purpose**: Quick reference for finding the right runbook for your task

---

## Quick Routing Table

| If you need to... | Use Runbook | File |
|-------------------|-------------|------|
| **Validate data entry** (prevent invalid emails, bad phone numbers) | **01** | `data-quality/01-property-validation-fundamentals.md` |
| **Enforce required fields** (conditional requirements like "If USA, state required") | **01** | `data-quality/01-property-validation-fundamentals.md` |
| **Migrate Salesforce validation rules** | **01** | `data-quality/01-property-validation-fundamentals.md` |
| **Measure data completeness** (% of records with values) | **02** | `data-quality/02-property-population-monitoring.md` |
| **Monitor fill rates** (track which properties are empty) | **02** | `data-quality/02-property-population-monitoring.md` |
| **Trigger remediation workflows** (auto-assign tasks when data missing) | **02** | `data-quality/02-property-population-monitoring.md` |
| **Monitor Salesforce sync health** (API usage, errors, suspensions) | **03** | `data-quality/03-integration-health-checks.md` |
| **Check Stripe integration** (Data Sync vs Payment Processing) | **03** | `data-quality/03-integration-health-checks.md` |
| **Detect field mapping drift** (Salesforce integration changes) | **03** | `data-quality/03-integration-health-checks.md` |
| **Deploy data enrichment** (Breeze Intelligence, ZoomInfo, Clearbit) | **04** | `data-quality/04-data-enrichment-strategies.md` |
| **Implement mastering rules** (which vendor wins for each property) | **04** | `data-quality/04-data-enrichment-strategies.md` |
| **Manage HubSpot Credits** (governance, circuit breakers) | **04** | `data-quality/04-data-enrichment-strategies.md` |
| **Merge duplicate contacts** | **05** | `data-quality/05-duplicate-detection-deduplication.md` |
| **Merge duplicate companies** (with Salesforce integration constraints) | **05** | `data-quality/05-duplicate-detection-deduplication.md` |
| **Prevent API-created duplicates** (integration upsert patterns) | **05** | `data-quality/05-duplicate-detection-deduplication.md` |
| **Recover from accidental merge** (unmerge mitigation) | **05** | `data-quality/05-duplicate-detection-deduplication.md` |

---

## Routing by Issue Type

### Data Entry Problems

| Issue | Runbook | Pattern |
|-------|---------|---------|
| Users entering invalid emails | 01 | Property validation rule (regex) |
| Phone numbers inconsistent format | 01 | Phone normalization pattern |
| Users bypassing required fields | 01 | Workflow post-save validation |
| Forms creating duplicates | 05 | Front-door hygiene pattern |

### Data Completeness Problems

| Issue | Runbook | Pattern |
|-------|---------|---------|
| MQLs missing phone numbers | 02 | Completeness-gated workflow |
| New imports degrading quality | 02 | Import baseline comparison |
| Critical properties empty | 02 | Missing critical fields segment |
| Unknown completeness trend | 02 | Snapshot-based trending |

### Integration Problems

| Issue | Runbook | Pattern |
|-------|---------|---------|
| Salesforce sync suspended | 03 | Incident response workflow |
| Stripe subscriptions not syncing | 03 | Enterprise gating check + tier validation |
| LinkedIn token expired | 03 | OAuth token reauthorization |
| Field mapping broke workflows | 03 | Field mapping drift detection |

### Enrichment Problems

| Issue | Runbook | Pattern |
|-------|---------|---------|
| Enrichment overwriting good data | 04 | Property-level mastering policy + lock fields |
| Credits exhausted mid-month | 04 | Credits circuit breaker (pause at 80%) |
| Need firmographics for leads | 04 | Native enrichment (Breeze Intelligence) |
| GDPR concern about enrichment | 04 | GDPR-safe enrichment gating |

### Duplicate Problems

| Issue | Runbook | Pattern |
|-------|---------|---------|
| Multiple contacts same email | 05 | Canonical selection + merge |
| Cannot merge companies (Salesforce sync) | 05 | Salesforce integration workaround (delete in HS, merge in SF) |
| API creating duplicate companies | 05 | Integration-safe upsert (idProperty) |
| Accidental merge needs reversal | 05 | Unmerge mitigation (additional email/domain) |

---

## Routing by Agent

| Agent | Primary Runbooks | Use Cases |
|-------|------------------|-----------|
| `hubspot-data-hygiene-specialist` | All 5 runbooks | Comprehensive data quality operations |
| `hubspot-property-manager` | 01, 02, 04 | Property creation with validation |
| `hubspot-workflow-builder` | 01, 02, 03, 04, 05 | Validation workflows, remediation, circuit breakers |
| `hubspot-integration-specialist` | 03, 04, 05 | Integration health monitoring |
| `hubspot-analytics-reporter` | 02, 03, 04 | Completeness reporting, SLO dashboards |

---

## Routing by Lifecycle Stage

### Planning Phase
- **Runbook 01**: Define validation requirements
- **Runbook 02**: Define completeness targets (SLAs)
- **Runbook 04**: Define enrichment strategy and mastering policy

### Implementation Phase
- **Runbook 01**: Create property validation rules
- **Runbook 02**: Build completeness monitoring workflows
- **Runbook 03**: Configure integration health monitoring
- **Runbook 04**: Deploy enrichment automation
- **Runbook 05**: Implement dedupe prevention controls

### Operations Phase
- **Runbook 02**: Monitor completeness dashboards
- **Runbook 03**: Respond to sync incidents
- **Runbook 05**: Execute weekly/monthly dedupe cleanup

### Optimization Phase
- **Runbook 02**: Measure completeness trends, identify gaps
- **Runbook 04**: Measure enrichment ROI, optimize vendor selection
- **Runbook 05**: Analyze duplicate sources, implement prevention

---

## Common Workflows (Multi-Runbook)

### New Portal Setup
1. **Runbook 01**: Establish validation rules
2. **Runbook 02**: Baseline completeness measurement
3. **Runbook 03**: Configure integration monitoring
4. **Runbook 05**: Dedupe existing data

### Data Quality Audit
1. **Runbook 02**: Measure current completeness
2. **Runbook 01**: Audit validation coverage
3. **Runbook 05**: Quantify duplicate rate
4. **Runbook 03**: Check integration health

### Enrichment Deployment
1. **Runbook 02**: Measure pre-enrichment completeness (baseline)
2. **Runbook 04**: Deploy enrichment with mastering policy
3. **Runbook 02**: Measure post-enrichment completeness (ROI)
4. **Runbook 03**: Monitor enrichment integration health

### Salesforce Migration
1. **Runbook 01**: Map SF validation rules to HS equivalents
2. **Runbook 03**: Configure Salesforce sync monitoring
3. **Runbook 05**: Handle company merge restrictions (SF integration)
4. **Runbook 02**: Monitor cross-platform data completeness

---

## Decision Trees

### "My data quality is bad - where do I start?"

```
1. Is data missing or incomplete?
   YES → Runbook 02 (measure completeness)
   NO → Go to 2

2. Is invalid data entering the system?
   YES → Runbook 01 (validation rules)
   NO → Go to 3

3. Do you have duplicates?
   YES → Runbook 05 (deduplication)
   NO → Go to 4

4. Are integrations failing?
   YES → Runbook 03 (integration health)
   NO → Go to 5

5. Need to fill data gaps?
   YES → Runbook 04 (enrichment)
   NO → Your data quality may already be good!
```

### "Which runbook for my Salesforce sync issue?"

```
1. What's the symptom?
   - Sync suspended / API limits → Runbook 03 (incident response)
   - Field mapping changed → Runbook 03 (drift detection)
   - Cannot merge companies → Runbook 05 (SF integration constraints)
   - Validation rules to migrate → Runbook 01 (cross-platform validation)
   - Data completeness differs → Runbook 02 (cross-platform completeness)
```

---

## Quick Reference Cards

### Critical Gotchas by Runbook

| Runbook | Top 3 Gotchas |
|---------|---------------|
| **01** | 1. Validation NOT enforced by workflows<br>2. Unique rules NOT enforced by forms<br>3. Required fields NOT universal (UI/API only) |
| **02** | 1. Search API 10k cap (use time-slicing)<br>2. Numeric 0 = "known" (not unknown)<br>3. Workflow enrollment cap (100k/day sandbox) |
| **03** | 1. SF company merge blocked (UI restriction)<br>2. API-created companies NOT auto-deduped<br>3. Token expiry requires manual reauth |
| **04** | 1. Enrichment can overwrite good data (use lock fields)<br>2. Credits don't rollover (monthly reset)<br>3. Continuous mode stops after user/system edit |
| **05** | 1. Merge creates NEW record ID (Jan 2025 change)<br>2. Cannot unmerge (irreversible)<br>3. 250-merge participation limit |

### Common Patterns by Runbook

| Runbook | Most Used Patterns |
|---------|-------------------|
| **01** | - Regex validation for emails/phones<br>- Workflow post-save validation<br>- Conditional required fields |
| **02** | - Completeness scoring (0-100)<br>- Time-sliced search (bypass 10k)<br>- Workflow remediation |
| **03** | - Layered SLO model (5 types)<br>- Circuit breaker workflows<br>- Field mapping drift detection |
| **04** | - Property-level mastering policy<br>- Credits circuit breaker (80% pause)<br>- GDPR-safe gating |
| **05** | - Canonical selection algorithm<br>- Pre-merge normalization<br>- Integration-safe upsert |

---

## Feedback & Updates

**Found a missing pattern?** Submit feedback via `/reflect` command.

**Runbook updates**: Check `README.md` for version history and update frequency.

**Need help?** Contact RevPal support or check GitHub Issues.

---

**Version**: 1.0.0
**Last Updated**: 2026-01-06
**Maintained By**: RevPal Data Quality Team
