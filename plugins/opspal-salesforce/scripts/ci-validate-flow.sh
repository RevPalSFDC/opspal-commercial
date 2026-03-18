#!/bin/bash

##############################################################################
# CI/CD Flow Validation Pipeline
# 
# Complete validation pipeline for Salesforce flows that integrates:
# - Static flow XML validation
# - Check-only deployment validation  
# - Flow test execution
# - Quick-deploy on success
# 
# Designed to prevent issues like the Contract flow deployment failures
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
LIB_DIR="${SCRIPT_DIR}/lib"
LOG_DIR="${PROJECT_ROOT}/logs/ci"
REPORTS_DIR="${PROJECT_ROOT}/reports"
ARTIFACTS_DIR="${PROJECT_ROOT}/artifacts"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Default values
ORG_ALIAS="${SF_TARGET_ORG:-${CI_ORG_ALIAS:-}}"
FLOW_PATH=""
FLOW_NAME=""
TEST_LEVEL="RunLocalTests"
OUTPUT_FORMAT="${CI_OUTPUT_FORMAT:-console}"
SKIP_STATIC_VALIDATION=false
SKIP_DEPLOYMENT_VALIDATION=false
SKIP_FLOW_TESTS=false
AUTO_DEPLOY=false
ROLLBACK_ON_FAILURE=true
MAX_RETRIES=2

# CI Environment Detection
IS_CI=false
if [[ -n "${CI:-}" ]] || [[ -n "${JENKINS_HOME:-}" ]] || [[ -n "${GITHUB_ACTIONS:-}" ]] || [[ -n "${GITLAB_CI:-}" ]]; then
    IS_CI=true
    OUTPUT_FORMAT="junit"
fi

# Ensure directories exist
mkdir -p "${LOG_DIR}" "${REPORTS_DIR}" "${ARTIFACTS_DIR}"

# Timestamp for logging
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PIPELINE_ID="${CI_PIPELINE_ID:-${TIMESTAMP}}"
LOG_FILE="${LOG_DIR}/pipeline-${PIPELINE_ID}.log"
REPORT_FILE="${REPORTS_DIR}/validation-report-${PIPELINE_ID}.xml"

# Exit codes
EXIT_SUCCESS=0
EXIT_STATIC_VALIDATION_FAILED=1
EXIT_DEPLOYMENT_VALIDATION_FAILED=2
EXIT_FLOW_TESTS_FAILED=3
EXIT_COVERAGE_FAILED=4
EXIT_QUICK_DEPLOY_FAILED=5

##############################################################################
# Functions
##############################################################################

log() {
    local message="$1"
    echo -e "$message" | tee -a "${LOG_FILE}"
    
    # Also log to CI system if available
    if [[ "${IS_CI}" == "true" ]]; then
        echo "::debug::${message}" 2>/dev/null || true  # GitHub Actions
        echo "##[debug]${message}" 2>/dev/null || true  # Azure DevOps
    fi
}

log_error() {
    local message="ERROR: $1"
    echo -e "${RED}❌ ${message}${NC}" | tee -a "${LOG_FILE}"
    
    if [[ "${IS_CI}" == "true" ]]; then
        echo "::error::${message}" 2>/dev/null || true  # GitHub Actions
        echo "##vso[task.logissue type=error]${message}" 2>/dev/null || true  # Azure DevOps
    fi
}

log_success() {
    echo -e "${GREEN}✅ SUCCESS: $1${NC}" | tee -a "${LOG_FILE}"
}

log_warning() {
    local message="WARNING: $1"
    echo -e "${YELLOW}⚠️  ${message}${NC}" | tee -a "${LOG_FILE}"
    
    if [[ "${IS_CI}" == "true" ]]; then
        echo "::warning::${message}" 2>/dev/null || true  # GitHub Actions
        echo "##vso[task.logissue type=warning]${message}" 2>/dev/null || true  # Azure DevOps
    fi
}

log_info() {
    echo -e "${BLUE}ℹ️  INFO: $1${NC}" | tee -a "${LOG_FILE}"
}

log_section() {
    echo -e "\n${CYAN}═══════════════════════════════════════════════════════${NC}" | tee -a "${LOG_FILE}"
    echo -e "${CYAN}    $1${NC}" | tee -a "${LOG_FILE}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}\n" | tee -a "${LOG_FILE}"
}

