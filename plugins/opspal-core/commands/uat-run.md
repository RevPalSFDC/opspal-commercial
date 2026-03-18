---
name: uat-run
description: Execute UAT tests from CSV workbooks against Salesforce or HubSpot, with automated step execution, context management, and report generation
argument-hint: "<csv-file> [options]"
stage: ready
---

# UAT Run Command

Execute UAT (User Acceptance Testing) tests from CSV workbooks against Salesforce, HubSpot, or other platforms. Supports sequential multi-step test scenarios with automatic context management, record creation, verification, and comprehensive reporting.

## Usage

```bash
/uat-run <csv-file> [options]
```

## Quick Examples

**Run All Tests (Salesforce):**
```bash
/uat-run /path/to/test-cases.csv --org my-sandbox
```

**Filter by Epic:**
```bash
/uat-run /path/to/test-cases.csv --org my-sandbox --epic "CPQ Workflow"
```

**Dry Run (No Record Creation):**
```bash
/uat-run /path/to/test-cases.csv --org my-sandbox --dry-run
```

**HubSpot Platform:**
```bash
/uat-run /path/to/test-cases.csv --platform hubspot --portal 12345678
```

## Task Breakdown

### Step 1: Parse User Input

**Analyze the command arguments:**
- Locate CSV file path
- Determine target platform (default: salesforce)
- Extract org alias or portal ID
- Parse filter options (epic, scenario)
- Identify output options

**If no CSV provided:**
- Search for CSV files in current directory
- Prompt user to select test workbook
- Show available test cases preview

### Step 2: Validate Environment

**For Salesforce:**
```bash
# Verify org authentication
sf org display --target-org $ORG_ALIAS

# Check user permissions for test operations
sf data query --query "SELECT Profile.Name FROM User WHERE Id = '$USER_ID'" --target-org $ORG_ALIAS
```

**For HubSpot:**
```bash
# Verify API access
# Check portal permissions
```

**User Confirmation:**
```
UAT Test Execution Setup
════════════════════════════════════════════════════

📄 CSV File: /path/to/QA_Workbook_CPQ.csv
🔧 Platform: Salesforce
🏢 Org: my-sandbox (sandbox)
👤 User: test@company.com

Test Cases Found: 12
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Epic: Streamlined CPQ Workflow (4 cases)
Epic: Multi-Quote Management (3 cases)
Epic: Renewals & Amendments (5 cases)

Mode: LIVE (will create/modify records)
Cleanup: Enabled (records deleted after tests)

Proceed with test execution? [Y/n]
```

### Step 3: Parse CSV Workbook

**Expected CSV Format:**
```csv
Epic,User Story,Acceptance Criteria,Test Scenario,Result,Pass/Fail,Test Record URL,Tester Comments
Streamlined CPQ,As a sales rep...,Given/When/Then,From Account → Create opp...,,,
```

**Key Columns:**
| Column | Required | Description |
|--------|----------|-------------|
| Epic | No | Test grouping category |
| User Story | No | User story description |
| Acceptance Criteria | No | Given/When/Then format |
| Test Scenario | Yes | Step-by-step test instructions |
| Result | No | Execution result (populated after run) |
| Pass/Fail | No | Status (populated after run) |
| Test Record URL | No | Link to test records (populated after run) |
| Tester Comments | No | Notes (populated after run) |

**Step Parsing:**
The Test Scenario column is parsed to extract executable steps:
- `From Account` → Navigate to Account object
- `Create opp` → Create Opportunity record
- `Add products after Qualification` → Update with precondition
- `Create quote` → Create Quote record (SBQQ__Quote__c)
- `Mark Primary` → Update field (SBQQ__Primary__c = true)
- `Verify rollups` → Check calculated fields match

### Step 4: Execute Test Cases

**For Each Test Case:**

1. **Clear Context** - Reset record ID tracking
2. **Execute Steps** - Run each step sequentially
3. **Track Context** - Store created record IDs for reference
4. **Collect Evidence** - Capture record URLs, timestamps
5. **Determine Result** - Pass/Fail/Partial based on step outcomes

**Context Variables:**
Steps can reference previously created records:
- `{AccountId}` - Last created Account record
- `{OpportunityId}` - Last created Opportunity record
- `{QuoteId}` - Last created Quote record
- `{lastRecordId}` - Most recent record of any type

**Progress Display:**
```
Running: Streamlined CPQ Workflow - Create Quote from Opportunity
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 25%

  Step 1: From Account
    ✓ PASSED (12ms)

  Step 2: Create Opportunity
    ✓ PASSED (345ms)
    → Created: 006xx00000ABC123

  Step 3: Add products after Qualification
    → RUNNING...
```

