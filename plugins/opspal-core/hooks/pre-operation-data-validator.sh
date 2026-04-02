#!/usr/bin/env bash

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

# Hook debug support (all output to stderr)
if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
    set -x
    echo "[hook-debug] $(basename "$0") starting (pid=$$)" >&2
fi

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
        echo "$data" >&2
    else
        echo "" >&2
    fi
}

emit_pretool_noop() {
    printf '{}\n'
}

emit_pretool_decision() {
    local permission_decision="$1"
    local permission_reason="$2"
    local additional_context="${3:-}"

    if ! command -v jq >/dev/null 2>&1; then
        emit_pretool_noop
        return 0
    fi

    jq -nc \
      --arg decision "$permission_decision" \
      --arg reason "$permission_reason" \
      --arg context "$additional_context" \
      '{
        suppressOutput: true,
        hookSpecificOutput: (
          { hookEventName: "PreToolUse" }
          + (if $decision != "" then { permissionDecision: $decision } else {} end)
          + (if $reason != "" then { permissionDecisionReason: $reason } else {} end)
          + (if $context != "" then { additionalContext: $context } else {} end)
        )
      }'
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
NODE_TIMEOUT_SECONDS="${PRE_OPERATION_DATA_VALIDATOR_NODE_TIMEOUT_SECONDS:-3}"

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
SALESFORCE_PLUGIN_DIR="$PROJECT_ROOT/plugins/opspal-salesforce"
ACCOUNT_DEDUP_PRECHECK="$SALESFORCE_PLUGIN_DIR/scripts/lib/account-dedup-pre-check.js"
DEFAULT_LOG_ROOT="${PROJECT_ROOT}/.claude/logs"
LOG_ROOT="${CLAUDE_HOOK_LOG_ROOT:-$DEFAULT_LOG_ROOT}"
FALLBACK_LOG_ROOT="/tmp/.claude/logs"
LOG_FILE=""
HOOK_NAME="pre-operation-data-validator"
PRECHECK_WARNINGS=()

run_node_with_timeout() {
    local timeout_seconds="$1"
    shift

    if command -v timeout >/dev/null 2>&1; then
        timeout "$timeout_seconds" node "$@"
        return $?
    fi

    node "$@"
}

append_precheck_warning() {
    local message="$1"
    PRECHECK_WARNINGS+=("$message")
}

extract_bash_command() {
    echo "$TOOL_INPUT" | jq -r '.command // ""' 2>/dev/null || echo ""
}

extract_sf_target_org() {
    local command="$1"

    if [[ "$command" =~ --target-org[[:space:]]+([^[:space:]]+) ]]; then
        printf '%s' "${BASH_REMATCH[1]}" >&2
        return 0
    fi

    printf '%s' "${SF_TARGET_ORG:-}" >&2
}

extract_sf_sobject() {
    local command="$1"

    if [[ "$command" =~ --sobject[[:space:]]+([^[:space:]]+) ]]; then
        printf '%s' "${BASH_REMATCH[1]}" >&2
        return 0
    fi

    printf '%s' "" >&2
}

extract_sf_operation_verb() {
    local command="$1"

    if echo "$command" | grep -qE 'sf[[:space:]]+data[[:space:]]+create'; then
        printf '%s' "create" >&2
        return 0
    fi
    if echo "$command" | grep -qE 'sf[[:space:]]+data[[:space:]]+upsert'; then
        printf '%s' "upsert" >&2
        return 0
    fi
    if echo "$command" | grep -qE 'sf[[:space:]]+data[[:space:]]+update'; then
        printf '%s' "update" >&2
        return 0
    fi

    printf '%s' "" >&2
}

