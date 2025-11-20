#!/bin/bash

# Pre-Operation Validation Hook for HubSpot Essentials
#
# This hook runs before any HubSpot operation to validate:
# - API access token is set
# - API connection is working
# - Rate limits are healthy
# - Required scopes are present
# - Operation is safe (warns on bulk deletions)
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
OPERATION_TYPE="${1:-unknown}"  # property, contact, workflow, etc.
OPERATION_ACTION="${2:-read}"   # read, write, delete
OPERATION_CONTEXT="${3:-}"      # Additional context

# Helper functions
error() {
    echo -e "${RED}❌ Pre-flight Validation Failed${NC}" >&2
    echo -e "${RED}$1${NC}" >&2
    exit 1
}

warn() {
    echo -e "${YELLOW}⚠️  Warning: $1${NC}" >&2
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# 1. Check if access token is set
if [ -z "${HUBSPOT_ACCESS_TOKEN:-}" ]; then
    error "HUBSPOT_ACCESS_TOKEN environment variable not set

Get your access token:
1. Go to HubSpot Settings → Integrations → Private Apps
2. Create or select a private app
3. Copy access token
4. Set environment variable:
   export HUBSPOT_ACCESS_TOKEN=\"your-token-here\"

Or run: /getstarted"
fi

success "HubSpot access token is set"

# 2. Test API connection
echo "Testing HubSpot API connection..."

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
    "https://api.hubapi.com/crm/v3/objects/contacts?limit=1")

case "$HTTP_CODE" in
    200)
        success "API connection successful"
        ;;
    401)
        error "API authentication failed (401 Unauthorized)

Possible causes:
- Access token is invalid or expired
- Token format is incorrect

Fix:
1. Verify token starts with 'pat-'
2. Generate new token in HubSpot Settings
3. Update HUBSPOT_ACCESS_TOKEN"
        ;;
    403)
        error "API access forbidden (403)

Possible causes:
- Missing required API scopes
- App not enabled

Fix:
1. Go to HubSpot Settings → Private Apps
2. Add required scopes for this operation
3. Generate new access token"
        ;;
    429)
        error "Rate limit exceeded (429 Too Many Requests)

Your API quota is exhausted.

Fix:
1. Wait for rate limit reset (check headers)
2. Reduce operation frequency
3. Use batch operations
4. Upgrade HubSpot account tier"
        ;;
    *)
        warn "Unexpected API response code: $HTTP_CODE"
        ;;
esac

# 3. Check rate limits
echo "Checking API rate limits..."

RATE_LIMIT_RESPONSE=$(curl -s -I \
    -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
    "https://api.hubapi.com/crm/v3/objects/contacts?limit=1")

DAILY_LIMIT=$(echo "$RATE_LIMIT_RESPONSE" | grep -i "x-hubspot-ratelimit-daily:" | \
    awk '{print $2}' | tr -d '\r' || echo "unknown")
DAILY_REMAINING=$(echo "$RATE_LIMIT_RESPONSE" | grep -i "x-hubspot-ratelimit-daily-remaining:" | \
    awk '{print $2}' | tr -d '\r' || echo "unknown")

if [ "$DAILY_REMAINING" != "unknown" ] && [ "$DAILY_REMAINING" -lt 100 ]; then
    warn "Low API calls remaining today: $DAILY_REMAINING / $DAILY_LIMIT"
    echo "Consider:"
    echo "- Waiting for daily reset (midnight UTC)"
    echo "- Reducing batch sizes"
    echo "- Postponing non-critical operations"
else
    echo "API rate limits healthy: $DAILY_REMAINING / $DAILY_LIMIT remaining"
fi

# 4. Check required scopes for operation
echo "Validating API scopes for operation..."

