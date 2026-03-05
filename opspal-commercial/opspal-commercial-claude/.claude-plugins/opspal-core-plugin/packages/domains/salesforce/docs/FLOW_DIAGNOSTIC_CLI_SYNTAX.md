# Flow Diagnostic CLI Syntax v3.43.0

**Purpose**: Define CLI command syntax for Flow Testing & Diagnostic Framework
**Audience**: Plugin developers, CLI implementers, end users
**Status**: Specification (Phase 1) - Implementation in Phase 3

---

## Overview

This document specifies the CLI syntax for 4 new diagnostic commands that extend the existing Flow CLI:

1. **flow preflight** - Run pre-flight checks before testing or deployment
2. **flow test** - Execute Flows with test data and capture results
3. **flow logs** - Retrieve and parse debug logs for Flow execution analysis
4. **flow diagnose** - Run comprehensive diagnostic workflows

**Design Principles**:
- **Consistency** - Follow existing Flow CLI patterns (colors, spinners, table output)
- **Composability** - Commands can be chained via pipes
- **Dry-run support** - All commands support `--dry-run` for safe testing
- **Multiple outputs** - Support table, JSON, markdown, verbose formats
- **Environment variables** - Support `SF_ORG_ALIAS` and other env vars

---

## Global Options

All diagnostic commands support these global options:

```bash
--org <alias>              # Salesforce org alias (default: $SF_ORG_ALIAS)
--verbose                  # Enable detailed logging
--quiet                    # Suppress all output except errors
--output <format>          # Output format: table|json|markdown|verbose (default: table)
--no-color                 # Disable colored output
--help                     # Show command help
```

**Environment Variables**:
- `SF_ORG_ALIAS` - Default org alias
- `FLOW_CLI_OUTPUT_FORMAT` - Default output format
- `FLOW_CLI_VERBOSE` - Enable verbose mode (set to "1")

---

## 1. flow preflight

**Purpose**: Run automated pre-flight checks before Flow execution or deployment

### Syntax

```bash
flow preflight <flow-name> [options]
```

### Arguments

- `<flow-name>` (required) - Flow API name (DeveloperName) or path to Flow XML file

### Options

```bash
--org <alias>                    # Salesforce org alias
--checks <list>                  # Comma-separated list: all|connectivity|metadata|automation|validation|logging
                                 # Default: all

--object <name>                  # Object API name (for competing automation check)
--trigger-type <type>            # Trigger type: before-save|after-save|before-delete|after-delete
                                 # (for competing automation check)

--setup-logging                  # Automatically configure debug logging (default: true)
--logging-duration <minutes>     # Debug logging duration (default: 30, max: 1440)
--logging-user <username>        # Username to trace (default: Automated Process)

--skip-connectivity              # Skip connectivity check
--skip-logging                   # Skip debug logging setup
--continue-on-warnings           # Continue even if warnings found

--output <format>                # Output format: table|json|markdown|verbose
--report-file <path>             # Save report to file

--dry-run                        # Show what would be checked without executing
```

### Examples

#### Basic Pre-Flight Check

```bash
# Run all checks for a Flow
flow preflight Account_Validation_Flow --org neonone

# Output (table format):
┌──────────────────────────┬─────────┬──────────────────────────────────────┐
│ Check                    │ Status  │ Details                              │
├──────────────────────────┼─────────┼──────────────────────────────────────┤
│ Org Connectivity         │ ✓ Pass  │ Connected to Sandbox (v62.0)         │
│ Flow Metadata            │ ✓ Pass  │ Active, version 5                    │
│ Competing Automation     │ ⚠ Warn  │ 2 other Flows, 1 Apex trigger found  │
│ Validation Rules         │ ✓ Pass  │ 3 rules found, Flow compatible       │
│ Debug Logging            │ ✓ Pass  │ Trace flag created (expires 14:30)   │
└──────────────────────────┴─────────┴──────────────────────────────────────┘

Summary: 4 passed, 1 warning, 0 critical
Status: Can proceed with testing
```

#### Specific Checks Only

