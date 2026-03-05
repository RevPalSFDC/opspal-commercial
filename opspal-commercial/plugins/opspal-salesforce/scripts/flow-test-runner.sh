#!/bin/bash

##############################################################################
# Flow Test Runner
# 
# Executes Salesforce Flow Tests via CLI with comprehensive reporting
# Supports both individual and batch flow testing
# Includes test data setup and teardown capabilities
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/lib"
LOG_DIR="${SCRIPT_DIR}/logs"
TEMP_DIR="${SCRIPT_DIR}/temp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ORG_ALIAS="${SF_TARGET_ORG:-}"
FLOW_NAME=""
TEST_FILTER=""
OUTPUT_FORMAT="human"
VERBOSE=false
CREATE_TEST_DATA=false
CLEANUP_TEST_DATA=true
TEST_DATA_FILE=""
MAX_RETRIES=3

# Ensure log directory exists
mkdir -p "${LOG_DIR}" "${TEMP_DIR}"

# Timestamp for logging
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/flow-test-${TIMESTAMP}.log"

##############################################################################
# Functions
##############################################################################

log() {
    echo -e "$1" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}ERROR: $1${NC}" | tee -a "${LOG_FILE}"
}

log_success() {
    echo -e "${GREEN}SUCCESS: $1${NC}" | tee -a "${LOG_FILE}"
}

log_warning() {
    echo -e "${YELLOW}WARNING: $1${NC}" | tee -a "${LOG_FILE}"
}

log_info() {
    echo -e "${BLUE}INFO: $1${NC}" | tee -a "${LOG_FILE}"
}

show_help() {
    cat << EOF
Flow Test Runner - Execute and validate Salesforce Flow Tests

Usage: $(basename "$0") [OPTIONS]

OPTIONS:
    -o, --org <alias>           Salesforce org alias (default: \$SF_TARGET_ORG)
    -f, --flow <name>           Specific flow to test
    -t, --test <filter>         Test name filter pattern
    -d, --test-data <file>      JSON file with test data to create
    -c, --create-data           Create test data before running tests
    -n, --no-cleanup            Don't cleanup test data after tests
    -F, --format <format>       Output format: human, json, junit (default: human)
    -v, --verbose               Verbose output
    -h, --help                  Show this help message

EXAMPLES:
    # Run all flow tests
    $(basename "$0") -o myorg

    # Test specific flow
    $(basename "$0") -o myorg -f Account_AfterSave_Master

    # Run tests with pattern
    $(basename "$0") -o myorg -t "*Contract*"

    # Run with test data creation
    $(basename "$0") -o myorg -f Contract_Flow -d test-data.json -c

    # Output as JUnit for CI/CD
    $(basename "$0") -o myorg -F junit > test-results.xml

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
            -f|--flow)
                FLOW_NAME="$2"
                shift 2
                ;;
            -t|--test)
                TEST_FILTER="$2"
                shift 2
                ;;
            -d|--test-data)
                TEST_DATA_FILE="$2"
                shift 2
                ;;
            -c|--create-data)
                CREATE_TEST_DATA=true
                shift
                ;;
            -n|--no-cleanup)
                CLEANUP_TEST_DATA=false
                shift
                ;;
            -F|--format)
                OUTPUT_FORMAT="$2"
                shift 2
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
    
    log_success "Prerequisites check passed"
}

create_test_data() {
    if [[ "${CREATE_TEST_DATA}" == "true" ]] && [[ -n "${TEST_DATA_FILE}" ]]; then
        log_info "Creating test data from ${TEST_DATA_FILE}..."
        
        if [[ ! -f "${TEST_DATA_FILE}" ]]; then
            log_error "Test data file not found: ${TEST_DATA_FILE}"
            return 1
        fi
        
        # Parse JSON and create records
        local object_type=$(jq -r '.object' "${TEST_DATA_FILE}")
        local records=$(jq -c '.records[]' "${TEST_DATA_FILE}")
        
        local created_ids=""
        while IFS= read -r record; do
            local create_result=$(echo "${record}" | sf data create record \
                -s "${object_type}" \
                -o "${ORG_ALIAS}" \
                --json 2>/dev/null)
            
            if [[ $? -eq 0 ]]; then
                local record_id=$(echo "${create_result}" | jq -r '.result.id')
                created_ids="${created_ids}${record_id},"
                log_success "Created ${object_type} record: ${record_id}"
            else
                log_warning "Failed to create test record"
            fi
        done <<< "${records}"
        
        # Save created IDs for cleanup
        echo "${created_ids}" > "${TEMP_DIR}/test-data-ids-${TIMESTAMP}.txt"
    fi
}

