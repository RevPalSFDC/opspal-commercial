# CLAUDE.md - Marketo Plugin Guide (v2.5.1)

This file guides Claude when working with the Marketo plugin.

## Quick Reference

### Agent Routing Table

| If user mentions... | Use Agent | Invoke |
|---------------------|-----------|--------|
| marketo lead, create lead, update lead | marketo-lead-manager | `Task(subagent_type='marketo-lead-manager', ...)` |
| smart campaign, trigger campaign | marketo-campaign-builder | `Task(subagent_type='marketo-campaign-builder', ...)` |
| **campaign api, clone campaign, delete campaign, campaign crud** | **marketo-smart-campaign-api-specialist** | `Task(subagent_type='marketo-smart-campaign-api-specialist', ...)` |
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
| **agentic automation, orchestrate program, bulk operations, multi-step workflow** | **marketo-automation-orchestrator** | `Task(subagent_type='marketo-automation-orchestrator', ...)` |
| **observability, continuous intelligence, marketing metrics, bulk extract** | **marketo-observability-orchestrator** | `Task(subagent_type='marketo-observability-orchestrator', ...)` |
| **normalize data, transform export, CSV parsing** | **marketo-data-normalizer** | `Task(subagent_type='marketo-data-normalizer', ...)` |
| **analyze performance, AI recommendations, insights** | **marketo-intelligence-analyst** | `Task(subagent_type='marketo-intelligence-analyst', ...)` |
| **campaign not triggering, flow failure, leads stuck, token error, diagnose campaign** | **marketo-campaign-diagnostician** | `Task(subagent_type='marketo-campaign-diagnostician', ...)` |
| **lead routing failure, daisy chain issue, routing loop, routing race** | **marketo-lead-routing-diagnostician** | `Task(subagent_type='marketo-lead-routing-diagnostician', ...)` |

### MCP Tools Quick Reference

**Leads:**
```javascript
mcp__marketo__lead_query({ filterType: 'email', filterValues: ['x@y.com'] })
mcp__marketo__lead_create({ leads: [...], action: 'createOrUpdate' })
mcp__marketo__lead_update({ leads: [...], lookupField: 'id' })
mcp__marketo__lead_merge({ winnerId: 123, loserIds: [456, 789] })
mcp__marketo__lead_describe()
mcp__marketo__lead_activities({ leadIds: [123] })
mcp__marketo__lead_list_membership({ leadId: 123 })
mcp__marketo__lead_program_membership({ leadId: 123 })
mcp__marketo__lead_smart_campaign_membership({ leadId: 123 })
mcp__marketo__lead_routing_trace({ filterType: 'email', filterValues: ['x@y.com'], sinceDatetime: '2026-02-01T00:00:00Z' })
```

**Campaigns:**
```javascript
mcp__marketo__campaign_list({ name: 'Welcome' })
mcp__marketo__campaign_get({ campaignId: 123 })
mcp__marketo__campaign_create({ name: 'New Campaign', folder: { id: 100, type: 'Program' } })
mcp__marketo__campaign_update({ campaignId: 123, name: 'Updated Name' })
mcp__marketo__campaign_clone({ campaignId: 123, name: 'Cloned Campaign', folder: { id: 100, type: 'Program' } })
mcp__marketo__campaign_delete({ campaignId: 123 })
mcp__marketo__campaign_get_smart_list({ campaignId: 123, includeRules: true })
mcp__marketo__campaign_activate({ campaignId: 123 })
mcp__marketo__campaign_deactivate({ campaignId: 123 })
mcp__marketo__campaign_schedule({ campaignId: 123, runAt: '2025-01-15T10:00:00Z' })
mcp__marketo__campaign_request({ campaignId: 123, leads: [{ id: 456 }] })
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

**Lists:**
```javascript
// Static lists
mcp__marketo__list_list({ name: 'API', folder: { id: 100, type: 'Folder' } })
mcp__marketo__list_get({ listId: 1234 })
mcp__marketo__list_create({ name: 'API Feed', folder: { id: 100, type: 'Folder' } })
mcp__marketo__list_add_leads({ listId: 1234, leads: [{ id: 5678 }] })
mcp__marketo__list_remove_leads({ listId: 1234, leads: [{ id: 5678 }] })
mcp__marketo__list_leads({ listId: 1234, fields: ['email', 'firstName'] })

