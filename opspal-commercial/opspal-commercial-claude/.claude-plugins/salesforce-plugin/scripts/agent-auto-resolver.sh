#!/bin/bash

##############################################################################
# agent-auto-resolver.sh - Agent Integration for Automatic Error Resolution
##############################################################################
# Seamlessly integrates auto-fix capabilities with all Salesforce agents
# Provides transparent error handling without modifying existing agents
##############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_FIX_ENGINE="${SCRIPT_DIR}/auto-fix-engine.py"
SMART_WRAPPER="${SCRIPT_DIR}/smart-operation-wrapper.py"
PREVENTION_GUARD="${SCRIPT_DIR}/error-prevention-guard.sh"
INVESTIGATION_ENGINE="${SCRIPT_DIR}/investigation-engine.py"
RESOLUTION_LOG="${SCRIPT_DIR}/auto-resolution.log"
LEARNING_DB="${SCRIPT_DIR}/.resolution_learning.db"

# Agent context
AGENT_NAME="${AGENT_NAME:-unknown}"
AGENT_OPERATION="${AGENT_OPERATION:-unknown}"
RESOLUTION_MODE="${RESOLUTION_MODE:-balanced}"  # aggressive, balanced, conservative
CONFIDENCE_THRESHOLD="${CONFIDENCE_THRESHOLD:-85}"

##############################################################################
# Resolution Statistics
##############################################################################

RESOLUTIONS_ATTEMPTED=0
RESOLUTIONS_SUCCESSFUL=0
PREVENTIONS_APPLIED=0
INVESTIGATIONS_TRIGGERED=0

##############################################################################
# Logging Functions
##############################################################################

log_resolution() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "[$timestamp] [$AGENT_NAME] [$level] $message" >> "$RESOLUTION_LOG"
    
    case "$level" in
        SUCCESS)
            echo -e "${GREEN}[AUTO-RESOLVED]${NC} $message"
            ;;
        PREVENTED)
            echo -e "${CYAN}[PREVENTED]${NC} $message"
            ;;
        INVESTIGATING)
            echo -e "${YELLOW}[INVESTIGATING]${NC} $message"
            ;;
        FAILED)
            echo -e "${RED}[RESOLUTION FAILED]${NC} $message"
            ;;
        INFO)
            echo -e "${BLUE}[AUTO-RESOLVER]${NC} $message"
            ;;
    esac
}

##############################################################################
# Pre-execution Prevention
##############################################################################

apply_prevention() {
    local command="$1"
    shift
    local args="$@"
    
    log_resolution "INFO" "Applying pre-execution prevention"
    ((PREVENTIONS_APPLIED++))
    
    # Use prevention guard
    if [[ -x "$PREVENTION_GUARD" ]]; then
        local prevented_cmd=$($PREVENTION_GUARD -m "$RESOLUTION_MODE" -n "$command" $args 2>&1)
        
        if [[ $? -eq 0 ]] && [[ -n "$prevented_cmd" ]]; then
            log_resolution "PREVENTED" "Applied preventive measures"
            echo "$prevented_cmd"
            return 0
        fi
    fi
    
    # Return original if no prevention applied
    echo "$command $args"
}

##############################################################################
# Error Detection and Resolution
##############################################################################

detect_and_resolve_error() {
    local error_text="$1"
    local command="$2"
    local context_json="${3:-{}}"
    
    ((RESOLUTIONS_ATTEMPTED++))
    log_resolution "INFO" "Detected error, attempting resolution"
    
    # First, try auto-fix engine
    if [[ -f "$AUTO_FIX_ENGINE" ]]; then
        local fix_result=$(python3 "$AUTO_FIX_ENGINE" \
            "$error_text" \
            --context "$context_json" \
            --auto \
            --confidence "$CONFIDENCE_THRESHOLD" 2>&1)
        
        if [[ $? -eq 0 ]] && [[ "$fix_result" =~ "Successfully applied" ]]; then
            ((RESOLUTIONS_SUCCESSFUL++))
            log_resolution "SUCCESS" "Auto-fix applied successfully"
            return 0
        fi
    fi
    
    # If auto-fix fails, trigger investigation
    if [[ "$RESOLUTION_MODE" != "conservative" ]]; then
        trigger_investigation "$error_text" "$command" "$context_json"
    fi
    
    log_resolution "FAILED" "Unable to automatically resolve error"
    return 1
}

##############################################################################
# Investigation Integration
##############################################################################

