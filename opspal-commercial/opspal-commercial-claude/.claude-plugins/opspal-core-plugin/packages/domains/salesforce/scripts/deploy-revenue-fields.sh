#!/bin/bash

# Deploy Revenue Fields Script
# This script creates and deploys the missing revenue fields that caused report creation issues

set -e  # Exit on any error

# Configuration
ORG_ALIAS=${SF_TARGET_ORG:-"default"}
OBJECT_NAME="Opportunity"
METADATA_DIR="./force-app/main/default/objects/${OBJECT_NAME}/fields"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Revenue fields to deploy
declare -A REVENUE_FIELDS
REVENUE_FIELDS=(
    ["Contract_Value__c"]="Contract Value|Currency|Total value of the contract"
    ["Monthly_Recurring_Revenue__c"]="Monthly Recurring Revenue|Currency|Monthly recurring revenue amount"
    ["Annual_Contract_Value__c"]="Annual Contract Value|Currency|Total annual contract value"
)

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to create field metadata
create_field_metadata() {
    local field_api_name=$1
    local field_info=$2
    
    IFS='|' read -r label type description <<< "$field_info"
    
    local metadata_file="${METADATA_DIR}/${field_api_name}.field-meta.xml"
    
    # Create directory if it doesn't exist
    mkdir -p "$METADATA_DIR"
    
    # Generate metadata XML
    cat > "$metadata_file" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${field_api_name}</fullName>
    <label>${label}</label>
    <type>${type}</type>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <trackHistory>false</trackHistory>
    <description>${description}</description>
    <inlineHelpText>This field is used for revenue reporting and analytics.</inlineHelpText>
    <precision>18</precision>
    <scale>2</scale>
</CustomField>
EOF
    
    print_status "$GREEN" "✓ Created metadata for ${field_api_name}"
    echo "  File: ${metadata_file}"
}

# Function to verify Salesforce connection
verify_connection() {
    print_status "$BLUE" "🔍 Verifying Salesforce connection..."
    
    if ! sf org display --target-org "$ORG_ALIAS" >/dev/null 2>&1; then
        print_status "$RED" "❌ Not connected to Salesforce org: $ORG_ALIAS"
        print_status "$YELLOW" "Please run: sf org login web --alias $ORG_ALIAS"
        exit 1
    fi
    
    local org_info=$(sf org display --target-org "$ORG_ALIAS" --json | jq -r '.result | "\(.username) (\(.orgId))"')
    print_status "$GREEN" "✅ Connected to: $org_info"
}

# Function to check if field already exists
field_exists() {
    local field_name=$1
    
    local query="SELECT QualifiedApiName FROM FieldDefinition WHERE QualifiedApiName = '${field_name}' AND EntityDefinition.QualifiedApiName = '${OBJECT_NAME}'"
    local result=$(sf data query --query "$query" --target-org "$ORG_ALIAS" --json | jq -r '.result.totalSize')
    
    [ "$result" -gt 0 ]
}

# Function to deploy field
deploy_field() {
    local field_api_name=$1
    local metadata_file="${METADATA_DIR}/${field_api_name}.field-meta.xml"
    
    print_status "$BLUE" "🚀 Deploying ${field_api_name}..."
    
    # Deploy the field
    if sf project deploy start --sourcepath "$metadata_file" --target-org "$ORG_ALIAS" >/dev/null 2>&1; then
        print_status "$GREEN" "✓ Deployment completed for ${field_api_name}"
        
        # Wait for deployment to propagate
        print_status "$YELLOW" "   Waiting for deployment to propagate..."
        sleep 10
        
        # Verify deployment
        if field_exists "$field_api_name"; then
            print_status "$GREEN" "✅ ${field_api_name} successfully deployed and verified"
            return 0
        else
            print_status "$RED" "❌ ${field_api_name} deployment verification failed"
            return 1
        fi
    else
        print_status "$RED" "❌ Deployment failed for ${field_api_name}"
        return 1
    fi
}

# Function to clean up metadata files
cleanup_metadata() {
    if [ "$1" = "true" ]; then
        print_status "$YELLOW" "🧹 Cleaning up metadata files..."
        rm -rf "$METADATA_DIR"
        print_status "$GREEN" "✓ Metadata files cleaned up"
    fi
}

