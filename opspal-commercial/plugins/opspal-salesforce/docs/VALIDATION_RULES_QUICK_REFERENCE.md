# Validation Rules Quick Reference Guide

Quick reference for creating production-ready Salesforce validation rules with the Validation Rules Management System (v3.50.0).

## Command Quick Start

```bash
# Create validation rule (interactive wizard)
/create-validation-rule

# Or with parameters
/create-validation-rule --name Opportunity_Stage_Validation --object Opportunity --template field-validation
```

## Templates (6 Available)

| Template | Use Case | Example |
|----------|----------|---------|
| **field-validation** | Single field validation | Required field, value range, format |
| **cross-field-validation** | Multi-field validation | Amount > 0 AND Stage = Closed Won |
| **record-type-specific** | Record type rules | Required fields vary by record type |
| **date-range-validation** | Date logic validation | Start Date < End Date, Date in future |
| **dependent-field-validation** | Conditional requirements | If Type = X, Field Y is required |
| **lookup-relationship-validation** | Related record validation | Parent field matches child criteria |

## Complexity Scoring (0.0-1.0)

### Formula

```
Score = (formula_length / 5000) × 0.4 +
        (field_references × 0.05) +
        (logical_operators × 0.10) +
        (nested_depth / 10) × 0.3 +
        (cross_object_refs × 0.15)
```

### Thresholds

- **0.0-0.3 (Simple)**: Direct deployment recommended
  - Single field check, < 100 characters
  - 1-2 field references, 0-1 logical operators
  - Example: `ISBLANK(Name)`

- **0.3-0.7 (Moderate)**: Segmented approach recommended
  - Multiple field checks, 100-500 characters
  - 3-5 field references, 2-4 logical operators
  - Example: `AND(Amount > 10000, ISPICKVAL(Stage, "Closed Won"), CloseDate < TODAY())`

- **0.7-1.0 (Complex)**: Delegate to segmentation specialist
  - Cross-object references, > 500 characters
  - 6+ field references, 5+ logical operators
  - Example: Complex formula with parent/child relationships

## Common Formula Patterns

### Required Field

```javascript
// Basic required field
ISBLANK(FieldName__c)

// Required if condition
AND(
  ISPICKVAL(Type, "Customer"),
  ISBLANK(AccountNumber)
)
```

### Value Range

```javascript
// Numeric range
OR(
  Amount < 0,
  Amount > 1000000
)

// Date range
OR(
  Start_Date__c > End_Date__c,
  Start_Date__c < TODAY()
)
```

### Picklist Validation

```javascript
// Single picklist value
ISPICKVAL(Status__c, "Active")

// Multiple picklist values
OR(
  ISPICKVAL(Status__c, "Active"),
  ISPICKVAL(Status__c, "Pending")
)

// Exclude picklist values
NOT(
  OR(
    ISPICKVAL(Status__c, "Closed"),
    ISPICKVAL(Status__c, "Cancelled")
  )
)
```

### Cross-Object Reference

```javascript
// Parent field reference
Account.Type = "Customer"

// Parent picklist
ISPICKVAL(Account.Industry, "Technology")

// Multiple parent fields
AND(
  Account.AnnualRevenue > 1000000,
  Account.Type = "Customer"
)
```

### Date Logic

```javascript
// Date in future
CloseDate < TODAY()

// Date range
AND(
  Start_Date__c < End_Date__c,
  End_Date__c <= TODAY() + 365
)

// Fiscal period
AND(
  CreatedDate >= DATE(YEAR(TODAY()), 1, 1),
  CreatedDate <= DATE(YEAR(TODAY()), 12, 31)
)
```

### Text Field Validation

```javascript
// Length validation
LEN(Description) > 200

// Format validation (email pattern approximation)
AND(
  NOT(ISBLANK(Email__c)),
  CONTAINS(Email__c, "@"),
  CONTAINS(Email__c, ".")
)

// Alphanumeric only
NOT(REGEX(Code__c, "[^a-zA-Z0-9]"))
```

## Anti-Patterns (5 Types)

### 1. Circular Dependencies
**Problem**: Rule A depends on Rule B, Rule B depends on Rule A
**Detection**: Dependency graph analysis
**Fix**: Combine into single rule or refactor logic

### 2. Excessive Formula Length
**Problem**: Formula > 5,000 characters (Salesforce limit)
**Detection**: Character count > 4,000 (warning threshold)
**Fix**: Split into multiple rules or use Apex validation

### 3. Too Many Rules on Object
**Problem**: Object has > 20 validation rules
**Detection**: Rule count per object
**Fix**: Consolidate rules or use Apex validation

### 4. Hard-Coded Values
**Problem**: Formula contains hard-coded IDs or values
**Detection**: Pattern matching for 18-char IDs
**Fix**: Use custom metadata or custom settings

### 5. Missing Error Messages
**Problem**: Error message is generic or missing
**Detection**: Error message length < 10 chars
**Fix**: Provide clear, actionable error message

## Error Message Best Practices

### Good Error Messages

