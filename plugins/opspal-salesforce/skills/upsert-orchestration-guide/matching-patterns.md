# Matching Patterns

Detailed SOQL patterns and matching logic for Lead/Contact/Account upsert operations.

## Pre-Match Normalization

### Email Normalization
```javascript
const normalizeEmail = (email) => {
    if (!email) return null;
    return email.toLowerCase().trim();
};
```

### Phone Normalization
```javascript
const normalizePhone = (phone) => {
    if (!phone) return null;
    // Extract last 10 digits
    const digits = phone.replace(/\D/g, '');
    return digits.slice(-10);
};
```

### Company Name Normalization
```javascript
const normalizeCompany = (company) => {
    if (!company) return null;
    return company
        .toLowerCase()
        .replace(/\b(inc|llc|ltd|corp|corporation|co|company)\b\.?/gi, '')
        .replace(/[^\w\s]/g, '')
        .trim();
};
```

---

## SOQL Matching Patterns

### Pattern 1: Unique Identifier Match

**By Salesforce ID:**
```sql
SELECT Id, Name, Email, Company, OwnerId, LastModifiedDate
FROM Lead
WHERE Id = '00QXX000000XXXX'
```

**By External ID:**
```sql
SELECT Id, Name, Email, Company, External_ID__c, OwnerId
FROM Lead
WHERE External_ID__c = 'EXT-12345'
```

**By Email (exact):**
```sql
SELECT Id, Name, Email, Company, OwnerId, IsConverted
FROM Lead
WHERE Email = 'john.doe@acme.com'
AND IsConverted = false
```

### Pattern 2: Composite Field Match

**Company + State + Phone:**
```sql
SELECT Id, Name, Email, Company, State, Phone, OwnerId
FROM Lead
WHERE Company LIKE 'Acme%'
AND State = 'CA'
AND Phone LIKE '%5551234567%'
AND IsConverted = false
```

### Pattern 3: Domain-Based Lead-to-Account

**Extract domain, match Account:**
```sql
-- Step 1: Get input email domain
-- Input: john@acme.com → Domain: acme.com

-- Step 2: Find matching Account
SELECT Id, Name, Website, OwnerId, BillingState
FROM Account
WHERE Website LIKE '%acme.com%'
OR Website LIKE '%acme.com'
```

### Pattern 4: Cross-Object Duplicate Detection

**Check Lead, Contact, and Person Account:**
```sql
-- Check Lead
SELECT Id, Name, Email, 'Lead' as ObjectType
FROM Lead
WHERE Email = 'john@acme.com'
AND IsConverted = false

UNION ALL

-- Check Contact
SELECT Id, Name, Email, 'Contact' as ObjectType
FROM Contact
WHERE Email = 'john@acme.com'

-- Note: UNION ALL not supported in SOQL
-- Run as separate queries and combine results
```

### Pattern 5: Fuzzy Name Matching

**Use SOQL LIKE with wildcards for partial matches:**
```sql
-- First name variations
SELECT Id, Name, Email, Company
FROM Lead
WHERE FirstName LIKE 'Jon%'  -- Matches Jon, John, Jonathan
AND LastName = 'Smith'
AND Email LIKE '%@acme.com'
```

---

## Match Confidence Scoring

### Scoring Matrix

| Match Type | Base Score | Modifiers |
|------------|------------|-----------|
| Salesforce ID | 100 | None |
| External ID | 100 | None |
| Email (exact) | 100 | -5 if common domain (gmail, yahoo) |
| Company + State + Phone | 90 | +5 if name matches |
| Company + State | 75 | +10 if phone matches |
| Email domain + Company | 80 | +10 if state matches |
| Fuzzy name | 70 | Based on Levenshtein score |

### Confidence Thresholds

```javascript
const THRESHOLDS = {
    HIGH_CONFIDENCE: 90,   // Auto-update
    MEDIUM_CONFIDENCE: 75, // Auto-update with logging
    LOW_CONFIDENCE: 60,    // Manual review
    NO_MATCH: 0            // Create new
};
```

---

## Cross-Object Deduplication Logic

### Decision Tree

```
Input: john@acme.com, Acme Corp

1. Check existing Lead with email
   ├── Found unconverted Lead → UPDATE Lead
   └── No Lead found → Continue

2. Check existing Contact with email
   ├── Found Contact → Log duplicate, SKIP or UPDATE
   └── No Contact found → Continue

3. Check Account by domain/company
   ├── Found Account → CREATE Contact under Account
   └── No Account found → Continue

4. No matches
   └── CREATE new Lead
```

### Merge Priority Rules

| Scenario | Action |
|----------|--------|
| Lead exists, not converted | Update Lead |
| Contact exists | Skip (or update if configured) |
| Account exists, no Contact | Create Contact under Account |
| Multiple matches | Queue for manual review |
| No matches | Create new Lead |

---

## Batch Matching for Large Imports

### Query Optimization

**Batch emails for IN clause:**
```sql
SELECT Id, Name, Email, Company, OwnerId
FROM Lead
WHERE Email IN ('a@acme.com', 'b@acme.com', 'c@acme.com', ... /* up to 100 */)
AND IsConverted = false
```

**Maximum batch size:** 100 values per IN clause

### Chunking Strategy

```javascript
const BATCH_SIZE = 100;

async function batchMatch(records) {
    const results = [];

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const emails = batch.map(r => r.Email).filter(Boolean);

        const matches = await queryByEmails(emails);
        results.push(...processMatches(batch, matches));
    }

    return results;
}
```

---

## Special Matching Scenarios

### Personal Email Domains

**Flag for review instead of auto-matching:**
```javascript
const PERSONAL_DOMAINS = [
    'gmail.com', 'yahoo.com', 'hotmail.com',
    'outlook.com', 'aol.com', 'icloud.com'
];

const isPersonalEmail = (email) => {
    const domain = email.split('@')[1]?.toLowerCase();
    return PERSONAL_DOMAINS.includes(domain);
};

// Personal emails with same address → MANUAL_REVIEW
// Business emails with same address → AUTO_MATCH
```

### Parent-Child Company Matching

**Handle subsidiaries:**
```sql
SELECT Id, Name, Website, ParentId, Parent.Name
FROM Account
WHERE Website LIKE '%acme%'
OR Parent.Website LIKE '%acme%'
```

### Contact Role Matching

**Match Contact to existing Account relationship:**
```sql
SELECT Id, ContactId, AccountId, Role
FROM AccountContactRelation
WHERE ContactId IN (
    SELECT Id FROM Contact WHERE Email = 'john@acme.com'
)
```
