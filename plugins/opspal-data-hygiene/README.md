# Data Hygiene Plugin

> ⚠️ **DEPRECATED**: This plugin has been consolidated into `opspal-core`.
> Use `/dedup-companies` or `/deduplicate` commands from opspal-core instead.
>
> **Migration**: All functionality is available in `opspal-core/scripts/lib/deduplication/`

**Version**: 1.1.1 (deprecated)
**Status**: 🔴 DEPRECATED - Consolidated into opspal-core
**Plugin Type**: Cross-Platform (HubSpot + Salesforce)

## Overview

The Data Hygiene Plugin is a sophisticated cross-platform deduplication system that eliminates Company/Account duplicates between HubSpot and Salesforce, prevents their recurrence, and ensures zero data loss through comprehensive validation and rollback capabilities.

## Key Features

✅ **6-Phase Deduplication Workflow** (Enhanced Oct 2025)
- Phase 0: Safety & Freeze with comprehensive snapshots
- Phase 1: Intelligent clustering by SF Account ID and domain
- Phase 2: Weighted canonical selection algorithm with sync health scoring
- Phase 3: Safe execution with contact-bridge attachment
- Phase 2.5: **Association repair with PRIMARY verification** (NEW - production-validated)
- Phase 4: Guardrails to prevent duplicate recurrence

✅ **Data Safety**
- Idempotency tracking for safe retry/resume
- Non-destructive reparenting before deletion
- Comprehensive snapshot and rollback capability
- Dry-run mode for validation before execution

✅ **Cross-Platform Intelligence**
- Automatic SF sync detection and strategy selection
- Domain normalization for clustering
- Association preservation (Contacts, Deals, Opportunities)
- Rate limiting and API compliance

## Installation

```bash
# From marketplace
/plugin marketplace add RevPalSFDC/opspal-plugin-internal-marketplace
/plugin install opspal-data-hygiene@revpal-internal-plugins

# Verify installation
/plugin list | grep data-hygiene
```

## Dependencies

- **salesforce-plugin** (v3.2.0+): Salesforce API operations
- **hubspot-plugin** (v3.0.0+): HubSpot API operations

These will be automatically installed as dependencies.

## Configuration

### 1. Set Environment Variables

```bash
# HubSpot
export HUBSPOT_PRIVATE_APP_TOKEN="your-private-app-token"
export HUBSPOT_PORTAL_ID="12345678"

# Salesforce
export SALESFORCE_INSTANCE_URL="https://yourorg.my.salesforce.com"
export SALESFORCE_ACCESS_TOKEN="your-access-token"
export SALESFORCE_ORG_ALIAS="production"

# Optional
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
export DEDUP_OUTPUT_DIR="./dedup-reports"
```

### 2. Create Configuration File (Optional)

```bash
# Generate template
node .claude-plugins/opspal-data-hygiene/scripts/lib/dedup-config-loader.js template > dedup-config.json

# Edit with your values
vim dedup-config.json

# Validate
node .claude-plugins/opspal-data-hygiene/scripts/lib/dedup-config-loader.js validate dedup-config.json
```

### 3. CRITICAL: Disable Auto-Associate in HubSpot

Before running deduplication, **you must disable auto-associate companies** in HubSpot:

1. Go to HubSpot Settings
2. Navigate to Objects > Companies
3. Find "Auto-associate companies" setting
4. **Turn OFF** during cleanup
5. Re-enable after completion (optional)

## Usage

### Command: `/dedup-companies`

**🚨 IMPORTANT**: Always start with dry-run mode!

```bash
# Dry-run mode (safe - analyzes only)
/dedup-companies --dry-run

# Review the generated reports:
# - bundles.json - Duplicate clusters
# - actions.csv - Proposed execution plan
# - skipped_or_manual.csv - Manual review items

# If satisfied, execute (after review and approval)
/dedup-companies --execute

# Monitor progress
tail -f dedup-reports/execution.log
```

### Advanced Usage

#### Check Idempotency Ledger

```bash
# View summary
node scripts/lib/dedup-ledger.js summary dedupe-20251014-1200

# List failed operations
node scripts/lib/dedup-ledger.js list dedupe-20251014-1200 failed

# Export for auditing
node scripts/lib/dedup-ledger.js export dedupe-20251014-1200 ./audit.csv
```

#### Custom Configuration

```bash
# Use custom config file
/dedup-companies --config ./my-custom-config.json --dry-run

# Override specific settings
/dedup-companies --batch-size 50 --dry-run
```

## How It Works

