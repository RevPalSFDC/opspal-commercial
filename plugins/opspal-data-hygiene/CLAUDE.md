# Data Hygiene Plugin - User Guide

## DEPRECATED

opspal-data-hygiene is deprecated as of v1.2.2. Use the following replacements:
- **Deduplication**: `opspal-core` `/deduplicate` or `opspal-salesforce` `/dedup`
- **HubSpot data hygiene**: `opspal-hubspot` `/hsdedup` or `hubspot-data-hygiene-specialist` agent
- **Salesforce dedup**: `opspal-salesforce` `/dedup` or `sfdc-dedup-safety-copilot` agent
- **Company merge**: `opspal-hubspot` `hubspot-company-merge-strategy` skill

To uninstall: `/plugin uninstall opspal-data-hygiene`

---

This file provides guidance when using the Data Hygiene Plugin with Claude Code.

## Plugin Overview

The **Data Hygiene Plugin** provides cross-platform data deduplication and hygiene management for HubSpot and Salesforce. It eliminates Company/Account duplicates, prevents their recurrence, and ensures zero data loss through comprehensive validation and rollback capabilities.

**Version**: 1.0.1
**Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

## Quick Start

### Installation

```bash
/plugin marketplace add RevPalSFDC/opspal-internal-plugins
/plugin install opspal-data-hygiene@revpal-internal-plugins
```

### Verify Installation

```bash
/plugin list | grep data-hygiene
```

## Key Features

### Validation Framework (NEW)

**Comprehensive validation system preventing errors in data hygiene operations**

The Validation Framework provides automatic error prevention through 5 validation stages:

1. **Schema Validation** - Validates deduplication data structure against JSON schemas
2. **Parse Error Handling** - Auto-fixes JSON/CSV parsing issues in bundles/actions
3. **Data Quality** - Detects synthetic/duplicate data patterns (4-layer scoring)
4. **Tool Contract** - Validates HubSpot/Salesforce API calls before execution
5. **Permission Validation** - Checks bulk merge/delete operations

**Automatic Hooks** (already enabled):
- `pre-reflection-submit.sh` - Validates reflections before submission
- `pre-tool-execution.sh` - Validates data hygiene tool calls

**Quick Commands**:
```bash
# Generate validation dashboard
node ../opspal-core/scripts/lib/validation-dashboard-generator.js generate --days 30

# Test data quality validation (for duplicate detection)
node ../salesforce-plugin/scripts/lib/enhanced-data-quality-framework.js validate \
  --query-result ./bundles.json

# Temporarily disable validation
export SKIP_VALIDATION=1              # All validation
export SKIP_TOOL_VALIDATION=1         # Tool validation only
```

**Documentation**: See `../../docs/VALIDATION_FRAMEWORK_GUIDE.md` for complete guide

**Performance**:
- <500ms total validation time
- <100ms data quality check for bundles
- 95%+ pass rate for legitimate operations

**Common Validations**:
- ✅ Auto-associate OFF requirement (HubSpot)
- ✅ API token configuration checks
- ✅ Canonical selection scoring validation
- ✅ Association repair prerequisites (≥95% success)
- ✅ Salesforce sync strategy validation
- ✅ Bulk operation limits (300 req/10s HubSpot)
- ✅ Idempotency ledger validation

### 6-Phase Deduplication Workflow

| Phase | Purpose | Output |
|-------|---------|--------|
| **0** | Safety & Freeze | Snapshots, baseline report |
| **1** | Clustering | bundles.json, conflicts |
| **2** | Canonical Selection | canonical-map.json |
| **3** | Execution | execution-report.json |
| **2.5** | Association Repair | repair-report.json |
| **4** | Guardrails | compliance-report.json |

### Data Safety

- Idempotency tracking for safe retry/resume
- Non-destructive reparenting before deletion
- Comprehensive snapshot and rollback capability
- Dry-run mode for validation before execution

### Cross-Platform Intelligence

- Automatic SF sync detection and strategy selection
- Domain normalization for clustering
- Association preservation (Contacts, Deals, Opportunities)
- Rate limiting and API compliance

## Available Agent

### sfdc-hubspot-dedup-orchestrator

Master orchestrator for cross-platform Company/Account deduplication.

**Trigger keywords:**
- "dedup companies"
- "deduplicate"
- "merge duplicates"
- "clean up duplicates"
- "company hygiene"

## Primary Command

### `/dedup-companies`

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

## Critical Prerequisites

### 1. Disable Auto-Associate in HubSpot (MANDATORY)

Before running deduplication:

1. HubSpot Settings > Objects > Companies
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
node scripts/lib/dedup-ledger.js summary <prefix>

# List failed operations
node scripts/lib/dedup-ledger.js list <prefix> failed

# Resume (skips completed)
/dedup-companies --resume <prefix>
```

### Rollback

```bash
# List checkpoints
node scripts/lib/dedup-rollback-manager.js list

# Restore
node scripts/lib/dedup-rollback-manager.js restore <checkpoint-id>
```

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

## Best Practices

### Before Execution

- [ ] Test in sandbox first
- [ ] Run dry-run and review all reports
- [ ] Verify auto-associate OFF
- [ ] Backup Salesforce data
- [ ] Get stakeholder approval

### During Execution

- [ ] Start with small batch (10-25)
- [ ] Monitor execution logs
- [ ] Watch for rate limit warnings

### After Execution

- [ ] Run Phase 2.5 (MANDATORY)
- [ ] Verify ≥95% repair success
- [ ] Spot-check samples
- [ ] Monitor 7 days
- [ ] Keep snapshots 30 days

## Troubleshooting

### New Duplicates Appearing

**Cause**: Auto-associate still ON
**Fix**: Verify OFF in HubSpot Settings > Objects > Companies

### "Cannot merge companies with active SF sync"

**Cause**: Both companies have `salesforceaccountid`
**Fix**: Agent automatically uses lift-and-shift strategy

### Contacts Not Showing on Company

**Cause**: Missing PRIMARY (Type 1) association
**Fix**: Run Phase 2.5 association repair

### Partial Execution

**Fix**: Resume using idempotency ledger
```bash
/dedup-companies --resume <prefix>
```

## API Rate Limits

- **HubSpot**: 100 req/10s (configurable)
- **Salesforce**: Respects org limits
- **Retry**: Exponential backoff automatic

## Output Files

| File | Description |
|------|-------------|
| `bundles.json` | Duplicate clusters with metadata |
| `actions.csv` | Detailed execution plan |
| `skipped_or_manual.csv` | Manual review items |
| `execution-report.json` | Phase 3 results |
| `association-repair-report-*.json` | Phase 2.5 repair results |
| `validation-report.json` | Post-execution validation |
| `snapshot-*.json` | Pre-execution backup |
| `ledger-*.json` | Idempotency tracking |

## Documentation

- **README.md** - Detailed feature documentation
- **USAGE.md** - Quick-start guide
- **CHANGELOG.md** - Version history

## Support

- GitHub Issues: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- Reflection System: Use `/reflect` to submit feedback

---

**Version**: 1.0.1
**Last Updated**: 2025-11-25
