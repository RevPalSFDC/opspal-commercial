#!/bin/bash

# ============================================================================
# Salesforce Project Initializer Wrapper
# Creates standardized project structure for all Salesforce operations
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_INITIALIZER="$SCRIPT_DIR/lib/project-initializer.js"

# Function to show usage
show_usage() {
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║        Salesforce Project Initializer                       ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Usage: $0 <project-name> <org-alias> [options]"
    echo ""
    echo "Arguments:"
    echo "  project-name    Descriptive name for the project (e.g., 'contact-cleanup')"
    echo "  org-alias      Salesforce org alias (e.g., 'example-company-production')"
    echo ""
    echo "Options:"
    echo "  --type <type>  Project type (data-cleanup, deployment, analysis, report-creation)"
    echo "  --git          Initialize git repository"
    echo "  --dir <path>   Custom base directory for project"
    echo "  --quick        Skip confirmations"
    echo ""
    echo "Examples:"
    echo "  $0 \"contact-cleanup\" \"example-company-production\" --type data-cleanup --git"
    echo "  $0 \"field-deployment\" \"sample-org-sandbox\" --type deployment"
    echo "  $0 \"revops-audit\" \"acme-corp-staging\" --type analysis"
    echo ""
    exit 0
}

# Parse arguments
if [ $# -lt 2 ]; then
    show_usage
fi

PROJECT_NAME="$1"
ORG_ALIAS="$2"
shift 2

# Default options
PROJECT_TYPE=""
INIT_GIT=""
BASE_DIR=""
QUICK_MODE=false

# Parse optional arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --type)
            PROJECT_TYPE="$2"
            shift 2
            ;;
        --git)
            INIT_GIT="--git"
            shift
            ;;
        --dir)
            BASE_DIR="$2"
            shift 2
            ;;
        --quick)
            QUICK_MODE=true
            shift
            ;;
        --help|-h)
            show_usage
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_usage
            ;;
    esac
done

# Validate project name (allow letters, numbers, spaces, hyphens, underscores)
if [[ ! "$PROJECT_NAME" =~ ^[a-zA-Z0-9\ _-]+$ ]]; then
    echo -e "${RED}Error: Project name can only contain letters, numbers, spaces, hyphens, and underscores${NC}"
    exit 1
fi

# Check if org exists (optional validation)
check_org() {
    if command -v sf &> /dev/null; then
        if ! sf org display --target-org "$ORG_ALIAS" &> /dev/null; then
            echo -e "${YELLOW}Warning: Org '$ORG_ALIAS' not found or not authenticated${NC}"
            echo -e "${YELLOW}You may need to authenticate first: sf org login web --alias $ORG_ALIAS${NC}"
            if [ "$QUICK_MODE" = false ]; then
                read -p "Continue anyway? (y/n): " -n 1 -r
                echo
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    exit 1
                fi
            fi
        else
            echo -e "${GREEN}✓ Org '$ORG_ALIAS' verified${NC}"
        fi
    fi
}

# Display project information
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Creating Salesforce Project${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${YELLOW}Project:${NC} $PROJECT_NAME"
echo -e "  ${YELLOW}Org:${NC} $ORG_ALIAS"
if [ -n "$PROJECT_TYPE" ]; then
    echo -e "  ${YELLOW}Type:${NC} $PROJECT_TYPE"
fi
if [ -n "$INIT_GIT" ]; then
    echo -e "  ${YELLOW}Git:${NC} Will initialize repository"
fi
if [ -n "$BASE_DIR" ]; then
    echo -e "  ${YELLOW}Location:${NC} $BASE_DIR"
fi
echo ""

# Confirm unless in quick mode
if [ "$QUICK_MODE" = false ]; then
    read -p "Create this project? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
fi

# Check org exists
check_org

# Build command
CMD="node \"$PROJECT_INITIALIZER\" \"$PROJECT_NAME\" \"$ORG_ALIAS\""

if [ -n "$PROJECT_TYPE" ]; then
    CMD="$CMD --type \"$PROJECT_TYPE\""
fi

if [ -n "$INIT_GIT" ]; then
    CMD="$CMD --git"
fi

if [ -n "$BASE_DIR" ]; then
    CMD="$CMD --dir \"$BASE_DIR\""
fi

# Execute project initialization
echo -e "${GREEN}Initializing project...${NC}"
echo ""

eval $CMD

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  Project Created Successfully!               ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Generate project directory name
    DATE=$(date +%Y-%m-%d)
    PROJECT_DIR_NAME=$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g')
    if [ -n "$BASE_DIR" ]; then
        PROJECT_PATH="$BASE_DIR/${PROJECT_DIR_NAME}-${DATE}"
    else
        PROJECT_PATH="${PROJECT_DIR_NAME}-${DATE}"
    fi

    echo -e "${YELLOW}Quick Start Commands:${NC}"
    echo -e "  cd $PROJECT_PATH"
    echo -e "  cat README.md                    # Review project structure"
    echo -e "  node scripts/00-todo-template.js # Get TodoWrite template"
    echo -e "  node scripts/01-query-current-state.js # Start project"
    echo ""

    # Offer to open in editor if VS Code is available
    if command -v code &> /dev/null && [ "$QUICK_MODE" = false ]; then
        read -p "Open in VS Code? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            code "$PROJECT_PATH"
        fi
    fi
else
    echo ""
    echo -e "${RED}Project initialization failed. Check the error messages above.${NC}"
    exit 1
fi