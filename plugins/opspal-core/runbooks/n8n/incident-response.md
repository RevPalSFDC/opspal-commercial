# Creating Incident Response Workflows

A solution-agnostic guide for building n8n workflows that automatically respond to system incidents, collect diagnostics, and trigger remediation.

## Purpose

This runbook provides patterns for creating incident response workflows that detect issues, gather diagnostic information, notify appropriate teams, and optionally execute automated remediation. These workflows reduce mean-time-to-resolution (MTTR) by automating the initial response process.

## Prerequisites

- [ ] Monitoring system with webhook/API capabilities
- [ ] Notification channels configured (Slack, PagerDuty, Email)
- [ ] Access to systems for diagnostic collection
- [ ] Runbook for manual remediation steps
- [ ] Escalation matrix defined

## Procedure

### Step 1: Define Incident Types

**Common Incident Categories:**

| Type | Trigger Source | Severity | Response |
|------|---------------|----------|----------|
| API Failure | Health check | Critical | Immediate notification + diagnostics |
| Rate Limiting | API response code | Medium | Backoff + notification |
| Data Sync Failure | Workflow error | High | Retry + notification if persists |
| Authentication Error | OAuth failure | Critical | Alert + credential refresh |
| Performance Degradation | Latency threshold | Medium | Diagnostics + scaling |
| Data Quality Issue | Validation failure | Low-Medium | Log + batch notification |

**Expected Result:** Incident taxonomy defined with severity and response.

### Step 2: Create Incident Detection Trigger

**Option A: Webhook from Monitoring System**
```json
{
  "type": "n8n-nodes-base.webhook",
  "name": "Incident Webhook",
  "parameters": {
    "path": "incident-handler",
    "httpMethod": "POST",
    "authentication": "headerAuth"
  }
}
```

**Option B: Error Trigger from Other Workflows**
```json
{
  "type": "n8n-nodes-base.errorTrigger",
  "name": "Workflow Error Handler"
}
```

**Option C: Scheduled Health Check**
```json
{
  "type": "n8n-nodes-base.scheduleTrigger",
  "name": "Health Check",
  "parameters": {
    "rule": {
      "interval": [{"field": "minutes", "minutesInterval": 5}]
    }
  }
}
```

**Expected Result:** Incident detection mechanism in place.

### Step 3: Classify Incident Severity

**Classification Logic:**
```javascript
// Incident classifier
const incident = $json;

let severity = 'LOW';
let category = 'UNKNOWN';
let escalate = false;

// Classify by error type
const errorCode = incident.statusCode || incident.error?.code || 0;
const errorMessage = (incident.message || incident.error?.message || '').toLowerCase();

if (errorCode === 401 || errorCode === 403 || errorMessage.includes('auth')) {
  category = 'AUTHENTICATION';
  severity = 'CRITICAL';
  escalate = true;
} else if (errorCode === 429 || errorMessage.includes('rate limit')) {
  category = 'RATE_LIMIT';
  severity = 'MEDIUM';
} else if (errorCode >= 500 || errorMessage.includes('unavailable')) {
  category = 'SERVICE_OUTAGE';
  severity = 'CRITICAL';
  escalate = true;
} else if (errorMessage.includes('timeout')) {
  category = 'TIMEOUT';
  severity = 'HIGH';
} else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
  category = 'DATA_QUALITY';
  severity = 'LOW';
}

// Check for repeated incidents (circuit breaker pattern)
const staticData = $getWorkflowStaticData('global');
const incidentKey = `${category}_${incident.source || 'unknown'}`;
const recentIncidents = staticData[incidentKey] || [];
const now = Date.now();

// Filter to last 5 minutes
const recentCount = recentIncidents.filter(t => now - t < 300000).length;

if (recentCount >= 3) {
  severity = 'CRITICAL';
  escalate = true;
}

// Record this incident
staticData[incidentKey] = [...recentIncidents.filter(t => now - t < 300000), now];

return {
  incidentId: `INC-${Date.now()}`,
  category,
  severity,
  escalate,
  recentCount,
  timestamp: new Date().toISOString(),
  source: incident.source || 'unknown',
  originalIncident: incident
};
```

**Expected Result:** Incidents classified by severity and category.

### Step 4: Gather Diagnostic Information

