#!/bin/bash

# Deploy Contract Creation Flow Fix to example-company Sandbox
echo "🚀 Deploying Contract Creation Flow Fix to example-company Sandbox"
echo "======================================================================"

# Set target org
export SF_TARGET_ORG=example-company-sandbox

# Verify connection
echo "🔍 Verifying connection to example-company-sandbox..."
sf org display --target-org example-company-sandbox
if [ $? -ne 0 ]; then
    echo "❌ Authentication failed. Please run: sf org login web --alias example-company-sandbox --instance-url https://test.salesforce.com"
    exit 1
fi

# Deploy the updated flow
echo ""
echo "📦 Deploying Contract Creation Flow..."
sf project deploy start \
    --source-dir force-app/main/default/flows/Contract_Creation_Flow.flow-meta.xml \
    --target-org example-company-sandbox \
    --wait 10

if [ $? -eq 0 ]; then
    echo "✅ Flow deployment successful!"
else
    echo "❌ Flow deployment failed. Check the error output above."
    exit 1
fi

# Verify flow is active
echo ""
echo "🔍 Verifying flow status..."
sf data query --use-tooling-api --query "SELECT Id, ApiName, Label, ProcessType, IsActive FROM FlowDefinitionView WHERE Label = 'Contract Creation Flow'" --target-org example-company-sandbox

echo ""
echo "======================================================================"
echo "✅ Contract Creation Flow Fix Deployment Complete!"
echo ""
echo "🧪 To test the flow:"
echo "1. Create or update an Opportunity in example-company-sandbox"
echo "2. Set StageName to 'Closed Won'"
echo "3. Ensure Amount is positive"
echo "4. Verify Contract is created successfully"
echo ""
echo "📧 Check admin@example-company.com for any error notifications"
echo "======================================================================"
