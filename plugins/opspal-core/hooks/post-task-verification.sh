#!/usr/bin/env bash
#
# Post-Task Verification Hook
#
# Validates task deliverables before allowing success declarations.
# Can be used as:
# 1. Manual verification call: bash post-task-verification.sh <context-json>
# 2. Integrated into agent workflows
# 3. Called from success confirmation prompts
#
# Returns: JSON with validation result
#
# Exit Codes:
#   0 - Validation passed
#   1 - Validation failed (critical failures)
#   2 - Validation warnings (non-critical failures)
#   3 - Error running validation
#
# Addresses: Cohort #1 - Agent Behavior Issues ($20k ROI)
# Purpose: Block success messages until deliverable quality verified
#
# Created: 2025-10-24
# Version: 1.0.0

set -euo pipefail

if ! command -v jq &>/dev/null; then
    echo "[post-task-verification] jq not found, skipping" >&2
    exit 0
fi

# Get plugin root
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
VALIDATOR_SCRIPT="$PLUGIN_ROOT/opspal-core/scripts/lib/quality-gate-validator.js"

# OutputFormatter and HookLogger
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FORMATTER="$SCRIPT_DIR/../scripts/lib/output-formatter.js"
HOOK_LOGGER="$SCRIPT_DIR/../scripts/lib/hook-logger.js"
HOOK_NAME="post-task-verification"

