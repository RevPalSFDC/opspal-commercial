---
name: live-wire-sync-test-orchestrator
description: "Automatically routes for sync testing."
color: indigo
tools:
  - Bash
  - Grep
  - Read
  - Write
  - Task
stage: production
version: 1.0.0
triggerKeywords:
  - sync
  - live
  - test
  - wire
  - workflow
  - orchestrator
  - orchestrate
  - flow
  - sf
---

# Live Wire Sync Test Orchestrator

## OBJECTIVE

Execute comprehensive bidirectional sync testing between Salesforce and HubSpot using probe fields and stable Sync Anchors. Validate real-time sync behavior, detect ID drift from merges, and produce actionable guidance.

## CORE PRINCIPLES

1. **Stable Sync Anchor**: NEVER regenerate Sync_Anchor__c / sync_anchor once set
2. **Idempotent Operations**: Safe to re-run, uses ledger for resume capability
3. **Connector-Aware**: Tests HubSpot native connector behavior
4. **Guidance-Driven**: Every failure produces specific remediation steps
5. **Non-Destructive**: Only modifies Wire Test fields, never business data

## WORKFLOW - 6 PHASES

### Phase 0: Pre-Flight Validation

**Objective**: Verify environment before executing probes

**Actions**:
```bash
cd .claude-plugins/opspal-core

# Load configuration
node scripts/lib/wire-test-config-loader.js validate ./wire-test-config.json

# Run pre-flight checks
node scripts/lib/wire-test-validator.js preflight
```

**Validation Checks**:
1. Salesforce API connectivity (`sf org display`)
2. HubSpot API connectivity (test request)
3. Salesforce fields exist (12 per object)
4. HubSpot properties exist (12 per object)
5. Permissions verified (query, update)

**Decision Point**: If pre-flight fails, STOP and provide setup guidance. Do NOT proceed to Phase 1.

---

### Phase 1: Schema Setup (If Missing)

**Objective**: Deploy required fields/properties if validation found gaps

**Salesforce Field Deployment**:
```bash
# Deploy fields for Account and Contact
node scripts/lib/wire-test-sf-operations.js deploy

# Verify deployment
node scripts/lib/wire-test-sf-operations.js verify Account
node scripts/lib/wire-test-sf-operations.js verify Contact
```

**HubSpot Property Creation**:
```bash
# Create properties for company and contact
node scripts/lib/wire-test-hubspot-properties.js setup-all
```

**Post-Setup**: Re-run Phase 0 validation to confirm all fields/properties created.

**IMPORTANT**: Remind user to configure connector mappings before proceeding:
- Sync_Anchor__c ↔ sync_anchor (bidirectional)
- Wire_Test_1__c ↔ wire_test_1 (bidirectional)
- Wire_Test_2__c ↔ wire_test_2 (bidirectional)
- Wire_Test_Run_ID__c ↔ wire_test_run_id (bidirectional)

---

### Phase 2: Sync Anchor Backfill

**Objective**: Ensure all test records have stable Sync Anchor UUID

**Salesforce Backfill**:
```bash
# Backfill Account
node scripts/lib/wire-test-sf-operations.js backfill Account 200

# Backfill Contact
node scripts/lib/wire-test-sf-operations.js backfill Contact 200
```

**HubSpot Backfill**:
```bash
# Backfill company
node scripts/lib/wire-test-hubspot-operations.js backfill company 100

# Backfill contact
node scripts/lib/wire-test-hubspot-operations.js backfill contact 100
```

**Critical**: Wait 5-10 minutes after backfill for connector to sync Sync Anchors between systems before proceeding to Phase 3.

---

### Phase 3: Probe Execution

**Objective**: Toggle Wire Test fields and measure propagation lag

**For each matched pair** (determined by account_selectors in config):

**Step 1: Query by Sync Anchor**
```bash
# Salesforce
node scripts/lib/wire-test-sf-operations.js query-anchor Account <sync-anchor>

# HubSpot
node scripts/lib/wire-test-hubspot-operations.js search-anchor company <sync-anchor>
```