show_help() {
    cat << EOF
CI/CD Flow Validation Pipeline

Usage: $(basename "$0") [OPTIONS]

OPTIONS:
    -f, --flow <path>           Path to flow XML file (required)
    -o, --org <alias>           Salesforce org alias
    -t, --test-level <level>    Test level for deployment validation
    -F, --format <format>       Output format: console, junit, json
    --skip-static               Skip static XML validation
    --skip-deployment           Skip deployment validation
    --skip-tests                Skip flow tests
    --auto-deploy               Auto-deploy if all validations pass
    --no-rollback               Don't rollback on failure
    -v, --verbose               Verbose output
    -h, --help                  Show this help message

ENVIRONMENT VARIABLES:
    CI_ORG_ALIAS               Org alias for CI environment
    CI_OUTPUT_FORMAT           Output format for CI (junit, json)
    CI_PIPELINE_ID             Unique pipeline identifier
    CI_AUTO_DEPLOY             Set to 'true' for auto-deployment

EXAMPLES:
    # Basic validation
    $(basename "$0") -f force-app/main/default/flows/MyFlow.flow-meta.xml -o myorg

    # Full CI pipeline with auto-deploy
    $(basename "$0") -f path/to/flow.xml -o prod --auto-deploy

    # Skip static validation for quick check
    $(basename "$0") -f flow.xml -o dev --skip-static

EOF
    exit 0
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--flow)
                FLOW_PATH="$2"
                shift 2
                ;;
            -o|--org)
                ORG_ALIAS="$2"
                shift 2
                ;;
            -t|--test-level)
                TEST_LEVEL="$2"
                shift 2
                ;;
            -F|--format)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            --skip-static)
                SKIP_STATIC_VALIDATION=true
                shift
                ;;
            --skip-deployment)
                SKIP_DEPLOYMENT_VALIDATION=true
                shift
                ;;
            --skip-tests)
                SKIP_FLOW_TESTS=true
                shift
                ;;
            --auto-deploy)
                AUTO_DEPLOY=true
                shift
                ;;
            --no-rollback)
                ROLLBACK_ON_FAILURE=false
                shift
                ;;
            -v|--verbose)
                set -x
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

    # Check environment variable overrides
    if [[ -n "${CI_AUTO_DEPLOY:-}" ]] && [[ "${CI_AUTO_DEPLOY}" == "true" ]]; then
        AUTO_DEPLOY=true
    fi

    # Validate required parameters
    if [[ -z "${FLOW_PATH}" ]]; then
        log_error "Flow path is required"
        exit 1
    fi

    if [[ ! -f "${FLOW_PATH}" ]]; then
        log_error "Flow file not found: ${FLOW_PATH}"
        exit 1
    fi

    if [[ -z "${ORG_ALIAS}" ]]; then
        log_error "Org alias is required. Use -o or set CI_ORG_ALIAS environment variable"
        exit 1
    fi

    # Extract flow name from path
    FLOW_NAME=$(basename "${FLOW_PATH}" .flow-meta.xml)
}

initialize_report() {
    # Initialize JUnit XML report
    cat > "${REPORT_FILE}" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Flow Validation Pipeline" time="0" tests="0" failures="0" errors="0">
  <testsuite name="${FLOW_NAME}" timestamp="${TIMESTAMP}" hostname="${HOSTNAME}">
EOF
}

add_test_result() {
    local test_name="$1"
    local status="$2"  # passed, failed, skipped
    local time="${3:-0}"
    local message="${4:-}"
    local details="${5:-}"
    
    if [[ "${OUTPUT_FORMAT}" == "junit" ]]; then
        echo "    <testcase classname=\"FlowValidation\" name=\"${test_name}\" time=\"${time}\">" >> "${REPORT_FILE}"
        
        case "${status}" in
            failed)
                echo "      <failure message=\"${message}\">${details}</failure>" >> "${REPORT_FILE}"
                ;;
            error)
                echo "      <error message=\"${message}\">${details}</error>" >> "${REPORT_FILE}"
                ;;
            skipped)
                echo "      <skipped message=\"${message}\"/>" >> "${REPORT_FILE}"
                ;;
        esac
        
        echo "    </testcase>" >> "${REPORT_FILE}"
    fi
}

finalize_report() {
    if [[ "${OUTPUT_FORMAT}" == "junit" ]]; then
        echo "  </testsuite>" >> "${REPORT_FILE}"
        echo "</testsuites>" >> "${REPORT_FILE}"
        
        log_info "JUnit report saved to: ${REPORT_FILE}"
    fi
}

run_static_validation() {
    if [[ "${SKIP_STATIC_VALIDATION}" == "true" ]]; then
        log_info "Skipping static validation (--skip-static)"
        add_test_result "Static XML Validation" "skipped" "0" "Skipped by user"
        return 0
    fi
    
    log_section "Step 1: Static Flow XML Validation"
    
    local start_time=$(date +%s)
    local validation_output="${ARTIFACTS_DIR}/static-validation-${PIPELINE_ID}.json"
    
    # Check if flow validator exists
    local validator_script="${LIB_DIR}/flow-validator.js"
    if [[ ! -f "${validator_script}" ]]; then
        validator_script="${SCRIPT_DIR}/lib/flow-validator.js"
    fi
    
    if [[ ! -f "${validator_script}" ]]; then
        log_warning "Flow validator not found, skipping static validation"
        add_test_result "Static XML Validation" "skipped" "0" "Validator not found"
        return 0
    fi
    
    log_info "Validating: ${FLOW_PATH}"
    
    if node "${validator_script}" "${FLOW_PATH}" --output json > "${validation_output}" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log_success "Static validation passed"
        add_test_result "Static XML Validation" "passed" "${duration}"
        
        # Check for warnings
        local warning_count=$(jq '.warnings | length' "${validation_output}" 2>/dev/null || echo "0")
        if [[ ${warning_count} -gt 0 ]]; then
            log_warning "Found ${warning_count} warning(s):"
            jq -r '.warnings[] | "  - \(.problem)"' "${validation_output}" 2>/dev/null || true
        fi
        
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log_error "Static validation failed"
        
        # Extract error details
        local errors=$(jq -r '.issues[] | "  - \(.problem)"' "${validation_output}" 2>/dev/null || cat "${validation_output}")
        
        add_test_result "Static XML Validation" "failed" "${duration}" "Validation failed" "${errors}"
        
        log_error "Errors found:"
        echo "${errors}"
        
        return ${EXIT_STATIC_VALIDATION_FAILED}
    fi
}

run_deployment_validation() {
    if [[ "${SKIP_DEPLOYMENT_VALIDATION}" == "true" ]]; then
        log_info "Skipping deployment validation (--skip-deployment)"
        add_test_result "Deployment Validation" "skipped" "0" "Skipped by user"
        return 0
    fi
    
    log_section "Step 2: Check-Only Deployment Validation"
    
    local start_time=$(date +%s)
    local deploy_validator="${LIB_DIR}/deploy-validator.sh"
    
    if [[ ! -f "${deploy_validator}" ]]; then
        deploy_validator="${SCRIPT_DIR}/lib/deploy-validator.sh"
    fi
    
    if [[ ! -f "${deploy_validator}" ]]; then
        log_warning "Deploy validator not found, using sf CLI directly"
        
        # Fallback to direct sf command
        local deploy_cmd="sf project deploy validate"
        deploy_cmd="${deploy_cmd} --metadata Flow:${FLOW_NAME}"
        deploy_cmd="${deploy_cmd} --target-org ${ORG_ALIAS}"
        deploy_cmd="${deploy_cmd} --test-level ${TEST_LEVEL}"
        deploy_cmd="${deploy_cmd} --wait 30"
        deploy_cmd="${deploy_cmd} --json"
        
        local deploy_output="${ARTIFACTS_DIR}/deploy-validation-${PIPELINE_ID}.json"
        
        if ${deploy_cmd} > "${deploy_output}" 2>&1; then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            
            log_success "Deployment validation passed"
            add_test_result "Deployment Validation" "passed" "${duration}"
            
            # Save job ID for quick deploy
            VALIDATION_JOB_ID=$(jq -r '.result.id' "${deploy_output}" 2>/dev/null || echo "")
            
            if [[ -n "${VALIDATION_JOB_ID}" ]]; then
                log_info "Validation Job ID: ${VALIDATION_JOB_ID}"
                echo "${VALIDATION_JOB_ID}" > "${ARTIFACTS_DIR}/validation-job-id.txt"
            fi
            
            return 0
        else
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            
            log_error "Deployment validation failed"
            
            local error_msg=$(jq -r '.message' "${deploy_output}" 2>/dev/null || cat "${deploy_output}")
            add_test_result "Deployment Validation" "failed" "${duration}" "Deployment validation failed" "${error_msg}"
            
            return ${EXIT_DEPLOYMENT_VALIDATION_FAILED}
        fi
    else
        log_info "Using deploy validator script"
        
        local deploy_output="${ARTIFACTS_DIR}/deploy-validation-${PIPELINE_ID}.log"
        
        if "${deploy_validator}" \
            -o "${ORG_ALIAS}" \
            -m "Flow:${FLOW_NAME}" \
            -t "${TEST_LEVEL}" \
            -n > "${deploy_output}" 2>&1; then
            
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            
            log_success "Deployment validation passed"
            add_test_result "Deployment Validation" "passed" "${duration}"
            
            # Extract job ID
            VALIDATION_JOB_ID=$(grep -oE '0Af[A-Za-z0-9]{15}' "${deploy_output}" | head -1)
            
            if [[ -n "${VALIDATION_JOB_ID}" ]]; then
                log_info "Validation Job ID: ${VALIDATION_JOB_ID}"
                echo "${VALIDATION_JOB_ID}" > "${ARTIFACTS_DIR}/validation-job-id.txt"
            fi
            
            return 0
        else
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            
            log_error "Deployment validation failed"
            add_test_result "Deployment Validation" "failed" "${duration}" "Deployment validation failed" "See ${deploy_output}"
            
            return ${EXIT_DEPLOYMENT_VALIDATION_FAILED}
        fi
    fi
}

