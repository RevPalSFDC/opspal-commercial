---
name: asana-link
description: "[REDIRECTS TO opspal-core] Link Asana project(s) to current directory"
argument-hint: "[options]"
allowed-tools:
  - Read
  - Write
  - Bash
  - mcp__asana__asana_list_workspaces
  - mcp__asana__asana_search_projects
  - mcp__asana__asana_get_project
thinking-mode: enabled
---

# Link Asana Projects (Redirect)

**This command has been consolidated into opspal-core for unified Asana integration across all plugins.**

## How to Use

The `/asana-link` command is now provided by `opspal-core`. If you have both plugins installed, use:

```bash
/opspal-core:asana-link
```

Or simply run `/asana-link` - Claude will automatically use the opspal-core version if available.

## Why the Change?

The Asana integration has been consolidated to:
1. **Platform-agnostic** - Works with Salesforce, HubSpot, Marketo, or any project
2. **Single source of truth** - One command for all plugin types
3. **Consistent behavior** - Same `.asana-links.json` format everywhere
4. **Auto-detection** - Automatically detects platform context (SF org, HS portal, etc.)

## Centralized Features

The opspal-core version provides:
- Workspace and project discovery
- Multi-project linking
- Auto-detection of Salesforce org from `.sf/` or `SF_TARGET_ORG`
- Auto-detection of HubSpot portal from `.env`
- Platform-agnostic configuration format

## Full Documentation

See the full `/asana-link` documentation in:
- `plugins/opspal-core/commands/asana-link.md`

---

## Legacy Behavior (For Backwards Compatibility)

If opspal-core is not available, the agent should:

1. List available Asana workspaces
2. Search for projects matching user criteria
3. Create `.asana-links.json` with selected projects
4. Include Salesforce org context if available

### Platform Context Detection

```bash
# Salesforce org detection
if [ -d ".sf" ] || [ -f "sfdx-project.json" ]; then
    PLATFORM_TYPE="salesforce"
    INSTANCE_NAME=$(sf config get target-org --json 2>/dev/null | jq -r '.result[0].value // empty')
fi
```
