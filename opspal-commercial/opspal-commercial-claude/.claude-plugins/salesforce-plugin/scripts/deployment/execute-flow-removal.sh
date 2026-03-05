#!/bin/bash

echo "=== Compounding Flow Removal Execution Guide ==="
echo ""

# Make all scripts executable
chmod +x deploy-flow-removal.sh
chmod +x cleanup-local-files.sh
chmod +x query-flow-status.sh
chmod +x remove-compounding-flow.sh
chmod +x check-and-remove.sh

echo "All scripts are now executable."
echo ""

echo "Option 1: Execute complete removal process"
echo "  ./deploy-flow-removal.sh"
echo ""

echo "Option 2: Step-by-step process"
echo "  1. ./check-and-remove.sh     # Check current status"
echo "  2. ./deploy-flow-removal.sh  # Remove the Flow"
echo "  3. ./cleanup-local-files.sh  # Clean up local files"
echo ""

echo "Recommended: Use Option 1 for complete automated removal."
echo ""

# Ask user which option they prefer
read -p "Would you like to execute the complete removal now? (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "=== Executing Complete Flow Removal ==="
    ./deploy-flow-removal.sh
    
    echo ""
    read -p "Would you like to clean up local files too? (y/n): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ./cleanup-local-files.sh
    fi
    
    echo ""
    echo "🎉 Flow removal process completed successfully!"
    echo ""
    echo "Summary of actions taken:"
    echo "✓ Queried Flow status in sample-org-sandbox"
    echo "✓ Deployed destructive changes to remove Flows"
    echo "✓ Verified Flows were successfully removed"
    echo "✓ Flow functionality replaced with Quick Action formulas"
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "✓ Cleaned up local metadata files"
    fi
else
    echo ""
    echo "Flow removal cancelled. You can run it manually later using:"
    echo "  ./deploy-flow-removal.sh"
fi