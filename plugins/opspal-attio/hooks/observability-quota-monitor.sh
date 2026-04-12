#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Observability Quota Monitor Hook - Attio Plugin
#
# Trigger:  PostToolUse
# Matcher:  mcp__attio__records_query, mcp__attio__entries_query,
#           mcp__attio__records_list, mcp__attio__entries_list
# Purpose:  Track scored query budget consumption separately from the general
#           API quota. Monitors the 10-second score sliding window and warns
#           when query volume approaches or exceeds score limits.
#
# Behavior:
#   - Appends query timestamp and estimated score to a TSV tracking file:
#     /tmp/attio-query-score-tracking.tsv
#   - Counts queries in the last 10 seconds (the score window)
#   - If >15 queries in 10 seconds: emits a warn advisory
#   - If >20 queries in 10 seconds: emits a strong warning
#   - Cleans up entries older than 30 seconds from the tracking file
#   - Emits additionalContext with current query count and budget status
#   - Always exits 0 — monitoring never blocks
#
# Score Window: 10 seconds (Attio sliding window for scored query budget)
# Warn threshold: >15 scored queries in 10 seconds
# Critical threshold: >20 scored queries in 10 seconds
#
# Output (fd 3):
#   { "hookSpecificOutput": { "hookEventName": "PostToolUse",
#                             "additionalContext": "..." } }
#   or {} if within normal budget
#
# Exit Codes:
#   0 - Always exits 0
#
# Version: 1.0.0
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/lib/error-handler.sh"
    set_lenient_mode 2>/dev/null || true
fi

# ── Configuration ─────────────────────────────────────────────────────────────
SCORE_TRACKING_FILE="/tmp/attio-query-score-tracking.tsv"
SCORE_WINDOW_SECS=10
RETENTION_SECS=30
WARN_THRESHOLD=15
CRITICAL_THRESHOLD=20

# ── Emit helpers ──────────────────────────────────────────────────────────────

emit_noop() {
    printf '{}\n' >&3
}

emit_context() {
    local context="$1"

    if ! command -v jq >/dev/null 2>&1; then
        emit_noop
        return 0
    fi

    jq -nc \
        --arg context "$context" \
        '{
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: $context
          }
        }' >&3
}

# ── Read stdin ────────────────────────────────────────────────────────────────
HOOK_INPUT=""
if [[ ! -t 0 ]]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

