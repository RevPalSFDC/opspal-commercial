#!/usr/bin/env bash

##
## Hook Guided Stop Prompt Helper Library
##
## Provides standardized stop prompt functions for hooks to guide users
## when operations cannot proceed, rather than abruptly blocking.
##
## Features:
## - Clear explanation of why operation stopped
## - Actionable next steps to resolve the issue
## - Context-aware guidance
## - Optional documentation links
## - Severity levels (error, warning, info)
##
## Usage:
##   source "$(dirname "$0")/../scripts/lib/hook-stop-prompt-helper.sh"
##   stop_with_guidance "Critical risk detected" \
##     "risk_score=85" \
##     "Contact security@company.com for approval" \
##     "Review risk assessment documentation: https://..."
##
## Version: 1.0.0
## Author: RevPal Engineering
## Date: 2025-11-04
##

# Color codes
readonly COLOR_RESET='\033[0m'
readonly COLOR_RED='\033[31m'
readonly COLOR_YELLOW='\033[33m'
readonly COLOR_BLUE='\033[34m'
readonly COLOR_CYAN='\033[36m'
readonly COLOR_GREEN='\033[32m'

# Unicode symbols
readonly SYMBOL_ERROR='❌'
readonly SYMBOL_WARNING='⚠️'
readonly SYMBOL_INFO='ℹ️'
readonly SYMBOL_TIP='💡'
readonly SYMBOL_LINK='🔗'
readonly SYMBOL_STEP='▶'

