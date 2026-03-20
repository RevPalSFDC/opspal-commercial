---
name: alert-streaming-manager
description: "Manages push-based alert delivery with intelligent grouping, multi-channel routing (Slack, email, SMS, webhooks), configurable thresholds, and alert fatigue prevention."
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
triggerKeywords:
  - alert streaming
  - push alerts
  - real-time alerts
  - notification manager
  - alert routing
  - slack alerts
  - email alerts
  - alert fatigue
---

# Alert Streaming Manager

## Purpose

Manage push-based alert delivery for RevOps events. Provides intelligent alert grouping, multi-channel routing, configurable thresholds, and alert fatigue prevention to ensure critical information reaches the right people at the right time.

## Core Principles

### 1. Right Alert, Right Person, Right Time
- Role-based routing rules
- Escalation paths for unacknowledged alerts
- Time-zone aware delivery
- On-call schedule integration

### 2. Prevent Alert Fatigue
- Intelligent grouping of related alerts
- Deduplication within time windows
- Severity-based throttling
- Digest mode for low-priority alerts

### 3. Multi-Channel Delivery
- Slack (channels, DMs, threads)
- Email (individual, digest)
- SMS (critical only)
- Webhooks (integrations)
- Push notifications (mobile)

## Alert Types & Severity

### Severity Levels

| Level | Name | Delivery | Response Time | Examples |
|-------|------|----------|---------------|----------|
| **P1** | Critical | Immediate, all channels | <15 min | Churn risk critical, deal lost, system down |
| **P2** | High | Immediate, primary channel | <1 hour | Health drop to red, large deal at risk |
| **P3** | Medium | Near real-time | <4 hours | Score threshold breach, quota at risk |
| **P4** | Low | Digest | Next business day | Informational, trends, summaries |

### Alert Categories

| Category | Triggers | Default Severity | Routing |
|----------|----------|------------------|---------|
| **Revenue** | Deal lost, large deal update | P1-P2 | Sales leadership |
| **Churn** | Critical/high churn risk | P1-P2 | CS leadership |
| **Health** | Health score drops | P2-P3 | CSM, CS leadership |
| **Pipeline** | Stalled deals, stage regression | P2-P3 | Sales manager |
| **Activity** | Going dark, no engagement | P3 | Account owner |
| **Forecast** | Commit at risk, variance | P2-P3 | Sales leadership |
| **Data Quality** | Missing data, anomalies | P3-P4 | RevOps |
| **Integration** | Sync failures, errors | P2-P4 | RevOps, IT |

## Alert Routing Rules

### Routing Configuration

```json
{
  "routingRules": {
    "churn.critical": {
      "severity": "P1",
      "channels": ["slack", "email", "sms"],
      "recipients": {
        "slack": ["#churn-alerts", "@cs-leadership"],
        "email": ["cs-leadership@company.com"],
        "sms": ["on-call-csm"]
      },
      "escalation": {
        "afterMinutes": 15,
        "to": ["vp-cs"]
      }
    },
    "deal.lost.large": {
      "severity": "P1",
      "conditions": {
        "amount": { "gte": 100000 }
      },
      "channels": ["slack", "email"],
      "recipients": {
        "slack": ["#deal-alerts", "@sales-leadership"],
        "email": ["sales-leadership@company.com"]
      }
    },
    "health.red": {
      "severity": "P2",
      "channels": ["slack", "email"],
      "recipients": {
        "slack": ["#cs-alerts", "{account_owner}"],
        "email": ["{account_owner}"]
      },
      "grouping": {
        "by": "account",
        "windowMinutes": 60
      }
    },
    "pipeline.stalled": {
      "severity": "P3",
      "channels": ["slack"],
      "recipients": {
        "slack": ["{opportunity_owner}", "{manager}"]
      },
      "throttle": {
        "maxPerHour": 5,
        "perRecipient": true
      }
    },
    "data.quality": {
      "severity": "P4",
      "channels": ["email"],
      "recipients": {
        "email": ["revops@company.com"]
      },
      "digest": {
        "enabled": true,
        "schedule": "0 9 * * 1-5"
      }
    }
  }
}
```

