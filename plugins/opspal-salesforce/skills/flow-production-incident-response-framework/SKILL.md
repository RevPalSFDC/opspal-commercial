---
name: flow-production-incident-response-framework
description: Salesforce Flow production incident response framework for runtime diagnostics, service restoration, rollback triggers, and post-incident hardening. Use when active flow behavior is causing operational incidents.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Flow Production Incident Response Framework

## When to Use This Skill

Use this skill when:
- A Flow is actively causing errors or data corruption in production
- Users are blocked by Flow-triggered automation failures
- An emergency Flow deactivation or version rollback is needed
- A recent Flow deployment has introduced regressions
- Post-incident review is needed to prevent recurrence

**Not for**: Planned Flow development (use `flow-xml-lifecycle-framework`), proactive monitoring setup (use `flow-diagnostics-observability-framework`), or Flow structural improvements (use `flow-segmentation-guide`).

## Severity Classification

| Severity | Criteria | Response | Actions |
|----------|----------|----------|---------|
| **SEV-1 Critical** | Data corruption, all users blocked, revenue impact | Immediate | Deactivate Flow, restore from known-good version |
| **SEV-2 High** | Subset of users affected, workaround exists | <1 hour | Investigate and patch, prepare rollback |
| **SEV-3 Medium** | Non-blocking errors, degraded experience | <4 hours | Diagnose root cause, schedule fix |
| **SEV-4 Low** | Edge case failures, cosmetic issues | Next sprint | Log for remediation backlog |

## Workflow

### Step 1: Triage (First 5 Minutes)

```bash
# Identify the failing Flow and its active version
sf data query --query "SELECT DeveloperName, ActiveVersion.VersionNumber, Description FROM FlowDefinition WHERE DeveloperName = '<SuspectedFlow>'" --target-org <org> --use-tooling-api

# Check recent error interviews
sf data query --query "SELECT Id, InterviewLabel, CurrentElement, InterviewStatus, CreatedDate FROM FlowInterview WHERE InterviewStatus = 'Error' AND CreatedDate = TODAY ORDER BY CreatedDate DESC LIMIT 20" --target-org <org>
```

Classify by severity using the table above. For SEV-1/SEV-2, proceed immediately to containment.

### Step 2: Emergency Containment

**Option A: Deactivate the Flow entirely** (SEV-1)
```bash
# Get the FlowDefinition Id
sf data query --query "SELECT Id FROM FlowDefinition WHERE DeveloperName = '<FlowName>'" --target-org <org> --use-tooling-api --json
# PATCH /services/data/v62.0/tooling/sobjects/FlowDefinition/<Id>
# Body: {"Metadata":{"activeVersionNumber":0}}
```

**Option B: Roll back to previous version** (SEV-2)
```bash
# List all versions to find the last known-good
sf data query --query "SELECT VersionNumber, Status, Description FROM FlowVersionView WHERE FlowDefinitionViewId = '<FlowDefViewId>' ORDER BY VersionNumber DESC" --target-org <org> --use-tooling-api
# PATCH FlowDefinition with {"Metadata":{"activeVersionNumber":<PreviousVersion>}}
```

**Option C: Bypass via kill switch** (SEV-3 — targeted disable without full deactivation)

### Step 3: Evidence Collection

Before fixing, capture:
- FlowInterview error records (InterviewLabel, CurrentElement, InterviewStatus)
- Debug log covering the failing transaction
- The specific record data that triggered the failure
- Flow version number that was active at time of incident

### Step 4: Post-Incident Hardening

1. Add fault path for the failure scenario (every Get Records and Decision element needs one)
2. Add regression test coverage in sandbox
3. Update the org runbook (`/generate-runbook`) with the incident pattern
4. Add monitoring signal for the leading indicator

## Routing Boundaries

Use this skill for production incidents and service restoration.
Use `flow-xml-lifecycle-framework` for planned feature delivery.
Use `flow-diagnostics-observability-framework` for non-incident diagnostic improvements.

## References

- [triage and diagnostics](./triage-diagnostics.md)
- [containment restoration](./containment-restoration.md)
- [monitoring rollback triggers](./monitoring-rollback-triggers.md)
- [post-incident hardening](./post-incident-hardening.md)
