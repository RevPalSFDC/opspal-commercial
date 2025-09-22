#!/bin/bash

# Bulk API solution - process ALL remaining contacts at once
echo "🚀 BULK API PROCESSOR - Complete all remaining contacts"
echo "========================================================"

ORG_ALIAS="rentable-production"
OUTPUT_DIR="${PROJECT_ROOT:-/home/chris/Desktop/RevPal/Agents}"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Get count
echo "📊 Checking remaining contacts..."
REMAINING=$(sf data query --query "SELECT COUNT(Id) FROM Contact WHERE Email != null AND Clean_Status__c = null" --target-org "$ORG_ALIAS" --json | jq -r '.result.records[0].expr0')
echo "Found $REMAINING unmarked contacts"

if [ "$REMAINING" -eq 0 ]; then
    echo "✅ All contacts already marked!"
    exit 0
fi

# Step 1: Bulk export
echo -e "\n📥 Step 1: Exporting contacts via Bulk API..."
EXPORT_QUERY="SELECT Id, Email, Phone, MobilePhone, AccountId, Name, HubSpot_Contact_ID__c FROM Contact WHERE Email != null AND (Clean_Status__c = null OR Sync_Status__c = null)"

sf data export bulk \
    --query "$EXPORT_QUERY" \
    --target-org "$ORG_ALIAS" \
    --result-file "$OUTPUT_DIR/contacts_export.csv" \
    --wait 10

echo "✅ Export complete"

# Step 2: Process with awk (faster than node for large files)
echo -e "\n🔧 Step 2: Processing contacts..."
cat > "$OUTPUT_DIR/process.awk" << 'EOF'
BEGIN {
    FS=","
    OFS=","
    print "Id,Clean_Status__c,Sync_Status__c"
}
NR > 1 {
    # Calculate score
    score = 0
    if ($2 != "") score += 30  # Email
    if ($3 != "" || $4 != "") score += 30  # Phone or Mobile
    if ($5 != "") score += 20  # AccountId
    if ($6 != "" && $6 != "Unknown") score += 20  # Name

    # Set Clean_Status
    if (score >= 70) clean = "OK"
    else if (score >= 40) clean = "Review"
    else clean = "Delete"

    # Set Sync_Status
    if ($7 != "") sync = "Synced"
    else sync = "Not Synced"

    # Output
    print $1, clean, sync
}
EOF

awk -f "$OUTPUT_DIR/process.awk" "$OUTPUT_DIR/contacts_export.csv" > "$OUTPUT_DIR/contacts_update.csv"

LINE_COUNT=$(wc -l < "$OUTPUT_DIR/contacts_update.csv")
echo "✅ Processed $((LINE_COUNT - 1)) contacts"

# Step 3: Bulk import
echo -e "\n📤 Step 3: Importing updates via Bulk API..."
sf data import bulk \
    --sobject Contact \
    --file "$OUTPUT_DIR/contacts_update.csv" \
    --target-org "$ORG_ALIAS" \
    --wait 20

echo "✅ Import complete!"

# Final verification
echo -e "\n📊 Final Statistics:"
sf data query --query "SELECT Clean_Status__c, COUNT(Id) FROM Contact WHERE Clean_Status__c != null GROUP BY Clean_Status__c" --target-org "$ORG_ALIAS"

echo -e "\n📊 Remaining unmarked:"
sf data query --query "SELECT COUNT(Id) FROM Contact WHERE Email != null AND Clean_Status__c = null" --target-org "$ORG_ALIAS"

echo -e "\n✨ BULK PROCESSING COMPLETE!"