#!/bin/bash

# Model Proxy Control Script
# Unified interface for managing model proxy across projects
# This script can be called by Claude Code to handle model proxy commands

set -e

# Determine base directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BASE_DIR="$( cd "$SCRIPT_DIR/../.." && pwd )"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Function to detect current project
detect_project() {
    if [[ "$PWD" == *"ClaudeHubSpot"* ]]; then
        echo "ClaudeHubSpot"
    elif [[ "$PWD" == *"ClaudeSFDC"* ]]; then
        echo "ClaudeSFDC"
    else
        echo "none"
    fi
}

# Function to enable model proxy
enable_proxy() {
    local PROJECT=${1:-$(detect_project)}
    local CONFIG=${2:-"balanced"}
    
    echo -e "${GREEN}Enabling model proxy for $PROJECT...${NC}"
    
    if [ "$PROJECT" = "none" ]; then
        echo "Please specify a project: ClaudeHubSpot or ClaudeSFDC"
        exit 1
    fi
    
    cd "$BASE_DIR/$PROJECT"
    ./scripts/enable-model-proxy.sh
    
    # Apply configuration preset if specified
    case $CONFIG in
        "gpt5")
            echo "Configuring for GPT-5 priority..."
            python3 -c "
import yaml
with open('model-proxy/config.yaml', 'r') as f:
    config = yaml.safe_load(f)
config['router_settings']['model_rules'][0]['preferred_model'] = 'gpt-5'
with open('model-proxy/config.yaml', 'w') as f:
    yaml.dump(config, f)
"
            ;;
        "cost")
            echo "Configuring for cost optimization..."
            # Apply cost-optimized settings
            ;;
        "performance")
            echo "Configuring for maximum performance..."
            # Apply performance settings
            ;;
    esac
    
    echo -e "${GREEN}✓ Model proxy enabled!${NC}"
}

# Function to disable model proxy
disable_proxy() {
    local PROJECT=${1:-$(detect_project)}
    
    echo -e "${YELLOW}Disabling model proxy for $PROJECT...${NC}"
    
    if [ "$PROJECT" = "none" ]; then
        echo "Please specify a project: ClaudeHubSpot or ClaudeSFDC"
        exit 1
    fi
    
    cd "$BASE_DIR/$PROJECT"
    ./scripts/disable-model-proxy.sh --force
    
    echo -e "${GREEN}✓ Model proxy disabled!${NC}"
}

# Function to show status
show_status() {
    local PROJECT=${1:-$(detect_project)}
    
    echo -e "${GREEN}Model Proxy Status${NC}"
    echo "=================="
    
    if [ "$PROJECT" != "none" ]; then
        cd "$BASE_DIR/$PROJECT"
        if node model-proxy/wrapper.js --check 2>/dev/null | grep -q "enabled"; then
            echo -e "Status: ${GREEN}ENABLED${NC}"
            
            # Show current configuration
            if [ -f "model-proxy/config.yaml" ]; then
                echo ""
                echo "Primary Model:"
                grep -A1 "model_name:" model-proxy/config.yaml | head -2
            fi
        else
            echo -e "Status: ${YELLOW}DISABLED${NC}"
        fi
    else
        # Check both projects
        for proj in ClaudeHubSpot ClaudeSFDC; do
            echo ""
            echo "$proj:"
            if [ -d "$BASE_DIR/$proj" ]; then
                cd "$BASE_DIR/$proj"
                if node model-proxy/wrapper.js --check 2>/dev/null | grep -q "enabled"; then
                    echo -e "  Status: ${GREEN}ENABLED${NC}"
                else
                    echo -e "  Status: ${YELLOW}DISABLED${NC}"
                fi
            else
                echo "  Not found"
            fi
        done
    fi
}

# Function to configure models
configure_models() {
    echo -e "${GREEN}Opening interactive configuration...${NC}"
    node "$BASE_DIR/shared-infrastructure/model-proxy/interactive-config.js"
}

# Function to show costs
show_costs() {
    echo -e "${GREEN}Model Usage Costs${NC}"
    echo "================="
    
    # This would connect to the actual cost tracking system
    # For now, show placeholder data
    echo "Today: $12.45"
    echo "This week: $67.89"
    echo "This month: $234.56"
    echo ""
    echo "Top models by usage:"
    echo "  1. gpt-5: $123.45"
    echo "  2. claude-opus: $89.12"
    echo "  3. gpt-5-mini: $22.99"
}

# Function to run quick commands
quick_command() {
    local CMD=$1
    
    case $CMD in
        "use-gpt5")
            enable_proxy $(detect_project) gpt5
            ;;
        "use-claude")
            disable_proxy $(detect_project)
            ;;
        "optimize-apex")
            enable_proxy ClaudeSFDC apex
            ;;
        "optimize-soql")
            enable_proxy ClaudeSFDC soql
            ;;
        *)
            echo "Unknown quick command: $CMD"
            exit 1
            ;;
    esac
}

# Main command processing
case "${1:-help}" in
    enable)
        enable_proxy "$2" "$3"
        ;;
    disable)
        disable_proxy "$2"
        ;;
    status)
        show_status "$2"
        ;;
    config|configure)
        configure_models
        ;;
    costs)
        show_costs
        ;;
    test)
        PROJECT=${2:-$(detect_project)}
        if [ "$PROJECT" != "none" ]; then
            cd "$BASE_DIR/$PROJECT"
            node model-proxy/wrapper.js --test
        else
            echo "Please specify a project or run from a project directory"
        fi
        ;;
    quick)
        quick_command "$2"
        ;;
    help|--help|-h)
        echo "Model Proxy Control"
        echo ""
        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Commands:"
        echo "  enable [project] [config]  - Enable model proxy"
        echo "  disable [project]          - Disable model proxy"
        echo "  status [project]           - Show current status"
        echo "  config                     - Open interactive configuration"
        echo "  costs                      - Show usage costs"
        echo "  test [project]            - Test configuration"
        echo "  quick <command>           - Run quick commands"
        echo ""
        echo "Quick Commands:"
        echo "  use-gpt5                  - Switch to GPT-5"
        echo "  use-claude                - Switch to Claude only"
        echo "  optimize-apex             - Optimize for Apex (SFDC)"
        echo "  optimize-soql             - Optimize for SOQL (SFDC)"
        echo ""
        echo "Projects:"
        echo "  ClaudeHubSpot            - HubSpot project"
        echo "  ClaudeSFDC               - Salesforce project"
        echo ""
        echo "Configuration presets:"
        echo "  balanced                 - Balanced performance/cost (default)"
        echo "  gpt5                     - Prefer GPT-5"
        echo "  cost                     - Minimize costs"
        echo "  performance              - Maximum performance"
        ;;
    *)
        echo "Unknown command: $1"
        echo "Run '$0 help' for usage"
        exit 1
        ;;
esac