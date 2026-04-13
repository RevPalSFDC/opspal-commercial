---
name: hubspot-multi-object-migration-framework
description: Plan and execute staged multi-object HubSpot migrations with reconciliation controls.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-hubspot:hubspot-data-operations-manager
version: 1.0.0
---

# hubspot-multi-object-migration-framework

## When to Use This Skill

- Migrating data across HubSpot object types — e.g., moving custom object records to standard Contacts/Companies, or restructuring a legacy deal pipeline with associated line items
- Remapping association schemas (Contact → Company, Deal → Contact) when the association type or label is being changed
- Running a bulk deduplication initiative that spans multiple object types and requires coordinated merge sequencing
- Importing a net-new data set that must be associated across Contacts, Companies, and Deals in a single operation using the Imports V3 multi-file API
- Executing a phased cutover from a third-party CRM to HubSpot where referential integrity must be maintained throughout

**Not for**: Single-object property backfills, single-record edits, or Salesforce-to-HubSpot field remapping (use `hssfdc-analyze`).

## Migration Stage Gate Reference

| Stage | Gate | Rollback If Failed |
|---|---|---|
| 1. Schema validation | All target properties exist; types match | Fix property schema before proceeding |
| 2. Dedupe key audit | No duplicate dedupe key values in source | Deduplicate source before import |
| 3. Dry run (read-only) | Record count matches expectation ± 2% | Re-examine source extract |
| 4. Association preflight | Association type labels valid for target objects | Create missing association labels via API |
| 5. Staged import (10%) | Error rate < 1% on sample batch | Abort and diagnose before full run |
| 6. Full import | All records upserted; association links verified | Restore from pre-migration export snapshot |
| 7. Reconciliation | Source count == target count; no orphaned associations | Run reconciliation repair script |

## Required Inputs

- Source/target object maps with property-to-property mappings
- Dedupe keys per object type (e.g., `email` for contacts, `domain` for companies)
- Migration window: start time, max duration, rollback deadline

## Output Artifacts

- Migration execution plan with stage gates and owners
- Checkpointed runbook with rollback instructions per stage
- Reconciliation report: record counts, association counts, error log

## Workflow

1. **Define scope and success criteria** — document source object types, target object types, record volumes, and the definition of "migration complete" (e.g., 100% of source contacts associated to a company in the target schema).
2. **Run schema validation gate** — query `GET /crm/v3/properties/{objectType}` for all target types. Confirm every source field maps to an existing target property with a compatible type.
3. **Capture baseline evidence** — export source record counts and a sample of 50 records per object type. Store in `migrations/<run-id>/baseline/`.
4. **Execute dedupe preflight** — identify duplicate dedupe key values in source data. Block migration start if duplicate rate exceeds 5% without a resolution plan.
5. **Staged import with HubSpot Imports V3** — use `hs-import-advanced --type=multi-file` for the 10% sample batch. Inspect error rows via `GET /crm/v3/imports/{importId}/errors`.
6. **Promote to full run** — if sample error rate is below threshold, proceed with full import. Run stages sequentially; checkpoint after each object type completes.
7. **Reconciliation and sign-off** — compare source vs target record counts. Verify association links. Produce the reconciliation report and obtain owner sign-off before decommissioning the source.

## Safety Checks

- Enforce staged cutover — never migrate all objects simultaneously; sequence by dependency order (Companies before Contacts before Deals)
- Require rollback checkpoints — export pre-migration state before each stage; keep exports for 30 days
- Validate referential integrity before promotion — no deal should be promoted without its associated contact and company already migrated
