#!/usr/bin/env node

/**
 * Update orphaned contacts with high-confidence Account matches to Review status
 * This will prevent them from being deleted and allow manual review
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load the match results
const matchFile = 'orphaned-contact-matches-2025-09-22.json';

if (!fs.existsSync(matchFile)) {
    console.error(`Error: Match file ${matchFile} not found. Run analyze-orphaned-contacts-domains.js first.`);
    process.exit(1);
}

const matchData = JSON.parse(fs.readFileSync(matchFile, 'utf8'));

console.log('='.repeat(70));
console.log('UPDATE ORPHANED CONTACTS TO REVIEW STATUS');
console.log('='.repeat(70));

// Extract all high-confidence contact IDs
const highConfidenceContacts = [];
matchData.matches.highConfidence.forEach(match => {
    match.contacts.forEach(contact => {
        highConfidenceContacts.push({
            id: contact.Id,
            name: contact.Name,
            email: contact.Email,
            currentStatus: contact.Clean_Status__c,
            suggestedAccountId: match.accounts[0].Id,
            suggestedAccountName: match.accounts[0].Name,
            domain: match.domain
        });
    });
});

console.log(`\nContacts to update: ${highConfidenceContacts.length}`);
console.log('These contacts will be changed from Delete/Archive to Review status');

// Create CSV file for bulk update
const csvContent = [
    'Id,Clean_Status__c,Delete_Reason__c',
    ...highConfidenceContacts.map(c =>
        `${c.id},Review,"Potential Account Match: ${c.suggestedAccountName.replace(/"/g, '""')}"`
    )
].join('\n');

const csvFile = `contact-updates-${new Date().toISOString().split('T')[0]}.csv`;
fs.writeFileSync(csvFile, csvContent);
console.log(`\nCSV file created: ${csvFile}`);

// Use Bulk API to update contacts
async function performBulkUpdate() {
    const BulkAPIHandler = require('./SFDC/scripts/lib/bulk-api-handler.js');

    try {
        console.log('\nInitializing Bulk API handler...');
        const handler = await BulkAPIHandler.fromSFAuth('rentable-production');

        // Parse CSV back to records for the bulk API
        const records = highConfidenceContacts.map(c => ({
            Id: c.id,
            Clean_Status__c: 'Review',
            Delete_Reason__c: `Potential Account Match: ${c.suggestedAccountName}`
        }));

        // Process in batches to avoid timeouts
        const batchSize = 200;
        const totalBatches = Math.ceil(records.length / batchSize);
        let successCount = 0;
        let failCount = 0;
        const failedRecords = [];

        console.log(`\nProcessing ${records.length} records in ${totalBatches} batches of ${batchSize}...`);

        for (let i = 0; i < totalBatches; i++) {
            const start = i * batchSize;
            const end = Math.min(start + batchSize, records.length);
            const batch = records.slice(start, end);

            console.log(`\nBatch ${i + 1}/${totalBatches}: Updating records ${start + 1}-${end}...`);

            try {
                const result = await handler.smartOperation('update', 'Contact', batch, {
                    continueOnError: true,
                    allowPartial: true
                });

                successCount += result.successful || 0;
                failCount += result.failed || 0;

                if (result.failures && result.failures.length > 0) {
                    failedRecords.push(...result.failures);
                }

                console.log(`  ✓ Batch complete: ${result.successful} successful, ${result.failed} failed`);

                // Small delay between batches
                if (i < totalBatches - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (error) {
                console.error(`  ✗ Batch ${i + 1} error: ${error.message}`);
                failCount += batch.length;
            }
        }

        console.log('\n' + '='.repeat(70));
        console.log('UPDATE COMPLETE');
        console.log('='.repeat(70));
        console.log(`✅ Successfully updated: ${successCount} contacts`);
        console.log(`❌ Failed updates: ${failCount} contacts`);

        if (failedRecords.length > 0) {
            const failureFile = `failed-updates-${new Date().toISOString().split('T')[0]}.json`;
            fs.writeFileSync(failureFile, JSON.stringify(failedRecords, null, 2));
            console.log(`\nFailed records saved to: ${failureFile}`);
        }

        // Save update summary
        const summary = {
            timestamp: new Date().toISOString(),
            totalProcessed: records.length,
            successful: successCount,
            failed: failCount,
            updatedContacts: highConfidenceContacts.map(c => ({
                id: c.id,
                email: c.email,
                domain: c.domain,
                suggestedAccount: c.suggestedAccountName
            }))
        };

        const summaryFile = `update-summary-${new Date().toISOString().split('T')[0]}.json`;
        fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
        console.log(`Update summary saved to: ${summaryFile}`);

        return summary;

    } catch (error) {
        console.error('Error during bulk update:', error.message);
        throw error;
    }
}

// Verify the update worked
async function verifyUpdate() {
    console.log('\n' + '='.repeat(70));
    console.log('VERIFYING UPDATES');
    console.log('='.repeat(70));

    // Check a sample of updated records
    const sampleIds = highConfidenceContacts.slice(0, 10).map(c => c.id);
    const idList = sampleIds.map(id => `'${id}'`).join(',');

    const verifyQuery = `
    SELECT Id, Name, Email, Clean_Status__c, Delete_Reason__c
    FROM Contact
    WHERE Id IN (${idList})
    `.replace(/\n/g, ' ').trim();

    try {
        const result = execSync(
            `sf data query --query "${verifyQuery}" --target-org rentable-production --json`,
            { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
        );

        const records = JSON.parse(result).result.records;
        console.log('\nSample of updated records:');

        records.forEach(r => {
            const wasUpdated = r.Clean_Status__c === 'Review';
            const symbol = wasUpdated ? '✅' : '❌';
            console.log(`${symbol} ${r.Name || 'No Name'} (${r.Id})`);
            console.log(`   Status: ${r.Clean_Status__c}`);
            console.log(`   Reason: ${r.Delete_Reason__c || 'None'}`);
        });

        // Check overall count of Review status
        const countQuery = `
        SELECT COUNT()
        FROM Contact
        WHERE Clean_Status__c = 'Review'
        AND Delete_Reason__c LIKE 'Potential Account Match:%'
        `.replace(/\n/g, ' ').trim();

        const countResult = execSync(
            `sf data query --query "${countQuery}" --target-org rentable-production --json`,
            { encoding: 'utf8' }
        );

        const totalReview = JSON.parse(countResult).result.totalSize;
        console.log(`\nTotal contacts now in Review status with Account matches: ${totalReview}`);

    } catch (error) {
        console.error('Error verifying updates:', error.message);
    }
}

// Main execution
async function main() {
    try {
        // Show what will be updated
        console.log('\nTop 5 contacts to be updated:');
        highConfidenceContacts.slice(0, 5).forEach((c, i) => {
            console.log(`${i + 1}. ${c.name || 'No Name'} (${c.email})`);
            console.log(`   Current: ${c.currentStatus} → New: Review`);
            console.log(`   Suggested Account: ${c.suggestedAccountName}`);
        });

        console.log('\n' + '='.repeat(70));
        console.log('Ready to update contacts. This will:');
        console.log('1. Change Clean_Status__c from Delete/Archive to Review');
        console.log('2. Add Delete_Reason__c with potential Account match info');
        console.log('3. Preserve these contacts from deletion');
        console.log('='.repeat(70));

        // Perform the update
        const updateResult = await performBulkUpdate();

        // Verify the update
        await verifyUpdate();

        console.log('\n' + '='.repeat(70));
        console.log('NEXT STEPS');
        console.log('='.repeat(70));
        console.log('1. Review the contacts in Salesforce (filter by Clean_Status__c = Review)');
        console.log('2. Manually associate contacts with their suggested Accounts');
        console.log('3. Update Clean_Status__c to OK for contacts to keep');
        console.log('4. Consider creating a report for ongoing monitoring');

    } catch (error) {
        console.error('Error in main execution:', error.message);
        process.exit(1);
    }
}

// Execute if run directly
if (require.main === module) {
    main();
}

module.exports = { performBulkUpdate, verifyUpdate };