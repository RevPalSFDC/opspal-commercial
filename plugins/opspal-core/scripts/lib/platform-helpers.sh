#!/usr/bin/env bash

# =============================================================================
# Platform Helpers - Cross-Platform Shell Library
# =============================================================================
#
# Sourceable shell library for hooks and bash scripts.
# Provides platform-aware temp dirs, browser opening, and path handling.
#
# Usage:
#   source "${CLAUDE_PLUGIN_ROOT}/scripts/lib/platform-helpers.sh"
#   TEMP_DIR=$(get_temp_dir)
#   open_browser "http://localhost:3000"
#
# All functions degrade gracefully if detection fails.
# =============================================================================

# Cache detection results
_PLATFORM_HELPERS_LOADED="${_PLATFORM_HELPERS_LOADED:-}"
_PLATFORM_IS_WSL=""
_PLATFORM_IS_MACOS=""
_PLATFORM_TYPE=""

# =============================================================================
# Platform Detection
# =============================================================================

##
# Check if running under WSL (Windows Subsystem for Linux)
# Returns 0 (true) if WSL, 1 (false) otherwise
##
is_wsl() {
  if [ -z "$_PLATFORM_IS_WSL" ]; then
    if [ -f /proc/version ] && grep -qiE '(microsoft|wsl)' /proc/version 2>/dev/null; then
      _PLATFORM_IS_WSL="true"
    else
      _PLATFORM_IS_WSL="false"
    fi
  fi
  [ "$_PLATFORM_IS_WSL" = "true" ]
}

##
# Check if running on macOS
# Returns 0 (true) if macOS, 1 (false) otherwise
##
is_macos() {
  if [ -z "$_PLATFORM_IS_MACOS" ]; then
    if [ "$(uname -s)" = "Darwin" ]; then
      _PLATFORM_IS_MACOS="true"
    else
      _PLATFORM_IS_MACOS="false"
    fi
  fi
  [ "$_PLATFORM_IS_MACOS" = "true" ]
}

##
# Check if running on native Linux (not WSL)
# Returns 0 (true) if Linux, 1 (false) otherwise
##
is_linux() {
  [ "$(uname -s)" = "Linux" ] && ! is_wsl
}

##
# Get descriptive platform string
# Outputs: wsl, macos, linux, or unknown
##
get_platform() {
  if [ -z "$_PLATFORM_TYPE" ]; then
    if is_wsl; then
      _PLATFORM_TYPE="wsl"
    elif is_macos; then
      _PLATFORM_TYPE="macos"
    elif [ "$(uname -s)" = "Linux" ]; then
      _PLATFORM_TYPE="linux"
    else
      _PLATFORM_TYPE="unknown"
    fi
  fi
  echo "$_PLATFORM_TYPE"
}

# =============================================================================
# Path Utilities
# =============================================================================

##
# Get the platform-appropriate temp directory.
# Respects TMPDIR env var, falls back to /tmp.
# Outputs: temp directory path
##
get_temp_dir() {
  echo "${TMPDIR:-/tmp}"
}

##
# Get the user's home directory.
# Never hardcodes ~ or relies on tilde expansion.
# Outputs: home directory path
##
get_home_dir() {
  echo "${HOME:-$(eval echo ~)}"
}

##
# Get the Claude config directory path.
# Outputs: ~/.claude path
##
get_claude_dir() {
  echo "$(get_home_dir)/.claude"
}

##
# Create a temp file with platform-appropriate location.
# Args: $1 = prefix (default: "opspal"), $2 = suffix/extension (default: "")
# Outputs: path to created temp file
##
safe_mktemp() {
  local prefix="${1:-opspal}"
  local suffix="${2:-}"
  local tmpdir
  tmpdir="$(get_temp_dir)"

  if is_macos; then
    # macOS mktemp requires template with Xs
    mktemp "${tmpdir}/${prefix}-XXXXXX${suffix}"
  else
    # Linux mktemp supports --suffix
    if [ -n "$suffix" ]; then
      mktemp -p "$tmpdir" "${prefix}-XXXXXX${suffix}" 2>/dev/null || \
        mktemp "${tmpdir}/${prefix}-XXXXXX${suffix}"
    else
      mktemp -p "$tmpdir" "${prefix}-XXXXXX" 2>/dev/null || \
        mktemp "${tmpdir}/${prefix}-XXXXXX"
    fi
  fi
}

##
# Create a temp directory with platform-appropriate location.
# Args: $1 = prefix (default: "opspal")
# Outputs: path to created temp directory
##
safe_mktempdir() {
  local prefix="${1:-opspal}"
  local tmpdir
  tmpdir="$(get_temp_dir)"

  mktemp -d "${tmpdir}/${prefix}-XXXXXX"
}

##
# Normalize a path for the current platform.
# Resolves ~ to $HOME. Does not translate WSL /mnt/c/ paths.
# Args: $1 = path to normalize
# Outputs: normalized path
##
normalize_path() {
  local p="$1"

  # Resolve ~ to $HOME
  case "$p" in
    "~/"*) p="$(get_home_dir)/${p#~/}" ;;
    "~")   p="$(get_home_dir)" ;;
  esac

  # Remove trailing slashes (except root)
  if [ "$p" != "/" ]; then
    p="${p%/}"
  fi

  echo "$p"
}

# =============================================================================
# Shell & Browser Utilities
# =============================================================================

##
# Open a URL or file in the default browser.
# WSL-aware: uses wslview when available.
# Args: $1 = URL or file path
# Returns: 0 on success, 1 on failure
##
open_browser() {
  local url="$1"

  if is_macos; then
    open "$url" 2>/dev/null
  elif is_wsl; then
    wslview "$url" 2>/dev/null || \
      sensible-browser "$url" 2>/dev/null || \
      xdg-open "$url" 2>/dev/null
  else
    xdg-open "$url" 2>/dev/null || \
      sensible-browser "$url" 2>/dev/null || \
      x-www-browser "$url" 2>/dev/null
  fi
}

##
# Get the browser-open command name.
# Outputs: command name string
##
get_browser_command() {
  if is_macos; then
    echo "open"
  elif is_wsl; then
    echo "wslview"
  else
    echo "xdg-open"
  fi
}

##
# Ensure a directory exists under the temp directory.
# Safer than hardcoding /tmp/some-dir.
# Args: $1 = subdirectory name (e.g. "sf-cache")
# Outputs: full path to the directory
##
ensure_temp_subdir() {
  local subdir="$1"
  local full_path
  full_path="$(get_temp_dir)/${subdir}"
  mkdir -p "$full_path" 2>/dev/null
  echo "$full_path"
}

# Mark as loaded to prevent double-sourcing
_PLATFORM_HELPERS_LOADED="1"
