# UAT Browser Testing

## Purpose

Execute User Acceptance Testing (UAT) using Playwright MCP for UI-based test steps. This runbook covers test execution patterns, evidence collection, visual verification, and cross-platform testing.

## Prerequisites

- [ ] Playwright MCP server configured
- [ ] UAT test cases prepared (CSV or JSON)
- [ ] Test environment accessible (Salesforce sandbox, HubSpot test portal)
- [ ] Authenticated sessions for target platforms

## Procedure

### 1. Test Step Types

**UI-based test steps supported:**

| Action Type | Description | Playwright Tool |
|-------------|-------------|-----------------|
| Navigate | Go to URL or page | `browser_navigate` |
| Click | Click button/link | `browser_click` |
| Fill | Enter text in field | `browser_fill` |
| Select | Choose dropdown option | `browser_select_option` |
| Verify | Check text/element exists | `browser_snapshot` + validation |
| Screenshot | Capture evidence | `browser_take_screenshot` |
| Wait | Wait for condition | `browser_wait` |

### 2. Test Case CSV Format

**Standard UAT format with UI actions:**

```csv
Epic,User Story,Test Scenario,Platform,Actions,Expected Result,Pass/Fail
CPQ Workflow,Create Quote,"From Account, create quote",Salesforce,"Navigate to Account;Click New Quote;Fill Quote Name=Test Quote;Click Save",Quote record created,
Lead Conversion,Convert Lead,Convert qualified lead,Salesforce,"Navigate to Lead;Click Convert;Select Account;Click Convert",Lead converted to Contact,
```

**Actions syntax:**
- Semicolon-separated steps
- `Action Key=Value` format for data entry
- Plain `Action Target` for clicks/navigation

### 3. Executing UI Test Steps

**Pattern for each test case:**

```
1. Parse test scenario actions
2. For each action:
   a. Execute action (navigate, click, fill, etc.)
   b. Wait for result
   c. Capture screenshot as evidence
3. Verify expected result
4. Record pass/fail
```

**Example execution:**

```
Test: Create Quote from Account

Step 1: Navigate to Account record
- browser_navigate to /lightning/r/Account/{id}/view
- browser_wait for "Account" heading
- browser_take_screenshot "01-account-record"

Step 2: Click New Quote
- browser_snapshot to find "New Quote" button
- browser_click "New Quote"
- browser_wait for quote form
- browser_take_screenshot "02-new-quote-form"

Step 3: Fill Quote Name
- browser_fill "Quote Name" with "Test Quote"
- browser_take_screenshot "03-quote-name-filled"

Step 4: Click Save
- browser_click "Save"
- browser_wait for success toast
- browser_take_screenshot "04-quote-saved"

Step 5: Verify
- browser_snapshot
- Check for quote record ID in URL
- Mark PASS/FAIL
```

### 4. Visual Verification Patterns

**Text verification:**
```
1. Take snapshot
2. Check if expected text exists in snapshot
3. Pass if found, fail if not
```

**Element verification:**
```
1. Take snapshot
2. Find element by role + name
3. Verify element state (enabled, checked, etc.)
```

**Value verification:**
```
1. Take snapshot
2. Find form field
3. Check field value matches expected
```

### 5. Screenshot Evidence Collection

**Evidence naming convention:**
```
{test-case-id}_{step-number}_{description}.png

Examples:
- TC001_01_account-record.png
- TC001_02_new-quote-form.png
- TC001_03_quote-saved.png
```

**Evidence organization:**
```
instances/{env}/uat/
└── {test-run-date}/
    ├── TC001/
    │   ├── 01_account-record.png
    │   ├── 02_new-quote-form.png
    │   └── 03_quote-saved.png
    ├── TC002/
    │   └── ...
    └── summary-report.json
```

### 6. Cross-Platform Testing

**Salesforce + HubSpot test:**

```
Test: Verify Lead Sync

Salesforce Steps:
1. Navigate to Lead record in Salesforce
2. Note Lead details
3. Screenshot SF lead

HubSpot Steps:
4. Navigate to same Contact in HubSpot
5. Verify data matches
6. Screenshot HS contact

Verification:
7. Compare key field values
8. Report sync status
```

**Session switching:**
```
1. Complete Salesforce steps with SF session
2. Switch to HubSpot session
3. Complete HubSpot steps
4. Compare results
```

### 7. Handling Test Data

**Record ID context:**
```
Step 1: Create Account
- Execute creation
- Capture new record ID: {account_id}

Step 2: Create related Opportunity
- Use {account_id} for parent lookup
- Capture new record ID: {opp_id}

Step 3: Create Quote
- Use {opp_id} for parent
- Complete test
```

