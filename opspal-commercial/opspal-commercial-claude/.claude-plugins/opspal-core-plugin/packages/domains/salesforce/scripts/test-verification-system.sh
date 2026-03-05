#!/bin/bash

##############################################################################
# test-verification-system.sh - Complete test suite for verification system
##############################################################################
# Tests all components of the error management and verification system
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Test results file
TEST_RESULTS="${SCRIPT_DIR}/test-results-$(date +%Y%m%d-%H%M%S).log"

# Function to print test header
print_header() {
    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${CYAN}  Salesforce Verification System Tests${NC}"
    echo -e "${CYAN}========================================${NC}\n"
}

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="${3:-0}"  # Default to expecting success
    
    ((TESTS_RUN++))
    echo -e "${BLUE}TEST ${TESTS_RUN}: ${test_name}${NC}"
    
    # Run test and capture result
    set +e
    eval "$test_command" >> "$TEST_RESULTS" 2>&1
    local result=$?
    set -e
    
    # Check result
    if [[ $result -eq $expected_result ]]; then
        echo -e "${GREEN}  ✓ PASSED${NC}"
        ((TESTS_PASSED++))
        echo "PASS: $test_name" >> "$TEST_RESULTS"
        return 0
    else
        echo -e "${RED}  ✗ FAILED (expected $expected_result, got $result)${NC}"
        ((TESTS_FAILED++))
        echo "FAIL: $test_name (expected $expected_result, got $result)" >> "$TEST_RESULTS"
        return 1
    fi
}

# Function to create test data
create_test_data() {
    local file="$1"
    local content="$2"
    
    echo "$content" > "$file"
    echo -e "${YELLOW}Created test file: $file${NC}"
}

# Function to cleanup test data
cleanup_test_data() {
    rm -f "${SCRIPT_DIR}"/test-*.json
    rm -f "${SCRIPT_DIR}"/test-*.csv
    rm -f "${SCRIPT_DIR}"/test-*.log
    echo -e "${YELLOW}Cleaned up test files${NC}"
}

# Function to test timeout manager
test_timeout_manager() {
    echo -e "\n${CYAN}Testing Timeout Manager...${NC}"
    
    # Test profile detection
    run_test "Timeout profile detection" \
        "${SCRIPT_DIR}/timeout-manager.sh detect 'sf data query'"
    
    # Test quick timeout
    run_test "Quick timeout (should timeout)" \
        "timeout 1 ${SCRIPT_DIR}/timeout-manager.sh execute quick 'sleep 5'" \
        124  # Expecting timeout exit code
    
    # Test standard timeout  
    run_test "Standard timeout (should succeed)" \
        "${SCRIPT_DIR}/timeout-manager.sh execute standard 'echo test'"
}

# Function to test JSON parser
test_json_parser() {
    echo -e "\n${CYAN}Testing Safe JSON Parser...${NC}"
    
    # Test valid JSON
    create_test_data "${SCRIPT_DIR}/test-valid.json" \
        '{"success": true, "id": "003XX000001"}'
    
    run_test "Parse valid JSON" \
        "python3 ${SCRIPT_DIR}/safe-json-parser.py ${SCRIPT_DIR}/test-valid.json"
    
    # Test truncated JSON
    create_test_data "${SCRIPT_DIR}/test-truncated.json" \
        '{"success": true, "records": [{"id": "001"}, {"id": "002"'
    
    run_test "Parse truncated JSON" \
        "python3 ${SCRIPT_DIR}/safe-json-parser.py ${SCRIPT_DIR}/test-truncated.json"
    
    # Test JSON with trailing comma
    create_test_data "${SCRIPT_DIR}/test-comma.json" \
        '{"success": true, "id": "003XX000001",}'
    
    run_test "Parse JSON with trailing comma" \
        "python3 ${SCRIPT_DIR}/safe-json-parser.py ${SCRIPT_DIR}/test-comma.json"
    
    # Test malformed JSON
    create_test_data "${SCRIPT_DIR}/test-malformed.json" \
        "Error: Invalid JSON response {partial data"
    
    run_test "Extract JSON from error text" \
        "python3 ${SCRIPT_DIR}/safe-json-parser.py ${SCRIPT_DIR}/test-malformed.json"
}

