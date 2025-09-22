#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const execPromise = util.promisify(exec);

// Configuration
const ORG_ALIAS = 'rentable-production';
const INPUT_FILE = path.join(__dirname, '..', 'reports', 'all-contacts.csv');
const OUTPUT_DIR = path.join(__dirname, '..', 'reports', 'bulk-classification');
const BATCH_SIZE = 10000; // Bulk API 2.0 can handle 10k records per batch

console.log('=========================================');
console.log('Salesforce Bulk API 2.0 Contact Processor');
console.log('=========================================');
console.log('Using Bulk API 2.0 for optimal performance');
console.log('=========================================\n');

// Ensure output directory exists
async function ensureOutputDir() {
    try {
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating output directory:', error);
    }
}

// Read CSV file
async function readContactsFromCSV() {
    const contacts = [];
    const fileContent = await fs.readFile(INPUT_FILE, 'utf-8');
    const lines = fileContent.split('\n');
    const headers = lines[0].split(',');

    console.log(`Reading ${lines.length - 1} contacts from CSV...`);

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = lines[i].split(',');
        const contact = {};

        headers.forEach((header, index) => {
            contact[header] = values[index] || '';
        });

        contacts.push(contact);

        if (contacts.length % 10000 === 0) {
            process.stdout.write(`\rLoaded: ${contacts.length} contacts`);
        }
    }

    console.log(`\nLoaded ${contacts.length} contacts`);
    return contacts;
}

// Calculate contact score for duplicate detection
function calculateContactScore(contact) {
    let score = 0;
    if (contact.Email) score += 10;
    if (contact.Phone) score += 8;
    if (contact.MobilePhone) score += 5;
    if (contact.FirstName) score += 3;
    if (contact.LastName) score += 3;
    if (contact.AccountId) score += 5;
    if (contact.Title) score += 2;
    if (contact.Department) score += 2;
    if (contact.MailingCity) score += 1;
    if (contact.MailingState) score += 1;
    if (contact.LastActivityDate) score += 10;
    return score;
}

// Find duplicates in the dataset
function findDuplicates(contacts) {
    const emailMap = new Map();
    const phoneMap = new Map();
    const duplicateSets = new Map();

    console.log('\nBuilding duplicate detection indices...');

    // Build indices
    contacts.forEach(contact => {
        if (contact.Email) {
            const email = contact.Email.toLowerCase();
            if (!emailMap.has(email)) emailMap.set(email, []);
            emailMap.get(email).push(contact);
        }

        if (contact.Phone) {
            if (!phoneMap.has(contact.Phone)) phoneMap.set(contact.Phone, []);
            phoneMap.get(contact.Phone).push(contact);
        }

        if (contact.MobilePhone && contact.MobilePhone !== contact.Phone) {
            if (!phoneMap.has(contact.MobilePhone)) phoneMap.set(contact.MobilePhone, []);
            phoneMap.get(contact.MobilePhone).push(contact);
        }
    });

    // Find duplicate sets
    const processedIds = new Set();

    [...emailMap.values(), ...phoneMap.values()].forEach(group => {
        if (group.length > 1) {
            // Sort by score and last modified to find master
            const sorted = group
                .filter(c => !processedIds.has(c.Id))
                .sort((a, b) => {
                    const scoreA = calculateContactScore(a);
                    const scoreB = calculateContactScore(b);
                    if (scoreB !== scoreA) return scoreB - scoreA;

                    const dateA = new Date(a.LastModifiedDate || a.CreatedDate);
                    const dateB = new Date(b.LastModifiedDate || b.CreatedDate);
                    return dateB - dateA;
                });

            if (sorted.length > 1) {
                const masterId = sorted[0].Id;
                duplicateSets.set(masterId, sorted.slice(1).map(c => c.Id));

                sorted.forEach(c => processedIds.add(c.Id));
            }
        }
    });

    console.log(`Found ${duplicateSets.size} duplicate sets`);
    return duplicateSets;
}

