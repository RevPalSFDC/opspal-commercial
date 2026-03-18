# Validation Rule Template Catalog

Complete reference of 30 validation rule templates organized by category.

## Template Index

| ID | Category | Template Name | Complexity |
|----|----------|---------------|------------|
| REQ-01 | Required Field | Conditional Required | Simple |
| REQ-02 | Required Field | Stage-Specific Required | Simple |
| REQ-03 | Required Field | Record Type Required | Simple |
| REQ-04 | Required Field | Multi-Condition Required | Moderate |
| REQ-05 | Required Field | Dependent Picklist Required | Moderate |
| FMT-01 | Data Format | Email Validation | Simple |
| FMT-02 | Data Format | Phone Format (US) | Simple |
| FMT-03 | Data Format | URL Validation | Moderate |
| FMT-04 | Data Format | SSN/Tax ID Format | Moderate |
| FMT-05 | Data Format | Custom Regex Pattern | Complex |
| BIZ-01 | Business Logic | Date Range Validation | Simple |
| BIZ-02 | Business Logic | Amount Limits | Simple |
| BIZ-03 | Business Logic | Status Transition Rules | Moderate |
| BIZ-04 | Business Logic | Percentage Sum Validation | Moderate |
| BIZ-05 | Business Logic | Conditional Amount Threshold | Complex |
| XOB-01 | Cross-Object | Parent Field Validation | Moderate |
| XOB-02 | Cross-Object | Credit Limit Check | Moderate |
| XOB-03 | Cross-Object | Account Status Gate | Moderate |
| XOB-04 | Cross-Object | Rollup Threshold | Complex |
| XOB-05 | Cross-Object | Multi-Level Hierarchy | Complex |
| DAT-01 | Date/Time | Future Date Required | Simple |
| DAT-02 | Date/Time | Business Hours Only | Moderate |
| DAT-03 | Date/Time | Date Sequence Validation | Simple |
| DAT-04 | Date/Time | Fiscal Year Constraint | Moderate |
| DAT-05 | Date/Time | SLA Deadline Validation | Complex |
| SEC-01 | Security | PII Protection | Moderate |
| SEC-02 | Security | Audit Field Lock | Simple |
| SEC-03 | Security | Approval Gate | Moderate |
| SEC-04 | Security | Owner Change Restriction | Moderate |
| SEC-05 | Security | Profile-Based Restriction | Complex |

---

## Required Field Templates

### REQ-01: Conditional Required

**Use Case**: Require a field when another field has a specific value.

```javascript
// Formula
AND(
  ISPICKVAL(Status__c, "Closed"),
  ISBLANK(Closure_Reason__c)
)

// Error Message
"Closure Reason is required when Status is Closed."

// Parameters
{
  "triggerField": "Status__c",
  "triggerValue": "Closed",
  "requiredField": "Closure_Reason__c"
}
```

### REQ-02: Stage-Specific Required

**Use Case**: Require fields at specific sales stages.

```javascript
// Formula
AND(
  OR(
    ISPICKVAL(StageName, "Proposal"),
    ISPICKVAL(StageName, "Negotiation"),
    ISPICKVAL(StageName, "Closed Won")
  ),
  ISBLANK(Primary_Contact__c)
)

// Error Message
"Primary Contact is required at Proposal stage and beyond."

// Parameters
{
  "stages": ["Proposal", "Negotiation", "Closed Won"],
  "requiredField": "Primary_Contact__c"
}
```

### REQ-03: Record Type Required

**Use Case**: Require fields only for specific record types.

```javascript
// Formula
AND(
  RecordType.DeveloperName = "Enterprise_Account",
  ISBLANK(Annual_Revenue__c)
)

// Error Message
"Annual Revenue is required for Enterprise Accounts."

// Parameters
{
  "recordType": "Enterprise_Account",
  "requiredField": "Annual_Revenue__c"
}
```

### REQ-04: Multi-Condition Required

**Use Case**: Require field when multiple conditions are met.

```javascript
// Formula
AND(
  ISPICKVAL(Type, "Customer"),
  ISPICKVAL(Industry, "Healthcare"),
  RecordType.DeveloperName = "Enterprise_Account",
  ISBLANK(Compliance_Contact__c)
)

// Error Message
"Compliance Contact is required for Healthcare Enterprise Customers."
```

### REQ-05: Dependent Picklist Required

**Use Case**: Require dependent picklist when controlling value is set.

```javascript
// Formula
AND(
  NOT(ISPICKVAL(Primary_Category__c, "")),
  ISPICKVAL(Sub_Category__c, "")
)

// Error Message
"Sub Category is required when Primary Category is selected."
```

---

## Data Format Templates

### FMT-01: Email Validation

**Use Case**: Validate email format.

```javascript
// Formula
AND(
  NOT(ISBLANK(Email)),
  NOT(REGEX(Email, "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"))
)

// Error Message
"Please enter a valid email address (e.g., user@example.com)."
```

