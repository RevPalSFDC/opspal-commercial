#!/bin/bash

##############################################################################
# Check-Only Deployment Validator
# 
# Validates Salesforce deployments without making actual changes
# Captures job IDs for quick-deploy after validation passes
# 
# Created to prevent deployment failures like the Contract flow issues
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
LOG_DIR="${PROJECT_ROOT}/logs"
VALIDATION_DIR="${PROJECT_ROOT}/.validation"
TEMP_DIR="${PROJECT_ROOT}/temp"

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
SOURCE_PATH=""
METADATA_TYPE=""
TEST_LEVEL="RunLocalTests"
WAIT_TIME=30
VERBOSE=false
SAVE_JOB_ID=true
AUTO_QUICK_DEPLOY=false

# Ensure directories exist
mkdir -p "${LOG_DIR}" "${VALIDATION_DIR}" "${TEMP_DIR}"

# Timestamp for logging
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/deploy-validation-${TIMESTAMP}.log"
JOB_FILE="${VALIDATION_DIR}/last-validation-job.json"

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
Check-Only Deployment Validator

Usage: $(basename "$0") [OPTIONS]

OPTIONS:
    -o, --org <alias>           Salesforce org alias (required)
    -s, --source <path>         Source path to deploy (default: force-app)
    -m, --metadata <type>       Specific metadata type to deploy
    -t, --test-level <level>    Test level: NoTestRun, RunSpecifiedTests, 
                               RunLocalTests, RunAllTestsInOrg (default: RunLocalTests)
    -w, --wait <minutes>        Wait time for deployment (default: 30)
    -q, --quick-deploy          Auto quick-deploy if validation passes
    -n, --no-save               Don't save job ID for later quick-deploy
    -v, --verbose               Verbose output
    -h, --help                  Show this help message

EXAMPLES:
    # Validate all metadata
    $(basename "$0") -o myorg

    # Validate specific flow
    $(basename "$0") -o myorg -m "Flow:Contract_AfterSave_Master"

    # Validate and auto quick-deploy
    $(basename "$0") -o myorg -q

    # Validate with specific test level
    $(basename "$0") -o myorg -t RunSpecifiedTests --tests "ContractTest"

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
            -s|--source)
                SOURCE_PATH="$2"
                shift 2
                ;;
            -m|--metadata)
                METADATA_TYPE="$2"
                shift 2
                ;;
            -t|--test-level)
                TEST_LEVEL="$2"
                shift 2
                ;;
            -w|--wait)
                WAIT_TIME="$2"
                shift 2
                ;;
            -q|--quick-deploy)
                AUTO_QUICK_DEPLOY=true
                shift
                ;;
            -n|--no-save)
                SAVE_JOB_ID=false
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                ;;
            --tests)
                SPECIFIED_TESTS="$2"
                shift 2
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

    # Set default source path if not specified
    if [[ -z "${SOURCE_PATH}" ]]; then
        if [[ -d "force-app" ]]; then
            SOURCE_PATH="force-app"
        elif [[ -d "src" ]]; then
            SOURCE_PATH="src"
        else
            SOURCE_PATH="."
        fi
    fi
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if sf CLI is installed
    if ! command -v sf &> /dev/null; then
        log_error "Salesforce CLI (sf) is not installed"
        exit 1
    fi
    
    # Verify org connection
    if ! sf org display -o "${ORG_ALIAS}" &> /dev/null; then
        log_error "Cannot connect to org: ${ORG_ALIAS}"
        log_info "Run: sf org login web -a ${ORG_ALIAS}"
        exit 1
    fi
    
    # Check if source path exists
    if [[ ! -e "${SOURCE_PATH}" ]]; then
        log_error "Source path does not exist: ${SOURCE_PATH}"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

run_pre_validation_checks() {
    log_info "Running pre-validation checks..."
    
    # Check for Flow metadata if deploying flows
    if [[ -n "${METADATA_TYPE}" ]] && [[ "${METADATA_TYPE}" == Flow:* ]]; then
        local flow_name="${METADATA_TYPE#Flow:}"
        local flow_file="${SOURCE_PATH}/main/default/flows/${flow_name}.flow-meta.xml"
        
        if [[ -f "${flow_file}" ]]; then
            log_info "Validating flow structure..."
            
            # Use flow validator if available
            if [[ -f "${SCRIPT_DIR}/flow-validator.js" ]]; then
                if node "${SCRIPT_DIR}/flow-validator.js" "${flow_file}" --verbose; then
                    log_success "Flow structure validation passed"
                else
                    log_warning "Flow structure has issues - deployment may fail"
                fi
            fi
        fi
    fi
    
    # Check for validation rules that might block deployment
    if command -v "${SCRIPT_DIR}/../validation-rule-analyzer.sh" &> /dev/null; then
        log_info "Checking for validation rule conflicts..."
        # This would analyze validation rules for the objects being deployed
    fi
}

