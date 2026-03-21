#!/usr/bin/env bash
#
# PostToolUse Hook - Tool Result Validation
#
# Purpose: Validates tool execution results after completion to catch errors
#          before they propagate and cause cascading failures.
#
# Pattern: Adopted from claude-code-hooks-mastery repository
#          https://github.com/disler/claude-code-hooks-mastery
#
# Configuration:
#   ENABLE_TOOL_VALIDATION=1        # Enable (default)
#   ENABLE_TOOL_VALIDATION=0        # Disable
#   TOOL_VALIDATION_STRICT=0        # Warn on failures (default)
#   TOOL_VALIDATION_STRICT=1        # Block on failures
#
# Exit Codes:
#   0 = Success - result is valid
#   1 = Critical failure - block execution
#   2 = Warning - inform Claude but continue
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="post-tool-use"
    # Lenient mode - tool validation should not block on internal errors
    set_lenient_mode 2>/dev/null || true
fi

# NOTE: Do NOT set -euo pipefail here — lenient mode is intentional
# to prevent internal hook errors from blocking tool execution

if ! command -v jq &>/dev/null; then
    echo "[post-tool-use] jq not found, skipping" >&2
    exit 0
fi

is_json() {
  echo "$1" | jq -e . >/dev/null 2>&1
}

json_type() {
  echo "$1" | jq -r 'type' 2>/dev/null || echo ""
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

# Configuration
ENABLED="${ENABLE_TOOL_VALIDATION:-1}"
STRICT="${TOOL_VALIDATION_STRICT:-0}"

# OutputFormatter and HookLogger
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FORMATTER="$SCRIPT_DIR/../scripts/lib/output-formatter.js"
HOOK_LOGGER="$SCRIPT_DIR/../scripts/lib/hook-logger.js"
HOOK_EVENT_NORMALIZER="$SCRIPT_DIR/../scripts/lib/hook-event-normalizer.js"
HOOK_NAME="post-tool-use"

# If disabled, pass through
if [ "$ENABLED" != "1" ]; then
  echo '{}'
  exit 0
fi

# Fast-exit for read-only tools that never produce actionable errors
TOOL_NAME_QUICK="${CLAUDE_TOOL_NAME:-${HOOK_TOOL_NAME:-${TOOL_NAME:-}}}"
case "$TOOL_NAME_QUICK" in
  Read|Glob|Grep|LS|ToolSearch) exit 0 ;;
esac

# Read hook input (JSON from Claude Code, if provided)
HOOK_INPUT=$(read_stdin_json)
NORMALIZED_HOOK_INPUT="$HOOK_INPUT"

if [ -n "$HOOK_INPUT" ] && [ -f "$HOOK_EVENT_NORMALIZER" ] && command -v node >/dev/null 2>&1; then
  NORMALIZED_HOOK_INPUT=$(printf '%s' "$HOOK_INPUT" | node "$HOOK_EVENT_NORMALIZER" 2>/dev/null || echo "$HOOK_INPUT")
fi

# Extract tool information (env first, then hook input)
TOOL_NAME="${CLAUDE_TOOL_NAME:-${HOOK_TOOL_NAME:-${TOOL_NAME:-}}}"
TOOL_ARGS_RAW="${CLAUDE_TOOL_INPUT:-${HOOK_TOOL_INPUT:-${TOOL_INPUT:-}}}"
TOOL_RESULT="${CLAUDE_TOOL_OUTPUT:-${CLAUDE_TOOL_RESULT:-${HOOK_TOOL_OUTPUT:-${TOOL_OUTPUT:-}}}}"
TOOL_EXIT_CODE="${CLAUDE_TOOL_EXIT_CODE:-${HOOK_TOOL_EXIT_CODE:-${TOOL_EXIT_CODE:-}}}"

