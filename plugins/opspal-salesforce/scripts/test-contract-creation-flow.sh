#!/bin/bash

# Comprehensive Contract Creation Flow Test Script
# Target Org: example-company-sandbox
# Purpose: Test and debug the Contract Creation Flow end-to-end

set -euo pipefail

# Configuration
TARGET_ORG="example-company-sandbox"
OUTPUT_DIR="${TEMP_DIR:-/tmp}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEST_REPORT="${OUTPUT_DIR}/contract_flow_test_${TIMESTAMP}.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Test data variables
TEST_ACCOUNT_ID=""
TEST_OPPORTUNITY_ID=""
TEST_CONTRACT_ID=""

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

echo -e "${BLUE}🧪 Contract Creation Flow Comprehensive Test${NC}"
echo -e "${BLUE}==============================================${NC}"
echo "Target Org: $TARGET_ORG"
echo "Test Report: $TEST_REPORT"
echo ""

# Initialize report file
cat > "$TEST_REPORT" << EOF
Contract Creation Flow Test Report
===================================
Generated: $(date)
Target Org: $TARGET_ORG
Test Purpose: Validate Contract Creation Flow functionality and debug issues

EOF

# Function to log both to console and file
log_both() {
    echo -e "$1"
    echo -e "$1" | sed 's/\x1b\[[0-9;]*m//g' >> "$TEST_REPORT"
}

# Function to check if org is authenticated
check_auth() {
    log_both "${YELLOW}🔐 Checking authentication for $TARGET_ORG...${NC}"
    if sf org display --target-org "$TARGET_ORG" &>/dev/null; then
        log_both "${GREEN}✅ Successfully authenticated to $TARGET_ORG${NC}"
        return 0
    else
        log_both "${RED}❌ Not authenticated to $TARGET_ORG${NC}"
        log_both "${YELLOW}Please run: sf org login web --alias $TARGET_ORG --instance-url https://test.salesforce.com${NC}"
        exit 1
    fi
}

# Function to check flow status
check_flow_status() {
    log_both "${BLUE}🔍 STEP 1: FLOW STATUS CHECK${NC}"
    log_both "============================="
    
    log_both "Checking Contract Creation Flow status..."
    
    # Query for flows related to contract creation
    local flow_query="sf data query --use-tooling-api --query \"SELECT Id, DeveloperName, Label, ActiveVersion.VersionNumber FROM FlowDefinition WHERE DeveloperName LIKE '%Contract%' OR DeveloperName LIKE '%contract%' OR Label LIKE '%Contract%'\" --target-org $TARGET_ORG --json"
    
    local flow_result
    if flow_result=$(eval "$flow_query" 2>/dev/null); then
        log_both "Flow query successful"
        echo "$flow_result" | jq -r '.result.records[] | "Flow: \(.Label // .DeveloperName) (\(.DeveloperName)) - Active Version: \(.ActiveVersion.VersionNumber // "-")"' >> "$TEST_REPORT" 2>/dev/null || {
            log_both "Found flows (raw JSON):"
            echo "$flow_result" >> "$TEST_REPORT"
        }
    else
        log_both "${YELLOW}⚠️ Could not query flows directly. Checking via SOQL...${NC}"
        
        # Alternative approach
        sf data query --use-tooling-api --query "SELECT COUNT() FROM FlowDefinition" --target-org "$TARGET_ORG" &>/dev/null && {
            log_both "Flow object is accessible"
        } || {
            log_both "${RED}❌ Cannot access Flow metadata${NC}"
        }
    fi
    
    log_both ""
}

# Function to create test account
create_test_account() {
    log_both "${BLUE}🏢 STEP 2: CREATE TEST ACCOUNT${NC}"
    log_both "=============================="
    
    local account_name="Test Account for Contract Flow ${TIMESTAMP}"
    
    log_both "Creating test account: $account_name"
    
    local create_result
    if create_result=$(sf data create record --sobject Account --values "Name='$account_name' Type='Customer' Industry='Technology'" --target-org "$TARGET_ORG" --json 2>/dev/null); then
        TEST_ACCOUNT_ID=$(echo "$create_result" | jq -r '.result.id' 2>/dev/null || echo "")
        
        if [[ -n "$TEST_ACCOUNT_ID" ]]; then
            log_both "${GREEN}✅ Test account created successfully${NC}"
            log_both "Account ID: $TEST_ACCOUNT_ID"
            log_both "Account Name: $account_name"
        else
            log_both "${RED}❌ Failed to extract account ID from result${NC}"
            return 1
        fi
    else
        log_both "${RED}❌ Failed to create test account${NC}"
        log_both "Error: $create_result"
        return 1
    fi
    
    log_both ""
}

