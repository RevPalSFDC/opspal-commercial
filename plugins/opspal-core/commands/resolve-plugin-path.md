---
name: resolve-plugin-path
description: Show resolved plugin installation paths for debugging MODULE_NOT_FOUND errors
argument-hint: "[list|validate|resolve-root <plugin>]"
allowed-tools:
  - Bash
tags:
  - diagnostics
  - troubleshooting
  - paths
---

# Resolve Plugin Path

Show where plugins are actually installed. Use this when scripts fail with `MODULE_NOT_FOUND` or `Cannot find module` errors.

## EXECUTE IMMEDIATELY

```bash
# Source shared path resolver
RESOLVE_SCRIPT=""
for _candidate in \
  "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/resolve-script.sh}" \
  "$HOME/.claude/plugins/cache/opspal-commercial/opspal-core"/*/scripts/resolve-script.sh \
  "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts/resolve-script.sh \
  "$PWD/plugins/opspal-core/scripts/resolve-script.sh" \
  "$PWD/.claude-plugins/opspal-core/scripts/resolve-script.sh"; do
  [ -n "$_candidate" ] && [ -f "$_candidate" ] && RESOLVE_SCRIPT="$_candidate" && break
done
if [ -z "$RESOLVE_SCRIPT" ]; then echo "ERROR: Cannot locate opspal-core resolve-script.sh"; exit 1; fi
source "$RESOLVE_SCRIPT"

PATH_RESOLVER=$(find_script "unified-path-resolver.js")
if [ -z "$PATH_RESOLVER" ]; then
  echo "ERROR: unified-path-resolver.js not found"
  echo ""
  echo "Searched locations:"
  echo "  - CLAUDE_PLUGIN_ROOT: ${CLAUDE_PLUGIN_ROOT:-not set}"
  echo "  - PWD/plugins/opspal-core/scripts/lib/"
  echo "  - PWD/.claude-plugins/opspal-core/scripts/lib/"
  echo "  - ~/.claude/plugins/marketplaces/*/plugins/opspal-core/scripts/lib/"
  echo "  - ~/.claude/plugins/cache/*/opspal-core/*/scripts/lib/"
  exit 1
fi

SUBCMD="${1:-list}"
shift 2>/dev/null || true

node "$PATH_RESOLVER" "$SUBCMD" "$@"
```

After execution, display the results to the user.

## Usage

```bash
# List all discovered plugin paths
/resolve-plugin-path list

# Validate all plugins are reachable
/resolve-plugin-path validate

# Find root of a specific plugin
/resolve-plugin-path resolve-root opspal-core
```

## When to Use

- Scripts fail with `MODULE_NOT_FOUND` or `ENOENT`
- After installing/updating plugins from marketplace
- Debugging hook registration failures
- Verifying plugin is correctly installed

## Output Example

```
Plugin Path Resolution
======================

Workspace paths:
  plugins/opspal-core          -> /home/user/project/plugins/opspal-core
  plugins/opspal-salesforce    -> /home/user/project/plugins/opspal-salesforce

Cache paths:
  opspal-core/2.39.1           -> ~/.claude/plugins/cache/opspal-commercial/opspal-core/2.39.1

Environment:
  CLAUDE_PLUGIN_ROOT: /home/user/project/plugins/opspal-core
  PWD: /home/user/project
```

## Related Commands

- `/pluginupdate` - Validate all plugin configurations
- `/checkdependencies` - Verify npm dependencies
- `/plugindr` - Diagnose plugin health issues
