#!/bin/bash

# Permission Set Deployment Utilities
# Instance-agnostic permission management system
# Version: 1.1.0
#
# Updated: 2026-01-15 - Standardized exit codes, improved error handling
#
# Exit Codes (standardized - see sf-exit-codes.sh):
#   0 - Success
#   1 - Validation/deployment error
#   5 - Config error (missing org alias)

# Source standardized exit codes
SCRIPT_DIR_PERM="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if [[ -f "${SCRIPT_DIR_PERM}/sf-exit-codes.sh" ]]; then
    source "${SCRIPT_DIR_PERM}/sf-exit-codes.sh"
else
    EXIT_SUCCESS=0
    EXIT_VALIDATION_ERROR=1
    EXIT_CONFIG_ERROR=5
fi

# Colors for output
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    NC='\033[0m' # No Color
else
    RED=''; GREEN=''; YELLOW=''; BLUE=''; CYAN=''; NC=''
fi

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
TEMPLATE_DIR="${PROJECT_ROOT}/templates/permission-sets"
CONFIG_DIR="${PROJECT_ROOT}/config"
TEMP_DIR="${TEMP_DIR:-/tmp}"

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" >&2; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_section() { echo -e "\n${CYAN}═══ $1 ═══${NC}" >&2; }

# Get org alias with fallback
get_org_alias() {
    local alias="${1:-${SF_TARGET_ORG:-${SF_TARGET_ORG}}}"
    if [ -z "$alias" ]; then
        log_error "No Salesforce org alias specified"
        log_info "Usage: export SF_TARGET_ORG=your-org-alias"
        return 1
    fi
    echo "$alias"
}

# Check if permission set exists in org
check_permission_set_exists() {
    local perm_set_name="$1"
    local org_alias="${2:-$(get_org_alias)}"

    log_info "Checking if permission set '$perm_set_name' exists..."

    local query="SELECT Id, Name FROM PermissionSet WHERE Name = '$perm_set_name' LIMIT 1"
    local result=""
    local query_exit=0

    # Execute query with proper error handling (no silent fallback)
    result=$(sf data query --query "$query" --target-org "$org_alias" --json 2>&1) || query_exit=$?

    if [ $query_exit -ne 0 ]; then
        log_error "Query failed (exit code: $query_exit)"
        log_warning "Unable to verify permission set existence"
        return 1
    fi

    local count=$(echo "$result" | jq -r '.result.totalSize // 0')

    if [ "$count" -gt 0 ]; then
        log_success "Permission set '$perm_set_name' exists"
        return 0
    else
        log_warning "Permission set '$perm_set_name' not found"
        return 1
    fi
}

# Deploy single permission set
deploy_permission_set() {
    local perm_set_file="$1"
    local org_alias="${2:-$(get_org_alias)}"

    if [ ! -f "$perm_set_file" ]; then
        log_error "Permission set file not found: $perm_set_file"
        return 1
    fi

    local perm_set_name=$(basename "$perm_set_file" .permissionset-meta.xml)
    log_info "Deploying permission set: $perm_set_name"

    # Create temporary deployment directory
    local deploy_dir="$TEMP_DIR/deploy_$$"
    mkdir -p "$deploy_dir/permissionsets"
    cp "$perm_set_file" "$deploy_dir/permissionsets/"

    # Create package.xml
    cat > "$deploy_dir/package.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>$perm_set_name</members>
        <name>PermissionSet</name>
    </types>
    <version>61.0</version>
</Package>
EOF

    # Deploy with retry logic
    local max_retries=3
    local retry_count=0

    while [ $retry_count -lt $max_retries ]; do
        if sf project deploy start \
            --source-dir "$deploy_dir" \
            --target-org "$org_alias" \
            --wait 10 \
            --ignore-conflicts; then
            log_success "Permission set '$perm_set_name' deployed successfully"
            rm -rf "$deploy_dir"
            return 0
        fi

        retry_count=$((retry_count + 1))
        if [ $retry_count -lt $max_retries ]; then
            log_warning "Deployment failed, retry $retry_count of $max_retries..."
            sleep 5
        fi
    done

    log_error "Failed to deploy permission set after $max_retries attempts"
    rm -rf "$deploy_dir"
    return 1
}

