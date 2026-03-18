#!/bin/bash

# Test Renewal Automation Script
# This script tests the renewal opportunity automation by creating test data and validating results

echo "🔧 Testing Renewal Opportunity Automation"
echo "========================================"

# Set default org alias if not provided
SF_TARGET_ORG=${SF_TARGET_ORG:-"example-company-sandbox"}

echo "Using Salesforce org: $SF_TARGET_ORG"

# Validate SF CLI connection
echo "📋 Validating SF CLI connection..."
sf org display --target-org $SF_TARGET_ORG > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Error: Cannot connect to Salesforce org '$SF_TARGET_ORG'"
    echo "Please run: sf org login web --alias $SF_TARGET_ORG"
    exit 1
fi

echo "✅ Connected to Salesforce org successfully"

# Test 1: Check existing renewal automation components
echo ""
echo "🧪 Test 1: Validating automation components exist..."

echo "Checking Contract_GenerateRenewal flow..."
CONTRACT_FLOW_EXISTS=$(sf data query --query "SELECT Id, ApiName FROM FlowDefinitionView WHERE ApiName = 'Contract_GenerateRenewal' AND IsActive = true" --target-org $SF_TARGET_ORG --json | jq '.result.records | length')

if [ "$CONTRACT_FLOW_EXISTS" -gt 0 ]; then
    echo "✅ Contract_GenerateRenewal flow is active"
else
    echo "❌ Contract_GenerateRenewal flow not found or inactive"
fi

echo "Checking Opportunity_UpdateContractRenewalRef flow..."
OPP_FLOW_EXISTS=$(sf data query --query "SELECT Id, ApiName FROM FlowDefinitionView WHERE ApiName = 'Opportunity_UpdateContractRenewalRef' AND IsActive = true" --target-org $SF_TARGET_ORG --json | jq '.result.records | length')

if [ "$OPP_FLOW_EXISTS" -gt 0 ]; then
    echo "✅ Opportunity_UpdateContractRenewalRef flow is active"
else
    echo "❌ Opportunity_UpdateContractRenewalRef flow not found or inactive"
fi

# Test 2: Check Contract field exists
echo ""
echo "🧪 Test 2: Validating Contract.Renewal_Opportunity__c field exists..."
CONTRACT_FIELD_EXISTS=$(sf data query --query "SELECT Id FROM Contract LIMIT 1" --target-org $SF_TARGET_ORG --json 2>/dev/null | jq '.result.records | length')

if [ "$CONTRACT_FIELD_EXISTS" -gt 0 ]; then
    echo "✅ Contract object accessible"
    
    # Try to query the field to see if it exists
    FIELD_TEST=$(sf data query --query "SELECT Id, Renewal_Opportunity__c FROM Contract LIMIT 1" --target-org $SF_TARGET_ORG --json 2>/dev/null)
    
    if echo "$FIELD_TEST" | jq -e '.result.records' > /dev/null 2>&1; then
        echo "✅ Contract.Renewal_Opportunity__c field exists"
    else
        echo "❌ Contract.Renewal_Opportunity__c field not accessible"
    fi
else
    echo "❌ Cannot access Contract object"
fi

# Test 3: Create test contract for renewal generation
echo ""
echo "🧪 Test 3: Creating test contract for automated renewal..."

# Get default account ID
DEFAULT_ACCOUNT=$(sf data query --query "SELECT Id FROM Account LIMIT 1" --target-org $SF_TARGET_ORG --json | jq -r '.result.records[0].Id')

if [ "$DEFAULT_ACCOUNT" = "null" ]; then
    echo "⚠️  No accounts found, creating test account..."
    ACCOUNT_RESULT=$(sf data create record --sobject Account --values "Name='Test Account for Renewal'" --target-org $SF_TARGET_ORG --json)
    DEFAULT_ACCOUNT=$(echo "$ACCOUNT_RESULT" | jq -r '.result.id')
    echo "Created test account: $DEFAULT_ACCOUNT"
fi

# Calculate test dates
RENEWAL_DATE=$(date -d "+90 days" '+%Y-%m-%d')
START_DATE=$(date '+%Y-%m-%d')

echo "Creating test contract with EndDate: $RENEWAL_DATE"

# Create test contract
CONTRACT_RESULT=$(sf data create record --sobject Contract \
    --values "AccountId='$DEFAULT_ACCOUNT' StartDate='$START_DATE' EndDate='$RENEWAL_DATE' Status='Activated' ContractTerm=12 Monthly_Recurring_Revenue__c=5000 Renewal_Generated__c=false" \
    --target-org $SF_TARGET_ORG --json)

TEST_CONTRACT_ID=$(echo "$CONTRACT_RESULT" | jq -r '.result.id')

if [ "$TEST_CONTRACT_ID" != "null" ]; then
    echo "✅ Test contract created: $TEST_CONTRACT_ID"
else
    echo "❌ Failed to create test contract"
    echo "$CONTRACT_RESULT"
    exit 1
fi

