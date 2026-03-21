#!/bin/bash

# Pre-Deployment Flow Validation Hook
#
# Automatically validates all flows before deployment to prevent:
# - Unreachable branches
# - Infinite loops
# - Dead-end paths
# - Structural Flow XML errors
# - Broken field references
#
# Usage: Runs automatically before 'sf project deploy' commands
# Can be disabled with: SKIP_FLOW_VALIDATION=1
#
# Exit Codes (standardized - see sf-exit-codes.sh):
#   0 - Validation passed
#   1 - Validation error (flow validation failed)
#
# Updated: 2026-03-13 - Added structural and field-existence validation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
PLUGIN_PARENT="$(cd "${PLUGIN_ROOT}/.." && pwd)"
CORE_ROOT="${PLUGIN_PARENT}/opspal-core"

# Source standardized exit codes
if [[ -f "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh" ]]; then
    source "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh"
else
    EXIT_SUCCESS=0
    EXIT_VALIDATION_ERROR=1
fi

# Source standardized error handler for centralized logging
ERROR_HANDLER="${CORE_ROOT}/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-deploy-flow-validation"
fi

set -e

HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat 2>/dev/null || true)
fi

is_deploy_scope_command() {
    local command="$1"
    printf '%s' "$command" | grep -qE '(^|[[:space:]])sf[[:space:]]+project[[:space:]]+deploy[[:space:]]+(start|validate|preview)([[:space:]]|$)'
}

# Redirect all informational output to stderr — PreToolUse hooks must output JSON or nothing on stdout
exec 3>&1 1>&2

emit_block() {
    local message="$1"
    jq -Rn --arg message "$message" '{
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $message
      }
    }' >&3
}

DEPLOY_COMMAND=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")
if [[ -z "$DEPLOY_COMMAND" ]] || ! is_deploy_scope_command "$DEPLOY_COMMAND"; then
    exit 0
fi

# Fallback deploy scope if the shared resolver is unavailable
DEPLOY_DIR="${SF_DEPLOY_DIR:-force-app/main/default}"
TARGET_ORG="${SF_TARGET_ORG:-}"

VALIDATOR_SCRIPT="${PLUGIN_ROOT}/scripts/lib/flow-decision-logic-analyzer.js"
STRUCTURAL_VALIDATOR="${PLUGIN_ROOT}/scripts/lib/flow-xml-validator.js"
FIELD_REF_VALIDATOR="${PLUGIN_ROOT}/scripts/lib/flow-field-reference-validator.js"
DEPLOY_SCOPE_RESOLVER="${PLUGIN_ROOT}/scripts/lib/deploy-scope-resolver.js"
HOOK_CWD=$(printf '%s' "$HOOK_INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")
[ -n "$HOOK_CWD" ] || HOOK_CWD="$(pwd)"

SCOPE_ANALYSIS=""
if [ -f "$DEPLOY_SCOPE_RESOLVER" ] && command -v node >/dev/null; then
    SCOPE_ANALYSIS=$(node "$DEPLOY_SCOPE_RESOLVER" analyze --command "$DEPLOY_COMMAND" --cwd "$HOOK_CWD" 2>/dev/null || echo "")
fi

COMMAND_SKIP="false"
SCOPE_SUMMARY=""
if [ -n "$SCOPE_ANALYSIS" ] && printf '%s' "$SCOPE_ANALYSIS" | jq -e . >/dev/null 2>&1; then
    COMMAND_SKIP=$(printf '%s' "$SCOPE_ANALYSIS" | jq -r '.envAssignments.SKIP_FLOW_VALIDATION // "false"' 2>/dev/null || echo "false")
    TARGET_ORG=$(printf '%s' "$SCOPE_ANALYSIS" | jq -r '.targetOrg // empty' 2>/dev/null || echo "")
    SCOPE_SUMMARY=$(printf '%s' "$SCOPE_ANALYSIS" | jq -r '.selectedPaths[]?' 2>/dev/null | sed "s#^${HOOK_CWD}/##")
    SCOPE_WARNINGS=$(printf '%s' "$SCOPE_ANALYSIS" | jq -r '.warnings[]?' 2>/dev/null || true)
    if [ -n "$SCOPE_WARNINGS" ]; then
        while IFS= read -r warning; do
            [ -n "$warning" ] && echo "ℹ️  $warning"
        done <<< "$SCOPE_WARNINGS"
    fi
    FLOW_FILES=$(printf '%s' "$SCOPE_ANALYSIS" | jq -r '.flowFiles[]?' 2>/dev/null || true)
else
    FLOW_FILES=$(find "$DEPLOY_DIR" -name "*.flow-meta.xml" 2>/dev/null || echo "")
fi

if [ "$SKIP_FLOW_VALIDATION" = "1" ] || [ "$COMMAND_SKIP" = "1" ]; then
    echo "⏭️  Flow validation skipped (SKIP_FLOW_VALIDATION=1)"
    exit 0
