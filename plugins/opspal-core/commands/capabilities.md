---
name: capabilities
description: Browse all OpsPal plugin capabilities in a structured hierarchy — agents, commands, skills, and hooks across all installed plugins
argument-hint: "[optional: filter by platform or category, e.g. 'salesforce', 'scoring', 'reporting']"
intent: Discover and browse all available agents, commands, and skills across the OpsPal plugin suite
dependencies: []
failure_modes: [catalog_not_found, plugin_directory_missing]
---

# OpsPal Capability Browser

Browse the full OpsPal plugin suite in a structured, searchable format. This is your entry point for discovering what the platform can do.

## Instructions

1. Read the plugin catalog from `${CLAUDE_PLUGIN_ROOT}/../../../docs/PLUGIN_SUITE_CATALOG.json`
   - If not found, fall back to `${CLAUDE_PLUGIN_ROOT}/../../docs/PLUGIN_SUITE_CATALOG.json`
   - If neither exists, scan all sibling plugin directories for `plugin.json` manifests

2. Parse the catalog and organize capabilities into a **3-level hierarchy**:

### Level 1: Platform
Group by platform domain:
- **Salesforce** — `opspal-salesforce` agents, commands, skills
- **HubSpot** — `opspal-hubspot` agents, commands, skills
- **Marketo** — `opspal-marketo` agents, commands, skills
- **GTM Planning** — `opspal-gtm-planning` agents, commands, skills
- **OKR Management** — `opspal-okrs` agents, commands, skills
- **Cross-Platform** — `opspal-core` agents, commands, skills (excluding infrastructure)
- **Integrations** — `opspal-mcp-client`, `opspal-ai-consult`, `opspal-monday`
- **Infrastructure** — Core hooks, routing, validation, session management

### Level 2: Category
Within each platform, group by functional category:
- Assessment & Audit
- Reporting & Dashboards
- Data Operations
- Automation & Workflows
- Deployment & DevOps
- Scoring & Intelligence
- Integration & Sync
- Governance & Compliance
- Planning & Strategy

### Level 3: Individual Capability
For each capability, show:
- **Name** (agent/command/skill name)
- **Type** (agent, command, skill)
- **One-line description**
- **Trigger keywords** (if agent)
- **Usage example** (if command)

3. **If the user provided a filter argument**, narrow results to matching capabilities:
   - Match against platform names, category names, agent names, trigger keywords, and descriptions
   - Show matching results with their full hierarchy context

4. **Output format**: Use a clean, scannable markdown table or structured list. Group by platform, then category. Include a summary line at the top:

```
OpsPal Plugin Suite: X agents | Y commands | Z skills across N plugins
```

5. **At the end**, suggest related commands:
   - `/route <task>` — Get routing recommendation for a specific task
   - `/routing-health` — Check routing system health
   - `/checkdependencies` — Verify all plugin dependencies

## Filter Examples

```
/capabilities salesforce        # All Salesforce capabilities
/capabilities reporting         # All reporting across platforms
/capabilities scoring           # Scoring engines and models
/capabilities assessment        # All assessment/audit tools
/capabilities hubspot workflow  # HubSpot workflow capabilities
```

## Notes

- This command is READ-ONLY — it only reads catalog data
- If the catalog is stale, suggest running the catalog generator
- Do not list internal/infrastructure hooks unless the user specifically asks for them
