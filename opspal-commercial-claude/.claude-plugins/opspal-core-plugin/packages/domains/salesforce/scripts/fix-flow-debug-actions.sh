#!/bin/bash

# Fix flow debug actions that cause deployment errors
# These debug actions are not valid in production deployments

echo "Fixing debug actions in flow files..."

# List of flows with debug issues
FLOWS=(
    "Contract_AssignCohort"
    "Contract_GenerateRenewal"
    "Contract_RenewalNotifications"
    "Contract_ValidateData"
    "OLI_CreateSubscription"
    "Opp_ClosedWon_CreateContract"
    "Opportunity_UpdateContractRenewalRef"
)

for FLOW in "${FLOWS[@]}"; do
    FILE="force-app/main/default/flows/${FLOW}.flow-meta.xml"
    if [ -f "$FILE" ]; then
        echo "Processing $FLOW..."
        # Remove actionCalls with debug type
        sed -i '/<actionCalls>/,/<\/actionCalls>/{/<actionType>debug<\/actionType>/d}' "$FILE"
        # Remove entire actionCalls blocks that contain debug
        perl -i -0pe 's/<actionCalls>.*?<actionType>debug<\/actionType>.*?<\/actionCalls>\s*//gs' "$FILE"
        echo "  - Removed debug actions from $FLOW"
    fi
done

echo "Debug actions removed from all flows."