### Phase 0: Safety & Freeze
1. Verify API connectivity and permissions
2. Confirm auto-associate is OFF in HubSpot
3. Create comprehensive snapshots of all Companies and Accounts
4. Generate baseline report

### Phase 1: Clustering
1. **Bundle A (SF-anchored)**: Group HubSpot Companies by `salesforceaccountid`
2. **Bundle B (HS-only)**: Group HubSpot Companies by normalized domain
3. Identify conflicts and blockers
4. Generate bundle report for review

### Phase 2: Canonical Selection
1. Score each Company in each bundle using weights:
   - 100 points: has `salesforceaccountid`
   - **50 points: sync health** (NEW - recency + source validation)
   - 40 points: contact count (normalized)
   - 25 points: deal count (normalized)
   - 10 points: owner present
   - 5 points: older createdate
   - **Total possible: 230 points** (enhanced from 180)
2. Select highest-scoring Company as "canonical"
3. Generate proposed canonical map

### Phase 3: Execution
1. **For SF-anchored duplicates**:
   - Attach SF Account → Canonical HS Company via contact bridge
   - Reparent all Contacts (PRIMARY association) to Canonical
   - Reparent all Deals to Canonical
   - Delete non-canonical HS Companies
   - Merge SF duplicate Accounts if detected

2. **For HS-only duplicates**:
   - Reparent Contacts and Deals to Canonical
   - Delete non-canonical Companies

### Phase 2.5: Association Repair (NEW - Production-Validated)

**Critical Discovery**: 96.8% of contacts need PRIMARY association repair after deduplication (delta-corp cleanup, Oct 2025)

1. **Load results** from Phase 2 (canonical map) and Phase 3 (execution)
2. **Verify PRIMARY associations** for all contacts on canonical companies
3. **Repair missing PRIMARY** in batch with rate limiting
4. **Validate success rate** ≥95% threshold
5. Generate comprehensive repair report

**Association Type Complexity**:
- **Type 1 (PRIMARY)**: Required for proper HubSpot functionality
- **Type 279 (Unlabeled/Secondary)**: Legacy/secondary associations
- Contacts can have BOTH types on same company relationship
- Removing duplicates can leave contacts with ONLY Type 279 → orphaned

**Why This Phase Is Critical**:
Without PRIMARY association repair, contacts appear "associated" but:
- Don't show in company record contact lists
- Don't trigger company-based workflows
- Don't appear in company filters
- Cause data integrity issues

**Real-World Impact** (delta-corp cleanup):
- 4,716 contacts processed
- 4,567 needed PRIMARY repair (96.8%)
- 100% success rate with batch repair
- Zero data integrity issues post-cleanup

### Phase 4: Guardrails
1. Create `external_sfdc_account_id` property with unique constraint
2. Copy `salesforceaccountid` values to `external_sfdc_account_id`
3. Create exception queries for monitoring
4. Generate compliance report

### Phase 5: Validation
1. Verify zero duplicates by SF Account ID
2. Verify zero duplicates by domain
3. Spot-check 5% of associations preserved
4. Generate validation report
5. Schedule 7-day observation for new duplicates

## Troubleshooting

### Auto-Associate Still ON

**Symptom**: New duplicates appearing after deletion
**Solution**: Verify auto-associate is OFF in HubSpot settings

### Merge API Fails with HTTP 400

**Symptom**: "Cannot merge companies with active SF sync"
**Root Cause**: Both companies have `salesforceaccountid`
**Solution**: Agent automatically uses lift-and-shift strategy

### Operation Failed Mid-Execution

**Symptom**: Partial completion, some records processed
**Solution**: Resume using idempotency ledger
```bash
# Check ledger
node scripts/lib/dedup-ledger.js summary <prefix>

# Re-run command (will skip already-committed operations)
/dedup-companies --resume <prefix>
```

### Data Loss Detected

**Symptom**: Contacts or Deals missing after execution
**Solution**: Rollback from snapshot
```bash
# Check rollback options
node scripts/lib/dedup-rollback-manager.js list

# Restore from checkpoint
node scripts/lib/dedup-rollback-manager.js restore <checkpoint-id>
```

### Contacts Not Showing on Company Record

**Symptom**: Contacts appear "associated" but don't show in company contact lists
**Root Cause**: Missing PRIMARY (Type 1) association - only Type 279 (Unlabeled) present
**Solution**: Run Phase 2.5 association repair
```bash
# Verify and repair PRIMARY associations
node scripts/lib/dedup-association-repair.js \
  ./dedup-reports/canonical-map-*.json \
  ./dedup-config.json \
  --execute

# Check repair report
cat dedup-reports/association-repair-report-*.json
```

**Prevention**: Phase 2.5 is now MANDATORY after Phase 3 execution

## Output Files

All outputs are generated in the configured output directory (default: `./dedup-reports`):

| File | Description |
|------|-------------|
| `bundles.json` | Duplicate clusters with metadata |
| `actions.csv` | Detailed execution plan |
| `skipped_or_manual.csv` | Items requiring manual review |
| `execution-report.json` | Phase 3 execution results and statistics |
| `association-repair-report-{timestamp}.json` | Phase 2.5 PRIMARY association verification results |
| `validation-report.json` | Post-execution validation results |
| `execution.log` | Structured execution logs (JSONL) |
| `snapshot-{timestamp}.json` | Pre-execution snapshot |
| `ledger-{prefix}.json` | Idempotency ledger |

## Best Practices

### Before Execution

1. ✅ **Test in sandbox first** with real duplicate data
2. ✅ **Run dry-run mode** and review all reports
3. ✅ **Verify auto-associate is OFF** in HubSpot
4. ✅ **Backup Salesforce data** (standard backup or snapshot)
5. ✅ **Get stakeholder approval** on proposed changes

### During Execution

1. ✅ **Start with small batch size** (10-25 records)
2. ✅ **Monitor execution logs** in real-time
3. ✅ **Watch for API rate limit warnings**
4. ✅ **Keep terminal session active** (or use tmux/screen)

### After Execution

1. ✅ **Run Phase 2.5** (Association Repair) - MANDATORY
2. ✅ **Review association repair report** - verify ≥95% success rate
3. ✅ **Review validation report** for any issues
4. ✅ **Spot-check random samples** manually (especially PRIMARY associations)
5. ✅ **Monitor for 7 days** for new duplicates
6. ✅ **Keep snapshots** for at least 30 days
7. ✅ **Document any manual interventions**

## API Rate Limits

The plugin respects rate limits for both platforms:

- **HubSpot**: 100 requests per 10 seconds (configurable)
- **Salesforce**: Respects org limits via `async-bulk-ops`
- **Automatic retry**: Exponential backoff on rate limit errors

## Support

### Documentation
- **Implementation Status**: `IMPLEMENTATION_STATUS.md`
- **Configuration Reference**: `templates/dedup-config.template.json`
- **Script Documentation**: See individual scripts in `scripts/lib/`

### Getting Help
1. Check `IMPLEMENTATION_STATUS.md` for current capabilities
2. Review logs in `dedup-reports/execution.log`
3. Check idempotency ledger for operation status
4. File issue in GitHub repository

## Development Status

**Current Version**: 1.0.0-pre (Enhanced with Production-Validated Patterns)
**Stability**: 🟡 Pre-release (Phase 1 Enhancements Complete)

### Completed ✅
- Plugin structure and manifest
- Configuration management with env var substitution
- Idempotency ledger for safe retry/resume
- Integration points with existing plugins identified
- **Association Verifier Module** (96.8% PRIMARY repair capability)
- **Sync Health Scoring** (50-point enhancement to canonical selection)
- **Phase 2.5 Association Repair** (post-execution verification)
- Enhanced executor with real-time PRIMARY verification

### In Progress 🟡
- Phase 0-4 script implementations
- Main orchestrator agent (updated with Phase 2.5)
- User command and documentation
- Testing framework

### Planned 📋
- Phase 2 Enhancements (multi-factor duplicate detection)
- Phase 3 Enhancements (monitoring dashboard)
- Sandbox testing
- Limited production trial
- Full production release
- Automated scheduling capability

**Phase 1 Enhancements** (75% → 100% COMPLETE):
- ✅ Association Verifier Module (2h) - Prevents 96.8% PRIMARY missing rate
- ✅ Sync Health Scoring (2h) - Better canonical selection (10%+ impact)
- ✅ Configuration Updates (1h) - User-facing sync health config
- ✅ Executor Integration (2h) - Auto-repair during execution
- ✅ Phase 2.5 Script (2h) - Post-execution verification
- ✅ Documentation (1h) - Association complexity education

**See `IMPLEMENTATION_STATUS.md` and `PHASE_1_ENHANCEMENTS_SUMMARY.md` for detailed progress tracking.**

## License

MIT

## Contributors

- RevPal Engineering Team
- Based on specification for cross-platform Company/Account deduplication

---

**⚠️  WARNING**: This plugin performs destructive operations (deletion of duplicate records). Always test in sandbox environment first and maintain backups. Always run in dry-run mode before executing live operations.
