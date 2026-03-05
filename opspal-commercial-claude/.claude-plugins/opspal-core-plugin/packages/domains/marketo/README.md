# Marketo Plugin for Claude Code

Comprehensive Marketo marketing automation plugin for Claude Code. Provides native API integration through MCP server, specialized agents for lead management, campaigns, programs, and analytics.

## Features

- **Native MCP Integration**: 25+ Marketo API tools via dedicated MCP server
- **Specialized Agents**: 12 deep specialist agents for different Marketo operations
- **Multi-Instance Support**: Manage multiple Marketo instances (production, sandbox, etc.)
- **Comprehensive Analytics**: Attribution modeling, revenue cycle analysis, program ROI
- **Bulk Operations**: Handle large-scale lead imports, updates, and migrations

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

| Agent | Purpose |
|-------|---------|
| `marketo-orchestrator` | Complex multi-step operations |
| `marketo-instance-discovery` | Read-only exploration |
| `marketo-lead-manager` | Lead CRUD and management |
| `marketo-campaign-builder` | Smart campaign creation |
| `marketo-email-specialist` | Email templates and programs |
| `marketo-program-architect` | Program structure and channels |
| `marketo-landing-page-manager` | Landing page management |
| `marketo-form-builder` | Form creation and configuration |
| `marketo-analytics-assessor` | Comprehensive reporting |
| `marketo-revenue-cycle-analyst` | Revenue cycle modeling |
| `marketo-data-operations` | Import/export, bulk ops |
| `marketo-integration-specialist` | Webhooks and API integrations |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/marketo-auth` | Configure authentication |
| `/marketo-instance` | Manage instances |
| `/marketo-leads` | Lead operations |
| `/marketo-campaigns` | Campaign management |
| `/marketo-programs` | Program operations |
| `/marketo-analytics` | Run reports |

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

- **Current**: 1.0.0
- **MCP Server**: 1.0.0
- **API Version**: REST v1

## License

MIT

## Support

- Repository: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace
- Issues: File via GitHub Issues
