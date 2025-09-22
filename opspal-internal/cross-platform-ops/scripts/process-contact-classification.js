#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const execPromise = util.promisify(exec);

// Configuration
const ORG_ALIAS = 'rentable-production';
const BATCH_SIZE = 2000;
const OUTPUT_DIR = path.join(__dirname, '..', 'reports', 'contact-classification');

// Ensure output directory exists
async function ensureOutputDir() {
    try {
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating output directory:', error);
    }
}

// Query Salesforce
async function querySalesforce(query) {
    try {
        const command = `sf data query --query "${query}" --target-org ${ORG_ALIAS} --json`;
        const { stdout } = await execPromise(command, { maxBuffer: 50 * 1024 * 1024 }); // 50MB buffer
        const result = JSON.parse(stdout);
        return result.result.records;
    } catch (error) {
        console.error('Query error:', error.message);
        return [];
    }
}

// Process contacts in batches
async function processContacts() {
    console.log('Starting contact classification process...');

    const stats = {
        total: 0,
        processed: 0,
        cleanStatusCounts: {
            OK: 0,
            Merge: 0,
            Delete: 0,
            Archive: 0,
            Review: 0
        },
        deleteReasons: {},
        hubspotSync: {
            synced: 0,
            notSynced: 0,
            inHubSpotNotInclusion: 0
        }
    };

    // Get total count
    const countQuery = "SELECT COUNT(Id) total FROM Contact";
    const countResult = await querySalesforce(countQuery);
    stats.total = countResult[0]?.total || countResult[0]?.expr0 || 0;
    console.log(`Total contacts to process: ${stats.total}`);

    // Process in batches
    let offset = 0;
    const updates = [];

    while (offset < stats.total) {
        console.log(`Processing batch: ${offset} - ${offset + BATCH_SIZE}`);

        const query = `SELECT Id, FirstName, LastName, Email, Phone, MobilePhone, AccountId, Title, Department, MailingCity, MailingState, LeadSource, LastActivityDate, CreatedDate, LastModifiedDate, Clean_Status__c, Delete_Reason__c, Sync_Status__c, In_HubSpot_Not_Inclusion_List__c FROM Contact ORDER BY Id LIMIT ${BATCH_SIZE} OFFSET ${offset}`;

        const contacts = await querySalesforce(query);

        for (const contact of contacts) {
            const classification = classifyContact(contact);

            // Track statistics
            stats.cleanStatusCounts[classification.cleanStatus]++;
            if (classification.deleteReason) {
                stats.deleteReasons[classification.deleteReason] =
                    (stats.deleteReasons[classification.deleteReason] || 0) + 1;
            }
            if (classification.inHubSpotNotInclusion) {
                stats.hubspotSync.inHubSpotNotInclusion++;
            }

            // Prepare update record
            if (needsUpdate(contact, classification)) {
                updates.push({
                    Id: contact.Id,
                    ...classification
                });
            }

            stats.processed++;
        }

        // Save batch updates
        if (updates.length >= 1000) {
            await saveBatchUpdates(updates.splice(0, 1000));
        }

        offset += BATCH_SIZE;

        // Progress update
        const progress = Math.round((stats.processed / stats.total) * 100);
        console.log(`Progress: ${progress}% (${stats.processed}/${stats.total})`);
    }

    // Save remaining updates
    if (updates.length > 0) {
        await saveBatchUpdates(updates);
    }

    // Save statistics
    await saveStatistics(stats);

    return stats;
}

