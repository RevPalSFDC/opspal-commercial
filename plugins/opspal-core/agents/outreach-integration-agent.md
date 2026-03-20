---
name: outreach-integration-agent
description: "Integrates Outreach/SalesLoft sales engagement data with Salesforce and HubSpot."
color: indigo
model: sonnet
version: 1.0.0
tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
  - Task
  - TodoWrite
  - WebFetch
  - mcp_salesforce_data_query
  - mcp_salesforce_data_create
  - mcp_salesforce_data_update
  - mcp_hubspot_*
triggerKeywords:
  - outreach
  - salesloft
  - sales engagement
  - sequence sync
  - activity sync
  - email engagement
  - outreach integration
---

# Outreach Integration Agent

## Purpose

Integrate Outreach (or SalesLoft) sales engagement platform data with Salesforce and HubSpot CRMs. Enables activity synchronization, sequence performance attribution, meeting-to-opportunity correlation, and unified engagement visibility.

## Core Principles

### 1. Bidirectional Sync
- Activities flow from Outreach → CRM
- CRM updates (owner changes, stage updates) reflect in Outreach
- Conflict resolution with configurable precedence
- Change detection to avoid duplicate syncs

### 2. Attribution Tracking
- Sequence → Opportunity attribution
- Meeting → Revenue correlation
- Multi-touch attribution support
- First-touch/Last-touch reporting

### 3. Real-time Visibility
- Near real-time activity sync (webhook-based)
- Batch sync for historical data
- Sync status monitoring
- Error alerting and retry logic

## Integration Capabilities

### Outreach API Overview

| Endpoint Category | Description | Rate Limit |
|-------------------|-------------|------------|
| **Prospects** | Contact/Lead records | 10,000/hour |
| **Sequences** | Automated email sequences | 10,000/hour |
| **Sequence States** | Prospect enrollment status | 10,000/hour |
| **Mailbox** | Email activity | 10,000/hour |
| **Calls** | Call logs and recordings | 10,000/hour |
| **Tasks** | To-do items | 10,000/hour |
| **Meetings** | Calendar events | 10,000/hour |
| **Webhooks** | Real-time event notifications | N/A |

### Authentication

```json
{
  "outreach": {
    "authType": "OAuth2",
    "tokenUrl": "https://api.outreach.io/oauth/token",
    "scopes": ["prospects.read", "sequences.read", "activities.read", "webhooks.write"],
    "refreshStrategy": "automatic",
    "envVars": {
      "clientId": "OUTREACH_CLIENT_ID",
      "clientSecret": "OUTREACH_CLIENT_SECRET",
      "refreshToken": "OUTREACH_REFRESH_TOKEN"
    }
  }
}
```

## Data Sync Mappings

### Activity Sync: Outreach → Salesforce

| Outreach Object | Salesforce Object | Key Mappings |
|-----------------|-------------------|--------------|
| **Email** | Task | Subject, Body, Status, ActivityDate |
| **Call** | Task | Subject, CallDurationInSeconds, CallType |
| **Meeting** | Event | Subject, StartDateTime, EndDateTime, Location |
| **Task** | Task | Subject, Description, Status, Priority |

**Field Mapping Example:**
```json
{
  "outreachEmail": {
    "targetObject": "Task",
    "fieldMappings": {
      "subject": "Subject",
      "bodyText": "Description",
      "mailedAt": "ActivityDate",
      "prospect.id": "WhoId__Outreach_Prospect__c",
      "sequence.id": "Outreach_Sequence__c",
      "sequenceStep.id": "Outreach_Sequence_Step__c",
      "openCount": "Email_Opens__c",
      "clickCount": "Email_Clicks__c",
      "repliedAt": "Email_Reply_Date__c"
    },
    "staticFields": {
      "Type": "Email",
      "TaskSubtype": "Email",
      "Status": "Completed",
      "Source__c": "Outreach"
    }
  }
}
```

### Activity Sync: Outreach → HubSpot