# Main deployment function
main() {
    local cleanup_after=${1:-false}
    
    print_status "$BLUE" "🚀 Starting Revenue Fields Deployment"
    print_status "$BLUE" "Target Object: $OBJECT_NAME"
    print_status "$BLUE" "Target Org: $ORG_ALIAS"
    echo ""
    
    # Verify connection
    verify_connection
    echo ""
    
    # Check existing fields
    print_status "$BLUE" "🔍 Checking existing fields..."
    local existing_count=0
    local to_deploy=()
    
    for field_api_name in "${!REVENUE_FIELDS[@]}"; do
        if field_exists "$field_api_name"; then
            print_status "$YELLOW" "⚠️  ${field_api_name} already exists, skipping"
            ((existing_count++))
        else
            print_status "$RED" "❌ ${field_api_name} does not exist, will deploy"
            to_deploy+=("$field_api_name")
        fi
    done
    
    echo ""
    print_status "$BLUE" "📊 Summary: ${existing_count} existing, ${#to_deploy[@]} to deploy"
    echo ""
    
    if [ ${#to_deploy[@]} -eq 0 ]; then
        print_status "$GREEN" "✅ All revenue fields already exist. No deployment needed."
        exit 0
    fi
    
    # Create metadata for fields to deploy
    print_status "$BLUE" "📝 Creating metadata files..."
    for field_api_name in "${to_deploy[@]}"; do
        create_field_metadata "$field_api_name" "${REVENUE_FIELDS[$field_api_name]}"
    done
    echo ""
    
    # Deploy fields
    print_status "$BLUE" "🚀 Deploying fields..."
    local deployed_count=0
    local failed_deployments=()
    
    for field_api_name in "${to_deploy[@]}"; do
        if deploy_field "$field_api_name"; then
            ((deployed_count++))
        else
            failed_deployments+=("$field_api_name")
        fi
        echo ""
    done
    
    # Final summary
    echo "=" * 60
    print_status "$BLUE" "📋 DEPLOYMENT SUMMARY"
    echo "=" * 60
    print_status "$GREEN" "✅ Successfully deployed: $deployed_count fields"
    
    if [ ${#failed_deployments[@]} -gt 0 ]; then
        print_status "$RED" "❌ Failed deployments: ${#failed_deployments[@]} fields"
        for field in "${failed_deployments[@]}"; do
            print_status "$RED" "   - $field"
        done
    fi
    
    print_status "$YELLOW" "⚠️  Fields already existing: $existing_count"
    echo ""
    
    if [ ${#failed_deployments[@]} -eq 0 ]; then
        print_status "$GREEN" "🎉 All revenue fields are now available for report creation!"
        print_status "$BLUE" "💡 Next steps:"
        print_status "$BLUE" "   1. Verify fields are accessible in your reports"
        print_status "$BLUE" "   2. Update page layouts if needed"
        print_status "$BLUE" "   3. Configure field-level security as required"
    else
        print_status "$RED" "⚠️  Some deployments failed. Please check the errors and try again."
        cleanup_metadata true
        exit 1
    fi
    
    # Cleanup if requested
    cleanup_metadata "$cleanup_after"
    
    echo ""
    print_status "$BLUE" "⏰ Deployment completed at: $(date)"
}

# Help function
show_help() {
    cat << EOF
Deploy Revenue Fields Script

This script deploys custom revenue fields to Salesforce to support report creation.

Usage:
    $0 [--cleanup] [--help]

Options:
    --cleanup    Remove metadata files after successful deployment
    --help       Show this help message

Environment Variables:
    SF_TARGET_ORG    Salesforce org alias (default: "default")

Fields to Deploy:
    - Contract_Value__c (Currency)
    - Monthly_Recurring_Revenue__c (Currency) 
    - Annual_Contract_Value__c (Currency)

Prerequisites:
    - Salesforce CLI installed and authenticated
    - Appropriate permissions to create custom fields
    - Target org should be a sandbox for testing

Examples:
    $0                    # Deploy fields, keep metadata
    $0 --cleanup         # Deploy fields and cleanup metadata
    SF_TARGET_ORG=sandbox $0  # Deploy to specific org

EOF
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        show_help
        exit 0
        ;;
    --cleanup)
        main true
        ;;
    "")
        main false
        ;;
    *)
        print_status "$RED" "❌ Unknown option: $1"
        print_status "$YELLOW" "Use --help for usage information"
        exit 1
        ;;
esac
