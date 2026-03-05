---
name: marketo-mql-handoff-framework
description: Marketo MQL qualification and sales handoff workflow patterns. Use when configuring MQL qualification triggers, setting up Salesforce lead sync, designing lead assignment rules, creating sales notifications, implementing SLA monitoring, or building MQL recycle workflows.
allowed-tools: Read, Grep, Glob
---

# Marketo MQL Handoff Framework

## When to Use This Skill

- Configuring MQL qualification trigger campaigns
- Setting up Salesforce lead sync on qualification
- Designing lead assignment rules (round-robin, territory, account-based)
- Creating sales alert notifications
- Implementing SLA monitoring and escalation
- Building MQL recycle workflows

## Quick Reference

### MQL Qualification Criteria

| Criterion | Typical Threshold | Notes |
|-----------|-------------------|-------|
| Behavior Score | >= 50 | Engagement level |
| Demographic Score | >= 40 | Fit level |
| Combined Score | >= 90 | Alternative approach |

### Required Field Validation

| Field | Validation | Reason |
|-------|------------|--------|
| Email | Valid, not empty | Contact ability |
| First Name | Not empty | Personalization |
| Last Name | Not empty | Personalization |
| Company | Not empty | Account matching |
| Phone | Recommended | Sales outreach |

### Standard Program Structure

```
MQL Handoff Program
├── Qualification (01-03)
├── Salesforce Sync (10-12)
├── Notifications (20-22)
├── SLA Monitoring (30-33)
└── Recycle (40-42)
```

## Detailed Documentation

See supporting files:
- `handoff-criteria.md` - MQL definitions
- `routing-rules.md` - Lead routing patterns
- `sync-patterns.md` - SFDC sync configuration
- `scoring-thresholds.md` - Score threshold design