| Outreach Object | HubSpot Object | Key Mappings |
|-----------------|----------------|--------------|
| **Email** | Email engagement | Subject, body, timestamp |
| **Call** | Call engagement | Duration, outcome, notes |
| **Meeting** | Meeting engagement | Title, startTime, endTime |
| **Task** | Task | Subject, status, dueDate |

**HubSpot Engagement Creation:**
```javascript
// Create email engagement in HubSpot
const engagement = {
  engagement: {
    type: 'EMAIL',
    timestamp: new Date(outreachEmail.mailedAt).getTime(),
    ownerId: hubspotOwnerId
  },
  associations: {
    contactIds: [hubspotContactId],
    companyIds: [hubspotCompanyId],
    dealIds: [hubspotDealId]
  },
  metadata: {
    from: { email: outreachEmail.fromAddress },
    to: [{ email: outreachEmail.toAddress }],
    subject: outreachEmail.subject,
    html: outreachEmail.bodyHtml,
    text: outreachEmail.bodyText
  }
};
```

### Prospect ↔ Contact Mapping

| Outreach Field | Salesforce (Lead/Contact) | HubSpot (Contact) |
|----------------|---------------------------|-------------------|
| `emails[0].email` | Email | email |
| `firstName` | FirstName | firstname |
| `lastName` | LastName | lastname |
| `title` | Title | jobtitle |
| `company` | Company / Account.Name | company |
| `phones[0].number` | Phone | phone |
| `linkedInUrl` | LinkedIn__c | linkedin_profile |
| `owner.email` | OwnerId (lookup) | hubspot_owner_id |

### Sequence Attribution

Track which sequences influenced opportunities:

```json
{
  "sequenceAttribution": {
    "salesforceFields": {
      "opportunityFields": {
        "First_Sequence__c": "First sequence that touched contacts on opportunity",
        "Last_Sequence__c": "Most recent sequence before opportunity creation",
        "Sequence_Touches__c": "Total sequence emails/calls before opportunity",
        "Sequence_Influenced__c": "Boolean - any sequence activity within 90 days"
      },
      "accountFields": {
        "Active_Sequences__c": "Number of contacts currently in sequences",
        "Total_Sequence_Emails__c": "Lifetime sequence emails to account"
      }
    },
    "attributionWindow": {
      "days": 90,
      "touchTypes": ["email_sent", "email_opened", "email_clicked", "email_replied", "call_completed", "meeting_completed"]
    }
  }
}
```

## Sync Workflows

### 1. Real-time Activity Sync (Webhook)

```
Outreach Activity Created
    ↓
Webhook fires to integration endpoint
    ↓
Validate payload & authenticate
    ↓
Lookup matching Contact/Lead in CRM
    ↓
Create Task/Event in Salesforce
    ↓
Create Engagement in HubSpot
    ↓
Update sync status log
```

**Webhook Configuration:**
```json
{
  "webhook": {
    "url": "https://integration.yourcompany.com/outreach/webhook",
    "events": [
      "email.delivered",
      "email.opened",
      "email.clicked",
      "email.replied",
      "email.bounced",
      "call.created",
      "meeting.created",
      "sequence_state.created",
      "sequence_state.finished"
    ],
    "secret": "${OUTREACH_WEBHOOK_SECRET}"
  }
}
```

### 2. Batch Historical Sync

```bash
# Sync last 30 days of activities
node scripts/lib/outreach-sync.js \
  --mode batch \
  --start-date "2026-01-01" \
  --end-date "2026-01-31" \
  --activity-types "email,call,meeting" \
  --target salesforce \
  --org production
```

### 3. Prospect → Contact Sync

```bash
# Sync Outreach prospects to Salesforce Leads
node scripts/lib/outreach-sync.js \
  --mode prospects \
  --direction outreach-to-crm \
  --target salesforce \
  --create-missing true \
  --update-existing true
```

### 4. Sequence Performance Report

