#!/usr/bin/env bash

# Pre-Tool-Use Territory Rule Validator Hook
#
# Prevents BooleanFilter-related failures when modifying Territory2 assignment rules.
# Intercepts sf data operations on ObjectTerritory2AssignmentRuleItem and validates
# that no BooleanFilter exists before allowing the operation.
#
# Hook Type: PreToolUse
# Trigger: sf data create/update/delete on ObjectTerritory2AssignmentRuleItem
#
# ROI: $4,800/year (prevents 2 occurrences/week * 15 min each * 52 weeks)
#
# Environment:
#   SKIP_TERRITORY_VALIDATION=1    Skip validation (emergency bypass)
#   TERRITORY_VALIDATOR_VERBOSE=1  Enable verbose logging

set -euo pipefail

# Get script directory for relative imports
if ! command -v jq &>/dev/null; then
    echo "[pre-tool-use-territory-rule-validator] jq not found, skipping" >&2
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
VALIDATOR_SCRIPT="${PLUGIN_ROOT}/scripts/lib/territory-rule-validator.js"

# Logging functions
log_info() {
    echo "[territory-validator] $1" >&2
}

log_error() {
    echo "[territory-validator] ERROR: $1" >&2
}

log_debug() {
    if [[ "${TERRITORY_VALIDATOR_VERBOSE:-0}" == "1" ]]; then
        echo "[territory-validator] DEBUG: $1" >&2
    fi
}

# Check if validation should be skipped
if [[ "${SKIP_TERRITORY_VALIDATION:-0}" == "1" ]]; then
    log_debug "Validation skipped via SKIP_TERRITORY_VALIDATION"
    exit 0
fi

# Read tool input from stdin
TOOL_INPUT=$(cat)
log_debug "Tool input: $TOOL_INPUT"

# Extract tool name and command from input
TOOL_NAME=$(echo "$TOOL_INPUT" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
COMMAND=$(echo "$TOOL_INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")

log_debug "Tool: $TOOL_NAME, Command: $COMMAND"

emit_pretool_deny() {
    local message="$1"
    jq -nc \
      --arg message "$message" \
      '{
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: $message
        }
      }'
}

# Check if this is a territory rule item operation
is_territory_rule_item_operation() {
    local cmd="$1"

    # Check for sf data operations on ObjectTerritory2AssignmentRuleItem
    if echo "$cmd" | grep -qi "ObjectTerritory2AssignmentRuleItem"; then
        if echo "$cmd" | grep -qiE "(create|update|delete|upsert)"; then
            return 0
        fi
    fi

    # Check for direct record operations with sobject flag
    if echo "$cmd" | grep -qiE "(sf|sfdx)\s+data\s+(create|update|delete|upsert).*--sobject.*ObjectTerritory2AssignmentRuleItem"; then
        return 0
    fi

    return 1
}

# Extract parent rule ID from the operation
extract_parent_rule_id() {
    local cmd="$1"

    # Try to extract ObjectTerritory2AssignmentRule reference from values or where clause
    # Pattern: ObjectTerritory2AssignmentRule='0OH...' or ObjectTerritory2AssignmentRuleId='0OH...'
    local rule_id=$(echo "$cmd" | grep -oE "ObjectTerritory2AssignmentRule(Id)?=['\"]?(0OH[a-zA-Z0-9]{15}|0OH[a-zA-Z0-9]{12})['\"]?" | grep -oE "0OH[a-zA-Z0-9]+" | head -1)

    if [[ -n "$rule_id" ]]; then
        echo "$rule_id"
        return 0
    fi

    # Try to extract from record-id if updating existing item
    local record_id=$(echo "$cmd" | grep -oE "\-\-record-id\s+['\"]?(0OH[a-zA-Z0-9]+)['\"]?" | grep -oE "0OH[a-zA-Z0-9]+" | head -1)

    if [[ -n "$record_id" ]]; then
        # This is the item ID, we need to query for parent - return empty for now
        # The validator will need to handle this case
        log_debug "Found item record ID, will need to query for parent rule"
        echo ""
        return 0
    fi

    echo ""
    return 1
}

# Main validation logic
main() {
    # Only process if it's a Bash tool or similar
    if [[ "$TOOL_NAME" != "Bash" && "$TOOL_NAME" != "bash" && -n "$TOOL_NAME" ]]; then
        log_debug "Not a Bash tool, skipping"
        exit 0
    fi

    # Check if this is a territory rule item operation
    if ! is_territory_rule_item_operation "$COMMAND"; then
        log_debug "Not a territory rule item operation, skipping"
        exit 0
    fi

    log_info "Detected ObjectTerritory2AssignmentRuleItem operation"

    # Check if validator script exists
    if [[ ! -f "$VALIDATOR_SCRIPT" ]]; then
        log_error "Validator script not found: $VALIDATOR_SCRIPT"
        # Allow operation to proceed but warn
        exit 0
    fi

    # Extract parent rule ID
    RULE_ID=$(extract_parent_rule_id "$COMMAND")

    if [[ -z "$RULE_ID" ]]; then
        log_info "Could not extract parent rule ID from command"
        log_info "RECOMMENDATION: Before modifying rule items, check for BooleanFilter:"
        log_info "  node $VALIDATOR_SCRIPT check <ruleId>"
        # Allow operation but warn
        exit 0
    fi

    log_info "Validating rule: $RULE_ID"

    # Run the validator
    ORG_FLAG=""
    if [[ -n "${SF_ORG:-}" ]]; then
        ORG_FLAG="--org $SF_ORG"
    fi

    set +e
    VALIDATION_RESULT=$(node "$VALIDATOR_SCRIPT" check "$RULE_ID" $ORG_FLAG 2>&1)
    VALIDATOR_EXIT_CODE=$?
    set -e

    log_debug "Validation result: $VALIDATION_RESULT"

    if [[ $VALIDATOR_EXIT_CODE -ne 0 ]]; then
        # BooleanFilter exists - BLOCK the operation
        HAS_BOOLEAN_FILTER=$(echo "$VALIDATION_RESULT" | jq -r '.hasBooleanFilter // false' 2>/dev/null || echo "false")
        BOOLEAN_FILTER=$(echo "$VALIDATION_RESULT" | jq -r '.booleanFilter // ""' 2>/dev/null || echo "")

        if [[ "$HAS_BOOLEAN_FILTER" == "true" ]]; then
            log_error "BLOCKED: Rule $RULE_ID has BooleanFilter: $BOOLEAN_FILTER"
            log_error ""
            log_error "You cannot modify ObjectTerritory2AssignmentRuleItem records when the parent rule has a BooleanFilter."
            log_error ""
            log_error "Required workflow:"
            log_error "  1. SAVE the current BooleanFilter value"
            log_error "  2. CLEAR the BooleanFilter from the rule"
            log_error "  3. Make your item modifications"
            log_error "  4. RESTORE the BooleanFilter"
            log_error ""
            log_error "Get detailed workflow commands:"
            log_error "  node $VALIDATOR_SCRIPT workflow $RULE_ID $ORG_FLAG"
            log_error ""

            emit_pretool_deny "Cannot modify ObjectTerritory2AssignmentRuleItem records when BooleanFilter exists on parent rule $RULE_ID. Save the BooleanFilter, clear it, make the item changes, then restore it. For workflow details run: node $VALIDATOR_SCRIPT workflow $RULE_ID $ORG_FLAG"
            exit 0
        fi
    fi

    log_info "OK: No BooleanFilter on rule. Operation can proceed."
    exit 0
}

main "$@"
