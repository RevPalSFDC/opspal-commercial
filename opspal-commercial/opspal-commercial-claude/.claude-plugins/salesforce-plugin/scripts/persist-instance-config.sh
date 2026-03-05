#!/bin/bash

# Instance Configuration Persistence Script
# Manages per-instance configurations including Asana and Salesforce CLI settings

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration paths
PROJECT_ROOT="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"
INSTANCES_DIR="$PROJECT_ROOT/instances"
CONFIG_FILE="$INSTANCES_DIR/config.json"
INSTANCE_CONFIG_DIR="$HOME/.salesforce-instances"
CURRENT_INSTANCE_FILE="$INSTANCE_CONFIG_DIR/.current-instance"

# Create necessary directories
mkdir -p "$INSTANCE_CONFIG_DIR"

# Function to log messages
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Function to get current instance
get_current_instance() {
    if [ -f "$CURRENT_INSTANCE_FILE" ]; then
        cat "$CURRENT_INSTANCE_FILE"
    else
        # Try to get from environment
        if [ -n "$SF_TARGET_ORG" ]; then
            echo "$SF_TARGET_ORG"
        else
            echo ""
        fi
    fi
}

# Function to save instance configuration
save_instance_config() {
    local instance=$1
    
    if [ -z "$instance" ]; then
        error "Instance name required"
        return 1
    fi
    
    # Read current environment variables
    local asana_token="${ASANA_ACCESS_TOKEN:-}"
    local asana_workspace="${ASANA_WORKSPACE_ID:-}"
    local asana_project="${ASANA_PROJECT_ID:-}"
    local org_alias="${SF_TARGET_ORG:-$instance}"
    
    # Get instance info from config.json
    local instance_data=$(python3 -c "
import json
import sys
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
    if '$instance' in config.get('instances', {}):
        inst = config['instances']['$instance']
        print(json.dumps(inst))
    else:
        sys.exit(1)
" 2>/dev/null) || {
        error "Instance '$instance' not found in config.json"
        return 1
    }
    
    # Create instance-specific env file
    local env_file="$INSTANCE_CONFIG_DIR/${instance}.env"
    
    cat > "$env_file" << EOF
# Configuration for Salesforce Instance: $instance
# Generated: $(date)
# This file is automatically managed by persist-instance-config.sh

# Salesforce Configuration
export SF_TARGET_ORG='$org_alias'

# Asana Configuration
export ASANA_ACCESS_TOKEN='$asana_token'
export ASANA_WORKSPACE_ID='$asana_workspace'
EOF

    if [ -n "$asana_project" ]; then
        echo "export ASANA_PROJECT_ID='$asana_project'" >> "$env_file"
    fi
    
    # Add instance directory
    local instance_dir=$(echo "$instance_data" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('directory', ''))
")
    
    if [ -n "$instance_dir" ]; then
        echo "export INSTANCE_DIR='$instance_dir'" >> "$env_file"
    fi
    
    chmod 600 "$env_file"
    
    # Update config.json with current Asana settings if they exist
    if [ -n "$asana_project" ]; then
        python3 -c "
import json
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
if '$instance' in config.get('instances', {}):
    if 'asana' not in config['instances']['$instance']:
        config['instances']['$instance']['asana'] = {}
    config['instances']['$instance']['asana']['projectId'] = '$asana_project'
    config['instances']['$instance']['asana']['workspaceId'] = '$asana_workspace'
    config['instances']['$instance']['asana']['lastSync'] = '$(date -Iseconds)'
    with open('$CONFIG_FILE', 'w') as f:
        json.dump(config, f, indent=2)
"
    fi
    
    log "Configuration saved for instance: $instance"
    return 0
}

