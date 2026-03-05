#!/usr/bin/env bash

##
## Hook Progress Helper Library
##
## Provides standardized progress message functions for hooks to show real-time
## progress during long-running operations.
##
## Features:
## - Start/update/complete progress messages
## - Spinner animations for indeterminate progress
## - Progress bars for determinate progress
## - Color-coded messages (info, success, warning, error)
## - Elapsed time tracking
##
## Usage:
##   source "$(dirname "$0")/../scripts/lib/hook-progress-helper.sh"
##   progress_start "Analyzing task complexity"
##   progress_update "Running auto-router" 50
##   progress_complete "Analysis complete"
##
## Version: 1.0.0
## Author: RevPal Engineering
## Date: 2025-11-04
##

# Color codes
readonly COLOR_RESET='\033[0m'
readonly COLOR_BLUE='\033[34m'
readonly COLOR_GREEN='\033[32m'
readonly COLOR_YELLOW='\033[33m'
readonly COLOR_RED='\033[31m'
readonly COLOR_CYAN='\033[36m'

# Unicode symbols
readonly SYMBOL_PROGRESS='⏳'
readonly SYMBOL_SUCCESS='✅'
readonly SYMBOL_WARNING='⚠️'
readonly SYMBOL_ERROR='❌'
readonly SYMBOL_INFO='ℹ️'

# Spinner frames
readonly SPINNER_FRAMES=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')

# Global state
PROGRESS_START_TIME=0
PROGRESS_CURRENT_MESSAGE=""
PROGRESS_SPINNER_FRAME=0

##
## Start a progress operation
##
## Arguments:
##   $1 - Message to display
##
## Example:
##   progress_start "Analyzing task complexity"
##
progress_start() {
    local message="$1"
    PROGRESS_START_TIME=$(date +%s)
    PROGRESS_CURRENT_MESSAGE="$message"
    PROGRESS_SPINNER_FRAME=0

    # Output to stderr so it doesn't interfere with hook JSON output
    echo -e "${COLOR_CYAN}${SYMBOL_PROGRESS}${COLOR_RESET} ${message}..." >&2
}

