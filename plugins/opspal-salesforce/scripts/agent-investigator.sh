#!/bin/bash

##############################################################################
# agent-investigator.sh - Autonomous Investigation Wrapper for Agents
##############################################################################
# Enables any Salesforce agent to perform autonomous investigations
# Integrates investigation engine with agent execution context
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
INVESTIGATION_ENGINE="${SCRIPT_DIR}/investigation-engine.py"
DIAGNOSTIC_TOOLKIT="${SCRIPT_DIR}/diagnostic-toolkit.sh"
INVESTIGATION_LOG="${SCRIPT_DIR}/investigation.log"
INVESTIGATION_CONTEXT="${SCRIPT_DIR}/investigation-context.json"

# Investigation state
INVESTIGATION_ID=""
INVESTIGATION_STATUS="not_started"
CONFIDENCE_THRESHOLD=70

##############################################################################
# Utility Functions
##############################################################################

log_agent() {
    echo -e "${MAGENTA}[AGENT]${NC} $1" | tee -a "$INVESTIGATION_LOG"
}

log_investigation() {
    echo -e "${CYAN}[INVESTIGATION]${NC} $1" | tee -a "$INVESTIGATION_LOG"
}

log_finding() {
    echo -e "${YELLOW}[FINDING]${NC} $1" | tee -a "$INVESTIGATION_LOG"
}

log_solution() {
    echo -e "${GREEN}[SOLUTION]${NC} $1" | tee -a "$INVESTIGATION_LOG"
}

##############################################################################
# Investigation Context Management
##############################################################################

create_context() {
    local issue="$1"
    local object_name="${2:-}"
    local field_name="${3:-}"
    local org_alias="${4:-${SF_TARGET_ORG:-}}"
    
    cat > "$INVESTIGATION_CONTEXT" << EOF
{
    "issue_description": "$issue",
    "object_name": "$object_name",
    "field_name": "$field_name",
    "org_alias": "$org_alias",
    "agent": "${AGENT_NAME:-unknown}",
    "timestamp": "$(date -Iseconds)",
    "environment": {
        "sf_target_org": "${SF_TARGET_ORG:-}",
        "instance_dir": "${INSTANCE_DIR:-}",
        "deployment_mode": "${DEPLOYMENT_MODE:-}"
    }
}
EOF
    
    log_agent "Investigation context created"
}

load_context() {
    if [[ -f "$INVESTIGATION_CONTEXT" ]]; then
        export INVESTIGATION_ISSUE=$(jq -r '.issue_description' "$INVESTIGATION_CONTEXT")
        export INVESTIGATION_OBJECT=$(jq -r '.object_name' "$INVESTIGATION_CONTEXT")
        export INVESTIGATION_FIELD=$(jq -r '.field_name' "$INVESTIGATION_CONTEXT")
        export INVESTIGATION_ORG=$(jq -r '.org_alias' "$INVESTIGATION_CONTEXT")
        return 0
    else
        log_agent "No investigation context found"
        return 1
    fi
}

##############################################################################
# Investigation Initiation
##############################################################################

