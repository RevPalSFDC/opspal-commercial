#!/bin/bash

# Deploy Compounding Opportunity Amount Calculator Flow to sample-org Sandbox
# Usage: ./deploy-compounding-flow.sh

set -e

echo "🔄 Deploying Compounding Opportunity Amount Calculator Flow to sample-org-sandbox..."

# Check if sample-org-sandbox org is authenticated
echo "📋 Checking authentication for sample-org-sandbox..."
if ! sf org display --target-org sample-org-sandbox >/dev/null 2>&1; then
    echo "❌ sample-org-sandbox org is not authenticated."
    echo "Please authenticate first:"
    echo "sf org login web --alias sample-org-sandbox --instance-url https://test.salesforce.com"
    exit 1
fi

# Validate the deployment first
echo "🔍 Validating Flow deployment..."
sf project deploy start \
    --manifest manifest/package-flow.xml \
    --target-org sample-org-sandbox \
    --dry-run \
    --wait 10

if [ $? -eq 0 ]; then
    echo "✅ Validation successful!"
    
    # Prompt for actual deployment
    read -p "Do you want to proceed with the actual deployment? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🚀 Deploying Flow..."
        sf project deploy start \
            --manifest manifest/package-flow.xml \
            --target-org sample-org-sandbox \
            --wait 10
        
        if [ $? -eq 0 ]; then
            echo "✅ Flow deployed successfully!"
            echo "🔧 Flow Details:"
            echo "   - Name: Compounding_Opportunity_Amount_Calculator"
            echo "   - Trigger: Before Save on Opportunity"
            echo "   - Record Type: Wedgewood_Compounding (012Uw000009AqHtIAK)"
            echo "   - Logic: Amount = Count_of_DVMs__c * 7000 (or NumberOfEmployees * 7000)"
            echo "   - Validation: Related_Contact__c is required"
            echo ""
            echo "📝 Next Steps:"
            echo "1. Test with sample Compounding opportunities"
            echo "2. Verify amount calculations are correct"
            echo "3. Test Related_Contact__c validation"
            echo "4. Check Flow debug logs if needed"
        else
            echo "❌ Deployment failed!"
            exit 1
        fi
    else
        echo "🚫 Deployment cancelled by user."
    fi
else
    echo "❌ Validation failed! Please fix errors before deploying."
    exit 1
fi