# Function to load instance configuration
load_instance_config() {
    local instance=$1
    
    if [ -z "$instance" ]; then
        error "Instance name required"
        return 1
    fi
    
    local env_file="$INSTANCE_CONFIG_DIR/${instance}.env"
    
    if [ ! -f "$env_file" ]; then
        warning "No saved configuration for instance: $instance"
        warning "Creating new configuration from config.json..."
        
        # Try to create from config.json
        python3 -c "
import json
import sys
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
    if '$instance' in config.get('instances', {}):
        inst = config['instances']['$instance']
        print(f\"export SF_TARGET_ORG='{inst['alias']}'\")
        print(f\"export SF_TARGET_ORG='{inst['alias']}'\")
        if 'asana' in inst:
            asana = inst['asana']
            if asana.get('workspaceId'):
                print(f\"export ASANA_WORKSPACE_ID='{asana['workspaceId']}'\")
            if asana.get('projectId'):
                print(f\"export ASANA_PROJECT_ID='{asana['projectId']}'\")
" > "$env_file.tmp" 2>/dev/null
        
        if [ -f "$env_file.tmp" ]; then
            mv "$env_file.tmp" "$env_file"
            chmod 600 "$env_file"
        else
            error "Failed to create configuration for $instance"
            return 1
        fi
    fi
    
    # Source the configuration
    source "$env_file"
    
    # Update current instance marker
    echo "$instance" > "$CURRENT_INSTANCE_FILE"
    
    log "Loaded configuration for instance: $instance"
    info "Active org alias: $SF_TARGET_ORG"
    
    if [ -n "$ASANA_PROJECT_ID" ]; then
        info "Active Asana project: $ASANA_PROJECT_ID"
    else
        warning "No Asana project configured for this instance"
    fi
    
    return 0
}

# Function to list all configured instances
list_instances() {
    echo "Configured Salesforce instances:"
    echo ""
    
    python3 -c "
import json
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
    instances = config.get('instances', {})
    current = '$(get_current_instance)'
    
    for name, inst in instances.items():
        marker = '→' if name == current else ' '
        print(f'{marker} {name}')
        print(f'    Directory: {inst.get(\"directory\", \"Not set\")}')
        if 'asana' in inst and inst['asana'].get('projectId'):
            print(f'    Asana Project: {inst[\"asana\"][\"projectId\"]}')"
    echo ""
    
    # Show persisted configs
    echo "Persisted configurations:"
    for config in "$INSTANCE_CONFIG_DIR"/*.env; do
        if [ -f "$config" ]; then
            basename "$config" .env | sed 's/^/  - /'
        fi
    done
}

# Function to sync all configurations
sync_all() {
    log "Syncing all instance configurations..."
    
    python3 -c "
import json
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
    for name in config.get('instances', {}).keys():
        print(name)
" | while read -r instance; do
        info "Checking $instance..."
        if [ -f "$INSTANCE_CONFIG_DIR/${instance}.env" ]; then
            log "  Configuration exists"
        else
            warning "  Creating configuration..."
            save_instance_config "$instance"
        fi
    done
    
    log "Sync complete"
}

# Function to validate configuration
validate_config() {
    local instance=$1
    
    if [ -z "$instance" ]; then
        instance=$(get_current_instance)
    fi
    
    if [ -z "$instance" ]; then
        error "No instance specified or current instance set"
        return 1
    fi
    
    info "Validating configuration for: $instance"
    
    local env_file="$INSTANCE_CONFIG_DIR/${instance}.env"
    
    if [ ! -f "$env_file" ]; then
        error "No configuration file found"
        return 1
    fi
    
    # Source and check variables
    source "$env_file"
    
    local has_error=0
    
    if [ -z "$SF_TARGET_ORG" ]; then
        error "SF_TARGET_ORG not set"
        has_error=1
    else
        log "SF_TARGET_ORG: $SF_TARGET_ORG"
    fi
    
    if [ -z "$ASANA_ACCESS_TOKEN" ]; then
        warning "ASANA_ACCESS_TOKEN not set"
    else
        log "ASANA_ACCESS_TOKEN: ***configured***"
    fi
    
    if [ -z "$ASANA_WORKSPACE_ID" ]; then
        warning "ASANA_WORKSPACE_ID not set"
    else
        log "ASANA_WORKSPACE_ID: $ASANA_WORKSPACE_ID"
    fi
    
    if [ $has_error -eq 1 ]; then
        return 1
    fi
    
    log "Configuration valid"
    return 0
}

# Main command processing
case "${1:-}" in
    save)
        save_instance_config "${2:-$(get_current_instance)}"
        ;;
    load)
        if [ -z "$2" ]; then
            error "Instance name required"
            exit 1
        fi
        load_instance_config "$2"
        ;;
    list)
        list_instances
        ;;
    sync)
        sync_all
        ;;
    validate)
        validate_config "$2"
        ;;
    current)
        current=$(get_current_instance)
        if [ -n "$current" ]; then
            echo "Current instance: $current"
        else
            echo "No instance currently set"
        fi
        ;;
    alias)
        # Delegate to instance-config-registry.js
        shift # Remove 'alias' from args
        case "${1:-}" in
            add)
                if [ -z "$2" ] || [ -z "$3" ]; then
                    error "Usage: $0 alias add <instance> <alias>"
                    exit 1
                fi
                node scripts/lib/instance-config-registry.js "$2" add-alias "$3"
                ;;
            remove)
                if [ -z "$2" ] || [ -z "$3" ]; then
                    error "Usage: $0 alias remove <instance> <alias>"
                    exit 1
                fi
                node scripts/lib/instance-config-registry.js "$2" remove-alias "$3"
                ;;
            list)
                if [ -z "$2" ]; then
                    error "Usage: $0 alias list <instance>"
                    exit 1
                fi
                node scripts/lib/instance-config-registry.js "$2" list-aliases
                ;;
            resolve)
                if [ -z "$2" ]; then
                    error "Usage: $0 alias resolve <fuzzy-name>"
                    exit 1
                fi
                node scripts/lib/instance-alias-resolver.js "$2"
                ;;
            *)
                error "Unknown alias command: ${1:-}"
                echo "Use '$0 help' for usage information"
                exit 1
                ;;
        esac
        ;;
    help|--help|-h)
        echo "Instance Configuration Persistence Manager"
        echo ""
        echo "Usage: $0 [command] [options]"
        echo ""
        echo "Commands:"
        echo "  save [instance]        Save current environment to instance config"
        echo "  load <instance>        Load instance configuration"
        echo "  list                  List all configured instances"
        echo "  sync                  Sync all instance configurations"
        echo "  validate [inst]       Validate instance configuration"
        echo "  current               Show current instance"
        echo "  alias add <inst> <alias>    Add alias to instance"
        echo "  alias remove <inst> <alias> Remove alias from instance"
        echo "  alias list <instance>       List all aliases for instance"
        echo "  alias resolve <name>        Resolve fuzzy name to instance"
        echo "  help                  Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 save                              # Save current env to current instance"
        echo "  $0 save example-company-sandbox             # Save current env to specific instance"
        echo "  $0 load sample-org-sandbox            # Load instance configuration"
        echo "  $0 list                              # List all instances"
        echo "  $0 validate                          # Validate current instance config"
        echo "  $0 alias add acme-corp-main \"acme-corp production\""
        echo "  $0 alias list acme-corp-main         # Show all aliases"
        echo "  $0 alias resolve \"acme-corp prod\"    # Find matching instance"
        ;;
    *)
        error "Unknown command: ${1:-}"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac
