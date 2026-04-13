---
name: upsert-governance-observability-framework
description: Salesforce upsert governance and observability controls for ownership routing, audit logging, operational transparency, and incident troubleshooting. Use when upsert operations require compliance-grade traceability and routing assurance.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Upsert Governance and Observability

## When to Use This Skill

Use this skill when:
- Setting up governance controls for upsert operations (ownership routing, audit logging)
- Instrumenting traceability for bulk record imports
- Defining policies for who can upsert to which objects in which orgs
- Troubleshooting upsert failures using operational logs

**Not for**: Core upsert execution (use `upsert-orchestration-guide`), forensic incident investigation (use `upsert-compliance-forensics-framework`), or general data quality (use `data-quality-operations-framework`).

## Governance Controls

| Control | Implementation | Enforcement |
|---------|---------------|-------------|
| **Ownership routing** | Assign Owner based on territory, round-robin, or CSV-specified | `sfdc-ownership-router` agent |
| **Audit logging** | Log every upsert operation with before/after state | JSONL to `~/.claude/logs/audit-log.jsonl` |
| **Org targeting** | Enforce explicit `--target-org` on all upsert commands | Pre-tool hook validation |
| **Dry-run gate** | Require `--dry-run` first on production upserts | Hook advisory |
| **Record count limit** | Warn on upserts >1,000 records, block >10,000 without confirmation | Pre-tool hook |

## Audit Log Entry Format

```jsonl
{"ts":"2026-04-12T14:30:00Z","operation":"upsert","object":"Account","org":"acme-prod","records":150,"matched":120,"created":30,"errors":0,"external_id":"External_Id__c","user":"admin@acme.com"}
```

## Observability Signals

| Signal | Monitoring Method | Alert Threshold |
|--------|------------------|-----------------|
| Error rate | Errors / total records per batch | >5% |
| Duplicate creation | Created count when all should match | Any unexpected creates |
| Ownership drift | Post-upsert owner != expected territory owner | Any misrouted records |
| Processing time | Duration per 1,000 records | >30 seconds |

## Workflow

1. Define ownership routing strategy for the target object
2. Instrument audit logging in the upsert pipeline
3. Set up dry-run requirement for production upserts
4. Monitor post-upsert signals for anomalies

## Routing Boundaries

Use this skill for governance, audit, and routing policy.
Use `upsert-orchestration-guide` for core matching/conversion execution flows.

## References

- [ownership routing controls](./ownership-routing-controls.md)
- [audit logging model](./audit-logging-model.md)
- [operational transparency](./operational-transparency.md)
- [incident troubleshooting](./incident-troubleshooting.md)
