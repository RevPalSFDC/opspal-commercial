#!/usr/bin/env node
/**
 * Bulk Process All Contacts from CSV Export
 * Uses the unified contact hygiene library to process pre-exported contacts
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const { execSync } = require('child_process');
const {
    scoreContact,
    buildDuplicateGraph,
    selectMaster,
    classifyContact,
    validatePicklistValues
} = require('../lib/contactHygiene');

// Configuration
const INPUT_FILE = path.join(__dirname, '../reports/all-contacts.csv');
const OUTPUT_DIR = path.join(__dirname, `../reports/contact-hygiene/bulk-run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const BATCH_SIZE = 10000;
const ORG_ALIAS = 'rentable-production';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Statistics
let stats = {
    total: 0,
    processed: 0,
    skipped: 0,
    classifications: {},
    deleteReasons: {},
    duplicateComponents: 0,
    batchesProcessed: 0,
    startTime: Date.now()
};

// Fetch picklist values from Salesforce
function fetchPicklistValues() {
    console.log('Fetching picklist values from Salesforce...');
    try {
        const result = execSync(
            `sf sobject describe --sobject Contact --target-org ${ORG_ALIAS} --json`,
            { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
        );

        const metadata = JSON.parse(result);
        const picklistValues = {};

        metadata.result.fields.forEach(field => {
            if (field.type === 'picklist' && ['Clean_Status__c', 'Sync_Status__c'].includes(field.name)) {
                picklistValues[field.name] = field.picklistValues
                    .filter(pv => pv.active)
                    .map(pv => pv.value);
                console.log(`  ${field.name}: ${picklistValues[field.name].join(', ')}`);
            }
        });

        return picklistValues;
    } catch (error) {
        console.error('Error fetching picklist values:', error.message);
        // Return defaults if fetch fails
        return {
            Clean_Status__c: ['OK', 'Delete', 'Archive', 'Duplicate', 'Review'],
            Sync_Status__c: ['Synced', 'Not Synced', 'Error', 'Pending']
        };
    }
}

// Process contacts in batches
async function processContacts() {
    console.log('====================================');
    console.log('Bulk Contact Processing Pipeline');
    console.log('====================================');
    console.log(`Input file: ${INPUT_FILE}`);
    console.log(`Output directory: ${OUTPUT_DIR}`);
    console.log(`Batch size: ${BATCH_SIZE}`);
    console.log();

    // Check if input file exists
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`Error: Input file not found: ${INPUT_FILE}`);
        process.exit(1);
    }

    // Get picklist values
    const picklistValues = fetchPicklistValues();

    // Read and parse CSV
    console.log('Loading contacts from CSV...');
    const contacts = [];
    const contactMap = new Map();

    return new Promise((resolve, reject) => {
        const parser = fs.createReadStream(INPUT_FILE)
            .pipe(parse({
                columns: true,
                skip_empty_lines: true
            }));

        parser.on('data', (row) => {
            // Skip header row if it exists
            if (row.Id && row.Id !== 'Id') {
                contacts.push(row);
                contactMap.set(row.Id, row);
                stats.total++;

                if (stats.total % 10000 === 0) {
                    process.stdout.write(`\rLoaded: ${stats.total} contacts`);
                }
            }
        });

        parser.on('end', async () => {
            console.log(`\nTotal contacts loaded: ${stats.total}`);

            // Build duplicate graph
            console.log('\nBuilding duplicate graph...');
            const components = buildDuplicateGraph(contacts);
            stats.duplicateComponents = components.length;
            console.log(`Found ${components.length} duplicate components`);

            // Build duplicate map for classification context
            const duplicateMap = new Map();
            components.forEach(component => {
                const masterIds = component.nodes.map(id => id);
                const masterId = selectMaster(masterIds, contactMap);

                component.nodes.forEach(id => {
                    if (id !== masterId) {
                        duplicateMap.set(id, {
                            masterId,
                            edgeTypes: component.edgeTypes
                        });
                    }
                });
            });

            // Process contacts and collect updates
            console.log('\nClassifying contacts...');
            const updates = [];
            let processedCount = 0;

            for (const contact of contacts) {
                const classification = classifyContact(contact, { duplicateMap });

                if (classification) {
                    // Validate picklist values
                    const validated = validatePicklistValues(classification, picklistValues);
                    updates.push(validated);
                    stats.processed++;

                    // Track statistics
                    const status = validated.Clean_Status__c;
                    stats.classifications[status] = (stats.classifications[status] || 0) + 1;

                    if (validated.Delete_Reason__c) {
                        const reason = validated.Delete_Reason__c;
                        stats.deleteReasons[reason] = (stats.deleteReasons[reason] || 0) + 1;
                    }
                } else {
                    stats.skipped++;
                }

                processedCount++;
                if (processedCount % 10000 === 0) {
                    process.stdout.write(`\rProcessed: ${processedCount}/${stats.total}`);
                }
            }

            console.log(`\nClassification complete: ${stats.processed} processed, ${stats.skipped} skipped`);

            // Save updates in batches
            if (updates.length > 0) {
                console.log(`\nSaving ${updates.length} updates in batches...`);

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

                    console.log(`  Batch ${batchNum}: ${batch.length} records saved to ${batchFile}`);
                    stats.batchesProcessed++;

                    // Upload batch using Bulk API
                    console.log(`  Uploading batch ${batchNum} to Salesforce...`);
                    try {
                        const uploadResult = execSync(
                            `sf data upsert bulk --sobject Contact --file "${batchFile}" --external-id Id --target-org ${ORG_ALIAS} --wait 180 --json`,
                            { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
                        );

                        const result = JSON.parse(uploadResult);
                        if (result.status === 0 && result.result) {
                            const jobResult = result.result;
                            console.log(`    ✓ Batch ${batchNum} uploaded: ${jobResult.numberRecordsProcessed} processed, ${jobResult.numberRecordsFailed} failed`);

                            // Save failures if any
                            if (jobResult.numberRecordsFailed > 0) {
                                const failureFile = path.join(OUTPUT_DIR, `batch-${batchNum}-failures.csv`);
                                console.log(`    ⚠ Failed records saved to: ${failureFile}`);
                            }
                        } else {
                            console.log(`    ✗ Batch ${batchNum} upload failed:`, result.message || 'Unknown error');
                        }
                    } catch (uploadError) {
                        console.error(`    ✗ Batch ${batchNum} upload error:`, uploadError.message);
                        // Continue with next batch
                    }
                }
            }

            // Generate summary
            generateSummary();
            resolve();
        });

        parser.on('error', reject);
    });
}

// Generate summary report
function generateSummary() {
    const executionTime = Math.round((Date.now() - stats.startTime) / 1000);

    // Text summary
    const summaryText = `
Contact Hygiene Bulk Processing - Execution Summary
====================================================
Input File: ${INPUT_FILE}
Execution Time: ${executionTime}s
Total Contacts: ${stats.total}
Processed: ${stats.processed}
Skipped: ${stats.skipped}
Batches Uploaded: ${stats.batchesProcessed}

Classification Breakdown:
${Object.entries(stats.classifications).map(([status, count]) => `  ${status}: ${count}`).join('\n')}

Top Delete Reasons:
${Object.entries(stats.deleteReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => `  ${count}: ${reason}`)
    .join('\n')}

Duplicate Detection:
  Total Components: ${stats.duplicateComponents}
`;

    // Save text summary
    const summaryFile = path.join(OUTPUT_DIR, 'summary.txt');
    fs.writeFileSync(summaryFile, summaryText);
    console.log(summaryText);

    // Save JSON summary
    const jsonFile = path.join(OUTPUT_DIR, 'summary.json');
    fs.writeFileSync(jsonFile, JSON.stringify(stats, null, 2));

    console.log(`\nReports saved to: ${OUTPUT_DIR}`);
    console.log('\n✅ Bulk contact processing completed successfully!');
}

// Main execution
processContacts().catch(error => {
    console.error('\n❌ Error during processing:', error);
    process.exit(1);
});