# Deploy all permission sets from templates
deploy_all_permission_sets() {
    local org_alias="${1:-$(get_org_alias)}"

    log_section "Deploying Permission Sets to $org_alias"

    # Create temp directory
    mkdir -p "$TEMP_DIR"

    # Deploy base permission sets
    if [ -d "$TEMPLATE_DIR/base" ]; then
        log_info "Deploying base permission sets..."
        for perm_file in "$TEMPLATE_DIR/base"/*.permissionset-meta.xml; do
            if [ -f "$perm_file" ]; then
                deploy_permission_set "$perm_file" "$org_alias"
            fi
        done
    fi

    # Wait for propagation
    log_info "Waiting for metadata propagation..."
    sleep 5

    # Deploy permission set groups
    if [ -d "$TEMPLATE_DIR/groups" ]; then
        log_info "Deploying permission set groups..."
        for group_file in "$TEMPLATE_DIR/groups"/*.permissionsetgroup-meta.xml; do
            if [ -f "$group_file" ]; then
                deploy_permission_set_group "$group_file" "$org_alias"
            fi
        done
    fi

    # Clean up temp directory
    rm -rf "$TEMP_DIR"

    # Auto-assign deployed perm sets to the connected CLI user.
    # Salesforce FLS grants in a perm set are not inherited until the perm set is
    # explicitly assigned to the user. Without this step, the deploying user
    # cannot access fields granted by perm sets they just deployed.
    # Ref: https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_objects_permissionsetassignment.htm
    post_deploy_assign_cli_user "$org_alias"

    log_success "Permission deployment completed"
}

# Deploy permission set group
deploy_permission_set_group() {
    local group_file="$1"
    local org_alias="${2:-$(get_org_alias)}"

    if [ ! -f "$group_file" ]; then
        log_error "Permission set group file not found: $group_file"
        return 1
    fi

    local group_name=$(basename "$group_file" .permissionsetgroup-meta.xml)
    log_info "Deploying permission set group: $group_name"

    # Create temporary deployment directory
    local deploy_dir="$TEMP_DIR/deploy_group_$$"
    mkdir -p "$deploy_dir/permissionsetgroups"
    cp "$group_file" "$deploy_dir/permissionsetgroups/"

    # Create package.xml
    cat > "$deploy_dir/package.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>$group_name</members>
        <name>PermissionSetGroup</name>
    </types>
    <version>61.0</version>
</Package>
EOF

    # Deploy
    if sf project deploy start \
        --source-dir "$deploy_dir" \
        --target-org "$org_alias" \
        --wait 10 \
        --ignore-conflicts; then
        log_success "Permission set group '$group_name' deployed successfully"
    else
        log_error "Failed to deploy permission set group '$group_name'"
    fi

    rm -rf "$deploy_dir"
}

# Auto-assign all deployed perm sets to the connected CLI user.
# Resolves the CLI user via `sf org display`, then assigns each base perm set.
# Skips assignment if already present (idempotent).
post_deploy_assign_cli_user() {
    local org_alias="${1:-$(get_org_alias)}"

    log_section "Auto-assigning perm sets to CLI user"

    # Get the connected CLI username from sf org display
    local org_info
    org_info=$(sf org display --target-org "$org_alias" --json 2>/dev/null) || {
        log_warning "Could not resolve CLI user — skipping auto-assign"
        return 0
    }
    local cli_username
    cli_username=$(echo "$org_info" | jq -r '.result.username // empty')

    if [ -z "$cli_username" ]; then
        log_warning "No username found for org $org_alias — skipping auto-assign"
        return 0
    fi

    log_info "CLI user: $cli_username"

    # Assign each base perm set that was deployed
    if [ -d "$TEMPLATE_DIR/base" ]; then
        for perm_file in "$TEMPLATE_DIR/base"/*.permissionset-meta.xml; do
            if [ -f "$perm_file" ]; then
                local ps_name
                ps_name=$(basename "$perm_file" .permissionset-meta.xml)
                assign_permission_set "$cli_username" "$ps_name" "$org_alias"
            fi
        done
    fi

    # Verify FLS after assignment
    verify_field_permissions "$cli_username" "$org_alias"
}

# Verify the CLI user's effective field permissions after perm set assignment.
# Queries PermissionSetAssignment to confirm assignment count, then spot-checks
# FieldPermissions on assigned perm sets.
# Note: PermissionSet deploys (v40+) preserve omitted entries — unlisted fields
# are ignored, not revoked. However, Profile deploys ARE destructive for omissions.
# This check catches: (a) perm sets not assigned to user, (b) Profile-based FLS
# regressions from mixed deploys, (c) explicit false entries in perm set XML.
# Ref: https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_permissionset.htm
# Ref: https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_fieldpermissions.htm
verify_field_permissions() {
    local username="$1"
    local org_alias="${2:-$(get_org_alias)}"

    log_info "Verifying field permissions for $username..."

    # Count perm set assignments for the user
    local count_query="SELECT COUNT() FROM PermissionSetAssignment WHERE Assignee.Username = '${username}' AND PermissionSet.IsOwnedByProfile = false"
    local count_result
    count_result=$(sf data query --query "$count_query" --target-org "$org_alias" --json 2>/dev/null) || {
        log_warning "Could not verify perm set assignments"
        return 0
    }
    local assignment_count
    assignment_count=$(echo "$count_result" | jq -r '.result.totalSize // 0')
    log_info "User has $assignment_count non-profile permission set assignments"

    # Spot-check: count FieldPermissions across assigned perm sets
    local fps_query="SELECT COUNT() FROM FieldPermissions WHERE Parent.IsOwnedByProfile = false AND ParentId IN (SELECT PermissionSetId FROM PermissionSetAssignment WHERE Assignee.Username = '${username}')"
    local fps_result
    fps_result=$(sf data query --query "$fps_query" --target-org "$org_alias" --json 2>/dev/null) || {
        log_warning "Could not query FieldPermissions — SOQL may be unsupported for this object via REST"
        return 0
    }
    local fps_count
    fps_count=$(echo "$fps_result" | jq -r '.result.totalSize // 0')
    log_info "FieldPermissions entries across assigned perm sets: $fps_count"

    if [ "$fps_count" -eq 0 ] && [ "$assignment_count" -gt 0 ]; then
        log_warning "ALERT: User has perm set assignments but zero FieldPermissions — possible FLS wipeout from partial XML deploy"
    else
        log_success "Field permission verification passed"
    fi
}

# Assign permission set to user
assign_permission_set() {
    local username="$1"
    local perm_set_name="$2"
    local org_alias="${3:-$(get_org_alias)}"

    log_info "Assigning permission set '$perm_set_name' to user '$username'"

    # Get User ID
    local user_query="SELECT Id FROM User WHERE Username = '$username' LIMIT 1"
    local user_result=$(sf data query --query "$user_query" --target-org "$org_alias" --json)
    local user_id=$(echo "$user_result" | jq -r '.result.records[0].Id // empty')

    if [ -z "$user_id" ]; then
        log_error "User not found: $username"
        return 1
    fi

    # Get Permission Set ID
    local perm_query="SELECT Id FROM PermissionSet WHERE Name = '$perm_set_name' LIMIT 1"
    local perm_result=$(sf data query --query "$perm_query" --target-org "$org_alias" --json)
    local perm_id=$(echo "$perm_result" | jq -r '.result.records[0].Id // empty')

    if [ -z "$perm_id" ]; then
        log_error "Permission set not found: $perm_set_name"
        return 1
    fi

    # Check if already assigned
    local check_query="SELECT Id FROM PermissionSetAssignment WHERE AssigneeId = '$user_id' AND PermissionSetId = '$perm_id' LIMIT 1"
    local check_result=$(sf data query --query "$check_query" --target-org "$org_alias" --json)
    local existing=$(echo "$check_result" | jq -r '.result.totalSize // 0')

    if [ "$existing" -gt 0 ]; then
        log_success "Permission set already assigned"
        return 0
    fi

    # Assign permission set
    if sf data create record \
        --sobject PermissionSetAssignment \
        --values "AssigneeId='$user_id' PermissionSetId='$perm_id'" \
        --target-org "$org_alias" > /dev/null 2>&1; then
        log_success "Permission set assigned successfully"
        return 0
    else
        log_error "Failed to assign permission set"
        return 1
    fi
}

# Main execution
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    case "${1:-}" in
        deploy)
            deploy_all_permission_sets "${2:-}"
            ;;
        assign)
            if [ -z "$2" ] || [ -z "$3" ]; then
                echo "Usage: $0 assign <username> <permission-set-name> [org-alias]"
                exit 1
            fi
            assign_permission_set "$2" "$3" "${4:-}"
            ;;
        check)
            if [ -z "$2" ]; then
                echo "Usage: $0 check <permission-set-name> [org-alias]"
                exit 1
            fi
            check_permission_set_exists "$2" "${3:-}"
            ;;
        *)
            echo "Usage: $0 {deploy|assign|check} [arguments]"
            echo "  deploy [org-alias] - Deploy all permission sets"
            echo "  assign <username> <perm-set> [org] - Assign permission set to user"
            echo "  check <perm-set> [org] - Check if permission set exists"
            exit 1
            ;;
    esac
fi