### Step 5: Generate Reports

**After execution completes:**

**Console Summary:**
```
╔════════════════════════════════════════════════════════════╗
║                  UAT TEST EXECUTION SUMMARY                ║
╚════════════════════════════════════════════════════════════╝

Platform:   Salesforce
Status:     ✅ PASSED (11/12)
Duration:   4m 23s

Test Cases:
  Total:    12
  Passed:   10
  Failed:   1
  Partial:  1 (manual steps)
  Pass Rate: 83%

Steps:
  Total:    48
  Passed:   42
  Failed:   2
  Manual:   4

Failed Test Cases:
  ✗ Amendment flow with concurrent quotes
    Step 5: Expected Amendment to be blocked, but action was allowed
```

**Generated Reports:**
```
📁 Reports Generated:
  📄 uat-report-2025-01-15.md   (Markdown)
  📊 uat-report-2025-01-15.csv  (Spreadsheet)
  📋 uat-report-2025-01-15.json (Machine-readable)

Location: ./uat-reports/
```

### Step 6: Cleanup

**If cleanup enabled (default):**
```
Cleanup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cleaning up 24 record(s)...
  ✓ Deleted SBQQ__QuoteLine__c: a0Qxx00000DEF456
  ✓ Deleted SBQQ__Quote__c: a0Zxx00000ABC123
  ✓ Deleted Opportunity: 006xx00000ABC123
  ✓ Deleted Account: 001xx00000XYZ789
  ✓ Cleanup complete (24/24 deleted)
```

## Options Reference

### Required Options

| Flag | Description | Example |
|------|-------------|---------|
| `<csv-file>` | Path to UAT CSV workbook | `/path/to/tests.csv` |

### Platform Options

| Flag | Description | Default |
|------|-------------|---------|
| `--platform` | Target platform | `salesforce` |
| `--org` | Salesforce org alias | Required for SF |
| `--portal` | HubSpot portal ID | Required for HS |

### Filter Options

| Flag | Description | Example |
|------|-------------|---------|
| `--epic "NAME"` | Filter by epic name | `--epic "CPQ Workflow"` |
| `--scenario "PATTERN"` | Filter by scenario pattern | `--scenario "Quote"` |
| `--story "PATTERN"` | Filter by user story | `--story "sales rep"` |

### Execution Options

| Flag | Description | Default |
|------|-------------|---------|
| `--dry-run` | Preview without creating records | false |
| `--stop-on-failure` | Stop test suite on first failure | false |
| `--no-cleanup` | Keep created records after tests | false |
| `--verbose` | Show detailed execution logs | false |

### Output Options

| Flag | Description | Default |
|------|-------------|---------|
| `--output-dir` | Report output directory | `./uat-reports/` |
| `--format` | Report formats | `md,csv,json` |
| `--no-report` | Skip report generation | false |

## Supported Step Actions

### Navigation
- `From {Object}` - Set context to object type
- `Navigate to {Object}` - Same as above

### Record Operations
- `Create {Object}` - Create new record
- `Update {Field}` - Update field on current record
- `Check {Field}` - Mark checkbox field true
- `Set {Field} to {Value}` - Set specific value

### Verification
- `Verify {Field}` - Check field has expected value
- `Verify rollups` - Verify calculated rollup fields
- `Verify blocked` - Confirm action was prevented

### Approvals
- `Submit for approval` - Submit record for approval
- `Approve` - Approve pending approval
- `Reject` - Reject pending approval

### CPQ-Specific
- `Mark Primary` - Set quote as primary (SBQQ__Primary__c)
- `Add products` - Add line items to quote
- `Calculate` - Trigger CPQ calculator

### Preconditions
- `after {Stage}` - Wait for opportunity stage
- `when {Condition}` - Check condition before step

## Common Workflows

### Workflow 1: Full CPQ Test Suite
```bash
# Run complete CPQ test workbook
/uat-run ~/Downloads/QA_Workbook_CPQ.csv \
  --org cpq-sandbox \
  --verbose \
  --output-dir ./cpq-test-results/
```

### Workflow 2: Filtered Epic Testing
```bash
# Run only renewal tests
/uat-run ~/Downloads/QA_Workbook_CPQ.csv \
  --org cpq-sandbox \
  --epic "Renewals"
```

### Workflow 3: Dry Run Preview
```bash
# Preview what would execute without making changes
/uat-run ~/Downloads/QA_Workbook_CPQ.csv \
  --org cpq-sandbox \
  --dry-run
```

### Workflow 4: Keep Test Records
```bash
# Run tests but keep records for manual inspection
/uat-run ~/Downloads/QA_Workbook_CPQ.csv \
  --org cpq-sandbox \
  --no-cleanup
```