```bash
# Check only competing automation
flow preflight Account_Validation_Flow \
  --checks automation \
  --object Account \
  --trigger-type after-save

# Output (verbose format):
=== Competing Automation Check ===
Object: Account
Trigger Type: After Save

Flows (3 found):
  1. Account_Validation_Flow (Active, Order: 100)
  2. Account_Enrichment_Flow (Active, Order: 100) ⚠ Same order!
  3. Account_Territory_Assignment (Active, Order: 200)

Apex Triggers (1 found):
  1. AccountTrigger (Active, After Insert/Update)

Process Builders (1 found):
  1. Account_Update_Process (Active, Criteria: Type = 'Partner')

⚠ WARNING: Race condition detected
Recommendation: Set explicit trigger order to avoid race conditions
```

#### JSON Output for Automation

```bash
# Generate JSON for CI/CD pipeline
flow preflight Account_Validation_Flow --output json --org production

# Output:
{
  "success": true,
  "canProceed": true,
  "flowApiName": "Account_Validation_Flow",
  "checks": {
    "connectivity": { "success": true, "orgType": "Production" },
    "flowMetadata": { "success": true, "status": "Active" },
    "competingAutomation": { "success": true, "hasConflicts": true },
    "validationRules": { "success": true, "rulesFound": 3 }
  },
  "criticalIssues": [],
  "warnings": ["Race condition: Multiple Flows with same order"],
  "timestamp": "2025-11-12T14:30:00Z"
}
```

#### Save Report to File

```bash
# Generate markdown report
flow preflight Account_Validation_Flow \
  --output markdown \
  --report-file ./reports/preflight-report.md
```

#### Dry-Run Mode

```bash
# Show what would be checked without executing
flow preflight Account_Validation_Flow --dry-run

# Output:
Dry-run mode: The following checks would be performed:
  ✓ Org connectivity verification
  ✓ Flow metadata retrieval
  ✓ Competing automation detection (Account, after-save)
  ✓ Validation rule analysis (Account)
  ✓ Debug logging setup (Automated Process, 30 minutes)

No changes will be made to the org.
```

### Exit Codes

- `0` - All checks passed, can proceed
- `1` - Critical issues found, cannot proceed
- `2` - Warnings found, can proceed with caution
- `3` - Command error (invalid arguments, auth failure, etc.)

---

## 2. flow test

**Purpose**: Execute Flows with test data and capture execution results

### Syntax

```bash
flow test <flow-name> [options]
```

### Arguments

- `<flow-name>` (required) - Flow API name or path to Flow XML file

### Options

```bash
--org <alias>                    # Salesforce org alias

# Execution mode
--type <type>                    # Flow type: record-triggered|scheduled|screen|autolaunched
                                 # Default: auto-detect from metadata

# Record-triggered options
--object <name>                  # Object API name
--trigger-type <type>            # Trigger type: before-save|after-save
--operation <op>                 # Operation: insert|update|delete
--record-data <json>             # JSON string of field values
--record-data-file <path>        # Path to JSON file with field values
--record-id <id>                 # Existing record ID (for update/delete)

# Scheduled flow options
--batch-size <num>               # Batch size (default: 200)
--test-mode                      # Dry-run without committing changes

# Screen flow options
--input-variables <json>         # JSON array of input variables
--input-variables-file <path>   # Path to JSON file with input variables
--screen-responses <json>        # JSON array of screen responses

# Capture options
--capture-state                  # Capture record state before/after (default: true)
--capture-logs                   # Retrieve debug logs (default: true)
--cleanup                        # Delete test records after execution (default: true)

# Output options
--output <format>                # Output format: table|json|markdown|verbose
--report-file <path>             # Save execution report to file

--dry-run                        # Show what would be executed without running
```

### Examples

#### Test Record-Triggered Flow (Insert)

```bash
# Test Flow with inline JSON data
flow test Account_Validation_Flow \
  --type record-triggered \
  --object Account \
  --trigger-type after-save \
  --operation insert \
  --record-data '{"Name":"Test Account","Type":"Customer","Status__c":"Active"}' \
  --org neonone

# Output (table format):
┌──────────────────────────┬──────────────────────────────────────┐
│ Execution Summary        │                                      │
├──────────────────────────┼──────────────────────────────────────┤
│ Flow Name                │ Account_Validation_Flow              │
│ Version                  │ 5                                    │
│ Execution Type           │ Record-Triggered (After Save)        │
│ Status                   │ ✓ Success                            │
│ Duration                 │ 3.2 seconds                          │
│ Elements Executed        │ 8                                    │
│ Decisions Evaluated      │ 2                                    │
│ Records Modified         │ 1 (Account)                          │
└──────────────────────────┴──────────────────────────────────────┘

State Changes:
  Field: Status__c
    Before: Pending
    After:  Active

  Field: LastActivityDate
    Before: 2025-11-10
    After:  2025-11-12

Debug Log: 07Lxx000000XXXX (parsed, 0 errors)
Test Record: 001xx000000XXXX (deleted after test)
```

