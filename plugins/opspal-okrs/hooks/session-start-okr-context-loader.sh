#!/usr/bin/env bash
# Hook: session-start-okr-context-loader.sh
# Event: SessionStart
# Purpose: Auto-load active OKR cycle context when ORG_SLUG is set
# Pattern: mirrors opspal-hubspot/hooks/ SessionStart hooks

set -euo pipefail

# Skip if ORG_SLUG is not set
if [ -z "${ORG_SLUG:-}" ]; then
  exit 0
fi

# Resolve the OKR platform directory
OKR_BASE_DIR="${CLAUDE_PROJECT_ROOT:-$(pwd)}/orgs/${ORG_SLUG}/platforms/okr"

if [ ! -d "$OKR_BASE_DIR" ]; then
  exit 0
fi

# Find the most recent cycle directory (by modification time)
ACTIVE_CYCLE=""
ACTIVE_CYCLE_DIR=""

for cycle_dir in "$OKR_BASE_DIR"/*/; do
  [ -d "$cycle_dir" ] || continue
  approved_file="$cycle_dir/approved/"
  if [ -d "$approved_file" ] && [ "$(ls -A "$approved_file" 2>/dev/null)" ]; then
    # This cycle has approved OKRs — candidate for active
    cycle_name="$(basename "$cycle_dir")"
    ACTIVE_CYCLE="$cycle_name"
    ACTIVE_CYCLE_DIR="$cycle_dir"
  fi
done

# If no approved cycle found, check for drafts
if [ -z "$ACTIVE_CYCLE" ]; then
  for cycle_dir in "$OKR_BASE_DIR"/*/; do
    [ -d "$cycle_dir" ] || continue
    drafts_dir="$cycle_dir/drafts/"
    if [ -d "$drafts_dir" ] && [ "$(ls -A "$drafts_dir" 2>/dev/null)" ]; then
      cycle_name="$(basename "$cycle_dir")"
      ACTIVE_CYCLE="$cycle_name"
      ACTIVE_CYCLE_DIR="$cycle_dir"
    fi
  done
fi

if [ -z "$ACTIVE_CYCLE" ]; then
  exit 0
fi

# Export for downstream agents
export OKR_ACTIVE_CYCLE="$ACTIVE_CYCLE"

# Dual-write to shared state file (O3 fix, 2026-04-01)
_STATE_DIR="${HOME}/.claude/session-state"
mkdir -p "$_STATE_DIR" 2>/dev/null || true
printf 'OKR_ACTIVE_CYCLE=%s\n' "$ACTIVE_CYCLE" \
    >> "${_STATE_DIR}/session-init-state.env" 2>/dev/null || true

# Print context banner
echo "OKR Context: org=${ORG_SLUG} | active_cycle=${ACTIVE_CYCLE} | path=${ACTIVE_CYCLE_DIR}"

exit 0
