#!/bin/bash

# Salesforce Instance Initializer
# Creates a new project folder for a Salesforce instance with all necessary configuration

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECTS_ROOT="$HOME/SalesforceProjects"
SHARED_DIR="$PROJECTS_ROOT/_shared"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$CURRENT_DIR")"

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Salesforce Instance Initializer      ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""

# Create projects root if it doesn't exist
if [ ! -d "$PROJECTS_ROOT" ]; then
    echo -e "${YELLOW}Creating SalesforceProjects directory...${NC}"
    mkdir -p "$PROJECTS_ROOT"
fi

# Create shared resources if first time
if [ ! -d "$SHARED_DIR" ]; then
    echo -e "${YELLOW}Setting up shared resources...${NC}"
    mkdir -p "$SHARED_DIR"
    
    # Copy agents from current project to shared
    if [ -d "$PARENT_DIR/.claude/agents" ]; then
        cp -r "$PARENT_DIR/.claude" "$SHARED_DIR/"
        echo -e "${GREEN}✓ Copied agent definitions to shared directory${NC}"
    fi
    
    # Copy documentation
    for file in MCP_SETUP.md MCP_WORKFLOWS.md MULTI_INSTANCE_SETUP.md; do
        if [ -f "$PARENT_DIR/$file" ]; then
            cp "$PARENT_DIR/$file" "$SHARED_DIR/"
        fi
    done
    echo -e "${GREEN}✓ Shared resources created${NC}"
fi

# Get instance details
echo -e "\n${YELLOW}Enter instance details:${NC}"
read -p "Client/Project Name (e.g., Acme, Internal): " CLIENT_NAME
if [ -z "$CLIENT_NAME" ]; then
    echo -e "${RED}Error: Client name is required${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Select environment type:${NC}"
echo "1) Production"
echo "2) Sandbox"
echo "3) Development"
echo "4) Scratch"
echo "5) Custom"
read -p "Enter choice (1-5): " ENV_CHOICE

case $ENV_CHOICE in
    1) ENV_TYPE="Production"
       INSTANCE_URL="https://login.salesforce.com"
       ALLOW_DESTRUCTIVE="false"
       REQUIRE_APPROVAL="true"
       ;;
    2) ENV_TYPE="Sandbox"
       INSTANCE_URL="https://test.salesforce.com"
       ALLOW_DESTRUCTIVE="true"
       REQUIRE_APPROVAL="false"
       ;;
    3) ENV_TYPE="Development"
       INSTANCE_URL="https://login.salesforce.com"
       ALLOW_DESTRUCTIVE="true"
       REQUIRE_APPROVAL="false"
       ;;
    4) ENV_TYPE="Scratch"
       INSTANCE_URL="https://test.salesforce.com"
       ALLOW_DESTRUCTIVE="true"
       REQUIRE_APPROVAL="false"
       ;;
    5) read -p "Enter environment name: " ENV_TYPE
       read -p "Enter instance URL: " INSTANCE_URL
       read -p "Allow destructive changes? (true/false): " ALLOW_DESTRUCTIVE
       read -p "Require approval? (true/false): " REQUIRE_APPROVAL
       ;;
    *) echo -e "${RED}Invalid choice${NC}"
       exit 1
       ;;
esac

