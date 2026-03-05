#!/bin/bash

# Asana Integration Setup Script
# This script helps set up the Asana MCP integration for Salesforce projects

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Asana MCP Integration Setup for SFDC    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command_exists node; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
else
    echo -e "${GREEN}✓ Node.js installed${NC}"
fi

if ! command_exists sf; then
    echo -e "${RED}✗ Salesforce CLI is not installed${NC}"
    echo "Please install Salesforce CLI first"
    exit 1
else
    echo -e "${GREEN}✓ Salesforce CLI installed${NC}"
fi

# Check for .env file
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    touch .env
    echo -e "${GREEN}✓ .env file created${NC}"
else
    echo -e "${GREEN}✓ .env file exists${NC}"
fi

# Function to add or update env variable
update_env() {
    local key=$1
    local value=$2
    if grep -q "^${key}=" .env; then
        # Update existing
        sed -i.bak "s|^${key}=.*|${key}=${value}|" .env
    else
        # Add new
        echo "${key}=${value}" >> .env
    fi
}

# Get Asana token
echo ""
echo -e "${YELLOW}Step 1: Asana Authentication${NC}"
echo "To generate an Asana Personal Access Token:"
echo "1. Go to https://app.asana.com/0/developer-console"
echo "2. Click 'Create New Token'"
echo "3. Name it 'Salesforce Integration'"
echo "4. Copy the token (shown only once)"
echo ""
read -p "Enter your Asana Personal Access Token: " ASANA_TOKEN

if [ -z "$ASANA_TOKEN" ]; then
    echo -e "${RED}✗ No token provided${NC}"
    exit 1
fi

update_env "ASANA_ACCESS_TOKEN" "$ASANA_TOKEN"
echo -e "${GREEN}✓ Asana token configured${NC}"

