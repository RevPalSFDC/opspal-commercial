#!/bin/bash

###############################################################################
# Profile Layout Assignment Script
# =================================
# Script to assign Salesforce page layouts to profiles in bulk.
# Handles the complex profile metadata updates safely.
#
# Usage:
#   ./assign-layout-to-profiles.sh <layout_name> <object_name> [record_type] [org_alias]
#
# Examples:
#   ./assign-layout-to-profiles.sh "Renewal_Layout" "Opportunity" "Renewal" myorg
#   ./assign-layout-to-profiles.sh "Custom_Account_Layout" "Account" default production
#
# Features:
#   - Retrieves all active profiles
#   - Assigns layout to each profile
#   - Creates backup before changes
#   - Provides rollback capability
#   - Detailed logging
###############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/lib"
LOG_FILE="${SCRIPT_DIR}/../logs/layout-assignment-$(date +%Y%m%d_%H%M%S).log"
TEMP_DIR="${TEMP_DIR:-/tmp}"
BACKUP_DIR="${TEMP_DIR:-/tmp} +%Y%m%d_%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
    
    case $level in
        ERROR)
            echo -e "${RED}[ERROR]${NC} ${message}" >&2
            ;;
        SUCCESS)
            echo -e "${GREEN}[SUCCESS]${NC} ${message}"
            ;;
        WARNING)
            echo -e "${YELLOW}[WARNING]${NC} ${message}"
            ;;
        INFO)
            echo -e "${BLUE}[INFO]${NC} ${message}"
            ;;
    esac
}

# Cleanup function
cleanup() {
    if [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    }
}

trap cleanup EXIT

