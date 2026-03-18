# Playbook: Adding Conditional Branching to HubSpot Workflows

**Trigger:** When you need to add IF/THEN branch logic to existing HubSpot workflows
**Complexity:** Medium-High (API limitations require hybrid approach)
**Estimated Time:** 15-30 minutes
**Last Updated:** 2025-10-12

---

## When to Use This Playbook

Use this playbook when you need to:
- Add conditional branching to an existing workflow
- Create workflows with complex if/then logic
- Implement "IF condition THEN action, OTHERWISE do nothing" patterns
- Migrate branch logic from one workflow to another

**Common Scenarios:**
- "IF Business Unit stage = Suspect THEN set to Engaged"
- "IF lead AND qualified THEN assign to sales, ELSE nurture"
- "IF purchased > $1000 OR VIP THEN send premium onboarding"

---

## Prerequisites

### Required Access
- ✅ HubSpot portal access with workflow edit permissions
- ✅ API key or OAuth token with `automation` scope
- ✅ Node.js environment for validation scripts (optional but recommended)

### Required Knowledge
- Understanding of HubSpot workflow concepts (enrollment, actions, branches)
- Basic familiarity with HubSpot object model (contacts, deals, companies)
- Awareness of API limitations (see [workflow-api-limitations.md](../hubspot/workflow-api-limitations.md))

### Optional Tools
- Playwright for UI automation (for complex LIST_BRANCH)
- Validation scripts from plugin (recommended)

---

## Decision: API vs UI Automation

**Before proceeding, determine which approach to use:**

### Use API (STATIC_BRANCH)
✅ **When branching on a single property with discrete values**

Examples:
- Branch by lifecycle stage (lead, MQL, SQL, opportunity)
- Branch by contact owner
- Branch by single enum/select property

**Pros:** Fast (2-3 seconds), reliable, no browser required
**Cons:** Limited to single-property splits

---

### Use UI Automation (LIST_BRANCH)
✅ **When using complex AND/OR filter logic**

Examples:
- "IF (stage = Suspect AND score > 50) OR (VIP = true)"
- Multiple property conditions with AND/OR combinations
- Complex date/time-based conditions

**Pros:** Supports full filter complexity
**Cons:** Slower (30-60s), requires browser automation, brittle

---

## Step-by-Step Guide

### Phase 1: Analysis & Preparation

#### Step 1.1: Retrieve Current Workflow Structure

**Purpose:** Understand the workflow before modification

**Command:**
```bash
# Via API
curl -X GET "https://api.hubapi.com/automation/v4/flows/{flowId}" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  | jq '.' > workflow-current.json

# Or use MCP tool
# mcp__hubspot-v4__workflow_hydrate with flowId
```

**Verify:**
- Workflow exists and is accessible
- Workflow is a contact workflow (not deal/company)
- Current action structure is clear
- No existing branch conflicts

**Output:** `workflow-current.json` - Complete current workflow structure

---

#### Step 1.2: Check for LIST_BRANCH Requirement

**Purpose:** Determine if API or UI automation is needed

**Decision Logic:**
```javascript
// Pseudo-code
if (branchConditions.length === 1 && branchConditions[0].property) {
  // Single property → Use STATIC_BRANCH (API)
  useAPI = true;
} else if (branchConditions.some(c => c.operator === 'AND' || c.operator === 'OR')) {
  // Complex logic → Use LIST_BRANCH (UI automation)
  useUI = true;
} else {
  // Evaluate case-by-case
  useAPI = tryAPIFirst;
}
```

**Output:** Decision on approach (API or UI)

---

#### Step 1.3: Create Backup

**Purpose:** Enable rollback if modification fails

**Command:**
```bash
# Timestamped backup
cp workflow-current.json "backups/workflow-{flowId}-$(date +%s).json"
```

**Verify:** Backup file exists and is complete

---

### Phase 2A: API-Based Modification (STATIC_BRANCH)

**Use this phase if branching on a single property**

#### Step 2A.1: Construct STATIC_BRANCH Action

**Example:**
```json
{
  "actionTypeId": "STATIC_BRANCH",
  "stepId": "branch-001",
  "splitOnProperty": "lifecyclestage",
  "branches": [
    {
      "propertyValue": "suspect",
      "actions": [
        {
          "actionTypeId": "SET_PROPERTY_VALUE",
          "propertyName": "hs_lead_status",
          "newValue": "engaged"
        }
      ]
    },
    {
      "propertyValue": "engaged",
      "actions": []  // Do nothing
    }
  ]
}
```

**Key Fields:**
- `splitOnProperty`: Property to branch on
- `propertyValue`: Value to match (create one branch per value)
- `actions`: Actions to execute for this branch

---

#### Step 2A.2: Validate Configuration

