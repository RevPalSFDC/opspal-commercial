#!/bin/bash
#
# Pre-Flow Deployment Hook
#
# Validates Flow metadata before deployment to prevent:
# - API version compatibility issues (actionType='flow' in v65.0+)
# - Field reference errors (non-existent or unpopulated fields)
# - Formula type errors (redundant TEXT() wrapping)
# - State verification failures (Phase 3.1 - flow-state-synchronizer)
#
# Usage:
#   bash pre-flow-deployment.sh <flow-path> <org-alias>
#
# Returns:
#   0 - Validation passed, safe to deploy
#   1 - Validation failed, do not deploy
#   2 - Validation warnings, deploy with caution
#
# Created: 2025-10-24
# Version: 1.1.0 (Phase 3.1 State Synchronizer Integration)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/packages/opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../../opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-flow-deployment"
fi

set -euo pipefail

FLOW_PATH="${1:-}"
ORG_ALIAS="${2:-}"

if [ -z "$FLOW_PATH" ]; then
    echo "Usage: bash pre-flow-deployment.sh <flow-path> [org-alias]"
    exit 1
fi

if [ ! -f "$FLOW_PATH" ]; then
    echo "❌ Flow file not found: $FLOW_PATH"
    exit 1
fi

resolve_domain_root() {
    local dir="$1"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/scripts" ]]; then
            echo "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    echo "$1"
}

DOMAIN_ROOT="$(resolve_domain_root "$SCRIPT_DIR")"
PLUGIN_ROOT="$DOMAIN_ROOT"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    DOMAIN_NAME="$(basename "$DOMAIN_ROOT")"
    case "$CLAUDE_PLUGIN_ROOT" in
        *"/packages/domains/$DOMAIN_NAME"|*/"$DOMAIN_NAME"-plugin) PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT" ;;
    esac
fi

# Load stop prompt helper
source "$PLUGIN_ROOT/scripts/lib/hook-stop-prompt-helper.sh"

echo "=== Pre-Flow Deployment Validation ==="
echo ""
echo "Flow: $(basename "$FLOW_PATH")"
echo "Org: ${ORG_ALIAS:-"Not specified"}"
echo ""

HAS_ERRORS=false
HAS_WARNINGS=false
ERROR_DETAILS=()
WARNING_DETAILS=()

# ===================================================================
# Check 1: API Version Compatibility
# ===================================================================

echo "1. Checking API version compatibility..."

if [ -f "$PLUGIN_ROOT/scripts/lib/flow-api-version-validator.js" ]; then
    if node "$PLUGIN_ROOT/scripts/lib/flow-api-version-validator.js" validate "$FLOW_PATH" 2>/dev/null; then
        echo "   ✅ API compatibility check passed"
    else
        echo "   ❌ API compatibility issues detected"
        echo "   Run: node scripts/lib/flow-pattern-migrator.js migrate $FLOW_PATH"
        HAS_ERRORS=true
        ERROR_DETAILS+=("API version compatibility issues detected (actionType='flow' in v65.0+)")
    fi
else
    echo "   ⚠️  Validator not found - skipping"
    HAS_WARNINGS=true
    WARNING_DETAILS+=("API version validator not found - skipped")
fi

echo ""

# ===================================================================
# Check 2: Field References (if org provided)
# ===================================================================

if [ -n "$ORG_ALIAS" ]; then
    echo "2. Checking field references..."

    if [ -f "$PLUGIN_ROOT/scripts/lib/flow-field-reference-validator.js" ]; then
        # Create validator instance and validate with org connection
        VALIDATION_SCRIPT="
const FlowFieldReferenceValidator = require('$PLUGIN_ROOT/scripts/lib/flow-field-reference-validator.js');
const validator = new FlowFieldReferenceValidator('$ORG_ALIAS', { verbose: false, checkPopulation: true });

