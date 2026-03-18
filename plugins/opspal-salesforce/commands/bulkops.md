---
name: bulkops
description: Autonomous bulk Salesforce operations with checkpointing, validation, and audit trails
argument-hint: "<execute|dry-run|resume|audit|rollback> <operation> <object> [csv-path] --org <alias> [--production]"
visibility: user-invocable
tags:
  - data-operations
  - bulk
  - salesforce
---

# Bulk Operations Command

Autonomous bulk DML operations with batched execution, parallel validation, checkpointing for resume, and comprehensive audit trails.

## Route to Agent

This command routes to the `sfdc-bulkops-orchestrator` agent. Use the Task tool:

```
Task(subagent_type='opspal-salesforce:sfdc-bulkops-orchestrator', prompt='...')
```

Pass the full user request including sub-command and all arguments.

## Sub-Commands

### execute - Run bulk DML

```bash
/bulkops execute update Account ./data/accounts.csv --org acme-prod --production
/bulkops execute insert Contact ./contacts.csv --org sandbox-dev
/bulkops execute upsert Lead ./leads.csv --org acme-prod --production --batch-size 500
/bulkops execute delete Case ./cases-to-delete.csv --org sandbox-dev
```

**Required flags:**
- `--org <alias>` - Target Salesforce org
- `--production` - **Mandatory** for production orgs (safety gate)

**Optional flags:**
- `--batch-size <n>` - Records per batch (default: 200, max: 2000)

### dry-run - Validate without executing

```bash
/bulkops dry-run update Account ./data/accounts.csv --org sandbox
/bulkops dry-run delete Contact ./cleanup.csv --org acme-prod
```

Runs full preflight validation (field existence, data types, governor limits, automation complexity) without executing any DML. Shows what WOULD happen.

### resume - Continue interrupted operation

```bash
/bulkops resume <operationId> --org acme-prod
```

Loads checkpoint from last completed batch and continues execution.

### audit - View operation audit trail

```bash
/bulkops audit <operationId>
```

Shows: per-record results, error categories, timing, batch details.

### rollback - Revert changes using captured before-state

```bash
/bulkops rollback <operationId> --org acme-prod --production
```

Uses captured before-state (diff tracker) to generate rollback CSV and execute reversal.

## Execution Pattern

```
Batch 1: Execute 200 records  -> Validator confirms (non-blocking)
Batch 2: Execute next 200     -> Validator confirms Batch 1
Batch 3: Execute next 200     -> Validator confirms Batch 2
...
Final: Wait for all validators -> Retry failures -> Summary report
```

## Output

### Summary Table

| Metric | Value |
|--------|-------|
| Operation | update |
| Object | Account |
| Total Records | 5,000 |
| Succeeded | 4,985 |
| Failed (final) | 7 |
| Retried & Recovered | 8 |

### Error Report

Categorized by type (validation rule, FLS, governor limit, etc.) with record IDs and sample messages.

### Diff Report

Before/after values for all changed fields with samples.

## Audit Storage

```
orgs/{org-slug}/platforms/salesforce/{instance}/audit/bulkops/
  checkpoints/{operationId}.json
  logs/{operationId}.jsonl
  diffs/{operationId}.json
  reports/{operationId}-summary.json
```

## Safety Features

- **Production protection**: `--production` flag mandatory
- **Dry-run mode**: Full validation without DML
- **Checkpointing**: Resume from interruption
- **Before-state capture**: Rollback capability
- **Parallel validation**: Confirm batch results via read-only sub-agent
- **Governor limit checks**: Pre-flight org limits query
- **Error categorization**: Structured error types for triage

## Related

- `/data-migrate` - Cross-platform data migration
- `/upsert import` - Record upsert with matching
- `sfdc-data-operations` - General data operations routing