#### Test with Data File

```bash
# Use JSON file for test data
cat > test-data.json << EOF
{
  "Name": "Test Account",
  "Type": "Customer",
  "Status__c": "Active",
  "Industry": "Technology"
}
EOF

flow test Account_Validation_Flow \
  --type record-triggered \
  --object Account \
  --operation insert \
  --record-data-file test-data.json
```

#### Test Scheduled Flow

```bash
# Execute scheduled Flow on-demand
flow test Daily_Account_Cleanup \
  --type scheduled \
  --batch-size 200 \
  --test-mode  # Dry-run mode

# Output:
=== Scheduled Flow Execution ===
Flow: Daily_Account_Cleanup
Batch Size: 200 records
Test Mode: ON (changes will not be committed)

Records processed: 150
  - Skipped: 50 (did not meet criteria)
  - Updated: 100

Changes (not committed):
  - Account.Status__c: 'Inactive' → 'Archived' (100 records)

Duration: 8.5 seconds
```

#### Test Screen Flow

```bash
# Test screen Flow with input variables
flow test Contact_Survey_Flow \
  --type screen \
  --input-variables '[
    {"name":"ContactId","type":"String","value":"003xx000000XXXX"},
    {"name":"SurveyScore","type":"Number","value":85}
  ]' \
  --screen-responses '[
    {"screenName":"Screen1","fields":{"Question1":"Yes","Question2":"No"}}
  ]'

# Output:
=== Screen Flow Execution ===
Flow: Contact_Survey_Flow

Input Variables:
  ContactId: 003xx000000XXXX
  SurveyScore: 85

Screens Processed:
  Screen1: Question1=Yes, Question2=No

Output Variables:
  SurveyComplete: true
  FollowupRequired: false

Duration: 2.1 seconds
```

#### JSON Output for Automation

```bash
# Generate JSON for test reporting
flow test Account_Validation_Flow \
  --object Account \
  --operation insert \
  --record-data '{"Name":"Test"}' \
  --output json

# Output:
{
  "success": true,
  "executionId": "exec_20251112_143000",
  "flowApiName": "Account_Validation_Flow",
  "executionType": "record_triggered",
  "duration": 3200,
  "recordId": "001xx000000XXXX",
  "recordBefore": { "Status__c": "Pending" },
  "recordAfter": { "Status__c": "Active" },
  "elementsExecuted": ["Decision1", "Assignment1", "Update1"],
  "errors": [],
  "debugLogIds": ["07Lxx000000XXXX"],
  "cleanupPerformed": true
}
```

#### Multiple Test Cases

```bash
# Run multiple test cases (batch mode)
for status in Active Inactive Error; do
  flow test Account_Validation_Flow \
    --object Account \
    --operation insert \
    --record-data "{\"Name\":\"Test\",\"Status__c\":\"$status\"}" \
    --quiet
done

# Use with coverage analysis:
flow test Account_Validation_Flow --record-data '{"Status__c":"Active"}' --output json > test1.json
flow test Account_Validation_Flow --record-data '{"Status__c":"Inactive"}' --output json > test2.json
flow test Account_Validation_Flow --record-data '{"Status__c":"Error"}' --output json > test3.json

# Then analyze coverage (see flow diagnose coverage)
```

### Exit Codes

- `0` - Execution succeeded
- `1` - Execution failed (Flow error, validation error, etc.)
- `2` - Partial success (warnings, cleanup failed, etc.)
- `3` - Command error (invalid arguments, auth failure, etc.)

---

## 3. flow logs

**Purpose**: Retrieve and parse debug logs for Flow execution analysis

### Syntax

```bash
flow logs [options]
```

### Subcommands

```bash
flow logs list [options]         # List available debug logs
flow logs parse <log-id>         # Parse a specific debug log
flow logs latest [options]       # Parse most recent debug log
flow logs errors <log-id>        # Extract only errors from log
```

### Options

#### flow logs list