# Function to create test opportunity
create_test_opportunity() {
    log_both "${BLUE}💰 STEP 3: CREATE TEST OPPORTUNITY${NC}"
    log_both "================================="
    
    if [[ -z "$TEST_ACCOUNT_ID" ]]; then
        log_both "${RED}❌ No test account available${NC}"
        return 1
    fi
    
    local opp_name="Test Opportunity for Contract ${TIMESTAMP}"
    local close_date=$(date -d "+30 days" +"%Y-%m-%d")
    
    log_both "Creating test opportunity: $opp_name"
    log_both "Account ID: $TEST_ACCOUNT_ID"
    log_both "Close Date: $close_date"
    
    # Create opportunity in Prospecting stage first
    local create_values="Name='$opp_name' AccountId='$TEST_ACCOUNT_ID' StageName='Prospecting' CloseDate='$close_date' Amount=50000"
    
    local create_result
    if create_result=$(sf data create record --sobject Opportunity --values "$create_values" --target-org "$TARGET_ORG" --json 2>/dev/null); then
        TEST_OPPORTUNITY_ID=$(echo "$create_result" | jq -r '.result.id' 2>/dev/null || echo "")
        
        if [[ -n "$TEST_OPPORTUNITY_ID" ]]; then
            log_both "${GREEN}✅ Test opportunity created successfully${NC}"
            log_both "Opportunity ID: $TEST_OPPORTUNITY_ID"
            log_both "Opportunity Name: $opp_name"
            log_both "Initial Stage: Prospecting"
        else
            log_both "${RED}❌ Failed to extract opportunity ID from result${NC}"
            return 1
        fi
    else
        log_both "${RED}❌ Failed to create test opportunity${NC}"
        log_both "Error: $create_result"
        return 1
    fi
    
    log_both ""
}

# Function to verify opportunity exists and get stage values
verify_opportunity_stages() {
    log_both "${BLUE}🔍 STEP 4: VERIFY OPPORTUNITY STAGES${NC}"
    log_both "====================================="
    
    # Get valid stage values
    log_both "Querying available opportunity stages..."
    
    local stage_query="sf data query --query \"SELECT StageName FROM OpportunityStage WHERE IsActive = true ORDER BY SortOrder\" --target-org $TARGET_ORG --json"
    
    local stage_result
    if stage_result=$(eval "$stage_query" 2>/dev/null); then
        log_both "Available opportunity stages:"
        echo "$stage_result" | jq -r '.result.records[]?.StageName' 2>/dev/null | while read -r stage; do
            log_both "  - $stage"
        done 2>/dev/null || {
            log_both "Raw stage data:"
            echo "$stage_result" >> "$TEST_REPORT"
        }
    else
        log_both "${YELLOW}⚠️ Could not query opportunity stages${NC}"
    fi
    
    # Verify our test opportunity
    if [[ -n "$TEST_OPPORTUNITY_ID" ]]; then
        log_both "\\nVerifying test opportunity..."
        local opp_query="sf data query --query \"SELECT Id, Name, StageName, AccountId, CloseDate, Amount FROM Opportunity WHERE Id = '$TEST_OPPORTUNITY_ID'\" --target-org $TARGET_ORG --json"
        
        local opp_result
        if opp_result=$(eval "$opp_query" 2>/dev/null); then
            log_both "${GREEN}✅ Test opportunity verified${NC}"
            echo "$opp_result" | jq -r '.result.records[0] | "Name: \(.Name), Stage: \(.StageName), Amount: \(.Amount)"' >> "$TEST_REPORT" 2>/dev/null || {
                echo "$opp_result" >> "$TEST_REPORT"
            }
        else
            log_both "${RED}❌ Could not verify test opportunity${NC}"
        fi
    fi
    
    log_both ""
}

