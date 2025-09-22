#!/usr/bin/env node

/**
 * Bulk API 2.0 solution for contact marking
 * Exports, processes, and re-imports contacts with proper marking
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

console.log('🚀 Bulk API Contact Marking Process\n');

// Configuration
const ORG_ALIAS = 'rentable-production';
const BATCH_SIZE = 10000; // Bulk API can handle large batches
const OUTPUT_DIR = path.join(__dirname, '../bulk-processing');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Step 1: Export contacts needing marking
console.log('📥 Step 1: Exporting contacts from Salesforce...\n');

const exportQuery = `
SELECT Id, Email, Name, Phone, MobilePhone, AccountId, LeadSource,
       LastActivityDate, Clean_Status__c, Sync_Status__c,
       HubSpot_Contact_ID__c, In_HubSpot_Not_Inclusion_List__c
FROM Contact
WHERE Email != null
  AND (Clean_Status__c = null OR Sync_Status__c = null)
`.replace(/\n/g, ' ');

const exportFile = path.join(OUTPUT_DIR, 'contacts_to_mark.csv');

try {
    // Use Bulk API 2.0 for export
    const exportCmd = `sf data export bulk --query "${exportQuery}" --result-file "${exportFile}" --target-org ${ORG_ALIAS} --wait 10`;
    execSync(exportCmd, { stdio: 'inherit' });
    console.log(`✅ Exported contacts to: ${exportFile}\n`);
} catch (error) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
}

// Step 2: Process contacts locally
console.log('🔧 Step 2: Processing contacts locally...\n');

// Read exported CSV
const csvContent = fs.readFileSync(exportFile, 'utf8');
const contacts = csv.parse(csvContent, {
    columns: true,
    skip_empty_lines: true
});

console.log(`📊 Processing ${contacts.length} contacts...\n`);

// Track statistics
const stats = {
    ok: 0,
    review: 0,
    delete: 0,
    synced: 0,
    notSynced: 0,
    inclusionList: 0
};

// Process each contact
const processed = contacts.map(contact => {
    const update = { Id: contact.Id };

    // Calculate Clean_Status if missing
    if (!contact.Clean_Status__c) {
        let score = 0;

        // Simple scoring logic
        if (contact.Email) score += 30;
        if (contact.Phone || contact.MobilePhone) score += 20;
        if (contact.Name && contact.Name !== 'Unknown') score += 20;
        if (contact.LeadSource) score += 10;
        if (contact.AccountId) score += 10;

        // Check last activity (simple date comparison)
        if (contact.LastActivityDate) {
            const activityDate = new Date(contact.LastActivityDate);
            const daysAgo = (Date.now() - activityDate) / (1000 * 60 * 60 * 24);
            if (daysAgo < 90) score += 10;
        }

        // Set Clean_Status based on score
        if (score >= 70) {
            update.Clean_Status__c = 'OK';
            stats.ok++;
        } else if (score >= 40) {
            update.Clean_Status__c = 'Review';
            stats.review++;
        } else {
            update.Clean_Status__c = 'Delete';
            stats.delete++;
        }
    }

    // Calculate Sync_Status if missing
    if (!contact.Sync_Status__c) {
        if (contact.HubSpot_Contact_ID__c) {
            update.Sync_Status__c = 'Synced';
            stats.synced++;
        } else if (contact.In_HubSpot_Not_Inclusion_List__c === 'true') {
            update.Sync_Status__c = 'In HS Not on Inclusion List';
            stats.inclusionList++;
        } else {
            update.Sync_Status__c = 'Not Synced';
            stats.notSynced++;
        }
    }

    return update;
});

// Step 3: Create update CSV
console.log('📝 Step 3: Creating update file...\n');

const updateFile = path.join(OUTPUT_DIR, 'contacts_update.csv');
const updateCsv = stringify(processed, {
    header: true,
    columns: ['Id', 'Clean_Status__c', 'Sync_Status__c']
});

fs.writeFileSync(updateFile, updateCsv);
console.log(`✅ Update file created: ${updateFile}\n`);

// Display statistics
console.log('📊 Processing Statistics:');
console.log(`   Clean Status:`);
console.log(`     - OK: ${stats.ok}`);
console.log(`     - Review: ${stats.review}`);
console.log(`     - Delete: ${stats.delete}`);
console.log(`   Sync Status:`);
console.log(`     - Synced: ${stats.synced}`);
console.log(`     - Not Synced: ${stats.notSynced}`);
console.log(`     - Needs Inclusion List: ${stats.inclusionList}\n`);

// Step 4: Import updates back to Salesforce
console.log('📤 Step 4: Importing updates to Salesforce...\n');

try {
    const importCmd = `sf data import bulk --sobject Contact --file "${updateFile}" --target-org ${ORG_ALIAS} --wait 10`;
    execSync(importCmd, { stdio: 'inherit' });
    console.log('✅ Import complete!\n');
} catch (error) {
    console.error('❌ Import failed:', error.message);
    console.log('💡 You can manually import the file using Data Loader:\n');
    console.log(`   File: ${updateFile}`);
    console.log('   Operation: Update');
    console.log('   Object: Contact');
    console.log('   Match by: Id\n');
}

// Step 5: Generate report
const reportFile = path.join(OUTPUT_DIR, 'marking_report.json');
const report = {
    timestamp: new Date().toISOString(),
    totalProcessed: processed.length,
    statistics: stats,
    files: {
        export: exportFile,
        update: updateFile
    },
    nextSteps: [
        'Review contacts marked as "Delete" before removal',
        'Add contacts marked "In HS Not on Inclusion List" to HubSpot List ID: 26',
        'Review and improve data quality for "Review" status contacts'
    ]
};

fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(`📊 Report saved: ${reportFile}\n`);

console.log('✨ Bulk marking process complete!');