#!/usr/bin/env node
/**
 * HubSpot-Salesforce Sync Verification Script
 * Checks HubSpot contacts against Salesforce and updates Sync_Status__c field
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const { execSync } = require('child_process');
// Load HubSpot config from HS platform directory
const HUBSPOT_API_KEY = 'pat-na1-3c5018cc-95fd-4432-8d90-7d74eaf35784';
const HUBSPOT_PORTAL_ID = '22448203';
const SALESFORCE_ORG = 'rentable-production';
const BATCH_SIZE = 10000;
const OUTPUT_DIR = path.join(__dirname, `../reports/sync-verification-${new Date().toISOString().replace(/[:.]/g, '-')}`);

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Statistics
let stats = {
    totalSalesforce: 0,
    totalHubspot: 0,
    synced: 0,
    existsBothNotLinked: 0,
    inHsNotOnInclusionList: 0,
    notInHubspot: 0,
    errors: 0,
    startTime: Date.now()
};

/**
 * Fetch all HubSpot contacts with their Salesforce IDs
 */
async function fetchHubSpotContacts() {
    console.log('Fetching HubSpot contacts...');
    const hubspotContacts = new Map();
    let after = undefined;
    let totalFetched = 0;

    try {
        do {
            const url = `https://api.hubapi.com/crm/v3/objects/contacts`;
            const params = new URLSearchParams({
                limit: '100',
                properties: 'email,firstname,lastname,salesforce_contact_id,hs_object_id'
            });

            if (after) {
                params.append('after', after);
            }

            const response = await fetch(`${url}?${params}`, {
                headers: {
                    'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Process contacts
            data.results.forEach(contact => {
                const email = contact.properties.email?.toLowerCase();
                const salesforceId = contact.properties.salesforce_contact_id;
                const hsId = contact.id;

                // Store by email for matching
                if (email) {
                    hubspotContacts.set(email, {
                        hsId,
                        salesforceId,
                        email,
                        firstName: contact.properties.firstname,
                        lastName: contact.properties.lastname
                    });
                }

                // Also store by Salesforce ID if present
                if (salesforceId) {
                    hubspotContacts.set(salesforceId, {
                        hsId,
                        salesforceId,
                        email,
                        firstName: contact.properties.firstname,
                        lastName: contact.properties.lastname
                    });
                }
            });

            totalFetched += data.results.length;
            process.stdout.write(`\rFetched ${totalFetched} HubSpot contacts`);

            // Check for pagination
            after = data.paging?.next?.after;

        } while (after);

        console.log(`\nTotal HubSpot contacts fetched: ${totalFetched}`);
        stats.totalHubspot = totalFetched;

        return hubspotContacts;
    } catch (error) {
        console.error('Error fetching HubSpot contacts:', error.message);
        return hubspotContacts;
    }
}

/**
 * Load Salesforce contacts from existing CSV export
 */
async function loadSalesforceContacts() {
    console.log('Loading Salesforce contacts from CSV...');
    const csvPath = path.join(__dirname, '../reports/all-contacts.csv');

    if (!fs.existsSync(csvPath)) {
        console.error('Error: Salesforce CSV export not found. Please run export first.');
        process.exit(1);
    }

    const contacts = [];

    return new Promise((resolve, reject) => {
        const parser = fs.createReadStream(csvPath)
            .pipe(parse({
                columns: true,
                skip_empty_lines: true
            }));

        parser.on('data', (row) => {
            if (row.Id && row.Id !== 'Id') {
                contacts.push(row);
                stats.totalSalesforce++;

                if (stats.totalSalesforce % 10000 === 0) {
                    process.stdout.write(`\rLoaded ${stats.totalSalesforce} Salesforce contacts`);
                }
            }
        });

        parser.on('end', () => {
            console.log(`\nTotal Salesforce contacts loaded: ${stats.totalSalesforce}`);
            resolve(contacts);
        });

        parser.on('error', reject);
    });
}

/**
 * Verify sync status for each Salesforce contact
 */
function verifySyncStatus(sfContacts, hsContacts) {
    console.log('\nVerifying sync status...');
    const updates = [];
    let processed = 0;

    for (const sfContact of sfContacts) {
        const sfId = sfContact.Id;
        const sfEmail = sfContact.Email?.toLowerCase();
        let syncStatus = 'Not Synced'; // Default

        // Check by Salesforce ID first (most reliable)
        const hsContactById = hsContacts.get(sfId);

        // Then check by email if needed
        const hsContactByEmail = sfEmail ? hsContacts.get(sfEmail) : null;

        if (hsContactById) {
            // Found by Salesforce ID - properly synced
            syncStatus = 'Synced';
            stats.synced++;
        } else if (hsContactByEmail) {
            // Found by email but not linked by ID
            if (sfContact.In_HubSpot_Not_Inclusion_List__c === 'true' ||
                sfContact.In_HubSpot_Not_Inclusion_List__c === true) {
                syncStatus = 'In HS Not on Inclusion List';
                stats.inHsNotOnInclusionList++;
            } else {
                syncStatus = 'Exists Both Not Linked';
                stats.existsBothNotLinked++;
            }
        } else {
            // Not found in HubSpot at all
            syncStatus = 'Not Synced';
            stats.notInHubspot++;
        }

        // Only create update if sync status has changed
        if (sfContact.Sync_Status__c !== syncStatus) {
            updates.push({
                Id: sfId,
                Sync_Status__c: syncStatus
            });
        }

        processed++;
        if (processed % 10000 === 0) {
            process.stdout.write(`\rProcessed ${processed}/${stats.totalSalesforce} contacts`);
        }
    }

    console.log(`\nSync verification complete: ${updates.length} updates needed`);
    return updates;
}

/**
 * Save updates to CSV batches and upload to Salesforce
 */
async function saveAndUploadUpdates(updates) {
    if (updates.length === 0) {
        console.log('No updates needed - all sync statuses are current');
        return;
    }

    console.log(`\nSaving and uploading ${updates.length} sync status updates...`);

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, Math.min(i + BATCH_SIZE, updates.length));
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const batchFile = path.join(OUTPUT_DIR, `sync-update-batch-${batchNum}.csv`);

        // Write batch to CSV
        const output = fs.createWriteStream(batchFile);
        const stringifier = stringify({ header: true });

        stringifier.pipe(output);
        batch.forEach(record => stringifier.write(record));
        stringifier.end();

        await new Promise(resolve => output.on('finish', resolve));

        console.log(`  Batch ${batchNum}: ${batch.length} records saved`);

        // Upload to Salesforce
        console.log(`  Uploading batch ${batchNum} to Salesforce...`);
        try {
            const uploadResult = execSync(
                `sf data upsert bulk --sobject Contact --file "${batchFile}" --external-id Id --target-org ${SALESFORCE_ORG} --wait 180 --json`,
                { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
            );

            const result = JSON.parse(uploadResult);
            if (result.status === 0 && result.result) {
                console.log(`    ✓ Batch ${batchNum} uploaded successfully`);
            } else {
                console.log(`    ✗ Batch ${batchNum} upload failed:`, result.message || 'Unknown error');
                stats.errors++;
            }
        } catch (uploadError) {
            console.error(`    ✗ Batch ${batchNum} upload error:`, uploadError.message);
            stats.errors++;
        }
    }
}

/**
 * Generate summary report
 */
function generateSummary() {
    const executionTime = Math.round((Date.now() - stats.startTime) / 1000);

    const summaryText = `
HubSpot-Salesforce Sync Verification Summary
============================================
Execution Time: ${executionTime}s
Salesforce Contacts: ${stats.totalSalesforce}
HubSpot Contacts: ${stats.totalHubspot}

Sync Status Breakdown:
  Synced: ${stats.synced} (${(stats.synced / stats.totalSalesforce * 100).toFixed(1)}%)
  Exists Both Not Linked: ${stats.existsBothNotLinked} (${(stats.existsBothNotLinked / stats.totalSalesforce * 100).toFixed(1)}%)
  In HS Not on Inclusion List: ${stats.inHsNotOnInclusionList} (${(stats.inHsNotOnInclusionList / stats.totalSalesforce * 100).toFixed(1)}%)
  Not in HubSpot: ${stats.notInHubspot} (${(stats.notInHubspot / stats.totalSalesforce * 100).toFixed(1)}%)

Upload Errors: ${stats.errors}
`;

    // Save text summary
    const summaryFile = path.join(OUTPUT_DIR, 'summary.txt');
    fs.writeFileSync(summaryFile, summaryText);
    console.log(summaryText);

    // Save JSON summary
    const jsonFile = path.join(OUTPUT_DIR, 'summary.json');
    fs.writeFileSync(jsonFile, JSON.stringify(stats, null, 2));

    console.log(`\nReports saved to: ${OUTPUT_DIR}`);
}

/**
 * Main execution
 */
async function main() {
    console.log('====================================');
    console.log('HubSpot-Salesforce Sync Verification');
    console.log('====================================');
    console.log();

    try {
        // Step 1: Fetch HubSpot contacts
        const hsContacts = await fetchHubSpotContacts();

        // Step 2: Load Salesforce contacts
        const sfContacts = await loadSalesforceContacts();

        // Step 3: Verify sync status
        const updates = verifySyncStatus(sfContacts, hsContacts);

        // Step 4: Save and upload updates
        await saveAndUploadUpdates(updates);

        // Step 5: Generate summary
        generateSummary();

        console.log('\n✅ Sync verification completed successfully!');
    } catch (error) {
        console.error('\n❌ Error during sync verification:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { fetchHubSpotContacts, verifySyncStatus };