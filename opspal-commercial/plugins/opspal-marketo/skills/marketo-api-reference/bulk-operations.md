# Marketo Bulk API Operations

Complete guide for Marketo Bulk Import and Export APIs.

## Bulk API Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Bulk API Architecture                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BULK EXPORT                      BULK IMPORT                    │
│  ┌──────────────┐                 ┌──────────────┐               │
│  │ Create Job   │                 │ Upload File  │               │
│  │ (fields,     │                 │ (CSV, max    │               │
│  │  filter)     │                 │  10MB)       │               │
│  └──────┬───────┘                 └──────┬───────┘               │
│         │                                │                       │
│  ┌──────▼───────┐                 ┌──────▼───────┐               │
│  │ Enqueue Job  │                 │ Poll Status  │               │
│  └──────┬───────┘                 └──────┬───────┘               │
│         │                                │                       │
│  ┌──────▼───────┐                 ┌──────▼───────┐               │
│  │ Poll Status  │                 │ Get Results  │               │
│  │ (until done) │                 │ (failures,   │               │
│  └──────┬───────┘                 │  warnings)   │               │
│         │                         └──────────────┘               │
│  ┌──────▼───────┐                                                │
│  │ Download     │                                                │
│  │ File         │                                                │
│  └──────────────┘                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Bulk Export Limits

| Limit | Value |
|-------|-------|
| Daily export quota | 500 MB |
| Date range | 31 days max |
| Concurrent exports | 2 running, 10 queued |
| File retention | 7 days |

---

## Bulk Lead Export

### Step 1: Create Export Job

```http
POST /bulk/v1/leads/export/create.json
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "fields": [
    "id",
    "email",
    "firstName",
    "lastName",
    "company",
    "createdAt",
    "updatedAt"
  ],
  "filter": {
    "createdAt": {
      "startAt": "2025-01-01T00:00:00Z",
      "endAt": "2025-01-31T23:59:59Z"
    }
  },
  "format": "CSV"
}
```

**Response:**
```json
{
  "requestId": "1234#abcd",
  "success": true,
  "result": [
    {
      "exportId": "abc123-def456",
      "format": "CSV",
      "status": "Created",
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

### Filter Options

```json
{
  "filter": {
    // By creation date
    "createdAt": {
      "startAt": "2025-01-01T00:00:00Z",
      "endAt": "2025-01-31T23:59:59Z"
    },

    // OR by update date
    "updatedAt": {
      "startAt": "2025-01-01T00:00:00Z",
      "endAt": "2025-01-31T23:59:59Z"
    },

    // OR by static list
    "staticListId": 1234,

    // OR by smart list
    "smartListId": 5678
  }
}
```

### Step 2: Enqueue Export

```http
POST /bulk/v1/leads/export/{exportId}/enqueue.json
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "result": [
    {
      "exportId": "abc123-def456",
      "status": "Queued",
      "queuedAt": "2025-01-15T10:01:00Z"
    }
  ]
}
```

### Step 3: Poll Status

```http
GET /bulk/v1/leads/export/{exportId}/status.json
Authorization: Bearer {access_token}
```

**Status Values:**
| Status | Description |
|--------|-------------|
| Created | Job created, not queued |
| Queued | In queue |
| Processing | Actively running |
| Completed | Ready for download |
| Failed | Error occurred |
| Cancelled | Manually cancelled |

**Response when complete:**
```json
{
  "result": [
    {
      "exportId": "abc123-def456",
      "status": "Completed",
      "numberOfRecords": 15234,
      "fileSize": 2456789,
      "finishedAt": "2025-01-15T10:15:00Z"
    }
  ]
}
```

### Step 4: Download File

```http
GET /bulk/v1/leads/export/{exportId}/file.json
Authorization: Bearer {access_token}
```

Returns CSV file directly.

### Cancel Export

```http
POST /bulk/v1/leads/export/{exportId}/cancel.json
Authorization: Bearer {access_token}
```

---

## Bulk Activity Export

### Create Activity Export

```http
POST /bulk/v1/activities/export/create.json
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "filter": {
    "createdAt": {
      "startAt": "2025-01-01T00:00:00Z",
      "endAt": "2025-01-31T23:59:59Z"
    },
    "activityTypeIds": [1, 6, 7, 10, 11, 12, 13]
  },
  "format": "CSV"
}
```

**Common Activity Type IDs:**
| ID | Activity |
|----|----------|
| 1 | Visit Web Page |
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

### Get Activity Types

```http
GET /rest/v1/activities/types.json
Authorization: Bearer {access_token}
```

---

## Bulk Import

### Import Limits

| Limit | Value |
|-------|-------|
| File size | 10 MB max |
| Concurrent imports | 10 |
| Records per file | No explicit limit |

### Step 1: Upload File

```http
POST /bulk/v1/leads/import.json
Authorization: Bearer {access_token}
Content-Type: multipart/form-data