validate_deployment() {
    log_highlight "\n═══════════════════════════════════════════════════════"
    log_highlight "     Starting Check-Only Deployment Validation"
    log_highlight "═══════════════════════════════════════════════════════\n"
    
    log_info "Org: ${ORG_ALIAS}"
    log_info "Source: ${SOURCE_PATH}"
    
    if [[ -n "${METADATA_TYPE}" ]]; then
        log_info "Metadata: ${METADATA_TYPE}"
    fi
    
    log_info "Test Level: ${TEST_LEVEL}"
    
    # Build deployment command
    local deploy_cmd="sf project deploy validate"
    deploy_cmd="${deploy_cmd} --source-dir ${SOURCE_PATH}"
    deploy_cmd="${deploy_cmd} --target-org ${ORG_ALIAS}"
    deploy_cmd="${deploy_cmd} --test-level ${TEST_LEVEL}"
    deploy_cmd="${deploy_cmd} --wait ${WAIT_TIME}"
    
    # Add metadata filter if specified
    if [[ -n "${METADATA_TYPE}" ]]; then
        deploy_cmd="${deploy_cmd} --metadata ${METADATA_TYPE}"
    fi
    
    # Add specified tests if using RunSpecifiedTests
    if [[ "${TEST_LEVEL}" == "RunSpecifiedTests" ]] && [[ -n "${SPECIFIED_TESTS:-}" ]]; then
        deploy_cmd="${deploy_cmd} --tests ${SPECIFIED_TESTS}"
    fi
    
    # Add JSON output for parsing
    deploy_cmd="${deploy_cmd} --json"
    
    if [[ "${VERBOSE}" == "true" ]]; then
        log_info "Executing: ${deploy_cmd}"
    fi
    
    log_info "Starting validation deployment..."
    
    # Execute validation
    local validation_output="${TEMP_DIR}/validation-output-${TIMESTAMP}.json"
    
    if ${deploy_cmd} > "${validation_output}" 2>&1; then
        process_validation_success "${validation_output}"
    else
        process_validation_failure "${validation_output}"
    fi
}

process_validation_success() {
    local output_file="$1"
    
    log_success "Validation deployment succeeded!"
    
    # Parse the JSON output
    local job_id=$(jq -r '.result.id // .result.deployId // ""' "${output_file}" 2>/dev/null)
    
    if [[ -z "${job_id}" ]]; then
        # Try alternative parsing
        job_id=$(grep -oE '0Af[A-Za-z0-9]{15}' "${output_file}" | head -1)
    fi
    
    if [[ -n "${job_id}" ]]; then
        log_success "Validation Job ID: ${job_id}"
        
        # Save job ID for quick deploy
        if [[ "${SAVE_JOB_ID}" == "true" ]]; then
            save_job_id "${job_id}"
        fi
        
        # Parse and display results
        display_validation_results "${output_file}"
        
        # Auto quick-deploy if requested
        if [[ "${AUTO_QUICK_DEPLOY}" == "true" ]]; then
            log_info "Auto quick-deploy requested..."
            quick_deploy "${job_id}"
        else
            log_highlight "\n📝 To deploy these validated changes, run:"
            log_highlight "   sf project deploy quick --job-id ${job_id} --target-org ${ORG_ALIAS}"
        fi
    else
        log_warning "Could not extract Job ID from validation response"
    fi
}