// Classify a contact
function classifyContact(contact, duplicateSets) {
    const classification = {
        Id: contact.Id,
        Clean_Status__c: 'OK',
        Delete_Reason__c: '',
        In_HubSpot_Not_Inclusion_List__c: false,
        Sync_Status__c: contact.Sync_Status__c || 'Not Synced'
    };

    const now = new Date();
    const createdDate = new Date(contact.CreatedDate);
    const lastActivity = contact.LastActivityDate ? new Date(contact.LastActivityDate) : null;
    const lastModified = new Date(contact.LastModifiedDate);

    // Calculate ages in years
    const createdYearsAgo = (now - createdDate) / (365 * 24 * 60 * 60 * 1000);
    const lastActivityYearsAgo = lastActivity ? (now - lastActivity) / (365 * 24 * 60 * 60 * 1000) : null;

    // Check if already classified
    if (contact.Clean_Status__c && contact.Clean_Status__c !== 'null' && contact.Clean_Status__c !== '') {
        return null; // Skip already classified contacts
    }

    // Rule 1: No contact information
    if (!contact.Email && !contact.Phone && !contact.MobilePhone) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'No Email or Phone';
        return classification;
    }

    // Rule 2: Test/Placeholder records
    const name = `${contact.FirstName || ''} ${contact.LastName || ''}`.toLowerCase();
    const email = (contact.Email || '').toLowerCase();

    if (name.match(/\b(test|placeholder|demo|dummy|sample|fake|example)\b/) ||
        email.match(/@(test|example|placeholder|demo|fake)\./)) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'Test Record';
        return classification;
    }

    // Rule 3: Invalid email domains
    if (email && email.match(/@(noreply|no-reply|donotreply|spam|junk)\./)) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'Invalid Email Domain';
        return classification;
    }

    // Rule 4: No activity for 3+ years
    if (createdYearsAgo >= 3 && !lastActivity) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'No Activity 3+ Years';
        return classification;
    }

    // Rule 5: Inactive for 3+ years
    if (lastActivityYearsAgo && lastActivityYearsAgo >= 3) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'Inactive 3+ Years';
        return classification;
    }

    // Rule 6: Old inactive contacts
    if (createdYearsAgo >= 5 && (!lastActivity || lastActivityYearsAgo >= 2)) {
        classification.Clean_Status__c = 'Archive';
        classification.Delete_Reason__c = 'Old Inactive Contact';
        return classification;
    }

    // Rule 7: Check for duplicates
    let isDuplicate = false;
    let masterId = null;

    duplicateSets.forEach((duplicates, master) => {
        if (duplicates.includes(contact.Id)) {
            isDuplicate = true;
            masterId = master;
        }
    });

    if (isDuplicate) {
        classification.Clean_Status__c = 'Duplicate';
        classification.Delete_Reason__c = `Master: ${masterId}`;
        return classification;
    }

    // Rule 8: Missing critical information
    if (!contact.LastName || (!contact.Email && !contact.Phone)) {
        classification.Clean_Status__c = 'Review';
        classification.Delete_Reason__c = 'Missing Critical Info';
        return classification;
    }

    return classification;
}

// Process all contacts
async function processAllContacts() {
    await ensureOutputDir();

    const stats = {
        total: 0,
        processed: 0,
        skipped: 0,
        cleanStatusCounts: {
            OK: 0,
            Duplicate: 0,
            Delete: 0,
            Archive: 0,
            Review: 0
        },
        deleteReasons: {},
        duplicateStats: {
            totalDuplicates: 0,
            duplicateSets: 0
        }
    };

    // Read all contacts
    const contacts = await readContactsFromCSV();
    stats.total = contacts.length;

    // Find duplicates
    const duplicateSets = findDuplicates(contacts);
    stats.duplicateStats.duplicateSets = duplicateSets.size;

    // Process and classify contacts
    console.log('\nClassifying contacts...');
    const updates = [];

    for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        const classification = classifyContact(contact, duplicateSets);

        if (classification) {
            updates.push(classification);

            // Track statistics
            stats.cleanStatusCounts[classification.Clean_Status__c]++;
            if (classification.Delete_Reason__c) {
                const reason = classification.Delete_Reason__c.startsWith('Master:')
                    ? 'Duplicate - Has Master'
                    : classification.Delete_Reason__c;
                stats.deleteReasons[reason] = (stats.deleteReasons[reason] || 0) + 1;
            }
            if (classification.Clean_Status__c === 'Duplicate') {
                stats.duplicateStats.totalDuplicates++;
            }

            stats.processed++;
        } else {
            stats.skipped++;
        }

        if ((i + 1) % 1000 === 0) {
            process.stdout.write(`\rProcessed: ${i + 1}/${stats.total} contacts (${Math.round((i + 1) / stats.total * 100)}%)`);
        }
    }

    console.log(`\n\nClassification complete. Processed: ${stats.processed}, Skipped: ${stats.skipped}`);

    // Save updates in batches for Bulk API 2.0
    await saveBulkUpdates(updates, stats);

    // Save reports
    await saveStatistics(stats);
    await saveDuplicateReport(duplicateSets);

    return stats;
}

