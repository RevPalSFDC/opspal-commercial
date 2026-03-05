#!/bin/bash

echo "=== Cleaning Up Local Flow Files ==="
echo ""

# Remove local Flow metadata files
if [ -f "force-app/main/default/flows/Compounding_Opportunity_Amount_Calculator.flow-meta.xml" ]; then
    echo "Removing Compounding_Opportunity_Amount_Calculator.flow-meta.xml..."
    rm -f force-app/main/default/flows/Compounding_Opportunity_Amount_Calculator.flow-meta.xml
    echo "✓ Removed"
else
    echo "ℹ Compounding_Opportunity_Amount_Calculator.flow-meta.xml not found"
fi

if [ -f "force-app/main/default/flows/Compounding_Opportunity_Amount_Calculator_Simple.flow-meta.xml" ]; then
    echo "Removing Compounding_Opportunity_Amount_Calculator_Simple.flow-meta.xml..."
    rm -f force-app/main/default/flows/Compounding_Opportunity_Amount_Calculator_Simple.flow-meta.xml
    echo "✓ Removed"
else
    echo "ℹ Compounding_Opportunity_Amount_Calculator_Simple.flow-meta.xml not found"
fi

# Remove deployment manifests used for Flow deployment
if [ -f "manifest/package-flow.xml" ]; then
    echo "Removing package-flow.xml (no longer needed)..."
    rm -f manifest/package-flow.xml
    echo "✓ Removed"
fi

# Keep the destructive changes files as they document the removal
echo ""
echo "Keeping for documentation:"
echo "- manifest/destructiveChanges.xml"
echo "- manifest/package-empty.xml"

echo ""
echo "=== Local File Cleanup Complete ==="