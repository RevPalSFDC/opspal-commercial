# Query Optimization Patterns

## SOQL Best Practices

### 1. Use Selective Filters

```sql
-- ❌ BAD: Non-selective (full table scan)
SELECT Id, Name FROM Account WHERE Type = 'Customer'

-- ✅ GOOD: Selective filter on indexed field
SELECT Id, Name FROM Account WHERE Id IN :accountIds AND Type = 'Customer'
```

### 2. Leverage Indexed Fields

**Standard Indexed Fields:**
- Id (always indexed)
- Name (standard objects)
- CreatedDate, LastModifiedDate
- SystemModstamp
- External ID fields
- Lookup/Master-Detail fields

**Check for Custom Indexes:**
```bash
node scripts/lib/org-metadata-cache.js query <org> Account | jq '.fields[] | select(.indexed == true) | .name'
```

### 3. Avoid Non-Selective Operators

```sql
-- ❌ BAD: Non-selective operators
WHERE Type != 'Customer'        -- Negative operators
WHERE Name LIKE '%test%'        -- Leading wildcard
WHERE Custom_Field__c = null    -- Null checks on non-indexed

-- ✅ GOOD: Selective patterns
WHERE Type = 'Prospect'         -- Positive equality
WHERE Name LIKE 'test%'         -- Trailing wildcard only
WHERE Custom_Field__c != null   -- Not null on indexed field
```

### 4. Query Optimization Checklist

| Check | Action |
|-------|--------|
| Index usage | Ensure WHERE clause uses indexed fields first |
| Selectivity | Filter should return <10% of records |
| LIKE patterns | No leading wildcards |
| NULL handling | Use indexed fields for null checks |
| Relationship queries | Limit depth to 5 levels |
| Large data volumes | Use LIMIT, pagination |

## Relationship Query Patterns

### Parent-to-Child (Subquery)
```sql
-- Get Accounts with related Contacts
SELECT Id, Name,
    (SELECT Id, Email FROM Contacts)
FROM Account
WHERE Industry = 'Technology'
```

### Child-to-Parent (Dot Notation)
```sql
-- Get Contacts with Account info
SELECT Id, Name, Account.Name, Account.Industry
FROM Contact
WHERE Account.Industry = 'Technology'
```

### Performance Tips
- Limit relationship depth to 5 levels
- Use selective filters at outer query
- Consider separate queries for complex scenarios

## Aggregate Functions

```sql
-- Count records efficiently
SELECT COUNT() FROM Account WHERE Industry = 'Technology'

-- Group and aggregate
SELECT Industry, COUNT(Id)
FROM Account
GROUP BY Industry
HAVING COUNT(Id) > 10
```

## Query Plan Analysis

```javascript
// Use Query Plan API in Apex
String query = 'SELECT Id FROM Account WHERE Industry = \'Technology\'';
List<Object> plans = Database.getQueryLocator(query).getQuery().explain();

// Check for full table scans
for (Object plan : plans) {
    Map<String, Object> planMap = (Map<String, Object>) plan;
    String operation = (String) planMap.get('operation');
    if (operation == 'TableScan') {
        System.debug('WARNING: Full table scan detected');
    }
}
```

## Pagination Patterns

### OFFSET-based (Simple, Limited)
```sql
SELECT Id, Name FROM Account
ORDER BY CreatedDate DESC
LIMIT 100 OFFSET 200
-- Note: OFFSET max is 2000
```

### Cursor-based (Scalable)
```sql
-- First page
SELECT Id, Name, CreatedDate FROM Account
WHERE CreatedDate > :lastCreatedDate
ORDER BY CreatedDate
LIMIT 100

-- Next pages use last record's CreatedDate
```
