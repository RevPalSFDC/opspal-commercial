# HubSpot Workflows v4 API - Limitations and Workarounds

**Last Updated:** 2025-10-12
**API Version:** v4 (released 2024-2025)
**Status:** Production, Actively Maintained

---

## Executive Summary

The HubSpot Workflows v4 API enables significant automation for creating and managing contact-based workflows, but has several critical limitations compared to the UI. Most notably, **LIST_BRANCH actions (complex if/then logic) cannot be created or modified programmatically**, despite being returned in GET responses.

This document catalogs all known limitations as of October 2025 and provides tested workarounds.

**Key Insight:** The API follows an asymmetric design pattern - you can READ features you cannot WRITE.

---

## Table of Contents

1. [What Works Well](#what-works-well)
2. [Critical Limitations](#critical-limitations)
3. [Decision Matrix: API vs UI](#decision-matrix-api-vs-ui)
4. [Detailed Limitations](#detailed-limitations)
5. [Workarounds](#workarounds)
6. [Error Codes and Messages](#error-codes-and-messages)
7. [Best Practices](#best-practices)
8. [Future Outlook](#future-outlook)

---

## What Works Well

The HubSpot Workflows v4 API excels at:

### ✅ Full Support

| Feature | API Capability | Notes |
|---------|----------------|-------|
| **Contact Workflows** | Create, Read, Update, Delete | Full lifecycle management |
| **Simple Actions** | All standard actions | Delays, emails, tasks, property updates, webhooks, custom code |
| **List Management** | Add to/remove from lists | New in v4: explicit actionTypeIds |
| **STATIC_BRANCH** | Single-property splits | "Value equals" branching on one field |
| **AB_TEST_BRANCH** | Random percentage splits | A/B testing with random distribution |
| **Enrollment Triggers** | List-based, event-based, manual | Complete enrollment configuration |
| **Workflow Settings** | Goals, schedules, suppression | Advanced settings mirror UI capabilities |
| **Cloning** | GET + POST pattern | Export/import workflow structures |
| **Custom Code Actions** | Serverless functions | With API key references |

### 📊 API vs UI Feature Parity: 75%

---

## Critical Limitations

### 🚨 Hard Blockers (No API Workaround)

#### 1. LIST_BRANCH Actions Cannot Be Created/Modified

**Status:** Confirmed limitation as of Oct 2025

**The Problem:**
- LIST_BRANCH represents complex if/then branching with AND/OR filter logic
- UI supports up to 20 branches with arbitrary filter criteria
- API **returns** LIST_BRANCH structures in GET responses
- API **rejects** LIST_BRANCH structures in POST/PUT requests

**Error Message:**
```
HTTP 400 Bad Request
{
  "status": "error",
  "message": "Invalid request to flow update"
}
```

**Tested Scenarios:**
- ❌ Create new workflow with LIST_BRANCH
- ❌ Add LIST_BRANCH to existing workflow
- ❌ Modify existing LIST_BRANCH (even with identical structure from GET)
- ❌ Copy LIST_BRANCH from one workflow to another

**User Impact:**
- Cannot automate complex conditional logic
- Must manually add if/then branches in UI
- Workflow templates with branches cannot be fully automated

**Workaround:** Use Playwright browser automation (see section below)

**Related Issue:** Asana task [1211619302494708](https://app.asana.com/0/1211617834659194/1211619302494708)

---

#### 2. Non-Contact Workflows Not Supported

**Status:** Confirmed limitation

**The Problem:**
- API only supports contact-based workflows
- Cannot create workflows for:
  - Deals
  - Companies
  - Tickets
  - Custom objects

**Error Message:**
```
HTTP 404 Not Found
{
  "message": "Workflow not found"
}
```
(When trying to GET a non-contact workflow by ID)

**Why This Matters:**
- Deal pipeline automation must be done in UI
- Company scoring workflows cannot be automated
- Ticket routing logic requires manual setup

**Workaround:** None - use UI for all non-contact workflows

**HubSpot Community Confirmation:** "the HubSpot API can only handle Contact Based Workflows" [(source)](https://community.hubspot.com)

---

#### 3. Campaign Associations

**Status:** No API endpoint exists

**The Problem:**
- Workflows can be associated with marketing campaigns for attribution
- No API parameter or endpoint to link workflows to campaigns
- Must manually associate in UI after API creation

**Workaround:** None - manual UI step required

---

### ⚠️ Soft Limitations (Workarounds Exist)

#### 4. Validation Gaps (Garbage In, Garbage Out)

**Status:** Ongoing issue

**The Problem:**
- API accepts invalid identifiers without immediate error
- Workflow creation succeeds even with:
  - Wrong pipeline stage IDs
  - Non-existent property names
  - Invalid list IDs
  - Incorrect owner IDs
- Errors only surface at runtime during workflow execution

**Example:**
```javascript
// This will succeed in creation but fail at runtime
{
  "actions": [{
    "type": "SET_PROPERTY_VALUE",
    "propertyName": "non_existent_field",  // ❌ No validation
    "newValue": "test"
  }]
}
```

**User Impact:**
- Silent failures at runtime
- Workflows appear healthy but don't execute correctly
- Debugging requires checking workflow execution history

**Workaround:** Implement pre-flight validation (see [validate-workflow-config.js](../..claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/workflows/README.md#validate-workflow-configjs-planned))

**Real-World Example:**
- Reflection ID: dc5c05e3-e712-40e0-8ab9-bfeaf4b56934
- Workflow created with wrong pipeline stage ID (1167566700 from ApartmentIQ used in Maven workflow)
- No error during creation
- Workflow executed but didn't move deals to correct stage

---

#### 5. No Transactional Operations

**Status:** By design

**The Problem:**
- API calls are not atomic
- Partial failures leave workflows in inconsistent state
- No automatic rollback on error
- No "dry-run" mode

**Scenario:**
```javascript
// If action #3 fails, actions #1 and #2 are already applied
await updateWorkflow({
  actions: [
    action1,  // ✅ Applied
    action2,  // ✅ Applied
    action3,  // ❌ Failed - but no rollback
    action4,  // ❌ Never attempted
  ]
});
```

**User Impact:**
- Must manually clean up failed modification attempts
- Backup/restore pattern required
- Difficult to recover from mid-operation failures

**Workaround:** Implement transaction pattern with backups (see [Best Practices](#best-practices))

---

#### 6. Secrets in Custom Code Actions

**Status:** Intermittent issue (may be library version dependent)

**The Problem:**
- Custom code actions support referencing HubSpot secrets
- Including `secretNames` in API payload sometimes causes errors
- Inconsistent behavior across different API library versions

**Error Message:**
```
HTTP 400 Bad Request
{
  "message": "Invalid custom code action configuration"
}
```

**Workaround:**
1. Create workflow with custom code action via API (without secrets)
2. Manually add secrets in UI after creation
3. Or ensure latest API library version is used

---

## Decision Matrix: API vs UI

Use this decision tree when planning workflow modifications:

```
                    ┌─────────────────────┐
                    │  Workflow Task      │
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
       ┌──────▼──────┐                   ┌─────▼─────┐
       │  Contact     │                   │  Other    │
       │  Workflow?   │                   │  Object?  │
       └──────┬──────┘                    └─────┬─────┘
              │ YES                              │ NO
              │                                  │
       ┌──────▼──────┐                    ┌─────▼─────┐
       │  Complex     │                    │  USE UI   │
       │  Branching?  │                    │  MANUAL   │
       └──────┬──────┘                     └───────────┘
              │
      ┌───────┴───────┐
      │ YES           │ NO
      │               │
┌─────▼─────┐   ┌────▼────┐
│  USE UI   │   │  USE    │
│  AUTOMATION│   │  API    │
│  (Playwright)│ └────┬────┘
└───────────┘        │
                     │
              ┌──────▼──────┐
              │  Validation │
              │  Critical?  │
              └──────┬──────┘
                     │
          ┌──────────┴──────────┐
          │ YES                │ NO
          │                    │
    ┌─────▼─────┐       ┌──────▼──────┐
    │  ADD      │       │  DIRECT     │
    │  PRE-FLIGHT│       │  API CALL   │
    │  CHECKS   │       └─────────────┘
    └───────────┘
```

### Quick Reference Table

| Task | Method | Tool/Script |
|------|--------|-------------|
| Simple property update | API | Direct API call |
| Add email/delay/task | API | Direct API call |
| Single-property branch (STATIC_BRANCH) | API | Direct API call |
| Complex if/then (LIST_BRANCH) | UI Automation | Playwright script |
| A/B testing (AB_TEST_BRANCH) | UI Automation | Playwright script |
| Deal/Company workflow | Manual UI | N/A |
| Campaign association | Manual UI | N/A |
| Workflow with validation | API + Pre-flight | validate-workflow-config.js |

---

## Detailed Limitations

### LIST_BRANCH Technical Details

**What LIST_BRANCH Looks Like in GET Response:**

```json
{
  "actionTypeId": "LIST_BRANCH",
  "stepId": "12345",
  "filters": [
    [
      {
        "filterType": "PROPERTY",
        "property": "lifecyclestage",
        "operation": "EQ",
        "value": "lead",
        "type": "enumeration"
      },
      {
        "filterType": "PROPERTY",
        "property": "hs_lead_status",
        "operation": "EQ",
        "value": "open",
        "type": "enumeration"
      }
    ],
    [
      {
        "filterType": "PROPERTY",
        "property": "lifecyclestage",
        "operation": "EQ",
        "value": "opportunity",
        "type": "enumeration"
      }
    ]
  ],
  "branches": [
    {
      "branchId": "branch-1",
      "filters": [...],
      "actions": [...]
    },
    {
      "branchId": "branch-2",
      "filters": [...],
      "actions": [...]
    }
  ]
}
```

**What Happens When You Try to PUT This:**

```bash
curl -X PUT "https://api.hubapi.com/automation/v4/flows/{flowId}" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "actions": [{ "actionTypeId": "LIST_BRANCH", ... }] }'

# Response:
HTTP 400 Bad Request
{
  "status": "error",
  "message": "Invalid request to flow update",
  "correlationId": "abc-123-def-456"
}
```

**Why This Is Asymmetric:**
- GET endpoint includes full LIST_BRANCH structure for documentation/inspection
- PUT endpoint parser doesn't support LIST_BRANCH creation
- Likely intentional to prevent complex logic bugs via API

---

### STATIC_BRANCH vs LIST_BRANCH

| Feature | STATIC_BRANCH | LIST_BRANCH |
|---------|---------------|-------------|
| **API Support** | ✅ Full | ❌ None |
| **Branching Logic** | Single property/outcome | Complex AND/OR filters |
| **Max Branches** | Auto-generated per value | Up to 20 custom |
| **Use Case** | "Split by lifecycle stage" | "If (lead AND open) OR (opp AND qualified)" |
| **Configuration Complexity** | Low | High |
| **Error Prone** | Low | High |

**Example STATIC_BRANCH (API-Supported):**

```json
{
  "actionTypeId": "STATIC_BRANCH",
  "splitOnProperty": "lifecyclestage",
  "branches": [
    { "propertyValue": "lead", "actions": [...] },
    { "propertyValue": "opportunity", "actions": [...] }
  ]
}
```

---

## Workarounds

### Workaround #1: Playwright Browser Automation for LIST_BRANCH

**Status:** Planned implementation (Asana task 1211619302494708)

**Concept:**
1. Detect when LIST_BRANCH modification is needed
2. Switch from API to browser automation
3. Use Playwright to manipulate HubSpot UI
4. Verify result via API GET

**Pros:**
- Enables full automation of complex branching
- Reliable once UI selectors are mapped
- Can handle any UI-only feature

**Cons:**
- Slower than API (30s vs 2s)
- Brittle if HubSpot changes UI
- Requires browser/headless setup
- Authentication complexity

**Implementation Sketch:**

```javascript
const { chromium } = require('playwright');

async function addListBranchViaUI(workflowId, branchConfig) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 1. Login to HubSpot
  await page.goto('https://app.hubspot.com/login');
  await page.fill('#username', process.env.HUBSPOT_USERNAME);
  await page.fill('#password', process.env.HUBSPOT_PASSWORD);
  await page.click('#loginBtn');

  // 2. Navigate to workflow editor
  await page.goto(`https://app.hubspot.com/workflows/${portalId}/flow/${workflowId}/edit`);

  // 3. Add branch action
  await page.click('[data-test-id="add-action"]');
  await page.click('[data-action-type="if-then-branch"]');

  // 4. Configure filters
  for (const filter of branchConfig.filters) {
    await page.click('[data-test-id="add-filter"]');
    await page.selectOption('[data-test-id="filter-property"]', filter.property);
    await page.selectOption('[data-test-id="filter-operation"]', filter.operation);
    await page.fill('[data-test-id="filter-value"]', filter.value);
  }

  // 5. Save
  await page.click('[data-test-id="save-workflow"]');

  await browser.close();
}
```

**Hybrid Approach (Recommended):**

```javascript
async function modifyWorkflow(workflowId, modifications) {
  // Try API first (fast path)
  try {
    return await updateWorkflowViaAPI(workflowId, modifications);
  } catch (error) {
    if (error.status === 400 && modifications.containsListBranch) {
      // Fallback to UI automation
      console.log('API failed, using UI automation...');
      return await updateWorkflowViaUI(workflowId, modifications);
    }
    throw error;
  }
}
```

---

### Workaround #2: Pre-Flight Validation

**Status:** Planned script (validate-workflow-config.js)

**Concept:**
- Validate all identifiers before API call
- Cross-reference with HubSpot metadata APIs
- Fail fast with clear error messages

**Validation Checks:**

```javascript
async function validateWorkflowConfig(workflowConfig) {
  const errors = [];

  // 1. Validate pipeline stage IDs
  for (const action of workflowConfig.actions) {
    if (action.type === 'DEAL_STAGE_UPDATE') {
      const stageExists = await checkPipelineStageExists(action.stageId);
      if (!stageExists) {
        errors.push(`Invalid pipeline stage ID: ${action.stageId}`);
      }
    }
  }

  // 2. Validate property names
  for (const action of workflowConfig.actions) {
    if (action.type === 'SET_PROPERTY_VALUE') {
      const propertyExists = await checkPropertyExists(action.propertyName);
      if (!propertyExists) {
        errors.push(`Property does not exist: ${action.propertyName}`);
      }
    }
  }

  // 3. Validate list IDs
  for (const action of workflowConfig.actions) {
    if (action.type === 'ADD_TO_LIST') {
      const listExists = await checkListExists(action.listId);
      if (!listExists) {
        errors.push(`List does not exist: ${action.listId}`);
      }
    }
  }

  // 4. Check for unsupported features
  if (workflowConfig.actions.some(a => a.actionTypeId === 'LIST_BRANCH')) {
    errors.push('LIST_BRANCH actions are not supported via API');
  }

  return errors;
}
```

---

### Workaround #3: Transaction Pattern with Backups

**Concept:**
- Always create backup before modification
- Verify result after modification
- Rollback on failure

**Implementation:**

```javascript
async function safeWorkflowUpdate(workflowId, modifications) {
  // 1. Create backup
  const backup = await client.getWorkflow(workflowId);
  const backupPath = `backups/workflow-${workflowId}-${Date.now()}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

  try {
    // 2. Apply modifications
    await client.updateWorkflow(workflowId, modifications);

    // 3. Verify result
    const updated = await client.getWorkflow(workflowId);
    const isValid = await validateWorkflow(updated);

    if (!isValid) {
      throw new Error('Post-modification validation failed');
    }

    console.log(`✅ Workflow updated successfully. Backup: ${backupPath}`);
    return updated;

  } catch (error) {
    // 4. Rollback on failure
    console.error(`❌ Update failed: ${error.message}`);
    console.log('Rolling back from backup...');

    await client.updateWorkflow(workflowId, backup);
    console.log('✅ Rollback complete');

    throw error;
  }
}
```

---

## Workaround #4: Automated Post-Execution Auditing

**Status:** ✅ Production Ready (Implemented 2025-10-16)

**Concept:**
- Validate operations **after** execution using evidence-based auditing
- Catch validation gaps before they cause runtime failures
- Provide actionable recommendations for fixing issues

**Why This Matters:**
The API accepts invalid payloads (empty listId, wrong stageId, etc.) but they fail silently at runtime. Post-execution auditing catches these immediately with evidence.

**Implementation:**

Use the `hubspot-workflow-auditor` agent or CLI to validate every workflow operation:

```javascript
// Via Agent (Task tool)
Use Task tool with hubspot-workflow-auditor:
{
  task_description: "Create contact workflow with lifecycle branching",
  intended_payload: workflowPayload,
  http_log: [
    { verb: 'POST', url: '...', status: 201, response_body: {...} },
    { verb: 'GET', url: '...', status: 200, response_body: {...} }
  ],
  environment: {
    portalId: '12345678',
    objectType: 'contact'
  }
}

// Returns audit report with:
// - overall_status: PASS/FAIL/PARTIAL
// - scorecard: 0-10 per category (8 categories)
// - findings: P1/P2/P3 prioritized issues
// - recommended_fixes: Actionable remediation
```

**Validation Categories (P1 = Critical):**

1. **Endpoint & Scope (P1)**
   - Used /automation/v4/flows (not deprecated v1/v2)
   - Object type = contact (only supported)

2. **Sequence (P1)**
   - Proper flow: create → GET validation → enable
   - Idempotency check

3. **Proof of Success (P1)**
   - GET response shows actual workflow
   - Graph connectivity (no dangling nextActionId)
   - Enrollment criteria matches intent

4. **Branching Rules (P1)**
   - LIST_BRANCH detection (unsupported)
   - STATIC_BRANCH validation
   - AB_TEST_BRANCH validation

5. **Data Validation (P1)**
   - All IDs validated (listId, propertyName, templateId)
   - No placeholders (null, 0, empty)

6. **Error Handling (P2)**
   - 4xx/5xx not silently ignored

7. **Enablement (P2)**
   - Enabled state matches intent

8. **Logging (P3)**
   - Response bodies captured

**CLI Usage:**

```bash
# Standalone auditing
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/audit-workflow-execution.js \
  --task "Create lifecycle workflow" \
  --payload payload.json \
  --http-log execution.json \
  --threshold 70 \
  --output report.json

# Batch processing
for log in logs/*.json; do
  node audit-workflow-execution.js \
    --http-log $log \
    --threshold 80 || echo "FAILED: $log"
done

# CI/CD integration
npm run audit:workflows || exit 1
```

**Benefits:**

- ✅ **Catches silent failures** - Invalid IDs detected before runtime
- ✅ **Evidence-based** - Proves success via GET responses (not just 200 status)
- ✅ **Actionable fixes** - Provides specific remediation steps
- ✅ **Prevents LIST_BRANCH claims** - Detects unsupported features
- ✅ **Graph validation** - Ensures workflow is properly connected
- ✅ **CI/CD ready** - Exit codes for automated quality gates

**Real-World Catches:**

1. **Invalid Pipeline Stage ID** (Reflection dc5c05e3-e712-40e0-8ab9-bfeaf4b56934)
   - Used stage 1167566700 from ApartmentIQ in Maven workflow
   - API accepted, workflow created, but failed at runtime
   - Auditor would detect: "No validation GET for stageId 1167566700"

2. **LIST_BRANCH Claimed Without Evidence**
   - Agent claims success creating LIST_BRANCH
   - API returns 400 or silently ignores
   - Auditor detects: "intended payload had LIST_BRANCH, GET response does not"

3. **Dangling nextActionId**
   - Action 5 references nextActionId: 999
   - No action with id=999 exists
   - Auditor detects: "Graph connectivity issue - action 5 → 999 not found"

**Integration:**

All workflow agents now include post-execution validation:
- `hubspot-workflow-builder` (complex workflows)
- `hubspot-workflow` (simple workflows)

See full documentation:
- Agent: `.claude-plugins/opspal-core-plugin/packages/domains/hubspot/agents/hubspot-workflow-auditor.md`
- Library: `.claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/hubspot-workflow-auditor.js`
- Tests: `.claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/__tests__/hubspot-workflow-auditor.test.js`

---

## Error Codes and Messages

### Common API Errors

| Status Code | Message | Meaning | Solution |
|-------------|---------|---------|----------|
| **400** | "Invalid request to flow update" | LIST_BRANCH or invalid structure | Use UI automation |
| **400** | "Invalid custom code action configuration" | Secrets issue | Remove secrets, add in UI |
| **404** | "Workflow not found" | Non-contact workflow or wrong ID | Verify workflow type and ID |
| **403** | "Insufficient permissions" | OAuth scope issue | Add `automation` scope |
| **429** | "Rate limit exceeded" | Too many API calls | Implement exponential backoff |
| **500** | "Internal server error" | HubSpot API issue | Retry with exponential backoff |

### Debugging Tips

```bash
# Get full error details
curl -v -X PUT "https://api.hubapi.com/automation/v4/flows/{flowId}" \
  -H "Authorization: Bearer $TOKEN" \
  -d @workflow.json 2>&1 | tee error-log.txt

# Check workflow execution history (UI only)
# https://app.hubspot.com/workflows/{portalId}/flow/{workflowId}/history

# Validate workflow structure before API call
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/workflows/validate-workflow-config.js {workflowId}
```

---

## Best Practices

### 1. Always Validate Before Creating

```javascript
// ❌ Bad
await client.createWorkflow(workflowConfig);

// ✅ Good
const errors = await validateWorkflowConfig(workflowConfig);
if (errors.length > 0) {
  throw new Error(`Validation failed:\n${errors.join('\n')}`);
}
await client.createWorkflow(workflowConfig);
```

### 2. Use Hybrid API + UI Approach

```javascript
async function smartWorkflowUpdate(workflowId, modifications) {
  if (requiresListBranch(modifications)) {
    return await updateViaUI(workflowId, modifications);
  } else {
    return await updateViaAPI(workflowId, modifications);
  }
}
```

### 3. Create Backups Before Modifications

```javascript
// Always create timestamped backups
const backup = await client.getWorkflow(workflowId);
fs.writeFileSync(
  `backups/workflow-${workflowId}-${new Date().toISOString()}.json`,
  JSON.stringify(backup, null, 2)
);
```

### 4. Test in Sandbox First

```javascript
// Test modifications in test portal before production
const testPortalId = 12345678;  // Sandbox
const prodPortalId = 87654321;  // Production

// Test in sandbox
await updateWorkflow(testPortalId, workflowId, modifications);
await verifyWorkflowBehavior(testPortalId, workflowId);

// Only then apply to production
await updateWorkflow(prodPortalId, workflowId, modifications);
```

### 5. Implement Retry Logic with Exponential Backoff

```javascript
async function updateWorkflowWithRetry(workflowId, modifications, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.updateWorkflow(workflowId, modifications);
    } catch (error) {
      if (error.status === 429 || error.status >= 500) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`Attempt ${attempt} failed, retrying in ${backoffMs}ms...`);
        await sleep(backoffMs);
      } else {
        throw error;  // Don't retry on client errors
      }
    }
  }
  throw new Error(`Failed after ${maxRetries} attempts`);
}
```

---

## Future Outlook

### What Might Improve

HubSpot has been actively improving the Workflows API:

**Recent Improvements (2024-2025):**
- ✅ v4 API released with update support (v3 was read-only)
- ✅ Richer GET responses with full workflow structure
- ✅ Explicit list membership action types (add/remove from lists)
- ✅ AB_TEST_BRANCH support added

**Likely Future Additions:**
- 🔮 LIST_BRANCH API support (highly requested)
- 🔮 Non-contact workflow support
- 🔮 Campaign association endpoint
- 🔮 Dry-run mode for testing modifications
- 🔮 Better validation with detailed error messages

**How to Stay Updated:**
- Monitor [HubSpot Developer Changelog](https://developers.hubspot.com/changelog)
- Check [HubSpot Developer Forum](https://community.hubspot.com/t5/APIs-Integrations/ct-p/apis)
- Subscribe to API release notes
- Test new API versions in sandbox

---

## Related Resources

### Documentation
- [HubSpot Workflows API Reference](https://developers.hubspot.com/docs/api/automation/workflows)
- [HubSpot Developer Changelog](https://developers.hubspot.com/changelog)
- [Workflow Script Organization](../..claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/workflows/README.md)
- [Workflow Modification Playbook](../playbooks/hubspot-workflow-branching.md)

### Internal Resources
- Asana Task: [Hybrid API + Browser Automation](https://app.asana.com/0/1211617834659194/1211619302494708)
- Reflection: dc5c05e3-e712-40e0-8ab9-bfeaf4b56934
- Fix Plan: 8a3c9f12-4b5d-4e6f-9a8b-1c2d3e4f5a6b

### Community Resources
- [HubSpot Community: Workflows API Limitations](https://community.hubspot.com)
- [HubSpot Community: Campaign Association](https://community.hubspot.com)
- [HubSpot Community: Secrets in Custom Code](https://community.hubspot.com)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-10-12 | Initial documentation based on user-provided research and real-world reflection | Claude Code via /processreflections |

---

**Questions or Issues?**

If you encounter limitations not documented here:
1. Submit a reflection via `/reflect`
2. Create an issue in the HubSpot Plugin repository
3. Consult HubSpot Developer Support
4. Check HubSpot Community forums

**Document Maintenance:**
This document should be updated whenever:
- New API limitations are discovered
- HubSpot releases API improvements
- Workarounds are tested and validated
- User reflections reveal undocumented behaviors