### Workflow 5: CI/CD Integration
```bash
# Run with JSON output for automated processing
/uat-run ~/Downloads/QA_Workbook_CPQ.csv \
  --org ci-sandbox \
  --format json \
  --stop-on-failure
```

## CSV Template

**Download template:** Create a CSV with these columns:

```csv
Epic,User Story,Acceptance Criteria,Test Scenario,Result,Pass/Fail,Test Record URL,Tester Comments
Streamlined CPQ Workflow,"As a sales rep, I want to create quotes quickly","Given an Account exists
When I create an Opportunity
And add a Quote
Then the Quote should be linked to the Opportunity","From Account → Create opp → Create quote → Verify quote linked to opp",,,,
Multi-Quote Management,"As a sales rep, I want to manage multiple quotes","Given an Opportunity with quotes
When I mark a quote as Primary
Then rollups should update","From Account → Create opp → Create quote → Create second quote → Mark Primary on first → Verify rollups",,,,
```

**Step Syntax:**
- Use `→` (arrow) to separate steps
- Steps are case-insensitive
- Objects map to Salesforce API names (Quote → SBQQ__Quote__c)

## Error Handling

### Authentication Errors
```
❌ Salesforce authentication failed

Solutions:
- Run: sf org login web --alias my-sandbox
- Verify org alias: sf org list
- Check session not expired
```

### Permission Errors
```
❌ Step 3 failed: INSUFFICIENT_ACCESS_OR_READONLY

The authenticated user lacks permission to create SBQQ__Quote__c.

Solutions:
- Assign CPQ License to test user
- Add SBQQ__Quote__c CRUD permissions
- Use integration user with full access
```

### Validation Rule Errors
```
⚠️  Step 4 warning: Validation rule fired

Rule: Quote_Requires_Contact
Message: A primary contact is required for quotes.

The test captured this validation error. Depending on test intent:
- If testing validation: Mark as PASSED
- If validation unexpected: Fix test data or rule
```

### Cleanup Failures
```
⚠️  Cleanup partial - 2 records remain

Failed to delete:
- Opportunity 006xx00000ABC123: ENTITY_IS_LOCKED
- Quote a0Zxx00000DEF456: Cannot delete, child records exist

These records may need manual cleanup.
```

## Troubleshooting

### Issue: Steps not parsing correctly
```
⚠️  Could not parse step: "do the thing"

Solutions:
- Use recognized step patterns (Create, Update, Verify)
- Check spelling matches expected keywords
- Review step parsing documentation
```

### Issue: Context variables not resolving
```
❌ Step 5 failed: Record ID not found for Quote

The step referenced {QuoteId} but no Quote was created in earlier steps.

Solutions:
- Ensure Create quote step ran successfully
- Check step order in test scenario
- Verify no failures in dependent steps
```

### Issue: Tests running slowly
```
⚠️  Test suite taking longer than expected

Possible causes:
- Large number of test cases
- Complex validation rules executing
- Slow org response times

Solutions:
- Filter to specific epic for faster iteration
- Use --dry-run for quick validation
- Run during off-peak hours
```

## Integration Points

**This command integrates with:**
- **sfdc-cpq-assessor** - Use after assessment to validate configuration
- **sfdc-automation-auditor** - Run UAT after automation changes
- **release-coordinator** - Include in pre-deployment validation

**Post-Run Actions:**
- Generate PDF report with `/generate-pdf`
- Upload results to Google Drive
- Create Asana tasks for failures
- Slack notification on completion

## Implementation Details

```javascript
const { UATTestRunner } = require('../scripts/lib/uat-test-runner');
const { UATReportGenerator } = require('../scripts/lib/uat-report-generator');

// Initialize runner
const runner = new UATTestRunner({
  platform: 'salesforce',
  orgAlias: 'my-sandbox',
  verbose: true,
  cleanup: true
});

// Execute from CSV
const results = await runner.runFromCSV('/path/to/tests.csv', {
  epic: 'CPQ Workflow'  // Optional filter
});

// Generate reports
const generator = new UATReportGenerator(results);
await generator.generateAll('./uat-reports/', 'cpq-tests');

console.log(generator.getSummaryText());
```

## Success Criteria

- ✅ All automated steps executed successfully
- ✅ Context passed correctly between steps
- ✅ Records created with correct relationships
- ✅ Rollup calculations verified
- ✅ Reports generated in all formats
- ✅ Cleanup completed (unless --no-cleanup)
- ✅ Clear failure messages for any issues

---

**Ready to automate your UAT testing workflow!**
