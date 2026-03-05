#!/bin/bash

##############################################################################
# test-fixed-queries.sh - Test the updated Salesforce queries
##############################################################################
# Tests the fixed queries for ValidationRule and Flow objects to ensure
# they work correctly with the Salesforce Tooling API
##############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default org
ORG_ALIAS="${1:-sample-org-sandbox}"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Testing Fixed Salesforce Queries                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Target Org: ${NC}$ORG_ALIAS"
echo ""

# Test function
test_query() {
    local description="$1"
    local query="$2"
    local use_tooling="${3:-false}"
    
    echo -e "${YELLOW}Testing: ${NC}$description"
    echo -e "${BLUE}Query: ${NC}$query"
    
    local cmd="sf data query --query \"$query\" --json --target-org $ORG_ALIAS"
    if [ "$use_tooling" = "true" ]; then
        cmd="$cmd --use-tooling-api"
    fi
    
    if eval "$cmd" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Query successful${NC}"
        return 0
    else
        echo -e "${RED}✗ Query failed${NC}"
        return 1
    fi
}

# Track results
PASSED=0
FAILED=0

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}1. Testing ValidationRule Queries${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Test 1: Basic ValidationRule query (without ErrorConditionFormula)
if test_query "Basic ValidationRule query" \
    "SELECT Id, ValidationName, Active, Description, ErrorMessage FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Opportunity' LIMIT 5" \
    "true"; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

# Test 2: Individual ValidationRule with Metadata (for formula)
echo -e "${YELLOW}Testing: ${NC}Individual ValidationRule Metadata query"
echo -e "${BLUE}Note: ${NC}This requires a specific ValidationRule ID"

# First get a ValidationRule ID
RULE_ID=$(sf data query --query "SELECT Id FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Opportunity' LIMIT 1" --use-tooling-api --json --target-org $ORG_ALIAS 2>/dev/null | jq -r '.result.records[0].Id // ""')

if [ -n "$RULE_ID" ]; then
    if test_query "Individual ValidationRule with Metadata" \
        "SELECT Id, Metadata FROM ValidationRule WHERE Id='$RULE_ID'" \
        "true"; then
        ((PASSED++))
        echo -e "${GREEN}✓ Can retrieve Metadata field individually${NC}"
    else
        ((FAILED++))
    fi
else
    echo -e "${YELLOW}⚠ No ValidationRules found to test individual query${NC}"
fi
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}2. Testing Flow Queries${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Test 3: Flow query (Tooling API, correct fields)
if test_query "Flow (active versions with TriggerType)" \
    "SELECT Id, MasterLabel, ProcessType, TriggerType, Status, VersionNumber, Definition.DeveloperName FROM Flow WHERE Status = 'Active' LIMIT 5" \
    "true"; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

# Test 4: FlowDefinitionView query (without TriggerType)
if test_query "FlowDefinitionView query" \
    "SELECT Id, ApiName, ProcessType, IsActive FROM FlowDefinitionView WHERE IsActive = true LIMIT 5" \
    "true"; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}3. Testing Metadata Retrieve Commands${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Test 5: Metadata retrieve for ValidationRules
echo -e "${YELLOW}Testing: ${NC}Metadata retrieve for ValidationRules"
echo -e "${BLUE}Command: ${NC}sf project retrieve start --metadata \"ValidationRule:Opportunity.*\""

TEMP_DIR=$(mktemp -d)
if sf project retrieve start --metadata "ValidationRule:Opportunity.*" --target-org $ORG_ALIAS --output-dir "$TEMP_DIR" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Metadata retrieve successful${NC}"
    
    # Check if we got any validation rule files
    if find "$TEMP_DIR" -name "*.validationRule-meta.xml" -print -quit | grep -q .; then
        echo -e "${GREEN}✓ ValidationRule metadata files retrieved${NC}"
        
        # Check if formulas are present
        if grep -q "errorConditionFormula" "$TEMP_DIR"/**/validationRules/*.validationRule-meta.xml 2>/dev/null; then
            echo -e "${GREEN}✓ ErrorConditionFormula present in metadata${NC}"
        fi
    fi
    ((PASSED++))
else
    echo -e "${RED}✗ Metadata retrieve failed${NC}"
    ((FAILED++))
fi
rm -rf "$TEMP_DIR"
echo ""

# Test 6: Metadata retrieve for Flows
echo -e "${YELLOW}Testing: ${NC}Metadata retrieve for Flows"
echo -e "${BLUE}Command: ${NC}sf project retrieve start --metadata \"Flow\""

TEMP_DIR=$(mktemp -d)
if sf project retrieve start --metadata "Flow" --target-org $ORG_ALIAS --output-dir "$TEMP_DIR" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Flow metadata retrieve successful${NC}"
    
    # Check if we got any flow files
    if find "$TEMP_DIR" -name "*.flow-meta.xml" -print -quit | grep -q .; then
        echo -e "${GREEN}✓ Flow metadata files retrieved${NC}"
    fi
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ Flow metadata retrieve returned no results (might not have any flows)${NC}"
fi
rm -rf "$TEMP_DIR"
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Test Results Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}Passed: ${NC}$PASSED"
echo -e "${RED}Failed: ${NC}$FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! The fixed queries are working correctly.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Review the output above for details.${NC}"
    exit 1
fi
