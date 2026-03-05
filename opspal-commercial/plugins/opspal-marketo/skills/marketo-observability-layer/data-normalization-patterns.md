# Data Normalization Patterns

Transform raw Marketo bulk exports into Claude-ready data structures.

## CSV Parsing

### Lead Export CSV
```csv
id,email,firstName,lastName,leadScore,createdAt
1234,john@example.com,John,Doe,75,2025-01-15T10:30:00Z
```

### Normalized JSON
```json
{
  "exportType": "leads",
  "exportDate": "2025-01-15T14:00:00Z",
  "recordCount": 45230,
  "summary": {
    "avgScore": 67.3,
    "scoreDistribution": {
      "cold": { "count": 15000, "percent": 33 },
      "warm": { "count": 20230, "percent": 45 },
      "hot": { "count": 10000, "percent": 22 }
    }
  },
  "records": [...]
}
```

## Activity Parsing

### Raw Activity CSV
```csv
leadId,activityDate,activityTypeId,primaryAttributeValue,attributes
1234,2025-01-15T10:30:00Z,11,Welcome Email,"{""Campaign Id"":2001}"
```

### Activity Attribute Extraction
```javascript
// Parse nested JSON from attributes column
const attrs = JSON.parse(row.attributes);
// Result: { "Campaign Id": 2001 }
```

### Normalized Activity JSON
```json
{
  "leadId": 1234,
  "activityDate": "2025-01-15T10:30:00Z",
  "activityType": "Open Email",
  "activityTypeId": 11,
  "primaryValue": "Welcome Email",
  "attributes": {
    "campaignId": 2001
  }
}
```

## Activity Type Mapping

### Build Type Mapping
```javascript
const types = await mcp__marketo__activity_types_list();
const typeMap = {};
types.forEach(t => {
  typeMap[t.id] = {
    name: t.name,
    category: categorizeActivity(t.id)
  };
});
```

### Category Classification
```javascript
const categories = {
  email: [6, 7, 8, 9, 10, 11, 27],    // Send, Delivered, Bounce, Open, Click, Unsubscribe
  form: [2],                           // Fill Out Form
  web: [3],                            // Visit Webpage
  scoring: [22, 23],                   // Change Score, Change Data Value
  progression: [104, 106]              // Status Change, Add to Nurture
};
```

## Schema Design

### Lead Schema
```json
{
  "type": "lead",
  "fields": {
    "id": { "type": "integer", "required": true },
    "email": { "type": "string", "required": true },
    "firstName": { "type": "string" },
    "lastName": { "type": "string" },
    "leadScore": { "type": "integer", "default": 0 },
    "createdAt": { "type": "datetime" },
    "updatedAt": { "type": "datetime" }
  }
}
```

### Activity Schema
```json
{
  "type": "activity",
  "fields": {
    "leadId": { "type": "integer", "required": true },
    "activityDate": { "type": "datetime", "required": true },
    "activityTypeId": { "type": "integer", "required": true },
    "activityType": { "type": "string" },
    "primaryValue": { "type": "string" },
    "attributes": { "type": "object" }
  }
}
```

### Program Member Schema
```json
{
  "type": "programMember",
  "fields": {
    "leadId": { "type": "integer", "required": true },
    "programId": { "type": "integer", "required": true },
    "membershipDate": { "type": "datetime" },
    "progressionStatus": { "type": "string" },
    "statusName": { "type": "string" },
    "reachedSuccess": { "type": "boolean" }
  }
}
```

## Aggregation Patterns

### Engagement Metrics
```javascript
function calculateEngagementMetrics(activities) {
  const sent = activities.filter(a => a.activityTypeId === 6).length;
  const delivered = activities.filter(a => a.activityTypeId === 7).length;
  const opened = activities.filter(a => a.activityTypeId === 11).length;
  const clicked = activities.filter(a => a.activityTypeId === 10).length;
  const bounced = activities.filter(a => [8, 9].includes(a.activityTypeId)).length;

  return {
    deliveryRate: (delivered / sent) * 100,
    openRate: (opened / delivered) * 100,
    clickRate: (clicked / delivered) * 100,
    bounceRate: (bounced / sent) * 100,
    ctr: (clicked / opened) * 100  // Click-to-open rate
  };
}
```

### Score Distribution
```javascript
function calculateScoreDistribution(leads) {
  const cold = leads.filter(l => l.leadScore < 30);
  const warm = leads.filter(l => l.leadScore >= 30 && l.leadScore < 70);
  const hot = leads.filter(l => l.leadScore >= 70);

  const total = leads.length;
  return {
    cold: { count: cold.length, percent: Math.round(cold.length / total * 100) },
    warm: { count: warm.length, percent: Math.round(warm.length / total * 100) },
    hot: { count: hot.length, percent: Math.round(hot.length / total * 100) }
  };
}
```

### Time-Based Patterns
```javascript
function analyzeTimePatterns(activities) {
  const byHour = {};
  const byDay = {};

  activities.forEach(a => {
    const date = new Date(a.activityDate);
    const hour = date.getUTCHours();
    const day = date.getUTCDay();

    byHour[hour] = (byHour[hour] || 0) + 1;
    byDay[day] = (byDay[day] || 0) + 1;
  });

  return { byHour, byDay };
}
```

## Incremental Updates

### Tracking Last Export
```json
{
  "lastExport": {
    "leads": {
      "timestamp": "2025-01-15T14:00:00Z",
      "recordCount": 45230,
      "filePath": "exports/leads/2025-01-15-leads.json"
    },
    "activities": {
      "timestamp": "2025-01-15T15:00:00Z",
      "recordCount": 125890,
      "filePath": "exports/activities/activities-7day.json"
    }
  }
}
```

### Delta Calculation
```javascript
function calculateDelta(current, previous) {
  return {
    newRecords: current.recordCount - previous.recordCount,
    percentChange: ((current.recordCount - previous.recordCount) / previous.recordCount) * 100,
    metrics: {
      openRate: current.metrics.openRate - previous.metrics.openRate,
      clickRate: current.metrics.clickRate - previous.metrics.clickRate
    }
  };
}
```

## Output Files

### File Naming
```
exports/
├── leads/
│   ├── leads-current.json        # Latest export
│   └── leads-2025-01-15.json     # Dated archive
├── activities/
│   ├── activities-7day.json      # Rolling 7-day window
│   └── activities-2025-01-15.json
└── program-members/
    └── program-1044-members.json
```

### File Structure
```json
{
  "metadata": {
    "exportType": "leads",
    "exportDate": "2025-01-15T14:00:00Z",
    "dateRange": {
      "start": "2025-01-08T00:00:00Z",
      "end": "2025-01-15T23:59:59Z"
    },
    "recordCount": 45230,
    "fileSizeBytes": 12845632
  },
  "summary": {
    // Aggregated metrics
  },
  "records": [
    // Normalized records
  ]
}
```

## Validation

### Required Fields Check
```javascript
function validateRecord(record, schema) {
  const errors = [];
  for (const [field, spec] of Object.entries(schema.fields)) {
    if (spec.required && !record[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  return errors;
}
```

### Data Quality Flags
```javascript
function flagQualityIssues(leads) {
  return leads.map(lead => ({
    ...lead,
    _quality: {
      hasEmail: !!lead.email,
      hasName: !!(lead.firstName || lead.lastName),
      hasScore: lead.leadScore > 0,
      isComplete: calculateCompleteness(lead)
    }
  }));
}
```
