#!/bin/bash

# Quick execution script for Contract Creation Flow Test

set -euo pipefail

# Make the test script executable
chmod +x ./scripts/test-contract-creation-flow.sh

# Run the comprehensive test
echo "🧪 Running Contract Creation Flow Comprehensive Test..."
echo "======================================================"

# Execute the test script
./scripts/test-contract-creation-flow.sh

echo ""
echo "✅ Test execution complete! Check the output above and the generated report file."