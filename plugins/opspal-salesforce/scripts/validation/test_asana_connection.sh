#!/bin/bash

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

if [ -z "$ASANA_ACCESS_TOKEN" ]; then
    echo "❌ ASANA_ACCESS_TOKEN not found in .env file"
    exit 1
fi

echo "🔍 Testing Asana API connection..."

# Test workspaces endpoint
echo -e "\n📁 Fetching workspaces..."
curl -s -H "Authorization: Bearer $ASANA_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     "https://app.asana.com/api/1.0/workspaces" | \
     python3 -m json.tool

echo -e "\n✅ Connection test completed"