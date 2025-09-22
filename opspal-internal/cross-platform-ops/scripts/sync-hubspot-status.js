#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const execPromise = util.promisify(exec);

// Configuration
const ORG_ALIAS = 'rentable-production';
const OUTPUT_DIR = path.join(__dirname, '..', 'reports', 'hubspot-sync');

// Load existing sync analysis
async function loadSyncAnalysis() {
    try {
        const syncFile = path.join(__dirname, '..', 'reports', 'sync-overlap-analysis.json');
        const content = await fs.readFile(syncFile, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Could not load sync analysis:', error.message);
        return null;
    }
}

// Query Salesforce for HubSpot sync fields
async function querySalesforce(query) {
    try {
        const command = `sf data query --query "${query}" --target-org ${ORG_ALIAS} --json`;
        const { stdout } = await execPromise(command);
        const result = JSON.parse(stdout);
        return result.result.records;
    } catch (error) {
        console.error('Query error:', error.message);
        return [];
    }
}

// Update HubSpot sync status
async function updateHubSpotSyncStatus() {
    console.log('Loading HubSpot sync analysis...');
    const syncData = await loadSyncAnalysis();

    if (!syncData) {
        console.error('No sync analysis data found. Please run sync analysis first.');
        return;
    }

    const stats = {
        totalInBoth: syncData.inBothNotOnInclusionList?.length || 0,
        inclusionList: syncData.inclusionListSize || 0,
        synced: syncData.syncedWithIds || 0,
        processed: 0,
        updated: 0
    };

    console.log(`Found ${stats.totalInBoth} contacts in both systems but not on inclusion list`);

    // Create map of contacts needing inclusion list flag
    const needsInclusionFlag = new Map();
    if (syncData.inBothNotOnInclusionList) {
        for (const contact of syncData.inBothNotOnInclusionList) {
            // Note: The sync data has IDs and emails swapped - fixing that
            const sfId = contact.email; // Actually the SF ID
            const email = contact.salesforceId; // Actually the email
            needsInclusionFlag.set(sfId, {
                email: email,
                name: contact.salesforceName,
                needsInclusion: true
            });
        }
    }

    // Process contacts to update sync status
    const updates = [];
    const batchSize = 200;

    // Get contacts that need sync status updates
    const contactIds = Array.from(needsInclusionFlag.keys());

    for (let i = 0; i < contactIds.length; i += batchSize) {
        const batch = contactIds.slice(i, i + batchSize);
        const idList = batch.map(id => `'${id}'`).join(',');

        const query = `
            SELECT Id, Email, Clean_Status__c, In_HubSpot_Not_Inclusion_List__c, Sync_Status__c
            FROM Contact
            WHERE Id IN (${idList})
        `;

        const contacts = await querySalesforce(query);

        for (const contact of contacts) {
            const syncInfo = needsInclusionFlag.get(contact.Id);
            if (syncInfo) {
                updates.push({
                    Id: contact.Id,
                    In_HubSpot_Not_Inclusion_List__c: true,
                    Sync_Status__c: 'In HS Not on Inclusion List'
                });
                stats.updated++;
            }
        }

        stats.processed += batch.length;
        console.log(`Processed ${stats.processed}/${stats.totalInBoth} contacts`);
    }

    // Save updates to CSV
    if (updates.length > 0) {
        await saveUpdatesAsCSV(updates);
    }

    // Generate summary report
    const report = {
        processedAt: new Date().toISOString(),
        stats: stats,
        recommendations: [
            `Add ${stats.totalInBoth} contacts to HubSpot Inclusion List`,
            'Review contacts marked for sync but not in inclusion list',
            'Consider bulk import to inclusion list for efficiency'
        ]
    };

    const reportFile = path.join(OUTPUT_DIR, 'hubspot-sync-report.json');
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

    console.log(`\n=== HubSpot Sync Status Report ===`);
    console.log(`Total contacts in both systems: ${syncData.hubspotTotal}`);
    console.log(`Contacts on inclusion list: ${stats.inclusionList}`);
    console.log(`Contacts needing inclusion: ${stats.totalInBoth}`);
    console.log(`Updates prepared: ${stats.updated}`);
    console.log(`Report saved to: ${reportFile}`);

    return report;
}

// Save updates as CSV for bulk API
async function saveUpdatesAsCSV(updates) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(OUTPUT_DIR, `hubspot-sync-updates-${timestamp}.csv`);

    // Create CSV content
    const headers = ['Id', 'In_HubSpot_Not_Inclusion_List__c', 'Sync_Status__c'];
    const rows = [headers.join(',')];

    for (const update of updates) {
        const row = headers.map(header => {
            const value = update[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string' && value.includes(',')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        rows.push(row.join(','));
    }

    await fs.writeFile(filename, rows.join('\n'));
    console.log(`Saved ${updates.length} sync status updates to ${filename}`);

    // Execute bulk update
    await executeBulkUpdate(filename);
}

// Execute bulk update
async function executeBulkUpdate(csvFile) {
    try {
        console.log(`Executing bulk update from ${csvFile}...`);
        const command = `sf data upsert bulk --sobject Contact --file "${csvFile}" --external-id Id --target-org ${ORG_ALIAS} --wait 10`;
        const { stdout } = await execPromise(command);
        console.log('Bulk update completed successfully');
    } catch (error) {
        console.error('Bulk update error:', error.message);
    }
}

// Main execution
async function main() {
    try {
        await updateHubSpotSyncStatus();
        console.log('\nHubSpot sync status update completed!');
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { updateHubSpotSyncStatus };