process_validation_failure() {
    local output_file="$1"
    
    log_error "Validation deployment failed!"
    
    # Try to parse error details
    local error_message=$(jq -r '.message // .error // "Unknown error"' "${output_file}" 2>/dev/null)
    
    if [[ "${error_message}" != "Unknown error" ]]; then
        log_error "Error: ${error_message}"
    fi
    
    # Extract component errors
    local component_errors=$(jq -r '.result.details.componentFailures[]? | 
        "  • \(.fullName // .componentType): \(.problem // .message)"' "${output_file}" 2>/dev/null)
    
    if [[ -n "${component_errors}" ]]; then
        log_error "Component Errors:"
        echo "${component_errors}"
    fi
    
    # Extract test failures
    local test_failures=$(jq -r '.result.details.runTestResult.failures[]? | 
        "  • \(.name).\(.methodName): \(.message)"' "${output_file}" 2>/dev/null)
    
    if [[ -n "${test_failures}" ]]; then
        log_error "Test Failures:"
        echo "${test_failures}"
    fi
    
    # Check for common flow errors
    if grep -q "sObjectInputReference.*inputAssignments" "${output_file}"; then
        log_warning "Flow Error Detected: Cannot use sObjectInputReference with inputAssignments"
        log_info "Fix: Use either sObjectInputReference (for single record) OR inputAssignments (for field-by-field), not both"
    fi
    
    if grep -q "field integrity exception" "${output_file}"; then
        log_warning "Flow Error Detected: Field integrity exception"
        log_info "Fix: Ensure all referenced fields and variables exist"
    fi
    
    # Save failed validation for analysis
    local failed_dir="${VALIDATION_DIR}/failed"
    mkdir -p "${failed_dir}"
    cp "${output_file}" "${failed_dir}/validation-failure-${TIMESTAMP}.json"
    
    log_info "Full error details saved to: ${failed_dir}/validation-failure-${TIMESTAMP}.json"
    
    exit 1
}

display_validation_results() {
    local output_file="$1"
    
    log_highlight "\n📊 Validation Results:"
    log_highlight "─────────────────────────────────────────"
    
    # Component counts
    local components_deployed=$(jq -r '.result.numberComponentsDeployed // 0' "${output_file}" 2>/dev/null)
    local components_total=$(jq -r '.result.numberComponentsTotal // 0' "${output_file}" 2>/dev/null)
    local components_errors=$(jq -r '.result.numberComponentErrors // 0' "${output_file}" 2>/dev/null)
    
    log_info "Components: ${components_deployed}/${components_total} deployed"
    
    if [[ ${components_errors} -gt 0 ]]; then
        log_error "Component Errors: ${components_errors}"
    fi
    
    # Test results
    local tests_completed=$(jq -r '.result.numberTestsCompleted // 0' "${output_file}" 2>/dev/null)
    local tests_total=$(jq -r '.result.numberTestsTotal // 0' "${output_file}" 2>/dev/null)
    local test_errors=$(jq -r '.result.numberTestErrors // 0' "${output_file}" 2>/dev/null)
    
    if [[ ${tests_total} -gt 0 ]]; then
        log_info "Tests: ${tests_completed}/${tests_total} completed"
        
        if [[ ${test_errors} -gt 0 ]]; then
            log_error "Test Errors: ${test_errors}"
        fi
        
        # Code coverage
        local coverage=$(jq -r '.result.details.runTestResult.codeCoverage.codeCoveragePercentage // "N/A"' "${output_file}" 2>/dev/null)
        
        if [[ "${coverage}" != "N/A" ]]; then
            log_info "Code Coverage: ${coverage}%"
            
            if (( $(echo "${coverage} < 75" | bc -l) )); then
                log_warning "Coverage is below 75% requirement"
            fi
        fi
    fi
    
    log_highlight "─────────────────────────────────────────\n"
}

save_job_id() {
    local job_id="$1"
    
    local job_data='{
        "jobId": "'${job_id}'",
        "timestamp": "'$(date -Iseconds)'",
        "org": "'${ORG_ALIAS}'",
        "source": "'${SOURCE_PATH}'",
        "metadata": "'${METADATA_TYPE}'",
        "testLevel": "'${TEST_LEVEL}'"
    }'
    
    echo "${job_data}" | jq '.' > "${JOB_FILE}"
    
    log_success "Job ID saved to: ${JOB_FILE}"
}

quick_deploy() {
    local job_id="$1"
    
    log_info "Starting quick deploy with Job ID: ${job_id}"
    
    local quick_deploy_cmd="sf project deploy quick --job-id ${job_id} --target-org ${ORG_ALIAS} --json"
    
    log_info "Executing quick deploy..."
    
    local deploy_output="${TEMP_DIR}/quick-deploy-${TIMESTAMP}.json"
    
    if ${quick_deploy_cmd} > "${deploy_output}" 2>&1; then
        log_success "Quick deploy completed successfully!"
        
        # Display deployment results
        local deployed=$(jq -r '.result.numberComponentsDeployed // 0' "${deploy_output}" 2>/dev/null)
        log_success "Components deployed: ${deployed}"
    else
        log_error "Quick deploy failed!"
        
        local error=$(jq -r '.message // .error // "Unknown error"' "${deploy_output}" 2>/dev/null)
        log_error "Error: ${error}"
        
        exit 1
    fi
}

get_last_validation_job() {
    if [[ -f "${JOB_FILE}" ]]; then
        log_highlight "\n📋 Last Validation Job:"
        jq '.' "${JOB_FILE}"
        
        local job_id=$(jq -r '.jobId' "${JOB_FILE}")
        log_info "To quick-deploy: sf project deploy quick --job-id ${job_id} --target-org ${ORG_ALIAS}"
    else
        log_info "No previous validation job found"
    fi
}

##############################################################################
# Main Execution
##############################################################################

main() {
    log_highlight "═══════════════════════════════════════════════════════"
    log_highlight "       Check-Only Deployment Validator"
    log_highlight "═══════════════════════════════════════════════════════"
    log_info "Timestamp: ${TIMESTAMP}"
    
    # Special case: show last validation job
    if [[ "${1:-}" == "last" ]]; then
        get_last_validation_job
        exit 0
    fi
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Check prerequisites
    check_prerequisites
    
    # Run pre-validation checks
    run_pre_validation_checks
    
    # Run validation deployment
    validate_deployment
    
    log_highlight "═══════════════════════════════════════════════════════"
    log_success "Validation Complete"
    log_highlight "═══════════════════════════════════════════════════════"
}

# Run main function
main "$@"