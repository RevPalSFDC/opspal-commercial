#!/bin/bash
# =============================================================================
# Post-Tool Validator (Unified)
# =============================================================================
#
# Purpose: Centralized post-tool validation with platform-specific rules
# Version: 1.0.0
# Created: 2026-01-09
#
# Event: PostToolUse
# Timeout: 5000ms
#
# This wrapper:
#   1. Runs output validation (data quality, contract compliance)
#   2. Loads platform-specific rules from validation/rules/
#   3. Applies platform-specific output validation
#   4. Returns validation result
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Always calculate from SCRIPT_DIR - CLAUDE_PLUGIN_ROOT may point to workspace root
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source error handler
ERROR_HANDLER="$PLUGIN_ROOT/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="post-tool-validator"
    set_lenient_mode 2>/dev/null || true
fi

ASSET_RESOLVER="$PLUGIN_ROOT/hooks/lib/resolve-encrypted-asset.sh"
if [[ -f "$ASSET_RESOLVER" ]]; then
    source "$ASSET_RESOLVER"
fi

# Configuration
SKIP_VALIDATION="${SKIP_TOOL_VALIDATION:-0}"
SKIP_ALL="${SKIP_VALIDATION:-0}"
VERBOSE="${VALIDATION_VERBOSE:-0}"
RULES_DIR="$SCRIPT_DIR/rules"
LOG_FILE="$HOME/.claude/logs/tool-validation.jsonl"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

# Read input
INPUT_DATA=$(cat)

if [[ -z "$INPUT_DATA" ]]; then
    echo '{}'
    exit 0
fi

# Skip if disabled
if [[ "$SKIP_ALL" = "1" ]] || [[ "$SKIP_VALIDATION" = "1" ]]; then
    echo '{}'
    exit 0
fi

# Extract tool name and result
TOOL_NAME=$(echo "$INPUT_DATA" | jq -r '.tool_name // ""' 2>/dev/null || echo "")
TOOL_RESULT=$(echo "$INPUT_DATA" | jq -c '.tool_response // ""' 2>/dev/null || echo "")

if [[ -z "$TOOL_NAME" ]]; then
    echo '{}'
    exit 0
fi

[[ "$VERBOSE" = "1" ]] && echo "[post-tool-validator] Tool: $TOOL_NAME" >&2

# =============================================================================
# Data Quality Validation
# =============================================================================

run_data_quality_validation() {
    local validator=""
    local salesforce_root="$PLUGIN_ROOT/../opspal-salesforce"

    if declare -F resolve_enc_asset >/dev/null 2>&1 && [[ -d "$salesforce_root" ]]; then
        validator=$(resolve_enc_asset "$salesforce_root" "opspal-salesforce" "scripts/lib/enhanced-data-quality-framework.js")
    fi

    if [[ -f "$validator" ]] && command -v node &>/dev/null; then
        # Only validate if result looks like data
        if echo "$TOOL_RESULT" | jq -e '.' &>/dev/null 2>&1; then
            local result
            result=$(echo "$INPUT_DATA" | node "$validator" validate-output 2>/dev/null || echo '{}')
            echo "$result"
        else
            echo '{}'
        fi
    else
        echo '{}'
    fi
}

# =============================================================================
# Platform-Specific Output Validation
# =============================================================================

detect_platform_from_tool() {
    local tool="$1"

    case "$tool" in
        mcp__salesforce*|mcp__sfdc*)
            echo "salesforce"
            ;;
        mcp__hubspot*)
            echo "hubspot"
            ;;
        mcp__marketo*)
            echo "marketo"
            ;;
        *)
            echo "generic"
            ;;
    esac
}

run_platform_output_validation() {
    local platform="$1"
    local rules_file="$RULES_DIR/${platform}.json"

    if [[ ! -f "$rules_file" ]]; then
        echo '{}'
        return
    fi

    # Load platform rules for output validation
    local output_rules
    output_rules=$(cat "$rules_file" 2>/dev/null | jq '.outputRules // []' 2>/dev/null || echo '[]')

    if [[ "$output_rules" = "[]" ]] || [[ -z "$output_rules" ]]; then
        echo '{}'
        return
    fi

    # Run platform-specific output validator if exists
    local platform_validator="$RULES_DIR/${platform}-output-validator.sh"
    if [[ -f "$platform_validator" ]] && [[ -x "$platform_validator" ]]; then
        echo "$INPUT_DATA" | bash "$platform_validator" "$rules_file" 2>/dev/null || echo '{}'
    else
        echo '{}'
    fi
}

# =============================================================================
# Main
# =============================================================================

# Detect platform
PLATFORM=$(detect_platform_from_tool "$TOOL_NAME")
[[ "$VERBOSE" = "1" ]] && echo "[post-tool-validator] Platform: $PLATFORM" >&2

# Run data quality validation (for query results)
DQ_RESULT=$(run_data_quality_validation)
DQ_WARNING=$(echo "$DQ_RESULT" | jq -r '.warning // false' 2>/dev/null || echo "false")

if [[ "$DQ_WARNING" = "true" ]]; then
    [[ "$VERBOSE" = "1" ]] && echo "[post-tool-validator] Data quality warning detected" >&2
fi

# Run platform-specific output validation
PLATFORM_RESULT=$(run_platform_output_validation "$PLATFORM")
PLATFORM_WARNING=$(echo "$PLATFORM_RESULT" | jq -r '.warning // false' 2>/dev/null || echo "false")

# Log result
jq -n \
    --arg tool "$TOOL_NAME" \
    --arg platform "$PLATFORM" \
    --arg ts "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
    --argjson dq_warning "$DQ_WARNING" \
    --argjson platform_warning "$PLATFORM_WARNING" \
    '{"timestamp":$ts,"tool":$tool,"platform":$platform,"type":"post","dqWarning":$dq_warning,"platformWarning":$platform_warning}' \
    >> "$LOG_FILE" 2>/dev/null || true

# Pass through (post-tool validation is advisory, not blocking)
echo '{}'
exit 0