file=@leads.csv
format=csv
lookupField=email
```

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| file | Yes | CSV file |
| format | Yes | `csv` or `tsv` |
| lookupField | Yes | Dedup field (e.g., `email`, `id`) |
| partitionName | No | Lead partition |
| listId | No | Add to static list |

**CSV Format:**
```csv
email,firstName,lastName,company
john@example.com,John,Doe,Acme Inc
jane@example.com,Jane,Smith,Tech Corp
```

**Response:**
```json
{
  "requestId": "1234#abcd",
  "success": true,
  "result": [
    {
      "batchId": 123,
      "importId": "abc-123",
      "status": "Queued"
    }
  ]
}
```

### Step 2: Check Status

```http
GET /bulk/v1/leads/batch/{batchId}.json
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "result": [
    {
      "batchId": 123,
      "status": "Complete",
      "numOfLeadsProcessed": 1000,
      "numOfRowsFailed": 5,
      "numOfRowsWithWarning": 10,
      "message": "Import completed"
    }
  ]
}
```

### Step 3: Get Failures

```http
GET /bulk/v1/leads/batch/{batchId}/failures.json
Authorization: Bearer {access_token}
```

**Response (CSV):**
```csv
email,firstName,lastName,company,Import Failure Reason
invalid-email,John,Doe,Acme,"Invalid email format"
,Jane,Smith,Tech Corp,"Required field 'email' missing"
```

### Step 4: Get Warnings

```http
GET /bulk/v1/leads/batch/{batchId}/warnings.json
Authorization: Bearer {access_token}
```

---

## Custom Object Bulk Operations

### Export Custom Objects

```http
POST /bulk/v1/customobjects/{apiName}/export/create.json
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "fields": ["vin", "make", "model", "year"],
  "filter": {
    "updatedAt": {
      "startAt": "2025-01-01T00:00:00Z",
      "endAt": "2025-01-31T23:59:59Z"
    }
  }
}
```

### Import Custom Objects

```http
POST /bulk/v1/customobjects/{apiName}/import.json
Authorization: Bearer {access_token}
Content-Type: multipart/form-data

file=@cars.csv
format=csv
```

---

## Implementation Patterns

### Complete Export Workflow

```javascript
async function exportLeads(filter) {
  // Step 1: Create job
  const createResponse = await fetch(
    `${BASE_URL}/bulk/v1/leads/export/create.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields, filter, format: 'CSV' })
    }
  );
  const { result: [{ exportId }] } = await createResponse.json();

  // Step 2: Enqueue
  await fetch(`${BASE_URL}/bulk/v1/leads/export/${exportId}/enqueue.json`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  // Step 3: Poll until complete
  let status = 'Queued';
  while (!['Completed', 'Failed', 'Cancelled'].includes(status)) {
    await sleep(30000); // Wait 30 seconds

    const statusResponse = await fetch(
      `${BASE_URL}/bulk/v1/leads/export/${exportId}/status.json`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const statusData = await statusResponse.json();
    status = statusData.result[0].status;
  }

  if (status !== 'Completed') {
    throw new Error(`Export failed with status: ${status}`);
  }

  // Step 4: Download file
  const fileResponse = await fetch(
    `${BASE_URL}/bulk/v1/leads/export/${exportId}/file.json`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  return fileResponse.text(); // CSV content
}
```

### Complete Import Workflow

```javascript
async function importLeads(csvContent, lookupField = 'email') {
  // Step 1: Upload file
  const formData = new FormData();
  formData.append('file', new Blob([csvContent], { type: 'text/csv' }), 'leads.csv');
  formData.append('format', 'csv');
  formData.append('lookupField', lookupField);

  const uploadResponse = await fetch(`${BASE_URL}/bulk/v1/leads/import.json`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  const { result: [{ batchId }] } = await uploadResponse.json();

  // Step 2: Poll until complete
  let status = 'Queued';
  while (!['Complete', 'Failed'].includes(status)) {
    await sleep(10000); // Wait 10 seconds

    const statusResponse = await fetch(
      `${BASE_URL}/bulk/v1/leads/batch/${batchId}.json`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const statusData = await statusResponse.json();
    status = statusData.result[0].status;
  }

  // Step 3: Get results
  const batchInfo = await fetch(
    `${BASE_URL}/bulk/v1/leads/batch/${batchId}.json`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  ).then(r => r.json());

  const result = batchInfo.result[0];

  // Step 4: Get failures if any
  let failures = [];
  if (result.numOfRowsFailed > 0) {
    const failuresResponse = await fetch(
      `${BASE_URL}/bulk/v1/leads/batch/${batchId}/failures.json`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    failures = await failuresResponse.text();
  }

  return {
    processed: result.numOfLeadsProcessed,
    failed: result.numOfRowsFailed,
    warnings: result.numOfRowsWithWarning,
    failures
  };
}
```

---

## Best Practices

### Export Optimization

- Use date filters to limit data volume
- Request only needed fields
- Check quota before starting large exports
- Process files in streaming fashion

### Import Optimization

- Validate CSV format before upload
- Use batch sizes of 10,000-50,000 for optimal performance
- Handle failures and warnings separately
- Implement retry logic for transient errors

### Quota Management

```javascript
async function checkExportQuota() {
  // Check daily quota usage
  const response = await fetch(`${BASE_URL}/bulk/v1/leads/export.json`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();

  // Sum up today's exports
  const today = new Date().toISOString().split('T')[0];
  const todayExports = data.result.filter(e =>
    e.createdAt.startsWith(today) && e.status === 'Completed'
  );

  const usedMB = todayExports.reduce((sum, e) => sum + (e.fileSize / 1024 / 1024), 0);
  const remainingMB = 500 - usedMB;

  return { usedMB, remainingMB, percentUsed: (usedMB / 500) * 100 };
}
```

---

## Error Handling

### Common Errors

| Error Code | Description | Resolution |
|------------|-------------|------------|
| 1029 | Export queue full | Wait for jobs to complete |
| 1035 | Daily export limit exceeded | Wait until midnight reset |
| 1036 | Import file too large | Split into smaller files |

### Retry Strategy

```javascript
async function bulkOperationWithRetry(operation, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === '1029') {
        // Queue full - wait and retry
        await sleep(60000);
        continue;
      }
      if (error.code === '1035') {
        // Daily limit - can't retry today
        throw new Error('Daily export limit reached. Try again tomorrow.');
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```
