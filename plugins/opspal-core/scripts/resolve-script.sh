#!/usr/bin/env bash
# resolve-script.sh — Shared path resolver for opspal-core command templates
#
# Source this file in command .md bash blocks to get find_script() and
# find_ci_script() functions that work across all installation methods:
#   - Development workspace (plugins/opspal-core/...)
#   - Symlinked workspace (.claude-plugins/opspal-core/...)
#   - Marketplace install (~/.claude/plugins/marketplaces/...)
#   - Cache install (~/.claude/plugins/cache/...)
#   - CLAUDE_PLUGIN_ROOT env var (set by Claude Code runtime)
#
# Usage in command .md files:
#   source "$(dirname "$0")/../scripts/resolve-script.sh" 2>/dev/null || {
#     # Fallback: inline bootstrap to find this file
#     ...
#   }
#
# Or use the bootstrap snippet (see BOOTSTRAP SNIPPET section below).
#
# v1.0.0 — 2026-03-11

# Build Claude roots (Linux/macOS + WSL Windows profile)
CLAUDE_ROOTS=("$HOME/.claude")
if [ -n "${CLAUDE_HOME:-}" ]; then
  CLAUDE_ROOTS+=("$CLAUDE_HOME")
fi
if [ -n "${CLAUDE_CONFIG_DIR:-}" ]; then
  CLAUDE_ROOTS+=("$CLAUDE_CONFIG_DIR")
fi
if [ -n "${WSL_DISTRO_NAME:-}" ] || [ -n "${WSL_INTEROP:-}" ]; then
  if [ -n "${USERPROFILE:-}" ] && command -v wslpath >/dev/null 2>&1; then
    WIN_PROFILE="$(wslpath -u "$USERPROFILE" 2>/dev/null || true)"
    [ -n "$WIN_PROFILE" ] && CLAUDE_ROOTS+=("$WIN_PROFILE/.claude")
  fi
  [ -n "${USERNAME:-}" ] && CLAUDE_ROOTS+=("/mnt/c/Users/$USERNAME/.claude")
  [ -n "${USER:-}" ] && CLAUDE_ROOTS+=("/mnt/c/Users/$USER/.claude")
fi

_find_latest_cache_script() {
  local root="$1"
  local path_pattern="$2"
  [ -d "$root/plugins/cache" ] || return 1
  find "$root/plugins/cache" -type f -path "$path_pattern" 2>/dev/null | sort -V | tail -1
}

# Find lib script in multiple locations (dev + marketplace + cache)
find_script() {
  local script_name="$1"
  local paths=(
    "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/lib/$script_name}"
    "$PWD/plugins/opspal-core/scripts/lib/$script_name"
    "$PWD/.claude-plugins/opspal-core/scripts/lib/$script_name"
    "./plugins/opspal-core/scripts/lib/$script_name"
    "./.claude-plugins/opspal-core/scripts/lib/$script_name"
  )

  local root mp_dir cache_hit found
  for root in "${CLAUDE_ROOTS[@]}"; do
    paths+=("$root/plugins/marketplaces/revpal-internal-plugins/plugins/opspal-core/scripts/lib/$script_name")
    for mp_dir in "$root/plugins/marketplaces"/*/plugins/opspal-core/scripts/lib; do
      [ -d "$mp_dir" ] && paths+=("$mp_dir/$script_name")
    done
    cache_hit="$(_find_latest_cache_script "$root" "*/opspal-core/*/scripts/lib/$script_name" || true)"
    [ -n "$cache_hit" ] && paths+=("$cache_hit")
  done

  for p in "${paths[@]}"; do
    [ -n "$p" ] && [ -f "$p" ] && echo "$p" && return 0
  done

  for root in "${CLAUDE_ROOTS[@]}"; do
    found=$(find "$root/plugins" -name "$script_name" -path "*/opspal-core/scripts/lib/*" 2>/dev/null | sort -V | tail -1)
    [ -n "$found" ] && echo "$found" && return 0
  done

  found=$(find . -name "$script_name" -path "*/opspal-core/scripts/lib/*" 2>/dev/null | sort -V | tail -1)
  [ -n "$found" ] && echo "$found" && return 0
  return 1
}

# Find CI script in multiple locations (dev + marketplace + cache)
find_ci_script() {
  local script_name="$1"
  local paths=(
    "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/ci/$script_name}"
    "$PWD/plugins/opspal-core/scripts/ci/$script_name"
    "$PWD/.claude-plugins/opspal-core/scripts/ci/$script_name"
    "./plugins/opspal-core/scripts/ci/$script_name"
    "./.claude-plugins/opspal-core/scripts/ci/$script_name"
  )

  local root mp_dir cache_hit found
  for root in "${CLAUDE_ROOTS[@]}"; do
    paths+=("$root/plugins/marketplaces/revpal-internal-plugins/plugins/opspal-core/scripts/ci/$script_name")
    for mp_dir in "$root/plugins/marketplaces"/*/plugins/opspal-core/scripts/ci; do
      [ -d "$mp_dir" ] && paths+=("$mp_dir/$script_name")
    done
    cache_hit="$(_find_latest_cache_script "$root" "*/opspal-core/*/scripts/ci/$script_name" || true)"
    [ -n "$cache_hit" ] && paths+=("$cache_hit")
  done

  for p in "${paths[@]}"; do
    [ -n "$p" ] && [ -f "$p" ] && echo "$p" && return 0
  done

  for root in "${CLAUDE_ROOTS[@]}"; do
    found=$(find "$root/plugins" -name "$script_name" -path "*/opspal-core/scripts/ci/*" 2>/dev/null | sort -V | tail -1)
    [ -n "$found" ] && echo "$found" && return 0
  done

  found=$(find . -name "$script_name" -path "*/opspal-core/scripts/ci/*" 2>/dev/null | sort -V | tail -1)
  [ -n "$found" ] && echo "$found" && return 0
  return 1
}

# Find hook script in multiple locations
find_hook() {
  local hook_name="$1"
  local paths=(
    "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/hooks/$hook_name}"
    "$PWD/plugins/opspal-core/hooks/$hook_name"
    "$PWD/.claude-plugins/opspal-core/hooks/$hook_name"
    "./plugins/opspal-core/hooks/$hook_name"
    "./.claude-plugins/opspal-core/hooks/$hook_name"
  )

  local root cache_hit found
  for root in "${CLAUDE_ROOTS[@]}"; do
    paths+=("$root/plugins/marketplaces/revpal-internal-plugins/plugins/opspal-core/hooks/$hook_name")
    cache_hit="$(_find_latest_cache_script "$root" "*/opspal-core/*/hooks/$hook_name" || true)"
    [ -n "$cache_hit" ] && paths+=("$cache_hit")
  done

  for p in "${paths[@]}"; do
    [ -n "$p" ] && [ -f "$p" ] && echo "$p" && return 0
  done

  return 1
}
