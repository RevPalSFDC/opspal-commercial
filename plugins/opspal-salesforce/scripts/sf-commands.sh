#!/bin/bash

# Salesforce Instance Management Commands for Claude Code
# Usage: ./sf-commands.sh [command] [args]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
PERSIST_CONFIG="$BASE_DIR/scripts/persist-instance-config.sh"
INIT_SCRIPT="$BASE_DIR/scripts/init-salesforce-instance.sh"
ENSURE_SCRIPT="$BASE_DIR/scripts/ensure-instance-ready.js"
SWITCH_SCRIPT="$BASE_DIR/scripts/switch-instance.sh"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

function sf_help() {
    echo -e "${BLUE}Salesforce Instance Management Commands${NC}"
    echo ""
    echo "Usage: ./sf-commands.sh [command] [args]"
    echo ""
    echo "Commands:"
    echo "  new              - Create a new Salesforce instance"
    echo "  switch <name>    - Switch to an existing instance"
    echo "  list             - List all configured instances"
    echo "  current          - Show current active instance"
    echo "  auth <alias>     - Authenticate with Salesforce org"
    echo "  open <name>      - Open instance directory in new shell"
    echo "  quick <name>     - Quick switch (load config + cd to directory)"
    echo "  info <name>      - Show instance details"
    echo "  sync             - Sync all instance configurations"
    echo ""
}

function sf_new() {
    echo -e "${GREEN}Creating new Salesforce instance...${NC}"
    read -p "Org alias: " alias
    if [ -z "$alias" ]; then
        echo -e "${RED}Error: Org alias required${NC}"
        exit 1
    fi

    read -p "Environment (production|sandbox|uat|dev) [auto]: " env
    read -p "Login URL (optional): " login_url

    args=(--org "$alias" --create --set-current)
    if [ -n "$env" ]; then
        args+=(--environment "$env")
    fi
    if [ -n "$login_url" ]; then
        args+=(--login-url "$login_url")
    fi

    node "$ENSURE_SCRIPT" "${args[@]}"
}

function sf_switch() {
    local instance_name="$1"
    if [ -z "$instance_name" ]; then
        echo -e "${YELLOW}Available instances:${NC}"
        sf_list
        echo ""
        read -p "Enter instance name to switch to: " instance_name
    fi

    echo -e "${GREEN}Switching to instance: $instance_name${NC}"
    bash "$SWITCH_SCRIPT" "$instance_name"
}

function sf_list() {
    node "$ENSURE_SCRIPT" --discover 2>/dev/null | awk '{print "  - " $1}'
}

function sf_current() {
    if [ -n "${SF_TARGET_ORG:-}" ]; then
        echo "Current instance (env): $SF_TARGET_ORG"
        return
    fi

    local instances_root
    instances_root=$(node "$ENSURE_SCRIPT" --print-root 2>/dev/null || true)
    if [ -z "$instances_root" ]; then
        echo "No instance currently set"
        return
    fi

    local config_path="$instances_root/config.json"
    if [ "$(basename "$instances_root")" = "salesforce" ] || [ "$(basename "$instances_root")" = "hubspot" ]; then
        config_path="$(dirname "$instances_root")/config.json"
    fi

    if [ -f "$config_path" ]; then
        node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('$config_path','utf8'));console.log(c.currentInstance || 'No instance currently set');"
    else
        echo "No instance currently set"
    fi
}

function sf_auth() {
    local alias="$1"
    if [ -z "$alias" ]; then
        read -p "Enter org alias: " alias
    fi

    echo -e "${GREEN}Authenticating with Salesforce org: $alias${NC}"
    local instance_dir
    instance_dir=$(node "$ENSURE_SCRIPT" --org "$alias" --print-dir --create 2>/dev/null || true)
    local login_url=""
    if [ -n "$instance_dir" ] && [ -f "$instance_dir/sfdx-project.json" ]; then
        login_url=$(node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('$instance_dir/sfdx-project.json','utf8'));if(c.sfdcLoginUrl)process.stdout.write(c.sfdcLoginUrl);" 2>/dev/null)
    fi

    if [ -n "$login_url" ]; then
        sf org login web --alias "$alias" --instance-url "$login_url" --set-default
    else
        sf org login web --alias "$alias" --set-default
    fi
}

function sf_open() {
    local instance_name="$1"
    if [ -z "$instance_name" ]; then
        echo -e "${YELLOW}Available instances:${NC}"
        sf_list
        echo ""
        read -p "Enter instance name to open: " instance_name
    fi

    local instance_dir
    instance_dir=$(node "$ENSURE_SCRIPT" --org "$instance_name" --print-dir --no-create 2>/dev/null || true)
    if [ -n "$instance_dir" ] && [ -d "$instance_dir" ]; then
        echo -e "${GREEN}Opening $instance_name in new shell...${NC}"
        gnome-terminal --working-directory="$instance_dir" 2>/dev/null || \
        xterm -e "cd '$instance_dir' && bash" 2>/dev/null || \
        echo -e "${YELLOW}Please manually navigate to: $instance_dir${NC}"
    else
        echo -e "${RED}Error: Instance directory not found for $instance_name${NC}"
    fi
}

function sf_quick() {
    local instance_name="$1"
    if [ -z "$instance_name" ]; then
        echo -e "${YELLOW}Available instances:${NC}"
        sf_list
        echo ""
        read -p "Enter instance name for quick switch: " instance_name
    fi

    bash "$SWITCH_SCRIPT" "$instance_name"
}

function sf_info() {
    local instance_name="$1"
    if [ -z "$instance_name" ]; then
        sf_current
        return
    fi

    local instance_dir
    instance_dir=$(node "$ENSURE_SCRIPT" --org "$instance_name" --print-dir --no-create 2>/dev/null || true)
    if [ -n "$instance_dir" ]; then
        echo -e "${BLUE}Instance: $instance_name${NC}"
        echo "Directory: $instance_dir"
        if [ -f "$instance_dir/.instance-env" ]; then
            echo "----------------------------------------"
            cat "$instance_dir/.instance-env"
            echo "----------------------------------------"
        fi
    else
        echo -e "${RED}Instance not found: $instance_name${NC}"
    fi
}

function sf_sync() {
    echo -e "${GREEN}Syncing all instance configurations...${NC}"
    bash "$PERSIST_CONFIG" sync
}

# Main command router
case "$1" in
    new)
        sf_new
        ;;
    switch)
        sf_switch "$2"
        ;;
    list)
        sf_list
        ;;
    current)
        sf_current
        ;;
    auth)
        sf_auth "$2"
        ;;
    open)
        sf_open "$2"
        ;;
    quick)
        sf_quick "$2"
        ;;
    info)
        sf_info "$2"
        ;;
    sync)
        sf_sync
        ;;
    help|--help|-h|"")
        sf_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        sf_help
        exit 1
        ;;
esac
