---
description: Test bidirectional sync between Salesforce and HubSpot using probe fields
allowed-tools: Task, Bash, Read, Write
thinking-mode: enabled
---

# Live Wire Sync Test Command

## OBJECTIVE

Execute a comprehensive bidirectional sync test between Salesforce and HubSpot to validate real-time sync behavior, measure propagation lag, detect ID collisions, and produce actionable guidance for connector optimization.

## WHEN TO USE

Use this command when you need to:
- ✅ Verify HubSpot-Salesforce connector is working correctly
- ✅ Measure sync propagation lag between systems
- ✅ Detect duplicate records (one-to-many, many-to-one collisions)
- ✅ Validate connector field mappings
- ✅ Diagnose sync failures with specific guidance
- ✅ Benchmark sync performance for SLA compliance

## COMMAND INVOCATION

**Basic Usage:**
```bash
/live-wire-sync-test
```

**With Parameters:**
```bash
/live-wire-sync-test --account-selectors "001XXXXX,domain:acme.com" --sla-seconds 300 --dry-run
```

**Configuration File:**
```bash
/live-wire-sync-test --config ./my-wire-test-config.json
```

## PARAMETERS (OPTIONAL)

| Parameter | Description | Default | Example |
|-----------|-------------|---------|---------|
| `--account-selectors` | Comma-separated list of account identifiers | Interactive prompt | `"001XXX,domain:acme.com"` |
| `--object-types` | Objects to test | `account,contact` | `"account"` |
| `--sla-seconds` | Max wait time per probe | `240` | `300` |
| `--polling-interval` | Time between polls (seconds) | `10` | `15` |
| `--sample-size` | Max contacts per account | `20` | `50` |
| `--revert-changes` | Revert Wire Test fields after test | `true` | `false` |
| `--dry-run` | Preview operations without execution | `false` | `true` |
| `--config` | Path to config file | None | `./config.json` |
| `--setup-only` | Only deploy fields/properties, skip test | `false` | `true` |

## PROCESS

### Step 1: Configuration

**If no config file provided**:
1. Prompt user for required parameters:
   - Salesforce org alias
   - Account selectors (how to identify test accounts)
   - Object types to test
   - SLA timeout preference

**If config file provided**:
1. Load and validate configuration
2. Display configuration summary for user confirmation

### Step 2: Delegate to Orchestrator

**Invoke the live-wire-sync-test-orchestrator agent**:

```
Using the live-wire-sync-test-orchestrator agent, execute a complete bidirectional sync test with the following configuration:

<configuration details>

Execute all 6 phases:
1. Pre-flight validation
2. Schema setup (if needed)
3. Sync Anchor backfill
4. Probe execution (bidirectional)
5. Collision detection
6. Report generation

Provide progress updates after each phase and final summary with report paths.
```

### Step 3: Present Results

After orchestrator completes, present to user:

1. **Executive Summary**:
   - Total pairs tested
   - Pass/fail counts per direction
   - Average lag times
   - Collision count
   - Overall health status

2. **Top 3 Recommended Actions**:
   - Prioritized by severity
   - Specific commands to run
   - Expected outcome of each action

3. **Report File Paths**:
   - JSON report (programmatic analysis)
   - Markdown summary (human-readable)
   - PDF deliverable (executive sharing)

## EXAMPLE SESSIONS

### Example 1: Quick Test (Default Config)

**User Input:**
```bash
/live-wire-sync-test
```

**Agent Response:**
```
🔍 Live Wire Sync Test - Interactive Setup

Which Salesforce org should I test?
Available orgs: production, sandbox, hivemq

> production

Which accounts should I test? (provide at least one)
Options:
  1. Salesforce Account ID (e.g., 001XXXXXXXXXXXXXXX)
  2. Domain name (e.g., domain:acme.com)
  3. HubSpot Company ID (e.g., 12345678)

> 001XXXXXXXXXXXXXXX, domain:acme.com

Starting test with:
- Org: production
- Accounts: 2 selectors
- Objects: Account, Contact
- SLA: 240 seconds

Proceeding...
```

### Example 2: With Parameters

**User Input:**
```bash
/live-wire-sync-test --account-selectors "domain:revpal.com" --sla-seconds 300 --object-types "account"
```

**Agent Response:**
```
✅ Configuration loaded from parameters

Starting Live Wire Sync Test...

Phase 1/6: Pre-flight Validation
  ✅ Salesforce connectivity: Connected
  ✅ HubSpot connectivity: Connected
  ✅ Fields/properties: All exist
  ✅ Permissions: Verified

Phase 2/6: Skipped (fields already exist)

Phase 3/6: Sync Anchor Backfill
  ✅ Salesforce: 0 records backfilled (all have anchors)
  ✅ HubSpot: 0 records backfilled (all have anchors)

Phase 4/6: Probe Execution
  🔄 Testing domain:revpal.com...
  ✅ SF→HS: PASS (lag: 42s)
  ✅ HS→SF: PASS (lag: 58s)

Phase 5/6: Collision Detection
  ✅ No collisions detected

Phase 6/6: Report Generation
  ✅ JSON: ./wire-test-reports/wire-test-report-2025-11-07-153045.json
  ✅ Markdown: ./wire-test-reports/wire-test-report-2025-11-07-153045.md
  ✅ PDF: ./wire-test-reports/wire-test-report-2025-11-07-153045.pdf

═══════════════════════════════════════════════════════════

✅ Live Wire Sync Test Complete

Summary:
- Tested: 1 account pair
- SF→HS: 1/1 passing (avg lag: 42s)
- HS→SF: 1/1 passing (avg lag: 58s)
- Collisions: 0 detected

Overall Health: ✅ HEALTHY

Recommended Actions:
✅ No critical issues - sync is working correctly

Reports available in ./wire-test-reports/
```

### Example 3: Setup Only Mode

**User Input:**
```bash
/live-wire-sync-test --setup-only
```

**Agent Response:**
```
🔧 Live Wire Sync Test - Setup Mode

This will deploy Wire Test fields/properties to your org without running tests.

Deploying to Salesforce org: production

Phase 1: Salesforce Field Deployment
  📦 Deploying 24 fields (Account + Contact)...
  ✅ Deployment successful

Phase 2: HubSpot Property Creation
  🔧 Creating 24 properties (company + contact)...
  ✅ All properties created

Phase 3: Connector Mapping Reminder

IMPORTANT: Configure these field mappings in your HubSpot connector:

Required Bidirectional Mappings:
  ✅ Sync_Anchor__c ↔ sync_anchor
  ✅ Wire_Test_1__c ↔ wire_test_1
  ✅ Wire_Test_2__c ↔ wire_test_2
  ✅ Wire_Test_Run_ID__c ↔ wire_test_run_id
  ✅ Wire_Test_Timestamp__c ↔ wire_test_timestamp

Once mappings are configured, wait 5-10 minutes for initial sync, then run:
  /live-wire-sync-test

Setup complete! ✅
```

### Example 4: Dry-Run Mode

**User Input:**
```bash
/live-wire-sync-test --account-selectors "001XXXXX" --dry-run
```

**Agent Response:**
```
🔍 Live Wire Sync Test - DRY RUN MODE

This is a preview - no changes will be made.

Configuration:
- Org: production
- Accounts: 1 selector (001XXXXX)
- Objects: Account, Contact
- SLA: 240 seconds

Planned Operations:

Phase 0: Pre-flight Validation
  ✓ Would check: Salesforce connectivity
  ✓ Would check: HubSpot connectivity
  ✓ Would verify: Fields/properties exist

Phase 3: Sync Anchor Backfill
  ✓ Would query: Accounts without Sync Anchor
  ✓ Would generate: UUIDs for missing anchors
  ✓ Would upsert: Anchors to both systems

Phase 4: Probe Execution
  ✓ Would find: Account 001XXXXX by Sync Anchor
  ✓ Would toggle: Wire_Test_1__c in Salesforce
  ✓ Would poll: HubSpot for change (max 240s)
  ✓ Would toggle: wire_test_2 in HubSpot
  ✓ Would poll: Salesforce for change (max 240s)

Phase 5: Collision Detection
  ✓ Would query: All records with Sync Anchors
  ✓ Would group: By HubSpot ID and Salesforce ID
  ✓ Would detect: One-to-many and many-to-one

Phase 6: Report Generation
  ✓ Would generate: JSON, Markdown, PDF reports

═══════════════════════════════════════════════════════════

Dry run complete. Run without --dry-run to execute.
```

