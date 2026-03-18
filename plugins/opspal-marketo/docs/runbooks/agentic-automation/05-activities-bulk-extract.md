# 05 - Activities & Bulk Extract

## Overview

Marketo's Bulk Extract API enables efficient retrieval of large datasets - leads and activities. This is essential for analytics, data warehouse syncing, and campaign performance analysis. The Bulk API uses an asynchronous job model: create → enqueue → poll → download.

## API Constraints

| Limit | Value | Notes |
|-------|-------|-------|
| Concurrent export jobs | 2 running | Additional jobs queue |
| Queued export jobs | 10 max | Beyond 10 returns error 1029 |
| Concurrent import jobs | 10 max | |
| Daily export limit | 500 MB | Resets midnight UTC |
| Date range max | 31 days | Per export job |
| File retention | 7 days | Download before expiration |

## MCP Tools: Lead Export

### Create Export Job
```javascript
mcp__marketo__bulk_lead_export_create({
  fields: ['email', 'firstName', 'lastName', 'company', 'score', 'leadStatus'],
  filter: {
    createdAt: {
      startAt: '2026-01-01T00:00:00Z',
      endAt: '2026-01-31T23:59:59Z'
    }
  },
  format: 'CSV'  // or 'TSV'
})
```

**Response:**
```json
{
  "success": true,
  "result": [{
    "exportId": "abc123-def456",
    "status": "Created",
    "format": "CSV",
    "createdAt": "2026-01-15T10:00:00Z"
  }]
}
```

### Enqueue Export Job
```javascript
mcp__marketo__bulk_lead_export_enqueue({
  exportId: 'abc123-def456'
})
```

**Response:**
```json
{
  "success": true,
  "result": [{
    "exportId": "abc123-def456",
    "status": "Queued",
    "queuedAt": "2026-01-15T10:00:05Z"
  }]
}
```

### Check Export Status
```javascript
mcp__marketo__bulk_lead_export_status({
  exportId: 'abc123-def456'
})
```

**Response:**
```json
{
  "success": true,
  "result": [{
    "exportId": "abc123-def456",
    "status": "Completed",
    "fileSize": 1234567,
    "numberOfRecords": 50000,
    "finishedAt": "2026-01-15T10:05:00Z"
  }]
}
```

**Status Values:**
- `Created` - Job created, not yet queued
- `Queued` - Waiting for processing slot
- `Processing` - Currently generating file
- `Completed` - Ready for download
- `Failed` - Error occurred
- `Cancelled` - Job was cancelled

### Download Export File
```javascript
mcp__marketo__bulk_lead_export_file({
  exportId: 'abc123-def456'
})
```

**Returns:** CSV/TSV content as string

## MCP Tools: Activity Export

### Get Activity Types
```javascript
mcp__marketo__activity_types_list()
```

**Response:**
```json
{
  "success": true,
  "result": [
    { "id": 1, "name": "Visit Webpage", "description": "..." },
    { "id": 2, "name": "Fill Out Form", "description": "..." },
    { "id": 6, "name": "Send Email", "description": "..." },
    { "id": 7, "name": "Email Delivered", "description": "..." },
    { "id": 8, "name": "Email Bounced", "description": "..." },
    { "id": 10, "name": "Open Email", "description": "..." },
    { "id": 11, "name": "Click Email", "description": "..." }
  ]
}
```

### Create Activity Export
```javascript
mcp__marketo__bulk_activity_export_create({
  activityTypeIds: [6, 7, 10, 11],  // Email activities
  filter: {
    createdAt: {
      startAt: '2026-01-01T00:00:00Z',
      endAt: '2026-01-15T23:59:59Z'  // Max 31 days
    }
  },
  format: 'CSV'
})
```

### Enqueue Activity Export
```javascript
mcp__marketo__bulk_activity_export_enqueue({
  exportId: 'xyz789-activity'
})
```

### Check Activity Export Status
```javascript
mcp__marketo__bulk_activity_export_status({
  exportId: 'xyz789-activity'
})
```

