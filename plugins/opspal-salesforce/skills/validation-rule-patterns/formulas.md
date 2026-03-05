# Validation Rule Formula Reference

Complete reference for Salesforce formula functions used in validation rules.

## Quick Reference

### Most Common Functions

| Function | Purpose | Example |
|----------|---------|---------|
| `ISBLANK()` | Check if text/number is empty | `ISBLANK(Email)` |
| `ISPICKVAL()` | Check picklist value | `ISPICKVAL(Status, "Open")` |
| `TEXT()` | Convert picklist to text | `TEXT(Status) = ""` |
| `AND()` | All conditions must be true | `AND(A, B, C)` |
| `OR()` | Any condition must be true | `OR(A, B, C)` |
| `NOT()` | Negate condition | `NOT(ISBLANK(Email))` |
| `ISCHANGED()` | Field value changed | `ISCHANGED(Amount)` |
| `ISNEW()` | Record is being created | `ISNEW()` |
| `PRIORVALUE()` | Previous field value | `PRIORVALUE(Stage)` |
| `REGEX()` | Pattern matching | `REGEX(Phone, "^\\d{10}$")` |

---

## Null/Blank Checking

### ISBLANK() - Text, Number, Date fields

```javascript
// Check if text field is empty
ISBLANK(Description)

// Check if number field is empty
ISBLANK(Amount)

// Check if date field is empty
ISBLANK(CloseDate)

// Check if lookup is empty
ISBLANK(AccountId)
```

### ISNULL() - Deprecated, use ISBLANK()

```javascript
// ⚠️ DEPRECATED - Use ISBLANK() instead
ISNULL(Amount)
```

### Picklist Empty Check

```javascript
// ❌ WRONG - ISBLANK doesn't work on picklists
ISBLANK(Status__c)

// ✅ CORRECT - Use TEXT() or ISPICKVAL()
TEXT(Status__c) = ""
ISPICKVAL(Status__c, "")
```

---

## Picklist Functions

### ISPICKVAL() - Check Specific Value

```javascript
// Single value check
ISPICKVAL(StageName, "Closed Won")

// Empty picklist check
ISPICKVAL(LeadSource, "")

// Combined with AND
AND(
  ISPICKVAL(Status, "Active"),
  ISPICKVAL(Type, "Customer")
)
```

### TEXT() - Convert Picklist to Text

```javascript
// Empty check
TEXT(Priority__c) = ""

// Contains check
CONTAINS(TEXT(Industry), "Tech")

// Length check
LEN(TEXT(Status__c)) > 0

// Comparison
TEXT(Rating) = TEXT(Previous_Rating__c)
```

### Multi-Select Picklist

```javascript
// Check if contains value
INCLUDES(Multi_Select__c, "Value1")

// Check if any of multiple values
OR(
  INCLUDES(Multi_Select__c, "A"),
  INCLUDES(Multi_Select__c, "B")
)

// Check if specific combination
AND(
  INCLUDES(Features__c, "Premium"),
  INCLUDES(Features__c, "Support")
)
```

---

## Logical Functions

### AND() - All Must Be True

```javascript
// Two conditions
AND(
  NOT(ISBLANK(Amount)),
  Amount > 0
)

// Multiple conditions
AND(
  ISPICKVAL(Status, "Active"),
  NOT(ISBLANK(Email)),
  ISBLANK(End_Date__c)
)

// Nested AND
AND(
  OR(Condition1, Condition2),
  AND(Condition3, Condition4)
)
```

### OR() - Any Must Be True

```javascript
// Two conditions
OR(
  ISPICKVAL(Status, "Open"),
  ISPICKVAL(Status, "In Progress")
)

// Multiple conditions
OR(
  Amount > 100000,
  ISPICKVAL(Type, "Enterprise"),
  Priority__c = "Critical"
)
```

### NOT() - Negate Condition

```javascript
// Simple negation
NOT(ISBLANK(Email))

// Negate complex condition
NOT(
  AND(
    ISPICKVAL(Status, "Closed"),
    Amount > 0
  )
)
```

### IF() - Conditional Logic

