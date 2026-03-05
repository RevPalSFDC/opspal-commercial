#!/bin/bash
# =============================================================================
# Task Runner - Main Execution Wrapper for Scheduled Tasks
# =============================================================================
#
# Called by cron to execute scheduled tasks with:
# - Logging to file and structured JSON
# - Timeout enforcement
# - Error capture and reporting
# - Slack notifications
# - Execution history tracking
#
# Usage: task-runner.sh <task-id>
#
# =============================================================================

set -uo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONFIG_FILE="${PLUGIN_ROOT}/scheduler/config/scheduler-config.json"
LOG_DIR="${PLUGIN_ROOT}/scheduler/logs"
HISTORY_FILE="${LOG_DIR}/execution-history.jsonl"

# Source error handler if available
if [[ -f "${PLUGIN_ROOT}/hooks/lib/error-handler.sh" ]]; then
    source "${PLUGIN_ROOT}/hooks/lib/error-handler.sh"
else
    # Fallback logging functions
    log_info() { echo -e "[INFO] [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1" >&2; }
    log_error() { echo -e "[ERROR] [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1" >&2; }
    log_success() { echo -e "[SUCCESS] [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1" >&2; }
fi

# Ensure log directory exists
mkdir -p "${LOG_DIR}"

# =============================================================================
# Helper Functions
# =============================================================================

get_task_config() {
    local task_id="$1"
    jq -r ".tasks[] | select(.id == \"${task_id}\")" "${CONFIG_FILE}" 2>/dev/null
}

get_default_value() {
    local key="$1"
    jq -r ".defaults.${key} // empty" "${CONFIG_FILE}" 2>/dev/null
}

resolve_variables() {
    local value="$1"
    # Resolve common variables
    value="${value//\$\{PROJECT_ROOT\}/${PROJECT_ROOT:-$(pwd)}}"
    value="${value//\$\{PLUGIN_ROOT\}/${PLUGIN_ROOT}}"
    value="${value//\$\{HOME\}/${HOME}}"
    value="${value//\$\{USER\}/${USER:-unknown}}"
    echo "$value"
}