# Parse arguments
if [ $# -lt 2 ]; then
    echo "Usage: $0 <layout_name> <object_name> [record_type] [org_alias]"
    echo ""
    echo "Arguments:"
    echo "  layout_name   - Name of the page layout (e.g., 'Renewal Layout')"
    echo "  object_name   - API name of the object (e.g., 'Opportunity')"
    echo "  record_type   - Record type name (optional, defaults to 'default')"
    echo "  org_alias     - Salesforce org alias (optional, uses default)"
    echo ""
    echo "Examples:"
    echo "  $0 'Renewal Layout' 'Opportunity' 'Renewal' myorg"
    echo "  $0 'Custom Account Layout' 'Account'"
    exit 1
fi

LAYOUT_NAME="$1"
OBJECT_NAME="$2"
RECORD_TYPE="${3:-default}"
ORG_ALIAS="${4:-}"

# Set org parameter if provided
ORG_PARAM=""
if [ -n "$ORG_ALIAS" ]; then
    ORG_PARAM="-o ${ORG_ALIAS}"
fi

log INFO "Starting layout assignment process"
log INFO "Layout: ${LAYOUT_NAME}"
log INFO "Object: ${OBJECT_NAME}"
log INFO "Record Type: ${RECORD_TYPE}"
log INFO "Org: ${ORG_ALIAS:-default}"

# Create working directories
mkdir -p "$TEMP_DIR"
mkdir -p "$BACKUP_DIR"

# Step 1: Retrieve all profiles
log INFO "Retrieving all profiles from Salesforce..."

PROFILES_JSON="${TEMP_DIR}/profiles.json"
if sf data query -q "SELECT Id, Name FROM Profile WHERE UserType IN ('Standard', 'PowerCustomerSuccess', 'PowerPartner')" \
    ${ORG_PARAM} --json > "$PROFILES_JSON" 2>> "$LOG_FILE"; then
    
    PROFILE_COUNT=$(jq -r '.result.totalSize' "$PROFILES_JSON")
    log SUCCESS "Retrieved ${PROFILE_COUNT} profiles"
    
    # Extract profile names
    jq -r '.result.records[].Name' "$PROFILES_JSON" > "${TEMP_DIR}/profile_names.txt"
else
    log ERROR "Failed to retrieve profiles"
    exit 1
fi

# Step 2: Create backup of current profile metadata
log INFO "Creating backup of profile metadata..."

BACKUP_SUCCESS=0
BACKUP_FAILED=0

while IFS= read -r profile_name; do
    log INFO "Backing up profile: ${profile_name}"
    
    if sf project retrieve start --metadata "Profile:${profile_name}" ${ORG_PARAM} \
        --retrieve-target-dir "$BACKUP_DIR" 2>> "$LOG_FILE"; then
        ((BACKUP_SUCCESS++))
    else
        log WARNING "Failed to backup profile: ${profile_name}"
        ((BACKUP_FAILED++))
    fi
done < "${TEMP_DIR}/profile_names.txt"

log INFO "Backup complete: ${BACKUP_SUCCESS} successful, ${BACKUP_FAILED} failed"

# Step 3: Use Node.js script to perform the assignment
log INFO "Executing profile layout assignment..."

# Check if ProfileLayoutAssigner exists
if [ ! -f "${LIB_DIR}/profile-layout-assigner.js" ]; then
    log ERROR "ProfileLayoutAssigner not found at ${LIB_DIR}/profile-layout-assigner.js"
    exit 1
fi

# Execute the assignment
ASSIGNMENT_RESULT="${TEMP_DIR}/assignment_result.json"
if node "${LIB_DIR}/profile-layout-assigner.js" assign-all \
    "${LAYOUT_NAME}" "${OBJECT_NAME}" "${RECORD_TYPE}" \
    > "$ASSIGNMENT_RESULT" 2>> "$LOG_FILE"; then
    
    log SUCCESS "Layout assignment completed"
    
    # Parse results
    SUCCESS_COUNT=$(jq -r '.results | map(select(.success == true)) | length' "$ASSIGNMENT_RESULT")
    FAILED_COUNT=$(jq -r '.results | map(select(.success == false)) | length' "$ASSIGNMENT_RESULT")
    
    log INFO "Assignment Results:"
    log INFO "  Successful: ${SUCCESS_COUNT}"
    log INFO "  Failed: ${FAILED_COUNT}"
    
    # Show failed profiles if any
    if [ "$FAILED_COUNT" -gt 0 ]; then
        log WARNING "Failed profiles:"
        jq -r '.results[] | select(.success == false) | "\(.profile): \(.error)"' "$ASSIGNMENT_RESULT" | while read -r line; do
            log WARNING "  ${line}"
        done
    fi
    
    # Store backup ID for potential rollback
    BACKUP_ID=$(jq -r '.backupId' "$ASSIGNMENT_RESULT")
    if [ -n "$BACKUP_ID" ] && [ "$BACKUP_ID" != "null" ]; then
        log INFO "Backup ID for rollback: ${BACKUP_ID}"
        echo "$BACKUP_ID" > "${TEMP_DIR}/backup_id.txt"
    fi
else
    log ERROR "Layout assignment failed"
    exit 1
fi

# Step 4: Verify the assignment (optional)
log INFO "Verifying layout assignments..."

VERIFY_RESULT="${TEMP_DIR}/verify_result.json"
if node "${LIB_DIR}/profile-layout-assigner.js" get-assignments \
    "${OBJECT_NAME}" > "$VERIFY_RESULT" 2>> "$LOG_FILE"; then
    
    ASSIGNED_COUNT=$(jq -r --arg layout "${OBJECT_NAME}-${LAYOUT_NAME}" \
        '.assignments | map(.assignments[] | select(.layout == $layout)) | length' \
        "$VERIFY_RESULT")
    
    log SUCCESS "Verification complete: ${ASSIGNED_COUNT} profiles have the layout assigned"
else
    log WARNING "Could not verify assignments"
fi

# Step 5: Generate summary report
log INFO "Generating summary report..."

REPORT_FILE="${SCRIPT_DIR}/../reports/layout-assignment-$(date +%Y%m%d_%H%M%S).txt"
mkdir -p "$(dirname "$REPORT_FILE")"

cat > "$REPORT_FILE" << EOF
Profile Layout Assignment Report
================================
Date: $(date)
Layout: ${LAYOUT_NAME}
Object: ${OBJECT_NAME}
Record Type: ${RECORD_TYPE}
Org: ${ORG_ALIAS:-default}

Results:
--------
Total Profiles: ${PROFILE_COUNT}
Successfully Assigned: ${SUCCESS_COUNT}
Failed: ${FAILED_COUNT}
Verified: ${ASSIGNED_COUNT:-N/A}

Backup Information:
------------------
Backup Directory: ${BACKUP_DIR}
Backup ID: ${BACKUP_ID:-N/A}

Log File: ${LOG_FILE}

EOF

if [ "$FAILED_COUNT" -gt 0 ]; then
    echo "Failed Profiles:" >> "$REPORT_FILE"
    echo "----------------" >> "$REPORT_FILE"
    jq -r '.results[] | select(.success == false) | "- \(.profile): \(.error)"' "$ASSIGNMENT_RESULT" >> "$REPORT_FILE"
fi

log SUCCESS "Report generated: ${REPORT_FILE}"

# Step 6: Provide rollback instructions
if [ -n "${BACKUP_ID:-}" ] && [ "$BACKUP_ID" != "null" ]; then
    cat << EOF

${GREEN}Assignment Complete!${NC}

To rollback if needed, run:
  node ${LIB_DIR}/profile-layout-assigner.js restore-backup ${BACKUP_ID}

EOF
fi

# Final summary
echo ""
log SUCCESS "Profile layout assignment process completed!"
log INFO "Summary: ${SUCCESS_COUNT} profiles updated, ${FAILED_COUNT} failed"
log INFO "Full report available at: ${REPORT_FILE}"

# Exit with appropriate code
if [ "$FAILED_COUNT" -eq 0 ]; then
    exit 0
else
    exit 2  # Partial success
fi