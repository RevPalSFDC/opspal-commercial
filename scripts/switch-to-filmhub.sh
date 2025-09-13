#!/bin/bash

# Switch to Filmhub HubSpot Instance
echo "🎬 Switching to Filmhub HubSpot instance..."

# Export Filmhub-specific variables as primary
export HUBSPOT_API_KEY="${HUBSPOT_API_KEY_FILMHUB}"
export HUBSPOT_ACCESS_TOKEN="${HUBSPOT_ACCESS_TOKEN_FILMHUB}"
export HUBSPOT_PORTAL_ID="39560118"
export HUBSPOT_ACTIVE_ENVIRONMENT="filmhub"

# Update active portal in config
node -e "
const fs = require('fs');
const configPath = './ClaudeHubSpot/portals/config.json';
const config = JSON.parse(fs.readFileSync(configPath));
config.activePortal = 'filmhub';
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('✅ Switched to Filmhub portal');
"

# Restart MCP server if Claude CLI is available
if command -v claude &> /dev/null; then
    echo "🔄 Restarting HubSpot MCP servers..."
    claude mcp restart hubspot 2>/dev/null || true
    claude mcp restart hubspot-filmhub 2>/dev/null || true
fi

echo "✅ Filmhub HubSpot instance activated!"
echo ""
echo "Portal ID: 39560118"
echo "Environment: filmhub"
echo ""
echo "⚠️  Make sure you have set HUBSPOT_API_KEY_FILMHUB in your .env file"
