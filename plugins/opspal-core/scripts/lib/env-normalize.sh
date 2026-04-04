#!/bin/bash
# env-normalize.sh - Shared environment normalizer for CLI + Desktop compatibility
#
# Source this at the top of any hook or plugin script to get a normalized
# environment regardless of whether you're running on WSL CLI or Desktop (Git Bash).
#
# Responsibilities:
#   1. Sources platform-helpers.sh and node-wrapper.sh
#   2. Exports OPSPAL_PLATFORM (wsl | git-bash | linux | macos)
#   3. Normalizes CLAUDE_PLUGIN_ROOT
#   4. Sets SF_DATA_DIR default if unset
#   5. Provides safe_realpath() fallback (Git Bash lacks realpath)
#   6. Provides normalize_crlf() for line-ending safety
#
# All exports are guarded — never overwrites caller-set values.
# Idempotent — safe to source multiple times.
#
# Usage:
#   source "${CLAUDE_PLUGIN_ROOT}/scripts/lib/env-normalize.sh"
#   # or
#   source "$(dirname "${BASH_SOURCE[0]}")/env-normalize.sh"

# Idempotency guard
[ "${_ENV_NORMALIZE_LOADED:-}" = "1" ] && return 0 2>/dev/null || true
_ENV_NORMALIZE_LOADED="1"

# Resolve this script's directory for sibling sourcing
_ENV_NORMALIZE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"

# =============================================================================
# 1. Source platform-helpers.sh (detection functions)
# =============================================================================

if [ -z "${_PLATFORM_HELPERS_LOADED:-}" ] && [ -f "${_ENV_NORMALIZE_DIR}/platform-helpers.sh" ]; then
  source "${_ENV_NORMALIZE_DIR}/platform-helpers.sh" || true
fi

# =============================================================================
# 2. Source node-wrapper.sh (node binary discovery)
# =============================================================================

if [ -f "${_ENV_NORMALIZE_DIR}/node-wrapper.sh" ]; then
  source "${_ENV_NORMALIZE_DIR}/node-wrapper.sh" || true
  # Resolve node now so all downstream scripts can use it
  ensure_node_in_path 2>/dev/null || true
fi

# =============================================================================
# 3. Export OPSPAL_PLATFORM
# =============================================================================

if [ -z "${OPSPAL_PLATFORM:-}" ]; then
  if type get_platform &>/dev/null; then
    export OPSPAL_PLATFORM="$(get_platform)"
  else
    export OPSPAL_PLATFORM="unknown"
  fi
fi

# =============================================================================
# 4. Normalize CLAUDE_PLUGIN_ROOT
# =============================================================================

if [ -z "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  # Try to discover from this script's location (we're in scripts/lib/)
  local_plugin_root="${_ENV_NORMALIZE_DIR}/../.."
  if [ -f "${local_plugin_root}/.claude-plugin/plugin.json" ] || [ -f "${local_plugin_root}/plugin.json" ]; then
    export CLAUDE_PLUGIN_ROOT="$(cd "$local_plugin_root" 2>/dev/null && pwd)"
  fi
fi

# =============================================================================
# 5. Set SF_DATA_DIR default (token store location)
# =============================================================================

if [ -z "${SF_DATA_DIR:-}" ]; then
  local_home="${HOME:-$(eval echo ~ 2>/dev/null || echo '')}"
  if [ -n "$local_home" ] && [ -d "${local_home}/.sfdx" ]; then
    export SF_DATA_DIR="${local_home}/.sfdx"
  fi
fi

# =============================================================================
# 6. Portable utility functions
# =============================================================================

##
# Portable realpath replacement.
# Git Bash on Windows does not ship with realpath.
# Args: $1 = path to resolve
# Outputs: absolute resolved path
##
safe_realpath() {
  if command -v realpath >/dev/null 2>&1; then
    realpath "$1" 2>/dev/null || _fallback_realpath "$1"
  else
    _fallback_realpath "$1"
  fi
}

_fallback_realpath() {
  local target="$1"
  if [ -d "$target" ]; then
    echo "$(cd "$target" 2>/dev/null && pwd)"
  elif [ -f "$target" ]; then
    local dir base
    dir="$(dirname "$target")"
    base="$(basename "$target")"
    echo "$(cd "$dir" 2>/dev/null && pwd)/$base"
  else
    # Path doesn't exist yet — resolve parent
    local dir base
    dir="$(dirname "$target")"
    base="$(basename "$target")"
    if [ -d "$dir" ]; then
      echo "$(cd "$dir" 2>/dev/null && pwd)/$base"
    else
      echo "$target"
    fi
  fi
}

##
# Strip carriage returns from stdin.
# Use: cat file.csv | normalize_crlf > clean.csv
##
normalize_crlf() {
  tr -d '\r'
}

##
# Normalize line endings in a file in-place.
# Args: $1 = file path
##
normalize_crlf_file() {
  local file="$1"
  if [ -f "$file" ] && grep -qP '\r' "$file" 2>/dev/null; then
    local tmp
    tmp="$(mktemp)" || return 1
    tr -d '\r' < "$file" > "$tmp" && mv "$tmp" "$file"
  fi
}