```bash
--org <alias>                    # Salesforce org alias
--user <username>                # Filter by username (default: all)
--flow <name>                    # Filter by Flow name
--days <num>                     # Logs from last N days (default: 1)
--limit <num>                    # Max logs to return (default: 50)
--status <status>                # Filter by status: success|failed|all (default: all)

--output <format>                # Output format: table|json|list
```

#### flow logs parse

```bash
--org <alias>                    # Salesforce org alias
--extract-only-errors            # Extract only error lines
--parse-formulas                 # Parse formula evaluations (default: true)
--parse-decisions                # Parse decision outcomes (default: true)

--output <format>                # Output format: table|json|markdown|verbose
--report-file <path>             # Save parsed report to file
```

#### flow logs latest

```bash
--org <alias>                    # Salesforce org alias
--user <username>                # Username (default: Automated Process)
--flow <name>                    # Filter by Flow name
--max-age-days <num>             # Only consider logs from last N days (default: 1)

--output <format>                # Output format: table|json|markdown|verbose
--report-file <path>             # Save parsed report to file
```

#### flow logs errors

```bash
--org <alias>                    # Salesforce org alias
--output <format>                # Output format: table|json|list
```

### Examples

#### List Recent Logs

```bash
# List all logs from last 24 hours
flow logs list --org neonone

# Output (table format):
┌──────────────────┬────────────────────────────┬──────────┬─────────┬──────────┐
│ Log ID           │ Timestamp                  │ User     │ Flow    │ Status   │
├──────────────────┼────────────────────────────┼──────────┼─────────┼──────────┤
│ 07Lxx000000XXXX1 │ 2025-11-12 14:30:00        │ AutoProc │ AcctVal │ Success  │
│ 07Lxx000000XXXX2 │ 2025-11-12 14:25:00        │ AutoProc │ AcctVal │ Failed   │
│ 07Lxx000000XXXX3 │ 2025-11-12 14:20:00        │ admin    │ LeadAss │ Success  │
└──────────────────┴────────────────────────────┴──────────┴─────────┴──────────┘

Total: 3 logs (2 success, 1 failed)
```

#### List Logs for Specific Flow

```bash
# Filter by Flow name
flow logs list --flow Account_Validation_Flow --days 7

# Output:
Found 15 logs for Account_Validation_Flow (last 7 days)
  Success: 13
  Failed: 2

Most recent: 07Lxx000000XXXX1 (2025-11-12 14:30:00)
```

#### Parse Specific Log

```bash
# Parse a debug log
flow logs parse 07Lxx000000XXXX

# Output (table format):
┌──────────────────────────┬──────────────────────────────────────┐
│ Log Summary              │                                      │
├──────────────────────────┼──────────────────────────────────────┤
│ Log ID                   │ 07Lxx000000XXXX                      │
│ Timestamp                │ 2025-11-12 14:30:00                  │
│ Duration                 │ 3.2 seconds                          │
│ Flow Executions          │ 1                                    │
│ Elements Executed        │ 8                                    │
│ Decisions Evaluated      │ 2                                    │
│ Errors                   │ 0                                    │
└──────────────────────────┴──────────────────────────────────────┘

Flow Execution: Account_Validation_Flow (v5)
  Duration: 3.2s
  Outcome: Success

Elements Executed:
  1. Decision1 (Decision) - 0.5s
  2. Assignment1 (Assignment) - 0.2s
  3. Update1 (RecordUpdate) - 2.0s

Decisions Evaluated:
  Decision1: Status__c = 'Active' → TRUE (Continue branch)

Governor Limits:
  SOQL Queries: 2 / 100
  DML Statements: 1 / 150
  CPU Time: 320ms / 10000ms
  Heap Size: 1.2MB / 6MB
```

#### Parse Latest Log

```bash
# Parse most recent log for Flow
flow logs latest --flow Account_Validation_Flow --user "Automated Process"

# Output:
Latest log: 07Lxx000000XXXX (2025-11-12 14:30:00)

Flow: Account_Validation_Flow (v5)
Status: Success
Duration: 3.2s
Elements: 8 executed
Errors: None

[Detailed parse output follows...]
```

#### Extract Errors Only

