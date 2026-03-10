# OpsPal Plugin Marketplace

## Repository Stats

| Metric | Count |
|--------|-------|
| Plugins | 9 |
| Agents | 278 |
| Commands | 245 |
| Skills | 154 |
| Hooks | 155 |
| Scripts | 1766 |


## Quick Stats

| Metric | Count |
|--------|-------|
| Plugins | 9 |
| Agents | 278 |
| Commands | 245 |
| Skills | 154 |
| Hooks | 155 |
| Scripts | 1766 |


## Documentation System

Comprehensive plugin suite docs are generated and versioned in-repo:

- `AGENTS.md` - Authoritative maintainer + developer guide with runtime plugin registry
- `docs/PLUGIN_SUITE_CATALOG.md` - Suite-level maintenance/development catalog
- `docs/PLUGIN_SUITE_CATALOG.json` - Machine-readable inventory for automation
- `docs/PLUGIN_DOCUMENTATION_MAINTENANCE.md` - Maintenance process and CI policy

```bash
# Refresh generated docs
npm run docs:generate

# Fail if generated docs are stale
npm run docs:check

# Optional: enforce docs check at commit time
git config core.hooksPath .githooks
```

## ⚠️ Migration Notice: Plugin Naming Standardization

**As of v3.68.0 (January 2026)**, all plugins have been renamed to use the `opspal-` prefix for consistent branding:

| Old Name | New Name |
|----------|----------|
| `salesforce-plugin` | `opspal-salesforce` |
| `hubspot-plugin` | `opspal-hubspot` |
| `marketo-plugin` | `opspal-marketo` |
| `gtm-planning-plugin` | `opspal-gtm-planning` |
| `monday-plugin` | `opspal-monday` |
| `data-hygiene-plugin` | `opspal-data-hygiene` |
| `ai-consult-plugin` | `opspal-ai-consult` |
| `opspal-core` | *(unchanged)* |

**Update your references:**
- Task routing: `salesforce-plugin:agent-name` → `opspal-salesforce:agent-name`
- Imports: `@import salesforce-plugin/...` → `@import opspal-salesforce/...`

---

## Plugins

### OpsPal Salesforce (94 agents)
Comprehensive Salesforce automation including CPQ/Q2C assessments, RevOps auditing, Flow management, permission orchestration, report/dashboard creation, territory management, and data operations.

**Key Capabilities:**
- Metadata management (objects, fields, validation rules)
- Security & compliance (profiles, permission sets, FLS)
- Data operations (imports, exports, bulk operations)
- CPQ & RevOps assessments
- Deployment automation with conflict resolution
- Apex development & testing
- Flow automation & activation
- Report & dashboard creation

### OpsPal HubSpot (59 agents)
Full HubSpot CRM capabilities: workflow automation, property management, analytics, reporting, and CRM operations.

**Key Capabilities:**
- Workflow automation and orchestration
- Contact, company, and deal management
- Pipeline and sales operations
- Marketing automation
- Analytics and reporting
- Portal administration

### OpsPal Marketo (30 agents)
Marketing automation: campaign management, lead scoring, email automation, and marketing analytics.

**Key Capabilities:**
- Campaign management and execution
- Lead scoring and nurturing
- Email automation and deliverability
- Marketing analytics and reporting
- Program performance analysis

### OpsPal Core (65 agents)
Unified operations: diagram generation (Mermaid, ERD), PDF/PPTX report generation, data quality validation, and task graph management.

**Key Capabilities:**
- Diagram generation (Mermaid, ERD, flowcharts)
- PDF and PPTX report generation
- Data quality validation
- Task graph management
- Unified orchestration across platforms

### OpsPal GTM Planning (12 agents)
Go-to-market planning: market analysis, launch planning, and competitive intelligence.

**Key Capabilities:**
- Territory design with fairness validation
- Quota modeling with Monte Carlo simulations
- Compensation planning
- Attribution governance
- Strategy planning

### OpsPal Monday (6 agents)
Monday.com integration: project management, board synchronization, and task automation.

**Key Capabilities:**
- Board management
- Task synchronization
- Project tracking
- Automation workflows

### OpsPal Data Hygiene (2 agents)
Data quality: deduplication workflows and cross-platform data validation.

**Key Capabilities:**
- Deduplication workflows
- Data quality validation
- Cross-platform consistency

### OpsPal AI Consult (2 agents)
Cross-model AI consultation and analysis.

**Key Capabilities:**
- Multi-model consultation
- AI-assisted analysis

## Getting Started

