#!/bin/bash
# =============================================================================
# Pre-Tool Validator (Unified)
# =============================================================================
#
# Purpose: Centralized pre-tool validation with platform-specific rules
# Version: 1.0.0
# Created: 2026-01-09
#
# Event: PreToolUse
# Timeout: 5000ms
#
# This wrapper:
#   1. Runs contract validation (tool-contract-validator.js)
#   2. Loads platform-specific rules from validation/rules/
#   3. Applies platform-specific validation if detected
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
    HOOK_NAME="pre-tool-validator"
    set_lenient_mode 2>/dev/null || true
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

# Extract tool name
TOOL_NAME=$(echo "$INPUT_DATA" | jq -r '.tool_name // ""' 2>/dev/null || echo "")

if [[ -z "$TOOL_NAME" ]]; then
    echo '{}'
    exit 0
fi

[[ "$VERBOSE" = "1" ]] && echo "[pre-tool-validator] Tool: $TOOL_NAME" >&2

# =============================================================================
# Core Contract Validation
# =============================================================================

run_contract_validation() {
    local validator="$PLUGIN_ROOT/scripts/lib/tool-contract-validator.js"

    if [[ -f "$validator" ]] && command -v node &>/dev/null; then
        local result
        result=$(echo "$INPUT_DATA" | node "$validator" - 2>/dev/null || echo '{}')
        echo "$result"
    else
        echo '{}'
    fi
}

# =============================================================================
# Platform-Specific Validation
# =============================================================================

detect_platform_from_tool() {
    local tool="$1"
    local input="$2"

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
        Bash)
            # Check command content
            local cmd
            cmd=$(echo "$input" | jq -r '.tool_input.command // .command // ""' 2>/dev/null || echo "")
            if [[ "$cmd" =~ ^sf\  ]] || [[ "$cmd" =~ ^sfdx\  ]]; then
                echo "salesforce"
            elif [[ "$cmd" =~ hubspot ]] || [[ "$cmd" =~ hs-cli ]]; then
                echo "hubspot"
            elif [[ "$cmd" =~ marketo ]] || [[ "$cmd" =~ mkto ]]; then
                echo "marketo"
            else
                echo "generic"
            fi
            ;;
        *)
            echo "generic"
            ;;
    esac
}

run_platform_validation() {
    local platform="$1"
    local rules_file="$RULES_DIR/${platform}.json"

    if [[ ! -f "$rules_file" ]]; then
        echo '{}'
        return
    fi

    # Load platform rules
    local rules
    rules=$(cat "$rules_file" 2>/dev/null || echo '{"rules":[]}')

    # Check if any rules match this tool
    local tool_rules
    tool_rules=$(echo "$rules" | jq --arg tool "$TOOL_NAME" \
        '.rules[] | select(.tools | index($tool) or .tools == ["*"])' 2>/dev/null || echo "")

    if [[ -z "$tool_rules" ]]; then
        echo '{}'
        return
    fi

    # Run platform-specific validator if exists
    local platform_validator="$RULES_DIR/${platform}-validator.sh"
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
PLATFORM=$(detect_platform_from_tool "$TOOL_NAME" "$INPUT_DATA")
[[ "$VERBOSE" = "1" ]] && echo "[pre-tool-validator] Platform: $PLATFORM" >&2

# Run contract validation
CONTRACT_RESULT=$(run_contract_validation)
CONTRACT_BLOCKED=$(echo "$CONTRACT_RESULT" | jq -r '.blocked // false' 2>/dev/null || echo "false")

if [[ "$CONTRACT_BLOCKED" = "true" ]]; then
    # Log violation
    jq -n \
        --arg tool "$TOOL_NAME" \
        --arg platform "$PLATFORM" \
        --arg ts "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
        --arg result "blocked" \
        --arg reason "contract_violation" \
        '{"timestamp":$ts,"tool":$tool,"platform":$platform,"result":$result,"reason":$reason}' \
        >> "$LOG_FILE" 2>/dev/null || true

    echo "$CONTRACT_RESULT"
    exit 0
fi

# Run platform-specific validation
PLATFORM_RESULT=$(run_platform_validation "$PLATFORM")
PLATFORM_BLOCKED=$(echo "$PLATFORM_RESULT" | jq -r '.blocked // false' 2>/dev/null || echo "false")

if [[ "$PLATFORM_BLOCKED" = "true" ]]; then
    # Log violation
    jq -n \
        --arg tool "$TOOL_NAME" \
        --arg platform "$PLATFORM" \
        --arg ts "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
        --arg result "blocked" \
        --arg reason "platform_violation" \
        '{"timestamp":$ts,"tool":$tool,"platform":$platform,"result":$result,"reason":$reason}' \
        >> "$LOG_FILE" 2>/dev/null || true

    echo "$PLATFORM_RESULT"
    exit 0
fi

# Log success
jq -n \
    --arg tool "$TOOL_NAME" \
    --arg platform "$PLATFORM" \
    --arg ts "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
    --arg result "passed" \
    '{"timestamp":$ts,"tool":$tool,"platform":$platform,"result":$result}' \
    >> "$LOG_FILE" 2>/dev/null || true

# Pass through
echo '{}'
exit 0