if [ -n "$NORMALIZED_HOOK_INPUT" ]; then
  if [ -z "$TOOL_NAME" ]; then
    TOOL_NAME=$(echo "$NORMALIZED_HOOK_INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo "unknown")
  fi
  if [ -z "$TOOL_ARGS_RAW" ]; then
    TOOL_ARGS_RAW=$(echo "$NORMALIZED_HOOK_INPUT" | jq -c '.tool_input // .args // {}' 2>/dev/null || echo "")
  fi
  if [ -z "$TOOL_RESULT" ]; then
    TOOL_RESULT=$(echo "$NORMALIZED_HOOK_INPUT" | jq -r '.tool_response // .tool_result // .tool_output // ""' 2>/dev/null || echo "")
  fi
  if [ -z "$TOOL_EXIT_CODE" ]; then
    TOOL_EXIT_CODE=$(echo "$NORMALIZED_HOOK_INPUT" | jq -r '.tool_exit_code // .exitCode // .exit_code // 0' 2>/dev/null || echo "0")
  fi
fi

# Normalize args to a JSON object to keep jq calls safe
TOOL_ARGS="{}"
if [ -n "$TOOL_ARGS_RAW" ]; then
  if is_json "$TOOL_ARGS_RAW" && [ "$(json_type "$TOOL_ARGS_RAW")" = "object" ]; then
    TOOL_ARGS="$TOOL_ARGS_RAW"
  elif [ "$TOOL_NAME" = "Bash" ]; then
    TOOL_ARGS=$(jq -nc --arg command "$TOOL_ARGS_RAW" '{command:$command}')
  elif [ "$TOOL_NAME" = "Write" ] || [ "$TOOL_NAME" = "Edit" ]; then
    TOOL_ARGS=$(jq -nc --arg file_path "$TOOL_ARGS_RAW" '{file_path:$file_path}')
  fi
fi

TOOL_EXIT_CODE="${TOOL_EXIT_CODE:-0}"
if [ -z "$TOOL_NAME" ]; then
  TOOL_NAME="unknown"
fi
if ! [[ "$TOOL_EXIT_CODE" =~ ^[0-9]+$ ]]; then
  TOOL_EXIT_CODE=0
fi

# Log directory
LOG_DIR="${HOME}/.claude/logs/hooks"
mkdir -p "$LOG_DIR" 2>/dev/null || true

# Log file
LOG_FILE="$LOG_DIR/post-tool-use-$(date '+%Y-%m-%d').json"

# Function to log validation event
log_validation() {
  local tool="$1"
  local status="$2"
  local message="$3"
  local severity="${4:-info}"

  local log_entry=$(jq -n \
    --arg timestamp "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    --arg tool "$tool" \
    --arg status "$status" \
    --arg message "$message" \
    --arg severity "$severity" \
    '{
      timestamp: $timestamp,
      hook: "post-tool-use",
      tool: $tool,
      status: $status,
      message: $message,
      severity: $severity
    }')

  echo "$log_entry" >> "$LOG_FILE" 2>/dev/null || true
}

# Get plugin root for validator scripts
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
VALIDATOR_DIR="$PLUGIN_ROOT/scripts/lib/tool-validators"
QUERY_EVIDENCE_TRACKER="$PLUGIN_ROOT/scripts/lib/query-evidence-tracker.js"
ROUTING_STATE_MANAGER="$PLUGIN_ROOT/scripts/lib/routing-state-manager.js"

# Ensure validator directory exists
mkdir -p "$VALIDATOR_DIR" 2>/dev/null || true

# ============================================================================
# QUERY EVIDENCE TRACKING
# ============================================================================
# Track live queries for org verification enforcement

log_query_evidence() {
  local platform="$1"
  local query_type="$2"
  local target="$3"
  local details="${4:-{}}"

  # Skip if tracker doesn't exist
  if [ ! -f "$QUERY_EVIDENCE_TRACKER" ]; then
    return 0
  fi

  # Skip if query evidence tracking is disabled
  if [ "${SKIP_QUERY_EVIDENCE:-0}" = "1" ]; then
    return 0
  fi

  # Log evidence asynchronously to not slow down response
  (
    node "$QUERY_EVIDENCE_TRACKER" log "$platform" "$query_type" "$target" \
      --details "$details" >/dev/null 2>&1 || true
  ) &
}

# Extract object from SOQL query
extract_soql_object() {
  local query="$1"
  # Extract object name from FROM clause
  echo "$query" | grep -oP 'FROM\s+\K[A-Za-z_][A-Za-z0-9_]*' | head -1
}

# Track Salesforce queries
track_salesforce_query() {
  local command="$1"
  local result="$2"

  # Track sf sobject describe
  if echo "$command" | grep -q "sf sobject describe"; then
    local object=$(echo "$command" | grep -oP 'describe\s+\K[A-Za-z_][A-Za-z0-9_]*' | head -1)
    if [ -n "$object" ]; then
      log_query_evidence "salesforce" "sobject-describe" "$object" '{}'
    fi
  fi

  # Track sf data query
  if echo "$command" | grep -q "sf data query"; then
    local soql=$(echo "$command" | grep -oP "(?:--query|-q)\s+['\"]?\K[^'\"]+|(?:--query|-q)\s+\K\S+")
    if [ -n "$soql" ]; then
      local object=$(extract_soql_object "$soql")
      if [ -n "$object" ]; then
        # Determine if tooling API query
        local query_type="data-query"
        if echo "$command" | grep -q "\-\-use-tooling-api"; then
          query_type="tooling-query"
        fi
        log_query_evidence "salesforce" "$query_type" "$object" "{\"query\":\"${soql:0:100}\"}"
      fi
    fi
  fi

  # Track sf metadata describe
  if echo "$command" | grep -q "sf sobject list\|sf org list metadata"; then
    log_query_evidence "salesforce" "metadata-describe" "org-metadata" '{}'
  fi
}

# Track HubSpot queries (from curl commands or MCP calls)
track_hubspot_query() {
  local command="$1"
  local result="$2"

  # Track HubSpot API calls via curl
  if echo "$command" | grep -qE "api\.hubapi\.com|api\.hubspot\.com"; then
    # Extract endpoint
    local endpoint=$(echo "$command" | grep -oP 'api\.hub[a-z]+\.com\K/[^\s"]+' | head -1)

    if echo "$endpoint" | grep -q "/crm/v3/properties"; then
      local object=$(echo "$endpoint" | grep -oP 'properties/\K[a-z]+' | head -1)
      log_query_evidence "hubspot" "property-list" "${object:-contacts}" '{}'
    elif echo "$endpoint" | grep -q "/crm/v3/objects"; then
      local object=$(echo "$endpoint" | grep -oP 'objects/\K[a-z]+' | head -1)
      log_query_evidence "hubspot" "object-schema" "${object:-contacts}" '{}'
    elif echo "$endpoint" | grep -q "/automation"; then
      log_query_evidence "hubspot" "workflow-list" "workflows" '{}'
    fi
  fi
}

# Track Marketo queries
track_marketo_query() {
  local command="$1"
  local result="$2"

  # Track Marketo API calls via curl
  if echo "$command" | grep -q "mktorest\|marketo"; then
    if echo "$command" | grep -q "/rest/v1/leads/describe"; then
      log_query_evidence "marketo" "describe-lead" "Lead" '{}'
    elif echo "$command" | grep -q "/rest/asset/v1/programs"; then
      log_query_evidence "marketo" "list-programs" "programs" '{}'
    elif echo "$command" | grep -q "/rest/asset/v1/campaigns"; then
      log_query_evidence "marketo" "list-campaigns" "campaigns" '{}'
    fi
  fi
}

# Function to validate Bash tool results
validate_bash_tool() {
  local args="$1"
  local result="$2"
  local exit_code="$3"

  # Extract command from args
  local command=$(echo "$args" | jq -r '.command // ""')

  # Check for common error patterns
  if echo "$result" | grep -qi "error\|failed\|fatal\|exception"; then
    log_validation "Bash" "error_detected" "Error pattern found in output" "warning"

    # Check if it's a critical error
    if echo "$result" | grep -qi "fatal\|cannot\|permission denied\|no such file"; then
      ERROR_LINE=$(echo "$result" | grep -i "error\|fatal" | head -1)

      # Log critical error
      [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Critical error in Bash command" \
        "{\"command\":\"$command\",\"error\":\"$ERROR_LINE\"}"

      if [ "$STRICT" = "1" ]; then
        if [ -f "$OUTPUT_FORMATTER" ]; then
          node "$OUTPUT_FORMATTER" error \
            "Critical Bash Command Error" \
            "Fatal error detected in command execution (STRICT mode enabled)" \
            "Command:$command,Error:$ERROR_LINE,Strict Mode:enabled" \
            "Review the error message above,Check command syntax and parameters,Verify file paths and permissions,Set TOOL_VALIDATION_STRICT=0 to warn instead of block" \
            "Tool validation prevents cascading failures"
          exit 1
        else
          echo "❌ [Tool Validator] Critical error detected in Bash command" >&2
          echo "Command: $command" >&2
          echo "Error: $ERROR_LINE" >&2
          exit 1
        fi
      else
        # Exit 2: Warn but don't block
        if [ -f "$OUTPUT_FORMATTER" ]; then
          node "$OUTPUT_FORMATTER" warning \
            "Bash Command Error Detected" \
            "Error pattern found in command output but allowing continuation (STRICT mode disabled)" \
            "Command:$command,Error:$ERROR_LINE,Strict Mode:disabled" \
            "Review the error message,Verify command completed correctly,Consider enabling TOOL_VALIDATION_STRICT=1 for critical operations" \
            ""
          exit 2
        else
          echo "❌ [Tool Validator] Critical error detected in Bash command" >&2
          echo "Command: $command" >&2
          echo "Error: $ERROR_LINE" >&2
          exit 2
        fi
      fi
    fi
  fi

  # Validate SOQL queries
  if echo "$command" | grep -q "sf data query"; then
    validate_soql_query "$command" "$result" "$exit_code"
  fi

  # Validate deployments
  if echo "$command" | grep -q "sf project deploy"; then
    validate_deployment "$command" "$result" "$exit_code"
  fi

  # Validate data operations
  if echo "$command" | grep -qE "sf data (create|update|upsert|delete)"; then
    validate_data_operation "$command" "$result" "$exit_code"
  fi

  # =========================================================================
  # QUERY EVIDENCE TRACKING (for org verification enforcement)
  # =========================================================================
  # Track successful queries as evidence of live validation

  # Only track successful commands (exit code 0)
  if [ "$exit_code" -eq 0 ]; then
    # Track Salesforce queries
    if echo "$command" | grep -qE "^sf\s|sf\s+data|sf\s+sobject"; then
      track_salesforce_query "$command" "$result"
    fi

    # Track HubSpot API calls
    if echo "$command" | grep -qE "hubapi\.com|hubspot"; then
      track_hubspot_query "$command" "$result"
    fi

    # Track Marketo API calls
    if echo "$command" | grep -qE "mktorest|marketo"; then
      track_marketo_query "$command" "$result"
    fi
  fi
}

# Function to validate SOQL query results
validate_soql_query() {
  local command="$1"
  local result="$2"
  local exit_code="$3"

  # Check for empty results when expecting data
  if [ "$exit_code" -eq 0 ]; then
    # Check for "No records found" or empty result set
    if echo "$result" | grep -qi "no records found\|total size: 0"; then
      QUERY_TEXT=$(echo "$command" | grep -oP "SELECT.*FROM.*" | head -1)
      log_validation "SOQL" "empty_result" "Query returned no records" "warning"

      # This might be expected, so just warn (exit 2)
      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" warning \
          "SOQL Query Returned No Records" \
          "Query executed successfully but returned zero results" \
          "Query:$QUERY_TEXT" \
          "Verify query WHERE clause is correct,Check if data exists in this org,Consider if empty result is expected" \
          ""
        exit 2
      else
        echo "⚠️  [Tool Validator] SOQL query returned no records" >&2
        echo "Query: $QUERY_TEXT" >&2
        exit 2
      fi
    fi

    # Check for invalid field errors
    if echo "$result" | grep -qi "INVALID_FIELD\|No such column"; then
      QUERY_TEXT=$(echo "$command" | grep -oP "SELECT.*FROM.*" | head -1)
      log_validation "SOQL" "invalid_field" "Query contains invalid field" "error"

      # Log invalid field error
      [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "SOQL query contains invalid field" \
        "{\"query\":\"$QUERY_TEXT\"}"

      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" error \
          "SOQL Query Invalid Field" \
          "Query contains a field that does not exist on the object" \
          "Query:$QUERY_TEXT" \
          "Verify field API name is correct,Check if field exists in target org,Use 'sf sobject describe' to list available fields,Check for typos in field names" \
          "Prevents query errors from propagating"
        exit 1
      else
        echo "❌ [Tool Validator] SOQL query contains invalid field" >&2
        echo "Query: $QUERY_TEXT" >&2
        exit 1
      fi
    fi
  fi
}

# Function to validate deployment results
validate_deployment() {
  local command="$1"
  local result="$2"
  local exit_code="$3"

  if [ "$exit_code" -ne 0 ]; then
    log_validation "Deployment" "failed" "Deployment command failed" "error"

    # Extract error message
    local error_msg=$(echo "$result" | grep -i "error\|failed" | head -3)

    # Log deployment failure
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Deployment command failed" \
      "{\"command\":\"$command\",\"exitCode\":$exit_code,\"error\":\"$error_msg\"}"

    if [ "$STRICT" = "1" ]; then
      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" error \
          "Deployment Failed" \
          "Deployment command returned non-zero exit code (STRICT mode enabled)" \
          "Exit Code:$exit_code,Error:$error_msg,Strict Mode:enabled" \
          "Review deployment errors above,Check source directory structure,Verify metadata format,Fix errors before retrying,Set TOOL_VALIDATION_STRICT=0 to warn instead of block" \
          "Tool validation prevents cascading failures"
        exit 1
      else
        echo "❌ [Tool Validator] Deployment failed" >&2
        echo "$error_msg" >&2
        exit 1
      fi
    else
      # Exit 2: Warn but don't block
      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" warning \
          "Deployment Failed" \
          "Deployment command returned non-zero exit code but allowing continuation (STRICT mode disabled)" \
          "Exit Code:$exit_code,Error:$error_msg,Strict Mode:disabled" \
          "Review deployment errors,Verify if partial deployment acceptable,Consider enabling TOOL_VALIDATION_STRICT=1 for critical deployments" \
          ""
        exit 2
      else
        echo "❌ [Tool Validator] Deployment failed" >&2
        echo "$error_msg" >&2
        exit 2
      fi
    fi
  else
    # Check for warnings in successful deployment
    if echo "$result" | grep -qi "warning"; then
      log_validation "Deployment" "warnings" "Deployment succeeded with warnings" "warning"

      # Log deployment warnings
      [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" warning "$HOOK_NAME" "Deployment succeeded with warnings" \
        "{\"command\":\"$command\"}"

      # Exit 2 pattern: Automatic feedback without blocking
      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" warning \
          "Deployment Succeeded with Warnings" \
          "Deployment completed successfully but encountered warnings during execution" \
          "Command:$command" \
          "Review warnings in deployment output,Verify deployed components work as expected,Consider addressing warnings before next deployment" \
          ""
        exit 2
      else
        echo "⚠️  [Tool Validator] Deployment succeeded but has warnings" >&2
        exit 2
      fi
    fi
  fi
}

# Function to validate data operation results
validate_data_operation() {
  local command="$1"
  local result="$2"
  local exit_code="$3"

  if [ "$exit_code" -ne 0 ]; then
    log_validation "DataOp" "failed" "Data operation failed" "error"

    local command_preview=$(echo "$command" | head -c 100)

    # Log data operation failure
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Data operation failed" \
      "{\"command\":\"$command_preview\",\"exitCode\":$exit_code}"

    if [ "$STRICT" = "1" ]; then
      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" error \
          "Data Operation Failed" \
          "Data operation command returned non-zero exit code (STRICT mode enabled)" \
          "Exit Code:$exit_code,Command Preview:$command_preview...,Strict Mode:enabled" \
          "Review error message above,Check data format and values,Verify record IDs and field API names,Fix errors before retrying,Set TOOL_VALIDATION_STRICT=0 to warn instead of block" \
          "Tool validation prevents cascading failures"
        exit 1
      else
        echo "❌ [Tool Validator] Data operation failed" >&2
        echo "Command: $command_preview..." >&2
        exit 1
      fi
    else
      # Exit 2: Warn but don't block
      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" warning \
          "Data Operation Failed" \
          "Data operation command returned non-zero exit code but allowing continuation (STRICT mode disabled)" \
          "Exit Code:$exit_code,Command Preview:$command_preview...,Strict Mode:disabled" \
          "Review error message,Verify if partial completion acceptable,Consider enabling TOOL_VALIDATION_STRICT=1 for critical data operations" \
          ""
        exit 2
      else
        echo "❌ [Tool Validator] Data operation failed" >&2
        echo "Command: $command_preview..." >&2
        exit 2
      fi
    fi
  fi

  # Check for partial success (some records failed)
  if echo "$result" | grep -qi "failed.*record"; then
    local failed_count=$(echo "$result" | grep -oP "\d+(?= failed)" | head -1)
    log_validation "DataOp" "partial_failure" "Some records failed: $failed_count" "warning"

    # Log partial failure
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" warning "$HOOK_NAME" "Data operation partially failed" \
      "{\"failedRecords\":\"$failed_count\"}"

    # Exit 2 pattern: Automatic feedback without blocking
    if [ -f "$OUTPUT_FORMATTER" ]; then
      node "$OUTPUT_FORMATTER" warning \
        "Data Operation Partially Failed" \
        "Some records failed during the operation while others succeeded" \
        "Failed Records:$failed_count" \
        "Review failed records in operation output,Identify patterns in failures,Fix data issues for failed records,Consider retrying failed records only" \
        ""
      exit 2
    else
      echo "⚠️  [Tool Validator] Data operation partially failed" >&2
      echo "Failed records: $failed_count" >&2
      exit 2
    fi
  fi
}

# Function to validate Write tool results
validate_write_tool() {
  local args="$1"
  local result="$2"
  local exit_code="$3"

  # Extract file path
  local file_path=$(echo "$args" | jq -r '.file_path // ""')

  if [ "$exit_code" -ne 0 ]; then
    log_validation "Write" "failed" "Write operation failed: $file_path" "error"

    # Log write failure
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Write operation failed" \
      "{\"filePath\":\"$file_path\",\"exitCode\":$exit_code}"

    if [ "$STRICT" = "1" ]; then
      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" error \
          "Write Operation Failed" \
          "Failed to write file (STRICT mode enabled)" \
          "File Path:$file_path,Exit Code:$exit_code,Strict Mode:enabled" \
          "Check file path permissions,Verify parent directory exists,Ensure disk space available,Review error message above,Set TOOL_VALIDATION_STRICT=0 to warn instead of block" \
          "Tool validation prevents cascading failures"
        exit 1
      else
        echo "❌ [Tool Validator] Failed to write file: $file_path" >&2
        exit 1
      fi
    else
      # Exit 2: Warn but don't block
      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" warning \
          "Write Operation Failed" \
          "Failed to write file but allowing continuation (STRICT mode disabled)" \
          "File Path:$file_path,Exit Code:$exit_code,Strict Mode:disabled" \
          "Review error message,Verify file operation was critical,Consider enabling TOOL_VALIDATION_STRICT=1 for critical writes" \
          ""
        exit 2
      else
        echo "❌ [Tool Validator] Failed to write file: $file_path" >&2
        exit 2
      fi
    fi
  fi

  # Verify file was actually created/updated
  if [ -n "$file_path" ] && [ ! -f "$file_path" ]; then
    log_validation "Write" "file_missing" "File does not exist after write: $file_path" "error"

    # Log file missing after write
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "File does not exist after write operation" \
      "{\"filePath\":\"$file_path\"}"

    if [ -f "$OUTPUT_FORMATTER" ]; then
      node "$OUTPUT_FORMATTER" error \
        "Write Verification Failed" \
        "File does not exist after write operation completed" \
        "Expected Path:$file_path" \
        "Verify file path is correct,Check for path typos,Ensure parent directory exists,Review file system permissions" \
        "Prevents silent write failures"
      exit 1
    else
      echo "❌ [Tool Validator] File does not exist after write operation" >&2
      echo "Expected: $file_path" >&2
      exit 1
    fi
  fi
}

# Function to validate Edit tool results
validate_edit_tool() {
  local args="$1"
  local result="$2"
  local exit_code="$3"

  # Extract file path
  local file_path=$(echo "$args" | jq -r '.file_path // ""')

  if [ "$exit_code" -ne 0 ]; then
    log_validation "Edit" "failed" "Edit operation failed: $file_path" "error"

    # Log edit failure
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Edit operation failed" \
      "{\"filePath\":\"$file_path\",\"exitCode\":$exit_code}"

    if [ "$STRICT" = "1" ]; then
      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" error \
          "Edit Operation Failed" \
          "Failed to edit file (STRICT mode enabled)" \
          "File Path:$file_path,Exit Code:$exit_code,Strict Mode:enabled" \
          "Check file path permissions,Verify file exists,Ensure old_string matches exactly,Review error message above,Set TOOL_VALIDATION_STRICT=0 to warn instead of block" \
          "Tool validation prevents cascading failures"
        exit 1
      else
        echo "❌ [Tool Validator] Failed to edit file: $file_path" >&2
        exit 1
      fi
    else
      # Exit 2: Warn but don't block
      if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" warning \
          "Edit Operation Failed" \
          "Failed to edit file but allowing continuation (STRICT mode disabled)" \
          "File Path:$file_path,Exit Code:$exit_code,Strict Mode:disabled" \
          "Review error message,Verify edit operation was critical,Consider enabling TOOL_VALIDATION_STRICT=1 for critical edits" \
          ""
        exit 2
      else
        echo "❌ [Tool Validator] Failed to edit file: $file_path" >&2
        exit 2
      fi
    fi
  fi
}

# ============================================================================
# ROUTING COMPLIANCE CHECKING
# ============================================================================
# Check if Claude ignored a routing recommendation (when Agent delegation was required)

check_routing_compliance() {
  local tool_name="$1"
  local session_key=""
  local routing_state="{}"
  local pending="false"
  local enforce="false"
  local recommended_agent=""
  local action_type=""

  if [ ! -f "$ROUTING_STATE_MANAGER" ] || ! command -v node &>/dev/null; then
    return 0
  fi

  session_key=$(echo "$NORMALIZED_HOOK_INPUT" | jq -r '
    .session_key
    // .sessionKey
    // .session_id
    // .sessionId
    // .context.session_key
    // .context.sessionKey
    // .context.session_id
    // .context.sessionId
    // ""
  ' 2>/dev/null || echo "")

  if [ -z "${session_key// }" ] || [ "$session_key" = "null" ]; then
    session_key="${CLAUDE_SESSION_ID:-default-session}"
  fi

  routing_state=$(node "$ROUTING_STATE_MANAGER" check "$session_key" 2>/dev/null || echo "{}")
  pending=$(echo "$routing_state" | jq -r '.pending // false' 2>/dev/null || echo "false")
  enforce=$(echo "$routing_state" | jq -r '.enforce // false' 2>/dev/null || echo "false")
  recommended_agent=$(echo "$routing_state" | jq -r '.recommendedAgent // ""' 2>/dev/null || echo "")
  action_type=$(echo "$routing_state" | jq -r '.action // ""' 2>/dev/null || echo "")

  if [ "$pending" != "true" ] || [ "$enforce" != "true" ]; then
    return 0
  fi

  if [ "$tool_name" != "Agent" ]; then
    local compliance_log="$HOME/.claude/logs/compliance.jsonl"
    mkdir -p "$(dirname "$compliance_log")" 2>/dev/null || true

    local violation_entry=$(jq -n \
      --arg timestamp "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
      --arg session_key "$session_key" \
      --arg recommended "$recommended_agent" \
      --arg actual "$tool_name" \
      --arg action "$action_type" \
      --arg status "pending_after_tool" \
      '{
        timestamp: $timestamp,
        session_key: $session_key,
        type: "routing_pending_after_tool",
        recommended_agent: $recommended,
        actual_tool: $actual,
        action_type: $action,
        status: $status
      }')

    echo "$violation_entry" >> "$compliance_log" 2>/dev/null || true

    log_validation "$tool_name" "routing_pending" "Routing requirement still pending after tool execution: $recommended_agent" "warning"
  fi

  return 0
}

# ============================================================================
# MAIN VALIDATION LOGIC
# ============================================================================
log_validation "$TOOL_NAME" "validating" "Validating tool result" "info"

# First, check routing compliance (was an agent required but not used?)
check_routing_compliance "$TOOL_NAME"

case "$TOOL_NAME" in
  Bash)
    validate_bash_tool "$TOOL_ARGS" "$TOOL_RESULT" "$TOOL_EXIT_CODE"
    ;;

  Write)
    validate_write_tool "$TOOL_ARGS" "$TOOL_RESULT" "$TOOL_EXIT_CODE"
    ;;

  Edit)
    validate_edit_tool "$TOOL_ARGS" "$TOOL_RESULT" "$TOOL_EXIT_CODE"
    ;;

  Read)
    # Read operations rarely need validation
    # Could add checks for empty files or permission errors
    ;;

  Agent)
    log_validation "Agent" "agent_used" "Agent delegation detected" "info"

    # =========================================================================
    # ACE FRAMEWORK: Record Agent Execution
    # =========================================================================
    # Records agent task completions to ACE for routing optimization
    if [ "${ENABLE_ACE_TRACKING:-1}" = "1" ]; then
      ACE_RECORDER="$PLUGIN_ROOT/scripts/lib/ace-execution-recorder.js"

      if [ -f "$ACE_RECORDER" ] && command -v node &> /dev/null; then
        # Extract agent name and result from Agent args
        TASK_AGENT=$(echo "$TOOL_ARGS" | jq -r '.subagent_type // ""')
        TASK_PROMPT=$(echo "$TOOL_ARGS" | jq -r '.prompt // ""' | head -c 200)
        TASK_SUCCESS="true"

        # Check if task failed (exit code or error pattern in result)
        if [ "$TOOL_EXIT_CODE" -ne 0 ]; then
          TASK_SUCCESS="false"
        elif echo "$TOOL_RESULT" | grep -qi "error\|failed\|exception\|unable to"; then
          # Only mark as failure if it seems like a real error, not just mentioning errors
          if ! echo "$TOOL_RESULT" | grep -qi "fixed\|resolved\|completed\|successfully"; then
            TASK_SUCCESS="false"
          fi
        fi

        # Record execution (async to not slow down response)
        if [ -n "$TASK_AGENT" ]; then
          (
            node "$ACE_RECORDER" \
              --agent "$TASK_AGENT" \
              --success "$TASK_SUCCESS" \
              --task "$TASK_PROMPT" \
              ${ROUTING_VERBOSE:+--verbose} \
              >/dev/null 2>&1 || true
          ) &

          [ "${ROUTING_VERBOSE:-0}" = "1" ] && \
            echo "[ACE] Recording Agent execution: agent=$TASK_AGENT success=$TASK_SUCCESS" >&2
        fi
      fi
    fi
    ;;

  mcp_salesforce*|mcp__salesforce*)
    # MCP Salesforce tools - track as evidence
    log_validation "$TOOL_NAME" "mcp_salesforce" "Salesforce MCP tool executed" "info"

    # Extract object from MCP tool name or args
    local mcp_object=""
    if echo "$TOOL_NAME" | grep -qE "object|field|describe|list"; then
      mcp_object=$(echo "$TOOL_ARGS" | jq -r '.object // .sobject // ""' 2>/dev/null || echo "")
    fi

    # Track as evidence
    if [ "$TOOL_EXIT_CODE" -eq 0 ]; then
      local mcp_type="mcp-object-list"
      if echo "$TOOL_NAME" | grep -q "field"; then
        mcp_type="mcp-field-list"
      elif echo "$TOOL_NAME" | grep -q "flow"; then
        mcp_type="mcp-flow-list"
      elif echo "$TOOL_NAME" | grep -q "validation"; then
        mcp_type="mcp-validation-list"
      elif echo "$TOOL_NAME" | grep -q "query"; then
        mcp_type="data-query"
        mcp_object=$(echo "$TOOL_ARGS" | jq -r '.query // ""' 2>/dev/null | grep -oP 'FROM\s+\K[A-Za-z_]+' | head -1)
      fi
      log_query_evidence "salesforce" "$mcp_type" "${mcp_object:-org-metadata}" '{}'
    fi
    ;;

  mcp_hubspot*|mcp__hubspot*)
    # MCP HubSpot tools - track as evidence
    log_validation "$TOOL_NAME" "mcp_hubspot" "HubSpot MCP tool executed" "info"

    if [ "$TOOL_EXIT_CODE" -eq 0 ]; then
      local hs_object=$(echo "$TOOL_ARGS" | jq -r '.objectType // .object // "contacts"' 2>/dev/null || echo "contacts")
      local hs_type="mcp-objects"
      if echo "$TOOL_NAME" | grep -q "propert"; then
        hs_type="mcp-properties"
      fi
      log_query_evidence "hubspot" "$hs_type" "$hs_object" '{}'
    fi
    ;;

  mcp_marketo*|mcp__marketo*)
    # MCP Marketo tools - track as evidence
    log_validation "$TOOL_NAME" "mcp_marketo" "Marketo MCP tool executed" "info"

    if [ "$TOOL_EXIT_CODE" -eq 0 ]; then
      local mkto_type="mcp-lead-describe"
      if echo "$TOOL_NAME" | grep -q "program"; then
        mkto_type="list-programs"
      elif echo "$TOOL_NAME" | grep -q "campaign"; then
        mkto_type="list-campaigns"
      fi
      log_query_evidence "marketo" "$mkto_type" "Lead" '{}'
    fi
    ;;

  *)
    # Unknown tool - log but don't validate
    log_validation "$TOOL_NAME" "unknown" "Unknown tool type" "info"
    ;;
esac

# If we reach here, validation passed
log_validation "$TOOL_NAME" "passed" "Validation successful" "info"
echo '{}'
exit 0