(async () => {
    try {
        const result = await validator.validate('$FLOW_PATH');
        console.log(JSON.stringify(result));
        process.exit(result.valid ? 0 : 1);
    } catch (error) {
        console.error(JSON.stringify({ errors: [{ message: error.message, severity: 'CRITICAL' }] }));
        process.exit(1);
    }
})();
"
        VALIDATION_OUTPUT=$(echo "$VALIDATION_SCRIPT" | node 2>&1)
        VALIDATOR_EXIT=$?

        if [ $VALIDATOR_EXIT -eq 0 ]; then
            # Parse JSON output
            VALIDATION_VALID=$(echo "$VALIDATION_OUTPUT" | jq -r '.valid // false')

            if [ "$VALIDATION_VALID" = "true" ]; then
                echo "   ✅ Field references validated"

                # Show warnings if any
                WARNING_COUNT=$(echo "$VALIDATION_OUTPUT" | jq -r '.warnings | length')
                if [ "$WARNING_COUNT" -gt 0 ]; then
                    echo "   ⚠️  $WARNING_COUNT warning(s) found:"
                    echo "$VALIDATION_OUTPUT" | jq -r '.warnings[] | "      - \(.message)"'
                    HAS_WARNINGS=true
                fi
            else
                # Validation failed
                ERROR_COUNT=$(echo "$VALIDATION_OUTPUT" | jq -r '.errors | length')
                echo "   ❌ Field reference validation failed ($ERROR_COUNT error(s))"
                echo "$VALIDATION_OUTPUT" | jq -r '.errors[] | "      - \(.message)"'
                HAS_ERRORS=true
                ERROR_DETAILS+=("Field reference validation failed: $ERROR_COUNT error(s)")
            fi
        else
            # Validator script execution failed
            echo "   ❌ Field reference validator execution failed"
            echo "   Error: $VALIDATION_OUTPUT"
            HAS_ERRORS=true
            ERROR_DETAILS+=("Field reference validator execution failed")
        fi
    else
        echo "   ⚠️  Validator not found - skipping"
        HAS_WARNINGS=true
        WARNING_DETAILS+=("Field reference validator not found - skipped")
    fi

    echo ""
else
    echo "2. Skipping field reference check (no org specified)"
    echo ""
fi

# ===================================================================
# Check 3: Formula Validation
# ===================================================================

echo "3. Checking flow formulas..."

if [ -f "$PLUGIN_ROOT/scripts/lib/flow-formula-validator.js" ]; then
    if [ -n "$ORG_ALIAS" ]; then
        if node "$PLUGIN_ROOT/scripts/lib/flow-formula-validator.js" "$FLOW_PATH" "$ORG_ALIAS" 2>/dev/null; then
            echo "   ✅ Formula validation passed"
        else
            echo "   ⚠️  Formula issues detected (check picklist TEXT() usage)"
            HAS_WARNINGS=true
            WARNING_DETAILS+=("Formula issues detected - check picklist TEXT() wrapping")
        fi
    else
        echo "   ⚠️  Org alias required for formula validation - skipping"
        WARNING_DETAILS+=("Formula validation skipped - org alias required")
    fi
else
    echo "   ⚠️  Validator not found - skipping"
    WARNING_DETAILS+=("Formula validator not found - skipped")
fi

echo ""

# ===================================================================
# Check 4: State Snapshot (Phase 3.1 - flow-state-synchronizer)
# ===================================================================

echo "4. Creating pre-deployment state snapshot..."

STATE_SYNCHRONIZER="$PLUGIN_ROOT/scripts/lib/flow-state-synchronizer.js"
ENABLE_STATE_SNAPSHOT="${ENABLE_FLOW_STATE_SNAPSHOT:-1}"

