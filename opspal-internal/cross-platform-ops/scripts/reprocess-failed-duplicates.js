#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const execPromise = util.promisify(exec);

// Configuration
const ORG_ALIAS = 'rentable-production';
const FAILED_FILES = [
    '750Rh00000cWmLZIA0-failed-records.csv',  // Batch 1: 739 failed
    '750Rh00000cWqVfIAK-failed-records.csv',  // Batch 2: 1855 failed
    '750Rh00000cWwPdIAK-failed-records.csv',  // Batch 3: 1368 failed
    '750Rh00000cWq92IAC-failed-records.csv'   // Batch 4: 285 failed
];

console.log('=========================================');
console.log('Re-processing Failed Duplicate Records');
console.log('=========================================');
console.log('Fixing records that failed due to picklist issues');
console.log('Total failed records to reprocess: ~4,247');
console.log('=========================================\n');

async function processFailedRecords() {
    const allFailedRecords = [];
    let totalFailed = 0;

    // Read all failed record files
    for (const filename of FAILED_FILES) {
        const filepath = path.join(__dirname, '..', filename);
        try {
            const content = await fs.readFile(filepath, 'utf-8');
            const lines = content.split('\n');

            // Skip header
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;

                // Parse CSV line - the format is:
                // "sf__Id","sf__Error",Id,Clean_Status__c,Delete_Reason__c,In_HubSpot_Not_Inclusion_List__c,Sync_Status__c
                const parts = lines[i].match(/"[^"]*"|[^,]+/g);
                if (parts && parts.length >= 7) {
                    const record = {
                        Id: parts[2].replace(/"/g, ''),
                        Clean_Status__c: parts[3].replace(/"/g, ''),
                        Delete_Reason__c: parts[4].replace(/"/g, ''),
                        In_HubSpot_Not_Inclusion_List__c: parts[5].replace(/"/g, ''),
                        Sync_Status__c: parts[6] ? parts[6].replace(/"/g, '') : 'Not Synced'
                    };

                    // Fix the Sync_Status__c field if it contains a date
                    if (record.Sync_Status__c && record.Sync_Status__c.includes('T')) {
                        record.Sync_Status__c = 'Not Synced';
                    }

                    // Only process records marked as Duplicate
                    if (record.Clean_Status__c === 'Duplicate') {
                        allFailedRecords.push(record);
                        totalFailed++;
                    }
                }
            }

            console.log(`Read ${filename}: Found ${allFailedRecords.length - (totalFailed - allFailedRecords.length)} duplicate records`);
        } catch (error) {
            console.log(`File ${filename} not found, skipping...`);
        }
    }

    console.log(`\nTotal duplicate records to reprocess: ${totalFailed}`);

    if (totalFailed === 0) {
        console.log('No duplicate records found to reprocess.');
        return;
    }

    // Create CSV for bulk update
    const csvFilename = path.join(__dirname, '..', 'reprocess-duplicates.csv');
    const csvContent = [
        'Id,Clean_Status__c,Delete_Reason__c,In_HubSpot_Not_Inclusion_List__c,Sync_Status__c',
        ...allFailedRecords.map(record =>
            `${record.Id},${record.Clean_Status__c},"${record.Delete_Reason__c || ''}",${record.In_HubSpot_Not_Inclusion_List__c},${record.Sync_Status__c}`
        )
    ].join('\n');

    await fs.writeFile(csvFilename, csvContent);
    console.log(`\nCreated reprocess file with ${totalFailed} records`);

    // Execute bulk update
    console.log('\nExecuting bulk update via Bulk API 2.0...');
    try {
        const command = `sf data upsert bulk --sobject Contact --file "${csvFilename}" --external-id Id --target-org ${ORG_ALIAS} --wait 120`;
        const { stdout, stderr } = await execPromise(command, { maxBuffer: 50 * 1024 * 1024 });

        if (stderr && stderr.includes('Error')) {
            console.error('Bulk update error:', stderr);
        } else {
            console.log('✅ Bulk update completed successfully');

            // Parse the output for success/failure counts
            if (stdout) {
                console.log('\nUpdate Results:');
                console.log(stdout);
            }
        }
    } catch (error) {
        console.error('❌ Bulk update failed:', error.message);

        // Try to get job results if available
        const jobIdMatch = error.message.match(/job-id ([A-Za-z0-9]+)/);
        if (jobIdMatch) {
            console.log(`\nGetting job results for ${jobIdMatch[1]}...`);
            try {
                const resultsCommand = `sf data bulk results --job-id ${jobIdMatch[1]} --target-org ${ORG_ALIAS}`;
                const { stdout: resultsOutput } = await execPromise(resultsCommand);
                console.log(resultsOutput);
            } catch (resultsError) {
                console.error('Could not retrieve job results:', resultsError.message);
            }
        }
    }

    // Verify the updates
    console.log('\n\nVerifying updates in Salesforce...');
    const verifyCommand = `sf data query --query "SELECT Clean_Status__c, COUNT(Id) FROM Contact WHERE Clean_Status__c = 'Duplicate' GROUP BY Clean_Status__c" --target-org ${ORG_ALIAS} --json`;

    try {
        const { stdout } = await execPromise(verifyCommand);
        const result = JSON.parse(stdout);
        if (result.status === 0 && result.result) {
            const duplicateCount = result.result.records[0]?.expr0 || 0;
            console.log(`\n✅ Successfully flagged ${duplicateCount} contacts as Duplicate in Salesforce`);
        }
    } catch (error) {
        console.error('Could not verify updates:', error.message);
    }
}

// Main execution
async function main() {
    try {
        console.log('Starting reprocessing of failed duplicate records...\n');
        await processFailedRecords();
        console.log('\n✅ Reprocessing complete!');
    } catch (error) {
        console.error('\n❌ Reprocessing failed:', error);
        process.exit(1);
    }
}

// Run the script
main();