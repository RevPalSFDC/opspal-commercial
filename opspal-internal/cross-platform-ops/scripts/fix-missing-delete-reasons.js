#!/usr/bin/env node
/**
 * Fix Missing Delete Reasons
 * Updates contacts with Clean_Status__c = 'Delete' but no Delete_Reason__c
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { stringify } = require('csv-stringify');

const SALESFORCE_ORG = 'rentable-production';
const BATCH_SIZE = 10000;
const OUTPUT_DIR = path.join(__dirname, `../reports/fix-delete-reasons-${new Date().toISOString().replace(/[:.]/g, '-')}`);

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function fixMissingReasons() {
    console.log('Fetching contacts with Delete status but no reason...');

    // Query for all contacts with missing Delete Reason
    const query = `SELECT Id, Email, Phone, MobilePhone, CreatedDate, LastActivityDate, FirstName, LastName
                   FROM Contact
                   WHERE Clean_Status__c = 'Delete'
                   AND (Delete_Reason__c = null OR Delete_Reason__c = '')
                   LIMIT 50000`;

    const result = execSync(
        `sf data query --query "${query}" --target-org ${SALESFORCE_ORG} --json`,
        { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
    );

    const contacts = JSON.parse(result).result.records;
    console.log(`Found ${contacts.length} contacts with missing Delete Reasons`);

    if (contacts.length === 0) {
        console.log('No contacts need fixing');
        return;
    }

    // Analyze and assign reasons
    const updates = [];
    const now = new Date();

    for (const contact of contacts) {
        const createdDate = new Date(contact.CreatedDate);
        const lastActivity = contact.LastActivityDate ? new Date(contact.LastActivityDate) : null;
        const createdYearsAgo = (now - createdDate) / (365.25 * 24 * 60 * 60 * 1000);
        const lastActivityYearsAgo = lastActivity ? (now - lastActivity) / (365.25 * 24 * 60 * 60 * 1000) : null;

        let deleteReason = '';

        // Apply same rules as classification logic
        if (!contact.Email && !contact.Phone && !contact.MobilePhone) {
            deleteReason = 'No Email or Phone';
        } else if (createdYearsAgo >= 3 && !lastActivity) {
            deleteReason = 'No Activity 3+ Years';
        } else if (lastActivityYearsAgo && lastActivityYearsAgo >= 3) {
            deleteReason = 'Inactive 3+ Years';
        } else if (createdYearsAgo >= 5 && (!lastActivity || lastActivityYearsAgo >= 2)) {
            deleteReason = 'Old Inactive Contact';
        } else {
            // Default reason for edge cases
            deleteReason = 'Data Quality Review';
        }

        updates.push({
            Id: contact.Id,
            Delete_Reason__c: deleteReason
        });
    }

    // Count reasons for reporting
    const reasonCounts = {};
    updates.forEach(u => {
        reasonCounts[u.Delete_Reason__c] = (reasonCounts[u.Delete_Reason__c] || 0) + 1;
    });

    console.log('\nDelete Reason Distribution:');
    Object.entries(reasonCounts).forEach(([reason, count]) => {
        console.log(`  ${reason}: ${count}`);
    });

    // Save and upload in batches
    console.log(`\nUploading ${updates.length} updates in batches...`);

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

    console.log('\n✅ Delete Reason fix completed!');
    console.log(`Reports saved to: ${OUTPUT_DIR}`);
}

fixMissingReasons().catch(console.error);