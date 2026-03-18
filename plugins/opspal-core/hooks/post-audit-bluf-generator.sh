#!/bin/bash
# =============================================================================
# Post-Audit BLUF+4 Summary Generator Hook
# =============================================================================
#
# Purpose: Auto-generate BLUF+4 executive summary after audit/assessment completion
# Version: 1.0.0
# Created: 2025-11-25
#
# Triggers when:
# - Task tool completes (PostToolUse event)
# - Agent name matches audit patterns (*auditor*, *assessor*, *audit*, *assessment*)
# - Audit output files are detected
#
# Configuration:
#   ENABLE_AUTO_BLUF=1        # Enable auto-generation (default: enabled)
#   BLUF_OUTPUT_FORMAT=terminal  # terminal, markdown, json
#   BLUF_SAVE_TO_FILE=0       # Save to EXECUTIVE_SUMMARY.md (default: disabled)
#
# Opt-out:
#   - Environment: export ENABLE_AUTO_BLUF=0
#   - Per-task: [NO_BLUF] prefix in task description
#
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="post-audit-bluf-generator"
    # Use lenient mode - this hook should NEVER block the workflow
    set_lenient_mode 2>/dev/null || true
fi

# =============================================================================
# Configuration
# =============================================================================

# Redirect stdout→stderr so status messages don't pollute Claude's context.
# Use fd 3 for structured JSON output back to Claude Code.
exec 3>&1 1>&2

ENABLE_AUTO_BLUF="${ENABLE_AUTO_BLUF:-1}"
BLUF_OUTPUT_FORMAT="${BLUF_OUTPUT_FORMAT:-terminal}"
BLUF_SAVE_TO_FILE="${BLUF_SAVE_TO_FILE:-0}"
BLUF_VERBOSE="${BLUF_VERBOSE:-0}"

# Agent detection patterns for BLUF+4 summary generation
# Expanded from audit-only to all agents producing long analytical output
AUDIT_PATTERNS=(
    ".*auditor.*"
    ".*assessor.*"
    ".*-audit$"
    ".*-assessment$"
    ".*analyzer.*"
    ".*reporter.*"
    ".*-reporter$"
    ".*planner.*"
    ".*scorer.*"
    ".*diagnostician.*"
    ".*-diagnostic$"
    ".*intelligence.*"
    ".*orchestrator.*"
    ".*modeler.*"
)

# =============================================================================
# Helper Functions
# =============================================================================

log_debug() {
    if [[ "${BLUF_VERBOSE}" == "1" ]]; then
        echo "[BLUF-DEBUG] $1" >&2
    fi
}

log_bluf() {
    echo "[BLUF] $1" >&2
}

# Check if auto-BLUF is enabled
is_enabled() {
    [[ "${ENABLE_AUTO_BLUF}" == "1" ]]
}

# Check if this is an audit-related agent
is_audit_agent() {
    local agent_name="${CLAUDE_AGENT_NAME:-}"

    if [[ -z "$agent_name" ]]; then
        log_debug "No agent name found"
        return 1
    fi

    local lower_name
    lower_name=$(echo "$agent_name" | tr '[:upper:]' '[:lower:]')

    for pattern in "${AUDIT_PATTERNS[@]}"; do
        if [[ "$lower_name" =~ $pattern ]]; then
            log_debug "Agent '$agent_name' matches audit pattern '$pattern'"
            return 0
        fi
    done

    log_debug "Agent '$agent_name' does not match any audit patterns"
    return 1
}

# Check if Task tool was used
is_task_tool() {
    local tool_name="${TOOL_NAME:-}"
    [[ "$tool_name" == "Task" ]]
}

# Check for NO_BLUF opt-out flag in context
has_opt_out_flag() {
    local context="${TOOL_INPUT:-}"
    [[ "$context" == *"[NO_BLUF]"* ]] || [[ "$context" == *"[NOBLUF]"* ]]
}