# Function to test chunked operations
test_chunked_operations() {
    echo -e "\n${CYAN}Testing Chunked Operations...${NC}"
    
    # Create large CSV file
    echo "Id,Name,Account" > "${SCRIPT_DIR}/test-large.csv"
    for i in {1..500}; do
        echo "00Q$(printf '%010d' $i),Lead$i,Account$i" >> "${SCRIPT_DIR}/test-large.csv"
    done
    
    run_test "Process large file in chunks" \
        "python3 ${SCRIPT_DIR}/chunked-operations.py process \
         --file ${SCRIPT_DIR}/test-large.csv \
         --operation upsert \
         --object Lead \
         --chunk-size 100 \
         --dry-run"
    
    run_test "Resume from checkpoint" \
        "python3 ${SCRIPT_DIR}/chunked-operations.py resume \
         --checkpoint ${SCRIPT_DIR}/test-large.csv.checkpoint \
         --dry-run"
}

# Function to test retry mechanism
test_retry_mechanism() {
    echo -e "\n${CYAN}Testing Smart Retry...${NC}"
    
    # Test successful retry
    run_test "Retry with eventual success" \
        "${SCRIPT_DIR}/smart-retry.sh --max-retries 3 \
         --category TIMEOUT \
         'echo success'"
    
    # Test permission error (should not retry)
    run_test "No retry for permission errors" \
        "${SCRIPT_DIR}/smart-retry.sh --max-retries 3 \
         --category PERMISSION \
         'exit 1'" \
        1  # Expecting failure
    
    # Test exponential backoff
    run_test "Exponential backoff timing" \
        "${SCRIPT_DIR}/smart-retry.sh --max-retries 2 \
         --backoff exponential \
         --dry-run \
         'echo test'"
}

# Function to test update verifier
test_update_verifier() {
    echo -e "\n${CYAN}Testing Update Verifier...${NC}"
    
    # Test snapshot creation
    run_test "Create update snapshot" \
        "python3 -c \"
from scripts.update_verifier import UpdateVerifier
verifier = UpdateVerifier()
snapshot = verifier.take_snapshot('Account', ['001XX000001', '001XX000002'], dry_run=True)
print('Snapshot created:', snapshot.snapshot_id)
\""
    
    # Test verification
    run_test "Verify update changes" \
        "python3 -c \"
from scripts.update_verifier import UpdateVerifier, UpdateSnapshot
from datetime import datetime
verifier = UpdateVerifier()
before = UpdateSnapshot('test123', 'Account', datetime.now(), 
                       [{'Id': '001', 'Name': 'Old'}], ['Id', 'Name'])
expected = {'001': {'Name': 'New'}}
result = verifier.verify_update(before, expected, dry_run=True)
print('Verification:', result.is_successful)
\""
}

# Function to test job monitor
test_job_monitor() {
    echo -e "\n${CYAN}Testing Job Monitor...${NC}"
    
    # Test job status checking (dry run)
    run_test "Check job status" \
        "${SCRIPT_DIR}/job-monitor.sh 7501XX00000TEST --dry-run"
    
    # Test timeout handling
    run_test "Job timeout handling" \
        "timeout 2 ${SCRIPT_DIR}/job-monitor.sh 7501XX00000TEST \
         --timeout 1 --dry-run" \
        124  # Expecting timeout
}