### Prerequisites
- Claude Code CLI (latest version via [native installer](https://docs.anthropic.com/en/docs/claude-code/getting-started) - npm install is deprecated)
- Node.js 18+
- npm 9+

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/RevPalSFDC/opspal-internal-plugins.git
   cd opspal-internal-plugins
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

### Preflight Checks

Run these before using MCP-backed features:

```bash
# 1. Load environment variables
set -a && source .env && set +a

# 2. Test MCP connections
./scripts/test-mcp-connections.sh

# 3. Verify MCP servers
claude mcp list
```

### Plugin Activation

Plugins are automatically loaded by Claude Code. Each plugin's agents become available based on the `CLAUDE.md` configuration.

```bash
# List installed plugins
/plugin list

# List all available agents
/agents

# Check dependencies
/checkdependencies
```

## Updating Plugins

### Enable Auto-Updates (Recommended)

Set up automatic updates to stay current with the latest agents and features:

```bash
# Navigate to your plugin installation
cd ~/.claude/plugins/marketplaces/revpal-internal-plugins

# Pull latest changes
git pull origin main

# Or set up a cron job for automatic daily updates (optional)
# Add to crontab: 0 6 * * * cd ~/.claude/plugins/marketplaces/revpal-internal-plugins && git pull origin main
```

### Post-Update Commands

After updating, run these commands to ensure everything is configured correctly:

```bash
# 1. Sync your CLAUDE.md with latest plugin versions and agent counts
/sync-claudemd

# 2. Run comprehensive post-update validation and auto-fix issues
/pluginupdate --fix

# 3. Check and install any new dependencies
/checkdependencies --install
```

### What Each Command Does

| Command | Purpose |
|---------|---------|
| `/sync-claudemd` | Updates CLAUDE.md with latest plugin versions, agent counts, and command references |
| `/pluginupdate --fix` | Validates dependencies, MCP servers, hooks, cache dirs, and auto-fixes issues |
| `/checkdependencies --install` | Checks npm packages, CLI tools, system utilities and installs missing ones |

### Troubleshooting Updates

If you encounter issues after an update:

```bash
# Run validation without making changes first
/pluginupdate --check-only

# Run with verbose output for debugging
/pluginupdate --verbose

# Check specific plugin
/pluginupdate --plugin salesforce-plugin --verbose
```

### Version Pinning (Enterprise)

For enterprise deployments requiring exact version reproducibility, Claude Code v2.1.14+ supports pinning plugins to specific git commit SHAs:

```json
// In your marketplace configuration or plugin install command
{
  "name": "salesforce-plugin",
  "source": "RevPalSFDC/opspal-plugin-internal-marketplace#a1b2c3d4e5f6",
  "version": "3.67.0"
}
```

**Use cases:**
- Compliance requirements for reproducible builds
- Staged rollouts across multiple environments
- Rollback capability to known-good versions

**Getting the current SHA:**
```bash
cd ~/.claude/plugins/marketplaces/revpal-internal-plugins
git rev-parse HEAD  # Returns current commit SHA
```

## Documentation

- [Routing Guide](docs/routing-help.md) - Agent routing and task delegation
- [Plugin Development Standards](docs/PLUGIN_DEVELOPMENT_STANDARDS.md) - Creating new plugins
- [MCP Usage Guide](docs/MCP_USAGE_GUIDE.md) - MCP server configuration
- [Troubleshooting](docs/TROUBLESHOOTING_PLUGIN_LOADING.md) - Common issues and solutions

## Architecture

The marketplace uses a modular plugin architecture where each plugin contains:

```
plugins/<plugin-name>/        # Distributable plugins
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── agents/                   # Specialized AI agents
├── commands/                 # Slash commands
├── hooks/                    # Claude Code hooks
├── scripts/                  # Utility scripts
├── config/                   # Configuration files
└── CLAUDE.md                 # Plugin configuration

.claude-plugins -> plugins/   # Symlink for Claude Code discovery
```

See the main [CLAUDE.md](CLAUDE.md) for routing rules and agent delegation.

## Session Reflection

Both Salesforce and HubSpot plugins include the `/reflect` command for continuous improvement:

```bash
# Run at end of session
/reflect

# Benefits:
# - Analyzes session for errors and patterns
# - Generates improvement playbooks
# - Submits to centralized database for trend analysis
# - Enables collective intelligence across users
```

## Contributing

1. Follow the [Plugin Development Standards](docs/PLUGIN_DEVELOPMENT_STANDARDS.md)
2. Ensure all agents include proper routing keywords
3. Validate plugin manifest:
   ```bash
   claude plugin validate plugins/<plugin>/.claude-plugin/plugin.json
   ```
4. Submit PR with clear description of changes

## Support

- **Issues**: https://github.com/RevPalSFDC/opspal-internal-plugins/issues
- **Documentation**: See `docs/` directory

## License

Proprietary - Internal Use Only

---

**Author**: RevPal Engineering
**Repository**: https://github.com/RevPalSFDC/opspal-internal-plugins