##
## Stop operation with guided prompt (error level)
##
## This is the main function for stopping operations with helpful guidance.
## Outputs JSON to stdout for Claude Code to display as a stop prompt.
##
## Arguments:
##   $1 - Title/summary of why operation stopped
##   $2 - Context (optional) - Additional context about the situation
##   $3+ - Next steps (one per line)
##
## Example:
##   stop_with_guidance \
##     "High risk operation requires approval" \
##     "Risk score: 85/100 (CRITICAL)" \
##     "Request approval from security team" \
##     "Provide business justification" \
##     "Create rollback plan"
##
stop_with_guidance() {
    local title="$1"
    shift
    local context="${1:-}"

    # Check if context looks like a next step (starts with action verb)
    if [[ "$context" =~ ^[A-Z][a-z]+[[:space:]] ]] || [[ "$context" =~ ^- ]]; then
        # First argument is actually a next step, not context
        local next_steps=("$context")
        shift
        next_steps+=("$@")
        context=""
    else
        shift
        local next_steps=("$@")
    fi

    # Build stop prompt message
    local message="${SYMBOL_ERROR} **${title}**\n\n"

    if [[ -n "$context" ]]; then
        message+="**Context:**\n${context}\n\n"
    fi

    if [[ ${#next_steps[@]} -gt 0 ]]; then
        message+="**Next Steps:**\n"
        for step in "${next_steps[@]}"; do
            message+="${SYMBOL_STEP} ${step}\n"
        done
    fi

    # Output JSON to stdout (Claude Code will display this)
    jq -n \
        --arg msg "$message" \
        '{
            stopWithPrompt: true,
            message: $msg,
            severity: "error"
        }'

    exit 0  # Exit successfully (stop prompt is not an error)
}

##
## Stop operation with warning (less severe)
##
## Similar to stop_with_guidance but for warnings that may allow override.
##
## Arguments:
##   $1 - Title/summary
##   $2 - Context (optional)
##   $3+ - Next steps
##
## Example:
##   stop_with_warning \
##     "Deployment contains potential issues" \
##     "3 validation warnings detected" \
##     "Review warnings and confirm intent" \
##     "Add --force flag to proceed anyway"
##
stop_with_warning() {
    local title="$1"
    shift
    local context="${1:-}"

    if [[ "$context" =~ ^[A-Z][a-z]+[[:space:]] ]] || [[ "$context" =~ ^- ]]; then
        local next_steps=("$context")
        shift
        next_steps+=("$@")
        context=""
    else
        shift
        local next_steps=("$@")
    fi

    local message="${SYMBOL_WARNING} **${title}**\n\n"

    if [[ -n "$context" ]]; then
        message+="**Context:**\n${context}\n\n"
    fi

    if [[ ${#next_steps[@]} -gt 0 ]]; then
        message+="**What You Can Do:**\n"
        for step in "${next_steps[@]}"; do
            message+="${SYMBOL_STEP} ${step}\n"
        done
    fi

    jq -n \
        --arg msg "$message" \
        '{
            stopWithPrompt: true,
            message: $msg,
            severity: "warning"
        }'

    exit 0
}

##
## Stop operation with informational guidance
##
## For cases where operation cannot proceed but it's not an error.
##
## Arguments:
##   $1 - Title/summary
##   $2 - Context (optional)
##   $3+ - Next steps
##
## Example:
##   stop_with_info \
##     "Operation requires manual setup" \
##     "API credentials not configured" \
##     "Run: npm run setup:api" \
##     "Documentation: https://..."
##
stop_with_info() {
    local title="$1"
    shift
    local context="${1:-}"

    if [[ "$context" =~ ^[A-Z][a-z]+[[:space:]] ]] || [[ "$context" =~ ^- ]]; then
        local next_steps=("$context")
        shift
        next_steps+=("$@")
        context=""
    else
        shift
        local next_steps=("$@")
    fi

    local message="${SYMBOL_INFO} **${title}**\n\n"

    if [[ -n "$context" ]]; then
        message+="**Details:**\n${context}\n\n"
    fi

    if [[ ${#next_steps[@]} -gt 0 ]]; then
        message+="**Next Steps:**\n"
        for step in "${next_steps[@]}"; do
            message+="${SYMBOL_STEP} ${step}\n"
        done
    fi

    jq -n \
        --arg msg "$message" \
        '{
            stopWithPrompt: true,
            message: $msg,
            severity: "info"
        }'

    exit 0
}

##
## Build a stop prompt with structured sections
##
## More flexible version that allows custom sections.
##
## Arguments:
##   --title <text>           Title of the stop prompt
##   --severity <level>       error|warning|info (default: error)
##   --context <text>         Context/explanation
##   --step <text>           Next step (can be repeated)
##   --tip <text>            Helpful tip
##   --link <url> <text>     Documentation link
##   --code <text>           Code/command example
##
## Example:
##   build_stop_prompt \
##     --title "Validation Failed" \
##     --severity error \
##     --context "3 critical errors found in deployment" \
##     --step "Fix field dependencies" \
##     --step "Include RecordType metadata" \
##     --tip "Use PicklistDependencyManager for easier setup" \
##     --link "https://docs.com/picklist" "Picklist Documentation" \
##     --code "node scripts/lib/picklist-dependency-manager.js"
##
build_stop_prompt() {
    local title=""
    local severity="error"
    local context=""
    local -a steps=()
    local -a tips=()
    local -a links=()
    local -a codes=()

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --title)
                title="$2"
                shift 2
                ;;
            --severity)
                severity="$2"
                shift 2
                ;;
            --context)
                context="$2"
                shift 2
                ;;
            --step)
                steps+=("$2")
                shift 2
                ;;
            --tip)
                tips+=("$2")
                shift 2
                ;;
            --link)
                links+=("$2|$3")  # URL|Text
                shift 3
                ;;
            --code)
                codes+=("$2")
                shift 2
                ;;
            *)
                echo "Unknown argument: $1" >&2
                shift
                ;;
        esac
    done

    # Build message
    local symbol=""
    case "$severity" in
        error) symbol="$SYMBOL_ERROR" ;;
        warning) symbol="$SYMBOL_WARNING" ;;
        info) symbol="$SYMBOL_INFO" ;;
    esac

    local message="${symbol} **${title}**\n\n"

    if [[ -n "$context" ]]; then
        message+="**Context:**\n${context}\n\n"
    fi

    if [[ ${#steps[@]} -gt 0 ]]; then
        message+="**Next Steps:**\n"
        for step in "${steps[@]}"; do
            message+="${SYMBOL_STEP} ${step}\n"
        done
        message+="\n"
    fi

    if [[ ${#codes[@]} -gt 0 ]]; then
        message+="**Commands:**\n"
        for code in "${codes[@]}"; do
            message+="\`\`\`\n${code}\n\`\`\`\n"
        done
        message+="\n"
    fi

    if [[ ${#tips[@]} -gt 0 ]]; then
        for tip in "${tips[@]}"; do
            message+="${SYMBOL_TIP} **Tip:** ${tip}\n"
        done
        message+="\n"
    fi

    if [[ ${#links[@]} -gt 0 ]]; then
        message+="**Documentation:**\n"
        for link in "${links[@]}"; do
            IFS='|' read -r url text <<< "$link"
            message+="${SYMBOL_LINK} [${text}](${url})\n"
        done
    fi

    jq -n \
        --arg msg "$message" \
        --arg sev "$severity" \
        '{
            stopWithPrompt: true,
            message: $msg,
            severity: $sev
        }'

    exit 0
}

##
## Stop with approval requirement
##
## Special case for operations that require human approval.
##
## Arguments:
##   $1 - Operation name
##   $2 - Risk score/level
##   $3 - Required approver role
##   $4+ - Additional requirements
##
## Example:
##   stop_with_approval \
##     "Production metadata deployment" \
##     "Risk: 85/100 (CRITICAL)" \
##     "Required approver: Security Team" \
##     "Business justification required" \
##     "Rollback plan required"
##
stop_with_approval() {
    local operation="$1"
    local risk="$2"
    local approver="$3"
    shift 3
    local requirements=("$@")

    local message="${SYMBOL_ERROR} **Approval Required for ${operation}**\n\n"
    message+="**Risk Assessment:**\n${risk}\n\n"
    message+="**Approval Process:**\n"
    message+="${SYMBOL_STEP} ${approver}\n\n"

    if [[ ${#requirements[@]} -gt 0 ]]; then
        message+="**Requirements:**\n"
        for req in "${requirements[@]}"; do
            message+="${SYMBOL_STEP} ${req}\n"
        done
        message+="\n"
    fi

    message+="${SYMBOL_TIP} **Tip:** Contact ${approver} at security@company.com\n"

    jq -n \
        --arg msg "$message" \
        '{
            stopWithPrompt: true,
            message: $msg,
            severity: "error",
            requiresApproval: true
        }'

    exit 0
}

##
## Stop with validation errors
##
## Special case for validation failures with detailed error list.
##
## Arguments:
##   $1 - Validation type
##   $2 - Error count
##   $3+ - Error messages
##
## Example:
##   stop_with_validation_errors \
##     "Picklist dependency validation" \
##     "3" \
##     "Missing controllingField attribute on Field__c" \
##     "Missing valueSettings array on AnotherField__c" \
##     "RecordType metadata not included"
##
stop_with_validation_errors() {
    local validation_type="$1"
    local error_count="$2"
    shift 2
    local errors=("$@")

    local message="${SYMBOL_ERROR} **${validation_type} Failed**\n\n"
    message+="**Found ${error_count} error(s):**\n\n"

    for ((i=0; i<${#errors[@]}; i++)); do
        message+="$((i+1)). ${errors[$i]}\n"
    done

    message+="\n**Next Steps:**\n"
    message+="${SYMBOL_STEP} Fix the errors listed above\n"
    message+="${SYMBOL_STEP} Re-run the operation\n\n"
    message+="${SYMBOL_TIP} **Tip:** Use validation helper tools to automate fixes\n"

    jq -n \
        --arg msg "$message" \
        '{
            stopWithPrompt: true,
            message: $msg,
            severity: "error",
            errorCount: '"$error_count"'
        }'

    exit 0
}

##
## Stop with configuration missing
##
## Special case for missing configuration/setup.
##
## Arguments:
##   $1 - What is missing
##   $2 - Setup command
##   $3 - Documentation URL (optional)
##
## Example:
##   stop_with_missing_config \
##     "API credentials" \
##     "npm run setup:api" \
##     "https://docs.company.com/api-setup"
##
stop_with_missing_config() {
    local missing="$1"
    local setup_cmd="$2"
    local doc_url="${3:-}"

    local message="${SYMBOL_INFO} **Setup Required: ${missing}**\n\n"
    message+="**Quick Setup:**\n"
    message+="\`\`\`\n${setup_cmd}\n\`\`\`\n\n"
    message+="**Next Steps:**\n"
    message+="${SYMBOL_STEP} Run the setup command above\n"
    message+="${SYMBOL_STEP} Follow the prompts to configure ${missing}\n"
    message+="${SYMBOL_STEP} Re-run your operation\n\n"

    if [[ -n "$doc_url" ]]; then
        message+="${SYMBOL_LINK} **Documentation:** [Setup Guide](${doc_url})\n"
    fi

    jq -n \
        --arg msg "$message" \
        '{
            stopWithPrompt: true,
            message: $msg,
            severity: "info"
        }'

    exit 0
}

##
## Example usage (for testing)
##
## Uncomment and run: bash hook-stop-prompt-helper.sh
##
# if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
#     echo "=== Hook Guided Stop Prompts - Demo ===" >&2
#     echo "" >&2
#
#     # Example 1: Simple stop with guidance
#     echo "Example 1: High risk operation" >&2
#     stop_with_guidance \
#         "High risk operation requires approval" \
#         "Risk score: 85/100 (CRITICAL)" \
#         "Request approval from security team" \
#         "Provide business justification" \
#         "Create comprehensive rollback plan"
#
#     # Example 2: Validation errors
#     echo "Example 2: Validation errors" >&2
#     stop_with_validation_errors \
#         "Picklist dependency validation" \
#         "2" \
#         "Missing controllingField attribute on Status__c" \
#         "Missing valueSettings array on Priority__c"
#
#     # Example 3: Missing configuration
#     echo "Example 3: Missing config" >&2
#     stop_with_missing_config \
#         "Salesforce API credentials" \
#         "sf org login web --alias myorg" \
#         "https://developer.salesforce.com/tools/salesforcecli"
#
#     # Example 4: Structured prompt
#     echo "Example 4: Structured prompt" >&2
#     build_stop_prompt \
#         --title "Deployment Validation Failed" \
#         --severity error \
#         --context "Found 3 critical issues in metadata" \
#         --step "Fix field dependencies" \
#         --step "Include RecordType metadata" \
#         --step "Validate picklist values" \
#         --tip "Use PicklistDependencyManager for automated setup" \
#         --code "node scripts/lib/picklist-dependency-manager.js --validate" \
#         --link "https://docs.company.com/picklist-deps" "Picklist Documentation"
#
#     echo "=== Demo Complete ===" >&2
# fi

# Export functions for use in other scripts
export -f stop_with_guidance
export -f stop_with_warning
export -f stop_with_info
export -f build_stop_prompt
export -f stop_with_approval
export -f stop_with_validation_errors
export -f stop_with_missing_config