trigger_investigation() {
    local error_text="$1"
    local command="$2"
    local context_json="$3"
    
    ((INVESTIGATIONS_TRIGGERED++))
    log_resolution "INVESTIGATING" "Triggering autonomous investigation"
    
    if [[ -f "$INVESTIGATION_ENGINE" ]]; then
        local investigation_result=$(python3 "$INVESTIGATION_ENGINE" \
            "$error_text" \
            --context "$context_json" \
            --output ${TEMP_DIR:-/tmp}}_$$.json 2>&1)
        
        if [[ -f "${TEMP_DIR:-/tmp}}_$$.json" ]]; then
            # Parse investigation results
            local root_cause=$(jq -r '.root_cause' "${TEMP_DIR:-/tmp}}_$$.json")
            local confidence=$(jq -r '.confidence_value' "${TEMP_DIR:-/tmp}}_$$.json")
            local solutions=$(jq -r '.solutions[]' "${TEMP_DIR:-/tmp}}_$$.json")
            
            log_resolution "INFO" "Investigation complete: $root_cause (confidence: $confidence)"
            
            # Apply solutions if confidence is high enough
            if [[ $confidence -ge $CONFIDENCE_THRESHOLD ]]; then
                apply_investigation_solutions "$solutions" "$context_json"
            fi
            
            # Clean up
            rm -f "${TEMP_DIR:-/tmp}}_$$.json"
        fi
    fi
}

apply_investigation_solutions() {
    local solutions="$1"
    local context_json="$2"
    
    # Parse and apply solutions
    echo "$solutions" | while IFS= read -r solution; do
        if [[ -n "$solution" ]]; then
            log_resolution "INFO" "Applying solution: $solution"
            # Implementation would depend on solution type
        fi
    done
}

##############################################################################
# Smart Command Execution
##############################################################################

execute_with_resolution() {
    local command="$@"
    
    log_resolution "INFO" "Executing with auto-resolution: $command"
    
    # Apply prevention first
    local protected_command=$(apply_prevention $command)
    
    # Execute with smart wrapper if available
    if [[ -f "$SMART_WRAPPER" ]]; then
        local result=$(python3 "$SMART_WRAPPER" \
            --max-retries 3 \
            --retry-strategy adaptive \
            --confidence "$CONFIDENCE_THRESHOLD" \
            $protected_command 2>&1)
        
        local exit_code=$?
        
        if [[ $exit_code -eq 0 ]]; then
            echo "$result"
            return 0
        else
            # Try to resolve the error
            local context_json=$(cat <<EOF
{
    "agent": "$AGENT_NAME",
    "operation": "$AGENT_OPERATION",
    "command": "$protected_command",
    "timestamp": "$(date -Iseconds)"
}
EOF
            )
            
            if detect_and_resolve_error "$result" "$protected_command" "$context_json"; then
                # Retry after resolution
                log_resolution "INFO" "Retrying after successful resolution"
                $protected_command
            else
                # Resolution failed, return error
                echo "$result" >&2
                return $exit_code
            fi
        fi
    else
        # Fallback to direct execution
        $protected_command
    fi
}

##############################################################################
# Learning and Improvement
##############################################################################

update_learning_db() {
    local error_pattern="$1"
    local resolution="$2"
    local success="$3"
    
    # Initialize learning database if needed
    if [[ ! -f "$LEARNING_DB" ]]; then
        sqlite3 "$LEARNING_DB" <<EOF
CREATE TABLE IF NOT EXISTS resolutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT,
    error_pattern TEXT,
    resolution TEXT,
    success INTEGER,
    confidence REAL,
    timestamp TEXT
);

CREATE TABLE IF NOT EXISTS patterns (
    pattern TEXT PRIMARY KEY,
    occurrences INTEGER DEFAULT 1,
    success_rate REAL DEFAULT 0.0,
    last_seen TEXT
);
EOF
    fi
    
    # Record resolution attempt
    sqlite3 "$LEARNING_DB" <<EOF
INSERT INTO resolutions (agent, error_pattern, resolution, success, timestamp)
VALUES ('$AGENT_NAME', '$error_pattern', '$resolution', $success, '$(date -Iseconds)');

INSERT OR REPLACE INTO patterns (pattern, occurrences, success_rate, last_seen)
VALUES (
    '$error_pattern',
    COALESCE((SELECT occurrences FROM patterns WHERE pattern = '$error_pattern'), 0) + 1,
    CASE 
        WHEN $success = 1 THEN 
            COALESCE((SELECT success_rate FROM patterns WHERE pattern = '$error_pattern'), 0) * 0.9 + 0.1
        ELSE 
            COALESCE((SELECT success_rate FROM patterns WHERE pattern = '$error_pattern'), 0) * 0.9
    END,
    '$(date -Iseconds)'
);
EOF
}

get_pattern_confidence() {
    local error_pattern="$1"
    
    if [[ -f "$LEARNING_DB" ]]; then
        local confidence=$(sqlite3 "$LEARNING_DB" \
            "SELECT success_rate * 100 FROM patterns WHERE pattern = '$error_pattern' LIMIT 1")
        
        if [[ -n "$confidence" ]]; then
            echo "$confidence"
        else
            echo "50"  # Default confidence
        fi
    else
        echo "50"
    fi
}