fi

if [ -z "$FLOW_FILES" ]; then
    echo "✓ No flows to validate in deploy scope"
    exit 0
fi

echo "🔍 Validating flows before deployment..."

if [ -n "$SCOPE_SUMMARY" ]; then
    echo "📦 Deploy scope:"
    while IFS= read -r scope_path; do
        [ -n "$scope_path" ] && echo "  - $scope_path"
    done <<< "$SCOPE_SUMMARY"
fi

FLOW_COUNT=$(printf '%s\n' "$FLOW_FILES" | sed '/^$/d' | wc -l | tr -d ' ')

if [ ! -f "$VALIDATOR_SCRIPT" ]; then
    echo "⚠️  Warning: Flow logic validator not found at $VALIDATOR_SCRIPT"
fi

if [ ! -f "$STRUCTURAL_VALIDATOR" ]; then
    echo "⚠️  Warning: Flow structural validator not found at $STRUCTURAL_VALIDATOR"
fi

if [ ! -f "$FIELD_REF_VALIDATOR" ]; then
    echo "⚠️  Warning: Flow field reference validator not found at $FIELD_REF_VALIDATOR"
fi

VALIDATION_FAILED=0
LOGIC_ERRORS=0
DUPLICATE_ERRORS=0
STRUCTURAL_ERRORS=0
FIELD_EXISTENCE_ERRORS=0
FLOWS_PASSED=0

if [ -z "$TARGET_ORG" ]; then
    echo "ℹ️  Field existence validation skipped (SF_TARGET_ORG not set)"
fi

while IFS= read -r flow_file; do
    if [ -z "$flow_file" ]; then
        continue
    fi

    FLOW_NAME=$(basename "$flow_file" .flow-meta.xml)
    FLOW_FAILED=0
    TMP_OUTPUT="${TMPDIR:-/tmp}/flow-validation-$$.json"

    # Phase 1: Decision logic validation
    if [ -f "$VALIDATOR_SCRIPT" ]; then
        if node "$VALIDATOR_SCRIPT" "$flow_file" > "$TMP_OUTPUT" 2>&1; then
            echo "  ✅ $FLOW_NAME (logic)"
        else
            VALIDATION_FAILED=1
            FLOW_FAILED=1
            LOGIC_ERRORS=$((LOGIC_ERRORS + 1))
            echo "  ❌ $FLOW_NAME (logic) - validation failed"
            if [ -f "$TMP_OUTPUT" ]; then
                grep -E "ERROR|WARNING" "$TMP_OUTPUT" | head -5 || true
            fi
        fi
    fi

    # Phase 1.5: Structural XML validation
    if [ -f "$STRUCTURAL_VALIDATOR" ]; then
        STRUCT_RESULT=$(node "$STRUCTURAL_VALIDATOR" "$flow_file" --json 2>/dev/null || true)
        if [ -z "$STRUCT_RESULT" ]; then
            STRUCT_RESULT='{"valid":true,"errors":[],"warnings":[]}'
        fi

        STRUCT_ERROR_COUNT=$(echo "$STRUCT_RESULT" | jq -r '.errors | length // 0' 2>/dev/null || echo "0")
        if [ "$STRUCT_ERROR_COUNT" -gt 0 ]; then
            VALIDATION_FAILED=1
            FLOW_FAILED=1
            STRUCTURAL_ERRORS=$((STRUCTURAL_ERRORS + STRUCT_ERROR_COUNT))
            echo "  ❌ $FLOW_NAME (structure) - $STRUCT_ERROR_COUNT error(s)"
            echo "$STRUCT_RESULT" | jq -r '.errors[:3][]? | "     - [\(.type)] \(.message)"' 2>/dev/null || true
        else
            echo "  ✅ $FLOW_NAME (structure)"
        fi
    fi

    # Phase 2.2: Duplicate assignment detection
    if [ -f "$FIELD_REF_VALIDATOR" ]; then
        DUPLICATE_RESULT=$(node "$FIELD_REF_VALIDATOR" duplicates "$flow_file" --json 2>/dev/null || true)
        if [ -z "$DUPLICATE_RESULT" ]; then
            DUPLICATE_RESULT='{"severity":"NONE","duplicateCount":0,"duplicates":[],"sequentialDuplicates":[],"conflictingValues":[]}'
        fi

        DUP_SEVERITY=$(echo "$DUPLICATE_RESULT" | jq -r '.severity // "NONE"' 2>/dev/null || echo "NONE")
        DUP_COUNT=$(echo "$DUPLICATE_RESULT" | jq -r '.duplicates | length // 0' 2>/dev/null || echo "0")
        SEQ_COUNT=$(echo "$DUPLICATE_RESULT" | jq -r '.sequentialDuplicates | length // 0' 2>/dev/null || echo "0")
        CONFLICT_COUNT=$(echo "$DUPLICATE_RESULT" | jq -r '.conflictingValues | length // 0' 2>/dev/null || echo "0")

        if [ "$DUP_SEVERITY" = "ERROR" ]; then
            VALIDATION_FAILED=1
            FLOW_FAILED=1
            DUPLICATE_ERRORS=$((DUPLICATE_ERRORS + DUP_COUNT + CONFLICT_COUNT))
            echo "  ❌ $FLOW_NAME (assignments) - $DUP_COUNT duplicate(s), $CONFLICT_COUNT conflict(s)"
            echo "$DUPLICATE_RESULT" | jq -r '.duplicates[:3][]? | "     ⚠️  \(.field) assigned \(.count) times in: \(.elements | join(", "))"' 2>/dev/null || true
            echo "$DUPLICATE_RESULT" | jq -r '.conflictingValues[:3][]? | "     ⚠️  \(.field) has conflicting values: \(.values | join(", "))"' 2>/dev/null || true
        elif [ "$DUP_SEVERITY" = "WARNING" ] && [ "$SEQ_COUNT" -gt 0 ]; then
            echo "  ⚠️  $FLOW_NAME (assignments) - $SEQ_COUNT sequential duplicate(s)"
        else
            echo "  ✅ $FLOW_NAME (assignments)"
        fi
    fi

    # Phase 2.3: Live field existence validation
    if [ -n "$TARGET_ORG" ] && [ -f "$FIELD_REF_VALIDATOR" ]; then
        EXISTENCE_RESULT=$(node "$FIELD_REF_VALIDATOR" validate "$flow_file" --org "$TARGET_ORG" --existence-only --json 2>/dev/null || true)
        if [ -z "$EXISTENCE_RESULT" ]; then
            EXISTENCE_RESULT='{"valid":true,"errors":[],"warnings":[],"summary":{"blockingErrors":0,"fields":[]}}'
        fi

        NOT_FOUND_COUNT=$(echo "$EXISTENCE_RESULT" | jq -r '.errors | length // 0' 2>/dev/null || echo "0")
        if [ "$NOT_FOUND_COUNT" -gt 0 ]; then
            VALIDATION_FAILED=1
            FLOW_FAILED=1
            FIELD_EXISTENCE_ERRORS=$((FIELD_EXISTENCE_ERRORS + NOT_FOUND_COUNT))
            echo "  ❌ $FLOW_NAME (field existence) - $NOT_FOUND_COUNT blocking error(s)"
            echo "$EXISTENCE_RESULT" | jq -r '.errors[:5][]? | "     - \(.object // "Unknown").\(.field // "Unknown"): \(.message)"' 2>/dev/null || true
        else
            echo "  ✅ $FLOW_NAME (field existence)"
        fi
    fi

    rm -f "$TMP_OUTPUT"

    if [ "$FLOW_FAILED" -eq 0 ]; then
        FLOWS_PASSED=$((FLOWS_PASSED + 1))
    fi