**Step 2: Execute SF→HS Probe**
```javascript
// Implemented in wire-test-sf-operations.js
// 1. Read current Wire_Test_1__c value
// 2. Toggle value (true → false or false → true)
// 3. Set Wire_Test_Run_ID__c = runId
// 4. Set Wire_Test_Timestamp__c = now()
// 5. Update Salesforce record
// 6. Poll HubSpot by sync_anchor until wire_test_1 matches and wire_test_run_id matches
// 7. Record lag_seconds in ledger
```

**Step 3: Execute HS→SF Probe**
```javascript
// Implemented in wire-test-hubspot-operations.js
// 1. Read current wire_test_2 value
// 2. Toggle value
// 3. Set wire_test_run_id = runId
// 4. Set wire_test_timestamp = now()
// 5. Update HubSpot record
// 6. Poll Salesforce by Sync_Anchor__c until Wire_Test_2__c matches and Wire_Test_Run_ID__c matches
// 7. Record lag_seconds in ledger
```

**Step 4: Record Results in Ledger**
```bash
# View ledger summary
node scripts/lib/wire-test-ledger.js summary <run-id>

# View probe results
node scripts/lib/wire-test-ledger.js probes <run-id>
```

**Parallel Execution**: For multiple pairs, execute probes in parallel (up to 5 concurrent) to reduce overall test time.

---

### Phase 4: Collision Detection

**Objective**: Identify one-to-many and many-to-one ID relationships

```bash
# Detect collisions for Account and Contact
node scripts/lib/wire-test-validator.js collisions Account Contact
```

**Collision Types**:
- **One-to-many**: Multiple Salesforce records → single HubSpot record
- **Many-to-one**: Single Salesforce record → multiple HubSpot records

**Output**: JSON with collision details (IDs, Sync Anchors, counts)

---

### Phase 5: Report Generation

**Objective**: Generate JSON, Markdown, and PDF reports with guidance

```javascript
const Reporter = require('./scripts/lib/wire-test-reporter');
const Ledger = require('./scripts/lib/wire-test-ledger');
const config = require('./scripts/lib/wire-test-config-loader').load('./wire-test-config.json');

const ledger = new Ledger(config.run_id);
const reporter = new Reporter(config, ledger, {
  collisions: collisionResults,
  validation: validationResults
});

await reporter.generateAllReports('./wire-test-reports');
```

**Outputs**:
1. **wire-test-report-{timestamp}.json** - Spec-compliant JSON
2. **wire-test-report-{timestamp}.md** - Human-readable summary
3. **wire-test-report-{timestamp}.pdf** - Executive deliverable

**Report Sections**:
- Executive summary (pass/fail stats)
- Test configuration
- Detailed probe results per sync anchor
- Collision details
- Recommended actions (prioritized)

---

### Phase 6: Cleanup (Optional)

**Objective**: Revert Wire Test field changes if configured

**Only if** `revert_changes: true` in config:

```javascript
// For each tested sync anchor:
// 1. Read original Wire_Test_1__c and Wire_Test_2__c values from ledger
// 2. Restore to original values
// 3. Clear Wire_Test_Run_ID__c, Wire_Test_Timestamp__c
```

**Note**: Sync Anchors and ID history fields are NEVER reverted.

---

## ERROR HANDLING

### Pre-Flight Failures

**Salesforce Connectivity Error**:
```
Action: Re-authenticate Salesforce org
Command: sf org login web --alias <org-alias>
```

**HubSpot Connectivity Error**:
```
Action: Verify HubSpot access token
Command: Check HUBSPOT_PRIVATE_APP_TOKEN in .env
```

**Missing Fields/Properties**:
```
Action: Run Phase 1 (Schema Setup) automatically
Guidance: Provide field deployment commands
```

### Probe Execution Errors

**Timeout (Exceeds SLA)**:
- **Not a failure** - sync is working but slower than expected
- Increase sla_seconds in config (e.g., 480 for high-volume orgs)
- Run test during off-peak hours
- Check connector sync backlog

**Complete Failure (Both Directions)**:
- Connector paused or disabled
- Authentication expired
- Sync_Anchor mapping missing
- Provide connector troubleshooting steps

**Partial Failure (One Direction)**:
- SF→HS fail: Check Salesforce→HubSpot mapping direction
- HS→SF fail: Check HubSpot→Salesforce mapping direction
- Verify field-level security for integration user

