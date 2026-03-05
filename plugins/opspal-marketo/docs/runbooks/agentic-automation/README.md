# Marketo Agentic Automation Runbook

## Overview

This runbook provides comprehensive guidance for autonomous agent orchestration of Marketo operations. It covers five key capability areas that enable an AI agent to fully manage Marketo campaigns, programs, and lead operations via REST API.

## Capability Areas

| Chapter | Topic | Agent Used |
|---------|-------|------------|
| [01](./01-program-tokens.md) | Dynamic Program Tokens | `marketo-program-architect` |
| [02](./02-asset-creation.md) | Asset Creation (Emails, Forms, LPs) | `marketo-email-specialist`, `marketo-form-builder`, `marketo-landing-page-manager` |
| [03](./03-program-templates-cloning.md) | Program Templates & Cloning | `marketo-program-architect` |
| [04](./04-lead-management.md) | Lead Management (Dedupe, Scoring) | `marketo-lead-manager`, `marketo-lead-scoring-architect` |
| [05](./05-activities-bulk-extract.md) | Activities & Bulk Extract | `marketo-data-operations` |
| [06](./06-orchestration-patterns.md) | Multi-Step Orchestration | `marketo-automation-orchestrator` |
| [07](./07-api-governance.md) | API Governance & Rate Limits | All agents |
| [08](./08-end-to-end-examples.md) | Complete Workflow Examples | `marketo-automation-orchestrator` |

## Quick Reference: MCP Tools by Category

### Program & Token Management
```javascript
mcp__marketo__program_list({ workspace })
mcp__marketo__program_get({ programId })
mcp__marketo__program_clone({ programId, name, folder, description })
mcp__marketo__program_tokens_get({ folderId, folderType })
mcp__marketo__program_tokens_update({ folderId, folderType, tokens })
```

### Asset Creation
```javascript
// Emails
mcp__marketo__email_create({ name, folder, template, subject, fromName, fromEmail })
mcp__marketo__email_approve({ emailId })

// Forms
mcp__marketo__form_create({ name, folder, language, description })
mcp__marketo__form_add_field({ formId, fieldId, required })

// Landing Pages
mcp__marketo__landing_page_create({ name, folder, template, title })
mcp__marketo__landing_page_approve({ landingPageId })
```

### Lead Operations
```javascript
mcp__marketo__lead_create({ leads, action, lookupField })
mcp__marketo__lead_query({ filterType, filterValues, fields })
mcp__marketo__lead_merge({ winnerId, loserIds, mergeInCRM })
mcp__marketo__lead_describe()
```

### Bulk Operations (NEW)
```javascript
// Lead Export
mcp__marketo__bulk_lead_export_create({ fields, filter, format })
mcp__marketo__bulk_lead_export_enqueue({ exportId })
mcp__marketo__bulk_lead_export_status({ exportId })
mcp__marketo__bulk_lead_export_file({ exportId })

// Activity Export
mcp__marketo__bulk_activity_export_create({ activityTypeIds, filter, format })
mcp__marketo__bulk_activity_export_enqueue({ exportId })
mcp__marketo__bulk_activity_export_status({ exportId })
mcp__marketo__bulk_activity_export_file({ exportId })

// Lead Import
mcp__marketo__bulk_lead_import_create({ file, format, lookupField, listId })
mcp__marketo__bulk_import_status({ batchId })

// Activity Types
mcp__marketo__activity_types_list()
```

### Campaign Execution
```javascript
mcp__marketo__campaign_clone({ campaignId, name, folder })
mcp__marketo__campaign_activate({ campaignId })
mcp__marketo__campaign_request({ campaignId, leads, tokens })
mcp__marketo__campaign_schedule({ campaignId, runAt, tokens })
```

## API Rate Limits

| Limit Type | Value | Recovery |
|------------|-------|----------|
| Rate Limit | 100 calls / 20 seconds | Wait 20s |
| Daily Quota | 50,000 calls / day | Wait until midnight UTC |
| Concurrent | 10 simultaneous requests | Serialize |
| Bulk Export | 2 running, 10 queued | Poll status |
| Bulk Import | 10 concurrent | Queue next |
| Bulk Data | 500 MB / day export | Plan exports |

## Error Code Quick Reference

| Code | Meaning | Action |
|------|---------|--------|
| 601 | Token invalid | Auto-refresh, retry |
| 602 | Token expired | Auto-refresh, retry |
| 606 | Rate limit exceeded | Wait 20s, retry |
| 607 | Daily quota exceeded | Stop, wait for reset |
| 615 | Concurrent limit | Serialize requests |
| 1029 | Bulk queue full | Wait, retry |

## Agent Routing Guide

**Use `marketo-automation-orchestrator` when:**
- Setting up complete programs from templates
- Multi-step workflows (clone + tokens + assets + activate)
- Bulk data operations with monitoring
- End-to-end campaign deployment

**Use specialist agents when:**
- Single-domain operations (just email, just forms, etc.)
- Focused tasks with clear boundaries
- Troubleshooting specific asset types

## Prerequisites

1. **Authentication**: Marketo API credentials configured
   - `MARKETO_CLIENT_ID`
   - `MARKETO_CLIENT_SECRET`
   - `MARKETO_BASE_URL`

2. **Permissions**: API user with appropriate access
   - Asset API access for programs/emails/forms/LPs
   - Lead Database API access for lead operations
   - Bulk Extract permissions for export jobs

3. **Templates**: Pre-configured program templates for cloning
   - Located in designated template folder
   - Contains placeholder tokens
   - Has approved assets ready for customization

## Version History

- **v1.0.0** (2026-01): Initial runbook with 5 capability areas
- Added bulk operations MCP tools
- Added orchestration patterns
- Added end-to-end examples
