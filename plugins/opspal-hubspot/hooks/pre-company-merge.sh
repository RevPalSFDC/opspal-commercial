#!/usr/bin/env bash

# Pre-Company Merge Validation Hook
# Auto-runs before company merge operations to detect SF sync blockers
# Blocks merge API if both companies have active Salesforce sync

# Hook debug support (all output to stderr)
if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
    set -x
    echo "[hook-debug] $(basename "$0") starting (pid=$$)" >&2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-company-merge"
fi

set -euo pipefail

# Hook configuration
HOOK_NAME="pre-company-merge"
if ! command -v jq &>/dev/null; then
    echo "[pre-company-merge] jq not found, skipping" >&2
    exit 0
fi

LOG_FILE="${HOME}/.claude/logs/hubspot/pre-company-merge.log"
PLUGIN_ROOT_DEFAULT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT_DEFAULT}"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Log function
log() {
    local line="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    printf '%s\n' "$line" >> "$LOG_FILE"
    printf '%s\n' "$line" >&2
}

# Extract company IDs from user input
# Looks for patterns like:
#   - "merge 12345 into 67890"
#   - "merge companies 12345 67890"
#   - "use merge API for 12345 and 67890"
extract_company_ids() {
    local input="$1"
    local ids=()

    # Pattern 1: "merge <id1> into <id2>"
    if [[ "$input" =~ merge[[:space:]]+([0-9]+)[[:space:]]+into[[:space:]]+([0-9]+) ]]; then
        echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]}" >&2
        return 0
    fi

    # Pattern 2: "merge companies <id1> <id2>"
    if [[ "$input" =~ merge[[:space:]]+companies[[:space:]]+([0-9]+)[[:space:]]+([0-9]+) ]]; then
        echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]}" >&2
        return 0
    fi

    # Pattern 3: Two company IDs with "merge" keyword
    if [[ "$input" =~ merge.*([0-9]{10,}).*([0-9]{10,}) ]]; then
        echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]}" >&2
        return 0
    fi

    # Pattern 4: Just two long IDs (likely company IDs)
    mapfile -t ids < <(printf '%s' "$input" | grep -oE '[0-9]{10,}' || true)
    if [[ ${#ids[@]} -eq 2 ]]; then
        echo "${ids[0]} ${ids[1]}" >&2
        return 0
    fi

    return 1
}

# Main validation logic
validate_merge() {
    local user_input="$1"

    log "=== Pre-Company Merge Validation ==="
    log "User input: $user_input"

    # Check if this is a merge operation
    if ! echo "$user_input" | grep -qi "merge"; then
        log "Not a merge operation - skipping validation"
        return 0
    fi

    # Extract company IDs
    local company_ids
    if ! company_ids=$(extract_company_ids "$user_input"); then
        log "Could not extract company IDs - allowing operation (may be indirect merge)"
        return 0
    fi

    read -r company1 company2 <<< "$company_ids"

    log "Detected merge operation: $company1 → $company2"
    log "Running merge strategy analysis..."

    # Run merge strategy selector
    cd "$PROJECT_ROOT"

    local strategy_output
    if ! strategy_output=$(node scripts/lib/hubspot-merge-strategy-selector.js "$company1" "$company2" --json 2>&1); then
        log "Warning: Merge strategy selector failed - $strategy_output"
        log "Allowing operation with warning"
        echo "${1:-}" >&2
        echo "⚠️  WARNING: Could not validate merge strategy" >&2
        echo "   Error: $strategy_output" >&2
        echo "   Proceeding anyway, but verify manually" >&2
        echo "${1:-}" >&2
        return 0
    fi

    # Parse strategy recommendation
    local strategy
    strategy=$(echo "$strategy_output" | jq -r '.strategy' 2>/dev/null)

    if [[ -z "$strategy" ]] || [[ "$strategy" == "null" ]]; then
        log "Could not parse strategy - allowing operation"
        return 0
    fi

    log "Strategy: $strategy"

    case "$strategy" in
        "STANDARD_MERGE")
            log "✅ Standard merge allowed"
            echo "${1:-}" >&2
            echo "✅ Merge Strategy: STANDARD_MERGE" >&2
            echo "   Safe to use HubSpot merge API" >&2
            echo "${1:-}" >&2
            return 0
            ;;

        "LIFT_AND_SHIFT")
            log "❌ BLOCKED: SF sync detected - lift-and-shift required"
            local reason
            reason=$(echo "$strategy_output" | jq -r '.reason' 2>/dev/null)

            echo "${1:-}" >&2
            echo "❌ MERGE BLOCKED: Salesforce Sync Constraint Detected" >&2
            echo "${1:-}" >&2
            echo "Reason: $reason" >&2
            echo "${1:-}" >&2
            echo "Both companies have active Salesforce sync. HubSpot merge API" >&2
            echo "will return HTTP 400 blocking the merge." >&2
            echo "${1:-}" >&2
            echo "Required Action: Use lift-and-shift pattern instead" >&2
            echo "${1:-}" >&2
            echo "Options:" >&2
            echo "  1. Run: /hsmerge $company1 $company2" >&2
            echo "     (Shows detailed strategy recommendation)" >&2
            echo "${1:-}" >&2
            echo "  2. Use lift-and-shift script:" >&2
            echo "     node scripts/lift-and-shift-company-duplicates.js --dry-run" >&2
            echo "${1:-}" >&2
            echo "  3. Check documentation:" >&2
            echo "     docs/SALESFORCE_SYNC_MERGE_CONSTRAINTS.md" >&2
            echo "${1:-}" >&2

            # Write blocked operation to audit log
            echo "{\"timestamp\":\"$(date -Iseconds)\",\"operation\":\"merge\",\"company1\":\"$company1\",\"company2\":\"$company2\",\"strategy\":\"$strategy\",\"blocked\":true}" >> ${HOME}/.claude/logs/hubspot/blocked-merges.jsonl

            return 1
            ;;

        "MANUAL_REVIEW")
            log "⚠️  CAUTION: Manual review required"
            local reason
            reason=$(echo "$strategy_output" | jq -r '.reason' 2>/dev/null)

            echo "${1:-}" >&2
            echo "⚠️  MERGE REQUIRES MANUAL REVIEW" >&2
            echo "${1:-}" >&2
            echo "Reason: $reason" >&2
            echo "${1:-}" >&2
            echo "These companies may be legitimately separate accounts." >&2
            echo "Verify in Salesforce before proceeding." >&2
            echo "${1:-}" >&2
            echo "Options:" >&2
            echo "  1. Verify in Salesforce: Are these truly duplicates?" >&2
            echo "  2. Run: /hsmerge $company1 $company2" >&2
            echo "  3. If separate accounts: DO NOT MERGE" >&2
            echo "  4. If duplicates in SF: Merge in Salesforce first" >&2
            echo "${1:-}" >&2
            echo "Type 'proceed' to override this warning (at your own risk)" >&2
            echo "${1:-}" >&2

            # Write warning to audit log
            echo "{\"timestamp\":\"$(date -Iseconds)\",\"operation\":\"merge\",\"company1\":\"$company1\",\"company2\":\"$company2\",\"strategy\":\"$strategy\",\"warning\":true}" >> ${HOME}/.claude/logs/hubspot/merge-warnings.jsonl

            return 1
            ;;

        *)
            log "Unknown strategy: $strategy - allowing operation"
            return 0
            ;;
    esac
}

# Execute validation
if validate_merge "$*"; then
    exit 0
else
    exit 1
fi
