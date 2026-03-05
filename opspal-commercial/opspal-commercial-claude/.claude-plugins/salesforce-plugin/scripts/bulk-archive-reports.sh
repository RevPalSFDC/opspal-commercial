#!/bin/bash
"""
Bulk Archive Reports Script
Moves unused reports to an "Archive" folder without deleting
Safety-first approach with rollback capability
"""

# Configuration
ORG_ALIAS=${1:-$SF_TARGET_ORG}
ARCHIVE_FOLDER="Archived Reports"
DRY_RUN=${2:-false}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="logs/archive_${TIMESTAMP}.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create log directory
mkdir -p logs

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}BULK REPORT ARCHIVE UTILITY${NC}"
echo -e "${GREEN}========================================${NC}"
echo "Organization: $ORG_ALIAS"
echo "Archive Folder: $ARCHIVE_FOLDER"
echo "Dry Run: $DRY_RUN"
echo "Log File: $LOG_FILE"
echo ""

# Function to log messages
log_message() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Step 1: Check if archive folder exists, create if not
check_archive_folder() {
    echo -e "${YELLOW}Checking for archive folder...${NC}"

    # Query for the folder
    FOLDER_CHECK=$(sf data query \
        --query "SELECT Id, Name FROM Folder WHERE Name = '$ARCHIVE_FOLDER' AND Type = 'Report' LIMIT 1" \
        --target-org "$ORG_ALIAS" \
        --json 2>/dev/null)

    FOLDER_ID=$(echo "$FOLDER_CHECK" | jq -r '.result.records[0].Id // empty')

    if [ -z "$FOLDER_ID" ]; then
        echo -e "${YELLOW}Archive folder not found. Creating...${NC}"

        if [ "$DRY_RUN" == "false" ]; then
            # Create folder via Metadata API
            cat > ${TEMP_DIR:-/tmp} << EOF
<?xml version="1.0" encoding="UTF-8"?>
<Folder xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>$ARCHIVE_FOLDER</name>
    <accessType>Public</accessType>
    <publicFolderAccess>ReadWrite</publicFolderAccess>
</Folder>
EOF

            # Deploy the folder
            sf project deploy start \
                --metadata-dir /tmp \
                --target-org "$ORG_ALIAS" \
                --wait 10

            log_message "Created archive folder: $ARCHIVE_FOLDER"
        else
            log_message "[DRY RUN] Would create archive folder: $ARCHIVE_FOLDER"
        fi
    else
        echo -e "${GREEN}Archive folder exists: $FOLDER_ID${NC}"
        log_message "Using existing archive folder: $FOLDER_ID"
    fi

    echo "$FOLDER_ID"
}

