#!/usr/bin/env bash
# Rollback script - restore from backup
# Requires ENABLE_WRITE=1 and confirmation

source scripts/lib/guard.sh

log_playbook_version() {
    local playbook_path="$1"
    local version="unknown"
    if command -v git >/dev/null 2>&1; then
        if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
            version=$(git log -1 --pretty=format:%h -- "$playbook_path" 2>/dev/null)
            if [[ -z "$version" ]]; then
                version="untracked"
            fi
        fi
    fi
    echo "Playbook: $playbook_path (version: $version)"
}

ZIP=${1:?Usage: $0 path/to/rollback-metadata.zip}

if [[ ! -f "$ZIP" ]]; then
    echo "❌ File not found: $ZIP"
    exit 1
fi

echo "
═══════════════════════════════════════════════════════════════
ROLLBACK: $ORG
═══════════════════════════════════════════════════════════════"

log_playbook_version "docs/playbooks/deployment-rollback.md"

# Check write permission
if [[ "$ENABLE_WRITE" != "1" ]]; then
    echo "
🔒 Cannot rollback: ENABLE_WRITE=0
   To rollback, set: export ENABLE_WRITE=1
"
    exit 2
fi

# Show what will be rolled back
echo "
Will rollback using: $ZIP
Target org: $ORG
"

# Confirmation
read -r -p "Type ROLLBACK to restore from backup: " ACK
if [[ "$ACK" != "ROLLBACK" ]]; then
    echo "Rollback cancelled."
    exit 3
fi

# Create pre-rollback backup
echo "
Creating pre-rollback backup..."
STAMP=$(date +%Y%m%d-%H%M%S)
PRE_ROLLBACK="backups/$ORG/pre-rollback-$STAMP"
mkdir -p "$PRE_ROLLBACK"
sf metadata retrieve -o "$ORG" \
  -m "Report,ReportFolder,Dashboard,DashboardFolder" \
  --output-dir "$PRE_ROLLBACK" \
  --zip-file "$PRE_ROLLBACK/pre-rollback.zip"

# Perform rollback
echo "
Rolling back from $ZIP..."
sf metadata deploy -o "$ORG" \
  --zip-file "$ZIP" \
  --wait 10

if [ $? -eq 0 ]; then
    echo "
✅ Rollback successful!
   Pre-rollback state saved to: $PRE_ROLLBACK
"
else
    echo "
❌ Rollback failed!
   Pre-rollback state saved to: $PRE_ROLLBACK
"
    exit 4
fi

echo "
═══════════════════════════════════════════════════════════════
"
