# External API Capability Matrix

This reference documents automation feasibility for Salesforce Metadata API, HubSpot API, and other external APIs based on 13+ reflection incidents involving API limitations.

## Overview

| Metric | Value |
|--------|-------|
| Reflection Count | 13 |
| Primary Cohort | external-api |
| Priority | P0 |
| Annual ROI | $39,000 |
| Root Cause | No capability matrix documenting API limitations |

## Salesforce Metadata API

### Fully Supported Operations

| Operation | Metadata Type | Notes |
|-----------|--------------|-------|
| Deploy Flows | Flow | All flow types except Screen Flow UI components |
| Deploy Apex | ApexClass, ApexTrigger | Full source control |
| Deploy Objects | CustomObject | Fields, relationships, record types |
| Deploy Permissions | PermissionSet, Profile | Most FLS and object permissions |
| Deploy Validation Rules | ValidationRule | Full formula support |
| Deploy Reports | Report | All standard report types |
| Deploy Dashboards | Dashboard | Full component support |
| Deploy Layouts | Layout, FlexiPage | Standard layout components |

### Partially Supported Operations

| Operation | What Works | What Doesn't | Manual Steps |
|-----------|-----------|--------------|--------------|
| **Screen Flow UI** | Basic fields, choices | Multi-select layout, data tables | Configure in Flow Builder |
| **Quick Actions** | Action definition | inputVariableAssignments | Map variables in Setup |
| **Dynamic Choice** | Choice reference | Filter criteria, display | Configure in Flow Builder |
| **Field Permissions** | Most scenarios | Profile already grants access | REST API fallback |
| **Lightning Pages** | Component references | Custom component config | Lightning App Builder |

### Unsupported Operations

| Operation | Limitation | Workaround |
|-----------|------------|------------|
| Quick Action inputVariableAssignments | Not deployable via Metadata API | Manual UI configuration |
| Screen Flow data table styling | XML doesn't support | Flow Builder |
| Dynamic picklist population | Requires UI setup | Flow Builder |
| Mass Quick Actions on List Views | Tooling API doesn't support | Change Sets |
| Some Translation elements | Upsert restricted | Workbench or Change Sets |

### Known Behaviors

#### Silent Field Permission Ignores

**Issue**: Metadata API silently ignores FieldPermissions if Profile already grants access.

**Detection**:
```javascript
// Before deploying field permissions, check profile access
const profileAccess = await query(`
  SELECT Field, PermissionsRead, PermissionsEdit
  FROM FieldPermissions
  WHERE Parent.ProfileId IN (SELECT Id FROM Profile WHERE Name = 'System Administrator')
  AND SobjectType = 'Account'
  AND Field = 'Account.My_Field__c'
`);

if (profileAccess.length > 0) {
  console.warn('Field already accessible via Profile - Permission Set may be ignored');
}
```

**Workaround**: Use REST API for field permissions or deploy via Profile instead.

#### Flow Version Numbering

**Issue**: Deploying a flow always creates a new version, even if content unchanged.

**Detection**: Compare checksums before deploying.

**Workaround**:
```javascript
// Only deploy if content actually changed
const localChecksum = computeChecksum(localFlowXml);
const orgChecksum = await getOrgFlowChecksum(flowName);
if (localChecksum !== orgChecksum) {
  await deploy(flowName);
}
```

## HubSpot Lists API

### Filter Operator Syntax

**Important**: HubSpot requires verbose operator names.

| Friendly Name | API Operator | Property Type |
|---------------|--------------|---------------|
| equals | IS_EQUAL_TO | All |
| not equals | IS_NOT_EQUAL_TO | All |
| contains | CONTAINS | String |
| greater than | IS_GREATER_THAN | Number |
| greater or equal | IS_GREATER_THAN_OR_EQUAL_TO | Number |
| less than | IS_LESS_THAN | Number |
| less or equal | IS_LESS_THAN_OR_EQUAL_TO | Number |
| is known | IS_KNOWN | All |
| is unknown | IS_NOT_KNOWN | All |
| ever contained | HAS_EVER_CONTAINED | String |

### Correct API Syntax

```json
{
  "filterBranch": {
    "filterBranchType": "AND",
    "filters": [
      {
        "property": "amount",
        "operation": {
          "value": 50,
          "operator": "IS_GREATER_THAN_OR_EQUAL_TO",
          "propertyType": "number"
        },
        "filterType": "PROPERTY"
      }
    ]
  }
}
```

### Common Mistakes

```javascript
// WRONG: Using shorthand operators
{ "operator": ">=" }  // Will fail

// RIGHT: Using verbose operators
{ "operator": "IS_GREATER_THAN_OR_EQUAL_TO" }

// WRONG: Using 'value' for IN operator
{ "operator": "IN", "value": "lead" }  // Will fail

// RIGHT: Using 'values' (plural) for IN operator
{ "operator": "IN", "values": ["lead", "customer"] }

// WRONG: Mixed case for IN values
{ "values": ["Lead", "Customer"] }  // May fail

// RIGHT: Lowercase for IN values
{ "values": ["lead", "customer"] }
```

