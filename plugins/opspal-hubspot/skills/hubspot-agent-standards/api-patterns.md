# HubSpot API Patterns

## Mandatory Client Initialization

```javascript
const HubSpotClientV3 = require('../lib/hubspot-client-v3');

const client = new HubSpotClientV3({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  portalId: process.env.HUBSPOT_PORTAL_ID
});
```

## Bulk Operations Best Practices

### Pre-Script Checklist

Before generating ANY HubSpot data operation code:

1. **Can this use batch endpoints?** (v3/objects/{type}/batch/*)
   - If >10 records: REQUIRED to use batch
   - Never use sequential loops for batch-eligible operations

2. **Is dataset >10k records?** Use Imports API
   - ALWAYS use `scripts/lib/imports-api-wrapper.js`
   - Never use batch create for large datasets

3. **Are there sequential loops?** Parallelize
   - Look for: `for (const x of xs) { await ... }`
   - Refactor to use batch wrappers with `maxConcurrent`

4. **Using associations?** Use v4 batch associations (with routing logic)
   - **Default**: Use v4 batch via `scripts/lib/batch-associations-v4.js`
   - **Exception**: Company-to-company associations may return 405 on v4 batch → fall back to v3 PUT
   - **Labeled associations**: ALWAYS use v4 (v3 has no label support)
   - Use `BatchAssociationsV4.chooseAssociationEndpoint(fromType, toType, needsLabels)` for routing

5. **Doing upserts?** Use batch/upsert endpoint
   - Never implement check-then-create patterns
   - ALWAYS use `scripts/lib/batch-upsert-helper.js`

## Memory-Efficient Patterns for Large Datasets

```javascript
// BAD: Load all records into memory
const allContacts = await client.getAllContacts(); // OOM on large datasets!

// GOOD: Use generator pattern for streaming
async function* exportLargeDataset(objectType) {
  let after = undefined;
  while (true) {
    const page = await client.get(`/crm/v3/objects/${objectType}`, {
      limit: 100,
      after
    });
    yield page.results;
    if (!page.paging?.next?.after) break;
    after = page.paging.next.after;
  }
}

// Process in chunks without loading all into memory
for await (const batch of exportLargeDataset('contacts')) {
  processBatch(batch); // Process 100 at a time
}
```

## Critical Requirements

1. ALWAYS use HubSpotClientV3 for ALL HubSpot API operations
2. NEVER use deprecated v1/v2 endpoints
3. ALWAYS implement complete pagination using getAll() methods
4. ALWAYS respect rate limits (automatic with HubSpotClientV3)
5. NEVER generate fake data - fail fast if API unavailable
