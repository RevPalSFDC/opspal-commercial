#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Post Tool Use — License Poll Daemon
# =============================================================================
#
# Purpose: Periodically check license status in the background.
#   On ~95% of invocations this is a no-op (file stat + exit in ~2ms).
#   When the poll interval has elapsed, calls the /api/v1/poll endpoint
#   to detect tier changes, expirations, and revocations.
#
# Event: PostToolUse
# Timeout: 3000ms
#
# Environment:
#   OPSPAL_POLL_ENABLED=1          Enable/disable polling (default: 1)
#   OPSPAL_POLL_INTERVAL_HOURS=4   Poll interval in hours (default: 4)
#
# =============================================================================

POLL_ENABLED="${OPSPAL_POLL_ENABLED:-1}"
[[ "$POLL_ENABLED" != "1" ]] && echo '{}' && exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_SCRIPT="$SCRIPT_DIR/../scripts/lib/license-poll-daemon.js"
[[ ! -f "$NODE_SCRIPT" ]] && echo '{}' && exit 0
command -v node &>/dev/null || { echo '{}'; exit 0; }

# Run with a hard 3-second timeout. Warnings go to stderr (visible to user).
# stdout must always produce valid JSON for Claude Code.
timeout 3 node "$NODE_SCRIPT" 2>&1 | grep -v '^{}' >&2 || true
echo '{}'
exit 0