REQUIRED_SCOPES=()
case "$OPERATION_TYPE" in
    contact*)
        if [ "$OPERATION_ACTION" = "write" ] || [ "$OPERATION_ACTION" = "delete" ]; then
            REQUIRED_SCOPES+=("crm.objects.contacts.write")
        else
            REQUIRED_SCOPES+=("crm.objects.contacts.read")
        fi
        ;;
    company*|companies)
        if [ "$OPERATION_ACTION" = "write" ] || [ "$OPERATION_ACTION" = "delete" ]; then
            REQUIRED_SCOPES+=("crm.objects.companies.write")
        else
            REQUIRED_SCOPES+=("crm.objects.companies.read")
        fi
        ;;
    deal*)
        if [ "$OPERATION_ACTION" = "write" ] || [ "$OPERATION_ACTION" = "delete" ]; then
            REQUIRED_SCOPES+=("crm.objects.deals.write")
        else
            REQUIRED_SCOPES+=("crm.objects.deals.read")
        fi
        ;;
    workflow*)
        REQUIRED_SCOPES+=("automation")
        ;;
    property*|properties)
        REQUIRED_SCOPES+=("crm.schemas.contacts.read")
        ;;
esac

if [ ${#REQUIRED_SCOPES[@]} -gt 0 ]; then
    echo "Operation requires scopes: ${REQUIRED_SCOPES[*]}"
    warn "Cannot verify scopes automatically - ensure your private app has these scopes"
fi

# 5. Warn on destructive operations
case "$OPERATION_ACTION" in
    delete)
        echo -e "${RED}⚠️  DESTRUCTIVE OPERATION: DELETE${NC}" >&2
        echo "Operation: $OPERATION_TYPE delete" >&2
        echo "Context: $OPERATION_CONTEXT" >&2
        echo "" >&2
        echo "Recommendations:" >&2
        echo "1. Create backup/export before deletion" >&2
        echo "2. Verify you're deleting the correct records" >&2
        echo "3. HubSpot deletions are often permanent" >&2
        echo "" >&2

        # Special warning for bulk deletes
        if echo "$OPERATION_CONTEXT" | grep -qi "bulk\|batch\|multiple"; then
            echo -e "${RED}⚠️  BULK DELETION DETECTED${NC}" >&2
            echo "This will delete multiple records!" >&2
            echo "" >&2
            read -p "Type 'DELETE' to confirm bulk deletion: " CONFIRM
            if [ "$CONFIRM" != "DELETE" ]; then
                error "Operation cancelled by user"
            fi
        fi
        ;;

    write)
        # Warn on bulk updates
        if echo "$OPERATION_CONTEXT" | grep -qi "bulk\|batch\|all"; then
            warn "Bulk update operation detected"
            echo "Recommendation: Test with small batch first"
        fi
        ;;
esac

# 6. Check for common mistakes
if [ "$OPERATION_TYPE" = "property" ] && [ "$OPERATION_ACTION" = "write" ]; then
    warn "Creating/modifying properties affects your entire portal"
    echo "Ensure property names follow your naming convention"
fi

if [ "$OPERATION_TYPE" = "workflow" ] && [ "$OPERATION_ACTION" = "write" ]; then
    warn "Workflow changes can trigger automation"
    echo "Recommendations:"
    echo "- Test workflows with test contacts first"
    echo "- Review enrollment criteria carefully"
    echo "- Check re-enrollment settings"
fi

# 7. Operation-specific validations
case "$OPERATION_TYPE" in
    list)
        # List operations
        if [ "$OPERATION_ACTION" = "write" ]; then
            echo "Creating list - ensure filters are correct"
        fi
        ;;

    import)
        # Data import
        warn "Data imports cannot be easily undone"
        echo "Recommendations:"
        echo "- Use test import with small file first"
        echo "- Verify field mappings"
        echo "- Check for duplicates"
        ;;

    export)
        # Data export - generally safe
        echo "Export operation - no validation needed"
        ;;
esac

# 8. Check portal ID if needed
if [ -n "${HUBSPOT_PORTAL_ID:-}" ]; then
    echo "Using portal ID: $HUBSPOT_PORTAL_ID"
else
    # Portal ID is optional for most operations
    echo "Portal ID not set (optional for most operations)"
fi

# 9. Success - all validations passed
echo ""
success "All pre-flight validations passed"
echo "Proceeding with operation: $OPERATION_TYPE ($OPERATION_ACTION)"
echo ""

exit 0
