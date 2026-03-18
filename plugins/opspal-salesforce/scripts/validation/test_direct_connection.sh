#!/bin/bash

echo "🔍 Testing direct connection to sample-org-sandbox"
echo "================================================"

cd ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}

# Test 1: Check if SF CLI is available
echo "1. Testing SF CLI availability..."
if command -v sf &> /dev/null; then
    echo "✅ SF CLI is available"
    sf version
else
    echo "❌ SF CLI not found"
    exit 1
fi

# Test 2: Test org connection
echo -e "\n2. Testing org connection..."
if sf org display --target-org sample-org-sandbox &> /dev/null; then
    echo "✅ Connected to sample-org-sandbox"
    sf org display --target-org sample-org-sandbox | head -10
else
    echo "❌ Cannot connect to sample-org-sandbox"
    echo "Available orgs:"
    sf org list
    exit 1
fi

# Test 3: Quick query test
echo -e "\n3. Testing basic query..."
sf data query --query "SELECT Id, Name FROM Profile LIMIT 5" --target-org sample-org-sandbox

echo -e "\n================================================"
echo "🔍 Connection test complete"