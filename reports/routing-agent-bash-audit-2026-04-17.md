# Sub-Agent Bash Permission Audit — 2026-04-17

**Context:** Reflections `1d1712ec`, `8d743b20`, `e9b4ca92` flagged a circular-dependency
failure mode where routing hooks enforced specialist use but those specialists lacked
Bash access. Task 2.1 made routing advisory-only, so this audit exists to catalog the
*underlying* mismatches that remain — cases where following a routing suggestion would
still fail because the suggested specialist cannot execute shell commands.

## Scope

- Agents enumerated: 298 (all `plugins/*/agents/*.md`)
- Routing-suggested specialists: 327 (from `routing-index.json` → `byKeywordFull`)
- Filesystem cross-reference: 298 of 327 routing targets have agent files on disk
- Ghost routes: 29 (all `opspal-attio` agents — see below)
- Agents with explicit `tools:` frontmatter: 298 (100% — zero agents inherit defaults)
- Routing targets with `tools:` but no `Bash`: **24 mismatches**
- Routing targets with Bash: 274

## Methodology

1. Glob all `plugins/*/agents/*.md`, extract YAML frontmatter with regex, parse `tools:` field.
2. Enumerate routing targets from `routing-index.json:byKeywordFull` (full `plugin:agent` names).
3. Cross-reference: for each routing target, check if the file exists on disk and whether `Bash` appears in its `tools:` list.
4. Read each mismatched agent's description and body to classify: `needs-bash-fix`, `correct-readonly`, or `ambiguous`.
5. Also inspected `hooks/unified-router.sh` for hardcoded keyword→agent mappings (confirmed: unified-router.sh also hardcodes agent names for specific destructive-operation patterns, all cross-checked against the same 24 mismatches).

**Key finding from standards check:** All 298 agent files have an explicit `tools:` frontmatter field. There are zero agents that would "inherit a default tool set" — the `tools:` field is mandatory in practice across this codebase. This means any agent missing `Bash` from its list is definitively restricted from Bash execution.

## Mismatch Report

### needs-bash-fix (12 agents)

These agents are routed for tasks that typically require shell execution but their `tools:` frontmatter excludes `Bash`. Following the routing suggestion causes the specialist to silently skip shell steps or error at runtime.

| Plugin | Agent | Sample routing keywords | Description excerpt |
|--------|-------|------------------------|---------------------|
| opspal-salesforce | `sfdc-cpq-specialist` | revenue, specialist, cpq | "Use PROACTIVELY for CPQ configuration" — deploys fields, objects, flows via metadata_deploy |
| opspal-salesforce | `sfdc-compliance-officer` | compliance, audit, deploy | "ensure Salesforce implementations meet regulatory requirements" — creates users, assigns permissions, creates sharing rules |
| opspal-salesforce | `sfdc-data-generator` | data, generator, sfdc | "creating intelligent, business-appropriate mock data" — creates objects/fields/records in bulk |
| opspal-salesforce | `sfdc-einstein-admin` | analytics, admin, einstein | "implementing and optimizing Salesforce Einstein features" — creates analytics datasets and reports |
| opspal-salesforce | `sfdc-integration-specialist` | integration, integrations | "Salesforce integration expert" — configures integrations; WebFetch but no Bash for CLI/scripts |
| opspal-salesforce | `sfdc-service-cloud-admin` | admin, manage, service | "configuring Salesforce Service Cloud" — metadata_deploy, field/object creation |
| opspal-salesforce | `sfdc-dashboard-optimizer` | optimize, dashboard | "creating high-performance dashboards" — reads/writes dashboard metadata, no shell |
| opspal-salesforce | `sfdc-report-validator` | deploy, validate, report | "pre-validating all report configurations before creation" — reads/writes but no Bash for sf CLI calls |
| opspal-salesforce | `sfdc-territory-planner` | territory, territory model | "Designs Territory2 structures and plans territory changes" — uses Task + Write but no Bash; territory writes were the exact pattern cited in reflection `8d743b20` |
| opspal-salesforce | `sfdc-enrichment-manager` | enrichment, sfdc | "Manages data enrichment for upserted records" — update operations; no Bash for sf CLI |
| opspal-salesforce | `sfdc-ownership-router` | lead routing, ownership | "Handles ownership assignment for upserted records" — data_update but no Bash |
| opspal-salesforce | `sfdc-upsert-error-handler` | error, upsert | "Manages error queue for failed upsert operations" — data_create/update but no Bash |

