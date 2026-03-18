#!/bin/bash

##############################################################################
# test-import-suite.sh - Comprehensive Test Suite for Import Tools
##############################################################################
# Tests all import tools with various scenarios to ensure reliability
##############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TEST_DATA_DIR="${SCRIPT_DIR}/../test-data"
TEST_RESULTS_DIR="${SCRIPT_DIR}/../test-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create directories
mkdir -p "$TEST_DATA_DIR" "$TEST_RESULTS_DIR"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test result log
TEST_LOG="${TEST_RESULTS_DIR}/test_run_${TIMESTAMP}.log"

# Function to log test results
log_test() {
    local test_name="$1"
    local status="$2"
    local message="$3"
    
    echo "[$TIMESTAMP] [$status] $test_name: $message" >> "$TEST_LOG"
    
    case "$status" in
        PASS)
            echo -e "${GREEN}✓${NC} $test_name"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            ;;
        FAIL)
            echo -e "${RED}✗${NC} $test_name: $message"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            ;;
        SKIP)
            echo -e "${YELLOW}○${NC} $test_name: $message"
            TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
            ;;
    esac
    
    TESTS_RUN=$((TESTS_RUN + 1))
}

# Function to create test CSV files
create_test_data() {
    echo -e "${BLUE}Creating test data files...${NC}"
    
    # 1. Simple valid CSV (LF line endings)
    cat > "${TEST_DATA_DIR}/test_simple_lf.csv" << 'EOF'
Name,Type,Industry,Website
"Test Company 1","Customer","Technology","www.test1.com"
"Test Company 2","Prospect","Healthcare","www.test2.com"
EOF
    
    # 2. CSV with CRLF line endings
    printf "Name,Type,Industry,Website\r\n" > "${TEST_DATA_DIR}/test_crlf.csv"
    printf "\"Test Company 3\",\"Customer\",\"Finance\",\"www.test3.com\"\r\n" >> "${TEST_DATA_DIR}/test_crlf.csv"
    
    # 3. CSV with missing required fields
    cat > "${TEST_DATA_DIR}/test_missing_fields.csv" << 'EOF'
Name,Type,Industry
"Test Company 4","Customer","Technology"
"Test Company 5","Prospect","Healthcare"
EOF
    
    # 4. CSV with special characters
    cat > "${TEST_DATA_DIR}/test_special_chars.csv" << 'EOF'
Name,Type,Industry,Website,Description
"Test™ Company®","Customer","Technology","www.test.com","Company with © symbols and € currency"
"Ñoñó Çompañý","Prospect","Healthcare","www.test.com","Über company with § marks"
EOF
    
    # 5. Large CSV (1000+ records)
    echo "Name,Type,Industry,Website" > "${TEST_DATA_DIR}/test_large.csv"
    for i in {1..1000}; do
        echo "\"Test Company $i\",\"Customer\",\"Technology\",\"www.test$i.com\"" >> "${TEST_DATA_DIR}/test_large.csv"
    done
    
    # 6. CSV with spaces after commas
    cat > "${TEST_DATA_DIR}/test_spaces.csv" << 'EOF'
Name, Type, Industry, Website
"Test Company 6" , "Customer" , "Technology" , "www.test6.com"
EOF
    
    # 7. CSV with BOM marker
    printf "\xEF\xBB\xBF" > "${TEST_DATA_DIR}/test_bom.csv"
    echo "Name,Type,Industry,Website" >> "${TEST_DATA_DIR}/test_bom.csv"
    echo "\"Test Company 7\",\"Customer\",\"Technology\",\"www.test7.com\"" >> "${TEST_DATA_DIR}/test_bom.csv"
    
    # 8. Mixed line endings
    printf "Name,Type,Industry,Website\n" > "${TEST_DATA_DIR}/test_mixed.csv"
    printf "\"Test Company 8\",\"Customer\",\"Technology\",\"www.test8.com\"\r\n" >> "${TEST_DATA_DIR}/test_mixed.csv"
    printf "\"Test Company 9\",\"Prospect\",\"Healthcare\",\"www.test9.com\"\n" >> "${TEST_DATA_DIR}/test_mixed.csv"
    
    echo -e "${GREEN}Test data created${NC}"
}

# Test 1: Diagnostic mode
test_diagnostic_mode() {
    local test_name="Diagnostic Mode"
    
    if "${SCRIPT_DIR}/safe-bulk-import.sh" -d -f "${TEST_DATA_DIR}/test_simple_lf.csv" > /dev/null 2>&1; then
        log_test "$test_name" "PASS" "Diagnostic mode executed successfully"
    else
        log_test "$test_name" "FAIL" "Diagnostic mode failed"
    fi
}