extract_csv_file_from_command() {
    local command="$1"
    local file=""

    file="$(printf '%s' "$command" | sed -nE "s/.*(--file|-f)[ =]+\"?([^\" ]+)\"?.*/\\2/p" | head -1)"
    if [[ -z "$file" ]]; then
        file="$(printf '%s' "$command" | grep -oE '[^[:space:]]+\.csv' | head -1 || true)"
    fi

    if [[ -n "$file" ]] && [[ ! -f "$file" ]] && [[ -f "$PROJECT_ROOT/$file" ]]; then
        file="$PROJECT_ROOT/$file"
    fi

    printf '%s' "$file" >&2
}

csv_headers_from_file() {
    local csv_file="$1"

    if [[ -z "$csv_file" ]] || [[ ! -f "$csv_file" ]]; then
        printf '%s' "" >&2
        return 0
    fi

    head -1 "$csv_file" 2>/dev/null | tr ',' '\n' | sed 's/\r$//'
}

resolve_log_root() {
    local primary="$LOG_ROOT"
    local fallback="$FALLBACK_LOG_ROOT"

    if mkdir -p "$primary" 2>/dev/null && [ -w "$primary" ]; then
        echo "$primary" >&2
        return 0
    fi

    if mkdir -p "$fallback" 2>/dev/null && [ -w "$fallback" ]; then
        echo "$fallback" >&2
        return 0
    fi

    echo "" >&2
    return 1
}

safe_append_jsonl() {
    local line="$1"
    if [ -z "$LOG_FILE" ]; then
        return 0
    fi
    printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
}

RESOLVED_LOG_ROOT="$(resolve_log_root 2>&1 || true)"
if [ -n "$RESOLVED_LOG_ROOT" ]; then
    LOG_FILE="${RESOLVED_LOG_ROOT}/data-validation.jsonl"
fi

# Exit early if disabled
if [ "$ENABLED" != "1" ]; then
    emit_pretool_noop
    exit 0
fi

# Check if data quality monitor exists
if [ ! -f "$DATA_QUALITY_MONITOR" ]; then
    echo "Warning: data-quality-monitor.js not found at $DATA_QUALITY_MONITOR" >&2
    emit_pretool_noop
    exit 0
fi

# Parse input from stdin (Claude passes tool invocation as JSON)
INPUT_DATA="$(read_stdin_json 2>&1)"

if [ -z "$INPUT_DATA" ]; then
    emit_pretool_noop
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
            TOOL_INPUT=$(jq -nc --arg command "$RAW_COMMAND" '{command:$command}' 2>/dev/null || echo '{}')
        else
            TOOL_INPUT="{}"
        fi
    fi
else
    TOOL_INPUT="{}"
fi

if [ -z "$TOOL_NAME" ]; then
    emit_pretool_noop
    exit 0
fi

# Fast-exit for Bash commands that cannot be data operations.
# Avoids the is_data_operation regex chain for simple shell commands.
if [[ "$TOOL_NAME" == "Bash" ]]; then
    BASH_CMD=$(echo "$TOOL_INPUT" | jq -r '.command // ""' 2>/dev/null || echo "")
    if [[ -n "$BASH_CMD" ]] && ! echo "$BASH_CMD" | grep -qiE 'sf |sfdx |data |upsert|import|export|bulk|merge|dedup|\.csv'; then
        emit_pretool_noop
        exit 0
    fi
fi