**Purpose:** Catch errors before API call

**Command:**
```bash
# If validation script exists
node scripts/workflows/validate-workflow-config.js workflow-modified.json

# Manual checks:
# - Does splitOnProperty exist?
# - Are propertyValues valid enum values?
# - Do all referenced properties exist?
```

**Required Validations:**
- ✅ Split property exists and is accessible
- ✅ Property values are valid for the property type
- ✅ All action properties exist
- ✅ No circular dependencies

---

#### Step 2A.3: Apply Modification via API

**Command:**
```bash
curl -X PUT "https://api.hubapi.com/automation/v4/flows/{flowId}" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @workflow-modified.json
```

**Success Indicators:**
- HTTP 200 response
- No error messages
- Response includes updated workflow structure

**If Error:**
- HTTP 400: Check validation (likely invalid structure)
- HTTP 404: Verify workflow ID and type (contact workflow?)
- HTTP 429: Rate limited, retry with backoff

---

#### Step 2A.4: Verify Modification

**Purpose:** Confirm branch logic was applied correctly

**Command:**
```bash
# Re-fetch workflow
curl -X GET "https://api.hubapi.com/automation/v4/flows/{flowId}" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  | jq '.actions[] | select(.actionTypeId == "STATIC_BRANCH")'
```

**Verify:**
- ✅ STATIC_BRANCH action exists
- ✅ Correct property is being split on
- ✅ All expected branches are present
- ✅ Branch actions are correct

**Testing:**
```bash
# Test with a sample contact
# 1. Enroll test contact in workflow
# 2. Set property to trigger branch (e.g., lifecyclestage = suspect)
# 3. Check workflow history to see if correct branch was taken
```

---

### Phase 2B: UI-Based Modification (LIST_BRANCH)

**Use this phase if complex AND/OR filter logic is required**

#### Step 2B.1: Prepare Branch Configuration

**Example Configuration File:**
```json
{
  "branchType": "LIST_BRANCH",
  "branches": [
    {
      "name": "Engage Suspects",
      "filters": [
        [
          {"property": "bu_pipeline_stage", "operator": "EQ", "value": "Suspect"}
        ]
      ],
      "actions": [
        {
          "type": "UPDATE_PROPERTY",
          "property": "bu_pipeline_stage",
          "value": "Engaged"
        }
      ]
    },
    {
      "name": "Otherwise",
      "filters": [],
      "actions": []
    }
  ]
}
```

---

#### Step 2B.2: Attempt API Modification (For Documentation)

**Purpose:** Confirm API limitation before switching to UI

**Command:**
```bash
# This will fail, but document the attempt
curl -X PUT "https://api.hubapi.com/automation/v4/flows/{flowId}" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -d '{"actions": [{"actionTypeId": "LIST_BRANCH", ...}]}'

# Expected error:
# HTTP 400: "Invalid request to flow update"
```

**Document Error:**
```bash
# Save error for reference
echo "API Limitation: LIST_BRANCH not supported" > api-error-log.txt
echo "Switching to UI automation..." >> api-error-log.txt
```

---

#### Step 2B.3: UI Automation with Playwright

**Status:** Planned implementation (Asana task 1211619302494708)

**Current Workaround:** Manual UI modification

**Manual Steps:**
1. Navigate to workflow editor: `https://app.hubspot.com/workflows/{portalId}/flow/{flowId}/edit`
2. Click "+" to add new action
3. Select "If/then branch"
4. Click "Add filter" for each condition
5. Configure filters:
   - Select property (e.g., "Business Unit Pipeline Stage")
   - Select operator (e.g., "is equal to")
   - Enter value (e.g., "Suspect")
6. For AND conditions: Add filter in same branch
7. For OR conditions: Click "Add OR rule"
8. Add actions under "Yes" branch
9. Leave "No" branch empty (or add alternative actions)
10. Click "Save"

**Time Estimate:** 5-10 minutes per branch

**Future Automation:**
```javascript
// Planned Playwright script
const { chromium } = require('playwright');

async function addListBranchViaUI(flowId, branchConfig) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 1. Authenticate
  await authenticateToHubSpot(page);

  // 2. Navigate to editor
  await page.goto(`https://app.hubspot.com/workflows/${portalId}/flow/${flowId}/edit`);

  // 3. Add branch action
  await page.click('[data-test-id="add-action-button"]');
  await page.click('[data-action-type="if-then-branch"]');

  // 4. Configure filters
  for (const filter of branchConfig.filters) {
    await addFilter(page, filter);
  }

  // 5. Add actions
  for (const action of branchConfig.actions) {
    await addAction(page, action);
  }

  // 6. Save
  await page.click('[data-test-id="save-workflow"]');

  await browser.close();
}
```

---

#### Step 2B.4: Verify UI Modification

**Purpose:** Confirm branch logic is correct after manual/automated UI modification

**Verification via API:**
```bash
# Fetch updated workflow
curl -X GET "https://api.hubapi.com/automation/v4/flows/{flowId}" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  | jq '.actions[] | select(.actionTypeId == "LIST_BRANCH")'
```

**Expected Output:**
```json
{
  "actionTypeId": "LIST_BRANCH",
  "stepId": "...",
  "filters": [...],
  "branches": [
    {
      "branchId": "yes-branch",
      "filters": [[...filter conditions...]],
      "actions": [...]
    },
    {
      "branchId": "no-branch",
      "filters": [],
      "actions": []
    }
  ]
}
```

**Verify:**
- ✅ LIST_BRANCH action exists
- ✅ Filter conditions match expected logic
- ✅ Actions are correct under "yes" branch
- ✅ "No" branch behavior is as expected

---

### Phase 3: Post-Modification Validation

#### Step 3.1: Validate Pipeline Stage IDs (Critical!)

**Purpose:** Prevent cross-pipeline contamination

**Real-World Issue:**
- Workflow used ApartmentIQ pipeline stage ID (1167566700) in Maven workflow
- Should have used Maven stage ID (1167582469)
- No error during creation, but workflow didn't work correctly

**Validation Script:**
```bash
# Extract all pipeline stage IDs from workflow
jq '.actions[] | select(.actionTypeId == "DEAL_STAGE_UPDATE") | .stageId' workflow-modified.json

# Cross-reference with correct pipeline
curl -X GET "https://api.hubapi.com/crm/v3/pipelines/deals" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  | jq '.results[] | select(.label == "Maven") | .stages[].id'

# Verify stage IDs match
```

**Correct:**
```
Workflow stage ID: 1167582469
Maven pipeline stage "Engaged": 1167582469
✅ Match!
```

**Incorrect:**
```
Workflow stage ID: 1167566700  ❌ This is from ApartmentIQ pipeline!
Maven pipeline stage "Engaged": 1167582469
❌ Mismatch! Fix required.
```

---

#### Step 3.2: Validate Association Type IDs

**Purpose:** Ensure cross-object updates reference correct association types

**Command:**
```bash
# Check association types in workflow
jq '.actions[] | select(.actionTypeId == "ASSOCIATION_BASED_UPDATE")' workflow-modified.json

# Verify association type exists
curl -X GET "https://api.hubapi.com/crm/v4/associations/{fromObjectType}/{toObjectType}/labels" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"
```

**Common Association Types:**
- Contact → Company: association type ID varies by portal
- Contact → Deal: association type ID varies by portal
- Always verify in target portal

---

#### Step 3.3: Validate Property Names

**Purpose:** Confirm all properties exist on target objects

**Command:**
```bash
# Extract property names
jq '.actions[] | select(.actionTypeId == "SET_PROPERTY_VALUE") | .propertyName' workflow-modified.json

# Verify each property exists
curl -X GET "https://api.hubapi.com/crm/v3/properties/contacts/{propertyName}" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"

# If 404, property doesn't exist → fix required
```

---

#### Step 3.4: Test with Sample Contact

**Purpose:** End-to-end validation that branch logic works

**Test Plan:**
1. Create test contact or use existing test record
2. Set properties to trigger specific branch
3. Enroll in workflow (manual enrollment for testing)
4. Wait for workflow to execute
5. Check workflow execution history
6. Verify correct branch was taken
7. Verify actions executed correctly

**Example Test Case:**
```
Test: "Engage Suspects" branch
Setup:
  - Contact: test-contact@example.com
  - bu_pipeline_stage: "Suspect"

Expected Result:
  - Workflow takes "yes" branch
  - bu_pipeline_stage updated to "Engaged"

Actual Result:
  - [DOCUMENT ACTUAL BEHAVIOR]

Status: ✅ Pass / ❌ Fail
```

---

### Phase 4: Cleanup & Documentation

#### Step 4.1: Clean Up Temp Files

**Purpose:** Remove clutter from workspace

**Command:**
```bash
# Keep only final version and timestamped backup
rm workflow-current.json workflow-modified.json
ls -lh backups/workflow-{flowId}-*.json
```

**Retention Policy:**
- Keep most recent backup (7 days minimum)
- Keep backup from before major changes (30 days)
- Auto-cleanup after 90 days (planned script)

---

#### Step 4.2: Document Modification

**Purpose:** Create audit trail for future reference

**Documentation Template:**
```markdown
# Workflow Modification Log

**Workflow ID:** {flowId}
**Workflow Name:** {workflow name}
**Modified Date:** 2025-10-12
**Modified By:** {your name}

## Change Summary
Added conditional branching: IF bu_pipeline_stage = Suspect THEN set to Engaged