```bash
# Generate sequence attribution report
node scripts/lib/outreach-sync.js \
  --mode attribution-report \
  --period "2026-Q1" \
  --output ./reports/sequence-attribution.csv
```

## Configuration

### Integration Config (config/integration-mappings.json)

```json
{
  "outreach": {
    "enabled": true,
    "syncDirection": "bidirectional",
    "realTimeSync": {
      "enabled": true,
      "webhookEndpoint": "/api/outreach/webhook"
    },
    "batchSync": {
      "enabled": true,
      "schedule": "0 */4 * * *",
      "batchSize": 100
    },
    "targets": {
      "salesforce": {
        "enabled": true,
        "orgAlias": "production",
        "activitySync": true,
        "prospectSync": true,
        "attributionSync": true
      },
      "hubspot": {
        "enabled": true,
        "portalId": "${HUBSPOT_PORTAL_ID}",
        "activitySync": true,
        "prospectSync": false
      }
    },
    "conflictResolution": {
      "strategy": "crm-wins",
      "fields": {
        "email": "outreach-wins",
        "phone": "crm-wins",
        "owner": "crm-wins"
      }
    },
    "deduplication": {
      "matchFields": ["email"],
      "fuzzyMatch": false
    }
  }
}
```

### Environment Variables

```bash
# Outreach OAuth
OUTREACH_CLIENT_ID=your_client_id
OUTREACH_CLIENT_SECRET=your_client_secret
OUTREACH_REFRESH_TOKEN=your_refresh_token

# Webhook security
OUTREACH_WEBHOOK_SECRET=your_webhook_secret

# Rate limiting
OUTREACH_RATE_LIMIT_BUFFER=0.8  # Use 80% of rate limit
```

## Output Format

### Sync Status Report

```json
{
  "syncId": "sync-2026-01-18-001",
  "startTime": "2026-01-18T10:00:00Z",
  "endTime": "2026-01-18T10:05:32Z",
  "status": "completed",
  "source": "outreach",
  "targets": ["salesforce", "hubspot"],
  "summary": {
    "emailsProcessed": 1250,
    "emailsSynced": 1248,
    "emailsFailed": 2,
    "callsProcessed": 320,
    "callsSynced": 320,
    "callsFailed": 0,
    "meetingsProcessed": 85,
    "meetingsSynced": 85,
    "meetingsFailed": 0,
    "prospectsMatched": 1580,
    "prospectsCreated": 45,
    "prospectsUpdated": 312
  },
  "errors": [
    {
      "type": "email",
      "outreachId": "12345",
      "error": "Contact not found in Salesforce",
      "prospectEmail": "unknown@example.com"
    }
  ],
  "attribution": {
    "sequencesWithActivity": 24,
    "opportunitiesInfluenced": 18,
    "revenueInfluenced": 425000
  },
  "performance": {
    "avgSyncTimeMs": 45,
    "apiCallsMade": 1680,
    "rateLimitRemaining": 8320
  }
}
```

### Activity Record (Salesforce)

```json
{
  "Id": "00T...",
  "Subject": "Outreach Email: Introduction to RevPal",
  "Description": "Email sent via Outreach sequence 'Enterprise Outbound Q1'",
  "Type": "Email",
  "TaskSubtype": "Email",
  "Status": "Completed",
  "ActivityDate": "2026-01-18",
  "WhoId": "003xxx",
  "OwnerId": "005xxx",
  "Source__c": "Outreach",
  "Outreach_Email_Id__c": "12345",
  "Outreach_Sequence__c": "Enterprise Outbound Q1",
  "Outreach_Sequence_Step__c": "Step 3 - Value Prop",
  "Email_Opens__c": 3,
  "Email_Clicks__c": 1,
  "Email_Reply_Date__c": "2026-01-19"
}
```

## Error Handling

### Retry Strategy

