#!/bin/bash

################################################################################
# Quote Segment Pricing Solution Deployment Script
# 
# Deploys the Quote validation rule resolution for segment-based pricing
# Target: Salesforce Sandbox/Production
################################################################################

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
METADATA_DIR="${PROJECT_ROOT}/force-app/main/default"
TARGET_ORG="${1:-example-company-sandbox}"
VALIDATE_ONLY="${2:-false}"

echo -e "${BLUE}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE} Quote Segment Pricing Solution Deployment${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Target Org: ${TARGET_ORG}"
echo "Validate Only: ${VALIDATE_ONLY}"
echo "Metadata Directory: ${METADATA_DIR}"
echo ""

# Function to check if org is authenticated
check_auth() {
    echo -e "${YELLOW}🔐 Checking authentication...${NC}"
    if sf org display --target-org "$TARGET_ORG" &>/dev/null; then
        echo -e "${GREEN}✅ Authenticated to ${TARGET_ORG}${NC}"
    else
        echo -e "${RED}❌ Not authenticated to ${TARGET_ORG}${NC}"
        echo -e "${YELLOW}Please run: sf org login web --alias ${TARGET_ORG}${NC}"
        exit 1
    fi
}

# Function to validate metadata
validate_metadata() {
    echo -e "${YELLOW}🔍 Validating metadata structure...${NC}"
    
    local missing_files=0
    
    # Check for rollup fields
    for field in "Total_List_Price_ARR__c" "Total_Extended_ARR__c" "Total_Target_ARR__c" "Segment_Count__c" "Has_Segment_Pricing__c"; do
        if [[ ! -f "${METADATA_DIR}/objects/Quote/fields/${field}.field-meta.xml" ]]; then
            echo -e "${RED}  ❌ Missing: Quote.${field}${NC}"
            ((missing_files++))
        else
            echo -e "${GREEN}  ✅ Found: Quote.${field}${NC}"
        fi
    done
    
    # Check validation rules
    for rule in "Pricing_Required_Before_Set_As_Primary" "Quote_Segment_Pricing_Complete"; do
        if [[ ! -f "${METADATA_DIR}/objects/Quote/validationRules/${rule}.validationRule-meta.xml" ]]; then
            echo -e "${YELLOW}  ⚠️  Missing: ${rule} validation rule${NC}"
        else
            echo -e "${GREEN}  ✅ Found: ${rule} validation rule${NC}"
        fi
    done
    
    # Check flows
    for flow in "Quote_Pre_Submission_Validator" "Quote_Field_Auto_Population"; do
        if [[ ! -f "${METADATA_DIR}/flows/${flow}.flow-meta.xml" ]]; then
            echo -e "${YELLOW}  ⚠️  Missing: ${flow} flow${NC}"
        else
            echo -e "${GREEN}  ✅ Found: ${flow} flow${NC}"
        fi
    done
    
    if [[ $missing_files -gt 0 ]]; then
        echo -e "${RED}❌ Metadata validation failed. Missing ${missing_files} required files.${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ All required metadata files found${NC}"
    fi
}

# Function to deploy metadata
deploy_metadata() {
    local deploy_type="$1"
    
    echo -e "${YELLOW}🚀 Starting deployment (${deploy_type})...${NC}"
    
    # Build deployment command
    local deploy_cmd="sf project deploy start"
    deploy_cmd="${deploy_cmd} --source-dir ${METADATA_DIR}"
    deploy_cmd="${deploy_cmd} --target-org ${TARGET_ORG}"
    deploy_cmd="${deploy_cmd} --wait 30"
    
    if [[ "${deploy_type}" == "validate" ]]; then
        deploy_cmd="${deploy_cmd} --dry-run"
        deploy_cmd="${deploy_cmd} --test-level RunLocalTests"
    fi
    
    echo -e "${BLUE}Executing: ${deploy_cmd}${NC}"
    echo ""
    
    if eval "${deploy_cmd}"; then
        echo -e "${GREEN}✅ Deployment ${deploy_type} successful!${NC}"
        return 0
    else
        echo -e "${RED}❌ Deployment ${deploy_type} failed${NC}"
        return 1
    fi
}

# Function to run post-deployment tests
run_tests() {
    echo -e "${YELLOW}🧪 Running post-deployment validation...${NC}"
    
    # Query to verify rollup fields exist
    local query="SELECT Id, Name, Total_List_Price_ARR__c, Segment_Count__c, Has_Segment_Pricing__c FROM Quote LIMIT 1"
    
    if sf data query --query "${query}" --target-org "${TARGET_ORG}" &>/dev/null; then
        echo -e "${GREEN}  ✅ Rollup fields verified${NC}"
    else
        echo -e "${YELLOW}  ⚠️  Could not verify rollup fields${NC}"
    fi
    
    # Check if flows are active
    local flow_query="SELECT Id, ApiName, Label, IsActive FROM FlowDefinitionView WHERE Label LIKE 'Quote%' AND IsActive = true"
    
    echo -e "${BLUE}  Checking active flows...${NC}"
    sf data query --query "${flow_query}" --target-org "${TARGET_ORG}" --result-format table 2>/dev/null || true
}

# Main execution
main() {
    echo -e "${BLUE}Starting deployment process...${NC}"
    echo ""
    
    # Step 1: Authentication
    check_auth
    echo ""
    
    # Step 2: Validate metadata
    validate_metadata
    echo ""
    
    # Step 3: Deploy or validate
    if [[ "${VALIDATE_ONLY}" == "true" ]]; then
        echo -e "${YELLOW}Running validation only (no deployment)${NC}"
        deploy_metadata "validate"
    else
        echo -e "${YELLOW}Running full deployment${NC}"
        
        # Validation first
        echo -e "${BLUE}Step 1/2: Validation${NC}"
        if deploy_metadata "validate"; then
            echo ""
            echo -e "${BLUE}Step 2/2: Deployment${NC}"
            deploy_metadata "deploy"
            
            # Post-deployment tests
            echo ""
            run_tests
        else
            echo -e "${RED}Validation failed. Deployment cancelled.${NC}"
            exit 1
        fi
    fi
    
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN} Deployment Complete!${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Next Steps:"
    echo "1. Test Quote creation with segments in ${TARGET_ORG}"
    echo "2. Verify validation rules work correctly"
    echo "3. Test flows for auto-population"
    echo "4. Review test scenarios in docs/QUOTE_SEGMENT_PRICING_TEST_SCENARIOS.md"
}

# Run main function
main