# Determine if this is a data operation that needs validation
is_data_operation() {
    local tool="$1"
    local input="$2"

    # MCP Salesforce data operations
    if [[ "$tool" =~ ^mcp.*salesforce.*(query|create|update|upsert|delete) ]]; then
        echo "salesforce_data" >&2
        return 0
    fi

    # MCP HubSpot data operations
    if [[ "$tool" =~ ^mcp.*hubspot.*(create|update|batch) ]]; then
        echo "hubspot_data" >&2
        return 0
    fi

    # Bash with sf data commands
    if [[ "$tool" == "Bash" ]]; then
        local cmd=$(echo "$input" | jq -r '.command // ""' 2>/dev/null)
        if [[ "$cmd" =~ (bulk-merge-executor|bulk-merge-executor-parallel|salesforce-native-merger|generic-record-merger|merge-executor|dedup) ]]; then
            echo "merge_decision_data" >&2
            return 0
        fi
        if [[ "$cmd" =~ sf\ data\ (upsert|import|bulk|update|create) ]]; then
            echo "sf_cli_data" >&2
            return 0
        fi
        # CSV processing — only for write/upsert/import commands, not reads
        if [[ "$cmd" =~ \.csv ]] && echo "$cmd" | grep -qiE 'upsert|import|create|update|insert|load|bulk'; then
            echo "csv_processing" >&2
            return 0
        fi
    fi

    # Write tool with data files
    if [[ "$tool" == "Write" ]]; then
        local filepath=$(echo "$input" | jq -r '.file_path // ""' 2>/dev/null)
        if [[ "$filepath" =~ \.(csv|json|xml)$ ]]; then
            echo "file_data" >&2
            return 0
        fi
    fi

    # Agent tool with data agents
    if [[ "$tool" == "Agent" ]]; then
        local subagent=$(echo "$input" | jq -r '.subagent_type // .agent_type // ""' 2>/dev/null)
        if [[ "$subagent" =~ (data-import|data-export|data-operations|csv) ]]; then
            echo "agent_data" >&2
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
                echo "[]" >&2
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
                echo "[]" >&2
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
                echo "[]" >&2
            fi
            ;;
        file_data)
            # Extract content being written
            local content=$(echo "$input" | jq -r '.content // ""' 2>/dev/null)
            local filepath=$(echo "$input" | jq -r '.file_path // ""' 2>/dev/null)
            if [[ "$filepath" =~ \.json$ ]]; then
                echo "$content" | jq -sc '.' 2>/dev/null || echo "[]"
            elif [[ "$filepath" =~ \.csv$ ]]; then
                echo "$content" | head -101 | python3 -c " >&2
import csv, json, sys
reader = csv.DictReader(sys.stdin)
print(json.dumps(list(reader)))
" 2>/dev/null || echo "[]"
            else
                echo "[]" >&2
            fi
            ;;
        agent_data)
            # Extract from agent prompt (limited ability)
            echo "$input" | jq -c '.data // .records // []' 2>/dev/null || echo "[]"
            ;;
        *)
            echo "[]" >&2
            ;;
    esac
}

# Main validation logic
OPERATION_TYPE="$(is_data_operation "$TOOL_NAME" "$TOOL_INPUT" 2>&1 || true)"

if [ -z "$OPERATION_TYPE" ]; then
    # Not a data operation, skip validation
    emit_pretool_noop
    exit 0
fi

# Extract data to validate
DATA_TO_VALIDATE="$(extract_data_for_validation "$TOOL_NAME" "$TOOL_INPUT" "$OPERATION_TYPE" 2>&1)"

# Check if we have data to validate
DATA_COUNT=$(echo "$DATA_TO_VALIDATE" | jq 'if type == "array" then length else 0 end' 2>/dev/null || echo "0")

