# Runbook 4: Validation and Best Practices

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Administrators, Developers

---

## Table of Contents

1. [Introduction](#introduction)
2. [Formula Best Practices](#formula-best-practices)
3. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
4. [Performance Optimization](#performance-optimization)
5. [Maintainability Guidelines](#maintainability-guidelines)
6. [Security Considerations](#security-considerations)
7. [Documentation Standards](#documentation-standards)
8. [Quality Checklist](#quality-checklist)
9. [Quick Reference](#quick-reference)

---

## Introduction

This runbook provides best practices for creating high-quality validation rules that are performant, maintainable, and user-friendly.

### Quality Dimensions

| Dimension | Goal | Metric |
|-----------|------|--------|
| **Correctness** | Formula logic matches requirements | 100% test pass rate |
| **Performance** | Fast evaluation (<100ms) | <2s total save time |
| **Maintainability** | Easy to understand and modify | Complexity score <60 |
| **Usability** | Clear error messages | <5 help desk tickets/month |
| **Security** | Proper access controls | 0 data leakage incidents |

---

## Formula Best Practices

### 1. Use Positive Logic

**❌ Avoid Excessive NOT()**:
```
NOT(ISBLANK(Field__c))
NOT(Type = "Customer")
NOT(Amount < 10000)
```

**✅ Prefer Positive Logic**:
```
Field__c != null
Type != "Customer"
Amount >= 10000
```

**Why**: Easier to read and understand

---

### 2. Check for Null/Blank FIRST

**❌ Wrong Order**:
```
LEN(Phone) != 10
// Fails if Phone is null
```

**✅ Correct Order**:
```
AND(
  NOT(ISBLANK(Phone)),
  LEN(Phone) != 10
)
```

**Why**: Prevents null reference errors

---

### 3. Use TEXT() for Picklist Fields

**❌ Doesn't Work**:
```
ISBLANK(Status__c)    // Picklist field
ISNULL(Status__c)     // Picklist field
```

**✅ Works**:
```
TEXT(Status__c) = ""
```

**Why**: Picklists require TEXT() conversion for blank checks

---

### 4. Null-Check Parent Relationships

**❌ Missing Null Check**:
```
Account.Industry = "Technology"
// Fails if Account is null
```

**✅ With Null Check**:
```
AND(
  NOT(ISBLANK(Account.Id)),
  Account.Industry = "Technology"
)
```

**Why**: Parent record might not exist

---

### 5. Keep Formulas Under 400 Characters

**❌ Too Long** (873 characters):
```
AND(OR(AND(RecordType.DeveloperName="Enterprise",Amount>100000,ISPICKVAL(StageName,"Closed Won")),AND(RecordType.DeveloperName="SMB",Amount>50000,ISPICKVAL(StageName,"Closed Won"))),OR(ISBLANK(Executive_Sponsor__c),ISBLANK(Business_Case__c),ISBLANK(Legal_Review_Date__c)),NOT(ISBLANK(Account.Id)),Account.Type="Customer",NOT(ISBLANK(Account.Industry)))
```

**✅ Segment Instead**:
```
Use validation-rule-segmentation-specialist
Break into 3 segments:
1. Opportunity criteria (150 chars)
2. Required fields check (120 chars)
3. Account validation (100 chars)
```

**Why**: Maintainability, readability

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: ISBLANK/ISNULL on Picklists

**Problem**: These functions don't work on picklist fields

**Example**:
```
❌ ISBLANK(Status__c)
❌ ISNULL(Type)
```

**Solution**:
```
✅ TEXT(Status__c) = ""
✅ TEXT(Type) = ""
```

**How to Fix Existing Rules**:
1. Identify all picklist fields in formula
2. Replace `ISBLANK(PicklistField)` with `TEXT(PicklistField) = ""`
3. Test thoroughly
4. Redeploy

---

### Anti-Pattern 2: Deep Nesting (>4 Levels)

**Problem**: Hard to read and maintain

**Example**:
```
❌ AND(OR(AND(A, OR(B, AND(C, OR(D, E)))), F), G)
// 5 nesting levels
```

**Solution**: Segment the formula
```
✅ Segment 1: AND(A, condition1)
✅ Segment 2: OR(B, condition2)
✅ Combine: AND(segment1, segment2, F, G)
```

**Measurement**: `validation-rule-complexity-calculator.js` detects this

---

### Anti-Pattern 3: Missing Parent Null Checks

**Problem**: Runtime errors when parent record doesn't exist

**Example**:
```
❌ Account.Annual_Revenue__c > 1000000
// Fails if Account.Id is null
```

**Solution**:
```
✅ AND(
  NOT(ISBLANK(Account.Id)),
  NOT(ISNULL(Account.Annual_Revenue__c)),
  Account.Annual_Revenue__c > 1000000
)
```

**Rule**: ALWAYS null-check parent relationship before accessing parent fields

---

### Anti-Pattern 4: Hardcoded Values Without Documentation

**Problem**: No one knows why the threshold exists or when to update it

**Example**:
```
❌ Discount_Percent__c > 0.15
// What is 0.15? Why this value?
```

**Solution**: Document in rule description
```
✅ Discount_Percent__c > 0.15

Rule Description:
"Max discount 15% per Sales Policy v2.3, approved by CFO 2025-01-15.
Update threshold if policy changes."
```

---

### Anti-Pattern 5: No Impact Analysis Before Deployment

**Problem**: Deploy rule, block 1,000 existing records, users angry

**Example**:
```
❌ Deploy rule immediately to production
```

**Solution**:
```
✅ Run impact analysis first
node scripts/lib/validation-rule-impact-analyzer.js \
  --org myOrg --object Opportunity --formula "[formula]"

If >5% violation rate:
1. Deploy as inactive
2. Notify users
3. Provide grace period for data cleanup
4. Rerun analysis
5. Activate rule
```

---

## Performance Optimization

### 1. Minimize Cross-Object Formula Fields

**Slow**:
```
Account.Parent.Parent.Industry = "Technology"
// 3-level relationship
```

**Faster**:
```
Account.Industry_Rolled_Up__c = "Technology"
// Denormalized field via workflow
```

**Why**: Each level adds query overhead

**Rule of Thumb**: Max 2 relationship levels in validation rules

---

### 2. Use OR Instead of Multiple Rules

**Slow** (3 separate rules):
```
Rule 1: ISBLANK(Phone)
Rule 2: ISBLANK(Email)
Rule 3: ISBLANK(Website)
```

**Faster** (1 combined rule):
```
AND(
  ISBLANK(Phone),
  ISBLANK(Email),
  ISBLANK(Website)
)
```

**Why**: One formula evaluation vs. three

**Exception**: If rules might be independently deactivated, keep separate

---

### 3. Short-Circuit Evaluation

**Inefficient**:
```
AND(
  complexCalculation,
  simpleCheck
)
```

**Optimized**:
```
AND(
  simpleCheck,
  complexCalculation
)
```

**Why**: AND stops at first FALSE, OR stops at first TRUE

**Tip**: Put cheapest/most-likely-to-fail conditions first

---

### 4. Limit Total Rules Per Object

**Problem**: 100+ validation rules = slow saves

**Guideline**:
- <20 rules: Excellent
- 20-50 rules: Good
- 50-100 rules: Review for consolidation
- >100 rules: Performance impact likely

**Consolidation Strategy**:
```
Instead of 10 rules checking required fields:

Rule 1: Field1 required when...
Rule 2: Field2 required when...
...
Rule 10: Field10 required when...

Combine into 2-3 rules by scenario:
Rule A: Required fields for Stage=Closed Won
Rule B: Required fields for Amount>$100K
Rule C: Required fields for RecordType=Enterprise
```

---

## Maintainability Guidelines

### 1. Naming Convention

**Format**: `{Verb}_{Subject}_{Condition}`

**Good Names**:
- `Require_Closed_Date_When_Won`
- `Validate_Discount_Threshold`
- `Prevent_Past_Date_Start`
- `Enforce_Parent_Industry`

**Bad Names**:
- `Rule1`
- `NewValidation`
- `Test`
- `DO_NOT_DELETE` (why not?)

---

### 2. Description Template

```
Business Requirement: [Why this rule exists]
Requested By: [Person/Team/Ticket]
Date Created: [YYYY-MM-DD]
Last Modified: [YYYY-MM-DD] - [What changed]
Policy Reference: [Sales Policy v2.3, page 15]
Threshold Values: [15% discount = policy max]
Exceptions: [None OR list documented exceptions]
Related Rules: [List related validation rules]
```

---

### 3. Version Control

**Store in Git**:
```
force-app/main/default/objects/
  Opportunity/
    validationRules/
      Require_Closed_Date_When_Won.validationRule-meta.xml
```

**Commit Message Format**:
```
feat(validation): Add Closed Date requirement for Closed Won

Business Requirement: Sales Policy v2.3 requires Closed Date
Impact Analysis: 12 records affected (0.22%)
Tested In: Sandbox (2025-11-20 to 2025-11-22)
Approved By: Jane Smith (CFO)
```

---

### 4. Regular Audits

**Quarterly Review**:
```bash
# List all validation rules
sf data query \
  --query "SELECT EntityDefinition.QualifiedApiName, ValidationName, Active, Description FROM ValidationRule ORDER BY EntityDefinition.QualifiedApiName" \
  --use-tooling-api > validation-rules-audit-$(date +%Y%m%d).csv

Review:
- ✅ Are descriptions current?
- ✅ Are inactive rules still needed?
- ✅ Can multiple rules be consolidated?
- ✅ Are all rules documented?
```

---

## Security Considerations

### 1. Profile-Based Bypass

**Use Case**: Admins need to bypass validation for bulk operations

**Implementation**:
```
AND(
  $Profile.Name != "System Administrator",
  $Profile.Name != "Data Integration",
  [validation logic]
)
```

**Warning**: Document clearly why admins can bypass

---

### 2. Sensitive Data Validation

**PII/PHI Requirements**:
```
AND(
  ISPICKVAL(Data_Classification__c, "Confidential"),
  ISBLANK(Encryption_Status__c)
)

Error: "Confidential data must be encrypted per Security Policy"
```

**Compliance**: Link to specific policy/regulation

---

### 3. Audit Trail Requirements

**Capture change reasons**:
```
AND(
  ISCHANGED(Status__c),
  ISPICKVAL(Status__c, "Cancelled"),
  ISBLANK(Cancellation_Reason__c)
)

Error: "Cancellation Reason required for audit compliance"
```

---

## Documentation Standards

### 1. Inline Comments (Formula)

**For Complex Logic**:
```
// Check if Enterprise opportunity exceeds credit limit
AND(
  // Enterprise opportunities only
  ISPICKVAL(RecordType.DeveloperName, "Enterprise"),

  // Amount exceeds limit
  NOT(ISBLANK(Account.Id)),
  NOT(ISNULL(Account.Credit_Limit__c)),
  Amount > Account.Credit_Limit__c
)
```

**Note**: Comments only visible in XML, not in UI formula builder

---

### 2. External Documentation

**Maintain Validation Rule Inventory**:

| Object | Rule Name | Purpose | Active | Last Modified | Owner |
|--------|-----------|---------|--------|---------------|-------|
| Opportunity | Require_Closed_Date | Data quality | Yes | 2025-11-15 | Sales Ops |
| Opportunity | Validate_Discount | Policy enforcement | Yes | 2025-10-01 | Finance |

**Update After Each Change**

---

### 3. User-Facing Documentation

**Knowledge Base Article**:
```
Title: "Why am I getting 'Closed Date Required' error?"

This validation rule ensures data quality by requiring Closed Date
when an Opportunity is marked as Closed Won or Closed Lost.

To resolve:
1. Enter the date the deal closed in the Close Date field
2. Save the record again

If you don't know the exact date, use your best estimate.

Questions? Contact Sales Operations.
```

---

## Quality Checklist

### Pre-Deployment Checklist

- [ ] Formula syntax valid
- [ ] All fields exist in object
- [ ] Picklist fields use TEXT()
- [ ] Parent relationships null-checked
- [ ] Complexity score <60
- [ ] Error message <255 characters, clear and actionable
- [ ] Impact analysis complete (<5% violation rate)
- [ ] Tested in sandbox with positive/negative cases
- [ ] Description complete with business requirement
- [ ] Naming convention followed
- [ ] Documentation updated
- [ ] Backup of existing rules taken
- [ ] Deployment strategy selected
- [ ] Users notified (if applicable)
- [ ] Monitoring plan in place

---

### Post-Deployment Checklist

- [ ] Rule deployed successfully
- [ ] Test record triggers rule as expected
- [ ] Error message displays correctly
- [ ] No unintended side effects observed
- [ ] Error frequency monitored (first 48 hours)
- [ ] Help desk tickets reviewed
- [ ] User feedback collected
- [ ] Adjustments made if needed
- [ ] Final documentation updated
- [ ] Marked complete in project tracker

---

## Quick Reference

### Formula Quality Metrics

| Metric | Excellent | Good | Needs Improvement |
|--------|-----------|------|-------------------|
| Complexity Score | 0-30 | 31-60 | >60 |
| Formula Length | <200 chars | 200-400 chars | >400 chars |
| Nesting Depth | 1-2 levels | 3-4 levels | >4 levels |
| Field Count | 1-4 fields | 5-8 fields | >8 fields |
| Cross-Object Refs | 0-1 | 2-3 | >3 |

### Common Formula Patterns

```
// Required field (conditional)
AND([condition], ISBLANK([field]))

// Data format
AND(NOT(ISBLANK([field])), [format_check])

// Threshold
AND([condition], [field] > [threshold])

// Date range
AND(NOT(ISNULL([date1])), NOT(ISNULL([date2])), [date2] < [date1])

// Cross-object
AND(NOT(ISBLANK([parent].Id)), [parent].[field] [condition])

// Profile check
AND($Profile.Name != "Admin", [logic])
```

### Anti-Pattern Quick Fixes

| Anti-Pattern | Quick Fix |
|--------------|-----------|
| `ISBLANK(Picklist__c)` | `TEXT(Picklist__c) = ""` |
| `Parent.Field` | `AND(NOT(ISBLANK(Parent.Id)), Parent.Field)` |
| `LEN(Field)` | `AND(NOT(ISBLANK(Field)), LEN(Field))` |
| Deep nesting | Use segmentation |
| No null check | Add null checks first |

---

## Next Steps

**Continue to Runbook 5**: [Testing and Deployment](./05-testing-and-deployment.md)

Learn comprehensive testing strategies and deployment best practices.

---

**Related Runbooks**:
- [Runbook 2: Designing for Scenarios](./02-designing-validation-rules-for-scenarios.md)
- [Runbook 7: Troubleshooting](./07-troubleshooting.md)
- [Runbook 8: Segmented Rule Building](./08-segmented-rule-building.md)

---

**Version History**:
- v1.0.0 (2025-11-23) - Initial release
