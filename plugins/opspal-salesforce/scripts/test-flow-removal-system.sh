#!/bin/bash

# Test Script for Two-Phase Flow Removal System
# Tests the complete flow removal implementation
#
# Usage: ./test-flow-removal-system.sh [org-alias]

set -e

# Configuration
ORG_ALIAS="${1:-sandbox}"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LIB_DIR="${SCRIPT_DIR}/lib"
TEST_FLOW_NAME="Test_Flow_Removal_$(date +%s)"
TEST_RESULTS_FILE="${TEMP_DIR:-/tmp}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

echo "================================================"
echo " Two-Phase Flow Removal System Test Suite"
echo "================================================"
echo "Org: $ORG_ALIAS"
echo "Test Flow: $TEST_FLOW_NAME"
echo ""

# Function to log test results
log_test() {
    local test_name="$1"
    local result="$2"
    local details="$3"
    
    if [ "$result" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Details: $details"
        ((TESTS_FAILED++))
    fi
    
    echo "$(date): $test_name - $result - $details" >> "$TEST_RESULTS_FILE"
}

# Test 1: Verify scripts exist
echo "Test 1: Checking required scripts..."
echo "----------------------------------------"

if [ -f "$LIB_DIR/flow-removal-manager.js" ]; then
    log_test "flow-removal-manager.js exists" "PASS" "Found at $LIB_DIR"
else
    log_test "flow-removal-manager.js exists" "FAIL" "Not found at $LIB_DIR"
fi

if [ -f "$LIB_DIR/flow-deactivator.js" ]; then
    log_test "flow-deactivator.js exists" "PASS" "Found at $LIB_DIR"
else
    log_test "flow-deactivator.js exists" "FAIL" "Not found at $LIB_DIR"
fi

if [ -f "$LIB_DIR/flow-deployment-wrapper.js" ]; then
    log_test "flow-deployment-wrapper.js exists" "PASS" "Found at $LIB_DIR"
else
    log_test "flow-deployment-wrapper.js exists" "FAIL" "Not found at $LIB_DIR"
fi

echo ""

# Test 2: Test flow-removal-manager list command
echo "Test 2: Testing flow listing..."
echo "----------------------------------------"

if node "$LIB_DIR/flow-removal-manager.js" list --org "$ORG_ALIAS" > /dev/null 2>&1; then
    log_test "Flow listing command" "PASS" "Successfully listed flows"
else
    log_test "Flow listing command" "FAIL" "Failed to list flows"
fi

echo ""

# Test 3: Create a test flow for removal testing
echo "Test 3: Creating test flow for removal..."
echo "----------------------------------------"

# Create a minimal test flow
TEST_FLOW_DIR="${TEMP_DIR:-/tmp}"
mkdir -p "$TEST_FLOW_DIR/flows"

cat > "$TEST_FLOW_DIR/flows/${TEST_FLOW_NAME}.flow-meta.xml" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow for Removal</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Active</status>
    <description>Test flow created for removal testing</description>
    <start>
        <locationX>50</locationX>
        <locationY>50</locationY>
    </start>
</Flow>
EOF

# Deploy test flow
echo "Deploying test flow..."
if sf project deploy start --source-dir "$TEST_FLOW_DIR/flows" --target-org "$ORG_ALIAS" --wait 10 > /dev/null 2>&1; then
    log_test "Test flow deployment" "PASS" "Flow deployed successfully"
    
    # Verify flow exists
    FLOW_EXISTS=$(sf data query --query "SELECT Id FROM Flow WHERE Definition.DeveloperName = '$TEST_FLOW_NAME' AND Status != 'Obsolete'" --use-tooling-api --target-org "$ORG_ALIAS" --json 2>/dev/null | grep -c "\"totalSize\":1" || echo "0")
    
    if [ "$FLOW_EXISTS" = "1" ]; then
        log_test "Test flow verification" "PASS" "Flow exists in org"
    else
        log_test "Test flow verification" "FAIL" "Flow not found in org"
    fi
else
    log_test "Test flow deployment" "FAIL" "Could not deploy test flow"
fi

echo ""

# Test 4: Test deactivation
echo "Test 4: Testing flow deactivation..."
echo "----------------------------------------"

if node "$LIB_DIR/flow-deactivator.js" --flow "$TEST_FLOW_NAME" --org "$ORG_ALIAS" > /dev/null 2>&1; then
    log_test "Flow deactivation command" "PASS" "Deactivation completed"
    
    # Verify deactivation
    sleep 3
    FLOW_STATUS=$(sf data query --query "SELECT Status FROM Flow WHERE Definition.DeveloperName = '$TEST_FLOW_NAME' ORDER BY VersionNumber DESC LIMIT 1" --use-tooling-api --target-org "$ORG_ALIAS" --json 2>/dev/null | grep -o '"Status":"[^"]*"' | cut -d'"' -f4 || echo "ERROR")
    
    if [ "$FLOW_STATUS" = "Inactive" ] || [ "$FLOW_STATUS" = "Draft" ]; then
        log_test "Flow deactivation verification" "PASS" "Flow is $FLOW_STATUS"
    else
        log_test "Flow deactivation verification" "FAIL" "Flow status is $FLOW_STATUS"
    fi
else
    log_test "Flow deactivation command" "FAIL" "Deactivation failed"
fi

echo ""

# Test 5: Test deletion
echo "Test 5: Testing flow deletion..."
echo "----------------------------------------"

if node "$LIB_DIR/flow-removal-manager.js" delete --flow "$TEST_FLOW_NAME" --org "$ORG_ALIAS" --force > /dev/null 2>&1; then
    log_test "Flow deletion command" "PASS" "Deletion completed"
    
    # Verify deletion
    FLOW_DELETED=$(sf data query --query "SELECT Id FROM Flow WHERE Definition.DeveloperName = '$TEST_FLOW_NAME' AND Status != 'Obsolete'" --use-tooling-api --target-org "$ORG_ALIAS" --json 2>/dev/null | grep -c "\"totalSize\":0" || echo "0")
    
    if [ "$FLOW_DELETED" = "1" ]; then
        log_test "Flow deletion verification" "PASS" "Flow removed from org"
    else
        log_test "Flow deletion verification" "FAIL" "Flow still exists in org"
    fi
else
    log_test "Flow deletion command" "FAIL" "Deletion failed"
fi

echo ""

# Test 6: Test complete two-phase removal
echo "Test 6: Testing complete two-phase removal..."
echo "----------------------------------------"

# Create another test flow
TEST_FLOW_NAME_2="${TEST_FLOW_NAME}_Complete"
cat > "$TEST_FLOW_DIR/flows/${TEST_FLOW_NAME_2}.flow-meta.xml" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow for Complete Removal</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Active</status>
    <description>Test flow for complete removal testing</description>
    <start>
        <locationX>50</locationX>
        <locationY>50</locationY>
    </start>
</Flow>
EOF

# Deploy second test flow
if sf project deploy start --source-dir "$TEST_FLOW_DIR/flows" --target-org "$ORG_ALIAS" --wait 10 > /dev/null 2>&1; then
    echo "Second test flow deployed"
    
    # Test complete removal
    if node "$LIB_DIR/flow-removal-manager.js" remove --flow "$TEST_FLOW_NAME_2" --org "$ORG_ALIAS" --force > /dev/null 2>&1; then
        log_test "Complete two-phase removal" "PASS" "Removal completed"
        
        # Verify complete removal
        FLOW_REMOVED=$(sf data query --query "SELECT Id FROM Flow WHERE Definition.DeveloperName = '$TEST_FLOW_NAME_2' AND Status != 'Obsolete'" --use-tooling-api --target-org "$ORG_ALIAS" --json 2>/dev/null | grep -c "\"totalSize\":0" || echo "0")
        
        if [ "$FLOW_REMOVED" = "1" ]; then
            log_test "Complete removal verification" "PASS" "Flow fully removed"
        else
            log_test "Complete removal verification" "FAIL" "Flow still exists"
        fi
    else
        log_test "Complete two-phase removal" "FAIL" "Removal failed"
    fi
else
    log_test "Second test flow deployment" "FAIL" "Could not deploy second test flow"
fi

echo ""

# Test 7: Test wrapper remove command
echo "Test 7: Testing deployment wrapper remove command..."
echo "----------------------------------------"

# Create third test flow
TEST_FLOW_NAME_3="${TEST_FLOW_NAME}_Wrapper"
cat > "$TEST_FLOW_DIR/flows/${TEST_FLOW_NAME_3}.flow-meta.xml" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Test Flow for Wrapper Removal</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Active</status>
    <description>Test flow for wrapper removal testing</description>
    <start>
        <locationX>50</locationX>
        <locationY>50</locationY>
    </start>
</Flow>
EOF

# Deploy third test flow
if sf project deploy start --source-dir "$TEST_FLOW_DIR/flows" --target-org "$ORG_ALIAS" --wait 10 > /dev/null 2>&1; then
    echo "Third test flow deployed"
    
    # Test wrapper remove command
    if node "$LIB_DIR/flow-deployment-wrapper.js" remove --flow "$TEST_FLOW_NAME_3" --org "$ORG_ALIAS" --force > /dev/null 2>&1; then
        log_test "Wrapper remove command" "PASS" "Removal via wrapper completed"
    else
        log_test "Wrapper remove command" "FAIL" "Wrapper removal failed"
    fi
else
    log_test "Third test flow deployment" "FAIL" "Could not deploy third test flow"
fi

echo ""

# Cleanup
echo "Cleaning up test files..."
rm -rf "$TEST_FLOW_DIR"

# Summary
echo ""
echo "================================================"
echo " Test Summary"
echo "================================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ All tests passed!${NC}"
    echo "The two-phase flow removal system is working correctly."
    EXIT_CODE=0
else
    echo -e "\n${RED}✗ Some tests failed.${NC}"
    echo "Please review the failures above and check the logs at: $TEST_RESULTS_FILE"
    EXIT_CODE=1
fi

echo ""
echo "Test results saved to: $TEST_RESULTS_FILE"
echo ""

# Additional validation tips
if [ $TESTS_FAILED -gt 0 ]; then
    echo "${YELLOW}Troubleshooting Tips:${NC}"
    echo "1. Verify Salesforce CLI is authenticated: sf org display --target-org $ORG_ALIAS"
    echo "2. Check user permissions for flow management"
    echo "3. Ensure all script files have execute permissions"
    echo "4. Review the detailed logs at: $TEST_RESULTS_FILE"
    echo "5. Try running individual commands with verbose output"
fi

exit $EXIT_CODE