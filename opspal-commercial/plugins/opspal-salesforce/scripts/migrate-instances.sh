#!/bin/bash

# Instance Migration Script
# Migrates existing instances to the correct structure and location

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Paths
PROJECT_ROOT="${PROJECT_ROOT:-${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}}"
INSTANCES_DIR="$PROJECT_ROOT/instances"
AGENTS_DIR="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"
CONFIG_FILE="$INSTANCES_DIR/config.json"
BACKUP_DIR="$PROJECT_ROOT/backup/migration-$(date +%Y%m%d_%H%M%S)"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Function to log messages
log() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Function to backup current state
backup_current_state() {
    info "Creating backup of current state..."
    
    # Backup config.json
    if [ -f "$CONFIG_FILE" ]; then
        cp "$CONFIG_FILE" "$BACKUP_DIR/config.json.bak"
        log "Backed up config.json"
    fi
    
    # Backup instances directory
    if [ -d "$INSTANCES_DIR" ]; then
        cp -r "$INSTANCES_DIR" "$BACKUP_DIR/instances-backup"
        log "Backed up instances directory"
    fi
    
    # Backup misplaced instance directories
    if [ -d "$AGENTS_DIR/acme-corp-staging" ]; then
        cp -r "$AGENTS_DIR/acme-corp-staging" "$BACKUP_DIR/acme-corp-staging-backup"
        log "Backed up acme-corp-staging"
    fi
    
    info "Backup completed: $BACKUP_DIR"
}

# Function to migrate acme-corp-staging
migrate_acme-corp_staging() {
    local source="$AGENTS_DIR/acme-corp-staging"
    local target="$INSTANCES_DIR/acme-corp-staging"
    
    if [ ! -d "$source" ]; then
        info "No acme-corp-staging directory found in wrong location"
        return 0
    fi
    
    info "Migrating acme-corp-staging to correct location..."
    
    # Check if target already exists
    if [ -d "$target" ]; then
        warning "Target directory already exists: $target"
        
        # Merge or rename
        local new_target="$target-migrated-$(date +%Y%m%d_%H%M%S)"
        mv "$source" "$new_target"
        log "Moved to: $new_target"
        warning "Manual merge required between existing and migrated directories"
    else
        # Move to correct location
        mv "$source" "$target"
        log "Moved acme-corp-staging to: $target"
    fi
    
    # Create instance environment file
    if [ ! -f "$target/.instance-env" ]; then
        cat > "$target/.instance-env" << EOF
# Instance configuration for acme-corp-staging
INSTANCE_NAME=acme-corp-staging
INSTANCE_DIR=$target
SF_TARGET_ORG=acme-corp-staging
INSTANCE_URL=https://acme-corpmain--staging.sandbox.my.salesforce.com
CREATED=$(date -Iseconds)
EOF
        log "Created .instance-env for acme-corp-staging"
    fi
    
    return 0
}

# Function to clean up force-app from root
cleanup_root_force_app() {
    local force_app_dir="$PROJECT_ROOT/force-app"
    
    if [ ! -d "$force_app_dir" ]; then
        info "No force-app directory in root to clean up"
        return 0
    fi
    
    info "Cleaning up force-app from root directory..."
    
    # Determine target instance
    local target_instance=""
    
    # Check if files belong to a specific instance by examining content
    if [ -f "$force_app_dir/main/default/objects/Account/fields/Count_of_DVMs__c.field-meta.xml" ]; then
        target_instance="sample-org-sandbox"
    elif [ -f "$force_app_dir/main/default/objects/Contract/fields/Contract_Cohort__c.field-meta.xml" ]; then
        target_instance="example-company-sandbox"
    else
        # Default to shared if can't determine
        target_instance="shared"
        warning "Cannot determine target instance for force-app, using 'shared'"
    fi
    
    local target_dir="$INSTANCES_DIR/$target_instance/force-app"
    
    # Check if target exists
    if [ -d "$target_dir" ]; then
        # Archive the root force-app
        local archive_name="force-app-root-$(date +%Y%m%d_%H%M%S)"
        mv "$force_app_dir" "$BACKUP_DIR/$archive_name"
        log "Archived root force-app to: $BACKUP_DIR/$archive_name"
        warning "Target force-app already exists in $target_instance"
        warning "Manual merge may be required from archive"
    else
        # Move to instance directory
        mkdir -p "$INSTANCES_DIR/$target_instance"
        mv "$force_app_dir" "$target_dir"
        log "Moved force-app to instance: $target_instance"
    fi
    
    return 0
}

