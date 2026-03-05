#!/bin/bash
#
# Post-Tool Use Contract Validation Hook
# Validates tool outputs against contracts and detects improbable results
#
# Event: PostToolUse
# Timeout: 5000ms
#
# This hook validates tool outputs to catch:
# - Schema violations
# - Improbable results (99% rates, 0 records when expected)
# - NULL handling issues
# - Statistical anomalies
#

set -euo pipefail

# Get plugin root
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(realpath "$0")")")}"
CONTRACTS_FILE="${PLUGIN_ROOT}/config/tool-contracts.json"
VALIDATOR_SCRIPT="${PLUGIN_ROOT}/scripts/lib/tool-contract-validator.js"
LOG_FILE="${HOME}/.claude/logs/tool-output-validation.jsonl"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Parse tool result from stdin
# Claude passes: {"tool": "toolName", "result": {...}, "success": true/false}
RESULT_DATA=$(cat)

if [ -z "$RESULT_DATA" ]; then
    exit 0
fi

# Extract tool name and result
TOOL_NAME=$(echo "$RESULT_DATA" | jq -r '.tool // .toolName // .name // empty' 2>/dev/null)
TOOL_RESULT=$(echo "$RESULT_DATA" | jq -c '.result // .output // {}' 2>/dev/null)
TOOL_SUCCESS=$(echo "$RESULT_DATA" | jq -r '.success // true' 2>/dev/null)

if [ -z "$TOOL_NAME" ]; then
    exit 0
fi

# Skip validation for failed tool executions
if [ "$TOOL_SUCCESS" = "false" ]; then
    exit 0
fi

# Map tool name to contract name (same as pre-hook)
map_tool_to_contract() {
    local tool="$1"
    case "$tool" in
        "Bash")
            local cmd=$(echo "$RESULT_DATA" | jq -r '.input.command // .command // ""' 2>/dev/null)
            if [[ "$cmd" =~ ^sf\ data\ query ]]; then
                echo "sf-data-query"
            elif [[ "$cmd" =~ ^sf\ project\ deploy ]]; then
                echo "sf-project-deploy"
            else
                echo "bash-command"
            fi
            ;;
        *) echo "$tool" ;;
    esac
}

CONTRACT_NAME=$(map_tool_to_contract "$TOOL_NAME")

# Run comprehensive output validation
validate_output() {
    local result="$1"
    local contract_name="$2"

    node -e "
        const fs = require('fs');

        // Load contracts
        let contracts = {};
        try {
            contracts = JSON.parse(fs.readFileSync('$CONTRACTS_FILE', 'utf8')).contracts || {};
        } catch (e) {
            // No contracts file
        }

        const contract = contracts['$contract_name'] || {};
        const result = JSON.parse('$result');

        const issues = [];
        const warnings = [];

        // === SCHEMA VALIDATION ===
        if (contract.output) {
            const schema = contract.output;

            // Check required fields
            if (schema.required) {
                for (const field of schema.required) {
                    if (result[field] === undefined || result[field] === null) {
                        issues.push('Missing required field: ' + field);
                    }
                }
            }
        }

        // === IMPROBABILITY DETECTION ===
        const globalRules = contracts.globalRules?.improbabilityDetection || {
            suspiciousPercentage: 95,
            minimumExpectedRecords: 1,
            standardDeviationAlert: 3
        };

        // Check for suspiciously high percentages
        const checkPercentages = (obj, path = '') => {
            if (typeof obj !== 'object' || obj === null) return;

            for (const [key, value] of Object.entries(obj)) {
                const currentPath = path ? path + '.' + key : key;

                if (typeof value === 'number') {
                    // Check for suspicious percentage values
                    if (key.toLowerCase().includes('rate') ||
                        key.toLowerCase().includes('percent') ||
                        key.toLowerCase().includes('pct')) {
                        if (value > globalRules.suspiciousPercentage) {
                            warnings.push('Suspiciously high ' + currentPath + ': ' + value + '% - verify query');
                        }
                        if (value < 0 || value > 100) {
                            issues.push('Invalid percentage ' + currentPath + ': ' + value);
                        }
                    }
                } else if (typeof value === 'object') {
                    checkPercentages(value, currentPath);
                }
            }
        };
        checkPercentages(result);

        // Check for empty results when data expected
        if (result.records !== undefined && Array.isArray(result.records)) {
            if (result.records.length === 0 && result.totalSize === 0) {
                // This might be expected, but flag if query seemed to expect data
                warnings.push('Query returned 0 records - verify filters');
            }
        }

        // === NULL HANDLING CHECKS ===
        const checkNulls = (obj, path = '') => {
            if (typeof obj !== 'object' || obj === null) return;

            for (const [key, value] of Object.entries(obj)) {
                const currentPath = path ? path + '.' + key : key;

                if (value === null) {
                    // Some fields being null is OK, but aggregate/count fields shouldn't be
                    if (key.toLowerCase().includes('count') ||
                        key.toLowerCase().includes('total') ||
                        key.toLowerCase().includes('sum')) {
                        warnings.push('Null value in aggregate field: ' + currentPath);
                    }
                } else if (typeof value === 'object') {
                    checkNulls(value, currentPath);
                }
            }
        };
        checkNulls(result);

        // === CHECK COMMON ERRORS FROM CONTRACT ===
        if (contract.commonErrors) {
            for (const error of contract.commonErrors) {
                // Check if result contains error indicators
                if (result.error || result.errorCode) {
                    if (result.errorCode === error.code ||
                        (result.error && result.error.includes(error.code))) {
                        issues.push('Known error pattern detected: ' + error.message);
                        issues.push('Prevention: ' + error.prevention);
                    }
                }
            }
        }

        // === OUTPUT RESULT ===
        const output = {
            valid: issues.length === 0,
            issues,
            warnings,
            tool: '$TOOL_NAME',
            contract: '$contract_name',
            timestamp: new Date().toISOString()
        };

        console.log(JSON.stringify(output));
    " 2>/dev/null
}

VALIDATION_RESULT=$(validate_output "$TOOL_RESULT" "$CONTRACT_NAME")

if [ -z "$VALIDATION_RESULT" ]; then
    # Validation failed to run - log and continue
    log_entry=$(jq -nc \
        --arg tool "$TOOL_NAME" \
        --arg status "error" \
        --arg timestamp "$(date -Iseconds)" \
        '{timestamp: $timestamp, tool: $tool, status: $status, phase: "output"}')
    echo "$log_entry" >> "$LOG_FILE"
    exit 0
fi

# Log the validation result
echo "$VALIDATION_RESULT" >> "$LOG_FILE"

# Parse results
IS_VALID=$(echo "$VALIDATION_RESULT" | jq -r '.valid')
ISSUES=$(echo "$VALIDATION_RESULT" | jq -r '.issues | join("; ")')
WARNINGS=$(echo "$VALIDATION_RESULT" | jq -r '.warnings | join("; ")')

# Output warnings/issues to stderr (visible to agent)
if [ -n "$WARNINGS" ] && [ "$WARNINGS" != "" ]; then
    echo "" >&2
    echo "[DATA QUALITY WARNING] Tool: $TOOL_NAME" >&2
    echo "Warnings: $WARNINGS" >&2
    echo "Review results for accuracy before proceeding." >&2
    echo "" >&2
fi

if [ "$IS_VALID" = "false" ]; then
    echo "" >&2
    echo "[OUTPUT VALIDATION ISSUE] Tool: $TOOL_NAME" >&2
    echo "Issues: $ISSUES" >&2
    echo "" >&2
fi

# Always exit 0 for post-hooks (don't block completed tool)
exit 0