**Diagnostic Collection Node:**
```javascript
// Gather diagnostics based on incident type
const incident = $json;
const diagnostics = {
  incidentId: incident.incidentId,
  collectedAt: new Date().toISOString(),
  data: {}
};

// Collect relevant data based on category
switch (incident.category) {
  case 'AUTHENTICATION':
    diagnostics.data = {
      credentialStatus: 'Check credential expiration',
      lastSuccessfulAuth: 'Query from logs',
      affectedIntegrations: []
    };
    break;

  case 'SERVICE_OUTAGE':
    diagnostics.data = {
      serviceEndpoint: incident.originalIncident.endpoint,
      lastKnownGood: 'Query from history',
      errorResponse: incident.originalIncident.error,
      dependentWorkflows: []
    };
    break;

  case 'RATE_LIMIT':
    diagnostics.data = {
      currentUsage: 'Query API usage',
      limit: incident.originalIncident.limit,
      resetTime: incident.originalIncident.resetAt,
      recentRequests: []
    };
    break;

  case 'DATA_QUALITY':
    diagnostics.data = {
      failedRecords: incident.originalIncident.records,
      validationErrors: incident.originalIncident.errors,
      sourceSystem: incident.source
    };
    break;
}

return diagnostics;
```

**Expected Result:** Diagnostic data collected for analysis.

### Step 5: Configure Notification Routing

**Severity-Based Routing:**
```json
{
  "type": "n8n-nodes-base.switch",
  "name": "Route by Severity",
  "parameters": {
    "rules": [
      {
        "output": 0,
        "conditions": {"string": [{"value1": "={{$json.severity}}", "value2": "CRITICAL"}]}
      },
      {
        "output": 1,
        "conditions": {"string": [{"value1": "={{$json.severity}}", "value2": "HIGH"}]}
      },
      {
        "output": 2,
        "conditions": {"string": [{"value1": "={{$json.severity}}", "value2": "MEDIUM"}]}
      }
    ],
    "fallbackOutput": 3
  }
}
```

**Critical Alert (Slack + PagerDuty):**
```json
{
  "type": "n8n-nodes-base.slack",
  "parameters": {
    "channel": "#incidents-critical",
    "text": "🚨 *CRITICAL INCIDENT*\n\n*ID:* {{$json.incidentId}}\n*Category:* {{$json.category}}\n*Source:* {{$json.source}}\n*Time:* {{$json.timestamp}}\n\n*Diagnostics:*\n```{{JSON.stringify($json.diagnostics.data, null, 2)}}```",
    "attachments": [
      {
        "color": "danger",
        "title": "Incident Details",
        "fields": [
          {"title": "Severity", "value": "{{$json.severity}}", "short": true},
          {"title": "Recent Occurrences", "value": "{{$json.recentCount}}", "short": true}
        ]
      }
    ]
  }
}
```

**Expected Result:** Notifications routed to appropriate channels.

### Step 6: Implement Auto-Remediation

**Remediation Decision:**
```javascript
// Determine if auto-remediation is safe
const incident = $json;

const safeToRemediate = {
  RATE_LIMIT: true,      // Safe to back off
  TIMEOUT: true,         // Safe to retry with longer timeout
  AUTHENTICATION: false, // Requires human intervention
  SERVICE_OUTAGE: false, // External dependency
  DATA_QUALITY: true     // Can skip/quarantine bad records
};

const remediationActions = {
  RATE_LIMIT: {
    action: 'BACKOFF',
    params: { waitMinutes: 5, reduceLoadPercent: 50 }
  },
  TIMEOUT: {
    action: 'RETRY',
    params: { timeoutMs: 60000, maxRetries: 3 }
  },
  DATA_QUALITY: {
    action: 'QUARANTINE',
    params: { moveToDeadLetter: true, notifyDataTeam: true }
  }
};

return {
  ...incident,
  autoRemediate: safeToRemediate[incident.category] || false,
  remediation: remediationActions[incident.category] || null
};
```

**Execute Remediation:**
```javascript
// Execute remediation action
const incident = $json;

if (!incident.autoRemediate) {
  return { action: 'ESCALATE', reason: 'Manual intervention required' };
}

const remediation = incident.remediation;

switch (remediation.action) {
  case 'BACKOFF':
    // Update affected workflows to reduce load
    return {
      action: 'BACKOFF',
      status: 'INITIATED',
      details: `Reducing load by ${remediation.params.reduceLoadPercent}% for ${remediation.params.waitMinutes} minutes`
    };

  case 'RETRY':
    // Queue retry with adjusted parameters
    return {
      action: 'RETRY',
      status: 'QUEUED',
      details: `Retrying with ${remediation.params.timeoutMs}ms timeout`
    };

  case 'QUARANTINE':
    // Move bad records to dead letter
    return {
      action: 'QUARANTINE',
      status: 'COMPLETED',
      details: 'Failed records moved to dead letter queue'
    };
}
```