# Function to update opportunity to Closed Won
update_to_closed_won() {
    log_both "${BLUE}🎯 STEP 5: UPDATE TO CLOSED WON${NC}"
    log_both "================================"
    
    if [[ -z "$TEST_OPPORTUNITY_ID" ]]; then
        log_both "${RED}❌ No test opportunity available${NC}"
        return 1
    fi
    
    log_both "Updating opportunity to 'Closed Won'..."
    log_both "Opportunity ID: $TEST_OPPORTUNITY_ID"
    
    # Wait a moment to ensure any async processing completes
    sleep 2
    
    local update_result
    if update_result=$(sf data update record --sobject Opportunity --record-id "$TEST_OPPORTUNITY_ID" --values "StageName='Closed Won'" --target-org "$TARGET_ORG" --json 2>/dev/null); then
        log_both "${GREEN}✅ Opportunity updated to Closed Won${NC}"
        
        # Verify the update
        local verify_query="sf data query --query \"SELECT Id, Name, StageName, IsWon FROM Opportunity WHERE Id = '$TEST_OPPORTUNITY_ID'\" --target-org $TARGET_ORG --json"
        
        local verify_result
        if verify_result=$(eval "$verify_query" 2>/dev/null); then
            log_both "Verification result:"
            echo "$verify_result" | jq -r '.result.records[0] | "Stage: \(.StageName), IsWon: \(.IsWon)"' >> "$TEST_REPORT" 2>/dev/null || {
                echo "$verify_result" >> "$TEST_REPORT"
            }
        fi
    else
        log_both "${RED}❌ Failed to update opportunity to Closed Won${NC}"
        log_both "Error: $update_result"
        return 1
    fi
    
    log_both ""
}

# Function to check for contract creation
check_contract_creation() {
    log_both "${BLUE}📋 STEP 6: CHECK CONTRACT CREATION${NC}"
    log_both "==================================="
    
    if [[ -z "$TEST_ACCOUNT_ID" ]]; then
        log_both "${RED}❌ No test account available for contract lookup${NC}"
        return 1
    fi
    
    log_both "Waiting 10 seconds for any async processing..."
    sleep 10
    
    log_both "Checking for contracts created for test account..."
    log_both "Account ID: $TEST_ACCOUNT_ID"
    
    # Look for contracts created today for our test account
    local today=$(date +"%Y-%m-%d")
    local contract_query="sf data query --query \"SELECT Id, ContractNumber, AccountId, Status, StartDate, EndDate, CreatedDate FROM Contract WHERE AccountId = '$TEST_ACCOUNT_ID' AND CreatedDate >= ${today}T00:00:00Z\" --target-org $TARGET_ORG --json"
    
    local contract_result
    if contract_result=$(eval "$contract_query" 2>/dev/null); then
        local contract_count
        contract_count=$(echo "$contract_result" | jq -r '.result.totalSize' 2>/dev/null || echo "0")
        
        if [[ "$contract_count" -gt 0 ]]; then
            log_both "${GREEN}🎉 SUCCESS: Contract(s) found!${NC}"
            log_both "Number of contracts created: $contract_count"
            
            # Extract contract details
            echo "$contract_result" | jq -r '.result.records[] | "Contract ID: \(.Id), Number: \(.ContractNumber), Status: \(.Status), Start: \(.StartDate), End: \(.EndDate)"' >> "$TEST_REPORT" 2>/dev/null || {
                log_both "Contract details (raw):"
                echo "$contract_result" >> "$TEST_REPORT"
            }
            
            # Store first contract ID for further testing
            TEST_CONTRACT_ID=$(echo "$contract_result" | jq -r '.result.records[0].Id' 2>/dev/null || echo "")
            
        else
            log_both "${RED}❌ FAILURE: No contracts found${NC}"
            log_both "This indicates the Contract Creation Flow did not execute successfully"
        fi
    else
        log_both "${RED}❌ Failed to query for contracts${NC}"
        log_both "Error: $contract_result"
        return 1
    fi
    
    log_both ""
}

