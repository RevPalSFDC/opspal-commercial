# 01 - Upsert Fundamentals

Understanding when and how to use upsert operations for Lead, Contact, and Account records.

## What is an Upsert?

An **upsert** (update + insert) is a database operation that:
1. Checks if a record exists based on matching criteria
2. **Updates** the existing record if found
3. **Creates** a new record if not found

This atomic operation prevents duplicates while ensuring data completeness.

## Upsert vs Insert vs Update

| Operation | Behavior | Duplicate Risk | Use When |
|-----------|----------|----------------|----------|
| **Insert** | Always creates new record | High | You know record doesn't exist |
| **Update** | Only updates existing record | None | You have record ID |
| **Upsert** | Creates or updates based on match | Low | You have matching key but not ID |

### When to Use Upsert

✅ **Use upsert when:**
- Importing data from external systems
- Processing webhook events
- Syncing data between platforms
- Processing form submissions
- Bulk data loads without IDs

❌ **Don't use upsert when:**
- You already have the Salesforce ID (use Update)
- You've verified record doesn't exist (use Insert)
- Performance is critical and match is expensive

## Object Relationships

### Lead → Contact → Account

```
External Source
       │
       ▼
    ┌─────┐
    │ LEAD │ ─── Unqualified prospect
    └──┬──┘
       │
       │ CONVERT
       ▼
    ┌─────────┐         ┌─────────┐
    │ CONTACT │ ◄─────► │ ACCOUNT │
    └─────────┘         └─────────┘
         │
         │ Primary Contact
         ▼
    ┌─────────────┐
    │ OPPORTUNITY │
    └─────────────┘
```

### Key Relationships

| Relationship | Cardinality | Notes |
|--------------|-------------|-------|
| Account → Contacts | 1:N | Account can have many Contacts |
| Lead → Account | 1:0..1 | Lead may match existing Account |
| Lead → Contact | 1:0..1 | Lead may match existing Contact |
| Contact → Account | N:1 | Contact must belong to Account |

## Upsert Workflow

### Standard Upsert Flow

```
1. RECEIVE INPUT RECORD
         │
         ▼
2. NORMALIZE DATA
   • Lowercase email
   • Normalize phone
   • Clean company name
         │
         ▼
3. MULTI-PASS MATCHING
   • Pass 1: Exact ID match
   • Pass 2: Email match
   • Pass 3: Composite match
   • Pass 4: Fuzzy match
   • Pass 5: Domain match
         │
         ▼
4. DETERMINE ACTION
   ├─► MATCH (>75%) → UPDATE existing
   ├─► PARTIAL (<75%) → FLAG for review
   └─► NO MATCH → CREATE new
         │
         ▼
5. APPLY FIELD MAPPINGS
   • Transform values
   • Handle nulls
   • Set defaults
         │
         ▼
6. EXECUTE DML
   • Update or Insert
   • Capture result
         │
         ▼
7. POST-PROCESSING
   • Assign ownership
   • Enrich data
   • Check conversion
```

## Matching Keys

### External ID Fields

Salesforce supports **External ID** fields for efficient upsert:

```apex
// Upsert by External ID
Account[] accts = new Account[]{
    new Account(External_ID__c = 'ABC123', Name = 'Acme Corp')
};
upsert accts External_ID__c;
```

**Benefits of External ID:**
- Indexed for fast lookups
- Unique constraint prevents duplicates
- Avoids multi-pass matching overhead

### Composite Keys

When no single field is unique, use composite matching:

```javascript
// Composite key example
const compositeKey = `${record.Company}|${record.State}|${record.Phone}`;
```

**Common composite keys:**
- Lead: `Company + State + Phone`
- Contact: `Email + AccountId`
- Account: `Name + BillingState + Website`

## Batch Processing

### Optimal Batch Sizes

| Object | Records/Batch | Reason |
|--------|---------------|--------|
| Lead | 200 | Standard DML limit |
| Contact | 200 | Standard DML limit |
| Account | 200 | Standard DML limit |
| Mixed | 50 | Cross-object matching overhead |
| With Enrichment | 50 | API rate limits |

### Chunking Strategy

```javascript
const BATCH_SIZE = 200;
const chunks = [];

for (let i = 0; i < records.length; i += BATCH_SIZE) {
    chunks.push(records.slice(i, i + BATCH_SIZE));
}

for (const chunk of chunks) {
    await processChunk(chunk);
    // Optional: delay between chunks
    await delay(1000);
}
```

## Idempotency

### What is Idempotency?

An operation is **idempotent** if executing it multiple times produces the same result as executing it once.

### Ensuring Idempotency

1. **Use Operation IDs**
   ```javascript
   const operationId = generateUUID();
   // Store operation ID with results
   // Check for existing operation ID before re-processing
   ```

2. **Track Processed Records**
   ```javascript
   const processedSet = new Set();
   for (const record of records) {
       const key = getUniqueKey(record);
       if (processedSet.has(key)) continue;
       processedSet.add(key);
       // Process record
   }
   ```

3. **Use External IDs**
   - Salesforce upsert with External ID is inherently idempotent

## Data Quality Considerations

### Pre-Upsert Validation

| Check | Purpose | Action on Failure |
|-------|---------|-------------------|
| Required fields | Ensure completeness | Add to error queue |
| Email format | Prevent invalid data | Skip or flag |
| Phone format | Normalize input | Transform or skip |
| Company name | Enable matching | Normalize |

### Data Transformation

```javascript
// Standard transformations before upsert
const transformRecord = (record) => ({
    ...record,
    Email: record.Email?.toLowerCase().trim(),
    Phone: normalizePhone(record.Phone),
    Company: normalizeCompany(record.Company),
    Website: normalizeUrl(record.Website)
});
```

## Performance Optimization

### Query Optimization

```sql
-- Use indexed fields in WHERE clause
SELECT Id, Email, Company
FROM Lead
WHERE Email IN :emailList
  AND IsConverted = false

-- Use selective filters first
SELECT Id
FROM Account
WHERE Website IN :domainList
  AND IsDeleted = false
```

### Caching Strategies

```javascript
// Cache Account lookups by domain
const accountCache = new Map();

const getAccountByDomain = async (domain) => {
    if (accountCache.has(domain)) {
        return accountCache.get(domain);
    }
    const account = await queryAccountByDomain(domain);
    accountCache.set(domain, account);
    return account;
};
```

## Security Considerations

### Field-Level Security

Always respect FLS in upsert operations:

```javascript
// Check field accessibility before upsert
const accessibleFields = await getAccessibleFields('Lead');
const filteredRecord = filterToAccessibleFields(record, accessibleFields);
```

### Sharing Rules

- Upserted records inherit sharing from owner
- Consider using `without sharing` only when necessary
- Log all operations for audit trail

## Related Sections

- [02 - Matching Strategies](02-matching-strategies.md)
- [03 - Field Mapping Rules](03-field-mapping-rules.md)
- [07 - Error Handling](07-error-handling.md)

---
Next: [02 - Matching Strategies](02-matching-strategies.md)
