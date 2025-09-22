#!/usr/bin/env node
/**
 * Fix OK Status Delete Reasons
 * Clears Delete_Reason__c for contacts with Clean_Status__c = 'OK'
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { stringify } = require('csv-stringify');

const SALESFORCE_ORG = 'rentable-production';
const BATCH_SIZE = 10000;
const OUTPUT_DIR = path.join(__dirname, `../reports/fix-ok-delete-reasons-${new Date().toISOString().replace(/[:.]/g, '-')}`);

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function fixOKDeleteReasons() {
    console.log('Fetching OK status contacts with Delete_Reason populated...');

    // Query for all OK contacts with Delete Reason
    const query = `SELECT Id, FirstName, LastName, Email, Delete_Reason__c
                   FROM Contact
                   WHERE Clean_Status__c = 'OK'
                   AND (Delete_Reason__c != null AND Delete_Reason__c != '')
                   LIMIT 50000`;

    const result = execSync(
        `sf data query --query "${query}" --target-org ${SALESFORCE_ORG} --json`,
        { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
    );

    const contacts = JSON.parse(result).result.records;
    console.log(`Found ${contacts.length} OK status contacts with Delete_Reason populated`);

    if (contacts.length === 0) {
        console.log('No contacts need fixing');
        return;
    }

    // Count reasons for reporting
    const reasonCounts = {};
    contacts.forEach(c => {
        const reason = c.Delete_Reason__c || 'Unknown';
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });

    console.log('\nDelete Reason Distribution (to be cleared):');
    Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([reason, count]) => {
            console.log(`  ${reason}: ${count}`);
        });

    // Create updates to clear Delete_Reason__c
    const updates = contacts.map(contact => ({
        Id: contact.Id,
        Delete_Reason__c: '' // Clear the field
    }));

    // Save and upload in batches
    console.log(`\nClearing Delete_Reason__c for ${updates.length} OK status contacts...`);

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, Math.min(i + BATCH_SIZE, updates.length));
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const batchFile = path.join(OUTPUT_DIR, `batch-${batchNum}.csv`);

        // Write batch to CSV
        const output = fs.createWriteStream(batchFile);
        const stringifier = stringify({ header: true });

        stringifier.pipe(output);
        batch.forEach(record => stringifier.write(record));
        stringifier.end();

        await new Promise(resolve => output.on('finish', resolve));

        console.log(`  Batch ${batchNum}: ${batch.length} records`);

        // Upload to Salesforce
        try {
            const uploadResult = execSync(
                `sf data upsert bulk --sobject Contact --file "${batchFile}" --external-id Id --target-org ${SALESFORCE_ORG} --wait 180 --json`,
                { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
            );

            const result = JSON.parse(uploadResult);
            if (result.status === 0) {
                console.log(`    ✓ Batch ${batchNum} uploaded successfully`);
            }
        } catch (error) {
            console.error(`    ✗ Batch ${batchNum} upload failed:`, error.message);
        }
    }

    // Save summary
    const summary = {
        totalFixed: updates.length,
        reasonDistribution: reasonCounts,
        timestamp: new Date().toISOString()
    };

    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'summary.json'),
        JSON.stringify(summary, null, 2)
    );

    console.log('\n✅ OK status Delete_Reason fix completed!');
    console.log(`Reports saved to: ${OUTPUT_DIR}`);
}

fixOKDeleteReasons().catch(console.error);