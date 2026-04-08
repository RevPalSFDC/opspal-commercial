# Merge Rules

## Canonical Selection Algorithm

### Scoring Weights

| Factor | Points | Rationale |
|--------|--------|-----------|
| Has SF Account ID | 100 | Primary system of record |
| Sync Health | 50 | Active integration |
| Contact Count | 40 | Relationship data |
| Deal Count | 25 | Revenue data |
| Has Owner | 10 | Active management |
| Age (older) | 5 | Historical record |
| **Max Total** | **230** | |

### Scoring Implementation

```javascript
const scoreCompany = (company, clusterStats) => {
  let score = 0;

  // Salesforce integration (highest priority)
  if (company.salesforceaccountid) {
    score += 100;

    // Sync health bonus
    if (company.lastSyncDate && daysSince(company.lastSyncDate) < 30) {
      score += 50;
    }
  }

  // Contact count (normalized within cluster)
  const contactNorm = company.contacts / clusterStats.maxContacts;
  score += Math.round(contactNorm * 40);

  // Deal count (normalized within cluster)
  const dealNorm = company.deals / clusterStats.maxDeals;
  score += Math.round(dealNorm * 25);

  // Owner present
  if (company.owner) {
    score += 10;
  }

  // Age bonus (older = better)
  const ageNorm = company.createdDaysAgo / clusterStats.maxAge;
  score += Math.round(ageNorm * 5);

  return {
    companyId: company.id,
    score,
    breakdown: { /* detailed scores */ }
  };
};
```

## Merge Execution Order

### Bundle A (SF-Anchored)

```yaml
Execution Order:
  1. Attach SF Account → Canonical HS Company
     - Via contact bridge (if needed)

  2. Reparent Contacts
     - Association type: PRIMARY (Type 1)
     - Preserve secondary associations

  3. Reparent Deals
     - Update company_id
     - Preserve deal history

  4. Delete Non-Canonical Companies
     - Only after all associations moved
     - Use Merge API (not Delete API!)

  5. Merge SF Accounts (if duplicates)
     - Route to SFDC agent
```

### Bundle B (HS-Only)

```yaml
Execution Order:
  1. Reparent Contacts to Canonical
  2. Reparent Deals to Canonical
  3. Delete Non-Canonical Companies
```

## API Method Selection

### CRITICAL: Merge vs Delete

```yaml
ALWAYS Use Merge API:
  - Preserves all history
  - Maintains activity timeline
  - Keeps engagement data
  - Safer for SF sync

NEVER Use Delete API:
  - Loses activity history
  - Breaks SF sync
  - Orphans contacts
  - No audit trail
```

### Correct Merge API Usage

```javascript
// ✅ CORRECT: Use Merge API
await hubspotClient.crm.companies.mergeApi.merge({
  primaryObjectId: canonicalId,    // Survivor
  objectIdToMerge: duplicateId     // Will be merged INTO canonical
});

// ❌ WRONG: Never use Delete API for dedup
// await hubspotClient.crm.companies.basicApi.archive(companyId);
```

### Lift-and-Shift Pattern

For complex cases (large data disparity):

```bash
node dedup-lift-and-shift.js \
  --canonical <canonical_id> \
  --duplicate <duplicate_id> \
  --dry-run

# Process:
# 1. Identify all associations on duplicate
# 2. Create associations on canonical
# 3. Verify associations
# 4. Only then delete duplicate
```

## Data Preservation Rules

### Property Merging

```yaml
Property Merge Strategy:
  Standard Fields:
    - Keep canonical value
    - Log duplicate value for audit

  Multi-Value Fields:
    - Combine unique values
    - Remove duplicates

  Date Fields:
    - Keep earliest (created dates)
    - Keep latest (activity dates)

  Numeric Fields:
    - Sum (if additive: revenue)
    - Keep canonical (if not: employee count)
```

### Activity Preservation

```yaml
Activity Types:
  - Notes: Merge all
  - Emails: Merge all
  - Calls: Merge all
  - Meetings: Merge all
  - Tasks: Merge all

Process:
  1. Associate activities with canonical
  2. Maintain original timestamps
  3. Add "Merged from: [duplicate name]" tag
```

## Rollback Capability

### Pre-Execution Snapshot

```json
{
  "snapshotId": "snap-20251014-142356",
  "companies": [
    {
      "id": 123,
      "properties": { /* all properties */ },
      "associations": {
        "contacts": [456, 789],
        "deals": [101]
      }
    }
  ],
  "contacts": [ /* full contact data */ ],
  "deals": [ /* full deal data */ ]
}
```

### Rollback Process

```yaml
Rollback Steps:
  1. Load snapshot
  2. Recreate deleted companies
  3. Restore original associations
  4. Remove merged associations
  5. Verify counts match snapshot
```
