#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const execPromise = util.promisify(exec);

// Configuration
const ORG_ALIAS = 'rentable-production';
const BATCH_SIZE = 500; // Smaller batch size for better reliability
const OUTPUT_DIR = path.join(__dirname, '..', 'reports', 'contact-classification-v2');
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

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
        const { stdout } = await execPromise(command, { maxBuffer: 50 * 1024 * 1024 });
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
async function findDuplicates(contact) {
    if (!contact.Email && !contact.Phone) {
        return { isDuplicate: false, candidates: [] };
    }

    // Build duplicate query
    const conditions = [];
    if (contact.Email) {
        conditions.push(`Email = '${contact.Email.replace(/'/g, "\\'")}'`);
    }
    if (contact.Phone) {
        conditions.push(`Phone = '${contact.Phone.replace(/'/g, "\\'")}'`);
    }
    if (contact.MobilePhone && contact.MobilePhone !== contact.Phone) {
        conditions.push(`MobilePhone = '${contact.MobilePhone.replace(/'/g, "\\'")}'`);
    }

    if (conditions.length === 0) return { isDuplicate: false, candidates: [] };

    const query = `SELECT Id, FirstName, LastName, Email, Phone, CreatedDate, LastModifiedDate, AccountId
                   FROM Contact
                   WHERE (${conditions.join(' OR ')})
                   AND Id != '${contact.Id}'
                   LIMIT 10`;

    const duplicates = await querySalesforce(query);

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

// Calculate contact quality score
function calculateContactScore(contact) {
    let score = 0;
    if (contact.Email) score += 3;
    if (contact.Phone) score += 2;
    if (contact.MobilePhone) score += 1;
    if (contact.FirstName) score += 1;
    if (contact.LastName) score += 2;
    if (contact.AccountId) score += 3;
    if (contact.Title) score += 1;
    if (contact.Department) score += 1;
    if (contact.MailingCity) score += 1;
    if (contact.MailingState) score += 1;
    return score;
}

// Process contacts in batches
async function processContacts() {
    console.log('Starting enhanced contact classification process...');

    const stats = {
        total: 0,
        processed: 0,
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
        },
        errors: []
    };

    // Get total count
    const countQuery = "SELECT COUNT(Id) total FROM Contact WHERE Clean_Status__c = null OR Clean_Status__c = ''";
    const countResult = await querySalesforce(countQuery);
    stats.total = countResult[0]?.total || countResult[0]?.expr0 || 0;

    if (stats.total === 0) {
        console.log('No unprocessed contacts found. Checking for all contacts...');
        const allCountQuery = "SELECT COUNT(Id) total FROM Contact";
        const allCountResult = await querySalesforce(allCountQuery);
        stats.total = allCountResult[0]?.total || allCountResult[0]?.expr0 || 0;
    }

    console.log(`Total contacts to process: ${stats.total}`);

    // Process in batches
    let offset = 0;
    const updates = [];
    const duplicateSets = new Map();

    while (offset < stats.total) {
        console.log(`\nProcessing batch: ${offset} - ${offset + BATCH_SIZE}`);

        const query = `SELECT Id, FirstName, LastName, Email, Phone, MobilePhone, AccountId, Title, Department, MailingCity, MailingState, LeadSource, LastActivityDate, CreatedDate, LastModifiedDate, Clean_Status__c, Delete_Reason__c, Sync_Status__c, In_HubSpot_Not_Inclusion_List__c FROM Contact WHERE Clean_Status__c = null OR Clean_Status__c = '' ORDER BY Id LIMIT ${BATCH_SIZE} OFFSET ${offset}`;

        const contacts = await querySalesforce(query);

        if (contacts.length === 0) {
            console.log('No more unprocessed contacts found.');
            break;
        }

        for (const contact of contacts) {
            try {
                const classification = await classifyContact(contact, duplicateSets);

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
                    process.stdout.write(`\rProcessed: ${stats.processed} contacts`);
                }

            } catch (error) {
                console.error(`\nError processing contact ${contact.Id}:`, error.message);
                stats.errors.push({ contactId: contact.Id, error: error.message });
            }
        }

        // Save batch updates
        if (updates.length >= 200) {
            await saveBatchUpdates(updates.splice(0, 200));
        }

        offset += BATCH_SIZE;

        // Progress update
        const progress = Math.round((stats.processed / stats.total) * 100);
        console.log(`\nProgress: ${progress}% (${stats.processed}/${stats.total})`);
    }

    // Save remaining updates
    if (updates.length > 0) {
        await saveBatchUpdates(updates);
    }

    // Calculate duplicate sets
    stats.duplicateStats.duplicateSets = duplicateSets.size;

    // Save statistics
    await saveStatistics(stats);

    return stats;
}