# Function to debug flow execution
debug_flow_execution() {
    log_both "${BLUE}🔧 STEP 7: DEBUG FLOW EXECUTION${NC}"
    log_both "================================="
    
    log_both "Checking for flow interview records..."
    
    # Look for flow interviews that might have executed
    local flow_interview_query="sf data query --query \"SELECT Id, Name, CurrentElement, InterviewStatus, FlowVersionViewId FROM FlowInterview WHERE CreatedDate = TODAY ORDER BY CreatedDate DESC LIMIT 10\" --target-org $TARGET_ORG --json"
    
    local interview_result
    if interview_result=$(eval "$flow_interview_query" 2>/dev/null); then
        local interview_count
        interview_count=$(echo "$interview_result" | jq -r '.result.totalSize' 2>/dev/null || echo "0")
        
        if [[ "$interview_count" -gt 0 ]]; then
            log_both "Found $interview_count flow interview(s) today:"
            echo "$interview_result" | jq -r '.result.records[] | "Interview: \(.Name), Status: \(.InterviewStatus), Element: \(.CurrentElement)"' >> "$TEST_REPORT" 2>/dev/null || {
                echo "$interview_result" >> "$TEST_REPORT"
            }
        else
            log_both "${YELLOW}⚠️ No flow interviews found today${NC}"
            log_both "This might indicate the flow is not triggering"
        fi
    else
        log_both "${YELLOW}⚠️ Could not query flow interviews${NC}"
    fi
    
    log_both ""
}

# Function to check debug logs
check_debug_logs() {
    log_both "${BLUE}📝 STEP 8: CHECK DEBUG LOGS${NC}"
    log_both "============================"
    
    log_both "Checking recent debug logs for errors..."
    
    # Query for recent debug logs
    local log_query="sf data query --query \"SELECT Id, Application, DurationMilliseconds, Operation, Request, Status, StartTime FROM ApexLog WHERE StartTime >= TODAY ORDER BY StartTime DESC LIMIT 5\" --target-org $TARGET_ORG --json"
    
    local log_result
    if log_result=$(eval "$log_query" 2>/dev/null); then
        local log_count
        log_count=$(echo "$log_result" | jq -r '.result.totalSize' 2>/dev/null || echo "0")
        
        if [[ "$log_count" -gt 0 ]]; then
            log_both "Found $log_count recent debug log(s):"
            echo "$log_result" | jq -r '.result.records[] | "Log: \(.Id), Operation: \(.Operation), Status: \(.Status), Duration: \(.DurationMilliseconds)ms"' >> "$TEST_REPORT" 2>/dev/null || {
                echo "$log_result" >> "$TEST_REPORT"
            }
        else
            log_both "No debug logs found today"
        fi
    else
        log_both "${YELLOW}⚠️ Could not query debug logs${NC}"
    fi
    
    log_both ""
}

# Function to test edge cases
test_edge_cases() {
    log_both "${BLUE}🧩 STEP 9: EDGE CASE TESTING${NC}"
    log_both "============================="
    
    if [[ -n "$TEST_OPPORTUNITY_ID" ]]; then
        log_both "Testing duplicate contract creation prevention..."
        
        # Try updating the same opportunity again
        sf data update record --sobject Opportunity --record-id "$TEST_OPPORTUNITY_ID" --values "StageName='Negotiation/Review'" --target-org "$TARGET_ORG" &>/dev/null
        sleep 2
        sf data update record --sobject Opportunity --record-id "$TEST_OPPORTUNITY_ID" --values "StageName='Closed Won'" --target-org "$TARGET_ORG" &>/dev/null
        sleep 5
        
        # Check contract count again
        local today=$(date +"%Y-%m-%d")
        local contract_query="sf data query --query \"SELECT COUNT() FROM Contract WHERE AccountId = '$TEST_ACCOUNT_ID' AND CreatedDate >= ${today}T00:00:00Z\" --target-org $TARGET_ORG --json"
        
        local contract_result
        if contract_result=$(eval "$contract_query" 2>/dev/null); then
            local contract_count
            contract_count=$(echo "$contract_result" | jq -r '.result.totalSize' 2>/dev/null || echo "0")
            
            if [[ "$contract_count" -eq 1 ]]; then
                log_both "${GREEN}✅ Duplicate prevention working - still only 1 contract${NC}"
            elif [[ "$contract_count" -gt 1 ]]; then
                log_both "${YELLOW}⚠️ Multiple contracts created - check duplicate prevention logic${NC}"
                log_both "Contract count: $contract_count"
            else
                log_both "${RED}❌ No contracts found in duplicate test${NC}"
            fi
        fi
    fi
    
    log_both ""
}

