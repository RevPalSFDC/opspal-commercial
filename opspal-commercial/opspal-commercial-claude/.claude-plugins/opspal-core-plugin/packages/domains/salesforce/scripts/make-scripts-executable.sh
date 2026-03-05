#!/bin/bash

# Make rollup solution scripts executable

chmod +x ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}
chmod +x ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}

echo "✅ Scripts made executable:"
echo "  📦 deploy-rollup-solution.sh"
echo "  🔍 test-rollup-solution.sh"
echo ""
echo "Usage:"
echo "  ./scripts/deploy-rollup-solution.sh  # Deploy the solution"
echo "  ./scripts/test-rollup-solution.sh    # Test the solution"