```
❌ BAD: "Error"
❌ BAD: "Invalid value"
❌ BAD: "This field is required"

✅ GOOD: "Close Date cannot be in the past. Please select a date today or in the future."
✅ GOOD: "Amount must be between $0 and $1,000,000. Current value: {Amount}"
✅ GOOD: "For Customer accounts, Account Number is required. Please enter the account number."
```

### Error Message Template

```
[What's wrong] + [Why it's wrong] + [How to fix it]

Example:
"Start Date ({Start_Date__c}) is after End Date ({End_Date__c}). Start Date must be before or equal to End Date."
```

## Segment-by-Segment Workflow (7 Segments)

For complex rules (complexity ≥ 0.7), use segmented approach:

| Segment | Content | Validation |
|---------|---------|------------|
| 1. Metadata | API name, label, description | Naming conventions, clarity |
| 2. Object/Field Selection | Target object, field references | Field existence, accessibility |
| 3. Core Logic | Main validation formula | Syntax, field types, operators |
| 4. Conditions | IF/AND/OR logic | Logical consistency, reachability |
| 5. Cross-Object References | Parent/child relationships | Relationship validity, field access |
| 6. Error Message | User-facing error text | Clarity, actionability |
| 7. Activation | Active checkbox, deployment | Org readiness, conflict check |

## CLI Commands

### Validation Rule Batch Manager

```bash
# Create multiple validation rules from configuration
node scripts/lib/validation-rule-batch-manager.js create --config batch-config.json

# Validate all validation rules
node scripts/lib/validation-rule-batch-manager.js validate --rules ./force-app/main/default/objects/*/validationRules/

# Deploy validation rules
node scripts/lib/validation-rule-batch-manager.js deploy --org dev-org --rules ./force-app/main/default/objects/*/validationRules/

# Test validation rules
node scripts/lib/validation-rule-batch-manager.js test --org dev-org --rules ./force-app/main/default/objects/*/validationRules/
```

### Validation Rule Complexity Calculator

```bash
# Calculate complexity for a single rule
node scripts/lib/validation-rule-complexity-calculator.js calculate --file Account_Amount_Validation.validationRule-meta.xml

# Calculate complexity for all rules on an object
node scripts/lib/validation-rule-complexity-calculator.js calculate-object Account --org dev-org

# Get recommendations based on complexity
node scripts/lib/validation-rule-complexity-calculator.js recommend --file MyRule.validationRule-meta.xml
```

### Validation Rule Creator

```bash
# Create from template
node scripts/lib/validation-rule-creator.js from-template \
  --template field-validation \
  --name Amount_Validation \
  --object Opportunity \
  --output ./validationrules

# Create from scratch
node scripts/lib/validation-rule-creator.js create \
  --name Custom_Validation \
  --object Account \
  --formula "ISBLANK(Name)" \
  --message "Account Name is required" \
  --output ./validationrules
```

## Routing Decision Tree

```
Validation Rule Creation Request
├─ Simple (< 0.3)?
│  ├─ YES → Use validation-rule-creator.js directly
│  └─ NO → Continue
├─ Moderate (0.3-0.7)?
│  ├─ YES → Use /create-validation-rule wizard (segmented)
│  └─ NO → Continue
└─ Complex (≥ 0.7)?
   └─ YES → Delegate to validation-rule-segmentation-specialist agent
```

## Best Practices Checklist

- [ ] Error message is clear and actionable
- [ ] Formula uses field references, not hard-coded values
- [ ] Cross-object references use proper notation (Account.Name, not Account__r.Name__c)
- [ ] Picklist values use ISPICKVAL(), not TEXT() comparisons
- [ ] Date comparisons use DATE() or TODAY() functions
- [ ] Formula complexity < 0.7 (or segmented approach used)
- [ ] Object has < 20 validation rules (or consolidation planned)
- [ ] No circular dependencies with other rules
- [ ] Rule tested in sandbox before production deployment
- [ ] Rule documented in org-specific runbook

## Common Errors & Solutions

### Error: "Compiled formula is too big to execute"
**Cause**: Formula > 5,000 characters
**Solution**: Split into multiple rules or use Apex validation

### Error: "Field does not exist: Account__r.Name__c"
**Cause**: Incorrect cross-object syntax
**Solution**: Use Account.Name (not Account__r.Name__c)

### Error: "Picklist field comparison error"
**Cause**: Using TEXT() comparison on picklist
**Solution**: Use ISPICKVAL(Field__c, "Value") instead

### Error: "Incorrect parameter type for operator '='"
**Cause**: Type mismatch (e.g., comparing text to number)
**Solution**: Use VALUE() for text-to-number conversion

## Integration with Living Runbook System

All validation rule operations are automatically captured:

- **Captured Data**: Template used, complexity score, anti-patterns detected, deployment outcome
- **Synthesis**: Common patterns, proven strategies, known issues
- **Usage**: Future operations reference historical context for org-specific insights

## Related Documentation

- **Full Agent Documentation**: `agents/validation-rule-orchestrator.md`, `agents/validation-rule-segmentation-specialist.md`
- **Command Documentation**: `commands/create-validation-rule.md`
- **Template Library**: `templates/validation-rules/`
- **Order of Operations**: `config/order-of-operations-v3.50.json`

---

**Version**: 3.50.0
**Last Updated**: 2025-01-24