done <<< "$FLOW_FILES"

echo ""
echo "📊 Flow Validation Summary:"
echo "  Total flows: $FLOW_COUNT"
echo "  Logic errors: $LOGIC_ERRORS"
echo "  Structural errors: $STRUCTURAL_ERRORS"
echo "  Duplicate assignment errors: $DUPLICATE_ERRORS"
if [ -n "$TARGET_ORG" ]; then
    echo "  Field existence errors: $FIELD_EXISTENCE_ERRORS"
else
    echo "  Field existence errors: skipped (no target org)"
fi
echo "  Passed flows: $FLOWS_PASSED"

if [ $VALIDATION_FAILED -eq 1 ]; then
    echo ""
    echo "❌ Flow validation failed - deployment blocked"
    echo ""
    echo "💡 To resolve:"
    if [ $LOGIC_ERRORS -gt 0 ]; then
        echo "   - Fix logic validation errors (unreachable branches, infinite loops)"
    fi
    if [ $STRUCTURAL_ERRORS -gt 0 ]; then
        echo "   - Fix structural Flow XML issues before deploy"
    fi
    if [ $DUPLICATE_ERRORS -gt 0 ]; then
        echo "   - Remove duplicate field assignments and resolve conflicting values"
    fi
    if [ $FIELD_EXISTENCE_ERRORS -gt 0 ]; then
        echo "   - Deploy missing fields before deploying or activating flows"
    fi
    echo ""
    echo "⏭️  Skip validation with: SKIP_FLOW_VALIDATION=1"
    emit_block "Flow validation failed: $LOGIC_ERRORS logic error(s), $STRUCTURAL_ERRORS structural error(s), $DUPLICATE_ERRORS duplicate assignment error(s), $FIELD_EXISTENCE_ERRORS field existence error(s). Fix issues or set SKIP_FLOW_VALIDATION=1 to bypass."
    exit 0
fi

echo "✅ All flows validated successfully"
exit $EXIT_SUCCESS