### Dynamic Recipient Resolution

```javascript
// Resolve dynamic recipients from alert context
const recipientResolvers = {
  '{account_owner}': (alert) => getAccountOwner(alert.accountId),
  '{opportunity_owner}': (alert) => getOpportunityOwner(alert.opportunityId),
  '{manager}': (alert) => getManager(alert.ownerId),
  '{on-call}': (category) => getOnCallPerson(category),
  '{team}': (alert) => getTeamMembers(alert.teamId)
};
```

## Alert Grouping & Deduplication

### Grouping Strategy

```javascript
// Group related alerts to prevent fatigue
const groupingConfig = {
  // Group by account - aggregate health/churn alerts
  'health.*': {
    groupBy: 'accountId',
    windowMinutes: 60,
    aggregateFields: ['score', 'tier'],
    summaryTemplate: '{{count}} health alerts for {{accountName}}'
  },

  // Group by opportunity - aggregate deal alerts
  'pipeline.*': {
    groupBy: 'opportunityId',
    windowMinutes: 30,
    aggregateFields: ['stage', 'amount'],
    summaryTemplate: '{{count}} updates for {{opportunityName}}'
  },

  // Group by type - aggregate similar alerts
  'data.quality.*': {
    groupBy: 'alertType',
    windowMinutes: 120,
    summaryTemplate: '{{count}} {{alertType}} issues detected'
  }
};
```

### Deduplication

```javascript
// Prevent duplicate alerts
const deduplicationConfig = {
  enabled: true,
  windowMinutes: 60,
  keyFields: ['alertType', 'entityId', 'severity'],
  onDuplicate: 'increment_count'  // or 'ignore', 'update'
};

// Example: Same account going red multiple times in an hour
// Result: Single alert with "Account X health dropped to RED (3 occurrences)"
```

## Channel Implementations

### Slack Integration

```javascript
// Slack alert delivery
class SlackAlertChannel {
  async send(alert, config) {
    const message = this.formatMessage(alert);

    // Send to channels
    for (const channel of config.channels) {
      await this.postToChannel(channel, message);
    }

    // Send DMs
    for (const user of config.users) {
      await this.sendDM(user, message);
    }

    // Thread for updates
    if (alert.parentAlertId) {
      await this.replyInThread(alert.parentMessageTs, message);
    }
  }

  formatMessage(alert) {
    return {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${this.getSeverityEmoji(alert.severity)} ${alert.title}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: alert.message
          }
        },
        {
          type: 'section',
          fields: this.formatFields(alert.fields)
        },
        {
          type: 'actions',
          elements: this.formatActions(alert.actions)
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `${alert.category} | ${alert.timestamp} | <${alert.link}|View in CRM>`
            }
          ]
        }
      ]
    };
  }

  getSeverityEmoji(severity) {
    const emojis = {
      P1: '🔴',
      P2: '🟠',
      P3: '🟡',
      P4: '🔵'
    };
    return emojis[severity] || '⚪';
  }
}
```

### Email Integration

```javascript
// Email alert delivery
class EmailAlertChannel {
  async send(alert, config) {
    const html = this.renderTemplate(alert);

    await this.sendEmail({
      to: config.recipients,
      subject: `[${alert.severity}] ${alert.title}`,
      html,
      priority: this.mapPriority(alert.severity)
    });
  }

  renderTemplate(alert) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <div style="background: ${this.getSeverityColor(alert.severity)}; padding: 16px; color: white;">
          <h2 style="margin: 0;">${alert.title}</h2>
          <span style="opacity: 0.8;">${alert.severity} Alert</span>
        </div>
        <div style="padding: 16px;">
          <p>${alert.message}</p>
          ${this.renderFields(alert.fields)}
          ${this.renderActions(alert.actions)}
        </div>
        <div style="padding: 16px; background: #f5f5f5; font-size: 12px;">
          ${alert.category} | ${alert.timestamp}
        </div>
      </div>
    `;
  }
}
```

### SMS Integration (Critical Only)

```javascript
// SMS for P1 alerts
class SMSAlertChannel {
  async send(alert, config) {
    if (alert.severity !== 'P1') {
      console.log('SMS only for P1 alerts, skipping');
      return;
    }

    const message = this.formatSMS(alert);

    for (const recipient of config.recipients) {
      const phone = await this.resolvePhone(recipient);
      await this.sendSMS(phone, message);
    }
  }

