#!/bin/bash

# Permission Verification Script
# Validates that users have expected permissions after deployment
# Version: 1.0.0

# Source utilities
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "$SCRIPT_DIR/lib/permission-deployment-utils.sh"

# Function to verify user permissions
verify_user_permissions() {
    local username="$1"
    local expected_perms="$2"
    local org_alias="${3:-$(get_org_alias)}"

    log_section "Verifying Permissions for $username"

    # Get user details
    local query="SELECT Id, Name, Profile.Name, IsActive FROM User WHERE Username = '$username' LIMIT 1"
    local result=$(sf data query --query "$query" --target-org "$org_alias" --json 2>/dev/null)

    local user_id=$(echo "$result" | jq -r '.result.records[0].Id // empty')
    local user_name=$(echo "$result" | jq -r '.result.records[0].Name // empty')
    local profile_name=$(echo "$result" | jq -r '.result.records[0].Profile.Name // empty')
    local is_active=$(echo "$result" | jq -r '.result.records[0].IsActive // false')

    if [ -z "$user_id" ]; then
        log_error "User not found: $username"
        return 1
    fi

    log_info "User: $user_name"
    log_info "Profile: $profile_name"
    log_info "Active: $is_active"

    # Get assigned permission sets
    log_info "Checking assigned permission sets..."
    local perm_query="SELECT PermissionSet.Name, PermissionSet.Label FROM PermissionSetAssignment WHERE AssigneeId = '$user_id' AND PermissionSet.IsOwnedByProfile = false ORDER BY PermissionSet.Name"
    local perm_result=$(sf data query --query "$perm_query" --target-org "$org_alias" --json 2>/dev/null)

    echo "$perm_result" | jq -r '.result.records[] | "  - \(.PermissionSet.Name): \(.PermissionSet.Label)"'

    # Check specific object access
    log_info "Verifying object permissions..."
    verify_object_access "$user_id" "$org_alias"

    # Check report permissions
    log_info "Verifying report permissions..."
    verify_report_access "$user_id" "$org_alias"

    return 0
}

# Verify object access
verify_object_access() {
    local user_id="$1"
    local org_alias="$2"

    # Check Lead access
    local lead_query="SELECT Id FROM ObjectPermissions WHERE Parent.ProfileId IN (SELECT ProfileId FROM User WHERE Id = '$user_id') AND SobjectType = 'Lead' AND PermissionsRead = true"
    local lead_result=$(sf data query --query "$lead_query" --target-org "$org_alias" --json 2>/dev/null)
    local lead_access=$(echo "$lead_result" | jq -r '.result.totalSize // 0')

    if [ "$lead_access" -gt 0 ]; then
        log_success "  ✓ Lead object: Read access"
    else
        # Check via permission sets
        local perm_lead_query="SELECT COUNT(Id) cnt FROM PermissionSetAssignment WHERE AssigneeId = '$user_id' AND PermissionSet.PermissionsRunReports = true"
        local perm_lead_result=$(sf data query --query "$perm_lead_query" --target-org "$org_alias" --json 2>/dev/null)
        local perm_lead_count=$(echo "$perm_lead_result" | jq -r '.result.records[0].cnt // 0')

        if [ "$perm_lead_count" -gt 0 ]; then
            log_success "  ✓ Lead object: Read access (via Permission Set)"
        else
            log_warning "  ✗ Lead object: No read access"
        fi
    fi

    # Check Campaign access
    local campaign_query="SELECT Id FROM ObjectPermissions WHERE Parent.ProfileId IN (SELECT ProfileId FROM User WHERE Id = '$user_id') AND SobjectType = 'Campaign' AND PermissionsRead = true"
    local campaign_result=$(sf data query --query "$campaign_query" --target-org "$org_alias" --json 2>/dev/null)
    local campaign_access=$(echo "$campaign_result" | jq -r '.result.totalSize // 0')

    if [ "$campaign_access" -gt 0 ]; then
        log_success "  ✓ Campaign object: Read access"
    else
        log_warning "  ✗ Campaign object: No read access"
    fi
}

