# 03 - NULL Handling Patterns

## Purpose

Establish consistent patterns for handling NULL values in queries, calculations, and reports to prevent data integrity issues.

## The NULL Problem

From reflection data: "NULL value handling in data calculations excludes records inconsistently, causing mathematical integrity failures."

### Common NULL Issues

| Issue | Impact | Prevention |
|-------|--------|------------|
| NULL in aggregations | Silently excluded from COUNT | Use `COUNT(Id)` not `COUNT(field)` |
| NULL in comparisons | `NULL != 'value'` is FALSE | Add explicit NULL checks |
| NULL in formulas | Propagates through calculations | Use `NVL()` or `NULLVALUE()` |
| NULL in filters | Unexpected exclusions | Use `= NULL` carefully |

## SOQL NULL Handling

### Aggregation Pitfalls

```sql
-- WRONG: Counts only records where Amount is not NULL
SELECT COUNT(Amount) FROM Opportunity

-- RIGHT: Counts all records
SELECT COUNT(Id) FROM Opportunity

-- RIGHT: Explicitly count non-NULL values when intended
SELECT
  COUNT(Id) TotalOpportunities,
  COUNT(Amount) OpportunitiesWithAmount,
  (COUNT(Id) - COUNT(Amount)) OpportunitiesMissingAmount
FROM Opportunity
```

### Comparison Pitfalls

```sql
-- WRONG: Excludes records where Type is NULL
SELECT Id FROM Account WHERE Type != 'Customer'

-- RIGHT: Explicitly include NULL values
SELECT Id FROM Account WHERE (Type != 'Customer' OR Type = NULL)

-- ALTERNATIVE: Use NOT operator pattern
SELECT Id FROM Account WHERE NOT(Type = 'Customer')
```

### Safe NULL Handling in Filters

```sql
-- Safe pattern for nullable fields
SELECT Id, Name, Industry
FROM Account
WHERE
  (Industry = 'Technology' OR Industry = NULL)
  AND IsActive__c = true

-- Using INCLUDES for multi-select with NULL safety
SELECT Id, Name
FROM Lead
WHERE Industry INCLUDES ('Manufacturing')
   OR Industry = NULL
```

## Formula NULL Handling

### NULLVALUE() Function

```
// Returns replacement if field is NULL
NULLVALUE(Amount, 0)

// Chain for multiple fields
NULLVALUE(Custom_Amount__c, NULLVALUE(Amount, 0))
```

### BLANKVALUE() Function

```
// Works for text fields (NULL or empty string)
BLANKVALUE(Description, 'No description provided')

// Use for default text values
BLANKVALUE(Industry, 'Unknown')
```

### NVL() in Calculated Fields

```
// Calculate total with NULL safety
NVL(Base_Amount__c, 0) + NVL(Additional_Amount__c, 0) + NVL(Tax__c, 0)
```

### ISBLANK() vs ISNULL()

```
// ISBLANK: True if NULL or empty string (recommended for text)
IF(ISBLANK(Description), 'Empty', 'Has Content')

// ISNULL: True only if NULL (use for numbers, dates)
IF(ISNULL(Amount), 0, Amount)

// For picklists: Use TEXT() comparison
IF(TEXT(Status) = '', 'No Status', TEXT(Status))
```

## Calculation Integrity Patterns

### Pattern 1: Sum Validation

Ensure `Total = Sum of Parts`:

```sql
-- Check mathematical integrity
SELECT
  Id,
  Amount,
  LineItem_Total__c,
  ABS(Amount - LineItem_Total__c) AS Discrepancy
FROM Opportunity
WHERE Amount != LineItem_Total__c
  AND Amount != NULL
  AND LineItem_Total__c != NULL
```

### Pattern 2: NULL-Safe Aggregations

```javascript
// In JavaScript processing
function calculateTotal(records, field) {
  return records.reduce((sum, record) => {
    const value = record[field];
    // Explicitly handle NULL/undefined
    if (value === null || value === undefined) {
      console.warn(`NULL ${field} found in record ${record.Id}`);
      return sum; // Skip NULL values
    }
    return sum + Number(value);
  }, 0);
}
```

### Pattern 3: Missing Value Reporting

```sql
-- Generate NULL value report
SELECT
  'Account' ObjectType,
  COUNT(Id) Total,
  SUM(CASE WHEN Industry = NULL THEN 1 ELSE 0 END) Industry_NULL,
  SUM(CASE WHEN Phone = NULL THEN 1 ELSE 0 END) Phone_NULL,
  SUM(CASE WHEN Website = NULL THEN 1 ELSE 0 END) Website_NULL
FROM Account

UNION ALL

SELECT
  'Contact' ObjectType,
  COUNT(Id) Total,
  SUM(CASE WHEN Email = NULL THEN 1 ELSE 0 END) Email_NULL,
  SUM(CASE WHEN Phone = NULL THEN 1 ELSE 0 END) Phone_NULL,
  SUM(CASE WHEN MailingCity = NULL THEN 1 ELSE 0 END) MailingCity_NULL
FROM Contact
```

## Report NULL Handling

### Dashboard Considerations

| Scenario | Recommendation |
|----------|----------------|
| Pie chart with NULL values | Create "Unknown" bucket |
| Bar chart metrics | Exclude or footnote NULL exclusions |
| KPI calculations | Use formulas with NULLVALUE() |
| Trend analysis | Interpolate or highlight gaps |

### Report Filter Best Practices

```
-- Show all records including NULL
Field equals [value] OR Field equals NULL

-- Explicitly exclude NULL
Field not equal to NULL

-- Show only NULL records
Field equals NULL
```

## Validation Rule NULL Patterns

### Preventing NULL on Required Business Fields

```
// Require Amount when Stage is Closed Won
AND(
  ISPICKVAL(StageName, 'Closed Won'),
  ISNULL(Amount)
)
```

### Conditional NULL Allowance

```
// Allow NULL only for specific record types
AND(
  RecordType.Name != 'Draft',
  ISBLANK(Description)
)
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Implicit NULL Exclusion

```sql
-- BAD: Silently excludes NULL Amounts
SELECT AVG(Amount) FROM Opportunity

-- GOOD: Explicit about NULL handling
SELECT
  AVG(Amount) AvgWithValues,
  COUNT(Id) TotalRecords,
  COUNT(Amount) RecordsWithAmount
FROM Opportunity
```

### Anti-Pattern 2: Double Negatives with NULL

```sql
-- BAD: Confusing logic
SELECT Id FROM Lead WHERE NOT(Status != 'Qualified')

-- GOOD: Clear intent
SELECT Id FROM Lead WHERE Status = 'Qualified' OR Status = NULL
```

### Anti-Pattern 3: Assuming NULL = Empty String

```javascript
// BAD: Misses NULL values
if (record.Description === '') { ... }

// GOOD: Handles both NULL and empty
if (!record.Description) { ... }

// BEST: Explicit checks
if (record.Description === null || record.Description === '') { ... }
```

## Success Criteria

- [ ] All aggregation queries explicitly handle NULL
- [ ] Calculation formulas use NULLVALUE()/BLANKVALUE()
- [ ] Reports document NULL exclusion behavior
- [ ] Mathematical integrity checks (Total = Sum) pass 100%
- [ ] NULL handling patterns documented in code reviews