# Function to provide troubleshooting recommendations
provide_troubleshooting() {
    log_both "${BLUE}💡 TROUBLESHOOTING RECOMMENDATIONS${NC}"
    log_both "===================================="
    
    if [[ -z "$TEST_CONTRACT_ID" ]]; then
        log_both "${RED}🔴 CONTRACT CREATION FAILED${NC}"
        log_both ""
        log_both "Possible causes and solutions:"
        log_both ""
        log_both "1. FLOW NOT ACTIVE OR DEPLOYED:"
        log_both "   - Check if the flow is active in Setup > Flows"
        log_both "   - Verify the flow version is activated"
        log_both "   - Ensure the flow is deployed to this org"
        log_both ""
        log_both "2. TRIGGER CONDITIONS NOT MET:"
        log_both "   - Verify the flow triggers on Opportunity stage change"
        log_both "   - Check if 'Closed Won' is the exact stage name in your org"
        log_both "   - Confirm the flow entry criteria matches your data"
        log_both ""
        log_both "3. VALIDATION RULE CONFLICTS:"
        log_both "   - Run the validation analysis: ./run_contract_validation_analysis.sh"
        log_both "   - Check for required fields not populated by the flow"
        log_both "   - Look for date validation conflicts"
        log_both ""
        log_both "4. USER PERMISSIONS:"
        log_both "   - Verify the user has Create permission on Contract object"
        log_both "   - Check field-level security on Contract fields"
        log_both "   - Ensure the flow has proper access to required fields"
        log_both ""
        log_both "5. FLOW LOGIC ERRORS:"
        log_both "   - Review flow debug logs in Setup > Debug Logs"
        log_both "   - Check for null pointer exceptions or field access errors"
        log_both "   - Verify all field mappings are correct"
        log_both ""
        log_both "IMMEDIATE NEXT STEPS:"
        log_both "1. Run: ./run_contract_validation_analysis.sh"
        log_both "2. Check flow activation status in Setup > Flows"
        log_both "3. Enable debug logging and test again"
        log_both "4. Review flow interview records for failures"
        
    else
        log_both "${GREEN}🟢 CONTRACT CREATION SUCCESSFUL${NC}"
        log_both ""
        log_both "The Contract Creation Flow is working correctly!"
        log_both "Contract ID: $TEST_CONTRACT_ID"
        log_both ""
        log_both "If the original user test failed, possible causes:"
        log_both "1. Different data conditions in their test"
        log_both "2. User permission differences"
        log_both "3. Validation rule conflicts with their specific data"
        log_both "4. Timing issues with async processing"
        log_both ""
        log_both "RECOMMENDED MONITORING:"
        log_both "1. Set up debug logging for the user who reported the issue"
        log_both "2. Ask them to test again with a fresh opportunity"
        log_both "3. Monitor flow interview records for failures"
        log_both "4. Review any validation rule error messages"
    fi
    
    log_both ""
}