```bash
# Extract Flow errors from log
flow logs errors 07Lxx000000XXXX

# Output (verbose format):
=== Flow Errors ===
Log ID: 07Lxx000000XXXX
Timestamp: 2025-11-12 14:25:00

Error 1:
  Type: FIELD_CUSTOM_VALIDATION_EXCEPTION
  Message: Lead Source is required for all Accounts
  Element: Update1 (RecordUpdate)
  Line: 145
  Recommendation: Add Assignment element to set LeadSource field before Update

Error 2:
  Type: FLOW_ELEMENT_ERROR
  Message: The flow tried to update records in a way that isn't allowed
  Element: Assignment1
  Line: 98
  Stack Trace: [...]
  Recommendation: Check field-level security and object permissions
```

#### JSON Output for Log Analysis

```bash
# Generate JSON for automated analysis
flow logs parse 07Lxx000000XXXX --output json > log-analysis.json

# Use with jq for filtering
flow logs parse 07Lxx000000XXXX --output json | jq '.errors'
flow logs parse 07Lxx000000XXXX --output json | jq '.governorLimits.soqlQueries'
```

#### Markdown Report

```bash
# Generate markdown report
flow logs parse 07Lxx000000XXXX \
  --output markdown \
  --report-file ./reports/log-analysis.md
```

### Exit Codes

- `0` - Command succeeded
- `1` - Log not found or parse failed
- `2` - Errors found in log
- `3` - Command error (invalid arguments, auth failure, etc.)

---

## 4. flow diagnose

**Purpose**: Run comprehensive diagnostic workflows

### Syntax

```bash
flow diagnose <workflow> <flow-name> [options]
```

### Workflows

```bash
flow diagnose preflight <flow-name> [options]     # Run preflight diagnostic
flow diagnose execution <flow-name> [options]     # Run execution diagnostic
flow diagnose coverage <flow-name> [options]      # Run coverage diagnostic
flow diagnose full <flow-name> [options]          # Run full diagnostic (all 3)
```

### Options

#### flow diagnose preflight

```bash
--org <alias>                    # Salesforce org alias
--object <name>                  # Object API name
--trigger-type <type>            # Trigger type
--setup-logging                  # Configure debug logging (default: true)

--output <format>                # Output format: table|json|markdown|verbose
--report-file <path>             # Save report to file
```

#### flow diagnose execution

```bash
--org <alias>                    # Salesforce org alias
--object <name>                  # Object API name
--trigger-type <type>            # Trigger type
--operation <op>                 # Operation: insert|update|delete
--record-data <json>             # JSON string of field values
--record-data-file <path>        # Path to JSON file

--capture-state                  # Capture before/after state (default: true)
--parse-logs                     # Parse debug logs (default: true)

--output <format>                # Output format: table|json|markdown|verbose
--report-file <path>             # Save report to file
```

#### flow diagnose coverage

```bash
--org <alias>                    # Salesforce org alias
--object <name>                  # Object API name
--trigger-type <type>            # Trigger type
--test-cases-file <path>         # Path to JSON file with test cases

--generate-test-plan             # Generate test plan if coverage < 100% (default: true)
--target-coverage <percent>      # Target coverage percentage (default: 100)

--output <format>                # Output format: table|json|markdown|html|pdf
--report-file <path>             # Save report to file
```

#### flow diagnose full

```bash
--org <alias>                    # Salesforce org alias
--object <name>                  # Object API name
--trigger-type <type>            # Trigger type
--test-cases-file <path>         # Path to JSON file with test cases

--continue-on-warnings           # Continue even if preflight warnings
--skip-preflight                 # Skip preflight diagnostic
--skip-execution                 # Skip execution diagnostic
--skip-coverage                  # Skip coverage diagnostic

--output <format>                # Output format: table|json|markdown|html|pdf
--report-file <path>             # Save consolidated report to file
```

### Examples

#### Run Preflight Diagnostic

```bash
# Comprehensive pre-flight validation
flow diagnose preflight Account_Validation_Flow \
  --object Account \
  --trigger-type after-save \
  --org neonone

# Output:
=== Preflight Diagnostic Report ===
Flow: Account_Validation_Flow
Org: neonone (Sandbox)

Connectivity: ✓ Pass
Flow Metadata: ✓ Pass
Competing Automation: ⚠ Warning (2 conflicts)
Validation Rules: ✓ Pass
Debug Logging: ✓ Pass

Summary:
  Total Checks: 5
  Passed: 4
  Warnings: 1
  Critical Issues: 0

Can Proceed: Yes (with caution)

Recommendations:
  1. Set explicit trigger order to avoid race conditions
  2. Review competing Apex trigger (AccountTrigger)

Report saved: ./reports/preflight-diagnostic-20251112-143000.md
```