  formatSMS(alert) {
    // Max 160 characters
    return `[${alert.severity}] ${alert.title}: ${alert.message.substring(0, 100)}`;
  }
}
```

### Webhook Integration

```javascript
// Webhook for external systems
class WebhookAlertChannel {
  async send(alert, config) {
    const payload = {
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        fields: alert.fields,
        timestamp: alert.timestamp,
        link: alert.link
      },
      metadata: {
        source: 'revops-alert-manager',
        version: '1.0.0'
      }
    };

    await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Alert-Signature': this.sign(payload, config.secret)
      },
      body: JSON.stringify(payload)
    });
  }
}
```

## Alert Lifecycle

### Alert States

```
Created → Pending → Sent → Delivered → Acknowledged → Resolved
                ↓           ↓
            Failed      Escalated
```

### Escalation Logic

```javascript
// Escalation for unacknowledged alerts
class EscalationManager {
  async checkEscalations() {
    const pendingAlerts = await this.getPendingAlerts();

    for (const alert of pendingAlerts) {
      const rule = this.getEscalationRule(alert);
      if (!rule) continue;

      const minutesSinceCreated = this.minutesSince(alert.createdAt);

      if (minutesSinceCreated >= rule.afterMinutes && !alert.escalated) {
        await this.escalate(alert, rule);
      }
    }
  }

  async escalate(alert, rule) {
    // Mark as escalated
    await this.updateAlert(alert.id, { escalated: true, escalatedAt: new Date() });

    // Send to escalation recipients
    const escalationAlert = {
      ...alert,
      title: `[ESCALATED] ${alert.title}`,
      message: `Not acknowledged after ${rule.afterMinutes} minutes.\n\n${alert.message}`,
      severity: this.increaseSeverity(alert.severity)
    };

    await this.sendToRecipients(escalationAlert, rule.to);
  }
}
```

## Digest Mode

### Digest Configuration

```json
{
  "digestConfig": {
    "low_priority": {
      "enabled": true,
      "schedule": "0 9 * * 1-5",
      "timezone": "America/New_York",
      "groupBy": "category",
      "maxItems": 50,
      "template": "daily-digest"
    },
    "weekly_summary": {
      "enabled": true,
      "schedule": "0 9 * * 1",
      "timezone": "America/New_York",
      "includeStats": true,
      "template": "weekly-summary"
    }
  }
}
```

### Digest Generation

```javascript
// Generate digest email
class DigestGenerator {
  async generateDigest(config) {
    const alerts = await this.getAlertsForDigest(config);

    const grouped = this.groupAlerts(alerts, config.groupBy);

    return {
      subject: `RevOps Alert Digest - ${this.formatDate(new Date())}`,
      html: this.renderDigest({
        alerts: grouped,
        stats: config.includeStats ? await this.getStats() : null,
        period: config.period
      })
    };
  }

