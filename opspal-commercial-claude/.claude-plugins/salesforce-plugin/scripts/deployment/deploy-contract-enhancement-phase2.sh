#!/bin/bash

# Phase 2 Contract Enhancement Deployment Script
# Deploys new Contract fields, validation rules, and page layout to example-company-sandbox org

echo "=== Phase 2 Contract Enhancement Deployment ==="
echo "Target Org: example-company-sandbox"
echo "Deploying: Contract fields, validation rules, and page layout"
echo ""

# Set target org
TARGET_ORG="example-company-sandbox"

# Check if SF CLI is available
if ! command -v sf &> /dev/null; then
    echo "ERROR: Salesforce CLI (sf) is not installed or not in PATH"
    echo "Please install Salesforce CLI and try again"
    exit 1
fi

# Check if target org is authenticated
echo "Checking authentication for $TARGET_ORG..."
if ! sf org display --target-org "$TARGET_ORG" &> /dev/null; then
    echo "ERROR: Not authenticated to $TARGET_ORG"
    echo "Please authenticate using: sf org login web --alias $TARGET_ORG"
    exit 1
fi

echo "Authentication verified for $TARGET_ORG"
echo ""

# Deploy the metadata
echo "Deploying Contract Enhancement components..."
sf project deploy start -x manifest/package.xml -u "$TARGET_ORG" --wait 10

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SUCCESS: Phase 2 Contract Enhancement deployed successfully!"
    echo ""
    echo "DEPLOYED COMPONENTS:"
    echo "📋 Contract Fields:"
    echo "   • Source_Opportunity__c (Lookup to Opportunity)"
    echo "   • Renewal_Generated__c (Checkbox)"
    echo "   • Next_Renewal_Date__c (Formula Date)"
    echo "   • Contract_Cohort__c (Formula Text)"
    echo "   • Total_Contract_Value__c (Enhanced Formula)"
    echo ""
    echo "⚠️  Validation Rules:"
    echo "   • Contract_Date_Logic (StartDate < EndDate)"
    echo "   • Contract_Value_Positive (TCV > 0)"
    echo "   • Source_Opportunity_Won (Opp must be Closed Won)"
    echo ""
    echo "🎨 Page Layout:"
    echo "   • Revenue Tracking section"
    echo "   • Opportunity Relationships section"
    echo "   • Renewal Management section"
    echo ""
    echo "Next Steps:"
    echo "1. Test the new fields and formulas with sample data"
    echo "2. Verify validation rules work as expected"
    echo "3. Check page layout organization"
    echo "4. Train users on new functionality"
else
    echo ""
    echo "❌ DEPLOYMENT FAILED"
    echo "Please check the error messages above and resolve issues"
    exit 1
fi
