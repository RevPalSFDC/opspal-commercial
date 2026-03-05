# Runbook 1: Validation Rule Fundamentals

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Administrators, Developers, Business Analysts

---

## Table of Contents

1. [Introduction](#introduction)
2. [What Are Validation Rules?](#what-are-validation-rules)
3. [When to Use Validation Rules](#when-to-use-validation-rules)
4. [Validation Rule Components](#validation-rule-components)
5. [Formula Syntax Basics](#formula-syntax-basics)
6. [Error Message Best Practices](#error-message-best-practices)
7. [Validation Rule Lifecycle](#validation-rule-lifecycle)
8. [Common Use Cases](#common-use-cases)
9. [Quick Reference](#quick-reference)

---

## Introduction

Validation rules are one of the most powerful data quality tools in Salesforce. They enforce business logic at the record level, preventing users from saving records that don't meet your organization's requirements. This runbook provides a comprehensive foundation for understanding, creating, and managing validation rules effectively.

### What You'll Learn

- Core concepts and components of validation rules
- Formula syntax and common functions
- How to craft clear, user-friendly error messages
- When to use validation rules vs. other automation tools
- Best practices for maintainability and performance

### Prerequisites

- Basic Salesforce administrator knowledge
- Understanding of Salesforce objects and fields
- Familiarity with boolean logic (AND, OR, NOT)

---

## What Are Validation Rules?

### Definition

A **validation rule** is a declarative automation tool that prevents users from saving records that don't meet specified criteria. When a user attempts to save a record that violates a validation rule, Salesforce:

1. **Prevents the save** operation
2. **Displays an error message** (defined by you)
3. **Returns the user to the edit page** with field values preserved

### Key Characteristics

| Characteristic | Description |
|----------------|-------------|
| **Execution Point** | Before record save (after field defaults, before workflow) |
| **Scope** | Single record (can reference parent/related records) |
| **Return Type** | Boolean (TRUE = block save, FALSE = allow save) |
| **Performance** | Fast (formula evaluation, no database queries) |
| **Limit** | 500 validation rules per object (hard limit) |

### Validation Rule in the Automation Sequence

```
User clicks "Save"
    ↓
1. Field Defaults applied
    ↓
2. **VALIDATION RULES** ← You are here
    ↓
3. Assignment Rules (if applicable)
    ↓
4. Auto-Response Rules (if applicable)
    ↓
5. Workflow Rules (field updates)
    ↓
6. Before-Save Apex Triggers
    ↓
7. After-Save Apex Triggers
    ↓
8. Workflow Rules (email/tasks)
    ↓
9. Process Builder / Flow
    ↓
10. Record saved
```

**Key Insight**: Validation rules fire EARLY in the save sequence, before most other automation. This makes them ideal for data quality enforcement.

---

## When to Use Validation Rules

### ✅ Use Validation Rules For

1. **Required Fields** (conditional)
   - Example: "Closed Date required when Stage = Closed Won"
   - Why: More flexible than field-level required

2. **Data Format Validation**
   - Example: "Phone number must be 10 digits"
   - Why: Ensures consistent data format

3. **Business Logic Enforcement**
   - Example: "Discount cannot exceed 15% without approval"
   - Why: Prevents policy violations

4. **Cross-Field Dependencies**
   - Example: "End Date must be after Start Date"
   - Why: Maintains logical data relationships

5. **Threshold Checks**
   - Example: "Opportunity Amount cannot exceed $1M for this stage"
   - Why: Enforces business rules in real-time

6. **Picklist Value Dependencies**
   - Example: "Industry must be 'Technology' when Product = 'Software'"
   - Why: More flexible than picklist dependencies

### ❌ Don't Use Validation Rules For

1. **Complex Multi-Step Logic**
   - Problem: Formulas become unmaintainable
   - Alternative: Apex Trigger with clear code structure

2. **Data Transformation**
   - Problem: Validation rules can't modify data
   - Alternative: Workflow Field Update or Flow

3. **Bulk Operations**
   - Problem: 500 rule evaluations = 500 error messages
   - Alternative: Temporary deactivation + batch update

4. **Performance-Sensitive Operations**
   - Problem: >50 validation rules per object = slower saves
   - Alternative: Consolidate rules, use Apex where needed

5. **External System Validation**
   - Problem: Can't call external APIs from formulas
   - Alternative: Apex Trigger with callout

### Decision Matrix

| Requirement | Validation Rule | Workflow | Apex Trigger | Flow |
|-------------|----------------|----------|--------------|------|
| Prevent invalid data | ✅ Best | ❌ No | ✅ Yes | ❌ No |
| Modify field values | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| Query related records | ⚠️ Limited* | ❌ No | ✅ Yes | ✅ Yes |
| Call external API | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| Bulkification | ⚠️ User sees all errors | ✅ Yes | ✅ Yes | ✅ Yes |
| Complexity | ⚠️ Formula only | ⚠️ Limited | ✅ Full code | ✅ Visual logic |

*Via cross-object formula fields only

---

## Validation Rule Components

### 1. Rule Name (API Name)

**Purpose**: Unique identifier for the rule

**Best Practices**:
- Use descriptive names: `Require_Closed_Date_When_Won`
- Follow naming convention: `{Verb}_{Noun}_{Condition}`
- Keep under 40 characters
- Use underscores (not spaces)

**Examples**:
- ✅ `Require_Executive_Sponsor_High_Value`
- ✅ `Prevent_Discount_Over_15_Percent`
- ✅ `Validate_End_Date_After_Start`
- ❌ `Rule1` (not descriptive)
- ❌ `This is a very long validation rule name that nobody will read` (too long)

### 2. Active

**Purpose**: Whether the rule is currently enforced

**Usage**:
- ✅ Active: Rule is enforced on all saves
- ❌ Inactive: Rule exists but doesn't fire (useful for testing)

**Best Practices**:
- Always test in sandbox before activating in production
- Use Smart Validation Bypass system for temporary deactivation
- Document reason if rule is inactive long-term

### 3. Description

**Purpose**: Explain WHY the rule exists

**Best Practices**:
- Document business requirement
- Include ticket/request reference
- Note any exceptions or edge cases
- Update when rule logic changes

**Template**:
```
Business Requirement: [Why this rule exists]
Requested By: [Person/Team]
Date Created: [YYYY-MM-DD]
Last Updated: [YYYY-MM-DD] - [What changed]
Exceptions: [Any documented exceptions]
```

**Example**:
```
Business Requirement: Finance requires Executive Sponsor approval for deals >$100K per Sales Policy v2.3
Requested By: CFO (Jane Smith) - Ticket SFDC-1234
Date Created: 2025-01-15
Last Updated: 2025-03-10 - Increased threshold from $50K to $100K per updated policy
Exceptions: None
```

### 4. Error Condition Formula

**Purpose**: The boolean formula that returns TRUE when the record is INVALID

**Key Insight**: Formula returns TRUE to BLOCK the save (counter-intuitive!)

**Example**:
```
Formula: ISPICKVAL(Stage, "Closed Won") && ISBLANK(CloseDate)

Translation:
  IF Stage = "Closed Won" AND CloseDate is blank
  THEN block save (TRUE)
  ELSE allow save (FALSE)
```

**Formula Return Values**:
- `TRUE` → Block save, show error
- `FALSE` → Allow save, proceed
- `Error` → Block save, show formula error

### 5. Error Message

**Purpose**: Tell the user WHAT is wrong and HOW to fix it

**Best Practices**:
- **Be specific**: Don't say "Error" or "Invalid value"
- **Be actionable**: Tell user exactly what to do
- **Be concise**: Max 255 characters (hard limit)
- **Be polite**: Avoid blame ("You must..." vs "Please enter...")

**Template**:
```
[FIELD_LABEL] [REQUIREMENT] [WHEN_CONDITION]. [ACTION_NEEDED].
```

**Examples**:
- ✅ "Closed Date is required when Stage is Closed Won. Please enter the date the deal closed."
- ✅ "Discount cannot exceed 15% without Executive Approval. Please obtain approval or reduce discount."
- ✅ "End Date must be after Start Date. Please update End Date to be later than {!StartDate}."
- ❌ "Error" (not helpful)
- ❌ "This record cannot be saved" (doesn't explain why or how to fix)

### 6. Error Location

**Purpose**: WHERE to display the error message

**Options**:

**Top of Page**:
- Use when: Error involves multiple fields or complex logic
- Example: "Account must have at least one Contact with Role = 'Primary'"

**Specific Field**:
- Use when: Error is about a single field
- Example: "Close Date" field when checking if it's populated

**Best Practice**: Always attach to a specific field when possible for better UX

---

## Formula Syntax Basics

### Boolean Logic

Validation rule formulas must return `TRUE` (block save) or `FALSE` (allow save).

#### Logical Operators

**AND** - All conditions must be TRUE
```
AND(
  Amount > 100000,
  ISPICKVAL(Stage, "Closed Won"),
  ISBLANK(Executive_Sponsor__c)
)
// TRUE if all three conditions are met
```

**OR** - At least one condition must be TRUE
```
OR(
  ISBLANK(Phone),
  ISBLANK(Email),
  ISBLANK(Website)
)
// TRUE if ANY field is blank
```

**NOT** - Inverts the result
```
NOT(ISBLANK(Account_Name__c))
// TRUE if Account_Name__c is NOT blank
```

#### Combining Operators

Use parentheses to control evaluation order:

```
AND(
  OR(Type = "Customer", Type = "Partner"),
  NOT(ISBLANK(Industry)),
  Annual_Revenue__c > 1000000
)
// TRUE if:
//   - Type is Customer OR Partner
//   - AND Industry is not blank
//   - AND Annual Revenue > $1M
```

### Common Formula Functions

#### Field Value Checks

**ISBLANK(field)** - Check if field is empty
```
ISBLANK(Phone)
// TRUE if Phone is blank/null
```

⚠️ **WARNING**: Don't use on picklist fields! Use `TEXT(field) = ""` instead.

**ISNULL(field)** - Similar to ISBLANK
```
ISNULL(Close_Date__c)
// TRUE if Close_Date__c is null
```

⚠️ **WARNING**: Don't use on picklist fields! Use `TEXT(field) = ""` instead.

**TEXT(field)** - Convert to text (required for picklists)
```
TEXT(Status__c) = ""
// CORRECT way to check if picklist is blank
```

**ISPICKVAL(field, value)** - Check picklist value
```
ISPICKVAL(Stage, "Closed Won")
// TRUE if Stage equals "Closed Won"
```

#### Comparison Operators

```
Amount > 100000          // Greater than
Amount >= 100000         // Greater than or equal
Amount < 100000          // Less than
Amount <= 100000         // Less than or equal
Amount = 100000          // Equal (single =, not ==)
Amount != 100000         // Not equal (or <>)
```

#### Text Functions

**CONTAINS(text, substring)** - Check if text contains substring
```
CONTAINS(Description, "urgent")
// TRUE if Description contains "urgent"
```

**BEGINS(text, prefix)** - Check if text starts with prefix
```
BEGINS(Account_Number__c, "EXT-")
// TRUE if Account_Number__c starts with "EXT-"
```

**LEN(text)** - Get text length
```
LEN(Phone) != 10
// TRUE if Phone is not exactly 10 characters
```

#### Date Functions

**TODAY()** - Current date
```
Close_Date__c < TODAY()
// TRUE if Close_Date is in the past
```

**DATE(year, month, day)** - Create date value
```
Start_Date__c < DATE(2025, 1, 1)
// TRUE if Start_Date is before Jan 1, 2025
```

### Field Merge Syntax

**Current Object Fields**:
```
{!Amount}           // Merge Amount field value
{!CloseDate}        // Merge Close Date value
```

**Cross-Object Fields** (via lookup):
```
{!Account.Industry}           // Parent Account Industry
{!Owner.Profile.Name}        // Record Owner's Profile Name
{!RecordType.DeveloperName}  // Record Type API Name
```

**System Fields**:
```
{!$Profile.Name}      // Current user's profile
{!$User.Department}   // Current user's department
```

### Formula Examples by Use Case

#### Required Field (Conditional)
```
AND(
  ISPICKVAL(Stage, "Closed Won"),
  ISBLANK(CloseDate)
)
```

#### Data Format
```
AND(
  NOT(ISBLANK(Phone)),
  LEN(Phone) != 10
)
```

#### Threshold Check
```
AND(
  Amount > 100000,
  Discount_Percent__c > 0.15
)
```

#### Date Range
```
End_Date__c < Start_Date__c
```

#### Cross-Object Dependency
```
AND(
  NOT(ISBLANK(Account.Id)),
  TEXT(Account.Industry) = "",
  Account_Type__c = "Customer"
)
```

---

## Error Message Best Practices

### The 3-Part Error Message Formula

**Structure**:
```
[PROBLEM STATEMENT] [REQUIRED ACTION] [SPECIFIC GUIDANCE]
```

**Example**:
```
Problem: "Closed Date is required when Stage is Closed Won."
Action: "Please enter Closed Date."
Guidance: "This should be the date the deal closed."
```

### Templates by Use Case

#### Required Field
```
{!Field_Label} is required when {condition}. Please enter {!Field_Label}.
```
Example: "Executive Sponsor is required when Amount exceeds $100,000. Please enter Executive Sponsor."

#### Invalid Value
```
{!Field_Label} must be {requirement}. Current value: {!Field_Value}. Please update {!Field_Label}.
```
Example: "Discount Percent must be 15% or less. Current value: 20%. Please reduce Discount Percent."

#### Data Format
```
{!Field_Label} must be in format {format}. Please update {!Field_Label} to match the required format.
```
Example: "Phone must be in format (555) 555-5555. Please update Phone to match the required format."

#### Logical Dependency
```
{!Field1_Label} cannot be {value1} when {!Field2_Label} is {value2}. Please update one of these fields.
```
Example: "Type cannot be 'Customer' when Industry is blank. Please enter Industry or change Type."

#### Threshold
```
{!Field_Label} cannot exceed {threshold} {when_condition}. Current value: {!Field_Value}. Please reduce {!Field_Label}.
```
Example: "Discount Percent cannot exceed 15% for this customer tier. Current value: 20%. Please reduce Discount Percent."

### Error Message Anti-Patterns

❌ **Too Vague**:
```
"Error"
"Invalid value"
"This record cannot be saved"
```

❌ **Too Technical**:
```
"Formula evaluation failed: ISPICKVAL(Stage, 'Closed Won') returned TRUE"
"Null pointer exception on CloseDate field"
```

❌ **Too Blame-Oriented**:
```
"You must enter a Closed Date!"
"You cannot save this record!"
"Your discount is too high!"
```

✅ **Clear and Actionable**:
```
"Closed Date is required when Stage is Closed Won. Please enter Closed Date."
"Discount Percent cannot exceed 15%. Please reduce discount or obtain approval."
"Industry is required for Customer accounts. Please enter Industry."
```

---

## Validation Rule Lifecycle

### 1. Planning Phase

**Activities**:
- Gather business requirements
- Identify affected fields and objects
- Determine when rule should fire (all records vs. specific conditions)
- Draft formula logic
- Write error message

**Deliverables**:
- Business requirement document
- Formula pseudocode
- Error message draft

### 2. Development Phase (Sandbox)

**Activities**:
- Create validation rule in sandbox
- Test with various record scenarios
- Verify error message clarity
- Check for unintended consequences

**Testing Checklist**:
- ✅ Rule fires when expected
- ✅ Rule doesn't fire when not expected
- ✅ Error message is clear and actionable
- ✅ No conflicts with existing rules
- ✅ Performance acceptable (<2s save time)

### 3. Documentation Phase

**Activities**:
- Document rule purpose in Description field
- Add to validation rule inventory spreadsheet
- Update user training materials
- Create knowledge base article (if user-facing)

**Required Documentation**:
- Rule name and API name
- Business requirement/ticket reference
- Formula explanation
- Test scenarios and results
- Deployment date

### 4. Deployment Phase (Production)

**Activities**:
- Deploy via Change Set or Metadata API
- Verify deployment success
- Test rule in production (with test record)
- Monitor error logs for unexpected issues

**Deployment Checklist**:
- ✅ Rule deployed successfully
- ✅ Rule is Active
- ✅ Test record triggers rule as expected
- ✅ Error message displays correctly
- ✅ Users notified of new requirement

### 5. Maintenance Phase

**Activities**:
- Monitor error frequency
- Update formula if business rules change
- Deactivate if no longer needed
- Consolidate with similar rules

**Monitoring Metrics**:
- Error frequency (saves blocked per day/week)
- Most common violators (users/profiles)
- Formula performance (save time impact)
- User feedback/help desk tickets

---

## Common Use Cases

### Use Case 1: Required Field (Conditional)

**Business Requirement**: "Closed Date must be populated when Opportunity Stage is Closed Won"

**Formula**:
```
AND(
  ISPICKVAL(StageName, "Closed Won"),
  ISBLANK(CloseDate)
)
```

**Error Message**:
```
Closed Date is required when Stage is Closed Won. Please enter the date the deal closed.
```

**Error Location**: CloseDate field

---

### Use Case 2: Threshold Validation

**Business Requirement**: "Discount cannot exceed 15% without executive approval"

**Formula**:
```
AND(
  Discount_Percent__c > 0.15,
  ISBLANK(Executive_Approval__c)
)
```

**Error Message**:
```
Discount Percent cannot exceed 15% without Executive Approval. Please obtain approval or reduce discount to 15% or less.
```

**Error Location**: Discount_Percent__c field

---

### Use Case 3: Data Format Validation

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
Phone must be exactly 10 digits. Please enter phone number in format: 5551234567 (no spaces or special characters).
```

**Error Location**: Phone field

---

### Use Case 4: Cross-Field Dependency

**Business Requirement**: "End Date must be after Start Date"

**Formula**:
```
AND(
  NOT(ISBLANK(Start_Date__c)),
  NOT(ISBLANK(End_Date__c)),
  End_Date__c < Start_Date__c
)
```

**Error Message**:
```
End Date must be after Start Date. Start Date: {!Start_Date__c}. Please update End Date to be later.
```

**Error Location**: End_Date__c field

---

### Use Case 5: Picklist Dependency

**Business Requirement**: "Industry is required when Account Type is Customer"

**Formula**:
```
AND(
  ISPICKVAL(Type, "Customer"),
  TEXT(Industry) = ""
)
```

**Error Message**:
```
Industry is required for Customer accounts. Please select an Industry from the dropdown.
```

**Error Location**: Industry field

---

### Use Case 6: Cross-Object Validation

**Business Requirement**: "Opportunity Amount cannot exceed parent Account's Credit Limit"

**Prerequisites**: Credit_Limit__c field on Account object

**Formula**:
```
AND(
  NOT(ISBLANK(Account.Id)),
  NOT(ISBLANK(Account.Credit_Limit__c)),
  Amount > Account.Credit_Limit__c
)
```

**Error Message**:
```
Opportunity Amount cannot exceed Account Credit Limit. Account Credit Limit: {!Account.Credit_Limit__c}. Please reduce Amount or request credit limit increase.
```

**Error Location**: Amount field

---

## Quick Reference

### Formula Syntax Cheat Sheet

| Purpose | Formula | Example |
|---------|---------|---------|
| Field is blank | `ISBLANK(Field__c)` | `ISBLANK(Phone)` |
| Picklist is blank | `TEXT(Field__c) = ""` | `TEXT(Status__c) = ""` |
| Picklist equals value | `ISPICKVAL(Field__c, "Value")` | `ISPICKVAL(Stage, "Closed Won")` |
| Field equals value | `Field__c = value` | `Amount > 100000` |
| Text contains | `CONTAINS(Field__c, "text")` | `CONTAINS(Name, "Inc")` |
| All conditions true | `AND(cond1, cond2)` | `AND(A > 10, B < 5)` |
| Any condition true | `OR(cond1, cond2)` | `OR(ISBLANK(A), ISBLANK(B))` |
| Invert condition | `NOT(condition)` | `NOT(ISBLANK(Field__c))` |
| Cross-object field | `Parent.Field__c` | `Account.Industry` |
| Current date | `TODAY()` | `CloseDate < TODAY()` |
| Field length | `LEN(Field__c)` | `LEN(Phone) != 10` |

### Common Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| `ISBLANK(Picklist__c)` | Doesn't work | `TEXT(Picklist__c) = ""` |
| `ISNULL(Picklist__c)` | Doesn't work | `TEXT(Picklist__c) = ""` |
| Excessive NOT() | Hard to read | Use positive logic |
| Deep nesting (>4) | Unmaintainable | Segment formula |
| No null check on parent | Runtime error | `NOT(ISBLANK(Account.Id))` |
| Formula >500 chars | Unmaintainable | Split into multiple rules |

### Error Message Checklist

✅ Clear problem statement
✅ Specific requirement
✅ Actionable guidance
✅ Under 255 characters
✅ Polite tone
✅ Field merge if helpful

### Validation Rule Limits

| Limit Type | Value |
|------------|-------|
| Rules per object | 500 (hard limit) |
| Formula length | 5,000 characters |
| Error message length | 255 characters |
| Cross-object levels | 10 (Account.Parent.Parent...) |
| Formula compile time | <5 seconds |

---

## Next Steps

**Continue to Runbook 2**: [Designing Validation Rules for Scenarios](./02-designing-validation-rules-for-scenarios.md)

Learn how to design validation rules for 6 common business scenarios with templates and best practices.

---

**Related Runbooks**:
- [Runbook 3: Tools and Techniques](./03-tools-and-techniques.md)
- [Runbook 4: Validation and Best Practices](./04-validation-and-best-practices.md)
- [Runbook 8: Segmented Rule Building](./08-segmented-rule-building.md)

**Related Agents**:
- `validation-rule-orchestrator` - Overall validation rule management
- `validation-rule-segmentation-specialist` - Complex formula segmentation

---

**Version History**:
- v1.0.0 (2025-11-23) - Initial release