cleanup_test_data() {
    if [[ "${CLEANUP_TEST_DATA}" == "true" ]] && [[ -f "${TEMP_DIR}/test-data-ids-${TIMESTAMP}.txt" ]]; then
        log_info "Cleaning up test data..."
        
        local ids_file="${TEMP_DIR}/test-data-ids-${TIMESTAMP}.txt"
        local ids=$(cat "${ids_file}")
        
        if [[ -n "${ids}" ]]; then
            # Parse object type from test data file
            local object_type=$(jq -r '.object' "${TEST_DATA_FILE}")
            
            IFS=',' read -ra ID_ARRAY <<< "${ids}"
            for id in "${ID_ARRAY[@]}"; do
                if [[ -n "${id}" ]]; then
                    sf data delete record -s "${object_type}" -i "${id}" -o "${ORG_ALIAS}" &> /dev/null
                    log_info "Deleted test record: ${id}"
                fi
            done
        fi
        
        rm -f "${ids_file}"
    fi
}

run_flow_tests() {
    log_info "Running Flow Tests..."
    
    local cmd="sf flow test --target-org ${ORG_ALIAS}"
    
    # Add flow filter if specified
    if [[ -n "${FLOW_NAME}" ]]; then
        cmd="${cmd} --tests ${FLOW_NAME}"
        log_info "Testing specific flow: ${FLOW_NAME}"
    fi
    
    # Add test filter if specified
    if [[ -n "${TEST_FILTER}" ]]; then
        cmd="${cmd} --test-level ${TEST_FILTER}"
        log_info "Using test filter: ${TEST_FILTER}"
    fi
    
    # Add output format
    case "${OUTPUT_FORMAT}" in
        json)
            cmd="${cmd} --json"
            ;;
        junit)
            cmd="${cmd} --result-format junit"
            ;;
        *)
            # Human readable is default
            ;;
    esac
    
    if [[ "${VERBOSE}" == "true" ]]; then
        log_info "Executing: ${cmd}"
    fi
    
    # Execute tests with retry logic
    local attempt=1
    local test_passed=false
    
    while [[ ${attempt} -le ${MAX_RETRIES} ]] && [[ "${test_passed}" == "false" ]]; do
        log_info "Test attempt ${attempt} of ${MAX_RETRIES}..."
        
        local test_output="${TEMP_DIR}/flow-test-output-${TIMESTAMP}.txt"
        
        if ${cmd} > "${test_output}" 2>&1; then
            test_passed=true
            log_success "Flow tests completed successfully"
            
            # Process and display results
            process_test_results "${test_output}"
        else
            log_warning "Test attempt ${attempt} failed"
            
            if [[ ${attempt} -lt ${MAX_RETRIES} ]]; then
                log_info "Retrying in 5 seconds..."
                sleep 5
            else
                log_error "All test attempts failed"
                cat "${test_output}"
                return 1
            fi
        fi
        
        ((attempt++))
    done
}

