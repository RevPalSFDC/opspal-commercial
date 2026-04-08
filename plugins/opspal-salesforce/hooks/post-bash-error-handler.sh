#!/usr/bin/env bash
#
# Post-Tool Use Failure Bash Error Handler Hook
# Provides recovery guidance for SOQL errors, jq errors, and describe failures
#
# Triggered: After Bash tool executions fail
# Exit Codes:
#   0 = Continue (always, just provides guidance)

# This is a notification hook — never block. Disable set -e to prevent jq propagation.
set +e

# Ensure jq parsing failures do not propagate under set -e
# This is a notification hook — it should never block tool execution
trap '' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$PLUGIN_ROOT/../.." 2>/dev/null && pwd || pwd)"
DEFAULT_LOG_ROOT="${PROJECT_ROOT}/.claude/logs"
LOG_ROOT="${CLAUDE_HOOK_LOG_ROOT:-$DEFAULT_LOG_ROOT}"
FALLBACK_LOG_ROOT="/tmp/.claude/logs"
LOG_FILE=""

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

classify_error() {
    local result="$1"
    local command="$2"

    if echo "$result" | grep -qi "INVALID_FIELD\\|No such column"; then
        echo "INVALID_FIELD"
        return
    fi
    if echo "$result" | grep -qi "MALFORMED_QUERY\\|unexpected token"; then
        echo "MALFORMED_QUERY"
        return
    fi
    if echo "$result" | grep -qi "INVALID_SESSION_ID\\|expired\\|authentication\\|unauthorized"; then
        echo "AUTH_ERROR"
        return
    fi
    if echo "$result" | grep -qi "REQUEST_LIMIT_EXCEEDED\\|rate limit\\|Too many requests"; then
        echo "API_LIMIT"
        return
    fi
    if echo "$command" | grep -qi "sobject describe"; then
        echo "DESCRIBE_FAILURE"
        return
    fi
    if echo "$result" | grep -qi "timed out\|DEPLOY_TIMEOUT\|timeout.*deploy\|deploy.*timeout"; then
        echo "DEPLOY_TIMEOUT"
        return
    fi
    if echo "$result" | grep -qi "in progress\|metadata.*lock\|ALREADY_IN_PROGRESS\|concurrent.*deploy"; then
        echo "DEPLOY_LOCKED"
        return
    fi
    if echo "$result" | grep -qi "component failure\|failed component\|INVALID_TYPE\|Cannot modify managed"; then
        echo "DEPLOY_COMPONENT_FAILURE"
        return
    fi
    if echo "$result" | grep -qi "test failure\|failing test\|insufficient code coverage"; then
        echo "DEPLOY_TEST_FAILURE"
        return
    fi
    echo "UNKNOWN_ERROR"
}

build_message_preview() {
    local input="$1"
    local cleaned
    cleaned=$(echo "$input" | tr '\n' ' ' | sed 's/"/\\"/g')
    echo "${cleaned:0:240}"
}

RESOLVED_LOG_ROOT="$(resolve_log_root || true)"
if [ -n "$RESOLVED_LOG_ROOT" ]; then
    LOG_FILE="${RESOLVED_LOG_ROOT}/post-bash-error-handler.jsonl"
fi

# Read input from stdin
INPUT=$(cat)

