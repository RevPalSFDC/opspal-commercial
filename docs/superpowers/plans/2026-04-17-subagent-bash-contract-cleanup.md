# Sub-Agent Bash Contract Cleanup

**Status:** follow-up spec — run `superpowers:brainstorm` before implementing.

**Source:** `reports/routing-agent-bash-audit-2026-04-17.md`

**Problem:** 12 agents listed as routing targets lack `Bash` in their `tools:`
frontmatter despite being suggested for Bash-dependent tasks (deploys, data ops,
metadata configuration). Following the routing suggestion causes silent failure when
the specialist cannot invoke shell commands.

## Agents in scope

All from `opspal-salesforce` plugin unless noted:

| Agent | Primary concern | Routing keywords |
|-------|----------------|-----------------|
| `sfdc-territory-planner` | Territory writes — cited in reflection `8d743b20` | territory, territory model, Territory2 |
| `sfdc-cpq-specialist` | Metadata deploys: field_create, object_create, flow_create | revenue, cpq, specialist |
| `sfdc-compliance-officer` | User creates, permission assigns, sharing rule creates | compliance, audit, deploy |
| `sfdc-data-generator` | Bulk data creates: object_create, field_create, data_create | data, generator |
| `sfdc-einstein-admin` | Analytics dataset creation, report creation | analytics, admin, einstein |
| `sfdc-integration-specialist` | Integration config; WebFetch present but no Bash for CLI steps | integration, integrations |
| `sfdc-service-cloud-admin` | metadata_deploy, field/object creation | admin, manage, service |
| `sfdc-dashboard-optimizer` | Dashboard metadata writes | optimize, dashboard |
| `sfdc-report-validator` | Report config writes; may need sf CLI for validation | deploy, validate, report |
| `sfdc-enrichment-manager` | data_update for upserted records; upsert pipeline may use Bash | enrichment |
| `sfdc-ownership-router` | data_update for ownership assignment | lead routing, ownership |
| `sfdc-upsert-error-handler` | data_create/update for error queue management | error, upsert |

## Decision needed per agent

For each agent, decide:
- **(a) Add `Bash` to the agent's `tools:` list** (preserve routing, enable full execution)
- **(b) Remove the agent from routing for Bash-dependent keywords** (narrow scope — agent handles only MCP-based mutations)
- **(c) Create a coordinator agent** that orchestrates this specialist (read/query) + a Bash-capable executor agent

Default: **(a)** unless the agent is genuinely complete without shell access.

**Strong (a) candidates:** `sfdc-territory-planner` (territory writes require CLI for bulk assignment scripts), `sfdc-cpq-specialist` (metadata deploys often invoke sf CLI), `sfdc-compliance-officer` (permission set deployments cited in reflection `e9b4ca92`), `sfdc-service-cloud-admin`, `sfdc-data-generator`.

**Consider (b) or (c):** `sfdc-dashboard-optimizer` (MCP-native dashboard writes may be sufficient), `sfdc-report-validator` (validation may be MCP-only), `sfdc-enrichment-manager` / `sfdc-ownership-router` / `sfdc-upsert-error-handler` (all sub-agents in upsert pipeline — Bash may only be needed in the orchestrator, not these specialists).

## Out of scope

- The 29 `opspal-attio` ghost routes (separate cleanup: restore attio agents OR purge them from routing-index.json)
- Broader tool-permission refactor; this is a targeted list from the audit.
- `sfdc-planner`, `sfdc-object-auditor`, `sfdc-territory-discovery`, `sfdc-territory-monitor`, `sfdc-bulkops-validator`, `hubspot-api`, `asana-task-manager`, `notebooklm-knowledge-manager`, `benchmark-research-agent` (all classified `correct-readonly` — no action needed)

## Related

- Memory: `feedback_subagent_bash_contract.md`
- Reflections: `1d1712ec`, `8d743b20`, `e9b4ca92`
- Audit report: `reports/routing-agent-bash-audit-2026-04-17.md`
- Matrix: `reports/routing-agent-bash-audit-2026-04-17-matrix.tsv`
