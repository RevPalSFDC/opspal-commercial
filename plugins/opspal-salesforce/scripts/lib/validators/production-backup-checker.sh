#!/usr/bin/env bash

##
# Production Backup Checker
#
# Verifies that a backup exists before deploying to production environments.
#
# Usage:
#   bash production-backup-checker.sh <org-alias>
#
# Exit Codes:
#   0 - Backup exists or not production
#   1 - Production org without backup (BLOCKS deployment)
##

set -euo pipefail

ORG_ALIAS="${1:-}"

# Check if org alias provided
if [[ -z "$ORG_ALIAS" ]]; then
    echo '{"status":"PASS","message":"No org alias provided"}'
    exit 0
fi

# Check if this is a production org
if [[ ! "$ORG_ALIAS" =~ production|prod|prd ]]; then
    echo '{"status":"PASS","message":"Not a production org, backup not required"}'
    exit 0
fi

# Check for recent backup
BACKUP_DIR="instances/${ORG_ALIAS}/backups"
BACKUP_AGE_DAYS=7 # Require backup within last 7 days

if [[ ! -d "$BACKUP_DIR" ]]; then
    echo '{
        "status": "FAIL",
        "message": "No backup directory found for production org",
        "recommendation": "Run backup before deploying to production: /backup-org '"$ORG_ALIAS"'"
    }'
    exit 1
fi

# Find most recent backup
LATEST_BACKUP=$(find "$BACKUP_DIR" -name "backup-*.zip" -o -name "backup-*" -type d | sort -r | head -1)

if [[ -z "$LATEST_BACKUP" ]]; then
    echo '{
        "status": "FAIL",
        "message": "No backups found for production org",
        "recommendation": "Create backup before deployment: /backup-org '"$ORG_ALIAS"'"
    }'
    exit 1
fi

# Check backup age
BACKUP_TIME=$(stat -c %Y "$LATEST_BACKUP" 2>/dev/null || stat -f %m "$LATEST_BACKUP" 2>/dev/null)
CURRENT_TIME=$(date +%s)
AGE_SECONDS=$((CURRENT_TIME - BACKUP_TIME))
AGE_DAYS=$((AGE_SECONDS / 86400))

if [[ $AGE_DAYS -gt $BACKUP_AGE_DAYS ]]; then
    echo '{
        "status": "WARN",
        "message": "Backup is '"$AGE_DAYS"' days old (>'"$BACKUP_AGE_DAYS"' days)",
        "recommendation": "Consider creating fresh backup before deployment",
        "latestBackup": "'"$(basename "$LATEST_BACKUP")"'"
    }'
    exit 0
fi

# Backup exists and is recent
echo '{
    "status": "PASS",
    "message": "Recent backup found ('"$AGE_DAYS"' days old)",
    "latestBackup": "'"$(basename "$LATEST_BACKUP")"'",
    "backupPath": "'"$LATEST_BACKUP"'"
}'
exit 0
