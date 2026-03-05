# Runbook 7: Troubleshooting Common Issues

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Administrators, Developers

---

## Table of Contents

1. [Introduction](#introduction)
2. [Formula Syntax Errors](#formula-syntax-errors)
3. [Deployment Failures](#deployment-failures)
4. [Runtime Errors](#runtime-errors)
5. [Performance Issues](#performance-issues)
6. [User-Reported Problems](#user-reported-problems)
7. [Integration Conflicts](#integration-conflicts)
8. [Edge Cases](#edge-cases)
9. [Diagnostic Commands](#diagnostic-commands)
10. [Troubleshooting Flowcharts](#troubleshooting-flowcharts)
11. [Emergency Procedures](#emergency-procedures)
12. [Quick Reference](#quick-reference)

---

## Introduction

This runbook provides systematic troubleshooting guidance for common validation rule issues. Each section includes problem identification, root cause analysis, and step-by-step resolution.

### Troubleshooting Philosophy

**Systematic Approach**:
1. **Identify**: What is the error message or symptom?
2. **Isolate**: Is it formula, deployment, or runtime issue?
3. **Diagnose**: What is the root cause?
4. **Fix**: Apply the appropriate solution
5. **Verify**: Confirm the fix works
6. **Document**: Record the issue and resolution

---

## Formula Syntax Errors

### Error: "Error: Syntax error. Missing ')'"

**Symptom**:
```
Formula validation fails with:
"Error: Syntax error. Missing ')'"
```

**Root Causes**:
1. Unbalanced parentheses
2. Missing closing parenthesis
3. Extra opening parenthesis

**Diagnostic Steps**:

```bash
# Step 1: Count parentheses
Formula: AND(ISPICKVAL(StageName, "Closed Won"), ISNULL(CloseDate)

Opening: 3  (AND, ISPICKVAL, ISNULL)
Closing: 2  (ISPICKVAL, ISNULL)
Result: MISSING 1 closing parenthesis

# Step 2: Use validation rule complexity calculator
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-complexity-calculator.js assess \
  --formula "AND(ISPICKVAL(StageName, \"Closed Won\"), ISNULL(CloseDate)"

# Output: Syntax Error: Unbalanced parentheses
```

**Solution**:

```javascript
// ❌ WRONG
AND(ISPICKVAL(StageName, "Closed Won"), ISNULL(CloseDate)

// ✅ CORRECT
AND(ISPICKVAL(StageName, "Closed Won"), ISNULL(CloseDate))
```

**Prevention**:
- Use formula builder (auto-completes parentheses)
- Count opening/closing parentheses manually
- Test formula incrementally (add one function at a time)

---

### Error: "Error: Field CloseDate does not exist"

**Symptom**:
```
Formula validation fails with:
"Error: Field CloseDate does not exist. Check spelling."
```

**Root Causes**:
1. Field doesn't exist in object
2. Field name misspelled
3. Field API name incorrect (using label instead)
4. Field deleted but formula not updated

**Diagnostic Steps**:

```bash
# Step 1: List all fields on object
sf sobject describe Opportunity | jq '.fields[] | select(.name | contains("Close")) | {name: .name, label: .label, type: .type}'

# Output:
# {
#   "name": "CloseDate",     ← API name (use this)
#   "label": "Close Date",   ← Label (don't use)
#   "type": "date"
# }

# Step 2: Check field exists
sf data query \
  --query "SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Opportunity' AND QualifiedApiName = 'CloseDate'" \
  --use-tooling-api
```

**Solution**:

```javascript
// ❌ WRONG: Using label
ISNULL(Close Date)

// ❌ WRONG: Misspelled
ISNULL(ClosDate)

// ✅ CORRECT: Using API name
ISNULL(CloseDate)
```

**Prevention**:
- Always use field API names (not labels)
- Use formula builder's field picker
- Verify field existence before using

---

### Error: "Error: Incorrect parameter type for function 'ISBLANK()'"

**Symptom**:
```
Formula validation fails with:
"Error: Incorrect parameter type for function 'ISBLANK()'.
Expected Text, received Picklist."
```

**Root Causes**:
1. Using ISBLANK() on picklist field
2. Using ISNULL() on picklist field
3. Not using TEXT() conversion

**Diagnostic Steps**:

```bash
# Step 1: Identify field type
sf sobject describe Opportunity | jq '.fields[] | select(.name == "StageName") | {name: .name, type: .type}'

# Output:
# {
#   "name": "StageName",
#   "type": "picklist"     ← Picklist field!
# }
```

**Solution**:

```javascript
// ❌ WRONG: ISBLANK on picklist
ISBLANK(StageName)

// ❌ WRONG: ISNULL on picklist
ISNULL(StageName)

// ✅ CORRECT: TEXT() conversion
TEXT(StageName) = ""

// ✅ CORRECT: Use ISPICKVAL
ISPICKVAL(StageName, "")
```

**Prevention**:
- Check field type before using ISBLANK/ISNULL
- Always use TEXT() for picklist blank checks
- Prefer ISPICKVAL for picklist comparisons

---

### Error: "Error: Field StageName is a picklist field. Wrap with TEXT()..."

**Symptom**:
```
Formula validation fails with:
"Error: Field StageName is a picklist field. Wrap with TEXT() and use
TEXT(StageName) = "value" instead of StageName = "value""
```

**Root Causes**:
1. Direct picklist comparison without TEXT()
2. Using = operator instead of ISPICKVAL

**Solution**:

```javascript
// ❌ WRONG: Direct comparison
StageName = "Closed Won"

// ✅ CORRECT: ISPICKVAL (preferred)
ISPICKVAL(StageName, "Closed Won")

// ✅ CORRECT: TEXT() conversion (alternative)
TEXT(StageName) = "Closed Won"
```

**When to use which**:
- **ISPICKVAL**: For exact value match (recommended)
- **TEXT()**: For partial match or blank check

---

## Deployment Failures

### Error: "No source-backed components present in the package"

**Symptom**:
```bash
sf project deploy start \
  --metadata ValidationRule:Opportunity.My_Rule

ERROR: No source-backed components present in the package.
```

**Root Causes**:
1. Incorrect directory structure
2. Missing Salesforce project config (`sfdx-project.json`)
3. Wrong deploy command for MDAPI format
4. File not in source path

**Diagnostic Steps**:

```bash
# Step 1: Validate source structure
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/deployment-source-validator.js validate-source ./force-app

# Step 2: Check file location
find . -name "My_Rule.validationRule-meta.xml"

# Step 3: Verify Salesforce project config
cat sfdx-project.json | jq '.packageDirectories'
```

**Solution**:

```bash
# Ensure correct structure:
force-app/
└── main/
    └── default/
        └── objects/
            └── Opportunity/
                └── validationRules/
                    └── My_Rule.validationRule-meta.xml

# Verify Salesforce project config exists:
{
  "packageDirectories": [
    {
      "path": "force-app",
      "default": true
    }
  ],
  "namespace": "",
  "sourceApiVersion": "62.0"
}

# Deploy
sf project deploy start \
  --source-dir force-app \
  --target-org myOrg
```

**Prevention**:
- Use `sf project generate` to create proper structure
- Always validate source before deploying
- Keep Salesforce project config (sfdx-project.json) in project root

---

### Error: "FIELD_INTEGRITY_EXCEPTION: field integrity exception: unknown"

**Symptom**:
```bash
sf project deploy start --metadata ValidationRule:...

ERROR: FIELD_INTEGRITY_EXCEPTION: field integrity exception: unknown
(Details: Field Amount__c does not exist)
```

**Root Causes**:
1. Field referenced in formula doesn't exist in target org
2. Field exists but has different API name
3. Field deleted in target org but not in source

**Diagnostic Steps**:

```bash
# Step 1: List fields in target org
sf data query \
  --query "SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Opportunity'" \
  --use-tooling-api \
  --target-org production

# Step 2: Compare with formula fields
# Extract all field references from formula
grep -oE '[A-Z][A-Za-z0-9_]*__c' My_Rule.validationRule-meta.xml

# Step 3: Check for field existence
sf data query \
  --query "SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Opportunity' AND QualifiedApiName = 'Amount__c'" \
  --use-tooling-api \
  --target-org production
```

**Solution**:

```bash
# Option 1: Create missing field in target org first
sf data create record \
  --sobject FieldDefinition \
  --values "QualifiedApiName=Amount__c..." \
  --target-org production

# Option 2: Update formula to use existing field
# Replace Amount__c with Amount (standard field)

# Option 3: Remove reference to non-existent field
```

**Prevention**:
- Run pre-deployment validation
- Use validation-rule-orchestrator agent (checks field existence)
- Maintain field inventory across orgs

---

### Error: "DUPLICATE_VALUE: duplicate value found: ValidationName"

**Symptom**:
```bash
sf project deploy start --metadata ValidationRule:...

ERROR: DUPLICATE_VALUE: duplicate value found: ValidationName
duplicates value on record with id: 03d...
```

**Root Causes**:
1. Validation rule with same name already exists
2. Attempting to create when should update
3. Case-insensitive name collision

**Diagnostic Steps**:

```bash
# Check if rule exists
sf data query \
  --query "SELECT Id, ValidationName, Active FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Opportunity' AND ValidationName = 'My_Rule'" \
  --use-tooling-api \
  --target-org production
```

**Solution**:

```bash
# Option 1: Update existing rule (if intended)
# Ensure <fullName> in XML matches existing rule
<ValidationRule>
  <fullName>My_Rule</fullName>
  ...
</ValidationRule>

# Option 2: Use different name (if new rule intended)
<ValidationRule>
  <fullName>My_Rule_v2</fullName>
  ...
</ValidationRule>

# Option 3: Delete existing rule first
sf project delete source \
  --metadata ValidationRule:Opportunity.My_Rule \
  --target-org production
```

**Prevention**:
- Check for existing rules before deployment
- Use consistent naming convention
- Document rule names in inventory

---

## Runtime Errors

### Error: "Null Pointer Exception in formula"

**Symptom**:
```
User saves record, sees error:
"Formula error: Null pointer exception"
```

**Root Causes**:
1. Accessing field on null parent relationship
2. Accessing field on null value
3. Missing null check before field access

**Diagnostic Steps**:

```bash
# Identify formula causing error
sf data query \
  --query "SELECT ValidationName, ErrorConditionFormula FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Opportunity' AND Active = true" \
  --use-tooling-api

# Look for parent relationships without null checks
# Example: Account.Annual_Revenue__c without checking Account.Id
```

**Solution**:

```javascript
// ❌ WRONG: No null check
Account.Annual_Revenue__c > 1000000

// ✅ CORRECT: Null check first
AND(
  NOT(ISBLANK(Account.Id)),
  NOT(ISNULL(Account.Annual_Revenue__c)),
  Account.Annual_Revenue__c > 1000000
)

// ❌ WRONG: No null check on nested relationship
Account.Parent.Industry = "Technology"

// ✅ CORRECT: Null checks at each level
AND(
  NOT(ISBLANK(Account.Id)),
  NOT(ISBLANK(Account.Parent.Id)),
  Account.Parent.Industry = "Technology"
)
```

**Prevention**:
- **ALWAYS** null-check parent relationships before accessing fields
- Use validation-rule-complexity-calculator.js (detects missing null checks)
- Test with records that have null parent relationships

---

### Error: "String Exception: Regex too complicated"

**Symptom**:
```
User saves record, sees error:
"String Exception: Regex too complicated"
```

**Root Causes**:
1. REGEX() function with complex pattern
2. Pattern has too many alternations
3. Pattern has deep nesting

**Diagnostic Steps**:

```bash
# Find rules with REGEX()
sf data query \
  --query "SELECT ValidationName, ErrorConditionFormula FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Opportunity' AND ErrorConditionFormula LIKE '%REGEX%'" \
  --use-tooling-api
```

**Solution**:

```javascript
// ❌ WRONG: Too complex
REGEX(Email, "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.(com|net|org|edu|gov|mil|biz|info|name|museum|us|ca|uk|...)$")

// ✅ CORRECT: Simplified
REGEX(Email, "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$")

// ✅ BETTER: Use CONTAINS for simple checks
AND(
  CONTAINS(Email, "@"),
  CONTAINS(Email, "."),
  LEN(Email) > 5
)
```

**Prevention**:
- Simplify regex patterns
- Use CONTAINS/STARTS WITH instead of regex when possible
- Test regex with various inputs before deployment

---

## Performance Issues

### Issue: "Validation rule causing slow saves"

**Symptom**:
```
Users report:
"Opportunity saves taking 5-10 seconds (used to be 1-2 seconds)"
```

**Root Causes**:
1. Complex validation rule formula
2. Multiple cross-object queries
3. Too many validation rules on object
4. Inefficient formula evaluation order

**Diagnostic Steps**:

```bash
# Step 1: Measure save time
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/performance-monitor.js \
  --object Opportunity \
  --operation save \
  --sample-size 100

# Step 2: Identify complex rules
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-complexity-calculator.js assess \
  --object Opportunity \
  --list-all

# Step 3: Query debug logs for CPU time
sf data query \
  --query "SELECT Id, DurationMilliseconds, CpuTime FROM ApexLog WHERE Operation = 'DML' AND Request LIKE '%Opportunity%' ORDER BY CpuTime DESC LIMIT 10" \
  --use-tooling-api
```

**Solution**:

**Option 1: Optimize Formula**

```javascript
// ❌ SLOW: Complex formula (complexity score 75)
AND(
  OR(
    AND(RecordType.Name = "Enterprise", Amount > 100000),
    AND(RecordType.Name = "SMB", Amount > 50000)
  ),
  Account.Annual_Revenue__c > 1000000,
  Account.Parent.Industry = "Technology"
)

// ✅ FAST: Simplified (complexity score 45)
// Use formula fields for complex calculations
AND(
  Meets_Amount_Threshold__c,  // Formula field
  Account.Parent_Is_Tech__c   // Rollup formula field
)
```

**Option 2: Segment Rule**

```bash
# Break one complex rule into 2 simple rules
# Rule 1: Amount threshold check (score 30)
# Rule 2: Account validation (score 35)
# Result: 2 fast rules instead of 1 slow rule
```

**Option 3: Consolidate Rules**

```bash
# If 10+ rules on object, consolidate related rules
# 10 rules → 4 consolidated rules
# Performance improvement: 40%
```

**Prevention**:
- Keep complexity score <60
- Minimize cross-object references
- Consolidate rules when possible
- Use formula fields for complex calculations

---

### Issue: "Bulk Data Loader operations failing"

**Symptom**:
```bash
Data Loader batch update of 10,000 records fails with:
"Batch failed: Validation error on row 5,432"
```

**Root Causes**:
1. Validation rule triggered on one or more records
2. Bulk operation treats batch as all-or-nothing
3. Data quality issues in CSV

**Diagnostic Steps**:

```bash
# Step 1: Identify violating records
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-impact-analyzer.js \
  --org production \
  --object Opportunity \
  --formula "[formula from validation rule]" \
  --output csv

# Step 2: Export violating records
sf data query \
  --query "SELECT Id, [fields] FROM Opportunity WHERE [formula]" \
  --result-format csv \
  --target-org production > violating_records.csv
```

**Solution**:

**Option 1: Fix Data Before Bulk Load**

```bash
# Clean violating records first
# Update Close Date for 45 Closed Won opportunities
# Then run bulk load
```

**Option 2: Temporarily Deactivate Rule**

```bash
# 1. Deactivate validation rule
sf project deploy start \
  --metadata ValidationRule:Opportunity.My_Rule \
  --target-org production
  # Set Active=false in XML

# 2. Run bulk operation
sf data bulk upsert --sobject Opportunity --csv-file data.csv

# 3. Reactivate rule
# Set Active=true in XML
sf project deploy start \
  --metadata ValidationRule:Opportunity.My_Rule
```

**Option 3: Use Batch Processing with Error Handling**

```javascript
// Process in smaller batches with try/catch
const batchSize = 200;
for (let i = 0; i < records.length; i += batchSize) {
  const batch = records.slice(i, i + batchSize);
  try {
    await sf.sobject('Opportunity').update(batch);
  } catch (e) {
    // Log failed batch, continue with next
    console.error(`Batch ${i} failed:`, e);
    failedBatches.push({ start: i, records: batch });
  }
}
```

**Prevention**:
- Run impact analysis before bulk operations
- Clean data before loading
- Use batch processing with error handling

---

## User-Reported Problems

### Issue: "Error message not clear"

**Symptom**:
```
User reports:
"I get error 'Required field missing' but I don't know which field"
```

**Root Cause**:
Validation rule error message is generic or not actionable

**Example Bad Error Message**:
```
"Required field missing"
```

**Solution: Improve Error Message**:

```
❌ BAD: Generic
"Required field missing"

✅ GOOD: Specific
"Close Date is required when Stage is Closed Won"

✅ BETTER: Actionable
"Close Date is required when Stage is Closed Won.
Please enter the date the deal closed before saving."

✅ BEST: Actionable + Self-Service
"Close Date is required when Stage is Closed Won.

To fix:
1. Enter the date in the Close Date field
2. Save the record again

Need help? See: kb.company.com/close-date-validation
Questions? Contact Sales Operations"
```

**Prevention**:
- Always include field name in error message
- Provide clear action to fix
- Add KB link for self-service
- Test error message with end users before deployment

---

### Issue: "Validation blocking legitimate business"

**Symptom**:
```
User reports:
"I need to save this Opportunity as Closed Won without Close Date
because the deal closed before we implemented Salesforce"
```

**Root Causes**:
1. Validation rule too strict
2. No bypass for legitimate exceptions
3. Business process not fully understood during rule design

**Diagnostic Steps**:

```bash
# Step 1: Quantify exception cases
sf data query \
  --query "SELECT COUNT() FROM Opportunity WHERE CreatedDate < 2024-01-01 AND ISPICKVAL(StageName, 'Closed Won') AND ISNULL(CloseDate)" \
  --target-org production

# Result: 15 legacy opportunities affected
```

**Solution Options**:

**Option 1: Add Exception Logic**

```javascript
// ❌ ORIGINAL: Too strict
AND(
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)

// ✅ UPDATED: Allow legacy records
AND(
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate),
  CreatedDate >= DATE(2024, 1, 1)  // Only for new records
)
```

**Option 2: Profile Bypass**

```javascript
// Allow specific profile to bypass
AND(
  $Profile.Name != "System Administrator",
  $Profile.Name != "Data Migration",
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)
```

**Option 3: Custom Permission Bypass**

```javascript
// Allow users with custom permission to bypass
AND(
  NOT($Permission.Bypass_Close_Date_Validation),
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)

// Create custom permission: Setup → Custom Permissions → New
// Assign to specific users via permission set
```

**Prevention**:
- Thoroughly understand business processes before creating rules
- Plan for exception cases
- Add bypass mechanisms for legitimate exceptions
- Document all bypasses and their justification

---

## Integration Conflicts

### Issue: "Validation rule conflicts with Flow"

**Symptom**:
```
Flow fails with:
"FIELD_CUSTOM_VALIDATION_EXCEPTION: Close Date is required"

Flow logic:
1. Update Stage to "Closed Won"
2. In next element, update Close Date to TODAY()

Problem: Validation rule fires after step 1, before step 2
```

**Root Causes**:
1. Validation rule evaluates on save (after step 1)
2. Flow hasn't set Close Date yet
3. Order of operations issue

**Solution Options**:

**Option 1: Reorder Flow Logic**

```
❌ ORIGINAL ORDER:
1. Update Stage → "Closed Won"  (triggers validation, FAILS)
2. Update Close Date → TODAY()  (never reached)

✅ CORRECT ORDER:
1. Update Close Date → TODAY()
2. Update Stage → "Closed Won"  (validation passes)
```

**Option 2: Combine Updates**

```
✅ SINGLE UPDATE:
Update Record element:
- Stage = "Closed Won"
- Close Date = TODAY()

Result: All fields set before validation evaluates
```

**Option 3: Add Flow Bypass**

```javascript
// Validation rule formula
AND(
  NOT($Flow.IsActive),  // Bypass when Flow running
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)

// Note: $Flow.IsActive available in API v50.0+
```

**Prevention**:
- Design validations with automation in mind
- Test validations with Flows/Process Builder
- Document automation dependencies

---

### Issue: "Validation rule conflicts with Apex Trigger"

**Symptom**:
```
Apex trigger fails with:
"FIELD_CUSTOM_VALIDATION_EXCEPTION: Close Date is required"

Trigger logic:
trigger OpportunityTrigger on Opportunity (before update) {
  for (Opportunity opp : Trigger.new) {
    if (opp.StageName == 'Closed Won') {
      opp.CloseDate = Date.today();
    }
  }
}

Problem: Validation fires AFTER trigger
```

**Root Cause**:
Order of execution: Before Trigger → Validation Rules

**Solution**:

```apex
// ✅ CORRECT: Set field in BEFORE trigger
trigger OpportunityTrigger on Opportunity (before update) {
  for (Opportunity opp : Trigger.new) {
    if (opp.StageName == 'Closed Won' && opp.CloseDate == null) {
      opp.CloseDate = Date.today();
    }
  }
}
// Trigger sets field BEFORE validation rules evaluate
```

**Prevention**:
- Understand Salesforce order of execution
- Use before triggers to set fields for validation
- Test triggers with validation rules active

---

## Edge Cases

### Edge Case: "Record Type Changes"

**Symptom**:
```
User changes record type, validation rule suddenly fails on previously valid record
```

**Root Cause**:
Record type-specific field visibility or required fields

**Example**:

```javascript
// Validation rule
AND(
  ISPICKVAL(Type, "Customer"),
  ISBLANK(Customer_ID__c)
)

// Scenario:
// 1. Record Type = "Lead" (Customer_ID__c not visible)
// 2. User changes Record Type to "Customer"
// 3. Validation fires: Customer_ID__c is blank
// 4. But field wasn't visible before, user didn't know to populate
```

**Solution**:

```javascript
// ✅ Add record type check with grace period
AND(
  RecordType.DeveloperName = "Customer",
  ISPICKVAL(Type, "Customer"),
  ISBLANK(Customer_ID__c),
  CreatedDate >= DATE(2024, 1, 1)  // Only enforce for new records
)
```

**Prevention**:
- Consider record type-specific validations
- Provide clear communication when changing record types
- Add grace periods for record type migrations

---

### Edge Case: "Mass Delete/Undelete Operations"

**Symptom**:
```
Undelete operation fails:
"FIELD_CUSTOM_VALIDATION_EXCEPTION: Close Date is required"
```

**Root Cause**:
Validation rules fire on undelete operations

**Solution**:

```javascript
// Option 1: Skip validation on undelete
AND(
  NOT(ISCHANGED(Id)),  // True on undelete
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)

// Note: ISCHANGED(Id) may not work as expected on undelete

// Option 2: Profile bypass for mass operations
AND(
  $Profile.Name != "System Administrator",
  $Profile.Name != "Data Recovery",
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)
```

**Prevention**:
- Test validations with undelete operations
- Provide bypass mechanism for bulk operations
- Document undelete behavior

---

## Diagnostic Commands

### Quick Diagnostic Script

```bash
#!/bin/bash
# validation-rule-diagnostics.sh

echo "=== Validation Rule Diagnostics ==="
echo

# 1. List all active validation rules
echo "1. Active Validation Rules:"
sf data query \
  --query "SELECT EntityDefinition.QualifiedApiName, ValidationName, Active FROM ValidationRule WHERE Active = true ORDER BY EntityDefinition.QualifiedApiName" \
  --use-tooling-api
echo

# 2. Check for complex rules
echo "2. Complex Rules (>500 chars):"
sf data query \
  --query "SELECT ValidationName, LENGTH(ErrorConditionFormula) FormLength FROM ValidationRule WHERE Active = true AND LENGTH(ErrorConditionFormula) > 500" \
  --use-tooling-api
echo

# 3. Find rules without descriptions
echo "3. Rules Without Descriptions:"
sf data query \
  --query "SELECT ValidationName FROM ValidationRule WHERE Active = true AND (Description = null OR Description = '')" \
  --use-tooling-api
echo

# 4. Check validation error frequency
echo "4. Recent Validation Errors (if debug logging enabled):"
sf data query \
  --query "SELECT COUNT() ErrorCount FROM ApexLog WHERE Operation = 'validation_error' AND CreatedDate = TODAY" \
  --use-tooling-api
echo

# 5. Performance impact
echo "5. High CPU Validation Evaluations:"
sf data query \
  --query "SELECT Id, CpuTime FROM ApexLog WHERE Operation = 'validation' AND CpuTime > 500 AND CreatedDate = LAST_N_DAYS:7 ORDER BY CpuTime DESC LIMIT 10" \
  --use-tooling-api
```

### Test Validation Rule Locally

```bash
# Test formula against production data (read-only)
sf data query \
  --query "SELECT Id, Name, StageName, CloseDate FROM Opportunity WHERE [FORMULA] LIMIT 10" \
  --target-org production

# Example:
sf data query \
  --query "SELECT Id, Name FROM Opportunity WHERE ISPICKVAL(StageName, 'Closed Won') AND ISNULL(CloseDate)" \
  --target-org production
```

### Backup Validation Rules

```bash
# Export all validation rules before making changes
sf project retrieve start \
  --metadata ValidationRule:* \
  --output-dir ./backup/$(date +%Y%m%d) \
  --target-org production
```

---

## Troubleshooting Flowcharts

### Formula Error Decision Tree

```
Formula Validation Error?
├─ Syntax error? → Check parentheses, quotes, commas
│  └─ Use complexity calculator to validate syntax
├─ Field does not exist? → Verify field API name
│  └─ Check with sobject describe
├─ Type mismatch? → Check field type
│  ├─ Picklist? → Use TEXT() or ISPICKVAL
│  ├─ Date? → Use DATE() function
│  └─ Number? → Use VALUE() function
└─ Unknown function? → Check API version, function availability
```

### Deployment Error Decision Tree

```
Deployment Failed?
├─ No source-backed components? → Validate directory structure
│  └─ Run deployment-source-validator.js
├─ Field doesn't exist? → Check field in target org
│  └─ Create field OR update formula
├─ Duplicate rule name? → Check existing rules
│  └─ Update existing OR rename new rule
└─ Validation error? → Test formula in sandbox first
   └─ Run impact analysis
```

### Runtime Error Decision Tree

```
Runtime Error?
├─ Null pointer exception? → Add null checks
│  ├─ Parent relationship? → Check parent exists
│  └─ Field value? → Check field not null
├─ Regex too complicated? → Simplify pattern
│  └─ Use CONTAINS instead
├─ CPU limit? → Optimize formula
│  ├─ Reduce cross-object refs
│  ├─ Simplify logic
│  └─ Consider segmentation
└─ String too long? → Reduce formula length
   └─ Use segmentation
```

---

## Emergency Procedures

### Emergency: Validation Blocking Critical Business

**Symptom**: Validation rule is blocking critical business operations

**Immediate Action (< 5 minutes)**:

```bash
# Option 1: Deactivate via UI (fastest)
Setup → Object Manager → [Object] → Validation Rules
→ Edit [Rule] → Uncheck "Active" → Save

# Option 2: Deactivate via CLI (if UI unavailable)
# Update XML: <active>false</active>
sf project deploy start \
  --metadata ValidationRule:Opportunity.Problematic_Rule \
  --target-org production
```

**Communication**:

```
Email: [Urgent] Validation Rule Temporarily Disabled

Team,

We have temporarily disabled validation rule "[Rule Name]" due to
[reason: blocking critical business operation].

What this means:
- You can now save records without [validation constraint]
- This is temporary - we will re-enable with fix by [date]

Action Required:
- [Any user actions needed]

Questions? Contact Salesforce Admin team immediately.
```

**Follow-Up (< 24 hours)**:

1. Root cause analysis
2. Fix formula or adjust logic
3. Test in sandbox
4. Redeploy with fix
5. Post-mortem and lessons learned

---

### Emergency: Mass Validation Errors After Deployment

**Symptom**: After deploying validation rule, 100+ users reporting errors

**Immediate Action**:

```bash
# Step 1: Deactivate rule immediately
# (See above procedure)

# Step 2: Quantify impact
sf data query \
  --query "SELECT COUNT() FROM Opportunity WHERE [FORMULA]" \
  --target-org production

# Step 3: Export affected records for analysis
sf data query \
  --query "SELECT Id, Name, Owner.Name FROM Opportunity WHERE [FORMULA]" \
  --result-format csv \
  --target-org production > affected_records.csv
```

**Communication**:

```
Email: [Urgent] Validation Rule Issue - Temporary Resolution

Team,

We are aware of validation errors affecting [number] records after
deploying [rule name] today.

Immediate Resolution:
- Rule has been temporarily disabled
- You can now save records normally

Next Steps:
1. We are analyzing affected records
2. Will provide data cleanup instructions by [date]
3. Will redeploy corrected rule by [date]

We apologize for the disruption.

Salesforce Admin Team
```

**Follow-Up**:

1. Analyze why impact analysis missed these cases
2. Improve impact analysis process
3. Add additional test cases
4. Consider staged rollout for future deployments

---

## Quick Reference

### Common Error Messages & Fixes

| Error Message | Quick Fix |
|---------------|-----------|
| "Syntax error. Missing ')'" | Count and balance parentheses |
| "Field does not exist" | Check field API name with `sobject describe` |
| "Incorrect parameter type" | Use TEXT() for picklists |
| "Null pointer exception" | Add null checks for parent relationships |
| "Regex too complicated" | Simplify regex or use CONTAINS |
| "No source-backed components" | Validate directory structure |
| "DUPLICATE_VALUE" | Check for existing rule with same name |

### Diagnostic Command Quick Reference

```bash
# List active rules
sf data query --query "SELECT ValidationName FROM ValidationRule WHERE Active = true" --use-tooling-api

# Check field existence
sf sobject describe [Object] | jq '.fields[] | select(.name == "[Field]")'

# Test formula against data
sf data query --query "SELECT Id FROM [Object] WHERE [FORMULA]" --target-org production

# Backup rules
sf project retrieve start --metadata ValidationRule:* --output-dir ./backup

# Validate deployment
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/deployment-source-validator.js validate-source ./force-app

# Calculate complexity
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-complexity-calculator.js assess --formula "[formula]"
```

### Emergency Contacts

```
Critical Issue (Blocking Business):
1. Deactivate rule immediately (see Emergency Procedures)
2. Notify: salesforce-admin@company.com
3. Escalate: IT Manager

Non-Critical Issue:
1. Create Jira ticket: project SFDC
2. Assign: Salesforce Admin team
3. Follow standard SLA
```

---

## Next Steps

**Continue to Runbook 8**: [Segmented Rule Building](./08-segmented-rule-building.md)

Learn advanced techniques for building complex validation rules using segmentation.

---

**Related Runbooks**:
- [Runbook 4: Validation and Best Practices](./04-validation-and-best-practices.md)
- [Runbook 5: Testing and Deployment](./05-testing-and-deployment.md)
- [Runbook 6: Monitoring and Maintenance](./06-monitoring-and-maintenance.md)

---

**Version History**:
- v1.0.0 (2025-11-23) - Initial release
