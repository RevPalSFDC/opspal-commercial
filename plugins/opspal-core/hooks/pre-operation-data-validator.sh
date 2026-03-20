#!/bin/bash

###############################################################################
# Pre-Operation Data Validator Hook
#
# Validates data inputs before tool execution using data-quality-monitor.js
#
# Addresses: Cohort 1 (data-quality) - 12 reflections, $45K ROI
#
# Prevention Targets:
# - Missing schema validation enforcement
# - Synthetic/fake data patterns not detected before processing
# - Cross-field validation rules absent
# - Stale data processing
# - Semantic validation failures (impossible values)
#
# How It Works:
# 1. Detects data operations (queries, imports, exports, upserts)
# 2. Extracts data from tool input
# 3. Validates using enhanced data-quality-monitor.js rules
# 4. Blocks invalid data with actionable error messages
#
# Configuration:
#   DATA_VALIDATION_ENABLED=1         # Enable checking (default: 1)
#   DATA_VALIDATION_STRICT=0          # Block on warnings too (default: 0)
#   DATA_VALIDATION_LOG_LEVEL=info    # Logging level (default: info)
#   DATA_VALIDATION_RULES=all         # Rules to apply (comma-separated or 'all')
#   DATA_VALIDATION_MERGE_MIN_SAMPLE_SIZE=2    # Minimum records required for merge validation
#   DATA_VALIDATION_MERGE_MIN_CONFIDENCE=0.75  # Minimum confidence for merge decisions (0-1)
#   DATA_VALIDATION_MAX_STALE_DAYS=90          # Standard stale-data threshold (error)
#   DATA_VALIDATION_WARN_STALE_DAYS=30         # Stale-data warning threshold
#   DATA_VALIDATION_HARD_STALE_DAYS=180        # Hard stale-data threshold (always blocked)
#   DATA_VALIDATION_HARD_STALE_ENABLED=1       # Enable hard stale-data blocking
#
# Exit Codes:
#   0 - Validation passed (or no data to validate)
#   1 - Validation failed (errors detected)
#   2 - Warning only (warnings detected, STRICT=0)
###############################################################################

set -euo pipefail

is_json() {
    echo "$1" | jq -e . >/dev/null 2>&1
}

is_positive_int() {
    [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -gt 0 ]
}

