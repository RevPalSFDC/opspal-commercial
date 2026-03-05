#!/bin/bash

# Resolve Plugin Path - Shell helper for consistent plugin path resolution
#
# This script provides shell functions for resolving plugin paths.
# Works with both marketplace installations and development paths.
#
# Usage:
#   source resolve-plugin-path.sh
#   PLUGIN_ROOT=$(resolve_plugin_root opspal-salesforce)
#   SCRIPT_PATH=$(resolve_plugin_path opspal-salesforce scripts lib/my-script.js)
#
# Environment Variables (auto-populated by init_plugin_paths):
#   OPSPAL_CORE_ROOT
#   OPSPAL_SALESFORCE_ROOT
#   OPSPAL_HUBSPOT_ROOT
#   OPSPAL_MARKETO_ROOT
#   etc.

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Path to the unified path resolver
UNIFIED_RESOLVER="${SCRIPT_DIR}/lib/unified-path-resolver.js"

# Resolve plugin root directory
# Usage: resolve_plugin_root <plugin-name>
# Returns: Absolute path to plugin root, or exits with error
resolve_plugin_root() {
  local plugin_name="$1"

  if [ -z "$plugin_name" ]; then
    echo "Error: Plugin name required" >&2
    return 1
  fi

  # First, check if we have an environment variable set
  local env_var="$(echo "$plugin_name" | tr '[:lower:]-' '[:upper:]_')_ROOT"
  local env_value="${!env_var}"

  if [ -n "$env_value" ] && [ -d "$env_value" ]; then
    echo "$env_value"
    return 0
  fi

  # Fall back to node resolver
  if [ -f "$UNIFIED_RESOLVER" ]; then
    local result
    result=$(node "$UNIFIED_RESOLVER" resolve-root "$plugin_name" 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$result" ]; then
      echo "$result"
      return 0
    fi
  fi

  # Manual fallback resolution
  local candidates=(
    "${CLAUDE_PLUGIN_ROOT:-}"
    "${SCRIPT_DIR}/../.."
    "${PWD}/plugins/${plugin_name}"
    "${PWD}/.claude-plugins/${plugin_name}"
    "${HOME}/.claude/plugins/${plugin_name}"
  )

  for candidate in "${candidates[@]}"; do
    if [ -n "$candidate" ] && [ -d "$candidate" ]; then
      # Check if it looks like a plugin directory
      if [ -d "$candidate/scripts" ] || [ -d "$candidate/agents" ] || [ -f "$candidate/.claude-plugin/manifest.json" ]; then
        echo "$candidate"
        return 0
      fi
    fi
  done

  echo "Error: Could not resolve plugin: $plugin_name" >&2
  return 1
}

# Resolve a path within a plugin
# Usage: resolve_plugin_path <plugin-name> <component-type> [component-name]
# Example: resolve_plugin_path opspal-salesforce scripts lib/my-script.js
resolve_plugin_path() {
  local plugin_name="$1"
  local component_type="$2"
  local component_name="$3"

  local plugin_root
  plugin_root=$(resolve_plugin_root "$plugin_name")
  if [ $? -ne 0 ]; then
    return 1
  fi

  if [ -n "$component_type" ] && [ -n "$component_name" ]; then
    local full_path="${plugin_root}/${component_type}/${component_name}"
    if [ -e "$full_path" ]; then
      echo "$full_path"
      return 0
    else
      echo "Error: Path not found: $full_path" >&2
      return 1
    fi
  elif [ -n "$component_type" ]; then
    local full_path="${plugin_root}/${component_type}"
    if [ -d "$full_path" ]; then
      echo "$full_path"
      return 0
    else
      echo "Error: Directory not found: $full_path" >&2
      return 1
    fi
  else
    echo "$plugin_root"
    return 0
  fi
}

# Initialize plugin paths by setting environment variables
# Usage: init_plugin_paths
# Sets: OPSPAL_CORE_ROOT, OPSPAL_SALESFORCE_ROOT, etc.
init_plugin_paths() {
  if [ -f "$UNIFIED_RESOLVER" ]; then
    eval "$(node "$UNIFIED_RESOLVER" export-all 2>/dev/null)"
  else
    # Manual initialization for common plugins
    local plugins=("opspal-core" "opspal-salesforce" "opspal-hubspot" "opspal-marketo" "opspal-gtm-planning")

    for plugin in "${plugins[@]}"; do
      local root
      root=$(resolve_plugin_root "$plugin" 2>/dev/null)
      if [ -n "$root" ]; then
        local env_var="$(echo "$plugin" | tr '[:lower:]-' '[:upper:]_')_ROOT"
        export "$env_var"="$root"
      fi
    done
  fi
}

# Check if a plugin is available
# Usage: is_plugin_available <plugin-name>
# Returns: 0 if available, 1 if not
is_plugin_available() {
  local plugin_name="$1"
  local root
  root=$(resolve_plugin_root "$plugin_name" 2>/dev/null)
  [ -n "$root" ] && [ -d "$root" ]
}

# List all available plugins
# Usage: list_available_plugins
list_available_plugins() {
  if [ -f "$UNIFIED_RESOLVER" ]; then
    node "$UNIFIED_RESOLVER" list
  else
    echo "Available plugins:"
    local search_paths=(
      "${PWD}/plugins"
      "${PWD}/.claude-plugins"
      "${HOME}/.claude/plugins"
    )

    for search_path in "${search_paths[@]}"; do
      if [ -d "$search_path" ]; then
        for dir in "$search_path"/opspal-*; do
          if [ -d "$dir" ]; then
            echo "  $(basename "$dir"): $dir"
          fi
        done
      fi
    done
  fi
}

# Validate that a plugin path is correct
# Usage: validate_plugin_path <path> [expected-items...]
# Example: validate_plugin_path /path/to/plugin scripts agents hooks
validate_plugin_path() {
  local path_to_validate="$1"
  shift
  local expected_items=("$@")

  if [ ! -d "$path_to_validate" ]; then
    echo "Error: Path does not exist or is not a directory: $path_to_validate" >&2
    return 1
  fi

  local missing=()
  for item in "${expected_items[@]}"; do
    if [ ! -e "${path_to_validate}/${item}" ]; then
      missing+=("$item")
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    echo "Error: Missing expected items: ${missing[*]}" >&2
    return 1
  fi

  return 0
}

# CLI mode - when script is run directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  case "$1" in
    resolve-root)
      resolve_plugin_root "$2"
      ;;
    resolve)
      resolve_plugin_path "$2" "$3" "$4"
      ;;
    init)
      init_plugin_paths
      echo "Plugin paths initialized"
      ;;
    list)
      list_available_plugins
      ;;
    validate)
      shift
      validate_plugin_path "$@"
      ;;
    check)
      if is_plugin_available "$2"; then
        echo "available"
      else
        echo "not found"
        exit 1
      fi
      ;;
    --help|-h|"")
      cat << 'EOF'
Resolve Plugin Path - Shell helper for plugin path resolution

USAGE:
  source resolve-plugin-path.sh    # Source for function access
  bash resolve-plugin-path.sh CMD  # Direct CLI usage

COMMANDS:
  resolve-root <plugin>        Resolve plugin root directory
  resolve <plugin> [type] [name]   Resolve component path
  init                         Initialize plugin path environment variables
  list                         List available plugins
  validate <path> [items...]   Validate path has expected contents
  check <plugin>               Check if plugin is available

EXAMPLES:
  # Source and use functions
  source resolve-plugin-path.sh
  init_plugin_paths
  SFDC_ROOT=$(resolve_plugin_root opspal-salesforce)

  # CLI usage
  bash resolve-plugin-path.sh resolve-root opspal-salesforce
  bash resolve-plugin-path.sh resolve opspal-salesforce scripts lib/foo.js
  bash resolve-plugin-path.sh list
EOF
      ;;
    *)
      echo "Unknown command: $1" >&2
      echo "Run with --help for usage" >&2
      exit 1
      ;;
  esac
fi
