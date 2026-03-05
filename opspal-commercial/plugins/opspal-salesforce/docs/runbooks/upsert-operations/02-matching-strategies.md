# 02 - Matching Strategies

Comprehensive guide to record matching for Lead, Contact, and Account upsert operations.

## Matching Priority Waterfall

The matching engine uses a 7-level priority waterfall:

```
Priority 1: Salesforce ID        (100% confidence)
     │
     ▼
Priority 2: External ID          (100% confidence)
     │
     ▼
Priority 3: Email Exact          (95% confidence)
     │
     ▼
Priority 4: Composite Key        (85%+ confidence)
     │
     ▼
Priority 5: Fuzzy Match          (75%+ confidence)
     │
     ▼
Priority 6: Domain Match         (70%+ confidence)
     │
     ▼
Priority 7: No Match             (CREATE NEW)
```

## Strategy Details

### 1. Salesforce ID Match

**When it applies:** Input contains valid Salesforce ID

```javascript
// ID format validation
const isValidSFId = (id) => {
    return id && /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(id);
};
```

**Confidence:** 100%
**Action:** Direct UPDATE

### 2. External ID Match

**When it applies:** Organization uses External ID field

```sql
-- Query by External ID
SELECT Id, Name, Email
FROM Lead
WHERE External_ID__c = 'EXT-12345'
```

**Configuration:**
```json
{
  "matching": {
    "externalIdField": {
      "Lead": "External_ID__c",
      "Contact": "External_ID__c",
      "Account": "External_Account_ID__c"
    }
  }
}
```

**Confidence:** 100%
**Action:** Direct UPDATE

### 3. Email Exact Match

**When it applies:** Email is present and properly formatted

```javascript
const matchByEmail = async (email, objectType) => {
    const normalizedEmail = email.toLowerCase().trim();

    const query = `
        SELECT Id, Email, Name
        FROM ${objectType}
        WHERE Email = '${normalizedEmail}'
        ${objectType === 'Lead' ? 'AND IsConverted = false' : ''}
        LIMIT 1
    `;

    return await executeQuery(query);
};
```

**Cross-Object Dedup:**
When matching Leads, also check for existing Contacts with same email.

```javascript
const crossObjectMatch = async (email) => {
    // Check Lead first
    let match = await matchByEmail(email, 'Lead');
    if (match) return { object: 'Lead', record: match };

    // Then check Contact
    match = await matchByEmail(email, 'Contact');
    if (match) return { object: 'Contact', record: match };

    return null;
};
```

**Confidence:** 95%
**Action:** UPDATE existing Lead or flag existing Contact

### 4. Composite Key Match

**When it applies:** No email but multiple identifying fields present

```javascript
const COMPOSITE_KEYS = {
    Lead: ['Company', 'State', 'Phone'],
    Contact: ['FirstName', 'LastName', 'AccountId'],
    Account: ['Name', 'BillingState', 'Phone']
};

const buildCompositeQuery = (record, objectType) => {
    const keys = COMPOSITE_KEYS[objectType];
    const conditions = keys
        .filter(k => record[k])
        .map(k => `${k} = '${escapeSOQL(record[k])}'`)
        .join(' AND ');

    return `SELECT Id FROM ${objectType} WHERE ${conditions}`;
};
```

**Confidence:** 85%+ (requires all keys to match)
**Action:** UPDATE if single match, REVIEW if multiple matches

### 5. Fuzzy Match

**When it applies:** Exact matches fail but similar records exist

```javascript
const fuzzyMatch = (input, candidates, threshold = 0.75) => {
    const results = candidates.map(candidate => ({
        record: candidate,
        score: calculateSimilarity(input, candidate)
    }));

    return results
        .filter(r => r.score >= threshold)
        .sort((a, b) => b.score - a.score);
};
```

**Similarity Algorithms:**