# Function to test response validator
test_response_validator() {
    echo -e "\n${CYAN}Testing Response Validator...${NC}"
    
    # Test single record validation
    create_test_data "${SCRIPT_DIR}/test-single.json" \
        '{"success": true, "id": "003XX000001"}'
    
    run_test "Validate single record response" \
        "python3 ${SCRIPT_DIR}/response-validator.py \
         ${SCRIPT_DIR}/test-single.json --type single_record"
    
    # Test bulk response validation
    create_test_data "${SCRIPT_DIR}/test-bulk.json" \
        '[{"success": true, "id": "001"}, {"success": false, "errors": [{"message": "Error"}]}]'
    
    run_test "Validate bulk response" \
        "python3 ${SCRIPT_DIR}/response-validator.py \
         ${SCRIPT_DIR}/test-bulk.json --type bulk_records"
    
    # Test query response validation
    create_test_data "${SCRIPT_DIR}/test-query.json" \
        '{"totalSize": 2, "done": true, "records": [{"Id": "001"}, {"Id": "002"}]}'
    
    run_test "Validate query response" \
        "python3 ${SCRIPT_DIR}/response-validator.py \
         ${SCRIPT_DIR}/test-query.json --type query_result"
    
    # Test job response validation
    create_test_data "${SCRIPT_DIR}/test-job.json" \
        '{"state": "JobComplete", "numberRecordsProcessed": 100, "numberRecordsFailed": 2}'
    
    run_test "Validate job response" \
        "python3 ${SCRIPT_DIR}/response-validator.py \
         ${SCRIPT_DIR}/test-job.json --type job_result"
}

# Function to test audit logger
test_audit_logger() {
    echo -e "\n${CYAN}Testing Audit Logger...${NC}"
    
    # Test logging operation
    run_test "Log audit entry" \
        "python3 ${SCRIPT_DIR}/audit-logger.py log \
         UPDATE Account --status SUCCESS --records 100 --success 98 --failure 2"
    
    # Test querying audit log
    run_test "Query audit log" \
        "python3 ${SCRIPT_DIR}/audit-logger.py query --limit 10"
    
    # Test statistics
    run_test "Get audit statistics" \
        "python3 ${SCRIPT_DIR}/audit-logger.py stats --days 7"
    
    # Test alerts
    run_test "Check active alerts" \
        "python3 ${SCRIPT_DIR}/audit-logger.py alerts"
}

# Function to test safe update wrapper
test_safe_update() {
    echo -e "\n${CYAN}Testing Safe Update Wrapper...${NC}"
    
    # Create test update file
    create_test_data "${SCRIPT_DIR}/test-update.csv" \
"Id,Name,Status
001XX000001,Test Account 1,Active
001XX000002,Test Account 2,Inactive"
    
    # Test safe update (dry run)
    run_test "Safe update execution" \
        "${SCRIPT_DIR}/safe-update.sh \
         --object Account \
         --file ${SCRIPT_DIR}/test-update.csv \
         --operation update \
         --dry-run"
}

# Function to test integration
test_integration() {
    echo -e "\n${CYAN}Testing Full Integration...${NC}"
    
    # Create test data
    create_test_data "${SCRIPT_DIR}/test-integration.csv" \
"Id,Name,Type
003XX000001,Test Lead 1,Prospect
003XX000002,Test Lead 2,Customer"
    
    # Test full pipeline
    run_test "Full verification pipeline" \
        "${SCRIPT_DIR}/safe-update.sh \
         --object Lead \
         --file ${SCRIPT_DIR}/test-integration.csv \
         --operation upsert \
         --verify \
         --audit \
         --dry-run"
}

# Function to test error scenarios
test_error_scenarios() {
    echo -e "\n${CYAN}Testing Error Scenarios...${NC}"
    
    # Test handling of non-existent file
    run_test "Handle missing file" \
        "python3 ${SCRIPT_DIR}/safe-json-parser.py /nonexistent/file.json" \
        1  # Expecting failure
    
    # Test handling of empty response
    create_test_data "${SCRIPT_DIR}/test-empty.json" ""
    
    run_test "Handle empty response" \
        "python3 ${SCRIPT_DIR}/response-validator.py ${SCRIPT_DIR}/test-empty.json" \
        1  # Expecting failure
    
    # Test handling of permission error
    create_test_data "${SCRIPT_DIR}/test-permission.json" \
        '{"success": false, "errors": [{"statusCode": "INSUFFICIENT_ACCESS"}]}'
    
    run_test "Detect permission errors" \
        "python3 ${SCRIPT_DIR}/response-validator.py ${SCRIPT_DIR}/test-permission.json" \
        1  # Expecting failure
}