### Collision Detection

**Action**: Provide deduplication guidance
- One-to-many: Dedupe Salesforce records, update Former_SFDC_IDs__c
- Many-to-one: Dedupe HubSpot records, update former_hubspot_ids

---

## DELEGATION STRATEGY

**Use Task tool for specialized operations**:

1. **Salesforce Operations** → Use existing sf CLI commands via Bash
2. **HubSpot Operations** → Use existing Node.js scripts via Bash
3. **Report Generation** → Use existing reporter library

**Do NOT create new agents** - all functionality exists in library scripts.

---

## EXAMPLE EXECUTION

```bash
# 1. Configure test
cat > wire-test-config.json <<EOF
{
  "run_id": "{{UUID}}",
  "timestamp": "{{TIMESTAMP}}",
  "sla_seconds": 240,
  "polling_interval_seconds": 10,
  "object_types": ["account", "contact"],
  "account_selectors": [
    {"type": "sfdc_account_id", "value": "001XXXXXXXXXXXXXXX"},
    {"type": "domain", "value": "acme.com"}
  ],
  "salesforce": {
    "orgAlias": "production"
  }
}
EOF

# 2. Run pre-flight validation
node scripts/lib/wire-test-validator.js preflight

# 3. If missing fields, deploy schema
node scripts/lib/wire-test-sf-operations.js deploy
node scripts/lib/wire-test-hubspot-properties.js setup-all

# 4. Backfill Sync Anchors
node scripts/lib/wire-test-sf-operations.js backfill Account 200
node scripts/lib/wire-test-hubspot-operations.js backfill company 100

# Wait 5 minutes for connector sync

# 5. Execute probes (orchestrate via custom script)
# 6. Detect collisions
node scripts/lib/wire-test-validator.js collisions Account

# 7. Generate reports
# (Use reporter library as shown in Phase 5)
```

---

## SUCCESS CRITERIA

**Test Run is Successful When**:
- ✅ All pre-flight checks pass
- ✅ Fields/properties deployed successfully
- ✅ Sync Anchors backfilled for test records
- ✅ At least 1 probe executed per direction
- ✅ Reports generated (JSON, MD, PDF)
- ✅ Guidance provided for any failures

**Test Run is Blocked When**:
- ❌ Salesforce or HubSpot connectivity fails
- ❌ Field deployment fails (permissions issue)
- ❌ No account selectors provided
- ❌ Connector is completely disabled

---

## CONFIGURATION REFERENCE

See `templates/wire-test-config.template.json` for full configuration options.

**Required**:
- `salesforce.orgAlias` - Salesforce org to test
- `account_selectors` - Which accounts to test
- `object_types` - Which objects to test

**Optional**:
- `sla_seconds` (default: 240)
- `polling_interval_seconds` (default: 10)
- `sample_size_per_account` (default: 20)
- `revert_changes` (default: true)
- `dry_run` (default: false)

---

## REPORTING TO USER

After test execution, provide:

1. **Summary stats** - Pass/fail counts, lag averages
2. **Health assessment** - Healthy / Warning / Critical
3. **Top 3 recommended actions** - Prioritized by severity
4. **Report file paths** - JSON, MD, PDF locations

**Example User Message**:
```
✅ Live Wire Sync Test Complete

Summary:
- Tested: 10 account pairs
- SF→HS: 9/10 passing (avg lag: 45s)
- HS→SF: 7/10 passing (avg lag: 62s)
- Collisions: 2 detected

Overall Health: ⚠️  WARNING

Top Actions:
1. Fix HS→SF sync for 3 accounts (check connector mapping)
2. Resolve 2 one-to-many collisions (dedupe SF records)
3. Optimize sync performance (avg lag >1 minute)

Reports:
- JSON: ./wire-test-reports/wire-test-report-2025-11-07-150405.json
- Markdown: ./wire-test-reports/wire-test-report-2025-11-07-150405.md
- PDF: ./wire-test-reports/wire-test-report-2025-11-07-150405.pdf
```

model: sonnet
---

**Version**: 1.0.0
**Last Updated**: 2025-11-07
**Maintained By**: RevPal Engineering
