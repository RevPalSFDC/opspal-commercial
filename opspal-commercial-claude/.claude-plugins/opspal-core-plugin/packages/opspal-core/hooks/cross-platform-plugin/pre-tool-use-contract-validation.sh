#!/bin/bash
#
# Pre-Tool Use Contract Validation Hook
# Validates tool inputs against registered contracts before execution
#
# Event: PreToolUse
# Timeout: 5000ms
#
# This hook intercepts tool calls and validates inputs against the
# central tool-contracts.json registry to prevent contract violations.
#

set -euo pipefail

# Get plugin root
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(realpath "$0")")")}"
CONTRACTS_FILE="${PLUGIN_ROOT}/config/tool-contracts.json"
VALIDATOR_SCRIPT="${PLUGIN_ROOT}/scripts/lib/tool-contract-validator.js"
LOG_FILE="${HOME}/.claude/logs/tool-contract-validation.jsonl"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Parse tool name and input from stdin
# Claude passes: {"tool": "toolName", "input": {...}}
INPUT_DATA=$(cat)

if [ -z "$INPUT_DATA" ]; then
    echo '{"continue": true, "note": "No input data provided"}' >&2
    exit 0
fi

# Extract tool name
TOOL_NAME=$(echo "$INPUT_DATA" | jq -r '.tool // .toolName // .name // empty' 2>/dev/null)

if [ -z "$TOOL_NAME" ]; then
    echo '{"continue": true, "note": "Could not determine tool name"}' >&2
    exit 0
fi

# Map Claude tool names to contract names
map_tool_to_contract() {
    local tool="$1"
    case "$tool" in
        "Bash")
            # Check if it's a Salesforce CLI command
            local cmd=$(echo "$INPUT_DATA" | jq -r '.input.command // .command // ""' 2>/dev/null)
            if [[ "$cmd" =~ ^sf\ data\ query ]]; then
                echo "sf-data-query"
            elif [[ "$cmd" =~ ^sf\ project\ deploy ]]; then
                echo "sf-project-deploy"
            elif [[ "$cmd" =~ ^sf\ data\ export|^sf\ data\ import ]]; then
                echo "sf-bulk-api"
            else
                echo "bash-command"
            fi
            ;;
        "Read"|"Write"|"Edit")
            echo "file-operation"
            ;;
        "mcp__salesforce__*"|"mcp_salesforce_*")
            if [[ "$tool" =~ query ]]; then
                echo "sf-data-query"
            elif [[ "$tool" =~ deploy ]]; then
                echo "sf-project-deploy"
            else
                echo "salesforce-api"
            fi
            ;;
        "mcp__hubspot__*"|"mcp_hubspot_*")
            echo "hubspot-api"
            ;;
        *)
            echo "$tool"
            ;;
    esac
}

CONTRACT_NAME=$(map_tool_to_contract "$TOOL_NAME")

# Check if we have a contract for this tool
if [ ! -f "$CONTRACTS_FILE" ]; then
    echo '{"continue": true, "note": "Contracts file not found"}' >&2
    exit 0
fi

# Check if contract exists for this tool
CONTRACT_EXISTS=$(jq -r ".contracts[\"$CONTRACT_NAME\"] // empty" "$CONTRACTS_FILE" 2>/dev/null)

if [ -z "$CONTRACT_EXISTS" ]; then
    # No contract for this tool - allow execution
    log_entry=$(jq -nc \
        --arg tool "$TOOL_NAME" \
        --arg contract "$CONTRACT_NAME" \
        --arg status "skipped" \
        --arg reason "no_contract" \
        --arg timestamp "$(date -Iseconds)" \
        '{timestamp: $timestamp, tool: $tool, contract: $contract, status: $status, reason: $reason}')
    echo "$log_entry" >> "$LOG_FILE"
    exit 0
fi

# Extract tool input for validation
TOOL_INPUT=$(echo "$INPUT_DATA" | jq -c '.input // .parameters // {}' 2>/dev/null)

