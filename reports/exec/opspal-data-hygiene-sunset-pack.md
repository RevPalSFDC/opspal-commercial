# OpsPal Data Hygiene Sunset Pack

Source Fingerprint: `305808dbe315d5f1`

## Objective
Complete deprecated plugin sunset readiness with explicit replacement mapping and migration controls.

## Deprecated Plugin Inventory

| Plugin | Owner | Deprecation Date | Replaced By | Replacement Detected | Commands | Agents | Scripts |
|---|---|---|---|---|---:|---:|---:|
| `opspal-data-hygiene` | `revpal-platform` | `2026-02-15` | `opspal-core` | `yes` | 1 | 2 | 13 |

## Replacement Mapping Coverage
- Scope: command, agent
- Total assets in scope: 3
- Mapped assets: 3
- Unmapped assets: 0
- Coverage ratio: 1

| Deprecated Asset | Asset Type | Replacement Plugin | Replacement Asset | Mapping Status | Deprecated Source Path | Replacement Source Path |
|---|---|---|---|---|---|---|
| `opspal-data-hygiene:dedup-companies` | `command` | `opspal-core` | `opspal-core:dedup-companies` | `mapped` | `plugins/opspal-data-hygiene/commands/dedup-companies.md` | `plugins/opspal-core/commands/dedup-companies.md` |
| `opspal-data-hygiene:contact-dedup-orchestrator` | `agent` | `opspal-core` | `opspal-core:contact-dedup-orchestrator` | `mapped` | `plugins/opspal-data-hygiene/agents/contact-dedup-orchestrator.md` | `plugins/opspal-core/agents/contact-dedup-orchestrator.md` |
| `opspal-data-hygiene:sfdc-hubspot-dedup-orchestrator` | `agent` | `opspal-core` | `opspal-core:sfdc-hubspot-dedup-orchestrator` | `mapped` | `plugins/opspal-data-hygiene/agents/sfdc-hubspot-dedup-orchestrator.md` | `plugins/opspal-core/agents/sfdc-hubspot-dedup-orchestrator.md` |

## Sunset Readiness
- Status: `sunset_ready`

## Blocking Gaps
- None. Replacement mappings are present for deprecated plugins.

## Sunset Execution Snapshot
- Approved work items detected: 1
- Ready work item: `wi-apr-1771176698166-b40b32` (state: `ready`)
- Runtime checklist detected: `yes`
- Runtime checklist path: `reports/exec/runtime/wi-apr-1771176698166-b40b32-execution-checklist.md`
- Mapping ready: `yes`
- Runtime handoff ready: `yes`
- Ready for sunset completion: `yes`

## Migration Checklist
1. Confirm all deprecated plugin commands/agents have mapped replacements.
2. Remove deprecated plugin from active routing recommendations.
3. Publish migration note and rollback plan for remaining consumers.
4. Track sunset completion in runtime work-item exports.
