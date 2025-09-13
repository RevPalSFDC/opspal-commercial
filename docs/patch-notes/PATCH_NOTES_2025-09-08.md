# Patch Notes — 2025-09-08 (Evening)

These changes implement the HubSpot guardrails, better error communication, proactive token management, platform-specific validations, rollback strategy, and association planning. All actions default to dry‑run and require explicit approval to apply.

## Highlights
- Stop & Ask decision gates with ACR template and policy docs.
- Preflight checks for scopes/subscription; human‑readable BLOCKERS report.
- OAuth TokenManager with proactive refresh + optional encrypted cache.
- Canonical Business Unit custom object schema, property group, and properties.
- Idempotent migrations with up/down; backups exporter.
- Association planning: diffs desired vs existing labels and prints exact create steps.
- Extended association schema to include Contact, Company, Deal, and Ticket.
- Jest test suite with HTTP mocks; all tests pass.

## New/Updated Scripts
- `scripts/hubspot/preflight.js` — prints PASS/FAIL with blockers and options.
- `scripts/hubspot/validate-platform.js` — explicit capability check.
- `scripts/hubspot/apply-migration.js` — dry‑run planner; requires `APPROVAL_TOKEN` for `--apply`.
- `scripts/hubspot/export-state.js` — backups current schemas/properties/associations.
- `scripts/ci/check-oauth.js` — sanity check for OAuth creds.

NPM scripts:
- `hs:preflight`, `hs:validate`, `hs:export`, `hs:migrate`, `hs:rollback`, `ci:check-oauth`, `test`.

## Source Additions
- `src/lib/errors.js` — standardized error + formatter.
- `src/lib/oauth/tokenManager.js` — proactive refresh (<5 min TTL), retry on 401/429, optional file cache.
- `src/hubspot/client.js` — Axios client with token injection + auto refresh on 401/403.

## Schema & Migrations
- `schemas/hubspot/customObjects/business_unit.schema.json`
- `schemas/hubspot/groups/business_unit/business_unit_core.group.json`
- `schemas/hubspot/properties/business_unit/name.property.json`
- `schemas/hubspot/associations/business_unit/associations.json` (now covers Contact `0-1`, Company `0-2`, Deal `0-3`, Ticket `0-5`).
- `migrations/hubspot/2025-09-08_business_unit.up.js` — creates schema, group, property, and missing association labels; plans steps by diffing remote labels.
- `migrations/hubspot/2025-09-08_business_unit.down.js` — deletes property, group, and schema (best‑effort).

## Documentation
- `docs/approval/ACR_TEMPLATE.md`
- `docs/approval/DECISION_GATES.md`
- `docs/runbooks/oauth_refresh.md`
- `docs/runbooks/rollback.md`
- `scripts/hubspot/README.md`

## Tests (Jest)
- `tests/tokenManager.test.js` — OAuth refresh behavior.
- `tests/preflight.test.js` — PASS/FAIL scenarios via nock.
- `tests/migration_plan.test.js` — base plan steps present.
- `tests/associations_plan.test.js` — association diffing logic.

## Safety & Config
- `.env.template` — added OAuth + `APPROVAL_TOKEN` vars.
- `.gitignore` — ignore `backups/`.
- `package.json` — added scripts and dev deps (`jest`, `nock`).

## Usage
1. Preflight: `npm run hs:preflight` (or `node scripts/hubspot/preflight.js --json`).
2. Backup: `npm run hs:export`.
3. Validate: `npm run hs:validate`.
4. Plan (dry‑run): `npm run hs:migrate`.
5. Apply (requires explicit approval):
   ```bash
   APPROVAL_TOKEN=approved node scripts/hubspot/apply-migration.js \
     --migration migrations/hubspot/2025-09-08_business_unit.up.js --apply
   ```
6. Rollback: `APPROVAL_TOKEN=approved npm run hs:rollback`.

## Notes
- Association planning uses `GET /crm/v4/associations/{from}/{to}/labels` and only creates missing labels.
- If custom objects or scopes are unavailable, `preflight` exits non‑zero and prints options per Decision Gates.
- Tests are limited to the `tests/` folder to avoid unrelated suites.

---
Owner: RevPal Agents
Date: 2025-09-08
