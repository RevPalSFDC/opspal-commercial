# Picklist Modification Protocol - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on-demand)
**Priority**: High
**Trigger**: When user message contains: `picklist`, `picklist values`, `add value`, `modify picklist`, `record type`
**Estimated Tokens**: 1,485

---

## Overview

Safe picklist modification protocol that prevents 100% of record type accessibility failures. This protocol ensures both field metadata AND record type metadata are updated together atomically.

**Key Problem Solved**: 100% of historical picklist failures were due to updating field metadata without updating record type metadata, causing "Value not found" errors for users.

---

## 🚨 CRITICAL: Picklist Modification Protocol (Prevents 100% of Record Type Accessibility Failures)

**MANDATORY**: When modifying picklist fields, ALWAYS update BOTH field metadata AND record type metadata together.

### The Two-Phase Metadata Model

Salesforce picklist values require TWO separate metadata operations:
1. **Field Metadata** - Defines picklist values org-wide (what values exist)
2. **Record Type Metadata** - Controls accessibility per record type (what values are selectable)

**CRITICAL**: Modifying only the field metadata will cause "Value not found" errors for users. Both layers MUST be updated together.

---

## Pre-Modification Discovery (MANDATORY)

```bash
# ALWAYS discover record types before picklist modifications
sf data query --query "SELECT Id, DeveloperName, Name FROM RecordType WHERE SobjectType = '[Object]' AND IsActive = true" --target-org [org] --json
```

**Why**: You need to know all record types to update them all. Missing even one record type causes accessibility failures for those users.

---

## Unified Picklist Modification Workflow (REQUIRED)

**Use UnifiedPicklistManager for ALL picklist modifications:**

```javascript
const UnifiedPicklistManager = require('./scripts/lib/unified-picklist-manager');
const manager = new UnifiedPicklistManager({ org: '[org-alias]' });

// This handles BOTH field AND record type metadata atomically
await manager.updatePicklistAcrossRecordTypes({
    objectName: 'Account',
    fieldApiName: 'Major_Territory__c',
    valuesToAdd: ['NE Majors', 'SE Majors'],
    valuesToDeactivate: ['East Major'],
    recordTypes: 'all'  // Auto-discovers and updates ALL record types
});
```

**Benefits:**
- ✅ Auto-discovers all record types (instance-agnostic)
- ✅ Updates field + record types in single atomic deployment
- ✅ Includes built-in post-deployment verification
- ✅ Complete audit trail
- ✅ Zero manual record type configuration

---

## Post-Deployment Verification (MANDATORY)

**ALWAYS verify picklist accessibility after deployment:**

```javascript
const PicklistRecordTypeValidator = require('./scripts/lib/picklist-recordtype-validator');
const validator = new PicklistRecordTypeValidator({ org: '[org-alias]' });

const result = await validator.verifyPicklistAvailability({
    objectName: 'Account',
    fieldApiName: 'Major_Territory__c',
    expectedValues: ['NE Majors', 'SE Majors'],
    recordTypes: 'all',
    targetOrg: '[org-alias]'
});

if (!result.success) {
    console.warn(`Discrepancies found on ${result.discrepancies.length} record types`);

    // Auto-fix discrepancies
    await validator.autoFixRecordTypePicklists({
        discrepancies: result.discrepancies,
        targetOrg: '[org-alias]'
    });
}
```

---

## One-Line Verify-and-Fix Pattern

```javascript
// Verify and auto-fix in single call
const result = await validator.verifyAndFix({
    objectName: 'Account',
    fieldApiName: 'Major_Territory__c',
    expectedValues: ['NE Majors', 'SE Majors'],
    recordTypes: 'all',
    autoFix: true  // Auto-corrects any discrepancies
});
```

**Use Case**: Quick verification + automatic remediation in production after deployment.

---

## Why This Protocol Matters

### Historical Context:
- 100% of picklist modification failures were due to missing record type updates
- Users encountered "Value not found" errors despite successful field deployment
- Manual record type configuration was error-prone and incomplete

### This Protocol Eliminates:
- ❌ Manual record type configuration
- ❌ "Value not found" user errors
- ❌ Incomplete deployments
- ❌ Hidden accessibility issues

### Examples of What Prevented:
- **Major_Territory__c**: Deployed "NE Majors" and "SE Majors" but forgot to update Prospect Record Type → Users couldn't select new values
- **Account_Segmentation__c**: Added "Small" value but didn't enable on all record types → Incomplete rollout

---

## Error Recovery

If you encounter picklist-related errors:

```bash
# Diagnose the issue
node scripts/lib/picklist-recordtype-validator.js verify \
  --object Account \
  --field Major_Territory__c \
  --values "NE Majors,SE Majors" \
  --org acme-corp-main

# Auto-fix any discrepancies
node scripts/lib/picklist-recordtype-validator.js verify-fix \
  --object Account \
  --field Major_Territory__c \
  --values "NE Majors,SE Majors" \
  --org acme-corp-main \
  --auto-fix
```

---

## CLI Quick Reference