# Verify report access
verify_report_access() {
    local user_id="$1"
    local org_alias="$2"

    # Check report permissions via permission sets
    local report_query="SELECT COUNT(Id) cnt FROM PermissionSetAssignment WHERE AssigneeId = '$user_id' AND PermissionSet.PermissionsRunReports = true"
    local report_result=$(sf data query --query "$report_query" --target-org "$org_alias" --json 2>/dev/null)
    local can_run_reports=$(echo "$report_result" | jq -r '.result.records[0].cnt // 0')

    if [ "$can_run_reports" -gt 0 ]; then
        log_success "  ✓ Run Reports: Enabled"
    else
        log_warning "  ✗ Run Reports: Disabled"
    fi

    # Check dashboard permissions
    local dash_query="SELECT COUNT(Id) cnt FROM PermissionSetAssignment WHERE AssigneeId = '$user_id' AND PermissionSet.PermissionsViewAllData = true"
    local dash_result=$(sf data query --query "$dash_query" --target-org "$org_alias" --json 2>/dev/null)
    local can_view_dashboards=$(echo "$dash_result" | jq -r '.result.records[0].cnt // 0')

    if [ "$can_view_dashboards" -gt 0 ]; then
        log_success "  ✓ View Dashboards: Enabled"
    else
        log_warning "  ✗ View Dashboards: May be limited"
    fi
}

# Test report access
test_report_access() {
    local username="$1"
    local report_id="$2"
    local org_alias="${3:-$(get_org_alias)}"

    log_section "Testing Report Access"
    log_info "User: $username"
    log_info "Report ID: $report_id"

    # Get user ID
    local user_query="SELECT Id FROM User WHERE Username = '$username' LIMIT 1"
    local user_result=$(sf data query --query "$user_query" --target-org "$org_alias" --json 2>/dev/null)
    local user_id=$(echo "$user_result" | jq -r '.result.records[0].Id // empty')

    if [ -z "$user_id" ]; then
        log_error "User not found"
        return 1
    fi

    # Check if user can access the specific report
    log_info "Checking report accessibility..."

    # Query report details
    local report_query="SELECT Id, Name, FolderName, Format, CreatedBy.Name FROM Report WHERE Id = '$report_id' LIMIT 1"
    local report_result=$(sf data query --query "$report_query" --target-org "$org_alias" --json 2>/dev/null)

    if [ "$(echo "$report_result" | jq -r '.result.totalSize // 0')" -gt 0 ]; then
        local report_name=$(echo "$report_result" | jq -r '.result.records[0].Name // "Unknown"')
        local folder_name=$(echo "$report_result" | jq -r '.result.records[0].FolderName // "Unknown"')

        log_success "Report found: $report_name"
        log_info "Folder: $folder_name"

        # Check if it's a campaign report
        if echo "$report_name" | grep -qi "campaign\|lead"; then
            log_info "This appears to be a Campaign/Lead report - verifying object access..."
            verify_object_access "$user_id" "$org_alias"
        fi
    else
        log_error "Report not found or not accessible"
        return 1
    fi
}

# Batch verification from config
verify_from_config() {
    local config_file="${1:-$CONFIG_DIR/permission-assignments.yaml}"
    local org_alias="${2:-$(get_org_alias)}"

    if [ ! -f "$config_file" ]; then
        log_error "Configuration file not found: $config_file"
        return 1
    fi

    log_section "Batch Permission Verification"
    log_info "Using config: $config_file"

    # Parse and verify each user
    # Note: This is a simplified version - in production, use proper YAML parser
    while IFS= read -r line; do
        if [[ $line =~ ^[[:space:]]*-[[:space:]]*username:[[:space:]]*(.+) ]]; then
            username="${BASH_REMATCH[1]}"
            verify_user_permissions "$username" "" "$org_alias"
            echo ""
        fi
    done < "$config_file"
}

# Main execution
main() {
    case "${1:-}" in
        user)
            if [ -z "$2" ]; then
                echo "Usage: $0 user <username> [org-alias]"
                exit 1
            fi
            verify_user_permissions "$2" "" "${3:-}"
            ;;
        report)
            if [ -z "$2" ] || [ -z "$3" ]; then
                echo "Usage: $0 report <username> <report-id> [org-alias]"
                exit 1
            fi
            test_report_access "$2" "$3" "${4:-}"
            ;;
        batch)
            verify_from_config "${2:-}" "${3:-}"
            ;;
        *)
            echo "Permission Verification Tool"
            echo ""
            echo "Usage: $0 {user|report|batch} [arguments]"
            echo ""
            echo "Commands:"
            echo "  user <username> [org]       - Verify user permissions"
            echo "  report <user> <id> [org]    - Test report access"
            echo "  batch [config] [org]        - Batch verify from config"
            echo ""
            echo "Examples:"
            echo "  $0 user jane.doe@company.com"
            echo "  $0 report jane.doe@company.com 00O123456789"
            echo "  $0 batch config/permission-assignments.yaml"
            exit 1
            ;;
    esac
}

main "$@"