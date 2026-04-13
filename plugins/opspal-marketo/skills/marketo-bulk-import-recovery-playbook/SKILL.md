---
name: marketo-bulk-import-recovery-playbook
description: Handle hook-driven post-bulk-import recovery, warning triage, and safe retry operations.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# marketo-bulk-import-recovery-playbook

## When to Use This Skill

- A bulk lead import job completed but reported failures or warnings via `mcp__marketo__bulk_lead_import_failures`
- An import batch stalled in `Queued` or `Processing` status longer than expected
- Duplicate leads were created during a previous import and need remediation
- A hook-driven post-import validation surfaced data quality signals requiring triage
- You need a safe retry strategy after a partial import without double-importing clean records

**Not for**: initial import job setup (use `marketo-campaign-execution-operations`) or lead routing issues post-import (use `marketo-lead-routing-diagnostics`).

## Import Failure Decision Matrix

| Signal | Likely Cause | Recovery Action |
|--------|-------------|-----------------|
| >5% failure rate | Bad field values or schema mismatch | Fix CSV, reimport failures file only |
| Warnings on email format | Non-standard addresses | Cleanse upstream, retry affected rows |
| Stalled >30 min | Queue congestion or API error | Cancel job, re-enqueue after 15 min |
| Duplicate leads created | Missing dedup key (`email` vs `id`) | Merge duplicates, fix lookupField setting |
| 0 records processed | File format error | Validate CSV encoding and column headers |

## Workflow

1. **Fetch import status**: call `mcp__marketo__bulk_lead_import_status` and record `numOfLeadsProcessed`, `numOfRowsFailed`, `numOfRowsWithWarning`.
2. **Download failures file**: call `mcp__marketo__bulk_lead_import_failures` and parse each row to identify the error category.
3. **Download warnings file**: call `mcp__marketo__bulk_lead_import_warnings`; assess whether warnings indicate data loss risk.
4. **Classify and triage**: group failures by error type; determine whether root cause is upstream data, field mapping, or API quota.
5. **Remediate clean subset**: for validation errors, correct the affected CSV rows and create a new import job for failures only — do not re-import successful rows.
6. **Verify post-recovery state**: query a sample of newly imported leads to confirm field values are correct and no unintended duplicates exist.
7. **Capture quality feedback**: log failure rates, warn thresholds, and remediation steps for the governance audit trail.

## Routing Boundaries

Use this skill for post-import failure triage and safe retry operations.
Defer to `marketo-change-safety-guardrails` before running a corrective bulk import in production.
Defer to `marketo-governance-audit-framework` if failure patterns indicate a recurring data quality issue.

## References

- [Bulk Import Summary Analysis](./import-summary.md)
- [Bulk Retry Policy](./retry-policy.md)
- [Post-Import Quality Feedback](./quality-feedback.md)