**Context passing between steps:**
```javascript
const testContext = {
  account_id: null,
  opp_id: null,
  quote_id: null
};

// After creating account
testContext.account_id = extractIdFromUrl(currentUrl);

// Use in next step
navigateTo(`/lightning/r/Account/${testContext.account_id}/view`);
```

### 8. Error Handling in Tests

**When step fails:**
```
1. Capture error screenshot
2. Capture console messages
3. Record failure details
4. Decide: continue or abort test
```

**Recovery options:**
- Skip to next test case
- Retry failed step
- Run cleanup routine
- Mark as blocked

### 9. Test Cleanup

**After test completion:**
```
1. Delete test records created
2. Reset any changed settings
3. Log out if needed
4. Clear test context
```

**Cleanup patterns:**
- Use record IDs captured during test
- Delete in reverse order (child → parent)
- Handle delete failures gracefully

### 10. Generating Test Reports

**Summary report structure:**
```json
{
  "testRun": {
    "date": "2025-12-03T10:00:00Z",
    "environment": "sandbox",
    "totalTests": 10,
    "passed": 8,
    "failed": 1,
    "blocked": 1
  },
  "results": [
    {
      "testCase": "TC001",
      "scenario": "Create Quote",
      "status": "PASS",
      "duration": "45s",
      "screenshots": ["01_account.png", "02_form.png", "03_saved.png"]
    }
  ]
}
```

**Report formats:**
- JSON for CI/CD integration
- CSV for spreadsheet analysis
- Markdown for documentation
- PDF for stakeholders

## Validation

### Test Execution Quality

- [ ] All steps executed in order
- [ ] Screenshots captured for each step
- [ ] Expected results verified
- [ ] Pass/fail accurately recorded
- [ ] Context properly passed between steps

### Evidence Quality

- [ ] Screenshots clear and readable
- [ ] Relevant content visible
- [ ] Naming convention followed
- [ ] Evidence organized properly

## Troubleshooting

### Issue: Step Timeout

**Symptoms:**
- Step doesn't complete
- Timeout error

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Page slow to load | Increase timeout |
| Element not found | Verify element name in snapshot |
| Wrong page | Check navigation succeeded |
| Session expired | Re-authenticate |

### Issue: Element Not Found

**Symptoms:**
- Click/fill fails
- "Element not found" error

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Wrong element name | Take snapshot, use exact name |
| Element not visible | Scroll or wait |
| Dynamic content | Wait for element |
| Different UI version | Update test actions |

### Issue: Test Data Conflicts

**Symptoms:**
- Record already exists error
- Unique constraint violation

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Previous test data | Clean up before test |
| Hardcoded names | Use unique identifiers |
| Shared environment | Namespace test data |

### Issue: Cross-Platform Sync Delay

**Symptoms:**
- Data not synced yet
- Verification fails

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Sync delay | Add wait time |
| Sync error | Check sync status |
| Wrong record | Verify IDs match |

## Platform-Specific Patterns

### Salesforce UAT

```
Common test scenarios:
1. Record creation (Account, Contact, Opportunity)
2. Page layout verification
3. Validation rule testing
4. Flow execution
5. Report verification
6. Permission testing
```

### HubSpot UAT

```
Common test scenarios:
1. Contact/Company creation
2. Workflow enrollment
3. Form submission
4. Email campaign test
5. Integration verification
6. Property validation
```

## Integration with uat-orchestrator

**Using with uat-orchestrator agent:**

```
1. Build test cases: /uat-build
2. Export to CSV: tests/cpq-tests.csv
3. Run with Playwright:
   - uat-orchestrator uses Playwright MCP
   - Executes UI steps automatically
   - Collects screenshots
   - Generates report
```

**Enhanced CSV format for uat-orchestrator:**

```csv
Epic,User Story,Test Scenario,Platform,UI_Actions,Expected_UI_State,Pass/Fail
CPQ,Create Quote,New quote from account,Salesforce,"Navigate Account;Click New Quote;Fill Name;Save","Toast: Quote was created",
```

## Related Resources

- [Page Navigation and Snapshots](./page-navigation-and-snapshots.md)
- [Form Filling and Interaction](./form-filling-and-interaction.md)
- [Screenshot Documentation](./screenshot-documentation.md)
- [Salesforce UI Patterns](./salesforce-ui-patterns.md)
- [HubSpot UI Patterns](./hubspot-ui-patterns.md)
- [UAT Orchestrator Agent](../../agents/uat-orchestrator.md)

---

**Version**: 1.0.0
**Created**: 2025-12-03
**Author**: RevPal Engineering
