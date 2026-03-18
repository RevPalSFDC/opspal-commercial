# Marketo Campaign Diagnostics (LLM-Optimized Series)

Instance-agnostic diagnostics playbook for Marketo Smart Campaigns and Programs. Designed for Claude sub-agents to route, diagnose, and remediate common operational issues.

## How to Use

1. Start with the intake checklist.
2. Route to the relevant issue module.
3. Follow diagnostics in order (fast checks first).
4. Apply safe fixes or request confirmation for write actions.
5. Validate and document.

## Intake Checklist (Minimum Inputs)

- Campaign/Program identifiers: name, id, folder path
- Time window of the issue
- Sample lead ids that should have been affected
- Expected vs actual outcome (send, status change, sync, etc.)
- Any recent changes (imports, token edits, CRM updates)

## Issue Index

| Issue | Severity | Primary Module |
| --- | --- | --- |
| Smart campaigns not triggering | Critical | [01-smart-campaigns-not-triggering](./01-smart-campaigns-not-triggering.md) |
| Flow step failures | High | [02-flow-step-failures](./02-flow-step-failures.md) |
| Leads not progressing / success missing | Moderate (can be Critical if downstream actions depend) | [03-leads-not-progressing](./03-leads-not-progressing.md) |
| Token resolution failures | Moderate | [04-token-resolution-failures](./04-token-resolution-failures.md) |
| Low engagement (opens/clicks) | Low to Moderate | [05-low-engagement](./05-low-engagement.md) |
| High bounce or unsubscribe rates | High (deliverability risk) | [06-high-bounce-unsubscribe](./06-high-bounce-unsubscribe.md) |
| Sync/API job failures | Critical | [07-sync-api-job-failures](./07-sync-api-job-failures.md) |

## Shared Guardrails

- Marketo REST API cannot edit Smart List triggers/filters or Flow steps. Use cloning or UI for logic changes.
- Read-only steps can be automated; write actions require confirmation.
- Prefer evidence from activity logs and program member data when results logs are unavailable via API.

## Severity Decision Guide

Use these defaults, then elevate based on business impact.

- **Critical**: automation halted, sync down, compliance risk, or revenue-impacting processes blocked.
- **High**: partial flow failures, elevated bounce/unsub rates, or time-sensitive campaign errors.
- **Moderate**: success reporting gaps, token issues that do not block sending.
- **Low**: engagement performance issues without deliverability risk.

**Escalate** one level if downstream actions depend on the outcome (e.g., MQL handoff, sales alerts).

## Supporting Modules

- [08-detection-strategies](./08-detection-strategies.md)
- [09-api-queries-and-payloads](./09-api-queries-and-payloads.md)
- [10-user-communication-remediation](./10-user-communication-remediation.md)

## Related Runbooks

- `../campaign-operations/campaign-activation-checklist.md`
- `../campaign-operations/trigger-campaign-best-practices.md`
- `../integrations/salesforce-sync-troubleshooting.md`
- `../performance/api-optimization-guide.md`
- `../governance/04-troubleshooting-pitfalls-sfdc-mapping.md`
- `../lead-routing-diagnostics/README.md`