# Function to cleanup test data
cleanup_test_data() {
    log_both "${BLUE}🧹 STEP 10: CLEANUP TEST DATA${NC}"
    log_both "============================="
    
    log_both "Cleaning up test data created during this test..."
    
    # Delete test contract if created
    if [[ -n "$TEST_CONTRACT_ID" ]]; then
        log_both "Deleting test contract: $TEST_CONTRACT_ID"
        sf data delete record --sobject Contract --record-id "$TEST_CONTRACT_ID" --target-org "$TARGET_ORG" &>/dev/null && {
            log_both "${GREEN}✅ Test contract deleted${NC}"
        } || {
            log_both "${YELLOW}⚠️ Could not delete test contract${NC}"
        }
    fi
    
    # Delete test opportunity
    if [[ -n "$TEST_OPPORTUNITY_ID" ]]; then
        log_both "Deleting test opportunity: $TEST_OPPORTUNITY_ID"
        sf data delete record --sobject Opportunity --record-id "$TEST_OPPORTUNITY_ID" --target-org "$TARGET_ORG" &>/dev/null && {
            log_both "${GREEN}✅ Test opportunity deleted${NC}"
        } || {
            log_both "${YELLOW}⚠️ Could not delete test opportunity${NC}"
        }
    fi
    
    # Delete test account
    if [[ -n "$TEST_ACCOUNT_ID" ]]; then
        log_both "Deleting test account: $TEST_ACCOUNT_ID"
        sf data delete record --sobject Account --record-id "$TEST_ACCOUNT_ID" --target-org "$TARGET_ORG" &>/dev/null && {
            log_both "${GREEN}✅ Test account deleted${NC}"
        } || {
            log_both "${YELLOW}⚠️ Could not delete test account${NC}"
        }
    fi
    
    log_both ""
}

# Function to generate summary
generate_summary() {
    log_both "${PURPLE}📊 TEST EXECUTION SUMMARY${NC}"
    log_both "=========================="
    
    local test_status="UNKNOWN"
    local key_findings=""
    
    if [[ -n "$TEST_CONTRACT_ID" ]]; then
        test_status="PASSED"
        key_findings="✅ Contract Creation Flow is working correctly"
    else
        test_status="FAILED"
        key_findings="❌ Contract Creation Flow did not create a contract"
    fi
    
    log_both "Test Status: $test_status"
    log_both "Key Findings: $key_findings"
    log_both ""
    log_both "Test Data Created:"
    log_both "- Account ID: ${TEST_ACCOUNT_ID:-'Not created'}"
    log_both "- Opportunity ID: ${TEST_OPPORTUNITY_ID:-'Not created'}"
    log_both "- Contract ID: ${TEST_CONTRACT_ID:-'Not created'}"
    log_both ""
    log_both "Report Location: $TEST_REPORT"
    log_both "Test Timestamp: $TIMESTAMP"
    
    if [[ "$test_status" == "FAILED" ]]; then
        log_both ""
        log_both "${RED}🚨 ACTION REQUIRED${NC}"
        log_both "The Contract Creation Flow test failed."
        log_both "Please review the troubleshooting recommendations above."
        log_both "Next step: Run ./run_contract_validation_analysis.sh"
    fi
    
    log_both ""
}

# Main execution function
main() {
    log_both "${GREEN}🚀 Starting Contract Creation Flow Comprehensive Test...${NC}"
    log_both ""
    
    # Step 1: Check authentication
    check_auth
    
    # Step 2: Check flow status
    check_flow_status
    
    # Step 3: Create test account
    create_test_account
    
    # Step 4: Create test opportunity
    create_test_opportunity
    
    # Step 5: Verify opportunity and stages
    verify_opportunity_stages
    
    # Step 6: Update to Closed Won
    update_to_closed_won
    
    # Step 7: Check for contract creation
    check_contract_creation
    
    # Step 8: Debug flow execution
    debug_flow_execution
    
    # Step 9: Check debug logs
    check_debug_logs
    
    # Step 10: Test edge cases
    test_edge_cases
    
    # Step 11: Provide troubleshooting
    provide_troubleshooting
    
    # Step 12: Generate summary
    generate_summary
    
    # Step 13: Cleanup (optional - comment out to preserve test data)
    read -p "Clean up test data? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cleanup_test_data
    else
        log_both "Test data preserved for further analysis."
    fi
    
    log_both "${GREEN}🎉 Contract Creation Flow test completed!${NC}"
    log_both "Full report available at: $TEST_REPORT"
}

# Handle script interruption
trap 'echo -e "\n${RED}Test interrupted. Test data may need manual cleanup.${NC}"; exit 1' INT TERM

# Run main function
main "$@"
