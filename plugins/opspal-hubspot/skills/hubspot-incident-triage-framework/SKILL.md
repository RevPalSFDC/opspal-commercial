---
name: hubspot-incident-triage-framework
description: Triage and stabilize HubSpot automation incidents with severity scoring and recovery plans.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-hubspot:hubspot-workflow-auditor
version: 1.0.0
---

# hubspot-incident-triage-framework

## When to Use This Skill

- A HubSpot workflow stopped enrolling contacts and the cause is unknown
- A custom automation action callback is timing out or returning errors, blocking workflow execution
- A Salesforce sync error is causing HubSpot contact/company records to fall into an inconsistent state
- API rate limit breaches (429s) are causing cascading failures across multiple workflows
- A post-deploy regression is suspected — workflows were healthy before a recent configuration change

**Not for**: Planned migrations or schema changes, SEO or CMS incidents, or license/auth issues (use `hubspot-portal-runtime-lifecycle`).

## Severity Scoring

| Severity | Signal | First Action |
|---|---|---|
| P1 Critical | All workflow enrollment halted; revenue-impacting | Pause affected workflows; open incident channel |
| P2 High | >20% of a workflow's enrollments failing | Identify last config change; capture error samples |
| P3 Medium | Callback timeouts on non-revenue automations | Check external service health; inspect callback logs |
| P4 Low | Single contact/deal stuck in workflow step | Unenroll and re-enroll manually; monitor recurrence |

## Required Inputs

- Portal ID and affected workflow IDs
- Error evidence: API error codes, workflow history screenshots, or log excerpts
- Timeline: when did the issue start and what changed just before?

## Output Artifacts

- Incident severity report with P1-P4 classification
- Stabilization plan with ordered remediation steps
- Escalation checklist with owner assignments and SLA timers

## Workflow

1. **Establish scope** — query `GET /automation/v3/workflows/{workflowId}` for each affected workflow. Confirm enrollment status, last modified timestamp, and active action count.
2. **Capture baseline evidence** — pull workflow history errors via `GET /automation/v3/workflows/{workflowId}/enrollments?status=FAILED`. Sample the first 10 failure records for common error patterns.
3. **Classify severity** — apply the scoring table above. For P1/P2, immediately pause non-critical enrollments to contain blast radius before diagnosing.
4. **Isolate root cause** — cross-reference the failure timestamp with: recent workflow edits, API rate limit logs (`X-HubSpot-RateLimit-Remaining` headers), external service status pages, and Salesforce sync error queue.
5. **Propose safe remediation** — for each candidate fix, state the expected outcome, the rollback path if the fix fails, and the verification signal (e.g., "enrollment count resumes within 5 minutes").
6. **Execute and verify** — apply one fix at a time. After each step, re-query enrollment status and confirm the error rate is trending down before proceeding.
7. **Produce artifacts** — write the severity report, stabilization plan, and escalation checklist with named owners and next-action deadlines.

## Safety Checks

- Always pause before remediate — confirm affected object scope before any write operation
- Prefer unenroll/re-enroll over direct property edits on stuck contacts
- Track every remediation step in the incident log with timestamps
- Confirm rollback path is viable before executing any irreversible change (e.g., workflow delete)
