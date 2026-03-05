#!/bin/bash

# Pre-Deployment Flow Validation Hook
#
# Automatically validates all flows before deployment to prevent:
# - Unreachable branches
# - Infinite loops
# - Dead-end paths
# - Field usage order issues
#
# Usage: Runs automatically before 'sf project deploy' commands
# Can be disabled with: SKIP_FLOW_VALIDATION=1
#
# Exit Codes (standardized - see sf-exit-codes.sh):
#   0 - Validation passed
#   1 - Validation error (flow validation failed)
#
# Updated: 2026-01-15 - Standardized exit codes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized exit codes
if [[ -f "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh" ]]; then
    source "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh"
else
    EXIT_SUCCESS=0
    EXIT_VALIDATION_ERROR=1
fi

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-deploy-flow-validation"
fi

set -e

# Check if flow validation should be skipped
if [ "$SKIP_FLOW_VALIDATION" = "1" ]; then
    echo "⏭️  Flow validation skipped (SKIP_FLOW_VALIDATION=1)"
    exit 0
fi

# Get deployment source directory from command
DEPLOY_DIR="${SF_DEPLOY_DIR:-force-app/main/default}"

# Find all flow files in deployment
FLOW_FILES=$(find "$DEPLOY_DIR" -name "*.flow-meta.xml" 2>/dev/null || echo "")

if [ -z "$FLOW_FILES" ]; then
    echo "✓ No flows to validate"
    exit 0
fi

echo "🔍 Validating flows before deployment..."

FLOW_COUNT=$(echo "$FLOW_FILES" | wc -l)
VALIDATOR_SCRIPT=".claude-plugins/opspal-salesforce/scripts/lib/flow-decision-logic-analyzer.js"

if [ ! -f "$VALIDATOR_SCRIPT" ]; then
    echo "⚠️  Warning: Flow validator not found at $VALIDATOR_SCRIPT"
    exit 0
fi

VALIDATION_FAILED=0
ERRORS_FOUND=0
DUPLICATE_ERRORS=0

# Phase 2.2: Field reference validator with duplicate detection
FIELD_REF_VALIDATOR=".claude-plugins/opspal-salesforce/scripts/lib/flow-field-reference-validator.js"

