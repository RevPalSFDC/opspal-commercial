---
name: asana-update
description: "[REDIRECTS TO opspal-core] Update Asana tasks based on local work"
argument-hint: "[options]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - mcp__asana__asana_search_tasks
  - mcp__asana__asana_create_task
  - mcp__asana__asana_update_task
  - mcp__asana__asana_get_task
  - mcp__asana__asana_create_task_story
thinking-mode: enabled
---

# Update Asana Tasks (Redirect)

**This command has been consolidated into opspal-core for unified Asana integration across all plugins.**

## How to Use

The `/asana-update` command is now provided by `opspal-core`. If you have both plugins installed, use:

```bash
/opspal-core:asana-update
```

Or simply run `/asana-update` - Claude will automatically use the opspal-core version if available.

## Why the Change?

The Asana integration has been consolidated to:
1. **Platform-agnostic** - Works with Salesforce, HubSpot, Marketo, or any project
2. **Single source of truth** - One command for all plugin types
3. **Consistent behavior** - Same work detection patterns everywhere
4. **Auto-detection** - Automatically detects platform context from environment

## Centralized Features

The opspal-core version provides:
- Git-based work detection (commits, modified files)
- File-based detection (recent modifications)
- Platform-specific detection patterns:
  - Salesforce: Apex, Flow, metadata changes
  - HubSpot: Workflow, property changes
  - Marketo: Program, campaign changes
- Task matching and creation
- Sync history tracking

## Full Documentation

See the full `/asana-update` documentation in:
- `plugins/opspal-core/commands/asana-update.md`

---

## Legacy Behavior (For Backwards Compatibility)

If opspal-core is not available, the agent should:

1. Load `.asana-links.json` from current directory
2. Analyze local work (git commits, file changes)
3. Search linked Asana projects for matching tasks
4. Update existing tasks or create new ones
5. Track sync in `.asana-links.json`

### Prerequisites

- `.asana-links.json` must exist (created by `/asana-link`)
- `ASANA_ACCESS_TOKEN` must be configured
