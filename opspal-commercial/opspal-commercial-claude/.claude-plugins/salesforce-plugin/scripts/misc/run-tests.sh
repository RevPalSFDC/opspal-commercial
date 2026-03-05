#!/bin/bash

# Gate Validation Test Runner
# ============================
# Convenient script for running various test scenarios

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test type from argument
TEST_TYPE=${1:-all}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Gate Validation Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to run tests with nice output
run_test() {
    local test_name=$1
    local test_command=$2
    
    echo -e "${YELLOW}Running: ${test_name}${NC}"
    echo "Command: ${test_command}"
    echo "----------------------------------------"
    
    if eval "${test_command}"; then
        echo -e "${GREEN}✅ ${test_name} PASSED${NC}"
    else
        echo -e "${RED}❌ ${test_name} FAILED${NC}"
        exit 1
    fi
    echo ""
}

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo ""
fi

# Clean previous test artifacts
echo -e "${YELLOW}Cleaning previous test artifacts...${NC}"
rm -rf coverage test-results temp .rollback/snapshots deployment-logs
echo ""

case $TEST_TYPE in
    all)
        echo -e "${BLUE}Running ALL tests...${NC}"
        run_test "Complete Test Suite" "npm test"
        ;;
    
    unit)
        echo -e "${BLUE}Running UNIT tests...${NC}"
        run_test "Unit Tests" "npm run test:unit"
        ;;
    
    integration)
        echo -e "${BLUE}Running INTEGRATION tests...${NC}"
        run_test "Integration Tests" "npm run test:integration"
        ;;
    
    gates)
        echo -e "${BLUE}Running GATE tests...${NC}"
        run_test "Deployment Bridge Gates" "npm run test:gates"
        ;;
    
    policies)
        echo -e "${BLUE}Running POLICY tests...${NC}"
        run_test "Policy Loader" "npm run test:policies"
        ;;
    
    workflow)
        echo -e "${BLUE}Running WORKFLOW tests...${NC}"
        run_test "Gate Workflow" "npm run test:workflow"
        ;;
    
    coverage)
        echo -e "${BLUE}Running tests with COVERAGE...${NC}"
        run_test "Coverage Report" "npm run test:coverage"
        echo -e "${GREEN}Coverage report available at: coverage/index.html${NC}"
        ;;
    
    quick)
        echo -e "${BLUE}Running QUICK smoke tests...${NC}"
        # Run just the most critical tests
        run_test "Gate Smoke Test" "jest tests/unit/deployment-bridge.test.js -t 'should pass all checks for valid sandbox deployment'"
        run_test "Policy Smoke Test" "jest tests/unit/policy-loader.test.js -t 'should load all policy files'"
        run_test "Integration Smoke Test" "jest tests/integration/gate-workflow.test.js -t 'should pass through all gates'"
        ;;
    
    watch)
        echo -e "${BLUE}Starting test WATCH mode...${NC}"
        npm run test:watch
        ;;
    
    debug)
        echo -e "${BLUE}Running tests in DEBUG mode...${NC}"
        DEBUG=true npm test -- --detectOpenHandles
        ;;
    
    validate)
        echo -e "${BLUE}Validating test environment...${NC}"
        
        # Check Node version
        echo -n "Node.js version: "
        node --version
        
        # Check npm version
        echo -n "npm version: "
        npm --version
        
        # Check Jest installation
        echo -n "Jest version: "
        npx jest --version
        
        # Check test files exist
        echo ""
        echo "Test files found:"
        find tests -name "*.test.js" -type f | head -10
        
        # Check policies exist
        echo ""
        echo "Policy files:"
        ls -la config/policies/ 2>/dev/null || echo "No policies found - will use mocks"
        
        echo ""
        echo -e "${GREEN}✅ Test environment validated${NC}"
        ;;
    
    help|--help|-h)
        echo "Usage: ./run-tests.sh [TEST_TYPE]"
        echo ""
        echo "TEST_TYPE options:"
        echo "  all         - Run all tests (default)"
        echo "  unit        - Run unit tests only"
        echo "  integration - Run integration tests only"
        echo "  gates       - Run deployment bridge gate tests"
        echo "  policies    - Run policy loader tests"
        echo "  workflow    - Run gate workflow tests"
        echo "  coverage    - Run tests with coverage report"
        echo "  quick       - Run quick smoke tests"
        echo "  watch       - Start test watch mode"
        echo "  debug       - Run tests in debug mode"
        echo "  validate    - Validate test environment"
        echo "  help        - Show this help message"
        echo ""
        echo "Examples:"
        echo "  ./run-tests.sh              # Run all tests"
        echo "  ./run-tests.sh unit         # Run unit tests only"
        echo "  ./run-tests.sh coverage     # Generate coverage report"
        echo "  ./run-tests.sh quick        # Quick smoke test"
        ;;
    
    *)
        echo -e "${RED}Unknown test type: ${TEST_TYPE}${NC}"
        echo "Run './run-tests.sh help' for usage information"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  Test run complete!${NC}"
echo -e "${BLUE}========================================${NC}"