---
name: validation-rule-patterns
description: Validation rule formula patterns and templates for Salesforce. Use when creating validation rules, writing formula logic, or reviewing existing rules for optimization.
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:validation-rule-orchestrator
---

# Validation Rule Patterns

## When to Use This Skill

- Creating validation rules with the `/create-validation-rule` wizard
- Writing custom formula logic for field validation
- Reviewing existing validation rules for optimization
- Troubleshooting validation rule errors
- Understanding formula function syntax

## Quick Reference

### Template Categories (30 Templates)

| Category | Count | Common Use Cases |
|----------|-------|------------------|
| Required Field | 5 | Conditional required, stage-specific, record type |
| Data Format | 5 | Email, phone, URLs, regex patterns |
| Business Logic | 5 | Date ranges, amount limits, status transitions |
| Cross-Object | 5 | Parent-child validation, rollup checks |
| Date/Time | 5 | Future dates, business hours, date sequences |
| Security/Compliance | 5 | PII protection, audit fields, approval gates |

### Complexity Scoring

| Score | Rating | Recommendation |
|-------|--------|----------------|
| 0-25 | Simple | No concerns |
| 26-50 | Moderate | Review for optimization |
| 51-75 | Complex | Consider splitting |
| 76-100 | Critical | Refactor required |

### Commands

```bash
/create-validation-rule                    # Interactive wizard
/create-validation-rule --template <id>    # Direct template
/create-validation-rule --custom           # Custom formula
```

## Essential Formula Patterns

### Required Field When Condition Met

```javascript
// Formula
AND(
  ISPICKVAL(StageName, "Closed Won"),
  ISBLANK(Amount)
)

// Error Message
"Amount is required when Stage is Closed Won."
```

### Picklist Field Validation

```javascript
// IMPORTANT: Never use ISBLANK() on picklist fields
// WRONG:
ISBLANK(Status__c)

// CORRECT:
TEXT(Status__c) = ""
// or
ISPICKVAL(Status__c, "")
```

### Email Format Validation

```javascript
// Formula
AND(
  NOT(ISBLANK(Email)),
  NOT(REGEX(Email, "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"))
)

// Error Message
"Please enter a valid email address."
```

### Phone Number Format (US)

```javascript
// Formula
AND(
  NOT(ISBLANK(Phone)),
  NOT(REGEX(Phone, "^\\(?[0-9]{3}\\)?[-. ]?[0-9]{3}[-. ]?[0-9]{4}$"))
)

// Error Message
"Phone must be in format: (XXX) XXX-XXXX or XXX-XXX-XXXX"
```

### Date Range Validation

```javascript
// End date must be after start date
AND(
  NOT(ISBLANK(Start_Date__c)),
  NOT(ISBLANK(End_Date__c)),
  End_Date__c <= Start_Date__c
)

// Error Message
"End Date must be after Start Date."
```

### Cross-Object Validation

```javascript
// Amount cannot exceed Account's credit limit
AND(
  NOT(ISBLANK(Amount)),
  Amount > Account.Credit_Limit__c
)

// Error Message
"Order Amount exceeds Account credit limit."
```

### Status Transition Rules

```javascript
// Prevent skipping stages (must go through Qualification)
AND(
  ISCHANGED(StageName),
  NOT(ISPICKVAL(PRIORVALUE(StageName), "Qualification")),
  ISPICKVAL(StageName, "Proposal")
)

// Error Message
"Cannot move to Proposal without passing through Qualification stage."
```

### Record Type Specific Validation

```javascript
// Require field only for specific record type
AND(
  RecordType.DeveloperName = "Enterprise_Opportunity",
  ISBLANK(Contract_Start_Date__c)
)

// Error Message
"Contract Start Date is required for Enterprise Opportunities."
```

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| `ISBLANK(PicklistField)` | Fails on picklist | Use `TEXT(field) = ""` |
| `ISNULL(PicklistField)` | Same as above | Use `ISPICKVAL(field, "")` |
| Deeply nested IF() | Hard to maintain | Use CASE() or split rules |
| SOQL-like logic | Not supported | Use formula functions only |
| 5000+ character formulas | Performance impact | Split into multiple rules |

## Impact Analysis Guidelines

Before deploying, run impact analysis:

| Violation Rate | Risk Level | Recommendation |
|----------------|------------|----------------|
| < 1% | LOW | Safe to deploy |
| 1-5% | MEDIUM | Notify affected users |
| 5-10% | HIGH | Phase deployment, communicate |
| > 10% | CRITICAL | Review rule logic, data cleanup first |

## Detailed Documentation

See supporting files:
- `templates.md` - Full template catalog with parameters
- `formulas.md` - Formula function reference
- `troubleshooting.md` - Common errors and solutions
