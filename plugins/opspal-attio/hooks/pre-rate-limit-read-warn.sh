#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Pre-Rate-Limit Read Warn Hook - Attio Plugin
#
# Trigger:  PreToolUse
# Matcher:  mcp__attio__records_query, mcp__attio__entries_query
# Purpose:  Warn when a query contains complexity indicators that may exhaust
#           the score-based rate limit budget in the 10-second sliding window.
#
# Behavior:
#   - Reads tool_input from stdin
#   - Detects complexity indicators:
#       - Multiple sorts (>2 sort clauses)
#       - Complex nested filters ($or containing $and, or deeply nested)
#       - Path filters (cross-object filter traversal)
#   - If complexity found: emits advisory about query score limits and the
#     10-second sliding window; always allows
#   - Simple queries: emits {} (no advisory)
#   - Always permissionDecision: allow — never blocks
#
# Output (fd 3):
#   { "hookSpecificOutput": { "hookEventName": "PreToolUse",
#                             "permissionDecision": "allow",
#                             "additionalContext": "..." } }
#   or {} for simple queries
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

# ── Emit helpers ──────────────────────────────────────────────────────────────

emit_noop() {
    printf '{}\n' >&3
}

emit_advisory() {
    local context="$1"
    local reason="$2"

    if ! command -v jq >/dev/null 2>&1; then
        printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Complex query detected — monitor score-based rate limit budget."}}\n' >&3
        return 0
    fi

    jq -nc \
        --arg context "$context" \
        --arg reason "$reason" \
        '{
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            permissionDecisionReason: $reason,
            additionalContext: $context
          }
        }' >&3
}

# ── Read stdin ────────────────────────────────────────────────────────────────
HOOK_INPUT=""
if [[ ! -t 0 ]]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

if [[ -z "$HOOK_INPUT" ]]; then
    emit_noop
    exit 0
fi

# ── Check for jq ─────────────────────────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
    emit_noop
    exit 0
fi

# ── Extract tool_input ────────────────────────────────────────────────────────
TOOL_INPUT="$(printf '%s' "$HOOK_INPUT" | jq -c '.tool_input // .input // {}' 2>/dev/null || echo '{}')"

# ── Detect complexity indicators ──────────────────────────────────────────────
COMPLEXITY_FLAGS=()

# Check 1: Multiple sorts (>2 sort clauses)
SORT_COUNT="$(printf '%s' "$TOOL_INPUT" | jq '([.sorts] | flatten | length) // 0' 2>/dev/null || echo 0)"
if [[ "$SORT_COUNT" -gt 2 ]]; then
    COMPLEXITY_FLAGS+=("multiple-sorts:${SORT_COUNT}")
fi

# Check 2: Complex nested filters — $or with $and inside, or >2 levels deep
HAS_OR_AND="$(printf '%s' "$TOOL_INPUT" | jq -r '
    if (.filter | tostring | test("\\$or"; "g")) and (.filter | tostring | test("\\$and"; "g"))
    then "yes"
    else "no"
    end
' 2>/dev/null || echo 'no')"

if [[ "$HAS_OR_AND" == "yes" ]]; then
    COMPLEXITY_FLAGS+=("nested-or-and-filter")
fi

# Check 3: Path filters (cross-object traversal — filter key contains a dot or path separator)
HAS_PATH_FILTER="$(printf '%s' "$TOOL_INPUT" | jq -r '
    if .filter
    then (.filter | keys[] | select(test("\\."; "g"))) | "yes"
    else "no"
    end
' 2>/dev/null | head -1 || echo 'no')"

if [[ "$HAS_PATH_FILTER" == "yes" ]]; then
    COMPLEXITY_FLAGS+=("path-filter")
fi

# ── Log to stderr ─────────────────────────────────────────────────────────────
if [[ "${#COMPLEXITY_FLAGS[@]}" -gt 0 ]]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    echo "⚠️  ATTIO QUERY — SCORE BUDGET ADVISORY" >&2
    echo "   Complexity indicators: ${COMPLEXITY_FLAGS[*]}" >&2
    echo "   Sort count: ${SORT_COUNT} | Nested filter: ${HAS_OR_AND} | Path filter: ${HAS_PATH_FILTER}" >&2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

    FLAGS_STR="${COMPLEXITY_FLAGS[*]}"

    emit_advisory \
        "QUERY COMPLEXITY ADVISORY: This query contains complexity indicators [${FLAGS_STR}] that consume higher query scores in Attio's score-based rate limit system. Attio uses a 10-second sliding window for query scores (not a simple request count). Complex queries — those with multiple sorts, nested \$or/\$and filters, or cross-object path filters — each consume more score units than simple single-field queries. If you are running multiple complex queries in rapid succession, you may exhaust your score budget and receive HTTP 429 responses before hitting the raw requests-per-second limit. Recommendations: (1) Simplify filter logic where possible — use single-field equality filters over nested boolean logic. (2) Reduce sort clauses to 1-2 maximum. (3) For path filters, consider fetching the parent record first and then querying the target object directly. (4) Add a short pause (500ms-1s) between consecutive complex queries if running in a loop." \
        "Complex query detected (indicators: ${FLAGS_STR}) — monitoring score-based rate limit budget. Query allowed."
else
    emit_noop
fi

exit 0
