# Runbook 2: Designing Validation Rules for Scenarios

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Administrators, Business Analysts, Developers

---

## Table of Contents

1. [Introduction](#introduction)
2. [Pattern 1: Required Field Validation](#pattern-1-required-field-validation)
3. [Pattern 2: Data Format Validation](#pattern-2-data-format-validation)
4. [Pattern 3: Business Logic Validation](#pattern-3-business-logic-validation)
5. [Pattern 4: Cross-Object Validation](#pattern-4-cross-object-validation)
6. [Pattern 5: Date/Time Validation](#pattern-5-datetime-validation)
7. [Pattern 6: Security/Compliance Validation](#pattern-6-securitycompliance-validation)
8. [Pattern Selection Guide](#pattern-selection-guide)
9. [Combining Patterns](#combining-patterns)
10. [Quick Reference](#quick-reference)

---

## Introduction

This runbook provides 6 proven validation rule patterns for common business scenarios. Each pattern includes:

- **Business requirement template**
- **Formula template** (copy-paste ready)
- **Error message template**
- **Variations** for different use cases
- **Common pitfalls** to avoid

### How to Use This Runbook

1. **Identify your scenario** - Match your requirement to a pattern
2. **Copy the template** - Start with the provided formula
3. **Customize** - Replace field names and values
4. **Test** - Verify in sandbox before production
5. **Document** - Use the description template

### Pattern Overview

| Pattern | Use Case | Complexity | Example |
|---------|----------|------------|---------|
| Required Field | Conditional required fields | Simple | "Closed Date required when Stage = Closed Won" |
| Data Format | Format/length validation | Simple-Medium | "Phone must be 10 digits" |
| Business Logic | Thresholds, policies | Medium | "Discount ≤15% without approval" |
| Cross-Object | Parent/child validation | Medium-Complex | "Opp Amount ≤ Account Credit Limit" |
| Date/Time | Date ranges, sequences | Simple-Medium | "End Date after Start Date" |
| Security/Compliance | Access controls, audit | Medium-Complex | "SSN required for citizens only" |

---

## Pattern 1: Required Field Validation

### Overview

Enforce that a field must be populated when specific conditions are met. More flexible than field-level required settings.

### Core Template

```
AND(
  [TRIGGER_CONDITION],
  ISBLANK([REQUIRED_FIELD])
)
```

**Error Message Template**:
```
[FIELD_LABEL] is required when [CONDITION]. Please enter [FIELD_LABEL].
```

---

### Variation 1.1: Stage-Dependent Required Field

**Business Requirement**: "Closed Date is required when Opportunity Stage is Closed Won or Closed Lost"

**Formula**:
```
AND(
  OR(
    ISPICKVAL(StageName, "Closed Won"),
    ISPICKVAL(StageName, "Closed Lost")
  ),
  ISBLANK(CloseDate)
)
```

**Error Message**:
```
Closed Date is required when Stage is Closed Won or Closed Lost. Please enter the date the opportunity closed.
```

**Error Location**: CloseDate field

**Customization Notes**:
- Replace `StageName` with your stage field API name
- Add more stage values to the OR condition as needed
- Adjust error message to match your business terminology

---

### Variation 1.2: Record Type-Dependent Required Field

**Business Requirement**: "Executive Sponsor is required for Enterprise opportunities only"

**Formula**:
```
AND(
  ISPICKVAL(RecordType.DeveloperName, "Enterprise"),
  ISBLANK(Executive_Sponsor__c)
)
```

**Error Message**:
```
Executive Sponsor is required for Enterprise opportunities. Please enter Executive Sponsor.
```

**Error Location**: Executive_Sponsor__c field

**Customization Notes**:
- Use `RecordType.DeveloperName` (not Name) for API consistency
- Use `RecordType.Name` if you prefer display name
- Can combine with other conditions using AND

---

### Variation 1.3: Amount Threshold-Dependent Required Field

**Business Requirement**: "VP Approval is required when Discount exceeds 15%"

**Formula**:
```
AND(
  Discount_Percent__c > 0.15,
  ISBLANK(VP_Approval__c)
)
```

**Error Message**:
```
VP Approval is required when Discount Percent exceeds 15%. Current discount: {!Discount_Percent__c}%. Please obtain VP approval.
```

**Error Location**: VP_Approval__c field

**Field Merge Example**: `{!Discount_Percent__c}` shows current value in error

---

### Variation 1.4: Multiple Fields Required (Any Blank)

**Business Requirement**: "At least one contact method (Phone, Email, or Website) is required"

**Formula**:
```
AND(
  ISBLANK(Phone),
  ISBLANK(Email),
  ISBLANK(Website)
)
```

**Error Message**:
```
At least one contact method is required. Please enter Phone, Email, or Website.
```

**Error Location**: Top of page (affects multiple fields)

**Customization Notes**:
- Use AND when ALL fields are blank = error
- Use OR when ANY field is blank = error
- Top of page location is best for multi-field errors

---

### Variation 1.5: Profile-Dependent Required Field

**Business Requirement**: "Loss Reason is required when Sales Reps mark opportunities as Closed Lost"

**Formula**:
```
AND(
  $Profile.Name = "Sales User",
  ISPICKVAL(StageName, "Closed Lost"),
  TEXT(Loss_Reason__c) = ""
)
```

**Error Message**:
```
Loss Reason is required when marking opportunities as Closed Lost. Please select a Loss Reason from the dropdown.
```

**Error Location**: Loss_Reason__c field

**Profile Check**: `$Profile.Name` checks current user's profile

---

### Common Pitfalls - Required Fields

❌ **Using ISBLANK on picklist fields**:
```
ISBLANK(Status__c)  // Doesn't work!
```
✅ **Correct**:
```
TEXT(Status__c) = ""  // Works!
```

❌ **Not checking for null parent before requiring child**:
```
AND(
  Account.Industry = "Technology",
  ISBLANK(Product_Interest__c)
)
// Fails if Account is null
```
✅ **Correct**:
```
AND(
  NOT(ISBLANK(Account.Id)),
  Account.Industry = "Technology",
  ISBLANK(Product_Interest__c)
)
```

---

## Pattern 2: Data Format Validation

### Overview

Ensure data is entered in the correct format, length, or pattern. Maintains data consistency across the organization.

### Core Template

```
AND(
  NOT(ISBLANK([FIELD])),
  [FORMAT_CHECK_CONDITION]
)
```

**Error Message Template**:
```
[FIELD_LABEL] must be in format [FORMAT]. Please update [FIELD_LABEL] to match the required format.
```

---

### Variation 2.1: Fixed-Length Validation

**Business Requirement**: "Phone number must be exactly 10 digits"

**Formula**:
```
AND(
  NOT(ISBLANK(Phone)),
  LEN(Phone) != 10
)
```

**Error Message**:
```
Phone must be exactly 10 digits. Please enter phone number without spaces or special characters (e.g., 5551234567).
```

**Error Location**: Phone field

**Customization Notes**:
- `LEN()` counts characters
- Use `!=` for exact length
- Use `<` or `>` for min/max length

---

### Variation 2.2: Prefix/Suffix Validation

**Business Requirement**: "External Account Numbers must start with 'EXT-'"

**Formula**:
```
AND(
  NOT(ISBLANK(Account_Number__c)),
  NOT(BEGINS(Account_Number__c, "EXT-"))
)
```

**Error Message**:
```
External Account Numbers must start with 'EXT-'. Please update Account Number to begin with 'EXT-' (e.g., EXT-12345).
```

**Error Location**: Account_Number__c field

**Functions**:
- `BEGINS(text, prefix)` - Check prefix
- `ENDS(text, suffix)` - Check suffix (if available)
- Use `NOT(BEGINS(...))` to enforce prefix

---

### Variation 2.3: Pattern Matching (Contains)

**Business Requirement**: "Email addresses must contain '@' symbol"

**Formula**:
```
AND(
  NOT(ISBLANK(Email)),
  NOT(CONTAINS(Email, "@"))
)
```

**Error Message**:
```
Email must be a valid email address. Please enter email in format: name@company.com
```

**Error Location**: Email field

**Note**: Salesforce auto-validates Email field type, but this is useful for custom text fields

---

### Variation 2.4: Numeric Range Validation

**Business Requirement**: "Employee Count must be between 1 and 10,000"

**Formula**:
```
AND(
  NOT(ISNULL(NumberOfEmployees)),
  OR(
    NumberOfEmployees < 1,
    NumberOfEmployees > 10000
  )
)
```

**Error Message**:
```
Employee Count must be between 1 and 10,000. Current value: {!NumberOfEmployees}. Please enter a valid employee count.
```

**Error Location**: NumberOfEmployees field

**Customization Notes**:
- Use `OR` for "outside range" (too low OR too high)
- Use `AND` for "inside range" (if needed)
- `ISNULL()` for number/date fields, `ISBLANK()` for text

---

### Variation 2.5: Alphanumeric Pattern

**Business Requirement**: "SKU must be 3 letters followed by 4 numbers (e.g., ABC1234)"

**Formula**:
```
AND(
  NOT(ISBLANK(SKU__c)),
  OR(
    LEN(SKU__c) != 7,
    NOT(ISALPHA(LEFT(SKU__c, 3))),
    NOT(ISNUMBER(RIGHT(SKU__c, 4)))
  )
)
```

**Error Message**:
```
SKU must be 3 letters followed by 4 numbers (e.g., ABC1234). Please update SKU to match this format.
```

**Error Location**: SKU__c field

**Functions**:
- `LEFT(text, n)` - Get first n characters
- `RIGHT(text, n)` - Get last n characters
- `ISALPHA(text)` - Check if all letters (if available)
- `ISNUMBER(text)` - Check if all numbers

---

### Common Pitfalls - Data Format

❌ **Not checking if field is blank first**:
```
LEN(Phone) != 10
// Error if Phone is null
```
✅ **Correct**:
```
AND(
  NOT(ISBLANK(Phone)),
  LEN(Phone) != 10
)
```

❌ **Case-sensitive pattern matching**:
```
BEGINS(SKU__c, "ABC")
// Doesn't match "abc"
```
✅ **Better** (if case-insensitive needed):
```
BEGINS(UPPER(SKU__c), "ABC")
```

---

## Pattern 3: Business Logic Validation

### Overview

Enforce business rules, policies, and thresholds. These rules typically involve multiple fields and conditional logic.

### Core Template

```
AND(
  [SCOPE_CONDITION],
  [POLICY_VIOLATION]
)
```

**Error Message Template**:
```
[POLICY_STATEMENT]. [CURRENT_STATE]. [REQUIRED_ACTION].
```

---

### Variation 3.1: Discount Policy Enforcement

**Business Requirement**: "Discount cannot exceed 15% unless Executive Approval is obtained"

**Formula**:
```
AND(
  Discount_Percent__c > 0.15,
  ISBLANK(Executive_Approval__c)
)
```

**Error Message**:
```
Discount cannot exceed 15% without Executive Approval. Current discount: {!Discount_Percent__c}%. Please obtain approval or reduce discount.
```

**Error Location**: Discount_Percent__c field

**Policy Enforcement**: Blocks save until approval is documented

---

### Variation 3.2: Staged Approval Requirements

**Business Requirement**: "Opportunities over $100K require VP approval before Closed Won"

**Formula**:
```
AND(
  Amount > 100000,
  ISPICKVAL(StageName, "Closed Won"),
  ISBLANK(VP_Approval_Date__c)
)
```

**Error Message**:
```
Opportunities over $100,000 require VP approval before closing. Opportunity Amount: {!Amount}. Please obtain VP approval.
```

**Error Location**: VP_Approval_Date__c field

**Amount Threshold**: Adjust `100000` to your organization's policy

---

### Variation 3.3: Inventory Availability Check

**Business Requirement**: "Quote Line Quantity cannot exceed Product Available Inventory"

**Prerequisites**: Available_Inventory__c field on Product object

**Formula**:
```
AND(
  NOT(ISBLANK(Product__c)),
  NOT(ISNULL(Product__r.Available_Inventory__c)),
  Quantity__c > Product__r.Available_Inventory__c
)
```

**Error Message**:
```
Quantity cannot exceed available inventory. Available: {!Product__r.Available_Inventory__c}. Requested: {!Quantity__c}. Please reduce quantity.
```

**Error Location**: Quantity__c field

**Cross-Object Formula**: References parent Product record

---

### Variation 3.4: Tiered Pricing Validation

**Business Requirement**: "Enterprise customers must have discount ≥10%, Standard customers ≤5%"

**Formula**:
```
OR(
  AND(
    ISPICKVAL(Account.Type, "Enterprise"),
    Discount_Percent__c < 0.10
  ),
  AND(
    ISPICKVAL(Account.Type, "Standard"),
    Discount_Percent__c > 0.05
  )
)
```

**Error Message**:
```
Discount does not match customer tier requirements. Enterprise customers must have ≥10% discount, Standard customers ≤5%. Customer Type: {!Account.Type}. Current Discount: {!Discount_Percent__c}%.
```

**Error Location**: Discount_Percent__c field

**Tier Logic**: Different rules for different customer types

---

### Variation 3.5: Stage Progression Rules

**Business Requirement**: "Cannot move to Negotiation stage without completing Discovery"

**Prerequisites**: Discovery_Complete__c checkbox field

**Formula**:
```
AND(
  ISPICKVAL(StageName, "Negotiation"),
  NOT(Discovery_Complete__c)
)
```

**Error Message**:
```
Discovery must be completed before moving to Negotiation stage. Please complete Discovery activities or return to earlier stage.
```

**Error Location**: StageName field

**Stage Gate**: Enforces stage progression requirements

---

### Common Pitfalls - Business Logic

❌ **Hardcoded values without documentation**:
```
Discount_Percent__c > 0.15
// What is 0.15? Why this threshold?
```
✅ **Better** (document in rule description):
```
Discount_Percent__c > 0.15
// Description: "Max discount 15% per Sales Policy v2.3"
```

❌ **Complex nested logic without segmentation**:
```
AND(OR(AND(A, B), AND(C, D)), OR(E, F), NOT(OR(G, H)))
// Hard to understand and maintain
```
✅ **Better** (use segmentation):
```
// Segment into logical pieces via validation-rule-segmentation-specialist
```

---

## Pattern 4: Cross-Object Validation

### Overview

Validate data based on related parent or child objects. Requires careful null checking to avoid runtime errors.

### Core Template

```
AND(
  NOT(ISBLANK([PARENT_RELATIONSHIP].Id)),
  [PARENT_FIELD_CONDITION]
)
```

**Error Message Template**:
```
[VALIDATION_REQUIREMENT] based on [PARENT_OBJECT]. [PARENT_VALUE]. [REQUIRED_ACTION].
```

**Critical**: ALWAYS check parent relationship is not null first!

---

### Variation 4.1: Parent Field Required

**Business Requirement**: "Industry is required on parent Account when Opportunity Type is New Business"

**Formula**:
```
AND(
  NOT(ISBLANK(Account.Id)),
  ISPICKVAL(Type, "New Business"),
  TEXT(Account.Industry) = ""
)
```

**Error Message**:
```
Parent Account must have Industry populated for New Business opportunities. Please update Account Industry or change Opportunity Type.
```

**Error Location**: Top of page (can't edit parent field from child)

**Null Check**: `NOT(ISBLANK(Account.Id))` prevents error if Account is null

---

### Variation 4.2: Parent-Child Relationship Rule

**Business Requirement**: "Opportunity Amount cannot exceed parent Account Credit Limit"

**Prerequisites**: Credit_Limit__c field on Account

**Formula**:
```
AND(
  NOT(ISBLANK(Account.Id)),
  NOT(ISNULL(Account.Credit_Limit__c)),
  Amount > Account.Credit_Limit__c
)
```

**Error Message**:
```
Opportunity Amount cannot exceed Account Credit Limit. Credit Limit: ${!Account.Credit_Limit__c}. Amount: ${!Amount}. Please reduce Amount or request credit increase.
```

**Error Location**: Amount field

**Two Null Checks**: Account relationship AND Credit_Limit field

---

### Variation 4.3: Multi-Level Relationship

**Business Requirement**: "Cannot create Contact for Partner Account's without Partner Agreement"

**Formula**:
```
AND(
  NOT(ISBLANK(Account.Id)),
  ISPICKVAL(Account.Type, "Partner"),
  NOT(ISBLANK(Account.Parent.Id)),
  NOT(Account.Parent.Partner_Agreement_Signed__c)
)
```

**Error Message**:
```
Cannot create Contacts for Partner Accounts without signed Partner Agreement. Please ensure Partner Agreement is signed.
```

**Error Location**: Top of page

**Multi-Level**: Account → Parent Account → Partner_Agreement_Signed__c

---

### Variation 4.4: Lookup Filter Enforcement

**Business Requirement**: "Quote Product must match parent Account's Industry"

**Prerequisites**: Industry__c field on Product object

**Formula**:
```
AND(
  NOT(ISBLANK(Account.Id)),
  NOT(ISBLANK(Product__c)),
  Product__r.Industry__c != Account.Industry
)
```

**Error Message**:
```
Product Industry must match Account Industry. Account Industry: {!Account.Industry}. Product Industry: {!Product__r.Industry__c}. Please select a matching product.
```

**Error Location**: Product__c field

**Cross-Reference**: Compares two parent objects (Account and Product)

---

### Variation 4.5: Record Type Inheritance

**Business Requirement**: "Contact Record Type must match parent Account Record Type"

**Formula**:
```
AND(
  NOT(ISBLANK(Account.Id)),
  RecordType.DeveloperName != Account.RecordType.DeveloperName
)
```

**Error Message**:
```
Contact Record Type must match parent Account Record Type. Account Record Type: {!Account.RecordType.Name}. Please change Contact Record Type or Account Record Type.
```

**Error Location**: RecordTypeId field (not directly editable, shows at top)

**Record Type Matching**: Ensures child inherits parent's record type

---

### Common Pitfalls - Cross-Object

❌ **Missing parent null check**:
```
Account.Industry = "Technology"
// Fails if Account is null
```
✅ **Correct**:
```
AND(
  NOT(ISBLANK(Account.Id)),
  Account.Industry = "Technology"
)
```

❌ **Not checking parent field is not null**:
```
AND(
  NOT(ISBLANK(Account.Id)),
  Account.Credit_Limit__c > 100000
)
// Fails if Credit_Limit__c is null
```
✅ **Correct**:
```
AND(
  NOT(ISBLANK(Account.Id)),
  NOT(ISNULL(Account.Credit_Limit__c)),
  Account.Credit_Limit__c > 100000
)
```

---

## Pattern 5: Date/Time Validation

### Overview

Validate date ranges, sequences, and business day requirements. Ensure logical date relationships.

### Core Template

```
AND(
  NOT(ISNULL([DATE_FIELD_1])),
  NOT(ISNULL([DATE_FIELD_2])),
  [DATE_COMPARISON]
)
```

**Error Message Template**:
```
[DATE_FIELD_1] must be [RELATIONSHIP] [DATE_FIELD_2]. [CURRENT_VALUES]. [REQUIRED_ACTION].
```

---

### Variation 5.1: Date Range Validation

**Business Requirement**: "End Date must be after Start Date"

**Formula**:
```
AND(
  NOT(ISNULL(Start_Date__c)),
  NOT(ISNULL(End_Date__c)),
  End_Date__c < Start_Date__c
)
```

**Error Message**:
```
End Date must be after Start Date. Start Date: {!Start_Date__c}. End Date: {!End_Date__c}. Please update End Date.
```

**Error Location**: End_Date__c field

**Date Comparison**: `<` means "before", `>` means "after"

---

### Variation 5.2: Future Date Validation

**Business Requirement**: "Close Date cannot be in the past for Open opportunities"

**Formula**:
```
AND(
  NOT(ISPICKVAL(StageName, "Closed Won")),
  NOT(ISPICKVAL(StageName, "Closed Lost")),
  NOT(ISNULL(CloseDate)),
  CloseDate < TODAY()
)
```

**Error Message**:
```
Close Date cannot be in the past for Open opportunities. Today: {!TODAY()}. Close Date: {!CloseDate}. Please update Close Date to a future date.
```

**Error Location**: CloseDate field

**TODAY()**: Returns current date (updates daily)

---

### Variation 5.3: Date Range Limits

**Business Requirement**: "Project duration cannot exceed 365 days"

**Formula**:
```
AND(
  NOT(ISNULL(Start_Date__c)),
  NOT(ISNULL(End_Date__c)),
  End_Date__c - Start_Date__c > 365
)
```

**Error Message**:
```
Project duration cannot exceed 365 days. Start Date: {!Start_Date__c}. End Date: {!End_Date__c}. Duration: {!End_Date__c - Start_Date__c} days. Please reduce duration.
```

**Error Location**: End_Date__c field

**Date Math**: Subtract dates to get day count

---

### Variation 5.4: Fiscal Period Validation

**Business Requirement**: "Opportunity Close Date must be within current fiscal year"

**Formula**:
```
AND(
  NOT(ISNULL(CloseDate)),
  OR(
    YEAR(CloseDate) < YEAR(TODAY()),
    YEAR(CloseDate) > YEAR(TODAY())
  )
)
```

**Error Message**:
```
Close Date must be within current fiscal year ({!YEAR(TODAY())}). Current Close Date: {!CloseDate} ({!YEAR(CloseDate)}). Please update Close Date.
```

**Error Location**: CloseDate field

**Fiscal Year**: Adjust formula for non-calendar fiscal years

---

### Variation 5.5: Business Days Validation

**Business Requirement**: "Contract Start Date must be at least 5 business days after today"

**Note**: Salesforce formulas don't have built-in business day calculation. This example uses calendar days.

**Formula**:
```
AND(
  NOT(ISNULL(Contract_Start_Date__c)),
  Contract_Start_Date__c - TODAY() < 5
)
```

**Error Message**:
```
Contract Start Date must be at least 5 days after today to allow for processing. Today: {!TODAY()}. Contract Start Date: {!Contract_Start_Date__c}. Please select a later date.
```

**Error Location**: Contract_Start_Date__c field

**Business Days**: For true business days, use Apex or external calculation

---

### Common Pitfalls - Date/Time

❌ **Not checking if date fields are populated**:
```
End_Date__c < Start_Date__c
// Fails if either date is null
```
✅ **Correct**:
```
AND(
  NOT(ISNULL(Start_Date__c)),
  NOT(ISNULL(End_Date__c)),
  End_Date__c < Start_Date__c
)
```

❌ **Using ISBLANK on date fields**:
```
ISBLANK(Close_Date__c)
// Use ISNULL for date/number fields
```
✅ **Correct**:
```
ISNULL(Close_Date__c)
```

---

## Pattern 6: Security/Compliance Validation

### Overview

Enforce data security, privacy, and compliance requirements. Control who can enter what data based on profile, role, or field visibility.

### Core Template

```
AND(
  [SECURITY_CONDITION],
  [DATA_REQUIREMENT]
)
```

**Error Message Template**:
```
[SECURITY_REQUIREMENT]. [CURRENT_STATE]. [REQUIRED_ACTION_OR_PERMISSION].
```

---

### Variation 6.1: Profile-Based Field Restrictions

**Business Requirement**: "Only Finance users can modify Discount Percent"

**Formula**:
```
AND(
  $Profile.Name != "Finance User",
  ISCHANGED(Discount_Percent__c)
)
```

**Error Message**:
```
Only Finance users can modify Discount Percent. Please contact Finance team to request discount changes.
```

**Error Location**: Discount_Percent__c field

**ISCHANGED()**: Detects if field value changed (works on edit, not create)

---

### Variation 6.2: Sensitive Data Requirements

**Business Requirement**: "SSN is required for US citizens only, prohibited for non-citizens"

**Formula**:
```
OR(
  AND(
    ISPICKVAL(Citizenship__c, "US"),
    ISBLANK(SSN__c)
  ),
  AND(
    ISPICKVAL(Citizenship__c, "Non-US"),
    NOT(ISBLANK(SSN__c))
  )
)
```

**Error Message**:
```
SSN requirements: Required for US citizens, prohibited for non-citizens. Citizenship: {!Citizenship__c}. Please update accordingly.
```

**Error Location**: SSN__c field

**Compliance Logic**: Two-way check (required AND prohibited)

---

### Variation 6.3: Audit Trail Requirements

**Business Requirement**: "Reason for Change is required when Status changes to Cancelled"

**Formula**:
```
AND(
  ISPICKVAL(Status__c, "Cancelled"),
  ISCHANGED(Status__c),
  ISBLANK(Cancellation_Reason__c)
)
```

**Error Message**:
```
Cancellation Reason is required when changing Status to Cancelled. Please document the reason for cancellation.
```

**Error Location**: Cancellation_Reason__c field

**Audit Trail**: Captures reason whenever status changes

---

### Variation 6.4: Record Lock After Approval

**Business Requirement**: "Cannot modify Amount after Contract is signed"

**Formula**:
```
AND(
  Contract_Signed__c = TRUE,
  ISCHANGED(Amount)
)
```

**Error Message**:
```
Amount cannot be modified after Contract is signed. Please create a new opportunity or contract amendment.
```

**Error Location**: Amount field

**Record Lock**: Prevents changes after milestone reached

---

### Variation 6.5: Data Classification Enforcement

**Business Requirement**: "Confidential records require Handling Instructions"

**Formula**:
```
AND(
  ISPICKVAL(Data_Classification__c, "Confidential"),
  ISBLANK(Handling_Instructions__c)
)
```

**Error Message**:
```
Handling Instructions are required for Confidential records per Data Governance Policy. Please document handling requirements.
```

**Error Location**: Handling_Instructions__c field

**Compliance**: Enforces data governance policies

---

### Common Pitfalls - Security/Compliance

❌ **Using profile name instead of ID**:
```
$Profile.Id = "System Administrator"
// Wrong - this is Name, not Id
```
✅ **Correct**:
```
$Profile.Name = "System Administrator"
// Or use $Profile.Id = "00e..."
```

❌ **Not using ISCHANGED when appropriate**:
```
AND(
  Contract_Signed__c = TRUE,
  Amount > 0
)
// Fires even if Amount didn't change
```
✅ **Correct**:
```
AND(
  Contract_Signed__c = TRUE,
  ISCHANGED(Amount)
)
// Only fires if Amount was modified
```

---

## Pattern Selection Guide

### Decision Tree

```
What are you validating?

├─ Field must be populated under certain conditions?
│  → Pattern 1: Required Field Validation
│
├─ Data format, length, or pattern?
│  → Pattern 2: Data Format Validation
│
├─ Business rule, policy, or threshold?
│  → Pattern 3: Business Logic Validation
│
├─ Relationship with parent or child object?
│  → Pattern 4: Cross-Object Validation
│
├─ Date relationships or ranges?
│  → Pattern 5: Date/Time Validation
│
└─ Security, privacy, or compliance requirement?
   → Pattern 6: Security/Compliance Validation
```

### Pattern Complexity Matrix

| Pattern | Avg Formula Length | Typical Complexity Score | Segmentation Needed? |
|---------|-------------------|-------------------------|---------------------|
| Required Field | 50-150 chars | 15-35 (Simple) | Rarely |
| Data Format | 80-200 chars | 25-45 (Simple-Medium) | Occasionally |
| Business Logic | 150-350 chars | 40-65 (Medium-Complex) | Often |
| Cross-Object | 120-280 chars | 45-70 (Medium-Complex) | Often |
| Date/Time | 100-250 chars | 30-50 (Simple-Medium) | Occasionally |
| Security/Compliance | 100-300 chars | 35-60 (Medium) | Occasionally |

**Segmentation Threshold**: Complexity score >60 → Use `validation-rule-segmentation-specialist`

---

## Combining Patterns

### When to Combine

Combine patterns when a single business requirement involves multiple validation types.

**Example Business Requirement**:
"For Enterprise Opportunities over $100K in Closed Won stage, require Executive Sponsor and ensure Discount is ≤15%"

**Combines**:
- Pattern 1: Required Field (Executive Sponsor)
- Pattern 3: Business Logic (Discount threshold)

---

### Example 1: Required + Threshold

**Formula**:
```
AND(
  ISPICKVAL(RecordType.DeveloperName, "Enterprise"),
  Amount > 100000,
  ISPICKVAL(StageName, "Closed Won"),
  OR(
    ISBLANK(Executive_Sponsor__c),
    Discount_Percent__c > 0.15
  )
)
```

**Error Message**:
```
Enterprise Opportunities over $100K require Executive Sponsor and Discount ≤15%. Amount: ${!Amount}. Discount: {!Discount_Percent__c}%. Please complete requirements.
```

**Complexity**: 58 (Medium) - approaching segmentation threshold

---

### Example 2: Cross-Object + Date

**Business Requirement**: "Project End Date cannot exceed parent Account's Contract End Date"

**Formula**:
```
AND(
  NOT(ISBLANK(Account.Id)),
  NOT(ISNULL(Account.Contract_End_Date__c)),
  NOT(ISNULL(End_Date__c)),
  End_Date__c > Account.Contract_End_Date__c
)
```

**Error Message**:
```
Project End Date cannot exceed Account Contract End Date. Contract End: {!Account.Contract_End_Date__c}. Project End: {!End_Date__c}. Please adjust dates.
```

**Error Location**: End_Date__c field

---

### Example 3: Required + Format + Logic

**Business Requirement**: "For high-value deals (>$500K), require 10-digit Support Phone and ensure it's not the main Phone"

**Formula**:
```
AND(
  Amount > 500000,
  OR(
    ISBLANK(Support_Phone__c),
    LEN(Support_Phone__c) != 10,
    Support_Phone__c = Phone
  )
)
```

**Error Message**:
```
High-value deals require unique 10-digit Support Phone. Amount: ${!Amount}. Please enter valid Support Phone (different from main Phone).
```

**Complexity**: 45 (Medium)

---

### When to Split Instead of Combine

**Split into multiple rules when**:
1. Combined formula exceeds 400 characters
2. Complexity score >70
3. Error messages become unclear
4. Different error locations needed
5. Rules might be independently deactivated

**Example Split**:
```
Rule 1: "Require Executive Sponsor for high-value deals"
  Formula: AND(Amount > 100000, ISBLANK(Executive_Sponsor__c))

Rule 2: "Enforce discount policy for high-value deals"
  Formula: AND(Amount > 100000, Discount_Percent__c > 0.15)
```

**Benefits**:
- Clearer error messages
- Independent activation/deactivation
- Easier to maintain
- Lower complexity per rule

---

## Quick Reference

### Pattern Selection Cheatsheet

| If You Need To... | Use Pattern | Key Formula Element |
|-------------------|-------------|-------------------|
| Make field required conditionally | 1 - Required Field | `ISBLANK([field])` |
| Check data format/length | 2 - Data Format | `LEN([field])`, `CONTAINS()` |
| Enforce policy/threshold | 3 - Business Logic | Amount comparisons, AND/OR |
| Validate parent data | 4 - Cross-Object | `Parent.[field]`, null checks |
| Check date relationships | 5 - Date/Time | Date comparisons, `TODAY()` |
| Enforce security rules | 6 - Security | `$Profile.Name`, `ISCHANGED()` |

### Formula Function Quick Reference

| Function | Purpose | Example |
|----------|---------|---------|
| `ISBLANK(field)` | Check if text field empty | `ISBLANK(Phone)` |
| `ISNULL(field)` | Check if number/date null | `ISNULL(Amount)` |
| `TEXT(field)` | Convert picklist to text | `TEXT(Status__c) = ""` |
| `ISPICKVAL(field, val)` | Check picklist value | `ISPICKVAL(Stage, "Won")` |
| `LEN(text)` | Get text length | `LEN(Phone) != 10` |
| `CONTAINS(text, sub)` | Check substring | `CONTAINS(Email, "@")` |
| `BEGINS(text, prefix)` | Check prefix | `BEGINS(SKU, "EXT-")` |
| `TODAY()` | Current date | `CloseDate < TODAY()` |
| `ISCHANGED(field)` | Detect field change | `ISCHANGED(Amount)` |
| `$Profile.Name` | Current user profile | `$Profile.Name = "Sales"` |

### Complexity Estimation

**Rule of Thumb**:
- **Simple** (<30): 1-2 conditions, single field, <150 chars
- **Medium** (31-60): 3-6 conditions, 2-4 fields, 150-350 chars
- **Complex** (>60): 7+ conditions, 5+ fields, >350 chars → **Segment!**

---

## Next Steps

**Continue to Runbook 3**: [Tools and Techniques](./03-tools-and-techniques.md)

Learn about the tools and techniques for building, testing, and deploying validation rules efficiently.

---

**Related Runbooks**:
- [Runbook 1: Validation Rule Fundamentals](./01-validation-rule-fundamentals.md)
- [Runbook 4: Validation and Best Practices](./04-validation-and-best-practices.md)
- [Runbook 8: Segmented Rule Building](./08-segmented-rule-building.md)

**Related Agents**:
- `validation-rule-orchestrator` - Overall validation rule management
- `validation-rule-segmentation-specialist` - Complex formula segmentation

---

**Version History**:
- v1.0.0 (2025-11-23) - Initial release
