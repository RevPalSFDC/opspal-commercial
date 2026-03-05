# CLAUDE.md - Marketo Plugin Guide (v2.1.0)

This file guides Claude when working with the Marketo plugin.

## Quick Reference

### Agent Routing Table

| If user mentions... | Use Agent | Invoke |
|---------------------|-----------|--------|
| marketo lead, create lead, update lead | marketo-lead-manager | `Task(subagent_type='marketo-lead-manager', ...)` |
| smart campaign, trigger campaign | marketo-campaign-builder | `Task(subagent_type='marketo-campaign-builder', ...)` |
| program, channel | marketo-program-architect | `Task(subagent_type='marketo-program-architect', ...)` |
| email template, email program | marketo-email-specialist | `Task(subagent_type='marketo-email-specialist', ...)` |
| landing page, LP | marketo-landing-page-manager | `Task(subagent_type='marketo-landing-page-manager', ...)` |
| form, form field | marketo-form-builder | `Task(subagent_type='marketo-form-builder', ...)` |
| analytics, reporting, attribution | marketo-analytics-assessor | `Task(subagent_type='marketo-analytics-assessor', ...)` |
| revenue cycle, RCM, funnel | marketo-revenue-cycle-analyst | `Task(subagent_type='marketo-revenue-cycle-analyst', ...)` |
| import, export, bulk | marketo-data-operations | `Task(subagent_type='marketo-data-operations', ...)` |
| webhook, integration, API | marketo-integration-specialist | `Task(subagent_type='marketo-integration-specialist', ...)` |
| explore, discover, what do we have | marketo-instance-discovery | `Task(subagent_type='marketo-instance-discovery', ...)` |
| complex workflow, orchestrate | marketo-orchestrator | `Task(subagent_type='marketo-orchestrator', ...)` |
| **lead quality, database health, scoring audit** | **marketo-lead-quality-assessor** | `Task(subagent_type='marketo-lead-quality-assessor', ...)` |
| **program ROI, effectiveness, cost analysis** | **marketo-program-roi-assessor** | `Task(subagent_type='marketo-program-roi-assessor', ...)` |
| **automation audit, campaign conflicts, cascade** | **marketo-automation-auditor** | `Task(subagent_type='marketo-automation-auditor', ...)` |
| **email deliverability, compliance, CAN-SPAM** | **marketo-email-deliverability-auditor** | `Task(subagent_type='marketo-email-deliverability-auditor', ...)` |
| **salesforce sync, SFDC, field mapping** | **marketo-sfdc-sync-specialist** | `Task(subagent_type='marketo-sfdc-sync-specialist', ...)` |
| **hubspot bridge, HS sync** | **marketo-hubspot-bridge** | `Task(subagent_type='marketo-hubspot-bridge', ...)` |
| **governance, approval, compliance** | **marketo-governance-enforcer** | `Task(subagent_type='marketo-governance-enforcer', ...)` |
| **performance, rate limit, optimization** | **marketo-performance-optimizer** | `Task(subagent_type='marketo-performance-optimizer', ...)` |
| **webinar, event campaign, virtual event** | **marketo-webinar-orchestrator** | `Task(subagent_type='marketo-webinar-orchestrator', ...)` |
| **lead scoring, scoring model, behavior score** | **marketo-lead-scoring-architect** | `Task(subagent_type='marketo-lead-scoring-architect', ...)` |
| **MQL handoff, sales handoff, qualified lead** | **marketo-mql-handoff-orchestrator** | `Task(subagent_type='marketo-mql-handoff-orchestrator', ...)` |

### MCP Tools Quick Reference

**Leads:**
```javascript
mcp__marketo__lead_query({ filterType: 'email', filterValues: ['x@y.com'] })
mcp__marketo__lead_create({ leads: [...], action: 'createOrUpdate' })
mcp__marketo__lead_update({ leads: [...], lookupField: 'id' })
mcp__marketo__lead_merge({ winnerId: 123, loserIds: [456, 789] })
mcp__marketo__lead_describe()
mcp__marketo__lead_activities({ leadIds: [123] })
```

