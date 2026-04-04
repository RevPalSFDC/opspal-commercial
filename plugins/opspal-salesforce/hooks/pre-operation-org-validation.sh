#!/usr/bin/env bash
#
# Pre-Operation Org Validation Hook
#
# Purpose: Verify Salesforce org context before SF CLI operations to prevent
#          wrong-org operations (identified in Reflection Cohort: Org Context Detection)
#
# Behavior:
#   - Detects org from working directory (instances/{org-alias}/...)
#   - Compares against --target-org or default org in command
#   - Warnings by default, blocks with STRICT_ORG_VALIDATION=1
#
# Configuration:
#   STRICT_ORG_VALIDATION=1  - Block operations with wrong org (exit code 7)
#   STRICT_ORG_VALIDATION=0  - Warning only (default)
#
# Version: 1.0.0
# Date: 2025-11-27
# Source: Reflection Cohort - Org Context Detection (Asana: 1212204317104114)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler
ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
if [ -f "$ERROR_HANDLER" ]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-operation-org-validation"
    set_lenient_mode 2>/dev/null || true
fi

# Read command input (if hook receives input)
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat 2>/dev/null || true)
fi

# Configuration
STRICT_MODE="${STRICT_ORG_VALIDATION:-0}"

# ============================================================================
# Org Detection Functions
# ============================================================================

# Detect org from current working directory
detect_org_from_path() {
    local cwd="${PWD:-$(pwd)}"

    # Pattern: instances/{org-alias}/{project-name}/
    local match=$(echo "$cwd" | grep -oE 'instances/[^/]+' | head -1)
    if [ -n "$match" ]; then
        echo "${match#instances/}"
        return 0
    fi

    echo ""
    return 1
}

# Detect org from cached session context
detect_org_from_session() {
    if [ -f "${TMPDIR:-/tmp}/sf-org-context.json" ] && command -v jq &>/dev/null; then
        local cached_org=$(jq -r '.alias // ""' "${TMPDIR:-/tmp}/sf-org-context.json" 2>/dev/null)
        if [ -n "$cached_org" ] && [ "$cached_org" != "null" ]; then
            echo "$cached_org"
            return 0
        fi
    fi
    echo ""
    return 1
}

# Extract --target-org from command
extract_target_org_from_command() {
    local cmd="$1"

    # Match --target-org <alias> or -o <alias>
    local match=$(echo "$cmd" | grep -oE '(--target-org|-o)\s+[^ ]+' | head -1 | awk '{print $2}')
    if [ -n "$match" ]; then
        echo "$match"
        return 0
    fi

    echo ""
    return 1
}

# ============================================================================
# Main Logic
# ============================================================================

# Get expected org from working directory
EXPECTED_ORG=$(detect_org_from_path)

if [ -z "$EXPECTED_ORG" ]; then
    # Not in an instance directory - skip validation
    # Pass through input if any
    [ -n "$HOOK_INPUT" ] && echo "$HOOK_INPUT"
    exit 0
fi

# Check if this is an SF CLI command (from hook input or environment)
COMMAND=""
if [ -n "$HOOK_INPUT" ] && command -v jq &>/dev/null; then
    COMMAND=$(echo "$HOOK_INPUT" | jq -r '.command // .message // ""' 2>/dev/null || echo "")
fi

# If no command to validate, just ensure context is set
if [ -z "$COMMAND" ] || [[ ! "$COMMAND" =~ ^(sf|sfdx)[[:space:]] ]]; then
    # Not an SF command - export expected org for downstream use
    export SF_EXPECTED_ORG="$EXPECTED_ORG"
    [ -n "$HOOK_INPUT" ] && echo "$HOOK_INPUT"
    exit 0
fi

# Extract target org from command
COMMAND_ORG=$(extract_target_org_from_command "$COMMAND")

# If no explicit target org, get from session/default
if [ -z "$COMMAND_ORG" ]; then
    COMMAND_ORG=$(detect_org_from_session)
fi

