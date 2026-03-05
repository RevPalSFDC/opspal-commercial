# HubSpot Workflows API Limitations

## Hard Blockers (No API Workaround)

### 1. LIST_BRANCH Actions Cannot Be Created/Modified

**Status:** Confirmed limitation as of October 2025

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

**Tested Scenarios (All Fail):**
- ❌ Create new workflow with LIST_BRANCH
- ❌ Add LIST_BRANCH to existing workflow
- ❌ Modify existing LIST_BRANCH (even with identical structure from GET)
- ❌ Copy LIST_BRANCH from one workflow to another

**Why This Is Asymmetric:**
- GET endpoint includes full LIST_BRANCH structure for documentation/inspection
- PUT endpoint parser doesn't support LIST_BRANCH creation
- Likely intentional to prevent complex logic bugs via API

### 2. Non-Contact Workflows Not Supported

**Status:** Confirmed limitation

**The Problem:**
- API only supports contact-based workflows
- Cannot create workflows for: Deals, Companies, Tickets, Custom objects

**Error Message:**
```
HTTP 404 Not Found
{
  "message": "Workflow not found"
}
```

### 3. Campaign Associations

**Status:** No API endpoint exists

- Workflows can be associated with marketing campaigns for attribution
- No API parameter or endpoint to link workflows to campaigns
- Must manually associate in UI after API creation

## Soft Limitations (Workarounds Exist)

### 4. Validation Gaps (Garbage In, Garbage Out)

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

**Workaround:** Implement pre-flight validation (see workarounds.md)

### 5. No Transactional Operations

- API calls are not atomic
- Partial failures leave workflows in inconsistent state
- No automatic rollback on error
- No "dry-run" mode

**Workaround:** Create backups before modification, implement rollback pattern

### 6. Secrets in Custom Code Actions

- Custom code actions support referencing HubSpot secrets
- Including `secretNames` in API payload sometimes causes errors
- Inconsistent behavior across different API library versions

**Workaround:** Create workflow without secrets via API, add secrets in UI

## API Error Codes

| Status Code | Message | Meaning | Solution |
|-------------|---------|---------|----------|
| **400** | "Invalid request to flow update" | LIST_BRANCH or invalid structure | Use UI automation |
| **400** | "Invalid custom code action configuration" | Secrets issue | Remove secrets, add in UI |
| **404** | "Workflow not found" | Non-contact workflow or wrong ID | Verify workflow type and ID |
| **403** | "Insufficient permissions" | OAuth scope issue | Add `automation` scope |
| **429** | "Rate limit exceeded" | Too many API calls | Implement exponential backoff |
| **500** | "Internal server error" | HubSpot API issue | Retry with exponential backoff |

## Real-World Impact

### Cross-Pipeline Contamination

**From Reflection:** dc5c05e3-e712-40e0-8ab9-bfeaf4b56934

- Workflow used ApartmentIQ pipeline stage ID (1167566700) in Maven workflow
- Should have used Maven stage ID (1167582469)
- No error during creation - workflow created successfully
- Workflow executed but didn't move deals to correct stage

**Lesson:** Always validate pipeline stage IDs before deployment

### LIST_BRANCH Claims Without Evidence

- Agent claims success creating LIST_BRANCH
- API returns 400 or silently ignores
- Post-execution auditor detects: "intended payload had LIST_BRANCH, GET response does not"

**Lesson:** Verify workflow structure via GET after creation