**Rationale:** These agents are routed for tasks that involve metadata deployment, record mutations, or configuration changes where the `sf` CLI or shell scripts are commonly invoked as part of the operation. The agents rely entirely on MCP tools for data access, but MCP tools alone cannot cover all execution paths (e.g., running validation scripts, generating CSV artifacts, invoking sf CLI for metadata push). **Recommended:** Add `Bash` to each agent's `tools:` list, OR remove the agent from keyword routing for tasks that require CLI-level Bash execution.

### correct-readonly (9 agents)

These agents are genuinely read-only or use MCP/API tools exclusively. Lack of Bash is intentional.

| Plugin | Agent | Rationale |
|--------|-------|-----------|
| opspal-salesforce | `sfdc-bulkops-validator` | Explicitly documented "read-only sub-agent" — SOQL queries only, no writes |
| opspal-salesforce | `sfdc-territory-discovery` | "Read-only analysis of Salesforce Territory2 configuration" — query + read only |
| opspal-salesforce | `sfdc-territory-monitor` | "Monitors Salesforce Territory2 operations" — read-only health monitoring |
| opspal-salesforce | `sfdc-object-auditor` | Audits object metadata — query + read + ExitPlanMode, no mutations |
| opspal-salesforce | `sfdc-planner` | Planning and design agent (ExitPlanMode pattern) — produces plans, does not execute them |
| opspal-hubspot | `hubspot-api` | Explicitly documented "READ-ONLY / DIAGNOSTIC AGENT" — only hubspot_get + Read |
| opspal-core | `asana-task-manager` | MCP-only Asana integration — Task + mcp_asana tools, no shell needed |
| opspal-core | `notebooklm-knowledge-manager` | MCP-only NotebookLM operations — all tools are mcp__notebooklm__ |
| opspal-core | `benchmark-research-agent` | DEPRECATED (redirects to opspal-salesforce version) — WebSearch/WebFetch only |

### ambiguous (3 agents)