# Function to create instance directories
ensure_instance_directories() {
    info "Ensuring all instances have correct structure..."
    
    # Read instances from config.json
    local instances=$(python3 -c "
import json
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
    for name in config.get('instances', {}).keys():
        print(name)
" 2>/dev/null)
    
    while IFS= read -r instance; do
        if [ -z "$instance" ]; then
            continue
        fi
        
        local instance_dir="$INSTANCES_DIR/$instance"
        
        if [ ! -d "$instance_dir" ]; then
            mkdir -p "$instance_dir"
            log "Created instance directory: $instance"
        fi
        
        # Create required subdirectories
        mkdir -p "$instance_dir/force-app/main/default"
        mkdir -p "$instance_dir/config"
        mkdir -p "$instance_dir/scripts"
        mkdir -p "$instance_dir/docs"
        
        # Create .instance-env if missing
        if [ ! -f "$instance_dir/.instance-env" ]; then
            cat > "$instance_dir/.instance-env" << EOF
# Instance configuration for $instance
INSTANCE_NAME=$instance
INSTANCE_DIR=$instance_dir
SF_TARGET_ORG=$instance
CREATED=$(date -Iseconds)
EOF
            log "Created .instance-env for $instance"
        fi
        
        # Create README if missing
        if [ ! -f "$instance_dir/README.md" ]; then
            cat > "$instance_dir/README.md" << EOF
# Salesforce Instance: $instance

This directory contains the Salesforce configuration and metadata for the $instance instance.

## Structure
- \`force-app/\` - Salesforce metadata
- \`config/\` - Instance-specific configuration
- \`scripts/\` - Instance-specific scripts
- \`docs/\` - Instance documentation

## Configuration
See \`.instance-env\` for environment variables specific to this instance.
EOF
            log "Created README.md for $instance"
        fi
    done <<< "$instances"
}

# Function to sync Asana configurations
sync_asana_configs() {
    info "Syncing Asana configurations..."
    
    # Source current environment
    if [ -f "$PROJECT_ROOT/.env" ]; then
        source "$PROJECT_ROOT/.env"
    fi
    
    # Get current instance
    local current_instance="${SF_TARGET_ORG:-}"
    
    if [ -n "$current_instance" ] && [ -n "$ASANA_ACCESS_TOKEN" ]; then
        # Save configuration for current instance
        "$PROJECT_ROOT/scripts/persist-instance-config.sh" save "$current_instance"
        log "Saved Asana configuration for: $current_instance"
    fi
    
    # Sync all configurations
    "$PROJECT_ROOT/scripts/persist-instance-config.sh" sync
    log "Synced all instance configurations"
}

# Function to update CLAUDE.md
update_documentation() {
    info "Updating documentation..."
    
    # Add note about new project management to CLAUDE.md
    if ! grep -q "sfdc-project-manager" "$PROJECT_ROOT/CLAUDE.md"; then
        warning "Remember to update CLAUDE.md with sfdc-project-manager agent information"
    fi
    
    log "Documentation review completed"
}

# Function to generate migration report
generate_report() {
    echo ""
    echo "========================================="
    echo "Instance Migration Report"
    echo "========================================="
    echo "Migration completed: $(date)"
    echo ""
    echo "Actions performed:"
    echo "  - Backup created: $BACKUP_DIR"
    
    if [ -d "$INSTANCES_DIR/acme-corp-staging" ]; then
        echo "  - Migrated acme-corp-staging to correct location"
    fi
    
    if [ ! -d "$PROJECT_ROOT/force-app" ]; then
        echo "  - Cleaned up force-app from root directory"
    fi
    
    echo "  - Ensured instance directory structure"
    echo "  - Synced Asana configurations"
    echo ""
    echo "Next steps:"
    echo "  1. Review migrated instances in: $INSTANCES_DIR"
    echo "  2. Test instance switching: ./scripts/persist-instance-config.sh load <instance>"
    echo "  3. Validate file placement: ./scripts/validate-file-placement.sh"
    echo "  4. Commit changes when satisfied"
    echo ""
    echo "========================================="
}

# Main execution
echo "========================================="
echo "Instance Migration Script"
echo "========================================="
echo ""

# Confirmation prompt
read -p "This will migrate and reorganize your instances. Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Migration cancelled"
    exit 0
fi

echo ""
info "Starting migration process..."
echo ""

# Step 1: Backup
backup_current_state

# Step 2: Migrate acme-corp-staging
migrate_acme-corp_staging

# Step 3: Clean up root force-app
cleanup_root_force_app

# Step 4: Ensure instance directories
ensure_instance_directories

# Step 5: Sync Asana configs
sync_asana_configs

# Step 6: Update documentation
update_documentation

# Generate report
generate_report

exit 0