# Data Hygiene Plugin - Comprehensive Testing Guide

**Version**: 1.0.0
**Last Updated**: 2025-10-14
**Status**: Production Ready

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Phase-by-Phase Testing](#phase-by-phase-testing)
4. [End-to-End Testing](#end-to-end-testing)
5. [Error Scenario Testing](#error-scenario-testing)
6. [Production Testing Protocol](#production-testing-protocol)
7. [Rollback Testing](#rollback-testing)
8. [Performance Testing](#performance-testing)

## Prerequisites

### Required Tools
- Node.js (v14+)
- HubSpot Private App access token
- Salesforce CLI (`sf` command)
- Authenticated Salesforce org
- Git (for version control)

### Test Environment

**CRITICAL**: Always test in sandbox/staging environment first!

```bash
# Sandbox environment variables
export HUBSPOT_PRIVATE_APP_TOKEN="your-sandbox-token"
export HUBSPOT_PORTAL_ID="sandbox-portal-id"
export SALESFORCE_ORG_ALIAS="sandbox"
export SALESFORCE_INSTANCE_URL="https://sandbox.salesforce.com"
```

### Sample Data Requirements

For meaningful testing, your sandbox should have:
- At least 50-100 companies with duplicate patterns
- Companies with SF Account IDs (Bundle A test cases)
- Companies without SF Account IDs but same domain (Bundle B test cases)
- Companies with contacts (5-10 contacts per company minimum)
- Companies with deals (3-5 deals per company minimum)

### Create Test Configuration

```bash
cp .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/templates/dedup-config.template.json ./test-config.json

# Edit with sandbox credentials
vim ./test-config.json
```

## Environment Setup

### 1. Verify API Connectivity

```bash
# Test HubSpot API
curl -X GET "https://api.hubapi.com/crm/v3/objects/companies?limit=1" \
  -H "Authorization: Bearer $HUBSPOT_PRIVATE_APP_TOKEN"

# Test Salesforce CLI
sf org display --target-org $SALESFORCE_ORG_ALIAS

# Test Salesforce Query
sf data query --query "SELECT Id, Name FROM Account LIMIT 1" \
  --target-org $SALESFORCE_ORG_ALIAS
```

### 2. Create Test Output Directory

```bash
mkdir -p ./dedup-reports-test
```

### 3. Update Test Config

```json
{
  "output": {
    "outputDir": "./dedup-reports-test"
  },
  "execution": {
    "dryRun": true,
    "batchSize": 10,
    "maxWritePerMin": 30
  }
}
```

## Phase-by-Phase Testing

### Phase 0: Snapshot Generation

**Purpose**: Verify snapshot creation and data capture

```bash
# Test snapshot generation
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-snapshot-generator.js \
  ./test-config.json

# Expected outputs:
# - ./dedup-reports-test/snapshot-{timestamp}.json
# - ./dedup-reports-test/snapshot-{timestamp}-hubspot-companies.csv
# - ./dedup-reports-test/snapshot-{timestamp}-salesforce-accounts.csv
```

**Validation Checklist**:
- [ ] Snapshot JSON file created
- [ ] CSV exports generated
- [ ] Company count matches HubSpot portal
- [ ] SF Account count matches Salesforce
- [ ] Sync health properties captured (hs_last_sales_activity_timestamp, hs_object_source_label_1)
- [ ] Contact/deal counts present

**Inspect Snapshot**:
```bash
jq '.hubspot.companies | length' ./dedup-reports-test/snapshot-*.json
jq '.salesforce.accounts | length' ./dedup-reports-test/snapshot-*.json
jq '.hubspot.companies[0]' ./dedup-reports-test/snapshot-*.json  # Sample record
```

### Phase 1: Clustering

**Purpose**: Verify duplicate detection logic

```bash
# Test clustering
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-clustering-engine.js \
  ./dedup-reports-test/snapshot-*.json

# Expected outputs:
# - ./dedup-reports-test/bundles-{timestamp}.json
# - ./dedup-reports-test/bundles-{timestamp}-bundleA.csv
# - ./dedup-reports-test/bundles-{timestamp}-bundleB.csv
# - ./dedup-reports-test/bundles-{timestamp}-skipped.csv
```

**Validation Checklist**:
- [ ] Bundle A (SF-anchored) contains companies with same salesforceaccountid
- [ ] Bundle B (HS-only) contains companies with same normalized domain
- [ ] Skipped companies documented with reasons
- [ ] No single-member bundles (duplicates must have 2+ companies)
- [ ] Domain normalization working (www.example.com == example.com)

**Inspect Bundles**:
```bash
jq '.bundleA | length' ./dedup-reports-test/bundles-*.json
jq '.bundleB | length' ./dedup-reports-test/bundles-*.json
jq '.bundleA[0]' ./dedup-reports-test/bundles-*.json  # Sample Bundle A
jq '.bundleB[0]' ./dedup-reports-test/bundles-*.json  # Sample Bundle B
```

**Key Tests**:
- Verify Bundle A clusters by SF Account ID
- Verify Bundle B clusters by domain
- Check for edge cases: missing domains, null values
- Verify skipped reasons are valid

### Phase 2: Canonical Selection

**Purpose**: Verify scoring algorithm and canonical selection

```bash
# Test canonical selection
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-canonical-selector.js \
  ./dedup-reports-test/bundles-*.json \
  ./test-config.json

# Expected outputs:
# - ./dedup-reports-test/canonical-map-{timestamp}.json
# - ./dedup-reports-test/canonical-map-{timestamp}-actions.csv
# - ./dedup-reports-test/canonical-map-{timestamp}-summary.txt
```

**Validation Checklist**:
- [ ] Actions CSV has KEEP vs MERGE_INTO_CANONICAL decisions
- [ ] Companies with salesforceaccountid score higher (100 pts)
- [ ] Recently synced companies score higher (sync health up to 50 pts)
- [ ] Contact/deal counts factor into scoring (up to 65 pts combined)
- [ ] Older companies get createdate bonus (5 pts)
- [ ] Total max score = 230 points

**Inspect Canonical Map**:
```bash
# Review actions (THIS IS CRITICAL BEFORE EXECUTION)
cat ./dedup-reports-test/canonical-map-*-actions.csv

# Verify scoring
jq '.canonicalMap[0] | {
  canonical: .canonical.companyName,
  canonicalScore: .canonical.score,
  duplicates: [.duplicates[].companyName]
}' ./dedup-reports-test/canonical-map-*.json
```

**Manual Review** (MANDATORY):
1. Open `canonical-map-*-actions.csv` in Excel/Google Sheets
2. Review KEEP decisions - are these the right companies to keep?
3. Review MERGE_INTO_CANONICAL decisions - do these make sense?
4. Look for edge cases:
   - Companies with same domain but different businesses
   - Companies with SF Account ID but stale data
   - Companies with many contacts but old data

### Phase 3: Execution (Dry Run)

**Purpose**: Simulate deduplication without making changes

```bash
# ALWAYS DRY RUN FIRST
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-executor.js \
  ./dedup-reports-test/canonical-map-*.json \
  ./test-config.json
# --execute flag NOT provided = dry run

# Expected output:
# - Console shows what WOULD happen
# - No actual changes made
```

**Validation Checklist**:
- [ ] Dry run mode confirmed in logs
- [ ] Association reparenting operations logged
- [ ] Company deletion operations logged
- [ ] Rate limiting respected
- [ ] No actual API calls made (dry run simulation)

### Phase 3: Execution (Live - Sandbox Only!)

**Purpose**: Execute deduplication in sandbox

```bash
# SANDBOX ONLY - NEVER RUN IN PRODUCTION WITHOUT APPROVAL
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-executor.js \
  ./dedup-reports-test/canonical-map-*.json \
  ./test-config.json \
  --execute

# Expected outputs:
# - ./dedup-reports-test/execution-report-{timestamp}.json
# - ./.dedup-ledger/ directory with idempotency tracking
```

**Validation Checklist**:
- [ ] Contacts reparented to canonical companies
- [ ] PRIMARY (Type 1) associations created for contacts
- [ ] Deals reparented to canonical companies
- [ ] Duplicate companies deleted
- [ ] Idempotency ledger populated
- [ ] Execution report shows statistics

**Verify Results**:
```bash
# Check execution report
jq '.stats' ./dedup-reports-test/execution-report-*.json

# Check ledger
ls -la ./.dedup-ledger/

# Verify in HubSpot manually:
# - Open canonical company
# - Check contacts tab - should show all contacts
# - Check deals tab - should show all deals
# - Verify duplicate company IDs no longer exist
```

### Phase 2.5: Association Repair

**Purpose**: Ensure 100% PRIMARY association coverage

```bash
# Test association repair (dry run)
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-association-repair.js \
  ./dedup-reports-test/canonical-map-*.json \
  ./test-config.json

# Live execution (sandbox only)
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-association-repair.js \
  ./dedup-reports-test/canonical-map-*.json \
  ./test-config.json \
  --execute

# Expected output:
# - ./dedup-reports-test/association-repair-report-{timestamp}.json
```

**Validation Checklist**:
- [ ] All canonical companies verified
- [ ] PRIMARY associations verified or repaired
- [ ] Success rate ≥95%
- [ ] Repair report shows statistics

**Critical Metric**:
- **96.8% of contacts typically need PRIMARY repair** (production data from Rentable cleanup)

### Phase 4: Guardrails

**Purpose**: Implement prevention mechanisms

```bash
# Test guardrails (dry run)
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-guardrail-manager.js \
  ./test-config.json

# Live execution (sandbox only)
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-guardrail-manager.js \
  ./test-config.json \
  --execute

# Expected outputs:
# - ./dedup-reports-test/guardrails-report-{timestamp}.json
# - ./dedup-reports-test/exception-queries.json
# - ./dedup-reports-test/EXCEPTION_QUERIES_SETUP.md
# - ./dedup-reports-test/GUARDRAILS_GUIDE.md
```

**Validation Checklist**:
- [ ] `external_sfdc_account_id` property created with unique constraint
- [ ] Values populated from `salesforceaccountid`
- [ ] Exception query definitions generated
- [ ] Setup guide generated

**Manual Steps** (cannot be automated):
1. Create exception queries in HubSpot Lists (see EXCEPTION_QUERIES_SETUP.md)
2. Set up alerts for duplicate detection
3. Verify auto-associate setting is OFF

### Validation Framework

**Purpose**: Comprehensive post-execution validation

```bash
# Pre-execution validation
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-validation-framework.js \
  pre-execution \
  ./test-config.json

# Post-execution validation
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-validation-framework.js \
  post-execution \
  ./test-config.json \
  ./dedup-reports-test/execution-data.json

# Spot-check validation
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-validation-framework.js \
  spot-check \
  ./test-config.json \
  ./dedup-reports-test/execution-data.json
```

**Validation Checklist**:
- [ ] Zero duplicates by SF Account ID
- [ ] Zero duplicates by domain
- [ ] All canonical companies exist
- [ ] All duplicate companies deleted
- [ ] Associations preserved (≥95% threshold)
- [ ] Record counts match expectations

## End-to-End Testing

### Full Workflow Test (Sandbox)

```bash
#!/bin/bash
# Complete end-to-end test script

set -e  # Exit on error

CONFIG="./test-config.json"
OUTPUT_DIR="./dedup-reports-test"

echo "=== Phase 0: Snapshot ==="
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-snapshot-generator.js $CONFIG

SNAPSHOT=$(ls -t $OUTPUT_DIR/snapshot-*.json | head -1)
echo "Snapshot: $SNAPSHOT"

echo "=== Phase 1: Clustering ==="
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-clustering-engine.js $SNAPSHOT

BUNDLES=$(ls -t $OUTPUT_DIR/bundles-*.json | head -1)
echo "Bundles: $BUNDLES"

echo "=== Phase 2: Canonical Selection ==="
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-canonical-selector.js $BUNDLES $CONFIG

CANONICAL=$(ls -t $OUTPUT_DIR/canonical-map-*.json | head -1)
echo "Canonical Map: $CANONICAL"

echo "=== MANUAL REVIEW REQUIRED ==="
echo "Review: $OUTPUT_DIR/canonical-map-*-actions.csv"
read -p "Press enter to continue or Ctrl+C to abort..."

echo "=== Phase 3: Execution (DRY RUN) ==="
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-executor.js $CANONICAL $CONFIG

read -p "Proceed with LIVE execution? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "=== Phase 3: Execution (LIVE) ==="
    node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-executor.js $CANONICAL $CONFIG --execute
    
    echo "=== Phase 2.5: Association Repair ==="
    node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-association-repair.js $CANONICAL $CONFIG --execute
    
    echo "=== Phase 4: Guardrails ==="
    node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-guardrail-manager.js $CONFIG --execute
    
    echo "=== Validation ==="
    node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-validation-framework.js post-execution $CONFIG
fi

echo "=== Test Complete ==="
```

Save as `test-end-to-end.sh` and run:
```bash
chmod +x test-end-to-end.sh
./test-end-to-end.sh
```

## Error Scenario Testing

### 1. API Connectivity Failure

**Simulate**: Temporarily provide invalid API token

```bash
export HUBSPOT_PRIVATE_APP_TOKEN="invalid-token"
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-snapshot-generator.js ./test-config.json

# Expected: Clear error message, no partial data corruption
```

### 2. Rate Limit Exceeded

**Simulate**: Set very low rate limit in config

```json
{
  "execution": {
    "maxWritePerMin": 5
  }
}
```

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-executor.js \
  ./canonical-map.json \
  ./test-config.json \
  --execute

# Expected: Auto-pause with countdown, resume after 60 seconds
```

### 3. Mid-Execution Failure

**Simulate**: Kill process during execution

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-executor.js \
  ./canonical-map.json \
  ./test-config.json \
  --execute &

PID=$!
sleep 10
kill $PID

# Resume using idempotency
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-executor.js \
  ./canonical-map.json \
  ./test-config.json \
  --execute

# Expected: Skips already-completed operations from ledger
```

### 4. Missing PRIMARY Associations

**Simulate**: Run executor without association repair

```bash
# Execute without Phase 2.5
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-executor.js \
  ./canonical-map.json \
  ./test-config.json \
  --execute

# Check association status
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-association-verifier.js \
  ./test-config.json \
  verify-batch \
  ./contact-company-pairs.json

# Expected: Many contacts missing PRIMARY associations
# Fix with Phase 2.5
```

## Rollback Testing

### Test Rollback Capability

```bash
# List available snapshots
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-rollback-manager.js list

# Dry run rollback
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-rollback-manager.js \
  rollback \
  ./dedup-reports-test/snapshot-*.json \
  ./test-config.json

# Live rollback (sandbox only)
node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-rollback-manager.js \
  rollback \
  ./dedup-reports-test/snapshot-*.json \
  ./test-config.json \
  --execute
```

**Validation**:
- [ ] Deleted companies restored
- [ ] Property values restored
- [ ] Rollback report generated
- [ ] Verification confirms restoration

## Performance Testing

### Large Dataset Testing

**Test with 10,000+ companies**:

```bash
# Measure Phase 0 (Snapshot)
time node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-snapshot-generator.js ./test-config.json
# Expected: 5-10 minutes for 10,000 companies

# Measure Phase 1 (Clustering)
time node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-clustering-engine.js ./snapshot.json
# Expected: ~1 minute

# Measure Phase 2 (Canonical Selection)
time node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-canonical-selector.js ./bundles.json ./test-config.json
# Expected: ~1 minute

# Measure Phase 3 (Execution)
time node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-executor.js ./canonical-map.json ./test-config.json --execute
# Expected: 10-20 minutes for 1,000 operations (rate limited)
```

### Memory Usage Testing

```bash
# Monitor memory during snapshot generation
/usr/bin/time -v node .claude-plugins/opspal-core-plugin/packages/domains/data-hygiene/scripts/lib/dedup-snapshot-generator.js ./test-config.json

# Look for "Maximum resident set size"
# Expected: < 500MB for 10,000 companies
```

## Production Testing Protocol

### Pre-Production Checklist

Before running in production:

- [ ] All sandbox tests passed
- [ ] End-to-end test completed successfully
- [ ] Rollback tested and verified
- [ ] Error scenarios tested
- [ ] Performance acceptable for production scale
- [ ] Stakeholder approval obtained
- [ ] Backup plan documented
- [ ] Team trained on monitoring and response
- [ ] Maintenance window scheduled
- [ ] Communication plan ready

### Production Execution Checklist

Day of execution:

- [ ] **Auto-associate is OFF** in HubSpot Settings
- [ ] Snapshot created and verified
- [ ] Dry run reviewed and approved
- [ ] Actions CSV reviewed by stakeholders
- [ ] Team on standby for monitoring
- [ ] Slack/email alerts configured
- [ ] Snapshot backup confirmed
- [ ] Rollback procedure tested
- [ ] User has given explicit approval for --execute

### Post-Execution Validation

After production execution:

- [ ] Phase 2.5 association repair completed (success rate ≥95%)
- [ ] Validation framework passed all checks
- [ ] Zero duplicates confirmed in HubSpot
- [ ] Spot-check random samples (20-30 companies)
- [ ] Contact/deal associations verified
- [ ] PRIMARY associations confirmed
- [ ] Exception queries created in HubSpot
- [ ] Monitoring dashboard configured
- [ ] Team trained on alert response

### 7-Day Observation Period

Monitor for 7 days after execution:

- [ ] No new duplicates appearing
- [ ] No SF Account creating new HS Company
- [ ] Exception dashboards show 0 duplicates
- [ ] Contact associations stable
- [ ] Deal associations stable
- [ ] No user complaints about missing data

## Troubleshooting

### Common Test Failures

**Snapshot fails with "Cannot read property 'companies'"**:
- Check HubSpot API token is valid
- Verify portal has companies
- Check network connectivity

**Clustering produces empty Bundle A**:
- Verify companies have `salesforceaccountid` property
- Check Salesforce sync is active
- Review snapshot data

**Executor fails with "Rate limit exceeded"**:
- Increase `maxWritePerMin` in config
- Wait for rate limit window to reset
- Check HubSpot API limits

**Association repair shows <95% success**:
- Check HubSpot API permissions
- Verify contact IDs are valid
- Review error messages in repair report
- Check for deleted contacts

**Rollback fails to restore companies**:
- Verify snapshot file exists and is valid
- Check HubSpot API permissions for company creation
- Review unique property constraints
- Check for conflicting companies with same domain

## Success Criteria

Tests are successful when:

- [ ] All phases execute without errors
- [ ] Dry-run shows expected operations
- [ ] Live execution completes successfully
- [ ] Zero data loss (all contacts/deals preserved)
- [ ] PRIMARY association coverage ≥95%
- [ ] Zero duplicates in post-execution validation
- [ ] Rollback restores original state
- [ ] Performance meets expectations

## Support

For issues or questions:

1. Check execution logs in `./dedup-reports/execution-report-*.json`
2. Review ledger: `ls -la ./.dedup-ledger/`
3. Check TROUBLESHOOTING.md in plugin directory
4. Review PRODUCTION_READY_SUMMARY.md for known limitations
5. File issue in GitHub repository

---

**Last Updated**: 2025-10-14  
**Plugin Version**: 1.0.0-rc1