// Smart lists (read/clone/delete only)
mcp__marketo__smart_list_list({ name: 'Scoring' })
mcp__marketo__smart_list_get({ smartListId: 4321, includeRules: true })
mcp__marketo__smart_list_clone({ smartListId: 4321, name: 'Clone', folder: { id: 100, type: 'Folder' } })
mcp__marketo__smart_list_delete({ smartListId: 4321 })
```

**Analytics:**
```javascript
mcp__marketo__analytics_program_report({ programId: 123 })
mcp__marketo__analytics_email_report({ emailId: 123 })
mcp__marketo__analytics_lead_changes({ startDate: '2025-01-01T00:00:00Z' })
mcp__marketo__analytics_activities({ activityTypeIds: [1, 2] })
mcp__marketo__analytics_api_usage()
mcp__marketo__analytics_activity_trace_window({ startDate: '2026-02-01T00:00:00Z', leadIds: [123] })
mcp__marketo__analytics_loop_detector({ startDate: '2026-02-01T00:00:00Z', leadIds: [123], routingFields: ['leadStatus'] })
```

**Salesforce Sync (NEW in v2.0):**
```javascript
mcp__marketo__sync_status({ includeStats: true })
mcp__marketo__sync_errors({ limit: 100, errorType: 'validation' })
mcp__marketo__sync_field_mappings({ objectType: 'lead', includeCustom: true })
mcp__marketo__sync_lead({ leadId: 123, action: 'createOrUpdate' })
mcp__marketo__sync_retry_errors({ errorType: 'validation', maxRecords: 50 })
```

**Bulk Operations (NEW in v2.4):**
```javascript
// Bulk Lead Export
mcp__marketo__bulk_lead_export_create({ fields: [...], filter: { createdAt: { startAt, endAt } } })
mcp__marketo__bulk_lead_export_enqueue({ exportId: 'xyz' })
mcp__marketo__bulk_lead_export_status({ exportId: 'xyz' })
mcp__marketo__bulk_lead_export_file({ exportId: 'xyz' })
mcp__marketo__bulk_lead_export_cancel({ exportId: 'xyz' })

// Bulk Activity Export
mcp__marketo__bulk_activity_export_create({ activityTypeIds: [6, 7, 10, 11], filter: { createdAt: { startAt, endAt } } })
mcp__marketo__bulk_activity_export_enqueue({ exportId: 'xyz' })
mcp__marketo__bulk_activity_export_status({ exportId: 'xyz' })
mcp__marketo__bulk_activity_export_file({ exportId: 'xyz' })
mcp__marketo__bulk_activity_export_cancel({ exportId: 'xyz' })

// Bulk Lead Import
mcp__marketo__bulk_lead_import_create({ file: '...', format: 'csv', lookupField: 'email' })
mcp__marketo__bulk_lead_import_status({ batchId: 'xyz' })
mcp__marketo__bulk_lead_import_failures({ batchId: 'xyz' })
mcp__marketo__bulk_lead_import_warnings({ batchId: 'xyz' })