### HubSpot DSL Abstraction

```javascript
// scripts/lib/hubspot-filter-dsl.js
const OPERATOR_MAP = {
  '=': 'IS_EQUAL_TO',
  '!=': 'IS_NOT_EQUAL_TO',
  '>': 'IS_GREATER_THAN',
  '>=': 'IS_GREATER_THAN_OR_EQUAL_TO',
  '<': 'IS_LESS_THAN',
  '<=': 'IS_LESS_THAN_OR_EQUAL_TO',
  'contains': 'CONTAINS',
  'known': 'IS_KNOWN',
  'unknown': 'IS_NOT_KNOWN'
};

function translateFilter(friendlyFilter) {
  return {
    property: friendlyFilter.field,
    operation: {
      operator: OPERATOR_MAP[friendlyFilter.operator] || friendlyFilter.operator,
      value: friendlyFilter.value,
      propertyType: inferPropertyType(friendlyFilter.value)
    },
    filterType: 'PROPERTY'
  };
}

// Usage
const filter = translateFilter({ field: 'amount', operator: '>=', value: 50 });
// Returns proper API format
```

## Salesforce Merge API vs Delete

### The Problem

From reflection data: "Native Salesforce merger uses 'sf data delete record' instead of Merge API, so MasterRecordId never gets set."

### Correct Approach

```javascript
// WRONG: Using delete (loses MasterRecordId)
await exec(`sf data delete record --sobject Account --record-id ${losingId}`);

// RIGHT: Using Merge API
const mergeRequest = {
  masterRecord: { Id: winningId },
  recordToMerge: { Id: losingId }
};

await connection.sobject('Account').merge(mergeRequest);
// MasterRecordId is set on merged record references
```

### Merge API Example

```javascript
// Using JSforce
const jsforce = require('jsforce');
const conn = new jsforce.Connection({ /* auth */ });

async function mergeAccounts(masterId, duplicateIds) {
  for (const dupId of duplicateIds) {
    await conn.sobject('Account').merge({
      masterRecord: { Id: masterId },
      recordToMerge: { Id: dupId }
    });
  }

  // Verify merge - check MasterRecordId on related records
  const verifyQuery = `
    SELECT Id, AccountId, Account.MasterRecordId
    FROM Contact
    WHERE Account.MasterRecordId = '${masterId}'
  `;
}
```

## System Dependencies

### Ubuntu Package Names

**Issue**: Ubuntu 24.04 renamed packages, breaking documentation.

| Package (Ubuntu 22.04) | Package (Ubuntu 24.04) | Used For |
|------------------------|------------------------|----------|
| libasound2 | libasound2t64 | Puppeteer audio |
| libnss3 | libnss3 | Chrome/Puppeteer |
| libnspr4 | libnspr4 | Chrome/Puppeteer |
| libatk1.0-0 | libatk1.0-0t64 | Chrome accessibility |

### Pre-Flight Dependency Check

```bash
#!/bin/bash
# Check Puppeteer dependencies
check_puppeteer_deps() {
  local missing=()

  # Ubuntu version detection
  if [[ $(lsb_release -rs) == "24."* ]]; then
    PACKAGES="libasound2t64 libnss3 libnspr4 libatk1.0-0t64"
  else
    PACKAGES="libasound2 libnss3 libnspr4 libatk1.0-0"
  fi

  for pkg in $PACKAGES; do
    if ! dpkg -l | grep -q "^ii  $pkg"; then
      missing+=($pkg)
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    echo "Missing packages: ${missing[*]}"
    echo "Install with: sudo apt-get install ${missing[*]}"
    return 1
  fi

  return 0
}
```

## Pre-Flight Feasibility Checker

```javascript
// scripts/lib/api-feasibility-checker.js
const KNOWN_LIMITATIONS = {
  'QuickAction.inputVariableAssignments': {
    supported: false,
    workaround: 'Configure in Setup > Object > Quick Actions after deployment',
    manualTime: '3 minutes'
  },
  'Flow.dynamicChoiceSet': {
    supported: 'partial',
    workaround: 'Deploy reference, configure filter in Flow Builder',
    manualTime: '5 minutes'
  },
  'PermissionSet.fieldPermissions.profileOverride': {
    supported: false,
    workaround: 'Use REST API or deploy via Profile',
    manualTime: '2 minutes'
  }
};

function checkFeasibility(component) {
  const key = `${component.type}.${component.feature}`;
  const limitation = KNOWN_LIMITATIONS[key];

  if (!limitation) {
    return { feasible: true, automated: true };
  }

  return {
    feasible: true,
    automated: limitation.supported === true,
    limitation: limitation,
    manualSteps: limitation.workaround,
    estimatedManualTime: limitation.manualTime
  };
}
```

## Sources

- [Salesforce Metadata API Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm)
- [HubSpot Lists API Documentation](https://developers.hubspot.com/docs/api/crm/lists-filters)
- [Salesforce CLI Known Issues](https://github.com/forcedotcom/cli/issues)
- [Quick Action Implementation Guide](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/actions_impl_guide.pdf)