# Step 2: Get list of reports to archive
get_archive_candidates() {
    echo -e "${YELLOW}Finding reports to archive...${NC}"

    # Query for unused reports (not viewed in 90+ days)
    UNUSED_REPORTS=$(sf data query \
        --query "SELECT Id, Name, DeveloperName, FolderName, LastViewedDate
                 FROM Report
                 WHERE (LastViewedDate < LAST_N_DAYS:90 OR LastViewedDate = null)
                 AND FolderName != '$ARCHIVE_FOLDER'
                 ORDER BY LastViewedDate ASC NULLS FIRST" \
        --use-tooling-api \
        --target-org "$ORG_ALIAS" \
        --json)

    REPORT_COUNT=$(echo "$UNUSED_REPORTS" | jq '.result.totalSize')

    echo -e "${YELLOW}Found $REPORT_COUNT reports to archive${NC}"
    log_message "Found $REPORT_COUNT candidates for archival"

    echo "$UNUSED_REPORTS"
}

# Step 3: Create backup of report list
create_backup() {
    local reports_json=$1
    BACKUP_FILE="backups/reports_backup_${TIMESTAMP}.json"

    mkdir -p backups
    echo "$reports_json" > "$BACKUP_FILE"

    echo -e "${GREEN}Backup created: $BACKUP_FILE${NC}"
    log_message "Backup saved to $BACKUP_FILE"
}

# Step 4: Move reports to archive folder
archive_reports() {
    local reports_json=$1
    local folder_id=$2

    TOTAL=$(echo "$reports_json" | jq '.result.totalSize')
    ARCHIVED=0
    FAILED=0

    echo -e "${YELLOW}Starting archive process...${NC}"

    # Process each report
    echo "$reports_json" | jq -c '.result.records[]' | while read -r report; do
        REPORT_ID=$(echo "$report" | jq -r '.Id')
        REPORT_NAME=$(echo "$report" | jq -r '.Name')

        echo -n "Archiving: $REPORT_NAME... "

        if [ "$DRY_RUN" == "false" ]; then
            # Update report folder via API
            UPDATE_RESULT=$(sf data update record \
                --sobject Report \
                --record-id "$REPORT_ID" \
                --values "FolderId='$folder_id'" \
                --target-org "$ORG_ALIAS" \
                --json 2>/dev/null)

            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓${NC}"
                log_message "Archived: $REPORT_NAME ($REPORT_ID)"
                ((ARCHIVED++))
            else
                echo -e "${RED}✗${NC}"
                log_message "Failed to archive: $REPORT_NAME ($REPORT_ID)"
                ((FAILED++))
            fi
        else
            echo -e "${YELLOW}[DRY RUN]${NC}"
            log_message "[DRY RUN] Would archive: $REPORT_NAME ($REPORT_ID)"
            ((ARCHIVED++))
        fi
    done

    # Summary
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}ARCHIVE COMPLETE${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo "Total Reports: $TOTAL"
    echo "Archived: $ARCHIVED"
    echo "Failed: $FAILED"

    log_message "Archive complete: $ARCHIVED/$TOTAL successful"
}

# Step 5: Verify archive
verify_archive() {
    local folder_id=$1

    echo -e "${YELLOW}Verifying archive...${NC}"

    # Count reports in archive folder
    ARCHIVED_COUNT=$(sf data query \
        --query "SELECT COUNT() FROM Report WHERE FolderId = '$folder_id'" \
        --use-tooling-api \
        --target-org "$ORG_ALIAS" \
        --json | jq '.result.records[0].expr0')

    echo -e "${GREEN}Reports in archive folder: $ARCHIVED_COUNT${NC}"
    log_message "Verification: $ARCHIVED_COUNT reports in archive folder"
}

# Step 6: Generate rollback script
generate_rollback() {
    local backup_file=$1
    ROLLBACK_SCRIPT="scripts/rollback_${TIMESTAMP}.sh"

    cat > "$ROLLBACK_SCRIPT" << 'EOF'
#!/bin/bash
# Rollback script for report archival
# Generated: TIMESTAMP_PLACEHOLDER

BACKUP_FILE="BACKUP_PLACEHOLDER"
ORG_ALIAS="ORG_PLACEHOLDER"

echo "Starting rollback from $BACKUP_FILE"

# Restore each report to original folder
jq -c '.result.records[]' "$BACKUP_FILE" | while read -r report; do
    REPORT_ID=$(echo "$report" | jq -r '.Id')
    ORIGINAL_FOLDER=$(echo "$report" | jq -r '.FolderName')
    REPORT_NAME=$(echo "$report" | jq -r '.Name')

    echo "Restoring $REPORT_NAME to $ORIGINAL_FOLDER"

    # Get original folder ID
    FOLDER_ID=$(sf data query \
        --query "SELECT Id FROM Folder WHERE Name = '$ORIGINAL_FOLDER' AND Type = 'Report'" \
        --target-org "$ORG_ALIAS" \
        --json | jq -r '.result.records[0].Id')

    # Update report folder
    sf data update record \
        --sobject Report \
        --record-id "$REPORT_ID" \
        --values "FolderId='$FOLDER_ID'" \
        --target-org "$ORG_ALIAS"
done

echo "Rollback complete"
EOF

    # Replace placeholders
    sed -i "s|TIMESTAMP_PLACEHOLDER|$(date)|g" "$ROLLBACK_SCRIPT"
    sed -i "s|BACKUP_PLACEHOLDER|$backup_file|g" "$ROLLBACK_SCRIPT"
    sed -i "s|ORG_PLACEHOLDER|$ORG_ALIAS|g" "$ROLLBACK_SCRIPT"

    chmod +x "$ROLLBACK_SCRIPT"

    echo -e "${GREEN}Rollback script created: $ROLLBACK_SCRIPT${NC}"
    log_message "Rollback script: $ROLLBACK_SCRIPT"
}

# Main execution
main() {
    log_message "Starting bulk archive process"

    # Step 1: Check/create archive folder
    FOLDER_ID=$(check_archive_folder)

    # Step 2: Get reports to archive
    REPORTS_JSON=$(get_archive_candidates)

    # Step 3: Create backup
    create_backup "$REPORTS_JSON"

    # Step 4: Archive reports
    if [ "$DRY_RUN" == "true" ]; then
        echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
    fi

    archive_reports "$REPORTS_JSON" "$FOLDER_ID"

    # Step 5: Verify
    if [ "$DRY_RUN" == "false" ]; then
        verify_archive "$FOLDER_ID"

        # Step 6: Generate rollback script
        generate_rollback "backups/reports_backup_${TIMESTAMP}.json"
    fi

    log_message "Process complete"

    echo ""
    echo -e "${GREEN}✅ Archive process complete!${NC}"
    echo "Log file: $LOG_FILE"

    if [ "$DRY_RUN" == "true" ]; then
        echo ""
        echo -e "${YELLOW}This was a DRY RUN. To execute for real:${NC}"
        echo "  $0 $ORG_ALIAS false"
    fi
}

# Run main function
main