# Test Asana connectivity
echo ""
echo -e "${YELLOW}Testing Asana connectivity...${NC}"
WORKSPACE_RESPONSE=$(curl -s -H "Authorization: Bearer $ASANA_TOKEN" https://app.asana.com/api/1.0/workspaces)

if echo "$WORKSPACE_RESPONSE" | grep -q '"data"'; then
    echo -e "${GREEN}✓ Successfully connected to Asana${NC}"
    
    # Extract workspaces
    echo ""
    echo -e "${YELLOW}Available Workspaces:${NC}"
    echo "$WORKSPACE_RESPONSE" | grep -o '"name":"[^"]*"' | sed 's/"name":"//g' | sed 's/"//g' | nl
    echo "$WORKSPACE_RESPONSE" | grep -o '"gid":"[^"]*"' | sed 's/"gid":"//g' | sed 's/"//g' > ${TEMP_DIR:-/tmp}
    
    echo ""
    read -p "Enter the number of your default workspace: " WORKSPACE_NUM
    WORKSPACE_ID=$(sed -n "${WORKSPACE_NUM}p" ${TEMP_DIR:-/tmp})
    
    if [ -n "$WORKSPACE_ID" ]; then
        update_env "ASANA_WORKSPACE_ID" "$WORKSPACE_ID"
        echo -e "${GREEN}✓ Default workspace configured${NC}"
    fi
else
    echo -e "${RED}✗ Failed to connect to Asana. Please check your token.${NC}"
    exit 1
fi

# Check for Salesforce connection
echo ""
echo -e "${YELLOW}Step 2: Salesforce Configuration${NC}"
echo "Checking Salesforce connection..."

if sf org list --json 2>/dev/null | grep -q '"status":0'; then
    echo -e "${GREEN}✓ Salesforce CLI connected${NC}"
    
    # Get current org
    CURRENT_ORG=$(sf org display --json 2>/dev/null | grep '"username"' | head -1 | sed 's/.*"username": "//g' | sed 's/".*//g')
    if [ -n "$CURRENT_ORG" ]; then
        echo -e "${BLUE}Current org: $CURRENT_ORG${NC}"
    fi
else
    echo -e "${YELLOW}⚠ No Salesforce org connected${NC}"
    echo "Run: sf auth:web:login --alias myorg"
fi

# Create project mapping if it doesn't exist
if [ ! -f asana-projects.json ]; then
    echo ""
    echo -e "${YELLOW}Step 3: Project Configuration${NC}"
    read -p "Enter a name for this Salesforce instance (e.g., 'revpal-sandbox'): " INSTANCE_NAME
    
    # Get Asana projects
    echo "Fetching Asana projects..."
    PROJECTS_RESPONSE=$(curl -s -H "Authorization: Bearer $ASANA_TOKEN" "https://app.asana.com/api/1.0/projects?workspace=$WORKSPACE_ID&limit=100")
    
    echo -e "${YELLOW}Available Asana Projects:${NC}"
    echo "$PROJECTS_RESPONSE" | grep -o '"name":"[^"]*"' | sed 's/"name":"//g' | sed 's/"//g' | nl
    echo "$PROJECTS_RESPONSE" | grep -o '"gid":"[^"]*"' | sed 's/"gid":"//g' | sed 's/"//g' > ${TEMP_DIR:-/tmp}
    
    read -p "Enter the number of the Asana project to link (or 0 to skip): " PROJECT_NUM
    
    if [ "$PROJECT_NUM" != "0" ] && [ -n "$PROJECT_NUM" ]; then
        PROJECT_ID=$(sed -n "${PROJECT_NUM}p" ${TEMP_DIR:-/tmp})
        PROJECT_NAME=$(echo "$PROJECTS_RESPONSE" | grep -o '"name":"[^"]*"' | sed 's/"name":"//g' | sed 's/"//g' | sed -n "${PROJECT_NUM}p")
        
        # Create initial config
        cat > asana-projects.json << EOF
{
  "projects": {
    "$INSTANCE_NAME": {
      "salesforceOrgId": "",
      "description": "$INSTANCE_NAME Salesforce Instance",
      "asanaProjects": [
        {
          "projectId": "$PROJECT_ID",
          "projectName": "$PROJECT_NAME",
          "workspaceId": "$WORKSPACE_ID",
          "syncEnabled": true,
          "taskPrefix": "SF-",
          "defaultSection": "To Do",
          "syncOptions": {
            "syncComments": true,
            "syncAttachments": true,
            "syncStatus": true,
            "createBacklinks": true
          }
        }
      ]
    }
  },
  "globalSettings": {
    "syncInterval": 300,
    "maxTasksPerSync": 50,
    "enableNotifications": true,
    "logLevel": "info"
  }
}
EOF
        echo -e "${GREEN}✓ Project mapping created${NC}"
    fi
else
    echo -e "${GREEN}✓ Project mapping already exists${NC}"
fi

# Install Asana MCP server
echo ""
echo -e "${YELLOW}Step 4: Installing Asana MCP Server${NC}"
echo "Installing @roychri/mcp-server-asana..."

if npm list -g @roychri/mcp-server-asana >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Asana MCP server already installed${NC}"
else
    npm install -g @roychri/mcp-server-asana
    echo -e "${GREEN}✓ Asana MCP server installed${NC}"
fi

# Create logs directory
if [ ! -d logs ]; then
    mkdir logs
    echo -e "${GREEN}✓ Logs directory created${NC}"
fi

# Test the integration
echo ""
echo -e "${YELLOW}Step 5: Testing Integration${NC}"
echo "You can now test the integration by running:"
echo -e "${BLUE}claude \"Use asana-task-manager to list my Asana projects\"${NC}"

# Summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        Setup Complete! Next Steps:        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo "1. Add Salesforce custom fields (see ASANA_INTEGRATION.md)"
echo "2. Test the asana-task-manager agent"
echo "3. Configure additional project mappings as needed"
echo "4. Set up sync schedules if desired"
echo ""
echo -e "${YELLOW}Configuration saved in:${NC}"
echo "  - .env (tokens and IDs)"
echo "  - asana-projects.json (project mappings)"
echo "  - .mcp.json (MCP server config)"
echo ""
echo -e "${BLUE}Run 'cat ASANA_INTEGRATION.md' for full documentation${NC}"

# Cleanup temp files
rm -f ${TEMP_DIR:-/tmp} ${TEMP_DIR:-/tmp}