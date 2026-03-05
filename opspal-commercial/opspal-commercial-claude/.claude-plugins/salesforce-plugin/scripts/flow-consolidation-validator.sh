#!/bin/bash

##############################################################################
# Flow Consolidation Validator
# 
# Validates flow consolidation according to best practices:
# - ONE flow per object per trigger type
# - Complexity score checks (>=7 should be Apex)
# - Prevents flow proliferation
# 
# Generic and instance-agnostic
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_ROOT}/logs"
REPORT_DIR="${PROJECT_ROOT}/reports"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Default values
ORG_ALIAS="${SF_TARGET_ORG:-}"
OBJECT_NAME=""
TRIGGER_TYPE=""
FLOW_NAME=""
MODE="validate"  # validate, report, enforce
VERBOSE=false
CHECK_COMPLEXITY=true
MAX_COMPLEXITY_SCORE=7

# Ensure directories exist
mkdir -p "${LOG_DIR}" "${REPORT_DIR}"

# Timestamp for logging
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/flow-consolidation-${TIMESTAMP}.log"
REPORT_FILE="${REPORT_DIR}/flow-consolidation-report-${TIMESTAMP}.json"

##############################################################################
# Functions
##############################################################################

log() {
    echo -e "$1" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}❌ ERROR: $1${NC}" | tee -a "${LOG_FILE}"
}

log_success() {
    echo -e "${GREEN}✅ SUCCESS: $1${NC}" | tee -a "${LOG_FILE}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}" | tee -a "${LOG_FILE}"
}

log_info() {
    echo -e "${BLUE}ℹ️  INFO: $1${NC}" | tee -a "${LOG_FILE}"
}

log_highlight() {
    echo -e "${CYAN}$1${NC}" | tee -a "${LOG_FILE}"
}

show_help() {
    cat << EOF
Flow Consolidation Validator

Ensures flows follow the "ONE flow per object per trigger type" principle
and validates complexity scores.

Usage: $(basename "$0") [OPTIONS]

OPTIONS:
    -o, --org <alias>           Salesforce org alias (required)
    -n, --object <name>         Object name to validate
    -t, --trigger <type>        Trigger type (e.g., BeforeInsert, AfterUpdate)
    -f, --flow <name>           Specific flow to validate
    -m, --mode <mode>           Mode: validate, report, enforce (default: validate)
    -c, --complexity <score>    Max complexity score (default: 7)
    --no-complexity             Skip complexity checks
    -v, --verbose               Verbose output
    -h, --help                  Show this help message

MODES:
    validate    Check if consolidation is needed (default)
    report      Generate detailed consolidation report
    enforce     Block deployment if consolidation rules violated

EXAMPLES:
    # Validate all flows in org
    $(basename "$0") -o myorg

    # Check specific object
    $(basename "$0") -o myorg -n Account

    # Validate new flow before creation
    $(basename "$0") -o myorg -n Opportunity -t AfterInsert -f Opportunity_AfterInsert_New

    # Generate consolidation report
    $(basename "$0") -o myorg -m report

    # Enforce consolidation (for CI/CD)
    $(basename "$0") -o myorg -m enforce -f Contract_AfterSave_Master

EOF
    exit 0
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -o|--org)
                ORG_ALIAS="$2"
                shift 2
                ;;
            -n|--object)
                OBJECT_NAME="$2"
                shift 2
                ;;
            -t|--trigger)
                TRIGGER_TYPE="$2"
                shift 2
                ;;
            -f|--flow)
                FLOW_NAME="$2"
                shift 2
                ;;
            -m|--mode)
                MODE="$2"
                shift 2
                ;;
            -c|--complexity)
                MAX_COMPLEXITY_SCORE="$2"
                shift 2
                ;;
            --no-complexity)
                CHECK_COMPLEXITY=false
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                ;;
        esac
    done

    # Validate required parameters
    if [[ -z "${ORG_ALIAS}" ]]; then
        log_error "Org alias is required. Use -o or set SF_TARGET_ORG environment variable"
        exit 1
    fi

    # Validate mode
    if [[ ! "${MODE}" =~ ^(validate|report|enforce)$ ]]; then
        log_error "Invalid mode: ${MODE}. Must be validate, report, or enforce"
        exit 1
    fi
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if sf CLI is installed
    if ! command -v sf &> /dev/null; then
        log_error "Salesforce CLI (sf) is not installed"
        exit 1
    fi
    
    # Check if Node.js is available for complexity checks
    if [[ "${CHECK_COMPLEXITY}" == "true" ]] && ! command -v node &> /dev/null; then
        log_warning "Node.js not found. Complexity checks will be skipped"
        CHECK_COMPLEXITY=false
    fi
    
    # Verify org connection
    if ! sf org display -o "${ORG_ALIAS}" &> /dev/null; then
        log_error "Cannot connect to org: ${ORG_ALIAS}"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

