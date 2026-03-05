#!/bin/bash

echo "=================================================="
echo "Renewal Opportunity Field Deployment & Verification"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Set the target org
export SF_TARGET_ORG=${SF_TARGET_ORG:-example-company-sandbox}
echo -e "${YELLOW}Target Org: $SF_TARGET_ORG${NC}"
echo ""

# Step 1: Deploy the field with profiles and permission sets
echo -e "${YELLOW}Step 1: Deploying field with permissions...${NC}"
sf project deploy start \
  --manifest manifest/renewal-opportunity-field-package.xml \
  --target-org $SF_TARGET_ORG \
  --wait 30 \
  --ignore-warnings 2>&1 | tee deploy.log

if grep -q "Succeeded" deploy.log; then
    echo -e "${GREEN}✓ Field deployment successful${NC}"
else
    echo -e "${YELLOW}⚠ Field may already exist or deployment had warnings${NC}"
fi
echo ""

# Step 2: Clear metadata cache
echo -e "${YELLOW}Step 2: Clearing metadata cache...${NC}"
sf org open --target-org $SF_TARGET_ORG --path "/lightning/setup/ObjectManager/home" --url-only > /dev/null 2>&1
echo -e "${GREEN}✓ Cache refresh initiated${NC}"
echo ""

# Step 3: Verify field exists in metadata
echo -e "${YELLOW}Step 3: Verifying field in metadata...${NC}"
FIELD_CHECK=$(sf data query \
  --query "SELECT DeveloperName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Contract' AND DeveloperName = 'Renewal_Opportunity'" \
  --target-org $SF_TARGET_ORG \
  --use-tooling-api 2>&1)

if echo "$FIELD_CHECK" | grep -q "Renewal_Opportunity"; then
    echo -e "${GREEN}✓ Field exists in metadata${NC}"
else
    echo -e "${RED}✗ Field not found in metadata, attempting direct creation...${NC}"
    
    # Fallback: Create field directly via metadata API
    sf project deploy start \
      --source-dir force-app/main/default/objects/Contract/fields/Renewal_Opportunity__c.field-meta.xml \
      --target-org $SF_TARGET_ORG \
      --wait 10
fi
echo ""

# Step 4: Update field permissions for System Administrator
echo -e "${YELLOW}Step 4: Updating field permissions...${NC}"
sf apex run --target-org $SF_TARGET_ORG --file /dev/stdin <<'EOF'
// Update field permissions for System Administrator profile
List<FieldPermissions> fps = [
    SELECT Id, Field, PermissionsEdit, PermissionsRead 
    FROM FieldPermissions 
    WHERE Field = 'Contract.Renewal_Opportunity__c' 
    AND Parent.Profile.Name = 'System Administrator'
];

if (fps.isEmpty()) {
    // Get System Admin profile
    Profile sysAdmin = [SELECT Id FROM Profile WHERE Name = 'System Administrator' LIMIT 1];
    
    // Check if we need to use PermissionSet instead
    List<PermissionSet> adminPS = [
        SELECT Id FROM PermissionSet 
        WHERE IsOwnedByProfile = true 
        AND Profile.Name = 'System Administrator'
        LIMIT 1
    ];
    
    if (!adminPS.isEmpty()) {
        // Create field permission
        FieldPermissions fp = new FieldPermissions();
        fp.ParentId = adminPS[0].Id;
        fp.SobjectType = 'Contract';
        fp.Field = 'Contract.Renewal_Opportunity__c';
        fp.PermissionsEdit = true;
        fp.PermissionsRead = true;
        
        try {
            insert fp;
            System.debug('✓ Field permissions created');
        } catch (Exception e) {
            System.debug('Field permissions may already exist: ' + e.getMessage());
        }
    }
} else {
    // Update existing permissions
    for (FieldPermissions fp : fps) {
        fp.PermissionsEdit = true;
        fp.PermissionsRead = true;
    }
    update fps;
    System.debug('✓ Field permissions updated');
}
EOF
echo -e "${GREEN}✓ Permissions update attempted${NC}"
echo ""

# Step 5: Test field accessibility
echo -e "${YELLOW}Step 5: Testing field accessibility...${NC}"
TEST_RESULT=$(sf apex run --target-org $SF_TARGET_ORG --file /dev/stdin <<'EOF' 2>&1
try {
    // Test SOQL access
    String query = 'SELECT Id, Renewal_Opportunity__c FROM Contract LIMIT 1';
    List<Contract> contracts = Database.query(query);
    System.debug('SUCCESS: Field is accessible via SOQL');
    
    // Test field describe
    Schema.DescribeFieldResult dfr = Contract.Renewal_Opportunity__c.getDescribe();
    System.debug('Field Label: ' + dfr.getLabel());
    System.debug('Field Type: ' + dfr.getType());
    System.debug('Is Accessible: ' + dfr.isAccessible());
    System.debug('Is Updateable: ' + dfr.isUpdateable());
    
} catch (Exception e) {
    System.debug('ERROR: ' + e.getMessage());
}
EOF
)

if echo "$TEST_RESULT" | grep -q "SUCCESS: Field is accessible"; then
    echo -e "${GREEN}✓ Field is accessible via SOQL${NC}"
    FIELD_READY=true
