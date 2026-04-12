---
description: Switch or list Attio workspaces
argument-hint: "[action] [workspace-name]"
---

# /attio-workspace

Manage and switch between configured Attio workspaces.

## Usage

```
/attio-workspace [action] [workspace-name]
```

## Actions

| Action | Description |
|--------|-------------|
| `list` | Show all configured workspaces |
| `switch [name]` | Set the active workspace |
| `current` | Show the currently active workspace |
| `info` | Detailed info for the active workspace |

## Examples

### List All Workspaces
```
/attio-workspace list
# Output:
#   * production  (active)
#     sandbox
#     staging
```

### Switch Workspace
```
/attio-workspace switch sandbox
# Output: Switched to workspace: sandbox
```

### Show Current Workspace
```
/attio-workspace current
# Output: Active workspace: production
```

### Get Detailed Workspace Info
```
/attio-workspace info
# Delegates to attio-workspace-discovery agent for full workspace metadata
```

## Workspace Configuration

Workspaces are stored in `workspaces/config.json`. Each entry includes:

- `name` — friendly identifier used with `/attio-workspace switch`
- `api_key` — the API token for this workspace
- `workspace_slug` — Attio workspace slug (from your URL)
- `active` — boolean indicating the current default

## Notes

- The `info` action delegates to the `attio-workspace-discovery` agent for full schema, member counts, and workspace metadata
- To add a new workspace, run `/attio-auth setup`
- Switching workspaces updates the active flag in `workspaces/config.json`