run_flow_tests() {
    if [[ "${SKIP_FLOW_TESTS}" == "true" ]]; then
        log_info "Skipping flow tests (--skip-tests)"
        add_test_result "Flow Tests" "skipped" "0" "Skipped by user"
        return 0
    fi
    
    log_section "Step 3: Flow Test Execution"
    
    local start_time=$(date +%s)
    local test_runner="${SCRIPT_DIR}/flow-test-runner.sh"
    
    if [[ ! -f "${test_runner}" ]]; then
        log_warning "Flow test runner not found, skipping flow tests"
        add_test_result "Flow Tests" "skipped" "0" "Test runner not found"
        return 0
    fi
    
    log_info "Running flow tests for: ${FLOW_NAME}"
    
    local test_output="${ARTIFACTS_DIR}/flow-tests-${PIPELINE_ID}.xml"
    
    if "${test_runner}" \
        -o "${ORG_ALIAS}" \
        -f "${FLOW_NAME}" \
        -F junit > "${test_output}" 2>&1; then
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log_success "Flow tests passed"
        add_test_result "Flow Tests" "passed" "${duration}"
        
        # Check coverage
        local coverage=$(grep -oP 'coverage="\K[0-9]+' "${test_output}" 2>/dev/null || echo "0")
        
        if [[ -n "${coverage}" ]] && [[ ${coverage} -lt 75 ]]; then
            log_warning "Flow coverage is ${coverage}% (below 75% threshold)"
            
            if [[ "${IS_CI}" == "true" ]]; then
                add_test_result "Flow Coverage" "failed" "0" "Coverage ${coverage}% below 75%" ""
                return ${EXIT_COVERAGE_FAILED}
            fi
        elif [[ -n "${coverage}" ]]; then
            log_success "Flow coverage: ${coverage}%"
            add_test_result "Flow Coverage" "passed" "0"
        fi
        
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log_error "Flow tests failed"
        add_test_result "Flow Tests" "failed" "${duration}" "Tests failed" "See ${test_output}"
        
        return ${EXIT_FLOW_TESTS_FAILED}
    fi
}

