#!/bin/bash

# Quick wrapper script to create Asana tasks from fix plans
# Usage: ./scripts/create-tasks.sh [fix-plans-file.json]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Navigate to repo root
cd "$REPO_ROOT"

echo -e "${BLUE}🚀 Asana Task Creator${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Check for fix plans file argument
if [ $# -eq 0 ]; then
    echo -e "${RED}❌ Error: No fix plans file specified${NC}"
    echo
    echo "Usage: $0 <fix-plans-file.json>"
    echo
    echo "Example:"
    echo "  $0 ./reports/fix-plans-2025-10-12T16-12-00.json"
    echo
    exit 1
fi

FIX_PLANS_FILE="$1"

# Check if file exists
if [ ! -f "$FIX_PLANS_FILE" ]; then
    echo -e "${RED}❌ Error: Fix plans file not found: $FIX_PLANS_FILE${NC}"
    exit 1
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo
    echo "Please create .env with required variables:"
    echo "  ASANA_ACCESS_TOKEN=..."
    echo "  ASANA_WORKSPACE_ID=..."
    echo
    exit 1
fi

# Load environment variables
echo -e "${YELLOW}📋 Loading environment variables...${NC}"
export $(cat .env | grep -v '^#' | xargs)

# Check for required environment variables
if [ -z "$ASANA_ACCESS_TOKEN" ]; then
    echo -e "${RED}❌ Error: ASANA_ACCESS_TOKEN not set in .env${NC}"
    exit 1
fi

if [ -z "$ASANA_WORKSPACE_ID" ]; then
    echo -e "${YELLOW}⚠️  Warning: ASANA_WORKSPACE_ID not set (using workspace from .asana-links.json)${NC}"
fi

# Check for .asana-links.json
if [ ! -f ".asana-links.json" ]; then
    echo -e "${RED}❌ Error: .asana-links.json not found${NC}"
    echo
    echo "This file should contain Asana project configuration."
    exit 1
fi

# Display configuration
echo -e "${GREEN}✅ Configuration loaded${NC}"
echo
echo "Fix Plans: $FIX_PLANS_FILE"
echo "Project: $(cat .asana-links.json | jq -r '.projects[] | select(.primary==true) | .name')"
echo "Workspace: $(cat .asana-links.json | jq -r '.workspace_name')"
echo

# Run the Node.js script
echo -e "${BLUE}🔨 Creating Asana tasks...${NC}"
echo

node "$SCRIPT_DIR/create-asana-tasks-from-fix-plans.js" "$FIX_PLANS_FILE"

# Check exit code
if [ $? -eq 0 ]; then
    echo
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ Tasks created successfully!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    echo -e "View tasks: ${BLUE}$(cat .asana-links.json | jq -r '.projects[] | select(.primary==true) | .permalink_url')${NC}"
    echo
else
    echo
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}❌ Task creation failed${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    echo "Check the error messages above for details."
    echo
    exit 1
fi
