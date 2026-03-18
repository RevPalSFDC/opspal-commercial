---
description: Safely remediate lead routing incidents with idempotency and explicit confirmation gates
argument-hint: "--incident-id=id [--mode=dry-run|execute] [--idempotency-key=key]"
---

# Remediate Marketo Lead Routing

Execute controlled remediation steps for validated routing incidents.

## Usage

```bash
/remediate-lead-routing --incident-id=INC-123 [--mode=dry-run|execute] [--idempotency-key=custom-key]
```

## Safety Model

- Default mode: `dry-run`
- Any write action requires explicit confirmation
- All executions require idempotency key + before/after snapshots

## Supported Remediation Actions

- deactivate/activate campaign
- request campaign for selected leads
- add/remove lead from static list
- update program member status
- update lead fields

## Required Inputs

- incident identifier
- target lead(s)
- approved remediation steps
- confirmation for each write operation

## Related Runbooks

- `docs/runbooks/lead-routing-diagnostics/06-safe-remediation-playbook.md`
