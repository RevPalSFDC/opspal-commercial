# Data Normalization

## Overview

Raw bulk export files from Marketo are CSV format with varying structures. This runbook covers transforming these exports into normalized JSON structures suitable for Claude analysis.

## Input Formats

### Lead Export CSV

```csv
id,firstName,lastName,email,company,leadScore,createdAt
123456,John,Doe,john.doe@acme.com,Acme Inc,85,2025-01-15T10:30:00Z
123457,Jane,Smith,jane.smith@beta.io,Beta Corp,92,2025-01-15T11:45:00Z
```

### Activity Export CSV

```csv
marketoGUID,activityDate,activityTypeId,leadId,primaryAttributeValue,attributes
abc123,2025-01-15T10:30:00Z,6,123456,email-campaign-1,"{""Subject"":""Welcome!"",""Campaign ID"":1001}"
def456,2025-01-15T10:35:00Z,10,123456,email-campaign-1,"{""User Agent"":""Mozilla/5.0""}"
```

### Program Member Export CSV

```csv
leadId,firstName,lastName,email,program,programId,membershipDate,statusName,reachedSuccess
123456,John,Doe,john.doe@acme.com,Q1 Webinar,1044,2025-01-10T00:00:00Z,Attended,true
123457,Jane,Smith,jane.smith@beta.io,Q1 Webinar,1044,2025-01-12T00:00:00Z,Registered,false
```

## Output Schemas

### Normalized Lead Schema

```json
{
  "exportId": "abc-123",
  "exportDate": "2025-01-15T00:00:00Z",
  "recordCount": 45000,
  "leads": [
    {
      "id": 123456,
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@acme.com",
      "company": "Acme Inc",
      "leadScore": 85,
      "createdAt": "2025-01-15T10:30:00Z",
      "_normalized": {
        "fullName": "John Doe",
        "domain": "acme.com",
        "scoreCategory": "hot"
      }
    }
  ],
  "summary": {
    "totalLeads": 45000,
    "avgScore": 67.3,
    "scoreDistribution": {
      "cold": 15000,
      "warm": 20000,
      "hot": 10000
    },
    "topDomains": [
      { "domain": "acme.com", "count": 500 },
      { "domain": "beta.io", "count": 350 }
    ]
  }
}
```

### Normalized Activity Schema

```json
{
  "exportId": "def-456",
  "exportDate": "2025-01-15T00:00:00Z",
  "dateRange": {
    "start": "2025-01-14T00:00:00Z",
    "end": "2025-01-15T00:00:00Z"
  },
  "recordCount": 125000,
  "activities": [
    {
      "guid": "abc123",
      "activityDate": "2025-01-15T10:30:00Z",
      "activityType": {
        "id": 6,
        "name": "Send Email"
      },
      "leadId": 123456,
      "primaryAttribute": "email-campaign-1",
      "attributes": {
        "Subject": "Welcome!",
        "Campaign ID": 1001
      }
    }
  ],
  "summary": {
    "totalActivities": 125000,
    "byType": {
      "Send Email": 50000,
      "Open Email": 12500,
      "Click Email": 3000,
      "Fill Out Form": 500
    },
    "byHour": {
      "09": 15000,
      "10": 18000,
      "11": 22000
    },
    "engagementRate": {
      "openRate": 25.0,
      "clickRate": 6.0,
      "clickToOpenRate": 24.0
    }
  }
}
```

### Normalized Program Member Schema

```json
{
  "exportId": "ghi-789",
  "exportDate": "2025-01-15T00:00:00Z",
  "programId": 1044,
  "programName": "Q1 Webinar",
  "recordCount": 500,
  "members": [
    {
      "leadId": 123456,
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@acme.com",
      "membershipDate": "2025-01-10T00:00:00Z",
      "status": {
        "name": "Attended",
        "isSuccess": true
      }
    }
  ],
  "summary": {
    "totalMembers": 500,
    "byStatus": {
      "Registered": 200,
      "Attended": 250,
      "No Show": 50
    },
    "successCount": 250,
    "successRate": 50.0,
    "funnel": {
      "registered": 500,
      "attended": 250,
      "converted": 50
    }
  }
}
```

## Normalization Functions

### CSV Parser

```javascript
const Papa = require('papaparse');

function parseCSV(csvContent) {
  const result = Papa.parse(csvContent, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });

  if (result.errors.length > 0) {
    console.warn('CSV parsing warnings:', result.errors);
  }

  return result.data;
}
```

### Lead Normalizer

