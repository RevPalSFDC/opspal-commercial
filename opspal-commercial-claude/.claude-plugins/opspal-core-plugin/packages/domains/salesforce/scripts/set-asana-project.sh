#!/bin/bash

# Asana Project Configuration Script
# Sets Asana credentials for specific Salesforce instance/project

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration file locations
INSTANCE_CONFIG_DIR="$HOME/.salesforce-instances"
CURRENT_INSTANCE_FILE="$INSTANCE_CONFIG_DIR/.current-instance"

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -i, --instance NAME      Salesforce instance name (e.g., example-company-sandbox)"
    echo "  -t, --token TOKEN        Asana Personal Access Token"
    echo "  -w, --workspace ID       Asana Workspace ID"
    echo "  -p, --project ID         Asana Project ID (optional)"
    echo "  -s, --switch NAME        Switch to existing instance configuration"
    echo "  -l, --list               List all configured instances"
    echo "  -c, --current            Show current instance configuration"
    echo "  -h, --help               Display this help message"
    echo ""
    echo "Examples:"
    echo "  # Configure new instance"
    echo "  $0 -i example-company-sandbox -t 1/1234567890 -w 12345"
    echo ""
    echo "  # Switch to existing instance"
    echo "  $0 -s example-company-sandbox"
    echo ""
    echo "  # List all instances"
    echo "  $0 -l"
}

# Create config directory if it doesn't exist
mkdir -p "$INSTANCE_CONFIG_DIR"

# Function to save instance configuration
save_instance_config() {
    local instance=$1
    local token=$2
    local workspace=$3
    local project=$4
    
    local config_file="$INSTANCE_CONFIG_DIR/$instance.env"
    
    cat > "$config_file" << EOF
# Asana Configuration for $instance
# Generated: $(date)
export ASANA_ACCESS_TOKEN='$token'
export ASANA_WORKSPACE_ID='$workspace'
EOF

    if [ -n "$project" ]; then
        echo "export ASANA_PROJECT_ID='$project'" >> "$config_file"
    fi
    
    # Also save Salesforce instance alias
    echo "export SF_TARGET_ORG='$instance'" >> "$config_file"
    echo "export SF_TARGET_ORG='$instance'" >> "$config_file"
    
    chmod 600 "$config_file"  # Secure the file
    
    echo -e "${GREEN}✓ Configuration saved for instance: $instance${NC}"
    echo -e "  Config file: $config_file"
}

# Function to switch to an instance
switch_instance() {
    local instance=$1
    local config_file="$INSTANCE_CONFIG_DIR/$instance.env"
    
    if [ ! -f "$config_file" ]; then
        echo -e "${RED}✗ No configuration found for instance: $instance${NC}"
        echo "Available instances:"
        list_instances
        return 1
    fi
    
    # Save current instance
    echo "$instance" > "$CURRENT_INSTANCE_FILE"
    
    # Source the configuration
    source "$config_file"
    
    echo -e "${GREEN}✓ Switched to instance: $instance${NC}"
    echo ""
    echo "Active configuration:"
    echo "  SF_TARGET_ORG: $SF_TARGET_ORG"
    echo "  ASANA_WORKSPACE_ID: $ASANA_WORKSPACE_ID"
    [ -n "$ASANA_PROJECT_ID" ] && echo "  ASANA_PROJECT_ID: $ASANA_PROJECT_ID"
    echo ""
    echo -e "${YELLOW}Note: Run 'source $config_file' to apply in current shell${NC}"
}

# Function to list all instances
list_instances() {
    echo "Configured instances:"
    for config in "$INSTANCE_CONFIG_DIR"/*.env; do
        if [ -f "$config" ]; then
            basename "$config" .env | sed 's/^/  - /'
        fi
    done
    
    if [ -f "$CURRENT_INSTANCE_FILE" ]; then
        current=$(cat "$CURRENT_INSTANCE_FILE")
        echo ""
        echo "Current instance: $current"
    fi
}

# Function to show current configuration
show_current() {
    if [ ! -f "$CURRENT_INSTANCE_FILE" ]; then
        echo -e "${YELLOW}No instance currently selected${NC}"
        echo "Use '$0 -s <instance>' to select an instance"
        return 1
    fi
    
    local current=$(cat "$CURRENT_INSTANCE_FILE")
    local config_file="$INSTANCE_CONFIG_DIR/$current.env"
    
    if [ ! -f "$config_file" ]; then
        echo -e "${RED}Configuration file missing for: $current${NC}"
        return 1
    fi
    
    echo "Current instance: $current"
    echo "Configuration:"
    grep -E "^export" "$config_file" | sed 's/export /  /' | sed "s/'[^']*'/'***'/g"
}

# Parse command line arguments
INSTANCE=""
TOKEN=""
WORKSPACE=""
PROJECT=""
SWITCH=""
LIST=false
CURRENT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -i|--instance)
            INSTANCE="$2"
            shift 2
            ;;
        -t|--token)
            TOKEN="$2"
            shift 2
            ;;
        -w|--workspace)
            WORKSPACE="$2"
            shift 2
            ;;
        -p|--project)
            PROJECT="$2"
            shift 2
            ;;
        -s|--switch)
            SWITCH="$2"
            shift 2
            ;;
        -l|--list)
            LIST=true
            shift
            ;;
        -c|--current)
            CURRENT=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            exit 1
            ;;
    esac
done

# Execute based on options
if [ "$LIST" = true ]; then
    list_instances
elif [ "$CURRENT" = true ]; then
    show_current
elif [ -n "$SWITCH" ]; then
    switch_instance "$SWITCH"
elif [ -n "$INSTANCE" ] && [ -n "$TOKEN" ] && [ -n "$WORKSPACE" ]; then
    save_instance_config "$INSTANCE" "$TOKEN" "$WORKSPACE" "$PROJECT"
    switch_instance "$INSTANCE"
else
    echo -e "${RED}Invalid arguments${NC}"
    usage
    exit 1
fi