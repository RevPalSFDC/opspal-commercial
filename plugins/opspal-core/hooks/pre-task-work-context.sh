#!/usr/bin/env bash
#
# Pre-Task Work Context Hook
#
# Purpose: Load client work history at session start when ORG_SLUG is set.
#          Displays recent work, in-progress items, and pending follow-ups
#          to provide project memory context.
#
# Behavior:
#   1. Checks if ORG_SLUG environment variable is set
#   2. Loads recent work from WORK_INDEX.yaml
#   3. Displays context summary (recent, in-progress, follow-ups)
#   4. Non-blocking - always allows task to proceed
#
# Configuration:
#   WORK_CONTEXT_ENABLED=1    - Enable/disable context loading (default: 1)
#   WORK_CONTEXT_VERBOSE=1    - Show detailed output (default: 0)
#   WORK_CONTEXT_LIMIT=5      - Number of recent items to show (default: 5)
#
# Environment Variables Used:
#   ORG_SLUG                  - Organization identifier (required)
#   CLIENT_ORG                - Fallback org identifier
#   SF_TARGET_ORG             - Fallback from Salesforce context
#
# Version: 1.0.0
# Date: 2026-01-29
#

set -euo pipefail

# Plugin root detection - multiple strategies for robustness
# Strategy 1: Use CLAUDE_PLUGIN_ROOT if set by Claude Code
# Strategy 2: Use known plugin path relative to CWD (hooks run from repo root)
# Strategy 3: Fall back to $0-based detection

PLUGIN_ROOT=""
DEBUG="${WORK_CONTEXT_DEBUG:-0}"

# Debug output helper (returns 0 to not fail with set -e)
debug_log() {
    [ "$DEBUG" = "1" ] && echo "[DEBUG] $1" >&2 || true
}

debug_log "pwd=$(pwd)"

# Plugin root detection - ALWAYS validate file exists before trusting any path
# Strategy order prioritizes actual file existence over environment variables

# Strategy 1: Known path from repo root (hooks run with CWD = repo root)
if [ -f "$(pwd)/plugins/opspal-core/scripts/lib/work-index-manager.js" ]; then
    PLUGIN_ROOT="$(pwd)/plugins/opspal-core"
    debug_log "Using Strategy 1: Known path from repo root"
# Strategy 2: Check .claude-plugins symlink
elif [ -f "$(pwd)/.claude-plugins/opspal-core/scripts/lib/work-index-manager.js" ]; then
    PLUGIN_ROOT="$(pwd)/.claude-plugins/opspal-core"
    debug_log "Using Strategy 2: .claude-plugins symlink"
# Strategy 3: CLAUDE_PLUGIN_ROOT env var (only if manager script exists there)
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/scripts/lib/work-index-manager.js" ]; then
    PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
    debug_log "Using Strategy 3: CLAUDE_PLUGIN_ROOT"
# Strategy 4: Fall back to $0-based detection
else
    debug_log "Using Strategy 4: \$0-based fallback"
    if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        debug_log "SCRIPT_DIR from BASH_SOURCE: $SCRIPT_DIR"
    else
        SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
        debug_log "SCRIPT_DIR from \$0: $SCRIPT_DIR"
    fi
    PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

debug_log "Final PLUGIN_ROOT=$PLUGIN_ROOT"

PRETOOL_AGENT_CONTRACT="$PLUGIN_ROOT/hooks/lib/pretool-agent-contract.sh"
if [ -f "$PRETOOL_AGENT_CONTRACT" ]; then
    source "$PRETOOL_AGENT_CONTRACT"
fi

# Configuration
ENABLED="${WORK_CONTEXT_ENABLED:-1}"
VERBOSE="${WORK_CONTEXT_VERBOSE:-0}"
LIMIT="${WORK_CONTEXT_LIMIT:-5}"

# Live-first mode: Add staleness warnings for work context
# Controlled by GLOBAL_LIVE_FIRST or WORK_CONTEXT_LIVE_FIRST env vars
# Default: true (shows staleness warnings)
LIVE_FIRST="${WORK_CONTEXT_LIVE_FIRST:-${GLOBAL_LIVE_FIRST:-true}}"
WORK_INDEX_STALE_DAYS="${WORK_INDEX_STALE_DAYS:-7}"

# Read hook input
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat 2>/dev/null || true)
fi

normalize_pretool_agent_event "$HOOK_INPUT"

# Early exit if disabled or this is not an Agent tool event
if [ "$ENABLED" != "1" ] || [ -z "$HOOK_INPUT" ] || ! pretool_agent_event_is_agent; then
    emit_pretool_agent_noop
    exit 0
fi

AGENT_INPUT_JSON="${PRETOOL_TOOL_INPUT:-{}}"

# Determine org slug from various sources
ORG=""
if [ -n "$AGENT_INPUT_JSON" ] && command -v jq &>/dev/null; then
    ORG=$(echo "$AGENT_INPUT_JSON" | jq -r '.sf_org_context.detected_org // .org // .context.org // empty' 2>/dev/null || echo "")
fi

if [ -z "$ORG" ] && [ -n "${ORG_SLUG:-}" ]; then
    ORG="$ORG_SLUG"
elif [ -z "$ORG" ] && [ -n "${CLIENT_ORG:-}" ]; then
    ORG="$CLIENT_ORG"
elif [ -z "$ORG" ] && [ -n "${SF_TARGET_ORG:-}" ]; then
    ORG="$SF_TARGET_ORG"
fi

# Exit silently if no org context
if [ -z "$ORG" ]; then
    [ "$VERBOSE" = "1" ] && echo "[work-context] No ORG_SLUG set, skipping" >&2
    emit_pretool_agent_noop
    exit 0
fi

# Path to work-index-manager
MANAGER_SCRIPT="$PLUGIN_ROOT/scripts/lib/work-index-manager.js"
PROJECT_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"

# Check if manager script exists
if [ ! -f "$MANAGER_SCRIPT" ]; then
    [ "$VERBOSE" = "1" ] && echo "[work-context] Manager script not found: $MANAGER_SCRIPT" >&2
    emit_pretool_agent_noop
    exit 0
fi

# Check if node is available
if ! command -v node &> /dev/null; then
    [ "$VERBOSE" = "1" ] && echo "[work-context] Node.js not available" >&2
    emit_pretool_agent_noop
    exit 0
fi

# Check WORK_INDEX.yaml staleness in live-first mode
WORK_INDEX_FILE="$PROJECT_ROOT/orgs/$ORG/WORK_INDEX.yaml"
STALENESS_WARNING=""
if [ "$LIVE_FIRST" = "1" ] || [ "$LIVE_FIRST" = "true" ]; then
    if [ -f "$WORK_INDEX_FILE" ]; then
        INDEX_TIME=$(stat -c %Y "$WORK_INDEX_FILE" 2>/dev/null || stat -f %m "$WORK_INDEX_FILE" 2>/dev/null || echo 0)
        NOW=$(date +%s)
        INDEX_AGE_DAYS=$(( (NOW - INDEX_TIME) / 86400 ))

        if [ "$INDEX_AGE_DAYS" -gt "$WORK_INDEX_STALE_DAYS" ]; then
            STALENESS_WARNING="⚠️  Work index last updated ${INDEX_AGE_DAYS} days ago (threshold: ${WORK_INDEX_STALE_DAYS} days)"
        fi
    fi
fi

# Get context from manager
CONTEXT_JSON=""
if ! CONTEXT_JSON=$(node "$MANAGER_SCRIPT" context "$ORG" --json 2>/dev/null); then
    [ "$VERBOSE" = "1" ] && echo "[work-context] Failed to load context for $ORG" >&2
    emit_pretool_agent_noop
    exit 0
fi

if [ -z "$CONTEXT_JSON" ] || ! printf '%s' "$CONTEXT_JSON" | jq -e . >/dev/null 2>&1; then
    [ "$VERBOSE" = "1" ] && echo "[work-context] No structured context for $ORG" >&2
    emit_pretool_agent_noop
    exit 0
fi

CONTEXT_SUMMARY=$(printf '%s' "$CONTEXT_JSON" | jq -r '
  def lines(items):
    items
    | map("  - " + (.id // "unknown") + ": " + (.title // "Untitled"))
    | join("\n");
  [
    (if (.inProgress | length) > 0 then "In Progress:\n" + lines(.inProgress[:3]) else empty end),
    (if (.followUps | length) > 0 then "Follow-ups:\n" + lines(.followUps[:3]) else empty end),
    (if (.recent | length) > 0 then "Recent Work:\n" + lines(.recent[:3]) else empty end)
  ]
  | map(select(length > 0))
  | join("\n\n")
' 2>/dev/null || echo "")

if [ -z "$CONTEXT_SUMMARY" ]; then
    [ "$VERBOSE" = "1" ] && echo "[work-context] No work history for $ORG" >&2
    emit_pretool_agent_noop
    exit 0
fi

CONTEXT_PREAMBLE="[PROJECT MEMORY]
Org: ${ORG}
${CONTEXT_SUMMARY}
"

if [ -n "$STALENESS_WARNING" ]; then
    CONTEXT_PREAMBLE="${CONTEXT_PREAMBLE}${STALENESS_WARNING}
"
fi

CONTEXT_PREAMBLE="${CONTEXT_PREAMBLE}Use '/work-index list ${ORG}' for full history.

"

ENHANCED_INPUT=$(prepend_pretool_agent_prompt "$AGENT_INPUT_JSON" "[PROJECT MEMORY]" "$CONTEXT_PREAMBLE")
ENHANCED_INPUT=$(printf '%s' "$ENHANCED_INPUT" | jq -c \
    --arg org "$ORG" \
    --arg warning "$STALENESS_WARNING" \
    '. + {
        work_context: {
            org: $org,
            staleness_warning: (if $warning != "" then $warning else null end),
            counts: {
                in_progress: (.work_context.counts.in_progress // 0),
                follow_ups: (.work_context.counts.follow_ups // 0),
                recent: (.work_context.counts.recent // 0)
            }
        }
    }' 2>/dev/null || printf '%s' "$AGENT_INPUT_JSON")

ENHANCED_INPUT=$(printf '%s' "$ENHANCED_INPUT" | jq -c \
    --argjson context "$CONTEXT_JSON" \
    '.work_context.counts = {
        in_progress: ($context.inProgress | length),
        follow_ups: ($context.followUps | length),
        recent: ($context.recent | length)
      }' 2>/dev/null || printf '%s' "$ENHANCED_INPUT")

emit_pretool_agent_update \
  "$ENHANCED_INPUT" \
  "Injected work context for ${ORG}" \
  "WORK_CONTEXT: Added recent work and follow-up context for ${ORG}." \
  "WORK_CONTEXT" \
  "INFO"

exit 0
