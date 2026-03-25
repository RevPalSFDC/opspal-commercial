#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Post-Fireflies Sync Hook
#
# Purpose: Post-processing after Fireflies sync/analysis operations.
#   1. Logs sync event to JSONL log file
#   2. Triggers work-index auto-capture if ORG_SLUG is set
#
# Triggers: PostToolUse for mcp__fireflies* matcher (all Fireflies API calls)
#
# Configuration: Set FIREFLIES_POST_SYNC_ENABLED=0 to disable
###############################################################################

# Check if enabled
if [ "${FIREFLIES_POST_SYNC_ENABLED:-1}" = "0" ]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${HOME}/.claude/logs"
LOG_FILE="${LOG_DIR}/fireflies-sync.jsonl"

###############################################################################
# Log sync event
###############################################################################

mkdir -p "$LOG_DIR"

TOOL_NAME="${1:-unknown}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Append sync log entry
if command -v node >/dev/null 2>&1; then
  node -e "
    const entry = {
      timestamp: '${TIMESTAMP}',
      tool: '${TOOL_NAME}',
      orgSlug: process.env.ORG_SLUG || null,
      sfOrg: process.env.SF_TARGET_ORG || null
    };
    const fs = require('fs');
    fs.appendFileSync('${LOG_FILE}', JSON.stringify(entry) + '\n');
  " 2>/dev/null
fi

###############################################################################
# Work-index auto-capture
###############################################################################

if [ -n "${ORG_SLUG:-}" ]; then
  WORK_INDEX_SCRIPT="${SCRIPT_DIR}/../scripts/lib/work-index-manager.js"
  if [ -f "$WORK_INDEX_SCRIPT" ]; then
    node "$WORK_INDEX_SCRIPT" auto-capture \
      --org "${ORG_SLUG:-}" \
      --type "fireflies-sync" \
      --tool "${TOOL_NAME}" \
      --timestamp "${TIMESTAMP}" 2>/dev/null || true
  fi
fi

exit 0
