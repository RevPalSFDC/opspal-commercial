#!/usr/bin/env bash

##############################################################################
# post-portal-switch.sh - Post Portal Switch Hook
#
# TRIGGER: Automatically runs after switching HubSpot portals
# PURPOSE: Reload MCP server environment to prevent stale API key issues
#
# PROBLEM: MCP servers cache environment variables at startup. After portal
#          switch, HUBSPOT_API_KEY changes in .env but MCP server still uses
#          old key, causing 401 authentication errors.
#
# SOLUTION: Detect environment changes and notify user to reload MCP or
#           automatically restart affected MCP servers if supported.
#
# USAGE: Automatically invoked by switch-portal.sh script
#        Can also be manually triggered: ./.claude/hooks/post-portal-switch.sh
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="post-portal-switch"
fi

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Post-Portal Switch Hook${NC}"

# Get current portal from .env
if [ -f .env ]; then
    PORTAL_NAME=$(grep "HUBSPOT_ACTIVE_PORTAL=" .env | cut -d'=' -f2 || echo "unknown")
    PORTAL_ID=$(grep "HUBSPOT_PORTAL_ID=" .env | cut -d'=' -f2 || echo "unknown")

    echo -e "${GREEN}✓${NC} Switched to portal: ${PORTAL_NAME} (ID: ${PORTAL_ID})"
else
    echo -e "${YELLOW}⚠${NC}  Warning: .env file not found"
    exit 0
fi

# Check if MCP configuration exists
if [ ! -f .mcp.json ]; then
    echo -e "${YELLOW}⚠${NC}  No .mcp.json found, skipping MCP server checks"
    exit 0
fi

# Notify user about MCP environment reload
echo ""
echo -e "${YELLOW}⚠${NC}  Important: MCP servers may have cached old credentials"
echo -e "   ${BLUE}Action Required:${NC}"
echo -e "   1. Restart Claude Code to reload MCP servers, OR"
echo -e "   2. Use direct scripts instead of MCP tools for next operation"
echo ""
echo -e "   ${GREEN}✓${NC} Recommended: Use ./scripts/run-with-env.sh for scripts"
echo -e "   ${GREEN}✓${NC} Recommended: Restart Claude Code for MCP tool access"
echo ""

# Log the portal switch
LOG_DIR="${HOME}/.claude/logs/hubspot"
if ! mkdir -p "$LOG_DIR" 2>/dev/null; then
    FALLBACK_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
    LOG_DIR="${FALLBACK_ROOT}/.claude/logs/hubspot"
    mkdir -p "$LOG_DIR" 2>/dev/null || true
fi
LOG_FILE="$LOG_DIR/portal-switches.log"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
if ! echo "[$TIMESTAMP] Portal switched to: $PORTAL_NAME (ID: $PORTAL_ID)" >> "$LOG_FILE" 2>/dev/null; then
    echo -e "${YELLOW}⚠${NC}  Unable to write portal switch log: $LOG_FILE"
fi

# Optional: Check if we can detect MCP server PIDs (advanced)
# This would require additional tooling to safely restart MCP servers
# For now, we'll just notify the user

echo -e "${GREEN}✓${NC} Portal switch hook completed"
echo ""

exit 0
