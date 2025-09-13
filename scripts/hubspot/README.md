# HubSpot Ops Scripts

## Preflight
Detects scopes, portal, and custom object capability. Exits non‑zero on blockers.

```bash
npm run hs:preflight
```

## Validate Platform
Explicit feature check before changes.

```bash
npm run hs:validate
```

## Migrate (Dry‑Run by default)
Shows planned steps; requires `--apply` and `APPROVAL_TOKEN` to execute.

```bash
node scripts/hubspot/apply-migration.js --migration migrations/hubspot/2025-09-08_business_unit.up.js
APPROVAL_TOKEN=approved node scripts/hubspot/apply-migration.js --migration migrations/hubspot/2025-09-08_business_unit.up.js --apply
```

## Export State (Backup)

```bash
npm run hs:export
```

