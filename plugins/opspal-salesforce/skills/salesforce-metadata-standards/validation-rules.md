# Validation Rule Best Practices

## Formula Fundamentals

### Picklist Fields

**Critical Rule**: NEVER use `ISBLANK()` or `ISNULL()` on picklist fields

```javascript
// ❌ WRONG - Will cause deployment errors
ISBLANK(Status__c)
ISNULL(Priority__c)
ISBLANK(Lead_Source__c)

// ✅ CORRECT - Use TEXT() wrapper
TEXT(Status__c) = ""
LEN(TEXT(Priority__c)) = 0
ISPICKVAL(Lead_Source__c, "")
```

### Checking for Specific Values

```javascript
// Single value check
ISPICKVAL(Status__c, "Closed")

// Multiple value check
OR(
  ISPICKVAL(Status__c, "Closed"),
  ISPICKVAL(Status__c, "Cancelled"),
  ISPICKVAL(Status__c, "Lost")
)

// NOT a specific value
NOT(ISPICKVAL(Status__c, "New"))
```

### Text Fields

```javascript
// Check if blank
ISBLANK(Description__c)

// Check if not blank
NOT(ISBLANK(Description__c))

// Check minimum length
LEN(Description__c) < 10

// Pattern matching with REGEX
NOT(REGEX(Email__c, "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"))
```

### Number Fields

```javascript
// Check if null (use ISNULL for numbers)
ISNULL(Amount__c)

// Range validation
OR(
  Amount__c < 0,
  Amount__c > 1000000
)

// Require whole numbers
Amount__c <> FLOOR(Amount__c)
```

### Date Fields

```javascript
// Check if blank
ISBLANK(Start_Date__c)

// Date must be in future
Start_Date__c <= TODAY()

// Date range validation
End_Date__c < Start_Date__c

// Date must be within N days
Start_Date__c > TODAY() + 90
```

---

## Common Validation Patterns

### Required Field at Stage

```javascript
// Require Amount when Stage is Negotiation or later
AND(
  ISPICKVAL(StageName, "Negotiation/Review"),
  ISNULL(Amount)
)
```

**Error Message**: "Amount is required at Negotiation stage"

### Conditional Required Fields

```javascript
// If Type is "Customer", require Account
AND(
  ISPICKVAL(Type__c, "Customer"),
  ISBLANK(Account__c)
)
```

**Error Message**: "Account is required when Type is Customer"

### Cross-Field Validation

```javascript
// End Date must be after Start Date
AND(
  NOT(ISBLANK(End_Date__c)),
  NOT(ISBLANK(Start_Date__c)),
  End_Date__c <= Start_Date__c
)
```

**Error Message**: "End Date must be after Start Date"

### Percentage Range

```javascript
// Discount must be between 0 and 50%
OR(
  Discount_Percent__c < 0,
  Discount_Percent__c > 50
)
```

**Error Message**: "Discount must be between 0% and 50%"

### Record Type Specific

```javascript
// Only Enterprise accounts can have Revenue > 1M
AND(
  RecordType.DeveloperName = "Standard",
  Annual_Revenue__c > 1000000
)
```

**Error Message**: "Accounts with Revenue over $1M must use Enterprise record type"

---

## Error Message Guidelines

### Structure

```
{What's wrong} {How to fix it}
```

### Examples

| Bad | Good |
|-----|------|
| "Invalid" | "Email format is invalid. Use format: name@company.com" |
| "Required" | "Amount is required when Stage is Proposal or later" |
| "Error" | "End Date must be after Start Date" |
| "Wrong value" | "Discount cannot exceed 50%. Contact manager for exceptions." |

### Best Practices

1. **Be specific**: Say exactly what's wrong
2. **Be helpful**: Explain how to fix it
3. **Be consistent**: Use same tone across all messages
4. **Avoid blame**: Don't say "You entered invalid..."
5. **Include context**: Reference field names and expected values

---

## Performance Considerations

### Formula Size Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Formula characters | 5,000 | Compiled size |
| Unique field references | 10 | Per formula |
| Cross-object levels | 5 | Max relationship depth |

### Optimization Tips

```javascript
// ❌ EXPENSIVE - Multiple IF statements
IF(ISPICKVAL(Status, "A"), "Result A",
  IF(ISPICKVAL(Status, "B"), "Result B",
    IF(ISPICKVAL(Status, "C"), "Result C", "Other")))

// ✅ BETTER - Use CASE
CASE(TEXT(Status),
  "A", "Result A",
  "B", "Result B",
  "C", "Result C",
  "Other")
```

### Avoid Redundant Checks

```javascript
// ❌ REDUNDANT
AND(
  NOT(ISBLANK(Field__c)),
  LEN(Field__c) > 0
)

// ✅ SUFFICIENT
NOT(ISBLANK(Field__c))
```

---

## Organization Limits

### Maximum Rules

| Object Type | Max Rules |
|-------------|-----------|
| Standard Object | 500 |
| Custom Object | 500 |

### When to Consolidate

Consider consolidating when:
- Multiple rules check same field
- Rules fire on same condition
- Error messages are related

```javascript
// Instead of 3 separate rules for Close Date:
// Rule 1: Close Date required at Proposal
// Rule 2: Close Date must be future
// Rule 3: Close Date within fiscal year

// ✅ Combine into one rule:
AND(
  ISPICKVAL(StageName, "Proposal"),
  OR(
    ISBLANK(CloseDate),
    CloseDate < TODAY(),
    CloseDate > DATE(YEAR(TODAY()), 12, 31)
  )
)
```

---

## Anti-Patterns to Avoid

### 1. Hard-Coded IDs

```javascript
// ❌ NEVER hard-code IDs
OwnerId = "005xx000001234"

// ✅ Use references or custom settings
$User.ProfileId = $Setup.Admin_Profile__c.Profile_Id__c
```

### 2. Circular Dependencies

```javascript
// ❌ AVOID - Field A validates based on Field B,
// which validates based on Field A
// This creates confusing user experience
```

### 3. Overly Complex Formulas

```javascript
// ❌ If formula is > 3000 characters, consider:
// - Breaking into multiple rules
// - Using Apex trigger instead
// - Simplifying business logic
```

### 4. Missing Error Messages

```javascript
// ❌ Generic/blank error message
// ✅ Always include helpful, specific message
```

### 5. Validation Without Context

```javascript
// ❌ Always fires, even on irrelevant updates
Amount < 1000

// ✅ Only when Amount changes
AND(
  ISCHANGED(Amount),
  Amount < 1000
)
```

---

## Testing Validation Rules

### Test Scenarios

For each validation rule, test:

1. **Positive case**: Invalid data should trigger error
2. **Negative case**: Valid data should pass
3. **Boundary cases**: Values at exact limits
4. **Null cases**: Blank/null field values
5. **Update cases**: Rule behavior on record update

### Documentation Template

```markdown
## Validation Rule: {Name}

**Object**: {Object API Name}
**Active**: Yes/No
**Description**: {What this rule enforces}

### Formula
```
{Formula}
```

### Error Message
{Error message text}

### Business Reason
{Why this rule exists}

### Test Cases
| Scenario | Input | Expected Result |
|----------|-------|-----------------|
| Valid data | ... | Pass |
| Invalid data | ... | Error |
| Boundary | ... | ... |
```
