# Matching Algorithms

## Clustering Methods

### Bundle A: SF-Anchored (Primary)

```yaml
Purpose: Group HubSpot companies linked to same Salesforce Account

Matching Field: salesforceaccountid

Process:
  1. Query all HS companies with salesforceaccountid populated
  2. Group by salesforceaccountid value
  3. Groups with >1 company = duplicate bundle

Example:
  Company "Acme Corp" (HS ID: 123) → SF Account: 001xxx
  Company "Acme Corporation" (HS ID: 456) → SF Account: 001xxx
  → Bundle A-001: [123, 456]
```

### Bundle B: HS-Only (Secondary)

```yaml
Purpose: Group HubSpot companies by normalized domain

Matching Field: Normalized domain from website/email

Normalization:
  1. Extract domain from website URL
  2. Remove www. and subdomains
  3. Lowercase
  4. Handle country TLDs (co.uk, com.au)

Example:
  "www.Acme.com" → "acme.com"
  "sales.acme.com" → "acme.com"
  "https://ACME.COM/about" → "acme.com"
```

### Domain Normalization

```javascript
const normalizeDomain = (input) => {
  if (!input) return null;

  // Extract domain from URL
  let domain = input
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .toLowerCase();

  // Handle email addresses
  if (domain.includes('@')) {
    domain = domain.split('@')[1];
  }

  // Remove subdomains (but keep country TLDs)
  const countryTLDs = ['co.uk', 'com.au', 'co.nz', 'co.jp'];
  for (const tld of countryTLDs) {
    if (domain.endsWith(tld)) {
      const parts = domain.replace(`.${tld}`, '').split('.');
      return `${parts[parts.length - 1]}.${tld}`;
    }
  }

  // Standard TLD handling
  const parts = domain.split('.');
  if (parts.length > 2) {
    return parts.slice(-2).join('.');
  }

  return domain;
};
```

## Conflict Detection

### Multi-SF Account Conflict

```yaml
Conflict Type: Company linked to multiple SF Accounts

Detection:
  - Query HS company history
  - Check for multiple salesforceaccountid values
  - Flag for manual review

Resolution:
  - Determine correct SF Account
  - May require SF-side merge first
```

### Domain Collision

```yaml
Conflict Type: Different SF Accounts share domain

Detection:
  - Different salesforceaccountid values
  - Same normalized domain

Examples:
  - Parent/subsidiary companies
  - Acquisitions
  - Franchise locations

Resolution:
  - Manual review required
  - May need to preserve separate companies
```

## Clustering Output

### Bundle Structure

```json
{
  "bundleId": "A-001",
  "type": "sf-anchored",
  "matchKey": "001xxx",
  "companies": [
    {
      "id": 123,
      "name": "Acme Corp",
      "domain": "acme.com",
      "salesforceaccountid": "001xxx",
      "contacts": 15,
      "deals": 3,
      "owner": "John Smith"
    },
    {
      "id": 456,
      "name": "Acme Corporation",
      "domain": "acme.com",
      "salesforceaccountid": "001xxx",
      "contacts": 8,
      "deals": 0,
      "owner": null
    }
  ],
  "analysis": {
    "duplicateConfidence": "HIGH",
    "recommendedCanonical": 123,
    "flags": []
  }
}
```

### Clustering Report

```csv
bundle_id,type,match_key,company_count,total_contacts,total_deals,flags
A-001,sf-anchored,001xxx,2,23,3,
A-002,sf-anchored,001yyy,3,45,7,
B-001,hs-only,acme.com,2,12,1,no_sf_link
B-002,hs-only,beta.io,4,28,5,domain_collision
```

## Matching Quality

### Confidence Levels

| Confidence | Criteria | Action |
|------------|----------|--------|
| HIGH | Same SF Account ID | Auto-merge |
| MEDIUM | Same domain, no SF ID | Review recommended |
| LOW | Fuzzy name match only | Manual review required |

### Fuzzy Matching (Optional)

```javascript
// For name-only matching (use cautiously)
const fuzzyMatch = (name1, name2) => {
  // Normalize
  const normalize = (s) => s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(inc|llc|corp|ltd|limited|company|co)$/g, '');

  const n1 = normalize(name1);
  const n2 = normalize(name2);

  // Exact match after normalization
  if (n1 === n2) return { match: true, confidence: 'HIGH' };

  // Levenshtein distance
  const distance = levenshtein(n1, n2);
  const similarity = 1 - (distance / Math.max(n1.length, n2.length));

  return {
    match: similarity > 0.85,
    confidence: similarity > 0.95 ? 'MEDIUM' : 'LOW',
    similarity
  };
};
```

## Person Name Matching (Contact/Lead Deduplication)

**CRITICAL**: For Contact/Lead name matching, use `PersonNameMatcher` instead of fuzzy matching.

### Why Not Standard Fuzzy Matching?

Standard fuzzy matching can produce false positives on person names:
- "Jeffrey Sudlow" vs "Jeffrey Spotts" → Standard fuzzy: ~70% match (FALSE POSITIVE)
- PersonNameMatcher: NO MATCH (correctly rejected - last names differ)

### PersonNameMatcher Features

| Feature | Description |
|---------|-------------|
| Component-level matching | First name and last name matched separately |
| Stricter thresholds | 80% first name, 85% last name (both required) |
| Nickname recognition | Jeff ↔ Jeffrey, Bill ↔ William, etc. |
| False positive prevention | Requires BOTH names to pass thresholds |

### Usage

```javascript
const { PersonNameMatcher } = require('../../../opspal-core/scripts/lib/person-name-matcher');

const nameMatcher = new PersonNameMatcher();

// Match two contact names
const result = nameMatcher.match('Jeff Sudlow', 'Jeffrey Sudlow');
// { isMatch: true, confidence: 92, ... } - nickname match

const falsePositive = nameMatcher.match('Jeffrey Sudlow', 'Jeffrey Spotts');
// { isMatch: false, confidence: 53, matchReason: 'Last name below threshold: 17% < 85%' }

// Find best match from candidates
const bestMatch = nameMatcher.findBestMatch(inputName, contacts, { nameField: 'fullname' });
```

### When to Use Each Matcher

| Data Type | Matcher | Reason |
|-----------|---------|--------|
| Company/Account names | `FuzzyMatcher` or standard fuzzy | State validation, abbreviation expansion |
| Contact/Lead names | `PersonNameMatcher` | Prevents false positives on person names |
| Domain matching | `FuzzyMatcher` | Built-in domain normalization |
