---
name: upsert-orchestration-guide
description: Lead/Contact/Account upsert methodology including matching, enrichment, conversion, and error handling. Use when importing data, matching records, converting Leads, or handling upsert errors.
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-upsert-orchestrator
context:
  fork: true
  checkpoint: phase-completion
  state-keys:
    - org-alias
    - match-results
    - error-queue
    - processed-ids
---

# Upsert Orchestration Guide

## When to Use This Skill

- Importing Leads, Contacts, or Accounts from CSV/JSON
- Matching incoming records against existing Salesforce data
- Preventing duplicate record creation
- Converting qualified Leads to Contacts/Accounts
- Enriching records with external data sources
- Handling upsert failures and retries

## Quick Reference

### Agent Delegation Table

| Operation | Specialist Agent | Use When |
|-----------|------------------|----------|
| Matching | `sfdc-upsert-matcher` | Finding existing records, dedup |
| Ownership | `sfdc-ownership-router` | Assigning/reassigning owners |
| Conversion | `sfdc-lead-auto-converter` | Lead to Contact/Account |
| Enrichment | `sfdc-enrichment-manager` | Filling missing data |
| Error Handling | `sfdc-upsert-error-handler` | Retrying failures |
| Bulk Import | `sfdc-data-import-manager` | >100 records from CSV |
| Deduplication | `sfdc-dedup-safety-copilot` | Merging duplicates |

### 8-Phase Workflow

| Phase | Purpose | Output |
|-------|---------|--------|
| 1 | Pre-Flight Validation | Validated input data |
| 2 | Matching | Match results with actions |
| 3 | Enrichment (optional) | Enriched records |
| 4 | Execute Upsert | Created/updated record IDs |
| 5 | Ownership Assignment | Owner assignments |
| 6 | Lead Conversion | Converted Contact/Account IDs |
| 7 | Verification | Success confirmation |
| 8 | Error Queue | Failed records for retry |

### Matching Priority Waterfall

| Priority | Method | Confidence |
|----------|--------|------------|
| 1 | Salesforce ID (18-char) | 100% |
| 2 | External ID field | 100% |
| 3 | Email (exact, normalized) | 100% |
| 4 | Company + State + Phone | 85-95% |
| 5 | Fuzzy name + domain | 70-85% |
| 6 | Email domain → Account website | 70-80% |
| 7 | No match (create new) | N/A |

### Commands

```bash
# Full workflow commands
/upsert import <file>           # Import from CSV/JSON
/upsert match <file>            # Preview matching only
/upsert enrich <file>           # Enrich before import
/upsert convert                 # Convert qualified Leads
/upsert retry                   # Process error queue
/upsert status                  # Show operation status

# Lead conversion
/lead-convert diagnose          # Analyze conversion blockers
/lead-convert preview           # Preview conversion results
/lead-convert batch             # Batch convert Leads
```

## Matching Configuration

### Default Thresholds
```json
{
  "matching": {
    "fuzzyThreshold": 0.75,
    "domainMatchEnabled": true,
    "crossObjectDedup": true
  },
  "enrichment": {
    "enabled": false,
    "providers": ["internal"]
  },
  "conversion": {
    "autoConvertEnabled": false,
    "criteria": "Status = 'Qualified'"
  }
}
```

### Match Action Types

| Action | When Applied | Result |
|--------|--------------|--------|
| `UPDATE` | High-confidence match found | Update existing record |
| `CREATE_NEW` | No match found | Create new record |
| `CREATE_UNDER_ACCOUNT` | Lead matched Account | Create Contact under Account |
| `MANUAL_REVIEW` | Ambiguous match | Queue for human review |
| `SKIP` | Already processed | Skip (idempotency) |

## Idempotency Pattern

**Prevents duplicate operations:**
```javascript
const engine = new UpsertEngine({
    orgAlias,
    operationId: generateUUID(),
    idempotencyKey: 'Email',      // Field for dedup
    idempotencyTTL: 24 * 60 * 60 * 1000  // 24 hours
});
```

## Error Handling

### Retry Policy
| Attempt | Backoff | Action |
|---------|---------|--------|
| 1 | Immediate | Retry |
| 2 | 1 minute | Retry |
| 3 | 5 minutes | Retry |
| 4 | 15 minutes | Escalate |

### Common Errors
| Error | Cause | Resolution |
|-------|-------|------------|
| `DUPLICATE_VALUE` | External ID conflict | Query existing, update instead |
| `REQUIRED_FIELD_MISSING` | Missing required field | Enrich or fail |
| `INVALID_CROSS_REFERENCE_KEY` | Bad Account/Owner ID | Validate IDs before upsert |
| `UNABLE_TO_LOCK_ROW` | Row lock contention | Retry with backoff |

## Detailed Documentation

See supporting files:
- `matching-patterns.md` - Detailed matching logic and SOQL patterns
- `conversion-guide.md` - Lead conversion methodology
- `error-handling.md` - Error recovery procedures