// Save updates using Bulk API 2.0
async function saveBulkUpdates(updates, stats) {
    console.log('\nPreparing bulk updates...');

    // Split into batches
    const batches = [];
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        batches.push(updates.slice(i, i + BATCH_SIZE));
    }

    console.log(`Created ${batches.length} batches of up to ${BATCH_SIZE} records each`);

    // Save each batch to CSV and execute bulk update
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const filename = path.join(OUTPUT_DIR, `batch-${i + 1}.csv`);

        // Create CSV
        const csvContent = [
            'Id,Clean_Status__c,Delete_Reason__c,In_HubSpot_Not_Inclusion_List__c,Sync_Status__c',
            ...batch.map(record =>
                `${record.Id},${record.Clean_Status__c},"${record.Delete_Reason__c || ''}",${record.In_HubSpot_Not_Inclusion_List__c},${record.Sync_Status__c}`
            )
        ].join('\n');

        await fs.writeFile(filename, csvContent);

        console.log(`\nBatch ${i + 1}/${batches.length}: ${batch.length} records`);
        console.log(`Saved to ${path.basename(filename)}`);

        // Execute bulk update using Salesforce CLI with Bulk API 2.0
        try {
            console.log('Executing bulk update via Bulk API 2.0...');
            const command = `sf data upsert bulk --sobject Contact --file "${filename}" --external-id Id --target-org ${ORG_ALIAS} --wait 120`;
            const { stdout, stderr } = await execPromise(command, { maxBuffer: 50 * 1024 * 1024 });

            if (stderr && stderr.includes('Error')) {
                console.error('Bulk update error:', stderr);
            } else {
                console.log(`✅ Batch ${i + 1} completed successfully`);
            }
        } catch (error) {
            console.error(`❌ Batch ${i + 1} failed:`, error.message);
        }
    }
}

// Save statistics
async function saveStatistics(stats) {
    const reportFile = path.join(OUTPUT_DIR, 'classification-report.json');
    await fs.writeFile(reportFile, JSON.stringify(stats, null, 2));

    const summaryFile = path.join(OUTPUT_DIR, 'classification-summary.txt');
    const summary = `
============================================================
=== COMPLETE Contact Classification Summary (Bulk API 2.0) ===

Total Records: ${stats.total}
Total Processed: ${stats.processed}
Total Skipped: ${stats.skipped} (already classified)

Clean Status Distribution:
  OK: ${stats.cleanStatusCounts.OK} (${Math.round(stats.cleanStatusCounts.OK / stats.processed * 100)}%)
  Duplicate: ${stats.cleanStatusCounts.Duplicate} (${Math.round(stats.cleanStatusCounts.Duplicate / stats.processed * 100)}%)
  Delete: ${stats.cleanStatusCounts.Delete} (${Math.round(stats.cleanStatusCounts.Delete / stats.processed * 100)}%)
  Archive: ${stats.cleanStatusCounts.Archive} (${Math.round(stats.cleanStatusCounts.Archive / stats.processed * 100)}%)
  Review: ${stats.cleanStatusCounts.Review} (${Math.round(stats.cleanStatusCounts.Review / stats.processed * 100)}%)

Delete Reasons:
${Object.entries(stats.deleteReasons)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `  ${reason}: ${count}`)
    .join('\n')}

Duplicate Statistics:
  Total Duplicates: ${stats.duplicateStats.totalDuplicates}
  Duplicate Sets: ${stats.duplicateStats.duplicateSets}

============================================================
`;

    await fs.writeFile(summaryFile, summary);
    console.log('\n' + summary);
}

// Save duplicate report
async function saveDuplicateReport(duplicateSets) {
    const reportFile = path.join(OUTPUT_DIR, 'duplicate-sets.json');
    const report = {};

    duplicateSets.forEach((duplicates, master) => {
        report[master] = duplicates;
    });

    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    console.log(`Saved duplicate report with ${duplicateSets.size} master records`);
}

// Main execution
async function main() {
    try {
        console.log('Starting Bulk API 2.0 contact classification process...\n');
        const startTime = Date.now();

        const stats = await processAllContacts();

        const duration = Math.round((Date.now() - startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;

        console.log(`\n\n✅ Bulk contact classification completed!`);
        console.log(`Processed: ${stats.processed} contacts`);
        console.log(`Skipped: ${stats.skipped} already classified`);
        console.log(`Duration: ${minutes}m ${seconds}s`);
        console.log(`\nReports saved to: ${OUTPUT_DIR}`);

    } catch (error) {
        console.error('\n❌ Bulk classification failed:', error);
        process.exit(1);
    }
}

// Run the script
main();