### FMT-02: Phone Format (US)

**Use Case**: Validate US phone number format.

```javascript
// Formula
AND(
  NOT(ISBLANK(Phone)),
  NOT(REGEX(Phone, "^\\(?[0-9]{3}\\)?[-. ]?[0-9]{3}[-. ]?[0-9]{4}$"))
)

// Error Message
"Phone must be in format: (XXX) XXX-XXXX, XXX-XXX-XXXX, or XXX.XXX.XXXX"
```

### FMT-03: URL Validation

**Use Case**: Validate URL format.

```javascript
// Formula
AND(
  NOT(ISBLANK(Website)),
  NOT(REGEX(Website, "^(https?://)?([\\w-]+\\.)+[\\w-]+(/[\\w-./?%&=]*)?$"))
)

// Error Message
"Please enter a valid URL (e.g., https://www.example.com)."
```

### FMT-04: SSN/Tax ID Format

**Use Case**: Validate US Social Security Number format.

```javascript
// Formula
AND(
  NOT(ISBLANK(SSN__c)),
  NOT(REGEX(SSN__c, "^\\d{3}-\\d{2}-\\d{4}$"))
)

// Error Message
"SSN must be in format: XXX-XX-XXXX"
```

### FMT-05: Custom Regex Pattern

**Use Case**: Validate custom alphanumeric patterns.

```javascript
// Formula (Example: Part Number format ABC-12345)
AND(
  NOT(ISBLANK(Part_Number__c)),
  NOT(REGEX(Part_Number__c, "^[A-Z]{3}-\\d{5}$"))
)

// Error Message
"Part Number must be in format: ABC-12345 (3 letters, dash, 5 digits)."
```

---

## Business Logic Templates

### BIZ-01: Date Range Validation

**Use Case**: Ensure end date is after start date.

```javascript
// Formula
AND(
  NOT(ISBLANK(Start_Date__c)),
  NOT(ISBLANK(End_Date__c)),
  End_Date__c <= Start_Date__c
)

// Error Message
"End Date must be after Start Date."
```

### BIZ-02: Amount Limits

**Use Case**: Enforce minimum and maximum amounts.

```javascript
// Formula
AND(
  NOT(ISBLANK(Amount)),
  OR(
    Amount < 1000,
    Amount > 10000000
  )
)

// Error Message
"Amount must be between $1,000 and $10,000,000."
```

### BIZ-03: Status Transition Rules

**Use Case**: Prevent invalid status transitions.

```javascript
// Formula (Cannot skip from Qualification to Closed Won)
AND(
  ISCHANGED(StageName),
  ISPICKVAL(PRIORVALUE(StageName), "Qualification"),
  NOT(ISPICKVAL(StageName, "Needs Analysis"))
)

// Error Message
"From Qualification, you must move to Needs Analysis before other stages."
```

### BIZ-04: Percentage Sum Validation

**Use Case**: Ensure percentages sum to 100%.

```javascript
// Formula
AND(
  NOT(ISBLANK(Pct_Revenue_Recurring__c)),
  NOT(ISBLANK(Pct_Revenue_One_Time__c)),
  Pct_Revenue_Recurring__c + Pct_Revenue_One_Time__c <> 100
)

// Error Message
"Revenue percentages must sum to 100%."
```

### BIZ-05: Conditional Amount Threshold

**Use Case**: Enforce higher amounts for specific deal types.

```javascript
// Formula
AND(
  ISPICKVAL(Type, "Enterprise"),
  Amount < 50000
)

// Error Message
"Enterprise deals require a minimum amount of $50,000."
```

---

## Cross-Object Templates

### XOB-01: Parent Field Validation

**Use Case**: Validate based on parent record values.

```javascript
// Formula (Opportunity must have Account Industry set)
ISBLANK(Account.Industry)

// Error Message
"The parent Account must have an Industry before creating Opportunities."
```

### XOB-02: Credit Limit Check

**Use Case**: Prevent exceeding account credit limit.

```javascript
// Formula
AND(
  NOT(ISBLANK(Amount)),
  Amount > Account.Credit_Limit__c
)

// Error Message
"Order Amount ($" & TEXT(Amount) & ") exceeds Account credit limit ($" & TEXT(Account.Credit_Limit__c) & ")."
```

### XOB-03: Account Status Gate

**Use Case**: Block operations for inactive accounts.

```javascript
// Formula
AND(
  ISNEW(),
  Account.Status__c = "Inactive"
)

// Error Message
"Cannot create records for Inactive Accounts. Reactivate the Account first."
```

### XOB-04: Rollup Threshold

**Use Case**: Validate against rollup summary values.

```javascript
// Formula (Total line items must not exceed quote amount)
AND(
  NOT(ISBLANK(Amount)),
  Amount > Account.Total_Open_Quotes__c * 1.1
)

// Error Message
"Amount exceeds 110% of total open quotes for this Account."
```