if [ "$DATA_COUNT" == "0" ] || [ "$DATA_COUNT" == "null" ]; then
    if [ "$OPERATION_TYPE" = "merge_decision_data" ]; then
        [ -f "$HOOK_LOGGER" ] && run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$HOOK_LOGGER" error "$HOOK_NAME" "Merge validation blocked - no decision data extracted" \
            "{\"operationType\":\"$OPERATION_TYPE\",\"tool\":\"$TOOL_NAME\"}" 2>/dev/null || true
        echo "Data validation blocked: unable to extract merge decision records (expected --decisions JSON)." >&2
        emit_pretool_decision \
          "deny" \
          "DATA_VALIDATION_BLOCKED: Unable to extract merge decision records (expected --decisions JSON)." \
          "Operation type: ${OPERATION_TYPE}. Use a valid --decisions JSON payload before retrying."
        exit 0
    fi
    # No data to validate, allow operation
    emit_pretool_noop
    exit 0
fi

if [ "$OPERATION_TYPE" = "merge_decision_data" ] && [ "$DATA_COUNT" -lt "$MERGE_MIN_SAMPLE_SIZE" ]; then
    [ -f "$HOOK_LOGGER" ] && run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$HOOK_LOGGER" error "$HOOK_NAME" "Merge validation blocked - insufficient sample size" \
        "{\"operationType\":\"$OPERATION_TYPE\",\"recordCount\":$DATA_COUNT,\"requiredMin\":$MERGE_MIN_SAMPLE_SIZE}" 2>/dev/null || true
    echo "Data validation blocked: merge decision sample too small ($DATA_COUNT records, requires >= $MERGE_MIN_SAMPLE_SIZE)." >&2
    emit_pretool_decision \
      "deny" \
      "DATA_VALIDATION_BLOCKED: Merge decision sample too small (${DATA_COUNT} records, requires >= ${MERGE_MIN_SAMPLE_SIZE})." \
      "Operation type: ${OPERATION_TYPE}. Increase the merge decision sample before retrying."
    exit 0
fi

TEMP_DATA=$(mktemp)
trap 'rm -f "$TEMP_DATA"' EXIT
echo "$DATA_TO_VALIDATE" > "$TEMP_DATA"

RAW_BASH_COMMAND=""
SF_TARGET_ORG_VALUE=""
SF_SOBJECT_VALUE=""
SF_OPERATION_VERB=""

if [[ "$TOOL_NAME" == "Bash" ]]; then
    RAW_BASH_COMMAND="$(extract_bash_command)"
    SF_TARGET_ORG_VALUE="$(extract_sf_target_org "$RAW_BASH_COMMAND" 2>&1)"
    SF_SOBJECT_VALUE="$(extract_sf_sobject "$RAW_BASH_COMMAND" 2>&1)"
    SF_OPERATION_VERB="$(extract_sf_operation_verb "$RAW_BASH_COMMAND" 2>&1)"
fi

if [[ "$TOOL_NAME" == "Bash" ]] &&
   [[ -n "$RAW_BASH_COMMAND" ]] &&
   [[ -n "$SF_TARGET_ORG_VALUE" ]] &&
   [[ -n "$SF_SOBJECT_VALUE" ]] &&
   [[ "$SF_OPERATION_VERB" =~ ^(create|update|upsert)$ ]] &&
   command -v sf >/dev/null 2>&1; then

    DESCRIBE_JSON="$(sf sobject describe --sobject "$SF_SOBJECT_VALUE" --target-org "$SF_TARGET_ORG_VALUE" --json 2>/dev/null || true)"

    if [[ -n "$DESCRIBE_JSON" ]]; then
        NON_WRITABLE_FIELDS="$(
            DESCRIBE_JSON="$DESCRIBE_JSON" run_node_with_timeout "$NODE_TIMEOUT_SECONDS" -e "
const fs = require('fs');
const records = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const describe = JSON.parse(process.env.DESCRIBE_JSON || '{}');
const sample = Array.isArray(records) ? records.find(record => record && typeof record === 'object') : null;
const headers = sample ? Object.keys(sample) : [];
const fields = (describe.result?.fields || describe.fields || [])
  .filter(field => headers.includes(field.name) && (field.calculated === true || String(field.type || '').toLowerCase() === 'summary'))
  .map(field => field.name);
process.stdout.write(fields.join('\n'));
" "$TEMP_DATA" 2>/dev/null || true
        )"

        if [[ -n "${NON_WRITABLE_FIELDS// }" ]]; then
            append_precheck_warning "Detected formula or rollup field(s) in ${SF_SOBJECT_VALUE} DML input: $(printf '%s' "$NON_WRITABLE_FIELDS" | paste -sd ', ' -). Salesforce describe metadata can mark these as createable/updateable, but REST upsert rejects them. Re-check with: sf sobject describe --sobject ${SF_SOBJECT_VALUE} --target-org ${SF_TARGET_ORG_VALUE} --json | jq '.result.fields[] | select(.createable==true)'"
        fi
    fi

    if [[ "$SF_SOBJECT_VALUE" == "Contact" ]]; then
        CONTACT_REPARENT_IDS="$(
            run_node_with_timeout "$NODE_TIMEOUT_SECONDS" -e "
const fs = require('fs');
const records = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const ids = [];
for (const record of (Array.isArray(records) ? records : [])) {
  if (record && record.AccountId && record.Id) {
    ids.push(record.Id);
  }
}
process.stdout.write(ids.join('\n'));
" "$TEMP_DATA" 2>/dev/null || true
        )"

        if [[ -n "${CONTACT_REPARENT_IDS// }" ]]; then
            CONTACT_ID_LIST="$(printf '%s\n' "$CONTACT_REPARENT_IDS" | sed '/^$/d' | head -50 | sed "s/.*/'&'/" | paste -sd ',' -)"
            if [[ -n "$CONTACT_ID_LIST" ]]; then
                CONTACT_OWNER_QUERY="SELECT Id, Name, Owner.Name, Owner.IsActive FROM Contact WHERE Id IN (${CONTACT_ID_LIST})"
                CONTACT_OWNER_RESULT="$(sf data query --query "$CONTACT_OWNER_QUERY" --target-org "$SF_TARGET_ORG_VALUE" --json 2>/dev/null || true)"
                INACTIVE_CONTACT_OWNERS="$(
                    printf '%s' "$CONTACT_OWNER_RESULT" | jq -r '
                      (.result.records // [])
                      | map(select(.Owner.IsActive == false))
                      | map("\(.Id):\(.Owner.Name // "Unknown Owner")")
                      | .[]
                    ' 2>/dev/null || true
                )"

                if [[ -n "${INACTIVE_CONTACT_OWNERS// }" ]]; then
                    emit_pretool_decision \
                      "deny" \
                      "DATA_VALIDATION_BLOCKED: Contact AccountId reparenting is blocked because one or more contacts have inactive owners." \
                      "Inactive contact owners detected before Contact.AccountId update: $(printf '%s' "$INACTIVE_CONTACT_OWNERS" | paste -sd '; ' -). Reassign ownership before reparenting."
                    exit 0
                fi
            fi
        fi
    fi

    if [[ "$SF_SOBJECT_VALUE" == "Account" ]] && [[ "$SF_OPERATION_VERB" =~ ^(create|upsert)$ ]] && [[ -f "$ACCOUNT_DEDUP_PRECHECK" ]]; then
        INPUT_ACCOUNTS_JSON="$(
            run_node_with_timeout "$NODE_TIMEOUT_SECONDS" -e "