```javascript
// Simple IF
IF(Amount > 10000, "High", "Low")

// Nested IF
IF(Amount > 100000, "Enterprise",
  IF(Amount > 10000, "Mid-Market", "SMB")
)

// IF in validation (return boolean)
IF(
  ISPICKVAL(Type, "Customer"),
  ISBLANK(Account.Industry),
  false
)
```

### CASE() - Multiple Conditions

```javascript
// Value mapping
CASE(TEXT(Rating),
  "Hot", 3,
  "Warm", 2,
  "Cold", 1,
  0
)

// Status-based validation
CASE(TEXT(StageName),
  "Closed Won", AND(NOT(ISBLANK(Amount)), Amount > 0),
  "Closed Lost", NOT(ISBLANK(Loss_Reason__c)),
  true
)
```

---

## Change Detection

### ISCHANGED() - Field Modified

```javascript
// Simple change detection
ISCHANGED(Amount)

// Prevent change
AND(
  NOT(ISNEW()),
  ISCHANGED(Contract_Number__c)
)

// Track specific changes
AND(
  ISCHANGED(StageName),
  ISPICKVAL(StageName, "Closed Won")
)
```

### ISNEW() - New Record

```javascript
// Only on creation
ISNEW()

// Different rules for new vs existing
IF(ISNEW(),
  ISBLANK(Email),
  ISCHANGED(Email)
)
```

### PRIORVALUE() - Previous Value

```javascript
// Get previous value
PRIORVALUE(StageName)

// Compare old and new
AND(
  ISPICKVAL(PRIORVALUE(StageName), "Open"),
  ISPICKVAL(StageName, "Closed")
)

// Calculate change
Amount - PRIORVALUE(Amount)

// Prevent backward movement
TEXT(StageName) < TEXT(PRIORVALUE(StageName))
```

---

## Text Functions

### CONTAINS() - Substring Check

```javascript
// Simple contains
CONTAINS(Description, "urgent")

// Case-insensitive (convert both)
CONTAINS(LOWER(Description), LOWER("urgent"))
```

### BEGINS() / ENDS() - Position Check

```javascript
// Starts with
BEGINS(Name, "ACME")

// Ends with
ENDS(Email, "@company.com")
```

### LEN() - Text Length

```javascript
// Minimum length
LEN(Description) < 10

// Maximum length
LEN(Comments__c) > 5000

// Exact length
LEN(Postal_Code__c) <> 5
```

### LEFT() / RIGHT() / MID() - Extract Text

```javascript
// First 3 characters
LEFT(Account_Number__c, 3)

// Last 4 characters
RIGHT(Phone, 4)

// Middle portion
MID(SKU__c, 4, 3)
```

### TRIM() / LOWER() / UPPER()

```javascript
// Remove whitespace
LEN(TRIM(Name)) = 0

// Case conversion
LOWER(Email) <> Email

// Standardization check
UPPER(Country_Code__c) <> Country_Code__c
```

---

## Date/Time Functions

### TODAY() / NOW()

```javascript
// Date in past
CloseDate < TODAY()

// Date in future
Follow_Up_Date__c > TODAY()

// With datetime
Created_DateTime__c < NOW()
```

### DATE() - Create Date

```javascript
// Specific date
CloseDate < DATE(2025, 12, 31)

// Dynamic date (first of month)
DATE(YEAR(TODAY()), MONTH(TODAY()), 1)
```

### YEAR() / MONTH() / DAY()

```javascript
// Extract year
YEAR(CloseDate) = YEAR(TODAY())

// Extract month
MONTH(Start_Date__c) < MONTH(End_Date__c)

// Extract day
DAY(Payment_Date__c) > 28
```

### DATEVALUE() - Convert to Date

```javascript
// From datetime
DATEVALUE(CreatedDate) = TODAY()

// From text
DATEVALUE(Date_Text__c)
```

### Date Arithmetic

```javascript
// Days between
End_Date__c - Start_Date__c

// Add days
CloseDate + 30

// Weeks
(End_Date__c - Start_Date__c) / 7
```

---

## Numeric Functions

### ROUND() / CEILING() / FLOOR()

