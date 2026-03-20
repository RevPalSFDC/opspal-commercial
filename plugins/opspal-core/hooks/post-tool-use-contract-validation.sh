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

# Fast-exit for read-only tools that never produce actionable contract violations
TOOL_NAME_QUICK="${CLAUDE_TOOL_NAME:-${HOOK_TOOL_NAME:-${TOOL_NAME:-}}}"
case "$TOOL_NAME_QUICK" in
  Read|Glob|Grep|LS|ToolSearch) exit 0 ;;
esac

is_json() {
    echo "$1" | jq -e . >/dev/null 2>&1
}

read_stdin_json() {
    local data=""
    if [ ! -t 0 ]; then
        data=$(cat)
    fi
    if [ -n "$data" ] && is_json "$data"; then
        echo "$data"
    else
        echo ""
    fi
}

# Get plugin root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT_DEFAULT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT_DEFAULT}"
if [ ! -f "$PLUGIN_ROOT/config/tool-contracts.json" ] && [ -f "$PLUGIN_ROOT_DEFAULT/config/tool-contracts.json" ]; then
    PLUGIN_ROOT="$PLUGIN_ROOT_DEFAULT"
fi
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." 2>/dev/null && pwd || pwd)"
CONTRACTS_FILE="${PLUGIN_ROOT}/config/tool-contracts.json"
VALIDATOR_SCRIPT="${PLUGIN_ROOT}/scripts/lib/tool-contract-validator.js"
DEFAULT_LOG_ROOT="${PROJECT_ROOT}/.claude/logs"
LOG_ROOT="${CLAUDE_HOOK_LOG_ROOT:-$DEFAULT_LOG_ROOT}"
FALLBACK_LOG_ROOT="/tmp/.claude/logs"
LOG_FILE=""
METRICS_FILE=""
METRICS_ENABLED=1

resolve_log_root() {
    local primary="$LOG_ROOT"
    local fallback="$FALLBACK_LOG_ROOT"

    if mkdir -p "$primary" 2>/dev/null && [ -w "$primary" ]; then
        echo "$primary"
        return 0
    fi

    if mkdir -p "$fallback" 2>/dev/null && [ -w "$fallback" ]; then
        echo "$fallback"
        return 0
    fi

    echo ""
    return 1
}

RESOLVED_LOG_ROOT="$(resolve_log_root || true)"
if [ -z "$RESOLVED_LOG_ROOT" ]; then
    METRICS_ENABLED=0
else
    LOG_FILE="${RESOLVED_LOG_ROOT}/tool-output-validation.jsonl"
    METRICS_FILE="${RESOLVED_LOG_ROOT}/tool-validation-metrics-$(date +%Y-%m-%d).json"
fi

safe_append_jsonl() {
    local line="$1"
    if [ -z "$LOG_FILE" ]; then
        return 0
    fi
    printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
}

# Initialize daily metrics file if needed
if [ "$METRICS_ENABLED" = "1" ] && [ -n "$METRICS_FILE" ] && [ ! -f "$METRICS_FILE" ]; then
    if ! touch "$METRICS_FILE" 2>/dev/null; then
        METRICS_ENABLED=0
    else
        echo '{"date":"'"$(date +%Y-%m-%d)"'","validations":0,"failures":0,"warnings":0,"tools":{}}' > "$METRICS_FILE" 2>/dev/null || METRICS_ENABLED=0
    fi
fi

# Function to update daily metrics
update_metrics() {
    local tool="$1"
    local status="$2"  # valid, warning, failure

    if [ "$METRICS_ENABLED" != "1" ]; then
        return 0
    fi

    # Use jq to update metrics atomically
    local temp_metrics=$(mktemp)
    jq --arg tool "$tool" --arg status "$status" '
        .validations += 1 |
        .tools[$tool] = (.tools[$tool] // {validations: 0, failures: 0, warnings: 0}) |
        .tools[$tool].validations += 1 |
        if $status == "failure" then
            .failures += 1 | .tools[$tool].failures += 1
        elif $status == "warning" then
            .warnings += 1 | .tools[$tool].warnings += 1
        else . end
    ' "$METRICS_FILE" > "$temp_metrics" 2>/dev/null && mv "$temp_metrics" "$METRICS_FILE" || rm -f "$temp_metrics"
}

# Parse tool result from stdin
# Claude passes: {"tool_name": "toolName", "tool_input": {...}, "tool_response": {...}, "success": true/false}
RESULT_DATA=$(read_stdin_json)

if [ -z "$RESULT_DATA" ]; then
    TOOL_NAME_FALLBACK="${CLAUDE_TOOL_NAME:-${HOOK_TOOL_NAME:-}}"
    TOOL_RESULT_RAW="${CLAUDE_TOOL_OUTPUT:-${CLAUDE_TOOL_RESULT:-${HOOK_TOOL_OUTPUT:-}}}"

    if [ -z "$TOOL_NAME_FALLBACK" ] && [ -z "$TOOL_RESULT_RAW" ]; then
        exit 0
    fi

    if [ -z "$TOOL_RESULT_RAW" ] || ! is_json "$TOOL_RESULT_RAW"; then
        # Output isn't JSON - skip validation to avoid parse errors
        exit 0
    fi

    RESULT_DATA=$(jq -nc \
        --arg tool "$TOOL_NAME_FALLBACK" \
        --argjson result "$TOOL_RESULT_RAW" \
        '{tool_name: $tool, tool_input: {}, tool_response: $result, success: true}')
fi

# Extract tool name and result
TOOL_NAME=$(echo "$RESULT_DATA" | jq -r '.tool_name // empty' 2>/dev/null)
TOOL_RESULT=$(echo "$RESULT_DATA" | jq -c '.tool_response // .tool_result // {}' 2>/dev/null)
TOOL_SUCCESS=$(echo "$RESULT_DATA" | jq -r 'if has("success") then .success else true end' 2>/dev/null)

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
            local cmd=$(echo "$RESULT_DATA" | jq -r '.tool_input.command // ""' 2>/dev/null)
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
        const remediations = [];
        if (contract.commonErrors) {
            for (const error of contract.commonErrors) {
                // Check if result contains error indicators
                if (result.error || result.errorCode || result.message) {
                    const errorStr = JSON.stringify(result).toLowerCase();
                    if (result.errorCode === error.code ||
                        (result.error && result.error.includes(error.code)) ||
                        (error.code && errorStr.includes(error.code.toLowerCase()))) {
                        issues.push('Known error pattern [' + error.code + ']: ' + error.message);
                        remediations.push({
                            code: error.code,
                            prevention: error.prevention,
                            severity: 'error'
                        });
                    }
                }
            }
        }

        // === CHECK FOR OUTPUT SCHEMA ISSUES WITH REMEDIATION ===
        if (issues.length > 0) {
            // Add general remediation hints based on issue types
            if (issues.some(i => i.includes('Missing required field'))) {
                remediations.push({
                    code: 'SCHEMA_VIOLATION',
                    prevention: 'Verify query/operation returned expected structure. Check API version compatibility.',
                    severity: 'warning'
                });
            }
            if (warnings.some(w => w.includes('high'))) {
                remediations.push({
                    code: 'STATISTICAL_ANOMALY',
                    prevention: 'Results may be statistically improbable. Verify query filters and data quality.',
                    severity: 'warning'
                });
            }
        }

        // === OUTPUT RESULT ===
        const output = {
            valid: issues.length === 0,
            issues,
            warnings,
            remediations,
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
    safe_append_jsonl "$log_entry"
    exit 0
fi

# Log the validation result
safe_append_jsonl "$VALIDATION_RESULT"

# Parse results
IS_VALID=$(echo "$VALIDATION_RESULT" | jq -r '.valid')
ISSUES=$(echo "$VALIDATION_RESULT" | jq -r '.issues | join("; ")')
WARNINGS=$(echo "$VALIDATION_RESULT" | jq -r '.warnings | join("; ")')
REMEDIATIONS=$(echo "$VALIDATION_RESULT" | jq -r '.remediations // [] | map(.prevention) | join("; ")')

# Update daily metrics
if [ "$IS_VALID" = "true" ] && [ -z "$WARNINGS" ]; then
    update_metrics "$TOOL_NAME" "valid"
elif [ "$IS_VALID" = "true" ]; then
    update_metrics "$TOOL_NAME" "warning"
else
    update_metrics "$TOOL_NAME" "failure"
fi

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
    if [ -n "$REMEDIATIONS" ] && [ "$REMEDIATIONS" != "" ]; then
        echo "" >&2
        echo "Remediation hints:" >&2
        echo "$REMEDIATIONS" >&2
    fi
    echo "" >&2
    echo "Reference: See tool-contracts.json for validation rules" >&2
    echo "" >&2
fi

# Always exit 0 for post-hooks (don't block completed tool)
exit 0
