# OpsPal by RevPal

RevOps tooling for Claude Code. Audits, automation, and executive-ready outputs across Salesforce, HubSpot, Marketo, and more.

Built by [RevPal](https://gorevpal.com), the RevOps consultancy. OpsPal bundles 292 specialist agents, 255 commands, and 144 safety hooks into Claude Code plugins that run real work — not demos.

---

## What OpsPal does

| Without OpsPal | With OpsPal |
|----------------|-------------|
| RevOps audit takes 8-12 hours | 2-3 hours, automated |
| CPQ assessment takes 6-10 hours | 1.5-3 hours with live data |
| 40% of deploys fail from known issues | Safety hooks catch errors before they ship |
| 6-month consulting engagements | 6-8 weeks with the same depth |

## Quick start

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started) (latest version)
- Node.js 18+

### Install

```bash
# Add the OpsPal marketplace
/plugin marketplace add RevPalSFDC/opspal-commercial

# Install the plugins you need
/plugin install opspal-core           # Foundation (required)
/plugin install opspal-salesforce     # Salesforce operations
/plugin install opspal-hubspot        # HubSpot CRM
/plugin install opspal-marketo        # Marketo automation
/plugin install opspal-gtm-planning   # GTM annual planning
/plugin install opspal-okrs           # OKR lifecycle management
```

### Configure

```bash
cp .env.example .env
# Add your platform credentials (Salesforce org, HubSpot portal, etc.)
```

### Verify

```bash
/agents              # List available agents
/checkdependencies   # Verify npm packages
```

---

## Modules

### Salesforce

94 agents for RevOps audits, CPQ/Q2C assessments, automation forensics, Flow management, permission orchestration, territory planning, metadata deployment, and report/dashboard creation.

**Start here:**
```
Run a RevOps audit on my Salesforce org
Assess our CPQ configuration
Map all automation dependencies on the Opportunity object
```

### HubSpot

59 agents for portal assessments, workflow automation, contact/deal management, marketing campaigns, CMS content, SEO optimization, and revenue intelligence.

**Start here:**
```
Assess our HubSpot portal health
Build a lead scoring workflow
Audit our email deliverability
```

### Marketo

30 agents for campaign diagnostics, lead scoring, email deliverability, program architecture, MQL handoff, and Salesforce sync management.

**Start here:**
```
Discover our Marketo instance configuration
Diagnose why leads aren't routing correctly
Build a lead scoring model
```

### GTM Planning

12 agents for territory design, quota modeling with Monte Carlo simulations, compensation planning, attribution governance, revenue modeling, and scenario analysis.

**Start here:**
```
Build a revenue model with 3-year projections
Design balanced sales territories
Model quota capacity with P10/P50/P90 scenarios
```

### OKR Strategy

14 agents for data-driven objective generation, initiative scoring, executive reporting, cadence management, and Bayesian confidence learning.

**Start here:**
```
Generate OKRs from our pipeline data
Score and prioritize our strategic initiatives
Create a quarterly OKR review dashboard
```

### Core Platform

73 agents providing cross-platform orchestration, diagram generation (Mermaid, ERD, flowcharts), branded PDF/PPTX reports, interactive web dashboards, Asana integration, and adaptive agent routing.

---

## How it works

1. **Install** OpsPal plugins into Claude Code
2. **Connect** your platforms (Salesforce, HubSpot, Marketo, etc.)
3. **Ask** in plain language — OpsPal routes to the right specialist agent automatically
4. **Deliver** executive-ready outputs: branded PDFs, dashboards, and action plans

Sub-agents run concurrently for speed. 144 hooks intercept errors before they happen. Session reflections feed back into the system so it improves with every engagement.

---

## Who OpsPal serves

**RevOps consultants** — Org assessments, CPQ reviews, automation audits, and territory planning delivered in days, not weeks.

**Marketing operations** — Portal health checks, lead scoring models, SEO audits, and campaign attribution from live data.

**Revenue leadership** — ARR waterfall, pipeline intelligence, NRR analysis, and GTM scenario modeling with outputs your board can read.

**Platform administrators** — Metadata deployment, data import/export, permission management, reports, and dashboards at scale.

---

## Privacy and security

- All processing happens locally on your machine
- No customer data is sent to third parties
- No SaaS login or cloud dependency
- Proprietary algorithms are encrypted (`.enc` files) and decrypted at runtime with a valid license
- Environment files and runtime data are gitignored

---

## Encrypted assets

Some plugins include `.enc` files containing proprietary scoring engines, benchmark data, and assessment methodologies.

**Without a license:** All open-source agents, commands, hooks, and skills work normally. Encrypted assets gracefully degrade with informational messages.

**With a license:** Full access to proprietary scoring, benchmarks, and advanced assessment frameworks.

```bash
/activate-license <license-key>
/license-status
```

---

## Updating

```bash
# Pull latest from marketplace
cd ~/.claude/plugins/marketplaces/opspal-commercial
git pull origin main

# Validate and fix
/pluginupdate --fix
/checkdependencies --fix
```

---

## Plugin reference

| Plugin | Version | Agents | Description |
|--------|---------|--------|-------------|
| opspal-core | 2.35.0 | 73 | Cross-platform orchestration, diagrams, PDFs, dashboards, routing |
| opspal-salesforce | 3.79.1 | 94 | CPQ, RevOps, automation, territory, metadata, deployment |
| opspal-hubspot | 3.7.16 | 59 | Workflows, CMS, SEO, contacts, deals, revenue intelligence |
| opspal-marketo | 2.6.11 | 30 | Campaigns, lead scoring, email, programs, sync management |
| opspal-gtm-planning | 2.1.4 | 12 | Territory, quota, compensation, attribution, revenue modeling |
| opspal-okrs | 3.0.2 | 14 | OKR lifecycle, initiative scoring, executive reporting |
| opspal-monday | 1.4.5 | 6 | Monday.com file extraction and board management |
| opspal-ai-consult | 1.4.4 | 2 | Multi-model AI consultation (Gemini) |
| opspal-mcp-client | 1.0.2 | — | Thin client for OpsPal MCP server |

---

## Documentation

Each plugin includes detailed usage docs:

- `plugins/opspal-core/USAGE.md`
- `plugins/opspal-salesforce/USAGE.md`
- `plugins/opspal-hubspot/USAGE.md`
- `plugins/opspal-marketo/USAGE.md`
- `plugins/opspal-gtm-planning/USAGE.md`

Additional references:
- [Plugin development guide](docs/PLUGIN_DEVELOPMENT_GUIDE.md)
- [Routing reference](docs/routing-help.md)
- [Troubleshooting](docs/TROUBLESHOOTING_PLUGIN_LOADING.md)

---

## Support

- Website: [opspal.gorevpal.com](https://opspal.gorevpal.com)
- Issues: [GitHub Issues](https://github.com/RevPalSFDC/opspal-commercial/issues)

---

**Built by [RevPal](https://gorevpal.com)** — founded by RevOps practitioners, not agency salespeople.
