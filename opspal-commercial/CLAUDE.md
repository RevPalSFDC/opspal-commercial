# OpsPal Commercial Plugin Marketplace

This repository is the **commercial distribution** of the OpsPal plugin ecosystem for Claude Code. It contains 9 plugins that add Salesforce, HubSpot, Marketo, and cross-platform RevOps capabilities.

## Installation

```bash
# Install the marketplace
/plugin marketplace add RevPalSFDC/opspal-commercial-plugins

# Install individual plugins
/plugin install opspal-core          # Foundation (required)
/plugin install opspal-salesforce    # Salesforce operations
/plugin install opspal-hubspot       # HubSpot CRM
/plugin install opspal-marketo       # Marketo automation
/plugin install opspal-gtm-planning  # GTM annual planning
/plugin install opspal-monday        # Monday.com integration
/plugin install opspal-data-hygiene  # Cross-platform dedup
/plugin install opspal-ai-consult    # Multi-model consultation
/plugin install opspal-mcp-client    # OpsPal MCP server client
```

## Plugins

| Plugin | Version | Description |
|--------|---------|-------------|
| **opspal-core** | 2.34.0 | Cross-platform orchestration, diagram generation, PDF/PPTX output, RevOps reporting, sales funnel diagnostics |
| **opspal-salesforce** | 3.79.0 | CPQ/Q2C assessments, RevOps auditing, Flow management, permission orchestration, territory management, deployment automation |
| **opspal-hubspot** | 3.7.15 | Workflow automation, contact/deal management, marketing campaigns, CMS, SEO, Service Hub, revenue intelligence |
| **opspal-marketo** | 2.6.11 | Lead management, smart campaigns, email marketing, program architecture, analytics, lead scoring, MQL handoff |
| **opspal-gtm-planning** | 2.1.4 | Territory design, quota modeling (Monte Carlo), compensation planning, attribution governance, strategic reporting |
| **opspal-monday** | 1.4.5 | Monday.com file extraction, board management, task synchronization |
| **opspal-data-hygiene** | 1.1.5 | Cross-platform deduplication for HubSpot and Salesforce, data quality validation |
| **opspal-ai-consult** | 1.4.4 | Multi-model AI consultation (Gemini integration) |
| **opspal-mcp-client** | 1.0.2 | Thin client for OpsPal proprietary MCP server |

## Encrypted Assets

Some plugins contain `.enc` files — these are proprietary algorithms (scoring engines, benchmark data, assessment methodologies) encrypted with the OpsPal license system. They are automatically decrypted at runtime when a valid license is present.

**Without a license**: All open-source agents, commands, hooks, and skills work normally. Encrypted assets gracefully degrade with informational messages.

**With a license**: Full access to proprietary scoring engines, benchmark databases, and advanced assessment methodologies.

## Per-Plugin Documentation

Each plugin includes detailed usage documentation:

- `plugins/opspal-core/USAGE.md`
- `plugins/opspal-salesforce/USAGE.md`
- `plugins/opspal-hubspot/USAGE.md`
- `plugins/opspal-marketo/USAGE.md`
- `plugins/opspal-gtm-planning/USAGE.md`
- `plugins/opspal-data-hygiene/USAGE.md`

## Plugin Development

See `docs/PLUGIN_DEVELOPMENT_GUIDE.md` for creating new plugins compatible with this marketplace.

Additional developer references:
- `docs/PLUGIN_DEVELOPMENT_STANDARDS.md` — Coding standards and conventions
- `docs/HOOK_ARCHITECTURE.md` — Hook system design
- `docs/PLUGIN_DEPRECATION_POLICY.md` — Deprecation and lifecycle
- `docs/TROUBLESHOOTING_PLUGIN_LOADING.md` — Common issues and fixes
- `docs/routing-help.md` — Agent routing tables

## Security

- **No customer data** is stored in this repository
- All proprietary IP is encrypted (`.enc` files)
- Environment files (`.env*`) are gitignored
- Plugin runtime data (`instances/`, `cache/`, `logs/`) is gitignored

## Support

- Issues: https://github.com/RevPalSFDC/opspal-commercial-plugins/issues
- Docs: https://docs.gorevpal.com
