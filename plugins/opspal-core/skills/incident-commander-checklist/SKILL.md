---
name: incident-commander-checklist
description: Operational incident command workflow for triage, communication, escalation, and closure evidence.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:alert-streaming-manager
version: 1.0.0
---

# incident-commander-checklist

## When to Use This Skill

- A Salesforce Flow, Apex trigger, or integration (Gong sync, HubSpot webhook) is causing production data corruption or service degradation
- An alert indicates a critical SLO breach and the on-call team needs a structured triage and command workflow
- Running a tabletop exercise or incident drill to validate the team's response playbook
- Post-incident: confirming all checklist items were completed before marking the incident resolved
- An automation or scheduled job has silently failed and you need to reconstruct the impact timeline

**Not for**: Writing the postmortem document after resolution — use `postmortem-rca-writer` for that.

## Severity Reference

| Severity | Definition | Response SLA |
|----------|------------|--------------|
| SEV-1 | Data loss, full service outage, revenue-blocking | Immediate — page IC now |
| SEV-2 | Partial outage, significant user impact | 15 min — assemble team |
| SEV-3 | Degraded performance, workaround available | 1 hour — assigned owner |
| SEV-4 | Minor issue, monitoring only | Next business day |

## Workflow

1. **Declare**: Assign a severity level, name the incident commander (IC), and open the incident channel. Timestamp the declaration.
2. **Scope blast radius**: Identify affected systems, data objects, users, and integrations. Estimate records impacted.
3. **Read-first diagnostics**: Pull logs, API error counts, and flow/trigger debug traces before any remediation attempt. Capture as evidence (see `evidence-capture-packager`).
4. **Contain**: Apply the minimum-impact containment action — pause the failing automation, disable the integration, or activate a circuit breaker. Do not attempt full remediation yet.
5. **Communicate**: Post an initial status update to stakeholders within the severity SLA. Include: what is impacted, current status, and ETA for next update.
6. **Remediate and verify**: Execute the fix, run smoke tests, and confirm metrics return to baseline before declaring the blast radius resolved.
7. **Close**: Confirm explicit closure criteria are met, assign the postmortem owner, and archive the incident timeline.

## Safety Checks

- Timestamp every decision and action in the incident log — ambiguous timelines invalidate postmortems
- Read-first diagnostics must be captured before any remediation — never remediate blind
- Require explicit closure criteria agreed upon by the IC before the incident is marked resolved