// Classify individual contact
function classifyContact(contact) {
    const classification = {
        Clean_Status__c: 'OK',
        Delete_Reason__c: null,
        In_HubSpot_Not_Inclusion_List__c: false,
        Sync_Status__c: 'Not Synced'
    };

    // Rule 1: No email and no phone = Delete
    if (!contact.Email && !contact.Phone && !contact.MobilePhone) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'No Email';
        return classification;
    }

    // Rule 2: Test/Placeholder names
    const name = `${contact.FirstName || ''} ${contact.LastName || ''}`.toLowerCase();
    if (name.includes('test') || name.includes('placeholder') ||
        name.includes('demo') || name.includes('dummy')) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'Test Record';
        return classification;
    }

    // Rule 3: Invalid/spam email patterns
    if (contact.Email) {
        const email = contact.Email.toLowerCase();
        if (email.includes('@test.') || email.includes('@example.') ||
            email.includes('noreply@') || email.includes('@spam.')) {
            classification.Clean_Status__c = 'Delete';
            classification.Delete_Reason__c = 'Invalid Data';
            return classification;
        }
    }

    // Rule 4: Inactive for 5+ years
    if (contact.LastActivityDate) {
        const lastActivity = new Date(contact.LastActivityDate);
        const fiveYearsAgo = new Date();
        fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

        if (lastActivity < fiveYearsAgo) {
            classification.Clean_Status__c = 'Archive';
            classification.Delete_Reason__c = 'Inactive 5+ Years';
            return classification;
        }
    }

    // Rule 5: Missing critical data = Review
    if (!contact.Email || (!contact.Phone && !contact.MobilePhone) ||
        !contact.AccountId || !contact.LastName) {
        classification.Clean_Status__c = 'Review';
        return classification;
    }

    // Rule 6: For future duplicate detection
    // Will be implemented in separate duplicate detection pass

    return classification;
}

// Check if contact needs update
function needsUpdate(contact, classification) {
    return contact.Clean_Status__c !== classification.Clean_Status__c ||
           contact.Delete_Reason__c !== classification.Delete_Reason__c ||
           contact.In_HubSpot_Not_Inclusion_List__c !== classification.In_HubSpot_Not_Inclusion_List__c;
}

// Save batch updates to CSV for bulk API
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
            if (typeof value === 'string' && value.includes(',')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        rows.push(row.join(','));
    }

    await fs.writeFile(filename, rows.join('\n'));
    console.log(`Saved ${updates.length} updates to ${filename}`);

    // Execute bulk update
    await executeBulkUpdate(filename);
}

// Execute bulk update using Salesforce CLI
async function executeBulkUpdate(csvFile) {
    try {
        console.log(`Executing bulk update from ${csvFile}...`);
        const command = `sf data upsert bulk --sobject Contact --file "${csvFile}" --external-id Id --target-org ${ORG_ALIAS} --wait 10`;
        const { stdout } = await execPromise(command, { maxBuffer: 10 * 1024 * 1024 }); // 10MB buffer
        console.log('Bulk update completed:', stdout);
    } catch (error) {
        console.error('Bulk update error:', error.message);
    }
}

// Save statistics report
async function saveStatistics(stats) {
    const reportFile = path.join(OUTPUT_DIR, 'classification-report.json');
    const report = {
        processedAt: new Date().toISOString(),
        ...stats,
        recommendations: generateRecommendations(stats)
    };

    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n=== Classification Report ===`);
    console.log(`Total Processed: ${stats.processed}`);
    console.log(`\nClean Status Distribution:`);
    Object.entries(stats.cleanStatusCounts).forEach(([status, count]) => {
        const percentage = ((count / stats.total) * 100).toFixed(2);
        console.log(`  ${status}: ${count} (${percentage}%)`);
    });
    console.log(`\nDelete Reasons:`);
    Object.entries(stats.deleteReasons).forEach(([reason, count]) => {
        console.log(`  ${reason}: ${count}`);
    });
    console.log(`\nReport saved to: ${reportFile}`);
}

// Generate recommendations based on statistics
function generateRecommendations(stats) {
    const recommendations = [];

    if (stats.cleanStatusCounts.Delete > 10000) {
        recommendations.push('Consider archiving instead of deleting for audit trail');
    }

    if (stats.cleanStatusCounts.Review > 5000) {
        recommendations.push('Manual review needed for incomplete records');
    }

    if (stats.deleteReasons['No Email'] > 20000) {
        recommendations.push('High number of contacts without email - data enrichment recommended');
    }

    return recommendations;
}

// Main execution
async function main() {
    try {
        await ensureOutputDir();
        const stats = await processContacts();
        console.log('\nContact classification completed successfully!');
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { classifyContact, processContacts };