log_execution_start() {
    local task_id="$1"
    local task_name="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    echo "{\"timestamp\":\"${timestamp}\",\"task_id\":\"${task_id}\",\"task_name\":\"${task_name}\",\"event\":\"start\"}" >> "${HISTORY_FILE}"
}

log_execution_end() {
    local task_id="$1"
    local exit_code="$2"
    local duration="$3"
    local output_file="$4"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local status="success"

    [[ "$exit_code" != "0" ]] && status="failure"

    echo "{\"timestamp\":\"${timestamp}\",\"task_id\":\"${task_id}\",\"event\":\"end\",\"status\":\"${status}\",\"exit_code\":${exit_code},\"duration_seconds\":${duration},\"log_file\":\"${output_file}\"}" >> "${HISTORY_FILE}"
}

send_slack_notification() {
    local task_id="$1"
    local task_name="$2"
    local status="$3"
    local duration="$4"
    local log_file="$5"
    local exit_code="${6:-0}"

    # Check if notifier script exists
    if [[ -f "${SCRIPT_DIR}/lib/slack-notifier.js" ]]; then
        node "${SCRIPT_DIR}/lib/slack-notifier.js" \
            --task-id "${task_id}" \
            --task-name "${task_name}" \
            --status "${status}" \
            --duration "${duration}" \
            --log-file "${log_file}" \
            --exit-code "${exit_code}" 2>/dev/null || true
    fi
}

should_notify() {
    local task_config="$1"
    local status="$2"

    # Get notification settings
    local notify_on=$(echo "$task_config" | jq -r '.notifications.slack.notifyOn // []')

    # Check if status is in notify_on array
    if echo "$notify_on" | jq -e "index(\"${status}\")" > /dev/null 2>&1; then
        echo "true"
    else
        # Check defaults
        local default_notify=$(jq -r '.defaults.notifications.slack.notifyOn // []' "${CONFIG_FILE}")
        if echo "$default_notify" | jq -e "index(\"${status}\")" > /dev/null 2>&1; then
            echo "true"
        else
            echo "false"
        fi
    fi
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    local task_id="${1:-}"

    if [[ -z "$task_id" ]]; then
        log_error "Task ID required"
        echo "Usage: $0 <task-id>"
        exit 1
    fi

    # Validate config file exists
    if [[ ! -f "${CONFIG_FILE}" ]]; then
        log_error "Configuration file not found: ${CONFIG_FILE}"
        exit 1
    fi

    # Load task configuration
    local task_config
    task_config=$(get_task_config "$task_id")

    if [[ -z "$task_config" || "$task_config" == "null" ]]; then
        log_error "Task not found: ${task_id}"
        exit 1
    fi

    # Parse task configuration
    local task_name=$(echo "$task_config" | jq -r '.name')
    local task_type=$(echo "$task_config" | jq -r '.type')
    local enabled=$(echo "$task_config" | jq -r '.enabled')
    local timeout=$(echo "$task_config" | jq -r '.timeout // 600')
    local working_dir=$(echo "$task_config" | jq -r '.workingDir // "."')

    # Use defaults if not specified
    [[ "$timeout" == "null" ]] && timeout=$(get_default_value "timeout")
    [[ -z "$timeout" ]] && timeout=600

    # Resolve variables in working directory
    working_dir=$(resolve_variables "$working_dir")

    # Check if enabled
    if [[ "$enabled" == "false" ]]; then
        log_info "Task ${task_id} is disabled, skipping"
        exit 0
    fi

    # Setup logging
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local log_file="${LOG_DIR}/${task_id}_${timestamp}.log"

    log_info "Starting task: ${task_name} (${task_id})"
    log_info "Type: ${task_type}, Timeout: ${timeout}s"
    log_execution_start "$task_id" "$task_name"

    local start_time=$(date +%s)
    local exit_code=0

    # Change to working directory
    if [[ -d "$working_dir" ]]; then
        cd "$working_dir" || {
            log_error "Cannot access working directory: ${working_dir}"
            exit 1
        }
        log_info "Working directory: $(pwd)"
    else
        log_info "Working directory not found, using current: $(pwd)"
    fi

    # Execute based on task type
    case "$task_type" in
        "claude-prompt")
            local prompt=$(echo "$task_config" | jq -r '.prompt')
            prompt=$(resolve_variables "$prompt")

            log_info "Executing Claude prompt..."
            {
                echo "=== Claude Code Scheduled Task ==="
                echo "Task: ${task_name}"
                echo "Time: $(date)"
                echo "Prompt: ${prompt}"
                echo "==================================="
                echo ""
            } > "$log_file"

            timeout "${timeout}" claude -p "$prompt" --dangerously-skip-permissions \
                >> "$log_file" 2>&1
            exit_code=$?
            ;;

        "script")
            local command=$(echo "$task_config" | jq -r '.command')
            command=$(resolve_variables "$command")

            log_info "Executing script: ${command}"
            {
                echo "=== Script Scheduled Task ==="
                echo "Task: ${task_name}"
                echo "Time: $(date)"
                echo "Command: ${command}"
                echo "=============================="
                echo ""
            } > "$log_file"

            # Export any task-specific environment variables
            local env_json=$(echo "$task_config" | jq -r '.env // {}')
            if [[ "$env_json" != "{}" && "$env_json" != "null" ]]; then
                while IFS="=" read -r key value; do
                    [[ -n "$key" ]] && export "$key=$value"
                done < <(echo "$env_json" | jq -r 'to_entries[] | "\(.key)=\(.value)"')
            fi

            timeout "${timeout}" bash -c "$command" \
                >> "$log_file" 2>&1
            exit_code=$?
            ;;

        "hybrid")
            local command=$(echo "$task_config" | jq -r '.command')
            command=$(resolve_variables "$command")

            log_info "Executing hybrid task: ${command}"
            {
                echo "=== Hybrid Scheduled Task ==="
                echo "Task: ${task_name}"
                echo "Time: $(date)"
                echo "Command: ${command}"
                echo "Note: May invoke Claude Code internally"
                echo "=============================="
                echo ""
            } > "$log_file"

            timeout "${timeout}" bash -c "$command" \
                >> "$log_file" 2>&1
            exit_code=$?
            ;;

        *)
            log_error "Unknown task type: ${task_type}"
            exit 1
            ;;
    esac

    # Handle timeout exit code (124)
    if [[ "$exit_code" == "124" ]]; then
        log_error "Task timed out after ${timeout}s"
        echo "" >> "$log_file"
        echo "=== TASK TIMED OUT after ${timeout} seconds ===" >> "$log_file"
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Log completion
    log_execution_end "$task_id" "$exit_code" "$duration" "$log_file"

    # Determine status
    local status="success"
    [[ "$exit_code" != "0" ]] && status="failure"
    [[ "$exit_code" == "124" ]] && status="timeout"

    # Handle notifications
    local should_send=$(should_notify "$task_config" "$status")

    # Also notify on completion if configured
    if [[ "$should_send" != "true" && "$status" == "success" ]]; then
        should_send=$(should_notify "$task_config" "completion")
    fi

    if [[ "$should_send" == "true" ]]; then
        log_info "Sending Slack notification..."
        send_slack_notification "$task_id" "$task_name" "$status" "$duration" "$log_file" "$exit_code"
    fi

    # Log final status
    if [[ "$exit_code" == "0" ]]; then
        log_success "Task completed: ${task_name} (${duration}s)"
    else
        log_error "Task failed: ${task_name} (exit code: ${exit_code}, duration: ${duration}s)"
    fi

    # Append final status to log file
    {
        echo ""
        echo "==================================="
        echo "Exit Code: ${exit_code}"
        echo "Duration: ${duration}s"
        echo "Status: ${status}"
        echo "==================================="
    } >> "$log_file"

    exit "$exit_code"
}

# Execute main function
main "$@"
