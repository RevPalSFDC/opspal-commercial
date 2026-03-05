#!/bin/bash

# Permission Set Deployment Utilities
# Instance-agnostic permission management system
# Version: 1.0.0

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
    local result=$(sf data query --query "$query" --target-org "$org_alias" --json 2>/dev/null || echo '{"result":{"totalSize":0}}')

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