| Algorithm | Use Case | Performance |
|-----------|----------|-------------|
| Jaro-Winkler | Person names | Fast |
| Levenshtein | Short strings | Medium |
| Soundex | Phonetic matching | Fast |
| TF-IDF | Company names | Slow |

**Recommended Approach:**
```javascript
const calculateSimilarity = (record1, record2) => {
    const weights = {
        name: 0.4,
        company: 0.3,
        phone: 0.2,
        state: 0.1
    };

    let score = 0;

    if (record1.Name && record2.Name) {
        score += jaroWinkler(record1.Name, record2.Name) * weights.name;
    }

    if (record1.Company && record2.Company) {
        score += normalizedLevenshtein(
            normalizeCompany(record1.Company),
            normalizeCompany(record2.Company)
        ) * weights.company;
    }

    // ... additional fields

    return score;
};
```

**Confidence:** 75%+ (configurable threshold)
**Action:** UPDATE if high confidence, REVIEW if borderline

### 6. Domain Match (Lead-to-Account)

**When it applies:** Lead email domain matches Account website

```javascript
const COMMON_EMAIL_PROVIDERS = new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'aol.com', 'icloud.com', 'mail.com', 'protonmail.com'
]);

const matchLeadToAccount = async (lead) => {
    if (!lead.Email) return null;

    const domain = lead.Email.split('@')[1];

    // Skip common providers
    if (COMMON_EMAIL_PROVIDERS.has(domain)) {
        return null;
    }

    // Query Account by domain
    const query = `
        SELECT Id, Name, Website, OwnerId
        FROM Account
        WHERE Website LIKE '%${domain}%'
        LIMIT 5
    `;

    const accounts = await executeQuery(query);

    if (accounts.length === 1) {
        return { account: accounts[0], confidence: 0.85 };
    } else if (accounts.length > 1) {
        return { accounts, confidence: 0.70, needsReview: true };
    }

    return null;
};
```

**Confidence:** 70-85% (depends on uniqueness)
**Action:** CREATE Contact under Account or REVIEW if multiple matches

## Configuration

### Threshold Settings

```json
{
  "matching": {
    "thresholds": {
      "exactMatch": 1.0,
      "highConfidence": 0.85,
      "fuzzyMatch": 0.75,
      "domainMatch": 0.70,
      "reviewThreshold": 0.60
    },
    "crossObjectDedup": true,
    "domainMatchEnabled": true,
    "fuzzyMatchEnabled": true
  }
}
```

### Adjusting Thresholds

| Scenario | Recommended Adjustment |
|----------|----------------------|
| High duplicate risk | Raise thresholds (0.80+) |
| Data quality issues | Lower thresholds (0.70) |
| Conservative approach | Raise review threshold |
| Aggressive matching | Lower fuzzy threshold |

## Type 1/2 Error Prevention

### Type 1 Error (False Positive)
**Problem:** Matching two distinct people/companies as one
**Impact:** Data corruption, merged records incorrectly

**Prevention:**
- Use multiple matching fields
- Require minimum confidence threshold
- Flag borderline matches for review

### Type 2 Error (False Negative)
**Problem:** Failing to match the same person/company
**Impact:** Duplicate records created

**Prevention:**
- Use fuzzy matching as fallback
- Normalize data before matching
- Consider domain-based matching

### Balancing Strategy

```
                    ┌─────────────────────────────────┐
                    │       THRESHOLD SETTING         │
                    ├─────────────────────────────────┤
        HIGH ◄──────│ 0.90+ = Conservative           │
                    │   • Low Type 1 (few bad merges) │
                    │   • High Type 2 (more dups)     │
                    ├─────────────────────────────────┤
      MEDIUM ◄──────│ 0.75-0.85 = Balanced           │
                    │   • Moderate both error types   │
                    │   • Good for most use cases     │
                    ├─────────────────────────────────┤
         LOW ◄──────│ 0.60-0.75 = Aggressive         │
                    │   • High Type 1 (more bad merges)│
                    │   • Low Type 2 (fewer dups)     │
                    └─────────────────────────────────┘
```

