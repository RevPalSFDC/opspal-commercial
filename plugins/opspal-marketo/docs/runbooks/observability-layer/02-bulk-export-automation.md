# Bulk Export Automation

## Overview

This runbook covers automated bulk extraction of three data types from Marketo:
- **Leads** - Person records with demographic and behavioral data
- **Activities** - Event logs (email sends, clicks, form fills, etc.)
- **Program Members** - Campaign membership with status and success info

## Export Types

### Lead Data Export

Export lead records with selected fields for a date range.

**API Endpoint**: `POST /bulk/v1/leads/export/create.json`

**MCP Tool**: `mcp__marketo__bulk_lead_export_create`

**Key Parameters**:
```json
{
  "fields": ["firstName", "lastName", "id", "email", "company", "leadScore"],
  "format": "CSV",
  "filter": {
    "createdAt": {
      "startAt": "2025-01-01T00:00:00Z",
      "endAt": "2025-01-31T00:00:00Z"
    }
  }
}
```

**Filter Options**:
- `createdAt` - Filter by creation date (required for new leads)
- `updatedAt` - Filter by last modified date (if enabled)
- `staticListId` - Export members of a specific list
- `smartListId` - Export leads matching smart list criteria

**Common Field Sets**:

| Use Case | Fields |
|----------|--------|
| Basic Identity | firstName, lastName, email, id |
| Scoring Analysis | leadScore, behaviorScore, demographicScore, leadSource |
| Engagement | emailInvalid, unsubscribed, marketingSuspended |
| Firmographic | company, industry, annualRevenue, numberOfEmployees |
| Full Profile | All of the above + custom fields |

### Activity Export

Export activity logs for behavioral analysis.

**API Endpoint**: `POST /bulk/v1/activities/export/create.json`

**MCP Tool**: `mcp__marketo__bulk_activity_export_create`

**Key Parameters**:
```json
{
  "format": "CSV",
  "filter": {
    "createdAt": {
      "startAt": "2025-01-01T00:00:00Z",
      "endAt": "2025-01-07T23:59:59Z"
    },
    "activityTypeIds": [1, 6, 7, 10, 11, 12, 13]
  }
}
```

**Activity Type Reference**:

| ID | Activity Type | Description |
|----|--------------|-------------|
| 1 | Visit Webpage | Page view tracking |
| 2 | Fill Out Form | Form submission |
| 6 | Send Email | Email sent to lead |
| 7 | Delivered Email | Email successfully delivered |
| 8 | Bounced Email | Email bounced |
| 9 | Unsubscribe Email | Lead unsubscribed |
| 10 | Open Email | Email opened |
| 11 | Click Email | Link clicked in email |
| 12 | New Lead | Lead created |
| 13 | Change Data Value | Field value changed |
| 21 | Change Score | Score modified |
| 22 | Change Owner | Lead owner changed |
| 46 | Interesting Moment | Custom moment recorded |
| 104 | Change Status in Progression | Program status changed |

**Filter Requirements**:
- `createdAt` is **required** for activity exports
- Maximum 31-day range per export
- `activityTypeIds` is optional but recommended for efficiency

### Program Member Export

Export program membership data for campaign analysis.

**API Endpoint**: `POST /bulk/v1/program/members/export/create.json`

**MCP Tool**: `mcp__marketo__bulk_program_member_export_create`

**Key Parameters**:
```json
{
  "format": "CSV",
  "fields": [
    "firstName", "lastName", "email",
    "membershipDate", "program", "statusName",
    "leadId", "reachedSuccess", "progressionStatus"
  ],
  "filter": {
    "programId": 1044
  }
}
```

**Required Filter**: `programId` - Must specify which program to export

**Available Fields**:
- Lead fields: firstName, lastName, email, etc.
- Program fields: program, programId, membershipDate
- Status fields: statusName, progressionStatus, reachedSuccess
- Dates: acquiredBy, nurtureCadence

## Scheduling Strategies

### Daily Export Schedule

Recommended for most use cases:

```javascript
// Schedule configuration
const dailySchedule = {
  leads: {
    frequency: 'daily',
    time: '02:00 UTC',
    filter: 'updatedAt', // or 'createdAt' if updatedAt not available
    lookback: 1 // days
  },
  activities: {
    frequency: 'daily',
    time: '03:00 UTC',
    filter: 'createdAt',
    lookback: 1 // days
    activityTypes: [6, 7, 10, 11, 2, 104] // email + forms + status changes
  },
  programMembers: {
    frequency: 'daily',
    time: '04:00 UTC',
    programs: ['all-active'], // or specific program IDs
    strategy: 'incremental' // use activity logs to detect changes
  }
};
```

### Staggered Timing

Avoid quota exhaustion by staggering exports:

```
02:00 UTC - Lead export (highest priority)
03:00 UTC - Activity export (email engagement)
04:00 UTC - Program member exports (batch across programs)
```

### Incremental vs Full Exports

| Strategy | When to Use | Quota Impact |
|----------|-------------|--------------|
| Incremental | Daily operations | Low (~5-20 MB/day) |
| Full | Initial setup, recovery | High (may hit 500 MB) |
| Hybrid | Weekly full + daily incremental | Medium |

## Field Selection Best Practices

### Minimize Fields
Only request fields you need for analysis. More fields = larger file size = more quota consumed.

**Bad** (32 fields, ~50 MB for 100k leads):
```json
"fields": ["*"] // Don't do this
```

**Good** (8 fields, ~8 MB for 100k leads):
```json
"fields": ["id", "email", "leadScore", "createdAt", "leadSource", "company", "industry", "mqlDate"]
```

### Essential Fields by Analysis Type

**Engagement Analysis**:
```json
["id", "email", "leadScore", "behaviorScore", "lastActivityDate"]
```

**Funnel Analysis**:
```json
["id", "leadSource", "leadStatus", "mqlDate", "sqlDate", "opportunityAmount"]
```

**Deliverability Analysis**:
```json
["id", "email", "emailInvalid", "emailInvalidCause", "unsubscribed", "marketingSuspended"]
```

## Export Job Workflow

### Step 1: Create Export Job

```javascript
// Using MCP tool
const createResult = await mcp__marketo__bulk_lead_export_create({
  fields: ["id", "email", "leadScore", "createdAt"],
  format: "CSV",
  filter: {
    createdAt: {
      startAt: "2025-01-01T00:00:00Z",
      endAt: "2025-01-31T00:00:00Z"
    }
  }
});

// Response
{
  "exportId": "abc-123-def",
  "status": "Created",
  "format": "CSV"
}
```

### Step 2: Enqueue Job

```javascript
// Using MCP tool
const enqueueResult = await mcp__marketo__bulk_lead_export_enqueue({
  exportId: "abc-123-def"
});

// Response
{
  "exportId": "abc-123-def",
  "status": "Queued"
}
```

### Step 3: Poll Status

```javascript
// Using MCP tool - poll every 60 seconds
const statusResult = await mcp__marketo__bulk_lead_export_status({
  exportId: "abc-123-def"
});

// Response (when complete)
{
  "exportId": "abc-123-def",
  "status": "Completed",
  "fileSize": 15234567,
  "numberOfRecords": 45000,
  "createdAt": "2025-01-13T02:00:00Z",
  "finishedAt": "2025-01-13T02:05:30Z"
}
```

### Step 4: Download File

```javascript
// Using MCP tool
const fileContent = await mcp__marketo__bulk_lead_export_file({
  exportId: "abc-123-def"
});

// Returns CSV content as string
```

## Error Handling

### Common Errors

| Error Code | Description | Resolution |
|------------|-------------|------------|
| 1029 | Too many jobs in queue | Wait for existing jobs to complete |
| 1035 | Export daily quota exceeded | Wait for quota reset (midnight UTC) |
| 606 | Rate limit exceeded | Wait 20 seconds, retry |
| 611 | Export failed | Check filter validity, retry |

### Retry Strategy

```javascript
const retryConfig = {
  maxRetries: 3,
  initialDelay: 60000, // 1 minute
  backoffMultiplier: 2,
  maxDelay: 300000 // 5 minutes
};
```

## Related

- [03-queuing-polling-download.md](./03-queuing-polling-download.md) - Queue management details
- [04-data-normalization.md](./04-data-normalization.md) - Processing exported data
