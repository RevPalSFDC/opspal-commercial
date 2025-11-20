#!/bin/bash

# Pre-Operation Validation Hook for Salesforce Essentials
#
# This hook runs before any Salesforce operation to validate:
# - Org connection exists
# - User permissions are sufficient
# - Operation is safe (warns on destructive ops in production)
# - Required objects/fields exist
#
# Usage: Called automatically before agent operations
# Returns: 0 if validation passes, 1 if fails with error message

set -euo pipefail

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Get operation details from arguments
OPERATION_TYPE="${1:-unknown}"  # query, metadata, data, etc.
TARGET_ORG="${2:-}"
OPERATION_CONTEXT="${3:-}"  # Additional context (object name, etc.)

# Helper function to print error
error() {
    echo -e "${RED}❌ Pre-flight Validation Failed${NC}" >&2
    echo -e "${RED}$1${NC}" >&2
    exit 1
}

# Helper function to print warning
warn() {
    echo -e "${YELLOW}⚠️  Warning: $1${NC}" >&2
}

# Helper function to print success
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# 1. Check if Salesforce CLI is installed
if ! command -v sf &> /dev/null; then
    error "Salesforce CLI not installed. Run: npm install -g @salesforce/cli"
fi

success "Salesforce CLI installed"

# 2. Check if target org is specified
if [ -z "$TARGET_ORG" ]; then
    # Try to get default org
    TARGET_ORG=$(sf config get target-org --json 2>/dev/null | jq -r '.result[0].value // ""' || echo "")

    if [ -z "$TARGET_ORG" ]; then
        warn "No target org specified and no default org set"
        echo ""
        echo "Options:"
        echo "1. Set default org: sf config set target-org <alias>"
        echo "2. Specify org in operation: --target-org <alias>"
        echo "3. Run /getstarted to configure Salesforce"
        echo ""
        exit 0  # Don't fail, just warn
    else
        echo "Using default org: $TARGET_ORG"
    fi
fi

# 3. Verify org connection
echo "Validating connection to: $TARGET_ORG"

if ! sf org display --target-org "$TARGET_ORG" --json &> /dev/null; then
    error "Cannot connect to org '$TARGET_ORG'. Run: sf org login web --alias $TARGET_ORG"
fi

success "Connected to org: $TARGET_ORG"

# 4. Check org type (production vs sandbox)
ORG_TYPE=$(sf org display --target-org "$TARGET_ORG" --json 2>/dev/null | \
    jq -r '.result.connectedStatus // "unknown"')

IS_PRODUCTION=$(sf org display --target-org "$TARGET_ORG" --json 2>/dev/null | \
    jq -r '.result.instanceUrl // ""' | grep -v "sandbox\|scratch" && echo "true" || echo "false")

if [ "$IS_PRODUCTION" = "true" ]; then
    warn "Connected to PRODUCTION org: $TARGET_ORG"

    # Check if operation is destructive
    case "$OPERATION_TYPE" in
        delete|remove|destroy|drop)
            echo -e "${RED}⚠️  DESTRUCTIVE OPERATION IN PRODUCTION!${NC}" >&2
            echo "Operation: $OPERATION_TYPE" >&2
            echo "Context: $OPERATION_CONTEXT" >&2
            echo "" >&2
            echo "Recommendations:" >&2
            echo "1. Test in sandbox first" >&2
            echo "2. Create backup before proceeding" >&2
            echo "3. Have rollback plan ready" >&2
            echo "" >&2
            read -p "Continue? (type 'yes' to proceed): " CONFIRM
            if [ "$CONFIRM" != "yes" ]; then
                error "Operation cancelled by user"
            fi
            ;;
        update|modify|change)
            warn "Modifying production data/metadata"
            echo "Recommendation: Test in sandbox first"
            ;;
    esac
else
    echo "Connected to sandbox/scratch org (safe for testing)"
fi

# 5. Check API limits
echo "Checking API limits..."

API_USAGE=$(sf limits api display --target-org "$TARGET_ORG" --json 2>/dev/null | \
    jq -r '.result.Daily.Remaining // 0')

if [ "$API_USAGE" -lt 100 ]; then
    warn "Low API calls remaining: $API_USAGE"
    echo "Consider waiting or reducing batch sizes"
fi

# 6. Operation-specific validations
case "$OPERATION_TYPE" in
    query)
        # SOQL query validation
        if [ -n "$OPERATION_CONTEXT" ]; then
            # Check for common SOQL errors
            if echo "$OPERATION_CONTEXT" | grep -qi "SELECT \*"; then
                warn "SELECT * is not valid SOQL syntax. Specify fields explicitly."
            fi

            if echo "$OPERATION_CONTEXT" | grep -qi "ApiName" && echo "$OPERATION_CONTEXT" | grep -qi "FlowVersionView"; then
                warn "ApiName field doesn't exist on FlowVersionView. Use DeveloperName instead."
            fi
        fi
        ;;

    metadata)
        # Metadata deployment validation
        if [ -n "$OPERATION_CONTEXT" ]; then
            # Check if object exists
            OBJECT_NAME=$(echo "$OPERATION_CONTEXT" | grep -oP '(?<=object:)[^,]+' || echo "")
            if [ -n "$OBJECT_NAME" ]; then
                if ! sf sobject describe "$OBJECT_NAME" --target-org "$TARGET_ORG" &> /dev/null; then
                    warn "Object '$OBJECT_NAME' may not exist in this org"
                fi
            fi
        fi
        ;;

    data)
        # Data operation validation
        if [ "$IS_PRODUCTION" = "true" ]; then
            warn "Data operation in production - ensure you have backups"
        fi
        ;;
esac

# 7. Check user permissions (basic check)
echo "Checking user permissions..."

USER_PROFILE=$(sf org display --target-org "$TARGET_ORG" --json 2>/dev/null | \
    jq -r '.result.profileName // "unknown"')

if [ "$USER_PROFILE" = "Standard User" ] || [ "$USER_PROFILE" = "Chatter Free User" ]; then
    warn "User profile '$USER_PROFILE' may have limited permissions"
    echo "Some operations may fail due to permission restrictions"
fi

# 8. Success - all validations passed
echo ""
success "All pre-flight validations passed"
echo "Proceeding with operation: $OPERATION_TYPE"
echo ""

exit 0
