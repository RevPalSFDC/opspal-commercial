# Custom Object Merge Guide

**Version**: 2.0.0
**Date**: 2025-10-29
**Status**: ✅ Complete - Framework Ready for Custom Objects

## Overview

The Generic Record Merge Framework (v2.0.0) supports custom Salesforce objects through a **profile-based configuration system**. This guide shows you how to extend the framework to merge custom objects in minutes, not days.

**Prerequisites**:
- Generic Record Merge Framework v2.0.0 installed
- Basic understanding of Salesforce object relationships
- Access to `scripts/merge-profiles/` directory

**Time to Extend**: 10-15 minutes per custom object

---

## Table of Contents

1. [Quick Start - 5 Steps](#quick-start---5-steps)
2. [Merge Profile Structure](#merge-profile-structure)
3. [Profile Template Reference](#profile-template-reference)
4. [Custom Validator (Optional)](#custom-validator-optional)
5. [Testing Your Configuration](#testing-your-configuration)
6. [Real-World Examples](#real-world-examples)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start - 5 Steps

### Step 1: Copy the Template

```bash
cd .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/merge-profiles
cp _template-merge-profile.json property-merge-profile.json
```

**Naming Convention**: `{objectname}-merge-profile.json` (lowercase)
- Property__c → `property-merge-profile.json`
- Subscription__c → `subscription-merge-profile.json`
- AssetTracking__c → `assettracking-merge-profile.json`

### Step 2: Update Object Name

Edit `property-merge-profile.json`:

```json
{
  "object": "Property__c",
  "maxMergeCandidates": 2,
  "description": "Merge profile for Property custom object"
}
```

### Step 3: Define Related Objects

Add all child objects that reference your custom object:

```json
{
  "relatedObjects": [
    {
      "object": "Listing__c",
      "field": "Property__c",
      "reparent": true,
      "description": "Real estate listings for this property"
    },
    {
      "object": "Inspection__c",
      "field": "Property__c",
      "reparent": true,
      "description": "Property inspections and reports"
    },
    {
      "object": "Maintenance__c",
      "field": "Property__c",
      "reparent": true,
      "description": "Maintenance history and schedules"
    }
  ]
}
```

**How to find related objects**:
```bash
# Query Salesforce for child relationships
sf data query --query "SELECT ChildRelationship FROM EntityDefinition
  WHERE QualifiedApiName = 'Property__c'" --target-org <org> --use-tooling-api
```

### Step 4: Configure Validation (Optional)

Add object-specific validation rules if needed:

```json
{
  "validation": {
    "checkOwnership": true,
    "checkRecordTypes": true,
    "checkApprovalProcess": true
  },
  "specialCases": {
    "activeLeases": {
      "enabled": true,
      "rule": "IF Property has active leases, warn user before merge",
      "severity": "WARN"
    }
  }
}
```

### Step 5: Execute Merge

```javascript
const DataOps = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/data-operations-api');

const result = await DataOps.mergeRecords('production',
  'a00xxx000001',  // Master Property__c ID
  'a00xxx000002',  // Duplicate Property__c ID
  'favor-master',
  { dryRun: false, verbose: true }
);

console.log(`✅ Merged ${result.objectType}: ${result.masterRecordId}`);
console.log(`   Fields updated: ${result.fieldsUpdated.length}`);
console.log(`   Related objects reparented: ${result.relatedObjectsReparented}`);
```

**That's it!** The framework auto-detects your profile and handles the merge.

---

## Merge Profile Structure

### Complete Profile Schema

```json
{
  // --- REQUIRED FIELDS ---
  "object": "CustomObject__c",
  "maxMergeCandidates": 2,

  // --- OPTIONAL: Related Objects ---
  "relatedObjects": [
    {
      "object": "ChildObject__c",
      "field": "Parent__c",
      "reparent": true,
      "description": "Child records to reparent",
      "polymorphic": false
    }
  ],

  // --- OPTIONAL: Validation Rules ---
  "validation": {
    "checkOwnership": true,
    "checkRecordTypes": true,
    "checkApprovalProcess": true,
    "checkSharingRules": false,
    "customValidation": false
  },

  // --- OPTIONAL: Special Cases ---
  "specialCases": {
    "exampleCase": {
      "enabled": true,
      "rule": "IF condition THEN action",
      "severity": "WARN | TYPE1_ERROR | INFO",
      "description": "Human-readable explanation"
    }
  },

  // --- OPTIONAL: Field Configuration ---
  "fieldConfiguration": {
    "skipFields": [
      "External_System_ID__c",
      "Legacy_ID__c"
    ],
    "keywords": {
      "financial": ["Amount", "Cost", "Price", "Revenue"],
      "dates": ["Contract_Start__c", "Contract_End__c"],
      "status": ["Status__c", "Stage__c"]
    }
  },

  // --- OPTIONAL: Performance Tuning ---
  "performance": {
    "batchSize": 200,
    "maxRelatedRecords": 10000,
    "enableParallelReparenting": true
  },

  // --- OPTIONAL: Runbook Compliance ---
  "runbookCompliance": {
    "fieldResolutionRule": "Master values win unless null (same as standard objects)",
    "cliImplementation": "sf data query + sf data update + sf data delete",
    "notes": "Additional compliance notes"
  },

  // --- METADATA ---
  "metadata": {
    "created": "2025-10-29",
    "author": "Your Name",
    "version": "1.0.0",
    "notes": "Initial merge profile for CustomObject__c"
  }
}
```

### Field Descriptions

#### Required Fields

- **object** (string, required): Salesforce API name of the object (e.g., `Property__c`)
- **maxMergeCandidates** (integer, required): Always `2` (master + duplicate)

#### relatedObjects Array

Each related object entry:
- **object** (string): Child object API name
- **field** (string): Lookup/Master-Detail field name pointing to parent
- **reparent** (boolean): `true` to automatically reparent, `false` to skip
- **description** (string): Human-readable purpose
- **polymorphic** (boolean, optional): `true` if field can reference multiple object types (e.g., WhoId, WhatId)

#### validation Object

Optional validation checks:
- **checkOwnership** (boolean): Validate ownership transfer
- **checkRecordTypes** (boolean): Check for record type mismatches
- **checkApprovalProcess** (boolean): Warn if records in approval process
- **checkSharingRules** (boolean): Validate sharing rule conflicts
- **customValidation** (boolean): Enable custom validator (requires validator file)

#### specialCases Object

Custom business rules:
- **enabled** (boolean): Turn case on/off
- **rule** (string): Human-readable rule description
- **severity** (string): `WARN`, `TYPE1_ERROR` (blocks), or `INFO`
- **description** (string): Additional context

#### fieldConfiguration Object

Field-level customization:
- **skipFields** (array): Fields to exclude from merge (e.g., external IDs)
- **keywords** (object): Field categories for smart merge strategies

#### performance Object

Performance tuning:
- **batchSize** (integer): Records per batch for bulk operations
- **maxRelatedRecords** (integer): Limit for related record queries
- **enableParallelReparenting** (boolean): Process related objects concurrently

#### runbookCompliance Object

Documentation for runbook adherence:
- **fieldResolutionRule** (string): How fields are resolved
- **cliImplementation** (string): CLI commands used
- **notes** (string): Additional compliance notes

#### metadata Object

Profile metadata:
- **created** (date): Creation date
- **author** (string): Profile creator
- **version** (string): Profile version
- **notes** (string): Change notes

---

## Profile Template Reference

### Complete Template File

Location: `scripts/merge-profiles/_template-merge-profile.json`

```json
{
  "object": "CustomObject__c",
  "maxMergeCandidates": 2,
  "description": "Merge profile for CustomObject__c",

  "relatedObjects": [
    {
      "object": "ChildObject__c",
      "field": "Parent__c",
      "reparent": true,
      "description": "Child records to reparent after merge"
    }
  ],

  "validation": {
    "checkOwnership": true,
    "checkRecordTypes": true,
    "checkApprovalProcess": true,
    "checkSharingRules": false,
    "customValidation": false
  },

  "specialCases": {
    "exampleCase": {
      "enabled": false,
      "rule": "IF [condition] THEN [action]",
      "severity": "WARN",
      "description": "Example special case - replace with your business rules"
    }
  },

  "fieldConfiguration": {
    "skipFields": [
      "External_System_ID__c",
      "Legacy_ID__c"
    ],
    "keywords": {
      "financial": ["Amount", "Cost", "Price"],
      "dates": ["Start_Date__c", "End_Date__c"],
      "status": ["Status__c", "Stage__c"]
    }
  },

  "performance": {
    "batchSize": 200,
    "maxRelatedRecords": 10000,
    "enableParallelReparenting": true
  },

  "runbookCompliance": {
    "fieldResolutionRule": "Master values win unless null (same as standard objects)",
    "cliImplementation": "sf data query + sf data update + sf data delete",
    "notes": "Follows Salesforce Record Merging Runbook patterns"
  },

  "metadata": {
    "created": "YYYY-MM-DD",
    "author": "Your Name",
    "version": "1.0.0",
    "notes": "Initial merge profile for CustomObject__c"
  }
}
```

**Usage**: Copy this template and customize for your custom object.

---

## Custom Validator (Optional)

For **complex business logic** beyond profile configuration, create a custom validator.

### When to Create a Custom Validator

Create a custom validator if your merge requires:
- **Complex SOQL queries** (multi-object joins, aggregations)
- **External system validation** (check external API before merge)
- **Business rule enforcement** (e.g., "Cannot merge if active contract exists")
- **Data integrity checks** (e.g., "Sum of child records must equal parent field")
- **Approval process validation** (block merge if in approval)

### Custom Validator Structure

**File Location**: `scripts/lib/validators/{objectname}-merge-validator.js`

**Example**: `property-merge-validator.js`

```javascript
#!/usr/bin/env node

/**
 * Property Merge Validator - Custom Business Logic
 *
 * Validates Property__c merge operations with business-specific rules:
 * 1. Active Lease Check - Cannot merge properties with active leases
 * 2. Ownership Verification - Validate owner consistency
 * 3. Financial Reconciliation - Ensure financial data integrity
 */

const { execSync } = require('child_process');

class PropertyMergeValidator {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = options;
  }

  /**
   * Main validation method - called by pre-merge validator
   */
  async validateObjectSpecificRules(masterRecord, duplicateRecord, profile) {
    const errors = [];

    // Check 1: Active lease validation
    const leaseResult = await this.checkActiveLeases(masterRecord, duplicateRecord, profile);
    if (leaseResult.errors) {
      errors.push(...leaseResult.errors);
    }

    // Check 2: Ownership consistency
    const ownerResult = await this.checkOwnershipConsistency(masterRecord, duplicateRecord, profile);
    if (ownerResult.errors) {
      errors.push(...ownerResult.errors);
    }

    // Check 3: Financial reconciliation
    const financialResult = await this.checkFinancialData(masterRecord, duplicateRecord, profile);
    if (financialResult.errors) {
      errors.push(...financialResult.errors);
    }

    return { errors };
  }

  /**
   * Check 1: Active Lease Validation
   *
   * Business Rule: Cannot merge properties if either has an active lease.
   * Rationale: Lease contracts reference specific property records.
   */
  async checkActiveLeases(masterRecord, duplicateRecord, profile) {
    const errors = [];

    if (!profile.specialCases?.activeLeases?.enabled) {
      return { errors };
    }

    try {
      // Query active leases for both properties
      const leaseQuery = `SELECT Id, Property__c, Status__c, End_Date__c
                          FROM Lease__c
                          WHERE Property__c IN ('${masterRecord.Id}', '${duplicateRecord.Id}')
                          AND Status__c = 'Active'
                          AND End_Date__c >= TODAY`;

      const cmd = `sf data query --query "${leaseQuery}" --target-org ${this.orgAlias} --json`;
      const result = execSync(cmd, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      const activeLeases = parsed.result?.records || [];

      if (activeLeases.length > 0) {
        errors.push({
          type: 'ACTIVE_LEASE_CONFLICT',
          severity: 'TYPE1_ERROR',
          message: `Cannot merge properties with active leases (${activeLeases.length} found)`,
          details: {
            activeLeases: activeLeases.map(lease => ({
              id: lease.Id,
              propertyId: lease.Property__c,
              status: lease.Status__c,
              endDate: lease.End_Date__c
            }))
          },
          remediation: [
            'BLOCKED: Properties with active leases cannot be merged',
            'Option 1: Wait until lease expires, then merge',
            'Option 2: Terminate lease early (requires legal approval)',
            'Option 3: Manually reassign lease to correct property, then merge'
          ],
          businessReason: 'Lease contracts are legally binding and reference specific property records'
        });
      }

    } catch (error) {
      errors.push({
        type: 'VALIDATION_ERROR',
        severity: 'WARN',
        message: 'Could not validate active leases',
        details: { error: error.message }
      });
    }

    return { errors };
  }

  /**
   * Check 2: Ownership Consistency
   *
   * Business Rule: Master and duplicate should have same owner.
   * Rationale: Different owners may indicate incorrect merge pairing.
   */
  async checkOwnershipConsistency(masterRecord, duplicateRecord, profile) {
    const errors = [];

    if (!profile.validation?.checkOwnership) {
      return { errors };
    }

    try {
      // Query ownership for both records
      const ownerQuery = `SELECT Id, OwnerId, Owner.Name
                          FROM Property__c
                          WHERE Id IN ('${masterRecord.Id}', '${duplicateRecord.Id}')`;

      const cmd = `sf data query --query "${ownerQuery}" --target-org ${this.orgAlias} --json`;
      const result = execSync(cmd, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      const records = parsed.result?.records || [];
      const master = records.find(r => r.Id === masterRecord.Id);
      const duplicate = records.find(r => r.Id === duplicateRecord.Id);

      if (master.OwnerId !== duplicate.OwnerId) {
        errors.push({
          type: 'OWNERSHIP_MISMATCH',
          severity: 'WARN',
          message: 'Master and duplicate have different owners',
          details: {
            masterOwner: {
              id: master.OwnerId,
              name: master.Owner?.Name
            },
            duplicateOwner: {
              id: duplicate.OwnerId,
              name: duplicate.Owner?.Name
            }
          },
          recommendation: 'Verify this is the correct merge pair. Different owners may indicate unrelated records.'
        });
      }

    } catch (error) {
      errors.push({
        type: 'VALIDATION_ERROR',
        severity: 'WARN',
        message: 'Could not validate ownership',
        details: { error: error.message }
      });
    }

    return { errors };
  }

  /**
   * Check 3: Financial Data Reconciliation
   *
   * Business Rule: Sum of child financial records should match parent field.
   * Rationale: Data integrity for reporting.
   */
  async checkFinancialData(masterRecord, duplicateRecord, profile) {
    const errors = [];

    // Implementation left as exercise
    // Query financial child records, sum amounts, compare to parent field

    return { errors };
  }

  /**
   * Logging helper
   */
  log(message, level = 'INFO') {
    if (this.options.verbose || level === 'ERROR' || level === 'WARN') {
      console.log(`[${level}] ${message}`);
    }
  }
}

module.exports = PropertyMergeValidator;
```

### Validator Integration

**Automatic Discovery**: The pre-merge validator automatically loads custom validators:

```javascript
// In sfdc-pre-merge-validator.js (existing code)
loadObjectSpecificValidator(objectType) {
  const validatorMap = {
    'Contact': './validators/contact-merge-validator.js',
    'Lead': './validators/lead-merge-validator.js',
    'Property__c': './validators/property-merge-validator.js'  // Auto-discovered
  };

  // Try to find custom validator
  const customValidatorPath = `./validators/${objectType.toLowerCase()}-merge-validator.js`;
  if (fs.existsSync(customValidatorPath)) {
    return require(customValidatorPath);
  }
}
```

**No code changes needed** - just create the validator file with correct naming.

---

## Testing Your Configuration

### Step 1: Profile Validation

```bash
# Validate JSON syntax
node -c scripts/merge-profiles/property-merge-profile.json

# Check profile structure
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/merge-profile-validator.js property-merge-profile.json
```

### Step 2: Dry Run Merge

```javascript
const DataOps = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/data-operations-api');

// Test with dryRun: true
const result = await DataOps.mergeRecords('sandbox',
  'a00xxx000001',
  'a00xxx000002',
  'favor-master',
  { dryRun: true, verbose: true }  // ← Dry run mode
);

console.log('Dry run results:');
console.log(`  Fields to update: ${result.fieldsToUpdate.length}`);
console.log(`  Related objects: ${result.relatedObjectsDiscovered}`);
console.log(`  Validation: ${result.validationResults.errors.length} errors`);
```

### Step 3: Sandbox Testing

```javascript
// 1. Test in sandbox first
const sandboxResult = await DataOps.mergeRecords('sandbox',
  'a00xxx000001',
  'a00xxx000002',
  'favor-master',
  { dryRun: false }
);

// 2. Verify results
console.log(`✅ Merged: ${sandboxResult.masterRecordId}`);
console.log(`   Deleted: ${sandboxResult.deletedRecordId}`);
console.log(`   Fields updated: ${sandboxResult.fieldsUpdated.length}`);

// 3. Check related records
const relatedQuery = `SELECT COUNT() FROM Listing__c WHERE Property__c = '${sandboxResult.masterRecordId}'`;
// Verify count matches expected
```

### Step 4: Rollback Testing

```bash
# Test rollback capability
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dedup-rollback-system.js \
  --execution-log sandbox_execution_log.json \
  --validate-only

# If validation passes, execute rollback
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dedup-rollback-system.js \
  --execution-log sandbox_execution_log.json
```

---

## Real-World Examples

### Example 1: Property Management

**Scenario**: Real estate company with Property__c, Listing__c, Inspection__c objects.

**Profile**: `property-merge-profile.json`
```json
{
  "object": "Property__c",
  "maxMergeCandidates": 2,
  "description": "Merge profile for Property custom object",

  "relatedObjects": [
    {"object": "Listing__c", "field": "Property__c", "reparent": true},
    {"object": "Inspection__c", "field": "Property__c", "reparent": true},
    {"object": "Maintenance__c", "field": "Property__c", "reparent": true},
    {"object": "Lease__c", "field": "Property__c", "reparent": true}
  ],

  "validation": {
    "checkOwnership": true,
    "checkApprovalProcess": true,
    "customValidation": true
  },

  "specialCases": {
    "activeLeases": {
      "enabled": true,
      "rule": "IF Property has active leases THEN BLOCK merge",
      "severity": "TYPE1_ERROR",
      "description": "Cannot merge properties with active leases (legal requirement)"
    }
  },

  "fieldConfiguration": {
    "skipFields": ["External_MLS_ID__c", "Legacy_System_ID__c"],
    "keywords": {
      "financial": ["Purchase_Price__c", "Market_Value__c", "Annual_Revenue__c"],
      "dates": ["Purchase_Date__c", "Last_Inspection__c"],
      "status": ["Status__c", "Occupancy__c"]
    }
  }
}
```

**Custom Validator**: `property-merge-validator.js` (checks active leases, ownership)

**Usage**:
```javascript
const result = await DataOps.mergeRecords('production',
  'a00xxx000001',  // Master property
  'a00xxx000002',  // Duplicate property
  'favor-master'
);
```

### Example 2: Subscription Management

**Scenario**: SaaS company with Subscription__c, Invoice__c, Usage__c objects.

**Profile**: `subscription-merge-profile.json`
```json
{
  "object": "Subscription__c",
  "maxMergeCandidates": 2,
  "description": "Merge profile for Subscription custom object",

  "relatedObjects": [
    {"object": "Invoice__c", "field": "Subscription__c", "reparent": true},
    {"object": "Usage__c", "field": "Subscription__c", "reparent": true},
    {"object": "Payment__c", "field": "Subscription__c", "reparent": true}
  ],

  "validation": {
    "checkOwnership": true,
    "checkRecordTypes": true,
    "customValidation": true
  },

  "specialCases": {
    "activeSubscription": {
      "enabled": true,
      "rule": "IF Subscription is Active THEN warn before merge",
      "severity": "WARN",
      "description": "Merging active subscriptions may affect billing"
    }
  },

  "fieldConfiguration": {
    "skipFields": ["External_Billing_ID__c", "Stripe_Customer_ID__c"],
    "keywords": {
      "financial": ["MRR__c", "ARR__c", "Total_Revenue__c"],
      "dates": ["Start_Date__c", "End_Date__c", "Renewal_Date__c"],
      "status": ["Status__c", "Billing_Status__c"]
    }
  }
}
```

**Custom Validator**: `subscription-merge-validator.js` (checks active status, billing reconciliation)

### Example 3: Asset Tracking

**Scenario**: Manufacturing company with Asset__c, Maintenance__c, Location__c objects.

**Profile**: `asset-merge-profile.json`
```json
{
  "object": "Asset__c",
  "maxMergeCandidates": 2,
  "description": "Merge profile for Asset custom object",

  "relatedObjects": [
    {"object": "Maintenance__c", "field": "Asset__c", "reparent": true},
    {"object": "Location_History__c", "field": "Asset__c", "reparent": true},
    {"object": "Warranty__c", "field": "Asset__c", "reparent": true}
  ],

  "validation": {
    "checkOwnership": false,
    "checkRecordTypes": true
  },

  "specialCases": {
    "serialNumber": {
      "enabled": true,
      "rule": "IF Serial_Number__c differs THEN BLOCK merge",
      "severity": "TYPE1_ERROR",
      "description": "Different serial numbers indicate different physical assets"
    }
  },

  "fieldConfiguration": {
    "skipFields": ["RFID_Tag__c", "Barcode__c"],
    "keywords": {
      "financial": ["Purchase_Price__c", "Current_Value__c"],
      "dates": ["Purchase_Date__c", "Last_Maintenance__c"],
      "status": ["Status__c", "Condition__c"]
    }
  }
}
```

---

## Best Practices

### 1. Profile Design

**✅ DO**:
- Start with the template (`_template-merge-profile.json`)
- Document all related objects (query Salesforce for child relationships)
- Use descriptive names for special cases
- Add comments in `metadata.notes`
- Version your profiles (increment `metadata.version`)

**❌ DON'T**:
- Hardcode record IDs or usernames
- Skip `relatedObjects` definition (orphaned records)
- Forget to test in sandbox first
- Ignore validation rules (causes merge failures)

### 2. Custom Validators

**✅ DO**:
- Create validators ONLY for complex business logic
- Use TYPE1_ERROR severity to BLOCK invalid merges
- Provide clear remediation steps in error messages
- Test validators with edge cases
- Document validator logic in comments

**❌ DON'T**:
- Create validators for simple checks (use profile `specialCases` instead)
- Query excessive data (performance impact)
- Use validators for field-level logic (use profile `fieldConfiguration`)
- Forget error handling (catch exceptions)

### 3. Testing Strategy

**Test Progression**:
1. **Profile validation**: JSON syntax check
2. **Dry run**: `dryRun: true` in sandbox
3. **Sandbox merge**: Execute in sandbox, verify results
4. **Rollback test**: Test rollback in sandbox
5. **Production merge**: Execute in production with monitoring

**Test Checklist**:
- [ ] Profile JSON is valid
- [ ] All related objects defined
- [ ] Special cases tested (if any)
- [ ] Custom validator tested (if created)
- [ ] Dry run successful
- [ ] Sandbox merge successful
- [ ] Related records reparented correctly
- [ ] Rollback tested and verified
- [ ] Performance acceptable (< 10 seconds per merge)

### 4. Performance Optimization

**For large datasets**:
- Set `performance.batchSize` based on object size
- Enable `performance.enableParallelReparenting`
- Limit `performance.maxRelatedRecords` for very large hierarchies
- Use explicit field selection in SOQL (faster queries)

**Example performance config**:
```json
{
  "performance": {
    "batchSize": 500,
    "maxRelatedRecords": 50000,
    "enableParallelReparenting": true
  }
}
```

### 5. Documentation

**Document these for your team**:
- **Profile purpose**: What object, why merge is needed
- **Business rules**: Special cases and their rationale
- **Related objects**: Why each is included
- **Testing results**: Sandbox test outcomes
- **Rollback procedure**: How to undo if needed

---

## Troubleshooting

### Issue 1: Profile Not Loaded

**Symptom**: Merge fails with "No merge profile found"

**Causes**:
- Profile filename doesn't match object name (case-sensitive)
- Profile not in `scripts/merge-profiles/` directory
- JSON syntax error

**Solution**:
```bash
# Check filename matches object (lowercase)
ls -l scripts/merge-profiles/property-merge-profile.json

# Validate JSON syntax
node -c scripts/merge-profiles/property-merge-profile.json

# Check profile object field
jq '.object' scripts/merge-profiles/property-merge-profile.json
# Should output: "Property__c"
```

### Issue 2: Related Objects Not Reparented

**Symptom**: Child records not moved to master

**Causes**:
- Incorrect field name in profile
- Field doesn't exist on child object
- Permissions issue (can't update child object)

**Solution**:
```bash
# Verify field exists
sf sobject describe Listing__c | jq '.fields[] | select(.name=="Property__c")'

# Check permissions
sf data query --query "SELECT Id FROM Listing__c LIMIT 1" --target-org <org>

# Enable verbose mode to see reparenting logs
await DataOps.mergeRecords(org, master, duplicate, strategy, { verbose: true });
```

### Issue 3: Custom Validator Not Running

**Symptom**: Expected validation not executing

**Causes**:
- Validator file not found
- Validator filename doesn't match pattern
- `customValidation: false` in profile

**Solution**:
```bash
# Check validator exists
ls -l scripts/lib/validators/property-merge-validator.js

# Verify exports module.exports
grep "module.exports" scripts/lib/validators/property-merge-validator.js

# Enable custom validation in profile
jq '.validation.customValidation = true' scripts/merge-profiles/property-merge-profile.json
```

### Issue 4: Merge Too Slow

**Symptom**: Merge takes > 30 seconds

**Causes**:
- Too many related records
- Inefficient SOQL queries
- Sequential processing (not parallel)

**Solution**:
```json
{
  "performance": {
    "batchSize": 500,
    "maxRelatedRecords": 10000,
    "enableParallelReparenting": true
  }
}
```

### Issue 5: TYPE1_ERROR Blocking Valid Merge

**Symptom**: Validator blocks merge that should be allowed

**Causes**:
- Validator logic too strict
- Edge case not handled
- Wrong severity level

**Solution**:
1. Review validator logic in `{object}-merge-validator.js`
2. Add exception handling for edge case
3. Consider changing `TYPE1_ERROR` to `WARN` for less critical rules

---

## Additional Resources

### Internal Documentation
- `docs/MERGE_RUNBOOK_MAPPING.md` - Runbook compliance reference
- `scripts/merge-profiles/README.md` - Profile system documentation
- `scripts/lib/validators/contact-merge-validator.js` - Example validator
- `scripts/lib/validators/lead-merge-validator.js` - Example validator

### Framework Files
- `scripts/lib/generic-record-merger.js` - Core merger implementation
- `scripts/lib/sfdc-pre-merge-validator.js` - Pre-merge validation
- `scripts/lib/dedup-rollback-system.js` - Rollback system
- `scripts/lib/data-operations-api.js` - Unified API

### Testing Support
- `test/_template.test.js` - Test template for custom objects
- `scripts/lib/test-helpers.js` - Testing utilities

---

## Summary

**Extending the Generic Record Merge Framework to custom objects is simple**:

1. **Copy template** → `_template-merge-profile.json`
2. **Update object name** → `Property__c`
3. **Define related objects** → Child relationships
4. **Add validation** (optional) → Business rules
5. **Test in sandbox** → Dry run → Real merge → Rollback

**Time Investment**: 10-15 minutes per custom object

**Result**: Production-ready merge capability with runbook compliance, validation, and rollback support.

---

**Questions?** See `docs/MERGE_RUNBOOK_MAPPING.md` or create an issue in the repository.

**Last Updated**: 2025-10-29
**Maintained By**: RevPal Engineering
**Version**: 2.0.0
