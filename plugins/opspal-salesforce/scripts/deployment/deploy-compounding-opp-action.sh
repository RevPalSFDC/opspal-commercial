#!/bin/bash

# Deploy Account.New_Compounding_Opp Quick Action to sample-org-sandbox
echo "Deploying Account.New_Compounding_Opp Quick Action to sample-org-sandbox..."

# Check if we're authenticated with the target org
sf org display --target-org sample-org-sandbox > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Error: Not authenticated with sample-org-sandbox org"
    echo "Please run: sf org login web --alias sample-org-sandbox --instance-url https://test.salesforce.com"
    exit 1
fi

# Deploy the quick action
sf project deploy start --source-dir force-app/main/default/quickActions --target-org sample-org-sandbox --verbose

# Check deployment status
if [ $? -eq 0 ]; then
    echo "✅ Successfully deployed Account.New_Compounding_Opp quick action!"
    echo "The action should now be available on Account page layouts."
    echo ""
    echo "Next steps:"
    echo "1. Add the action to your Account page layouts in Setup"
    echo "2. Test the action by navigating to an Account record"
    echo "3. Verify the field mappings work correctly"
else
    echo "❌ Deployment failed. Check the error messages above."
    exit 1
fi
