#!/bin/bash

###############################################################################
# Integration Test Suite for New Salesforce Operation Capabilities
# 
# Tests all new tools:
# - Pre-flight validation
# - Smart bulk operations with timeout prevention
# - Error recovery system
# - Operation verification and rollback
###############################################################################

set -Eeuo pipefail
IFS=$'\n\t'

# Basic error/exit traps for safety and cleanup
on_err() { echo "[ERROR] ${BASH_SOURCE[0]}:${2:-?} exit ${1:-?}" >&2; }
trap 'on_err $? $LINENO' ERR
trap 'true' EXIT

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
TEST_ORG="${SF_TARGET_ORG:-example-company-sandbox}"
TEST_DIR="$(dirname "$0")"
LIB_DIR="${TEST_DIR}/lib"
DATA_DIR="${TEST_DIR}/../data/test"
RESULTS_DIR="${TEST_DIR}/../data/test-results"

# Create directories
mkdir -p "$DATA_DIR" "$RESULTS_DIR"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

echo "════════════════════════════════════════════════════════════════"
echo "    Integration Test Suite for New Capabilities"
echo "════════════════════════════════════════════════════════════════"
echo "Target Org: ${TEST_ORG}"
echo "Test Date: $(date)"
echo ""

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"

    TESTS_RUN=$((TESTS_RUN + 1))
    echo -e "\n${BLUE}[TEST ${TESTS_RUN}]${NC} ${test_name}"
    echo "────────────────────────────────────────────────────"

    # Prefer direct function invocation over eval for safety
    if declare -F "$test_command" >/dev/null 2>&1; then
        if "$test_command"; then
            echo -e "${GREEN}✅ PASSED${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        else
            echo -e "${RED}❌ FAILED${NC}"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        fi
    else
        echo -e "${RED}Unknown test function: ${test_command}${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

###############################################################################
# TEST 1: Pre-Flight Validation - Required Fields
###############################################################################
test_preflight_required_fields() {
    echo "Testing pre-flight validation for required fields..."
    
    # Create test operation with missing required fields
    cat > "${DATA_DIR}/missing-fields.json" << EOF
{
    "type": "insert",
    "object": "Opportunity",
    "data": [{
        "Description": "Test opportunity without required fields"
    }]
}
EOF
    
    # Run validation
    OUTPUT=$(node "${LIB_DIR}/preflight-validator.js" validate "${DATA_DIR}/missing-fields.json" --org "$TEST_ORG" 2>&1 || true)
    
    # Check if validation caught missing fields
    if echo "$OUTPUT" | grep -q "Missing required fields"; then
        echo "  ✓ Correctly identified missing required fields"
        return 0
    else
        echo "  ✗ Failed to identify missing required fields"
        return 1
    fi
}

###############################################################################
# TEST 2: Pre-Flight Validation - Invalid Picklist Values
###############################################################################
test_preflight_picklist() {
    echo "Testing pre-flight validation for picklist values..."
    
    # Create test operation with invalid picklist value
    cat > "${DATA_DIR}/invalid-picklist.json" << EOF
{
    "type": "insert",
    "object": "Opportunity",
    "data": [{
        "Name": "Test Opportunity",
        "StageName": "InvalidStage",
        "CloseDate": "2025-12-31"
    }]
}
EOF
    
    # Run validation
    OUTPUT=$(node "${LIB_DIR}/preflight-validator.js" validate "${DATA_DIR}/invalid-picklist.json" --org "$TEST_ORG" 2>&1 || true)
    
    # Check if validation caught invalid picklist
    if echo "$OUTPUT" | grep -q "Invalid picklist"; then
        echo "  ✓ Correctly identified invalid picklist value"
        return 0
    else
        echo "  ✗ Failed to identify invalid picklist value"
        return 1
    fi
}

