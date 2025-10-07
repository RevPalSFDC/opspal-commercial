#!/bin/bash
#
# Salesloft Sync Error Fix Execution Script
# This script runs all automated fixes we can perform via API
#
# Usage:
#   export SALESLOFT_TOKEN="your-token-here"
#   ./execute-salesloft-fixes.sh [--dry-run]
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for dry-run flag
DRY_RUN=""
if [ "$1" == "--dry-run" ]; then
    DRY_RUN="--dry-run"
    echo -e "${YELLOW}Running in DRY-RUN mode - no changes will be made${NC}"
fi

# Base directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."

echo "=========================================="
echo "Salesloft Sync Error Automated Fix Script"
echo "=========================================="
echo "Timestamp: $(date)"
echo ""

# Check for required environment variable
if [ -z "$SALESLOFT_TOKEN" ]; then
    echo -e "${RED}ERROR: SALESLOFT_TOKEN environment variable is not set${NC}"
    echo ""
    echo "Please set it using:"
    echo "  export SALESLOFT_TOKEN='your-salesloft-api-token'"
    echo ""
    echo "To get your token:"
    echo "  1. Log into Salesloft"
    echo "  2. Go to Settings → API → API Keys"
    echo "  3. Create or copy your API key"
    exit 1
fi

echo -e "${GREEN}✓ SALESLOFT_TOKEN is configured${NC}"

# Optional: Set Salesforce org if not already set
if [ -z "$SALESFORCE_ORG_ALIAS" ]; then
    export SALESFORCE_ORG_ALIAS="production"
    echo "Using default Salesforce org: production"
fi

# Optional: Set expected instance
if [ -z "$SALESFORCE_INSTANCE" ]; then
    export SALESFORCE_INSTANCE="rentable.my.salesforce.com"
    echo "Expected Salesforce instance: rentable.my.salesforce.com"
fi

echo ""
echo "==========================================="
echo "Step 1/6: Current Health Check"
echo "==========================================="
echo "Checking current sync health status..."

python3 scripts/salesloft-sync-health-monitor.py --mode once 2>&1 | tee /tmp/health_check_before.log || {
    echo -e "${YELLOW}Warning: Health check failed, but continuing...${NC}"
}

echo ""
echo "==========================================="
echo "Step 2/6: Validate Integration Configuration"
echo "==========================================="
echo "Validating all configuration settings..."

python3 scripts/salesloft-integration-validator.py --verbose 2>&1 | tee /tmp/validation_report.log || {
    echo -e "${YELLOW}Warning: Some validations failed${NC}"
}

echo ""
echo "==========================================="
echo "Step 3/6: Fix User Mappings"
echo "==========================================="
echo "Automatically mapping unmapped users by email..."

python3 scripts/salesloft-sync-recovery-toolkit.py \
    --action mappings $DRY_RUN \
    --verbose 2>&1 | tee /tmp/user_mapping_fix.log

echo ""
echo "==========================================="
echo "Step 4/6: Clean Duplicate Records"
echo "==========================================="
echo "Identifying and merging duplicate contacts..."

python3 scripts/salesloft-sync-recovery-toolkit.py \
    --action duplicates $DRY_RUN \
    --verbose 2>&1 | tee /tmp/duplicate_cleanup.log

echo ""
echo "==========================================="
echo "Step 5/6: Retry Failed Syncs"
echo "==========================================="
echo "Retrying all failed sync operations from last 24 hours..."

python3 scripts/salesloft-sync-recovery-toolkit.py \
    --action retry \
    --hours 24 $DRY_RUN \
    --verbose 2>&1 | tee /tmp/retry_failed_syncs.log

echo ""
echo "==========================================="
echo "Step 6/6: Final Health Check"
echo "==========================================="
echo "Verifying improvements after fixes..."

python3 scripts/salesloft-sync-health-monitor.py --mode once 2>&1 | tee /tmp/health_check_after.log || {
    echo -e "${YELLOW}Warning: Health check shows remaining issues${NC}"
}

echo ""
echo "==========================================="
echo "Fix Summary Report"
echo "==========================================="

# Parse results from log files
echo ""
echo "User Mappings:"
grep -E "mapped|fixed|unmapped" /tmp/user_mapping_fix.log | tail -5 || echo "  No mapping information available"

echo ""
echo "Duplicate Cleanup:"
grep -E "duplicate|merged|cleaned" /tmp/duplicate_cleanup.log | tail -5 || echo "  No duplicate information available"

echo ""
echo "Sync Retry Results:"
grep -E "successful|failed|retry|recovered" /tmp/retry_failed_syncs.log | tail -5 || echo "  No retry information available"

echo ""
echo "Health Score:"
echo "  Before: $(grep "Health Score" /tmp/health_check_before.log 2>/dev/null || echo "Unknown")"
echo "  After:  $(grep "Health Score" /tmp/health_check_after.log 2>/dev/null || echo "Unknown")"

echo ""
echo "==========================================="
echo "Log Files Created:"
echo "==========================================="
echo "  /tmp/health_check_before.log"
echo "  /tmp/validation_report.log"
echo "  /tmp/user_mapping_fix.log"
echo "  /tmp/duplicate_cleanup.log"
echo "  /tmp/retry_failed_syncs.log"
echo "  /tmp/health_check_after.log"

echo ""
echo "==========================================="
echo "Next Steps:"
echo "==========================================="

# Check if we're in dry-run mode
if [ ! -z "$DRY_RUN" ]; then
    echo -e "${YELLOW}This was a DRY RUN. To apply fixes, run without --dry-run flag:${NC}"
    echo "  ./execute-salesloft-fixes.sh"
else
    echo -e "${GREEN}Fixes have been applied!${NC}"
    echo ""
    echo "Recommended actions:"
    echo "1. Monitor sync health for next hour:"
    echo "   python3 scripts/salesloft-sync-health-monitor.py --mode continuous --interval 300"
    echo ""
    echo "2. Check for any remaining errors:"
    echo "   python3 scripts/analyze_sync_errors.py"
    echo ""
    echo "3. If errors persist, check the detailed logs above"
fi

echo ""
echo "Script completed at: $(date)"
echo "=========================================="