##############################################################################
# Agent Integration Functions
##############################################################################

# Function to be called by agents before operations
agent_pre_operation() {
    local operation="$1"
    shift
    local command="$@"
    
    export AGENT_OPERATION="$operation"
    
    log_resolution "INFO" "Agent $AGENT_NAME starting $operation"
    
    # Apply prevention
    local protected_command=$(apply_prevention $command)
    echo "$protected_command"
}

# Function to be called by agents after operation errors
agent_handle_error() {
    local error_text="$1"
    local command="$2"
    local context="$3"
    
    log_resolution "INFO" "Agent $AGENT_NAME encountered error"
    
    # Build context
    local context_json=$(cat <<EOF
{
    "agent": "$AGENT_NAME",
    "operation": "$AGENT_OPERATION",
    "command": "$command",
    "error": "$error_text",
    "context": $context,
    "timestamp": "$(date -Iseconds)"
}
EOF
    )
    
    # Attempt resolution
    if detect_and_resolve_error "$error_text" "$command" "$context_json"; then
        return 0
    else
        return 1
    fi
}

# Function to wrap agent commands
agent_execute() {
    execute_with_resolution "$@"
}

##############################################################################
# Statistics and Reporting
##############################################################################

show_statistics() {
    echo -e "\n${CYAN}=== Auto-Resolution Statistics ===${NC}"
    echo -e "Agent: ${BLUE}$AGENT_NAME${NC}"
    echo -e "Resolution Mode: ${YELLOW}$RESOLUTION_MODE${NC}"
    echo -e "Confidence Threshold: ${YELLOW}$CONFIDENCE_THRESHOLD%${NC}"
    echo
    echo -e "Resolutions Attempted: ${BLUE}$RESOLUTIONS_ATTEMPTED${NC}"
    echo -e "Resolutions Successful: ${GREEN}$RESOLUTIONS_SUCCESSFUL${NC}"
    echo -e "Preventions Applied: ${CYAN}$PREVENTIONS_APPLIED${NC}"
    echo -e "Investigations Triggered: ${YELLOW}$INVESTIGATIONS_TRIGGERED${NC}"
    
    if [[ $RESOLUTIONS_ATTEMPTED -gt 0 ]]; then
        local success_rate=$((RESOLUTIONS_SUCCESSFUL * 100 / RESOLUTIONS_ATTEMPTED))
        echo -e "Success Rate: ${GREEN}${success_rate}%${NC}"
    fi
    
    # Show top error patterns if database exists
    if [[ -f "$LEARNING_DB" ]]; then
        echo -e "\n${CYAN}Top Error Patterns:${NC}"
        sqlite3 "$LEARNING_DB" -column -header \
            "SELECT pattern, occurrences, printf('%.1f%%', success_rate * 100) as success_rate 
             FROM patterns 
             ORDER BY occurrences DESC 
             LIMIT 5"
    fi
}

##############################################################################
# Main Usage
##############################################################################

show_usage() {
    cat << EOF
Usage: source $0  # For agent integration
       $0 [OPTIONS] COMMAND  # For standalone execution

Agent integration for automatic error resolution.

OPTIONS:
    -a AGENT     Set agent name
    -m MODE      Resolution mode: aggressive, balanced, conservative
    -c CONF      Confidence threshold (0-100)
    -s           Show statistics
    -h           Show this help

INTEGRATION:
    Source this file in your agent script to enable auto-resolution:
    
    source agent-auto-resolver.sh
    export AGENT_NAME="my-agent"
    
    # Use the wrapper functions:
    command=\$(agent_pre_operation "data_import" sf data import --file data.csv)
    result=\$(agent_execute \$command)
    
    # Or handle errors:
    if [[ \$? -ne 0 ]]; then
        agent_handle_error "\$result" "\$command" "{}"
    fi

EOF
    exit 0
}

# Main execution (if not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Parse options
    while getopts "a:m:c:sh" opt; do
        case $opt in
            a)
                AGENT_NAME="$OPTARG"
                ;;
            m)
                RESOLUTION_MODE="$OPTARG"
                ;;
            c)
                CONFIDENCE_THRESHOLD="$OPTARG"
                ;;
            s)
                show_statistics
                exit 0
                ;;
            h)
                show_usage
                ;;
            *)
                show_usage
                ;;
        esac
    done
    
    shift $((OPTIND-1))
    
    if [[ $# -gt 0 ]]; then
        # Execute command with resolution
        execute_with_resolution "$@"
    else
        show_usage
    fi
fi

# Export functions for agent use
export -f agent_pre_operation
export -f agent_handle_error
export -f agent_execute
export -f apply_prevention
export -f detect_and_resolve_error
export -f trigger_investigation