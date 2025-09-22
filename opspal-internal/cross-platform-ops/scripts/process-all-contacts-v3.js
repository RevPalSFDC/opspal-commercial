#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const execPromise = util.promisify(exec);

// Configuration
const ORG_ALIAS = 'rentable-production';
const BATCH_SIZE = 500; // Batch size for processing
const OUTPUT_DIR = path.join(__dirname, '..', 'reports', 'contact-classification-complete');
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

console.log('=====================================');
console.log('COMPLETE Contact Classification v3.0');
console.log('=====================================');
console.log('Processing ALL contacts in Salesforce');
console.log('Features:');
console.log('  • Processes entire contact database');
console.log('  • Activity-based deletion rules');
console.log('  • Duplicate detection with master records');
console.log('  • Comprehensive reporting');
console.log('=====================================\n');

// Ensure output directory exists
async function ensureOutputDir() {
    try {
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating output directory:', error);
    }
}

// Query Salesforce with retry logic
async function querySalesforce(query, retryCount = 0) {
    try {
        const command = `sf data query --query "${query}" --target-org ${ORG_ALIAS} --json`;
        const { stdout } = await execPromise(command, { maxBuffer: 100 * 1024 * 1024 });
        const result = JSON.parse(stdout);
        if (result.status === 0 && result.result) {
            return result.result.records || [];
        }
        throw new Error(result.message || 'Query failed');
    } catch (error) {
        if (retryCount < MAX_RETRIES) {
            console.log(`Query failed, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return querySalesforce(query, retryCount + 1);
        }
        console.error(`Query error after ${MAX_RETRIES} retries:`, error.message);
        return [];
    }
}

// Find duplicates for a contact
async function findDuplicates(contact, allContacts) {
    if (!contact.Email && !contact.Phone) {
        return { isDuplicate: false, candidates: [] };
    }

    // Find potential duplicates from the cached data
    const duplicates = allContacts.filter(c => {
        if (c.Id === contact.Id) return false;

        // Match by email
        if (contact.Email && c.Email && contact.Email.toLowerCase() === c.Email.toLowerCase()) {
            return true;
        }

        // Match by phone
        if (contact.Phone && c.Phone && contact.Phone === c.Phone) {
            return true;
        }

        // Match by mobile phone
        if (contact.MobilePhone && c.MobilePhone && contact.MobilePhone === c.MobilePhone) {
            return true;
        }

        return false;
    });

    if (duplicates.length > 0) {
        // Determine master record (most recently modified with most data)
        const allCandidates = [contact, ...duplicates];
        const scored = allCandidates.map(c => ({
            id: c.Id,
            score: calculateContactScore(c),
            lastModified: new Date(c.LastModifiedDate || c.CreatedDate)
        }));

        scored.sort((a, b) => {
            // First by score, then by last modified
            if (b.score !== a.score) return b.score - a.score;
            return b.lastModified - a.lastModified;
        });

        const masterId = scored[0].id;
        const mergeIds = scored.slice(1).map(s => s.id);

        return {
            isDuplicate: contact.Id !== masterId,
            masterId: masterId,
            candidates: mergeIds
        };
    }

    return { isDuplicate: false, candidates: [] };
}

// Calculate a score for contact data completeness
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

// Process all contacts
async function processAllContacts() {
    await ensureOutputDir();

    const stats = {
        total: 0,
        processed: 0,
        cleanStatusCounts: {
            OK: 0,
            Duplicate: 0,
            Delete: 0,
            Archive: 0,
            Review: 0,
            Merge: 0
        },
        deleteReasons: {},
        duplicateStats: {
            totalDuplicates: 0,
            duplicateSets: 0
        },
        errors: []
    };

    // Get total count
    console.log('Getting total contact count...');
    const countQuery = "SELECT COUNT(Id) total FROM Contact";
    const countResult = await querySalesforce(countQuery);
    stats.total = countResult[0]?.total || countResult[0]?.expr0 || 0;

    console.log(`Total contacts to process: ${stats.total}`);

    // First, fetch ALL contacts for duplicate detection
    console.log('\nFetching all contacts for duplicate analysis...');
    const allContacts = [];
    let offset = 0;

    while (offset < stats.total) {
        const query = `SELECT Id, FirstName, LastName, Email, Phone, MobilePhone, AccountId, Title, Department, MailingCity, MailingState, LeadSource, LastActivityDate, CreatedDate, LastModifiedDate, Clean_Status__c, Delete_Reason__c, Sync_Status__c, In_HubSpot_Not_Inclusion_List__c FROM Contact ORDER BY Id LIMIT 2000 OFFSET ${offset}`;

        const batch = await querySalesforce(query);
        if (batch.length === 0) break;

        allContacts.push(...batch);
        offset += 2000;

        process.stdout.write(`\rLoaded: ${allContacts.length}/${stats.total} contacts`);
    }

    console.log(`\n\nLoaded ${allContacts.length} contacts for processing\n`);

    // Process contacts and build classifications
    const updates = [];
    const duplicateSets = new Map();

    for (let i = 0; i < allContacts.length; i++) {
        const contact = allContacts[i];

        try {
            const classification = await classifyContact(contact, allContacts, duplicateSets);

            // Track statistics
            stats.cleanStatusCounts[classification.Clean_Status__c]++;
            if (classification.Delete_Reason__c) {
                stats.deleteReasons[classification.Delete_Reason__c] =
                    (stats.deleteReasons[classification.Delete_Reason__c] || 0) + 1;
            }
            if (classification.Clean_Status__c === 'Duplicate') {
                stats.duplicateStats.totalDuplicates++;
            }

            // Prepare update record
            updates.push({
                Id: contact.Id,
                ...classification
            });

            stats.processed++;

            // Progress indicator
            if (stats.processed % 100 === 0) {
                process.stdout.write(`\rProcessed: ${stats.processed}/${stats.total} contacts (${Math.round(stats.processed / stats.total * 100)}%)`);
            }

            // Save batch updates
            if (updates.length >= 500) {
                await saveBatchUpdates(updates.splice(0, 500));
            }

        } catch (error) {
            console.error(`\nError processing contact ${contact.Id}:`, error.message);
            stats.errors.push({ contactId: contact.Id, error: error.message });
        }
    }

    // Save remaining updates
    if (updates.length > 0) {
        await saveBatchUpdates(updates);
    }

    // Calculate duplicate sets
    stats.duplicateStats.duplicateSets = duplicateSets.size;

    // Save statistics and reports
    await saveStatistics(stats);
    await saveDuplicateReport(duplicateSets);

    return stats;
}

// Enhanced classification with activity-based rules and duplicate detection
async function classifyContact(contact, allContacts, duplicateSets) {
    const classification = {
        Clean_Status__c: 'OK',
        Delete_Reason__c: null,
        In_HubSpot_Not_Inclusion_List__c: false,
        Sync_Status__c: 'Not Synced'
    };

    const now = new Date();
    const createdDate = new Date(contact.CreatedDate);
    const lastActivity = contact.LastActivityDate ? new Date(contact.LastActivityDate) : null;
    const lastModified = new Date(contact.LastModifiedDate);

    // Calculate ages in years
    const createdYearsAgo = (now - createdDate) / (365 * 24 * 60 * 60 * 1000);
    const lastActivityYearsAgo = lastActivity ? (now - lastActivity) / (365 * 24 * 60 * 60 * 1000) : null;
    const lastModifiedYearsAgo = (now - lastModified) / (365 * 24 * 60 * 60 * 1000);

    // Rule 1: No contact information at all
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

    // Rule 4: Created 3+ years ago with NO activity ever
    if (createdYearsAgo >= 3 && !lastActivity) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'No Activity 3+ Years';
        return classification;
    }

    // Rule 5: No activity in last 3 years (but had some activity)
    if (lastActivityYearsAgo && lastActivityYearsAgo >= 3) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'Inactive 3+ Years';
        return classification;
    }

    // Rule 6: Created 5+ years ago with no activity in 2 years
    if (createdYearsAgo >= 5 && (!lastActivity || lastActivityYearsAgo >= 2)) {
        classification.Clean_Status__c = 'Archive';
        classification.Delete_Reason__c = 'Old Inactive Contact';
        return classification;
    }

    // Rule 7: Check for duplicates
    const duplicateCheck = await findDuplicates(contact, allContacts);
    if (duplicateCheck.isDuplicate) {
        classification.Clean_Status__c = 'Duplicate';
        classification.Delete_Reason__c = `Master: ${duplicateCheck.masterId}`;

        // Track duplicate sets
        if (duplicateCheck.masterId) {
            if (!duplicateSets.has(duplicateCheck.masterId)) {
                duplicateSets.set(duplicateCheck.masterId, new Set());
            }
            duplicateSets.get(duplicateCheck.masterId).add(contact.Id);
        }

        return classification;
    }

    // Rule 8: Missing critical information
    if (!contact.LastName || (!contact.Email && !contact.Phone)) {
        classification.Clean_Status__c = 'Review';
        classification.Delete_Reason__c = 'Missing Critical Info';
        return classification;
    }

    // If none of the above rules apply, contact is OK
    return classification;
}

// Save batch updates to CSV
async function saveBatchUpdates(updates) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(OUTPUT_DIR, `contact-updates-${timestamp}.csv`);

    // Create CSV content
    const headers = ['Id', 'Clean_Status__c', 'Delete_Reason__c',
                     'In_HubSpot_Not_Inclusion_List__c', 'Sync_Status__c'];
    const rows = [headers.join(',')];

    for (const update of updates) {
        const row = headers.map(header => {
            const value = update[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        rows.push(row.join(','));
    }

    await fs.writeFile(filename, rows.join('\n'));
    console.log(`\nSaved ${updates.length} updates to ${path.basename(filename)}`);

    // Execute bulk update
    await executeBulkUpdate(filename);
}

// Execute bulk update with retry logic
async function executeBulkUpdate(csvFile, retryCount = 0) {
    try {
        console.log(`Executing bulk update from ${path.basename(csvFile)}...`);
        const command = `sf data upsert bulk --sobject Contact --file "${csvFile}" --external-id Id --target-org ${ORG_ALIAS} --wait 60`;
        const { stdout, stderr } = await execPromise(command, { maxBuffer: 50 * 1024 * 1024 });

        if (stderr && stderr.includes('Error')) {
            throw new Error(stderr);
        }

        console.log('Bulk update completed successfully');
    } catch (error) {
        if (retryCount < MAX_RETRIES) {
            console.log(`Bulk update failed, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * 2));
            return executeBulkUpdate(csvFile, retryCount + 1);
        } else {
            console.error('Bulk update error after retries:', error.message);
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
=== COMPLETE Contact Classification Summary ===

Total Processed: ${stats.processed}/${stats.total}
Total Errors: ${stats.errors.length}

Clean Status Distribution:
  OK: ${stats.cleanStatusCounts.OK} (${Math.round(stats.cleanStatusCounts.OK / stats.total * 100)}%)
  Duplicate: ${stats.cleanStatusCounts.Duplicate} (${Math.round(stats.cleanStatusCounts.Duplicate / stats.total * 100)}%)
  Delete: ${stats.cleanStatusCounts.Delete} (${Math.round(stats.cleanStatusCounts.Delete / stats.total * 100)}%)
  Archive: ${stats.cleanStatusCounts.Archive} (${Math.round(stats.cleanStatusCounts.Archive / stats.total * 100)}%)
  Review: ${stats.cleanStatusCounts.Review} (${Math.round(stats.cleanStatusCounts.Review / stats.total * 100)}%)
  Merge: ${stats.cleanStatusCounts.Merge} (${Math.round(stats.cleanStatusCounts.Merge / stats.total * 100)}%)

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
        report[master] = Array.from(duplicates);
    });

    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    console.log(`Saved duplicate report with ${duplicateSets.size} master records`);
}

// Main execution
async function main() {
    try {
        console.log('Starting COMPLETE contact classification process...\n');
        const startTime = Date.now();

        const stats = await processAllContacts();

        const duration = Math.round((Date.now() - startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;

        console.log(`\n\n✅ Contact classification completed successfully!`);
        console.log(`Processed: ${stats.processed} contacts`);
        console.log(`Errors: ${stats.errors.length}`);
        console.log(`Duration: ${minutes}m ${seconds}s`);
        console.log(`\nReports saved to: ${OUTPUT_DIR}`);

    } catch (error) {
        console.error('\n❌ Classification failed:', error);
        process.exit(1);
    }
}

// Run the script
main();