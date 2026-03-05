# Bulk Extract API Patterns

Quick reference for Marketo Bulk Extract API operations.

## Lead Export

### Create Job
```javascript
mcp__marketo__bulk_lead_export_create({
  fields: ['id', 'email', 'firstName', 'lastName', 'leadScore', 'createdAt'],
  filter: {
    createdAt: {
      startAt: '2025-01-01T00:00:00Z',
      endAt: '2025-01-31T23:59:59Z'
    }
  }
})
```

### Filter Options
| Filter Type | Description | Example |
|-------------|-------------|---------|
| `createdAt` | By creation date | `{ startAt, endAt }` |
| `updatedAt` | By last update | `{ startAt, endAt }` (if enabled) |
| `staticListId` | By static list membership | `12345` |
| `smartListId` | By smart list criteria | `67890` |

### Common Fields
```javascript
// Core
['id', 'email', 'firstName', 'lastName']

// Scoring
['leadScore', 'behaviorScore', 'demographicScore']

// Dates
['createdAt', 'updatedAt', 'lastActivityDate']

// Firmographic
['company', 'industry', 'annualRevenue', 'numberOfEmployees']
```

## Activity Export

### Create Job
```javascript
mcp__marketo__bulk_activity_export_create({
  activityTypeIds: [6, 7, 10, 11, 2, 3],  // Email activities
  filter: {
    createdAt: {
      startAt: '2025-01-14T00:00:00Z',
      endAt: '2025-01-15T00:00:00Z'
    }
  }
})
```

### Activity Type IDs

#### Email Activities
| ID | Type |
|----|------|
| 6 | Send Email |
| 7 | Email Delivered |
| 10 | Click Email |
| 11 | Open Email |
| 8 | Email Bounced |
| 9 | Email Bounced Soft |
| 27 | Unsubscribe Email |

#### Form Activities
| ID | Type |
|----|------|
| 2 | Fill Out Form |
| 3 | Visit Webpage |

#### Scoring Activities
| ID | Type |
|----|------|
| 22 | Change Score |
| 23 | Change Data Value |

#### Progression Activities
| ID | Type |
|----|------|
| 104 | Change Status in Progression |
| 106 | Add to Nurture |

### Get Activity Types
```javascript
// Discover all available activity types
mcp__marketo__activity_types_list()
```

## Program Member Export

### Create Job
```javascript
mcp__marketo__bulk_program_member_export_create({
  programId: 1044,
  fields: [
    'leadId', 'firstName', 'lastName', 'email',
    'membershipDate', 'progressionStatus', 'reachedSuccess'
  ]
})
```

### Common Fields
```javascript
// Lead info
['leadId', 'firstName', 'lastName', 'email']

// Membership
['membershipDate', 'progressionStatus', 'statusName']

// Success tracking
['reachedSuccess', 'reachedSuccessDate']

// Acquisition
['acquiredBy', 'acquisitionDate']
```

## Job Lifecycle

### 1. Create
```javascript
const job = await mcp__marketo__bulk_lead_export_create({...});
// Returns: { exportId: 'abc-123-def', status: 'Created' }
```

### 2. Enqueue
```javascript
await mcp__marketo__bulk_lead_export_enqueue({ exportId: 'abc-123-def' });
// Status changes to 'Queued'
```

### 3. Poll Status
```javascript
// Use exponential backoff (60s minimum)
const status = await mcp__marketo__bulk_lead_export_status({ exportId: 'abc-123-def' });
// Statuses: Created, Queued, Processing, Completed, Failed, Cancelled
```

### 4. Download
```javascript
// Only when status === 'Completed'
const file = await mcp__marketo__bulk_lead_export_file({ exportId: 'abc-123-def' });
// Returns CSV content
```

### 5. Cancel (if needed)
```javascript
await mcp__marketo__bulk_lead_export_cancel({ exportId: 'abc-123-def' });
```

## Rate Limiting

### Quota Tracking
```javascript
// Check daily usage
const usage = await mcp__marketo__analytics_api_usage();
// Monitor: bulkExportDailyUsedBytes vs 500MB limit
```

### Polling Strategy
```javascript
const pollIntervals = [60, 120, 240, 480, 960]; // seconds
// Start at 60s, double each poll
// Max 16 minutes between polls
```

## Error Handling

| Status | Action |
|--------|--------|
| `Queued` | Wait and poll |
| `Processing` | Wait and poll |
| `Completed` | Download file |
| `Failed` | Check error, retry |
| `Cancelled` | Recreate if needed |

### Common Errors
```javascript
// Error 1029: Queue full
// Action: Wait for jobs to complete

// Error 1035: Quota exceeded
// Action: Wait for midnight reset

// Error 613: Concurrent limit
// Action: Wait for active jobs to finish
```

## Date Range Patterns

### Single Day Export
```javascript
filter: {
  createdAt: {
    startAt: '2025-01-15T00:00:00Z',
    endAt: '2025-01-15T23:59:59Z'
  }
}
```

### 7-Day Rolling Window
```javascript
const end = new Date();
const start = new Date(end - 7 * 24 * 60 * 60 * 1000);
filter: {
  createdAt: {
    startAt: start.toISOString(),
    endAt: end.toISOString()
  }
}
```

### Max Range (31 Days)
```javascript
// For large historical exports
// Split into multiple jobs if > 31 days needed
```

## Best Practices

1. **Check quota before export**: Query usage API first
2. **Use minimum fields**: Only export needed fields
3. **Stagger jobs**: Space out multiple exports
4. **Poll responsibly**: 60s minimum, exponential backoff
5. **Download promptly**: Files expire after 7 days
6. **Handle failures**: Implement retry logic
7. **Track metrics**: Log size, duration, record counts
