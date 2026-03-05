#!/bin/bash

echo "====================================="
echo "Testing Renewal Opportunity Tracking"
echo "====================================="
echo ""

# Set the target org
export SF_TARGET_ORG=example-company-sandbox

echo "Step 1: Verifying field exists on Contract..."
sf sobject describe Contract --target-org $SF_TARGET_ORG | grep -A2 "Renewal_Opportunity__c"
echo ""

echo "Step 2: Checking trigger deployment..."
sf apex trigger list --target-org $SF_TARGET_ORG | grep OpportunityTrigger
echo ""

echo "Step 3: Running anonymous Apex to test the functionality..."
sf apex run --target-org $SF_TARGET_ORG <<'EOF'
// Test the renewal opportunity tracking
System.debug('Starting Renewal Opportunity Tracking Test...');

// Create a test Account
Account testAccount = new Account(
    Name = 'Test Renewal Account ' + DateTime.now().getTime()
);
insert testAccount;
System.debug('Created Account: ' + testAccount.Id);

// Create a test Contract
Contract testContract = new Contract(
    AccountId = testAccount.Id,
    Status = 'Draft',
    ContractTerm = 12,
    StartDate = Date.today()
);
insert testContract;
System.debug('Created Contract: ' + testContract.Id);

// Create a renewal opportunity
Opportunity renewalOpp = new Opportunity(
    Name = 'Test Renewal Opportunity',
    AccountId = testAccount.Id,
    CloseDate = Date.today().addDays(90),
    StageName = 'Prospecting',
    Is_Renewal__c = true,
    Parent_Contract__c = testContract.Id
);

try {
    insert renewalOpp;
    System.debug('Created Renewal Opportunity: ' + renewalOpp.Id);
    
    // Query the contract to verify the field was populated
    Contract updatedContract = [
        SELECT Id, ContractNumber, Renewal_Opportunity__c, Renewal_Generated__c 
        FROM Contract 
        WHERE Id = :testContract.Id
    ];
    
    System.debug('=== TEST RESULTS ===');
    System.debug('Contract Number: ' + updatedContract.ContractNumber);
    System.debug('Renewal Opportunity ID: ' + updatedContract.Renewal_Opportunity__c);
    System.debug('Renewal Generated Flag: ' + updatedContract.Renewal_Generated__c);
    
    if (updatedContract.Renewal_Opportunity__c == renewalOpp.Id && 
        updatedContract.Renewal_Generated__c == true) {
        System.debug('✅ TEST PASSED: Renewal opportunity tracking is working correctly!');
    } else {
        System.debug('❌ TEST FAILED: Fields were not properly populated');
    }
    
} catch (Exception e) {
    System.debug('❌ ERROR: ' + e.getMessage());
    System.debug('Stack Trace: ' + e.getStackTraceString());
}

System.debug('Test completed.');
EOF

echo ""
echo "Step 4: Querying to verify the test data..."
sf data query --query "SELECT Id, ContractNumber, Renewal_Opportunity__c, Renewal_Generated__c FROM Contract WHERE CreatedDate = TODAY ORDER BY CreatedDate DESC LIMIT 1" --target-org $SF_TARGET_ORG

echo ""
echo "====================================="
echo "Test Complete!"
echo "====================================="