#!/bin/bash

cd ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}

echo "🚀 Starting deployment of Count_of_DVMs__c field..."

# Check authentication
echo "📋 Checking sample-org-sandbox authentication..."
if sf org display --target-org sample-org-sandbox; then
    echo "✅ sample-org-sandbox authenticated"
else
    echo "❌ sample-org-sandbox not authenticated. Please run:"
    echo "sf org login web --alias sample-org-sandbox --instance-url https://test.salesforce.com"
    exit 1
fi

# Deploy the field
echo "📦 Deploying Count_of_DVMs__c field..."
sf project deploy start \
    --source-dir metadata \
    --target-org sample-org-sandbox \
    --wait 10 \
    --verbose

echo "🎉 Deployment process completed!"