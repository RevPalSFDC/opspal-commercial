# Salesforce Tooling API - Flow Objects Reference

**Last Updated**: 2025-10-24
**API Version**: 62.0
**Purpose**: Prevent "No such column" errors when querying Flow metadata

## Overview

Salesforce provides **4 different Tooling API objects** for querying Flow metadata. Each has different fields and use cases. Choosing the wrong object causes runtime errors.

---

## Quick Reference Table

| Object | Has ApiName? | Has DeveloperName? | Has TriggerObjectOrEvent? | Has TriggerType? | Use Case |
|--------|-------------|-------------------|--------------------------|-----------------|----------|
| **FlowDefinitionView** | ✅ YES | ✅ YES | ✅ YES | ✅ YES | **MOST COMMON** - Flow metadata queries |
| **FlowVersionView** | ❌ NO | ✅ YES | ✅ YES | ✅ YES | Version-specific queries |
| **FlowDefinition** | ✅ YES | ❌ NO | ❌ NO | ❌ NO | Flow definitions (basic info) |
| **Flow** | ❌ NO | Via `Definition.DeveloperName` | ❌ NO | ✅ YES | Legacy flow records |

---

## Common Error Patterns

### ❌ ERROR: "No such column 'ApiName' on entity 'FlowVersionView'"

**Bad Query**:
```sql
SELECT ApiName, TriggerObjectOrEvent
FROM FlowVersionView
WHERE TriggerType = 'PlatformEvent'
```

**Root Cause**: `FlowVersionView` doesn't have an `ApiName` field.

**✅ Fix Option 1** (Use FlowDefinitionView):
```sql
SELECT ApiName, TriggerObjectOrEvent, TriggerType
FROM FlowDefinitionView
WHERE TriggerType = 'PlatformEvent' AND ActiveVersionId != null
```

**✅ Fix Option 2** (Use DeveloperName):
```sql
SELECT DeveloperName, TriggerObjectOrEvent
FROM FlowVersionView
WHERE IsActive = true
```

---

## Detailed Object Specifications

### 1. FlowDefinitionView (RECOMMENDED)

**When to Use**:
- Most common use case for flow queries
- Need both ApiName and trigger information
- Querying active flows by metadata

**Available Fields**:
```
✅ ApiName                          - Flow API name (unique identifier)
✅ DeveloperName                    - Same as ApiName (deprecated but available)
✅ TriggerObjectOrEvent             - Object that triggers the flow
✅ TriggerType                      - Trigger type (e.g., 'PlatformEvent', 'RecordAfterSave')
✅ RecordTriggerType                - Record change trigger (e.g., 'Create', 'Update')
✅ ProcessType                      - Flow type (AutoLaunchedFlow, Workflow, etc.)
✅ DurableId                        - Unique durable ID
✅ ActiveVersionId                  - ID of active version
✅ LatestVersionId                  - ID of latest version
✅ LastModifiedDate                 - Last modification timestamp
✅ TriggerOrder                     - Execution order
✅ IsActive                         - Whether flow is active
```

**Example Queries**:

```sql
-- Query all Platform Event-triggered flows
SELECT ApiName, Label, TriggerObjectOrEvent, TriggerType
FROM FlowDefinitionView
WHERE TriggerType = 'PlatformEvent' AND ActiveVersionId != null

-- Query record-triggered flows for Account
SELECT ApiName, TriggerObjectOrEvent, RecordTriggerType, TriggerOrder
FROM FlowDefinitionView
WHERE TriggerObjectOrEvent = 'Account' AND IsActive = true
ORDER BY TriggerOrder

-- Query autolaunched flows
SELECT ApiName, ProcessType, LastModifiedDate
FROM FlowDefinitionView
WHERE ProcessType = 'AutoLaunchedFlow' AND IsActive = true
```

**sf CLI Command**:
```bash
sf data query \
  --query "SELECT ApiName, TriggerObjectOrEvent FROM FlowDefinitionView WHERE IsActive = true" \
  --target-org my-org \
  --use-tooling-api
```

---

### 2. FlowVersionView

**When to Use**:
- Need version-specific information
- Querying inactive flow versions
- Version comparison analysis

**Available Fields**:
```
❌ ApiName                          - NOT AVAILABLE (use DeveloperName instead)
✅ DeveloperName                    - Flow developer name
✅ TriggerObjectOrEvent             - Object that triggers the flow
✅ TriggerType                      - Trigger type
✅ VersionNumber                    - Version number of this flow version
✅ FlowDefinitionViewId             - Parent flow definition ID
✅ Label                            - Flow label
✅ Description                      - Flow description
✅ ProcessType                      - Flow type
✅ IsActive                         - Whether this version is active
✅ RunInMode                        - System mode vs User mode
```