// Activity Discovery
mcp__marketo__activity_types_list()  // Returns all activity type IDs
```

## API Limits

### Standard API
- **Rate**: 100 calls / 20 seconds (sliding window)
- **Daily**: 50,000 calls / day (resets at midnight)
- **Bulk**: 300 records / operation
- **Merge**: 3 loser leads / merge
- **Concurrent**: 10 requests max

### Bulk API (NEW in v2.4)
- **Daily Export**: 500 MB / day (all bulk exports combined)
- **Export Date Range**: 31 days maximum
- **Concurrent Exports**: 2 running jobs, 10 queued
- **Concurrent Imports**: 10 jobs
- **File Retention**: 7 days after completion
- **Import File Size**: 10 MB max

## Slash Commands

### Assessment Commands
- `/marketo-audit` - Full instance audit
- `/marketo-preflight` - Pre-operation validation
- `/lead-quality-report` - Lead database health report

### Diagnostic Commands
- `/marketo-logs` - View activity logs with filtering
- `/monitor-sync` - Real-time Salesforce sync status
- `/api-usage` - API usage and rate limit tracking
- `/diagnose-campaign` - Interactive campaign troubleshooting wizard
- `/diagnose-lead-routing` - Lead-level routing trace and root-cause diagnostics
- `/remediate-lead-routing` - Controlled remediation workflow (dry-run default)

### Creation Wizards
- `/create-smart-campaign` - Interactive campaign builder
- `/create-email-program` - Email program wizard
- `/create-nurture-program` - Engagement program wizard

### Agentic Automation (NEW in v2.4)
- `/bulk-export-wizard` - Interactive bulk export setup (leads/activities)
- `/orchestrate-program` - End-to-end program deployment wizard
- `/activity-report` - Generate activity summaries without full export

### Observability Layer (NEW in v2.5)
- `/observability-setup` - Configure continuous intelligence layer
- `/observability-dashboard` - View metrics, quota, recommendations
- `/extract-wizard` - Interactive bulk export with normalization
- `/analyze-performance` - Trigger Claude-powered analysis and recommendations

## Validation Framework (NEW)

**Comprehensive validation system preventing errors before Marketo operations**

The Validation Framework provides automatic error prevention through 5 validation stages:

1. **Schema Validation** - Validates data structure against JSON schemas
2. **Parse Error Handling** - Auto-fixes JSON/XML/CSV parsing issues
3. **Data Quality** - Detects synthetic data and quality issues (4-layer scoring)
4. **Tool Contract** - Validates Marketo MCP calls before execution
5. **Permission Validation** - Checks bulk operations and lead access

**Automatic Hooks** (already enabled):
- `pre-reflection-submit.sh` - Validates reflections before submission
- `pre-tool-execution.sh` - Validates Marketo MCP tool calls

**Quick Commands**:
```bash
# Generate validation dashboard
node ../opspal-core/scripts/lib/validation-dashboard-generator.js generate --days 30

# Test data quality validation
node ../salesforce-plugin/scripts/lib/enhanced-data-quality-framework.js validate \
  --query-result ./leads.json

# Temporarily disable validation
export SKIP_VALIDATION=1              # All validation
export SKIP_TOOL_VALIDATION=1         # Tool validation only
```

**Documentation**: See `../../docs/VALIDATION_FRAMEWORK_GUIDE.md` for complete guide

**Performance**:
- <500ms total validation time
- <100ms data quality check
- 95%+ pass rate for legitimate operations

**Common Validations**:
- ✅ API rate limits (100 calls / 20 seconds)
- ✅ Bulk operation limits (300 records max)
- ✅ Lead merge validation (3 loser leads max)
- ✅ Required field validation
- ✅ Synthetic data detection
- ✅ Campaign activation checks
- ✅ Salesforce sync field mappings

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

### Agentic Automation Pattern (NEW in v2.4)
```
1. Plan workflow → Read orchestration-patterns runbook
2. Clone program → mcp__marketo__program_clone(...)
3. Configure tokens → mcp__marketo__program_tokens_update(...)
4. Approve assets → Form → Email → Landing Page (order matters!)
5. Import leads → mcp__marketo__bulk_lead_import_create(...)
6. Activate campaigns → mcp__marketo__campaign_activate(...)
7. Monitor results → mcp__marketo__bulk_activity_export_create(...)
```

### Bulk Export Pattern (NEW in v2.4)
```
1. Create job → mcp__marketo__bulk_lead_export_create(...)
2. Enqueue → mcp__marketo__bulk_lead_export_enqueue(...)
3. Poll status → mcp__marketo__bulk_lead_export_status(...)
4. Download file → mcp__marketo__bulk_lead_export_file(...)
```

## Error Handling

| Error Code | Meaning | Action |
|------------|---------|--------|
| 601 | Token invalid | Auto-refresh and retry |
| 602 | Token expired | Auto-refresh and retry |
| 606 | Rate limit | Wait 20s, retry |
| 607 | Daily quota exceeded | Wait until midnight reset |
| 613 | Concurrent limit | Wait for job completion |
| 1004 | Lead not found | Verify lead ID |
| 1006 | Field not found | Check schema |
| 1013 | Duplicate | Configure dedup settings |
| 1029 | Bulk queue full | Wait and retry (export) |
| 1035 | Export limit exceeded | Check 500MB daily quota |

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
const batchProcessor = require('./scripts/lib/batch-operation-wrapper');
await batchProcessor.batchProcess(records, 'createOrUpdate', {
  batchSize: 300,
  concurrency: 5,
  retryAttempts: 3
});
```

### Rate Limiting
```javascript
const rateLimiter = require('./scripts/lib/rate-limit-manager');
await rateLimiter.waitIfNeeded();
const status = rateLimiter.getStatus();
```

