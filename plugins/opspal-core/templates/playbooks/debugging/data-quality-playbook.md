# Data Quality Debugging Playbook

## Overview

Use this playbook when encountering data quality issues such as validation errors, duplicate detection, malformed records, or data integrity problems.

## Symptoms

- Validation rule errors during data operations
- Duplicate record detection blocking imports
- Malformed data (incorrect types, truncation, encoding)
- Referential integrity violations
- Missing required field values
- Data sync discrepancies between platforms

## Diagnostic Steps

### Step 1: Identify Data Quality Patterns

```bash
# Check recent errors in logs
grep -i "validation\|duplicate\|required\|invalid" ~/.claude/logs/unified.jsonl | tail -30

# Extract error summary from debugging context
node scripts/lib/debugging-context-extractor.js extract --window=60 | jq '.debugging_context.log_metrics.error_count'
```

**What to look for:**
- Recurring field names in error messages
- Patterns in data values causing failures
- Specific record types with higher error rates

### Step 2: Analyze Validation Rule Failures (Salesforce)

```bash
# List active validation rules for object
sf data query --query "SELECT Id, ValidationName, Active, ErrorMessage FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '<ObjectName>' AND Active = true" --use-tooling-api --target-org <org-alias>

# Get full validation rule formula
sf data query --query "SELECT ValidationName, ErrorConditionFormula, ErrorMessage FROM ValidationRule WHERE ValidationName = '<RuleName>'" --use-tooling-api --target-org <org-alias>
```

### Step 3: Check for Duplicate Rules

```bash
# Salesforce duplicate rules
sf data query --query "SELECT DeveloperName, IsActive, ObjectType, ActionOnInsert, ActionOnUpdate FROM DuplicateRule WHERE IsActive = true" --use-tooling-api --target-org <org-alias>

# Check duplicate jobs
sf data query --query "SELECT Id, DeveloperName, ObjectType, MasterLabel FROM DuplicateJobDefinition" --use-tooling-api --target-org <org-alias>
```

### Step 4: Verify Field Requirements

```bash
# Check required fields for object
sf sobject describe <ObjectName> --target-org <org-alias> | jq '.fields[] | select(.nillable == false) | {name: .name, type: .type}'

# Check picklist values
sf sobject describe <ObjectName> --target-org <org-alias> | jq '.fields[] | select(.name == "<FieldName>") | .picklistValues'
```

## Common Root Causes

| Root Cause | Indicators | Fix |
|------------|------------|-----|
| Required field missing | "REQUIRED_FIELD_MISSING" | Add default value or pre-populate |
| Validation rule block | Custom error message | Check rule criteria, add bypass |
| Duplicate detected | "DUPLICATE_VALUE" | Merge duplicates or update existing |
| Field length exceeded | Truncation or error | Truncate input, increase field length |
| Invalid picklist value | Value not in list | Map to valid value or add to picklist |
| Record type mismatch | RT-specific validation | Use correct record type |
| Workflow update conflict | Concurrent updates | Handle update order |
| Lookup filter block | Relationship criteria | Fix lookup value or update filter |

## Quick Fixes

### 1. Bypass Validation Rules (Temporary)

```apex
// In Apex or with admin permissions
TriggerHandler.bypassAll();
// ... perform operation ...
TriggerHandler.clearAllBypasses();
```

**Note**: Only use in migrations with proper approval.

### 2. Pre-Validate Data Before Insert

```javascript
// Use the data quality validator
const { validateRecord } = require('./data-quality-framework');

const validationResult = await validateRecord({
  object: 'Account',
  record: recordData,
  rules: ['required', 'picklist', 'format']
});

if (!validationResult.valid) {
  console.log('Validation errors:', validationResult.errors);
}
```

### 3. Handle Duplicates

```bash
# Use dedup agent for safe merging
/dedup Account --strategy conservative --preview-only
```

## Data Quality Validation Script

```bash
# Run data quality preflight check
node scripts/lib/data-quality-framework.js validate \
  --object Account \
  --file data/accounts.csv \
  --rules all
```

## Field-Specific Debugging

### Date/DateTime Issues

```javascript
// Common date format issues
const validFormats = [
  'YYYY-MM-DD',           // Salesforce standard
  'YYYY-MM-DDTHH:mm:ssZ', // ISO 8601
  'MM/DD/YYYY'            // User input
];

// Normalize dates before import
const normalizedDate = moment(inputDate, validFormats, true).format('YYYY-MM-DD');
```

### Email Validation

```javascript
// RFC 5322 compliant email regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  // Handle invalid email
}
```

### Phone Number Standardization

```javascript
// Normalize phone to E.164 format
const cleaned = phone.replace(/\D/g, '');
const formatted = cleaned.startsWith('1') ? `+${cleaned}` : `+1${cleaned}`;
```

## Prevention Checklist

- [ ] Run data quality audit before bulk operations
- [ ] Create mapping rules for picklist values
- [ ] Set up duplicate detection with merge strategy
- [ ] Document validation rule criteria
- [ ] Test with sample data before full import
- [ ] Add error handling for partial failures

## Recovery Actions

1. **Validation failure**: Identify rule, fix data or bypass rule
2. **Duplicate blocked**: Use dedup-orchestrator to merge
3. **Required field**: Add default value mapping
4. **Type mismatch**: Transform data to correct type
5. **Partial failure**: Process errors from bulkification

## Monitoring Queries

```sql
-- Salesforce: Recent validation failures
SELECT CreatedDate, Description, SystemModstamp
FROM EventLogFile
WHERE EventType = 'ApexCallout'
AND LogDate = TODAY
ORDER BY CreatedDate DESC
```

## Related Playbooks

- [Data Migration Playbook](./data-migration-playbook.md)
- [Bulk Operations Playbook](./bulk-operations-playbook.md)

---

**Version**: 1.0.0
**Last Updated**: 2026-01-31
