#!/bin/bash

# Integration Test for Phase 3 - Content Optimization Orchestrated Workflow
# Tests the full workflow where multiple scripts work together

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Test directories
TEST_DIR=".test-results/integration"
mkdir -p "$TEST_DIR"

# Helper functions
pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  PASSED=$((PASSED + 1))
}

fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  FAILED=$((FAILED + 1))
}

info() {
  echo -e "${BLUE}ℹ INFO${NC}: $1"
}

header() {
  echo
  echo -e "${YELLOW}========================================${NC}"
  echo -e "${YELLOW}$1${NC}"
  echo -e "${YELLOW}========================================${NC}"
}

# [Rest of script continues...]

header "PHASE 3 INTEGRATION TEST"
info "Testing orchestrated content optimization workflow - Full pipeline simulation"

# Create minimal test to verify workflow
header "Integration Test: Sequential Script Execution"

# Test sequential execution of all 5 scripts
if [ -f "$TEST_DIR/../phase3/mock-content.html" ] && \
   [ -f "$TEST_DIR/../phase3/mock-crawl.json" ] && \
   [ -f "$TEST_DIR/../phase3/mock-keywords.json" ] && \
   [ -f "$TEST_DIR/../phase3/mock-gaps.json" ]; then
  
  # Use existing mock data from unit tests
  info "Using mock data from unit tests"
  
  # Test 1: Sequential execution
  node scripts/lib/seo-content-scorer.js "$TEST_DIR/../phase3/mock-content.html" --format html --output "$TEST_DIR/int1-score.json" > /dev/null 2>&1 && \
  node scripts/lib/seo-readability-analyzer.js "$TEST_DIR/../phase3/mock-content.html" --format html --output "$TEST_DIR/int2-readability.json" > /dev/null 2>&1 && \
  node scripts/lib/seo-aeo-optimizer.js "$TEST_DIR/../phase3/mock-content.html" --format html --output "$TEST_DIR/int3-aeo.json" > /dev/null 2>&1 && \
  node scripts/lib/seo-internal-linking-suggestor.js "$TEST_DIR/../phase3/mock-crawl.json" --output "$TEST_DIR/int4-linking.json" > /dev/null 2>&1 && \
  node scripts/lib/seo-content-recommender.js --keywords "$TEST_DIR/../phase3/mock-keywords.json" --gap-analysis "$TEST_DIR/../phase3/mock-gaps.json" --crawl "$TEST_DIR/../phase3/mock-crawl.json" --output "$TEST_DIR/int5-recommendations.json" > /dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    pass "All 5 scripts executed sequentially without errors"
  else
    fail "Sequential execution failed"
  fi
  
  # Test 2: Verify all outputs exist
  if [ -f "$TEST_DIR/int1-score.json" ] && \
     [ -f "$TEST_DIR/int2-readability.json" ] && \
     [ -f "$TEST_DIR/int3-aeo.json" ] && \
     [ -f "$TEST_DIR/int4-linking.json" ] && \
     [ -f "$TEST_DIR/int5-recommendations.json" ]; then
    pass "All output files generated successfully"
  else
    fail "Not all output files were generated"
  fi
  
  # Test 3: Verify JSON validity
  INVALID_JSON=0
  for file in "$TEST_DIR"/int*.json; do
    if ! jq empty "$file" 2>/dev/null; then
      INVALID_JSON=1
    fi
  done
  
  if [ $INVALID_JSON -eq 0 ]; then
    pass "All outputs are valid JSON"
  else
    fail "Some outputs contain invalid JSON"
  fi
  
  # Test 4: Parallel execution (simulating orchestrator coordination)
  info "Testing parallel execution..."
  (
    node scripts/lib/seo-content-scorer.js "$TEST_DIR/../phase3/mock-content.html" --format html --output "$TEST_DIR/parallel1.json" > /dev/null 2>&1 &
    node scripts/lib/seo-readability-analyzer.js "$TEST_DIR/../phase3/mock-content.html" --format html --output "$TEST_DIR/parallel2.json" > /dev/null 2>&1 &
    node scripts/lib/seo-aeo-optimizer.js "$TEST_DIR/../phase3/mock-content.html" --format html --output "$TEST_DIR/parallel3.json" > /dev/null 2>&1 &
    wait
  )
  
  if [ -f "$TEST_DIR/parallel1.json" ] && [ -f "$TEST_DIR/parallel2.json" ] && [ -f "$TEST_DIR/parallel3.json" ]; then
    pass "Parallel execution completed without conflicts"
  else
    fail "Parallel execution failed"
  fi
  
else
  fail "Mock data from unit tests not found - run test-phase3.sh first"
fi

header "TEST SUMMARY"
echo
echo "Total Tests:  $((PASSED + FAILED))"
echo -e "${GREEN}Passed:       $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Failed:       $FAILED${NC}"
fi

echo
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}✅ ALL INTEGRATION TESTS PASSED${NC}"
  echo -e "${GREEN}========================================${NC}"
  exit 0
else
  echo -e "${RED}========================================${NC}"
  echo -e "${RED}❌ SOME INTEGRATION TESTS FAILED${NC}"
  echo -e "${RED}========================================${NC}"
  exit 1
fi