# ── Extract tool name and estimate query score ────────────────────────────────
TOOL_NAME=""
if [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    TOOL_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
fi

if [[ -z "$TOOL_NAME" ]]; then
    TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
fi

# Only track Attio scored query operations
TRACKED_OPS="records_query entries_query records_list entries_list"
OPERATION="$(printf '%s' "$TOOL_NAME" | sed 's/mcp__attio__//' 2>/dev/null || echo '')"

IS_TRACKED=false
for op in $TRACKED_OPS; do
    if [[ "$OPERATION" == "$op" ]]; then
        IS_TRACKED=true
        break
    fi
done

if [[ "$IS_TRACKED" == "false" ]]; then
    emit_noop
    exit 0
fi

# ── Estimate query score based on operation type ──────────────────────────────
# records_query and entries_query are heavier than list operations
ESTIMATED_SCORE=1
if [[ "$OPERATION" == "records_query" ]] || [[ "$OPERATION" == "entries_query" ]]; then
    ESTIMATED_SCORE=2
fi

# ── Append to tracking file ───────────────────────────────────────────────────
NOW_EPOCH="$(date +%s)"

# Create tracking file if needed; append timestamp, operation, estimated score
printf '%s\t%s\t%s\n' "$NOW_EPOCH" "$OPERATION" "$ESTIMATED_SCORE" >> "$SCORE_TRACKING_FILE" 2>/dev/null || true

# ── Clean up entries older than RETENTION_SECS ────────────────────────────────
CUTOFF_EPOCH=$(( NOW_EPOCH - RETENTION_SECS ))

if [[ -f "$SCORE_TRACKING_FILE" ]]; then
    TMP_TRACKING="${SCORE_TRACKING_FILE}.tmp.$$"
    awk -F'\t' -v cutoff="$CUTOFF_EPOCH" '$1 > cutoff' "$SCORE_TRACKING_FILE" > "$TMP_TRACKING" 2>/dev/null || true
    mv "$TMP_TRACKING" "$SCORE_TRACKING_FILE" 2>/dev/null || true
fi

# ── Count queries in the last SCORE_WINDOW_SECS ───────────────────────────────
WINDOW_CUTOFF=$(( NOW_EPOCH - SCORE_WINDOW_SECS ))
QUERIES_IN_WINDOW=0

if [[ -f "$SCORE_TRACKING_FILE" ]]; then
    QUERIES_IN_WINDOW="$(awk -F'\t' -v cutoff="$WINDOW_CUTOFF" '$1 > cutoff { count++ } END { print count+0 }' \
        "$SCORE_TRACKING_FILE" 2>/dev/null || echo 0)"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "📊 ATTIO OBSERVABILITY — Query Score Monitor" >&2
echo "   Operation: ${OPERATION} (score: ~${ESTIMATED_SCORE})" >&2
echo "   Queries in last ${SCORE_WINDOW_SECS}s: ${QUERIES_IN_WINDOW} (warn: >${WARN_THRESHOLD}, critical: >${CRITICAL_THRESHOLD})" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

# ── Emit advisory based on thresholds ────────────────────────────────────────
if [[ "$QUERIES_IN_WINDOW" -gt "$CRITICAL_THRESHOLD" ]]; then
    MSG="🚨 ATTIO SCORE BUDGET CRITICAL: ${QUERIES_IN_WINDOW} scored queries executed in the last ${SCORE_WINDOW_SECS} seconds — exceeds critical threshold of ${CRITICAL_THRESHOLD}. The Attio score-based rate limiting system uses a ${SCORE_WINDOW_SECS}-second sliding window. At this rate you are at high risk of HTTP 429 responses on subsequent query operations. IMMEDIATE ACTIONS: (1) Pause queries for at least ${SCORE_WINDOW_SECS} seconds to allow the window to clear. (2) Reduce query frequency — batch or consolidate filters where possible. (3) Switch read-heavy workflows to use mcp__attio__records_list (lower base score) where full filtering is not required. Score tracking file: ${SCORE_TRACKING_FILE}."
    emit_context "$MSG"
elif [[ "$QUERIES_IN_WINDOW" -gt "$WARN_THRESHOLD" ]]; then
    MSG="⚠️ ATTIO SCORE BUDGET WARNING: ${QUERIES_IN_WINDOW} scored queries executed in the last ${SCORE_WINDOW_SECS} seconds — approaching critical threshold of ${CRITICAL_THRESHOLD}. Attio applies a score-based rate limit across a ${SCORE_WINDOW_SECS}-second sliding window. Complex queries (nested filters, multiple sorts, path filters) consume more score units. Recommendations: (1) Slow down — add pauses between queries if running a loop. (2) Simplify filter logic to reduce per-query score consumption. (3) Monitor for HTTP 429 responses and respect Retry-After headers. Current budget status: ${QUERIES_IN_WINDOW}/${CRITICAL_THRESHOLD} (warn threshold: ${WARN_THRESHOLD})."
    emit_context "$MSG"
else
    # Within budget — emit lightweight status context
    BUDGET_STATUS="OK"
    if [[ "$QUERIES_IN_WINDOW" -gt $(( WARN_THRESHOLD * 70 / 100 )) ]]; then
        BUDGET_STATUS="MODERATE"
    fi
    emit_context "Attio query score budget: ${QUERIES_IN_WINDOW} scored queries in last ${SCORE_WINDOW_SECS}s (status: ${BUDGET_STATUS}, warn: >${WARN_THRESHOLD}, critical: >${CRITICAL_THRESHOLD}). Operation: ${OPERATION}."
fi

exit 0
