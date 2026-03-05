# Safe Record Creation Playbook (OOO D1 Sequence)

## Overview

This playbook demonstrates the complete D1 sequence from the Salesforce Order of Operations spec for safe, validated record creation.

**When to Use**: ANY record creation operation, especially:
- Production environments
- Complex validation rules present
- Record types with different requirements
- Dependent picklist fields
- Master-detail relationships

## The 7-Step Pattern

### Step 1: Describe Object
```bash
node scripts/lib/ooo-write-operations.js introspect Account myorg
```

**What's Checked**:
- Required fields (nillable=false, createable=true)
- Field types (picklists, lookups, formulas)
- Record types available
- Dependent/controlling picklists

### Step 2: Get Active Validation Rules
```bash
node scripts/lib/ooo-validation-rule-analyzer.js getRules Account myorg --verbose
```

**What's Retrieved**:
- Rule names
- Error messages
- Formulas (via Metadata API)
- Which field displays error

### Step 3: Resolve Record Type
```bash
# Query record types
sf data query --query "SELECT Id, DeveloperName, Name, IsDefault FROM RecordType WHERE SobjectType = 'Account' AND IsActive = true" --target-org myorg
```

### Step 4: Check FLS
```bash
# Verify user has create permission on all fields
# This is done automatically by ooo-write-operations.js
```

### Step 5: Resolve Lookups
```bash
# Convert names to IDs (done automatically)
# Example: OwnerId: "John Doe" → "005xxx"
```

### Step 6: Create Record
```bash
# Execute with validated payload
```

### Step 7: Verify Record
```bash
# Re-fetch with restricted field list
```

## Complete Example

### Scenario: Create Customer Account

```javascript
const { OOOWriteOperations } = require('./scripts/lib/ooo-write-operations');

const ooo = new OOOWriteOperations('myorg', { verbose: true });

const result = await ooo.createRecordSafe('Account', {
    Name: 'Acme Corporation',
    Industry: 'Technology',
    AccountType: 'SaaS',  // Dependent picklist
    BillingCountry: 'USA',
    Phone: '555-1234',
    OwnerId: 'John Doe'  // Will be resolved to ID
}, {
    recordTypeName: 'Customer',
    allOrNone: true
});

if (result.success) {
    console.log(`✅ Account created: ${result.recordId}`);
} else {
    console.error(`❌ Creation failed: ${result.error}`);
    // Error includes rule name and formula
}
```

### Expected Output

```
🚀 Starting safe record creation for Account
Step 1: Describing object...
  Found 156 fields, 12 required
Step 2: Fetching active validation rules...
  Found 8 active validation rules
Step 3: Resolving record type...
  Resolved "Customer" → 012xxx
Step 4: Checking field-level security...
  ✓ All fields createable
Step 5: Resolving lookup references...
  Resolving lookup OwnerId: "John Doe"
    ✓ Resolved to 005xxx
Step 6: Creating record...
  ✓ Record created: 001xxx
Step 7: Verifying record...
  ✓ Verification passed
✅ Safe record creation completed successfully
```

## Error Handling

### Validation Failure Example

If a validation rule blocks the creation:

```
❌ Record creation failed:
   Rule: Account_Industry_Required
   Formula: AND(ISBLANK(Industry), RecordType.Name = 'Customer')
   Message: Industry is required for Customer accounts
```

**Remediation**: Add `Industry` to payload and retry.

### FLS Violation Example

If user lacks permission:

```
❌ FLS violations detected:
   - CustomField__c: Field is not createable
```

**Remediation**: Assign permission set with field access.

## Integration with Bulk Operations

For bulk creation (>100 records):

```javascript
const { OOOWriteOperations } = require('./scripts/lib/ooo-write-operations');
const BulkAPIHandler = require('./scripts/lib/bulk-api-handler');

// 1. Introspect ONCE for all records
const ooo = new OOOWriteOperations(orgAlias);
const metadata = await ooo.describeObject('Account');
const validationRules = await ooo.getActiveValidationRules('Account');

// 2. Validate structure
const flsCheck = await ooo.checkFLS('Account', Object.keys(records[0]));
if (!flsCheck.passed) {
    throw new Error(`FLS violations: ${flsCheck.violations.join(', ')}`);
}

// 3. Resolve lookups for ALL records
const resolvedRecords = await Promise.all(
    records.map(r => ooo.resolveLookups('Account', r, metadata))
);

// 4. Bulk operation
const handler = await BulkAPIHandler.fromSFAuth(orgAlias);
const result = await handler.smartOperation('insert', 'Account', resolvedRecords);

// 5. Verify sample
if (result.successfulResults.length > 0) {
    const sampleId = result.successfulResults[0].id;
    await ooo.verifyRecord('Account', sampleId, Object.keys(records[0]));
}
```

## Best Practices

1. **Always introspect before writing** - Saves time by surfacing issues early
2. **Never retry on validation failure** - Fix payload based on rule formula
3. **Use record type validation** - Ensures correct field requirements
4. **Resolve lookups ahead of time** - Prevents write failures
5. **Verify with restricted field list** - Only verify what you wrote

## ROI

- **95%+ error prevention** through comprehensive introspection
- **Zero-surprise writes** with validation-first approach
- **Clear error messages** with rule names and formulas
- **Audit trail** of all creation operations

## Reference

- **OOO Spec**: `docs/SALESFORCE_ORDER_OF_OPERATIONS.md`
- **Write Operations**: `scripts/lib/ooo-write-operations.js`
- **Validation Analyzer**: `scripts/lib/ooo-validation-rule-analyzer.js`