### Metadata Caching
```javascript
const cache = require('./scripts/lib/metadata-cache');
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
5. **Lead quality concerns** → `marketo-lead-quality-assessor`
6. **Program effectiveness** → `marketo-program-roi-assessor`
7. **Automation health check** → `marketo-automation-auditor`
8. **Email deliverability issues** → `marketo-email-deliverability-auditor`
9. **Salesforce sync problems** → `marketo-sfdc-sync-specialist`
10. **HubSpot data bridging** → `marketo-hubspot-bridge`
11. **Compliance requirements** → `marketo-governance-enforcer`
12. **API performance issues** → `marketo-performance-optimizer`
13. **Agentic program deployment** → `marketo-automation-orchestrator` (NEW v2.4)
14. **Multi-step bulk workflows** → `marketo-automation-orchestrator` (NEW v2.4)
15. **Continuous marketing intelligence** → `marketo-observability-orchestrator` (NEW v2.5)
16. **Data normalization and transformation** → `marketo-data-normalizer` (NEW v2.5)
17. **AI-powered analysis and recommendations** → `marketo-intelligence-analyst` (NEW v2.5)

## Runbooks

Located in `docs/runbooks/`:
- **Lead Management**: `lead-quality-maintenance.md`, `bulk-operations-guide.md`
- **Campaign Operations**: `campaign-activation-checklist.md`, `trigger-campaign-best-practices.md`
- **Campaign Diagnostics** (NEW): `campaign-diagnostics/README.md` - 10-module troubleshooting series
- **Integrations**: `salesforce-sync-troubleshooting.md`, `hubspot-bridge-setup.md`
- **Governance**: `01-instance-health-governance-foundations.md`, `02-automation-performance-guardrails.md`, `03-operational-workflows-incident-response.md`, `04-troubleshooting-pitfalls-sfdc-mapping.md`
- **Performance**: `api-optimization-guide.md`
- **Assessments**: `quarterly-audit-procedure.md`

### Agentic Automation (NEW in v2.4)
Located in `docs/runbooks/agentic-automation/`:
- `01-program-tokens.md` - Dynamic token management via API
- `02-asset-creation.md` - Emails, Forms, Landing Pages automation
- `03-program-templates-cloning.md` - Clone strategies and restrictions
- `04-lead-management.md` - Deduplication, merge, segmentation
- `05-activities-bulk-extract.md` - Activity logs and bulk export
- `06-orchestration-patterns.md` - Multi-step workflow patterns
- `07-api-governance.md` - Rate limits, quotas, error handling
- `08-end-to-end-examples.md` - Complete workflow examples

### Skills Quick Reference
Located in `skills/marketo-agentic-automation/`:
- `SKILL.md` - Overview and capability summary
- `program-token-patterns.md` - Token management quick reference
- `asset-creation-patterns.md` - Asset creation patterns
- `clone-strategies.md` - Program cloning reference
- `lead-bulk-patterns.md` - Lead and bulk operation patterns
- `orchestration-checklist.md` - Pre-flight validation checklist

### Observability Layer (NEW in v2.5)
Located in `skills/marketo-observability-layer/`:
- `SKILL.md` - Overview and capability summary
- `bulk-extract-patterns.md` - Bulk Export API patterns
- `data-normalization-patterns.md` - CSV parsing and schema mapping
- `analysis-prompt-patterns.md` - Claude analysis templates
- `recommendation-templates.md` - Action recommendation templates
- `continuous-loop-patterns.md` - Feedback loop integration

## Version History

- **v2.5.1** (2026-01): Campaign diagnostics integration - 1 new agent (marketo-campaign-diagnostician), 1 new command (/diagnose-campaign), 2 new scripts, 1 new hook, 10-module runbook series integration
- **v2.5.0** (2026-01): Observability layer - Claude-powered continuous intelligence, 3 new agents, 4 commands, 4 hooks, 6 scripts, 8 runbooks, skill documentation
- **v2.4.0** (2026-01): Agentic automation capabilities - 15 bulk MCP tools, orchestrator agent, 8 runbooks, 3 commands, 3 hooks, skill documentation
- **v2.3.0** (2026-01): Smart Campaigns REST API support - campaign CRUD, smart list management, scheduling
- **v2.0.0** (2025-12): Added 8 new agents, 12 scripts, 6 hooks, 9 commands, 8 runbooks, sync MCP tools
- **v1.0.0** (2025-12): Initial release with 12 agents, MCP server
