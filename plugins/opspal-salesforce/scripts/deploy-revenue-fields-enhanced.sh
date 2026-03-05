#!/bin/bash

# Enhanced Revenue Fields Deployment Script
# Uses the new advanced field deployer with verification

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Main deployment function
main() {
    print_status "$BLUE" "════════════════════════════════════════════════════════════"
    print_status "$BLUE" "🚀 ENHANCED REVENUE FIELDS DEPLOYMENT"
    print_status "$BLUE" "════════════════════════════════════════════════════════════"
    echo ""
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_status "$RED" "❌ Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    # Check if Salesforce CLI is installed
    if ! command -v sf &> /dev/null; then
        print_status "$RED" "❌ Salesforce CLI (sf) is not installed. Please install it first."
        exit 1
    fi
    
    # Verify Salesforce connection
    print_status "$BLUE" "🔍 Verifying Salesforce connection..."
    if ! sf org display >/dev/null 2>&1; then
        print_status "$RED" "❌ Not connected to Salesforce. Please authenticate first:"
        print_status "$YELLOW" "   sf org login web --alias myorg"
        exit 1
    fi
    
    ORG_INFO=$(sf org display --json | jq -r '.result | "\(.username) (\(.alias))"')
    print_status "$GREEN" "✅ Connected to: $ORG_INFO"
    echo ""
    
    # Deploy using advanced field deployer
    print_status "$BLUE" "🚀 Starting advanced field deployment..."
    print_status "$YELLOW" "   This will use multiple deployment methods with verification"
    echo ""
    
    # Run the advanced field deployer
    node ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}
    DEPLOY_RESULT=$?
    
    echo ""
    
    if [ $DEPLOY_RESULT -eq 0 ]; then
        print_status "$GREEN" "✅ All revenue fields deployed and verified successfully!"
        echo ""
        
        # Run verification service for each field
        print_status "$BLUE" "🔍 Running comprehensive verification..."
        echo ""
        
        FIELDS=("Contract_Value__c" "Monthly_Recurring_Revenue__c" "Annual_Contract_Value__c")
        
        for field in "${FIELDS[@]}"; do
            print_status "$BLUE" "   Verifying $field..."
            node ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}} Opportunity "$field"
            echo ""
        done
        
        print_status "$GREEN" "════════════════════════════════════════════════════════════"
        print_status "$GREEN" "✅ DEPLOYMENT COMPLETE"
        print_status "$GREEN" "════════════════════════════════════════════════════════════"
        echo ""
        print_status "$BLUE" "Next Steps:"
        print_status "$BLUE" "1. ✅ Fields are now accessible for report creation"
        print_status "$BLUE" "2. 📊 You can create reports using these revenue fields"
        print_status "$BLUE" "3. 🔐 Field-level security has been configured"
        print_status "$BLUE" "4. 📝 Add fields to page layouts as needed"
        echo ""
        
    else
        print_status "$RED" "❌ Some fields failed to deploy"
        echo ""
        
        # Check if recovery script was generated
        if [ -f "field-deployment-report.json" ]; then
            print_status "$YELLOW" "📄 Review the deployment report: field-deployment-report.json"
        fi
        
        # Offer to run monitoring mode
        print_status "$YELLOW" "💡 You can monitor field accessibility with:"
        print_status "$YELLOW" "   node scripts/field-verification-service.js Opportunity Contract_Value__c --monitor"
        echo ""
        
        print_status "$RED" "════════════════════════════════════════════════════════════"
        print_status "$RED" "⚠️  DEPLOYMENT PARTIALLY FAILED"
        print_status "$RED" "════════════════════════════════════════════════════════════"
        echo ""
        print_status "$YELLOW" "Troubleshooting Steps:"
        print_status "$YELLOW" "1. Check field-deployment-report.json for details"
        print_status "$YELLOW" "2. Run recovery scripts if generated"
        print_status "$YELLOW" "3. Try manual deployment through Setup UI"
        print_status "$YELLOW" "4. Contact Salesforce support if issue persists"
        
        exit 1
    fi
}

# Help function
show_help() {
    cat << EOF
Enhanced Revenue Fields Deployment Script

This script uses the advanced field deployer with multi-method deployment
and comprehensive verification to ensure fields are actually accessible.

Usage:
    $0 [--help]

Features:
    - Multiple deployment methods (MCP, SF CLI, Apex)
    - Automatic retry logic
    - Post-deployment verification
    - Recovery script generation
    - Field accessibility monitoring

Fields to Deploy:
    - Contract_Value__c (Currency)
    - Monthly_Recurring_Revenue__c (Currency)
    - Annual_Contract_Value__c (Currency)

Prerequisites:
    - Node.js installed
    - Salesforce CLI installed and authenticated
    - Appropriate permissions to create custom fields

Examples:
    $0                    # Deploy and verify fields

EOF
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        show_help
        exit 0
        ;;
    "")
        main
        ;;
    *)
        print_status "$RED" "❌ Unknown option: $1"
        print_status "$YELLOW" "Use --help for usage information"
        exit 1
        ;;
esac