##
## Update progress with percentage (determinate progress)
##
## Arguments:
##   $1 - Message to display
##   $2 - Percentage (0-100) [optional]
##
## Example:
##   progress_update "Running auto-router" 50
##
progress_update() {
    local message="$1"
    local percent="${2:-}"

    PROGRESS_CURRENT_MESSAGE="$message"

    if [[ -n "$percent" ]]; then
        # Determinate progress with percentage
        local bar_width=20
        local filled=$((percent * bar_width / 100))
        local empty=$((bar_width - filled))

        local bar="["
        for ((i=0; i<filled; i++)); do bar+="█"; done
        for ((i=0; i<empty; i++)); do bar+="░"; done
        bar+="]"

        echo -e "${COLOR_CYAN}${SYMBOL_PROGRESS}${COLOR_RESET} ${message} ${bar} ${percent}%" >&2
    else
        # Indeterminate progress with spinner
        local frame="${SPINNER_FRAMES[$PROGRESS_SPINNER_FRAME]}"
        PROGRESS_SPINNER_FRAME=$(( (PROGRESS_SPINNER_FRAME + 1) % ${#SPINNER_FRAMES[@]} ))

        echo -e "${COLOR_CYAN}${frame}${COLOR_RESET} ${message}..." >&2
    fi
}

##
## Update progress with spinner (indeterminate progress)
##
## Arguments:
##   $1 - Message to display
##
## Example:
##   progress_spinner "Running complex analysis"
##
progress_spinner() {
    local message="$1"
    progress_update "$message"
}

##
## Complete progress operation successfully
##
## Arguments:
##   $1 - Completion message
##   $2 - Show elapsed time (true/false) [optional, default: false]
##
## Example:
##   progress_complete "Analysis complete" true
##
progress_complete() {
    local message="$1"
    local show_time="${2:-false}"

    local elapsed=""
    if [[ "$show_time" == "true" ]] && [[ $PROGRESS_START_TIME -gt 0 ]]; then
        local end_time=$(date +%s)
        local duration=$((end_time - PROGRESS_START_TIME))
        elapsed=" (${duration}s)"
    fi

    echo -e "${COLOR_GREEN}${SYMBOL_SUCCESS}${COLOR_RESET} ${message}${elapsed}" >&2

    # Reset state
    PROGRESS_START_TIME=0
    PROGRESS_CURRENT_MESSAGE=""
}

##
## Complete progress operation with warning
##
## Arguments:
##   $1 - Warning message
##   $2 - Show elapsed time (true/false) [optional, default: false]
##
## Example:
##   progress_warning "Analysis completed with warnings"
##
progress_warning() {
    local message="$1"
    local show_time="${2:-false}"

    local elapsed=""
    if [[ "$show_time" == "true" ]] && [[ $PROGRESS_START_TIME -gt 0 ]]; then
        local end_time=$(date +%s)
        local duration=$((end_time - PROGRESS_START_TIME))
        elapsed=" (${duration}s)"
    fi

    echo -e "${COLOR_YELLOW}${SYMBOL_WARNING}${COLOR_RESET} ${message}${elapsed}" >&2

    # Reset state
    PROGRESS_START_TIME=0
    PROGRESS_CURRENT_MESSAGE=""
}

##
## Complete progress operation with error
##
## Arguments:
##   $1 - Error message
##   $2 - Show elapsed time (true/false) [optional, default: false]
##
## Example:
##   progress_error "Analysis failed"
##
progress_error() {
    local message="$1"
    local show_time="${2:-false}"

    local elapsed=""
    if [[ "$show_time" == "true" ]] && [[ $PROGRESS_START_TIME -gt 0 ]]; then
        local end_time=$(date +%s)
        local duration=$((end_time - PROGRESS_START_TIME))
        elapsed=" (${duration}s)"
    fi

    echo -e "${COLOR_RED}${SYMBOL_ERROR}${COLOR_RESET} ${message}${elapsed}" >&2

    # Reset state
    PROGRESS_START_TIME=0
    PROGRESS_CURRENT_MESSAGE=""
}

##
## Show info message (not part of progress sequence)
##
## Arguments:
##   $1 - Info message
##
## Example:
##   progress_info "Using auto-router for complexity analysis"
##
progress_info() {
    local message="$1"
    echo -e "${COLOR_BLUE}${SYMBOL_INFO}${COLOR_RESET} ${message}" >&2
}

##
## Multi-step progress operation
##
## Arguments:
##   $1 - Current step number
##   $2 - Total steps
##   $3 - Step message
##
## Example:
##   progress_step 2 5 "Validating permissions"
##   # Output: ⏳ [2/5] Validating permissions...
##
progress_step() {
    local current="$1"
    local total="$2"
    local message="$3"

    local percent=$((current * 100 / total))

    echo -e "${COLOR_CYAN}${SYMBOL_PROGRESS}${COLOR_RESET} [${current}/${total}] ${message}... (${percent}%)" >&2
}

##
## Run a command with progress spinner
##
## Arguments:
##   $1 - Message to display
##   $2+ - Command to run
##
## Example:
##   progress_run "Running auto-router" node scripts/auto-agent-router.js route "$message"
##
## Returns:
##   Exit code of the command
##
progress_run() {
    local message="$1"
    shift
    local cmd=("$@")

    progress_start "$message"

    # Run command and capture exit code
    local exit_code=0
    "${cmd[@]}" || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        progress_complete "$message" true
    else
        progress_error "$message failed (exit code: $exit_code)" true
    fi

    return $exit_code
}

##
## Run a command with determinate progress updates
##
## Arguments:
##   $1 - Message prefix
##   $2 - Progress file path (file containing progress percentage)
##   $3+ - Command to run
##
## Example:
##   # Command writes progress to /tmp/progress.txt (e.g., "50")
##   progress_run_with_file "Analyzing" /tmp/progress.txt node scripts/analyzer.js
##
## Returns:
##   Exit code of the command
##
progress_run_with_file() {
    local message="$1"
    local progress_file="$2"
    shift 2
    local cmd=("$@")

    progress_start "$message"

    # Run command in background
    "${cmd[@]}" &
    local cmd_pid=$!

    # Monitor progress file
    while kill -0 $cmd_pid 2>/dev/null; do
        if [[ -f "$progress_file" ]]; then
            local percent=$(cat "$progress_file" 2>/dev/null || echo "0")
            progress_update "$message" "$percent"
        else
            progress_spinner "$message"
        fi
        sleep 0.5
    done

    # Get final exit code
    wait $cmd_pid
    local exit_code=$?

    # Clean up progress file
    rm -f "$progress_file" 2>/dev/null || true

    if [[ $exit_code -eq 0 ]]; then
        progress_complete "$message" true
    else
        progress_error "$message failed" true
    fi

    return $exit_code
}

##
## Example usage (for testing)
##
## Uncomment and run: bash hook-progress-helper.sh
##
# if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
#     echo "=== Hook Progress Helper - Demo ===" >&2
#     echo "" >&2
#
#     # Example 1: Simple progress
#     progress_start "Initializing"
#     sleep 1
#     progress_complete "Initialization complete" true
#     echo "" >&2
#
#     # Example 2: Progress with updates
#     progress_start "Processing data"
#     for i in {1..5}; do
#         sleep 0.5
#         progress_update "Processing batch $i" $((i * 20))
#     done
#     progress_complete "Data processing complete" true
#     echo "" >&2
#
#     # Example 3: Multi-step
#     for step in {1..3}; do
#         progress_step $step 3 "Step $step"
#         sleep 0.5
#     done
#     progress_complete "All steps complete" true
#     echo "" >&2
#
#     # Example 4: With warnings
#     progress_start "Validating"
#     sleep 1
#     progress_warning "Validation completed with warnings"
#     echo "" >&2
#
#     # Example 5: With error
#     progress_start "Deploying"
#     sleep 1
#     progress_error "Deployment failed"
#     echo "" >&2
#
#     # Example 6: Info message
#     progress_info "Using cache for faster results"
#     echo "" >&2
#
#     echo "=== Demo Complete ===" >&2
# fi

# Export functions for use in other scripts
export -f progress_start
export -f progress_update
export -f progress_spinner
export -f progress_complete
export -f progress_warning
export -f progress_error
export -f progress_info
export -f progress_step
export -f progress_run
export -f progress_run_with_file