**Expected Result:** Automated remediation executed where safe.

### Step 7: Create Escalation Path

**Escalation Workflow:**
```
[IF Escalate Required]
    ↓ Yes
[PagerDuty Alert] → [Create Incident Ticket] → [Notify Manager]
    ↓ No
[Log Incident] → [Update Dashboard]
```

**PagerDuty Integration:**
```json
{
  "type": "n8n-nodes-base.httpRequest",
  "name": "PagerDuty Alert",
  "parameters": {
    "url": "https://events.pagerduty.com/v2/enqueue",
    "method": "POST",
    "body": {
      "routing_key": "{{$credentials.pagerdutyKey}}",
      "event_action": "trigger",
      "payload": {
        "summary": "{{$json.category}} - {{$json.source}}",
        "severity": "={{$json.severity === 'CRITICAL' ? 'critical' : 'warning'}}",
        "source": "n8n-incident-response",
        "custom_details": {
          "incident_id": "{{$json.incidentId}}",
          "diagnostics": "{{JSON.stringify($json.diagnostics)}}"
        }
      }
    }
  }
}
```

**Expected Result:** Critical incidents escalate to on-call responders.

### Step 8: Log and Track Resolution

**Incident Tracking:**
```javascript
// Create incident record for tracking
const incident = $json;

const incidentRecord = {
  id: incident.incidentId,
  created: incident.timestamp,
  category: incident.category,
  severity: incident.severity,
  source: incident.source,
  status: incident.autoRemediate ? 'AUTO_RESOLVED' : 'ESCALATED',
  remediation: incident.remediation,
  diagnostics: incident.diagnostics,
  resolution: {
    type: incident.autoRemediate ? 'AUTOMATED' : 'PENDING',
    action: incident.remediation?.action || 'MANUAL',
    timestamp: new Date().toISOString()
  }
};

// Store in database or logging system
return incidentRecord;
```

**Expected Result:** All incidents logged for analysis.

## Complete Incident Response Workflow

```
[Incident Trigger]
       ↓
[Classify Severity]
       ↓
[Gather Diagnostics]
       ↓
[Route by Severity] ──→ [CRITICAL] → [Slack + PagerDuty] → [Create Ticket]
       │                              ↓
       ├─→ [HIGH] ──────→ [Slack Alert] → [Queue for Review]
       │                              ↓
       ├─→ [MEDIUM] ────→ [Auto-Remediate] → [Log Result]
       │                              ↓
       └─→ [LOW] ───────→ [Batch Notification] → [Log]
                                      ↓
                            [Update Dashboard]
```

## Validation

### Success Criteria
- [ ] Incidents detected within SLA (< 1 minute)
- [ ] Severity correctly classified
- [ ] Diagnostics collected automatically
- [ ] Notifications reach correct channels
- [ ] Auto-remediation executes safely
- [ ] Escalation triggers on-call response
- [ ] All incidents logged and tracked

### Test Scenarios
1. **Auth Failure**: Revoke test credential, verify CRITICAL flow
2. **Rate Limit**: Trigger 429 response, verify backoff
3. **Service Outage**: Simulate 503 response, verify escalation
4. **Data Quality**: Send invalid record, verify quarantine

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Incident not detected | Webhook misconfigured | Verify webhook URL and auth |
| Wrong severity | Classification logic error | Review and update rules |
| Notification not sent | Channel misconfigured | Check Slack/PD credentials |
| Auto-remediation fails | Insufficient permissions | Verify API access |
| Duplicate alerts | No deduplication | Add incident caching |
| Escalation delayed | PagerDuty routing issue | Check routing rules |

## Rollback

### If Incident Response Causes Issues:
1. Deactivate incident response workflow
2. Alert on-call team manually
3. Review incident logs
4. Fix workflow issues
5. Test thoroughly before reactivating

### Disable Auto-Remediation:
Update classification to set `autoRemediate: false` for all categories temporarily.

## Related Resources

- **Agents:**
  - `n8n-execution-monitor` - Monitor workflow executions
  - `n8n-error-analyzer` - Analyze error patterns

- **Scripts:**
  - `n8n-error-analyzer.js` - Categorize errors
  - `n8n-execution-reporter.js` - Generate incident reports

- **Other Runbooks:**
  - `error-handling-strategy.md` - Error handling patterns
  - `workflow-lifecycle.md` - Emergency deactivation

---

**Version:** 1.0.0
**Last Updated:** 2025-12-03
