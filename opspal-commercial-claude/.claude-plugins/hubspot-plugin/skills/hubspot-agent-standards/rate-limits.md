# HubSpot Rate Limit Handling

## Rate Limit Tiers

| Plan | Requests per 10 seconds |
|------|------------------------|
| Standard | 100 |
| Professional | 150 |
| Enterprise | 200 |

## Automatic Handling (HubSpotClientV3)

HubSpotClientV3 automatically handles rate limits:
- Detects 429 responses
- Implements exponential backoff
- Retries after `Retry-After` header duration
- Logs rate limit events for monitoring

## Pagination Settings

All search/query operations MUST use these settings:

```javascript
const PAGINATION_CONFIG = {
  page_size: 100,              // HubSpot maximum
  max_total_records: 10000,    // Safety limit for search API
  rate_limit_delay: 100,       // ms between pages
  retry_on_rate_limit: true,   // Exponential backoff
  always_paginate: true        // NEVER assume single page
};
```

## Complete Pagination Pattern

```javascript
async function getAllRecordsComplete(objectType, filters = {}) {
  const allRecords = [];
  let after = undefined;

  while (true) {
    const response = await client.post(`/crm/v3/objects/${objectType}/search`, {
      filterGroups: filters.filterGroups || [],
      properties: filters.properties || [],
      limit: 100,
      after
    });

    allRecords.push(...response.results);

    // CRITICAL: Check for next page
    if (!response.paging?.next?.after) {
      break; // No more pages
    }

    after = response.paging.next.after;

    // Safety check: Search API has 10k limit
    if (allRecords.length >= 10000) {
      console.warn('Reached Search API 10k limit. Use Exports API for larger datasets.');
      break;
    }

    // Rate limiting between pages
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return allRecords;
}
```

## Critical Rules

1. **NEVER assume all results fit in one page**
   - ALWAYS check `paging.next.after` and loop until undefined

2. **NEVER use small page sizes (<100)**
   - Always use maximum (100) to minimize API calls

3. **For datasets >10k records**
   - Use Exports API (not Search API - has 10k limit)
   - OR use streaming generator pattern
