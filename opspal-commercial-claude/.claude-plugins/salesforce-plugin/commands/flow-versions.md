---
description: Show all versions of a Salesforce Flow with status, activation info, and version comparison
---

# Flow Version Manager

This command helps you view and manage Flow versions in your Salesforce org, addressing the common issue of agents modifying wrong Flow versions without proper version awareness.

## What this does:
1. Lists all versions of a specified Flow with status indicators
2. Shows which version is currently active
3. Compares versions to identify changes
4. Supports activation and deactivation of specific versions

## Usage:

```bash
/flow-versions <flow-developer-name> --org <org-alias>
```

## Commands:

| Command | Description |
|---------|-------------|
| `listVersions` | List all versions with status |
| `getActiveVersion` | Get currently active version |
| `getLatestVersion` | Get latest version (may not be active) |
| `compareVersions` | Compare two versions |
| `activateVersion` | Activate a specific version |
| `deactivateFlow` | Deactivate all versions |
| `cleanupVersions` | Remove old versions (default: keep 5) |

## Script Location:

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js <command> <flow-name> <org-alias> [options]
```

## Options:
- `--verbose` - Detailed output
- `--dry-run` - Simulate without executing
- `--keep <N>` - Number of versions to keep (cleanupVersions)

## Example:

```bash
# List all versions
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js listVersions Account_Update_Handler peregrine-production --verbose

# Activate version 5
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js activateVersion Account_Update_Handler 5 peregrine-production

# Compare versions
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js compareVersions Account_Update_Handler 3 5 peregrine-production
```

## Related:
- `/activate-flows` - Activate flows with troubleshooting
- `/flow-diagnose` - Diagnose flow issues
- `/flow-preflight` - Pre-deployment validation
