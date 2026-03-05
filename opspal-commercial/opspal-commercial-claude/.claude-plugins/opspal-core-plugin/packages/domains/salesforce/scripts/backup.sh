#!/usr/bin/env bash
# Backup script - retrieves metadata safely
# Always read-only operation

source scripts/lib/guard.sh

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/$ORG/$STAMP"
mkdir -p "$OUT"

echo "
═══════════════════════════════════════════════════════════════
BACKUP: $ORG → $OUT
═══════════════════════════════════════════════════════════════"

# Backup reports and dashboards specifically
echo "
Backing up Reports & Dashboards..."
sf metadata retrieve -o "$ORG" \
  -m "Report,ReportFolder,Dashboard,DashboardFolder" \
  --output-dir "$OUT" \
  --zip-file "$OUT/reports-dashboards.zip"

# Backup other safe metadata
echo "
Backing up other metadata..."
sf metadata retrieve -o "$ORG" \
  -m "ApexClass,ApexTrigger,CustomObject,CustomField,Layout,PermissionSet,Profile,Flow" \
  --target-metadata-dir "$OUT/metadata" \
  --zip-file "$OUT/full-metadata.zip"

# Create rollback package
echo "
Creating rollback package..."
cp "$OUT/reports-dashboards.zip" "$OUT/rollback-metadata.zip"

# Save backup manifest
cat > "$OUT/manifest.json" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "org": "$ORG",
  "apiVersion": "$API_VERSION",
  "files": {
    "reports_dashboards": "reports-dashboards.zip",
    "full_metadata": "full-metadata.zip",
    "rollback": "rollback-metadata.zip"
  }
}
EOF

echo "
✅ Backup complete: $OUT
   • Reports/Dashboards: reports-dashboards.zip
   • Full metadata: full-metadata.zip
   • Rollback package: rollback-metadata.zip

═══════════════════════════════════════════════════════════════
"