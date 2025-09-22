#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ORG_ALIAS = 'rentable-production';
const OUTPUT_DIR = 'require('./config/paths.config').PROJECT_ROOT';

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('🚀 LOCAL BULK PROCESSOR - Process all contacts locally then bulk update');
console.log('=========================================================\n');

// Step 1: Export ALL unmarked contacts
console.log('📥 Step 1: Exporting contacts from Salesforce...');
const query = `SELECT Id, Email, Phone, MobilePhone, AccountId, Name, HubSpot_Contact_ID__c
FROM Contact
WHERE Email != null
  AND Clean_Status__c = null
LIMIT 250000`;

try {
    // Use regular query with JSON output for processing
    const exportCmd = `sf data query --query "${query}" --target-org ${ORG_ALIAS} --json > ${OUTPUT_DIR}/contacts.json`;
    console.log('Running export (this may take a few minutes)...');
    execSync(exportCmd);
    console.log('✅ Export complete!\n');
} catch (error) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
}

// Step 2: Process locally
console.log('🔧 Step 2: Processing contacts locally...');
const jsonContent = fs.readFileSync(`${OUTPUT_DIR}/contacts.json`, 'utf8');
const data = JSON.parse(jsonContent);

if (!data.result || !data.result.records || data.result.records.length === 0) {
    console.error('❌ No data exported');
    process.exit(1);
}

const contacts = data.result.records;
console.log(`   Found ${contacts.length} contacts to process`);

// Process each contact
const updateRecords = [];
let okCount = 0, reviewCount = 0, deleteCount = 0;

for (const contact of contacts) {
    // Calculate score
    let score = 0;
    if (contact.Email) score += 30;
    if (contact.Phone || contact.MobilePhone) score += 30;
    if (contact.AccountId) score += 20;
    if (contact.Name && contact.Name !== 'Unknown') score += 20;

    // Determine status
    let cleanStatus;
    if (score >= 70) {
        cleanStatus = 'OK';
        okCount++;
    } else if (score >= 40) {
        cleanStatus = 'Review';
        reviewCount++;
    } else {
        cleanStatus = 'Delete';
        deleteCount++;
    }

    const syncStatus = contact.HubSpot_Contact_ID__c ? 'Synced' : 'Not Synced';

    updateRecords.push({
        Id: contact.Id,
        Clean_Status__c: cleanStatus,
        Sync_Status__c: syncStatus
    });
}

console.log(`✅ Processed ${updateRecords.length} contacts locally`);
console.log(`   - OK: ${okCount}`);
console.log(`   - Review: ${reviewCount}`);
console.log(`   - Delete: ${deleteCount}\n`);

// Step 3: Create update CSV
console.log('📝 Step 3: Creating update file...');
const updateCsv = ['Id,Clean_Status__c,Sync_Status__c'];
updateRecords.forEach(record => {
    updateCsv.push(`${record.Id},${record.Clean_Status__c},${record.Sync_Status__c}`);
});

fs.writeFileSync(`${OUTPUT_DIR}/updates.csv`, updateCsv.join('\n'));
console.log(`✅ Update file created with ${updateRecords.length} records\n`);

// Step 4: Bulk update back to Salesforce
console.log('📤 Step 4: Uploading updates to Salesforce...');
try {
    // Use upsert with external id field (Id) to update existing records
    const importCmd = `sf data upsert bulk --sobject Contact --external-id Id --file ${OUTPUT_DIR}/updates.csv --target-org ${ORG_ALIAS} --wait 20`;
    console.log('Running bulk update (this may take several minutes)...');
    execSync(importCmd, { stdio: 'inherit' });
    console.log('✅ Update complete!\n');
} catch (error) {
    console.error('❌ Update failed:', error.message);
    process.exit(1);
}

// Step 5: Verify results
console.log('📊 Step 5: Verifying results...\n');
console.log('Final Status Distribution:');
const statusQuery = `sf data query --query "SELECT Clean_Status__c, COUNT(Id) count FROM Contact WHERE Clean_Status__c != null GROUP BY Clean_Status__c" --target-org ${ORG_ALIAS}`;
execSync(statusQuery, { stdio: 'inherit' });

console.log('\nRemaining unmarked:');
const remainingQuery = `sf data query --query "SELECT COUNT(Id) FROM Contact WHERE Email != null AND Clean_Status__c = null" --target-org ${ORG_ALIAS}`;
execSync(remainingQuery, { stdio: 'inherit' });

console.log('\n✨ LOCAL BULK PROCESSING COMPLETE!');
console.log(`Total contacts processed: ${updateRecords.length}`);