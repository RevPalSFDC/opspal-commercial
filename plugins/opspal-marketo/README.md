# Marketo Plugin for Claude Code

Comprehensive Marketo marketing automation plugin for Claude Code. Provides native API integration through MCP server, specialized agents for lead management, campaigns, programs, analytics, assessment, governance, and performance optimization.

## Features

- **Native MCP Integration**: 35+ Marketo API tools via dedicated MCP server
- **Specialized Agents**: 23 deep specialist agents for different Marketo operations
- **Assessment Agents**: Lead quality, program ROI, automation auditing, email deliverability
- **Cross-Platform Integration**: Salesforce sync specialist, HubSpot bridge
- **Governance & Performance**: Tier-based governance, API optimization, rate limiting
- **Multi-Instance Support**: Manage multiple Marketo instances (production, sandbox, etc.)
- **Comprehensive Analytics**: Attribution modeling, revenue cycle analysis, program ROI
- **Bulk Operations**: Handle large-scale lead imports, updates, and migrations
- **Validation Framework**: 5-stage validation preventing 80% of errors
- **Workflow Automation**: Wizard-driven webinar, scoring, and MQL handoff setup

## Quick Start

### 1. Install Plugin

The plugin is included in the OpsPal Internal Plugin Marketplace.

### 2. Configure Authentication

```bash
# Option 1: Environment Variables
export MARKETO_CLIENT_ID="your-client-id"
export MARKETO_CLIENT_SECRET="your-client-secret"
export MARKETO_BASE_URL="https://123-ABC-456.mktorest.com"

# Option 2: Interactive Setup
/marketo-auth setup
```

### 3. Verify Connection

```bash
/marketo-auth test
```

## Available Agents

### Orchestration
| Agent | Purpose |
|-------|---------|
| `marketo-orchestrator` | Complex multi-step operations |

### Discovery & Operations
| Agent | Purpose |
|-------|---------|
| `marketo-instance-discovery` | Read-only exploration |
| `marketo-lead-manager` | Lead CRUD and management |
| `marketo-data-operations` | Import/export, bulk ops |

### Campaign & Program Management
| Agent | Purpose |
|-------|---------|
| `marketo-campaign-builder` | Smart campaign creation |
| `marketo-email-specialist` | Email templates and programs |
| `marketo-program-architect` | Program structure and channels |
| `marketo-landing-page-manager` | Landing page management |
| `marketo-form-builder` | Form creation and configuration |

### Assessment Agents (NEW v2.0.0)
| Agent | Purpose |
|-------|---------|
| `marketo-lead-quality-assessor` | Lead database health analysis |
| `marketo-program-roi-assessor` | Program effectiveness and ROI analysis |
| `marketo-automation-auditor` | Campaign dependency and conflict detection |
| `marketo-email-deliverability-auditor` | Email health and compliance auditing |

### Analytics & Revenue
| Agent | Purpose |
|-------|---------|
| `marketo-analytics-assessor` | Comprehensive reporting |
| `marketo-revenue-cycle-analyst` | Revenue cycle modeling |

### Integration (NEW v2.0.0)
| Agent | Purpose |
|-------|---------|
| `marketo-integration-specialist` | Webhooks and API integrations |
| `marketo-sfdc-sync-specialist` | Salesforce-Marketo sync management |
| `marketo-hubspot-bridge` | HubSpot-Marketo data bridging |

### Governance & Performance (NEW v2.0.0)
| Agent | Purpose |
|-------|---------|
| `marketo-governance-enforcer` | Tier-based approval workflows |
| `marketo-performance-optimizer` | API and batch performance optimization |

### Workflow Automation (NEW v2.1.0)
| Agent | Purpose |
|-------|---------|
| `marketo-webinar-orchestrator` | End-to-end webinar campaign management |
| `marketo-lead-scoring-architect` | Lead scoring model design and implementation |
| `marketo-mql-handoff-orchestrator` | MQL qualification and sales handoff automation |

## Runbooks

- **Governance**: `docs/runbooks/governance/` (4 runbooks: 01-instance-health, 02-automation-performance, 03-operational-workflows, 04-troubleshooting-sfdc-mapping)
- **Lead Management**: `docs/runbooks/lead-quality-maintenance.md`, `docs/runbooks/bulk-operations-guide.md`, `docs/runbooks/leads/lead-scoring-model-setup.md` (NEW v2.1.0)
- **Programs**: `docs/runbooks/programs/webinar-campaign-launch.md` (NEW v2.1.0), `docs/runbooks/programs/engagement-program-setup.md` (NEW v2.1.0), `docs/runbooks/programs/mql-handoff-workflow.md` (NEW v2.1.0)
- **Integrations**: `docs/runbooks/integrations/salesforce-sync-troubleshooting.md`, `docs/runbooks/integrations/hubspot-bridge-setup.md`, `docs/runbooks/integrations/program-sfdc-campaign-sync.md` (NEW v2.1.0)
- **Campaign Operations**: `docs/runbooks/campaign-operations/campaign-activation-checklist.md`, `docs/runbooks/campaign-operations/trigger-campaign-best-practices.md`
- **Email**: `docs/runbooks/email/email-blast-execution.md`
- **Performance**: `docs/runbooks/performance/api-optimization-guide.md`
- **Assessments**: `docs/runbooks/assessments/quarterly-audit-procedure.md`