# Generate org alias
ORG_ALIAS=$(echo "${CLIENT_NAME}-${ENV_TYPE}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
read -p "Salesforce Org Alias [$ORG_ALIAS]: " USER_ALIAS
ORG_ALIAS=${USER_ALIAS:-$ORG_ALIAS}

# Create project directory
PROJECT_NAME="${CLIENT_NAME}-${ENV_TYPE}"
PROJECT_DIR="$PROJECTS_ROOT/$PROJECT_NAME"

if [ -d "$PROJECT_DIR" ]; then
    echo -e "${RED}Error: Project directory already exists: $PROJECT_DIR${NC}"
    read -p "Do you want to overwrite it? (y/n): " OVERWRITE
    if [ "$OVERWRITE" != "y" ]; then
        exit 1
    fi
    rm -rf "$PROJECT_DIR"
fi

echo -e "\n${YELLOW}Creating project structure...${NC}"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Create directory structure
mkdir -p .claude/agents
mkdir -p force-app/main/default/classes
mkdir -p force-app/main/default/objects
mkdir -p force-app/main/default/flows
mkdir -p config
mkdir -p scripts
mkdir -p data
mkdir -p docs

# Initialize Git
git init
echo -e "${GREEN}✓ Git repository initialized${NC}"

# Create .mcp.json
cat > .mcp.json << EOF
{
  "mcpServers": {
    "salesforce-dx": {
      "command": "npx",
      "args": [
        "-y",
        "@salesforce/mcp",
        "--orgs", "${ORG_ALIAS}",
        "--toolsets", "all"
      ],
      "env": {
        "SF_LOG_LEVEL": "info",
        "PROJECT_NAME": "${PROJECT_NAME}"
      }
    }
  }
}
EOF
echo -e "${GREEN}✓ MCP configuration created${NC}"

# Create .env
cat > .env << EOF
# Instance Configuration
INSTANCE_NAME="${CLIENT_NAME} ${ENV_TYPE}"
INSTANCE_TYPE="${ENV_TYPE}"
SF_TARGET_ORG="${ORG_ALIAS}"
SF_API_VERSION="60.0"

# Project Settings
PROJECT_ROOT="${PROJECT_DIR}"
SHARED_AGENTS_PATH="${SHARED_DIR}/agents"

# Security Settings
ALLOW_DESTRUCTIVE_CHANGES="${ALLOW_DESTRUCTIVE}"
REQUIRE_APPROVAL="${REQUIRE_APPROVAL}"

# Client Information
CLIENT_NAME="${CLIENT_NAME}"
INSTANCE_URL="${INSTANCE_URL}"

# Created
CREATED_DATE="$(date +%Y-%m-%d)"
CREATED_BY="$(whoami)"
EOF
echo -e "${GREEN}✓ Environment configuration created${NC}"

# Create Salesforce project config (sfdx-project.json)
cat > sfdx-project.json << EOF
{
  "packageDirectories": [
    {
      "path": "force-app",
      "default": true
    }
  ],
  "name": "${PROJECT_NAME}",
  "namespace": "",
  "sfdcLoginUrl": "${INSTANCE_URL}",
  "sourceApiVersion": "60.0"
}
EOF
echo -e "${GREEN}✓ Salesforce project configuration created${NC}"

# Copy shared agents
if [ -d "$SHARED_DIR/.claude/agents" ]; then
    cp -r "$SHARED_DIR/.claude/agents/"* .claude/agents/
    echo -e "${GREEN}✓ Shared agents copied${NC}"
fi

# Create instance-specific CLAUDE.md
cat > CLAUDE.md << EOF
# ${CLIENT_NAME} - ${ENV_TYPE}

This is a Salesforce instance project for ${CLIENT_NAME} ${ENV_TYPE} environment.

## Instance Information
- **Client**: ${CLIENT_NAME}
- **Environment**: ${ENV_TYPE}
- **Org Alias**: ${ORG_ALIAS}
- **Instance URL**: ${INSTANCE_URL}
- **Created**: $(date +%Y-%m-%d)

## Configuration
- **Allow Destructive Changes**: ${ALLOW_DESTRUCTIVE}
- **Require Approval**: ${REQUIRE_APPROVAL}

## Quick Start
1. Ensure you're authenticated: \`sf org display -o ${ORG_ALIAS}\`
2. Start Claude Code: \`claude\`
3. MCP server will automatically connect to ${ORG_ALIAS}

## Project Structure
\`\`\`
${PROJECT_NAME}/
├── .claude/              # Claude Code configuration
├── force-app/           # Salesforce metadata
├── config/              # Project configuration
├── scripts/             # Utility scripts
├── data/                # Test data
└── docs/                # Documentation
\`\`\`

## Available Agents
All shared Salesforce agents are available in this instance.
See .claude/agents/ for the full list.

## Notes
Add instance-specific notes here...
EOF
echo -e "${GREEN}✓ Instance documentation created${NC}"

# Create README.md
cat > README.md << EOF
# ${PROJECT_NAME}

Salesforce instance project for ${CLIENT_NAME} - ${ENV_TYPE}

## Setup
1. Authenticate: \`sf org login web --alias ${ORG_ALIAS} --instance-url ${INSTANCE_URL}\`
2. Set as default: \`sf config set target-org=${ORG_ALIAS}\`
3. Start Claude: \`claude\`

## Instance Details
- Org Alias: ${ORG_ALIAS}
- Environment: ${ENV_TYPE}
- Created: $(date +%Y-%m-%d)
EOF
echo -e "${GREEN}✓ README created${NC}"

# Create .gitignore
cat > .gitignore << EOF
# Salesforce
.sf/
**/jsconfig.json
**/.eslintrc.json

# Environment
.env
.env.local
*.env

# Credentials
*.key
*.cert
*.pem

# Logs
*.log
logs/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.sublime-*

# Dependencies
node_modules/

# Claude
.claude/settings.local.json
EOF
echo -e "${GREEN}✓ Git ignore file created${NC}"

# Authenticate to Salesforce
echo -e "\n${YELLOW}Ready to authenticate to Salesforce${NC}"
read -p "Do you want to authenticate now? (y/n): " AUTH_NOW

if [ "$AUTH_NOW" = "y" ]; then
    echo -e "${YELLOW}Opening browser for authentication...${NC}"
    if [ "$ENV_TYPE" = "Scratch" ]; then
        # For scratch orgs, need DevHub first
        read -p "Enter DevHub alias (or press Enter to skip): " DEVHUB_ALIAS
        if [ -n "$DEVHUB_ALIAS" ]; then
            sf org create scratch --definition-file config/project-scratch-def.json --alias "$ORG_ALIAS" --target-dev-hub "$DEVHUB_ALIAS" --set-default
        fi
    else
        sf org login web --alias "$ORG_ALIAS" --instance-url "$INSTANCE_URL" --set-default
    fi
    
    # Verify authentication
    if sf org display --target-org "$ORG_ALIAS" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Successfully authenticated to Salesforce${NC}"
    else
        echo -e "${YELLOW}⚠ Authentication may not have completed successfully${NC}"
    fi
fi

# Create quick access script
cat > "$PROJECTS_ROOT/open-${ORG_ALIAS}.sh" << EOF
#!/bin/bash
cd "${PROJECT_DIR}"
claude
EOF
chmod +x "$PROJECTS_ROOT/open-${ORG_ALIAS}.sh"

# Final summary
echo -e "\n${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Setup Complete! 🎉             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Project created at:${NC} $PROJECT_DIR"
echo -e "${GREEN}Org alias:${NC} $ORG_ALIAS"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. cd $PROJECT_DIR"
if [ "$AUTH_NOW" != "y" ]; then
    echo "2. sf org login web --alias $ORG_ALIAS --instance-url $INSTANCE_URL"
    echo "3. claude"
else
    echo "2. claude"
fi
echo ""
echo -e "${YELLOW}Quick access:${NC}"
echo "  $PROJECTS_ROOT/open-${ORG_ALIAS}.sh"
echo ""
echo -e "${GREEN}Happy Salesforcing! 🚀${NC}"