initiate_investigation() {
    local issue="$1"
    local auto_mode="${2:-false}"
    
    log_investigation "===== AUTONOMOUS INVESTIGATION INITIATED ====="
    log_investigation "Issue: $issue"
    log_investigation "Mode: $([ "$auto_mode" = "true" ] && echo "Fully Autonomous" || echo "Semi-Autonomous")"
    
    # Parse issue for context
    local object_name=""
    local field_name=""
    
    # Extract object and field from issue description
    if [[ "$issue" =~ ([A-Z][a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+) ]]; then
        object_name="${BASH_REMATCH[1]}"
        field_name="${BASH_REMATCH[2]}"
    elif [[ "$issue" =~ ([A-Z][a-zA-Z0-9_]+) ]]; then
        object_name="${BASH_REMATCH[1]}"
    fi
    
    # Create investigation context
    create_context "$issue" "$object_name" "$field_name"
    
    # Start investigation engine
    log_investigation "Starting investigation engine..."
    
    local result=$(python3 "$INVESTIGATION_ENGINE" "$issue" \
        ${object_name:+--object "$object_name"} \
        ${field_name:+--field "$field_name"} \
        ${INVESTIGATION_ORG:+--org "$INVESTIGATION_ORG"} \
        --output ${TEMP_DIR:-/tmp} 2>&1)
    
    if [[ $? -eq 0 ]]; then
        INVESTIGATION_ID=$(jq -r '.investigation_id' ${TEMP_DIR:-/tmp})
        INVESTIGATION_STATUS="completed"
        
        log_investigation "Investigation completed: $INVESTIGATION_ID"
        
        # Process results
        process_investigation_results ${TEMP_DIR:-/tmp} "$auto_mode"
    else
        INVESTIGATION_STATUS="failed"
        log_agent "Investigation failed: $result"
        return 1
    fi
}

##############################################################################
# Result Processing
##############################################################################

process_investigation_results() {
    local result_file="$1"
    local auto_mode="$2"
    
    if [[ ! -f "$result_file" ]]; then
        log_agent "No results file found"
        return 1
    fi
    
    # Extract key findings
    local root_cause=$(jq -r '.root_cause' "$result_file")
    local confidence=$(jq -r '.confidence_value // 0' "$result_file")
    local solutions=$(jq -r '.solutions // []' "$result_file")
    
    log_investigation "===== INVESTIGATION RESULTS ====="
    log_finding "Root Cause: $root_cause"
    log_finding "Confidence: $confidence%"
    
    # Display top hypotheses
    log_investigation "Top Hypotheses Tested:"
    jq -r '.top_hypotheses[] | "  - \(.description) (Confidence: \(.confidence))"' "$result_file"
    
    # Check confidence threshold
    if [[ $confidence -ge $CONFIDENCE_THRESHOLD ]]; then
        log_investigation "High confidence finding - proceeding with solutions"
        
        # Process solutions
        if [[ $(echo "$solutions" | jq 'length') -gt 0 ]]; then
            log_investigation "Recommended Solutions:"
            echo "$solutions" | jq -r '.[] | "  - \(.description)"'
            
            if [[ "$auto_mode" == "true" ]]; then
                # Autonomous mode - apply safe fixes automatically
                apply_safe_fixes "$solutions"
            else
                # Semi-autonomous - present solutions for approval
                present_solutions_for_approval "$solutions"
            fi
        else
            log_investigation "No automated solutions available"
        fi
    else
        log_investigation "Low confidence finding - human review recommended"
        generate_investigation_report "$result_file"
    fi
}

##############################################################################
# Solution Implementation
##############################################################################

apply_safe_fixes() {
    local solutions="$1"
    
    log_solution "Evaluating solutions for automatic application..."
    
    echo "$solutions" | jq -c '.[]' | while read -r solution; do
        local risk_level=$(echo "$solution" | jq -r '.risk_level')
        local automation_possible=$(echo "$solution" | jq -r '.automation_possible')
        local description=$(echo "$solution" | jq -r '.description')
        
        if [[ "$risk_level" == "low" ]] && [[ "$automation_possible" == "true" ]]; then
            log_solution "Applying: $description"
            implement_solution "$solution"
        else
            log_solution "Skipping (risk=$risk_level): $description"
        fi
    done
}

present_solutions_for_approval() {
    local solutions="$1"
    
    log_investigation "===== SOLUTIONS REQUIRE APPROVAL ====="
    
    echo "$solutions" | jq -r '.[] | "
Solution: \(.description)
Risk Level: \(.risk_level)
Automation: \(.automation_possible)
Steps: \(.steps | join("\n  - "))"'
    
    # Generate approval request
    cat > ${TEMP_DIR:-/tmp} << EOF
{
    "investigation_id": "$INVESTIGATION_ID",
    "solutions": $solutions,
    "approval_required": true,
    "timestamp": "$(date -Iseconds)"
}
EOF
    
    log_investigation "Solutions saved for approval: ${TEMP_DIR:-/tmp}"
}

implement_solution() {
    local solution="$1"
    local solution_type=$(echo "$solution" | jq -r '.type')
    
    case "$solution_type" in
        permission_fix)
            implement_permission_fix "$solution"
            ;;
        validation_fix)
            implement_validation_fix "$solution"
            ;;
        configuration_fix)
            implement_configuration_fix "$solution"
            ;;
        *)
            log_solution "Solution type not implemented: $solution_type"
            ;;
    esac
}