# Check if validator exists
if [ ! -f "$VALIDATOR_SCRIPT" ]; then
    # Log validator missing
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Quality gate validator script not found" \
      "{\"validatorPath\":\"$VALIDATOR_SCRIPT\"}"

    if [ -f "$OUTPUT_FORMATTER" ]; then
      node "$OUTPUT_FORMATTER" error \
        "Quality Gate Validator Missing" \
        "Cannot validate task deliverables - validator script not found" \
        "Expected Path:$VALIDATOR_SCRIPT" \
        "Ensure opspal-core is fully installed,Verify script path is correct,Check plugin directory structure" \
        "Quality gate validation unavailable"
    fi

    echo '{"error": "Quality gate validator not found", "path": "'"$VALIDATOR_SCRIPT"'"}' >&2
    exit 3
fi

# Check if node is available
if ! command -v node &>/dev/null; then
    # Log Node.js missing
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Node.js not found - required for validation" "{}"

    if [ -f "$OUTPUT_FORMATTER" ]; then
      node "$OUTPUT_FORMATTER" error \
        "Node.js Not Found" \
        "Quality gate validation requires Node.js to be installed" \
        "" \
        "Install Node.js (https://nodejs.org),Ensure 'node' is in PATH,Verify installation with 'node --version'" \
        "Quality gate validation unavailable"
    fi

    echo '{"error": "Node.js not found - required for quality gate validation"}' >&2
    exit 3
fi

# Read input (either from stdin or first argument)
if [ -t 0 ]; then
    # Input from argument
    TASK_CONTEXT="${1:-{}}"
else
    # Input from stdin (JSON from Claude Code)
    TASK_CONTEXT=$(cat)
fi

# Parse task context to extract relevant information
TASK_TYPE=$(echo "$TASK_CONTEXT" | jq -r '.taskType // .type // "unknown"' 2>/dev/null || echo "unknown")
DELIVERABLE=$(echo "$TASK_CONTEXT" | jq -r '.deliverable // {}' 2>/dev/null || echo "{}")

# Create temporary files for validation
CONTEXT_FILE=$(mktemp)
DELIVERABLE_FILE=$(mktemp)
RESULT_FILE=$(mktemp)

trap "rm -f $CONTEXT_FILE $DELIVERABLE_FILE $RESULT_FILE" EXIT

# Write context and deliverable to temp files
echo "$TASK_CONTEXT" > "$CONTEXT_FILE"
echo "$DELIVERABLE" > "$DELIVERABLE_FILE"

# Run validation
if node "$VALIDATOR_SCRIPT" "$TASK_TYPE" "$DELIVERABLE_FILE" > "$RESULT_FILE" 2>&1; then
    VALIDATION_RESULT=$(cat "$RESULT_FILE")
    VALIDATION_PASSED=$(echo "$VALIDATION_RESULT" | jq -r '.passed // false' 2>/dev/null || echo "false")

    if [ "$VALIDATION_PASSED" = "true" ]; then
        # Validation passed
        [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "Task validation passed" \
          "{\"taskType\":\"$TASK_TYPE\"}"

        echo "$VALIDATION_RESULT"
        exit 0
    else
        # Check if there are critical failures
        CRITICAL_COUNT=$(echo "$VALIDATION_RESULT" | jq -r '.criticalFailures | length' 2>/dev/null || echo "0")
        WARNING_COUNT=$(echo "$VALIDATION_RESULT" | jq -r '.warnings | length' 2>/dev/null || echo "0")
        FAILURES=$(echo "$VALIDATION_RESULT" | jq -r '.criticalFailures[]? | .message' 2>/dev/null | head -3 | tr '\n' '; ')
        WARNINGS=$(echo "$VALIDATION_RESULT" | jq -r '.warnings[]? | .message' 2>/dev/null | head -3 | tr '\n' '; ')

        if [ "$CRITICAL_COUNT" -gt 0 ]; then
            # Critical failures - block task
            [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Task validation failed - critical failures" \
              "{\"taskType\":\"$TASK_TYPE\",\"criticalCount\":$CRITICAL_COUNT,\"failures\":\"$FAILURES\"}"

            if [ -f "$OUTPUT_FORMATTER" ]; then
              node "$OUTPUT_FORMATTER" error \
                "Task Validation Failed" \
                "Task deliverables have critical quality failures that must be resolved" \
                "Task Type:$TASK_TYPE,Critical Failures:$CRITICAL_COUNT,Failures:$FAILURES" \
                "Review failures in validation output,Fix critical issues before claiming success,Verify deliverable quality,Run validation again after fixes" \
                "Prevents incomplete deliverables • \$20K/year ROI"
            fi

            echo "$VALIDATION_RESULT"
            exit 1
        else
            # Only warnings - allow with warnings
            [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" warning "$HOOK_NAME" "Task validation passed with warnings" \
              "{\"taskType\":\"$TASK_TYPE\",\"warningCount\":$WARNING_COUNT,\"warnings\":\"$WARNINGS\"}"

            # Exit 2 pattern: Automatic feedback without blocking
            if [ -f "$OUTPUT_FORMATTER" ]; then
              node "$OUTPUT_FORMATTER" warning \
                "Task Validation Warnings" \
                "Task deliverables have non-critical quality warnings but validation passed" \
                "Task Type:$TASK_TYPE,Warnings:$WARNING_COUNT,Issues:$WARNINGS" \
                "Review warnings in validation output,Consider addressing warnings for better quality,Warnings won't block task completion" \
                ""
            fi

            echo "$VALIDATION_RESULT"
            exit 2
        fi
    fi
else
    # Validation script error
    ERROR_OUTPUT=$(cat "$RESULT_FILE")
    ERROR_PREVIEW=$(echo "$ERROR_OUTPUT" | head -c 200)

    # Log validation script failure
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Validation script execution failed" \
      "{\"taskType\":\"$TASK_TYPE\",\"errorPreview\":\"$ERROR_PREVIEW\"}"

    if [ -f "$OUTPUT_FORMATTER" ]; then
      node "$OUTPUT_FORMATTER" error \
        "Validation Script Failed" \
        "Quality gate validation script encountered an error during execution" \
        "Task Type:$TASK_TYPE,Error Preview:$ERROR_PREVIEW..." \
        "Check validation script logs,Verify validator script is not corrupted,Ensure deliverable format is correct,Review full error output above" \
        "Quality gate validation unavailable"
    fi

    echo '{"error": "Validation script failed", "output": "'"$(echo "$ERROR_OUTPUT" | tr '\n' ' ' | sed 's/"/\\"/g')"'"}' >&2
    exit 3
fi
