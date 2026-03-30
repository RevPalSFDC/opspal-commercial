# OpsPal Commercial Marketplace

This repository is the commercial OpsPal marketplace. It publishes 10 plugins and uses the plugin manifests under `plugins/*/.claude-plugin/plugin.json` as the source of truth for marketplace metadata.

## Installation

```bash
/plugin marketplace add RevPalSFDC/opspal-commercial
/plugin install opspal-core@opspal-commercial
/plugin install opspal-salesforce@opspal-commercial
/plugin install opspal-hubspot@opspal-commercial
/plugin install opspal-marketo@opspal-commercial
```

## Published Versions

| Plugin | Version | Status |
|--------|---------|--------|
| `opspal-ai-consult` | 1.4.12 | active |
| `opspal-core` | 2.47.1 | active |
| `opspal-data-hygiene` | 1.2.2 | deprecated |
| `opspal-gtm-planning` | 2.3.4 | active |
| `opspal-hubspot` | 3.9.16 | active |
| `opspal-marketo` | 2.6.26 | active |
| `opspal-mcp-client` | 1.1.3 | active |
| `opspal-monday` | 1.4.7 | experimental |
| `opspal-okrs` | 3.0.8 | active |
| `opspal-salesforce` | 3.86.13 | active |

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

## Prerequisites

Before performing OpsPal work, verify:
1. License is activated (`/license-status`). If not, run `/activate-license`.
2. Workspace is initialized (`/initialize` in the project directory).

## Agent Routing

Use `Agent` with fully-qualified agent names for specialist work. Route by domain:

| Domain | Agent |
|--------|-------|
| CPQ / Q2C | `opspal-salesforce:sfdc-cpq-assessor` |
| RevOps / Pipeline | `opspal-salesforce:sfdc-revops-auditor` |
| Automation / Flow | `opspal-salesforce:sfdc-automation-auditor` |
| Permissions | `opspal-salesforce:sfdc-permission-orchestrator` |
| Reports / Dashboards | `opspal-salesforce:sfdc-reports-dashboards` |
| Import / Export data | `opspal-salesforce:sfdc-data-operations` |
| Deploy / Production | `opspal-core:release-coordinator` |
| Diagrams | `opspal-core:diagram-generator` |
| Territory | `opspal-salesforce:sfdc-territory-orchestrator` |
| HubSpot assessment | `opspal-hubspot:hubspot-assessment-analyzer` |
| HubSpot workflows | `opspal-hubspot:hubspot-workflow-builder` |
| Marketo operations | `opspal-marketo:marketo-orchestrator` |
| GTM planning | `opspal-gtm-planning:gtm-planning-orchestrator` |
| OKRs | `opspal-okrs:okr-strategy-orchestrator` |

For project-level requests with 3+ work streams, unknown scope, or cross-team coordination, suggest `/intake` before proceeding.

## Task Graph Orchestration

Use `task-graph-orchestrator` for requests scoring 4+ on complexity:
- Multi-domain (2 pts): Apex + Flow, SF + HubSpot
- Multi-artifact (2 pts): 5+ files affected
- High-risk (2 pts): Production, permissions, deletes
- High-ambiguity (1 pt): Needs discovery
- Long-horizon (1 pt): Multi-step execution

User flags: `[SEQUENTIAL]`/`[PLAN_CAREFULLY]` force Task Graph. `[DIRECT]` skips it. On-demand scoring: `/complexity`.

## Branding

All client-facing outputs must use RevPal branding. See `plugins/opspal-core/templates/branding-gallery/index.html` for the brand gallery and `config/master-template-registry.json` for agent-specific templates.

## Org Runbooks

When working on a client org, check for `orgs/<org>/RUNBOOK.md` or `orgs/<org>/platforms/*/configs/RUNBOOK.md` before making changes. Runbooks contain org-specific quirks, conventions, and institutional knowledge.

## Support

- Repository: https://github.com/RevPalSFDC/opspal-commercial
- Issues: https://github.com/RevPalSFDC/opspal-commercial/issues
