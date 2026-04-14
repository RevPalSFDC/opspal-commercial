# OpsPal Commercial Marketplace

This repository is the commercial OpsPal marketplace. It publishes 10 plugins and uses the plugin manifests under `plugins/*/.claude-plugin/plugin.json` as the source of truth for marketplace metadata.

## Installation

```bash
/plugin marketplace add RevPalSFDC/opspal-commercial
/plugin install opspal-core@opspal-commercial
/plugin install opspal-salesforce@opspal-commercial
/plugin install opspal-hubspot@opspal-commercial
/plugin install opspal-marketo@opspal-commercial
/plugin install opspal-attio@opspal-commercial
```

## Published Versions

| Plugin | Version | Status |
|--------|---------|--------|
| `opspal-ai-consult` | 1.4.15 | active |
| `opspal-attio` | 2.0.1 | active |
| `opspal-core` | 2.55.14 | active |
| `opspal-gtm-planning` | 2.3.11 | active |
| `opspal-hubspot` | 3.9.33 | active |
| `opspal-marketo` | 2.6.42 | active |
| `opspal-monday` | 1.4.11 | experimental |
| `opspal-okrs` | 3.0.13 | active |
| `opspal-salesforce` | 3.87.16 | active |

## Updating

```bash
cd ~/.claude/plugins/marketplaces/opspal-commercial
git pull origin main
/pluginupdate --fix
```

## License Activation

```bash
/activate-license <license-key> <email>
/license-status
```

## Support

- Repository: https://github.com/RevPalSFDC/opspal-commercial
- Issues: https://github.com/RevPalSFDC/opspal-commercial/issues

## Repository Stats

| Metric | Count |
|--------|-------|
| Plugins | 9 |
| Agents | 327 |
| Commands | 310 |
| Skills | 177 |
| Hooks | 225 |
| Scripts | 1878 |

---
<!-- OPSPAL_MANAGED_END section="header" -->


<!-- OPSPAL_MANAGED section="critical-routing" version="4.0.0" checksum="24c4166cd1fd" -->
## Agent Routing

Before executing complex work directly, check whether a specialist agent should handle it.
Use `Agent(subagent_type='plugin:agent-name', prompt=<request>)` when:

- The task is **multi-step** (discovery, analysis, implementation, verification)
- The task involves **data mutation** (imports, upserts, bulk updates, deploys)
- The task is an **assessment or audit** (CPQ, RevOps, automation, permissions, HubSpot)
- The task spans **multiple systems** (SF + HubSpot, cross-platform reporting)
- The task requires **domain expertise** (territory models, lead scoring, flow authoring)

Skip agent routing for simple SOQL queries, file reads, status checks, narrow single-file edits, and conversational responses.

### Available specialist domains

