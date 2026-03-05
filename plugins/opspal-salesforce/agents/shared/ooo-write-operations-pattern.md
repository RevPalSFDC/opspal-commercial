# Salesforce Order of Operations (OOO) Write Pattern
# Version: 1.0.0
# Last Updated: 2025-10-27
#
# This file defines the MANDATORY pattern for all Salesforce record write operations
# to prevent validation failures and ensure reliable data operations.
#
# **Usage**: @import agents/shared/ooo-write-operations-pattern.md
#
# **Cacheable**: Yes - This pattern is stable and reused across 8+ data agents

---

## 🚨 MANDATORY: Order of Operations for Runtime Writes (OOO)

**CRITICAL**: ALL record write operations MUST follow the Salesforce Order of Operations pattern to prevent validation failures and ensure reliable data operations.

---

## Core Principle: Introspect → Plan → Apply → Verify

**NEVER brute-force writes**. If validation fails, surface rule name/formula and exit. Don't retry automatically.

---

## The Safe Write Pattern (Section A & D1)

For ANY record creation, use the standardized sequence:

```javascript
const { OOOWriteOperations } = require('./scripts/lib/ooo-write-operations');

const ooo = new OOOWriteOperations(orgAlias, { verbose: true });

// Complete 7-step safe creation
const result = await ooo.createRecordSafe(objectName, payload, {
    recordTypeName: 'Customer',  // Optional
    allOrNone: true,             // Default
    disableAssignmentRules: false
});

if (!result.success) {
    // Errors enriched with rule names and formulas
    console.error('Validation failure:', result.error);
    throw new Error(result.error);  // DO NOT RETRY
}
```

**What This Does** (7 Steps):
1. **Describe Object** - Required fields, types, picklists, lookups
2. **Get Active Validation Rules** - With formulas and error messages
3. **Resolve Record Type** - Get RT ID for desired type or default
4. **Check FLS** - Verify user has createable permission on all fields
5. **Resolve Lookups** - Convert names to IDs (Account__c: "Acme Corp" → "001xxx")
6. **Create Record** - Execute DML with minimal valid payload
7. **Verify Record** - Re-fetch with restricted field list to confirm values

---

## CLI Usage

For simple operations, use CLI:

```bash
# Introspect before operation
node scripts/lib/ooo-write-operations.js introspect Account myorg

# Safe record creation
node scripts/lib/ooo-write-operations.js createRecordSafe Account myorg \
  --payload '{"Name":"Acme Corp","Industry":"Technology","BillingCountry":"USA"}' \
  --record-type Customer \
  --verbose
```

---

## Critical Write Rules (Section A)

### A1: Preflight Introspection (ALWAYS)

Before writing, gather complete context:
- Object metadata (required fields, types)
- Active validation rules (names + formulas)
- Record types and their requirements
- Dependent/controlling picklists with Global Value Sets
- Active duplicate rules
- Trigger/Flow presence (warning)

### A2: Planning (Required Field Order)

Build minimal valid payload in correct order:

1. **RecordTypeId FIRST** - If requirements differ by RT
2. **Controlling picklists** - Before dependent picklists
3. **All required fields** - From describe results
4. **Lookup resolution** - Convert names → IDs ahead of time

```javascript
// ✅ CORRECT ORDER
const payload = {
    RecordTypeId: '012xxx',      // 1. RT first
    Industry: 'Technology',       // 2. Controlling picklist
    AccountType: 'Enterprise',    // 3. Dependent picklist (after controlling)
    Name: 'Acme Corp',           // 4. Required fields
    OwnerId: '005xxx'            // 5. All other fields
};
```

### A3: Apply (Fail with Explanation)

On validation failure:
- ❌ **NEVER** retry automatically
- ✅ **ALWAYS** surface rule name + formula
- ✅ **ALWAYS** exit with error

```javascript
// Validation failure example output:
// ❌ Record creation failed:
//    Rule: Account_Industry_Required
//    Formula: AND(ISBLANK(Industry), RecordType.Name = 'Customer')
//    Message: Industry is required for Customer accounts
```

### A4: Verify (Restricted Field List)

Re-fetch ONLY the fields you wrote:

