---
description: Cross-CRM migration wizard for Attio
argument-hint: "[--source hubspot|salesforce|csv] [--object people|companies] [--dry-run] [--resume migration-id]"
---

# /attio-migration

Multi-session cross-CRM migration wizard for Attio. Migrate contacts, companies, and custom object records from Salesforce, HubSpot, or CSV files into Attio with field mapping, dry-run validation, progress checkpointing, and resume support.

## Usage

```
/attio-migration
/attio-migration --source salesforce --object people
/attio-migration --source hubspot --object companies --dry-run
/attio-migration --source csv --object support_ticket
/attio-migration --resume sfdc-contacts-20260410
```

## What This Command Does

Delegates to **attio-data-migration-specialist** (Opus model) to run a structured, multi-session migration workflow.

## Migration Steps

### Step 1: Source Analysis
- Identify source system: `hubspot`, `salesforce`, or `csv`
- Identify target object: `people`, `companies`, `deals`, or custom object slug
- Collect source field list and record count
- Verify target Attio schema is ready (attributes exist, types correct)

### Step 2: Field Mapping
- Interactive or file-based field mapping
- Source field → Attio attribute mapping with type transformation rules
- Flag unmappable fields (formula fields, rollup summaries, computed values)
- Output: field mapping config used by `csv-to-records-transformer.js`

### Step 3: Dry Run (`--dry-run`)
- Validate all records against the target schema
- Report: records that would be created vs. updated vs. failed
- No records written to Attio
- Required before live execution on migrations >1,000 records

### Step 4: Execute
- Initialize migration state in `/tmp/attio-active-migration.json`
- Process records in sequential batches (default: 50/batch)
- Progress tracked via `post-migration-checkpoint` hook
- Failed records collected, not blocking
- Multi-session: safe to interrupt and resume

### Step 5: Resume (`--resume`)
Provide the migration ID from a previous session:
```
/attio-migration --resume sfdc-contacts-20260410
```
Reads state from `/tmp/attio-active-migration.json` (or archived state file), continues from last checkpoint position.

### Step 6: Post-Migration Validation
- Record count comparison (source vs. Attio)
- Sample spot-check (10–20 records)
- Relationship integrity check
- Migration summary report

## Safety Constraints

- **No recycle bin**: migrated records cannot be "undone" — always dry-run first
- **Export first**: export a Attio backup before migrating to an existing workspace
- **Idempotent upserts**: safe to re-run; upsert matching prevents duplicates
- **Opus model**: irreversible operations require the most capable model

## Supported Sources

| Source | Objects Supported | Input Format |
|--------|-----------------|--------------|
| Salesforce | Contacts → people, Accounts → companies, Custom Objects | CSV export or API |
| HubSpot | Contacts → people, Companies → companies, Custom Objects | CSV export or API |
| CSV | Any Attio object | CSV with header row matching field mapping |

## Delegates To

**attio-data-migration-specialist** (Opus model) — handles all migration planning, field mapping, batch execution, and validation.