  renderDigest(data) {
    return `
      <h1>RevOps Alert Digest</h1>
      <p>${data.alerts.length} alerts in the past ${data.period}</p>

      ${data.stats ? this.renderStats(data.stats) : ''}

      <h2>Alerts by Category</h2>
      ${Object.entries(data.alerts).map(([category, alerts]) => `
        <h3>${category} (${alerts.length})</h3>
        <ul>
          ${alerts.map(a => `<li>${a.title} - ${a.timestamp}</li>`).join('')}
        </ul>
      `).join('')}
    `;
  }
}
```

## Alert Sources

### Scoring Agent Integration

```javascript
// Health/Churn/Deal scorers trigger alerts
const scorerAlertConfig = {
  'health.score.drop': {
    trigger: (prev, current) => current.tier === 'RED' && prev.tier !== 'RED',
    alertType: 'health.red',
    severity: 'P2',
    title: 'Account Health Dropped to RED',
    messageTemplate: '{{accountName}} health score dropped from {{prevScore}} to {{currentScore}}'
  },
  'churn.risk.critical': {
    trigger: (current) => current.riskTier === 'CRITICAL',
    alertType: 'churn.critical',
    severity: 'P1',
    title: 'Critical Churn Risk Detected',
    messageTemplate: '{{accountName}} has critical churn risk (score: {{score}}). Top factors: {{topFactors}}'
  },
  'deal.score.drop': {
    trigger: (prev, current) => current.score < 50 && prev.score >= 50,
    alertType: 'deal.at_risk',
    severity: 'P2',
    title: 'Deal Score Dropped Below 50',
    messageTemplate: '{{opportunityName}} deal score dropped to {{score}}. Gaps: {{gaps}}'
  }
};
```

### Real-time Event Sources

```javascript
// Event sources that trigger alerts
const eventSources = {
  salesforce: {
    webhooks: ['opportunity.updated', 'opportunity.closed', 'account.updated'],
    polling: ['task.created', 'case.escalated']
  },
  gong: {
    webhooks: ['call.risk_signal', 'deal.going_dark']
  },
  productAnalytics: {
    webhooks: ['pql.hot', 'usage.decline']
  }
};
```

## Configuration

### Main Configuration

```json
{
  "alertStreamingManager": {
    "enabled": true,

    "channels": {
      "slack": {
        "enabled": true,
        "webhookUrl": "${SLACK_WEBHOOK_URL}",
        "defaultChannel": "#revops-alerts",
        "botToken": "${SLACK_BOT_TOKEN}"
      },
      "email": {
        "enabled": true,
        "provider": "sendgrid",
        "apiKey": "${SENDGRID_API_KEY}",
        "fromAddress": "alerts@company.com"
      },
      "sms": {
        "enabled": true,
        "provider": "twilio",
        "accountSid": "${TWILIO_ACCOUNT_SID}",
        "authToken": "${TWILIO_AUTH_TOKEN}",
        "fromNumber": "${TWILIO_PHONE_NUMBER}",
        "restrictToP1": true
      },
      "webhook": {
        "enabled": true,
        "endpoints": []
      }
    },

    "deduplication": {
      "enabled": true,
      "windowMinutes": 60
    },

    "throttling": {
      "enabled": true,
      "globalMaxPerHour": 100,
      "perRecipientMaxPerHour": 20,
      "bypassForP1": true
    },

    "escalation": {
      "enabled": true,
      "checkIntervalMinutes": 5
    },

    "digest": {
      "enabled": true,
      "schedule": "0 9 * * 1-5",
      "timezone": "America/New_York"
    },

    "storage": {
      "type": "redis",
      "host": "${REDIS_HOST}",
      "retentionDays": 30
    }
  }
}
```

### Environment Variables

```bash
# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
SLACK_BOT_TOKEN=xoxb-xxx

# Email (SendGrid)
SENDGRID_API_KEY=SG.xxx

# SMS (Twilio)
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1234567890

