#!/bin/bash
# post-field-deployment.sh - Verify field accessibility after deployment
#
# This hook runs after field deployment to ensure fields are actually
# accessible via API before proceeding. Addresses the reflection feedback
# about metadata propagation delays causing query failures.
#
# Version: 1.0.0
# Trigger: Post-deployment hook for CustomField metadata

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$SCRIPT_DIR")}"

# Configuration
WAIT_TIMEOUT="${FIELD_WAIT_TIMEOUT:-60}"
POLL_INTERVAL="${FIELD_POLL_INTERVAL:-5}"
VERBOSE="${FIELD_DEPLOYMENT_VERBOSE:-0}"
HOOK_INPUT="$(cat 2>/dev/null || true)"
COMMAND="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"

# This hook now runs behind a plain Bash matcher. Exit unless the completed
# command was a Salesforce deploy.
if [[ -z "$COMMAND" ]] || ! printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])sf[[:space:]]+project[[:space:]]+deploy([[:space:]]|$)'; then
    exit 0
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    if [[ "$VERBOSE" == "1" ]]; then
        echo -e "[post-field-deployment] $1" >&2
    fi
}

log_always() {
    echo -e "[post-field-deployment] $1" >&2
}

# Parse deployment info from environment or stdin
# Expected format: JSON with deployedFields array
parse_deployment_info() {
    local info="$1"

    # Try to extract deployed fields from the deployment result
    if command -v jq &>/dev/null; then
        echo "$info" | jq -r '.deployedFields[]? // empty' 2>/dev/null || echo ""
    else
        log "jq not available, skipping field validation"
        echo ""
    fi
}

# Extract fields from deployment command if present
extract_fields_from_context() {
    local context="${HOOK_CONTEXT:-}"

    # Check for common patterns in the deployment context
    # Pattern 1: sf project deploy with specific field paths
    if [[ "$context" =~ CustomField[/\\]([A-Za-z0-9_]+)\.([A-Za-z0-9_]+) ]]; then
        echo "${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
        return 0
    fi

    # Pattern 2: Object.Field__c pattern in context
    if [[ "$context" =~ ([A-Za-z0-9_]+)\.([A-Za-z0-9_]+__c) ]]; then
        echo "${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
        return 0
    fi

    return 1
}

# Main validation function
validate_field_accessibility() {
    local object_field="$1"
    local target_org="${2:-}"

    log "Validating field accessibility: $object_field"

    # Use the metadata-propagation-waiter.js for robust waiting
    local waiter_script="$PLUGIN_ROOT/scripts/lib/metadata-propagation-waiter.js"

    if [[ ! -f "$waiter_script" ]]; then
        log_always "${YELLOW}Warning: metadata-propagation-waiter.js not found${NC}"
        return 0
    fi

    local org_flag=""
    if [[ -n "$target_org" ]]; then
        org_flag="--org $target_org"
    fi

    # Wait for field to be queryable
    if node "$waiter_script" field "$object_field" $org_flag --timeout "$WAIT_TIMEOUT" --interval "$POLL_INTERVAL"; then
        log_always "${GREEN}✓ Field $object_field is accessible${NC}"
        return 0
    else
        log_always "${RED}✗ Field $object_field not accessible after ${WAIT_TIMEOUT}s${NC}"
        return 1
    fi
}

# Validate multiple fields
validate_fields() {
    local fields="$1"
    local target_org="${2:-}"
    local failed=0

    while IFS= read -r field; do
        [[ -z "$field" ]] && continue

        if ! validate_field_accessibility "$field" "$target_org"; then
            ((failed++))
        fi
    done <<< "$fields"

    return $failed
}

# Entry point
main() {
    local deployment_info="${1:-}"
    local target_org="${SF_TARGET_ORG:-${SF_TARGET_ORG:-}}"

    log "Post-field-deployment hook started"
    log "Target org: ${target_org:-default}"

    # Skip if disabled
    if [[ "${SKIP_FIELD_VALIDATION:-0}" == "1" ]]; then
        log "Field validation skipped (SKIP_FIELD_VALIDATION=1)"
        exit 0
    fi

    # Try to extract fields from various sources
    local fields=""

    # Source 1: Direct deployment info (JSON)
    if [[ -n "$deployment_info" ]]; then
        fields=$(parse_deployment_info "$deployment_info")
    fi

    # Source 2: Environment variable
    if [[ -z "$fields" ]] && [[ -n "${DEPLOYED_FIELDS:-}" ]]; then
        fields="$DEPLOYED_FIELDS"
    fi

    # Source 3: Hook context
    if [[ -z "$fields" ]]; then
        fields=$(extract_fields_from_context) || true
    fi

    # Source 4: Recently deployed (from sf command output)
    if [[ -z "$fields" ]] && [[ -f "${TMPDIR:-/tmp}/last-deploy-fields.txt" ]]; then
        fields=$(cat "${TMPDIR:-/tmp}/last-deploy-fields.txt" 2>/dev/null || true)
    fi

    if [[ -z "$fields" ]]; then
        log "No fields to validate detected"
        exit 0
    fi

    log "Fields to validate: $fields"

    # Validate all fields
    if validate_fields "$fields" "$target_org"; then
        log_always "${GREEN}All deployed fields are accessible${NC}"

        # Output success for Claude to see
        if [[ "${USE_HOOKSPECIFIC_OUTPUT:-0}" == "1" ]]; then
            cat <<EOF
{
  "hookSpecificOutput": {
    "systemMessage": "Post-deployment field validation: All fields are accessible and queryable.",
    "status": "success",
    "fieldsValidated": "$(echo "$fields" | tr '\n' ',' | sed 's/,$//')"
  }
}
EOF
        fi

        exit 0
    else
        log_always "${RED}Some fields failed accessibility validation${NC}"
        log_always "This may indicate metadata propagation delays."
        log_always "Consider waiting longer or checking field-level security."

        # Output warning for Claude to see
        if [[ "${USE_HOOKSPECIFIC_OUTPUT:-0}" == "1" ]]; then
            cat <<EOF
{
  "hookSpecificOutput": {
    "systemMessage": "WARNING: Some deployed fields are not yet accessible. Wait before querying or check field-level security.",
    "status": "warning",
    "recommendation": "Use metadata-propagation-waiter.js to wait for fields before querying"
  }
}
EOF
        fi

        # Exit with warning, not error (to not block workflow)
        exit 0
    fi
}

# Run if executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