**Example Queries**:

```sql
-- Query all versions of a specific flow
SELECT DeveloperName, VersionNumber, IsActive, LastModifiedDate
FROM FlowVersionView
WHERE DeveloperName = 'Account_Record_Trigger'
ORDER BY VersionNumber DESC

-- Find inactive flow versions for cleanup
SELECT DeveloperName, VersionNumber, LastModifiedDate
FROM FlowVersionView
WHERE IsActive = false AND LastModifiedDate < LAST_N_DAYS:90
```

**sf CLI Command**:
```bash
sf data query \
  --query "SELECT DeveloperName, VersionNumber FROM FlowVersionView WHERE IsActive = true" \
  --target-org my-org \
  --use-tooling-api
```

---

### 3. FlowDefinition

**When to Use**:
- Simple flow existence checks
- Basic flow information without trigger details

**Available Fields**:
```
✅ ApiName                          - Flow API name
❌ DeveloperName                    - NOT AVAILABLE (use ApiName instead)
❌ TriggerObjectOrEvent             - NOT AVAILABLE
❌ TriggerType                      - NOT AVAILABLE
✅ ActiveVersionId                  - ID of active version
✅ LatestVersionId                  - ID of latest version
```

**Example Queries**:

```sql
-- Check if specific flows exist
SELECT ApiName, ActiveVersionId
FROM FlowDefinition
WHERE ApiName IN ('Account_Record_Trigger', 'Case_Email_Alert')

-- Find flows with no active version
SELECT ApiName, LatestVersionId
FROM FlowDefinition
WHERE ActiveVersionId = null
```

---

### 4. Flow (Legacy)

**When to Use**:
- Legacy code compatibility
- Need specific Flow record IDs
- Runtime flow interview queries

**Available Fields**:
```
❌ ApiName                          - NOT AVAILABLE
✅ Definition.DeveloperName         - Flow developer name (via relationship)
✅ TriggerType                      - Trigger type
✅ Status                           - Flow status ('Active', 'Draft', 'Obsolete')
✅ ProcessType                      - Flow type
✅ MasterLabel                      - Flow label
✅ VersionNumber                    - Version number
```

**Example Queries**:

```sql
-- Query active flows with relationship field
SELECT Id, Definition.DeveloperName, MasterLabel, TriggerType, Status
FROM Flow
WHERE Status = 'Active' AND TriggerType = 'RecordAfterSave'

-- Query flows by label pattern
SELECT Id, MasterLabel, Definition.DeveloperName
FROM Flow
WHERE MasterLabel LIKE '%Account%' AND Status = 'Active'
```

**⚠️ Important**: Always use `Definition.DeveloperName` not `DeveloperName` when querying Flow object.

---

## Decision Matrix

### "Which object should I query?"

**Use FlowDefinitionView when**:
- ✅ You need `ApiName` field
- ✅ You need trigger information (TriggerObjectOrEvent, TriggerType)
- ✅ You're querying active flows
- ✅ You want the most complete metadata view
- **This is the RIGHT choice 90% of the time**

**Use FlowVersionView when**:
- ✅ You need version-specific data
- ✅ You're comparing different versions
- ✅ You need `DeveloperName` (not ApiName)
- ✅ You're analyzing version history

**Use FlowDefinition when**:
- ✅ You only need basic existence/ID checks
- ✅ You don't need trigger information
- ✅ You want minimal query overhead

**Use Flow (legacy) when**:
- ✅ Maintaining legacy code
- ✅ You need Flow record IDs for other operations
- ✅ You're using `Status` field ('Active', 'Draft', 'Obsolete')

---

## Query Patterns by Use Case

### Find all flows triggered by a specific object

```sql
-- ✅ CORRECT
SELECT ApiName, RecordTriggerType, TriggerOrder
FROM FlowDefinitionView
WHERE TriggerObjectOrEvent = 'Account' AND IsActive = true
ORDER BY TriggerOrder

-- ❌ WRONG - Flow doesn't have TriggerObjectOrEvent directly
SELECT Definition.DeveloperName, TriggerType
FROM Flow
WHERE TriggerObjectOrEvent = 'Account'  -- This will fail!
```

### Find Platform Event-triggered flows

```sql
-- ✅ CORRECT
SELECT ApiName, TriggerObjectOrEvent, TriggerType
FROM FlowDefinitionView
WHERE TriggerType = 'PlatformEvent' AND ActiveVersionId != null

-- ❌ WRONG - FlowVersionView requires DeveloperName, not ApiName
SELECT ApiName, TriggerObjectOrEvent
FROM FlowVersionView
WHERE TriggerType = 'PlatformEvent'  -- ApiName doesn't exist!
```

