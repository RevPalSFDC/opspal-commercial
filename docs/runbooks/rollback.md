# Rollback Runbook

## Principles
- Every migration ships with `up` and `down`.
- Always export current state before mutating.
- Dry‑run rollbacks before applying.

## Prechecks
- List dependencies (workflows, reports) that reference the target objects.
- Confirm backup exists under `backups/YYYYMMDD/`.

## Execute Rollback
```bash
node scripts/hubspot/export-state.js --out backups/$(date +%Y%m%d)
node migrations/hubspot/2025-09-08_business_unit.down.js --apply
```

## Verify
- Re-list schemas and properties match the previous snapshot.
- Smoke test associations.

