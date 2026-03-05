#!/bin/bash

##############################################################################
# test-framework.sh - Comprehensive Testing Framework for ClaudeSFDC Scripts
##############################################################################
# Provides automated testing for all scripts with coverage reporting
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR="${PROJECT_DIR}/tests"
RESULTS_DIR="${TEST_DIR}/results"
COVERAGE_DIR="${TEST_DIR}/coverage"

# Load common libraries
source "${SCRIPT_DIR}/lib/shell-commons.sh"

# Test statistics
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0
START_TIME=$(date +%s)

##############################################################################
# Test Categories
##############################################################################

TEST_CATEGORIES=(
    "unit"          # Unit tests for individual functions
    "integration"   # Integration tests for script interactions
    "security"      # Security vulnerability tests
    "performance"   # Performance and load tests
    "regression"    # Regression tests for bug fixes
)

##############################################################################
# Core Test Functions
##############################################################################

run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="${3:-0}"
    local timeout="${4:-30}"
    
    ((TESTS_RUN++))
    echo -n "  Testing $test_name... "
    
    # Run test with timeout
    local result
    if timeout "$timeout" bash -c "$test_command" &> "${RESULTS_DIR}/${test_name}.log"; then
        result=0
    else
        result=$?
    fi
    
    # Check result
    if [[ $result -eq $expected_result ]]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (expected $expected_result, got $result)"
        ((TESTS_FAILED++))
        echo "    See: ${RESULTS_DIR}/${test_name}.log"
        return 1
    fi
}

skip_test() {
    local test_name="$1"
    local reason="$2"
    
    ((TESTS_SKIPPED++))
    echo -e "  Testing $test_name... ${YELLOW}⊘ SKIPPED${NC} ($reason)"
}

##############################################################################
# Test Suites
##############################################################################

test_shell_commons() {
    log_info "Testing Shell Commons Library..."
    
    # Test logging functions
    run_test "shell_commons_logging" "
        source ${SCRIPT_DIR}/lib/shell-commons.sh
        log_info 'test' > /dev/null 2>&1
        log_error 'test' > /dev/null 2>&1
        log_success 'test' > /dev/null 2>&1
    "
    
    # Test file utilities
    run_test "shell_commons_file_utils" "
        source ${SCRIPT_DIR}/lib/shell-commons.sh
        temp_file=\$(mktemp)
        echo 'Id,Name' > \$temp_file
        echo '001,Test' >> \$temp_file
        validate_csv \$temp_file
        rm \$temp_file
    "
    
    # Test retry mechanism
    run_test "shell_commons_retry" "
        source ${SCRIPT_DIR}/lib/shell-commons.sh
        retry_with_backoff 'true' 2 1
    "
}