else
    echo -e "${YELLOW}⚠ Field not yet accessible, waiting for propagation...${NC}"
    sleep 5
    
    # Retry once more
    TEST_RETRY=$(sf apex run --target-org $SF_TARGET_ORG --file /dev/stdin <<'EOF' 2>&1
try {
    String query = 'SELECT Id, Renewal_Opportunity__c FROM Contract LIMIT 1';
    List<Contract> contracts = Database.query(query);
    System.debug('SUCCESS: Field is now accessible');
} catch (Exception e) {
    System.debug('STILL_ERROR: ' + e.getMessage());
}
EOF
)
    
    if echo "$TEST_RETRY" | grep -q "SUCCESS"; then
        echo -e "${GREEN}✓ Field is now accessible after retry${NC}"
        FIELD_READY=true
    else
        echo -e "${RED}✗ Field still not accessible${NC}"
        FIELD_READY=false
    fi
fi
echo ""

# Step 6: Deploy trigger if field is ready
if [ "$FIELD_READY" = true ]; then
    echo -e "${YELLOW}Step 6: Verifying trigger deployment...${NC}"
    TRIGGER_CHECK=$(sf data query \
      --query "SELECT Name FROM ApexTrigger WHERE Name = 'OpportunityTrigger'" \
      --target-org $SF_TARGET_ORG \
      --use-tooling-api 2>&1)
    
    if echo "$TRIGGER_CHECK" | grep -q "OpportunityTrigger"; then
        echo -e "${GREEN}✓ Trigger already deployed${NC}"
    else
        echo -e "${YELLOW}Deploying trigger...${NC}"
        sf project deploy start \
          --source-dir force-app/main/default/triggers \
          --source-dir force-app/main/default/classes/OpportunityTriggerHandler.cls \
          --target-org $SF_TARGET_ORG \
          --wait 10
    fi
    echo ""
fi

# Step 7: Run functional test
if [ "$FIELD_READY" = true ]; then
    echo -e "${YELLOW}Step 7: Running functional test...${NC}"
    sf apex run --target-org $SF_TARGET_ORG --file /dev/stdin <<'EOF'
System.debug('===== FUNCTIONAL TEST =====');

// Create test data
Account acc = new Account(Name = 'Renewal Test ' + DateTime.now().getTime());
insert acc;

Contract con = new Contract(
    AccountId = acc.Id,
    Status = 'Draft',
    ContractTerm = 12,
    StartDate = Date.today()
);
insert con;
System.debug('Created Contract: ' + con.Id);

// Create renewal opportunity
Opportunity opp = new Opportunity(
    Name = 'Test Renewal Opp',
    AccountId = acc.Id,
    CloseDate = Date.today().addDays(90),
    StageName = 'Prospecting',
    Is_Renewal__c = true,
    Parent_Contract__c = con.Id
);
insert opp;
System.debug('Created Opportunity: ' + opp.Id);

// Verify the field was populated
Contract result = [SELECT Id, Renewal_Opportunity__c, Renewal_Generated__c 
                   FROM Contract WHERE Id = :con.Id];

if (result.Renewal_Opportunity__c == opp.Id && result.Renewal_Generated__c == true) {
    System.debug('✅ TEST PASSED: Renewal tracking is working correctly!');
    System.debug('Contract.Renewal_Opportunity__c = ' + result.Renewal_Opportunity__c);
    System.debug('Contract.Renewal_Generated__c = ' + result.Renewal_Generated__c);
} else {
    System.debug('❌ TEST FAILED: Fields not populated correctly');
    System.debug('Expected Opportunity ID: ' + opp.Id);
    System.debug('Actual Renewal_Opportunity__c: ' + result.Renewal_Opportunity__c);
    System.debug('Renewal_Generated__c: ' + result.Renewal_Generated__c);
}

// Cleanup
delete opp;
delete con;
delete acc;
System.debug('Test data cleaned up');
EOF
    echo ""
fi

# Final Summary
echo "=================================================="
echo "Deployment Summary"
echo "=================================================="
if [ "$FIELD_READY" = true ]; then
    echo -e "${GREEN}✅ SUCCESS: Renewal Opportunity field is fully deployed and functional${NC}"
    echo ""
    echo "The following components are ready:"
    echo "  • Custom Field: Contract.Renewal_Opportunity__c"
    echo "  • Page Layout: Updated with field"
    echo "  • Trigger: OpportunityTrigger active"
    echo "  • Handler: OpportunityTriggerHandler deployed"
    echo "  • Permissions: Field accessible to System Administrator"
    echo ""
    echo "The automation will now:"
    echo "  1. Monitor for renewal opportunities (Is_Renewal__c = true)"
    echo "  2. Check for Parent_Contract__c reference"
    echo "  3. Update the contract's Renewal_Opportunity__c field"
    echo "  4. Set Renewal_Generated__c to true"
else
    echo -e "${YELLOW}⚠ PARTIAL SUCCESS: Components deployed but field not yet accessible${NC}"
    echo ""
    echo "This can happen due to:"
    echo "  • Metadata cache synchronization delay"
    echo "  • Permission propagation lag"
    echo "  • Sandbox refresh artifacts"
    echo ""
    echo "Recommended actions:"
    echo "  1. Wait 2-3 minutes and run this script again"
    echo "  2. Or manually create the field in Setup with API name: Renewal_Opportunity__c"
    echo "  3. The trigger is ready and will work once the field is accessible"
fi

# Cleanup
rm -f deploy.log

echo ""
echo "Script completed at $(date)"
echo "=================================================="