// Enhanced classification with activity-based rules and duplicate detection
async function classifyContact(contact, duplicateSets) {
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
        classification.Delete_Reason__c = 'Old Record - Low Activity';
        return classification;
    }

    // Rule 7: Check for duplicates
    const duplicateCheck = await findDuplicates(contact);
    if (duplicateCheck.isDuplicate) {
        classification.Clean_Status__c = 'Duplicate';
        classification.Delete_Reason__c = `Master: ${duplicateCheck.masterId}`;

        // Store merge candidates in Description field (temporary solution)
        if (duplicateCheck.candidates && duplicateCheck.candidates.length > 0) {
            const mergeInfo = {
                masterId: duplicateCheck.masterId,
                mergeWith: duplicateCheck.candidates
            };
            classification.Description = `MERGE_INFO: ${JSON.stringify(mergeInfo)}`;
        }

        // Track duplicate set
        duplicateSets.set(duplicateCheck.masterId, duplicateCheck.candidates);
        return classification;
    }

    // Rule 8: Missing critical information
    const missingCritical = [];
    if (!contact.Email) missingCritical.push('Email');
    if (!contact.Phone && !contact.MobilePhone) missingCritical.push('Phone');
    if (!contact.LastName) missingCritical.push('LastName');
    if (!contact.AccountId) missingCritical.push('Account');

    if (missingCritical.length >= 2) {
        classification.Clean_Status__c = 'Review';
        classification.Delete_Reason__c = `Missing: ${missingCritical.join(', ')}`;
        return classification;
    }

    // Rule 9: Bounced emails or other indicators
    const description = (contact.Description || '').toLowerCase();
    if (description.includes('bounce') || description.includes('invalid email') ||
        description.includes('unsubscribe')) {
        classification.Clean_Status__c = 'Review';
        classification.Delete_Reason__c = 'Email Issues';
        return classification;
    }

    return classification;
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
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        rows.push(row.join(','));
    }

    await fs.writeFile(filename, rows.join('\n'));
    console.log(`\nSaved ${updates.length} updates to ${filename}`);

    // Execute bulk update with retry
    await executeBulkUpdate(filename);
}

// Execute bulk update using Salesforce CLI with retry
async function executeBulkUpdate(csvFile, retryCount = 0) {
    try {
        console.log(`Executing bulk update from ${path.basename(csvFile)}...`);
        const command = `sf data upsert bulk --sobject Contact --file "${csvFile}" --external-id Id --target-org ${ORG_ALIAS} --wait 30`;
        const { stdout } = await execPromise(command, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: 60000 // 60 second timeout
        });
        console.log('Bulk update completed successfully');
        return true;
    } catch (error) {
        if (retryCount < MAX_RETRIES) {
            console.log(`Bulk update failed, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return executeBulkUpdate(csvFile, retryCount + 1);
        }
        console.error('Bulk update error after retries:', error.message);
        return false;
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

    // Generate summary report
    const summaryFile = path.join(OUTPUT_DIR, 'classification-summary.txt');
    const summary = generateSummaryReport(stats);
    await fs.writeFile(summaryFile, summary);

    console.log(`\n${'='.repeat(60)}`);
    console.log(summary);
    console.log(`\nReports saved to: ${OUTPUT_DIR}`);
}

// Generate text summary report
function generateSummaryReport(stats) {
    let summary = '=== Contact Classification Summary ===\n\n';
    summary += `Total Processed: ${stats.processed}\n`;
    summary += `Total Errors: ${stats.errors.length}\n\n`;

    summary += 'Clean Status Distribution:\n';
    Object.entries(stats.cleanStatusCounts).forEach(([status, count]) => {
        const percentage = stats.processed > 0 ? ((count / stats.processed) * 100).toFixed(2) : 0;
        summary += `  ${status}: ${count} (${percentage}%)\n`;
    });

    summary += '\nDelete Reasons:\n';
    Object.entries(stats.deleteReasons).forEach(([reason, count]) => {
        summary += `  ${reason}: ${count}\n`;
    });

    summary += '\nDuplicate Statistics:\n';
    summary += `  Total Duplicates: ${stats.duplicateStats.totalDuplicates}\n`;
    summary += `  Duplicate Sets: ${stats.duplicateStats.duplicateSets}\n`;

    if (stats.recommendations && stats.recommendations.length > 0) {
        summary += '\nRecommendations:\n';
        stats.recommendations.forEach(rec => {
            summary += `  • ${rec}\n`;
        });
    }

    return summary;
}

// Generate recommendations based on statistics
function generateRecommendations(stats) {
    const recommendations = [];
    const deleteCount = stats.cleanStatusCounts.Delete || 0;
    const duplicateCount = stats.cleanStatusCounts.Duplicate || 0;
    const reviewCount = stats.cleanStatusCounts.Review || 0;

    if (deleteCount > 1000) {
        recommendations.push(`${deleteCount} contacts marked for deletion - consider archiving for audit trail`);
    }

    if (duplicateCount > 100) {
        recommendations.push(`${duplicateCount} duplicates found - run merge process to consolidate`);
    }

    if (reviewCount > 500) {
        recommendations.push(`${reviewCount} contacts need manual review - prioritize by account value`);
    }

    if (stats.deleteReasons['No Activity 3+ Years'] > 1000) {
        recommendations.push('High number of inactive contacts - consider re-engagement campaign before deletion');
    }

    if (stats.deleteReasons['Inactive 3+ Years'] > 1000) {
        recommendations.push('Many long-inactive contacts - review activity tracking configuration');
    }

    recommendations.push('Run duplicate merge process for identified duplicate sets');
    recommendations.push('Export and archive records marked for deletion before removing');
    recommendations.push('Review contacts missing critical fields for data enrichment');

    return recommendations;
}

// Main execution
async function main() {
    try {
        await ensureOutputDir();

        console.log('Enhanced Contact Classification v2.0');
        console.log('Features:');
        console.log('  • Retry logic for resilient processing');
        console.log('  • Activity-based deletion rules');
        console.log('  • Duplicate detection with master record identification');
        console.log('  • Improved error handling and reporting');
        console.log('');

        const stats = await processContacts();

        console.log('\n✅ Contact classification completed successfully!');
        console.log(`Processed: ${stats.processed} contacts`);
        console.log(`Errors: ${stats.errors.length}`);

        if (stats.errors.length > 0) {
            const errorFile = path.join(OUTPUT_DIR, 'errors.json');
            await fs.writeFile(errorFile, JSON.stringify(stats.errors, null, 2));
            console.log(`Error details saved to: ${errorFile}`);
        }

    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { classifyContact, processContacts, findDuplicates };