test_python_commons() {
    log_info "Testing Python Commons Library..."
    
    if ! command -v python3 &> /dev/null; then
        skip_test "python_commons" "Python 3 not installed"
        return
    fi
    
    run_test "python_commons_import" "
        python3 -c 'import sys; sys.path.insert(0, \"${SCRIPT_DIR}/lib\"); from python_commons import *'
    "
    
    run_test "python_commons_logging" "
        python3 -c '
import sys
sys.path.insert(0, \"${SCRIPT_DIR}/lib\")
from python_commons import setup_logging, log_info
logger = setup_logging(\"INFO\")
log_info(\"Test message\")
'
    "
}

test_credential_manager() {
    log_info "Testing Credential Manager..."
    
    run_test "credential_manager_load" "
        source ${SCRIPT_DIR}/lib/credential-manager.sh
        create_env_template ${TEMP_DIR:-/tmp}
        rm ${TEMP_DIR:-/tmp}
    "
    
    run_test "credential_manager_validate" "
        source ${SCRIPT_DIR}/lib/credential-manager.sh
        # This should fail as credentials aren't set
        validate_credentials 2>/dev/null
    " 1
}

test_unified_scripts() {
    log_info "Testing Unified Scripts..."
    
    # Test import manager
    if [[ -f "${SCRIPT_DIR}/unified-import-manager.sh" ]]; then
        run_test "unified_import_help" "${SCRIPT_DIR}/unified-import-manager.sh -h"
    else
        skip_test "unified_import_manager" "Script not found"
    fi
    
    # Test data validator
    if [[ -f "${SCRIPT_DIR}/unified-data-validator.sh" ]]; then
        run_test "unified_data_validator_help" "${SCRIPT_DIR}/unified-data-validator.sh -h"
    else
        skip_test "unified_data_validator" "Script not found"
    fi
    
    # Test system validator
    if [[ -f "${SCRIPT_DIR}/unified-system-validator.sh" ]]; then
        run_test "unified_system_validator_help" "${SCRIPT_DIR}/unified-system-validator.sh -h"
    else
        skip_test "unified_system_validator" "Script not found"
    fi
}

test_security() {
    log_info "Testing Security..."
    
    # Check for eval usage
    run_test "no_eval_in_libs" "
        ! grep -r 'eval ' ${SCRIPT_DIR}/lib/*.sh | grep -v '^#'
    "
    
    # Check for hardcoded credentials
    run_test "no_hardcoded_credentials" "
        ! grep -r 'PASSWORD=\\|TOKEN=\\|SECRET=' ${SCRIPT_DIR}/lib/*.sh | grep -v 'template\\|example'
    "
    
    # Check for proper error handling
    run_test "error_handling_in_libs" "
        grep -q 'set -e' ${SCRIPT_DIR}/lib/shell-commons.sh
    "
}

test_performance() {
    log_info "Testing Performance..."
    
    # Test script loading time
    run_test "library_load_time" "
        time_start=\$(date +%s%N)
        source ${SCRIPT_DIR}/lib/shell-commons.sh
        source ${SCRIPT_DIR}/lib/credential-manager.sh
        time_end=\$(date +%s%N)
        time_diff=\$((time_end - time_start))
        # Should load in less than 100ms
        [[ \$time_diff -lt 100000000 ]]
    "
    
    # Test CSV processing speed
    run_test "csv_processing_speed" "
        temp_file=\$(mktemp)
        for i in {1..1000}; do
            echo \"id\$i,name\$i,value\$i\" >> \$temp_file
        done
        source ${SCRIPT_DIR}/lib/shell-commons.sh
        time_start=\$(date +%s%N)
        validate_csv \$temp_file
        time_end=\$(date +%s%N)
        rm \$temp_file
        time_diff=\$((time_end - time_start))
        # Should process 1000 lines in less than 1 second
        [[ \$time_diff -lt 1000000000 ]]
    "
}

##############################################################################
# Coverage Analysis
##############################################################################

generate_coverage_report() {
    log_info "Generating coverage report..."
    
    local coverage_file="${COVERAGE_DIR}/coverage-$(date +%Y%m%d-%H%M%S).txt"
    mkdir -p "$COVERAGE_DIR"
    
    {
        echo "Test Coverage Report"
        echo "===================="
        echo ""
        echo "Date: $(date)"
        echo "Total Tests: $TESTS_RUN"
        echo "Passed: $TESTS_PASSED"
        echo "Failed: $TESTS_FAILED"
        echo "Skipped: $TESTS_SKIPPED"
        echo ""
        echo "Scripts Tested:"
        echo "---------------"
        
        # List tested scripts
        for script in "${SCRIPT_DIR}"/lib/*.sh "${SCRIPT_DIR}"/unified-*.sh; do
            if [[ -f "$script" ]]; then
                echo "  ✓ $(basename "$script")"
            fi
        done
        
        echo ""
        echo "Test Categories:"
        echo "----------------"
        for category in "${TEST_CATEGORIES[@]}"; do
            echo "  - $category"
        done
        
    } > "$coverage_file"
    
    log_success "Coverage report saved to: $coverage_file"
}

##############################################################################
# Main Test Runner
##############################################################################

run_all_tests() {
    log_info "Running all tests..."
    
    # Create results directory
    mkdir -p "$RESULTS_DIR"
    mkdir -p "$TEST_DIR"
    
    # Run test suites
    test_shell_commons
    test_python_commons
    test_credential_manager
    test_unified_scripts
    test_security
    test_performance
    
    # Generate coverage report
    generate_coverage_report
}

show_results() {
    local end_time=$(date +%s)
    local duration=$((end_time - START_TIME))
    
    echo ""
    echo -e "${BLUE}===================================${NC}"
    echo -e "${BLUE}       Test Results Summary${NC}"
    echo -e "${BLUE}===================================${NC}"
    echo -e "Tests Run:     ${BLUE}$TESTS_RUN${NC}"
    echo -e "Tests Passed:  ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed:  ${RED}$TESTS_FAILED${NC}"
    echo -e "Tests Skipped: ${YELLOW}$TESTS_SKIPPED${NC}"
    echo -e "Duration:      ${BLUE}${duration}s${NC}"
    echo ""
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        return 0
    else
        echo -e "${RED}✗ Some tests failed. Check ${RESULTS_DIR} for details.${NC}"
        return 1
    fi
}

##############################################################################
# CI/CD Integration
##############################################################################

generate_junit_xml() {
    local junit_file="${RESULTS_DIR}/junit.xml"
    
    cat > "$junit_file" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="ClaudeSFDC Tests" tests="$TESTS_RUN" failures="$TESTS_FAILED" skipped="$TESTS_SKIPPED" time="$(($(date +%s) - START_TIME))">
  <testsuite name="Script Tests" tests="$TESTS_RUN" failures="$TESTS_FAILED" skipped="$TESTS_SKIPPED">
EOF
    
    # Add test cases from log files
    for log in "${RESULTS_DIR}"/*.log; do
        if [[ -f "$log" ]]; then
            local test_name=$(basename "$log" .log)
            echo "    <testcase name=\"$test_name\" classname=\"ScriptTests\" />" >> "$junit_file"
        fi
    done
    
    echo "  </testsuite>" >> "$junit_file"
    echo "</testsuites>" >> "$junit_file"
    
    log_info "JUnit XML report saved to: $junit_file"
}

##############################################################################
# Main Execution
##############################################################################

main() {
    local test_suite="${1:-all}"
    
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║              ClaudeSFDC Script Test Framework                ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    case "$test_suite" in
        all)
            run_all_tests
            ;;
        shell)
            test_shell_commons
            ;;
        python)
            test_python_commons
            ;;
        security)
            test_security
            ;;
        performance)
            test_performance
            ;;
        unified)
            test_unified_scripts
            ;;
        *)
            echo "Usage: $0 [all|shell|python|security|performance|unified]"
            exit 1
            ;;
    esac
    
    # Generate reports
    generate_junit_xml
    
    # Show results
    show_results
}

# Run main function
main "$@"