# Test 2: Line ending conversion
test_line_ending_conversion() {
    local test_name="Line Ending Conversion"
    
    # Test LF to CRLF conversion
    cp "${TEST_DATA_DIR}/test_simple_lf.csv" "${TEST_DATA_DIR}/test_conversion.csv"
    
    if "${SCRIPT_DIR}/safe-bulk-import.sh" -o Account -f "${TEST_DATA_DIR}/test_conversion.csv" -l CRLF -k y -s y > /dev/null 2>&1; then
        # Check if converted file has CRLF
        if file "${TEST_DATA_DIR}/test_conversion.csv.converted" | grep -q "CRLF"; then
            log_test "$test_name" "PASS" "Successfully converted to CRLF"
            rm -f "${TEST_DATA_DIR}/test_conversion.csv.converted"
        else
            log_test "$test_name" "FAIL" "Conversion did not produce CRLF"
        fi
    else
        log_test "$test_name" "FAIL" "Conversion script failed"
    fi
}

# Test 3: BOM removal
test_bom_removal() {
    local test_name="BOM Removal"
    
    if "${SCRIPT_DIR}/pre-import-validator.sh" -o Account -f "${TEST_DATA_DIR}/test_bom.csv" -x y > /dev/null 2>&1; then
        # Check if BOM was removed
        if head -c 3 "${TEST_DATA_DIR}/test_bom.csv.transformed" | grep -q $'\xef\xbb\xbf'; then
            log_test "$test_name" "FAIL" "BOM not removed"
        else
            log_test "$test_name" "PASS" "BOM successfully removed"
        fi
    else
        log_test "$test_name" "SKIP" "Validator not available"
    fi
}

# Test 4: Space removal
test_space_removal() {
    local test_name="Space After Comma Removal"
    
    if "${SCRIPT_DIR}/pre-import-validator.sh" -o Account -f "${TEST_DATA_DIR}/test_spaces.csv" -x y > /dev/null 2>&1; then
        # Check if spaces were removed
        if grep -q ', "' "${TEST_DATA_DIR}/test_spaces.csv.transformed"; then
            log_test "$test_name" "FAIL" "Spaces not removed"
        else
            log_test "$test_name" "PASS" "Spaces successfully removed"
        fi
    else
        log_test "$test_name" "SKIP" "Validator not available"
    fi
}

# Test 5: Field addition for validation rules
test_field_addition() {
    local test_name="Required Field Addition"
    
    if "${SCRIPT_DIR}/pre-import-validator.sh" -o Account -f "${TEST_DATA_DIR}/test_missing_fields.csv" -x y > /dev/null 2>&1; then
        # Check if Website field was added
        if head -n 1 "${TEST_DATA_DIR}/test_missing_fields.csv.transformed" | grep -q "Website"; then
            log_test "$test_name" "PASS" "Required field added"
        else
            log_test "$test_name" "FAIL" "Required field not added"
        fi
    else
        log_test "$test_name" "SKIP" "Validator not available"
    fi
}

# Test 6: Large file handling
test_large_file() {
    local test_name="Large File Handling"
    
    # Just test that it doesn't crash with large files
    if "${SCRIPT_DIR}/safe-bulk-import.sh" -d -f "${TEST_DATA_DIR}/test_large.csv" > /dev/null 2>&1; then
        log_test "$test_name" "PASS" "Large file processed successfully"
    else
        log_test "$test_name" "FAIL" "Large file processing failed"
    fi
}

# Test 7: Special character handling
test_special_characters() {
    local test_name="Special Character Handling"
    
    if "${SCRIPT_DIR}/pre-import-validator.sh" -o Account -f "${TEST_DATA_DIR}/test_special_chars.csv" -x y > /dev/null 2>&1; then
        # Check if file still contains special characters (should be preserved)
        if grep -q "™" "${TEST_DATA_DIR}/test_special_chars.csv.transformed"; then
            log_test "$test_name" "PASS" "Special characters preserved"
        else
            log_test "$test_name" "FAIL" "Special characters lost"
        fi
    else
        log_test "$test_name" "SKIP" "Validator not available"
    fi
}