| Domain | Key agents | Use for |
|--------|-----------|---------|
| Salesforce | `sfdc-revops-auditor`, `sfdc-cpq-assessor`, `sfdc-permission-orchestrator`, `sfdc-territory-orchestrator` | revops/audit/sf/sfdc/process; assess/sf/cpq/sfdc/analysis; permission/permission set/assignment/fls/sf; territory/Territory2/territory model/territory hierarchy/territory assignment |
| Core | `web-viz-generator`, `revops-reporting-assistant`, `solution-deployment-orchestrator` | pipeline dashboard/sales pipeline/territory dashboard/territory planning/automation audit; revops report/generate report/revenue report/arr report/mrr report; deploy solution/deploy template/multi-platform deploy/rollout solution/solution rollback |
| Marketo | `marketo-lead-quality-assessor`, `marketo-automation-orchestrator`, `marketo-orchestrator` | lead quality/database health/scoring audit/data hygiene/lead assessment; agentic automation/orchestrate marketo/automation workflow/program setup/bulk operations; marketo/orchestrate/coordinate/complex/multi-step |
| Gtm-planning | `gtm-planning-orchestrator` | plan/planning/orchestrator/strategy/workflow |
| Hubspot | `hubspot-assessment-analyzer`, `hubspot-data-operations-manager` | assessment/assess/hubspot/analyze/automation; data/operations/manage/hubspot/object |
| Attio | `attio-orchestrator`, `attio-data-migration-specialist`, `attio-data-operations` | attio/complex workflow/orchestrate/multi-step/coordinate; [attio/migration/data migration/migrate from/migrate to attio; attio/import/export/bulk/batch |

Use fully-qualified names only (e.g., `opspal-salesforce:sfdc-orchestrator`).
Runtime hooks provide per-prompt routing guidance — follow those when they appear in system reminders.
Override: `[DIRECT]` to skip routing.
<!-- OPSPAL_MANAGED_END section="critical-routing" -->

<!-- OPSPAL_MANAGED section="installed-plugins" version="4.0.0" checksum="0fe5a3f24395" -->
## 🔌 Installed Plugins

- ✅ **opspal-ai-consult** (v1.4.15) - 2 agents, 6 scripts, 3 commands, 1 hooks
- ✅ **opspal-attio** (v2.0.1) - 29 agents, 26 scripts, 28 commands, 20 hooks
- ✅ **opspal-core** (v2.55.14) - 80 agents, 360 scripts, 126 commands, 94 hooks
- ✅ **opspal-data-hygiene** (v1.2.5) - 2 agents, 7 scripts, 1 commands, 1 hooks
- ✅ **opspal-gtm-planning** (v2.3.11) - 13 agents, 2 scripts, 16 commands, 4 hooks
- ✅ **opspal-hubspot** (v3.9.33) - 59 agents, 103 scripts, 33 commands, 15 hooks
- ✅ **opspal-marketo** (v2.6.42) - 30 agents, 32 scripts, 30 commands, 24 hooks
- ✅ **opspal-mcp-client** (v1.1.0) - 3 agents, 3 commands, 3 hooks
- ✅ **opspal-monday** (v1.4.11) - 6 agents, 3 scripts, 1 commands, 2 hooks
- ✅ **opspal-okrs** (v3.0.13) - 14 agents, 4 scripts, 14 commands, 4 hooks
- ✅ **opspal-salesforce** (v3.87.16) - 94 agents, 596 scripts, 59 commands, 45 hooks

**Last synced**: 2026-04-14

<!-- OPSPAL_MANAGED_END section="installed-plugins" -->

<!-- OPSPAL_MANAGED section="work-index" version="4.0.0" checksum="fc56ca61a7f0" -->
## 📋 Work-Index Auto-Capture

**Project memory system** - Automatically tracks work requests per client when using Agent() with specialist agents.

### Required Setup

```bash
export ORG_SLUG=<client-org-name>  # Required for auto-capture
```

### Quick Commands

```bash
/work-index list <org>       # List work for client
/work-index search <query>   # Search across clients
/work-index context <org>    # Get recent context for session start
/work-index summary <org>    # Generate client summary
```
<!-- OPSPAL_MANAGED_END section="work-index" -->

<!-- OPSPAL_MANAGED section="project-structure" version="4.0.0" checksum="4e30a702c8ff" -->
## 📁 Project Structure

```
.
├── CLAUDE.md                    # This file - Claude Code instructions
├── .gitignore                   # Auto-generated (protects customer data)
├── orgs/                        # Customer organizations (org-centric)
│   └── [customer-name]/
│       └── platforms/
│           ├── salesforce/      # Salesforce orgs
│           ├── hubspot/         # HubSpot portals
│           ├── marketo/         # Marketo instances
│           └── monday/          # Monday workspaces
├── reports/                     # Cross-platform reports
└── scripts/                     # Custom automation
```
<!-- OPSPAL_MANAGED_END section="project-structure" -->

<!-- OPSPAL_MANAGED section="quick-start" version="4.0.0" checksum="d94a25ad7c85" -->
## 🚀 Quick Start

### Installation

```bash
/plugin marketplace add RevPalSFDC/opspal-commercial
/plugin install opspal-core@opspal-commercial      # Foundation
/plugin install opspal-salesforce@opspal-commercial # Salesforce
/plugin install opspal-hubspot@opspal-commercial    # HubSpot
/plugin install opspal-marketo@opspal-commercial    # Marketo
```

### Verify Installation

```bash
/agents              # List available agents
/sync-claudemd       # Update this file with latest plugin info
/checkdependencies   # Verify npm packages
```

### Set Client Context

```bash
export ORG_SLUG=<client-name>  # Required for work tracking
```
<!-- OPSPAL_MANAGED_END section="quick-start" -->

<!-- OPSPAL_MANAGED section="agent-protocol" version="4.0.0" checksum="9b863d5df290" -->
## Plugin Documentation & Additional Agents

The Agent Routing section at the top of this file covers when and how to use specialists.
For the complete routing table with all patterns, see `docs/routing-help.md`.

### Per-Plugin References

- **Core**: @import .claude-plugins/opspal-core/USAGE.md
- **Gtm-planning**: @import .claude-plugins/opspal-gtm-planning/USAGE.md
- **Hubspot**: @import .claude-plugins/opspal-hubspot/USAGE.md
- **Okrs**: @import .claude-plugins/opspal-okrs/USAGE.md
- **Salesforce**: @import .claude-plugins/opspal-salesforce/USAGE.md

<!-- OPSPAL_MANAGED_END section="agent-protocol" -->

<!-- OPSPAL_MANAGED section="common-workflows" version="4.0.0" checksum="73d5ce84dcdc" -->
## 🔄 Common Workflows

### Single Platform Operations

**Salesforce Assessment**:
```
1. /reflect context <org>     # Load previous work
2. Agent: sfdc-revops-auditor # Run assessment
3. /work-index add <org>      # Log completion
```

**HubSpot Assessment**:
```
1. /reflect context <org>     # Load previous work
2. Agent: hubspot-assessor    # Run assessment
3. /work-index add <org>      # Log completion
```

### Cross-Platform Operations

**Multi-Platform Analysis**:
```
1. Set ORG_SLUG environment variable
2. Use unified-orchestrator for coordination
3. Individual platform agents for execution
4. unified-reporting-aggregator for combined view
```
<!-- OPSPAL_MANAGED_END section="common-workflows" -->

<!-- OPSPAL_MANAGED section="instance-guide" version="4.0.0" checksum="dbaec07cbe27" -->
## 📂 Working with Customer Instances

### Directory Convention

```bash
orgs/
└── acme-corp/                    # Customer org folder
    ├── org.yaml                  # Org metadata (name, industry, contacts)
    ├── platforms/
    │   ├── salesforce/
    │   │   └── production/       # Environment-specific
    │   │       ├── instance.yaml # Platform credentials reference
    │   │       └── assessments/  # Assessment outputs
    │   └── hubspot/
    │       └── portal/
    └── WORK_INDEX.yaml           # All work for this client
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `ORG_SLUG` | Client org identifier (e.g., "acme-corp") |
| `SF_TARGET_ORG` | Salesforce org alias |
| `HUBSPOT_PORTAL_ID` | HubSpot portal ID |
<!-- OPSPAL_MANAGED_END section="instance-guide" -->

<!-- OPSPAL_MANAGED section="security" version="4.0.0" checksum="586f61dde62c" -->
## 🔒 Security

### Never Commit

- API keys, tokens, or credentials
- `.env` files with sensitive data
- Customer data or PII
- Org-specific configuration

### Auto-Generated .gitignore

The `/initialize` command creates a `.gitignore` that protects:
- `orgs/*/` - Customer data
- `.env*` - Environment files
- `*.credentials` - Auth files
- `reports/**/data/` - Raw data exports
<!-- OPSPAL_MANAGED_END section="security" -->

<!-- OPSPAL_MANAGED section="troubleshooting" version="4.0.0" checksum="09882f53e0c9" -->
## 🔧 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Plugin not loading | `claude plugin validate <path>` |
| Agent not routing | Check keywords in `docs/routing-help.md` |
| MCP connection failed | `./scripts/test-mcp-connections.sh` |
| Hook not triggering | `/hooks-health` |
| Missing npm packages | `/checkdependencies --fix` |

### Logs & Diagnostics

```bash
# Check routing decisions
cat ~/.claude/logs/routing.jsonl | tail -20

# Validate plugin structure
claude plugin validate ./plugins/<plugin-name>

# Test MCP connections
./scripts/test-mcp-connections.sh
```

### Getting Help

- Full troubleshooting: `docs/TROUBLESHOOTING_PLUGIN_LOADING.md`
- Routing rules: `docs/routing-help.md`
- Submit feedback: `/reflect`
<!-- OPSPAL_MANAGED_END section="troubleshooting" -->

<!-- OPSPAL_MANAGED section="branding" version="4.0.0" checksum="f7ca74899ee7" -->
---

## 🎨 Brand Gallery & Templates

**MANDATORY**: Use RevPal branding for all client-facing outputs.

### Interactive Gallery

Open in browser: `plugins/opspal-core/templates/branding-gallery/index.html`

### PDF Cover Templates

| Label | Use For |
|-------|---------|
| `PDF_COVER_SALESFORCE` | Automation/metadata/RevOps/CPQ audits |
| `PDF_COVER_HUBSPOT` | Portal assessments, workflow audits |
| `PDF_COVER_MARKETO` | Marketing automation assessments |
| `PDF_COVER_EXECUTIVE` | Executive summaries, benchmarks |
| `PDF_COVER_SECURITY` | Permission/compliance reviews |
| `PDF_COVER_DATA` | Data quality, dedup reports |
| `PDF_COVER_GTM` | GTM planning, revenue modeling |
| `PDF_COVER_CROSSPLATFORM` | Multi-platform integration |

### Color Palette (Quick Reference)

| Label | Hex | Usage |
|-------|-----|-------|
| `REVPAL_GRAPE` | #5F3B8C | Headings, buttons, links |
| `REVPAL_APRICOT` | #E99560 | CTAs, hover states, highlights |
| `REVPAL_INDIGO` | #3E4A61 | Subheadings, body emphasis |
| `REVPAL_SAND` | #EAE4DC | Page backgrounds, cards |
| `REVPAL_GREEN` | #6FBF73 | Success states, checkmarks |
| `REVPAL_SURFACE` | #F7F4EF | Content areas, tables |

### Typography

| Label | Font | Usage |
|-------|------|-------|
| `REVPAL_HEADING_FONT` | Montserrat (600-800) | H1, H2, H3 |
| `REVPAL_BODY_FONT` | Figtree (400-700) | Body text, lists |

### PDF Generation (REQUIRED)

**Always use the branded generator:**

```bash
/generate-pdf report.md report.pdf \
  --theme revpal-brand \
  --cover salesforce-audit
```

**Never use:** `npx md-to-pdf` or generic converters for client deliverables.

### Assets

| Label | Path |
|-------|------|
| `LOGO_PRIMARY` | `plugins/opspal-core/templates/branding-gallery/assets/revpal-logo-primary.png` |
| `LOGO_ICON` | `plugins/opspal-core/templates/branding-gallery/assets/revpal-brand-mark.png` |
| `LOGO_EXPORT` | `plugins/opspal-core/templates/branding-gallery/assets/revpal-logo-export.png` |

<!-- OPSPAL_MANAGED_END section="branding" -->

<!-- OPSPAL_MANAGED section="footer" version="4.0.0" checksum="9135da96bc11" -->
---

**Generated by /sync-claudemd** | 2026-04-14

| Metric | Count |
|--------|-------|
| Plugins | 11 |
| Agents | 332 |
| Commands | 314 |
| Scripts | 1139 |
| Hooks | 213 |
<!-- OPSPAL_MANAGED_END section="footer" -->

<!-- OPSPAL_MANAGED section="header" version="4.0.0" checksum="6202be55ed96" -->
# CLAUDE.md - OpsPal Plugin Ecosystem

**Auto-generated by /sync-claudemd v4.0.0** | Run `/sync-claudemd` to refresh after plugin updates.

---
<!-- OPSPAL_MANAGED_END section="header" -->