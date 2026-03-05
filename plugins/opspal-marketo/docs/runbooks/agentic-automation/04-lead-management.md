# 04 - Lead Management (Deduplication, Segmentation, Scoring)

## Overview

Marketo's Lead API provides comprehensive lead management capabilities including creation, update, merge, and query operations. This enables programmatic lead deduplication, segmentation analysis, and integration with scoring systems.

## MCP Tools

### Create/Update Leads
```javascript
mcp__marketo__lead_create({
  leads: [
    {
      email: 'john.doe@company.com',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corp',
      title: 'VP Marketing'
    }
  ],
  action: 'createOrUpdate',  // 'createOnly', 'updateOnly', 'createOrUpdate', 'createDuplicate'
  lookupField: 'email'       // Dedupe field (default: email)
})
```

**Response:**
```json
{
  "success": true,
  "result": [{
    "id": 12345,
    "status": "updated",
    "reasons": []
  }]
}
```

### Query Leads
```javascript
mcp__marketo__lead_query({
  filterType: 'email',                    // Field to filter on
  filterValues: ['john@example.com', 'jane@example.com'],
  fields: ['email', 'firstName', 'lastName', 'score', 'company']
})
```

**Response:**
```json
{
  "success": true,
  "result": [
    {
      "id": 12345,
      "email": "john@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "score": 85,
      "company": "Acme Corp"
    }
  ]
}
```

### Merge Leads
```javascript
mcp__marketo__lead_merge({
  winnerId: 12345,           // Lead to keep
  loserIds: [12346, 12347],  // Leads to merge (max 3)
  mergeInCRM: true           // Also merge in CRM (if synced)
})
```

**Response:**
```json
{
  "success": true,
  "result": [{
    "id": 12345,
    "status": "merged"
  }]
}
```

### Describe Lead Fields
```javascript
mcp__marketo__lead_describe()
```

**Response:**
```json
{
  "success": true,
  "result": [
    {
      "id": 2,
      "displayName": "Company",
      "dataType": "string",
      "length": 255,
      "rest": { "name": "company", "readOnly": false },
      "soap": { "name": "Company", "readOnly": false }
    }
  ]
}
```

## REST API Endpoints

### Sync Leads
```
POST /rest/v1/leads.json
Content-Type: application/json

{
  "action": "createOrUpdate",
  "lookupField": "email",
  "input": [
    { "email": "john@example.com", "firstName": "John" }
  ]
}
```

### Get Leads by Filter
```
GET /rest/v1/leads.json?filterType=email&filterValues=john@example.com&fields=email,firstName,lastName
```

### Merge Leads
```
POST /rest/v1/leads/{id}/merge.json?leadIds=12346,12347&mergeInCRM=true
```

### Describe Lead
```
GET /rest/v1/leads/describe.json
```

## Deduplication Strategies

### Standard Email Dedupe
```javascript
// Default behavior - email as lookup field
await mcp__marketo__lead_create({
  leads: [{ email: 'test@example.com', firstName: 'Test' }],
  action: 'createOrUpdate',
  lookupField: 'email'  // Default
});
```

### Custom Field Dedupe
```javascript
// Use custom field for dedupe (must be searchable)
await mcp__marketo__lead_create({
  leads: [{ customerId__c: 'CUST-12345', firstName: 'Test' }],
  action: 'createOrUpdate',
  lookupField: 'customerId__c'
});
```

### Merge Duplicate Detection
```javascript
// 1. Find potential duplicates
const duplicates = await mcp__marketo__lead_query({
  filterType: 'email',
  filterValues: ['john.doe@company.com'],
  fields: ['id', 'email', 'createdAt', 'score', 'source']
});

// 2. If multiple results, determine winner
if (duplicates.result.length > 1) {
  // Winner: highest score, or oldest record, or most complete
  const sorted = duplicates.result.sort((a, b) => b.score - a.score);
  const winnerId = sorted[0].id;
  const loserIds = sorted.slice(1).map(l => l.id);

  // 3. Merge duplicates
  await mcp__marketo__lead_merge({
    winnerId: winnerId,
    loserIds: loserIds.slice(0, 3),  // Max 3 losers per call
    mergeInCRM: true
  });
}
```

## Segmentation Queries

### Score-Based Segmentation
```javascript
// Get leads by score range using smart list
// Note: Direct score queries require smart list membership

// Alternative: Export and filter
const exportJob = await mcp__marketo__bulk_lead_export_create({
  fields: ['email', 'score', 'firstName', 'lastName'],
  filter: {
    updatedAt: {
      startAt: '2026-01-01T00:00:00Z',
      endAt: '2026-01-31T23:59:59Z'
    }
  }
});

// Then filter results by score client-side
```

### List-Based Segmentation
```javascript
// Query leads in specific static list
const listMembers = await mcp__marketo__lead_query({
  filterType: 'listId',
  filterValues: ['1234'],  // Static list ID
  fields: ['email', 'firstName', 'lastName', 'score', 'leadStatus']
});
```

### Field-Based Queries
```javascript
// Query by any searchable field
const marketingLeads = await mcp__marketo__lead_query({
  filterType: 'department',
  filterValues: ['Marketing', 'Digital Marketing'],
  fields: ['email', 'firstName', 'lastName', 'company', 'title']
});
```

## Scoring Integration

