#!/bin/bash

# Claude SFDC Setup Script
# Automated installation and configuration for new deployments

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MIN_NODE_VERSION="18"
REQUIRED_CLI_VERSION="2"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                          ║${NC}"
echo -e "${BLUE}║              Claude SFDC Setup Script                   ║${NC}"
echo -e "${BLUE}║                                                          ║${NC}"
echo -e "${BLUE}║     Automated setup for Salesforce Claude Code          ║${NC}"
echo -e "${BLUE}║                                                          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to compare versions
version_ge() {
    printf '%s\n%s' "$2" "$1" | sort -C -V
}

# Function to get node version
get_node_version() {
    node --version | sed 's/v//'
}

# Function to get sf cli version  
get_sf_version() {
    sf --version | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1
}

echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(get_node_version)
    if version_ge "$NODE_VERSION" "$MIN_NODE_VERSION"; then
        echo -e "${GREEN}✓ Node.js $NODE_VERSION (>= $MIN_NODE_VERSION required)${NC}"
    else
        echo -e "${RED}✗ Node.js $NODE_VERSION is too old. Version $MIN_NODE_VERSION or higher required.${NC}"
        echo -e "${YELLOW}  Please update Node.js: https://nodejs.org/${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ Node.js not found${NC}"
    echo -e "${YELLOW}  Please install Node.js: https://nodejs.org/${NC}"
    exit 1
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ npm $NPM_VERSION${NC}"
else
    echo -e "${RED}✗ npm not found${NC}"
    exit 1
fi

# Check if Claude Code is available
if command_exists claude; then
    echo -e "${GREEN}✓ Claude Code CLI detected${NC}"
else
    echo -e "${YELLOW}⚠ Claude Code CLI not detected${NC}"
    echo -e "${YELLOW}  Please ensure Claude Code is installed and in your PATH${NC}"
    echo -e "${YELLOW}  Visit: https://claude.ai/code${NC}"
fi

echo ""
echo -e "${YELLOW}📦 Installing Salesforce CLI...${NC}"

# Install or update Salesforce CLI
if command_exists sf; then
    SF_VERSION=$(get_sf_version)
    echo -e "${BLUE}  Current Salesforce CLI version: $SF_VERSION${NC}"
    
    read -p "  Do you want to update to the latest version? (y/n): " UPDATE_SF
    if [ "$UPDATE_SF" = "y" ] || [ "$UPDATE_SF" = "Y" ]; then
        echo -e "${BLUE}  Updating Salesforce CLI...${NC}"
        npm install -g @salesforce/cli@latest
    fi
else
    echo -e "${BLUE}  Installing Salesforce CLI...${NC}"
    npm install -g @salesforce/cli
fi

# Verify installation
if command_exists sf; then
    SF_VERSION=$(get_sf_version)
    echo -e "${GREEN}✓ Salesforce CLI $SF_VERSION installed${NC}"
else
    echo -e "${RED}✗ Salesforce CLI installation failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}🔐 Setting up Salesforce authentication...${NC}"

# Show authentication options
echo -e "${BLUE}Choose your Salesforce environment:${NC}"
echo "1) Sandbox (recommended for testing)"
echo "2) Production/Developer Org"
echo "3) Custom Domain"
echo "4) Skip authentication (configure manually later)"

read -p "Enter your choice (1-4): " AUTH_CHOICE

case $AUTH_CHOICE in
    1)
        INSTANCE_URL="https://test.salesforce.com"
        ENV_TYPE="Sandbox"
        ;;
    2)
        INSTANCE_URL="https://login.salesforce.com"
        ENV_TYPE="Production"
        ;;
    3)
        read -p "Enter your custom Salesforce domain (e.g., yourdomain.my.salesforce.com): " CUSTOM_DOMAIN
        INSTANCE_URL="https://$CUSTOM_DOMAIN"
        ENV_TYPE="Custom"
        ;;
    4)
        echo -e "${YELLOW}  Skipping authentication. You can run 'sf org login web' later.${NC}"
        SKIP_AUTH=true
        ;;
    *)
        echo -e "${RED}Invalid choice. Defaulting to sandbox.${NC}"
        INSTANCE_URL="https://test.salesforce.com"
        ENV_TYPE="Sandbox"
        ;;
esac

if [ "$SKIP_AUTH" != "true" ]; then
    # Get org alias
    DEFAULT_ALIAS="myorg"
    read -p "Enter an alias for your org [$DEFAULT_ALIAS]: " ORG_ALIAS
    ORG_ALIAS=${ORG_ALIAS:-$DEFAULT_ALIAS}
    
    echo -e "${BLUE}  Authenticating to $ENV_TYPE environment...${NC}"
    echo -e "${BLUE}  This will open your web browser for OAuth login.${NC}"
    
    # Perform authentication
    if sf org login web --alias "$ORG_ALIAS" --instance-url "$INSTANCE_URL" --set-default; then
        echo -e "${GREEN}✓ Successfully authenticated to Salesforce${NC}"
        
        # Test the connection
        echo -e "${BLUE}  Testing connection...${NC}"
        if sf org display --target-org "$ORG_ALIAS" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Connection test successful${NC}"
        else
            echo -e "${YELLOW}⚠ Connection test failed, but authentication may have succeeded${NC}"
        fi
    else
        echo -e "${RED}✗ Authentication failed${NC}"
        echo -e "${YELLOW}  You can retry authentication later with:${NC}"
        echo -e "${YELLOW}  sf org login web --alias $ORG_ALIAS --instance-url $INSTANCE_URL${NC}"
    fi