# ============================================================================
# Validation
# ============================================================================

if [ -n "$COMMAND_ORG" ] && [ "$COMMAND_ORG" != "$EXPECTED_ORG" ]; then
    # Org mismatch detected!

    if [ "$STRICT_MODE" = "1" ]; then
        # Blocking mode - fail with validation error
        echo "
⛔ ORG CONTEXT MISMATCH - OPERATION BLOCKED

   Working Directory: ...instances/${EXPECTED_ORG}/...
   Command Target Org: ${COMMAND_ORG}

   You are attempting to run a command against '${COMMAND_ORG}'
   while working in the '${EXPECTED_ORG}' project directory.

   To proceed:
   1. Add --target-org ${EXPECTED_ORG} to your command
   2. Or change to the correct project directory

   To disable strict validation: export STRICT_ORG_VALIDATION=0
" >&2
        exit 7  # EXIT_VALIDATION_FAILED
    else
        # Warning mode - log warning but allow operation
        echo "
⚠️  ORG CONTEXT WARNING

   Expected org (from path): ${EXPECTED_ORG}
   Command target org: ${COMMAND_ORG}

   Consider adding: --target-org ${EXPECTED_ORG}

   Enable strict mode: export STRICT_ORG_VALIDATION=1
" >&2
    fi
fi

# Export for downstream agents
export SF_EXPECTED_ORG="$EXPECTED_ORG"
export SF_COMMAND_ORG="$COMMAND_ORG"

# ============================================================================
# API Capability Pre-Check (tool-contract cohort fix)
# ============================================================================

# Check if this is a query that might fail due to object unavailability
CAPABILITY_CHECKER="${SCRIPT_DIR}/../scripts/lib/metadata-capability-checker.js"
ENABLE_CAPABILITY_CHECK="${ENABLE_CAPABILITY_CHECK:-1}"

if [ "$ENABLE_CAPABILITY_CHECK" = "1" ] && [ -f "$CAPABILITY_CHECKER" ]; then
    # Extract object name from SOQL query
    QUERY_OBJECT=""
    if [ -n "$COMMAND" ] && [[ "$COMMAND" =~ FROM[[:space:]]+([A-Za-z_][A-Za-z0-9_]*) ]]; then
        QUERY_OBJECT="${BASH_REMATCH[1]}"
    fi

    # If we identified an object, do a pre-check (cached per-org)
    if [ -n "$QUERY_OBJECT" ] && [ -n "$COMMAND_ORG" ]; then
        # Check if object is likely Tooling API (common ones)
        TOOLING_OBJECTS="FlowDefinitionView|FlowDefinition|FlowVersionView|ValidationRule|ApexTrigger|ApexClass|WorkflowRule|EntityDefinition|FieldDefinition|CustomField|CustomObject|Layout|FlexiPage"

        if [[ "$QUERY_OBJECT" =~ ^($TOOLING_OBJECTS)$ ]]; then
            # Run capability check (uses caching)
            CAPABILITY_RESULT=$(node "$CAPABILITY_CHECKER" "$COMMAND_ORG" check-object "$QUERY_OBJECT" 2>&1) || true

            if [[ "$CAPABILITY_RESULT" =~ "NOT available" ]]; then
                # Object unavailable - check for fallbacks
                FALLBACKS=$(node "$CAPABILITY_CHECKER" "$COMMAND_ORG" fallbacks "$QUERY_OBJECT" 2>&1) || true

                echo "
⚠️  API CAPABILITY WARNING

   Object '${QUERY_OBJECT}' may not be available in ${COMMAND_ORG}

   ${FALLBACKS}

   Consider running pre-validation:
   node $CAPABILITY_CHECKER $COMMAND_ORG pre-validate $QUERY_OBJECT

   Disable check: export ENABLE_CAPABILITY_CHECK=0
" >&2
            fi
        fi
    fi
fi

# Pass through hook input unchanged
[ -n "$HOOK_INPUT" ] && echo "$HOOK_INPUT"
exit 0
