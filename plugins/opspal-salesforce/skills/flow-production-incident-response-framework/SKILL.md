---
name: flow-production-incident-response-framework
description: Salesforce Flow production incident response framework for runtime diagnostics, service restoration, rollback triggers, and post-incident hardening. Use when active flow behavior is causing operational incidents.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Flow Production Incident Response Framework

Use this skill for on-call flow incident handling.

## Workflow

1. Triage and classify production incident severity.
2. Diagnose failure with evidence collection.
3. Contain impact and restore service.
4. Validate remediation and define hardening actions.

## Routing Boundaries

Use this skill for production incidents and service restoration.
Use `flow-xml-lifecycle-framework` for planned feature delivery.
Use `flow-diagnostics-observability-framework` for non-incident diagnostic improvements.

## References

- [triage and diagnostics](./triage-diagnostics.md)
- [containment restoration](./containment-restoration.md)
- [monitoring rollback triggers](./monitoring-rollback-triggers.md)
- [post-incident hardening](./post-incident-hardening.md)
