#!/bin/bash

set -e  # Exit on any error

echo "=== Two-Phase Removal: Compounding Opportunity Amount Calculator Flow ==="
echo "This script implements the required two-phase removal process:"
echo "  Phase 1: Deactivate the flow"
echo "  Phase 2: Delete the flow"
echo ""

# Configuration
ORG_ALIAS="${1:-sample-org-sandbox}"
FLOW_NAMES=("Compounding_Opportunity_Amount_Calculator" "Compounding_Opportunity_Amount_Calculator_Simple")
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LIB_DIR="${SCRIPT_DIR}/../lib"

# Step 1: Query current Flow status
echo "Step 1: Checking current Flow status..."
for FLOW_NAME in "${FLOW_NAMES[@]}"; do
    echo "  Checking: $FLOW_NAME"
    sf data query --query "SELECT Id, MasterLabel, Status, VersionNumber FROM Flow WHERE Definition.DeveloperName = '$FLOW_NAME' AND Status != 'Obsolete' ORDER BY VersionNumber DESC LIMIT 1" --use-tooling-api --target-org "$ORG_ALIAS" --json || true
done

echo ""
echo "=== Phase 1: Deactivating Flows ==="
echo "Flows must be deactivated before they can be deleted."
echo ""

# Use the flow-removal-manager for two-phase removal
if [ -f "$LIB_DIR/flow-removal-manager.js" ]; then
    echo "Using flow-removal-manager for safe two-phase removal..."
    
    for FLOW_NAME in "${FLOW_NAMES[@]}"; do
        echo ""
        echo "Processing: $FLOW_NAME"
        echo "----------------------------------------"
        
        # Execute two-phase removal
        node "$LIB_DIR/flow-removal-manager.js" remove --flow "$FLOW_NAME" --org "$ORG_ALIAS" --force || {
            echo "Warning: Failed to remove $FLOW_NAME. It may not exist or already be removed."
        }
    done
else
    echo "Warning: flow-removal-manager.js not found. Using manual process..."
    
    # Fallback: Manual two-phase process
    for FLOW_NAME in "${FLOW_NAMES[@]}"; do
        echo ""
        echo "Phase 1 - Deactivating: $FLOW_NAME"
        
        # Use flow-deactivator if available
        if [ -f "$LIB_DIR/flow-deactivator.js" ]; then
            node "$LIB_DIR/flow-deactivator.js" --flow "$FLOW_NAME" --org "$ORG_ALIAS" || true
        else
            echo "  Creating deactivation metadata..."
            mkdir -p temp-deactivate/flows
            
            cat > "temp-deactivate/flows/${FLOW_NAME}.flow-meta.xml" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Inactive</status>
</Flow>
EOF
            
            echo "  Deploying deactivation..."
            sf project deploy start --source-dir "temp-deactivate/flows" --target-org "$ORG_ALIAS" --wait 10 || true
            rm -rf temp-deactivate
        fi
    done
    
    echo ""
    echo "Waiting for deactivation to process..."
    sleep 3
    
    echo ""
    echo "Phase 2 - Deleting flows..."
    
    # Create destructive changes manifest
    mkdir -p manifest
    
    cat > manifest/destructiveChanges.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
EOF
    
    for FLOW_NAME in "${FLOW_NAMES[@]}"; do
        echo "        <members>$FLOW_NAME</members>" >> manifest/destructiveChanges.xml
    done
    
    cat >> manifest/destructiveChanges.xml << EOF
        <name>Flow</name>
    </types>
    <version>62.0</version>
</Package>
EOF
    
    cat > manifest/package-empty.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <version>62.0</version>
</Package>
EOF
    
    echo "  Deploying destructive changes..."
    sf project deploy start \
        --manifest manifest/package-empty.xml \
        --post-destructive-changes manifest/destructiveChanges.xml \
        --target-org "$ORG_ALIAS"
fi

echo ""
echo "=== Phase 3: Verification ==="
echo "Checking if flows have been successfully removed..."
echo ""

REMOVED_COUNT=0
for FLOW_NAME in "${FLOW_NAMES[@]}"; do
    echo "Verifying: $FLOW_NAME"
    
    # Query for the flow
    RESULT=$(sf data query --query "SELECT Id, Status FROM Flow WHERE Definition.DeveloperName = '$FLOW_NAME' AND Status != 'Obsolete' LIMIT 1" --use-tooling-api --target-org "$ORG_ALIAS" --json 2>/dev/null || echo '{"result":{"totalSize":0}}')
    
    # Check if flow exists
    TOTAL_SIZE=$(echo "$RESULT" | grep -o '"totalSize":[0-9]*' | cut -d':' -f2)
    
    if [ "$TOTAL_SIZE" = "0" ] || [ -z "$TOTAL_SIZE" ]; then
        echo "  ✅ Successfully removed"
        ((REMOVED_COUNT++))
    else
        STATUS=$(echo "$RESULT" | grep -o '"Status":"[^"]*"' | cut -d'"' -f4)
        if [ "$STATUS" = "Inactive" ]; then
            echo "  ⚠️ Flow is deactivated but not deleted"
        else
            echo "  ❌ Flow still exists with status: $STATUS"
        fi
    fi
done

echo ""
echo "=== Flow removal process completed ==="
echo ""
echo "Summary:"
echo "- Attempted to remove ${#FLOW_NAMES[@]} flows"
echo "- Successfully removed: $REMOVED_COUNT flows"
if [ $REMOVED_COUNT -eq ${#FLOW_NAMES[@]} ]; then
    echo "- ✅ All flows have been successfully removed"
    echo "- Flow functionality is now replaced by formula calculations in Quick Actions"
else
    echo "- ⚠️ Some flows may require manual intervention"
    echo "- Check the Salesforce UI for any remaining active flows"
fi

# Clean up temporary files
echo ""
echo "Cleaning up temporary files..."
rm -rf manifest temp-deactivate 2>/dev/null || true

# Step 5: Clean up local metadata files (optional)
if [ -t 0 ]; then  # Check if running interactively
    read -p "Do you want to remove local Flow metadata files? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Removing local Flow metadata files..."
        for FLOW_NAME in "${FLOW_NAMES[@]}"; do
            rm -f "force-app/main/default/flows/${FLOW_NAME}.flow-meta.xml" 2>/dev/null || true
        done
        echo "Local Flow metadata files removed."
    else
        echo "Local Flow metadata files preserved."
    fi
fi

echo ""
echo "Done!"
echo ""
echo "💡 Tip: If any flows failed to remove, you can:"
echo "   1. Run the script again"
echo "   2. Use: node scripts/lib/flow-removal-manager.js remove --flow [FlowName] --org $ORG_ALIAS"
echo "   3. Manually deactivate in Salesforce UI, then run destructive changes"
