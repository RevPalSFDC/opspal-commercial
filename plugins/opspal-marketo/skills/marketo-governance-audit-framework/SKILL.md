---
name: marketo-governance-audit-framework
description: Marketo governance and quarterly audit framework covering instance standards, automation guardrails, operational incident controls, SFDC mapping checks, and API performance governance.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
---

# Marketo Governance Audit Framework

## When to Use This Skill

- Running a scheduled quarterly Marketo instance health audit
- Validating that instance standards are in place before a migration, integration, or major campaign launch
- Assessing API usage patterns for quota risk and rate-limit exposure
- Reviewing automation guardrails (communication limits, suppression lists, deactivated campaigns with orphaned triggers)
- Producing an evidence-backed remediation backlog for stakeholder review

**Not for**: live incident response (use `marketo-incident-response-playbook`) or pre-launch campaign readiness (use `marketo-rollout-gates-framework`).

## Audit Scope Reference

| Domain | Key Controls | Audit Signal |
|--------|-------------|-------------|
| Instance standards | Workspace isolation, naming conventions, folder hierarchy | Campaigns outside sanctioned folders |
| Automation guardrails | Communication limits enabled, global suppression lists active | Missing unsubscribe exclusion in batch campaigns |
| SFDC sync integrity | Sync errors <1%, field mappings current | `mcp__marketo__sync_errors` count trending up |
| API performance | Daily API usage <80% of quota, no sustained rate-limit hits | `mcp__marketo__analytics_api_usage` at >40K/50K |
| Incident readiness | Rollback procedures documented, on-call defined | No runbook linked to high-risk campaigns |
| Lead data quality | Unsubscribe rate <2%, hard-bounce rate <0.5% | Bounce rate spike over 30-day window |

## Workflow

1. **Establish baseline**: run `/marketo-governance-audit` to generate the current instance health snapshot; compare against prior quarter's report if available.
2. **Validate instance standards**: check folder structure, campaign naming convention adherence, and workspace separation using `mcp__marketo__program_list` and `mcp__marketo__campaign_list`.
3. **Audit automation guardrails**: verify communication limits are configured, global suppression lists exist and are non-empty, and no orphaned trigger campaigns are active.
4. **Review SFDC sync health**: call `mcp__marketo__sync_status` and `mcp__marketo__sync_errors`; flag error rates above 1% for immediate remediation.
5. **Assess API performance**: review `mcp__marketo__analytics_api_usage`; identify agents or scripts consuming disproportionate quota; flag if daily usage exceeds 80%.
6. **Produce remediation backlog**: categorize findings as Critical / High / Medium, assign owners, and set target resolution dates; export as structured report for stakeholder review.

## Routing Boundaries

Use this skill for governance, audits, and policy enforcement.
Use `marketo-incident-response-playbook` for active incidents discovered during audit.
Use `marketo-campaign-diagnostics-framework` for campaign-specific anomalies surfaced in audit findings.

## References

- [governance baselines](./governance-baselines.md)
- [quarterly audit procedure](./quarterly-audit-procedure.md)
- [api performance controls](./api-performance-controls.md)