```bash
# Complete workflow: Field + Record Types
node -e "
const UnifiedPicklistManager = require('./scripts/lib/unified-picklist-manager');
(async () => {
  const mgr = new UnifiedPicklistManager({ org: 'myorg' });
  await mgr.updatePicklistAcrossRecordTypes({
    objectName: 'Account',
    fieldApiName: 'Status__c',
    valuesToAdd: ['New Value'],
    recordTypes: 'all'
  });
})();
"

# Verify only
node scripts/lib/picklist-recordtype-validator.js verify \
  --object Account --field Status__c \
  --values "New Value" --org myorg

# Fix discrepancies
node scripts/lib/picklist-recordtype-validator.js fix \
  --object Account --field Status__c \
  --values "New Value" --org myorg
```

---

## Integration with Validation Framework

The picklist modification protocol integrates with the existing validation framework:

```bash
# Pre-deployment validation (includes picklist check)
node scripts/lib/metadata-validator.js validate-field-design \
  --object Account --field Major_Territory__c --org myorg

# Post-deployment verification (includes record type check)
node scripts/lib/metadata-integrity-validator.js validate-field-integrity \
  --object Account --field Major_Territory__c --org myorg
```

---

## Common Scenarios

### Scenario 1: Add New Picklist Values

```javascript
const manager = new UnifiedPicklistManager({ org: 'prod' });

await manager.updatePicklistAcrossRecordTypes({
    objectName: 'Opportunity',
    fieldApiName: 'Stage',
    valuesToAdd: ['Negotiation', 'Contract Review'],
    recordTypes: 'all'
});
```

**Result**: Both values added to field metadata AND enabled on ALL record types.

---

### Scenario 2: Deactivate Old Values

```javascript
await manager.updatePicklistAcrossRecordTypes({
    objectName: 'Account',
    fieldApiName: 'Industry',
    valuesToDeactivate: ['Deprecated Industry'],
    recordTypes: 'all'
});
```

**Result**: Value marked inactive in field metadata AND removed from ALL record type configurations.

---

### Scenario 3: Add and Remove Simultaneously

```javascript
await manager.updatePicklistAcrossRecordTypes({
    objectName: 'Case',
    fieldApiName: 'Priority',
    valuesToAdd: ['Critical'],
    valuesToDeactivate: ['Low'],
    recordTypes: 'all'
});
```

**Result**: Atomic operation - both changes applied together.

---

### Scenario 4: Specific Record Types Only

```javascript
await manager.updatePicklistAcrossRecordTypes({
    objectName: 'Lead',
    fieldApiName: 'Status',
    valuesToAdd: ['Partner Referral'],
    recordTypes: ['Enterprise', 'SMB']  // Only these record types
});
```

**Use Case**: New value only applicable to certain business processes.

---

## Troubleshooting

### Issue: "Value not found" Error for Users

**Symptom**: Users report they can't select a picklist value that was recently deployed.

**Diagnosis**:
```bash
node scripts/lib/picklist-recordtype-validator.js verify \
  --object [Object] --field [Field] --values "[Value]" --org [org]
```

**Fix**:
```bash
node scripts/lib/picklist-recordtype-validator.js fix \
  --object [Object] --field [Field] --values "[Value]" --org [org]
```

**Root Cause**: Field metadata updated but record type metadata not updated.

---

### Issue: Some Users Can Select Value, Others Cannot

**Symptom**: Inconsistent access to picklist value across users.

**Diagnosis**: Different users have different record types. Value not enabled on all record types.

**Fix**: Run unified picklist manager with `recordTypes: 'all'` to ensure universal access.

---

### Issue: Deployment Succeeds but Value Not Visible

**Symptom**: Deployment reports success but value doesn't appear in UI.

**Common Causes**:
1. Value added to field but not to record types (use UnifiedPicklistManager)
2. Page layout doesn't include the field (update layout)
3. Profile/permission set doesn't have field access (update FLS)

**Diagnostic Sequence**:
```bash
# 1. Check field metadata
sf schema field list --object [Object] | grep [Field]

# 2. Check record type metadata
node scripts/lib/picklist-recordtype-validator.js verify --object [Object] --field [Field] --org [org]

# 3. Check page layouts
sf data query --query "SELECT Id, Name FROM Layout WHERE TableEnumOrId = '[Object]'" --use-tooling-api

# 4. Check FLS
sf data query --query "SELECT PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE Field = '[Object].[Field]' AND Parent.Name = 'AgentAccess'"
```

---

## Best Practices

1. **Always Use UnifiedPicklistManager**: Handles both field and record type metadata atomically
2. **Always Verify After Deployment**: Run post-deployment validation to catch issues early
3. **Use `recordTypes: 'all'`**: Unless you have a specific reason to limit scope
4. **Test in Sandbox First**: Verify the process works before production deployment
5. **Document Value Purpose**: Add comments explaining why new values were added
6. **Audit Trail**: Keep records of all picklist modifications

---

**When This Context is Loaded**: When user message contains keywords: `picklist`, `picklist values`, `add value`, `modify picklist`, `record type`, `picklist modification`, `update picklist`, `picklist value`, `record type access`

**Back to Core Agent**: See `agents/sfdc-metadata-manager.md` for overview

**Related Contexts**:
- `picklist-dependency-deployment.md` - Controlling/dependent picklist relationships (extends this protocol)
- Order of Operations (kept in base agent) - Deployment sequencing

---

**Context File**: `contexts/metadata-manager/picklist-modification-protocol.md`
**Lines**: 165 (original agent lines 985-1150)
**Priority**: High
**Related Scripts**:
- `scripts/lib/unified-picklist-manager.js`
- `scripts/lib/picklist-recordtype-validator.js`
- `scripts/lib/metadata-validator.js`
