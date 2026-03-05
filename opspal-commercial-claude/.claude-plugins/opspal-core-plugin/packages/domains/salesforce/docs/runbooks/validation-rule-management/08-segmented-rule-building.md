# Runbook 8: Segmented Rule Building

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Administrators, Developers

---

## Table of Contents

1. [Introduction](#introduction)
2. [When to Segment](#when-to-segment)
3. [Segment Templates](#segment-templates)
4. [Segment Budget Management](#segment-budget-management)
5. [Building Segments Step-by-Step](#building-segments-step-by-step)
6. [Combining Segments](#combining-segments)
7. [Real-World Examples](#real-world-examples)
8. [Best Practices](#best-practices)
9. [Anti-Patterns in Segmentation](#anti-patterns-in-segmentation)
10. [Testing Segmented Rules](#testing-segmented-rules)
11. [Maintenance of Segmented Rules](#maintenance-of-segmented-rules)
12. [Quick Reference](#quick-reference)

---

## Introduction

This runbook provides comprehensive guidance on building complex validation rules using segmentation techniques. Segmentation breaks complex formulas into manageable, maintainable pieces.

### What is Segmentation?

**Segmentation** is the practice of breaking a single complex validation rule into multiple simpler rules, each handling a specific aspect of the validation.

**Without Segmentation** (873 characters, complexity score 75):
```javascript
AND(OR(AND(RecordType.DeveloperName="Enterprise",Amount>100000,ISPICKVAL(StageName,"Closed Won")),AND(RecordType.DeveloperName="SMB",Amount>50000,ISPICKVAL(StageName,"Closed Won"))),OR(ISBLANK(Executive_Sponsor__c),ISBLANK(Business_Case__c),ISBLANK(Legal_Review_Date__c)),NOT(ISBLANK(Account.Id)),Account.Type="Customer",NOT(ISBLANK(Account.Industry)))
```

**With Segmentation** (3 rules, avg 150 characters, avg complexity score 35):
```javascript
// Rule 1: Opportunity Criteria (150 chars, score 30)
AND(
  OR(
    AND(RecordType.DeveloperName="Enterprise", Amount>100000),
    AND(RecordType.DeveloperName="SMB", Amount>50000)
  ),
  ISPICKVAL(StageName, "Closed Won")
)

// Rule 2: Required Fields (120 chars, score 25)
AND(
  OR(
    ISBLANK(Executive_Sponsor__c),
    ISBLANK(Business_Case__c),
    ISBLANK(Legal_Review_Date__c)
  )
)

// Rule 3: Account Validation (100 chars, score 20)
AND(
  NOT(ISBLANK(Account.Id)),
  Account.Type = "Customer",
  NOT(ISBLANK(Account.Industry))
)
```

**Benefits**:
- ✅ **Maintainability**: Easier to understand and modify
- ✅ **Readability**: Clear separation of concerns
- ✅ **Performance**: Faster formula evaluation
- ✅ **Testing**: Simpler to test each segment independently
- ✅ **Debugging**: Easier to identify which rule is triggering

---

## When to Segment

### Complexity Threshold

**Use segmentation when**:

| Metric | Threshold | Action |
|--------|-----------|--------|
| **Complexity Score** | >60 | Segment into 2-3 rules |
| **Formula Length** | >400 chars | Segment into 2-3 rules |
| **Nesting Depth** | >4 levels | Segment into 2-3 rules |
| **Field Count** | >8 fields | Segment by concern |
| **Cross-Object Refs** | >3 references | Segment cross-object logic |

**Check complexity**:

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-complexity-calculator.js assess \
  --formula "AND(OR(...), NOT(...), Account.Field__c...)"

# Output:
# Complexity Score: 75 (Complex - Recommend Segmentation)
# Formula Length: 450 characters (Long)
# Nesting Depth: 5 levels (Deep)
# Recommendation: Break into 3 segments
```

### When NOT to Segment

**Keep as single rule when**:
- Complexity score <40
- Formula length <200 characters
- Logic is tightly coupled (cannot be separated)
- Segments would be trivial (<2 conditions each)

---

## Segment Templates

### Template 1: Trigger Context

**Purpose**: Define WHEN the rule should evaluate

**Budget**: 40 characters

**Pattern**:
```javascript
[RECORD_TYPE_CHECK] AND [STAGE_CHECK]
```

**Examples**:

```javascript
// Example 1: Enterprise Closed Won
AND(
  RecordType.DeveloperName = "Enterprise",
  ISPICKVAL(StageName, "Closed Won")
)

// Example 2: High-Value Opportunities
AND(
  Amount > 100000,
  ISPICKVAL(StageName, "Closed Won")
)

// Example 3: Specific User Types
AND(
  $Profile.Name != "System Administrator",
  ISPICKVAL(Type, "New Business")
)
```

**Best Practices**:
- ✅ Check record type first (cheapest operation)
- ✅ Check stage/status second
- ✅ Combine with AND (not OR)

---

### Template 2: Data Validation

**Purpose**: Check required fields and data formats

**Budget**: 80 characters

**Pattern**:
```javascript
OR(
  [FIELD1_BLANK_CHECK],
  [FIELD2_BLANK_CHECK],
  [FIELD3_FORMAT_CHECK]
)
```

**Examples**:

```javascript
// Example 1: Required Fields
OR(
  ISNULL(CloseDate),
  ISNULL(Amount),
  ISBLANK(Decision_Maker__c)
)

// Example 2: Data Format
OR(
  AND(NOT(ISBLANK(Email)), NOT(CONTAINS(Email, "@"))),
  AND(NOT(ISBLANK(Phone)), LEN(Phone) != 10)
)

// Example 3: Conditional Required
OR(
  AND(Amount > 50000, ISBLANK(Approval_Number__c)),
  AND(Amount > 100000, ISBLANK(Executive_Sponsor__c))
)
```

**Best Practices**:
- ✅ Use OR for "any field missing" logic
- ✅ Check null/blank before format validation
- ✅ Keep format checks simple

---

### Template 3: Business Logic

**Purpose**: Enforce business rules and thresholds

**Budget**: 120 characters

**Pattern**:
```javascript
[THRESHOLD_CHECK] OR [BUSINESS_RULE_CHECK] OR [CALCULATION_CHECK]
```

**Examples**:

```javascript
// Example 1: Discount Threshold
Discount_Percent__c > 0.15

// Example 2: Date Range Validation
AND(
  NOT(ISNULL(Start_Date__c)),
  NOT(ISNULL(End_Date__c)),
  End_Date__c < Start_Date__c
)

// Example 3: Calculated Field Validation
AND(
  NOT(ISNULL(Quantity)),
  NOT(ISNULL(Unit_Price__c)),
  Total_Price__c != (Quantity * Unit_Price__c)
)
```

**Best Practices**:
- ✅ Document threshold values in rule description
- ✅ Use simple comparisons
- ✅ Avoid complex calculations

---

### Template 4: Cross-Object Validation

**Purpose**: Validate against parent/related records

**Budget**: 100 characters

**Pattern**:
```javascript
AND(
  NOT(ISBLANK([PARENT].Id)),
  [PARENT].[FIELD_CHECK]
)
```

**Examples**:

```javascript
// Example 1: Account Industry Check
AND(
  NOT(ISBLANK(Account.Id)),
  Account.Industry = "Technology"
)

// Example 2: Parent Revenue Check
AND(
  NOT(ISBLANK(Account.Id)),
  NOT(ISNULL(Account.Annual_Revenue__c)),
  Account.Annual_Revenue__c > 1000000
)

// Example 3: Multi-Level Relationship
AND(
  NOT(ISBLANK(Account.Id)),
  NOT(ISBLANK(Account.Parent.Id)),
  Account.Parent.Type = "Customer"
)
```

**Best Practices**:
- ✅ **ALWAYS** null-check parent before accessing fields
- ✅ Null-check at each relationship level
- ✅ Keep to 2 relationship levels max

---

## Segment Budget Management

### Understanding Budget

Each segment has a **character budget** to keep formulas simple:

| Segment Type | Budget | Purpose |
|--------------|--------|---------|
| **Trigger Context** | 40 chars | When rule evaluates |
| **Data Validation** | 80 chars | Required fields |
| **Business Logic** | 120 chars | Thresholds, rules |
| **Cross-Object** | 100 chars | Parent validation |

**Total Budget**: 340 characters across all segments

### Budget Tracking

```javascript
// Example: Building Data Validation segment

// Budget: 80 characters

// Current: 25 characters (31% used)
OR(
  ISNULL(CloseDate)
)

// Add field: +20 characters (56% used)
OR(
  ISNULL(CloseDate),
  ISNULL(Amount)
)

// Add field: +25 characters (88% used)
OR(
  ISNULL(CloseDate),
  ISNULL(Amount),
  ISBLANK(Decision_Maker__c)
)

// ⚠️ Budget Warning: 88% used (recommend stop here)
```

### Budget Warnings

**Automated warnings**:

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-complexity-calculator.js assess \
  --formula "OR(ISNULL(Field1), ISNULL(Field2), ISNULL(Field3), ISNULL(Field4))" \
  --segment-type data-validation

# Output:
# Segment Type: Data Validation
# Budget: 80 characters
# Used: 72 characters (90%)
# Status: ⚠️ WARNING - Approaching limit
# Recommendation: Consider creating second rule if more fields needed
```

**Budget thresholds**:
- ✅ <60%: Healthy
- ⚠️ 60-80%: Caution (can add a few more conditions)
- ⚠️ 80-100%: Warning (approaching limit)
- ❌ >100%: Over budget (split into 2 segments)

---

## Building Segments Step-by-Step

### Step 1: Analyze Requirements

**Example Requirement**:
```
Validation Rule: Enterprise Opportunity Validation

Requirements:
1. Apply only to Enterprise record type
2. When Stage = "Closed Won"
3. Require: Close Date, Amount, Executive Sponsor
4. Amount must be > $100,000
5. Account must be Customer type
6. Account Industry must be populated
```

**Complexity Analysis**:
```bash
# Estimate complexity
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-complexity-calculator.js assess \
  --nl-requirements "Validation for Enterprise opportunities..." \
  --record-type Enterprise \
  --trigger-stage "Closed Won" \
  --required-fields "CloseDate,Amount,Executive_Sponsor__c" \
  --threshold-checks "Amount>100000" \
  --cross-object-checks "Account.Type,Account.Industry"

# Output:
# Estimated Complexity: 72 (Complex)
# Estimated Length: 420 characters
# Recommendation: Segment into 3 rules
# Suggested Segments:
#   1. Trigger Context (40 chars)
#   2. Required Fields + Threshold (150 chars)
#   3. Account Validation (90 chars)
```

---

### Step 2: Design Segments

**Segment 1: Trigger Context** (When to evaluate)

```javascript
// Name: Enterprise_Closed_Won_Trigger
// Purpose: Define when rule applies

AND(
  RecordType.DeveloperName = "Enterprise",
  ISPICKVAL(StageName, "Closed Won")
)

// Complexity: 20
// Length: 85 characters
// Status: ✅ Within budget (40 char budget for logic)
```

**Segment 2: Required Fields & Threshold** (What data to validate)

```javascript
// Name: Enterprise_Closed_Won_Required_Fields
// Purpose: Check required fields and amount threshold

OR(
  ISNULL(CloseDate),
  ISNULL(Amount),
  ISBLANK(Executive_Sponsor__c),
  Amount <= 100000
)

// Complexity: 25
// Length: 110 characters
// Status: ✅ Within budget (80+120 char budget)
```

**Segment 3: Account Validation** (Cross-object checks)

```javascript
// Name: Enterprise_Closed_Won_Account_Validation
// Purpose: Validate account requirements

AND(
  NOT(ISBLANK(Account.Id)),
  OR(
    Account.Type != "Customer",
    ISBLANK(Account.Industry)
  )
)

// Complexity: 27
// Length: 100 characters
// Status: ✅ Within budget (100 char budget)
```

---

### Step 3: Create Each Segment

**Using Salesforce UI**:

```
1. Setup → Object Manager → Opportunity → Validation Rules
2. Click "New"
3. Rule 1:
   - Name: Enterprise_Closed_Won_Trigger
   - Active: ✓
   - Description: "Trigger context for Enterprise Closed Won validation"
   - Formula: [paste Segment 1 formula]
   - Error Message: "Enterprise Closed Won opportunities require additional validation. Please ensure all fields are complete."
4. Save
5. Repeat for Rules 2 and 3
```

**Using Salesforce CLI**:

```bash
# Create segment files
cat > force-app/main/default/objects/Opportunity/validationRules/Enterprise_Closed_Won_Trigger.validationRule-meta.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<ValidationRule xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Enterprise_Closed_Won_Trigger</fullName>
    <active>true</active>
    <description>Segment 1: Trigger context for Enterprise Closed Won validation</description>
    <errorConditionFormula>AND(
  RecordType.DeveloperName = &quot;Enterprise&quot;,
  ISPICKVAL(StageName, &quot;Closed Won&quot;)
)</errorConditionFormula>
    <errorMessage>Enterprise Closed Won opportunities require additional validation.</errorMessage>
</ValidationRule>
EOF

# Deploy all segments
sf project deploy start \
  --metadata ValidationRule:Opportunity.Enterprise_Closed_Won_Trigger \
  --metadata ValidationRule:Opportunity.Enterprise_Closed_Won_Required_Fields \
  --metadata ValidationRule:Opportunity.Enterprise_Closed_Won_Account_Validation \
  --target-org production
```

---

## Combining Segments

### Logical Combination

**Segments evaluate independently but logically combine**:

```javascript
// Segment 1: Trigger Context
if (RecordType = Enterprise AND Stage = Closed Won) {
  // Segment 2: Required Fields
  if (CloseDate missing OR Amount missing OR ...) {
    ERROR: "Required fields missing"
  }

  // Segment 3: Account Validation
  if (Account.Type != Customer OR ...) {
    ERROR: "Account validation failed"
  }
}
```

**Evaluation Order**:

Salesforce evaluates validation rules in **alphabetical order** by ValidationName.

**Naming Convention for Segments**:

```
[Prefix]_[Context]_[SegmentType]

Examples:
- Enterprise_ClosedWon_01_Trigger
- Enterprise_ClosedWon_02_RequiredFields
- Enterprise_ClosedWon_03_Account

Benefits:
- ✅ Alphabetical order matches logical order
- ✅ Clear grouping of related segments
- ✅ Easy to identify segment purpose
```

---

## Real-World Examples

### Example 1: Quote Approval Validation

**Requirements**:
```
Validate quotes before approval:
1. Apply to Quote object
2. When Status = "Pending Approval"
3. Require: Expiration Date, Discount Reason (if discount >10%)
4. Total Price must match sum of line items
5. Account must have active contract
```

**Segmentation**:

**Segment 1: Trigger Context**

```javascript
// Rule: Quote_Approval_01_Trigger

ISPICKVAL(Status, "Pending Approval")

// Complexity: 15
// Purpose: Evaluate only when status = Pending Approval
```

**Segment 2: Required Fields**

```javascript
// Rule: Quote_Approval_02_Required_Fields

OR(
  ISNULL(ExpirationDate),
  AND(Discount > 0.10, ISBLANK(Discount_Reason__c))
)

// Complexity: 20
// Purpose: Require expiration date, discount reason if discount >10%
```

**Segment 3: Line Item Validation**

```javascript
// Rule: Quote_Approval_03_LineItems

AND(
  Total_Line_Items__c > 0,
  TotalPrice != Total_Line_Items__c
)

// Complexity: 18
// Purpose: Ensure total price matches line items
```

**Segment 4: Account Validation**

```javascript
// Rule: Quote_Approval_04_Account

AND(
  NOT(ISBLANK(Account.Id)),
  NOT(Account.Has_Active_Contract__c)
)

// Complexity: 22
// Purpose: Require active contract on account
```

**Total Complexity**: 75 (would be complex as single rule)
**Segmented Complexity**: Avg 19 per segment (simple)

---

### Example 2: Case Escalation Validation

**Requirements**:
```
Validate cases before escalation:
1. Apply to Case object
2. When Status changes to "Escalated"
3. Require: Escalation Reason, Manager Approval
4. Priority must be High or Critical
5. Case Age must be >2 days
6. Account must be Premier support tier
```

**Segmentation**:

**Segment 1: Trigger Context**

```javascript
// Rule: Case_Escalation_01_Trigger

AND(
  ISCHANGED(Status),
  ISPICKVAL(Status, "Escalated")
)

// Complexity: 18
// Purpose: Only evaluate when status changes to Escalated
```

**Segment 2: Required Fields**

```javascript
// Rule: Case_Escalation_02_Required_Fields

OR(
  ISBLANK(Escalation_Reason__c),
  ISBLANK(Manager_Approval__c)
)

// Complexity: 15
// Purpose: Require escalation reason and approval
```

**Segment 3: Case Criteria**

```javascript
// Rule: Case_Escalation_03_Criteria

OR(
  NOT(OR(
    ISPICKVAL(Priority, "High"),
    ISPICKVAL(Priority, "Critical")
  )),
  (TODAY() - DATEVALUE(CreatedDate)) < 2
)

// Complexity: 32
// Purpose: Require High/Critical priority and >2 days old
```

**Segment 4: Account Validation**

```javascript
// Rule: Case_Escalation_04_Account

AND(
  NOT(ISBLANK(Account.Id)),
  TEXT(Account.Support_Tier__c) != "Premier"
)

// Complexity: 20
// Purpose: Require Premier support tier
```

**Total Complexity**: 85 (complex as single rule)
**Segmented Complexity**: Avg 21 per segment (simple)

---

## Best Practices

### 1. Naming Convention

**Format**: `[Object]_[Context]_[NN]_[SegmentType]`

**Examples**:
```
✅ GOOD:
- Opportunity_ClosedWon_01_Trigger
- Opportunity_ClosedWon_02_RequiredFields
- Opportunity_ClosedWon_03_Account

❌ BAD:
- Opp_Val_1
- My_Rule_Trigger
- Validation_Rule_2
```

**Benefits**:
- Clear alphabetical grouping
- Easy to identify related segments
- Segment purpose obvious from name

---

### 2. Error Messages

**Different strategies for segmented rules**:

**Strategy 1: Specific Error Messages (Recommended)**

```javascript
// Segment 1: Trigger Context
Error: "This validation applies to Enterprise Closed Won opportunities."

// Segment 2: Required Fields
Error: "Required fields missing: Close Date, Amount, Executive Sponsor."

// Segment 3: Account Validation
Error: "Account must be Customer type with Industry populated."
```

**Benefits**:
- ✅ User knows exactly which segment failed
- ✅ Clear action to fix

**Strategy 2: Generic Error Message**

```javascript
// All segments
Error: "Please complete all required fields for Enterprise Closed Won opportunities."
```

**Benefits**:
- ✅ Consistent user experience
- ❌ Less specific guidance

**Recommendation**: Use specific error messages for better user experience

---

### 3. Documentation

**Document segment relationships**:

```markdown
## Validation Rule Set: Enterprise Closed Won

### Purpose
Validate Enterprise opportunities before marking as Closed Won

### Segments

#### 1. Enterprise_ClosedWon_01_Trigger
- **Purpose**: Define when validation applies
- **Formula**: RecordType check + Stage check
- **Complexity**: 20

#### 2. Enterprise_ClosedWon_02_RequiredFields
- **Purpose**: Check required fields and threshold
- **Formula**: Close Date, Amount, Executive Sponsor + Amount >$100K
- **Complexity**: 25

#### 3. Enterprise_ClosedWon_03_Account
- **Purpose**: Validate account requirements
- **Formula**: Account Type = Customer, Industry populated
- **Complexity**: 27

### Total Complexity
- **Before Segmentation**: 72 (Complex)
- **After Segmentation**: Avg 24 (Simple)
- **Improvement**: 67% reduction

### Dependencies
- None (segments are independent)

### Related Rules
- SMB_ClosedWon_* (similar pattern for SMB record type)
```

---

### 4. Version Control

**Track segmented rules together**:

```bash
# Git commit message
git add force-app/main/default/objects/Opportunity/validationRules/Enterprise_ClosedWon_*
git commit -m "feat: Add Enterprise Closed Won validation (3 segments)

Business Requirement: Validate Enterprise opportunities per Sales Policy v2.3

Segments:
- 01_Trigger: RecordType + Stage check (complexity 20)
- 02_RequiredFields: Required fields + threshold (complexity 25)
- 03_Account: Account validation (complexity 27)

Total complexity reduced from 72 to avg 24 per segment (67% improvement)

Impact Analysis: 12 records affected (0.22%)
Tested In: Sandbox (2025-11-20 to 2025-11-22)
Approved By: Jane Smith (CFO)"
```

---

## Anti-Patterns in Segmentation

### Anti-Pattern 1: Over-Segmentation

**Problem**: Breaking rule into too many trivial segments

```javascript
// ❌ BAD: 5 segments for simple logic
// Segment 1
ISNULL(CloseDate)

// Segment 2
ISNULL(Amount)

// Segment 3
Amount > 100000

// Segment 4
NOT(ISBLANK(Account.Id))

// Segment 5
Account.Type = "Customer"

// Problem: 5 rules for simple validation (complexity 8 each)
```

**Solution**: Combine related conditions

```javascript
// ✅ GOOD: 2 segments for simple logic
// Segment 1: Required Fields + Threshold
OR(
  ISNULL(CloseDate),
  ISNULL(Amount),
  Amount <= 100000
)

// Segment 2: Account Validation
AND(
  NOT(ISBLANK(Account.Id)),
  Account.Type != "Customer"
)

// Result: 2 rules (complexity 15 each)
```

**Rule of Thumb**: Don't segment unless complexity >60 or length >400 chars

---

### Anti-Pattern 2: Segment Dependency

**Problem**: Segments depend on execution order

```javascript
// ❌ BAD: Segment 2 assumes Segment 1 passed
// Segment 1: Check Account exists
NOT(ISBLANK(Account.Id))

// Segment 2: Check Account.Industry (ASSUMES Account exists!)
ISBLANK(Account.Industry)  // Null pointer if Account is null!

// Problem: Segment 2 causes error if Segment 1 fails
```

**Solution**: Make segments independent

```javascript
// ✅ GOOD: Each segment null-checks independently
// Segment 1: Check Account exists
NOT(ISBLANK(Account.Id))

// Segment 2: Check Account.Industry (NULL-CHECKS first)
AND(
  NOT(ISBLANK(Account.Id)),
  ISBLANK(Account.Industry)
)

// Result: Segments are independent
```

---

### Anti-Pattern 3: Inconsistent Naming

**Problem**: Related segments have unrelated names

```javascript
// ❌ BAD: No clear relationship
// Rule 1: Opp_Validation
// Rule 2: Check_Fields
// Rule 3: My_Rule_v2

// Problem: Cannot identify related segments
```

**Solution**: Use consistent naming

```javascript
// ✅ GOOD: Clear relationship
// Rule 1: Opportunity_ClosedWon_01_Trigger
// Rule 2: Opportunity_ClosedWon_02_RequiredFields
// Rule 3: Opportunity_ClosedWon_03_Account

// Benefit: Alphabetical order + clear grouping
```

---

## Testing Segmented Rules

### Test Each Segment Independently

**Test Plan Template**:

```markdown
## Test Plan: Enterprise Closed Won Validation

### Segment 1: Trigger Context

**Test Case 1.1**: Should NOT trigger for SMB record type
- RecordType: SMB
- Stage: Closed Won
- Expected: No validation error

**Test Case 1.2**: Should trigger for Enterprise + Closed Won
- RecordType: Enterprise
- Stage: Closed Won
- Expected: Validation error (if Segment 2 or 3 fails)

### Segment 2: Required Fields

**Test Case 2.1**: Should fail if Close Date missing
- Close Date: NULL
- Amount: 150000
- Executive Sponsor: "John Smith"
- Expected: Validation error

**Test Case 2.2**: Should fail if Amount <=$100K
- Close Date: Today
- Amount: 100000
- Executive Sponsor: "John Smith"
- Expected: Validation error

### Segment 3: Account Validation

**Test Case 3.1**: Should fail if Account Type != Customer
- Account.Type: "Prospect"
- Account.Industry: "Technology"
- Expected: Validation error

### Integration Test

**Test Case INT.1**: All segments pass
- RecordType: Enterprise
- Stage: Closed Won
- Close Date: Today
- Amount: 150000
- Executive Sponsor: "John Smith"
- Account.Type: "Customer"
- Account.Industry: "Technology"
- Expected: Record saves successfully
```

---

### Test Segment Interactions

**Verify segments don't conflict**:

```bash
# Test all segments active
1. Deploy all 3 segments (active)
2. Test with various inputs
3. Verify each segment triggers independently

# Test segment deactivation
1. Deactivate Segment 1 (trigger context)
2. Verify Segments 2 and 3 don't trigger (no errors on SMB opportunities)
3. Reactivate Segment 1
```

---

## Maintenance of Segmented Rules

### Update Process

**When updating segmented rules**:

1. **Identify which segment(s) need changes**

```
Requirement Change: Increase amount threshold from $100K to $150K

Affected Segment: Enterprise_ClosedWon_02_RequiredFields
```

2. **Update only affected segment(s)**

```javascript
// OLD Formula
OR(
  ISNULL(CloseDate),
  ISNULL(Amount),
  ISBLANK(Executive_Sponsor__c),
  Amount <= 100000  // Old threshold
)

// NEW Formula
OR(
  ISNULL(CloseDate),
  ISNULL(Amount),
  ISBLANK(Executive_Sponsor__c),
  Amount <= 150000  // New threshold
)
```

3. **Test affected segment**

```bash
# Run impact analysis
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-impact-analyzer.js \
  --org production \
  --object Opportunity \
  --formula "Amount <= 150000"

# Result: 18 additional records affected (was 12, now 30)
```

4. **Deploy change**

```bash
sf project deploy start \
  --metadata ValidationRule:Opportunity.Enterprise_ClosedWon_02_RequiredFields \
  --target-org production
```

5. **Document change**

```markdown
## Change Log: Enterprise_ClosedWon_02_RequiredFields

### 2025-11-25 - Amount Threshold Increase
- Changed: Amount threshold $100K → $150K
- Reason: Sales Policy v2.4 update
- Impact: 18 additional records affected
- Approved By: Jane Smith (CFO)
- Other Segments: No changes needed
```

---

### Consolidation Review

**Quarterly review**: Can segments be consolidated?

**Example Review**:

```markdown
## Q4 2025 Segment Review: Enterprise Closed Won

### Current State
- 3 segments
- Avg complexity: 24
- Total rules on Opportunity: 15

### Consolidation Analysis
Can we combine Segments 2 + 3?

**Combined Formula**:
```javascript
OR(
  ISNULL(CloseDate),
  ISNULL(Amount),
  ISBLANK(Executive_Sponsor__c),
  Amount <= 150000,
  AND(
    NOT(ISBLANK(Account.Id)),
    OR(
      Account.Type != "Customer",
      ISBLANK(Account.Industry)
    )
  )
)
```

**Combined Complexity**: 45 (still acceptable)
**Combined Length**: 210 characters (acceptable)

**Decision**: Keep separate for maintainability
**Reason**: Segments have distinct purposes (fields vs account)
**Next Review**: Q1 2026
```

---

## Quick Reference

### Segmentation Decision Tree

```
Is formula complex?
├─ Complexity >60? → YES → Segment
├─ Length >400 chars? → YES → Segment
├─ Nesting >4 levels? → YES → Segment
├─ Fields >8? → YES → Segment by concern
└─ Otherwise → NO → Keep as single rule

If segmenting:
1. Identify segment types (trigger, data, logic, cross-object)
2. Design each segment independently
3. Name consistently ([Object]_[Context]_[NN]_[Type])
4. Test each segment independently
5. Document relationships
```

### Segment Template Quick Reference

| Template | Budget | Purpose | Example |
|----------|--------|---------|---------|
| **Trigger Context** | 40 chars | When to evaluate | RecordType + Stage check |
| **Data Validation** | 80 chars | Required fields | OR(field1, field2, field3) |
| **Business Logic** | 120 chars | Thresholds, rules | Amount > threshold |
| **Cross-Object** | 100 chars | Parent validation | Account.Field check |

### Segment Naming Pattern

```
[Object]_[Context]_[NN]_[Type]

Examples:
Opportunity_ClosedWon_01_Trigger
Opportunity_ClosedWon_02_RequiredFields
Opportunity_ClosedWon_03_Account

Quote_Approval_01_Trigger
Quote_Approval_02_RequiredFields
Quote_Approval_03_LineItems
Quote_Approval_04_Account
```

### Common Segment Patterns

**Pattern 1: Record Type + Stage**

```javascript
AND(
  RecordType.DeveloperName = "[RecordType]",
  ISPICKVAL(StageName, "[Stage]")
)
```

**Pattern 2: Required Fields**

```javascript
OR(
  ISNULL([Field1]),
  ISNULL([Field2]),
  ISBLANK([Field3])
)
```

**Pattern 3: Threshold Check**

```javascript
[Field] > [Threshold]
```

**Pattern 4: Account Validation**

```javascript
AND(
  NOT(ISBLANK(Account.Id)),
  Account.[Field] [Operator] [Value]
)
```

---

## Conclusion

Segmentation is a powerful technique for managing complex validation rules. By breaking complex formulas into manageable segments, you improve maintainability, readability, and performance.

**Key Takeaways**:
- ✅ Segment when complexity >60, length >400 chars, or nesting >4 levels
- ✅ Use 4 segment templates: Trigger, Data, Logic, Cross-Object
- ✅ Keep segments within budget (40-120 chars per segment)
- ✅ Name segments consistently for easy identification
- ✅ Test each segment independently
- ✅ Document segment relationships
- ✅ Review quarterly for consolidation opportunities

**Tools**:
- `validation-rule-complexity-calculator.js` - Calculate complexity
- `validation-rule-segmentation-specialist` agent - Design segments
- `validation-rule-orchestrator` agent - Manage segmented rules

---

**Related Runbooks**:
- [Runbook 2: Designing for Scenarios](./02-designing-validation-rules-for-scenarios.md)
- [Runbook 4: Validation and Best Practices](./04-validation-and-best-practices.md)
- [Runbook 7: Troubleshooting](./07-troubleshooting.md)

---

**Version History**:
- v1.0.0 (2025-11-23) - Initial release
