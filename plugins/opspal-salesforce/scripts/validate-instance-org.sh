#!/bin/bash

# Instance-Org Validation Script
# Prevents mismatched org configurations and ensures correct instance is active
# Run this before any Salesforce operations to prevent alias confusion

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Function to get current directory instance name
get_directory_instance() {
    local current_dir=$(pwd)
    if [[ "$current_dir" == *"/instances/"* ]]; then
        # Extract instance name from path
        echo "$current_dir" | sed -n 's|.*/instances/\([^/]*\).*|\1|p'
    else
        echo ""
    fi
}

# Function to get expected org details from .instance-env
get_expected_org() {
    if [ -f ".instance-env" ]; then
        source .instance-env
        echo "$SF_TARGET_ORG"
    else
        echo ""
    fi
}

# Function to get current default org
get_current_default_org() {
    sf config get target-org --json 2>/dev/null | jq -r '.result[0].value // ""'
}

# Function to get org details
get_org_details() {
    local alias=$1
    if [ -z "$alias" ]; then
        return 1
    fi

    sf org display --target-org "$alias" --json 2>/dev/null | jq -r '.result | "\(.username)|\(.instanceUrl)|\(.id)"'
}

# Function to validate org mapping
validate_org_mapping() {
    local instance_name=$1
    local expected_alias=$2
    local current_alias=$3

    info "Validating org configuration for instance: $instance_name"
    echo "------------------------------------------------------------"

    # Check if expected alias exists
    if ! sf org list --json 2>/dev/null | jq -e ".result.nonScratchOrgs[] | select(.alias == \"$expected_alias\")" > /dev/null 2>&1; then
        error "Expected org alias '$expected_alias' does not exist!"
        echo ""
        echo "Available org aliases:"
        sf org list --json 2>/dev/null | jq -r '.result.nonScratchOrgs[] | "  - \(.alias) (\(.username))"'
        return 1
    fi

    # Get org details
    local expected_details=$(get_org_details "$expected_alias")
    local current_details=$(get_org_details "$current_alias")

    # Parse details
    IFS='|' read -r expected_username expected_url expected_id <<< "$expected_details"
    IFS='|' read -r current_username current_url current_id <<< "$current_details"

    # Display comparison
    echo ""
    echo "Expected Configuration (from .instance-env):"
    echo "  Alias:    $expected_alias"
    echo "  Username: $expected_username"
    echo "  URL:      $expected_url"
    echo "  Org ID:   $expected_id"
    echo ""
    echo "Current Default Org:"
    echo "  Alias:    $current_alias"
    echo "  Username: $current_username"
    echo "  URL:      $current_url"
    echo "  Org ID:   $current_id"
    echo ""

    # Check for mismatches
    local has_error=0

    if [ "$expected_alias" != "$current_alias" ]; then
        warning "Default org alias mismatch!"
        has_error=1
    fi

    if [ "$expected_id" != "$current_id" ] && [ -n "$expected_id" ] && [ -n "$current_id" ]; then
        error "Org IDs don't match - pointing to different orgs!"
        has_error=1
    fi

    # Check for common misconfigurations
    if [[ "$instance_name" == "sample-org-production" ]] && [[ "$current_alias" == "gamma-corp" ]]; then
        error "CRITICAL: 'gamma-corp' is incorrectly set as default for sample-org-production!"
        echo ""
        echo "This is a known misconfiguration. The correct alias should be 'sample-org-production'."
        has_error=1
    fi

    if [[ "$expected_username" == *"sample-org.com"* ]] && [[ "$current_username" == *"gamma-corp"* ]]; then
        error "CRITICAL: Username domain mismatch - expecting sample-org.com but got gamma-corp!"
        has_error=1
    fi

    return $has_error
}

# Function to fix org configuration
fix_org_configuration() {
    local expected_alias=$1

    info "Fixing org configuration..."

    # Set the correct default org
    sf config set target-org="$expected_alias" --global

    # Verify the change
    local new_default=$(get_current_default_org)
    if [ "$new_default" == "$expected_alias" ]; then
        log "Successfully set default org to: $expected_alias"

        # Update environment variable
        export SF_TARGET_ORG="$expected_alias"

        # Display new configuration
        echo ""
        sf org display --target-org "$expected_alias"
        return 0
    else
        error "Failed to set default org!"
        return 1
    fi
}

# Main validation logic
main() {
    echo "=========================================="
    echo "     Instance-Org Validation Tool"
    echo "=========================================="

    # Get current context
    local dir_instance=$(get_directory_instance)
    local expected_org=$(get_expected_org)
    local current_default=$(get_current_default_org)

    if [ -z "$dir_instance" ]; then
        warning "Not in an instance directory"
        echo "Current directory: $(pwd)"
        exit 1
    fi

    if [ -z "$expected_org" ]; then
        error "No .instance-env file found or SF_TARGET_ORG not set"
        exit 1
    fi

    # Validate the configuration
    if validate_org_mapping "$dir_instance" "$expected_org" "$current_default"; then
        log "✓ Org configuration is correct!"
        exit 0
    else
        echo ""
        echo "=========================================="
        warning "Org configuration issues detected!"
        echo ""

        # Offer to fix
        read -p "Do you want to fix the configuration? (y/n): " -n 1 -r
        echo ""

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if fix_org_configuration "$expected_org"; then
                log "✓ Configuration fixed successfully!"

                # Save the configuration
                echo ""
                read -p "Save this configuration for future use? (y/n): " -n 1 -r
                echo ""

                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    ./scripts/persist-instance-config.sh save "$dir_instance"
                fi

                exit 0
            else
                error "Failed to fix configuration"
                exit 1
            fi
        else
            error "Configuration not fixed. Please fix manually."
            echo ""
            echo "To fix manually, run:"
            echo "  sf config set target-org=$expected_org --global"
            exit 1
        fi
    fi
}

# Run main function
main "$@"