### Get flow version history

```sql
-- ✅ CORRECT
SELECT DeveloperName, VersionNumber, IsActive, LastModifiedDate
FROM FlowVersionView
WHERE DeveloperName = 'My_Flow_API_Name'
ORDER BY VersionNumber DESC

-- ⚠️ LESS EFFICIENT - FlowDefinitionView only shows active version
SELECT ApiName, ActiveVersionId, LatestVersionId
FROM FlowDefinitionView
WHERE ApiName = 'My_Flow_API_Name'
```

### Count active flows by process type

```sql
-- ✅ CORRECT
SELECT ProcessType, COUNT(Id)
FROM FlowDefinitionView
WHERE IsActive = true
GROUP BY ProcessType

-- ✅ ALSO CORRECT (legacy)
SELECT ProcessType, COUNT(Id)
FROM Flow
WHERE Status = 'Active'
GROUP BY ProcessType
```

---

## Field Mapping Cheat Sheet

| Field You Want | Use This Object | Use This Field |
|----------------|----------------|----------------|
| Flow API name | FlowDefinitionView | ApiName |
| Flow API name (version-specific) | FlowVersionView | DeveloperName |
| Flow API name (legacy) | Flow | Definition.DeveloperName |
| Trigger object | FlowDefinitionView | TriggerObjectOrEvent |
| Trigger type | FlowDefinitionView or FlowVersionView | TriggerType |
| Active status | FlowDefinitionView | IsActive |
| Active status (version) | FlowVersionView | IsActive |
| Active status (legacy) | Flow | Status = 'Active' |
| Version number | FlowVersionView | VersionNumber |
| Process type | All objects | ProcessType |

---

## Common Pitfalls

### ❌ Pitfall 1: Using ApiName on FlowVersionView
```sql
-- WRONG
SELECT ApiName FROM FlowVersionView

-- RIGHT
SELECT DeveloperName FROM FlowVersionView
```

### ❌ Pitfall 2: Using bare DeveloperName on Flow
```sql
-- WRONG
SELECT DeveloperName FROM Flow

-- RIGHT
SELECT Definition.DeveloperName FROM Flow
```

### ❌ Pitfall 3: Querying TriggerObjectOrEvent without Tooling API flag
```bash
# WRONG
sf data query --query "SELECT TriggerObjectOrEvent FROM FlowDefinitionView"

# RIGHT
sf data query --query "SELECT TriggerObjectOrEvent FROM FlowDefinitionView" --use-tooling-api
```

### ❌ Pitfall 4: Expecting TriggerType on FlowDefinition
```sql
-- WRONG
SELECT ApiName, TriggerType FROM FlowDefinition

-- RIGHT
SELECT ApiName, TriggerType FROM FlowDefinitionView
```

---

## Code Examples

### JavaScript/Node.js

```javascript
// ✅ GOOD: Query using FlowDefinitionView
const query = `
    SELECT ApiName, TriggerObjectOrEvent, TriggerType, RecordTriggerType
    FROM FlowDefinitionView
    WHERE TriggerObjectOrEvent = 'Account' AND IsActive = true
`;

const cmd = `sf data query --query "${query}" --target-org ${orgAlias} --use-tooling-api --json`;
const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

result.result.records.forEach(flow => {
    console.log(`Flow: ${flow.ApiName}`);
    console.log(`  Triggers on: ${flow.TriggerObjectOrEvent}`);
    console.log(`  Trigger type: ${flow.TriggerType}`);
});
```

### Bash/Shell

```bash
# ✅ GOOD: Platform Event flows query
sf data query \
  --query "SELECT ApiName, TriggerObjectOrEvent FROM FlowDefinitionView WHERE TriggerType = 'PlatformEvent'" \
  --target-org my-org \
  --use-tooling-api \
  --json | jq '.result.records[] | {name: .ApiName, event: .TriggerObjectOrEvent}'
```

---

## Related Documentation

- [Salesforce Tooling API Reference](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/)
- [Flow Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.flow.meta/flow/)
- [SOQL and SOSL Reference](https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-24 | Initial documentation created to prevent FlowVersionView.ApiName errors |

---

## Maintenance

This document should be updated when:
- New Salesforce API versions introduce field changes
- Additional Flow-related Tooling API objects are added
- Common error patterns emerge from production usage

**Maintainer**: RevPal Engineering
**Review Frequency**: Quarterly or when API version upgraded
