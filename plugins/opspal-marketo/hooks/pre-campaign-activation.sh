#!/usr/bin/env bash
set -euo pipefail
exec 3>&1 1>&2
if ! command -v jq &>/dev/null; then
    echo "[pre-campaign-activation] jq not found, skipping" >&2
    printf '{}' >&3
    exit 0
fi
#
# Hook: pre-campaign-activation
# Trigger: PreToolUse (mcp__marketo__campaign_activate)
# Purpose: Validates before campaign activation to prevent accidental or unsafe activations
#
# Validation Checks (shell-native, no MCP calls):
# 1. campaignId is present and numeric
# 2. API rate limit state — warns if approaching the daily threshold, blocks at 95%
# 3. Recent deactivation cooldown — blocks reactivation within COOLDOWN_MINUTES
#    if a matching deactivation event is recorded in portals/*/INSTANCE_CONTEXT.json
#
# Output (fd3):
# Pass:  {} (empty object)
# Block: {"blockExecution": true, "blockMessage": "<reason>"}
#
# Environment:
# MARKETO_CAMPAIGN_VALIDATION      — set to "0" to skip all checks (default: 1)
# MARKETO_STRICT_ACTIVATION        — set to "1" to block on rate-limit warnings (default: 0)
# MARKETO_ACTIVATION_COOLDOWN_MIN  — deactivation cooldown in minutes (default: 5)
# HOOK_DEBUG                       — set to "1" for verbose debug output on stderr
#

# ── debug helper ────────────────────────────────────────────────────────────
debug() { [[ "${HOOK_DEBUG:-0}" == "1" ]] && echo "[pre-campaign-activation] $*" >&2 || true; }

# ── source error handler ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    # shellcheck source=/dev/null
    source "${SCRIPT_DIR}/lib/error-handler.sh"
    debug "Sourced Marketo error-handler.sh"
elif [[ -f "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh" ]]; then
    # shellcheck source=/dev/null
    source "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh"
    debug "Sourced core error-handler.sh (fallback)"
fi

# ── configuration ────────────────────────────────────────────────────────────
VALIDATION_ENABLED="${MARKETO_CAMPAIGN_VALIDATION:-1}"
STRICT_MODE="${MARKETO_STRICT_ACTIVATION:-0}"
COOLDOWN_MINUTES="${MARKETO_ACTIVATION_COOLDOWN_MIN:-5}"
API_TRACKING_FILE="${HOME}/.marketo-api-tracking/usage.json"
DAILY_LIMIT="${MARKETO_API_DAILY_LIMIT:-50000}"
WARNING_THRESHOLD_PERCENT="${MARKETO_API_WARNING_THRESHOLD:-80}"

# ── helper: emit pass ────────────────────────────────────────────────────────
pass() { printf '{}' >&3; exit 0; }

# ── helper: emit block ───────────────────────────────────────────────────────
block() {
    local reason="$1"
    echo "[pre-campaign-activation] BLOCKED: ${reason}" >&2
    jq -nc --arg msg "$reason" '{"blockExecution": true, "blockMessage": $msg}' >&3
    exit 0
}

# ── early-exit: validation disabled ─────────────────────────────────────────
if [[ "$VALIDATION_ENABLED" != "1" ]]; then
    debug "Validation disabled via MARKETO_CAMPAIGN_VALIDATION"
    pass
fi

# ── read hook input from stdin ───────────────────────────────────────────────
# Claude Code delivers PreToolUse hook input as JSON on stdin:
#   { "tool_name": "mcp__marketo__campaign_activate", "tool_input": { "campaignId": 123 } }
# Fall back to CLAUDE_TOOL_ARGS env var for older runtimes.
HOOK_INPUT=""
if IFS= read -r -t 1 HOOK_INPUT 2>/dev/null; then
    debug "Read hook input from stdin"
else
    HOOK_INPUT="${CLAUDE_TOOL_ARGS:-}"
    debug "Using CLAUDE_TOOL_ARGS env fallback"
fi

# ── check 1: campaignId present and numeric ───────────────────────────────────
CAMPAIGN_ID=""
if [[ -n "$HOOK_INPUT" ]]; then
    # Try jq path: .tool_input.campaignId (stdin JSON shape)
    CAMPAIGN_ID=$(echo "$HOOK_INPUT" | jq -r '.tool_input.campaignId // empty' 2>/dev/null || true)
    # Fallback: flat .campaignId (env-var / CLAUDE_TOOL_ARGS shape)
    if [[ -z "$CAMPAIGN_ID" ]]; then
        CAMPAIGN_ID=$(echo "$HOOK_INPUT" | jq -r '.campaignId // empty' 2>/dev/null || true)
    fi
fi

debug "Extracted campaignId='${CAMPAIGN_ID}'"

if [[ -z "$CAMPAIGN_ID" ]]; then
    block "Campaign activation blocked: campaignId is missing from the tool input. Provide a numeric campaign ID."
fi

# Validate that campaignId is a positive integer
if ! [[ "$CAMPAIGN_ID" =~ ^[0-9]+$ ]] || [[ "$CAMPAIGN_ID" -eq 0 ]]; then
    block "Campaign activation blocked: campaignId '${CAMPAIGN_ID}' is not a valid positive integer."
fi

echo "[pre-campaign-activation] Checking campaign ID: ${CAMPAIGN_ID}" >&2

# ── check 2: API rate-limit state ─────────────────────────────────────────────
# Read from the same tracking file maintained by api-limit-monitor.sh.
# Blocks at >=95% daily usage; warns (and blocks in strict mode) at WARNING threshold.
if [[ -f "$API_TRACKING_FILE" ]]; then
    DAILY_CALLS=$(jq -r '.dailyCalls // 0' "$API_TRACKING_FILE" 2>/dev/null || echo "0")
    DAILY_RESET=$(jq -r '.dailyReset // ""' "$API_TRACKING_FILE" 2>/dev/null || echo "")
    TODAY=$(date +%Y-%m-%d)

    # Treat stale tracking date as a fresh day
    if [[ "$DAILY_RESET" != "$TODAY" ]]; then
        DAILY_CALLS=0
    fi

    DAILY_PERCENT=$(( (DAILY_CALLS * 100) / DAILY_LIMIT ))
    debug "API daily calls: ${DAILY_CALLS}/${DAILY_LIMIT} (${DAILY_PERCENT}%)"

    if [[ "$DAILY_PERCENT" -ge 95 ]]; then
        block "Campaign activation blocked: Marketo daily API quota at ${DAILY_PERCENT}% (${DAILY_CALLS}/${DAILY_LIMIT}). Activating a campaign now risks exhausting the quota mid-run. Wait until midnight UTC for the daily reset."
    fi

    if [[ "$DAILY_PERCENT" -ge "$WARNING_THRESHOLD_PERCENT" ]]; then
        echo "[pre-campaign-activation] WARNING: Daily API usage at ${DAILY_PERCENT}% — campaign execution will consume additional API calls." >&2
        if [[ "$STRICT_MODE" == "1" ]]; then
            block "Campaign activation blocked (strict mode): API daily usage at ${DAILY_PERCENT}% exceeds warning threshold. Set MARKETO_STRICT_ACTIVATION=0 to allow activation at high API usage."
        fi
    fi
else
    debug "API tracking file not found at ${API_TRACKING_FILE}; skipping rate-limit check"
fi

# ── check 3: recent deactivation cooldown ────────────────────────────────────
# Scans portals/*/INSTANCE_CONTEXT.json for a recent campaign_deactivate event
# matching this campaignId. Blocks reactivation within the cooldown window to
# prevent accidental rapid toggling that can corrupt campaign execution state.
#
# Expected JSON shape in INSTANCE_CONTEXT.json:
#   {
#     "recentEvents": [
#       { "type": "campaign_deactivate", "campaignId": 123, "timestamp": "2026-03-21T10:00:00Z" }
#     ]
#   }
PORTALS_DIR="${SCRIPT_DIR}/../portals"
COOLDOWN_SECONDS=$(( COOLDOWN_MINUTES * 60 ))
NOW_EPOCH=$(date +%s)
RECENT_DEACTIVATION_FOUND=0
DEACTIVATION_TIMESTAMP=""
DEACTIVATION_AGE_SECONDS=9999999

if [[ -d "$PORTALS_DIR" && "$COOLDOWN_MINUTES" -gt 0 ]]; then
    while IFS= read -r -d '' CTX_FILE; do
        debug "Checking context file: ${CTX_FILE}"
        DEACT_TS=$(jq -r --argjson cid "$CAMPAIGN_ID" '
            ( .recentEvents // [] )
            | map(select(
                .type == "campaign_deactivate"
                and ((.campaignId // 0) | tostring) == ($cid | tostring)
              ))
            | sort_by(.timestamp)
            | last
            | .timestamp // empty
        ' "$CTX_FILE" 2>/dev/null || true)

        if [[ -n "$DEACT_TS" ]]; then
            DEACT_EPOCH=$(date -d "$DEACT_TS" +%s 2>/dev/null || echo "0")
            if [[ "$DEACT_EPOCH" -gt 0 ]]; then
                AGE=$(( NOW_EPOCH - DEACT_EPOCH ))
                debug "Found deactivation at ${DEACT_TS} (${AGE}s ago)"
                # Track the most recent deactivation across all portal files
                if [[ "$AGE" -lt "$DEACTIVATION_AGE_SECONDS" ]]; then
                    DEACTIVATION_AGE_SECONDS="$AGE"
                    DEACTIVATION_TIMESTAMP="$DEACT_TS"
                fi
                if [[ "$AGE" -lt "$COOLDOWN_SECONDS" ]]; then
                    RECENT_DEACTIVATION_FOUND=1
                fi
            fi
        fi
    done < <(find "$PORTALS_DIR" -maxdepth 2 -name "INSTANCE_CONTEXT.json" -print0 2>/dev/null)
fi

if [[ "$RECENT_DEACTIVATION_FOUND" -eq 1 ]]; then
    REMAINING=$(( COOLDOWN_SECONDS - DEACTIVATION_AGE_SECONDS ))
    block "Campaign activation blocked: campaign ${CAMPAIGN_ID} was deactivated ${DEACTIVATION_AGE_SECONDS}s ago (at ${DEACTIVATION_TIMESTAMP}). Cooldown is ${COOLDOWN_MINUTES} min — ${REMAINING}s remaining. Set MARKETO_ACTIVATION_COOLDOWN_MIN=0 to disable cooldown enforcement."
fi

if [[ -n "$DEACTIVATION_TIMESTAMP" && "$DEACTIVATION_AGE_SECONDS" -lt 9999999 ]]; then
    echo "[pre-campaign-activation] Note: campaign ${CAMPAIGN_ID} was previously deactivated at ${DEACTIVATION_TIMESTAMP} (${DEACTIVATION_AGE_SECONDS}s ago — outside cooldown window)." >&2
fi

# ── all checks passed ─────────────────────────────────────────────────────────
echo "[pre-campaign-activation] Validation passed for campaign ${CAMPAIGN_ID}" >&2
pass
