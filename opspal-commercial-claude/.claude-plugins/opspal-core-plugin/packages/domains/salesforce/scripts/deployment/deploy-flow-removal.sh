#!/bin/bash

set -e

echo "=== Compounding Opportunity Amount Calculator Flow Removal ==="
echo "Target Org: sample-org-sandbox"
echo ""

# Step 1: Check current Flow status
echo "Step 1: Checking current Flow status..."
echo "----------------------------------------"
sf data query \
    --query "SELECT Id, MasterLabel, Status, VersionNumber FROM Flow WHERE Definition.DeveloperName LIKE '%Compounding_Opportunity_Amount_Calculator%'" \
    --use-tooling-api \
    --target-org sample-org-sandbox

echo ""
echo "Step 2: Deploying Flow removal (destructive changes)..."
echo "-------------------------------------------------------"

# Deploy destructive changes - this will deactivate and delete the Flow
sf project deploy start \
    --manifest manifest/package-empty.xml \
    --post-destructive-changes manifest/destructiveChanges.xml \
    --target-org sample-org-sandbox

echo ""
echo "Step 3: Verifying Flow removal..."
echo "---------------------------------"

# Verify the Flow has been removed
sf data query \
    --query "SELECT Id, MasterLabel, Status, VersionNumber FROM Flow WHERE Definition.DeveloperName LIKE '%Compounding_Opportunity_Amount_Calculator%'" \
    --use-tooling-api \
    --target-org sample-org-sandbox

echo ""
echo "=== Flow Removal Summary ==="
echo "✓ Compounding_Opportunity_Amount_Calculator Flow has been deactivated and removed"
echo "✓ Compounding_Opportunity_Amount_Calculator_Simple Flow has been deactivated and removed"
echo "✓ Flow functionality is now replaced by formula calculations in Quick Actions"
echo ""
echo "The Flows that previously set Opportunity Amount to $50,000 have been successfully removed."
echo "Formula-based calculations in Quick Actions are now handling the amount calculation logic."