##############################################################################
# Specific Solution Implementations
##############################################################################

implement_permission_fix() {
    local solution="$1"
    
    log_solution "Implementing permission fix..."
    
    # Extract context
    load_context
    
    if [[ -n "$INVESTIGATION_OBJECT" ]] && [[ -n "$INVESTIGATION_FIELD" ]]; then
        # Generate permission update command
        log_solution "Updating field permissions for $INVESTIGATION_OBJECT.$INVESTIGATION_FIELD"
        
        # This would call the appropriate Salesforce CLI commands
        # For safety, we're just logging what would be done
        log_solution "Would execute: sf field permissions update ..."
    fi
}

implement_validation_fix() {
    local solution="$1"
    
    log_solution "Implementing validation rule fix..."
    
    # This would modify validation rules
    log_solution "Would modify validation rules..."
}

implement_configuration_fix() {
    local solution="$1"
    
    log_solution "Implementing configuration fix..."
    
    # This would update configuration
    log_solution "Would update configuration..."
}

##############################################################################
# Diagnostic Integration
##############################################################################

run_diagnostic() {
    local diagnostic_type="$1"
    shift
    
    log_investigation "Running diagnostic: $diagnostic_type"
    
    local result=$("$DIAGNOSTIC_TOOLKIT" "$diagnostic_type" "$@" 2>&1)
    
    if [[ $? -eq 0 ]]; then
        log_investigation "Diagnostic completed successfully"
        echo "$result"
    else
        log_agent "Diagnostic failed: $result"
        return 1
    fi
}

run_comprehensive_diagnostic() {
    load_context
    
    if [[ -n "$INVESTIGATION_OBJECT" ]]; then
        log_investigation "Running comprehensive diagnostics for $INVESTIGATION_OBJECT"
        run_diagnostic comprehensive "$INVESTIGATION_OBJECT" "$INVESTIGATION_FIELD"
    else
        log_agent "No object context for comprehensive diagnostic"
    fi
}

##############################################################################
# Monitoring and Progress
##############################################################################

monitor_investigation() {
    local investigation_id="${1:-$INVESTIGATION_ID}"
    
    if [[ -z "$investigation_id" ]]; then
        log_agent "No investigation to monitor"
        return 1
    fi
    
    log_investigation "Monitoring investigation: $investigation_id"
    
    # Check investigation status
    while [[ "$INVESTIGATION_STATUS" == "in_progress" ]]; do
        sleep 2
        # Update status (would query investigation engine)
        log_investigation "Investigation status: $INVESTIGATION_STATUS"
    done
    
    log_investigation "Investigation complete: $INVESTIGATION_STATUS"
}

##############################################################################
# Report Generation
##############################################################################