### Download Activity Export
```javascript
mcp__marketo__bulk_activity_export_file({
  exportId: 'xyz789-activity'
})
```

## MCP Tools: Lead Import

### Create Import Job
```javascript
mcp__marketo__bulk_lead_import_create({
  file: '/path/to/leads.csv',  // File path or base64 content
  format: 'csv',
  lookupField: 'email',
  listId: 1234,               // Optional: Add to static list
  partitionName: 'Default'    // Optional: Lead partition
})
```

**Response:**
```json
{
  "success": true,
  "result": [{
    "batchId": "batch-import-123",
    "status": "Queued",
    "numOfLeadsProcessed": 0,
    "numOfRowsFailed": 0,
    "message": "Import created"
  }]
}
```

### Check Import Status
```javascript
mcp__marketo__bulk_import_status({
  batchId: 'batch-import-123'
})
```

**Response:**
```json
{
  "success": true,
  "result": [{
    "batchId": "batch-import-123",
    "status": "Complete",
    "numOfLeadsProcessed": 5000,
    "numOfRowsFailed": 12,
    "numOfRowsWithWarning": 45
  }]
}
```

### Get Import Failures
```javascript
mcp__marketo__bulk_import_failures({
  batchId: 'batch-import-123'
})
```

**Returns:** CSV of failed rows with error reasons

### Get Import Warnings
```javascript
mcp__marketo__bulk_import_warnings({
  batchId: 'batch-import-123'
})
```

**Returns:** CSV of rows with warnings

## REST API Endpoints

### Bulk Lead Export
```
POST /bulk/v1/leads/export/create.json
Content-Type: application/json

{
  "fields": ["email", "firstName", "lastName"],
  "filter": {
    "createdAt": {
      "startAt": "2026-01-01T00:00:00Z",
      "endAt": "2026-01-31T23:59:59Z"
    }
  },
  "format": "CSV"
}
```

```
POST /bulk/v1/leads/export/{exportId}/enqueue.json
GET /bulk/v1/leads/export/{exportId}/status.json
GET /bulk/v1/leads/export/{exportId}/file.json
```

### Bulk Activity Export
```
POST /bulk/v1/activities/export/create.json
POST /bulk/v1/activities/export/{exportId}/enqueue.json
GET /bulk/v1/activities/export/{exportId}/status.json
GET /bulk/v1/activities/export/{exportId}/file.json
```

### Bulk Lead Import
```
POST /bulk/v1/leads.json
Content-Type: multipart/form-data

file=<csv-content>
format=csv
lookupField=email
```

## Filter Options

### Lead Export Filters
| Filter | Description | Example |
|--------|-------------|---------|
| `createdAt` | Lead creation date range | Required for broad exports |
| `updatedAt` | Last modified date range | For incremental syncs |
| `staticListId` | Members of static list | Single list |
| `staticListName` | Members by list name | Alternative to ID |
| `smartListId` | Members of smart list | Dynamic criteria |

### Activity Export Filters
| Filter | Description | Notes |
|--------|-------------|-------|
| `createdAt` | Activity timestamp range | **Required**, max 31 days |
| `activityTypeIds` | Activity types to include | **Required** array |
| `primaryAttributeValueIds` | Filter by asset IDs | Optional |
| `primaryAttributeValues` | Filter by asset names | Optional |

## Common Activity Type IDs

| ID | Activity |
|----|----------|
| 1 | Visit Webpage |
| 2 | Fill Out Form |
| 3 | Click Link |
| 6 | Send Email |
| 7 | Email Delivered |
| 8 | Email Bounced |
| 9 | Unsubscribe Email |
| 10 | Open Email |
| 11 | Click Email |
| 12 | New Lead |
| 13 | Change Data Value |
| 22 | Change Score |
| 23 | Add to List |
| 24 | Remove from List |
| 34 | Add to Opportunity |
| 46 | Interesting Moment |

## Agentic Workflow: Complete Export

