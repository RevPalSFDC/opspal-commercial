# Lead & Bulk Operation Patterns

Quick reference for lead management and bulk data operations.

## Lead Operations

### Query Leads
```javascript
mcp__marketo__lead_query({
  filterType: 'email',
  filterValues: ['john@example.com'],
  fields: ['email', 'firstName', 'lastName', 'score']
})
```

### Create/Update Leads
```javascript
mcp__marketo__lead_create({
  leads: [
    { email: 'new@example.com', firstName: 'New' }
  ],
  action: 'createOrUpdate',  // or 'createOnly', 'updateOnly'
  lookupField: 'email'
})
```

### Merge Duplicates
```javascript
mcp__marketo__lead_merge({
  winnerId: 12345,
  loserIds: [12346, 12347],  // Max 3 per call
  mergeInCRM: true
})
```

## Bulk Export

### Lead Export
```javascript
// 1. Create
const job = await mcp__marketo__bulk_lead_export_create({
  fields: ['email', 'score', 'leadStatus'],
  filter: {
    createdAt: {
      startAt: '2026-01-01T00:00:00Z',
      endAt: '2026-01-31T23:59:59Z'
    }
  }
});

// 2. Enqueue
await mcp__marketo__bulk_lead_export_enqueue({
  exportId: job.result[0].exportId
});

// 3. Poll status
let status = 'Queued';
while (status !== 'Completed') {
  await sleep(30000);
  const check = await mcp__marketo__bulk_lead_export_status({
    exportId: job.result[0].exportId
  });
  status = check.result[0].status;
}

// 4. Download
const file = await mcp__marketo__bulk_lead_export_file({
  exportId: job.result[0].exportId
});
```

### Activity Export
```javascript
// Requires activityTypeIds
await mcp__marketo__bulk_activity_export_create({
  activityTypeIds: [6, 7, 10, 11],  // Email activities
  filter: {
    createdAt: {
      startAt: '2026-01-01T00:00:00Z',
      endAt: '2026-01-31T23:59:59Z'  // Max 31 days
    }
  }
});
```

### Common Activity Types

| ID | Activity |
|----|----------|
| 1 | Visit Webpage |
| 2 | Fill Out Form |
| 6 | Send Email |
| 7 | Email Delivered |
| 10 | Open Email |
| 11 | Click Email |
| 12 | New Lead |
| 22 | Change Score |

## Bulk Import

```javascript
// Create import
const importJob = await mcp__marketo__bulk_lead_import_create({
  file: csvContent,
  format: 'csv',
  lookupField: 'email',
  listId: 1234  // Optional: add to list
});

// Check status
const status = await mcp__marketo__bulk_import_status({
  batchId: importJob.result[0].batchId
});

// Get failures
const failures = await mcp__marketo__bulk_import_failures({
  batchId: importJob.result[0].batchId
});
```

## API Limits

| Operation | Limit |
|-----------|-------|
| Lead sync batch | 300 records |
| Query filter values | 300 values |
| Merge losers | 3 per call |
| Concurrent exports | 2 running |
| Export date range | 31 days max |
| Daily export | 500 MB |
