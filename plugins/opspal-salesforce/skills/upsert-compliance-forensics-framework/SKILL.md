---
name: upsert-compliance-forensics-framework
description: Salesforce upsert compliance and forensics framework for evidence-grade audit trails, incident reconstruction, control validation, and escalation reporting.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Upsert Compliance Forensics

## When to Use This Skill

Use this skill when:
- An upsert operation produced unexpected results that need forensic analysis
- Compliance requires evidence-grade audit trails for data mutations
- Reconstructing the timeline of record-level changes after an incident
- Producing an escalation-ready report on upsert failures or data corruption

**Not for**: Normal upsert processing (use `upsert-orchestration-guide`), governance policy setup (use `upsert-governance-observability-framework`), or general data quality (use `data-quality-operations-framework`).

## Forensic Evidence Collection

| Evidence | Source | Query |
|----------|--------|-------|
| Record history | Field History Tracking | `SELECT Field, OldValue, NewValue, CreatedDate FROM AccountHistory WHERE AccountId = '<id>'` |
| Audit trail | SetupAuditTrail | `SELECT Action, Section, CreatedDate, CreatedBy.Name FROM SetupAuditTrail ORDER BY CreatedDate DESC` |
| Upsert operation log | OpsPal audit log | `~/.claude/logs/audit-log.jsonl` |
| Error queue | Upsert error records | Check error queue via `/upsert status` |

## Reconstruction Workflow

1. **Identify scope**: Which records were affected, time window, operation type
2. **Collect evidence**: Field History, audit logs, upsert operation logs
3. **Build timeline**: Ordered sequence of mutations with before/after values
4. **Classify failure**: Was it a matching error, permission failure, or data corruption?
5. **Produce report**: Escalation-ready document with evidence, timeline, and root cause

## Control Validation

| Control | Check | Pass Criteria |
|---------|-------|---------------|
| External ID uniqueness | Duplicate check on matching field | No duplicates found |
| Ownership routing | Owner assignment matches territory rules | Correct owner assigned |
| FLS compliance | Writing user has edit access to all fields | No INSUFFICIENT_ACCESS errors |
| Audit logging | All mutations captured in audit log | Log entry exists for every record change |

## Routing Boundaries

Use this skill for compliance, audit-evidence, and forensic reconstruction.
Use `upsert-orchestration-guide` for normal upsert processing.
Use `upsert-governance-observability-framework` for policy/operational governance setup.

## References

- [audit evidence model](./audit-evidence-model.md)
- [forensic reconstruction workflow](./forensic-reconstruction-workflow.md)
- [control validation checklist](./control-validation-checklist.md)
- [escalation reporting template](./escalation-reporting-template.md)
