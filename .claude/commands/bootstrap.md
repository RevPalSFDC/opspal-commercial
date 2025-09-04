---
description: Initialize or repair Claude project configuration deterministically
allowed-tools: Bash, Read, Write, Grep, Glob
---

# Bootstrap Command

Initializes or repairs the Claude project configuration to ensure all required components are present and properly configured.

## What This Command Does

1. **Verifies Project Structure**:
   - Checks for required directories (.claude/agents, .claude/commands, .claude/hooks)
   - Creates missing directories
   - Ensures proper permissions

2. **Creates Missing Agents**:
   - Checks for core agents (release-coordinator, claudesfdc, claudehubspot, principal-engineer)
   - Creates any missing agent files from templates
   - Validates agent configurations

3. **Configures MCP Servers**:
   - Adds HubSpot MCP server if missing
   - Adds Salesforce MCP server if missing
   - Configures error logging server
   - Sets up model proxy (optional)

4. **Sets Up Hooks**:
   - Creates validation hook for session start
   - Creates Slack notification hook
   - Sets proper permissions on hook scripts

5. **Environment Check**:
   - Verifies ripgrep installation
   - Checks for Slack webhook configuration
   - Validates git repository
   - Tests MCP server connections

## Usage

Run this command when:
- Setting up a new Claude project
- Agents appear to be "missing"
- After cloning the repository
- MCP servers aren't responding
- Hooks aren't triggering properly

## Recovery Actions

### For Missing Agents
Creates the following agents if they don't exist:
- `.claude/agents/release-coordinator.md`
- `.claude/agents/claudesfdc.md`
- `.claude/agents/claudehubspot.md`
- `.claude/agents/principal-engineer.md`

### For Missing MCP Servers
Re-adds the following servers with project scope:
```bash
claude mcp add --scope project hubspot -- npx -y @hubspot/mcp-server
claude mcp add --scope project salesforce-dx -- npx -y @salesforce/mcp-server-sfdx
```

### For Missing Configuration
- Creates `.claude/settings.json` with default permissions
- Creates `.mcp.json` with standard servers
- Creates `CLAUDE.md` with project guidelines

## Environment Setup

After running bootstrap, set these environment variables:
```bash
export SLACK_WEBHOOK_URL='https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
export SALESFORCE_ORG_ALIAS='production'
export HUBSPOT_ACCESS_TOKEN='your-token'
export USE_BUILTIN_RIPGREP=0
```

## Validation Steps

After bootstrap completes:
1. Run `/status` to check system health
2. Run `/agents` to verify agent availability
3. Run `/mcp` to confirm MCP server status
4. Test Slack webhook with a test notification
5. Verify git repository is properly configured

## Error Handling

If bootstrap fails:
1. Check error messages for specific issues
2. Verify you have proper permissions in the directory
3. Ensure ripgrep is installed (`brew install ripgrep` or `apt-get install ripgrep`)
4. Check that git is initialized in the repository
5. Manually set required environment variables

## Important Notes

- This command is idempotent - safe to run multiple times
- Existing files are not overwritten
- All changes are logged for audit purposes
- Requires appropriate file system permissions
- Should be run from the project root directory