#### Run Execution Diagnostic

```bash
# Execute Flow and analyze results
flow diagnose execution Account_Validation_Flow \
  --object Account \
  --operation insert \
  --record-data '{"Name":"Test Account","Status__c":"Active"}'

# Output:
=== Execution Diagnostic Report ===
Flow: Account_Validation_Flow
Org: neonone

Execution Summary:
  Status: ✓ Success
  Duration: 3.2 seconds
  Elements Executed: 8
  Decisions Evaluated: 2

State Changes:
  Account (001xx000000XXXX):
    Status__c: Pending → Active
    LastActivityDate: 2025-11-10 → 2025-11-12

Debug Log Analysis:
  Log ID: 07Lxx000000XXXX
  Errors: 0
  Governor Limits: All within bounds

Recommendations:
  ✓ Flow executed successfully
  ✓ No optimization needed

Report saved: ./reports/execution-diagnostic-20251112-143500.md
```

#### Run Coverage Diagnostic

```bash
# Analyze branch coverage from test cases
cat > test-cases.json << EOF
[
  { "recordData": { "Status__c": "Active" } },
  { "recordData": { "Status__c": "Inactive" } },
  { "recordData": { "Status__c": "Error" } }
]
EOF

flow diagnose coverage Account_Validation_Flow \
  --object Account \
  --trigger-type after-save \
  --test-cases-file test-cases.json

# Output:
=== Coverage Diagnostic Report ===
Flow: Account_Validation_Flow (v5)
Test Cases: 3 executed

Coverage Summary:
  Total Elements: 12
  Elements Executed: 10
  Coverage: 83.3%

Decision Coverage:
  Status_Check: 100% (2/2 outcomes)
  Error_Handler: 50% (1/2 outcomes)

Uncovered Elements:
  - Error_Notification
  - Escalation_Email

Test Plan Generated:
  Need 2 more tests for 100% coverage

  Test 1: Error_Notification_Path
    Objective: Execute error notification branch
    Test Data: { "Status__c": "Error", "Owner": null }

  Test 2: Escalation_Path
    Objective: Execute escalation email
    Test Data: { "Status__c": "Critical", "Priority": "High" }

Report saved: ./reports/coverage-diagnostic-20251112-144000.html
```

#### Run Full Diagnostic

```bash
# Complete diagnostic workflow (preflight + execution + coverage)
flow diagnose full Account_Validation_Flow \
  --object Account \
  --trigger-type after-save \
  --test-cases-file test-cases.json \
  --output pdf \
  --report-file ./reports/full-diagnostic-report.pdf

# Output:
=== Full Diagnostic Workflow ===
Flow: Account_Validation_Flow
Org: neonone

Phase 1: Preflight Checks
  ✓ Connectivity: Pass
  ✓ Flow Metadata: Pass
  ⚠ Competing Automation: Warning
  ✓ Validation Rules: Pass
  ✓ Debug Logging: Pass

Phase 2: Execution Testing
  ✓ Execution 1: Success (Status=Active)
  ✓ Execution 2: Success (Status=Inactive)
  ✓ Execution 3: Success (Status=Error)

Phase 3: Coverage Analysis
  ✓ Coverage: 83.3%
  ⚠ 2 uncovered elements
  ✓ Test plan generated

Overall Summary:
  Can Deploy: Yes
  Ready for Production: Yes (with caution)
  Critical Issues: 0
  Warnings: 2
  Coverage: 83.3%

Recommendations:
  1. Increase coverage to 100% before production deployment
  2. Review competing automation conflicts
  3. Consider staged activation strategy

Report saved: ./reports/full-diagnostic-report.pdf
```

#### JSON Output for CI/CD

```bash
# Generate JSON for automated deployment pipelines
flow diagnose full Account_Validation_Flow \
  --object Account \
  --test-cases-file test-cases.json \
  --output json > diagnostic-results.json

# Use in CI/CD to block deployment if issues
if jq -e '.overallSummary.canDeploy == false' diagnostic-results.json; then
  echo "Diagnostic failed - blocking deployment"
  exit 1
fi
```

### Exit Codes

- `0` - Diagnostic passed, ready for deployment
- `1` - Critical issues found, cannot deploy
- `2` - Warnings found, can deploy with caution
- `3` - Command error (invalid arguments, auth failure, etc.)