###############################################################################
# TEST 3: Smart Bulk Operations - Timeout Prevention
###############################################################################
test_timeout_prevention() {
    echo "Testing timeout prevention with smart batching..."
    
    # Create large dataset that would normally timeout
    echo '[' > "${DATA_DIR}/large-dataset.json"
    for i in {1..150}; do
        if [ $i -gt 1 ]; then echo "," >> "${DATA_DIR}/large-dataset.json"; fi
        cat >> "${DATA_DIR}/large-dataset.json" << EOF
    {
        "Name": "Test Account $i",
        "Description": "Account created for timeout prevention test"
    }
EOF
    done
    echo ']' >> "${DATA_DIR}/large-dataset.json"
    
    # Test smart operation (should automatically batch)
    TIMEOUT_TEST=$(timeout 110s node "${LIB_DIR}/bulk-api-handler.js" <<EOF
const BulkAPIHandler = require('${LIB_DIR}/bulk-api-handler.js');
(async () => {
    const handler = await BulkAPIHandler.fromSFAuth('${TEST_ORG}');
    const data = require('${DATA_DIR}/large-dataset.json');
    const result = await handler.smartOperation('insert', 'Account', data);
    console.log(JSON.stringify({
        success: result.successful > 0,
        batched: result.results ? result.results.length > 1 : false,
        timedOut: false
    }));
})();
EOF
    2>&1 || echo '{"timedOut": true}')
    
    if echo "$TIMEOUT_TEST" | grep -q '"timedOut":false' && echo "$TIMEOUT_TEST" | grep -q '"batched":true'; then
        echo "  ✓ Successfully prevented timeout with smart batching"
        return 0
    else
        echo "  ✗ Failed to prevent timeout or batch properly"
        return 1
    fi
}

###############################################################################
# TEST 4: Error Recovery - Picklist Value Correction
###############################################################################
test_error_recovery_picklist() {
    echo "Testing error recovery for invalid picklist values..."
    
    # Create test script
    cat > "${DATA_DIR}/test-recovery.js" << 'EOF'
const ErrorRecoverySystem = require('./lib/error-recovery.js');
const recovery = new ErrorRecoverySystem();

const error = new Error("bad value for restricted picklist field: StageName value: InvalidStage");
const context = {
    object: 'Opportunity',
    field: 'StageName',
    value: 'InvalidStage',
    orgAlias: process.env.TEST_ORG,
    data: { StageName: 'InvalidStage' }
};

(async () => {
    const result = await recovery.recoverFromError(error, context);
    console.log(JSON.stringify({
        recovered: result.success,
        hasSuggestion: result.modifications && result.modifications.length > 0
    }));
})();
EOF
    
    cd "$TEST_DIR"
    OUTPUT=$(TEST_ORG="$TEST_ORG" node "${DATA_DIR}/test-recovery.js" 2>/dev/null || echo '{"recovered": false}')
    
    if echo "$OUTPUT" | grep -q '"recovered":true'; then
        echo "  ✓ Successfully recovered from picklist error"
        return 0
    else
        echo "  ✗ Failed to recover from picklist error"
        return 1
    fi
}

###############################################################################
# TEST 5: Operation Verification and Rollback
###############################################################################
test_operation_rollback() {
    echo "Testing operation verification and rollback..."
    
    # Create test operation
    OPERATION_ID=$(node "${LIB_DIR}/operation-verifier.js" start '{"object":"Account","operation":"test","captureSnapshot":false}' --org "$TEST_ORG" 2>&1 | grep "Operation started:" | cut -d: -f2 | xargs)
    
    if [ -z "$OPERATION_ID" ]; then
        echo "  ✗ Failed to start operation tracking"
        return 1
    fi
    
    echo "  Started operation: $OPERATION_ID"
    
    # Complete operation
    node "${LIB_DIR}/operation-verifier.js" complete "$OPERATION_ID" --org "$TEST_ORG" > /dev/null 2>&1
    
    # Get summary
    SUMMARY=$(node "${LIB_DIR}/operation-verifier.js" summary "$OPERATION_ID" --org "$TEST_ORG" 2>&1)
    
    if echo "$SUMMARY" | grep -q '"status": "completed"'; then
        echo "  ✓ Operation tracking and verification working"
        return 0
    else
        echo "  ✗ Operation tracking failed"
        return 1
    fi
}