if [ "$ENABLE_STATE_SNAPSHOT" = "1" ] && [ -f "$STATE_SYNCHRONIZER" ] && [ -n "$ORG_ALIAS" ]; then
    FLOW_NAME=$(basename "$FLOW_PATH" .flow-meta.xml)

    # Create snapshot for rollback capability
    SNAPSHOT_RESULT=$(node "$STATE_SYNCHRONIZER" "$ORG_ALIAS" snapshot "$FLOW_NAME" --json 2>&1) || true
    SNAPSHOT_SUCCESS=$(echo "$SNAPSHOT_RESULT" | jq -r '.success // false' 2>/dev/null || echo "false")
    SNAPSHOT_ID=$(echo "$SNAPSHOT_RESULT" | jq -r '.snapshotId // ""' 2>/dev/null || echo "")

    if [ "$SNAPSHOT_SUCCESS" = "true" ] && [ -n "$SNAPSHOT_ID" ]; then
        echo "   ✅ State snapshot created: $SNAPSHOT_ID"
        echo "   📝 Rollback available: node $STATE_SYNCHRONIZER $ORG_ALIAS rollback $SNAPSHOT_ID"

        # Export for post-deployment verification
        export FLOW_SNAPSHOT_ID="$SNAPSHOT_ID"
        export FLOW_SNAPSHOT_ORG="$ORG_ALIAS"
    else
        echo "   ⚠️  State snapshot failed (deployment will continue)"
        WARNING_DETAILS+=("State snapshot failed - rollback may not be available")
        HAS_WARNINGS=true

        # Show error if available
        SNAPSHOT_ERROR=$(echo "$SNAPSHOT_RESULT" | jq -r '.error // ""' 2>/dev/null || echo "")
        if [ -n "$SNAPSHOT_ERROR" ]; then
            echo "   Error: $SNAPSHOT_ERROR"
        fi
    fi
elif [ -z "$ORG_ALIAS" ]; then
    echo "   ⚠️  Org alias required for state snapshot - skipping"
    WARNING_DETAILS+=("State snapshot skipped - org alias required")
elif [ "$ENABLE_STATE_SNAPSHOT" != "1" ]; then
    echo "   ⏭️  State snapshot disabled (ENABLE_FLOW_STATE_SNAPSHOT=0)"
else
    echo "   ⚠️  State synchronizer not found - skipping"
    WARNING_DETAILS+=("State synchronizer not found - skipped")
fi

echo ""

# ===================================================================
# Summary
# ===================================================================

echo "=== Validation Summary ==="
echo ""

if [ "$HAS_ERRORS" = true ]; then
    # Build stop prompt with error details
    FLOW_NAME=$(basename "$FLOW_PATH")

    build_stop_prompt \
        --title "Flow Deployment Validation Failed" \
        --severity error \
        --context "Flow: $FLOW_NAME - Found ${#ERROR_DETAILS[@]} critical error(s)" \
        --step "Fix API version compatibility issues" \
        --step "Run: node scripts/lib/flow-pattern-migrator.js migrate $FLOW_PATH" \
        --step "Re-validate Flow after fixes" \
        --step "Deploy after validation passes" \
        --tip "Use Flow Authoring Toolkit CLI for validation: flow validate $FLOW_PATH" \
        --code "node $PLUGIN_ROOT/scripts/lib/flow-pattern-migrator.js migrate $FLOW_PATH"

elif [ "$HAS_WARNINGS" = true ]; then
    # Build warning prompt with warning details
    FLOW_NAME=$(basename "$FLOW_PATH")
    WARNING_LIST=""
    for warning in "${WARNING_DETAILS[@]}"; do
        WARNING_LIST="${WARNING_LIST}\n- ${warning}"
    done

    stop_with_warning \
        "Flow Deployment Validation Warnings" \
        "Flow: $FLOW_NAME - Found ${#WARNING_DETAILS[@]} warning(s)$WARNING_LIST" \
        "Review warnings listed above" \
        "Provide org alias for complete validation: bash $0 $FLOW_PATH <org-alias>" \
        "Deploy if warnings acceptable: sf project deploy start --source-dir <path>" \
        "OR fix issues and re-validate"

else
    echo "✅ VALIDATION PASSED - Safe to deploy"
    echo ""
    echo "Flow is ready for deployment."
    exit 0
fi
