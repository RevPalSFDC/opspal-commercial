#!/bin/bash
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
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/cross-platform-plugin/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="post-tool-use"
    # Lenient mode - tool validation should not block on internal errors
    set_lenient_mode 2>/dev/null || true
fi

set -euo pipefail

# Configuration
ENABLED="${ENABLE_TOOL_VALIDATION:-1}"
STRICT="${TOOL_VALIDATION_STRICT:-0}"

# OutputFormatter and HookLogger
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FORMATTER="$SCRIPT_DIR/../scripts/lib/output-formatter.js"
HOOK_LOGGER="$SCRIPT_DIR/../scripts/lib/hook-logger.js"
HOOK_NAME="post-tool-use"

# If disabled, pass through
if [ "$ENABLED" != "1" ]; then
  echo '{}'
  exit 0
fi

# Read hook input (JSON from Claude Code)
HOOK_INPUT=$(cat)

# Extract tool information
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool // "unknown"')
TOOL_ARGS=$(echo "$HOOK_INPUT" | jq -r '.args // {}')
TOOL_RESULT=$(echo "$HOOK_INPUT" | jq -r '.result // ""')
TOOL_EXIT_CODE=$(echo "$HOOK_INPUT" | jq -r '.exitCode // 0')

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

# Ensure validator directory exists
mkdir -p "$VALIDATOR_DIR" 2>/dev/null || true

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
# Check if Claude ignored a routing recommendation (when Task tool was required)

check_routing_compliance() {
  local tool_name="$1"

  # Routing state file created by UserPromptSubmit hook
  local state_file="$HOME/.claude/routing-state.json"

  # Skip if no routing state exists
  if [ ! -f "$state_file" ]; then
    return 0
  fi

  # Read routing state
  local state=$(cat "$state_file" 2>/dev/null || echo '{}')
  local was_blocked=$(echo "$state" | jq -r '.blocked // false')
  local recommended_agent=$(echo "$state" | jq -r '.agent // ""')
  local action_type=$(echo "$state" | jq -r '.action // ""')
  local state_timestamp=$(echo "$state" | jq -r '.timestamp // 0')

  # State expires after 60 seconds
  local now=$(date +%s)
  local age=$((now - state_timestamp))
  if [ "$age" -gt 60 ]; then
    rm -f "$state_file" 2>/dev/null || true
    return 0
  fi

  # Check if Claude ignored a blocking recommendation
  if [ "$was_blocked" = "true" ] && [ "$tool_name" != "Task" ]; then
    # COMPLIANCE VIOLATION: Task tool was required but not used

    # Log to compliance file
    local compliance_log="$HOME/.claude/logs/compliance.jsonl"
    mkdir -p "$(dirname "$compliance_log")" 2>/dev/null || true

    local violation_entry=$(jq -n \
      --arg timestamp "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
      --arg recommended "$recommended_agent" \
      --arg actual "$tool_name" \
      --arg action "$action_type" \
      --argjson violation true \
      '{
        timestamp: $timestamp,
        type: "routing_ignored",
        recommended_agent: $recommended,
        actual_tool: $actual,
        action_type: $action,
        violation: $violation
      }')

    echo "$violation_entry" >> "$compliance_log" 2>/dev/null || true

    # Log validation event
    log_validation "$tool_name" "compliance_violation" "Routing recommendation ignored: $recommended_agent" "warning"

    # Output warning to Claude via exit code 2
    if [ -f "$OUTPUT_FORMATTER" ]; then
      node "$OUTPUT_FORMATTER" warning \
        "Routing Compliance Violation" \
        "An agent was recommended but not used. This may produce suboptimal results." \
        "Recommended Agent:$recommended_agent,Actual Tool:$tool_name,Action:$action_type" \
        "Consider using Task tool with the recommended agent,Review routing recommendations before execution,Check if direct execution was intentional" \
        ""
    else
      echo "⚠️  [Compliance] Routing recommendation ignored" >&2
      echo "   Recommended: Task tool with $recommended_agent" >&2
      echo "   Used: $tool_name" >&2
    fi

    # Clear state after checking (one-time check per prompt)
    rm -f "$state_file" 2>/dev/null || true

    # Exit code 2: Warning feedback to Claude
    exit 2
  fi

  # If Task tool was used, clear the state (compliance satisfied)
  if [ "$tool_name" = "Task" ]; then
    rm -f "$state_file" 2>/dev/null || true
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

  Task)
    # Task tool usage - compliance satisfied, state already cleared
    log_validation "Task" "agent_used" "Agent delegation detected" "info"

    # =========================================================================
    # ACE FRAMEWORK: Record Task Execution
    # =========================================================================
    # Records agent task completions to ACE for routing optimization
    if [ "${ENABLE_ACE_TRACKING:-1}" = "1" ]; then
      ACE_RECORDER="$PLUGIN_ROOT/scripts/lib/ace-execution-recorder.js"

      if [ -f "$ACE_RECORDER" ] && command -v node &> /dev/null; then
        # Extract agent name and result from Task args
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
              2>/dev/null || true
          ) &

          [ "${ROUTING_VERBOSE:-0}" = "1" ] && \
            echo "[ACE] Recording Task execution: agent=$TASK_AGENT success=$TASK_SUCCESS" >&2
        fi
      fi
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
