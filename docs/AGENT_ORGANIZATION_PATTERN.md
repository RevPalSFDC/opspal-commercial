# Agent Organization Pattern

## Overview
This document defines the standard organization pattern for Claude Code agents across the RevPal system. Agents are organized by scope and platform to maintain clarity and ease of discovery.

## Directory Structure

```
RevPal/Agents/
├── .claude/agents/              # Core cross-platform agents
│   ├── release-coordinator.md   # Release management
│   ├── project-orchestrator.md  # Multi-repo coordination
│   ├── sequential-planner.md    # Complex task planning
│   ├── quality-control-analyzer.md # Quality analysis
│   ├── gdrive-*.md              # Google Drive operations
│   ├── router-doctor.md         # Agent routing issues
│   ├── mcp-guardian.md          # MCP validation
│   └── ...                      # Other core agents
│
├── platforms/
│   ├── SFDC/.claude/agents/     # Salesforce-specific agents
│   │   ├── sfdc-conflict-resolver.md
│   │   ├── sfdc-state-discovery.md
│   │   ├── sfdc-dependency-analyzer.md
│   │   ├── sfdc-merge-orchestrator.md
│   │   └── ...                  # Other SFDC agents
│   │
│   └── HS/.claude/agents/       # HubSpot-specific agents
│       ├── hubspot-workflow.md
│       ├── hubspot-data.md
│       └── ...                  # Other HubSpot agents
```

## Organization Principles

### 1. Core Agents (`.claude/agents/`)
Place agents here if they:
- Work across multiple platforms
- Provide system-wide functionality
- Orchestrate other agents
- Handle infrastructure concerns
- Don't depend on platform-specific tools

Examples:
- `release-coordinator` - Manages releases across all platforms
- `project-orchestrator` - Coordinates multi-repo work
- `sequential-planner` - Plans complex tasks using Sequential Thinking MCP
- `quality-control-analyzer` - Analyzes code quality across projects

### 2. Platform-Specific Agents (`platforms/[PLATFORM]/.claude/agents/`)
Place agents here if they:
- Only work with one platform (Salesforce, HubSpot, etc.)
- Require platform-specific MCP tools (mcp_salesforce, mcp_hubspot)
- Implement platform-specific business logic
- Handle platform-specific data operations

Examples:
- `sfdc-conflict-resolver` - Resolves Salesforce metadata conflicts
- `hubspot-workflow` - Manages HubSpot workflows
- `sfdc-merge-orchestrator` - Orchestrates Salesforce field merges

### 3. Naming Conventions

#### Format Rules
- **Case**: Always use lowercase-hyphen naming (kebab-case)
- **Prefix**: Platform-specific agents should have platform prefix
- **Extension**: Always `.md` with YAML frontmatter
- **Length**: Keep names descriptive but concise

#### Examples
✅ Good names:
- `sfdc-conflict-resolver`
- `hubspot-workflow-builder`
- `release-coordinator`
- `gdrive-document-manager`

❌ Bad names:
- `SFDC_Conflict_Resolver` (wrong case and separator)
- `conflict-resolver` (missing platform prefix for platform-specific agent)
- `sfdc-agent` (too generic)
- `salesforce-metadata-conflict-resolution-and-deployment-agent` (too long)

## Agent Discovery

Claude Code automatically discovers agents in all these locations:
1. `.claude/agents/` in the project root
2. `platforms/*/claude/agents/` in platform subdirectories
3. `~/.claude/agents/` in the user's home directory (user-wide agents)

Priority order (highest to lowest):
1. Project-specific agents (`.claude/agents/`)
2. Platform-specific agents (`platforms/*/claude/agents/`)
3. User-wide agents (`~/.claude/agents/`)

## Migration Guide

When moving agents to their proper location:

### Step 1: Identify Agent Scope
Ask these questions:
- Does it only work with one platform? → Move to `platforms/[PLATFORM]/`
- Does it orchestrate multiple platforms? → Keep in `.claude/agents/`
- Is it a utility used everywhere? → Keep in `.claude/agents/`

### Step 2: Move the Agent File
```bash
# Example: Moving SFDC agents
cp .claude/agents/sfdc-*.md platforms/SFDC/.claude/agents/
rm .claude/agents/sfdc-*.md
```

### Step 3: Update References
Update these files if they reference the moved agents:
- Main `CLAUDE.md` - Add location notes
- `.claude/hooks/agent-discovery.sh` - Update agent listings
- Documentation files (`AGENT_USAGE_EXAMPLES.md`, etc.)

### Step 4: Verify Discovery
```bash
# Run the agent discovery hook
bash .claude/hooks/agent-discovery.sh

# Validate all agents
bash scripts/validate-agents.sh
```

## Tool Dependencies

Agents may require specific MCP tools. These are configured project-wide in `.mcp.json`:

```json
{
  "mcpServers": {
    "salesforce": {
      // SFDC agents use this
    },
    "hubspot": {
      // HubSpot agents use this
    },
    "gdrive": {
      // Google Drive agents use this
    }
  }
}
```

Even though agents are in different directories, they all have access to the same MCP tools.

## Best Practices

### DO:
- ✅ Keep platform-specific agents with their platform code
- ✅ Use consistent naming with platform prefixes
- ✅ Document agent location in main CLAUDE.md
- ✅ Test agent discovery after moving agents
- ✅ Keep core orchestration agents in the main directory

### DON'T:
- ❌ Mix platform-specific agents in the main directory
- ❌ Create deeply nested agent directories
- ❌ Use different naming conventions per platform
- ❌ Hardcode agent paths in scripts
- ❌ Duplicate agents across locations

## Validation

Use these commands to validate your agent organization:

```bash
# Count agents by location
echo "Main agents: $(ls .claude/agents/*.md 2>/dev/null | wc -l)"
echo "SFDC agents: $(ls platforms/SFDC/.claude/agents/*.md 2>/dev/null | wc -l)"
echo "HubSpot agents: $(ls platforms/HS/.claude/agents/*.md 2>/dev/null | wc -l)"

# Check for misplaced agents
echo "Potential misplaced SFDC agents in main:"
ls .claude/agents/ | grep -i sfdc

echo "Potential misplaced HubSpot agents in main:"
ls .claude/agents/ | grep -i hubspot

# Run validation script
bash scripts/validate-agents.sh
```

## Cross-References

Agents can reference each other regardless of location. Claude Code's agent discovery handles finding agents across all directories.

Example workflow that uses agents from different locations:
```yaml
stages:
  - agent: project-orchestrator      # From .claude/agents/
  - agent: sfdc-conflict-resolver    # From platforms/SFDC/.claude/agents/
  - agent: hubspot-workflow-builder  # From platforms/HS/.claude/agents/
```

## Future Considerations

As the system grows, consider:
1. Creating subdirectories within platform agents for categories
2. Implementing agent versioning for backward compatibility
3. Adding agent dependency management
4. Creating agent templates for common patterns

---
Last Updated: 2025-09-13
Purpose: Define standard agent organization pattern for the RevPal system