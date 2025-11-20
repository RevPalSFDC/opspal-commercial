#!/bin/bash

# Setup Script for RevOps Essentials Validation Hooks
#
# This script makes all validation hooks executable
# Run once after installing the plugin

set -e

echo "Setting up RevOps Essentials validation hooks..."
echo ""

# Make Salesforce hooks executable
if [ -f ".claude-plugins/salesforce-essentials/hooks/pre-operation-validation.sh" ]; then
    chmod +x .claude-plugins/salesforce-essentials/hooks/pre-operation-validation.sh
    echo "✅ Salesforce validation hook enabled"
else
    echo "⚠️  Salesforce validation hook not found"
fi

# Make HubSpot hooks executable
if [ -f ".claude-plugins/hubspot-essentials/hooks/pre-operation-validation.sh" ]; then
    chmod +x .claude-plugins/hubspot-essentials/hooks/pre-operation-validation.sh
    echo "✅ HubSpot validation hook enabled"
else
    echo "⚠️  HubSpot validation hook not found"
fi

# Make Cross-Platform hooks executable
if [ -f ".claude-plugins/cross-platform-essentials/hooks/pre-operation-validation.sh" ]; then
    chmod +x .claude-plugins/cross-platform-essentials/hooks/pre-operation-validation.sh
    echo "✅ Cross-Platform validation hook enabled"
else
    echo "⚠️  Cross-Platform validation hook not found"
fi

echo ""
echo "✅ Hook setup complete!"
echo ""
echo "Validation hooks will now run automatically before operations to:"
echo "  • Check prerequisites"
echo "  • Validate connections"
echo "  • Warn about risky operations"
echo "  • Prevent common mistakes"
echo ""
echo "To test validation:"
echo "  /healthcheck"
echo ""
echo "To learn more:"
echo "  See .claude-plugins/cross-platform-essentials/templates/PRE_FLIGHT_VALIDATION_GUIDE.md"
echo ""