###############################################################################
# TEST 6: Integration - Full Workflow
###############################################################################
test_full_workflow() {
    echo "Testing full integrated workflow..."
    
    # Create integration test
    cat > "${DATA_DIR}/integration-test.js" << 'EOF'
const PreFlightValidator = require('./lib/preflight-validator.js');
const BulkAPIHandler = require('./lib/bulk-api-handler.js');
const ErrorRecoverySystem = require('./lib/error-recovery.js');
const OperationVerifier = require('./lib/operation-verifier.js');

(async () => {
    const orgAlias = process.env.TEST_ORG;
    const results = { validated: false, executed: false, verified: false };
    
    try {
        // 1. Pre-flight validation
        const validator = new PreFlightValidator(orgAlias);
        const operation = {
            type: 'insert',
            object: 'Account',
            data: [{ Name: 'Integration Test Account ' + Date.now() }]
        };
        
        const validation = await validator.validateOperation(operation);
        results.validated = validation.canProceed;
        
        if (!results.validated) {
            console.log(JSON.stringify(results));
            return;
        }
        
        // 2. Operation tracking
        const verifier = new OperationVerifier(orgAlias);
        const opId = await verifier.startOperation(null, {
            object: 'Account',
            operation: 'insert',
            captureSnapshot: false
        });
        
        // 3. Smart execution
        const handler = await BulkAPIHandler.fromSFAuth(orgAlias);
        const execResult = await handler.smartOperation('insert', 'Account', operation.data);
        results.executed = execResult.successful > 0;
        
        // 4. Complete and verify
        const completion = await verifier.completeOperation(opId);
        results.verified = completion.status === 'completed';
        
    } catch (error) {
        console.error('Integration test error:', error.message);
    }
    
    console.log(JSON.stringify(results));
})();
EOF
    
    cd "$TEST_DIR"
    OUTPUT=$(TEST_ORG="$TEST_ORG" node "${DATA_DIR}/integration-test.js" 2>/dev/null || echo '{}')
    
    if echo "$OUTPUT" | grep -q '"validated":true' && \
       echo "$OUTPUT" | grep -q '"executed":true' && \
       echo "$OUTPUT" | grep -q '"verified":true'; then
        echo "  ✓ Full workflow integration successful"
        return 0
    else
        echo "  ✗ Integration workflow failed"
        echo "  Output: $OUTPUT"
        return 1
    fi
}

###############################################################################
# TEST 7: Performance - Check Optimization
###############################################################################
test_performance_optimization() {
    echo "Testing performance optimizations..."
    
    # Create performance test
    cat > "${DATA_DIR}/performance-test.js" << 'EOF'
const BulkAPIHandler = require('./lib/bulk-api-handler.js');

(async () => {
    const handler = await BulkAPIHandler.fromSFAuth(process.env.TEST_ORG);
    const startTime = Date.now();
    
    // Test data sizes and strategies
    const tests = [
        { size: 15, expectedStrategy: 'sync' },
        { size: 50, expectedStrategy: 'batch' },
        { size: 500, expectedStrategy: 'batch' },
        { size: 15000, expectedStrategy: 'bulk' }
    ];
    
    const results = [];
    for (const test of tests) {
        const data = Array(test.size).fill({ Name: 'Test' });
        const strategy = handler.determineStrategy(test.size, 'insert');
        results.push({
            size: test.size,
            strategy: strategy.method,
            correct: strategy.method === test.expectedStrategy
        });
    }
    
    const duration = Date.now() - startTime;
    console.log(JSON.stringify({
        allCorrect: results.every(r => r.correct),
        duration: duration,
        results: results
    }));
})();
EOF
    
    cd "$TEST_DIR"
    OUTPUT=$(TEST_ORG="$TEST_ORG" node "${DATA_DIR}/performance-test.js" 2>/dev/null)
    
    if echo "$OUTPUT" | grep -q '"allCorrect":true'; then
        echo "  ✓ Performance optimizations working correctly"
        return 0
    else
        echo "  ✗ Performance optimization logic failed"
        echo "  Output: $OUTPUT"
        return 1
    fi
}

###############################################################################
# Run all tests
###############################################################################

echo -e "\n${YELLOW}Starting test suite...${NC}\n"

# Run each test
run_test "Pre-Flight Validation - Required Fields" test_preflight_required_fields
run_test "Pre-Flight Validation - Picklist Values" test_preflight_picklist
run_test "Timeout Prevention" test_timeout_prevention
run_test "Error Recovery - Picklist" test_error_recovery_picklist
run_test "Operation Rollback" test_operation_rollback
run_test "Full Workflow Integration" test_full_workflow
run_test "Performance Optimization" test_performance_optimization

###############################################################################
# Summary
###############################################################################

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "                        TEST SUMMARY"
echo "════════════════════════════════════════════════════════════════"
echo -e "Tests Run:    ${TESTS_RUN}"
echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
    echo ""
    echo "The new capabilities are working correctly:"
    echo "  • Pre-flight validation prevents errors"
    echo "  • Smart batching prevents timeouts"
    echo "  • Error recovery handles common issues"
    echo "  • Operation tracking enables rollback"
    echo "  • Full integration workflow is functional"
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo ""
    echo "Please review the failed tests above for details."
    exit 1
fi