**Campaigns:**
```javascript
mcp__marketo__campaign_list({ name: 'Welcome' })
mcp__marketo__campaign_get({ campaignId: 123 })
mcp__marketo__campaign_activate({ campaignId: 123 })
mcp__marketo__campaign_deactivate({ campaignId: 123 })
mcp__marketo__campaign_schedule({ campaignId: 123, runAt: '2025-01-15T10:00:00Z' })
```

**Programs:**
```javascript
mcp__marketo__program_list({ workspace: 'Default' })
mcp__marketo__program_get({ programId: 123 })
mcp__marketo__program_create({ name: 'Q1 Webinar', type: 'event', channel: 'Webinar', folder: { id: 456 } })
mcp__marketo__program_clone({ programId: 123, name: 'Q2 Webinar', folder: { id: 456 } })
```

**Emails:**
```javascript
mcp__marketo__email_list({ folder: { id: 100 } })
mcp__marketo__email_get({ emailId: 123 })
mcp__marketo__email_create({ name: 'Welcome Email', folder: {...}, template: 456 })
mcp__marketo__email_approve({ emailId: 123 })
mcp__marketo__email_send_sample({ emailId: 123, emailAddress: 'test@example.com' })
```

**Landing Pages:**
```javascript
mcp__marketo__landing_page_list({ folder: { id: 100 } })
mcp__marketo__landing_page_get({ landingPageId: 123 })
mcp__marketo__landing_page_create({ name: 'Event Registration', folder: {...}, template: 456 })
mcp__marketo__landing_page_approve({ landingPageId: 123 })
```

**Forms:**
```javascript
mcp__marketo__form_list()
mcp__marketo__form_get({ formId: 123 })
mcp__marketo__form_get_fields({ formId: 123 })
mcp__marketo__form_create({ name: 'Contact Form', folder: {...} })
mcp__marketo__form_add_field({ formId: 123, fieldId: 'email', required: true })
```

**Analytics:**
```javascript
mcp__marketo__analytics_program_report({ programId: 123 })
mcp__marketo__analytics_email_report({ emailId: 123 })
mcp__marketo__analytics_lead_changes({ startDate: '2025-01-01T00:00:00Z' })
mcp__marketo__analytics_activities({ activityTypeIds: [1, 2] })
mcp__marketo__analytics_api_usage()
```

**Salesforce Sync (NEW in v2.0):**
```javascript
mcp__marketo__sync_status({ includeStats: true })
mcp__marketo__sync_errors({ limit: 100, errorType: 'validation' })
mcp__marketo__sync_field_mappings({ objectType: 'lead', includeCustom: true })
mcp__marketo__sync_lead({ leadId: 123, action: 'createOrUpdate' })
mcp__marketo__sync_retry_errors({ errorType: 'validation', maxRecords: 50 })
```

## API Limits

- **Rate**: 100 calls / 20 seconds (sliding window)
- **Daily**: 50,000 calls / day (resets at midnight)
- **Bulk**: 300 records / operation
- **Merge**: 3 loser leads / merge
- **Export**: 500 MB / export job
- **Concurrent**: 10 requests max

## Slash Commands

### Assessment Commands
- `/marketo-audit` - Full instance audit
- `/marketo-preflight` - Pre-operation validation
- `/lead-quality-report` - Lead database health report

### Diagnostic Commands
- `/marketo-logs` - View activity logs with filtering
- `/monitor-sync` - Real-time Salesforce sync status
- `/api-usage` - API usage and rate limit tracking

### Creation Wizards
- `/create-smart-campaign` - Interactive campaign builder
- `/create-email-program` - Email program wizard
- `/create-nurture-program` - Engagement program wizard

## Common Patterns

### Before Any Marketo Operation
1. Check authentication: `/marketo-auth test`
2. Verify instance: `/marketo-instance current`
3. For discovery: use `marketo-instance-discovery` first

### Lead Operations Pattern
```
1. Describe schema → mcp__marketo__lead_describe()
2. Query existing → mcp__marketo__lead_query(...)
3. Create/Update → mcp__marketo__lead_create(...)
4. Verify → mcp__marketo__lead_query(...)
```

### Campaign Creation Pattern
```
1. Discover programs → marketo-instance-discovery
2. Build campaign → marketo-campaign-builder
3. Create emails → marketo-email-specialist
4. Activate → marketo-orchestrator
```