```javascript
function normalizeLeads(csvContent, exportMetadata) {
  const leads = parseCSV(csvContent);

  // Add derived fields
  const normalizedLeads = leads.map(lead => ({
    ...lead,
    _normalized: {
      fullName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
      domain: extractDomain(lead.email),
      scoreCategory: categorizeScore(lead.leadScore)
    }
  }));

  // Calculate summary
  const summary = {
    totalLeads: normalizedLeads.length,
    avgScore: calculateAverage(normalizedLeads.map(l => l.leadScore)),
    scoreDistribution: {
      cold: normalizedLeads.filter(l => l._normalized.scoreCategory === 'cold').length,
      warm: normalizedLeads.filter(l => l._normalized.scoreCategory === 'warm').length,
      hot: normalizedLeads.filter(l => l._normalized.scoreCategory === 'hot').length
    },
    topDomains: getTopDomains(normalizedLeads, 10)
  };

  return {
    ...exportMetadata,
    recordCount: normalizedLeads.length,
    leads: normalizedLeads,
    summary
  };
}

function extractDomain(email) {
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1].toLowerCase();
}

function categorizeScore(score) {
  if (score == null) return 'unknown';
  if (score < 30) return 'cold';
  if (score < 70) return 'warm';
  return 'hot';
}

function getTopDomains(leads, limit) {
  const domainCounts = {};
  for (const lead of leads) {
    const domain = lead._normalized.domain;
    if (domain) {
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }
  }

  return Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([domain, count]) => ({ domain, count }));
}
```

### Activity Normalizer

```javascript
// Activity type mapping (load from Marketo API)
const ACTIVITY_TYPES = {
  1: 'Visit Webpage',
  2: 'Fill Out Form',
  6: 'Send Email',
  7: 'Delivered Email',
  8: 'Bounced Email',
  9: 'Unsubscribe Email',
  10: 'Open Email',
  11: 'Click Email',
  12: 'New Lead',
  13: 'Change Data Value',
  21: 'Change Score',
  104: 'Change Status in Progression'
};

function normalizeActivities(csvContent, exportMetadata) {
  const activities = parseCSV(csvContent);

  // Parse JSON attributes and map activity types
  const normalizedActivities = activities.map(activity => {
    let attributes = {};
    try {
      if (activity.attributes) {
        attributes = JSON.parse(activity.attributes);
      }
    } catch (e) {
      console.warn(`Failed to parse attributes for ${activity.marketoGUID}`);
    }

    return {
      guid: activity.marketoGUID,
      activityDate: activity.activityDate,
      activityType: {
        id: activity.activityTypeId,
        name: ACTIVITY_TYPES[activity.activityTypeId] || `Unknown (${activity.activityTypeId})`
      },
      leadId: activity.leadId,
      primaryAttribute: activity.primaryAttributeValue,
      attributes
    };
  });

  // Calculate summary
  const summary = calculateActivitySummary(normalizedActivities);

  return {
    ...exportMetadata,
    recordCount: normalizedActivities.length,
    activities: normalizedActivities,
    summary
  };
}

function calculateActivitySummary(activities) {
  // Count by type
  const byType = {};
  for (const act of activities) {
    const typeName = act.activityType.name;
    byType[typeName] = (byType[typeName] || 0) + 1;
  }

  // Count by hour
  const byHour = {};
  for (const act of activities) {
    const hour = new Date(act.activityDate).getUTCHours().toString().padStart(2, '0');
    byHour[hour] = (byHour[hour] || 0) + 1;
  }

  // Calculate engagement rates
  const sends = byType['Send Email'] || 0;
  const opens = byType['Open Email'] || 0;
  const clicks = byType['Click Email'] || 0;

  return {
    totalActivities: activities.length,
    byType,
    byHour,
    engagementRate: {
      openRate: sends > 0 ? (opens / sends * 100).toFixed(1) : 0,
      clickRate: sends > 0 ? (clicks / sends * 100).toFixed(1) : 0,
      clickToOpenRate: opens > 0 ? (clicks / opens * 100).toFixed(1) : 0
    }
  };
}
```

### Program Member Normalizer

```javascript
function normalizeProgramMembers(csvContent, exportMetadata) {
  const members = parseCSV(csvContent);

  const normalizedMembers = members.map(member => ({
    leadId: member.leadId,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    membershipDate: member.membershipDate,
    status: {
      name: member.statusName,
      isSuccess: member.reachedSuccess === true || member.reachedSuccess === 'true'
    }
  }));

  // Calculate summary
  const byStatus = {};
  let successCount = 0;
  for (const member of normalizedMembers) {
    byStatus[member.status.name] = (byStatus[member.status.name] || 0) + 1;
    if (member.status.isSuccess) successCount++;
  }

  const summary = {
    totalMembers: normalizedMembers.length,
    byStatus,
    successCount,
    successRate: normalizedMembers.length > 0
      ? (successCount / normalizedMembers.length * 100).toFixed(1)
      : 0
  };

  return {
    ...exportMetadata,
    recordCount: normalizedMembers.length,
    members: normalizedMembers,
    summary
  };
}
```

## Incremental Updates

### Lead Upsert Logic