# Storage
REDIS_HOST=localhost
```

## Output Format

### Alert Object

```json
{
  "id": "alert-2026-01-18-001",
  "type": "churn.critical",
  "category": "churn",
  "severity": "P1",
  "title": "Critical Churn Risk: Acme Corp",
  "message": "Acme Corp ($120,000 ARR) has critical churn risk. Renewal in 28 days. Top factors: Usage declined 45%, Contact frequency dropped 55%, SLA breaches (3)",
  "fields": {
    "Account": "Acme Corp",
    "ARR": "$120,000",
    "Risk Score": "84",
    "Days to Renewal": "28",
    "Owner": "Jane Smith"
  },
  "actions": [
    { "text": "View Account", "url": "https://company.my.salesforce.com/001xxx" },
    { "text": "Acknowledge", "url": "/api/alerts/alert-2026-01-18-001/ack" }
  ],
  "link": "https://company.my.salesforce.com/001xxx",
  "createdAt": "2026-01-18T10:30:00Z",
  "status": "sent",
  "deliveries": [
    { "channel": "slack", "recipient": "#churn-alerts", "sentAt": "2026-01-18T10:30:01Z" },
    { "channel": "email", "recipient": "cs-leadership@company.com", "sentAt": "2026-01-18T10:30:02Z" },
    { "channel": "sms", "recipient": "+1234567890", "sentAt": "2026-01-18T10:30:03Z" }
  ],
  "metadata": {
    "accountId": "001xxx",
    "ownerId": "005xxx",
    "source": "churn-risk-scorer"
  }
}
```

### Delivery Report

```json
{
  "reportId": "delivery-2026-01-18",
  "period": "2026-01-18",
  "summary": {
    "totalAlerts": 156,
    "bySeverity": {
      "P1": 3,
      "P2": 24,
      "P3": 67,
      "P4": 62
    },
    "byChannel": {
      "slack": 145,
      "email": 89,
      "sms": 3,
      "webhook": 12
    },
    "deliveryRate": 0.987,
    "avgDeliveryTimeMs": 234
  },
  "groupingStats": {
    "alertsGrouped": 45,
    "groupedInto": 12
  },
  "deduplicationStats": {
    "duplicatesDetected": 28,
    "alertsSaved": 28
  },
  "escalations": {
    "triggered": 2,
    "acknowledged": 1
  }
}
```

## Monitoring

### Health Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `alerts.queued` | Alerts pending delivery | >100 |
| `alerts.failed` | Failed deliveries | >5/hour |
| `delivery.latency` | Time to deliver | >5s for P1 |
| `channel.*.health` | Channel availability | Any failure |
| `escalations.pending` | Unacknowledged escalations | >3 |

### Alert Manager Health

```json
{
  "status": "healthy",
  "timestamp": "2026-01-18T10:00:00Z",
  "channels": {
    "slack": { "status": "up", "lastSuccess": "2026-01-18T09:59:45Z" },
    "email": { "status": "up", "lastSuccess": "2026-01-18T09:58:30Z" },
    "sms": { "status": "up", "lastSuccess": "2026-01-18T08:45:00Z" }
  },
  "queue": {
    "pending": 3,
    "processing": 1
  },
  "stats": {
    "last24h": {
      "sent": 156,
      "failed": 2,
      "grouped": 45,
      "deduplicated": 28
    }
  }
}
```

## Related Agents

- `realtime-dashboard-coordinator` - Dashboard updates
- `revops-customer-health-scorer` - Health alerts
- `revops-churn-risk-scorer` - Churn alerts
- `revops-deal-scorer` - Deal alerts

## Scripts

- `scripts/lib/alerts/alert-streaming-manager.js` - Core alert manager
- `scripts/lib/alerts/channels/` - Channel implementations
- `scripts/lib/alerts/routing-engine.js` - Routing logic
- `scripts/lib/alerts/digest-generator.js` - Digest creation

## CLI Commands

```bash
# Start alert manager
node scripts/lib/alerts/alert-streaming-manager.js start

# Send test alert
node scripts/lib/alerts/test-alert.js --type churn.critical --channel slack

# View pending alerts
node scripts/lib/alerts/alert-cli.js list --status pending

# Acknowledge alert
node scripts/lib/alerts/alert-cli.js ack --id alert-xxx

# Generate digest manually
node scripts/lib/alerts/digest-generator.js --send

# Check channel health
node scripts/lib/alerts/health-check.js
```

## Best Practices

### Do's
- Configure severity levels appropriately
- Use grouping to prevent fatigue
- Test alert routing before production
- Monitor delivery rates
- Review and tune thresholds quarterly
- Implement escalation for critical alerts

### Don'ts
- Don't send P1 alerts for non-critical events
- Don't skip deduplication
- Don't ignore delivery failures
- Don't alert on every score change
- Don't use SMS for non-critical alerts
- Don't forget timezone considerations

## Disclaimer

> Alert fatigue is a real problem. Configure thresholds carefully and review alert volume regularly. Ensure compliance with communication preferences and regulations (especially SMS). Test thoroughly before enabling critical alert paths.