## Handling Multiple Matches

When matching returns multiple candidates:

```javascript
const handleMultipleMatches = (matches, threshold) => {
    // If top match significantly better, use it
    if (matches.length >= 2) {
        const gap = matches[0].score - matches[1].score;
        if (gap >= 0.15 && matches[0].score >= threshold) {
            return { action: 'MATCH', record: matches[0].record };
        }
    }

    // Otherwise flag for review
    return {
        action: 'REVIEW',
        candidates: matches,
        reason: 'Multiple potential matches'
    };
};
```

## Cross-Object Matching Flow

```
                    ┌───────────────┐
                    │  INPUT LEAD   │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ MATCH LEAD?   │
                    └───────┬───────┘
                       ▼         ▼
                     YES        NO
                      │          │
                      ▼          ▼
              ┌───────────┐  ┌───────────────┐
              │ UPDATE    │  │ MATCH CONTACT?│
              │ LEAD      │  └───────┬───────┘
              └───────────┘     ▼         ▼
                              YES        NO
                               │          │
                               ▼          ▼
                       ┌───────────┐  ┌───────────────┐
                       │ FLAG:     │  │ MATCH ACCOUNT?│
                       │ CONTACT   │  │ (by domain)   │
                       │ EXISTS    │  └───────┬───────┘
                       └───────────┘     ▼         ▼
                                       YES        NO
                                        │          │
                                        ▼          ▼
                                ┌───────────┐  ┌───────────┐
                                │ CREATE    │  │ CREATE    │
                                │ CONTACT   │  │ LEAD      │
                                │ UNDER     │  │ NEW       │
                                │ ACCOUNT   │  └───────────┘
                                └───────────┘
```

## Performance Considerations

### Query Optimization

```sql
-- Use indexed fields
SELECT Id, Email, Company
FROM Lead
WHERE Email IN :emailList
  AND IsConverted = false
LIMIT 1000

-- Avoid LIKE on non-indexed fields
-- ❌ WHERE Company LIKE '%Acme%'
-- ✅ WHERE Company = 'Acme Corporation'
```

### Batch Matching

```javascript
const batchMatch = async (records, batchSize = 200) => {
    // Collect all emails for batch query
    const emails = records
        .map(r => r.Email?.toLowerCase())
        .filter(Boolean);

    // Single query for all emails
    const existingLeads = await queryByEmails(emails);

    // Build lookup map
    const emailMap = new Map();
    existingLeads.forEach(lead => {
        emailMap.set(lead.Email.toLowerCase(), lead);
    });

    // Match each record
    return records.map(record => {
        const email = record.Email?.toLowerCase();
        return {
            record,
            match: email ? emailMap.get(email) : null
        };
    });
};
```

## Testing Matching Logic

### Unit Test Cases

```javascript
describe('UpsertMatcher', () => {
    it('matches by exact email', async () => {
        const result = await matcher.match({
            Email: 'john@acme.com'
        });
        expect(result.matchType).toBe('EMAIL_EXACT');
        expect(result.confidence).toBe(0.95);
    });

    it('matches by domain to Account', async () => {
        const result = await matcher.match({
            Email: 'jane@bigcorp.com'
        });
        expect(result.matchType).toBe('DOMAIN_MATCH');
        expect(result.accountId).toBeDefined();
    });

    it('flags multiple matches for review', async () => {
        const result = await matcher.match({
            Company: 'Smith Inc',
            State: 'CA'
        });
        expect(result.action).toBe('REVIEW');
        expect(result.candidates.length).toBeGreaterThan(1);
    });
});
```

## Related Sections

- [01 - Upsert Fundamentals](01-upsert-fundamentals.md)
- [03 - Field Mapping Rules](03-field-mapping-rules.md)
- [06 - Lead Auto-Conversion](06-lead-auto-conversion.md)

---
Next: [03 - Field Mapping Rules](03-field-mapping-rules.md)
