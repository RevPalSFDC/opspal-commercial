#!/bin/bash

# Deploy Subscription__c Object to example-company Sandbox
# Script to deploy the complete Subscription__c custom object with all fields

echo "🚀 Starting deployment of Subscription__c object to example-company-sandbox..."

# Set target org
export SF_TARGET_ORG=example-company-sandbox

# Check authentication
echo "📋 Checking authentication..."
sf org display --target-org example-company-sandbox

if [ $? -ne 0 ]; then
    echo "❌ Authentication failed. Please run: sf auth web login --alias example-company-sandbox --instance-url https://test.salesforce.com"
    exit 1
fi

echo "✅ Authentication verified"

# Deploy the Subscription__c object and all its fields
echo "📦 Deploying Subscription__c object and fields..."

sf project deploy start \
    --source-dir force-app/main/default/objects/Subscription__c \
    --target-org example-company-sandbox \
    --wait 10 \
    --verbose

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    
    # Verify deployment by describing the object
    echo "🔍 Verifying deployment..."
    sf data query --query "SELECT QualifiedApiName, Label, DeveloperName FROM EntityDefinition WHERE QualifiedApiName = 'Subscription__c'" --target-org example-company-sandbox
    
    echo "📊 Checking fields..."
    sf data query --use-tooling-api --query "SELECT QualifiedApiName, Label, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Subscription__c'" --target-org example-company-sandbox
    
    echo "🎉 Subscription__c object deployment completed successfully!"
else
    echo "❌ Deployment failed. Check the error messages above."
    exit 1
fi