const fs = require('fs');
const records = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const normalized = (Array.isArray(records) ? records : [])
  .filter(record => record && record.Name)
  .slice(0, 10)
  .map(record => ({
    Name: record.Name,
    Website: record.Website || record.Domain || '',
    emailDomains: [record.EmailDomain || record.Email || ''].filter(Boolean)
  }));
process.stdout.write(JSON.stringify(normalized));
" "$TEMP_DATA" 2>/dev/null || echo "[]"
        )"

        if [[ "$INPUT_ACCOUNTS_JSON" != "[]" ]]; then
            ACCOUNT_SEARCH_TOKENS="$(
                run_node_with_timeout "$NODE_TIMEOUT_SECONDS" -e "
const helper = require(process.argv[1]);
const accounts = JSON.parse(process.argv[2]);
const tokens = [...new Set(accounts.map(account => helper.getSearchToken(account.Name)).filter(Boolean))];
process.stdout.write(tokens.join('\n'));
" "$ACCOUNT_DEDUP_PRECHECK" "$INPUT_ACCOUNTS_JSON" 2>/dev/null || true
            )"

            EXISTING_ACCOUNT_RESULTS="[]"
            while IFS= read -r token; do
                [[ -z "$token" ]] && continue
                SAFE_TOKEN="${token//\'/\\\'}"
                ACCOUNT_QUERY="SELECT Id, Name, Website, (SELECT Email FROM Contacts LIMIT 25) FROM Account WHERE Name LIKE '%${SAFE_TOKEN}%' LIMIT 25"
                ACCOUNT_RESULT="$(sf data query --query "$ACCOUNT_QUERY" --target-org "$SF_TARGET_ORG_VALUE" --json 2>/dev/null || true)"
                EXISTING_ACCOUNT_RESULTS="$(EXISTING_ACCOUNT_RESULTS="$EXISTING_ACCOUNT_RESULTS" ACCOUNT_RESULT="$ACCOUNT_RESULT" run_node_with_timeout "$NODE_TIMEOUT_SECONDS" -e "