is_decimal_0_to_1() {
    [[ "$1" =~ ^(0(\.[0-9]+)?|1(\.0+)?)$ ]]
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(cd "$PLUGIN_DIR/../.." 2>/dev/null && pwd || pwd)"

# Configuration
ENABLED="${DATA_VALIDATION_ENABLED:-1}"
STRICT="${DATA_VALIDATION_STRICT:-0}"
LOG_LEVEL="${DATA_VALIDATION_LOG_LEVEL:-info}"
RULES="${DATA_VALIDATION_RULES:-all}"
MERGE_MIN_SAMPLE_SIZE="${DATA_VALIDATION_MERGE_MIN_SAMPLE_SIZE:-2}"
MERGE_MIN_CONFIDENCE="${DATA_VALIDATION_MERGE_MIN_CONFIDENCE:-0.75}"
MAX_STALE_DAYS="${DATA_VALIDATION_MAX_STALE_DAYS:-90}"
WARN_STALE_DAYS="${DATA_VALIDATION_WARN_STALE_DAYS:-30}"
HARD_STALE_DAYS="${DATA_VALIDATION_HARD_STALE_DAYS:-180}"
HARD_STALE_ENABLED="${DATA_VALIDATION_HARD_STALE_ENABLED:-1}"

if ! is_positive_int "$MERGE_MIN_SAMPLE_SIZE"; then
    MERGE_MIN_SAMPLE_SIZE="2"
fi

if ! is_decimal_0_to_1 "$MERGE_MIN_CONFIDENCE"; then
    MERGE_MIN_CONFIDENCE="0.75"
fi

if ! is_positive_int "$MAX_STALE_DAYS"; then
    MAX_STALE_DAYS="90"
fi

if ! is_positive_int "$WARN_STALE_DAYS"; then
    WARN_STALE_DAYS="30"
fi

if ! is_positive_int "$HARD_STALE_DAYS"; then
    HARD_STALE_DAYS="180"
fi

# File locations
DATA_QUALITY_MONITOR="$PLUGIN_DIR/scripts/lib/data-quality-monitor.js"
OUTPUT_FORMATTER="$PLUGIN_DIR/scripts/lib/output-formatter.js"
HOOK_LOGGER="$PLUGIN_DIR/scripts/lib/hook-logger.js"
DEFAULT_LOG_ROOT="${PROJECT_ROOT}/.claude/logs"
LOG_ROOT="${CLAUDE_HOOK_LOG_ROOT:-$DEFAULT_LOG_ROOT}"
FALLBACK_LOG_ROOT="/tmp/.claude/logs"
LOG_FILE=""
HOOK_NAME="pre-operation-data-validator"

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

safe_append_jsonl() {
    local line="$1"
    if [ -z "$LOG_FILE" ]; then
        return 0
    fi
    printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
}

RESOLVED_LOG_ROOT="$(resolve_log_root || true)"
if [ -n "$RESOLVED_LOG_ROOT" ]; then
    LOG_FILE="${RESOLVED_LOG_ROOT}/data-validation.jsonl"
fi

# Exit early if disabled
if [ "$ENABLED" != "1" ]; then
    exit 0
fi

# Check if data quality monitor exists
if [ ! -f "$DATA_QUALITY_MONITOR" ]; then
    echo "Warning: data-quality-monitor.js not found at $DATA_QUALITY_MONITOR" >&2
    exit 0
fi

# Parse input from stdin (Claude passes tool invocation as JSON)
INPUT_DATA=$(read_stdin_json)

if [ -z "$INPUT_DATA" ]; then
    exit 0
fi

# Extract tool name and input
TOOL_NAME=$(echo "$INPUT_DATA" | jq -r '.tool_name // empty' 2>/dev/null)
TOOL_INPUT=$(echo "$INPUT_DATA" | jq -c '.tool_input // {}' 2>/dev/null)

if [ -n "$TOOL_INPUT" ] && is_json "$TOOL_INPUT"; then
    INPUT_TYPE=$(echo "$TOOL_INPUT" | jq -r 'type' 2>/dev/null || echo "")
    if [ "$INPUT_TYPE" != "object" ]; then
        if [ "$TOOL_NAME" = "Bash" ] && [ "$INPUT_TYPE" = "string" ]; then
            RAW_COMMAND=$(echo "$TOOL_INPUT" | jq -r '.' 2>/dev/null || echo "")
            TOOL_INPUT=$(jq -nc --arg command "$RAW_COMMAND" '{command:$command}')
        else
            TOOL_INPUT="{}"
        fi
    fi
else
    TOOL_INPUT="{}"
fi

if [ -z "$TOOL_NAME" ]; then
    exit 0
fi

# Determine if this is a data operation that needs validation
is_data_operation() {
    local tool="$1"
    local input="$2"

    # MCP Salesforce data operations
    if [[ "$tool" =~ ^mcp.*salesforce.*(query|create|update|upsert|delete) ]]; then
        echo "salesforce_data"
        return 0
    fi

    # MCP HubSpot data operations
    if [[ "$tool" =~ ^mcp.*hubspot.*(create|update|batch) ]]; then
        echo "hubspot_data"
        return 0
    fi

    # Bash with sf data commands
    if [[ "$tool" == "Bash" ]]; then
        local cmd=$(echo "$input" | jq -r '.command // ""' 2>/dev/null)
        if [[ "$cmd" =~ (bulk-merge-executor|bulk-merge-executor-parallel|salesforce-native-merger|generic-record-merger|merge-executor|dedup) ]]; then
            echo "merge_decision_data"
            return 0
        fi
        if [[ "$cmd" =~ sf\ data\ (upsert|import|bulk|update|create) ]]; then
            echo "sf_cli_data"
            return 0
        fi
        # CSV processing
        if [[ "$cmd" =~ \.csv ]]; then
            echo "csv_processing"
            return 0
        fi
    fi

    # Write tool with data files
    if [[ "$tool" == "Write" ]]; then
        local filepath=$(echo "$input" | jq -r '.file_path // ""' 2>/dev/null)
        if [[ "$filepath" =~ \.(csv|json|xml)$ ]]; then
            echo "file_data"
            return 0
        fi
    fi

    # Agent tool with data agents
    if [[ "$tool" == "Agent" ]]; then
        local subagent=$(echo "$input" | jq -r '.subagent_type // .agent_type // ""' 2>/dev/null)
        if [[ "$subagent" =~ (data-import|data-export|data-operations|csv) ]]; then
            echo "agent_data"
            return 0
        fi
    fi

    return 1
}

# Extract records/data to validate from input
extract_data_for_validation() {
    local tool="$1"
    local input="$2"
    local op_type="$3"

    case "$op_type" in
        salesforce_data)
            # Extract records from MCP call
            echo "$input" | jq -c '.records // .data // []' 2>/dev/null
            ;;
        hubspot_data)
            # Extract properties/inputs
            echo "$input" | jq -c '.properties // .inputs // []' 2>/dev/null
            ;;
        sf_cli_data)
            # Try to extract from file path or inline data
            local file=$(echo "$input" | jq -r '.command' 2>/dev/null | grep -oP '(?<=-f |--file=)[^\s]+' || true)
            if [ -n "$file" ] && [ -f "$file" ]; then
                # Read file content (limited to first 1000 records for performance)
                head -1001 "$file" 2>/dev/null | jq -sc '.' 2>/dev/null || echo "[]"
            else
                echo "[]"
            fi
            ;;
        merge_decision_data)
            # Extract merge decision payloads from --decisions JSON input.
            local cmd=$(echo "$input" | jq -r '.command // ""' 2>/dev/null)
            local decisions_file=""

            decisions_file=$(echo "$cmd" | sed -nE "s/.*--decisions[ =]+\"?([^\" ]+)\"?.*/\\1/p" | head -1 || true)
            if [ -z "$decisions_file" ]; then
                decisions_file=$(echo "$cmd" | sed -nE "s/.*--input[ =]+\"?([^\" ]+)\"?.*/\\1/p" | head -1 || true)
            fi

            if [ -n "$decisions_file" ] && [ ! -f "$decisions_file" ] && [ -f "$PROJECT_ROOT/$decisions_file" ]; then
                decisions_file="$PROJECT_ROOT/$decisions_file"
            fi

            if [ -n "$decisions_file" ] && [ -f "$decisions_file" ]; then
                jq -c 'if type == "array" then . else (.decisions // .records // .items // .results // []) end' "$decisions_file" 2>/dev/null || echo "[]"
            else
                echo "[]"
            fi
            ;;
        csv_processing)
            # Extract from file if available
            local cmd=$(echo "$input" | jq -r '.command' 2>/dev/null)
            local file=$(echo "$cmd" | grep -oP '[^\s]+\.csv' | head -1 || true)
            if [ -n "$file" ] && [ -f "$file" ]; then
                head -101 "$file" 2>/dev/null | python3 -c "