## Slash Commands

| Command | Description |
|---------|-------------|
| `/marketo-auth` | Configure authentication |
| `/marketo-instance` | Manage instances |
| `/marketo-leads` | Lead operations |
| `/marketo-campaigns` | Campaign management |
| `/marketo-programs` | Program operations |
| `/marketo-analytics` | Run reports |
| `/marketo-governance-audit` | Governance audit and evidence collection |
| `/launch-webinar` | Interactive webinar campaign wizard (NEW v2.1.0) |
| `/create-scoring-model` | Lead scoring model wizard (NEW v2.1.0) |
| `/configure-mql-handoff` | MQL handoff configuration wizard (NEW v2.1.0) |
| `/sync-program-to-sfdc` | Program-to-campaign sync wizard (NEW v2.1.0) |
| `/smart-list-snapshot` | Backup/diff smart list rules |

## MCP Tools

### Lead Tools
- `mcp__marketo__lead_query` - Query leads with filters
- `mcp__marketo__lead_create` - Create/upsert leads
- `mcp__marketo__lead_update` - Update lead fields
- `mcp__marketo__lead_merge` - Merge duplicates
- `mcp__marketo__lead_describe` - Get field schema
- `mcp__marketo__lead_activities` - Get activity log

### Campaign Tools
- `mcp__marketo__campaign_list` - List smart campaigns
- `mcp__marketo__campaign_get` - Get campaign details
- `mcp__marketo__campaign_activate` - Activate trigger campaigns
- `mcp__marketo__campaign_deactivate` - Deactivate campaigns
- `mcp__marketo__campaign_schedule` - Schedule batch campaigns

### List Tools
- `mcp__marketo__list_list` - List static lists
- `mcp__marketo__list_create` - Create static lists
- `mcp__marketo__list_add_leads` - Add leads to static lists
- `mcp__marketo__list_remove_leads` - Remove leads from static lists
- `mcp__marketo__smart_list_list` - List smart list assets
- `mcp__marketo__smart_list_get` - Read smart list rules

### Program Tools
- `mcp__marketo__program_list` - List programs
- `mcp__marketo__program_get` - Get program details
- `mcp__marketo__program_create` - Create programs
- `mcp__marketo__program_clone` - Clone programs
- `mcp__marketo__program_members` - Manage membership

## Directory Structure

```
marketo-plugin/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── agents/                       # Specialist agents
│   ├── marketo-orchestrator.md
│   ├── marketo-instance-discovery.md
│   ├── marketo-lead-manager.md
│   └── shared/
├── mcp-server/                   # MCP server
│   ├── index.js
│   └── src/
│       ├── auth/
│       └── tools/
├── scripts/lib/                  # Utility scripts
├── commands/                     # Slash commands
├── hooks/                        # Lifecycle hooks
├── docs/runbooks/               # Operational guides
├── portals/                      # Instance configs (gitignored)
└── templates/                    # Reusable templates
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MARKETO_CLIENT_ID` | Yes | API Client ID |
| `MARKETO_CLIENT_SECRET` | Yes | API Client Secret |
| `MARKETO_BASE_URL` | Yes | REST API endpoint |
| `MARKETO_MUNCHKIN_ID` | No | Auto-detected from URL |
| `MARKETO_INSTANCE_NAME` | No | Default instance name |

### Finding Your Credentials

1. Log into Marketo Admin
2. Go to **LaunchPoint** → **New Service** → **Custom**
3. Copy Client ID and Client Secret
4. Base URL format: `https://{munchkin-id}.mktorest.com`

## Usage Examples

### Query Leads
```
Find all leads from Acme Corp with score > 50
```

### Create Campaign
```
Create a smart campaign that sends welcome emails to new leads
```

### Analyze Programs
```
Show me the ROI for all webinar programs from Q4
```

## API Limits

- **Rate Limit**: 100 calls per 20 seconds
- **Bulk Limit**: 300 records per operation
- **Daily Quota**: Varies by subscription

## Security

- Credentials stored in `portals/config.json` (gitignored)
- Tokens cached in `portals/.token-cache/` (gitignored)
- Never commit credentials to version control

## Troubleshooting

### Authentication Errors
```bash
/marketo-auth test    # Check auth status
/marketo-auth refresh # Force token refresh
```

### Rate Limit Exceeded
Wait 20 seconds and retry. Consider batching operations.

### Field Not Found
```bash
/marketo-leads schema  # View available fields
```

## Version

- **Current**: 2.2.0
- **MCP Server**: 1.0.0
- **API Version**: REST v1
- **Last Updated**: 2026-01-07

## License

MIT

## Support

- Repository: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace
- Issues: File via GitHub Issues