generate_investigation_report() {
    local result_file="${1:-${TEMP_DIR:-/tmp}}"
    local report_file="${2:-${TEMP_DIR:-/tmp}}"
    
    log_investigation "Generating investigation report..."
    
    cat > "$report_file" << EOF
# Autonomous Investigation Report

**Investigation ID:** $INVESTIGATION_ID  
**Date:** $(date)  
**Issue:** $(jq -r '.issue' "$result_file")

## Summary

**Root Cause:** $(jq -r '.root_cause' "$result_file")  
**Confidence:** $(jq -r '.confidence' "$result_file")  
**Status:** $INVESTIGATION_STATUS

## Evidence Collected

$(jq -r '.evidence_summary[] | "- **\(.type)**: \(.description)"' "$result_file")

## Hypotheses Tested

$(jq -r '.top_hypotheses[] | "
### \(.description)
- Confidence: \(.confidence)
- Supporting Evidence: \(.supporting_evidence)
- Test Results: \(.test_results | to_entries | map("\(.key): \(.value)") | join(", "))"' "$result_file")

## Recommended Solutions

$(jq -r '.solutions[] | "
### \(.description)
- Risk Level: \(.risk_level)
- Automation Possible: \(.automation_possible)
- Steps:
\(.steps | map("  1. \(.)") | join("\n"))"' "$result_file")

## Next Steps

1. Review the findings and confidence level
2. Approve or modify recommended solutions
3. Implement fixes in appropriate environment
4. Verify resolution

---
*Generated by Autonomous Investigation Framework*
EOF
    
    log_investigation "Report generated: $report_file"
}

##############################################################################
# Agent Communication
##############################################################################

notify_agent() {
    local agent_name="$1"
    local message="$2"
    local priority="${3:-normal}"
    
    log_agent "Notifying agent $agent_name: $message"
    
    # Create notification for agent
    cat > ${TEMP_DIR:-/tmp} << EOF
{
    "from": "${AGENT_NAME:-investigator}",
    "to": "$agent_name",
    "message": "$message",
    "priority": "$priority",
    "investigation_id": "$INVESTIGATION_ID",
    "timestamp": "$(date -Iseconds)"
}
EOF
}

request_specialist_investigation() {
    local specialist_agent="$1"
    local specific_area="$2"
    
    log_investigation "Requesting specialist investigation from $specialist_agent"
    
    notify_agent "$specialist_agent" \
        "Specialist investigation required for: $specific_area" \
        "high"
}

##############################################################################
# Main Function
##############################################################################

main() {
    local command="${1:-help}"
    shift || true
    
    case "$command" in
        investigate)
            # Start autonomous investigation
            initiate_investigation "$@"
            ;;
        diagnose)
            # Run specific diagnostic
            run_diagnostic "$@"
            ;;
        monitor)
            # Monitor ongoing investigation
            monitor_investigation "$@"
            ;;
        report)
            # Generate report
            generate_investigation_report "$@"
            ;;
        apply-fix)
            # Apply a specific fix
            if [[ -f ${TEMP_DIR:-/tmp} ]]; then
                apply_safe_fixes "$(jq -r '.solutions' ${TEMP_DIR:-/tmp})"
            else
                log_agent "No approved solutions found"
            fi
            ;;
        context)
            # Show current context
            if load_context; then
                cat "$INVESTIGATION_CONTEXT" | jq '.'
            fi
            ;;
        help|--help|-h)
            cat << EOF
Agent Investigation Wrapper

Usage: $0 <command> [arguments]

Commands:
    investigate <issue> [auto]     Start autonomous investigation
    diagnose <type> [args]         Run specific diagnostic
    monitor [investigation_id]     Monitor investigation progress
    report [result_file]           Generate investigation report
    apply-fix                      Apply approved fixes
    context                        Show current investigation context
    help                          Show this help message

Investigation Modes:
    auto        Fully autonomous (applies safe fixes automatically)
    (default)   Semi-autonomous (requires approval for fixes)

Examples:
    $0 investigate "Field Type_Contract__c not updating on Contract"
    $0 investigate "Flow not triggering for Opportunity" auto
    $0 diagnose field-permissions Account Industry
    $0 monitor INV-abc123
    $0 report ${TEMP_DIR:-/tmp}
    $0 apply-fix

Environment Variables:
    AGENT_NAME              Name of the current agent
    SF_TARGET_ORG             Salesforce org alias
    CONFIDENCE_THRESHOLD   Minimum confidence for auto-fix (default: 70)

Output:
    Logs: $INVESTIGATION_LOG
    Context: $INVESTIGATION_CONTEXT
    Results: ${TEMP_DIR:-/tmp}
    Report: ${TEMP_DIR:-/tmp}
EOF
            ;;
        *)
            log_agent "Unknown command: $command"
            echo "Run '$0 help' for usage"
            exit 1
            ;;
    esac
}

# Initialize
echo -e "${CYAN}===== AGENT INVESTIGATOR v1.0 =====${NC}"
echo "Timestamp: $(date)"
echo "Agent: ${AGENT_NAME:-unknown}"

# Run main
main "$@"