| Plugin | Agent | Both interpretations |
|--------|-------|---------------------|
| opspal-hubspot | `hubspot-data` | Has `mcp__hubspot-enhanced-v3__hubspot_update`, Read, Write, Grep. Body says "data operations manager" which may involve scripts. However, it primarily uses MCP for mutations. If MCP tools cover all needed writes, no Bash needed. If any workflow involves calling `hs` CLI or generating/processing CSV files, Bash is needed. |
| opspal-marketo | `marketo-intelligence-analyst` | Has Read, Write, Task, Glob — analysis/interpretation role. Body says "interpret data, analyze normalized lead/activity data." If it only reads files and writes reports, correct-readonly. If analysis requires running node scripts or calling Marketo REST API via curl, needs Bash. |
| opspal-salesforce | `benchmark-research-agent` | WebSearch + WebFetch + Read + Write + Grep + TodoWrite. Primarily web research, no CLI needed. However, the `opspal-core` version is deprecated in favor of this one, and the routing index currently maps `opspal-salesforce:benchmark-research-agent` as a routing target — this entry exists in `byKeywordFull` but NOT in the main `agents` dict (the core's deprecated copy is the canonical index entry). Functionally correct-readonly, but there's a routing-index stale-reference issue (the routing-index `agents` dict only has the core version, not the salesforce version, though both files exist). |

## Agents without `tools:` Frontmatter (0)

All 298 agent files in the codebase have an explicit `tools:` field. Claude Code plugin agents in this codebase follow a strict pattern: every agent defines its exact tool allowlist. There is no "inherit all tools" case to worry about — the `tools:` field being absent would be a structural bug, not an intentional default.

## Ghost Routes

Agents that routing suggests but whose definition files do not exist on disk.

**29 ghost routes, all in `opspal-attio`:**

The `opspal-attio` plugin directory exists at `plugins/opspal-attio/` but contains only `commands/`, `docs/`, and `hooks/` — no `agents/` directory. The routing-index.json (built against a version of the codebase that had attio agents) still references all 29 attio specialist agents. Following any attio routing suggestion will fail immediately: the Agent() call will error because the agent definition doesn't exist.

Full list of ghost routes:
- `opspal-attio:attio-admin-specialist`
- `opspal-attio:attio-assessment-analyzer`
- `opspal-attio:attio-attribute-architect`
- `opspal-attio:attio-automation-auditor`
- `opspal-attio:attio-comments-specialist`
- `opspal-attio:attio-companies-manager`
- `opspal-attio:attio-custom-objects-architect`
- `opspal-attio:attio-data-hygiene-specialist`
- `opspal-attio:attio-data-migration-specialist`
- `opspal-attio:attio-data-operations`
- `opspal-attio:attio-deals-manager`
- `opspal-attio:attio-files-specialist`
- `opspal-attio:attio-governance-enforcer`
- `opspal-attio:attio-hubspot-bridge`
- `opspal-attio:attio-integration-specialist`
- `opspal-attio:attio-lists-pipeline-manager`
- `opspal-attio:attio-meeting-intelligence`
- `opspal-attio:attio-notes-tasks-manager`
- `opspal-attio:attio-observability-orchestrator`
- `opspal-attio:attio-orchestrator`
- `opspal-attio:attio-people-manager`
- `opspal-attio:attio-pipeline-analyst`
- `opspal-attio:attio-query-specialist`
- `opspal-attio:attio-record-historian`
- `opspal-attio:attio-revenue-intelligence`
- `opspal-attio:attio-salesforce-bridge`
- `opspal-attio:attio-scim-admin`
- `opspal-attio:attio-users-workspaces-manager`
- `opspal-attio:attio-workspace-discovery`

**Also noted:** `opspal-salesforce:benchmark-research-agent` appears in `byKeywordFull` routing targets but NOT in the routing-index `agents` dict (which only contains the deprecated `opspal-core:benchmark-research-agent`). The file exists on disk, so it is not a ghost route — but the routing-index has a stale cross-reference that may cause confusion in tooling that depends on the `agents` dict for resolution.

**Immediate action required:** Rebuild `routing-index.json` to remove the 29 attio ghost routes (or restore the attio agents if their removal was unintentional).

## Unified Router Hardcoded Mappings

`hooks/unified-router.sh` contains 29 hardcoded `opspal-salesforce:` and `opspal-core:` agent name references for specific destructive-operation patterns (production deploys, bulk deletes, dedup merges). Cross-checked: all hardcoded targets have agent files on disk and all have `Bash` in their `tools:` lists. No additional mismatches from the shell hook's hardcoded routing.

## Follow-ups Filed

A follow-up plan stub has been filed at:
`docs/superpowers/plans/2026-04-17-subagent-bash-contract-cleanup.md`

It covers the 12 `needs-bash-fix` agents. The attio ghost routes are a separate, higher-priority cleanup task.

## Summary

| Severity | Count | Category |
|----------|-------|----------|
| **Critical** | 29 | Ghost routes — all `opspal-attio` agents; routing index out of sync with filesystem |
| **Important** | 12 | `needs-bash-fix` — routed for Bash-dependent tasks but lack Bash in `tools:` |
| **Info** | 9 | `correct-readonly` — intentionally restricted; no action needed |
| **Info** | 3 | `ambiguous` — classify per agent-specific decision |
| **Info** | 1 | Stale routing-index entry: `opspal-salesforce:benchmark-research-agent` not in `agents` dict |

**The circular dependency described in reflections `1d1712ec`, `8d743b20`, `e9b4ca92` is confirmed at the mismatch level.** Specifically, `sfdc-territory-planner` (cited explicitly in `8d743b20` for territory writes) lacks Bash despite being the primary routing target for "territory" + "write" keywords. With advisory-only routing (Task 2.1 complete), users won't be hard-blocked — but following the routing advice will still surface failures at the specialist execution level for the 12 `needs-bash-fix` agents.