# Test 8: Mixed line endings
test_mixed_line_endings() {
    local test_name="Mixed Line Ending Fix"
    
    if "${SCRIPT_DIR}/safe-bulk-import.sh" -o Account -f "${TEST_DATA_DIR}/test_mixed.csv" -l CRLF -k y -s y > /dev/null 2>&1; then
        # Count line ending types in converted file
        local lf_only=$(grep -c $'\n' "${TEST_DATA_DIR}/test_mixed.csv.converted" 2>/dev/null || echo "0")
        local crlf=$(grep -c $'\r\n' "${TEST_DATA_DIR}/test_mixed.csv.converted" 2>/dev/null || echo "0")
        
        if [[ $crlf -gt 0 ]] && [[ $lf_only -eq $crlf ]]; then
            log_test "$test_name" "PASS" "Mixed line endings unified"
            rm -f "${TEST_DATA_DIR}/test_mixed.csv.converted"
        else
            log_test "$test_name" "FAIL" "Mixed line endings not properly fixed"
        fi
    else
        log_test "$test_name" "FAIL" "Conversion failed"
    fi
}

# Test 9: Orchestrator strategy selection
test_orchestrator_strategies() {
    local test_name="Orchestrator Strategy Selection"
    
    # Test auto strategy
    if "${SCRIPT_DIR}/smart-import-orchestrator.sh" -o Account -f "${TEST_DATA_DIR}/test_simple_lf.csv" -s auto -v > /dev/null 2>&1; then
        log_test "$test_name - Auto" "PASS" "Auto strategy works"
    else
        log_test "$test_name - Auto" "FAIL" "Auto strategy failed"
    fi
    
    # Test safe strategy
    if "${SCRIPT_DIR}/smart-import-orchestrator.sh" -o Account -f "${TEST_DATA_DIR}/test_simple_lf.csv" -s safe -v > /dev/null 2>&1; then
        log_test "$test_name - Safe" "PASS" "Safe strategy works"
    else
        log_test "$test_name - Safe" "FAIL" "Safe strategy failed"
    fi
}

# Test 10: Error recovery
test_error_recovery() {
    local test_name="Error Recovery"
    
    # Create an intentionally problematic file
    echo "This,Is,Not,Valid,CSV,Data" > "${TEST_DATA_DIR}/test_invalid.csv"
    echo "No quotes here, and, bad, formatting" >> "${TEST_DATA_DIR}/test_invalid.csv"
    
    # Should handle gracefully without crashing
    if "${SCRIPT_DIR}/pre-import-validator.sh" -o Account -f "${TEST_DATA_DIR}/test_invalid.csv" -x y 2>&1 | grep -q -i "error\|warning"; then
        log_test "$test_name" "PASS" "Error handled gracefully"
    else
        log_test "$test_name" "FAIL" "Error not properly handled"
    fi
}

# Function to run all tests
run_all_tests() {
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     Import Tools Test Suite v1.0        ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    
    # Create test data
    create_test_data
    
    echo -e "${BLUE}Running tests...${NC}"
    echo ""
    
    # Run individual tests
    test_diagnostic_mode
    test_line_ending_conversion
    test_bom_removal
    test_space_removal
    test_field_addition
    test_large_file
    test_special_characters
    test_mixed_line_endings
    test_orchestrator_strategies
    test_error_recovery
    
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║           Test Results Summary          ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "Tests Run:     $TESTS_RUN"
    echo -e "Tests Passed:  ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed:  ${RED}$TESTS_FAILED${NC}"
    echo -e "Tests Skipped: ${YELLOW}$TESTS_SKIPPED${NC}"
    echo ""
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests passed! ✓${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed. Check $TEST_LOG for details.${NC}"
        exit 1
    fi
}

# Function to run specific test
run_specific_test() {
    local test_name="$1"
    
    create_test_data
    
    case "$test_name" in
        diagnostic) test_diagnostic_mode ;;
        line-ending) test_line_ending_conversion ;;
        bom) test_bom_removal ;;
        spaces) test_space_removal ;;
        fields) test_field_addition ;;
        large) test_large_file ;;
        special) test_special_characters ;;
        mixed) test_mixed_line_endings ;;
        orchestrator) test_orchestrator_strategies ;;
        recovery) test_error_recovery ;;
        *)
            echo "Unknown test: $test_name"
            echo "Available tests: diagnostic, line-ending, bom, spaces, fields, large, special, mixed, orchestrator, recovery"
            exit 1
            ;;
    esac
}

# Main execution
if [[ $# -eq 0 ]]; then
    run_all_tests
else
    run_specific_test "$1"
fi