## ERROR HANDLING

### Pre-Flight Failures

**Salesforce Not Connected:**
```
❌ Salesforce connectivity failed

Action Required:
1. Re-authenticate: sf org login web --alias production
2. Verify org: sf org display --target-org production
3. Re-run: /live-wire-sync-test
```

**HubSpot Token Invalid:**
```
❌ HubSpot connectivity failed

Action Required:
1. Verify token: echo $HUBSPOT_PRIVATE_APP_TOKEN
2. Update .env with valid token
3. Restart Claude Code to reload environment
4. Re-run: /live-wire-sync-test
```

**Missing Fields/Properties:**
```
⚠️  Wire Test fields not found

Automatically running setup...

Run: /live-wire-sync-test --setup-only

Then configure connector mappings and re-run test.
```

### Test Execution Failures

**All Probes Timeout:**
```
⚠️  All probes exceeded SLA (240s)

Possible Causes:
- Connector has large sync backlog
- High-volume org with queueing delays
- Network latency between systems

Recommended Actions:
1. Increase SLA: /live-wire-sync-test --sla-seconds 480
2. Run during off-peak: retry tonight or weekend
3. Check connector queue: HubSpot → Connector → Sync Activity

Note: Timeout doesn't mean sync is broken, just slower than expected.
```

**Partial Failures:**
```
⚠️  Some probes failed

SF→HS: 3/5 passing
HS→SF: 5/5 passing

Issue: Salesforce→HubSpot sync not working for 2 accounts

Recommended Actions:
1. Check connector mapping: Wire_Test_1__c ↔ wire_test_1
2. Verify Salesforce field-level security for integration user
3. Review connector error logs for these specific accounts

Detailed guidance in report: ./wire-test-reports/...
```

## POST-TEST ACTIONS

After test completes:

1. **Review PDF report** - Share with stakeholders
2. **Implement top 3 recommendations** - Prioritized actions
3. **Re-test after fixes** - Verify improvements
4. **Schedule periodic tests** - Monitor sync health over time

## INTEGRATION WITH OTHER COMMANDS

**Related Commands:**
- `/asana-link` - Link test results to project tracking
- `/asana-update` - Post test summary to Asana tasks
- Use diagram-generator agent - Visualize sync architecture

## TECHNICAL NOTES

**Test Duration**:
- Minimal (1-2 accounts): 5-10 minutes
- Moderate (5-10 accounts): 15-30 minutes
- Large (20+ accounts): 30-60 minutes

**API Rate Limits**:
- Salesforce: Respects org API limits
- HubSpot: Enforces 100 requests/10 seconds
- No risk of exceeding limits with default settings

**Data Safety**:
- ✅ Only modifies Wire Test fields (non-business data)
- ✅ Never modifies Sync Anchor after initial creation
- ✅ Append-only to ID history fields
- ✅ Optional revert of Wire Test changes

## SUCCESS CRITERIA

Test is considered successful when:
- ✅ At least 1 bidirectional probe executed
- ✅ Reports generated (JSON + Markdown + PDF)
- ✅ Guidance provided for any failures
- ✅ User understands next steps

## SUPPORT & TROUBLESHOOTING

**Documentation**:
- Full spec: `.claude-plugins/cross-platform-plugin/templates/wire-test/README.md`
- Library docs: See individual script files in `scripts/lib/`

**Common Issues**:
- Connector mappings not configured → See setup-only mode
- SLA too short for high-volume org → Increase --sla-seconds
- Collisions detected → Follow deduplication guidance

**Feedback**:
- Submit issues: Use `/reflect` command
- GitHub: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

---

**Version**: 1.0.0
**Last Updated**: 2025-11-07
**Agent**: live-wire-sync-test-orchestrator
