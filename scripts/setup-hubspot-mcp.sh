#!/bin/bash

# HubSpot MCP Server Setup Script
# Maps existing environment variables to MCP server requirements

echo "🔧 HubSpot MCP Server Setup"
echo "=========================="

# Check for existing credentials
if [ -f .env ]; then
    source .env
fi

# Map credentials to MCP server expected format
if [ -n "$HUBSPOT_ACCESS_TOKEN_FILMHUB" ]; then
    export PRIVATE_APP_ACCESS_TOKEN="$HUBSPOT_ACCESS_TOKEN_FILMHUB"
    echo "✅ Using Filmhub access token"
elif [ -n "$HUBSPOT_API_KEY_FILMHUB" ]; then
    export PRIVATE_APP_ACCESS_TOKEN="$HUBSPOT_API_KEY_FILMHUB"
    echo "✅ Using Filmhub API key"
elif [ -n "$HUBSPOT_ACCESS_TOKEN" ]; then
    export PRIVATE_APP_ACCESS_TOKEN="$HUBSPOT_ACCESS_TOKEN"
    echo "✅ Using default access token"
elif [ -n "$HUBSPOT_API_KEY" ]; then
    export PRIVATE_APP_ACCESS_TOKEN="$HUBSPOT_API_KEY"
    echo "✅ Using default API key"
else
    echo "❌ No HubSpot credentials found!"
    echo ""
    echo "Please add one of the following to your .env file:"
    echo "  HUBSPOT_ACCESS_TOKEN_FILMHUB=your-token"
    echo "  HUBSPOT_API_KEY_FILMHUB=your-api-key"
    exit 1
fi

# Update .env with PRIVATE_APP_ACCESS_TOKEN if not already there
if ! grep -q "PRIVATE_APP_ACCESS_TOKEN=" .env 2>/dev/null; then
    echo "" >> .env
    echo "# MCP Server Authentication" >> .env
    echo "PRIVATE_APP_ACCESS_TOKEN=$PRIVATE_APP_ACCESS_TOKEN" >> .env
    echo "✅ Added PRIVATE_APP_ACCESS_TOKEN to .env"
fi

# Check if HubSpot CLI is authenticated
echo ""
echo "Checking HubSpot CLI status..."
if hs accounts list &>/dev/null; then
    echo "✅ HubSpot CLI is authenticated"
    hs accounts list
else
    echo "⚠️  HubSpot CLI not authenticated"
    echo "Run: cd ClaudeHubSpot && hs init"
fi

# Test MCP server availability
echo ""
echo "Testing MCP server..."
if npx @hubspot/mcp-server --version &>/dev/null; then
    echo "✅ HubSpot MCP server is available"
else
    echo "⚠️  Installing HubSpot MCP server..."
    npm install -g @hubspot/mcp-server
fi

echo ""
echo "Setup complete! Next steps:"
echo "1. Restart Claude Code to apply changes"
echo "2. The MCP server should now work with your HubSpot instance"
echo ""
echo "Environment configured for:"
echo "  Portal ID: ${HUBSPOT_PORTAL_ID_FILMHUB:-39560118}"
echo "  Auth Token: ${PRIVATE_APP_ACCESS_TOKEN:0:20}..."