query_existing_flows() {
    local object_filter=""
    local trigger_filter=""
    
    if [[ -n "${OBJECT_NAME}" ]]; then
        object_filter="WHERE ObjectType = '${OBJECT_NAME}'"
    fi
    
    local query="SELECT Id, Label, ProcessType, TriggerType, Status, ObjectType 
                 FROM FlowDefinitionView 
                 ${object_filter}
                 ORDER BY ObjectType, TriggerType, Label"
    
    if [[ "${VERBOSE}" == "true" ]]; then
        log_info "Executing query: ${query}"
    fi
    
    local result=$(sf data query -q "${query}" -o "${ORG_ALIAS}" --json 2>/dev/null || echo '{"status":1}')
    
    if echo "${result}" | jq -e '.status == 0' > /dev/null 2>&1; then
        echo "${result}" | jq -r '.result.records'
    else
        log_error "Failed to query flows"
        echo "[]"
    fi
}

analyze_flow_distribution() {
    local flows="$1"
    local analysis='{
        "totalFlows": 0,
        "byObject": {},
        "violations": [],
        "recommendations": []
    }'
    
    # Count total flows
    local total_flows=$(echo "${flows}" | jq 'length')
    analysis=$(echo "${analysis}" | jq ".totalFlows = ${total_flows}")
    
    # Group by object and trigger type
    local objects=$(echo "${flows}" | jq -r '.[].ObjectType // "Unknown"' | sort -u)
    
    while IFS= read -r object; do
        [[ -z "${object}" ]] && continue
        
        local object_flows=$(echo "${flows}" | jq --arg obj "${object}" '.[] | select(.ObjectType == $obj)')
        local trigger_types=$(echo "${object_flows}" | jq -r '.TriggerType // "Manual"' | sort -u)
        
        while IFS= read -r trigger; do
            [[ -z "${trigger}" ]] && continue
            
            local count=$(echo "${flows}" | jq --arg obj "${object}" --arg trig "${trigger}" '
                [.[] | select(.ObjectType == $obj and (.TriggerType // "Manual") == $trig)] | length')
            
            if [[ ${count} -gt 1 ]]; then
                # Violation: Multiple flows for same object/trigger
                local violation=$(jq -n \
                    --arg obj "${object}" \
                    --arg trig "${trigger}" \
                    --arg count "${count}" \
                    '{
                        "type": "MULTIPLE_FLOWS",
                        "severity": "HIGH",
                        "object": $obj,
                        "trigger": $trig,
                        "count": ($count | tonumber),
                        "message": "Found \($count) flows for \($obj) with trigger \($trig). Should be consolidated into one."
                    }')
                
                analysis=$(echo "${analysis}" | jq ".violations += [${violation}]")
                
                # Add recommendation
                local recommendation=$(jq -n \
                    --arg obj "${object}" \
                    --arg trig "${trigger}" \
                    '{
                        "action": "CONSOLIDATE",
                        "targetFlow": "\($obj)_\($trig | gsub(" "; ""))_Master",
                        "description": "Consolidate all \($obj) flows with \($trig) trigger into a single master flow"
                    }')
                
                analysis=$(echo "${analysis}" | jq ".recommendations += [${recommendation}]")
            fi
            
            # Update object statistics
            analysis=$(echo "${analysis}" | jq \
                --arg obj "${object}" \
                --arg trig "${trigger}" \
                --arg count "${count}" \
                '.byObject[$obj] = (.byObject[$obj] // {}) | .byObject[$obj][$trig] = ($count | tonumber)')
            
        done <<< "${trigger_types}"
    done <<< "${objects}"
    
    echo "${analysis}"
}

check_flow_complexity() {
    local flow_name="$1"
    
    if [[ "${CHECK_COMPLEXITY}" != "true" ]]; then
        echo '{"score": 0, "recommendation": "not_checked"}'
        return
    fi
    
    # Use the flow-audit.js tool if available
    local audit_tool="${SCRIPT_DIR}/utilities/flow-audit.js"
    
    if [[ -f "${audit_tool}" ]]; then
        if [[ "${VERBOSE}" == "true" ]]; then
            log_info "Checking complexity for ${flow_name}..."
        fi
        
        # Run complexity check and parse result
        local complexity_result=$(node "${audit_tool}" --org "${ORG_ALIAS}" --complexity "${flow_name}" 2>/dev/null || echo '{}')
        
        # Extract score from output (this is a simplified version)
        local score=$(echo "${complexity_result}" | grep -oE 'Score: [0-9]+' | grep -oE '[0-9]+' || echo "0")
        
        echo "{\"score\": ${score}, \"recommendation\": \"$([ ${score} -ge ${MAX_COMPLEXITY_SCORE} ] && echo 'apex' || echo 'flow')\"}"
    else
        log_warning "Flow audit tool not found. Skipping complexity check."
        echo '{"score": 0, "recommendation": "not_checked"}'
    fi
}

validate_new_flow() {
    local flow_name="$1"
    local object="$2"
    local trigger="$3"
    
    log_highlight "\n═══════════════════════════════════════════════════════"
    log_highlight "     Validating New Flow: ${flow_name}"
    log_highlight "═══════════════════════════════════════════════════════\n"
    
    local validation_result='{
        "flowName": "'${flow_name}'",
        "object": "'${object}'",
        "trigger": "'${trigger}'",
        "valid": true,
        "issues": [],
        "recommendations": []
    }'
    
    # Check existing flows for same object/trigger
    local existing_flows=$(query_existing_flows)
    local same_combo=$(echo "${existing_flows}" | jq --arg obj "${object}" --arg trig "${trigger}" '
        [.[] | select(.ObjectType == $obj and (.TriggerType // "Manual") == $trig)]')
    local count=$(echo "${same_combo}" | jq 'length')
    
    if [[ ${count} -gt 0 ]]; then
        log_error "Consolidation violation: ${count} existing flow(s) found for ${object}/${trigger}"
        
        validation_result=$(echo "${validation_result}" | jq '
            .valid = false |
            .issues += [{
                "type": "CONSOLIDATION_VIOLATION",
                "message": "Cannot create new flow. Existing flow(s) must be consolidated first."
            }]')
        
        # List existing flows
        echo "${same_combo}" | jq -r '.[] | "  - \(.Label) (ID: \(.Id), Status: \(.Status))"'
        
        # Add recommendation
        validation_result=$(echo "${validation_result}" | jq '
            .recommendations += [{
                "action": "UPDATE_EXISTING",
                "message": "Add logic to existing flow instead of creating new one"
            }]')
    fi
    
    # Check complexity if flow exists
    if [[ -f "force-app/main/default/flows/${flow_name}.flow-meta.xml" ]]; then
        local complexity=$(check_flow_complexity "${flow_name}")
        local score=$(echo "${complexity}" | jq -r '.score')
        
        if [[ ${score} -ge ${MAX_COMPLEXITY_SCORE} ]]; then
            log_warning "Flow complexity score ${score} exceeds threshold ${MAX_COMPLEXITY_SCORE}"
            
            validation_result=$(echo "${validation_result}" | jq --arg score "${score}" '
                .complexityScore = ($score | tonumber) |
                .issues += [{
                    "type": "HIGH_COMPLEXITY",
                    "message": "Flow complexity score \($score) exceeds threshold. Consider using Apex instead."
                }] |
                .recommendations += [{
                    "action": "CONVERT_TO_APEX",
                    "message": "Convert this flow to Apex for better performance and maintainability"
                }]')
        fi
    fi
    
    echo "${validation_result}"
}

generate_consolidation_report() {
    local flows=$(query_existing_flows)
    local analysis=$(analyze_flow_distribution "${flows}")
    
    log_highlight "\n═══════════════════════════════════════════════════════"
    log_highlight "         Flow Consolidation Report"
    log_highlight "═══════════════════════════════════════════════════════\n"
    
    # Summary
    local total=$(echo "${analysis}" | jq -r '.totalFlows')
    local violations=$(echo "${analysis}" | jq -r '.violations | length')
    
    log_info "Total Flows: ${total}"
    log_info "Consolidation Violations: ${violations}"
    
    # Violations
    if [[ ${violations} -gt 0 ]]; then
        log_error "\nViolations Found:"
        echo "${analysis}" | jq -r '.violations[] | 
            "  [\(.severity)] \(.object) - \(.trigger): \(.message)"'
    else
        log_success "\n✅ No consolidation violations found!"
    fi
    
    # Recommendations
    local recommendations=$(echo "${analysis}" | jq -r '.recommendations | length')
    if [[ ${recommendations} -gt 0 ]]; then
        log_warning "\n📋 Recommendations:"
        echo "${analysis}" | jq -r '.recommendations[] | 
            "  • \(.action): \(.description)"'
    fi
    
    # Object breakdown
    log_highlight "\n📊 Flow Distribution by Object:"
    echo "${analysis}" | jq -r '.byObject | to_entries[] | 
        "\n  \(.key):" as $header | 
        .value | to_entries[] | 
        "    \(.key): \(.value) flow(s)"' | 
        sed 's/^$/  ────────────────/'
    
    # Save report to file
    echo "${analysis}" > "${REPORT_FILE}"
    log_info "\nFull report saved to: ${REPORT_FILE}"
    
    return $([ ${violations} -eq 0 ] && echo 0 || echo 1)
}

enforce_consolidation() {
    local flow_name="$1"
    
    log_highlight "\n═══════════════════════════════════════════════════════"
    log_highlight "         Enforcing Flow Consolidation"
    log_highlight "═══════════════════════════════════════════════════════\n"
    
    # Generate report first
    generate_consolidation_report
    local report_status=$?
    
    # If specific flow provided, validate it
    if [[ -n "${flow_name}" ]]; then
        # Extract object and trigger from flow name (assuming naming convention)
        local object=$(echo "${flow_name}" | cut -d'_' -f1)
        local trigger=$(echo "${flow_name}" | cut -d'_' -f2)
        
        local validation=$(validate_new_flow "${flow_name}" "${object}" "${trigger}")
        local is_valid=$(echo "${validation}" | jq -r '.valid')
        
        if [[ "${is_valid}" != "true" ]]; then
            log_error "Flow ${flow_name} violates consolidation rules!"
            echo "${validation}" | jq -r '.issues[] | "  ❌ \(.message)"'
            exit 1
        fi
    fi
    
    # Exit with error if violations found
    if [[ ${report_status} -ne 0 ]]; then
        log_error "\n❌ Flow consolidation violations detected. Deployment blocked."
        log_info "Fix violations before proceeding with deployment."
        exit 1
    fi
    
    log_success "\n✅ All flows comply with consolidation rules. Deployment allowed."
}

##############################################################################
# Main Execution
##############################################################################

main() {
    log_highlight "═══════════════════════════════════════════════════════"
    log_highlight "       Flow Consolidation Validator"
    log_highlight "═══════════════════════════════════════════════════════"
    log_info "Timestamp: ${TIMESTAMP}"
    log_info "Mode: ${MODE}"
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Check prerequisites
    check_prerequisites
    
    # Execute based on mode
    case "${MODE}" in
        validate)
            if [[ -n "${FLOW_NAME}" ]] && [[ -n "${OBJECT_NAME}" ]] && [[ -n "${TRIGGER_TYPE}" ]]; then
                # Validate specific new flow
                validation=$(validate_new_flow "${FLOW_NAME}" "${OBJECT_NAME}" "${TRIGGER_TYPE}")
                echo "${validation}" | jq '.'
                
                is_valid=$(echo "${validation}" | jq -r '.valid')
                if [[ "${is_valid}" != "true" ]]; then
                    exit 1
                fi
            else
                # General validation
                generate_consolidation_report
            fi
            ;;
        report)
            generate_consolidation_report
            ;;
        enforce)
            enforce_consolidation "${FLOW_NAME}"
            ;;
    esac
    
    log_highlight "═══════════════════════════════════════════════════════"
    log_success "Validation Complete"
    log_highlight "═══════════════════════════════════════════════════════"
}

# Run main function
main "$@"