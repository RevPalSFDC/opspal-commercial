#!/usr/bin/env bash

# =============================================================================
# Session Start Version Check Hook
# Checks for plugin updates at session start with GitHub API integration
#
# Triggered: On session start (SessionStart hook)
# Purpose: Display update notifications when plugins have new versions
#
# Features:
# - 1-hour cache to minimize API calls
# - Graceful fallback on failures
# - Silent when up-to-date (no spam)
# - Timeout protection (3 seconds max)
#
# Version: 1.0.0
# =============================================================================

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$SCRIPT_DIR")}"

# Source error handler if available
if [[ -f "$PLUGIN_ROOT/hooks/lib/error-handler.sh" ]]; then
  source "$PLUGIN_ROOT/hooks/lib/error-handler.sh"
  HOOK_NAME="session-start-version-check"
  set_lenient_mode 2>/dev/null || true
fi

# Configuration
VERBOSE="${ROUTING_VERBOSE:-0}"
ENABLE_VERSION_CHECK="${ENABLE_VERSION_CHECK:-1}"
VERSION_CHECKER="$PLUGIN_ROOT/scripts/lib/plugin-version-checker.js"

# Logging function
log() {
  local level="$1"
  shift
  if [[ "$VERBOSE" == "1" ]] || [[ "$level" == "ERROR" ]]; then
    echo "[SessionStartVersionCheck] [$level] $*" >&2
  fi
}

# Check if version checking is enabled
if [[ "$ENABLE_VERSION_CHECK" != "1" ]]; then
  log "INFO" "Version check disabled (ENABLE_VERSION_CHECK=0)"
  exit 0
fi

# Check for required tools
if ! command -v node &> /dev/null; then
  log "WARN" "node not installed - version check skipped"
  exit 0
fi

if [[ ! -f "$VERSION_CHECKER" ]]; then
  log "WARN" "plugin-version-checker.js not found at: $VERSION_CHECKER"
  exit 0
fi

# Main function
main() {
  log "INFO" "Checking for plugin updates..."

  # Run version checker with timeout (3 seconds max)
  # Output to stdout for hook capture
  local result
  if result=$(timeout 3s node "$VERSION_CHECKER" --format=json 2>/dev/null); then
    # Check if result is non-empty and valid JSON
    if [[ -n "$result" ]] && [[ "$result" != "{}" ]]; then
      echo "$result"
      log "INFO" "Updates available - notification displayed"
    else
      log "INFO" "All plugins up to date"
    fi
  else
    # Timeout or error - silent fail
    log "WARN" "Version check timed out or failed"
  fi

  exit 0
}

# Run main
main "$@"