import csv, json, sys
reader = csv.DictReader(sys.stdin)
print(json.dumps(list(reader)))
" 2>/dev/null || echo "[]"
            else
                echo "[]"
            fi
            ;;
        file_data)
            # Extract content being written
            local content=$(echo "$input" | jq -r '.content // ""' 2>/dev/null)
            local filepath=$(echo "$input" | jq -r '.file_path // ""' 2>/dev/null)
            if [[ "$filepath" =~ \.json$ ]]; then
                echo "$content" | jq -sc '.' 2>/dev/null || echo "[]"
            elif [[ "$filepath" =~ \.csv$ ]]; then
                echo "$content" | head -101 | python3 -c "
import csv, json, sys
reader = csv.DictReader(sys.stdin)
print(json.dumps(list(reader)))
" 2>/dev/null || echo "[]"
            else
                echo "[]"
            fi
            ;;
        agent_data)
            # Extract from agent prompt (limited ability)
            echo "$input" | jq -c '.data // .records // []' 2>/dev/null || echo "[]"
            ;;
        *)
            echo "[]"
            ;;
    esac
}

# Main validation logic
OPERATION_TYPE=$(is_data_operation "$TOOL_NAME" "$TOOL_INPUT" 2>/dev/null || true)

if [ -z "$OPERATION_TYPE" ]; then
    # Not a data operation, skip validation
    exit 0
