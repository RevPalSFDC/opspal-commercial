#!/bin/bash

# Deploy RevOps Automation Flows to example-company Sandbox
echo "🚀 Deploying RevOps Automation Flows to example-company Sandbox"
echo "========================================================="

# Set target org
export SF_TARGET_ORG=example-company-sandbox

# Check authentication
echo "🔐 Checking authentication..."
sf org display --target-org example-company-sandbox

if [ $? -ne 0 ]; then
    echo "❌ Authentication failed. Please run: sf org login web --alias example-company-sandbox"
    exit 1
fi

# Deploy flows using Salesforce CLI
echo ""
echo "📦 Deploying Contract Creation Flow..."
sf project deploy start \
    --source-dir force-app/main/default/flows/Contract_Creation_Flow.flow-meta.xml \
    --target-org example-company-sandbox \
    --wait 10

if [ $? -eq 0 ]; then
    echo "✅ Contract Creation Flow deployed successfully"
else
    echo "❌ Contract Creation Flow deployment failed"
    exit 1
fi

echo ""
echo "📦 Deploying Renewal Opportunity Generation Flow..."
sf project deploy start \
    --source-dir force-app/main/default/flows/Renewal_Opportunity_Generation_Flow.flow-meta.xml \
    --target-org example-company-sandbox \
    --wait 10

if [ $? -eq 0 ]; then
    echo "✅ Renewal Opportunity Generation Flow deployed successfully"
else
    echo "❌ Renewal Opportunity Generation Flow deployment failed"
    exit 1
fi

echo ""
echo "🎯 Verifying flow deployment..."
sf data query \
    --query "SELECT Id, DeveloperName, MasterLabel, Status FROM FlowDefinition WHERE DeveloperName IN ('Contract_Creation_Flow', 'Renewal_Opportunity_Generation_Flow')" \
    --target-org example-company-sandbox

echo ""
echo "🎉 RevOps Automation Flows deployment completed!"
echo ""
echo "Next Steps:"
echo "1. Test the Contract Creation Flow by updating an Opportunity to 'Closed Won'"
echo "2. Verify the Renewal Opportunity Generation Flow is scheduled to run daily"
echo "3. Monitor flow execution through Setup > Process Automation > Flows"