# Run validation via Node.js validator
if [ -f "$VALIDATOR_SCRIPT" ]; then
    # Create temp file for validation
    TEMP_INPUT=$(mktemp)
    echo "$TOOL_INPUT" > "$TEMP_INPUT"

    VALIDATION_RESULT=$(node -e "
        const { ToolContractValidator } = require('$VALIDATOR_SCRIPT');
        const fs = require('fs');

        const validator = new ToolContractValidator({
            contractsPath: '$CONTRACTS_FILE',
            strictMode: false  // Allow tools without contracts to pass
        });

        const input = JSON.parse(fs.readFileSync('$TEMP_INPUT', 'utf8'));
        const result = validator.validateInput('$CONTRACT_NAME', input);

        // Check validation rules beyond schema
        const contract = validator.getContract('$CONTRACT_NAME');
        const ruleViolations = [];

        if (contract && contract.validationRules) {
            for (const rule of contract.validationRules) {
                // Check pattern-based rules
                if (rule.pattern && typeof input === 'object') {
                    const inputStr = JSON.stringify(input);
                    if (rule.forbidden && rule.forbidden.some(p => inputStr.includes(p))) {
                        ruleViolations.push(rule.description + ' - forbidden pattern detected');
                    }
                }

                // Check for specific SOQL rules
                if (rule.id === 'aggregate-group-by' && input.query) {
                    const query = input.query.toUpperCase();
                    if (query.match(/COUNT\s*\(|SUM\s*\(|AVG\s*\(|MIN\s*\(|MAX\s*\(/)) {
                        // Has aggregate - check for proper GROUP BY
                        if (!query.includes('GROUP BY') && query.includes(',')) {
                            ruleViolations.push('Aggregate query with multiple fields may need GROUP BY');
                        }
                    }
                }

                // Check for CSV index access pattern
                if (rule.id === 'header-based-access' && input.code) {
                    if (input.code.match(/row\[\d+\]|columns\[\d+\]/)) {
                        ruleViolations.push('CSV access using hardcoded indices - use header-based access');
                    }
                }
            }
        }

        const output = {
            valid: result.valid && ruleViolations.length === 0,
            errors: [...result.errors, ...ruleViolations],
            tool: '$TOOL_NAME',
            contract: '$CONTRACT_NAME',
            timestamp: new Date().toISOString()
        };

        console.log(JSON.stringify(output));
    " 2>/dev/null)

    rm -f "$TEMP_INPUT"

    if [ -z "$VALIDATION_RESULT" ]; then
        # Validation script failed - allow execution but log
        log_entry=$(jq -nc \
            --arg tool "$TOOL_NAME" \
            --arg contract "$CONTRACT_NAME" \
            --arg status "error" \
            --arg reason "validation_script_failed" \
            --arg timestamp "$(date -Iseconds)" \
            '{timestamp: $timestamp, tool: $tool, contract: $contract, status: $status, reason: $reason}')
        echo "$log_entry" >> "$LOG_FILE"
        exit 0
    fi

    # Parse validation result
    IS_VALID=$(echo "$VALIDATION_RESULT" | jq -r '.valid')
    ERRORS=$(echo "$VALIDATION_RESULT" | jq -r '.errors | join("; ")')

    # Log the validation
    echo "$VALIDATION_RESULT" >> "$LOG_FILE"

    if [ "$IS_VALID" = "true" ]; then
        # Validation passed
        exit 0
    else
        # Validation failed - output warning but don't block (configurable)
        BLOCK_ON_VIOLATION="${TOOL_CONTRACT_BLOCK_ON_VIOLATION:-false}"

        if [ "$BLOCK_ON_VIOLATION" = "true" ]; then
            # Block execution
            echo "[CONTRACT VIOLATION] Tool: $TOOL_NAME"
            echo "Errors: $ERRORS"
            echo ""
            echo "Set TOOL_CONTRACT_BLOCK_ON_VIOLATION=false to warn instead of block"
            exit 1
        else
            # Warn but allow
            echo "[CONTRACT WARNING] Tool: $TOOL_NAME" >&2
            echo "Potential issues: $ERRORS" >&2
            echo "" >&2
            exit 0
        fi
    fi
else
    # Validator script not found - log and allow
    log_entry=$(jq -nc \
        --arg tool "$TOOL_NAME" \
        --arg status "skipped" \
        --arg reason "validator_not_found" \
        --arg timestamp "$(date -Iseconds)" \
        '{timestamp: $timestamp, tool: $tool, status: $status, reason: $reason}')
    echo "$log_entry" >> "$LOG_FILE"
    exit 0
fi