# Extract tool result and command from the live PostToolUseFailure payload.
# Keep legacy fallbacks for older local test payloads.
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
EXIT_CODE=$(echo "$INPUT" | jq -r '.tool_response.exit_code // .tool_response.exitCode // .tool_result.exit_code // .tool_result.exitCode // empty' 2>/dev/null || echo "")
IS_INTERRUPT=$(echo "$INPUT" | jq -r '.is_interrupt // false' 2>/dev/null || echo "")
RESULT=$(echo "$INPUT" | jq -r '
  .error // (
    (
      (.tool_response.stderr // .tool_result.stderr // "")
      + " "
      + (.tool_response.stdout // .tool_result.stdout // "")
    ) | gsub("\\s+"; " ") | sub("^\\s+"; "") | sub("\\s+$"; "")
  )
' 2>/dev/null)

# Fallback to the serialized result payload when stderr/stdout are missing
if [ -z "$RESULT" ]; then
    RESULT=$(echo "$INPUT" | jq -c '.tool_response // .tool_result // empty' 2>/dev/null || echo "")
fi

# If no result or command, or if the failure was user interruption, pass through
if [ -z "$RESULT" ] && [ -z "$COMMAND" ]; then
    printf '{}\n'
    exit 0
fi

# User interruption does not need recovery guidance.
if [ "$IS_INTERRUPT" = "true" ]; then
    printf '{}\n'
    exit 0
fi

GUIDANCE=""

# SOQL INVALID_FIELD error
if echo "$RESULT" | grep -qi "INVALID_FIELD\|invalid field\|No such column"; then
    FIELD=$(echo "$RESULT" | grep -oP "(?:INVALID_FIELD|No such column).*?['\"]?(\w+)['\"]?" | head -1)
    GUIDANCE="[SOQL Error Recovery]\n"
    GUIDANCE+="An invalid field was referenced in the query.\n\n"
    GUIDANCE+="**Common causes:**\n"
    GUIDANCE+="1. Field API name is incorrect (check casing)\n"
    GUIDANCE+="2. Field doesn't exist on the object\n"
    GUIDANCE+="3. User doesn't have FLS access to the field\n"
    GUIDANCE+="4. Using a relationship field incorrectly\n\n"
    GUIDANCE+="**Recovery steps:**\n"
    GUIDANCE+="1. Run: sf sobject describe <Object> | jq '.fields[].name' to list valid fields\n"
    GUIDANCE+="2. Verify field exists and is accessible\n"
    GUIDANCE+="3. Check if field requires --use-tooling-api flag"

    # Write error state marker so downstream deploy hooks can warn
    MARKER_DIR="${PROJECT_ROOT:-.}/.claude/deploy-error-state"
    mkdir -p "$MARKER_DIR" 2>/dev/null || true
    SOQL_OBJECT=$(echo "$COMMAND" | grep -oiP 'FROM\s+\K\w+' 2>/dev/null | head -1)
    jq -nc --arg obj "${SOQL_OBJECT:-unknown}" --arg ts "$(date +%s)" \
      '{object: $obj, timestamp: $ts, error: "INVALID_FIELD"}' \
      > "$MARKER_DIR/last-field-error.json" 2>/dev/null || true
fi

# jq exit code 5 (parse error)
if [ "$EXIT_CODE" = "5" ] || echo "$RESULT" | grep -qi "parse error\|jq: error"; then
    GUIDANCE="[jq Error Recovery]\n"
    GUIDANCE+="The jq expression has a syntax error.\n\n"
    GUIDANCE+="**Common causes:**\n"
    GUIDANCE+="1. Unbalanced brackets, braces, or parentheses\n"
    GUIDANCE+="2. Missing or extra quotes\n"
    GUIDANCE+="3. Invalid filter expression\n"
    GUIDANCE+="4. Incomplete pipe (ending with |)\n\n"
    GUIDANCE+="**Recovery steps:**\n"
    GUIDANCE+="1. Test the jq expression separately: echo '{}' | jq '<expression>'\n"
    GUIDANCE+="2. Check for balanced brackets: [ ] { } ( )\n"
    GUIDANCE+="3. Verify the JSON input is valid: jq '.' <file>"
fi

# Describe failures
if echo "$COMMAND" | grep -qi "sobject describe" && [ "$EXIT_CODE" != "0" ]; then
    GUIDANCE="[Describe Error Recovery]\n"
    GUIDANCE+="Failed to describe the Salesforce object.\n\n"
    GUIDANCE+="**Common causes:**\n"
    GUIDANCE+="1. Object API name is incorrect\n"
    GUIDANCE+="2. Object doesn't exist in the org\n"
    GUIDANCE+="3. User doesn't have access to the object\n"
    GUIDANCE+="4. Session has expired\n\n"
    GUIDANCE+="**Recovery steps:**\n"
    GUIDANCE+="1. Check org authentication: sf org display\n"
    GUIDANCE+="2. List available objects: sf sobject list\n"
    GUIDANCE+="3. Verify object name casing (API names are case-sensitive)"
fi

# API limit errors
if echo "$RESULT" | grep -qi "REQUEST_LIMIT_EXCEEDED\|rate limit\|Too many requests"; then
    GUIDANCE="[API Limit Error Recovery]\n"
    GUIDANCE+="Salesforce API rate limit exceeded.\n\n"
    GUIDANCE+="**Recovery steps:**\n"
    GUIDANCE+="1. Wait 1-2 minutes before retrying\n"
    GUIDANCE+="2. Check org limits: sf limits api display\n"
    GUIDANCE+="3. Use Bulk API for large operations\n"
    GUIDANCE+="4. Batch operations into smaller chunks"
fi

# Authentication errors
if echo "$RESULT" | grep -qi "INVALID_SESSION_ID\|expired\|unauthorized\|authentication"; then
    GUIDANCE="[Authentication Error Recovery]\n"
    GUIDANCE+="Session has expired or is invalid.\n\n"
    GUIDANCE+="**Recovery steps:**\n"
    GUIDANCE+="1. Re-authenticate: sf org login web -a <alias>\n"
    GUIDANCE+="2. Check current org: sf org display\n"
    GUIDANCE+="3. List available orgs: sf org list"
fi

# Deploy timeout (process-level or CLI timeout)
if [ -z "$GUIDANCE" ] && echo "$RESULT" | grep -qi "timed out\|DEPLOY_TIMEOUT\|timeout.*deploy\|deploy.*timeout"; then
    GUIDANCE="[Deploy Timeout Recovery]\n"
    GUIDANCE+="The deployment timed out waiting for Salesforce.\n\n"
    GUIDANCE+="**Recovery steps:**\n"
    GUIDANCE+="1. Check deployment status: sf project deploy report --use-most-recent\n"
    GUIDANCE+="2. Cancel if stuck: sf project deploy cancel --use-most-recent\n"
    GUIDANCE+="3. Re-run with --async flag and poll manually\n"
    GUIDANCE+="4. Check Setup > Deployment Status in the org for queued jobs"
fi

# Metadata lock / concurrent deployment
if [ -z "$GUIDANCE" ] && echo "$RESULT" | grep -qi "in progress\|metadata.*lock\|ALREADY_IN_PROGRESS\|concurrent.*deploy"; then
    GUIDANCE="[Deploy Lock Recovery]\n"
    GUIDANCE+="Another deployment is already in progress on this org.\n\n"
    GUIDANCE+="**Recovery steps:**\n"
    GUIDANCE+="1. Check current deploy: sf project deploy report --use-most-recent\n"
    GUIDANCE+="2. Wait for it to finish, or cancel: sf project deploy cancel --use-most-recent\n"
    GUIDANCE+="3. Check Setup > Deployment Status for change sets or other deploys"
fi

# Component failure (most common deploy error)
if [ -z "$GUIDANCE" ] && echo "$RESULT" | grep -qi "component failure\|failed component\|INVALID_TYPE\|Cannot modify managed"; then
    GUIDANCE="[Deploy Component Failure]\n"
    GUIDANCE+="One or more components failed to deploy.\n\n"
    GUIDANCE+="**Recovery steps:**\n"
    GUIDANCE+="1. Review failed components: sf project deploy report --use-most-recent\n"
    GUIDANCE+="2. Check field/object dependencies exist in target org\n"
    GUIDANCE+="3. Verify API version compatibility\n"
    GUIDANCE+="4. For managed package conflicts, check installed package versions"
fi

# Test failure blocking deploy
if [ -z "$GUIDANCE" ] && echo "$RESULT" | grep -qi "test failure\|failing test\|insufficient code coverage"; then
    GUIDANCE="[Deploy Test Failure]\n"
    GUIDANCE+="Apex test failures are blocking the deployment.\n\n"
    GUIDANCE+="**Recovery steps:**\n"
    GUIDANCE+="1. Run tests standalone: sf apex test run --target-org <org> --wait 10\n"
    GUIDANCE+="2. Deploy with specific tests: --test-level RunSpecifiedTests --tests <TestClass>\n"
    GUIDANCE+="3. For non-production, consider: --test-level NoTestRun"
fi

# Deploy queued (not failed, but slow)
if [ -z "$GUIDANCE" ] && echo "$RESULT" | grep -qi "Queued\|PENDING\|InProgress" && echo "$COMMAND" | grep -qi "deploy"; then
    GUIDANCE="[Deploy Status: Queued/In-Progress]\n"
    GUIDANCE+="The deployment was submitted but hasn't completed yet.\n\n"
    GUIDANCE+="**This is not necessarily an error.** Recovery steps:\n"
    GUIDANCE+="1. Poll status: sf project deploy report --use-most-recent\n"
    GUIDANCE+="2. If stuck, cancel: sf project deploy cancel --use-most-recent\n"
    GUIDANCE+="3. Use --async flag to avoid blocking the session"
fi

# Output guidance if found
if [ -n "$GUIDANCE" ]; then
    GUIDANCE_TEXT=$(printf '%b' "$GUIDANCE")
    jq -nc --arg guidance "$GUIDANCE_TEXT" '{
        suppressOutput: true,
        hookSpecificOutput: {
            hookEventName: "PostToolUseFailure",
            additionalContext: $guidance
        }
    }'
fi

# Persist structured error event for easier root-cause analysis
if command -v jq >/dev/null 2>&1; then
    ERROR_CLASS="$(classify_error "$RESULT" "$COMMAND")"
    RESULT_PREVIEW="$(build_message_preview "$RESULT")"
    COMMAND_PREVIEW="$(build_message_preview "$COMMAND")"
    log_entry=$(jq -nc \
        --arg timestamp "$(date -Iseconds)" \
        --arg hook "post-bash-error-handler" \
        --arg errorClass "$ERROR_CLASS" \
        --arg command "$COMMAND_PREVIEW" \
        --arg result "$RESULT_PREVIEW" \
        --arg exitCode "${EXIT_CODE:-unknown}" \
        --argjson hasGuidance "$([ -n "$GUIDANCE" ] && echo true || echo false)" \
        '{timestamp: $timestamp, hook: $hook, errorClass: $errorClass, command: $command, result: $result, exitCode: $exitCode, guidanceProvided: $hasGuidance}')
    safe_append_jsonl "$log_entry"
fi

# If structured guidance was already emitted to stdout, exit to avoid double JSON output
if [ -n "$GUIDANCE" ]; then
    exit 0
fi

printf '{}\n'
exit 0