---

## Command Chaining Examples

### Example 1: Pre-Flight → Test → Deploy

```bash
# Run pre-flight checks
flow preflight MyFlow --org sandbox || exit 1

# Test Flow
flow test MyFlow --object Account --operation insert \
  --record-data '{"Name":"Test"}' --org sandbox || exit 1

# Deploy to production
flow deploy MyFlow.xml --org production --activate
```

### Example 2: Diagnose → Fix → Re-Diagnose

```bash
# Run diagnostic
flow diagnose full MyFlow --test-cases-file tests.json --output json > results.json

# Check coverage
COVERAGE=$(jq -r '.coverage.coverage.coveragePercentage' results.json)

if [ "$COVERAGE" -lt 80 ]; then
  echo "Coverage too low: $COVERAGE%"

  # Generate test plan
  jq '.coverage.testPlan.testCases' results.json

  # Add more tests (manual step)

  # Re-run coverage diagnostic
  flow diagnose coverage MyFlow --test-cases-file updated-tests.json
fi
```

### Example 3: Batch Testing

```bash
# Test multiple Flows in parallel
for flow in Flow1 Flow2 Flow3; do
  (
    flow preflight $flow --quiet && \
    flow test $flow --record-data '{"Name":"Test"}' --quiet && \
    echo "$flow: PASS"
  ) || echo "$flow: FAIL" &
done
wait
```

---

## Integration with Existing Flow CLI

These diagnostic commands extend the existing Flow CLI:

**Existing Commands**:
- `flow create` - Create new Flow from template
- `flow add` - Add elements to Flow
- `flow validate` - Static validation
- `flow deploy` - Deploy Flow to org
- `flow docs` - Generate documentation
- `flow diff` - Compare Flow versions
- `flow template` - Manage templates
- `flow batch` - Batch operations
- `flow runbook` - Access runbooks

**New Diagnostic Commands** (Runbook 7):
- `flow preflight` - Pre-flight checks
- `flow test` - Execute Flows with test data
- `flow logs` - Parse debug logs
- `flow diagnose` - Diagnostic workflows

**Example Integration**:
```bash
# Complete workflow: create → validate → preflight → test → deploy
flow create MyFlow --template lead-assignment
flow validate MyFlow.xml --best-practices
flow preflight MyFlow --object Lead
flow test MyFlow --object Lead --operation insert --record-data '{...}'
flow deploy MyFlow.xml --activate
```

---

## CLI Implementation Notes

### Spinner & Progress

All long-running operations should show spinner:

```javascript
const ora = require('ora');

const spinner = ora('Running preflight checks...').start();
// ... perform checks ...
spinner.succeed('Preflight checks completed');
```

### Color Coding

Use consistent color scheme:

```javascript
const chalk = require('chalk');

console.log(chalk.green('✓ Pass'));    // Success
console.log(chalk.yellow('⚠ Warn'));   // Warning
console.log(chalk.red('✗ Fail'));      // Error
console.log(chalk.blue('ℹ Info'));     // Info
```

### Table Formatting

Use `cli-table3` for consistent table output:

```javascript
const Table = require('cli-table3');

const table = new Table({
  head: ['Check', 'Status', 'Details'],
  colWidths: [30, 10, 50]
});
```

### Error Handling

Provide clear error messages with actionable guidance:

```javascript
console.error(chalk.red('✗ Flow not found: MyFlow'));
console.error(chalk.yellow('Tip: Check Flow name or deploy Flow first:'));
console.error('  sf project deploy start -m Flow:MyFlow');
process.exit(3);
```

---

## Testing CLI Commands

### Unit Tests

```javascript
// test/cli/flow-preflight.test.js
describe('flow preflight', () => {
  it('should run all checks by default', async () => {
    const result = await runCLI('flow preflight MyFlow --org sandbox');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Connectivity: Pass');
  });
});
```

### Integration Tests

```javascript
// test/integration/flow-diagnose.test.js
describe('flow diagnose full', () => {
  it('should generate PDF report', async () => {
    const result = await runCLI(
      'flow diagnose full MyFlow --output pdf --report-file report.pdf'
    );
    expect(fs.existsSync('report.pdf')).toBe(true);
  });
});
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-12 | Initial CLI syntax specification |

---

**Next**: Phase 3 implementation begins with CLI integration into `flow-cli.js`