# Validate each flow
while IFS= read -r flow_file; do
    if [ -n "$flow_file" ]; then
        FLOW_NAME=$(basename "$flow_file" .flow-meta.xml)
        FLOW_VALID=1

        # Run decision logic validator (suppress stdout, capture exit code)
        if node "$VALIDATOR_SCRIPT" "$flow_file" > "${TMPDIR:-/tmp}/flow-validation-$$.json" 2>&1; then
            echo "  ✅ $FLOW_NAME (logic)"
        else
            VALIDATION_FAILED=1
            ERRORS_FOUND=$((ERRORS_FOUND + 1))
            FLOW_VALID=0
            echo "  ❌ $FLOW_NAME (logic) - validation failed"

            # Show errors
            if [ -f "${TMPDIR:-/tmp}/flow-validation-$$.json" ]; then
                cat "${TMPDIR:-/tmp}/flow-validation-$$.json" | grep -E "ERROR|WARNING" | head -5
            fi
        fi

        # Phase 2.2: Check for duplicate field assignments
        if [ -f "$FIELD_REF_VALIDATOR" ]; then
            DUPLICATE_RESULT=$(node -e "
                const FlowFieldReferenceValidator = require('./$FIELD_REF_VALIDATOR');
                const validator = new FlowFieldReferenceValidator('', { verbose: false });
                validator.analyzeFieldAssignments('$flow_file').then(result => {
                    console.log(JSON.stringify({
                        severity: result.severity,
                        duplicateCount: result.duplicates.length,
                        sequentialCount: result.sequentialDuplicates.length,
                        conflictCount: result.conflictingValues.length,
                        duplicates: result.duplicates.slice(0, 3),
                        sequential: result.sequentialDuplicates.slice(0, 3),
                        conflicts: result.conflictingValues.slice(0, 3)
                    }));
                }).catch(err => {
                    console.log(JSON.stringify({ error: err.message }));
                });
            " 2>/dev/null || echo '{"severity":"NONE"}')

            DUP_SEVERITY=$(echo "$DUPLICATE_RESULT" | jq -r '.severity // "NONE"')
            DUP_COUNT=$(echo "$DUPLICATE_RESULT" | jq -r '.duplicateCount // 0')
            SEQ_COUNT=$(echo "$DUPLICATE_RESULT" | jq -r '.sequentialCount // 0')
            CONFLICT_COUNT=$(echo "$DUPLICATE_RESULT" | jq -r '.conflictCount // 0')

            if [ "$DUP_SEVERITY" = "ERROR" ]; then
                VALIDATION_FAILED=1
                DUPLICATE_ERRORS=$((DUPLICATE_ERRORS + 1))
                FLOW_VALID=0
                echo "  ❌ $FLOW_NAME (assignments) - $DUP_COUNT duplicate(s), $CONFLICT_COUNT conflict(s)"

                # Show duplicate details
                echo "$DUPLICATE_RESULT" | jq -r '.duplicates[] | "     ⚠️  \(.field) assigned \(.count) times in: \(.elements | join(", "))"' 2>/dev/null || true
                echo "$DUPLICATE_RESULT" | jq -r '.conflicts[] | "     ⚠️  \(.field) has conflicting values: \(.values | join(", "))"' 2>/dev/null || true
            elif [ "$DUP_SEVERITY" = "WARNING" ] && [ "$SEQ_COUNT" -gt 0 ]; then
                echo "  ⚠️  $FLOW_NAME (assignments) - $SEQ_COUNT sequential duplicate(s)"
            elif [ "$FLOW_VALID" -eq 1 ]; then
                echo "  ✅ $FLOW_NAME (assignments)"
            fi
        fi

        rm -f "${TMPDIR:-/tmp}/flow-validation-$$.json"
    fi
done <<< "$FLOW_FILES"

# Phase 3.3: Field Population Validation (optional, requires org connection)
POPULATION_WARNINGS=0
TARGET_ORG="${SF_TARGET_ORG:-${SF_TARGET_ORG}}"
ENABLE_POPULATION_CHECK="${ENABLE_FLOW_POPULATION_CHECK:-0}"  # Disabled by default (requires org)

if [ "$ENABLE_POPULATION_CHECK" = "1" ] && [ -n "$TARGET_ORG" ] && [ -f "$FIELD_REF_VALIDATOR" ]; then
    echo ""
    echo "📈 Phase 3.3: Field Population Analysis..."

    # Extract unique field references from all flows
    ALL_FIELDS=""
    while IFS= read -r flow_file; do
        if [ -n "$flow_file" ]; then
            # Extract field references from flow XML
            FLOW_FIELDS=$(grep -oE '\{![A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*\}' "$flow_file" 2>/dev/null | \
                sed 's/{!//g; s/}//g' | sort -u | tr '\n' ' ')
            ALL_FIELDS="${ALL_FIELDS} ${FLOW_FIELDS}"
        fi
    done <<< "$FLOW_FILES"

    # Get unique fields
    UNIQUE_FIELDS=$(echo "$ALL_FIELDS" | tr ' ' '\n' | sort -u | grep -v '^$' | head -20)

    if [ -n "$UNIQUE_FIELDS" ]; then
        FIELD_LIST=$(echo "$UNIQUE_FIELDS" | tr '\n' ' ')
        echo "  Analyzing population for: $(echo "$UNIQUE_FIELDS" | wc -l) field(s)"

        POP_RESULT=$(node "$FIELD_REF_VALIDATOR" population "$TARGET_ORG" $FIELD_LIST --json 2>&1) || true
        POP_ERRORS=$(echo "$POP_RESULT" | jq -r '.summary.errors | length // 0' 2>/dev/null || echo "0")
        POP_WARNINGS=$(echo "$POP_RESULT" | jq -r '.summary.warnings | length // 0' 2>/dev/null || echo "0")

        if [ "$POP_ERRORS" -gt 0 ]; then
            echo "  ❌ $POP_ERRORS field(s) with critically low population (<1%)"
            echo "$POP_RESULT" | jq -r '.summary.errors[]? | "     - \(.field): \(.rate // 0 | . * 100 | floor)%"' 2>/dev/null | head -5
            POPULATION_WARNINGS=$((POPULATION_WARNINGS + POP_ERRORS))
        fi

        if [ "$POP_WARNINGS" -gt 0 ]; then
            echo "  ⚠️  $POP_WARNINGS field(s) with low population (<10%)"
            echo "$POP_RESULT" | jq -r '.summary.warnings[]? | "     - \(.field): \((.rate // 0) * 100 | floor)%"' 2>/dev/null | head -5
        fi

        if [ "$POP_ERRORS" -eq 0 ] && [ "$POP_WARNINGS" -eq 0 ]; then
            echo "  ✅ All referenced fields have healthy population rates"
        fi
    else
        echo "  ℹ️  No field references to analyze"
    fi
fi

echo ""
echo "📊 Flow Validation Summary:"
echo "  Total flows: $FLOW_COUNT"
echo "  Logic errors: $ERRORS_FOUND"
echo "  Duplicate assignment errors: $DUPLICATE_ERRORS"
if [ "$ENABLE_POPULATION_CHECK" = "1" ]; then
    echo "  Population warnings: $POPULATION_WARNINGS"
fi
echo "  Passed: $((FLOW_COUNT - ERRORS_FOUND - DUPLICATE_ERRORS))"

if [ $VALIDATION_FAILED -eq 1 ]; then
    echo ""
    echo "❌ Flow validation failed - deployment blocked"
    echo ""
    echo "💡 To resolve:"
    if [ $ERRORS_FOUND -gt 0 ]; then
        echo "   - Fix logic validation errors (unreachable branches, infinite loops)"
    fi
    if [ $DUPLICATE_ERRORS -gt 0 ]; then
        echo "   - Remove duplicate field assignments (Phase 2.2 detection)"
        echo "   - Use 'analyzeFieldAssignments()' for detailed analysis"
    fi
    echo ""
    echo "⏭️  Skip validation with: SKIP_FLOW_VALIDATION=1"
    exit $EXIT_VALIDATION_ERROR
fi

echo "✅ All flows validated successfully"
exit $EXIT_SUCCESS