### Read Lead Score
```javascript
const leads = await mcp__marketo__lead_query({
  filterType: 'email',
  filterValues: ['john@example.com'],
  fields: ['email', 'score', 'behaviorScore', 'demographicScore']
});

// Marketo scoring fields:
// - score: Total lead score
// - behaviorScore: Activity-based score (if separate)
// - demographicScore: Profile-based score (if separate)
```

### Update Score via Token (Indirect)
```javascript
// Scores are typically managed by smart campaigns
// To adjust scores, trigger a campaign with the lead

await mcp__marketo__campaign_request({
  campaignId: 5678,  // Campaign that adjusts score
  leads: [{ id: 12345 }],
  tokens: [
    { name: '{{my.ScoreAdjustment}}', value: '10' }
  ]
});
```

### Bulk Score Analysis
```javascript
// Export all leads with scores for analysis
const exportJob = await mcp__marketo__bulk_lead_export_create({
  fields: [
    'email', 'firstName', 'lastName', 'company',
    'score', 'leadStatus', 'leadSource',
    'createdAt', 'updatedAt'
  ],
  filter: {
    createdAt: {
      startAt: '2025-01-01T00:00:00Z',
      endAt: '2026-01-31T23:59:59Z'
    }
  },
  format: 'CSV'
});

// Enqueue and poll for completion
await mcp__marketo__bulk_lead_export_enqueue({ exportId: exportJob.result[0].exportId });

// Poll status until completed
let status;
do {
  await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s
  status = await mcp__marketo__bulk_lead_export_status({ exportId: exportJob.result[0].exportId });
} while (status.result[0].status !== 'Completed');

// Download file for analysis
const fileUrl = await mcp__marketo__bulk_lead_export_file({ exportId: exportJob.result[0].exportId });
```

## Agentic Workflow: Deduplication

### Full Dedupe Workflow
```javascript
// 1. Get lead describe to understand fields
const leadSchema = await mcp__marketo__lead_describe();
const searchableFields = leadSchema.result.filter(f => f.rest?.searchable);

// 2. Query potential duplicates (by email domain)
const domainLeads = await mcp__marketo__lead_query({
  filterType: 'email',
  filterValues: ['*@company.com'],  // Note: Wildcards may have restrictions
  fields: ['id', 'email', 'firstName', 'lastName', 'createdAt', 'score']
});

// 3. Group by normalized email
const groups = {};
for (const lead of domainLeads.result) {
  const normalizedEmail = lead.email.toLowerCase().trim();
  if (!groups[normalizedEmail]) groups[normalizedEmail] = [];
  groups[normalizedEmail].push(lead);
}

// 4. Process duplicate groups
for (const [email, leads] of Object.entries(groups)) {
  if (leads.length > 1) {
    // Determine winner (highest score wins)
    const sorted = leads.sort((a, b) => (b.score || 0) - (a.score || 0));
    const winnerId = sorted[0].id;
    const loserIds = sorted.slice(1).map(l => l.id);

    // Merge in batches of 3
    while (loserIds.length > 0) {
      const batch = loserIds.splice(0, 3);
      await mcp__marketo__lead_merge({
        winnerId: winnerId,
        loserIds: batch,
        mergeInCRM: true
      });

      // Rate limit awareness
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}
```

## Lead Lifecycle Management

### Status Transitions
```javascript
// Update lead status
await mcp__marketo__lead_create({
  leads: [
    { id: 12345, leadStatus: 'MQL' }
  ],
  action: 'updateOnly'
});
```

### Add to Static List
```javascript
// Option A: Direct list membership (recommended for API-driven segmentation)
await mcp__marketo__list_add_leads({
  listId: 1234,
  leads: [{ id: 12345 }]
});

// Option B: Trigger a campaign if list membership should invoke flow actions
await mcp__marketo__campaign_request({
  campaignId: 5678,  // Campaign uses "Added to List" or "Campaign is Requested"
  leads: [{ id: 12345 }]
});
```

## Agent Routing

| Task | Agent |
|------|-------|
| Lead CRUD operations | `marketo-lead-manager` |
| Scoring configuration | `marketo-lead-scoring-architect` |
| Deduplication workflows | `marketo-lead-manager` |
| Bulk lead operations | `marketo-data-operations` |
| Full data workflows | `marketo-automation-orchestrator` |

## Best Practices

### Deduplication
1. **Define winner criteria** before merging (score, age, completeness)
2. **Merge in batches** - max 3 losers per call
3. **Check CRM sync** - `mergeInCRM: true` if leads are synced
4. **Preserve audit trail** - log all merges
5. **Handle edge cases** - same lead in both winner and loser

### Segmentation
1. **Use static lists** for queryable segments
2. **Leverage smart lists** for dynamic segmentation
3. **Export for complex analysis** - bulk API for large datasets
4. **Filter client-side** when API filtering insufficient

### Scoring
1. **Separate behavior/demographic** scores when possible
2. **Document scoring model** - what actions affect score
3. **Regular score audits** - check for drift
4. **Use tokens for adjustments** - maintain via campaigns

## Limitations

- **Query limits**: 300 filter values per request
- **Merge limits**: 3 loser leads per call
- **Batch size**: 300 leads per sync call
- **No direct score update**: Must use campaigns
- **Field type restrictions**: Some fields are read-only

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| 1004 | Lead not found | Verify lead ID exists |
| 1005 | Lead already merged | Skip - already processed |
| 1006 | Invalid lookup field | Use searchable field |
| 1007 | Multiple leads match | Use more specific lookup |
| 1008 | Lead partition mismatch | Check partition access |
