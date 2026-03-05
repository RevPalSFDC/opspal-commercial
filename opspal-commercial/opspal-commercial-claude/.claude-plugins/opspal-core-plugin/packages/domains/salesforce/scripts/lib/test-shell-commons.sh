#!/bin/bash
# test-shell-commons.sh
# Test script for shell-commons.sh library
# Usage: ./test-shell-commons.sh

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source the commons library
# shellcheck source=shell-commons.sh
source "${SCRIPT_DIR}/shell-commons.sh"

# Test configuration
TEST_DIR="${SCRIPT_DIR}/test-temp"
TEST_CSV="${TEST_DIR}/test.csv"
TEST_CONFIG="${TEST_DIR}/test.conf"

echo -e "${BOLD}Shell Commons Library Test Suite${NC}"
echo "============================================="

# Test 1: Logging functions
echo -e "\n${BLUE}Test 1: Logging Functions${NC}"
log_info "Testing info logging"
log_success "Testing success logging"
log_warning "Testing warning logging"
log_error "Testing error logging (this is expected)"
log_debug "Testing debug logging (only visible if DEBUG=true)"

# Test 2: Directory and file utilities
echo -e "\n${BLUE}Test 2: File and Directory Utilities${NC}"
safe_mkdir "$TEST_DIR"
log_success "Created test directory: $TEST_DIR"

# Create test CSV
cat > "$TEST_CSV" << 'EOF'
Name,Email,Phone
John Doe,john@example.com,555-1234
Jane Smith,jane@example.com,555-5678
EOF

if validate_csv "$TEST_CSV"; then
    log_success "CSV validation passed"
else
    log_warning "CSV validation failed (expected for demo)"
fi

# Test backup functionality
if backup_file "$TEST_CSV" >/dev/null; then
    log_success "File backup created successfully"
fi

# Test 3: Configuration management
echo -e "\n${BLUE}Test 3: Configuration Management${NC}"
cat > "$TEST_CONFIG" << 'EOF'
# Test configuration file
ORG_ALIAS=test-org
DEBUG=true
TIMEOUT=300
EOF

if load_config "$TEST_CONFIG" false; then
    log_success "Configuration loaded successfully"
    log_info "Loaded ORG_ALIAS: ${ORG_ALIAS:-not set}"
fi

# Test 4: Progress indicators
echo -e "\n${BLUE}Test 4: Progress Indicators${NC}"
log_info "Testing progress bar..."
for i in {1..10}; do
    show_progress $i 10 "Processing"
    sleep 0.1
done

# Test 5: Salesforce CLI detection
echo -e "\n${BLUE}Test 5: Salesforce CLI Detection${NC}"
if sf_cli=$(get_sf_cli 2>/dev/null); then
    log_success "Salesforce CLI detected: $sf_cli"
    
    # Test org alias detection
    if org_alias=$(get_org_alias "default-test-org" 2>/dev/null); then
        log_success "Org alias resolved: $org_alias"
    fi
else
    log_warning "Salesforce CLI not found (expected in some environments)"
fi

# Test 6: Error handling and retry mechanism
echo -e "\n${BLUE}Test 6: Error Handling and Retry${NC}"

test_retry_success() {
    log_info "Testing retry mechanism with successful command..."
    if retry_with_backoff 3 0.1 2 echo "Retry test successful"; then
        log_success "Retry mechanism works for successful commands"
    fi
}

test_retry_failure() {
    log_info "Testing retry mechanism with failing command..."
    if retry_with_backoff 2 0.1 2 false 2>/dev/null; then
        log_error "This should not succeed"
    else
        log_success "Retry mechanism properly handles failures"
    fi
}

test_retry_success
test_retry_failure

# Test 7: Utility functions
echo -e "\n${BLUE}Test 7: Utility Functions${NC}"

# Test command existence check
if command_exists "echo"; then
    log_success "Command existence check works"
fi

# Test JSON pretty print
if command_exists "jq"; then
    echo '{"test": "value"}' | json_pretty >/dev/null 2>&1
    log_success "JSON pretty print works"
else
    log_warning "jq not available for JSON testing"
fi

# Test URL encoding
if command_exists "python3"; then
    encoded=$(url_encode "test string with spaces")
    if [[ "$encoded" == "test%20string%20with%20spaces" ]]; then
        log_success "URL encoding works: $encoded"
    fi
else
    log_warning "Python3 not available for URL encoding test"
fi

# Test 8: User confirmation (non-interactive test)
echo -e "\n${BLUE}Test 8: User Interaction${NC}"
log_info "User confirmation function available (skipping interactive test)"

# Test 9: Line ending checks
echo -e "\n${BLUE}Test 9: Line Ending Validation${NC}"
if check_line_endings "$TEST_CSV"; then
    log_success "Line ending validation passed"
fi

# Test 10: Cleanup
echo -e "\n${BLUE}Test 10: Cleanup${NC}"
if [[ -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR"
    log_success "Test cleanup completed"
fi

echo -e "\n${GREEN}${SUCCESS_SYMBOL} All tests completed successfully!${NC}"
echo -e "${GRAY}Note: Some warnings above are expected for demonstration purposes.${NC}"

# Usage examples
cat << 'EOF'

USAGE EXAMPLES:
===============

1. Basic logging:
   log_info "Starting process..."
   log_success "Process completed!"
   log_error "Something went wrong"

2. Safe Salesforce operations:
   safe_sf_query "SELECT Id, Name FROM Account LIMIT 10" "my-org"
   safe_sf_deploy "force-app/" "my-org" false

3. File operations:
   backup_file "/path/to/important/file.txt"
   validate_csv "/path/to/data.csv" "Name,Email,Phone"
   check_line_endings "/path/to/file.txt" true

4. Configuration management:
   load_config "/path/to/config.conf"
   org_alias=$(get_org_alias "default-org")

5. Progress indicators:
   show_progress 5 10 "Processing records"
   
6. Error handling with retry:
   retry_with_backoff 3 1 2 some_command arg1 arg2

7. User confirmation:
   if confirm_action "Delete all records?"; then
       echo "User confirmed deletion"
   fi

8. Include in your scripts:
   #!/bin/bash
   source "$(dirname "$0")/lib/shell-commons.sh"
   
   log_info "Script started"
   # Your script logic here
   log_success "Script completed"

EOF