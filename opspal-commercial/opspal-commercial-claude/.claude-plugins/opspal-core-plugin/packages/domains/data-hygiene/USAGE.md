# Data Hygiene Plugin - Usage Guide

**Version**: 1.0.0
**Last Updated**: 2025-11-24

## Quick Start

```bash
# Install
/plugin marketplace add RevPalSFDC/opspal-plugin-internal-marketplace
/plugin install data-hygiene-plugin@revpal-internal-plugins

# Verify
/plugin list | grep data-hygiene
```

## Primary Command

### `/dedup-companies`

Cross-platform Company/Account deduplication for HubSpot and Salesforce.

```bash
# ALWAYS start with dry-run
/dedup-companies --dry-run

# Review outputs:
# - bundles.json (duplicate clusters)
# - actions.csv (proposed plan)
# - skipped_or_manual.csv (manual review items)

# Execute after approval
/dedup-companies --execute
```

## 6-Phase Workflow

| Phase | Purpose | Output |
|-------|---------|--------|
| **0** | Safety & Freeze | Snapshots, baseline report |
| **1** | Clustering | bundles.json, conflicts |
| **2** | Canonical Selection | canonical-map.json |
| **3** | Execution | execution-report.json |
| **2.5** | Association Repair | repair-report.json |
| **4** | Guardrails | compliance-report.json |

## Common Workflows

### Standard Deduplication

```bash
# 1. Verify prerequisites
# - Auto-associate OFF in HubSpot (CRITICAL)
# - API tokens configured
# - Snapshot storage ready

# 2. Dry run
/dedup-companies --dry-run

# 3. Review reports (manual)
cat dedup-reports/bundles.json | jq '.clusters | length'
cat dedup-reports/actions.csv

# 4. Execute
/dedup-companies --execute

# 5. Verify
cat dedup-reports/association-repair-report-*.json
```

### Resume Failed Operation

```bash
# Check ledger status
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-ledger.js summary <prefix>

# List failed operations
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-ledger.js list <prefix> failed

# Resume (skips completed)
/dedup-companies --resume <prefix>
```

### Rollback

```bash
# List checkpoints
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-rollback-manager.js list

# Restore
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-rollback-manager.js restore <checkpoint-id>
```

## Critical Prerequisites

### 1. Disable Auto-Associate in HubSpot

**MANDATORY before execution:**

1. HubSpot Settings → Objects → Companies
2. Find "Auto-associate companies"
3. **Turn OFF**
4. Re-enable after completion (optional)

### 2. Environment Variables

```bash
# HubSpot
export HUBSPOT_PRIVATE_APP_TOKEN="pat-xxx"
export HUBSPOT_PORTAL_ID="12345678"

# Salesforce
export SALESFORCE_INSTANCE_URL="https://yourorg.my.salesforce.com"
export SALESFORCE_ACCESS_TOKEN="xxx"
export SALESFORCE_ORG_ALIAS="production"
```

### 3. Configuration File (Optional)

```bash
# Generate template
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-config-loader.js template > dedup-config.json

# Validate
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-config-loader.js validate dedup-config.json
```

## Output Files

| File | Description |
|------|-------------|
| `bundles.json` | Duplicate clusters with metadata |
| `actions.csv` | Detailed execution plan |
| `skipped_or_manual.csv` | Manual review items |
| `execution-report.json` | Phase 3 results |
| `association-repair-report-*.json` | Phase 2.5 PRIMARY repair results |
| `validation-report.json` | Post-execution validation |
| `snapshot-*.json` | Pre-execution backup |
| `ledger-*.json` | Idempotency tracking |

## Canonical Selection Scoring

| Factor | Points | Description |
|--------|--------|-------------|
| Has SF Account ID | 100 | Salesforce-synced companies preferred |
| Sync Health | 50 | Recent sync + valid source |
| Contact Count | 40 | Normalized by cluster |
| Deal Count | 25 | Normalized by cluster |
| Has Owner | 10 | Owner assigned |
| Age | 5 | Older records preferred |
| **Total** | **230** | Highest score = canonical |

## Troubleshooting

### New Duplicates Appearing

**Cause**: Auto-associate still ON
**Fix**: Verify OFF in HubSpot Settings → Objects → Companies

### "Cannot merge companies with active SF sync"

**Cause**: Both companies have `salesforceaccountid`
**Fix**: Agent automatically uses lift-and-shift strategy

### Contacts Not Showing on Company

**Cause**: Missing PRIMARY (Type 1) association
**Fix**: Run Phase 2.5 association repair:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-association-repair.js \
  ./dedup-reports/canonical-map-*.json \
  ./dedup-config.json \
  --execute
```

### Partial Execution

**Fix**: Resume using idempotency ledger:
```bash
/dedup-companies --resume <prefix>
```

## Best Practices

### Before
- [ ] Test in sandbox first
- [ ] Run dry-run and review all reports
- [ ] Verify auto-associate OFF
- [ ] Backup Salesforce data
- [ ] Get stakeholder approval

### During
- [ ] Start with small batch (10-25)
- [ ] Monitor execution logs
- [ ] Watch for rate limit warnings

### After
- [ ] Run Phase 2.5 (MANDATORY)
- [ ] Verify ≥95% repair success
- [ ] Spot-check samples
- [ ] Monitor 7 days
- [ ] Keep snapshots 30 days

## API Rate Limits

- **HubSpot**: 100 req/10s (configurable)
- **Salesforce**: Respects org limits
- **Retry**: Exponential backoff automatic

---

**Documentation**: See README.md for detailed feature documentation.