```javascript
// ✅ CORRECT: Restricted verification
const verification = await ooo.verifyRecord(
    'Account',
    recordId,
    ['Name', 'Industry', 'AccountType']  // Only what we wrote
);

// ❌ WRONG: Verify all fields
// This would fail if user lacks FLS on other fields
```

---

## Integration with Bulk Operations

For bulk writes (>100 records), combine OOO with bulk APIs:

```javascript
const { OOOWriteOperations } = require('./scripts/lib/ooo-write-operations');
const BulkAPIHandler = require('./scripts/lib/bulk-api-handler');

// 1. Introspect once for all records
const ooo = new OOOWriteOperations(orgAlias);
const metadata = await ooo.describeObject('Account');
const validationRules = await ooo.getActiveValidationRules('Account');

// 2. Validate payload structure
const flsCheck = await ooo.checkFLS('Account', Object.keys(records[0]));
if (!flsCheck.passed) {
    throw new Error(`FLS violations: ${flsCheck.violations.join(', ')}`);
}

// 3. Resolve lookups for all records
const resolvedRecords = await Promise.all(
    records.map(r => ooo.resolveLookups('Account', r, metadata))
);

// 4. Execute bulk operation
const handler = await BulkAPIHandler.fromSFAuth(orgAlias);
const result = await handler.smartOperation('insert', 'Account', resolvedRecords);

// 5. Verify sample (spot check)
if (result.successfulResults.length > 0) {
    const sampleId = result.successfulResults[0].id;
    await ooo.verifyRecord('Account', sampleId, Object.keys(records[0]));
}
```

---

## When to Use OOO vs. Direct Operations

| Scenario | Use OOO | Use Direct | Reason |
|----------|---------|------------|--------|
| User-facing record creation | ✅ | ❌ | Validation critical |
| Bulk inserts (>100 records) | ✅ Introspect | ❌ Don't per-record | Introspect once, apply to all |
| Simple SOQL queries | ❌ | ✅ | No write operation |
| Test data generation | ✅ | ❌ | Ensure valid test data |
| Data migration | ✅ | ❌ | Complex validation needs |
| Admin/setup scripts | ✅ | ❌ | Professional quality required |
| Emergency fixes | ❌ | ✅ Only if urgent | OOO preferred when time allows |

---

## Common Patterns

### Pattern 1: Single Record Creation with Record Type

```javascript
const ooo = new OOOWriteOperations(orgAlias);

const result = await ooo.createRecordSafe('Account', {
    Name: 'Acme Corp',
    Industry: 'Technology',
    BillingCountry: 'USA',
    Website: 'https://acme.com'
}, {
    recordTypeName: 'Customer',
    verbose: true
});

if (result.success) {
    console.log(`Created Account: ${result.id}`);
} else {
    console.error('Validation failed:', result.error);
}
```

### Pattern 2: Bulk Creation with Pre-validation

```javascript
const ooo = new OOOWriteOperations(orgAlias);

// Step 1: Introspect once
const metadata = await ooo.describeObject('Contact');
const validationRules = await ooo.getActiveValidationRules('Contact');

// Step 2: Validate all records BEFORE bulk insert
const errors = [];
for (const [index, record] of records.entries()) {
    // Check required fields
    const requiredFields = metadata.fields
        .filter(f => !f.nillable && f.createable)
        .map(f => f.name);

    const missingFields = requiredFields.filter(f => !record[f]);
    if (missingFields.length > 0) {
        errors.push({
            index,
            error: `Missing required fields: ${missingFields.join(', ')}`
        });
    }
}

if (errors.length > 0) {
    throw new Error(`Validation failed for ${errors.length} records`);
}

// Step 3: Proceed with bulk insert
const bulkHandler = await BulkAPIHandler.fromSFAuth(orgAlias);
const result = await bulkHandler.smartOperation('insert', 'Contact', records);
```

### Pattern 3: Update with Validation

```javascript
const ooo = new OOOWriteOperations(orgAlias);

// Introspect to get updateable fields
const metadata = await ooo.describeObject('Opportunity');
const updateableFields = metadata.fields
    .filter(f => f.updateable)
    .map(f => f.name);

// Validate payload contains only updateable fields
const payloadFields = Object.keys(updatePayload);
const nonUpdateable = payloadFields.filter(f => !updateableFields.includes(f));

if (nonUpdateable.length > 0) {
    throw new Error(`Cannot update non-updateable fields: ${nonUpdateable.join(', ')}`);
}

// Proceed with update
const result = await ooo.updateRecordSafe('Opportunity', recordId, updatePayload);
```

