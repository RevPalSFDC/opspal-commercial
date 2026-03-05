# Lead Routing Diagnostics Runbook

## Purpose

Provide a deterministic, API-first workflow for diagnosing and remediating Marketo lead routing incidents.

This runbook prioritizes machine-readable surfaces:
- lead identity and dedupe
- lead memberships (lists, programs, smart campaigns)
- activities and lead changes timeline
- campaign metadata and Smart List rules (`includeRules=true`)

Flow-step internals are not REST-readable and are handled through template governance + activity inference.

## Modules

1. `01-canonical-lead-identity-and-dedupe.md`
2. `02-membership-snapshot-and-gating.md`
3. `03-activity-trace-paging-token-method.md`
4. `04-smart-list-rule-correlation-and-flow-gap.md`
5. `05-daisy-chain-delay-loop-race-detection.md`
6. `06-safe-remediation-playbook.md`
7. `07-monitoring-slo-and-alert-score.md`
8. `08-api-payloads-and-tool-call-sequences.md`

## Default Operating Mode

- Diagnostics: read-only
- Remediation: explicit user confirmation required
- Safety: idempotency key + before/after snapshot logging for each write action
