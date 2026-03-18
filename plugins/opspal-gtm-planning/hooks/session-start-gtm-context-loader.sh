#!/usr/bin/env bash
# Hook: session-start-gtm-context-loader.sh
# Event: SessionStart
# Purpose: Auto-load active GTM planning cycle context when ORG_SLUG is set
# Pattern: mirrors opspal-okrs/hooks/session-start-okr-context-loader.sh

set -euo pipefail

# Skip if ORG_SLUG is not set
if [ -z "${ORG_SLUG:-}" ]; then
  exit 0
fi

# Resolve the GTM platform directory
GTM_BASE_DIR="${CLAUDE_PROJECT_ROOT:-$(pwd)}/orgs/${ORG_SLUG}/platforms/gtm-planning"

if [ ! -d "$GTM_BASE_DIR" ]; then
  exit 0
fi

# Find the most recent planning cycle directory
ACTIVE_CYCLE=""
ACTIVE_CYCLE_DIR=""
ACTIVE_PHASE=""

# Look for cycle directories (e.g., FY2026, FY2027, H1-2026)
for cycle_dir in "$GTM_BASE_DIR"/*/; do
  [ -d "$cycle_dir" ] || continue

  # Check for cycle-state.json to determine phase
  state_file="$cycle_dir/cycle-state.json"
  if [ -f "$state_file" ] && command -v jq &>/dev/null; then
    cycle_name="$(basename "$cycle_dir")"
    phase=$(jq -r '.current_phase // "unknown"' "$state_file" 2>/dev/null || echo "unknown")
    status=$(jq -r '.status // "unknown"' "$state_file" 2>/dev/null || echo "unknown")

    # Prefer active/in-progress cycles
    if [ "$status" = "active" ] || [ "$status" = "in-progress" ]; then
      ACTIVE_CYCLE="$cycle_name"
      ACTIVE_CYCLE_DIR="$cycle_dir"
      ACTIVE_PHASE="$phase"
    elif [ -z "$ACTIVE_CYCLE" ]; then
      # Fall back to any cycle with a state file
      ACTIVE_CYCLE="$cycle_name"
      ACTIVE_CYCLE_DIR="$cycle_dir"
      ACTIVE_PHASE="$phase"
    fi
  else
    # No state file — check for any planning artifacts
    if [ -z "$ACTIVE_CYCLE" ]; then
      artifact_count=$(find "$cycle_dir" -maxdepth 2 -name "*.json" -o -name "*.csv" -o -name "*.md" 2>/dev/null | head -5 | wc -l)
      if [ "$artifact_count" -gt 0 ]; then
        ACTIVE_CYCLE="$(basename "$cycle_dir")"
        ACTIVE_CYCLE_DIR="$cycle_dir"
        ACTIVE_PHASE="unknown"
      fi
    fi
  fi
done

if [ -z "$ACTIVE_CYCLE" ]; then
  exit 0
fi

# Export for downstream agents
export GTM_ACTIVE_CYCLE="$ACTIVE_CYCLE"
export GTM_ACTIVE_PHASE="$ACTIVE_PHASE"

# Print context banner
echo "GTM Planning Context: org=${ORG_SLUG} | cycle=${ACTIVE_CYCLE} | phase=${ACTIVE_PHASE} | path=${ACTIVE_CYCLE_DIR}"

exit 0