const existing = JSON.parse(process.env.EXISTING_ACCOUNT_RESULTS || '[]');
const incoming = JSON.parse(process.env.ACCOUNT_RESULT || '{}');
const records = incoming.result?.records || [];
for (const record of records) {
  const contacts = record.Contacts?.records || [];
  existing.push({
    Id: record.Id,
    Name: record.Name,
    Website: record.Website || '',
    contacts: contacts.map(contact => ({ Email: contact.Email }))
  });
}
process.stdout.write(JSON.stringify(existing));
" 2>/dev/null || echo "$EXISTING_ACCOUNT_RESULTS")"
            done <<< "$ACCOUNT_SEARCH_TOKENS"

            DUPLICATE_MATCHES="$(
                run_node_with_timeout "$NODE_TIMEOUT_SECONDS" -e "
const helper = require(process.argv[1]);
const inputAccounts = JSON.parse(process.argv[2]);
const existingAccounts = JSON.parse(process.argv[3]);
const results = helper.findPotentialDuplicateAccounts(inputAccounts, existingAccounts, { threshold: 85 })
  .filter(result => Array.isArray(result.matches) && result.matches.length > 0)
  .map(result => ({
    input: result.input.name,
    matches: result.matches.slice(0, 3).map(match => ({
      target: match.target,
      confidence: match.confidence,
      matchedDomains: match.matchedDomains || []
    }))
  }));
process.stdout.write(JSON.stringify(results));
" "$ACCOUNT_DEDUP_PRECHECK" "$INPUT_ACCOUNTS_JSON" "$EXISTING_ACCOUNT_RESULTS" 2>/dev/null || echo "[]"
            )"

            if [[ "$DUPLICATE_MATCHES" != "[]" ]]; then
                DUPLICATE_SUMMARY="$(
                    printf '%s' "$DUPLICATE_MATCHES" | jq -r '
                      .[]
                      | "\(.input) -> " + (.matches | map("\(.target) (\(.confidence)%)") | join(", "))
                    ' 2>/dev/null || true
                )"
                emit_pretool_decision \
                  "deny" \
                  "DATA_VALIDATION_BLOCKED: Account create/upsert matched existing accounts at or above the 85% dedup threshold." \
                  "Potential duplicate Accounts detected before write: $(printf '%s' "$DUPLICATE_SUMMARY" | paste -sd '; ' -). Run a dedup review before creating new Account records."
                exit 0
            fi
        fi
    fi
fi

