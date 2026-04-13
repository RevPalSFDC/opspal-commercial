---
name: marketo-incident-response-playbook
description: Structured incident response for Marketo campaign, routing, and sync failures.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-marketo:marketo-campaign-diagnostician
version: 1.0.0
---

# marketo-incident-response-playbook

## When to Use This Skill

- A Marketo campaign or routing workflow has failed and is actively impacting lead processing or pipeline
- The SFDC sync has stalled or is producing a sustained error rate above 1%
- An email blast delivered to the wrong audience segment and requires containment
- A bulk import job caused duplicate lead creation that needs immediate triage
- You need a structured, audit-ready incident record with RCA and remediation timeline

**Not for**: routine campaign diagnostics without active business impact (use `marketo-campaign-diagnostics-framework`) or pre-launch gate checks (use `marketo-rollout-gates-framework`).

## Incident Severity and Escalation

| Severity | Definition | Response Time | Escalation |
|----------|-----------|--------------|-----------|
| P1 | Live send to wrong audience, sync fully down | Immediate | Notify RevOps lead + Marketo admin |
| P2 | Campaign processing halted, >500 leads stuck | <1 hour | Notify campaign owner |
| P3 | Partial flow step failure, <500 leads affected | <4 hours | Log and track in backlog |
| P4 | Single-lead anomaly, no systemic pattern | Next business day | Document only |

## Required Inputs

- Incident symptoms and first-observed timestamp
- Impacted asset IDs (campaign, program, email)
- Estimated affected lead count and time window

## Output Artifacts

- Triage flow with evidence log
- Root-cause hypothesis tree with confidence ratings
- Remediation sequence with rollback criteria
- Post-incident summary for governance record

## Workflow

1. **Declare severity**: classify P1–P4 based on business impact and lead volume affected; notify appropriate stakeholders immediately for P1/P2.
2. **Preserve forensic state**: snapshot campaign configuration, Smart List rules, and a sample of affected lead activity logs before making any changes.
3. **Run read-only diagnostics**: use `mcp__marketo__lead_activities`, `mcp__marketo__campaign_get_smart_list`, and `mcp__marketo__sync_errors` to build the evidence base.
4. **Form root-cause hypothesis**: match evidence to failure patterns (wrong filter, unapproved asset, token missing, sync error, API quota hit).
5. **Propose remediation with rollback criteria**: define the fix, its scope, and the specific condition under which the remediation should be aborted.
6. **Execute with approval**: require explicit stakeholder sign-off for any P1/P2 write operation; execute in smallest safe increments.
7. **Validate resolution**: confirm affected leads are now processing correctly; clear the incident and produce the final summary artifact.

## Safety Checks

- Read-only triage first — no writes until root cause is confirmed
- Preserve forensic evidence before any configuration change
- Require controlled remediation approvals for P1 and P2 severity