fi

echo ""
echo -e "${YELLOW}⚙️  Configuring project...${NC}"

# Update MCP configuration if we have an org alias
if [ -n "$ORG_ALIAS" ] && [ "$SKIP_AUTH" != "true" ]; then
    echo -e "${BLUE}  Updating MCP configuration for org: $ORG_ALIAS${NC}"
    
    # Create temporary file with updated config
    cat > .mcp.json.tmp << EOF
{
  "mcpServers": {
    "salesforce-dx": {
      "command": "npx",
      "args": [
        "-y",
        "@salesforce/mcp",
        "--orgs",
        "$ORG_ALIAS",
        "--toolsets",
        "all"
      ],
      "env": {
        "SF_LOG_LEVEL": "info",
        "SF_TARGET_ORG": "$ORG_ALIAS"
      }
    }
  }
}
EOF

    mv .mcp.json.tmp .mcp.json
    echo -e "${GREEN}✓ MCP configuration updated${NC}"
fi

# Create .env file
if [ -n "$ORG_ALIAS" ] && [ "$SKIP_AUTH" != "true" ]; then
    cat > .env << EOF
# Salesforce Configuration
SF_TARGET_ORG=$ORG_ALIAS
SF_API_VERSION=60.0
SF_LOG_LEVEL=info

# Project Configuration  
PROJECT_NAME=Claude-SFDC
ENVIRONMENT_TYPE=$ENV_TYPE

# Created by setup script
SETUP_DATE=$(date +%Y-%m-%d)
SETUP_USER=$(whoami)
EOF

    echo -e "${GREEN}✓ Environment configuration created${NC}"
fi

# Set up project structure
echo -e "${BLUE}  Ensuring project structure...${NC}"
mkdir -p force-app/main/default/{classes,objects,flows,triggers}
mkdir -p data templates docs/examples
echo -e "${GREEN}✓ Project structure created${NC}"

echo ""
echo -e "${YELLOW}🧪 Testing Claude Code integration...${NC}"

# Check if we can start Claude (if available)
if command_exists claude; then
    echo -e "${BLUE}  Checking Claude Code configuration...${NC}"
    
    # Test MCP configuration syntax
    if command_exists jq; then
        if cat .mcp.json | jq . > /dev/null 2>&1; then
            echo -e "${GREEN}✓ MCP configuration syntax is valid${NC}"
        else
            echo -e "${RED}✗ MCP configuration has syntax errors${NC}"
        fi
    fi
    
    echo -e "${GREEN}✓ Ready for Claude Code${NC}"
else
    echo -e "${YELLOW}⚠ Claude Code not detected - manual testing required${NC}"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║                   Setup Complete! 🎉                    ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"

echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"

if [ "$SKIP_AUTH" = "true" ]; then
    echo -e "${BLUE}1. Authenticate to Salesforce:${NC}"
    echo "   sf org login web --alias myorg --instance-url https://test.salesforce.com"
    echo ""
fi

echo -e "${BLUE}${SKIP_AUTH:+2}${SKIP_AUTH:-1}. Start Claude Code:${NC}"
echo "   claude"
echo ""

echo -e "${BLUE}${SKIP_AUTH:+3}${SKIP_AUTH:-2}. Test the integration:${NC}"
echo "   Try saying: 'List all Salesforce orgs'"
echo "   Or: 'Query 5 accounts from Salesforce'"
echo ""

echo -e "${BLUE}${SKIP_AUTH:+4}${SKIP_AUTH:-3}. Explore the agents:${NC}"
echo "   Check .claude/agents/ for 16 specialized Salesforce agents"
echo ""

if [ -n "$ORG_ALIAS" ] && [ "$SKIP_AUTH" != "true" ]; then
    echo -e "${YELLOW}🔧 Your Configuration:${NC}"
    echo "   Org Alias: $ORG_ALIAS"
    echo "   Environment: $ENV_TYPE"
    echo "   Instance URL: $INSTANCE_URL"
    echo ""
fi

echo -e "${YELLOW}📚 Documentation:${NC}"
echo "   README.md         - Project overview and usage"
echo "   SF_SETUP.md       - Detailed authentication guide"
echo "   MCP_SETUP.md      - MCP server configuration"
echo "   MCP_WORKFLOWS.md  - Usage examples and patterns"
echo ""

echo -e "${YELLOW}🚨 Troubleshooting:${NC}"
echo "   If you encounter issues:"
echo "   - Check 'sf org list' to verify authentication"
echo "   - Restart Claude Code to reload MCP configuration"
echo "   - Review the troubleshooting section in README.md"
echo ""

echo -e "${GREEN}Happy Salesforcing with Claude! 🚀⚡${NC}"