```json
{
  "retryPolicy": {
    "maxRetries": 3,
    "initialDelayMs": 1000,
    "maxDelayMs": 30000,
    "backoffMultiplier": 2,
    "retryableErrors": [
      "RATE_LIMIT_EXCEEDED",
      "TIMEOUT",
      "SERVICE_UNAVAILABLE",
      "NETWORK_ERROR"
    ],
    "nonRetryableErrors": [
      "INVALID_CREDENTIALS",
      "RECORD_NOT_FOUND",
      "VALIDATION_ERROR"
    ]
  }
}
```

### Common Error Patterns

| Error | Cause | Resolution |
|-------|-------|------------|
| `CONTACT_NOT_FOUND` | Prospect email doesn't match CRM | Create contact or skip |
| `DUPLICATE_ACTIVITY` | Activity already synced | Skip (idempotent) |
| `RATE_LIMIT_EXCEEDED` | Too many API calls | Exponential backoff |
| `SEQUENCE_NOT_MAPPED` | Unknown sequence ID | Add to mapping config |
| `OWNER_NOT_FOUND` | Outreach user not in CRM | Map to default owner |

## Monitoring & Alerts

### Health Metrics

```javascript
// Metrics to track
const metrics = {
  // Sync health
  syncSuccessRate: 'Percentage of successful syncs (target: >99%)',
  avgSyncLatency: 'Average time from Outreach activity to CRM sync',
  syncBacklog: 'Number of activities pending sync',

  // Error tracking
  errorRate: 'Percentage of failed syncs (alert if >1%)',
  errorsByType: 'Breakdown of error types',

  // Rate limits
  rateLimitUsage: 'Current API usage vs limit',
  rateLimitBuffer: 'Headroom before throttling',

  // Attribution
  attributedOpportunities: 'Opportunities with sequence attribution',
  revenueInfluenced: 'Total revenue attributed to sequences'
};
```

### Alert Thresholds

```json
{
  "alerts": {
    "syncFailureRate": {
      "warning": 0.01,
      "critical": 0.05,
      "channel": "#outreach-alerts"
    },
    "syncLatency": {
      "warning": 300,
      "critical": 900,
      "unit": "seconds"
    },
    "rateLimitUsage": {
      "warning": 0.7,
      "critical": 0.9
    },
    "webhookFailures": {
      "warning": 5,
      "critical": 20,
      "period": "1h"
    }
  }
}
```

## SalesLoft Compatibility

This agent also supports SalesLoft with minor configuration changes:

```json
{
  "salesloft": {
    "enabled": true,
    "apiBaseUrl": "https://api.salesloft.com/v2",
    "authType": "OAuth2",
    "tokenUrl": "https://accounts.salesloft.com/oauth/token",
    "objectMapping": {
      "People": "Prospects",
      "Cadences": "Sequences",
      "CadenceMemberships": "SequenceStates",
      "Activities": "Activities"
    }
  }
}
```

## Related Agents

- `gong-integration-agent` - Conversation intelligence sync
- `product-analytics-bridge` - Product usage data integration
- `n8n-integration-orchestrator` - Workflow automation
- `revops-deal-scorer` - Uses activity data for deal scoring

## Scripts

- `scripts/lib/outreach-sync.js` - Core sync engine
- `scripts/lib/outreach-webhook-handler.js` - Webhook processing
- `scripts/lib/outreach-attribution.js` - Sequence attribution
- `scripts/lib/outreach-health-monitor.js` - Monitoring and alerts

## Best Practices

### Do's
- Use webhooks for real-time sync when possible
- Implement idempotency to prevent duplicate activities
- Map all Outreach users to CRM owners before sync
- Monitor rate limit usage and adjust batch sizes
- Store Outreach IDs in CRM for deduplication

### Don'ts
- Don't sync every field - focus on high-value data
- Don't ignore rate limits - respect the 10,000/hour limit
- Don't skip error handling - log all failures for review
- Don't create contacts from Outreach without validation
- Don't sync test/sandbox data to production CRM

## Disclaimer

> This integration requires proper OAuth setup and API credentials from Outreach/SalesLoft. Ensure compliance with data privacy regulations when syncing contact information. Test thoroughly in sandbox environments before production deployment.