# Run validation via Node.js data-quality-monitor
VALIDATION_RESULT=$(run_node_with_timeout "$NODE_TIMEOUT_SECONDS" -e "
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

        // crossFieldValidation removed — was passing rules: [] (always no-op).
        // Re-enable when config/data-quality-rules.json is populated.

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
                    // C6 fix: Skip read-only Salesforce system timestamps
                    const SF_READONLY_DATES = ['CreatedDate','LastModifiedDate','SystemModstamp','LastActivityDate','LastViewedDate','LastReferencedDate'];
                    // User-configurable exempt fields for historical data imports
                    const userExemptFields = (process.env.DATA_VALIDATION_STALE_EXEMPT_FIELDS || '').split(',').map(f => f.trim()).filter(Boolean);
                    const allExemptFields = [...SF_READONLY_DATES, ...userExemptFields];
                    if (allExemptFields.some(f => field.toLowerCase() === f.toLowerCase())) {
                        // Skip — these are always old on historical records
                    } else {
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
                    } // end SF_READONLY_DATES else
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
PRECHECK_WARNING_COUNT="${#PRECHECK_WARNINGS[@]}"
PRECHECK_WARNING_TEXT=""
if [ "$PRECHECK_WARNING_COUNT" -gt 0 ]; then
    PRECHECK_WARNING_TEXT=$(printf '%s\n' "${PRECHECK_WARNINGS[@]}" | awk '!seen[$0]++')
fi

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
    [ -f "$HOOK_LOGGER" ] && run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$HOOK_LOGGER" error "$HOOK_NAME" "Data validation failed - $ERROR_COUNT errors in $RECORD_COUNT records" \
        "{\"operationType\":\"$OPERATION_TYPE\",\"errorCount\":$ERROR_COUNT,\"recordCount\":$RECORD_COUNT,\"qualityScore\":$QUALITY_SCORE,\"qualityConfidence\":$QUALITY_CONFIDENCE,\"staleHardViolations\":$STALE_HARD_VIOLATIONS}" 2>/dev/null || true

    if [ -f "$OUTPUT_FORMATTER" ]; then
        run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$OUTPUT_FORMATTER" error \
            "Data Validation Failed" \
            "$ERROR_COUNT validation errors found in $RECORD_COUNT records" \
            "Operation:$OPERATION_TYPE,Errors:$ERROR_COUNT,Records:$RECORD_COUNT,Valid:$VALID_COUNT,QualityScore:$QUALITY_SCORE,QualityConfidence:$QUALITY_CONFIDENCE" \
            "Review the validation errors below,Fix invalid data before proceeding,Use semantic validation for business rule compliance" \
            "Prevents data quality issues | \$45K/year ROI" 1>&2 2>/dev/null || true
    fi

    ERROR_CONTEXT="Validation errors for ${OPERATION_TYPE} (${VALID_COUNT}/${RECORD_COUNT} valid, quality score ${QUALITY_SCORE}).
${FIRST_ERRORS}"

    if [ "$ERROR_COUNT" -gt 3 ]; then
        ERROR_CONTEXT="${ERROR_CONTEXT}
... and $((ERROR_COUNT - 3)) more errors"
    fi

    emit_pretool_decision \
      "deny" \
      "DATA_VALIDATION_ERRORS: ${ERROR_COUNT} validation errors found in ${RECORD_COUNT} records." \
      "$ERROR_CONTEXT"
    exit 0
fi

# Handle warnings
if [ "$WARNING_COUNT" -gt 0 ] || [ "$PRECHECK_WARNING_COUNT" -gt 0 ]; then
    TOTAL_WARNING_COUNT=$((WARNING_COUNT + PRECHECK_WARNING_COUNT))
    if [ "$STRICT" == "1" ]; then
        FIRST_WARNINGS=$(echo "$VALIDATION_RESULT" | jq -r '.warnings[:3][] | "- Record \(.record): \(.field // "record"): \(.message)"' 2>/dev/null)
        if [ -n "$PRECHECK_WARNING_TEXT" ]; then
            FIRST_WARNINGS="${FIRST_WARNINGS}
${PRECHECK_WARNING_TEXT}"
        fi

        [ -f "$HOOK_LOGGER" ] && run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$HOOK_LOGGER" warning "$HOOK_NAME" "Data validation warnings (STRICT mode)" \
            "{\"operationType\":\"$OPERATION_TYPE\",\"warningCount\":$TOTAL_WARNING_COUNT,\"recordCount\":$RECORD_COUNT,\"qualityScore\":$QUALITY_SCORE,\"qualityConfidence\":$QUALITY_CONFIDENCE}" 2>/dev/null || true

        if [ -f "$OUTPUT_FORMATTER" ]; then
            run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$OUTPUT_FORMATTER" warning \
                "Data Validation Warnings (Strict Mode)" \
                "$TOTAL_WARNING_COUNT warnings found - blocking due to STRICT mode" \
                "Operation:$OPERATION_TYPE,Warnings:$TOTAL_WARNING_COUNT,Records:$RECORD_COUNT,QualityScore:$QUALITY_SCORE,QualityConfidence:$QUALITY_CONFIDENCE" \
                "Review warnings and fix if needed,Set DATA_VALIDATION_STRICT=0 to allow with warnings" \
                "" 1>&2 2>/dev/null || true
        fi

        WARNING_CONTEXT="Validation warnings for ${OPERATION_TYPE} (${VALID_COUNT}/${RECORD_COUNT} valid, quality score ${QUALITY_SCORE}).
${FIRST_WARNINGS}"

        emit_pretool_decision \
          "deny" \
          "DATA_VALIDATION_WARNINGS_STRICT: ${TOTAL_WARNING_COUNT} warnings found in ${RECORD_COUNT} records." \
          "$WARNING_CONTEXT"
        exit 0
    else
        WARNING_CONTEXT="Data validation warnings for ${OPERATION_TYPE}: ${TOTAL_WARNING_COUNT} warnings, ${VALID_COUNT}/${RECORD_COUNT} valid, quality score ${QUALITY_SCORE}."
        if [ -n "$PRECHECK_WARNING_TEXT" ]; then
            WARNING_CONTEXT="${WARNING_CONTEXT}
${PRECHECK_WARNING_TEXT}"
        fi
        [ -f "$HOOK_LOGGER" ] && run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$HOOK_LOGGER" info "$HOOK_NAME" "Data validation passed with warnings" \
            "{\"operationType\":\"$OPERATION_TYPE\",\"warningCount\":$TOTAL_WARNING_COUNT,\"recordCount\":$RECORD_COUNT,\"qualityScore\":$QUALITY_SCORE,\"qualityConfidence\":$QUALITY_CONFIDENCE}" 2>/dev/null || true

        echo "Data validation: $VALID_COUNT/$RECORD_COUNT records valid ($TOTAL_WARNING_COUNT warnings, quality score $QUALITY_SCORE)" >&2
        emit_pretool_decision \
          "allow" \
          "DATA_VALIDATION_WARNINGS: ${TOTAL_WARNING_COUNT} warnings found in ${RECORD_COUNT} records." \
          "$WARNING_CONTEXT"
        exit 0
    fi
fi

# All validation passed
[ -f "$HOOK_LOGGER" ] && run_node_with_timeout "$NODE_TIMEOUT_SECONDS" "$HOOK_LOGGER" info "$HOOK_NAME" "Data validation passed" \
    "{\"operationType\":\"$OPERATION_TYPE\",\"recordCount\":$RECORD_COUNT,\"qualityScore\":$QUALITY_SCORE,\"qualityConfidence\":$QUALITY_CONFIDENCE,\"staleHardViolations\":$STALE_HARD_VIOLATIONS}" 2>/dev/null || true

if [ "$PRECHECK_WARNING_COUNT" -gt 0 ]; then
    emit_pretool_decision \
      "allow" \
      "DATA_VALIDATION_WARNINGS: ${PRECHECK_WARNING_COUNT} preflight warning(s) detected for ${OPERATION_TYPE}." \
      "$PRECHECK_WARNING_TEXT"
    exit 0
fi

emit_pretool_noop
exit 0
