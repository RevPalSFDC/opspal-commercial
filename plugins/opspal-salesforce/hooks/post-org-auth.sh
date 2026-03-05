#!/usr/bin/env bash

# ==============================================================================
# Post-Org Authentication Hook
#
# Automatically runs after successful Salesforce org authentication to:
# - Detect org quirks (label customizations, record types, field mappings)
# - Cache results for fast subsequent access
# - Generate documentation if stale/missing
#
# Part of Phase 3.3 from the Comprehensive Reflection Data Plan.
# ROI: Prevents ~20 org discovery issues/month ($3,000/year savings)
#
# Trigger: PostToolUse - sf org login *
#
# @version 1.0.0
# @created 2026-01-15
# ==============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
QUIRKS_DETECTOR="$PLUGIN_ROOT/scripts/lib/org-quirks-detector.js"

# Environment
SKIP_ORG_QUIRKS_DETECTION="${SKIP_ORG_QUIRKS_DETECTION:-0}"
ORG_QUIRKS_VERBOSE="${ORG_QUIRKS_VERBOSE:-0}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ==============================================================================
# Helper Functions
# ==============================================================================

log_info() {
  if [[ "$ORG_QUIRKS_VERBOSE" == "1" ]]; then
    echo -e "${BLUE}[org-quirks]${NC} $1" >&2
  fi
}

log_success() {
  echo -e "${GREEN}[org-quirks]${NC} $1" >&2
}

log_warn() {
  echo -e "${YELLOW}[org-quirks]${NC} $1" >&2
}

# ==============================================================================
# Main Logic
# ==============================================================================

main() {
  # Skip if disabled
  if [[ "$SKIP_ORG_QUIRKS_DETECTION" == "1" ]]; then
    log_info "Skipping org quirks detection (SKIP_ORG_QUIRKS_DETECTION=1)"
    exit 0
  fi

  # Read tool input from stdin
  local tool_input
  tool_input=$(cat)

  log_info "Post-org-auth hook triggered"

  # Check if this is an org login command
  local tool_name
  tool_name=$(echo "$tool_input" | jq -r '.tool_name // empty')

  # Only process Bash tool calls that are sf org login commands
  if [[ "$tool_name" != "Bash" ]]; then
    log_info "Not a Bash tool call, skipping"
    exit 0
  fi

  local command
  command=$(echo "$tool_input" | jq -r '.tool_input.command // empty')

  # Check if this is an org login/auth command
  if [[ ! "$command" =~ (sf|sfdx)[[:space:]]+org[[:space:]]+(login|auth) ]]; then
    log_info "Not an org auth command, skipping"
    exit 0
  fi

  log_info "Detected org authentication command: $command"

  # Extract org alias from the command
  local org_alias
  org_alias=""

  # Try to extract from --alias or -a flag
  if [[ "$command" =~ --alias[[:space:]]+([^[:space:]]+) ]]; then
    org_alias="${BASH_REMATCH[1]}"
  elif [[ "$command" =~ -a[[:space:]]+([^[:space:]]+) ]]; then
    org_alias="${BASH_REMATCH[1]}"
  elif [[ "$command" =~ --target-org[[:space:]]+([^[:space:]]+) ]]; then
    org_alias="${BASH_REMATCH[1]}"
  fi

  if [[ -z "$org_alias" ]]; then
    log_warn "Could not extract org alias from command"
    exit 0
  fi

  log_info "Extracted org alias: $org_alias"

  # Check if quirks detector exists
  if [[ ! -f "$QUIRKS_DETECTOR" ]]; then
    log_warn "Quirks detector not found at: $QUIRKS_DETECTOR"
    exit 0
  fi

  # Run quirks detection in background (don't block the auth flow)
  log_success "Starting org quirks detection for '$org_alias' (background)..."

  (
    # Small delay to ensure auth is complete
    sleep 2

    # Run detection
    cd "$PLUGIN_ROOT" || exit 1
    node "$QUIRKS_DETECTOR" detect-all "$org_alias" 2>&1 | while read -r line; do
      echo -e "${BLUE}[org-quirks]${NC} $line" >&2
    done

    log_success "Org quirks detection complete for '$org_alias'"
  ) &

  # Don't wait for background process
  exit 0
}

# ==============================================================================
# Entry Point
# ==============================================================================

# Run if called directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
