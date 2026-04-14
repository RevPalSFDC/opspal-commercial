#!/usr/bin/env bash
# STATUS: SUPERSEDED — absorbed by a registered dispatcher or consolidated hook

# Pre-Session Path Validator Hook
#
# Validates plugin paths at session start to prevent path resolution issues.
# Runs early in the session to ensure all plugin paths are resolvable and
# exports environment variables for consistent path access.
#
# Trigger: SessionStart
# Behavior: Validates installed plugins, exports resolved paths, warns on issues
#
# @version 1.0.0

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$SCRIPT_DIR")}"
HOOK_INPUT=""
SESSION_CWD="${CLAUDE_PROJECT_DIR:-}"

if [ ! -t 0 ]; then
  HOOK_INPUT=$(cat 2>/dev/null || true)
fi

if [ -n "$HOOK_INPUT" ] && command -v jq >/dev/null 2>&1; then
  SESSION_CWD="${SESSION_CWD:-$(printf '%s' "$HOOK_INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")}"
fi

if [ -z "$SESSION_CWD" ] || [ ! -d "$SESSION_CWD" ]; then
  echo "[pre-session-path-validator] INFO: no session workspace context, skipping" >&2
  exit 0
fi

if [ ! -d "$SESSION_CWD/.claude" ] && [ ! -d "$SESSION_CWD/.claude-plugins" ] && [ ! -d "$SESSION_CWD/plugins" ]; then
  echo "[pre-session-path-validator] INFO: no Claude workspace markers in $SESSION_CWD, skipping" >&2
  exit 0
fi

# Find the unified path resolver
UNIFIED_RESOLVER=""
find_resolver() {
  local candidates=(
    "$PLUGIN_ROOT/scripts/lib/unified-path-resolver.js"
    "$SCRIPT_DIR/../scripts/lib/unified-path-resolver.js"
    "$(pwd)/plugins/opspal-core/scripts/lib/unified-path-resolver.js"
    "$(pwd)/.claude-plugins/opspal-core/scripts/lib/unified-path-resolver.js"
  )

  for candidate in "${candidates[@]}"; do
    if [ -f "$candidate" ]; then
      UNIFIED_RESOLVER="$candidate"
      return 0
    fi
  done

  return 1
}

# Find the shell helper
SHELL_HELPER=""
find_shell_helper() {
  local candidates=(
    "$PLUGIN_ROOT/scripts/resolve-plugin-path.sh"
    "$SCRIPT_DIR/../scripts/resolve-plugin-path.sh"
    "$(pwd)/plugins/opspal-core/scripts/resolve-plugin-path.sh"
  )

  for candidate in "${candidates[@]}"; do
    if [ -f "$candidate" ]; then
      SHELL_HELPER="$candidate"
      return 0
    fi
  done

  return 1
}

# Validate plugin structure
validate_plugin() {
  local plugin_path="$1"
  local plugin_name="$2"
  local issues=()

  # Check expected directories
  local expected_dirs=("scripts" "agents")
  for dir in "${expected_dirs[@]}"; do
    if [ ! -d "$plugin_path/$dir" ]; then
      issues+=("Missing $dir directory")
    fi
  done

  # Check for manifest
  if [ ! -f "$plugin_path/.claude-plugin/manifest.json" ] && [ ! -f "$plugin_path/package.json" ]; then
    issues+=("No manifest.json or package.json found")
  fi

  if [ ${#issues[@]} -gt 0 ]; then
    echo "⚠️  $plugin_name: ${issues[*]}" >&2
    return 1
  fi

  return 0
}

# Main validation logic
main() {
  local validation_passed=true
  local warnings=()

  # Try to find the resolver
  if ! find_resolver; then
    echo "⚠️  Plugin path resolver not found - path resolution may be unreliable" >&2
    # Don't fail, just warn
    exit 0
  fi

  # Try to find shell helper
  find_shell_helper

  # Get list of installed plugins
  local plugins_json
  plugins_json=$(node "$UNIFIED_RESOLVER" list 2>&1) || true

  if [ -z "$plugins_json" ] || echo "$plugins_json" | grep -q "No plugins found"; then
    echo "ℹ️  No plugins found for path validation" >&2
    exit 0
  fi

  # Export all plugin paths
  local export_output
  export_output=$(node "$UNIFIED_RESOLVER" export-all 2>&1) || true

  if [ -n "$export_output" ]; then
    # Output the exports so they can be evaluated by the parent shell
    echo "$export_output"
  fi

  # Validate each plugin
  local validated_count=0
  local issue_count=0

  # Get plugin names and paths
  while IFS= read -r line; do
    # Parse plugin info from the list output
    if [[ "$line" =~ ^[[:space:]]+Path:[[:space:]]+(.*) ]]; then
      local plugin_path="${BASH_REMATCH[1]}"
      local plugin_name

      # Extract plugin name from path
      plugin_name=$(basename "$plugin_path" | sed 's/@.*//')

      if [ -d "$plugin_path" ]; then
        if validate_plugin "$plugin_path" "$plugin_name"; then
          ((validated_count++))
        else
          ((issue_count++))
        fi
      else
        warnings+=("$plugin_name: Path does not exist: $plugin_path")
        ((issue_count++))
      fi
    fi
  done <<< "$plugins_json"

  # Report results
  if [ $issue_count -gt 0 ]; then
    echo "# Plugin Path Validation Summary" >&2
    echo "# Validated: $validated_count | Issues: $issue_count" >&2

    for warning in "${warnings[@]}"; do
      echo "# ⚠️  $warning" >&2
    done
  fi

  # Always exit 0 - we want to warn but not block session start
  exit 0
}

# Run main if not being sourced
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  main "$@"
fi
