#!/bin/bash

# Test Dashboard Retrieval with proper Salesforce project setup
# This script demonstrates how to use the new utilities to avoid common errors

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/lib"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Dashboard Retrieval Test ===${NC}"
echo "This script demonstrates proper Salesforce project setup for metadata retrieval"
echo

# Check if utilities exist
if [ ! -f "${LIB_DIR}/sf-project-initializer.js" ]; then
    echo -e "${RED}Error: sf-project-initializer.js not found${NC}"
    exit 1
fi

if [ ! -f "${LIB_DIR}/metadata-retrieval-wrapper.js" ]; then
    echo -e "${RED}Error: metadata-retrieval-wrapper.js not found${NC}"
    exit 1
fi

# Get parameters
ORG_ALIAS="${1:-${SFDC_INSTANCE:-${SF_TARGET_ORG:-${ORG:-}}}}"
DASHBOARD_ID="${2:-CA/vIVoiiDIlxadRDUgnHSRFyvPrFrdyH}"
OUTPUT_DIR="${3:-/tmp/dashboard-migration}"

if [ -z "$ORG_ALIAS" ]; then
    echo -e "${RED}Error: No org alias provided. Set SFDC_INSTANCE/SF_TARGET_ORG/ORG or pass as first argument.${NC}"
    exit 1
fi

echo "Configuration:"
echo "  Org: ${ORG_ALIAS}"
echo "  Dashboard: ${DASHBOARD_ID}"
echo "  Output: ${OUTPUT_DIR}"
echo

# Method 1: Using metadata-retrieval-wrapper (recommended)
echo -e "${GREEN}Method 1: Using Metadata Retrieval Wrapper${NC}"
echo "This handles all project setup automatically"
echo

node "${LIB_DIR}/metadata-retrieval-wrapper.js" \
    "${ORG_ALIAS}" \
    "Dashboard" \
    "${DASHBOARD_ID}" \
    --output-dir "${OUTPUT_DIR}" \
    --wait 30

echo
echo -e "${GREEN}✅ Method 1 Complete${NC}"
echo

# Method 2: Manual setup with project initializer
echo -e "${GREEN}Method 2: Manual Setup with Project Initializer${NC}"
echo "This shows the step-by-step process"
echo

MANUAL_DIR="/tmp/manual-dashboard-retrieval-$(date +%s)"

# Step 1: Initialize project
echo "Step 1: Initialize Salesforce project"
node "${LIB_DIR}/sf-project-initializer.js" init "${MANUAL_DIR}"

# Step 2: Change to project directory
echo "Step 2: Change to project directory"
cd "${MANUAL_DIR}"

# Step 3: Retrieve metadata
echo "Step 3: Retrieve dashboard metadata"
sf project retrieve start \
    --metadata "Dashboard:${DASHBOARD_ID}" \
    --target-org "${ORG_ALIAS}" \
    --wait 30 || {
        echo -e "${YELLOW}If this fails, the project initializer will fix it${NC}"
        node "${LIB_DIR}/sf-project-initializer.js" fix "${MANUAL_DIR}"
        # Retry after fix
        sf project retrieve start \
            --metadata "Dashboard:${DASHBOARD_ID}" \
            --target-org "${ORG_ALIAS}" \
            --wait 30
    }

echo
echo -e "${GREEN}✅ Method 2 Complete${NC}"
echo

# Show results
echo -e "${GREEN}=== Results ===${NC}"
echo "Dashboard retrieved successfully to:"
echo "  Method 1: ${OUTPUT_DIR}"
echo "  Method 2: ${MANUAL_DIR}"
echo

# Find dashboard files
echo "Dashboard files found:"
find "${OUTPUT_DIR}" -name "*.dashboard*" -type f 2>/dev/null | head -5 || true
find "${MANUAL_DIR}" -name "*.dashboard*" -type f 2>/dev/null | head -5 || true

echo
echo -e "${GREEN}=== Common Issues This Solves ===${NC}"
echo "✅ InvalidProjectWorkspaceError - Project is automatically initialized"
echo "✅ MissingPackageDirectoryError - Directories are created as needed"
echo "✅ Missing project config file - Automatically generated"
echo "✅ API version mismatches - Standardized to v62.0"
echo "✅ Retry logic for transient failures"
echo

# Cleanup option
read -p "Clean up temporary projects? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Cleaning up old temporary projects..."
    node "${LIB_DIR}/sf-project-initializer.js" cleanup 0
    echo "✅ Cleanup complete"
fi

echo
echo -e "${GREEN}Test complete!${NC}"