### Quality Assessment Pattern (NEW)
```
1. Lead quality → marketo-lead-quality-assessor
2. Program ROI → marketo-program-roi-assessor
3. Automation health → marketo-automation-auditor
4. Deliverability → marketo-email-deliverability-auditor
```

### Sync Management Pattern (NEW)
```
1. Check status → /monitor-sync --full
2. Review errors → mcp__marketo__sync_errors(...)
3. Resolve issues → marketo-sfdc-sync-specialist
4. Retry failures → mcp__marketo__sync_retry_errors(...)
```

## Error Handling

| Error Code | Meaning | Action |
|------------|---------|--------|
| 601 | Token invalid | Auto-refresh and retry |
| 602 | Token expired | Auto-refresh and retry |
| 606 | Rate limit | Wait 20s, retry |
| 1004 | Lead not found | Verify lead ID |
| 1006 | Field not found | Check schema |
| 1013 | Duplicate | Configure dedup settings |

## Instance Context

Instance-specific data is stored in:
```
portals/{instance}/
├── INSTANCE_CONTEXT.json   # Assessment history
├── INSTANCE_QUIRKS.json    # Customizations
├── QUICK_REFERENCE.md      # Quick lookup
└── assessments/            # Historical assessments
    ├── lead-quality/
    ├── program-roi/
    └── automation-audit/
```

## Performance Scripts (v2.0)

### Batch Operations
```javascript
const batchProcessor = require('.claude-plugins/opspal-core-plugin/packages/domains/marketo/scripts/lib/batch-operation-wrapper');
await batchProcessor.batchProcess(records, 'createOrUpdate', {
  batchSize: 300,
  concurrency: 5,
  retryAttempts: 3
});
```

### Rate Limiting
```javascript
const rateLimiter = require('.claude-plugins/opspal-core-plugin/packages/domains/marketo/scripts/lib/rate-limit-manager');
await rateLimiter.waitIfNeeded();
const status = rateLimiter.getStatus();
```

### Metadata Caching
```javascript
const cache = require('.claude-plugins/opspal-core-plugin/packages/domains/marketo/scripts/lib/metadata-cache');
const schema = await cache.getOrFetchLeadSchema(instance, fetchFn);
```

## Security Rules

- NEVER log or display client secrets
- NEVER commit credentials to git
- ALWAYS use `portals/config.json` for storage (gitignored)
- ALWAYS validate before production operations
- ALWAYS run `/marketo-preflight` before bulk changes

## Proactive Agent Usage

**USE AGENTS PROACTIVELY** for these scenarios:

1. **Before any modifications** → `marketo-instance-discovery` first
2. **Complex multi-step tasks** → `marketo-orchestrator`
3. **Bulk operations** → `marketo-data-operations`
4. **Analytics questions** → `marketo-analytics-assessor`
5. **Lead quality concerns** → `marketo-lead-quality-assessor` (NEW)
6. **Program effectiveness** → `marketo-program-roi-assessor` (NEW)
7. **Automation health check** → `marketo-automation-auditor` (NEW)
8. **Email deliverability issues** → `marketo-email-deliverability-auditor` (NEW)
9. **Salesforce sync problems** → `marketo-sfdc-sync-specialist` (NEW)
10. **HubSpot data bridging** → `marketo-hubspot-bridge` (NEW)
11. **Compliance requirements** → `marketo-governance-enforcer` (NEW)
12. **API performance issues** → `marketo-performance-optimizer` (NEW)

## Runbooks

Located in `docs/runbooks/`:
- **Lead Management**: `lead-quality-maintenance.md`, `bulk-operations-guide.md`
- **Campaign Operations**: `campaign-activation-checklist.md`, `trigger-campaign-best-practices.md`
- **Integrations**: `salesforce-sync-troubleshooting.md`, `hubspot-bridge-setup.md`
- **Performance**: `api-optimization-guide.md`
- **Assessments**: `quarterly-audit-procedure.md`

## Version History

- **v2.0.0** (2025-12): Added 8 new agents, 12 scripts, 6 hooks, 9 commands, 8 runbooks, sync MCP tools
- **v1.0.0** (2025-12): Initial release with 12 agents, MCP server
