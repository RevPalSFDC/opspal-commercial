#!/bin/bash

###############################################################################
# MCP Server Wrapper Script
# Ensures singleton operation and proper lifecycle management
# Usage: ./mcp-wrapper.sh <server-name> [options]
###############################################################################

set -euo pipefail

# Load project-local env defaults (Salesforce only)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/lib/env.sh" ]]; then
    # shellcheck source=lib/env.sh
    source "${SCRIPT_DIR}/lib/env.sh"
fi

# Configuration
LOCK_DIR="${TMP_DIR:-/tmp}/mcp-locks"
LOG_DIR="${LOG_DIR:-${HOME}/.local/state/claudesfdc/logs}/mcp-servers"
MAX_MEMORY_MB=512
HEALTH_CHECK_PORT=3001
MANAGER_URL="http://localhost:${HEALTH_CHECK_PORT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
SERVER_NAME="${1:-}"
shift || true

if [ -z "$SERVER_NAME" ]; then
    echo -e "${RED}Error: Server name required${NC}"
    echo "Usage: $0 <server-name> [options]"
    echo "Available servers: asana, salesforce, error-logging"
    exit 1
fi

# Function to check if manager is running
check_manager() {
    if curl -s "${MANAGER_URL}/health" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to start the manager if not running
ensure_manager() {
    if ! check_manager; then
        echo -e "${YELLOW}MCP Manager not running. Starting...${NC}"
        
        # Start the manager
        cd "$(dirname "$0")/../mcp-manager"
        mkdir -p "${LOG_DIR}"
        nohup node index.js > "${LOG_DIR}/mcp-manager.log" 2>&1 &
        
        # Wait for manager to start
        local count=0
        while [ $count -lt 30 ]; do
            if check_manager; then
                echo -e "${GREEN}✓ MCP Manager started${NC}"
                return 0
            fi
            sleep 1
            count=$((count + 1))
        done
        
        echo -e "${RED}Failed to start MCP Manager${NC}"
        exit 1
    fi
}

# Function to check if server is already running
check_server_status() {
    local status=$(curl -s "${MANAGER_URL}/status/${SERVER_NAME}" 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "$status" | grep -q '"exists":true'
        return $?
    fi
    return 1
}

# Function to start server through manager
start_server() {
    local config="{}"
    
    # Build configuration based on server type
    case "$SERVER_NAME" in
        asana)
            config=$(cat <<EOF
{
    "asanaToken": "${ASANA_ACCESS_TOKEN:-}",
    "workspaceId": "${ASANA_WORKSPACE_ID:-}"
}
EOF
            )
            ;;
        salesforce)
            config=$(cat <<EOF
{
    "orgAlias": "${SF_TARGET_ORG:-DEFAULT_TARGET_ORG}"
}
EOF
            )
            ;;
    esac
    
    # Request manager to start the server
    local response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$config" \
        "${MANAGER_URL}/start/${SERVER_NAME}" 2>/dev/null)
    
    if echo "$response" | grep -q '"success":true'; then
        if echo "$response" | grep -q '"alreadyRunning":true'; then
            echo -e "${YELLOW}Server ${SERVER_NAME} is already running${NC}"
        else
            echo -e "${GREEN}✓ Server ${SERVER_NAME} started successfully${NC}"
            local pid=$(echo "$response" | grep -o '"pid":[0-9]*' | cut -d: -f2)
            echo -e "${BLUE}Process ID: ${pid}${NC}"
        fi
        return 0
    else
        echo -e "${RED}Failed to start server ${SERVER_NAME}${NC}"
        echo "$response"
        return 1
    fi
}

# Function to stop server through manager
stop_server() {
    local response=$(curl -s -X POST "${MANAGER_URL}/stop/${SERVER_NAME}" 2>/dev/null)
    
    if echo "$response" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ Server ${SERVER_NAME} stopped successfully${NC}"
        return 0
    else
        echo -e "${RED}Failed to stop server ${SERVER_NAME}${NC}"
        echo "$response"
        return 1
    fi
}

# Function to restart server
restart_server() {
    local response=$(curl -s -X POST "${MANAGER_URL}/restart/${SERVER_NAME}" 2>/dev/null)
    
    if echo "$response" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ Server ${SERVER_NAME} restarted successfully${NC}"
        return 0
    else
        echo -e "${RED}Failed to restart server ${SERVER_NAME}${NC}"
        echo "$response"
        return 1
    fi
}

# Function to show server status
show_status() {
    local response=$(curl -s "${MANAGER_URL}/health" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        echo -e "${BLUE}=== MCP Server Status ===${NC}"
        echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    else
        echo -e "${RED}MCP Manager is not running${NC}"
    fi
}

# Function to clean up on exit
cleanup() {
    echo -e "${YELLOW}Cleaning up...${NC}"
    
    # Stop server if we started it
    if [ -n "$STARTED_SERVER" ]; then
        stop_server
    fi
}

# Set up signal handlers
trap cleanup EXIT
trap cleanup SIGINT
trap cleanup SIGTERM

# Main execution
case "${1:-start}" in
    start)
        echo -e "${BLUE}Starting MCP Server: ${SERVER_NAME}${NC}"
        ensure_manager
        
        if check_server_status; then
            echo -e "${YELLOW}Server ${SERVER_NAME} is already running${NC}"
            show_status
            exit 0
        fi
        
        start_server
        STARTED_SERVER=1
        
        # Keep script running if in foreground mode
        if [ "${2:-}" = "--foreground" ] || [ "${2:-}" = "-f" ]; then
            echo -e "${BLUE}Running in foreground mode. Press Ctrl+C to stop.${NC}"
            while true; do
                sleep 10
                if ! check_server_status; then
                    echo -e "${RED}Server ${SERVER_NAME} stopped unexpectedly${NC}"
                    exit 1
                fi
            done
        fi
        ;;
        
    stop)
        echo -e "${BLUE}Stopping MCP Server: ${SERVER_NAME}${NC}"
        ensure_manager
        stop_server
        ;;
        
    restart)
        echo -e "${BLUE}Restarting MCP Server: ${SERVER_NAME}${NC}"
        ensure_manager
        restart_server
        ;;
        
    status)
        ensure_manager
        show_status
        ;;
        
    check)
        if check_server_status; then
            echo -e "${GREEN}Server ${SERVER_NAME} is running${NC}"
            exit 0
        else
            echo -e "${YELLOW}Server ${SERVER_NAME} is not running${NC}"
            exit 1
        fi
        ;;
        
    *)
        echo -e "${RED}Unknown command: ${1}${NC}"
        echo "Usage: $0 <server-name> [start|stop|restart|status|check] [options]"
        echo ""
        echo "Commands:"
        echo "  start    - Start the server (default)"
        echo "  stop     - Stop the server"
        echo "  restart  - Restart the server"
        echo "  status   - Show status of all servers"
        echo "  check    - Check if server is running"
        echo ""
        echo "Options:"
        echo "  --foreground, -f  - Run in foreground mode"
        exit 1
        ;;
esac