### XOB-05: Multi-Level Hierarchy

**Use Case**: Validate against grandparent values.

```javascript
// Formula (Quote Line must respect Opportunity Account's limits)
Amount > SBQQ__Quote__r.SBQQ__Opportunity2__r.Account.Max_Line_Amount__c

// Error Message
"Line amount exceeds Account maximum allowed per line item."
```

---

## Date/Time Templates

### DAT-01: Future Date Required

**Use Case**: Ensure date is in the future.

```javascript
// Formula
AND(
  NOT(ISBLANK(Follow_Up_Date__c)),
  Follow_Up_Date__c <= TODAY()
)

// Error Message
"Follow Up Date must be in the future."
```

### DAT-02: Business Hours Only

**Use Case**: Restrict datetime to business hours.

```javascript
// Formula (8 AM - 6 PM only)
AND(
  NOT(ISBLANK(Scheduled_Call__c)),
  OR(
    HOUR(TIMEVALUE(Scheduled_Call__c)) < 8,
    HOUR(TIMEVALUE(Scheduled_Call__c)) >= 18
  )
)

// Error Message
"Scheduled calls must be between 8 AM and 6 PM."
```

### DAT-03: Date Sequence Validation

**Use Case**: Ensure dates follow logical sequence.

```javascript
// Formula
AND(
  NOT(ISBLANK(Contract_Start__c)),
  NOT(ISBLANK(Contract_End__c)),
  NOT(ISBLANK(Renewal_Date__c)),
  OR(
    Contract_End__c <= Contract_Start__c,
    Renewal_Date__c <= Contract_End__c
  )
)

// Error Message
"Dates must follow sequence: Start < End < Renewal."
```

### DAT-04: Fiscal Year Constraint

**Use Case**: Ensure date is within current fiscal year.

```javascript
// Formula (Assuming April fiscal year start)
AND(
  NOT(ISBLANK(Budget_Date__c)),
  OR(
    MONTH(Budget_Date__c) < 4 && YEAR(Budget_Date__c) < YEAR(TODAY()),
    MONTH(Budget_Date__c) >= 4 && YEAR(Budget_Date__c) > YEAR(TODAY())
  )
)

// Error Message
"Budget Date must be within the current fiscal year."
```

### DAT-05: SLA Deadline Validation

**Use Case**: Ensure SLA deadline is achievable.

```javascript
// Formula (Minimum 2 business days for response)
AND(
  NOT(ISBLANK(SLA_Deadline__c)),
  SLA_Deadline__c - TODAY() < 2
)

// Error Message
"SLA Deadline must be at least 2 days in the future."
```

---

## Security/Compliance Templates

### SEC-01: PII Protection

**Use Case**: Prevent certain data patterns in general fields.

```javascript
// Formula (Block SSN patterns in Description)
REGEX(Description, "\\d{3}-\\d{2}-\\d{4}")

// Error Message
"Do not enter Social Security Numbers in the Description field. Use the secure SSN field instead."
```

### SEC-02: Audit Field Lock

**Use Case**: Prevent changes to audit fields after creation.

```javascript
// Formula
AND(
  NOT(ISNEW()),
  ISCHANGED(Original_Amount__c)
)

// Error Message
"Original Amount cannot be modified after record creation."
```

### SEC-03: Approval Gate

**Use Case**: Require approval before certain status changes.

```javascript
// Formula
AND(
  ISPICKVAL(Status__c, "Approved"),
  NOT(Approval_Completed__c)
)

// Error Message
"Record must go through approval process before being marked Approved."
```

### SEC-04: Owner Change Restriction

**Use Case**: Restrict who can change record ownership.

```javascript
// Formula
AND(
  ISCHANGED(OwnerId),
  NOT($User.Profile.Name = "System Administrator"),
  NOT($User.Id = OwnerId)
)

// Error Message
"Only System Administrators can reassign record ownership."
```

### SEC-05: Profile-Based Restriction

**Use Case**: Allow certain actions only for specific profiles.

```javascript
// Formula
AND(
  ISPICKVAL(Status__c, "Closed Lost"),
  NOT(
    CONTAINS("System Administrator|Sales Manager|Finance", $Profile.Name)
  )
)

// Error Message
"Only Administrators, Sales Managers, or Finance can mark deals as Closed Lost."
```

---

## Using Templates

### Via Command

```bash
# Interactive wizard
/create-validation-rule

# Direct template application
/create-validation-rule --template REQ-01 --object Account --triggerField Status__c --triggerValue "Closed" --requiredField Closure_Reason__c
```

### Template Customization

1. Select base template matching your use case
2. Substitute field names and values
3. Adjust error message for your context
4. Test with sample data before deployment
5. Run impact analysis to check violation rate

### Best Practices

- Keep formulas under 5000 characters
- Use meaningful error messages with guidance
- Consider user experience in message tone
- Document business rationale in description
- Plan for exception handling (bypass fields)
