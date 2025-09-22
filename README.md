# RevPal Agent System

A comprehensive Claude Code configuration for managing multi-platform releases across Salesforce, HubSpot, and custom applications.

## Overview

The RevPal Agent System uses specialized subagents for platform-specific operations and a principal engineer agent for orchestration. This system enables automated workflows, intelligent task routing, and cross-platform coordination.

> **Note**: As of September 2025, the platform-specific code has been reorganized from `platforms/` to `opspal-internal/` to better reflect the internal operations nature of these components.

## Agent Organization

Agents are organized by platform and scope to maintain clarity and ease of discovery:

### Directory Structure
```
.claude/agents/              # Core cross-platform agents (16 agents)
├── release-coordinator      # Release management
├── project-orchestrator     # Multi-repo coordination
├── sequential-planner       # Complex task planning
├── quality-control-analyzer # Quality analysis
├── gdrive-*                 # Google Drive operations
└── ...                      # Other core agents

opspal-internal/
├── SFDC/.claude/agents/     # Salesforce-specific agents (47 agents)
│   ├── sfdc-conflict-resolver
│   ├── sfdc-state-discovery
│   ├── sfdc-dependency-analyzer
│   ├── sfdc-merge-orchestrator
│   └── ...
│
└── HS/.claude/agents/       # HubSpot-specific agents (24 agents)
    ├── hubspot-workflow
    ├── hubspot-data
    └── ...
```

### Organization Principles
- **Core agents** (`.claude/agents/`): Cross-platform functionality and orchestration
- **Platform agents** (`opspal-internal/[PLATFORM]/.claude/agents/`): Platform-specific operations
- **User agents** (`~/.claude/agents/`): Personal customizations

See [`docs/AGENT_ORGANIZATION_PATTERN.md`](docs/AGENT_ORGANIZATION_PATTERN.md) for detailed organization guidelines.

## Quick Start

### Agent Discovery
```bash
# List all available agents
bash .claude/hooks/agent-discovery.sh

# Validate agent configuration
bash scripts/validate-agents.sh

# Test agent routing
node scripts/test-agent-routing.js
```

### Common Tasks

#### Release Management
Use `release-coordinator` for managing releases:
- Orchestrates end-to-end release process
- Delegates platform-specific tasks
- Enforces release checklists

#### Salesforce Operations
Platform-specific agents in `platforms/SFDC/.claude/agents/`:
- `sfdc-conflict-resolver` - Resolve deployment conflicts
- `sfdc-merge-orchestrator` - Merge fields and objects
- `sfdc-state-discovery` - Analyze org state
- `sfdc-dependency-analyzer` - Map dependencies

#### HubSpot Operations
Platform-specific agents in `platforms/HS/.claude/agents/`:
- `hubspot-workflow` - Manage workflows
- `hubspot-data` - Handle data operations
- `hubspot-property-manager` - Manage properties

## Configuration

### MCP Servers
Configure in `.mcp.json`:
```json
{
  "mcpServers": {
    "salesforce": { ... },
    "hubspot": { ... },
    "gdrive": { ... },
    "sequential_thinking": { ... }
  }
}
```

### Environment Variables
Required in `.env`:
```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX
SALESFORCE_ORG_ALIAS=production
HUBSPOT_PORTAL_ID=12345678
```

## Documentation

- [`CLAUDE.md`](CLAUDE.md) - Main project instructions and agent reference
- [`docs/AGENT_ORGANIZATION_PATTERN.md`](docs/AGENT_ORGANIZATION_PATTERN.md) - Agent organization guidelines
- [`docs/SEQUENTIAL_THINKING_GUIDE.md`](docs/SEQUENTIAL_THINKING_GUIDE.md) - Complex task planning
- [`.claude/AGENT_USAGE_EXAMPLES.md`](.claude/AGENT_USAGE_EXAMPLES.md) - Usage examples
- [`.claude/AGENT_CAPABILITY_MATRIX.md`](.claude/AGENT_CAPABILITY_MATRIX.md) - Agent capabilities

## Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
npm run test:salesforce
npm run test:hubspot
```

### Agent Validation
```bash
# Validate all agents
bash scripts/validate-agents.sh

# Test agent routing
node scripts/test-agent-routing.js

# Test specific agent
node scripts/test-agent-routing.js sfdc-conflict-resolver
```

## Contributing

### Adding New Agents

1. **Determine agent scope**:
   - Cross-platform → `.claude/agents/`
   - Salesforce-specific → `platforms/SFDC/.claude/agents/`
   - HubSpot-specific → `platforms/HS/.claude/agents/`

2. **Follow naming conventions**:
   - Use lowercase-hyphen format
   - Include platform prefix for platform-specific agents
   - Keep names descriptive but concise

3. **Create agent file** with YAML frontmatter:
```yaml
---
name: agent-name
model: sonnet
description: Brief description
tools: Tool1, Tool2, Tool3
---
```

4. **Test the agent**:
```bash
bash scripts/validate-agents.sh
node scripts/test-agent-routing.js agent-name
```

### Migration Guide
See [`docs/AGENT_MIGRATION_GUIDE.md`](docs/AGENT_MIGRATION_GUIDE.md) for instructions on moving agents between directories.

## Maintenance

### Regular Tasks
- **Daily**: Check error logs, verify backups
- **Weekly**: Update dependencies, run full test suite
- **Monthly**: Security audit, documentation review
- **Quarterly**: Agent audit and optimization

### Commands
- `/bootstrap` - Initialize or repair configuration
- `/ship-release` - Execute full release workflow
- `/status` - Check system health
- `/agents` - List available agents

## License

Proprietary - RevPal Internal Use Only

## Support

For issues or questions:
- Check documentation in `docs/`
- Run diagnostics: `claude doctor`
- Review logs in `.claude/logs/`

---
Last Updated: 2025-09-13
Version: 2.2.0