# Find latest audit output file
find_audit_output() {
    local search_dirs=(
        "${PWD}/instances"
        "${PWD}/reports"
        "${PWD}"
        "${HOME}/.claude/session-context"
    )

    local patterns=(
        "*audit*.json"
        "*assessment*.json"
        "*audit*.md"
        "*assessment*.md"
    )

    local latest_file=""
    local latest_time=0

    for dir in "${search_dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            continue
        fi

        for pattern in "${patterns[@]}"; do
            while IFS= read -r -d '' file; do
                if [[ -f "$file" ]]; then
                    local mtime
                    mtime=$(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file" 2>/dev/null || echo 0)
                    if [[ "$mtime" -gt "$latest_time" ]]; then
                        latest_time="$mtime"
                        latest_file="$file"
                    fi
                fi
            done < <(find "$dir" -maxdepth 3 -name "$pattern" -print0 2>/dev/null)
        done
    done

    if [[ -n "$latest_file" ]]; then
        echo "$latest_file"
        return 0
    fi

    return 1
}

# Generate BLUF summary using Node.js script
generate_bluf_summary() {
    local audit_file="$1"
    local format="${BLUF_OUTPUT_FORMAT:-terminal}"

    # Locate the BLUF generator script
    local generator_script
    if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
        generator_script="${CLAUDE_PLUGIN_ROOT}/scripts/lib/bluf-summary-generator.js"
    else
        generator_script="${SCRIPT_DIR}/../scripts/lib/bluf-summary-generator.js"
    fi

    local extractor_script
    if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
        extractor_script="${CLAUDE_PLUGIN_ROOT}/scripts/lib/bluf-data-extractor.js"
    else
        extractor_script="${SCRIPT_DIR}/../scripts/lib/bluf-data-extractor.js"
    fi

    if [[ ! -f "$generator_script" ]] || [[ ! -f "$extractor_script" ]]; then
        log_debug "BLUF scripts not found"
        return 1
    fi

    # Check Node.js availability
    if ! command -v node &> /dev/null; then
        log_debug "Node.js not available"
        return 1
    fi

    # Generate summary using inline Node.js
    node -e "
const BLUFDataExtractor = require('${extractor_script}');
const BLUFSummaryGenerator = require('${generator_script}');

async function main() {
    try {
        const extractor = new BLUFDataExtractor();
        const data = await extractor.extractFromFile('${audit_file}');

        const generator = new BLUFSummaryGenerator();
        const result = await generator.generate(data, { format: '${format}' });

        console.log(result.content);

        // Output validation warnings to stderr
        if (result.validation.warnings && result.validation.warnings.length > 0) {
            console.error('\\n[BLUF Validation Warnings]');
            result.validation.warnings.forEach(w => console.error('  - ' + w));
        }

        process.exit(0);
    } catch (error) {
        console.error('[BLUF Error] ' + error.message);
        process.exit(1);
    }
}

main();
"
}

# Save BLUF summary to file if enabled
save_bluf_to_file() {
    local content="$1"
    local output_dir="${PWD}"

    # Try to find appropriate output directory
    if [[ -d "${PWD}/reports" ]]; then
        output_dir="${PWD}/reports"
    elif [[ -d "${PWD}/instances" ]]; then
        # Find most recent instance directory
        local latest_instance
        latest_instance=$(find "${PWD}/instances" -maxdepth 2 -type d -name "reports" -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
        if [[ -n "$latest_instance" ]]; then
            output_dir="$latest_instance"
        fi
    fi

    local timestamp
    timestamp=$(date +%Y-%m-%d)
    local output_file="${output_dir}/EXECUTIVE_SUMMARY_${timestamp}.md"

    echo "$content" > "$output_file"
    log_bluf "Saved to: $output_file"
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    log_debug "Hook triggered"
    log_debug "ENABLE_AUTO_BLUF=${ENABLE_AUTO_BLUF}"
    log_debug "CLAUDE_AGENT_NAME=${CLAUDE_AGENT_NAME:-<not set>}"
    log_debug "TOOL_NAME=${TOOL_NAME:-<not set>}"

    # Check if enabled
    if ! is_enabled; then
        log_debug "Auto-BLUF disabled"
        exit 0
    fi

    # Check for opt-out flag
    if has_opt_out_flag; then
        log_debug "Opt-out flag detected"
        exit 0
    fi

    # Check if this is a Task tool completion
    if ! is_task_tool; then
        log_debug "Not a Task tool"
        exit 0
    fi

    # Check if this is an audit-related agent
    if ! is_audit_agent; then
        log_debug "Not an audit agent"
        exit 0
    fi

    log_bluf "Audit completion detected for ${CLAUDE_AGENT_NAME:-unknown}"

    # Find audit output file
    local audit_file
    if ! audit_file=$(find_audit_output); then
        log_debug "No audit output file found"
        exit 0
    fi

    log_bluf "Found audit output: $(basename "$audit_file")"

    # Generate BLUF summary
    local summary
    if ! summary=$(generate_bluf_summary "$audit_file"); then
        log_debug "Failed to generate BLUF summary"
        exit 0
    fi

    # Display summary via structured JSON envelope (hook protocol)
    # Escape for JSON: replace newlines, backslashes, quotes
    local escaped_summary
    escaped_summary=$(printf '%s' "$summary" | jq -Rs '.')
    echo "{\"systemMessage\": ${escaped_summary}}" >&3

    # Also display to stderr for terminal visibility
    echo "" >&2
    echo "$summary" >&2
    echo "" >&2

    # Save to file if enabled
    if [[ "${BLUF_SAVE_TO_FILE}" == "1" ]]; then
        save_bluf_to_file "$summary"
    fi

    log_bluf "Executive summary generated successfully"

    # Always exit 0 - this hook should never block workflow
    exit 0
}

# Run main function
main "$@"