# Function to run performance tests
test_performance() {
    echo -e "\n${CYAN}Testing Performance...${NC}"
    
    # Create large dataset
    echo "Id,Field1,Field2,Field3,Field4,Field5" > "${SCRIPT_DIR}/test-perf.csv"
    for i in {1..10000}; do
        echo "00Q$(printf '%010d' $i),Value$i,Data$i,Info$i,Status$i,Type$i" \
            >> "${SCRIPT_DIR}/test-perf.csv"
    done
    
    # Test large file processing
    run_test "Process 10k records" \
        "python3 ${SCRIPT_DIR}/chunked-operations.py process \
         --file ${SCRIPT_DIR}/test-perf.csv \
         --operation upsert \
         --object Lead \
         --chunk-size 500 \
         --dry-run"
}

# Function to generate test report
generate_report() {
    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${CYAN}           Test Results Summary${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo -e "Tests Run:    ${BLUE}$TESTS_RUN${NC}"
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "\n${GREEN}✓ All tests passed!${NC}"
        echo "SUCCESS" > "${SCRIPT_DIR}/test-status.txt"
    else
        echo -e "\n${RED}✗ Some tests failed. Check $TEST_RESULTS for details.${NC}"
        echo "FAILURE" > "${SCRIPT_DIR}/test-status.txt"
    fi
    
    # Calculate success rate
    if [[ $TESTS_RUN -gt 0 ]]; then
        local success_rate=$((TESTS_PASSED * 100 / TESTS_RUN))
        echo -e "Success Rate: ${YELLOW}${success_rate}%${NC}"
    fi
    
    echo -e "\nDetailed results saved to: ${BLUE}$TEST_RESULTS${NC}"
}

# Main test execution
main() {
    # Print header
    print_header
    
    # Initialize test results
    echo "Test Execution Started: $(date)" > "$TEST_RESULTS"
    echo "======================================" >> "$TEST_RESULTS"
    
    # Check if running specific test suite
    if [[ $# -gt 0 ]]; then
        case "$1" in
            timeout)
                test_timeout_manager
                ;;
            json)
                test_json_parser
                ;;
            chunked)
                test_chunked_operations
                ;;
            retry)
                test_retry_mechanism
                ;;
            verifier)
                test_update_verifier
                ;;
            monitor)
                test_job_monitor
                ;;
            validator)
                test_response_validator
                ;;
            audit)
                test_audit_logger
                ;;
            update)
                test_safe_update
                ;;
            integration)
                test_integration
                ;;
            errors)
                test_error_scenarios
                ;;
            performance)
                test_performance
                ;;
            all|*)
                # Run all tests
                test_timeout_manager
                test_json_parser
                test_chunked_operations
                test_retry_mechanism
                test_update_verifier
                test_job_monitor
                test_response_validator
                test_audit_logger
                test_safe_update
                test_integration
                test_error_scenarios
                
                # Only run performance tests if explicitly requested
                if [[ "$1" == "all" ]]; then
                    test_performance
                fi
                ;;
        esac
    else
        # Default: run all tests except performance
        test_timeout_manager
        test_json_parser
        test_chunked_operations
        test_retry_mechanism
        test_update_verifier
        test_job_monitor
        test_response_validator
        test_audit_logger
        test_safe_update
        test_integration
        test_error_scenarios
    fi
    
    # Cleanup test data
    cleanup_test_data
    
    # Generate report
    generate_report
    
    # Exit with appropriate code
    exit $TESTS_FAILED
}

# Handle script arguments
case "${1:-}" in
    -h|--help)
        echo "Usage: $0 [test-suite]"
        echo ""
        echo "Test Suites:"
        echo "  timeout      - Test timeout manager"
        echo "  json         - Test JSON parser"
        echo "  chunked      - Test chunked operations"
        echo "  retry        - Test retry mechanism"
        echo "  verifier     - Test update verifier"
        echo "  monitor      - Test job monitor"
        echo "  validator    - Test response validator"
        echo "  audit        - Test audit logger"
        echo "  update       - Test safe update wrapper"
        echo "  integration  - Test full integration"
        echo "  errors       - Test error scenarios"
        echo "  performance  - Test performance (large datasets)"
        echo "  all          - Run all tests including performance"
        echo ""
        echo "If no suite specified, runs all tests except performance"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac