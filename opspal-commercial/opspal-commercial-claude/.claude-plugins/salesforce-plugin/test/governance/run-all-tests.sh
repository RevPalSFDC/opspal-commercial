#!/bin/bash

###############################################################################
# Governance Framework Test Runner
#
# Runs all unit and integration tests for the Agent Governance Framework
#
# Usage: ./test/governance/run-all-tests.sh
#
# Version: 1.0.0
# Created: 2025-10-25
###############################################################################

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test directory
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "AGENT GOVERNANCE FRAMEWORK - TEST SUITE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Track results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test file
run_test() {
    local test_file=$1
    local test_name=$(basename "$test_file" .test.js)

    echo "Running: $test_name"
    echo "─────────────────────────────────────────────────────────────────────"

    if node "$test_file"; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi

    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""
}

# Run all test files
for test_file in "$TEST_DIR"/*.test.js; do
    if [ -f "$test_file" ]; then
        run_test "$test_file"
    fi
done

# Summary
echo "═══════════════════════════════════════════════════════════════════"
echo "TEST SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Total Test Suites: $TOTAL_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✅ All test suites passed ($PASSED_TESTS/$TOTAL_TESTS)${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some test suites failed${NC}"
    echo "  Passed: $PASSED_TESTS"
    echo "  Failed: $FAILED_TESTS"
    echo ""
    exit 1
fi
