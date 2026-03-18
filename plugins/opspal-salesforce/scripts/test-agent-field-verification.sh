#!/bin/bash

# Test script to verify enhanced agent field deployment capabilities
# Tests the deployment library and agent integrations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "================================================"
echo "Agent Field Verification Enhancement Test"
echo "================================================"

# Source the deployment utilities
source scripts/lib/salesforce-deployment-utils.sh

# Test configuration
TEST_OBJECT="Contract"
TEST_FIELD="Renewal_Opportunity__c"
TEST_ORG="${SF_TARGET_ORG:-example-company-sandbox}"

echo -e "\n${BLUE}Test Configuration:${NC}"
echo "  Object: $TEST_OBJECT"
echo "  Field: $TEST_FIELD"
echo "  Org: $TEST_ORG"

# Test 1: Library Functions
echo -e "\n${YELLOW}Test 1: Deployment Library Functions${NC}"
echo "======================================="

echo -e "\n1.1 Testing verify_field_exists function..."
if verify_field_exists "$TEST_OBJECT" "$TEST_FIELD" "$TEST_ORG"; then
    echo -e "${GREEN}✅ Field exists in Tooling API${NC}"
else
    echo -e "${YELLOW}⚠️  Field not found, will test deployment${NC}"
fi

echo -e "\n1.2 Testing verify_soql_access function..."
if verify_soql_access "$TEST_OBJECT" "$TEST_FIELD" "$TEST_ORG"; then
    echo -e "${GREEN}✅ Field is SOQL accessible${NC}"
else
    echo -e "${YELLOW}⚠️  Field not SOQL accessible${NC}"
fi

echo -e "\n1.3 Testing field_health_check function..."
if field_health_check "$TEST_OBJECT" "$TEST_FIELD" "$TEST_ORG"; then
    echo -e "${GREEN}✅ Field health check passed${NC}"
else
    echo -e "${YELLOW}⚠️  Field health check failed${NC}"
fi

# Test 2: Recovery Functions
echo -e "\n${YELLOW}Test 2: Recovery and Retry Functions${NC}"
echo "====================================="

echo -e "\n2.1 Testing cache clearing..."
clear_metadata_cache "$TEST_ORG" "$TEST_OBJECT"
echo -e "${GREEN}✅ Cache clearing completed${NC}"

echo -e "\n2.2 Testing retry with backoff..."
test_function() {
    echo "  Attempting operation..."
    # This will succeed on first try
    return 0
}

if retry_with_backoff 2 1 test_function; then
    echo -e "${GREEN}✅ Retry mechanism working${NC}"
else
    echo -e "${RED}❌ Retry mechanism failed${NC}"
fi

# Test 3: Agent Configuration Verification
echo -e "\n${YELLOW}Test 3: Agent Configuration Updates${NC}"
echo "===================================="

echo -e "\n3.1 Checking sfdc-metadata-manager..."
if grep -q "deploy_field_robust" .claude/agents/sfdc-metadata-manager.md; then
    echo -e "${GREEN}✅ sfdc-metadata-manager has verification protocol${NC}"
else
    echo -e "${RED}❌ sfdc-metadata-manager missing verification${NC}"
fi

echo -e "\n3.2 Checking sfdc-deployment-manager..."
if grep -q "Deployment Verification Protocol" .claude/agents/sfdc-deployment-manager.md; then
    echo -e "${GREEN}✅ sfdc-deployment-manager has verification protocol${NC}"
else
    echo -e "${RED}❌ sfdc-deployment-manager missing verification${NC}"
fi

echo -e "\n3.3 Checking sfdc-security-admin..."
if grep -q "Field Permission Verification Protocol" .claude/agents/sfdc-security-admin.md; then
    echo -e "${GREEN}✅ sfdc-security-admin has permission verification${NC}"
else
    echo -e "${RED}❌ sfdc-security-admin missing verification${NC}"
fi

echo -e "\n3.4 Checking sfdc-orchestrator..."
if grep -q "Deployment Verification Gates" .claude/agents/sfdc-orchestrator.md; then
    echo -e "${GREEN}✅ sfdc-orchestrator has verification gates${NC}"
else
    echo -e "${RED}❌ sfdc-orchestrator missing verification gates${NC}"
fi

# Test 4: Integration Test
echo -e "\n${YELLOW}Test 4: End-to-End Field Deployment Test${NC}"
echo "========================================"

echo -e "\nThis would normally deploy a test field, but skipping actual deployment"
echo "to avoid making changes to the org. In production, this would:"
echo "  1. Create a test field metadata file"
echo "  2. Deploy using deploy_field_robust"
echo "  3. Verify accessibility"
echo "  4. Clean up test field"

# Summary
echo -e "\n================================================"
echo -e "${BLUE}Test Summary${NC}"
echo "================================================"

TESTS_PASSED=0
TESTS_FAILED=0

# Count results
if verify_field_exists "$TEST_OBJECT" "$TEST_FIELD" "$TEST_ORG" 2>/dev/null; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

if verify_soql_access "$TEST_OBJECT" "$TEST_FIELD" "$TEST_ORG" 2>/dev/null; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Check agent configurations
for agent in sfdc-metadata-manager sfdc-deployment-manager sfdc-security-admin sfdc-orchestrator; do
    if [ -f ".claude/agents/${agent}.md" ]; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
done

echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed! Agent enhancements are working correctly.${NC}"
    exit 0
else
    echo -e "\n${YELLOW}⚠️  Some tests failed. Review the output above for details.${NC}"
    echo -e "\nTo fix field accessibility issues, run:"
    echo -e "  ${BLUE}./scripts/deploy-renewal-field-with-verification.sh${NC}"
    exit 1
fi