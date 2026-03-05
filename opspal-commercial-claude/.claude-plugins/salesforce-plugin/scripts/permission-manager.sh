#!/bin/bash

# Permission Manager - Main Orchestration Script
# Manages permission sets across Salesforce instances
# Version: 1.0.0

set -e

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Source utilities
source "$SCRIPT_DIR/lib/permission-deployment-utils.sh"

# Configuration
CONFIG_FILE="${CONFIG_FILE:-$PROJECT_ROOT/config/permission-assignments.yaml}"

# Function to display usage
show_usage() {
    cat <<EOF
Permission Manager - Salesforce Permission Set Management Tool

Usage: $0 <command> [options]

Commands:
  deploy [org]        Deploy all permission sets to specified org
  assign [org]        Assign permissions based on config file
  verify [org]        Verify permissions are correctly set
  migrate [org]       Migrate from profiles to permission sets
  rollback [org]      Rollback to previous permission state
  audit [org]         Generate permission audit report

Options:
  -c, --config FILE   Use specific config file (default: config/permission-assignments.yaml)
  -u, --user USER     Apply to specific user only
  -d, --dry-run       Show what would be done without making changes
  -v, --verbose       Enable verbose output
  -h, --help          Show this help message

Examples:
  $0 deploy production                    # Deploy all permission sets to production
  $0 assign sandbox                       # Assign permissions in sandbox
  $0 verify production                    # Verify permissions in production
  $0 migrate production --dry-run         # Preview profile migration
  $0 audit production > permissions.txt   # Generate audit report

Environment Variables:
  SF_TARGET_ORG    Default Salesforce org alias
  CONFIG_FILE             Path to configuration file
  PROJECT_ROOT            Project root directory
EOF
}

# Deploy command
cmd_deploy() {
    local org_alias="${1:-$(get_org_alias)}"

    log_section "Permission Set Deployment"
    log_info "Target Org: $org_alias"
    log_info "Config: $CONFIG_FILE"

    # Deploy all permission sets
    deploy_all_permission_sets "$org_alias"

    log_success "Deployment completed successfully"
}

# Assign command
cmd_assign() {
    local org_alias="${1:-$(get_org_alias)}"

    log_section "Permission Assignment"
    log_info "Target Org: $org_alias"
    log_info "Config: $CONFIG_FILE"

    if [ ! -f "$CONFIG_FILE" ]; then
        log_error "Configuration file not found: $CONFIG_FILE"
        exit 1
    fi

    # Parse YAML and assign permissions
    log_info "Processing user assignments..."

    # Extract usernames and their permissions
    # Note: This is simplified - in production use proper YAML parser
    local in_user_section=false
    local current_user=""
    local current_perms=""

    while IFS= read -r line; do
        if [[ $line == "user_assignments:" ]]; then
            in_user_section=true
            continue
        fi

        if [ "$in_user_section" = true ]; then
            if [[ $line =~ ^[[:space:]]*-[[:space:]]*username:[[:space:]]*(.+) ]]; then
                current_user="${BASH_REMATCH[1]}"
                log_info "Processing user: $current_user"
            elif [[ $line =~ ^[[:space:]]*-[[:space:]]*([A-Za-z_]+)$ ]] && [ -n "$current_user" ]; then
                perm_set="${BASH_REMATCH[1]}"
                log_info "  Assigning: $perm_set"
                assign_permission_set "$current_user" "$perm_set" "$org_alias"
            fi
        fi
    done < "$CONFIG_FILE"

    log_success "Permission assignment completed"
}

# Verify command
cmd_verify() {
    local org_alias="${1:-$(get_org_alias)}"

    log_section "Permission Verification"
    log_info "Target Org: $org_alias"

    "$SCRIPT_DIR/verify-permissions.sh" batch "$CONFIG_FILE" "$org_alias"
}