fi

# Extract data to validate
DATA_TO_VALIDATE=$(extract_data_for_validation "$TOOL_NAME" "$TOOL_INPUT" "$OPERATION_TYPE")

# Check if we have data to validate
DATA_COUNT=$(echo "$DATA_TO_VALIDATE" | jq 'if type == "array" then length else 0 end' 2>/dev/null || echo "0")

if [ "$DATA_COUNT" == "0" ] || [ "$DATA_COUNT" == "null" ]; then
    if [ "$OPERATION_TYPE" = "merge_decision_data" ]; then
        [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Merge validation blocked - no decision data extracted" \
            "{\"operationType\":\"$OPERATION_TYPE\",\"tool\":\"$TOOL_NAME\"}" 2>/dev/null || true
        echo "Data validation blocked: unable to extract merge decision records (expected --decisions JSON)." >&2
        exit 1
    fi
    # No data to validate, allow operation
    exit 0
fi

if [ "$OPERATION_TYPE" = "merge_decision_data" ] && [ "$DATA_COUNT" -lt "$MERGE_MIN_SAMPLE_SIZE" ]; then
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Merge validation blocked - insufficient sample size" \
        "{\"operationType\":\"$OPERATION_TYPE\",\"recordCount\":$DATA_COUNT,\"requiredMin\":$MERGE_MIN_SAMPLE_SIZE}" 2>/dev/null || true
    echo "Data validation blocked: merge decision sample too small ($DATA_COUNT records, requires >= $MERGE_MIN_SAMPLE_SIZE)." >&2
    exit 1
fi

# Run validation via Node.js data-quality-monitor
TEMP_DATA=$(mktemp)
echo "$DATA_TO_VALIDATE" > "$TEMP_DATA"

VALIDATION_RESULT=$(node -e "
const { BUILT_IN_RULES } = require('$DATA_QUALITY_MONITOR');
const fs = require('fs');

const operationType = '$OPERATION_TYPE';
const mergeMinConfidence = Number.parseFloat('$MERGE_MIN_CONFIDENCE');
const maxStaleDays = Number.parseInt('$MAX_STALE_DAYS', 10);
const warnStaleDays = Number.parseInt('$WARN_STALE_DAYS', 10);
const hardStaleDays = Number.parseInt('$HARD_STALE_DAYS', 10);
const hardStaleEnabled = '$HARD_STALE_ENABLED' === '1';

function isDateField(fieldName) {
    const key = String(fieldName || '').toLowerCase();
    return key.includes('date') || key.includes('timestamp') || key.includes('modif') || key.includes('updated');
}

function parseDateAgeDays(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
}

function normalizeConfidence(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    let numeric = value;
    if (typeof numeric === 'string') {
        numeric = Number.parseFloat(numeric);
    }
    if (!Number.isFinite(numeric)) {
        return null;
    }
    if (numeric >= 0 && numeric <= 1) {
        return numeric;
    }
    if (numeric > 1 && numeric <= 100) {
        return numeric / 100;
    }
    return null;
}

function extractConfidence(record) {
    if (!record || typeof record !== 'object') {
        return null;
    }
    const confidencePattern = /(confidence|similarity|probability|match[_-]?score)/i;
    for (const [field, value] of Object.entries(record)) {
        if (!confidencePattern.test(field)) {
            continue;
        }
        const normalized = normalizeConfidence(value);
        if (normalized !== null) {
            return { field, value: normalized };
        }
    }
    return null;
}

function roundNumber(value, decimals = 4) {
    if (!Number.isFinite(value)) {
        return null;
    }
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

async function validate() {
    const data = JSON.parse(fs.readFileSync('$TEMP_DATA', 'utf8'));
    const records = Array.isArray(data) ? data : [data];
    const confidenceSamples = [];

    const results = {
        errors: [],
        warnings: [],
        recordCount: records.length,
        validCount: 0,
        qualityScore: 0,
        qualityConfidence: null,
        confidenceSamples: 0,
        staleHardGateViolations: 0,
        timestamp: new Date().toISOString(),
        operationType,
        tool: '$TOOL_NAME',
        policy: {
            mergeMinConfidence,
            maxStaleDays,
            warnStaleDays,
            hardStaleDays,
            hardStaleEnabled
        }
    };

    for (let i = 0; i < records.length; i++) {
        const inputRecord = records[i];
        const record = (inputRecord && typeof inputRecord === 'object')
            ? inputRecord
            : { value: inputRecord };

        if (BUILT_IN_RULES && BUILT_IN_RULES.crossFieldValidation) {
            const crossFieldResult = BUILT_IN_RULES.crossFieldValidation.validate(
                record,
                'record',
                { rules: [] }
            );
            if (!crossFieldResult.valid) {
                results.errors.push({
                    record: i + 1,
                    rule: 'crossFieldValidation',
                    message: crossFieldResult.message
                });
            }
        }

        if (BUILT_IN_RULES && BUILT_IN_RULES.semanticValidation) {
            for (const [field, value] of Object.entries(record)) {
                if (value === null || value === undefined) {
                    continue;
                }
                const semanticResult = BUILT_IN_RULES.semanticValidation.validate(value, field, { type: 'auto' });
                if (!semanticResult.valid) {
                    const target = semanticResult.severity === 'error' ? results.errors : results.warnings;
                    target.push({
                        record: i + 1,
                        field,
                        rule: 'semanticValidation',
                        message: semanticResult.message
                    });
                }
            }
        }

        if (BUILT_IN_RULES && BUILT_IN_RULES.dataFreshness) {
            for (const [field, value] of Object.entries(record)) {
                if (!isDateField(field)) {
                    continue;
                }

                const freshnessResult = BUILT_IN_RULES.dataFreshness.validate(
                    value,
                    field,
                    { maxAgeDays: maxStaleDays, warnAgeDays: warnStaleDays }
                );

                if (!freshnessResult.valid) {
                    const target = freshnessResult.severity === 'error' ? results.errors : results.warnings;
                    target.push({
                        record: i + 1,
                        field,
                        rule: 'dataFreshness',
                        message: freshnessResult.message
                    });
                }

                if (hardStaleEnabled) {
                    const ageDays = parseDateAgeDays(value);
                    if (ageDays !== null && ageDays > hardStaleDays) {
                        results.staleHardGateViolations += 1;
                        results.errors.push({
                            record: i + 1,
                            field,
                            rule: 'staleDataHardGate',
                            message: 'Field ' + field + ' is ' + ageDays.toFixed(1) +
                                ' days old, exceeding hard stale-data policy (' + hardStaleDays + ' days)'
                        });
                    }
                }
            }
        }

        if (BUILT_IN_RULES && BUILT_IN_RULES.validSalesforceId) {
            for (const [field, value] of Object.entries(record)) {
                if (field === 'Id' || field.endsWith('Id') || field.endsWith('__c')) {
                    if (typeof value === 'string' && value.length >= 15) {
                        const idResult = BUILT_IN_RULES.validSalesforceId.validate(value, field);
                        if (!idResult.valid) {
                            results.errors.push({
                                record: i + 1,
                                field,
                                rule: 'validSalesforceId',
                                message: idResult.message
                            });
                        }
                    }
                }
            }
        }

        if (operationType === 'merge_decision_data') {
            const confidence = extractConfidence(record);
            if (confidence) {
                confidenceSamples.push(confidence.value);
                if (confidence.value < mergeMinConfidence) {
                    results.errors.push({
                        record: i + 1,
                        field: confidence.field,
                        rule: 'mergeConfidenceThreshold',
                        message: 'Merge confidence ' + Math.round(confidence.value * 100) +
                            '% is below minimum threshold ' + Math.round(mergeMinConfidence * 100) + '%'
                    });
                }
            }
        }

        const recordErrors = results.errors.filter((error) => error.record === i + 1).length;
        if (recordErrors === 0) {
            results.validCount++;
        }
    }

    results.qualityScore = records.length > 0 ? roundNumber(results.validCount / records.length) : 0;

    if (confidenceSamples.length > 0) {
        const averageConfidence = confidenceSamples.reduce((sum, value) => sum + value, 0) / confidenceSamples.length;
        results.qualityConfidence = roundNumber(averageConfidence);
        results.confidenceSamples = confidenceSamples.length;

        if (operationType === 'merge_decision_data' && averageConfidence < mergeMinConfidence) {
            results.errors.push({
                record: 'all',
                field: 'confidence',
                rule: 'mergeAverageConfidenceThreshold',
                message: 'Average merge confidence ' + Math.round(averageConfidence * 100) +
                    '% is below threshold ' + Math.round(mergeMinConfidence * 100) + '%'
            });
        }
    } else if (operationType === 'merge_decision_data') {
        results.warnings.push({
            record: 'all',
            field: 'confidence',
            rule: 'mergeConfidenceMissing',
            message: 'Merge decision records contain no confidence fields; manual review recommended'
        });
    }

    console.log(JSON.stringify(results));
}

validate().catch(e => {
    console.log(JSON.stringify({
        errors: [{rule: 'validation_error', message: e.message}],
        warnings: [],
        recordCount: 0,
        validCount: 0,
        qualityScore: 0,
        qualityConfidence: null,
        confidenceSamples: 0,
        staleHardGateViolations: 0
    }));
});
" 2>&1)

rm -f "$TEMP_DATA"

# Parse validation results
ERROR_COUNT=$(echo "$VALIDATION_RESULT" | jq '.errors | length' 2>/dev/null || echo "0")
WARNING_COUNT=$(echo "$VALIDATION_RESULT" | jq '.warnings | length' 2>/dev/null || echo "0")
RECORD_COUNT=$(echo "$VALIDATION_RESULT" | jq '.recordCount // 0' 2>/dev/null || echo "0")
VALID_COUNT=$(echo "$VALIDATION_RESULT" | jq '.validCount // 0' 2>/dev/null || echo "0")
QUALITY_SCORE=$(echo "$VALIDATION_RESULT" | jq '.qualityScore // 0' 2>/dev/null || echo "0")
QUALITY_CONFIDENCE=$(echo "$VALIDATION_RESULT" | jq '.qualityConfidence // null' 2>/dev/null || echo "null")
STALE_HARD_VIOLATIONS=$(echo "$VALIDATION_RESULT" | jq '.staleHardGateViolations // 0' 2>/dev/null || echo "0")

# Log validation result
log_entry=$(jq -nc \
    --arg tool "$TOOL_NAME" \
    --arg operation "$OPERATION_TYPE" \
    --argjson errors "$ERROR_COUNT" \
    --argjson warnings "$WARNING_COUNT" \
    --argjson records "$RECORD_COUNT" \
    --argjson valid "$VALID_COUNT" \
    --argjson qualityScore "$QUALITY_SCORE" \
    --argjson qualityConfidence "$QUALITY_CONFIDENCE" \
    --argjson staleHardViolations "$STALE_HARD_VIOLATIONS" \
    --arg timestamp "$(date -Iseconds)" \
    '{timestamp: $timestamp, tool: $tool, operation: $operation, errors: $errors, warnings: $warnings, records: $records, valid: $valid, qualityScore: $qualityScore, qualityConfidence: $qualityConfidence, staleHardViolations: $staleHardViolations}')
safe_append_jsonl "$log_entry"

# Handle errors
if [ "$ERROR_COUNT" -gt 0 ]; then
    FIRST_ERRORS=$(echo "$VALIDATION_RESULT" | jq -r '.errors[:3][] | "- Record \(.record): \(.field // "record"): \(.message)"' 2>/dev/null)

    # Log to hook logger if available
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Data validation failed - $ERROR_COUNT errors in $RECORD_COUNT records" \
        "{\"operationType\":\"$OPERATION_TYPE\",\"errorCount\":$ERROR_COUNT,\"recordCount\":$RECORD_COUNT,\"qualityScore\":$QUALITY_SCORE,\"qualityConfidence\":$QUALITY_CONFIDENCE,\"staleHardViolations\":$STALE_HARD_VIOLATIONS}" 2>/dev/null || true

    if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" error \
            "Data Validation Failed" \
            "$ERROR_COUNT validation errors found in $RECORD_COUNT records" \
            "Operation:$OPERATION_TYPE,Errors:$ERROR_COUNT,Records:$RECORD_COUNT,Valid:$VALID_COUNT,QualityScore:$QUALITY_SCORE,QualityConfidence:$QUALITY_CONFIDENCE" \
            "Review the validation errors below,Fix invalid data before proceeding,Use semantic validation for business rule compliance" \
            "Prevents data quality issues | \$45K/year ROI" 2>/dev/null || true
    fi

    echo ""
    echo "Validation Errors:"
    echo "$FIRST_ERRORS"

    if [ "$ERROR_COUNT" -gt 3 ]; then
        echo "... and $((ERROR_COUNT - 3)) more errors"
    fi

    exit 1
fi

# Handle warnings
if [ "$WARNING_COUNT" -gt 0 ]; then
    if [ "$STRICT" == "1" ]; then
        FIRST_WARNINGS=$(echo "$VALIDATION_RESULT" | jq -r '.warnings[:3][] | "- Record \(.record): \(.field // "record"): \(.message)"' 2>/dev/null)

        [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" warning "$HOOK_NAME" "Data validation warnings (STRICT mode)" \
            "{\"operationType\":\"$OPERATION_TYPE\",\"warningCount\":$WARNING_COUNT,\"recordCount\":$RECORD_COUNT,\"qualityScore\":$QUALITY_SCORE,\"qualityConfidence\":$QUALITY_CONFIDENCE}" 2>/dev/null || true

        if [ -f "$OUTPUT_FORMATTER" ]; then
            node "$OUTPUT_FORMATTER" warning \
                "Data Validation Warnings (Strict Mode)" \
                "$WARNING_COUNT warnings found - blocking due to STRICT mode" \
                "Operation:$OPERATION_TYPE,Warnings:$WARNING_COUNT,Records:$RECORD_COUNT,QualityScore:$QUALITY_SCORE,QualityConfidence:$QUALITY_CONFIDENCE" \
                "Review warnings and fix if needed,Set DATA_VALIDATION_STRICT=0 to allow with warnings" \
                "" 2>/dev/null || true
        fi

        echo ""
        echo "Validation Warnings (blocking in STRICT mode):"
        echo "$FIRST_WARNINGS"

        exit 1
    else
        # Exit 2 pattern: Feedback to Claude but allow operation
        [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "Data validation passed with warnings" \
            "{\"operationType\":\"$OPERATION_TYPE\",\"warningCount\":$WARNING_COUNT,\"recordCount\":$RECORD_COUNT,\"qualityScore\":$QUALITY_SCORE,\"qualityConfidence\":$QUALITY_CONFIDENCE}" 2>/dev/null || true

        echo "Data validation: $VALID_COUNT/$RECORD_COUNT records valid ($WARNING_COUNT warnings, quality score $QUALITY_SCORE)" >&2
        exit 2
    fi
fi

# All validation passed
[ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "Data validation passed" \
    "{\"operationType\":\"$OPERATION_TYPE\",\"recordCount\":$RECORD_COUNT,\"qualityScore\":$QUALITY_SCORE,\"qualityConfidence\":$QUALITY_CONFIDENCE,\"staleHardViolations\":$STALE_HARD_VIOLATIONS}" 2>/dev/null || true

exit 0