## Approach Used
- [x] API (STATIC_BRANCH)
- [ ] UI Automation (LIST_BRANCH)
- [ ] Manual UI

## Validation Performed
- [x] Pipeline stage IDs verified
- [x] Property names exist
- [x] Test contact enrolled and verified
- [x] Workflow execution history checked

## Issues Encountered
None

## Backup Location
backups/workflow-{flowId}-1728753600.json

## Related Tickets
- Asana: [task URL]
- Reflection: [reflection ID]
```

**Save to:** `docs/workflow-modifications/workflow-{flowId}-{date}.md`

---

#### Step 4.3: Update Workflow README (If New Pattern)

**If this modification introduces a new pattern:**

Add entry to `scripts/workflows/README.md`:

```markdown
### Pattern: Business Unit Stage Conditional Update

**Use Case:** Update pipeline stage only if current stage matches condition

**Implementation:**
- Approach: LIST_BRANCH (UI automation)
- Filter: bu_pipeline_stage = "Suspect"
- Action: Set bu_pipeline_stage = "Engaged"

**Lessons Learned:**
- Must validate pipeline stage IDs
- Cannot use STATIC_BRANCH (need conditional "do nothing")
- Test with real data to verify cross-object updates

**Reference:** workflow-12345678-2025-10-12.md
```

---

## Troubleshooting

### Issue: API Returns 400 "Invalid request to flow update"

**Diagnosis:** You're trying to create LIST_BRANCH via API

**Solution:** Switch to UI automation (Phase 2B)

---

### Issue: Workflow Created But Doesn't Execute Correctly

**Diagnosis:** Validation gap - IDs are wrong but API accepted them

**Solution:**
1. Re-run Step 3.1 (validate pipeline stage IDs)
2. Re-run Step 3.2 (validate association types)
3. Re-run Step 3.3 (validate property names)
4. Fix incorrect IDs
5. Re-test with sample contact

---

### Issue: Branch Always Takes "No" Path

**Diagnosis:** Filter logic is incorrect or property value doesn't match

**Solution:**
1. Check workflow execution history in UI
2. View contact properties at time of enrollment
3. Compare property value to filter criteria
4. Check for:
   - Typos in property values
   - Case sensitivity issues
   - Data type mismatches (string vs enum)
5. Update filter criteria
6. Re-test

---

### Issue: Workflow Modification Partially Applied

**Diagnosis:** No transactional rollback, mid-operation failure

**Solution:**
1. Locate backup: `backups/workflow-{flowId}-{timestamp}.json`
2. Restore from backup:
   ```bash
   curl -X PUT "https://api.hubapi.com/automation/v4/flows/{flowId}" \
     -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
     -d @backups/workflow-{flowId}-{timestamp}.json
   ```
3. Investigate root cause of failure
4. Retry modification with fixes

---

## Real-World Example

**From Reflection:** dc5c05e3-e712-40e0-8ab9-bfeaf4b56934

**Scenario:** Add conditional branching to two HubSpot workflows to update Business Unit pipeline stages

**Requirements:**
- Workflow triggers on Contact
- IF associated Business Unit stage = "Suspect"
- THEN set Business Unit stage to "Engaged"
- OTHERWISE do nothing

**Challenges Encountered:**
1. ❌ Attempted STATIC_BRANCH via API - didn't support conditional "do nothing"
2. ❌ Attempted LIST_BRANCH via API - API returned 400 error
3. ❌ Incorrect pipeline stage ID used initially (cross-pipeline contamination)
4. ✅ Successfully fixed via manual UI modification

**Lessons Learned:**
- LIST_BRANCH requires UI automation (no API support)
- Always validate pipeline stage IDs before deployment
- Cross-object workflow updates need careful association type validation
- API validation gaps can cause silent failures

**Time Spent:**
- API attempts: 2 hours (failed)
- UI manual modification: 10 minutes (successful)
- Validation and testing: 30 minutes

**Total:** 2.5 hours (would be 15 minutes with proper playbook and UI automation)

---

## Related Resources

- [HubSpot Workflows API Limitations](../hubspot/workflow-api-limitations.md)
- [Workflow Script Organization](../../scripts/workflows/README.md)
- [Asana Task: Hybrid API + Browser Automation](https://app.asana.com/0/1211617834659194/1211619302494708)
- [HubSpot Workflows API Documentation](https://developers.hubspot.com/docs/api/automation/workflows)

---

## Feedback & Improvements

This playbook was created based on real-world reflection dc5c05e3-e712-40e0-8ab9-bfeaf4b56934.

**Have suggestions?**
- Submit a reflection via `/reflect`
- Update this playbook directly
- Create an issue in the plugin repository

**Document History:**
- 2025-10-12: Initial version based on reflection analysis
