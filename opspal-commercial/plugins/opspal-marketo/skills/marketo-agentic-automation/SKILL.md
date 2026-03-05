---
name: marketo-agentic-automation
description: Marketo agentic automation patterns and best practices. Use for autonomous program deployment, bulk operations, orchestration workflows, and API governance. Covers all 5 capability areas from the agentic automation runbook.
allowed-tools: Read, Grep, Glob, Task
---

# Marketo Agentic Automation Skill

## When to Use This Skill

- Autonomous program deployment from templates
- Bulk export/import operations
- Multi-step orchestration workflows
- API rate limit management
- Token configuration automation
- Asset approval workflows
- Lead deduplication at scale
- Activity data extraction

## Capability Areas

| Area | Description | Key Tools |
|------|-------------|-----------|
| Program Tokens | Dynamic token configuration | `program_tokens_get`, `program_tokens_update` |
| Asset Creation | Emails, forms, landing pages | `email_create`, `form_create`, `landing_page_create` |
| Program Cloning | Template-based deployment | `program_clone` |
| Lead Management | Dedupe, merge, segment | `lead_query`, `lead_create`, `lead_merge` |
| Bulk Extract | Export leads/activities | `bulk_*_export_*` tools |

## Quick Reference

### Orchestration Pattern
```
1. Clone program → mcp__marketo__program_clone
2. Update tokens → mcp__marketo__program_tokens_update
3. Discover assets → mcp__marketo__program_get
4. Approve: Forms → Emails → Landing Pages
5. Activate triggers → mcp__marketo__campaign_activate
6. Schedule batch → mcp__marketo__campaign_schedule
```

### Bulk Export Pattern
```
1. Create job → mcp__marketo__bulk_lead_export_create
2. Enqueue → mcp__marketo__bulk_lead_export_enqueue
3. Poll status → mcp__marketo__bulk_lead_export_status
4. Download → mcp__marketo__bulk_lead_export_file
```

### API Constraints

| Limit | Value | Recovery |
|-------|-------|----------|
| Rate | 100/20s | Wait 20s |
| Daily | 50,000 | Midnight UTC |
| Concurrent | 10 | Serialize |
| Bulk Export | 2 running | Queue (max 10) |
| Daily Export | 500 MB | Midnight UTC |
| Date Range | 31 days | Split jobs |

## Agent Routing

| Task | Agent |
|------|-------|
| Program deployment | `marketo-automation-orchestrator` |
| Bulk data ops | `marketo-data-operations` |
| Single asset | Specialist agents |

## Related Files

- [Runbook: README](../../docs/runbooks/agentic-automation/README.md)
- [Runbook: Program Tokens](../../docs/runbooks/agentic-automation/01-program-tokens.md)
- [Runbook: Asset Creation](../../docs/runbooks/agentic-automation/02-asset-creation.md)
- [Runbook: Program Cloning](../../docs/runbooks/agentic-automation/03-program-templates-cloning.md)
- [Runbook: Lead Management](../../docs/runbooks/agentic-automation/04-lead-management.md)
- [Runbook: Bulk Extract](../../docs/runbooks/agentic-automation/05-activities-bulk-extract.md)
- [Runbook: Orchestration](../../docs/runbooks/agentic-automation/06-orchestration-patterns.md)
- [Runbook: API Governance](../../docs/runbooks/agentic-automation/07-api-governance.md)
- [Runbook: Examples](../../docs/runbooks/agentic-automation/08-end-to-end-examples.md)