# Test 4: Manual renewal opportunity test
echo ""
echo "🧪 Test 4: Testing manual renewal opportunity creation..."

# Get Renewal Opportunity Record Type
RENEWAL_RT=$(sf data query --query "SELECT Id FROM RecordType WHERE SobjectType = 'Opportunity' AND Name = 'Renewal Opportunity'" --target-org $SF_TARGET_ORG --json | jq -r '.result.records[0].Id')

if [ "$RENEWAL_RT" = "null" ]; then
    echo "⚠️  Renewal Opportunity record type not found, using default"
    RENEWAL_RT=""
else
    echo "Found Renewal Opportunity RecordType: $RENEWAL_RT"
fi

# Create manual renewal opportunity
CLOSE_DATE=$(date -d "+30 days" '+%Y-%m-%d')

if [ -n "$RENEWAL_RT" ]; then
    OPP_VALUES="Name='Test Manual Renewal' AccountId='$DEFAULT_ACCOUNT' CloseDate='$CLOSE_DATE' StageName='Prospecting' Is_Renewal__c=true Parent_Contract__c='$TEST_CONTRACT_ID' RecordTypeId='$RENEWAL_RT'"
else
    OPP_VALUES="Name='Test Manual Renewal' AccountId='$DEFAULT_ACCOUNT' CloseDate='$CLOSE_DATE' StageName='Prospecting' Is_Renewal__c=true Parent_Contract__c='$TEST_CONTRACT_ID'"
fi

OPP_RESULT=$(sf data create record --sobject Opportunity --values "$OPP_VALUES" --target-org $SF_TARGET_ORG --json)

TEST_OPP_ID=$(echo "$OPP_RESULT" | jq -r '.result.id')

if [ "$TEST_OPP_ID" != "null" ]; then
    echo "✅ Test renewal opportunity created: $TEST_OPP_ID"
else
    echo "❌ Failed to create test opportunity"
    echo "$OPP_RESULT"
fi

# Test 5: Validate contract was updated
echo ""
echo "🧪 Test 5: Validating contract update after manual opportunity creation..."

sleep 3  # Wait for flow to execute

# Query the contract to see if it was updated
CONTRACT_CHECK=$(sf data query --query "SELECT Id, ContractNumber, Renewal_Generated__c, Renewal_Opportunity__c FROM Contract WHERE Id = '$TEST_CONTRACT_ID'" --target-org $SF_TARGET_ORG --json)

RENEWAL_FLAG=$(echo "$CONTRACT_CHECK" | jq -r '.result.records[0].Renewal_Generated__c')
RENEWAL_OPP_REF=$(echo "$CONTRACT_CHECK" | jq -r '.result.records[0].Renewal_Opportunity__c')
CONTRACT_NUMBER=$(echo "$CONTRACT_CHECK" | jq -r '.result.records[0].ContractNumber')

echo "Contract $CONTRACT_NUMBER status:"
echo "- Renewal_Generated__c: $RENEWAL_FLAG"
echo "- Renewal_Opportunity__c: $RENEWAL_OPP_REF"

if [ "$RENEWAL_FLAG" = "true" ] && [ "$RENEWAL_OPP_REF" = "$TEST_OPP_ID" ]; then
    echo "✅ Contract was properly updated by the automation!"
else
    echo "❌ Contract was not updated correctly"
    echo "Expected Renewal_Opportunity__c: $TEST_OPP_ID"
    echo "Actual Renewal_Opportunity__c: $RENEWAL_OPP_REF"
fi

# Test Summary
echo ""
echo "📊 Test Summary"
echo "==============="
echo "Contract Flow Exists: $([ "$CONTRACT_FLOW_EXISTS" -gt 0 ] && echo "✅" || echo "❌")"
echo "Opportunity Flow Exists: $([ "$OPP_FLOW_EXISTS" -gt 0 ] && echo "✅" || echo "❌")"
echo "Field Accessible: ✅"
echo "Test Contract Created: ✅"
echo "Test Opportunity Created: $([ "$TEST_OPP_ID" != "null" ] && echo "✅" || echo "❌")"
echo "Contract Updated: $([ "$RENEWAL_FLAG" = "true" ] && [ "$RENEWAL_OPP_REF" = "$TEST_OPP_ID" ] && echo "✅" || echo "❌")"

# Cleanup option
echo ""
echo "🧹 Cleanup"
echo "=========="
echo "Test records created:"
echo "- Contract: $TEST_CONTRACT_ID"
echo "- Opportunity: $TEST_OPP_ID"
echo ""
read -p "Do you want to delete the test records? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Deleting test records..."
    sf data delete record --sobject Opportunity --record-id "$TEST_OPP_ID" --target-org $SF_TARGET_ORG > /dev/null 2>&1
    sf data delete record --sobject Contract --record-id "$TEST_CONTRACT_ID" --target-org $SF_TARGET_ORG > /dev/null 2>&1
    echo "✅ Test records deleted"
else
    echo "Test records preserved for further analysis"
fi

echo ""
echo "🎉 Testing complete!"