---

## Error Handling Best Practices

### 1. Surface Validation Rule Details

```javascript
try {
    const result = await ooo.createRecordSafe('Account', payload);
} catch (error) {
    // OOO enriches errors with rule details
    if (error.message.includes('Validation rule:')) {
        console.error('❌ Validation Rule Violation');
        console.error('Rule:', error.ruleName);
        console.error('Formula:', error.formula);
        console.error('Message:', error.errorMessage);

        // Log for debugging, don't retry
        logger.error('OOO_VALIDATION_FAILURE', {
            object: 'Account',
            rule: error.ruleName,
            payload
        });
    }
    throw error;  // Propagate, don't suppress
}
```

### 2. Handle FLS Violations

```javascript
const flsCheck = await ooo.checkFLS('Contact', ['FirstName', 'LastName', 'Email', 'SSN__c']);

if (!flsCheck.passed) {
    console.error('FLS Violations:', flsCheck.violations);

    // Option 1: Remove non-createable fields
    const safePayload = {};
    for (const [key, value] of Object.entries(payload)) {
        if (!flsCheck.violations.includes(key)) {
            safePayload[key] = value;
        }
    }

    // Option 2: Fail fast and ask for different permissions
    throw new Error(`User lacks permission to create fields: ${flsCheck.violations.join(', ')}`);
}
```

### 3. Handle Lookup Resolution Failures

```javascript
try {
    const resolvedPayload = await ooo.resolveLookups('Opportunity', {
        Name: 'Big Deal',
        AccountName: 'Acme Corp',  // Will resolve to Account__c
        StageName: 'Prospecting'
    }, metadata);
} catch (error) {
    if (error.message.includes('Multiple accounts found')) {
        console.error('❌ Ambiguous lookup: Multiple accounts match "Acme Corp"');
        console.error('Provide more specific criteria or use Account ID directly');
    } else if (error.message.includes('No account found')) {
        console.error('❌ Lookup failed: No account named "Acme Corp"');
        console.error('Create the account first or provide a valid Account ID');
    }
    throw error;
}
```

---

## Performance Considerations

### Introspection Caching

For repeated operations on the same object:

```javascript
const ooo = new OOOWriteOperations(orgAlias, { cacheMetadata: true });

// First call: Fetches metadata from Salesforce
const result1 = await ooo.createRecordSafe('Account', payload1);

// Subsequent calls: Uses cached metadata (10x faster)
const result2 = await ooo.createRecordSafe('Account', payload2);
const result3 = await ooo.createRecordSafe('Account', payload3);
```

### Bulk Operations

For >100 records:
1. **Introspect once** (not per record)
2. **Validate all payloads** before bulk insert
3. **Use Bulk API v2.0** for actual insert
4. **Spot-check verification** (sample 10 records)

```javascript
// Introspect once
const metadata = await ooo.describeObject('Contact');
const validationRules = await ooo.getActiveValidationRules('Contact');

// Validate 1,000 records in memory (fast)
const validatedPayloads = records.map(r => validatePayload(r, metadata, validationRules));

// Bulk insert (one API call)
const bulkResult = await bulkHandler.smartOperation('insert', 'Contact', validatedPayloads);

// Spot-check 10 records
const sampleIds = bulkResult.successfulResults.slice(0, 10).map(r => r.id);
for (const id of sampleIds) {
    await ooo.verifyRecord('Contact', id, Object.keys(validatedPayloads[0]));
}
```

---

## Related Resources

- **Implementation**: `.claude-plugins/opspal-salesforce/scripts/lib/ooo-write-operations.js`
- **Bulk API Handler**: `.claude-plugins/opspal-salesforce/scripts/lib/bulk-api-handler.js`
- **Safe Query Builder**: `.claude-plugins/opspal-salesforce/scripts/lib/safe-query-builder.js`
- **Library Reference**: `.claude-plugins/opspal-salesforce/agents/shared/library-reference.yaml`

---

## Version History

- **1.0.0** (2025-10-27): Initial extraction from sfdc-data-operations agent, standardized for cross-agent use