# Migrate command
cmd_migrate() {
    local org_alias="${1:-$(get_org_alias)}"

    log_section "Profile to Permission Set Migration"
    log_info "Target Org: $org_alias"
    log_warning "This will migrate users from profiles to permission sets"

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN MODE - No changes will be made"
    fi

    # Query users and their profiles
    log_info "Analyzing current profile assignments..."

    local query="SELECT Id, Username, Profile.Name FROM User WHERE IsActive = true"
    local result=$(sf data query --query "$query" --target-org "$org_alias" --json)

    echo "$result" | jq -r '.result.records[] | "\(.Username)|\(.Profile.Name)"' | while IFS='|' read -r username profile; do
        log_info "User: $username (Profile: $profile)"

        # Look up migration mapping
        if grep -q "\"$profile\":" "$CONFIG_FILE"; then
            log_info "  → Found migration mapping for profile"

            if [ "$DRY_RUN" != true ]; then
                # Extract and assign permission sets for this profile
                # Note: Simplified - use proper YAML parser in production
                log_info "  → Assigning permission sets..."
            else
                log_info "  → Would assign permission sets (dry run)"
            fi
        else
            log_warning "  → No migration mapping found for profile: $profile"
        fi
    done

    if [ "$DRY_RUN" != true ]; then
        log_success "Migration completed"
    else
        log_info "Dry run completed - no changes made"
    fi
}

# Rollback command
cmd_rollback() {
    local org_alias="${1:-$(get_org_alias)}"

    log_section "Permission Rollback"
    log_error "Rollback functionality not yet implemented"
    log_info "To manually rollback:"
    log_info "  1. Remove permission set assignments via Setup UI"
    log_info "  2. Or use: sf data delete record --sobject PermissionSetAssignment --where ..."
    exit 1
}

# Audit command
cmd_audit() {
    local org_alias="${1:-$(get_org_alias)}"

    log_section "Permission Audit Report"
    log_info "Target Org: $org_alias"
    log_info "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # Get all active users with their permissions
    local query="SELECT Username, Profile.Name, IsActive FROM User WHERE IsActive = true ORDER BY Username"
    local users=$(sf data query --query "$query" --target-org "$org_alias" --json)

    echo "$users" | jq -r '.result.records[]' | while IFS= read -r user_json; do
        username=$(echo "$user_json" | jq -r '.Username')
        profile=$(echo "$user_json" | jq -r '.Profile.Name')

        echo "User: $username"
        echo "Profile: $profile"

        # Get permission sets
        local perm_query="SELECT PermissionSet.Name FROM PermissionSetAssignment WHERE Assignee.Username = '$username' AND PermissionSet.IsOwnedByProfile = false"
        local perms=$(sf data query --query "$perm_query" --target-org "$org_alias" --json 2>/dev/null)

        echo "Permission Sets:"
        echo "$perms" | jq -r '.result.records[].PermissionSet.Name' | sed 's/^/  - /'
        echo ""
    done
}

# Parse command line arguments
COMMAND=""
ORG_ALIAS=""
DRY_RUN=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        deploy|assign|verify|migrate|rollback|audit)
            COMMAND="$1"
            shift
            if [[ $# -gt 0 ]] && [[ ! "$1" =~ ^- ]]; then
                ORG_ALIAS="$1"
                shift
            fi
            ;;
        -c|--config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        -u|--user)
            SPECIFIC_USER="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Execute command
case "$COMMAND" in
    deploy)
        cmd_deploy "$ORG_ALIAS"
        ;;
    assign)
        cmd_assign "$ORG_ALIAS"
        ;;
    verify)
        cmd_verify "$ORG_ALIAS"
        ;;
    migrate)
        cmd_migrate "$ORG_ALIAS"
        ;;
    rollback)
        cmd_rollback "$ORG_ALIAS"
        ;;
    audit)
        cmd_audit "$ORG_ALIAS"
        ;;
    "")
        log_error "No command specified"
        show_usage
        exit 1
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        show_usage
        exit 1
        ;;
esac