```javascript
function upsertLeads(existingData, newExport) {
  const leadMap = new Map();

  // Load existing
  if (existingData && existingData.leads) {
    for (const lead of existingData.leads) {
      leadMap.set(lead.id, lead);
    }
  }

  // Update with new data
  let added = 0, updated = 0;
  for (const lead of newExport.leads) {
    if (leadMap.has(lead.id)) {
      updated++;
    } else {
      added++;
    }
    leadMap.set(lead.id, lead);
  }

  // Rebuild leads array
  const leads = Array.from(leadMap.values());

  return {
    ...newExport,
    leads,
    recordCount: leads.length,
    incrementalStats: { added, updated }
  };
}
```

### Activity Append Logic

```javascript
function appendActivities(existingData, newExport) {
  const existingGuids = new Set();
  let activities = [];

  // Load existing
  if (existingData && existingData.activities) {
    activities = existingData.activities;
    for (const act of activities) {
      existingGuids.add(act.guid);
    }
  }

  // Append new (deduplicate by GUID)
  let added = 0, skipped = 0;
  for (const act of newExport.activities) {
    if (existingGuids.has(act.guid)) {
      skipped++;
    } else {
      activities.push(act);
      added++;
    }
  }

  // Recalculate summary
  const summary = calculateActivitySummary(activities);

  return {
    ...newExport,
    activities,
    recordCount: activities.length,
    summary,
    incrementalStats: { added, skipped }
  };
}
```

## Storage Format

### File Naming Convention

```
instances/{portal}/observability/exports/
├── leads/
│   ├── 2025-01-15-leads.json           # Daily snapshot
│   ├── 2025-01-15-leads-incremental.json # Just the delta
│   └── leads-current.json              # Rolling current state
├── activities/
│   ├── 2025-01-15-activities.json      # Daily activities
│   └── activities-7day.json            # Rolling 7-day window
└── program-members/
    ├── 2025-01-15-program-1044.json    # By program and date
    └── program-1044-current.json       # Current state per program
```

### Index File

Maintain an index for quick lookups:

```json
{
  "lastUpdated": "2025-01-15T04:30:00Z",
  "exports": {
    "leads": {
      "latest": "2025-01-15-leads.json",
      "current": "leads-current.json",
      "recordCount": 150000,
      "lastExportDate": "2025-01-15T02:00:00Z"
    },
    "activities": {
      "latest": "2025-01-15-activities.json",
      "rollingWindow": "activities-7day.json",
      "recordCount": 850000,
      "lastExportDate": "2025-01-15T03:00:00Z"
    },
    "programMembers": {
      "programs": {
        "1044": {
          "name": "Q1 Webinar",
          "current": "program-1044-current.json",
          "recordCount": 500
        }
      },
      "lastExportDate": "2025-01-15T04:00:00Z"
    }
  }
}
```

## Metric Aggregation

### Pre-Computed Metrics for Claude

```javascript
function computeMetricsForClaude(normalizedData) {
  const { leads, activities, programMembers } = normalizedData;

  return {
    computedAt: new Date().toISOString(),

    // Lead metrics
    leadMetrics: {
      totalLeads: leads.recordCount,
      avgScore: leads.summary.avgScore,
      scoreDistribution: leads.summary.scoreDistribution,
      growthRate: calculateGrowthRate(leads)
    },

    // Engagement metrics
    engagementMetrics: {
      emailOpenRate: parseFloat(activities.summary.engagementRate.openRate),
      emailClickRate: parseFloat(activities.summary.engagementRate.clickRate),
      formFillRate: calculateFormFillRate(activities),
      peakEngagementHours: identifyPeakHours(activities.summary.byHour)
    },

    // Program metrics
    programMetrics: programMembers.map(pm => ({
      programId: pm.programId,
      programName: pm.programName,
      totalMembers: pm.summary.totalMembers,
      successRate: parseFloat(pm.summary.successRate),
      statusFunnel: pm.summary.byStatus
    })),

    // Anomalies
    anomalies: detectAnomalies(normalizedData)
  };
}

function detectAnomalies(data) {
  const anomalies = [];

  // Check for unusual open rates
  const openRate = parseFloat(data.activities?.summary?.engagementRate?.openRate || 0);
  if (openRate < 10) {
    anomalies.push({
      type: 'low_open_rate',
      severity: 'warning',
      value: openRate,
      threshold: 10,
      message: `Email open rate (${openRate}%) is below typical threshold (10%)`
    });
  }

  // Check for high bounce rates
  const activities = data.activities?.summary?.byType || {};
  const sends = activities['Send Email'] || 0;
  const bounces = activities['Bounced Email'] || 0;
  const bounceRate = sends > 0 ? (bounces / sends * 100) : 0;

  if (bounceRate > 5) {
    anomalies.push({
      type: 'high_bounce_rate',
      severity: 'critical',
      value: bounceRate.toFixed(1),
      threshold: 5,
      message: `Email bounce rate (${bounceRate.toFixed(1)}%) exceeds healthy threshold (5%)`
    });
  }

  return anomalies;
}
```

## Related

- [03-queuing-polling-download.md](./03-queuing-polling-download.md) - Getting raw data
- [05-claude-analysis-patterns.md](./05-claude-analysis-patterns.md) - Using normalized data with Claude
