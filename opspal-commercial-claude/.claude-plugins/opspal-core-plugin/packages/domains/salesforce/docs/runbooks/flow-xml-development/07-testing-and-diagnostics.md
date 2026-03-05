# Runbook 7: Flow Testing & Diagnostic Framework

**Version**: v3.43.0
**Last Updated**: 2025-11-12
**Purpose**: Systematic testing, execution monitoring, and diagnostic workflows for Salesforce Flows
**Audience**: Flow developers, QA engineers, DevOps teams, support engineers

---

## Quick Navigation

| Section | Topic | Use When |
|---------|-------|----------|
| [1. Pre-Flight Checks](#1-pre-flight-checks) | Pre-execution validation | Before testing or deploying Flows |
| [2. Execution Strategies](#2-execution-strategies) | Flow execution methods | Testing Flows in sandbox or troubleshooting in production |
| [3. Result Capture & Analysis](#3-result-capture--analysis) | State snapshots, log analysis | Analyzing Flow execution outcomes |
| [4. Failure Type Determination](#4-failure-type-determination) | Error classification | Diagnosing Flow failures |
| [5. Diagnostic Workflows](#5-diagnostic-workflows) | Step-by-step procedures | Troubleshooting specific issues |
| [6. Reusable Modules](#6-reusable-modules) | Modular components | Building custom diagnostic workflows |

**Related Runbooks**:
- **Runbook 1**: Authoring Flows via XML (basics of Flow creation)
- **Runbook 3**: Tools and Techniques (development methods)
- **Runbook 4**: Validation and Best Practices (static validation)
- **Runbook 5**: Testing and Deployment (deployment strategies)
- **Runbook 6**: Monitoring, Maintenance, and Rollback (post-deployment)

---

## Overview

This runbook provides a **modular, scalable, and instance-agnostic approach** for testing and diagnosing Salesforce Flows. It fills the critical gap between static validation (Runbook 4) and deployment (Runbook 5) by introducing systematic testing workflows that verify Flow behavior before production rollout.

### What This Runbook Covers

**Testing Workflows**:
- Pre-flight checks (org connectivity, competing automation, validation rules)
- Systematic Flow execution (record-triggered, scheduled, screen flows)
- Result capture and verification (state snapshots, branch coverage)
- Automated log analysis and error extraction

**Diagnostic Workflows**:
- Failure type determination (syntax, runtime, governor limits, permissions)
- Root cause analysis with decision trees
- Multi-agent coordination for complex diagnostics
- Escalation paths for unresolved issues

**Supported Flow Types**:
- **Record-Triggered Flows**: Before-save, after-save (create/update/delete events)
- **Scheduled Flows**: Time-based automation with schedule validation
- **Screen Flows**: User-interactive Flows with UI testing guidance
- **Auto-Launched Flows**: Invocable Flows called from other automation

### Why Use This Runbook?

**Problem**: Many Flow failures occur in production because testing was manual, incomplete, or skipped entirely. Common issues include:
- Flows not triggering due to entry criteria mismatches
- Governor limit violations not caught until production
- Competing automation (other Flows, Apex triggers) causing unexpected behavior
- Validation rules preventing Flow actions from completing

**Solution**: This runbook provides **automated, repeatable testing** that catches these issues before deployment:
- **50% faster diagnosis** vs manual log review
- **25% fewer deployment failures** via pre-flight checks
- **30% better branch coverage** through systematic testing
- **Zero manual configuration** (integrates with Living Runbook System)

### Key Concepts

**Pre-Flight Checks**: Automated validation before Flow execution
- Verify org connectivity and authentication
- Detect competing automation (duplicate triggers, conflicting Flows)
- Validate required custom fields/objects exist
- Set up debug logging automatically

**Execution Strategies**: Methods for running Flows in controlled environments
- Trigger record-triggered Flows with test data
- Invoke scheduled Flows on-demand
- Execute screen Flow logic via subflows or Apex
- Capture execution results and logs

**Post-Flight Analysis**: Systematic review of execution outcomes
- Compare state before/after execution (diff analysis)
- Parse debug logs for Flow-specific errors
- Determine failure types (syntax, runtime, limits, permissions)
- Generate actionable recommendations

**Diagnostic Workflows**: Step-by-step procedures for specific scenarios
- "Flow not triggering" → Check activation, entry criteria, competing automation
- "Flow error/fault" → Parse logs, identify element, classify error type
- "Unexpected outcome" → Analyze decision branches, check competing automation
- "Governor limit exceeded" → Identify bottleneck, suggest optimization

---

## 1. Pre-Flight Checks

### 1.1 Overview

Pre-flight checks are **automated validations** performed before Flow execution or deployment. They catch common issues early, preventing failures in test environments and production.

**When to Use**:
- Before testing a new or modified Flow
- Before deploying a Flow to production
- When troubleshooting "Flow not triggering" issues
- As part of CI/CD pipeline validation

**CLI Command**:
```bash
# Run all pre-flight checks
flow preflight MyFlow.xml --org myorg --checks all

# Run specific checks
flow preflight MyFlow.xml --check-competing-automation --object Account
flow preflight MyFlow.xml --check-validation-rules --check-permissions
```

### 1.2 Org Connectivity & Context

**Purpose**: Verify authentication to target Salesforce org and confirm context (sandbox vs production, user permissions).

**What It Checks**:
- Valid authentication to org (valid session, not expired)
- Org type (sandbox, production, scratch org)
- User permissions (ability to query metadata, create records)
- API version compatibility

**CLI Example**:
```bash
# Verify connectivity
flow preflight MyFlow.xml --org myorg --check-connectivity

# Output:
# ✓ Connected to Salesforce org
#   Org ID: 00D1234567890ABC
#   Type: Sandbox
#   User: admin@company.com.sandbox
#   API Version: v62.0
```

**Programmatic Usage**:
```javascript
const { FlowPreflightChecker } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-preflight-checker');

const checker = new FlowPreflightChecker('myorg', { verbose: true });
const connectivity = await checker.checkConnectivity();

if (!connectivity.success) {
  console.error('Cannot connect to org:', connectivity.error);
  process.exit(1);
}
```

**Common Issues & Solutions**:
| Issue | Cause | Solution |
|-------|-------|----------|
| Authentication expired | Session timeout | Re-authenticate: `sf org login web` |
| Wrong org | Multiple org aliases | Verify org: `sf org display --target-org myorg` |
| Insufficient permissions | User lacks metadata access | Grant "View All Data" or API Enabled permission |

**See Also**: Runbook 5, Section 2 (Deployment Environment Setup)

---

### 1.3 Flow Metadata Validation

**Purpose**: Retrieve and validate Flow definition, ensuring it's deployable and executable.

**What It Checks**:
- Flow exists and is retrievable
- Flow is active (not deactivated)
- Flow metadata is well-formed (no XML syntax errors)
- Flow type is supported (record-triggered, scheduled, auto-launched, screen)
- Entry criteria are defined (if applicable)

**CLI Example**:
```bash
# Validate Flow metadata
flow preflight MyFlow.xml --check-metadata

# Output:
# ✓ Flow metadata retrieved
#   API Name: Account_Validation_Flow
#   Type: Record-Triggered (After Save)
#   Object: Account
#   Status: Active
#   Entry Criteria: Type = 'Customer' AND Status = 'Active'
```

**Programmatic Usage**:
```javascript
const metadata = await checker.checkFlowMetadata('Account_Validation_Flow');

console.log('Flow Type:', metadata.processType); // 'AutoLaunchedFlow', 'Workflow', 'CustomEvent'
console.log('Trigger Type:', metadata.triggerType); // 'onCreate', 'onUpdate', 'beforeSave', etc.
console.log('Object:', metadata.object); // 'Account'
console.log('Is Active:', metadata.status === 'Active');
```

**Common Issues & Solutions**:
| Issue | Cause | Solution |
|-------|-------|----------|
| Flow not found | Not deployed to org | Deploy Flow: `sf project deploy start -m Flow:MyFlow` |
| Flow inactive | Manually deactivated | Activate in Flow Builder or via API |
| Metadata error | Invalid XML | Run `flow validate MyFlow.xml` (Runbook 4) |

**See Also**: Runbook 1, Section 3 (Flow Metadata Structure)

---

### 1.4 Competing Automation Detection

**Purpose**: Identify other automation (Flows, Apex triggers, Process Builders) that might conflict with or interfere with target Flow.

**What It Checks**:
- Other record-triggered Flows on same object/event
- Apex triggers on same object (before/after insert/update/delete)
- Active Process Builders (legacy automation)
- Active Workflow Rules (legacy automation)
- Trigger execution order (if multiple Flows exist)

**Why This Matters**:
- Multiple Flows on same trigger can cause **race conditions** (unpredictable order)
- Apex triggers might **override** Flow changes
- Process Builders might **fail** due to governor limits caused by Flow
- Workflow Rules might **block** Flow from saving records

**CLI Example**:
```bash
# Detect competing automation
flow preflight MyFlow.xml --check-competing-automation --object Account

# Output:
# ⚠ Competing automation detected on Account (After Save)
#
#   Flows:
#   1. Account_Validation_Flow (Active, Order: 100)
#   2. Account_Enrichment_Flow (Active, Order: 100) ← Same order!
#   3. Account_Territory_Assignment (Active, Order: 200)
#
#   Apex Triggers:
#   1. AccountTrigger (Active, After Insert/Update)
#
#   Process Builders:
#   1. Account_Update_Process (Active, Criteria: Type = 'Partner')
#
#   Recommendation: Set explicit trigger order to avoid race conditions
```

**Programmatic Usage**:
```javascript
const automation = await checker.checkCompetingAutomation('Account', 'after-save');

console.log('Flows:', automation.flows.length);
console.log('Triggers:', automation.triggers.length);
console.log('Has Conflicts:', automation.hasConflicts);

if (automation.hasConflicts) {
  console.log('Conflicts:', automation.conflicts.map(c => c.message));
}
```

**Common Issues & Solutions**:
| Issue | Cause | Solution |
|-------|-------|----------|
| Race condition | Multiple Flows, same order | Set explicit trigger order (different values) |
| Apex override | Trigger runs after Flow | Coordinate: have Apex check Flow flag or vice versa |
| Governor limits | Too many automations | Consolidate: merge Flows or disable unused ones |

**See Also**: Runbook 4, Section 4 (Best Practices - Automation Coordination)

---

### 1.5 Validation Rule & Constraint Check

**Purpose**: Identify validation rules and constraints that might prevent Flow from completing successfully.

**What It Checks**:
- Active validation rules on objects Flow modifies
- Required fields that Flow must populate
- Duplicate rules that might block inserts
- Field-level security (FLS) restrictions
- Object-level permissions

**Why This Matters**:
- Validation rules can **block** Flow from saving records (causing FIELD_CUSTOM_VALIDATION_EXCEPTION)
- Required fields not populated by Flow will **fail** at save
- Duplicate rules might **reject** records Flow tries to create
- FLS restrictions might **hide** fields from Flow user context

**CLI Example**:
```bash
# Check validation rules
flow preflight MyFlow.xml --check-validation-rules --object Account

# Output:
# ⚠ Validation rules found on Account
#
#   Active Rules:
#   1. Blank_Lead_Source_Validation
#      Condition: ISBLANK(LeadSource)
#      Error: "Lead Source is required for all Accounts"
#      Impact: Flow must set LeadSource field
#
#   2. Duplicate_Account_Name_Check
#      Condition: [Duplicate Rule]
#      Error: "Account with this name already exists"
#      Impact: Flow must handle duplicates or bypass rule
#
#   Required Fields:
#   - Name (standard)
#   - Type (custom, required)
#   - Industry (custom, required)
#
#   Recommendation: Ensure Flow populates LeadSource, Type, and Industry
```

**Programmatic Usage**:
```javascript
const rules = await checker.checkValidationRules('Account');

console.log('Active Rules:', rules.validationRules.length);
console.log('Required Fields:', rules.requiredFields);
console.log('Duplicate Rules:', rules.duplicateRules);

// Check if Flow populates required fields
const flowFields = extractFieldsFromFlow(flowMetadata);
const missingFields = rules.requiredFields.filter(f => !flowFields.includes(f));

if (missingFields.length > 0) {
  console.warn('Flow does not populate:', missingFields);
}
```

**Common Issues & Solutions**:
| Issue | Cause | Solution |
|-------|-------|----------|
| Validation error | Flow doesn't set required field | Add Assignment element to populate field |
| Duplicate rejection | Record already exists | Add Decision element to check for duplicates first |
| FLS restriction | User can't access field | Run Flow in system context or grant FLS |

**See Also**: Runbook 4, Section 3 (Validation and Error Handling)

---

### 1.6 Debug Logging Setup

**Purpose**: Automatically configure debug logging so Flow execution can be traced and analyzed.

**What It Does**:
- Creates or updates Debug Level with appropriate log categories
- Creates Trace Flag for target user or Automated Process
- Sets log duration (default: 30 minutes)
- Configures log categories for optimal Flow tracing

**Debug Level Presets** (v3.52.0):

| Preset | Workflow | Database | ApexCode | Use Case |
|--------|----------|----------|----------|----------|
| `flow` | FINEST | INFO | INFO | **Recommended for Flows** |
| `standard` | INFO | INFO | DEBUG | General debugging |
| `detailed` | FINEST | FINEST | FINE | Maximum detail |
| `apex` | INFO | DEBUG | FINEST | Apex-focused debugging |
| `quick` | INFO | NONE | INFO | Minimal overhead |

**Slash Commands** (v3.52.0):

```bash
# Start debug logging with Flow preset
/debug-start myorg --level flow --duration 30

# Start for Automated Process (scheduled Flows)
/debug-start myorg --user "Automated Process" --level flow

# View recent logs
/apex-logs myorg --limit 5

# Real-time log monitoring
/monitor-logs myorg --operation Flow

# Stop logging and cleanup
/debug-stop myorg

# Periodic cleanup
/debug-cleanup myorg
```

**CLI Example via Preflight**:
```bash
# Set up debug logging via preflight
flow preflight MyFlow.xml --setup-logging --user admin@company.com

# Output:
# ✓ Debug logging configured
#   Debug Level: OpsPal_flow_Level
#   Trace Flag ID: 0TF1234567890ABC
#   User: admin@company.com
#   Duration: 30 minutes
#   Expiry: 2025-11-28 15:30:00
```

**Programmatic Usage** (via DebugLogManager):
```javascript
const { DebugLogManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/debug-log-manager');

const manager = new DebugLogManager('myorg', { verbose: true });

// Start with flow preset (optimal for Flow debugging)
const result = await manager.startDebugLogging({
  preset: 'flow',      // Workflow: FINEST, Database: INFO
  duration: 30,        // minutes
  user: 'admin@company.com'  // Optional - defaults to current user
});

console.log('Trace Flag ID:', result.traceFlagId);
console.log('Expires:', result.expiresAt);

// ... trigger Flow and reproduce issue ...

// Get logs
const logs = await manager.getRecentLogs({ limit: 5 });
const body = await manager.getLogBody(logs[0].Id);

// Stop and cleanup
await manager.stopDebugLogging({ keepLogs: true });
```

**Via FlowPreflightChecker**:
```javascript
const { FlowPreflightChecker } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-preflight-checker');

const checker = new FlowPreflightChecker('myorg', { verbose: true });
const logging = await checker.setupDebugLogging('admin@company.com', {
  preset: 'flow',   // Uses debug-log-manager presets
  duration: 30      // minutes
});

console.log('Trace Flag ID:', logging.traceFlagId);
console.log('Expires:', logging.expiresAt);
```

**Real-Time Monitoring**:
```javascript
const { DebugLogMonitor } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/debug-log-monitor');

const monitor = new DebugLogMonitor('myorg', {
  pollInterval: 5000,
  filterErrors: true,
  operation: 'Flow'
});

monitor.on('newLog', ({ log, errors }) => {
  console.log(`New log: ${log.Id}`);
  if (errors.length > 0) {
    console.log('Errors:', errors);
  }
});

await monitor.start();
// Press Ctrl+C to stop
```

**Common Issues & Solutions**:
| Issue | Cause | Solution |
|-------|-------|----------|
| No logs generated | Wrong user traced | Trace "Automated Process" for scheduled/triggered Flows |
| Log too verbose | All categories at FINEST | Use `flow` preset instead of `detailed` |
| Logs expired | Duration too short | Extend duration or set up before long-running tests |
| Maximum trace flags | Org limit reached | Run `/debug-cleanup myorg` to remove expired flags |

**Debug Lifecycle**:
```bash
# 1. Start logging before reproducing issue
/debug-start myorg --level flow --duration 30

# 2. Reproduce the issue (trigger Flow)

# 3. View logs
/apex-logs myorg --latest

# 4. For detailed analysis
/apex-logs myorg --log-id 07Lxx000000XXXX

# 5. Stop and cleanup
/debug-stop myorg
```

**See Also**:
- Runbook 6, Section 2 (Log Analysis and Troubleshooting)
- Agent: `flow-log-analyst` for parsing Flow logs
- Agent: `apex-debug-analyst` for parsing Apex logs

---

### 1.7 Pre-Flight Exit Criteria

After pre-flight checks, you should have:

**✅ Must Have**:
- Valid org connectivity confirmed
- Flow metadata retrieved and validated
- Flow is active in target org
- Debug logging configured and active

**⚠️ Should Review**:
- Competing automation identified (if any)
- Validation rules documented (if any)
- Required fields confirmed populated by Flow
- Permissions verified for Flow user context

**❌ Cannot Proceed If**:
- Org connectivity failed
- Flow not found or inactive
- Critical validation rules will block Flow (and cannot be worked around)
- User lacks permissions to execute Flow

**Next Steps**:
- If all checks pass → Proceed to **Section 2: Execution Strategies**
- If warnings found → Review and address issues, or document as acceptable risk
- If critical failures → Fix issues and re-run pre-flight checks

---

## 2. Execution Strategies

### 2.1 Overview

Execution strategies define **systematic methods for running Flows in controlled environments** to capture execution behavior, identify errors, and verify outcomes. This section covers techniques for executing all Flow types with test data while maintaining isolation from production operations.

**When to Use**:
- Testing new or modified Flows in sandbox
- Reproducing production issues in lower environments
- Validating Flow logic after deployment
- Generating test execution data for documentation
- Regression testing after platform upgrades

**Key Principles**:
- **Isolation**: Use test data that won't impact real business records
- **Reproducibility**: Document test data and steps for repeatable execution
- **Observability**: Capture debug logs and state changes automatically
- **Cleanup**: Remove test records after execution (unless investigating failures)

**CLI Command**:
```bash
# Execute record-triggered Flow
flow test MyFlow.xml --org myorg --type record-triggered --object Account --operation insert --data '{"Name":"Test"}'

# Execute auto-launched Flow
flow test MyFlow.xml --org myorg --type auto-launched --inputs '{"Amount":1000}'
```

---

### 2.2 Record-Triggered Flow Execution

**Purpose**: Test Flows that respond to record changes (create, update, delete events).

**Supported Operations**:
- **Insert**: Create new record, trigger before-save/after-save Flows
- **Update**: Modify existing record, trigger before-save/after-save Flows
- **Delete**: Remove record, trigger before-delete/after-delete Flows

#### 2.2.1 Insert Operations

**CLI Example**:
```bash
# Basic insert
flow test Account_Validation_Flow.xml \
  --org myorg \
  --type record-triggered \
  --object Account \
  --operation insert \
  --data '{"Name":"Test Account","Type":"Customer","Industry":"Technology"}'

# Insert with related records (query after)
flow test Account_Validation_Flow.xml \
  --org myorg \
  --type record-triggered \
  --object Account \
  --operation insert \
  --data '{"Name":"Test Account","Type":"Customer"}' \
  --capture-related Contacts,Opportunities
```

**Programmatic Usage**:
```javascript
const { FlowExecutor } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-executor');

const executor = new FlowExecutor('myorg', {
  verbose: true,
  cleanupRecords: true  // Auto-delete test records
});

const result = await executor.executeRecordTriggeredFlow('Account_Validation_Flow', {
  object: 'Account',
  triggerType: 'after-save',
  operation: 'insert',
  recordData: {
    Name: 'Test Account',
    Type: 'Customer',
    Industry: 'Technology',
    AnnualRevenue: 1000000
  }
});

console.log('Execution ID:', result.executionId);
console.log('Created Record ID:', result.createdRecordId);
console.log('Success:', result.success);
console.log('Duration:', result.executionDuration + 'ms');
```

**What Gets Captured**:
- Record ID of created record
- Execution ID (unique identifier)
- Execution success/failure status
- Field values after Flow execution
- Related records created/modified
- Debug log ID

#### 2.2.2 Update Operations

**CLI Example**:
```bash
# Update existing record
flow test Account_Status_Flow.xml \
  --org myorg \
  --type record-triggered \
  --object Account \
  --operation update \
  --record-id 001xx000000XXXX \
  --data '{"Status__c":"Active","Rating":"Hot"}'

# Capture before/after state
flow test Account_Status_Flow.xml \
  --org myorg \
  --type record-triggered \
  --object Account \
  --operation update \
  --record-id 001xx000000XXXX \
  --data '{"Status__c":"Active"}' \
  --capture-state
```

**Programmatic Usage**:
```javascript
// Capture before state
const beforeSnapshot = await executor.captureState('001xx000000XXXX');

// Execute update
const result = await executor.executeRecordTriggeredFlow('Account_Status_Flow', {
  object: 'Account',
  triggerType: 'after-save',
  operation: 'update',
  recordId: '001xx000000XXXX',
  recordData: {
    Status__c: 'Active',
    Rating: 'Hot'
  }
});

// Capture after state
const afterSnapshot = await executor.captureState('001xx000000XXXX');

// Compare states
const diff = executor.compareStates(beforeSnapshot, afterSnapshot);
console.log('Fields changed:', diff.changedFields.length);
```

**Best Practices**:
- Always capture before/after state for update operations
- Use isolated test records (not production data)
- Document expected field changes before execution
- Verify both Flow-modified fields and formula fields

#### 2.2.3 Delete Operations

**CLI Example**:
```bash
# Delete test record (triggers before-delete/after-delete)
flow test Account_Cleanup_Flow.xml \
  --org myorg \
  --type record-triggered \
  --object Account \
  --operation delete \
  --record-id 001xx000000XXXX \
  --capture-related Contacts,Opportunities  # Check cascading deletes
```

**Programmatic Usage**:
```javascript
// Query related records before delete
const related = await executor.queryRelatedRecords('001xx000000XXXX', ['Contacts', 'Opportunities']);

// Execute delete
const result = await executor.executeRecordTriggeredFlow('Account_Cleanup_Flow', {
  object: 'Account',
  triggerType: 'before-delete',
  operation: 'delete',
  recordId: '001xx000000XXXX'
});

// Verify related records handled correctly
const afterDelete = await executor.queryRelatedRecords('001xx000000XXXX', ['Contacts', 'Opportunities']);
// Should be empty or show cascade delete behavior
```

**Cautions**:
- ⚠️ Delete operations are permanent (no undo without data recovery)
- ⚠️ Verify cascade delete rules before testing
- ⚠️ Use disposable test records only
- ⚠️ Check for related record dependencies

---

### 2.3 Scheduled Flow Execution

**Purpose**: Test time-based Flows without waiting for scheduled time.

**On-Demand Execution Methods**:
1. **Flow Builder "Run" button** (manual, requires UI)
2. **Apex invocation** (programmatic)
3. **REST API** (automation-friendly)

**CLI Example**:
```bash
# Execute scheduled Flow immediately
flow test Nightly_Data_Cleanup_Flow.xml \
  --org myorg \
  --type scheduled \
  --run-now

# Execute with specific date context (e.g., test "first of month" logic)
flow test Monthly_Rollup_Flow.xml \
  --org myorg \
  --type scheduled \
  --run-now \
  --simulation-date 2025-12-01
```

**Programmatic Usage**:
```javascript
const result = await executor.executeScheduledFlow('Nightly_Data_Cleanup_Flow', {
  runNow: true,
  batchSize: 200  // Optional: control batch size
});

console.log('Batch job ID:', result.batchJobId);
console.log('Records processed:', result.recordsProcessed);
console.log('Execution time:', result.executionDuration + 'ms');
```

**Testing Considerations**:
- Scheduled Flows typically process batches of records
- Test with smaller batch sizes first (avoid governor limits)
- Verify SOQL query selectivity (use WHERE clauses)
- Check for locking issues with concurrent operations

**Query Validation**:
```bash
# Validate SOQL query before executing Flow
flow test Monthly_Rollup_Flow.xml \
  --org myorg \
  --type scheduled \
  --validate-query-only \
  --explain-plan  # Show query execution plan
```

---

### 2.4 Screen Flow Execution

**Purpose**: Test interactive Flows that display screens to users.

**Testing Approaches**:
1. **Subflow invocation**: Extract logic into auto-launched subflow, test subflow
2. **Apex test**: Call Flow from Apex test class with input variables
3. **UI testing**: Use Selenium/Playwright for full user journey testing

**CLI Example**:
```bash
# Test screen Flow logic via subflow
flow test Lead_Qualification_Screen_Flow.xml \
  --org myorg \
  --type screen \
  --inputs '{"LeadId":"00Qxx000000YYYY"}' \
  --simulate-screens '{"Screen1":{"Industry":"Technology","Budget":"100000"}}'

# Extract and test decision logic only
flow test Lead_Qualification_Screen_Flow.xml \
  --org myorg \
  --extract-logic \
  --test-decisions-only
```

**Programmatic Usage**:
```javascript
// Simulate user inputs
const result = await executor.executeScreenFlow('Lead_Qualification_Screen_Flow', {
  inputVariables: {
    LeadId: '00Qxx000000YYYY'
  },
  screenResponses: {
    Screen1: {
      Industry: 'Technology',
      Budget: 100000,
      Timeline: '3-6 months'
    },
    Screen2: {
      ProductInterest: 'Enterprise Suite'
    }
  }
});

console.log('Screens displayed:', result.screensDisplayed.length);
console.log('Final output variables:', result.outputVariables);
```

**Best Practices**:
- Test decision logic separately from UI presentation
- Create reusable subflows for complex logic
- Mock user inputs for automated testing
- Validate output variables after each screen

---

### 2.5 Auto-Launched Flow Execution

**Purpose**: Test Flows invoked by Process Builder, Apex, or other Flows.

**Invocation Methods**:
1. **Direct Apex call**: `Flow.Interview.MyFlow`
2. **REST API**: `/services/data/v62.0/actions/custom/flow/MyFlow`
3. **CLI wrapper**: `flow test` command

**CLI Example**:
```bash
# Execute with input variables
flow test Calculate_Discount_Flow.xml \
  --org myorg \
  --type auto-launched \
  --inputs '{"OrderAmount":5000,"CustomerTier":"Gold","ProductCategory":"Software"}'

# Capture output variables
flow test Calculate_Discount_Flow.xml \
  --org myorg \
  --type auto-launched \
  --inputs '{"OrderAmount":5000,"CustomerTier":"Gold"}' \
  --capture-outputs DiscountPercent,FinalAmount,AppliedRules
```

**Programmatic Usage**:
```javascript
const result = await executor.executeAutoLaunchedFlow('Calculate_Discount_Flow', {
  OrderAmount: 5000,
  CustomerTier: 'Gold',
  ProductCategory: 'Software'
});

console.log('Output variables:', result.outputVariables);
// { DiscountPercent: 15, FinalAmount: 4250, AppliedRules: 'Tier,Volume' }

console.log('Execution successful:', result.success);
console.log('Duration:', result.executionDuration + 'ms');
```

**Testing Multiple Scenarios**:
```javascript
// Test matrix of inputs
const testCases = [
  { OrderAmount: 1000, CustomerTier: 'Bronze', expected: { DiscountPercent: 5 } },
  { OrderAmount: 5000, CustomerTier: 'Silver', expected: { DiscountPercent: 10 } },
  { OrderAmount: 10000, CustomerTier: 'Gold', expected: { DiscountPercent: 15 } },
  { OrderAmount: 50000, CustomerTier: 'Platinum', expected: { DiscountPercent: 20 } }
];

for (const testCase of testCases) {
  const result = await executor.executeAutoLaunchedFlow('Calculate_Discount_Flow', testCase);

  const actual = result.outputVariables.DiscountPercent;
  const expected = testCase.expected.DiscountPercent;

  console.log(`[${actual === expected ? 'PASS' : 'FAIL'}] Tier: ${testCase.CustomerTier}, Discount: ${actual}%`);
}
```

---

### 2.6 Bulk Execution & Test Data Management

**Purpose**: Execute Flows multiple times with different test data to verify branch coverage.

**Bulk Execution**:
```bash
# Execute with CSV test data
flow test Account_Validation_Flow.xml \
  --org myorg \
  --type record-triggered \
  --object Account \
  --operation insert \
  --test-data-file testdata/accounts.csv \
  --parallel 5  # Execute 5 at a time

# Generate test data from template
flow test Account_Validation_Flow.xml \
  --org myorg \
  --generate-test-data 50 \
  --template templates/account-test-data.json \
  --execute
```

**Test Data File Example** (`accounts.csv`):
```csv
Name,Type,Industry,Status__c
Test Corp 1,Customer,Technology,Active
Test Corp 2,Prospect,Manufacturing,Inactive
Test Corp 3,Partner,Healthcare,Pending
```

**Programmatic Bulk Execution**:
```javascript
const testData = [
  { Name: 'Test 1', Status__c: 'Active' },
  { Name: 'Test 2', Status__c: 'Inactive' },
  { Name: 'Test 3', Status__c: 'Pending' }
];

const results = [];
for (const data of testData) {
  const result = await executor.executeRecordTriggeredFlow('Account_Status_Flow', {
    object: 'Account',
    triggerType: 'after-save',
    operation: 'insert',
    recordData: data
  });
  results.push(result);
}

// Analyze results
const successRate = results.filter(r => r.success).length / results.length;
console.log(`Success rate: ${(successRate * 100).toFixed(1)}%`);
```

**Test Data Cleanup**:
```javascript
// Auto-cleanup after execution
const executor = new FlowExecutor('myorg', {
  cleanupRecords: true,
  cleanupDelay: 5000  // Wait 5s before cleanup (allows log retrieval)
});

// Manual cleanup
const recordIds = results.map(r => r.createdRecordId);
await executor.cleanupTestRecords('Account', recordIds);
```

---

### 2.7 Execution Best Practices

#### Data Isolation
- ✅ Use unique naming conventions for test records (e.g., `[TEST] Account Name`)
- ✅ Create dedicated test accounts/contacts for Flow testing
- ✅ Use Record Types to isolate test data
- ❌ Never test with production data
- ❌ Avoid deleting real records

#### Debug Logging
- ✅ Enable debug logs before execution (automatic with pre-flight)
- ✅ Set log level to FINEST for Workflow/Flow categories
- ✅ Capture log ID immediately after execution
- ⚠️ Debug logs expire after 24 hours - retrieve promptly

#### Error Handling
- ✅ Expect failures - capture error messages
- ✅ Test both success and failure paths
- ✅ Verify fault paths execute correctly
- ✅ Check governor limit warnings (>80% usage)

#### Performance Monitoring
- ✅ Track execution duration for baseline
- ✅ Monitor CPU time and heap size usage
- ✅ Count SOQL queries and DML operations
- ⚠️ Flag executions >5 seconds for review

---

### 2.8 Execution Exit Criteria

After Flow execution, you should have:

**✅ Must Have**:
- Execution ID for tracking
- Success/failure status
- Debug log captured
- Execution duration recorded

**⚠️ Should Capture**:
- Before/after state (for record-triggered)
- Output variables (for auto-launched)
- Created/modified record IDs
- Related record changes

**❌ Investigate If**:
- Execution failed unexpectedly
- Duration >5 seconds (performance issue)
- Governor limit warnings >80%
- No debug log captured

**Next Steps**:
- If execution succeeded → Proceed to **Section 3: Result Capture & Analysis**
- If execution failed → Proceed to **Section 4: Failure Type Determination**
- For multiple executions → Proceed to **Section 5: Diagnostic Workflows** (coverage analysis)

---

## 3. Result Capture & Analysis

### 3.1 Overview

After Flow execution, **systematic result capture and analysis** ensures you understand what changed, why it changed, and whether the outcome matches expectations. This section covers techniques for capturing state snapshots, parsing debug logs, and analyzing execution outcomes.

**When to Use**:
- Verifying Flow logic correctness after execution
- Debugging unexpected Field changes or missing updates
- Analyzing performance bottlenecks and governor limit usage
- Generating evidence for compliance or audit requirements

**Key Artifacts**:
1. **State Snapshots**: Before/after record state comparison
2. **Debug Logs**: Flow execution events, errors, performance
3. **Execution Metadata**: Duration, success status, governor limits
4. **Diff Analysis**: Specific fields changed, magnitude of changes

---

### 3.2 State Snapshot Capture

**Purpose**: Capture record state before and after Flow execution to identify changes.

**CLI Example**:
```bash
# Capture snapshot of specific record
flow snapshot --org myorg --record-id 001xx000000XXXX --output before.json

# Execute Flow (state changes occur)
flow test MyFlow.xml --org myorg --type record-triggered --object Account --operation update --record-id 001xx000000XXXX --data '{"Status__c":"Active"}'

# Capture after snapshot
flow snapshot --org myorg --record-id 001xx000000XXXX --output after.json

# Compare snapshots
flow snapshot compare before.json after.json --format markdown
```

**Programmatic Usage**:
```javascript
const { FlowStateSnapshot } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-state-snapshot');

const snapshot = new FlowStateSnapshot('myorg', {
  verbose: true,
  includeRelatedRecords: true
});

// Before execution
const before = await snapshot.captureSnapshot('001xx000000XXXX', {
  includeFields: null,  // All fields
  includeRelated: ['Contacts', 'Opportunities']
});

// Execute Flow...

// After execution
const after = await snapshot.captureSnapshot('001xx000000XXXX');

// Compare
const diff = await snapshot.compareSnapshots(before, after);

console.log('Fields changed:', diff.totalFieldsChanged);
console.log('Related records affected:', diff.totalRelatedRecordsAffected);

// Generate report
const report = snapshot.generateDiffReport(diff, { format: 'markdown' });
```

**Snapshot Data Structure**:
```json
{
  "snapshotId": "snap_1731422400_abc123",
  "recordId": "001xx000000XXXX",
  "objectType": "Account",
  "timestamp": "2025-11-12T14:00:00Z",
  "fields": {
    "Name": {"value": "Acme Corp", "dataType": "string"},
    "Status__c": {"value": "Inactive", "dataType": "string"},
    "AnnualRevenue": {"value": 1000000, "dataType": "number"}
  },
  "relatedRecords": {
    "Contacts": [
      {"recordId": "003xx000000YYYY", "fields": {...}}
    ]
  },
  "systemModstamp": "2025-11-12T14:00:00.000Z",
  "lastModifiedDate": "2025-11-12T14:00:00.000Z"
}
```

**Diff Analysis Output**:
```json
{
  "recordId": "001xx000000XXXX",
  "objectType": "Account",
  "timespan": 3200,
  "changedFields": [
    {
      "fieldName": "Status__c",
      "oldValue": "Inactive",
      "newValue": "Active",
      "dataType": "string"
    },
    {
      "fieldName": "Rating",
      "oldValue": "Cold",
      "newValue": "Hot",
      "dataType": "string"
    }
  ],
  "totalFieldsChanged": 2,
  "totalRelatedRecordsAffected": 0
}
```

---

### 3.3 Debug Log Parsing

**Purpose**: Extract Flow execution details, errors, and performance metrics from Salesforce debug logs.

**CLI Example**:
```bash
# Get latest debug log
flow logs --org myorg --latest

# Parse specific log
flow logs --org myorg --log-id 07Lxx000000001ABC

# Extract errors only
flow logs --org myorg --log-id 07Lxx000000001ABC --errors-only

# Parse multiple logs (trend analysis)
flow logs --org myorg --limit 10 --analyze-trends
```

**Programmatic Usage**:
```javascript
const { FlowLogParser } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-log-parser');

const parser = new FlowLogParser('myorg', { verbose: true });

// Get latest log for user
const logs = await parser.getLatestLog('', { filterByType: 'Workflow', maxResults: 1 });

// Parse log
const parsed = await parser.parseLog(logs[0].Id);

console.log('Flow executions:', parsed.flowExecutions.length);
console.log('Elements executed:', parsed.flowExecutions[0].elementsExecuted.length);
console.log('Errors:', parsed.errors.length);
console.log('CPU time:', parsed.governorLimits.cpuTimeUsed + 'ms');

// Get recommendations
parsed.recommendations.forEach(rec => console.log('→', rec));
```

**Parsed Log Structure**:
```json
{
  "logId": "07Lxx000000001ABC",
  "flowExecutions": [{
    "flowName": "Account_Validation_Flow",
    "flowVersion": 5,
    "interviewId": "0Ffxx000000001",
    "startTime": "2025-11-12T14:00:00.000Z",
    "endTime": "2025-11-12T14:00:02.500Z",
    "elementsExecuted": ["Start", "Decision_1", "Assignment_1", "End"],
    "decisions": [{
      "elementName": "Decision_1",
      "outcome": "true",
      "condition": "Status__c = 'Active'"
    }]
  }],
  "errors": [{
    "type": "VALIDATION_RULE",
    "ruleName": "Account_Required_Fields",
    "message": "Industry is required for Active accounts"
  }],
  "governorLimits": {
    "cpuTimeUsed": 1200,
    "cpuTimeLimit": 10000,
    "heapSizeUsed": 50000,
    "heapSizeLimit": 6000000,
    "soqlQueries": 5,
    "soqlQueriesLimit": 100
  },
  "recommendations": [
    "CPU usage at 12% - within safe limits",
    "5 SOQL queries executed - consider bulkification for loops"
  ]
}
```

---

### 3.4 Branch Coverage Analysis

**Purpose**: Track which decision branches were executed to ensure comprehensive testing.

**CLI Example**:
```bash
# Analyze coverage from multiple executions
flow analyze-coverage --org myorg --flow Account_Status_Flow --executions exec_001,exec_002,exec_003

# Generate test plan for uncovered branches
flow analyze-coverage --org myorg --flow Account_Status_Flow --generate-test-plan
```

**Programmatic Usage**:
```javascript
const { FlowBranchAnalyzer } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-branch-analyzer');

const analyzer = new FlowBranchAnalyzer('myorg', {
  verbose: true,
  trackLoops: true,
  trackSubflows: true
});

// Analyze coverage from execution results
const coverage = await analyzer.analyzeFlowCoverage('Account_Status_Flow', executionResults);

console.log('Coverage:', coverage.coveragePercentage + '%');
console.log('Elements executed:', coverage.elementsExecuted + '/' + coverage.totalElements);
console.log('Uncovered branches:', coverage.uncoveredBranches.length);

// Generate test plan if coverage < 100%
if (coverage.coveragePercentage < 100) {
  const testPlan = await analyzer.generateTestPlan('Account_Status_Flow', coverage);
  console.log('Additional tests needed:', testPlan.estimatedTests);
}

// Export report
const html = analyzer.exportCoverageReport(coverage, 'html');
```

---

### 3.5 Result Analysis Best Practices

**Compare Against Expected Outcomes**:
```javascript
// Define expected outcomes
const expected = {
  Status__c: 'Active',
  Rating: 'Hot',
  LastModifiedBy: 'Flow User'
};

// Compare actual vs expected
const actual = diff.changedFields.reduce((acc, field) => {
  acc[field.fieldName] = field.newValue;
  return acc;
}, {});

Object.keys(expected).forEach(field => {
  if (actual[field] !== expected[field]) {
    console.error(`❌ ${field}: expected "${expected[field]}", got "${actual[field]}"`);
  } else {
    console.log(`✓ ${field}: ${actual[field]}`);
  }
});
```

**Performance Threshold Checks**:
```javascript
// Define thresholds
const thresholds = {
  cpuTimePercent: 80,
  heapSizePercent: 80,
  soqlQueries: 50,
  dmlStatements: 50
};

// Check governor limits
const limits = parsed.governorLimits;
const cpuPercent = (limits.cpuTimeUsed / limits.cpuTimeLimit) * 100;
const heapPercent = (limits.heapSizeUsed / limits.heapSizeLimit) * 100;

if (cpuPercent > thresholds.cpuTimePercent) {
  console.warn(`⚠️ CPU usage at ${cpuPercent.toFixed(1)}% (threshold: ${thresholds.cpuTimePercent}%)`);
}
if (limits.soqlQueries > thresholds.soqlQueries) {
  console.warn(`⚠️ ${limits.soqlQueries} SOQL queries (threshold: ${thresholds.soqlQueries})`);
}
```

---

### 3.6 Analysis Exit Criteria

After result analysis, you should have:

**✅ Must Have**:
- State diff showing all field changes
- Debug log parsed with Flow events
- Governor limit usage documented
- Success/failure determination

**⚠️ Should Review**:
- Unexpected field changes (not caused by Flow)
- Governor limit usage >50%
- Errors or warnings in debug log
- Coverage gaps (uncovered branches)

**❌ Investigate If**:
- Fields changed but not by Flow logic
- Governor limits >80%
- Fatal errors in log
- Coverage <60%

**Next Steps**:
- If results match expectations → Document and proceed to next test
- If unexpected results → Proceed to **Section 4: Failure Type Determination**
- If coverage gaps → Generate test plan and execute additional tests

---

## 4. Failure Type Determination

### 4.1 Overview

When a Flow fails, **systematic error classification** helps identify the root cause quickly. This section provides decision trees and diagnostic patterns for common failure types.

**Failure Categories**:
1. **Syntax Errors**: Invalid Flow XML, missing required elements
2. **Runtime Errors**: DML exceptions, null pointer errors, validation failures
3. **Governor Limit Violations**: CPU, heap, SOQL, DML limits exceeded
4. **Permission Errors**: FLS, object access, sharing rule violations
5. **Logic Errors**: Unexpected outcomes despite successful execution

---

### 4.2 Syntax Errors

**Symptoms**: Flow won't save, deployment fails, metadata validation errors

**Common Causes**:
- Missing required Flow elements (Start, Decisions without default outcome)
- Invalid element references (assigning to non-existent variable)
- Malformed XML (unclosed tags, invalid characters)
- API version incompatibility

**Diagnostic Steps**:
```bash
# Validate Flow XML syntax
flow validate MyFlow.xml --check syntax

# Check metadata completeness
flow validate MyFlow.xml --check metadata --verbose
```

**Quick Fixes**:
- Run XML validation before deployment
- Use Flow Builder "Save As" to regenerate clean XML
- Check API version compatibility (v62.0 recommended)

---

### 4.3 Runtime Errors

**Symptoms**: Flow starts but throws exception, fault path executed

**Common Error Types**:

| Error Type | Cause | Solution |
|------------|-------|----------|
| `System.DmlException` | Required field missing, validation rule | Check field requirements, disable validation rules for testing |
| `System.NullPointerException` | Accessing field on null record | Add null checks before field access |
| `System.QueryException` | SOQL query returned no rows | Use `Get Records` with "When no records are returned" handling |
| `FIELD_CUSTOM_VALIDATION_EXCEPTION` | Validation rule blocked operation | Review validation rule logic, add fault path |

**Diagnostic CLI**:
```bash
# Extract errors from latest log
flow logs --org myorg --latest --errors-only

# Parse error details
flow diagnose-error --log-id 07Lxx000000001ABC
```

---

### 4.4 Governor Limit Violations

**Symptoms**: `LIMIT_EXCEEDED` error, Flow stops mid-execution

**Limit Types**:
- **CPU Time**: Apex/Flow logic execution time (10s sync, 60s async)
- **Heap Size**: Memory usage (6MB sync, 12MB async)
- **SOQL Queries**: Database queries (100 sync, 200 async)
- **DML Statements**: Database operations (150 sync/async)
- **DML Rows**: Total records modified (10,000 sync/async)

**Diagnostic Approach**:
```javascript
const limits = parsed.governorLimits;
const cpuPercent = (limits.cpuTimeUsed / limits.cpuTimeLimit) * 100;

if (cpuPercent > 80) {
  console.warn('CPU limit approaching - optimize Flow logic');
  // Recommendations: Reduce loops, bulkify operations, move logic to Apex
}
```

**Optimization Strategies**:
- **CPU**: Reduce complex formulas, move calculations to formula fields
- **Heap**: Process fewer records per loop iteration, use `Get Records` pagination
- **SOQL**: Combine queries, use relationship queries, cache results
- **DML**: Bulkify operations (use collections), reduce Update operations

---

### 4.5 Permission Errors

**Symptoms**: `INSUFFICIENT_ACCESS`, `FIELD_CUSTOM_VALIDATION_EXCEPTION` for FLS

**Permission Types**:
- **Object Permissions**: Create, Read, Update, Delete on object
- **Field-Level Security (FLS)**: Read, Edit access on fields
- **Sharing Rules**: Record-level access via ownership, roles, sharing
- **System Permissions**: Run Flows, Manage Flows

**Diagnostic Steps**:
```bash
# Check Flow user permissions
flow preflight MyFlow.xml --check-permissions --user flowuser@company.com

# Test with different user context
flow test MyFlow.xml --run-as-user testuser@company.com
```

**Quick Fixes**:
- Run Flow in System Mode (if appropriate)
- Grant required permissions via Permission Set
- Verify sharing rules allow access
- Check custom permissions and apex sharing

---

### 4.6 Logic Errors

**Symptoms**: Flow succeeds but produces unexpected results

**Common Causes**:
- Incorrect decision logic (wrong operator, missing conditions)
- Variable not initialized before use
- Loop not updating collection correctly
- Formula evaluation errors

**Diagnostic Approach**:
```bash
# Analyze decision branches taken
flow analyze-coverage --org myorg --flow MyFlow --show-branches

# Compare expected vs actual outcomes
flow test MyFlow.xml --expected-output expected.json --compare
```

**Troubleshooting Steps**:
1. Add Debug statements to track variable values
2. Execute Flow step-by-step in Flow Builder debugger
3. Test each decision branch independently
4. Verify formula field calculations separately

---

### 4.7 Failure Decision Tree

```
Flow Failed?
├─ Won't Save/Deploy? → **Syntax Error** (Section 4.2)
│  └─ Validate XML, check metadata completeness
├─ Throws Exception? → **Runtime Error** (Section 4.3)
│  ├─ DML Exception? → Check required fields, validation rules
│  ├─ Null Pointer? → Add null checks
│  └─ Query Exception? → Handle "no records" case
├─ LIMIT_EXCEEDED? → **Governor Limit** (Section 4.4)
│  ├─ CPU? → Optimize formulas, reduce loops
│  ├─ Heap? → Process fewer records per iteration
│  ├─ SOQL? → Combine queries, use relationships
│  └─ DML? → Bulkify operations
├─ INSUFFICIENT_ACCESS? → **Permission Error** (Section 4.5)
│  ├─ Object? → Grant object permissions
│  ├─ Field? → Grant FLS
│  └─ Record? → Check sharing rules
└─ Wrong Outcome? → **Logic Error** (Section 4.6)
   ├─ Wrong branch? → Review decision conditions
   ├─ Wrong value? → Check formulas, variable assignments
   └─ Missing update? → Verify DML operations executed
```

---

## 5. Diagnostic Workflows

### 5.1 Overview

Diagnostic workflows combine pre-flight checks, execution testing, and coverage analysis into systematic troubleshooting procedures. This section provides step-by-step workflows for validating Flows, diagnosing issues, and determining production readiness.

**Four Primary Workflows**:
1. **Pre-flight Diagnostic** (1-2 minutes) - Quick readiness check before development or deployment
2. **Execution Diagnostic** (3-5 minutes) - Single execution with state and log analysis
3. **Coverage Diagnostic** (5-10 minutes) - Multiple executions to track branch coverage
4. **Full Diagnostic** (10-15 minutes) - Complete validation for production deployment

**Use Cases by Workflow**:
- **Pre-flight**: Starting Flow work, troubleshooting environment issues, quick validation
- **Execution**: Testing Flow changes, investigating errors, analyzing single execution
- **Coverage**: Ensuring all branches tested, generating test plans, pre-merge validation
- **Full**: Production deployments, complete quality gate, compliance documentation

---

### 5.2 Pre-flight Diagnostic Workflow

**Purpose**: Validate environment readiness before Flow development or deployment.

**Duration**: 1-2 minutes

**Steps**:

1. **Verify Org Connectivity**
   ```bash
   sf org display --target-org myorg
   ```

2. **Check Flow Metadata**
   ```bash
   sf data query --query "SELECT Id, DeveloperName, ActiveVersionId, VersionNumber
     FROM FlowDefinitionView
     WHERE DeveloperName = 'Account_Validation_Flow'" \
     --use-tooling-api --target-org myorg
   ```

3. **Detect Competing Automation** (if record-triggered)
   ```bash
   # Check Apex triggers
   sf data query --query "SELECT Name, TableEnumOrId, UsageBeforeInsert, UsageAfterInsert
     FROM ApexTrigger
     WHERE TableEnumOrId = 'Account'" \
     --use-tooling-api --target-org myorg

   # Check active Flows
   sf data query --query "SELECT DeveloperName, TriggerType, TriggerObjectOrEvent.QualifiedApiName
     FROM FlowVersionView
     WHERE ProcessType = 'AutolaunchedFlow'
     AND Status = 'Active'
     AND TriggerObjectOrEvent.QualifiedApiName = 'Account'" \
     --use-tooling-api --target-org myorg
   ```

4. **Check Validation Rules**
   ```bash
   sf data query --query "SELECT DeveloperName, Active, ErrorMessage
     FROM ValidationRule
     WHERE EntityDefinition.QualifiedApiName = 'Account'" \
     --use-tooling-api --target-org myorg
   ```

5. **Setup Debug Logging**
   ```bash
   sf apex log tail --color --skip-trace-flag --target-org myorg &
   ```

6. **Generate Readiness Report**

**CLI Usage**:
```bash
/flow-preflight Account_Validation_Flow myorg --object Account --trigger-type after-save
```

**Programmatic Usage**:
```javascript
const { FlowPreflightChecker } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-preflight-checker');

const checker = new FlowPreflightChecker('myorg', { verbose: true });

const result = await checker.runAllChecks('Account_Validation_Flow', {
  object: 'Account',
  triggerType: 'after-save'
});

if (result.canProceed) {
  console.log('✅ Pre-flight checks passed - ready to proceed');
} else {
  console.error('❌ Critical issues found:');
  result.criticalIssues.forEach(issue => console.error(`  - ${issue}`));
}
```

**Expected Output**:
- Connectivity status (authenticated org, valid access)
- Flow metadata (exists, active version, correct trigger configuration)
- Competing automation list (Apex triggers, active Flows on same object)
- Blocking validation rules (active rules that might interfere)
- Debug logging status (trace flag active, log level set)
- Go/No-Go recommendation

**Exit Criteria**:
- ✅ Org connectivity verified
- ✅ Flow metadata validated
- ✅ No critical conflicts detected
- ✅ Debug logging configured

---

### 5.3 Execution Diagnostic Workflow

**Purpose**: Execute Flow with test data and analyze execution results.

**Duration**: 3-5 minutes

**Steps**:

1. **Capture Before State** (record-triggered only)
   ```javascript
   const { FlowStateSnapshot } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-state-snapshot');
   const snapshot = new FlowStateSnapshot('myorg');

   const before = await snapshot.captureSnapshot(recordId, {
     includeFields: null,  // All fields
     includeRelated: ['Contacts', 'Opportunities']
   });
   ```

2. **Execute Flow**
   ```javascript
   const { FlowExecutor } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-executor');
   const executor = new FlowExecutor('myorg', { cleanupRecords: true });

   const result = await executor.executeRecordTriggeredFlow('Account_Validation_Flow', {
     object: 'Account',
     triggerType: 'after-save',
     operation: 'insert',
     recordData: { Name: 'Test Account', Type: 'Customer' }
   });
   ```

3. **Capture After State**
   ```javascript
   const after = await snapshot.captureSnapshot(result.createdRecordId);
   ```

4. **Compare Snapshots**
   ```javascript
   const diff = await snapshot.compareSnapshots(before, after);
   const report = snapshot.generateDiffReport(diff, { format: 'markdown' });
   ```

5. **Retrieve Debug Log**
   ```bash
   sf apex log list --number 1 --target-org myorg
   sf apex log get --log-id 07Lxx... --target-org myorg > debug.log
   ```

6. **Parse Log**
   ```javascript
   const { FlowLogParser } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-log-parser');
   const parser = new FlowLogParser('myorg');

   const parsed = await parser.parseLog('07Lxx...', {
     extractFlowDetails: true,
     extractErrors: true,
     extractGovernorLimits: true
   });
   ```

7. **Generate Execution Report**

**CLI Usage**:
```bash
/flow-test Account_Validation_Flow myorg \
  --type record-triggered \
  --object Account \
  --operation insert \
  --data '{"Name":"Test Account","Type":"Customer"}'
```

**Expected Output**:
- Execution ID and timestamp
- Success status (true/false)
- Execution duration (milliseconds)
- State diff report (fields changed, related records affected)
- Debug log summary (elements executed, decisions made, errors)
- Governor limits (CPU time, heap size, SOQL queries, DML statements)
- Recommendations (optimization opportunities, error fixes)

**Exit Criteria**:
- ✅ Flow executed successfully
- ✅ State changes captured and analyzed
- ✅ Debug log retrieved and parsed
- ✅ No critical errors detected

---

### 5.4 Coverage Diagnostic Workflow

**Purpose**: Execute Flow multiple times to track decision branch coverage.

**Duration**: 5-10 minutes (depends on test case count)

**Steps**:

1. **Define Test Cases**
   ```javascript
   const testCases = [
     { recordData: { Status__c: 'Active' } },
     { recordData: { Status__c: 'Inactive' } },
     { recordData: { Status__c: 'Pending' } },
     { recordData: { Status__c: null } }  // Test null handling
   ];
   ```

2. **Execute Each Test Case**
   ```javascript
   const { FlowBranchAnalyzer } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-branch-analyzer');
   const analyzer = new FlowBranchAnalyzer('myorg');

   for (const testCase of testCases) {
     const result = await executor.executeRecordTriggeredFlow('Account_Status_Flow', {
       object: 'Account',
       triggerType: 'after-save',
       operation: 'insert',
       recordData: testCase.recordData
     });

     // Analyzer tracks execution automatically via log parsing
   }
   ```

3. **Analyze Coverage**
   ```javascript
   const coverage = await analyzer.analyzeFlowCoverage('Account_Status_Flow', {
     executionIds: results.map(r => r.executionId)
   });
   ```

4. **Generate Test Plan** (if coverage < 100%)
   ```javascript
   if (coverage.coveragePercentage < 100) {
     const testPlan = await analyzer.generateTestPlan(coverage);
     console.log('Uncovered branches:', testPlan.uncoveredBranches);
     console.log('Suggested test cases:', testPlan.suggestedTestCases);
   }
   ```

5. **Export Coverage Report**
   ```javascript
   await analyzer.exportCoverageReport(coverage, {
     format: 'html',
     outputPath: './coverage-report.html'
   });
   ```

**CLI Usage**:
```bash
/flow-diagnose Account_Status_Flow myorg --type coverage \
  --object Account \
  --trigger-type after-save \
  --test-cases '[
    {"operation":"insert","recordData":{"Status__c":"Active"}},
    {"operation":"insert","recordData":{"Status__c":"Inactive"}},
    {"operation":"insert","recordData":{"Status__c":"Pending"}}
  ]'
```

**Expected Output**:
- Coverage percentage (overall)
- Elements executed / total elements
- Decision coverage (branches taken / total branches)
- Uncovered elements list
- Uncovered branches list
- Test plan (if coverage < 100%)
- Execution summary (test cases run, successes, failures)

**Exit Criteria**:
- ✅ All test cases executed
- ✅ Coverage percentage calculated
- ✅ Uncovered branches identified
- ✅ Test plan generated (if needed)

---

### 5.5 Full Diagnostic Workflow

**Purpose**: Complete validation combining pre-flight, execution, and coverage analysis for production deployment.

**Duration**: 10-15 minutes

**Steps**:

1. **Phase 1: Pre-flight Checks** (Section 5.2)
   - Verify org connectivity
   - Check Flow metadata
   - Detect competing automation
   - Identify blocking validation rules
   - Setup debug logging

2. **Phase 2: Execution Diagnostic** (Section 5.3)
   - Execute Flow with first test case
   - Capture state changes
   - Parse debug logs
   - Analyze governor limits

3. **Phase 3: Coverage Diagnostic** (Section 5.4)
   - Execute all test cases
   - Track branch coverage
   - Generate test plan for uncovered branches

4. **Phase 4: Consolidation**
   - Aggregate results from all phases
   - Identify critical issues
   - Calculate overall health score
   - Determine production readiness

5. **Phase 5: Reporting**
   - Generate consolidated HTML/markdown report
   - Create executive summary
   - Provide go/no-go recommendation

**CLI Usage**:
```bash
/flow-diagnose Account_Validation_Flow myorg --type full \
  --object Account \
  --trigger-type after-save \
  --test-cases '[
    {"operation":"insert","recordData":{"Name":"Test 1","Type":"Customer","Status__c":"Active"}},
    {"operation":"insert","recordData":{"Name":"Test 2","Type":"Prospect","Status__c":"Inactive"}},
    {"operation":"insert","recordData":{"Name":"Test 3","Type":"Partner","Status__c":"Pending"}}
  ]' \
  --format html
```

**Programmatic Usage**:
```javascript
const { FlowDiagnosticOrchestrator } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-diagnostic-orchestrator');

const orchestrator = new FlowDiagnosticOrchestrator('myorg', {
  verbose: true,
  generateReports: true
});

const result = await orchestrator.runFullDiagnostic('Account_Validation_Flow', {
  object: 'Account',
  triggerType: 'after-save',
  testCases: [
    { recordData: { Status__c: 'Active' } },
    { recordData: { Status__c: 'Inactive' } },
    { recordData: { Status__c: 'Pending' } }
  ]
});

// Check production readiness
if (result.overallSummary.readyForProduction) {
  console.log('✅ Flow is ready for production deployment');
  console.log(`Coverage: ${result.overallSummary.coveragePercentage}%`);
} else {
  console.log('❌ Flow is NOT ready for production');
  console.log('Critical issues:', result.overallSummary.criticalIssues);
  console.log('Warnings:', result.overallSummary.warnings);
}
```

**Expected Output**:
- **Overall Summary**:
  - Can Deploy (yes/no) - No critical issues blocking deployment
  - Production Ready (yes/no) - Can deploy + no warnings + coverage ≥ 80%
  - Coverage percentage
  - Critical issues count
  - Warnings count

- **Phase Results**:
  - Pre-flight: Connectivity, metadata, conflicts, validation rules
  - Execution: State changes, errors, governor limits
  - Coverage: Branch coverage, uncovered elements, test plan

- **Consolidated Report** (HTML/markdown/JSON):
  - Executive summary
  - Detailed phase results
  - Recommendations and next steps
  - Test plan (if coverage < 100%)

**Production Readiness Criteria**:
- ✅ **Can Deploy**: No critical issues (pre-flight passed, no fatal errors)
- ✅ **Production Ready**: Can deploy + no warnings + coverage ≥ 80%

**Exit Criteria**:
- ✅ All three phases completed
- ✅ Results consolidated
- ✅ Production readiness determined
- ✅ Report generated

---

### 5.6 Troubleshooting Specific Issues

#### 5.6.1 Flow Not Triggering

**Symptoms**: Flow doesn't run when expected (no execution record, no log entries).

**Diagnostic Workflow**:

1. **Verify Flow is Active**
   ```bash
   sf data query --query "SELECT DeveloperName, VersionNumber, Status
     FROM FlowVersionView
     WHERE DeveloperName = 'Account_Validation_Flow'
     AND Status = 'Active'" \
     --use-tooling-api --target-org myorg
   ```

2. **Check Trigger Configuration**
   ```bash
   sf data query --query "SELECT TriggerType, TriggerObjectOrEvent.QualifiedApiName,
     RecordTriggerType
     FROM FlowVersionView
     WHERE DeveloperName = 'Account_Validation_Flow'
     AND Status = 'Active'" \
     --use-tooling-api --target-org myorg
   ```

3. **Verify Entry Criteria** (if defined)
   - Get Flow metadata via Metadata API
   - Check `<triggerType>` and `<filterLogic>`
   - Test with record that meets criteria

4. **Check Debug Logs**
   ```bash
   sf apex log tail --color --target-org myorg
   # Look for FLOW_START_INTERVIEWS or FLOW_INTERVIEW markers
   ```

5. **Test Manually**
   ```bash
   /flow-test Account_Validation_Flow myorg \
     --type record-triggered \
     --object Account \
     --operation insert \
     --data '{"Name":"Test"}'
   ```

**Common Causes**:
- Flow not activated (Status = 'Draft')
- Wrong trigger type (before-save vs after-save)
- Entry criteria not met
- Flow disabled by admin
- Process Builder taking precedence (order of execution)

**Resolution**:
- Activate Flow if draft
- Correct trigger configuration
- Adjust entry criteria or test data
- Disable conflicting automation

---

#### 5.6.2 Flow Errors/Faults

**Symptoms**: Flow execution fails with error/fault (FLOW_ELEMENT_ERROR, FLOW_INTERVIEW_FAILED).

**Diagnostic Workflow**:

1. **Get Latest Debug Log**
   ```bash
   sf apex log list --number 1 --target-org myorg
   sf apex log get --log-id 07Lxx... --target-org myorg
   ```

2. **Parse for Flow Errors**
   ```javascript
   const { FlowLogParser } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-log-parser');
   const parser = new FlowLogParser('myorg');

   const errors = await parser.extractFlowErrors('07Lxx...');
   console.log('Flow errors found:', errors.length);
   errors.forEach(err => {
     console.log(`Element: ${err.elementName}`);
     console.log(`Type: ${err.errorType}`);
     console.log(`Message: ${err.message}`);
   });
   ```

3. **Identify Failure Type** (Section 4)
   - Syntax Error → Validate XML structure
   - Runtime Error → Add null checks, handle exceptions
   - Governor Limit → Optimize bulkification
   - Permission Error → Grant FLS/object access
   - Logic Error → Review decision conditions

4. **Re-test with Fixes**
   ```bash
   /flow-test Account_Validation_Flow myorg \
     --type record-triggered \
     --object Account \
     --operation insert \
     --data '{"Name":"Test"}'
   ```

**Common Errors**:
- `System.NullPointerException` - Accessing null variable/field
- `System.DmlException` - DML operation failed (validation rule, required field)
- `FIELD_CUSTOM_VALIDATION_EXCEPTION` - Validation rule blocking operation
- `LIMIT_EXCEEDED` - Governor limit hit (CPU, heap, SOQL, DML)

**Resolution**:
- Add null checks before field access
- Handle validation rule failures with fault paths
- Optimize for governor limits (Section 4.4)
- Grant required permissions (Section 4.5)

---

#### 5.6.3 Unexpected Outcomes

**Symptoms**: Flow runs successfully but produces wrong result (incorrect field value, wrong branch taken).

**Diagnostic Workflow**:

1. **Capture State Diff**
   ```bash
   /flow-test Account_Validation_Flow myorg \
     --type record-triggered \
     --object Account \
     --operation insert \
     --data '{"Name":"Test","Status__c":"Active"}'
   ```

2. **Review Debug Log**
   - Check decision outcomes (which branch taken)
   - Verify formula calculations
   - Confirm variable assignments

3. **Parse Decision Logic**
   ```javascript
   const parsed = await parser.parseLog(logId);

   parsed.flowExecutions.forEach(exec => {
     exec.decisions.forEach(decision => {
       console.log(`Decision: ${decision.elementName}`);
       console.log(`Outcome: ${decision.outcome}`);
       console.log(`Condition: ${decision.condition}`);
     });
   });
   ```

4. **Verify Formula Logic**
   - Review decision conditions in Flow XML
   - Test formula syntax manually
   - Check for operator precedence issues

5. **Test Edge Cases**
   ```javascript
   const testCases = [
     { Status__c: 'Active' },     // Expected path
     { Status__c: 'Inactive' },   // Alternative path
     { Status__c: null },         // Null handling
     { Status__c: '' }            // Empty string
   ];
   ```

**Common Causes**:
- Incorrect decision formula (wrong operator, field reference)
- Variable not assigned before use
- Default outcome taken unexpectedly
- Order of operations issue (AND vs OR precedence)

**Resolution**:
- Correct decision formula syntax
- Ensure variables assigned before use
- Add explicit conditions for all branches
- Use parentheses to clarify precedence

---

#### 5.6.4 Governor Limit Issues

**Symptoms**: Flow fails with LIMIT_EXCEEDED error (CPU, heap, SOQL, DML).

**Diagnostic Workflow**:

1. **Parse Governor Limits from Log**
   ```javascript
   const parsed = await parser.parseLog(logId);

   console.log('CPU Time:', parsed.governorLimits.cpuTimeUsed, '/', parsed.governorLimits.cpuTimeLimit);
   console.log('Heap Size:', parsed.governorLimits.heapSizeUsed, '/', parsed.governorLimits.heapSizeLimit);
   console.log('SOQL Queries:', parsed.governorLimits.soqlQueries, '/', parsed.governorLimits.soqlQueryLimit);
   console.log('DML Statements:', parsed.governorLimits.dmlStatements, '/', parsed.governorLimits.dmlStatementLimit);
   ```

2. **Identify Bottleneck**
   - CPU > 80% → Optimize loops, reduce formula complexity
   - Heap > 80% → Process fewer records per iteration
   - SOQL > 80 queries → Combine queries, use relationships
   - DML > 100 statements → Bulkify operations

3. **Optimize Flow**
   - Move SOQL/DML outside loops
   - Use Collection variables for bulk processing
   - Reduce formula complexity
   - Process records in smaller batches

4. **Re-test with Optimization**
   ```bash
   /flow-test Account_Validation_Flow myorg \
     --type record-triggered \
     --object Account \
     --operation insert \
     --data '{"Name":"Test"}'
   ```

**Common Optimizations**:
- **CPU Time**: Simplify formulas, reduce nested loops, use efficient operators
- **Heap Size**: Process fewer records per transaction, avoid large collection variables
- **SOQL Queries**: Get Records once per object, use parent.child relationships
- **DML Statements**: Use Update Records element with collection input (not in loop)

**Resolution**:
- Apply optimizations from Section 4.4
- Test with realistic data volumes
- Monitor governor limit usage after optimization

---

### 5.7 Workflow Best Practices

1. **Start with Pre-flight**
   - Always run pre-flight diagnostic before starting Flow work
   - Identify environment issues early
   - Confirm Flow metadata correct

2. **Test Incrementally**
   - Test after each significant change
   - Don't wait until Flow is complete
   - Catch errors early

3. **Use Coverage Analysis**
   - Ensure all decision branches tested
   - Generate test plan for uncovered branches
   - Aim for 80%+ coverage before production

4. **Full Diagnostic for Production**
   - Always run full diagnostic before production deployment
   - Review consolidated report
   - Confirm "Production Ready" status

5. **Document Test Cases**
   - Keep test case library for each Flow
   - Update when adding new branches
   - Share with team for consistency

6. **Automate in CI/CD**
   - Integrate diagnostic commands in pipelines
   - Block deployment if "Can Deploy" = false
   - Require 80%+ coverage for merge

7. **Monitor Trends**
   - Track coverage percentage over time
   - Watch for governor limit increases
   - Review execution duration trends

---

### 5.8 Diagnostic Exit Criteria

**Pre-flight Diagnostic**:
- ✅ Org connectivity verified
- ✅ Flow metadata validated (exists, active, correct trigger)
- ✅ No critical automation conflicts
- ✅ Blocking validation rules identified
- ✅ Debug logging configured

**Execution Diagnostic**:
- ✅ Flow executed successfully
- ✅ State changes captured (before/after)
- ✅ Debug log retrieved and parsed
- ✅ Governor limits within thresholds (<80%)
- ✅ No critical errors detected

**Coverage Diagnostic**:
- ✅ All test cases executed
- ✅ Coverage percentage calculated
- ✅ Decision branches tracked
- ✅ Uncovered elements identified
- ✅ Test plan generated (if coverage < 100%)

**Full Diagnostic**:
- ✅ All three phases completed
- ✅ Results consolidated into report
- ✅ Production readiness determined
- ✅ "Can Deploy" or "Production Ready" status clear
- ✅ Recommendations provided

**Production Deployment Criteria**:
- ✅ Full diagnostic completed
- ✅ "Production Ready" = true
- ✅ Coverage ≥ 80%
- ✅ No critical issues
- ✅ No warnings
- ✅ Stakeholder approval obtained

---

## 6. Reusable Modules

### 6.1 Overview

The Flow diagnostic system is built on six reusable modules that can be used independently or composed together for comprehensive workflows. Each module has a clear responsibility, well-defined interfaces, and observability instrumentation for the Living Runbook System.

**Six Core Modules**:
1. **FlowPreflightChecker** - Pre-flight validation (connectivity, metadata, conflicts)
2. **FlowExecutor** - Flow execution with test data
3. **FlowLogParser** - Debug log parsing and analysis
4. **FlowStateSnapshot** - Record state capture and diff analysis
5. **FlowBranchAnalyzer** - Branch coverage tracking
6. **FlowDiagnosticOrchestrator** - Workflow coordination

**Module Benefits**:
- **Modularity**: Use individually or composed
- **Reusability**: Shared across agents, scripts, CLI commands
- **Observability**: Emit structured events for Living Runbook System
- **Consistency**: Standard error handling, interfaces, patterns
- **Testability**: Isolated modules with clear boundaries

---

### 6.2 Module Architecture

**Layered Design**:
```
┌─────────────────────────────────────┐
│  CLI Commands (flow-preflight,     │
│  flow-test, flow-logs, flow-diagnose)│
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Orchestrator Layer                 │
│  (FlowDiagnosticOrchestrator)       │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Diagnostic Modules                 │
│  (Preflight, Executor, Parser,      │
│   Snapshot, Analyzer)               │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Salesforce CLI (sf commands)       │
└─────────────────────────────────────┘
```

**Module Communication**:
- Modules don't depend on each other (except Orchestrator)
- Data passed via standard interfaces (JSON structures)
- Results include metadata (timestamps, execution IDs, org alias)
- Errors use custom error classes with codes

**Common Patterns**:
1. **Constructor**: Accept org alias + options object
2. **Main Methods**: Async, return structured results
3. **Error Handling**: Custom error class with error codes
4. **Observability**: Emit events via `_emitEvent()` for Living Runbook System
5. **CLI Entry Point**: `if (require.main === module)` for standalone execution

---

### 6.3 FlowPreflightChecker Module

**Location**: `scripts/lib/flow-preflight-checker.js`

**Purpose**: Validate environment readiness before Flow development or deployment.

**Key Methods**:

```javascript
// Constructor
new FlowPreflightChecker(orgAlias, options)

// Individual checks
await checker.checkConnectivity()
await checker.checkFlowMetadata(flowApiName)
await checker.checkCompetingAutomation(flowApiName, options)
await checker.checkValidationRules(object)
await checker.setupDebugLogging()

// Run all checks
await checker.runAllChecks(flowApiName, options)
```

**Input Parameters**:
- `orgAlias` (string) - Salesforce org alias
- `flowApiName` (string) - Flow API name to check
- `options` (object):
  - `object` (string) - Object API name for competing automation check
  - `triggerType` (string) - Trigger type (before-save, after-save, etc.)
  - `skipLogging` (boolean) - Skip debug logging setup

**Output Structure**:
```javascript
{
  success: true,
  canProceed: true,  // Can start Flow work
  timestamp: '2025-01-15T10:30:00Z',
  checks: {
    connectivity: { passed: true, message: 'Authenticated to myorg' },
    flowMetadata: { passed: true, activeVersion: 5, trigger: 'after-save' },
    competingAutomation: { passed: false, conflicts: [{ type: 'Apex Trigger', name: 'AccountTrigger' }] },
    validationRules: { passed: true, activeRules: 3, blockingRules: [] },
    debugLogging: { passed: true, traceFlag: true }
  },
  criticalIssues: [],
  warnings: ['Competing automation: Apex Trigger "AccountTrigger"'],
  recommendations: ['Review competing automation before deployment']
}
```

**Usage Example**:
```javascript
const { FlowPreflightChecker } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-preflight-checker');

const checker = new FlowPreflightChecker('myorg', { verbose: true });

const result = await checker.runAllChecks('Account_Validation_Flow', {
  object: 'Account',
  triggerType: 'after-save'
});

if (!result.canProceed) {
  console.error('Pre-flight failed:', result.criticalIssues);
  process.exit(1);
}
```

**Error Codes**:
- `AUTH_FAILED` - Cannot authenticate to org
- `FLOW_NOT_FOUND` - Flow doesn't exist in org
- `NO_ACTIVE_VERSION` - Flow has no active version
- `TIMEOUT` - Check timed out
- `CLI_ERROR` - Salesforce CLI command failed

---

### 6.4 FlowExecutor Module

**Location**: `scripts/lib/flow-executor.js`

**Purpose**: Execute Flows with test data and capture execution results.

**Key Methods**:

```javascript
// Constructor
new FlowExecutor(orgAlias, options)

// Flow type execution
await executor.executeRecordTriggeredFlow(flowApiName, options)
await executor.executeScheduledFlow(flowApiName, options)
await executor.executeScreenFlow(flowApiName, options)
await executor.executeAutoLaunchedFlow(flowApiName, options)

// History
await executor.getExecutionHistory(flowApiName, options)
```

**Input Parameters** (record-triggered):
- `flowApiName` (string) - Flow API name
- `options` (object):
  - `object` (string) - Object API name
  - `triggerType` (string) - before-save, after-save, before-delete, after-delete
  - `operation` (string) - insert, update, delete
  - `recordData` (object) - Test record data
  - `recordId` (string) - Existing record ID (update/delete)
  - `cleanupRecords` (boolean) - Auto-delete test records (default: true)

**Output Structure**:
```javascript
{
  success: true,
  flowApiName: 'Account_Validation_Flow',
  executionId: 'a1b2c3d4e5',
  executionDuration: 1500,  // milliseconds
  timestamp: '2025-01-15T10:30:00Z',
  createdRecordId: '001xx000000XXXX',  // For insert operations
  beforeState: { ... },  // Captured before execution
  afterState: { ... },   // Captured after execution
  logId: '07Lxx000000001',  // Debug log ID
  errors: [],
  warnings: []
}
```

**Usage Example**:
```javascript
const { FlowExecutor } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-executor');

const executor = new FlowExecutor('myorg', {
  verbose: true,
  cleanupRecords: true
});

const result = await executor.executeRecordTriggeredFlow('Account_Validation_Flow', {
  object: 'Account',
  triggerType: 'after-save',
  operation: 'insert',
  recordData: {
    Name: 'Test Account',
    Type: 'Customer',
    Industry: 'Technology'
  }
});

console.log('Execution ID:', result.executionId);
console.log('Duration:', result.executionDuration + 'ms');
console.log('Success:', result.success);
```

**Error Codes**:
- `INVALID_OPERATION` - Invalid operation (insert/update/delete)
- `RECORD_NOT_FOUND` - Record ID doesn't exist (update/delete)
- `EXECUTION_FAILED` - Flow execution failed
- `DML_ERROR` - DML operation failed
- `TIMEOUT` - Execution timed out

---

### 6.5 FlowLogParser Module

**Location**: `scripts/lib/flow-log-parser.js`

**Purpose**: Parse Salesforce debug logs to extract Flow execution details.

**Key Methods**:

```javascript
// Constructor
new FlowLogParser(orgAlias, options)

// Parse logs
await parser.parseLog(logId, options)
await parser.parseMultipleLogs(logIds, options)

// Extract specific data
await parser.extractFlowErrors(logId)
await parser.getLatestLog(flowApiName, options)
```

**Input Parameters**:
- `logId` (string) - Debug log ID to parse
- `options` (object):
  - `extractFlowDetails` (boolean) - Extract Flow executions
  - `extractErrors` (boolean) - Extract errors
  - `extractGovernorLimits` (boolean) - Extract limits

**Output Structure**:
```javascript
{
  logId: '07Lxx000000001',
  timestamp: '2025-01-15T10:30:00Z',
  user: 'user@example.com',
  flowExecutions: [
    {
      flowName: 'Account_Validation_Flow',
      version: 5,
      startTime: '2025-01-15T10:30:00.100Z',
      endTime: '2025-01-15T10:30:01.600Z',
      duration: 1500,
      elements: [
        { name: 'Start', type: 'Start', timestamp: '10:30:00.100' },
        { name: 'Decision_1', type: 'Decision', timestamp: '10:30:00.200', outcome: 'True' }
      ],
      decisions: [
        { elementName: 'Decision_1', outcome: 'True', condition: 'Status = Active' }
      ],
      variables: [
        { name: 'varStatus', value: 'Active', type: 'String' }
      ]
    }
  ],
  errors: [
    {
      type: 'FIELD_CUSTOM_VALIDATION_EXCEPTION',
      message: 'Status must be Active or Inactive',
      elementName: 'Update_Account',
      timestamp: '10:30:01.500'
    }
  ],
  governorLimits: {
    cpuTimeUsed: 450,
    cpuTimeLimit: 10000,
    heapSizeUsed: 2048,
    heapSizeLimit: 6000000,
    soqlQueries: 5,
    soqlQueryLimit: 100,
    dmlStatements: 2,
    dmlStatementLimit: 150
  }
}
```

**Usage Example**:
```javascript
const { FlowLogParser } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-log-parser');

const parser = new FlowLogParser('myorg', { verbose: true });

// Get latest log
const logs = await parser.getLatestLog('Account_Validation_Flow');
const logId = logs[0].Id;

// Parse log
const parsed = await parser.parseLog(logId, {
  extractFlowDetails: true,
  extractErrors: true,
  extractGovernorLimits: true
});

console.log('Flow Executions:', parsed.flowExecutions.length);
console.log('Errors:', parsed.errors.length);
console.log('CPU Time:', parsed.governorLimits.cpuTimeUsed + 'ms');
```

**Error Codes**:
- `LOG_NOT_FOUND` - Log ID doesn't exist
- `PARSE_FAILED` - Unable to parse log
- `INVALID_LOG_FORMAT` - Log format not recognized
- `TIMEOUT` - Parse operation timed out

---

### 6.6 FlowStateSnapshot Module

**Location**: `scripts/lib/flow-state-snapshot.js`

**Purpose**: Capture record state before/after Flow execution for diff analysis.

**Key Methods**:

```javascript
// Constructor
new FlowStateSnapshot(orgAlias, options)

// Capture snapshots
await snapshot.captureSnapshot(recordId, options)

// Compare snapshots
await snapshot.compareSnapshots(beforeSnapshot, afterSnapshot)

// Generate reports
snapshot.generateDiffReport(diff, options)
```

**Input Parameters**:
- `recordId` (string) - Record ID to capture
- `options` (object):
  - `includeFields` (array|null) - Specific fields or null for all
  - `includeRelated` (array) - Related object relationships to include

**Output Structure**:
```javascript
// Snapshot
{
  recordId: '001xx000000XXXX',
  objectType: 'Account',
  timestamp: '2025-01-15T10:30:00Z',
  fields: {
    Name: 'Test Account',
    Status__c: 'Active',
    AnnualRevenue: 1000000
  },
  relatedRecords: {
    Contacts: [ { Id: '003xx...', Name: 'John Doe' } ],
    Opportunities: [ { Id: '006xx...', Name: 'Deal 1' } ]
  }
}

// Diff
{
  recordId: '001xx000000XXXX',
  objectType: 'Account',
  fieldsChanged: 2,
  fieldChanges: [
    { field: 'Status__c', before: 'Pending', after: 'Active', magnitude: 'medium' },
    { field: 'Rating', before: null, after: 'Hot', magnitude: 'high' }
  ],
  relatedRecordsChanged: 1,
  relatedChanges: [
    { relationship: 'Contacts', changeType: 'added', count: 1 }
  ],
  totalFieldsChanged: 2,
  totalRelatedRecordsAffected: 1
}
```

**Usage Example**:
```javascript
const { FlowStateSnapshot } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-state-snapshot');

const snapshot = new FlowStateSnapshot('myorg', { verbose: true });

// Before execution
const before = await snapshot.captureSnapshot('001xx000000XXXX', {
  includeFields: null,  // All fields
  includeRelated: ['Contacts', 'Opportunities']
});

// Execute Flow...

// After execution
const after = await snapshot.captureSnapshot('001xx000000XXXX');

// Compare
const diff = await snapshot.compareSnapshots(before, after);

// Generate report
const report = snapshot.generateDiffReport(diff, { format: 'markdown' });
console.log(report);
```

**Error Codes**:
- `RECORD_NOT_FOUND` - Record ID doesn't exist
- `INVALID_OBJECT` - Object type not supported
- `FIELD_NOT_ACCESSIBLE` - Field not accessible
- `SNAPSHOT_FAILED` - Unable to capture snapshot

---

### 6.7 FlowBranchAnalyzer Module

**Location**: `scripts/lib/flow-branch-analyzer.js`

**Purpose**: Track Flow decision branch coverage during testing.

**Key Methods**:

```javascript
// Constructor
new FlowBranchAnalyzer(orgAlias, options)

// Analyze coverage
await analyzer.analyzeFlowCoverage(flowApiName, options)

// Generate test plan
await analyzer.generateTestPlan(coverageResult)

// Export reports
await analyzer.exportCoverageReport(coverageResult, options)
```

**Input Parameters**:
- `flowApiName` (string) - Flow API name
- `options` (object):
  - `executionIds` (array) - Execution IDs to analyze
  - `format` (string) - Export format (html, markdown, json, csv)

**Output Structure**:
```javascript
{
  flowApiName: 'Account_Status_Flow',
  totalExecutions: 3,
  coveragePercentage: 85.5,
  elementsExecuted: 5,
  totalElements: 6,
  elements: [
    { elementName: 'Start', elementType: 'Start', executionCount: 3 },
    { elementName: 'Decision_1', elementType: 'Decision', executionCount: 3 },
    { elementName: 'Update_Active', elementType: 'RecordUpdate', executionCount: 2 },
    { elementName: 'Update_Inactive', elementType: 'RecordUpdate', executionCount: 1 }
  ],
  decisions: [
    {
      elementName: 'Decision_1',
      totalOutcomes: 3,
      outcomesCovered: 2,
      coveragePercentage: 66.7,
      outcomes: [
        { outcomeName: 'Active', executionCount: 2, condition: 'Status = Active' },
        { outcomeName: 'Inactive', executionCount: 1, condition: 'Status = Inactive' },
        { outcomeName: 'Pending', executionCount: 0, condition: 'Status = Pending' }  // Uncovered
      ]
    }
  ],
  uncoveredElements: ['Error_Handler'],
  uncoveredBranches: [
    { decision: 'Decision_1', outcome: 'Pending', condition: 'Status = Pending' }
  ]
}
```

**Usage Example**:
```javascript
const { FlowBranchAnalyzer } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-branch-analyzer');

const analyzer = new FlowBranchAnalyzer('myorg', { verbose: true });

// Execute Flow multiple times with different data...
const executionIds = ['a1b2c3', 'a2b3c4', 'a3b4c5'];

// Analyze coverage
const coverage = await analyzer.analyzeFlowCoverage('Account_Status_Flow', {
  executionIds
});

console.log('Coverage:', coverage.coveragePercentage + '%');
console.log('Uncovered branches:', coverage.uncoveredBranches.length);

// Generate test plan
if (coverage.coveragePercentage < 100) {
  const testPlan = await analyzer.generateTestPlan(coverage);
  console.log('Suggested test cases:', testPlan.suggestedTestCases);
}

// Export report
await analyzer.exportCoverageReport(coverage, {
  format: 'html',
  outputPath: './coverage-report.html'
});
```

**Error Codes**:
- `FLOW_NOT_FOUND` - Flow doesn't exist
- `NO_EXECUTIONS` - No execution data to analyze
- `ANALYSIS_FAILED` - Coverage analysis failed
- `EXPORT_FAILED` - Report export failed

---

### 6.8 FlowDiagnosticOrchestrator Module

**Location**: `scripts/lib/flow-diagnostic-orchestrator.js`

**Purpose**: Coordinate multi-phase diagnostic workflows.

**Key Methods**:

```javascript
// Constructor
new FlowDiagnosticOrchestrator(orgAlias, options)

// Workflow methods
await orchestrator.runPreflightDiagnostic(flowApiName, options)
await orchestrator.runExecutionDiagnostic(flowApiName, options)
await orchestrator.runCoverageDiagnostic(flowApiName, testCases)
await orchestrator.runFullDiagnostic(flowApiName, options)

// Reporting
await orchestrator.generateConsolidatedReport(results, options)
```

**Input Parameters** (full diagnostic):
- `flowApiName` (string) - Flow API name
- `options` (object):
  - `object` (string) - Object API name
  - `triggerType` (string) - Trigger type
  - `testCases` (array) - Array of test case configurations
  - `format` (string) - Report format (html, markdown, json)
  - `generateReports` (boolean) - Generate consolidated reports

**Output Structure**:
```javascript
{
  success: true,
  flowApiName: 'Account_Validation_Flow',
  orgAlias: 'myorg',
  timestamp: '2025-01-15T10:30:00Z',
  duration: 780000,  // milliseconds (13 minutes)
  preflight: {
    canProceed: true,
    criticalIssues: [],
    warnings: ['Competing automation: Apex Trigger']
  },
  execution: {
    success: true,
    executionId: 'a1b2c3',
    duration: 1500,
    errors: [],
    governorLimits: { cpuTimeUsed: 450, ... }
  },
  coverage: {
    coveragePercentage: 85.5,
    uncoveredBranches: [ ... ],
    testPlan: { ... }
  },
  overallSummary: {
    canDeploy: true,        // No critical issues
    readyForProduction: false,  // Has warnings, coverage < 80%
    coveragePercentage: 85.5,
    criticalIssues: [],
    warnings: ['Competing automation: Apex Trigger'],
    recommendations: [
      'Review competing automation before deployment',
      'Increase coverage to 100% for production readiness'
    ]
  },
  reportPath: './instances/myorg/flow-diagnostics/Account_Validation_Flow/diagnose-20250115-103000/report.html'
}
```

**Usage Example**:
```javascript
const { FlowDiagnosticOrchestrator } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-diagnostic-orchestrator');

const orchestrator = new FlowDiagnosticOrchestrator('myorg', {
  verbose: true,
  generateReports: true
});

const result = await orchestrator.runFullDiagnostic('Account_Validation_Flow', {
  object: 'Account',
  triggerType: 'after-save',
  testCases: [
    { recordData: { Status__c: 'Active' } },
    { recordData: { Status__c: 'Inactive' } },
    { recordData: { Status__c: 'Pending' } }
  ]
});

if (result.overallSummary.readyForProduction) {
  console.log('✅ Ready for production deployment');
} else {
  console.log('❌ Not ready for production');
  console.log('Issues:', result.overallSummary.criticalIssues);
  console.log('Warnings:', result.overallSummary.warnings);
}
```

**Error Codes**:
- `PREFLIGHT_FAILED` - Pre-flight checks failed
- `EXECUTION_FAILED` - Execution diagnostic failed
- `COVERAGE_FAILED` - Coverage diagnostic failed
- `FULL_DIAGNOSTIC_FAILED` - Overall workflow failed
- `REPORT_GENERATION_FAILED` - Report generation failed

---

### 6.9 Module Composition Patterns

**Pattern 1: Pre-flight + Execution**

Use when you need quick validation and single execution test:

```javascript
const checker = new FlowPreflightChecker('myorg');
const executor = new FlowExecutor('myorg');

// Step 1: Pre-flight
const preflight = await checker.runAllChecks('MyFlow', {
  object: 'Account',
  triggerType: 'after-save'
});

if (!preflight.canProceed) {
  console.error('Pre-flight failed:', preflight.criticalIssues);
  process.exit(1);
}

// Step 2: Execute
const result = await executor.executeRecordTriggeredFlow('MyFlow', {
  object: 'Account',
  triggerType: 'after-save',
  operation: 'insert',
  recordData: { Name: 'Test' }
});

console.log('Execution success:', result.success);
```

**Pattern 2: Execution + Log Parsing + State Diff**

Use when you need detailed execution analysis:

```javascript
const executor = new FlowExecutor('myorg');
const parser = new FlowLogParser('myorg');
const snapshot = new FlowStateSnapshot('myorg');

// Step 1: Before snapshot
const before = await snapshot.captureSnapshot(recordId);

// Step 2: Execute
const result = await executor.executeRecordTriggeredFlow('MyFlow', {
  object: 'Account',
  triggerType: 'after-save',
  operation: 'update',
  recordId,
  recordData: { Status__c: 'Active' }
});

// Step 3: After snapshot
const after = await snapshot.captureSnapshot(recordId);

// Step 4: Parse log
const log = await parser.parseLog(result.logId);

// Step 5: Compare
const diff = await snapshot.compareSnapshots(before, after);

console.log('Fields changed:', diff.fieldsChanged);
console.log('Governor limits:', log.governorLimits);
```

**Pattern 3: Multiple Executions + Coverage**

Use when you need branch coverage analysis:

```javascript
const executor = new FlowExecutor('myorg');
const analyzer = new FlowBranchAnalyzer('myorg');

const testCases = [
  { Status__c: 'Active' },
  { Status__c: 'Inactive' },
  { Status__c: 'Pending' }
];

const executionIds = [];

// Execute each test case
for (const testCase of testCases) {
  const result = await executor.executeRecordTriggeredFlow('MyFlow', {
    object: 'Account',
    triggerType: 'after-save',
    operation: 'insert',
    recordData: testCase
  });
  executionIds.push(result.executionId);
}

// Analyze coverage
const coverage = await analyzer.analyzeFlowCoverage('MyFlow', {
  executionIds
});

console.log('Coverage:', coverage.coveragePercentage + '%');

if (coverage.coveragePercentage < 100) {
  const testPlan = await analyzer.generateTestPlan(coverage);
  console.log('Missing test cases:', testPlan.suggestedTestCases);
}
```

**Pattern 4: Full Orchestrated Workflow**

Use when you need complete diagnostic (production deployment):

```javascript
const orchestrator = new FlowDiagnosticOrchestrator('myorg', {
  verbose: true,
  generateReports: true
});

const result = await orchestrator.runFullDiagnostic('MyFlow', {
  object: 'Account',
  triggerType: 'after-save',
  testCases: [
    { recordData: { Status__c: 'Active' } },
    { recordData: { Status__c: 'Inactive' } }
  ]
});

// Check production readiness
if (!result.overallSummary.readyForProduction) {
  console.error('Not ready for production');
  console.error('Critical:', result.overallSummary.criticalIssues);
  console.error('Warnings:', result.overallSummary.warnings);
  process.exit(1);
}

console.log('✅ Ready for production deployment');
console.log('Report:', result.reportPath);
```

---

### 6.10 Integration Best Practices

**1. Error Handling**

Always wrap module calls in try-catch with custom error handling:

```javascript
const { FlowExecutor, FlowExecutionError } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-executor');

try {
  const result = await executor.executeRecordTriggeredFlow('MyFlow', options);
} catch (error) {
  if (error instanceof FlowExecutionError) {
    console.error('Flow execution failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Details:', error.details);
  } else {
    console.error('Unexpected error:', error);
  }
  process.exit(1);
}
```

**2. Observability Integration**

Modules emit events for Living Runbook System - listen for pattern capture:

```javascript
executor.on('event', (event) => {
  console.log('Event:', event.type);
  console.log('Data:', event.data);
  // Events: flow_execution_started, flow_execution_completed, etc.
});
```

**3. CLI Entry Points**

All modules support standalone CLI execution:

```bash
# Direct script execution
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-preflight-checker.js MyFlow myorg --object Account --trigger-type after-save

# Programmatic usage
const { FlowPreflightChecker } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-preflight-checker');
```

**4. Options Consistency**

Use consistent option names across modules:

```javascript
const commonOptions = {
  verbose: true,        // Detailed logging
  timeout: 60000,       // Operation timeout (ms)
  outputDir: './output', // Output directory
  format: 'json'        // Output format
};

const checker = new FlowPreflightChecker('myorg', commonOptions);
const executor = new FlowExecutor('myorg', commonOptions);
```

**5. Result Validation**

Always validate module results before using:

```javascript
const result = await executor.executeRecordTriggeredFlow('MyFlow', options);

if (!result || !result.success) {
  console.error('Execution failed');
  console.error('Errors:', result.errors);
  return;
}

// Safe to use result
console.log('Execution ID:', result.executionId);
```

**6. Cleanup**

Ensure proper cleanup after module usage:

```javascript
const executor = new FlowExecutor('myorg', { cleanupRecords: true });

try {
  const result = await executor.executeRecordTriggeredFlow('MyFlow', options);
  // Process result...
} finally {
  // Cleanup handled automatically by cleanupRecords option
  // Or manually if needed:
  // await executor.cleanup();
}
```

**7. Module Reuse**

Reuse module instances when possible:

```javascript
// ❌ BAD: Creating new instances for each execution
for (const testCase of testCases) {
  const executor = new FlowExecutor('myorg');  // Creates new instance each time
  await executor.executeRecordTriggeredFlow('MyFlow', testCase);
}

// ✅ GOOD: Reuse instance
const executor = new FlowExecutor('myorg');
for (const testCase of testCases) {
  await executor.executeRecordTriggeredFlow('MyFlow', testCase);
}
```

**8. Agent Integration**

Modules designed for agent use - import and use directly:

```javascript
// In agent scripts
const { FlowDiagnosticOrchestrator } = require('..claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-diagnostic-orchestrator');

// Agent can now use all module capabilities
const orchestrator = new FlowDiagnosticOrchestrator(orgAlias, {
  verbose: agentOptions.verbose,
  generateReports: true
});

const result = await orchestrator.runFullDiagnostic(flowApiName, {
  object: agentOptions.object,
  triggerType: agentOptions.triggerType,
  testCases: agentOptions.testCases
});

// Return results to user
return {
  success: result.success,
  canDeploy: result.overallSummary.canDeploy,
  readyForProduction: result.overallSummary.readyForProduction,
  reportPath: result.reportPath
};
```

---

## Appendices

### A. CLI Command Reference

[TO BE WRITTEN - Complete reference of all diagnostic CLI commands]

### B. Error Code Reference

[TO BE WRITTEN - Common Flow error codes and solutions]

### C. Decision Trees

[TO BE WRITTEN - Diagnostic decision trees for common scenarios]

### D. Example Workflows

[TO BE WRITTEN - Complete diagnostic workflow examples]

---

**Next**: [Section 2: Execution Strategies →](#2-execution-strategies)

**Previous**: [← Runbook 6: Monitoring, Maintenance, and Rollback](06-monitoring-maintenance-rollback.md)

**Index**: [← Flow XML Development Runbooks](README.md)
