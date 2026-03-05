#!/bin/bash

# Quick execution script for Contract Validation Analysis

set -euo pipefail

# Make the analysis script executable
chmod +x ./scripts/analyze-contract-validation-rules.sh

# Run the analysis
echo "🚀 Running Contract Validation Rules Analysis for example-company-sandbox..."
echo "=================================================================="

# Execute the analysis script
./scripts/analyze-contract-validation-rules.sh

echo ""
echo "✅ Analysis complete! Check the output above and the generated report file."