```javascript
// Round to 2 decimals
ROUND(Amount, 2)

// Round up
CEILING(Quantity__c)

// Round down
FLOOR(Score__c / 10)
```

### ABS() / MAX() / MIN()

```javascript
// Absolute value
ABS(Variance__c) > 1000

// Maximum of values
MAX(Amount, Minimum_Amount__c)

// Minimum of values
MIN(Requested_Qty__c, Available_Qty__c)
```

### MOD() - Remainder

```javascript
// Even number check
MOD(Quantity__c, 2) = 0

// Multiple of 5
MOD(Price__c, 5) <> 0
```

---

## Regular Expressions (REGEX)

### Basic Patterns

```javascript
// Digits only
REGEX(Phone, "^[0-9]+$")

// Letters only
REGEX(Code__c, "^[A-Za-z]+$")

// Alphanumeric
REGEX(ID_Field__c, "^[A-Za-z0-9]+$")
```

### Common Validations

```javascript
// Email
REGEX(Email, "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")

// US Phone
REGEX(Phone, "^\\(?[0-9]{3}\\)?[-. ]?[0-9]{3}[-. ]?[0-9]{4}$")

// URL
REGEX(Website, "^https?://[\\w.-]+\\.[a-z]{2,}(/.*)?$")

// US ZIP Code
REGEX(PostalCode, "^\\d{5}(-\\d{4})?$")

// SSN
REGEX(SSN__c, "^\\d{3}-\\d{2}-\\d{4}$")
```

### Regex Escaping

```javascript
// Escape special characters: . * + ? ^ $ { } [ ] \ | ( )
// Backslash in formula requires double escape: \\

// Match literal period
"\\."

// Match literal backslash
"\\\\"

// Match parentheses
"\\(\\)"
```

---

## Cross-Object References

### Parent Object Fields

```javascript
// Direct parent
Account.Industry

// Multi-level (grandparent)
Contact.Account.Annual_Revenue__c

// Lookup relationship
Primary_Contact__r.Email
```

### User and Profile Fields

```javascript
// Current user
$User.Id
$User.Profile.Name
$User.UserRole.Name
$User.Email

// Owner
Owner.Profile.Name
Owner.UserRole.Name
```

### Record Type

```javascript
// By Name
RecordType.Name = "Enterprise"

// By DeveloperName (recommended)
RecordType.DeveloperName = "Enterprise_Account"

// Check ID
RecordTypeId = "012000000000000AAA"
```

---

## System Variables

### $User

```javascript
$User.Id
$User.Username
$User.FirstName
$User.LastName
$User.Email
$User.Profile.Name
$User.UserRole.Name
$User.IsActive
```

### $Profile

```javascript
$Profile.Name
$Profile.Id
```

### $Permission

```javascript
$Permission.Custom_Permission_Name
```

### $Setup (Custom Settings)

```javascript
$Setup.My_Settings__c.Field__c
```

### $Label (Custom Labels)

```javascript
$Label.Error_Message_Label
```

---

## Performance Best Practices

### Optimize Formula Length

```javascript
// ❌ Verbose
AND(
  NOT(ISBLANK(Field1__c)),
  NOT(ISBLANK(Field2__c)),
  NOT(ISBLANK(Field3__c)),
  NOT(ISBLANK(Field4__c))
)

// ✅ Optimized with OR
NOT(
  OR(
    ISBLANK(Field1__c),
    ISBLANK(Field2__c),
    ISBLANK(Field3__c),
    ISBLANK(Field4__c)
  )
)
```

### Avoid Redundant Checks

```javascript
// ❌ Redundant
AND(
  NOT(ISBLANK(Amount)),
  Amount > 0,
  Amount <> NULL
)

// ✅ Simplified
AND(
  NOT(ISBLANK(Amount)),
  Amount > 0
)
```

### Use CASE() for Multiple Value Checks

```javascript
// ❌ Multiple ORs
OR(
  ISPICKVAL(Status, "A"),
  ISPICKVAL(Status, "B"),
  ISPICKVAL(Status, "C")
)

// ✅ CASE approach
CASE(TEXT(Status),
  "A", true,
  "B", true,
  "C", true,
  false
)
```