process_test_results() {
    local output_file="$1"
    
    case "${OUTPUT_FORMAT}" in
        json)
            # Parse JSON output
            if [[ -f "${output_file}" ]]; then
                local result=$(cat "${output_file}")
                
                # Extract key metrics
                local total_tests=$(echo "${result}" | jq -r '.result.summary.testsRan // 0')
                local passed=$(echo "${result}" | jq -r '.result.summary.passing // 0')
                local failed=$(echo "${result}" | jq -r '.result.summary.failing // 0')
                local skipped=$(echo "${result}" | jq -r '.result.summary.skipped // 0')
                
                log_info "Test Summary:"
                log_info "  Total Tests: ${total_tests}"
                log_success "  Passed: ${passed}"
                
                if [[ ${failed} -gt 0 ]]; then
                    log_error "  Failed: ${failed}"
                fi
                
                if [[ ${skipped} -gt 0 ]]; then
                    log_warning "  Skipped: ${skipped}"
                fi
                
                # Show failed test details
                if [[ ${failed} -gt 0 ]]; then
                    log_error "\nFailed Tests:"
                    echo "${result}" | jq -r '.result.tests[] | select(.outcome == "Fail") | "  - \(.name): \(.message)"'
                fi
                
                # Output full JSON if verbose
                if [[ "${VERBOSE}" == "true" ]]; then
                    echo "${result}" | jq '.'
                fi
            fi
            ;;
            
        junit)
            # JUnit format for CI/CD integration
            cat "${output_file}"
            ;;
            
        *)
            # Human readable output
            cat "${output_file}"
            
            # Parse for summary if possible
            if grep -q "Test Run Summary" "${output_file}"; then
                echo ""
                log_info "Extracting test summary..."
                grep -A 10 "Test Run Summary" "${output_file}"
            fi
            ;;
    esac
}

generate_test_report() {
    local report_file="${LOG_DIR}/flow-test-report-${TIMESTAMP}.html"
    
    log_info "Generating test report: ${report_file}"
    
    cat > "${report_file}" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Flow Test Report - ${TIMESTAMP}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .summary { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .success { color: green; }
        .failure { color: red; }
        .warning { color: orange; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; }
    </style>
</head>
<body>
    <h1>Flow Test Report</h1>
    <div class="summary">
        <h2>Test Execution Summary</h2>
        <p><strong>Timestamp:</strong> ${TIMESTAMP}</p>
        <p><strong>Org:</strong> ${ORG_ALIAS}</p>
        <p><strong>Flow:</strong> ${FLOW_NAME:-"All Flows"}</p>
    </div>
    
    <h2>Test Results</h2>
    <pre>
$(cat "${LOG_FILE}")
    </pre>
</body>
</html>
EOF
    
    log_success "Test report generated: ${report_file}"
}

run_coverage_analysis() {
    log_info "Analyzing flow test coverage..."
    
    # Get flow coverage
    local coverage_cmd="sf data query -q \"SELECT FlowVersionId, FlowVersion.Definition.DeveloperName, \
        NumElementsCovered, NumElementsNotCovered, TestMethodName \
        FROM FlowTestCoverage\" -o ${ORG_ALIAS} --json"
    
    local coverage_result=$(${coverage_cmd} 2>/dev/null)
    
    if [[ $? -eq 0 ]]; then
        local total_covered=$(echo "${coverage_result}" | jq '[.result.records[].NumElementsCovered // 0] | add')
        local total_not_covered=$(echo "${coverage_result}" | jq '[.result.records[].NumElementsNotCovered // 0] | add')
        
        if [[ -n "${total_covered}" ]] && [[ -n "${total_not_covered}" ]]; then
            local total=$((total_covered + total_not_covered))
            if [[ ${total} -gt 0 ]]; then
                local coverage_percent=$((total_covered * 100 / total))
                
                log_info "Flow Test Coverage: ${coverage_percent}%"
                log_info "  Elements Covered: ${total_covered}"
                log_info "  Elements Not Covered: ${total_not_covered}"
                
                if [[ ${coverage_percent} -lt 75 ]]; then
                    log_warning "Coverage is below 75% threshold"
                else
                    log_success "Coverage meets requirements"
                fi
            fi
        fi
    else
        log_warning "Could not retrieve flow test coverage data"
    fi
}

##############################################################################
# Main Execution
##############################################################################

main() {
    log_info "=== Flow Test Runner Started ==="
    log_info "Timestamp: ${TIMESTAMP}"
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Check prerequisites
    check_prerequisites
    
    # Create test data if requested
    create_test_data
    
    # Run flow tests
    if run_flow_tests; then
        # Analyze coverage
        run_coverage_analysis
        
        # Generate report
        generate_test_report
        
        log_success "=== Flow Test Runner Completed Successfully ==="
        exit_code=0
    else
        log_error "=== Flow Test Runner Failed ==="
        exit_code=1
    fi
    
    # Cleanup test data
    cleanup_test_data
    
    # Cleanup temp files
    rm -f "${TEMP_DIR}/flow-test-output-${TIMESTAMP}.txt"
    
    exit ${exit_code}
}

# Run main function
main "$@"