```javascript
// 1. Get activity types to understand available data
const activityTypes = await mcp__marketo__activity_types_list();
const emailTypes = activityTypes.result
  .filter(t => t.name.toLowerCase().includes('email'))
  .map(t => t.id);

// 2. Create export job
const exportJob = await mcp__marketo__bulk_activity_export_create({
  activityTypeIds: emailTypes,
  filter: {
    createdAt: {
      startAt: '2026-01-01T00:00:00Z',
      endAt: '2026-01-31T23:59:59Z'
    }
  },
  format: 'CSV'
});

const exportId = exportJob.result[0].exportId;

// 3. Enqueue job
await mcp__marketo__bulk_activity_export_enqueue({ exportId });

// 4. Poll for completion with exponential backoff
let status = 'Queued';
let waitTime = 5000;  // Start with 5 seconds
const maxWait = 60000;  // Max 1 minute between checks

while (status !== 'Completed' && status !== 'Failed') {
  await new Promise(resolve => setTimeout(resolve, waitTime));

  const statusResponse = await mcp__marketo__bulk_activity_export_status({ exportId });
  status = statusResponse.result[0].status;

  if (status === 'Processing' || status === 'Queued') {
    waitTime = Math.min(waitTime * 1.5, maxWait);  // Exponential backoff
  }
}

// 5. Download file if completed
if (status === 'Completed') {
  const fileContent = await mcp__marketo__bulk_activity_export_file({ exportId });
  // Process CSV content...
}
```

## Agentic Workflow: Incremental Sync

```javascript
// Daily sync pattern - export changes from last 24 hours
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
const now = new Date();

// Lead changes
const leadExport = await mcp__marketo__bulk_lead_export_create({
  fields: ['id', 'email', 'firstName', 'lastName', 'score', 'leadStatus', 'updatedAt'],
  filter: {
    updatedAt: {
      startAt: yesterday.toISOString(),
      endAt: now.toISOString()
    }
  }
});

// Activity log
const activityExport = await mcp__marketo__bulk_activity_export_create({
  activityTypeIds: [1, 2, 6, 7, 10, 11, 12, 13, 22],  // Key activities
  filter: {
    createdAt: {
      startAt: yesterday.toISOString(),
      endAt: now.toISOString()
    }
  }
});

// Enqueue both
await mcp__marketo__bulk_lead_export_enqueue({ exportId: leadExport.result[0].exportId });
await mcp__marketo__bulk_activity_export_enqueue({ exportId: activityExport.result[0].exportId });

// Wait for completion and download...
```

## Agent Routing

| Task | Agent |
|------|-------|
| Bulk export/import operations | `marketo-data-operations` |
| Activity analysis | `marketo-data-operations` |
| Campaign performance export | `marketo-automation-orchestrator` |
| Daily sync setup | `marketo-automation-orchestrator` |
| Data warehouse integration | `marketo-data-operations` |

## Best Practices

### Export Optimization
1. **Minimize fields** - Only export needed columns
2. **Use date filters** - Smaller date ranges = faster exports
3. **Stagger jobs** - Respect 2 concurrent limit
4. **Cache activity types** - Don't query every time
5. **Monitor quota** - Track 500MB daily limit

### Import Optimization
1. **Validate data first** - Check for required fields
2. **Use appropriate action** - createOrUpdate vs updateOnly
3. **Handle failures** - Download and review failure file
4. **Batch appropriately** - 10K-50K rows per file works well

### Error Handling
1. **Retry on 1029** - Queue full, wait and retry
2. **Check file expiration** - Download within 7 days
3. **Validate date ranges** - Max 31 days
4. **Handle partial failures** - Import may succeed partially

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| 1029 | Bulk queue full | Wait 5 min, retry |
| 1035 | Export date range > 31 days | Reduce date range |
| 1036 | Invalid activity type ID | Check activity_types_list |
| 1037 | Filter required | Add createdAt filter |

## Limitations

- **31-day max** per export job date range
- **500MB daily** export limit
- **2 concurrent** export jobs (additional queue)
- **10 concurrent** import jobs
- **7-day retention** for export files
- **No real-time streaming** - batch only
- **Activity export requires** activityTypeIds filter

