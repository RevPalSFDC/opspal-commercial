# OpsPal Core Extraction Plan

## Phase 0 — Inventory, Copying, Boundaries (Completed)
- Inventory internal plugins and classify assets
- Copy CORE/HYBRID assets into OpsPal Core (non-destructive)
- Define governance boundaries and extension rules
- Establish package layout for Core and domain modules

## Phase 1 — Redirect Commercial Plugins to Core (Future)
- Update domain plugin agents/scripts to call OpsPal Core package equivalents
- Add adapter shims where domain behavior differs
- Update runbook references to point to OpsPal Core package paths
- Validate with targeted smoke tests per plugin

## Phase 2 — Remove Duplication After Validation (Future)
- Remove duplicated domain assets only after parity checks
- Keep rollback-ready snapshots before removal
- Lock CI to prevent reintroducing core logic into domain plugins

## Phase 3 — Framework Readiness (Informational)
- Publish OpsPal Core as the primary package and domain modules as extensions
- Add automated dependency checks (Domain → Core only)
- Prepare migration documentation for downstream teams

## Risks & Mitigations
- Risk: Hidden domain-specific dependencies inside copied HYBRID assets
  - Mitigation: Track high-risk items via the drift watchlist and add adapter shims
- Risk: Name collisions or shadowing across plugins
  - Mitigation: Namespaced paths under `opspal-core-plugin/<type>/<plugin>` and package layout under `opspal-core-plugin/packages/`
- Risk: Unclear invocation modes for some assets
  - Mitigation: Manual verification during Phase 1 redirect

## Rollback Safety
- All Phase 0 changes are additive only
- Domain plugins remain untouched and fully functional
- Rollback is achieved by removing `opspal-core-plugin/` additions
