# Agent Registry Usage Guide

## Overview

The agent registry system (`agents.roster.json`) provides a centralized way for Claude Code to discover and access agents across all platform subdirectories, solving the limitation where Claude Code only sees agents in the current `.claude/agents/` directory.

## Key Files

### 1. Registry File
**Location**: `platforms/.claude/agents.roster.json`

This JSON file contains:
- Complete catalog of all 131+ agents across 5 categories
- Paths to agent directories (relative to platforms/)
- Key agents for each category
- Delegation rules for routing tasks
- Usage statistics and validation data

### 2. Discovery Script
**Location**: `platforms/scripts/discover-agents.py`

Python script to:
- List all agents by category
- Find specific agents by name
- Validate registry against actual files
- Generate reports on agent availability

## Usage

### For Claude Code

When running Claude Code from the `platforms/` directory:

1. **Agent Access**: All 131 agents are now discoverable via the registry
2. **Task Invocation**: Use the Task tool with any agent name from the registry
3. **Auto-routing**: Keywords in queries automatically route to appropriate agents

### Command Examples

```bash
# List all agents
python3 scripts/discover-agents.py list

# List agents in specific category
python3 scripts/discover-agents.py list --category salesforce

# Find a specific agent
python3 scripts/discover-agents.py find --name sfdc-metadata-manager

# Validate registry
python3 scripts/discover-agents.py validate

# Verbose output
python3 scripts/discover-agents.py list --verbose
```

### Task Tool Usage

From Claude Code, you can now invoke ANY agent regardless of its location:

```yaml
# Salesforce agent (in SFDC/.claude/agents/)
Task: sfdc-metadata-manager
Description: "Deploy Account custom fields"

# HubSpot agent (in HS/.claude/agents/)
Task: hubspot-workflow-builder
Description: "Create lead nurture workflow"

# Unified agent (in platforms/.claude/agents/)
Task: unified-orchestrator
Description: "Coordinate Salesforce and HubSpot sync"

# Cross-platform ops agent (in cross-platform-ops/.claude/agents/)
Task: field-mapping-specialist
Description: "Map fields between platforms"
```

## Registry Structure

### Categories

1. **unified** (25 agents) - Cross-platform orchestration
2. **salesforce** (44 agents) - Salesforce-specific operations
3. **hubspot** (34 agents) - HubSpot-specific operations
4. **cross_platform_ops** (13 agents) - Bulk operations
5. **parent_project** (15 agents) - Core RevPal agents

### Key Agents by Category

#### Unified Agents
- `unified-orchestrator` - Master cross-platform coordinator
- `unified-reporting-aggregator` - Combined analytics
- `unified-data-quality-validator` - Data consistency
- `platform-instance-manager` - Environment management
- `sfdc-hubspot-bridge` - Bidirectional sync

#### Salesforce Agents
- `sfdc-orchestrator` - Salesforce operations coordinator
- `sfdc-metadata-manager` - Metadata operations
- `sfdc-apex-developer` - Apex development
- `sfdc-conflict-resolver` - Deployment conflict resolution
- `sfdc-merge-orchestrator` - Field/object merging

#### HubSpot Agents
- `hubspot-orchestrator` - HubSpot operations coordinator
- `hubspot-workflow-builder` - Workflow automation
- `hubspot-contact-manager` - Contact operations
- `hubspot-pipeline-manager` - Deal pipeline management
- `hubspot-analytics-reporter` - Marketing analytics

## Delegation Rules

The registry includes automatic delegation based on keywords:

| Keywords | Routes To |
|----------|-----------|
| "both platforms", "coordinate", "sync" | unified-orchestrator |
| "salesforce", "sfdc", "apex", "metadata" | sfdc-orchestrator |
| "hubspot", "workflow", "portal", "marketing" | hubspot-orchestrator |
| "bulk", "import", "export", "migration" | cross-platform-orchestrator |
| "release", "deploy", "production" | release-coordinator |

## Maintenance

### Updating the Registry

When agents are added or removed:

```bash
# Manual update - edit agents.roster.json
vi .claude/agents.roster.json

# Update counts and key agents
# Validate after changes
python3 scripts/discover-agents.py validate
```

### Registry Validation

The validation command checks:
- Agent counts match actual files
- Key agents exist
- Paths are valid
- No missing critical agents

```bash
# Run validation
python3 scripts/discover-agents.py validate

# Example output
✅ unified: Expected 26, Found 25
⚠️ salesforce: Expected 52, Found 44
✅ hubspot: Expected 34, Found 34
```

## Benefits

1. **Complete Discovery**: Access all 131+ agents from any working directory
2. **No Symlinks Required**: Registry-based discovery without filesystem tricks
3. **Organized Structure**: Clear categorization of agents by platform
4. **Auto-routing**: Intelligent delegation based on task keywords
5. **Validation**: Built-in checking for registry accuracy
6. **Documentation**: Self-documenting agent catalog

## Troubleshooting

### Agent Not Found
- Run `python3 scripts/discover-agents.py find --name <agent-name>`
- Check if agent exists in expected category
- Validate registry is up to date

### Registry Out of Sync
- Run validation: `python3 scripts/discover-agents.py validate`
- Update counts in agents.roster.json
- Check for new/deleted agent files

### Claude Code Not Finding Agents
- Ensure working directory is `platforms/`
- Check `.claude/agents.roster.json` exists
- Verify paths in registry are relative to platforms/

## Future Enhancements

1. **Auto-update Script**: Automatically refresh registry from filesystem
2. **CI Integration**: Validate registry in CI/CD pipeline
3. **Dynamic Loading**: Claude Code native support for registry
4. **Instance-specific Registries**: Different agent sets per instance
5. **Agent Dependencies**: Track which agents depend on others

---

*Registry Version: 2.0.0*
*Last Updated: 2025-09-22*
*Total Agents: 131 across 5 categories*