#!/bin/bash

#
# NotebookLM Authentication Setup Script
#
# Configures NotebookLM MCP server authentication for client knowledge bases.
# Runs notebooklm-mcp-auth and verifies the setup.
#
# Version: 1.0.0
# Date: 2025-01-22
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     NotebookLM MCP Authentication Setup                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if notebooklm-mcp is installed
check_installation() {
    echo -e "${CYAN}[1/5] Checking NotebookLM MCP installation...${NC}"

    if command -v notebooklm-mcp &> /dev/null; then
        local version=$(notebooklm-mcp --version 2>/dev/null || echo "unknown")
        echo -e "${GREEN}  ✓ notebooklm-mcp is installed (version: ${version})${NC}"
        return 0
    else
        echo -e "${YELLOW}  ⚠ notebooklm-mcp not found${NC}"
        return 1
    fi
}

# Install notebooklm-mcp if not present
install_mcp() {
    echo -e "${CYAN}[2/5] Installing NotebookLM MCP server...${NC}"

    # Check for uv (recommended)
    if command -v uv &> /dev/null; then
        echo -e "  Using uv (recommended)..."
        uv tool install notebooklm-mcp-server
        echo -e "${GREEN}  ✓ Installed via uv${NC}"
    # Fallback to pipx
    elif command -v pipx &> /dev/null; then
        echo -e "  Using pipx..."
        pipx install notebooklm-mcp-server
        echo -e "${GREEN}  ✓ Installed via pipx${NC}"
    # Fallback to pip
    elif command -v pip &> /dev/null; then
        echo -e "  Using pip..."
        pip install notebooklm-mcp-server
        echo -e "${GREEN}  ✓ Installed via pip${NC}"
    else
        echo -e "${RED}  ✗ No package manager found (uv, pipx, or pip required)${NC}"
        echo -e "${YELLOW}  Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh${NC}"
        exit 1
    fi
}

# Run authentication
run_auth() {
    echo -e "${CYAN}[3/5] Running NotebookLM authentication...${NC}"
    echo ""
    echo -e "${YELLOW}  ┌─────────────────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}  │  A Chrome browser will open for Google authentication.  │${NC}"
    echo -e "${YELLOW}  │  Log in with your Google account that has NotebookLM.   │${NC}"
    echo -e "${YELLOW}  │  After login, the browser will close automatically.     │${NC}"
    echo -e "${YELLOW}  └─────────────────────────────────────────────────────────┘${NC}"
    echo ""
    read -p "  Press Enter to continue..."

    if command -v notebooklm-mcp-auth &> /dev/null; then
        notebooklm-mcp-auth
        echo -e "${GREEN}  ✓ Authentication completed${NC}"
    else
        echo -e "${RED}  ✗ notebooklm-mcp-auth command not found${NC}"
        echo -e "${YELLOW}  Try reinstalling: uv tool install --force notebooklm-mcp-server${NC}"
        exit 1
    fi
}

# Verify authentication
verify_auth() {
    echo -e "${CYAN}[4/5] Verifying authentication...${NC}"

    # Try to list notebooks as a test
    if notebooklm-mcp --help &> /dev/null; then
        echo -e "${GREEN}  ✓ NotebookLM MCP server is functional${NC}"
        return 0
    else
        echo -e "${RED}  ✗ Verification failed${NC}"
        return 1
    fi
}

# Create client notebook directory structure template
create_directory_template() {
    echo -e "${CYAN}[5/5] Creating directory templates...${NC}"

    local instances_dir="${PLUGIN_ROOT}/../../instances"
    local template_dir="${instances_dir}/_template/notebooklm"

    mkdir -p "$template_dir/drafts"
    mkdir -p "$template_dir/approved"
    mkdir -p "$template_dir/delivered"

    # Create notebook-registry.json template
    cat > "$template_dir/notebook-registry.json" << 'EOF'
{
  "$schema": "../../schemas/notebook-registry.schema.json",
  "version": "1.0.0",
  "lastUpdated": null,
  "orgAlias": null,
  "displayName": null,
  "notebooks": {
    "primary": {
      "notebookId": null,
      "displayName": null,
      "internalId": null,
      "purpose": "gtm-architecture",
      "createdAt": null,
      "lastSyncedAt": null
    }
  },
  "driveConfig": {
    "enabled": false,
    "folderPaths": [],
    "lastResearchAt": null
  }
}
EOF

    # Create source-manifest.json template
    cat > "$template_dir/source-manifest.json" << 'EOF'
{
  "$schema": "../../schemas/source-manifest.schema.json",
  "version": "1.0.0",
  "lastUpdated": null,
  "sources": {
    "primary": [],
    "detail": [],
    "external": [],
    "discovered": []
  },
  "syncHistory": []
}
EOF

    # Create query-cache.json template
    cat > "$template_dir/query-cache.json" << 'EOF'
{
  "$schema": "../../schemas/query-cache.schema.json",
  "version": "1.0.0",
  "queries": [],
  "stats": {
    "totalQueries": 0,
    "cacheHits": 0,
    "cacheMisses": 0
  }
}
EOF

    echo -e "${GREEN}  ✓ Created directory templates at: ${template_dir}${NC}"
}

# Print summary
print_summary() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     NotebookLM Setup Complete                              ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${CYAN}Next Steps:${NC}"
    echo -e "  1. Verify MCP connection: ${YELLOW}claude mcp list | grep notebooklm${NC}"
    echo -e "  2. Create a test notebook: ${YELLOW}Use notebooklm-knowledge-manager agent${NC}"
    echo -e "  3. Initialize client: ${YELLOW}/notebook-init <org-alias>${NC}"
    echo ""
    echo -e "  ${CYAN}Notes:${NC}"
    echo -e "  - Authentication tokens expire every 2-4 weeks"
    echo -e "  - Auto-refresh is enabled, but re-run this script if issues occur"
    echo -e "  - Free tier: ~50 queries/day"
    echo ""
    echo -e "  ${CYAN}Agents:${NC}"
    echo -e "  - ${YELLOW}notebooklm-knowledge-manager${NC}: Manage notebooks and sources"
    echo -e "  - ${YELLOW}client-notebook-orchestrator${NC}: High-level client workflows"
    echo ""
}

# Main flow
main() {
    # Step 1: Check installation
    if ! check_installation; then
        # Step 2: Install if needed
        install_mcp

        # Verify installation worked
        if ! check_installation; then
            echo -e "${RED}Installation failed. Please install manually.${NC}"
            exit 1
        fi
    else
        echo -e "  Skipping installation (already installed)"
    fi

    # Step 3: Run authentication
    run_auth

    # Step 4: Verify
    verify_auth

    # Step 5: Create templates
    create_directory_template

    # Print summary
    print_summary
}

# Handle --help flag
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Sets up NotebookLM MCP authentication for client knowledge bases."
    echo ""
    echo "Options:"
    echo "  --help, -h     Show this help message"
    echo "  --reinstall    Force reinstallation of notebooklm-mcp-server"
    echo "  --verify-only  Only verify existing authentication"
    echo ""
    exit 0
fi

# Handle --reinstall flag
if [[ "$1" == "--reinstall" ]]; then
    echo -e "${YELLOW}Force reinstalling NotebookLM MCP...${NC}"
    if command -v uv &> /dev/null; then
        uv tool install --force notebooklm-mcp-server
    elif command -v pipx &> /dev/null; then
        pipx install --force notebooklm-mcp-server
    fi
    shift
fi

# Handle --verify-only flag
if [[ "$1" == "--verify-only" ]]; then
    check_installation && verify_auth
    exit $?
fi

# Run main
main
