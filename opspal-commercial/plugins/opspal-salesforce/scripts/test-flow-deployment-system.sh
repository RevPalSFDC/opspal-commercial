#!/bin/bash

# Test script for the new flow deployment system
# This validates all components work together to prevent duplicate flows

echo "======================================================"
echo "🧪 Flow Deployment System Test Suite"
echo "======================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="$3"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    echo -e "${YELLOW}Test $TESTS_RUN: $test_name${NC}"
    
    if eval "$test_command"; then
        if [ "$expected_result" = "pass" ]; then
            echo -e "${GREEN}✅ PASSED${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${RED}❌ FAILED (expected to fail but passed)${NC}"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        if [ "$expected_result" = "fail" ]; then
            echo -e "${GREEN}✅ PASSED (correctly failed)${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${RED}❌ FAILED${NC}"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    fi
    echo ""
}

# Check if node is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is required but not installed${NC}"
    exit 1
fi

# Navigate to scripts directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Testing in directory: $SCRIPT_DIR"
echo ""

# Test 1: Flow Discovery Mapper existence
echo "======================================================"
echo "📋 Testing Flow Discovery Mapper"
echo "======================================================"

run_test "Flow Discovery Mapper script exists" \
    "[ -f lib/flow-discovery-mapper.js ]" \
    "pass"

run_test "Flow Discovery Mapper help command" \
    "node lib/flow-discovery-mapper.js 2>&1 | grep -q 'Commands:'" \
    "pass"

# Test 2: Flow Name Standardizer
echo "======================================================"
echo "📋 Testing Flow Name Standardizer"
echo "======================================================"

run_test "Flow Name Standardizer script exists" \
    "[ -f lib/flow-name-standardizer.js ]" \
    "pass"

run_test "Convert label to DeveloperName" \
    "node lib/flow-name-standardizer.js convert --label 'Opp: Contract Generation' 2>&1 | grep -q 'Opp_Contract_Generation'" \
    "pass"

run_test "Reverse DeveloperName to label" \
    "node lib/flow-name-standardizer.js reverse --name 'Opp_Contract_Generation_v2' 2>&1 | grep -q 'Contract Generation'" \
    "pass"

# Test 3: Flow Deployment Wrapper
echo "======================================================"
echo "📋 Testing Flow Deployment Wrapper"
echo "======================================================"

run_test "Flow Deployment Wrapper script exists" \
    "[ -f lib/flow-deployment-wrapper.js ]" \
    "pass"

run_test "Flow Deployment Wrapper help command" \
    "node lib/flow-deployment-wrapper.js 2>&1 | grep -q 'Usage:'" \
    "pass"

# Test 4: Enhanced Validation Script
echo "======================================================"
echo "📋 Testing Enhanced Validation Script"
echo "======================================================"

run_test "Enhanced validation script exists" \
    "[ -f lib/validate_and_deploy_flow.py ]" \
    "pass"

run_test "Python script has discovery function" \
    "grep -q 'discover_existing_flow' lib/validate_and_deploy_flow.py" \
    "pass"

# Test 5: Documentation
echo "======================================================"
echo "📋 Testing Documentation"
echo "======================================================"

run_test "Flow deployment checklist exists" \
    "[ -f ../docs/FLOW_DEPLOYMENT_CHECKLIST.md ]" \
    "pass"

run_test "CLAUDE.md has flow deployment protocol" \
    "grep -q 'Flow Deployment Protocol' ../CLAUDE.md" \
    "pass"

# Test 6: Integration Test (if test flow exists)
echo "======================================================"
echo "📋 Testing Integration (if test data available)"
echo "======================================================"

TEST_FLOW="../force-app/main/default/flows/Test_Flow.flow-meta.xml"

if [ -f "$TEST_FLOW" ]; then
    run_test "Validate test flow file" \
        "node lib/flow-discovery-mapper.js validate --file '$TEST_FLOW' --org test 2>&1 | grep -q 'valid'" \
        "pass"
else
    echo "ℹ️ Skipping integration test - no test flow file found"
    echo "  Create $TEST_FLOW to enable this test"
fi

# Test 7: Check for common issues
echo "======================================================"
echo "📋 Testing Common Issue Detection"
echo "======================================================"

# Create a temporary test flow with problematic naming
TEMP_FLOW="${TEMP_DIR:-/tmp}"
cat > "$TEMP_FLOW" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>Test: Flow With Colon</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Draft</status>
</Flow>
EOF

run_test "Detect problematic flow naming" \
    "node lib/flow-name-standardizer.js analyze --file '$TEMP_FLOW' 2>&1 | grep -q 'Test_Flow_With_Colon'" \
    "pass"

# Clean up
rm -f "$TEMP_FLOW"

# Summary
echo "======================================================"
echo "📊 Test Summary"
echo "======================================================"
echo "Tests Run: $TESTS_RUN"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ All tests passed! Flow deployment system is ready.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run discovery on your org: node lib/flow-discovery-mapper.js discover --org [your-org]"
    echo "2. Check existing flows for naming issues: node lib/flow-name-standardizer.js scan"
    echo "3. Use the deployment wrapper for all flow deployments"
    exit 0
else
    echo ""
    echo -e "${RED}❌ Some tests failed. Please review and fix issues.${NC}"
    exit 1
fi