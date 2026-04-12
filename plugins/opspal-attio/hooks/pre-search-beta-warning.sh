#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Pre-Search Beta Warning Hook - Attio Plugin
#
# Trigger:  PreToolUse
# Matcher:  mcp__attio__records_search
# Purpose:  Warn that the global search endpoint is BETA and eventually
#           consistent. Advise using records_query for authoritative lookups.
#
# Behavior:
#   - Always fires — no conditional logic required
#   - Emits a standard BETA advisory warning with guidance on the limitations
#     of the search endpoint and when to use records_query instead
#   - Always allows (permissionDecision: allow)
#
# Attio search endpoint limitations:
#   - BETA: subject to breaking changes without notice
#   - Eventually consistent: newly created or updated records may not appear
#     for several seconds to minutes after write
#   - Max 25 results: cannot be paginated or expanded
#   - Matches: names, domains, emails, phone numbers, and social handles on
#     people and companies objects only
#   - Does not support: explicit filters, sorts, or field projections
#
# Output (fd 3):
#   { "hookSpecificOutput": { "hookEventName": "PreToolUse",
#                             "permissionDecision": "allow",
#                             "permissionDecisionReason": "...",
#                             "additionalContext": "..." } }
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

# ── Emit helper ───────────────────────────────────────────────────────────────

emit_beta_warning() {
    local reason="$1"
    local context="$2"

    if ! command -v jq >/dev/null 2>&1; then
        printf '{"suppressOutput":true,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"BETA ENDPOINT: records_search is eventually consistent and limited to 25 results. Use records_query with explicit filters for guaranteed-current data."}}\n' >&3
        return 0
    fi

    jq -nc \
        --arg reason "$reason" \
        --arg context "$context" \
        '{
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            permissionDecisionReason: $reason,
            additionalContext: $context
          }
        }' >&3
}

# ── Log to stderr ─────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "⚠️  ATTIO SEARCH — BETA ENDPOINT ADVISORY" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "  records_search is eventually consistent (max 25 results)." >&2
echo "  Use records_query for guaranteed-current data." >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

# ── Emit advisory (always allow) ─────────────────────────────────────────────
emit_beta_warning \
    "⚠️ BETA ENDPOINT: records_search is eventually consistent and limited to 25 results. For guaranteed-current data, use records_query with explicit filters instead. Search matches names, domains, emails, phone numbers, and social handles on people/companies." \
    "records_search limitations: (1) BETA — subject to breaking changes without notice. (2) Eventually consistent — records created or updated recently may not appear in results; index lag can range from seconds to minutes. (3) Hard cap of 25 results — cannot be paginated or expanded. (4) No explicit filters or sorts — results are ranked by relevance only. (5) Matches only: names, domains, email addresses, phone numbers, and social handles on people and companies objects. RECOMMENDATION: Use records_query with explicit filter operators for any authoritative, post-write verification, bulk processing, or paginated result set. Use records_search only for quick fuzzy name/email lookup when result freshness is not critical."

exit 0