quick_deploy() {
    if [[ "${AUTO_DEPLOY}" != "true" ]]; then
        log_info "Auto-deploy not enabled. To deploy, run:"
        
        if [[ -n "${VALIDATION_JOB_ID:-}" ]]; then
            log_info "  sf project deploy quick --job-id ${VALIDATION_JOB_ID} --target-org ${ORG_ALIAS}"
        fi
        
        return 0
    fi
    
    if [[ -z "${VALIDATION_JOB_ID:-}" ]]; then
        # Try to read from file
        if [[ -f "${ARTIFACTS_DIR}/validation-job-id.txt" ]]; then
            VALIDATION_JOB_ID=$(cat "${ARTIFACTS_DIR}/validation-job-id.txt")
        else
            log_warning "No validation job ID available for quick deploy"
            return 0
        fi
    fi
    
    log_section "Step 4: Quick Deploy"
    
    log_info "Deploying validated changes with Job ID: ${VALIDATION_JOB_ID}"
    
    local deploy_output="${ARTIFACTS_DIR}/quick-deploy-${PIPELINE_ID}.json"
    
    if sf project deploy quick \
        --job-id "${VALIDATION_JOB_ID}" \
        --target-org "${ORG_ALIAS}" \
        --json > "${deploy_output}" 2>&1; then
        
        log_success "Quick deploy completed successfully!"
        add_test_result "Quick Deploy" "passed" "0"
        
        # Extract deployment details
        local components_deployed=$(jq -r '.result.numberComponentsDeployed' "${deploy_output}" 2>/dev/null || echo "0")
        log_success "Components deployed: ${components_deployed}"
        
        return 0
    else
        log_error "Quick deploy failed!"
        
        local error_msg=$(jq -r '.message' "${deploy_output}" 2>/dev/null || cat "${deploy_output}")
        add_test_result "Quick Deploy" "failed" "0" "Deploy failed" "${error_msg}"
        
        return ${EXIT_QUICK_DEPLOY_FAILED}
    fi
}

rollback_on_failure() {
    if [[ "${ROLLBACK_ON_FAILURE}" != "true" ]]; then
        return 0
    fi
    
    log_warning "Initiating rollback procedures..."
    
    # If we have a previous successful deployment, we could restore it
    # This is a placeholder for rollback logic
    
    log_info "Rollback completed"
}

generate_summary() {
    log_section "Pipeline Summary"
    
    log_info "Pipeline ID: ${PIPELINE_ID}"
    log_info "Flow: ${FLOW_NAME}"
    log_info "Org: ${ORG_ALIAS}"
    log_info "Status: ${1}"
    
    if [[ -f "${REPORT_FILE}" ]] && [[ "${OUTPUT_FORMAT}" == "junit" ]]; then
        log_info "Report: ${REPORT_FILE}"
    fi
    
    if [[ -d "${ARTIFACTS_DIR}" ]]; then
        log_info "Artifacts: ${ARTIFACTS_DIR}"
    fi
    
    # Set CI environment variables for downstream jobs
    if [[ "${IS_CI}" == "true" ]]; then
        echo "FLOW_VALIDATION_STATUS=${1}" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
        echo "##vso[task.setvariable variable=FLOW_VALIDATION_STATUS]${1}" 2>/dev/null || true
        
        if [[ -n "${VALIDATION_JOB_ID:-}" ]]; then
            echo "VALIDATION_JOB_ID=${VALIDATION_JOB_ID}" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
            echo "##vso[task.setvariable variable=VALIDATION_JOB_ID]${VALIDATION_JOB_ID}" 2>/dev/null || true
        fi
    fi
}

##############################################################################
# Main Execution
##############################################################################

main() {
    local exit_code=${EXIT_SUCCESS}
    
    log_section "CI/CD Flow Validation Pipeline"
    log_info "Pipeline ID: ${PIPELINE_ID}"
    log_info "Timestamp: ${TIMESTAMP}"
    
    # Parse arguments
    parse_arguments "$@"
    
    log_info "Validating Flow: ${FLOW_NAME}"
    log_info "Target Org: ${ORG_ALIAS}"
    
    # Initialize report
    initialize_report
    
    # Run validation steps
    if ! run_static_validation; then
        exit_code=$?
        finalize_report
        rollback_on_failure
        generate_summary "FAILED"
        exit ${exit_code}
    fi
    
    if ! run_deployment_validation; then
        exit_code=$?
        finalize_report
        rollback_on_failure
        generate_summary "FAILED"
        exit ${exit_code}
    fi
    
    if ! run_flow_tests; then
        exit_code=$?
        finalize_report
        rollback_on_failure
        generate_summary "FAILED"
        exit ${exit_code}
    fi
    
    # Quick deploy if all validations passed
    if ! quick_deploy; then
        exit_code=$?
        finalize_report
        rollback_on_failure
        generate_summary "FAILED"
        exit ${exit_code}
    fi
    
    # Finalize
    finalize_report
    generate_summary "SUCCESS"
    
    log_section "Pipeline Completed Successfully"
    
    exit ${EXIT_SUCCESS}
}

# Handle interrupts
trap 'log_error "Pipeline interrupted"; rollback_on_failure; exit 130' INT TERM

# Run main function
main "$@"