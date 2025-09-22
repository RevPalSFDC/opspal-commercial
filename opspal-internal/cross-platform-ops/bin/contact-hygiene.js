#!/usr/bin/env node

/**
 * Contact Hygiene CLI
 * Unified pipeline for Salesforce contact data quality operations
 */

// Install runtime mock guard FIRST
const RuntimeMockGuard = require('../../../scripts/lib/runtime-mock-guard.js');
const guard = new RuntimeMockGuard();
guard.install();

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const execPromise = util.promisify(exec);

// Import core library
const {
    scoreContact,
    buildDuplicateGraph,
    selectMaster,
    classifyContact,
    validatePicklistValues
} = require('../lib/contactHygiene');

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {};
let currentFlag = null;

args.forEach(arg => {
    if (arg.startsWith('--')) {
        currentFlag = arg.substring(2);
        flags[currentFlag] = true;
    } else if (currentFlag) {
        flags[currentFlag] = arg;
        currentFlag = null;
    }
});

// Configuration from environment and CLI
const config = {
    orgAlias: flags['org'] || process.env.ORG_ALIAS || 'rentable-production',
    mode: flags['mode'] || 'all', // all | unprocessed
    dryRun: flags['dry-run'] === true,
    batchSize: parseInt(flags['batch-size'] || process.env.BATCH_SIZE || '10000'),
    maxWaitSec: parseInt(flags['max-wait-sec'] || process.env.MAX_WAIT_SEC || '180'),
    outputDir: flags['output-dir'] || process.env.OUTPUT_DIR || './reports/contact-hygiene',
    queryLimit: parseInt(flags['query-limit'] || '2000'), // Per SOQL query
    verbose: flags['verbose'] === true
};

// Fields to query - only include fields that exist
const CONTACT_FIELDS = [
    'Id', 'FirstName', 'LastName', 'Email', 'Phone', 'MobilePhone',
    'AccountId', 'Title', 'Department', 'MailingCity', 'MailingState',
    'LeadSource', 'LastActivityDate', 'CreatedDate', 'LastModifiedDate',
    'Clean_Status__c', 'Delete_Reason__c', 'Sync_Status__c',
    'In_HubSpot_Not_Inclusion_List__c'
    // Removed fields that don't exist:
    // 'HasOptedOutOfEmail', 'EmailBouncedReason'
    // 'Is_Duplicate__c', 'Master_Contact_Id__c', 'Duplicate_Type__c', 'HubSpot_Contact_ID__c'
];

// Update fields (ones we write to) - only include fields that exist
const UPDATE_FIELDS = [
    'Clean_Status__c', 'Delete_Reason__c', 'Sync_Status__c'
    // Fields to add later when created:
    // 'Is_Duplicate__c', 'Master_Contact_Id__c', 'Duplicate_Type__c'
];

// Statistics tracking
const stats = {
    startTime: new Date(),
    totalContacts: 0,
    processedContacts: 0,
    skippedContacts: 0,
    classificationCounts: {},
    deleteReasons: {},
    duplicateComponents: [],
    batchResults: [],
    errors: []
};

/**
 * Display usage information
 */
function showUsage() {
    console.log(`
Contact Hygiene Pipeline
Usage: node bin/contact-hygiene.js [options]

Options:
  --mode <all|unprocessed>   Process all contacts or only unprocessed (default: all)
  --dry-run                  Generate outputs without making changes
  --batch-size <number>      Batch size for bulk operations (default: 10000)
  --max-wait-sec <number>    Max wait time for bulk jobs (default: 180)
  --output-dir <path>        Output directory for reports (default: ./reports/contact-hygiene)
  --org <alias>              Salesforce org alias (default: from env or rentable-production)
  --query-limit <number>     Records per SOQL query (default: 2000)
  --verbose                  Enable verbose logging
  --help                     Show this help message

Environment Variables:
  ORG_ALIAS                  Default Salesforce org alias
  BATCH_SIZE                 Default batch size
  MAX_WAIT_SEC               Default max wait seconds
  OUTPUT_DIR                 Default output directory

Examples:
  # Dry run on all contacts
  node bin/contact-hygiene.js --mode all --dry-run

  # Process only unprocessed contacts
  node bin/contact-hygiene.js --mode unprocessed --batch-size 5000

  # Full production run
  node bin/contact-hygiene.js --mode all --max-wait-sec 300
`);
}

/**
 * Ensure output directory exists
 */
async function ensureOutputDir() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    config.runDir = path.join(config.outputDir, `run-${timestamp}`);
    await fs.mkdir(config.runDir, { recursive: true });
    console.log(`Output directory: ${config.runDir}`);
}

/**
 * Get picklist values for validation
 */
async function getPicklistValues() {
    console.log('Fetching picklist values...');
    try {
        const command = `sf sobject describe --sobject Contact --target-org ${config.orgAlias} --json`;
        const { stdout } = await execPromise(command, { maxBuffer: 50 * 1024 * 1024 });
        const result = JSON.parse(stdout);

        const picklistValues = {};

        if (result.status === 0) {
            result.result.fields.forEach(field => {
                if (field.type === 'picklist' && UPDATE_FIELDS.includes(field.name)) {
                    picklistValues[field.name] = field.picklistValues
                        .filter(v => v.active)
                        .map(v => v.value);
                }
            });
        }

        return picklistValues;
    } catch (error) {
        console.error('Failed to fetch picklist values:', error.message);
        return {};
    }
}

/**
 * Export current state for rollback
 */
async function exportSnapshot() {
    console.log('Exporting current state for rollback...');
    const snapshotFile = path.join(config.runDir, 'snapshot-prechange.csv');

    const query = `SELECT Id, ${UPDATE_FIELDS.join(', ')} FROM Contact WHERE Clean_Status__c != null`;
    const command = `sf data query --query "${query}" --target-org ${config.orgAlias} --result-format csv`;

    try {
        const { stdout } = await execPromise(command, { maxBuffer: 50 * 1024 * 1024 });
        await fs.writeFile(snapshotFile, stdout);
        console.log(`Snapshot saved to: ${snapshotFile}`);
    } catch (error) {
        console.error('Failed to export snapshot:', error.message);
    }
}

/**
 * Query contacts in batches
 */
async function* queryContacts() {
    let offset = 0;
    let hasMore = true;

    const whereClause = config.mode === 'unprocessed'
        ? "WHERE (Clean_Status__c = null OR Clean_Status__c = '')"
        : '';

    while (hasMore) {
        const query = `SELECT ${CONTACT_FIELDS.join(', ')} FROM Contact ${whereClause} ORDER BY Id LIMIT ${config.queryLimit} OFFSET ${offset}`;

        if (config.verbose) {
            console.log(`Querying contacts: offset=${offset}, limit=${config.queryLimit}`);
        }

        try {
            const command = `sf data query --query "${query}" --target-org ${config.orgAlias} --json`;
            const { stdout } = await execPromise(command, { maxBuffer: 50 * 1024 * 1024 });
            const result = JSON.parse(stdout);

            if (result.status === 0 && result.result.records.length > 0) {
                yield result.result.records;
                offset += result.result.records.length;
                hasMore = result.result.records.length === config.queryLimit;
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error(`Query failed at offset ${offset}:`, error.message);
            hasMore = false;
        }
    }
}

/**
 * Process contacts and apply classifications
 */
async function processContacts() {
    const allContacts = [];
    const contactMap = new Map();

    // Load all contacts
    console.log('Loading contacts...');
    for await (const batch of queryContacts()) {
        batch.forEach(contact => {
            allContacts.push(contact);
            contactMap.set(contact.Id, contact);
        });
        stats.totalContacts += batch.length;
        process.stdout.write(`\rLoaded: ${stats.totalContacts} contacts`);
    }
    console.log(`\nTotal contacts loaded: ${stats.totalContacts}`);

    // Build duplicate graph
    console.log('\nBuilding duplicate graph...');
    const components = buildDuplicateGraph(allContacts);
    console.log(`Found ${components.length} duplicate components`);

    // Create duplicate mapping
    const duplicateMap = new Map();
    components.forEach(component => {
        const master = selectMaster(component.nodes, contactMap);
        component.nodes.forEach(nodeId => {
            if (nodeId !== master) {
                duplicateMap.set(nodeId, {
                    masterId: master,
                    edgeTypes: component.edgeTypes
                });
            }
        });

        // Track statistics
        if (component.nodes.length <= 10) {
            stats.duplicateComponents.push({
                size: component.nodes.length,
                master,
                edgeTypes: Array.from(component.edgeTypes),
                sample: component.nodes.slice(0, 3)
            });
        }
    });

    // Classify contacts
    console.log('\nClassifying contacts...');
    const updates = [];
    const context = { duplicateMap };

    for (const contact of allContacts) {
        const classification = classifyContact(contact, context);

        if (classification) {
            updates.push(classification);
            stats.processedContacts++;

            // Track statistics
            const status = classification.Clean_Status__c || 'OK';
            stats.classificationCounts[status] = (stats.classificationCounts[status] || 0) + 1;

            if (classification.Delete_Reason__c) {
                const reason = classification.Delete_Reason__c.startsWith('Master:')
                    ? 'Duplicate'
                    : classification.Delete_Reason__c;
                stats.deleteReasons[reason] = (stats.deleteReasons[reason] || 0) + 1;
            }
        } else {
            stats.skippedContacts++;
        }

        if ((stats.processedContacts + stats.skippedContacts) % 1000 === 0) {
            process.stdout.write(`\rProcessed: ${stats.processedContacts + stats.skippedContacts}/${stats.totalContacts}`);
        }
    }

    console.log(`\nClassification complete: ${stats.processedContacts} processed, ${stats.skippedContacts} skipped`);

    return updates;
}

/**
 * Save updates using Bulk API
 */
async function saveUpdates(updates, picklistValues) {
    if (updates.length === 0) {
        console.log('No updates to save');
        return;
    }

    console.log(`\nSaving ${updates.length} updates in batches of ${config.batchSize}...`);

    // Validate picklist values
    const validatedUpdates = updates.map(update =>
        validatePicklistValues(update, picklistValues)
    );

    // Split into batches
    const batches = [];
    for (let i = 0; i < validatedUpdates.length; i += config.batchSize) {
        batches.push(validatedUpdates.slice(i, i + config.batchSize));
    }

    console.log(`Created ${batches.length} batches`);

    // Process each batch
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchNum = i + 1;
        console.log(`\nProcessing batch ${batchNum}/${batches.length} (${batch.length} records)...`);

        const csvFile = path.join(config.runDir, `batch-${batchNum}${config.dryRun ? '-DRYRUN' : ''}.csv`);

        // Generate CSV
        const csv = stringify(batch, {
            header: true,
            columns: ['Id', ...UPDATE_FIELDS.filter(f => f !== 'Id')]
        });

        await fs.writeFile(csvFile, csv);

        if (!config.dryRun) {
            try {
                const command = `sf data upsert bulk --sobject Contact --file "${csvFile}" --external-id Id --target-org ${config.orgAlias} --wait ${config.maxWaitSec} --json`;
                const { stdout } = await execPromise(command, { maxBuffer: 50 * 1024 * 1024 });
                const result = JSON.parse(stdout);

                const batchResult = {
                    batch: batchNum,
                    totalRecords: batch.length,
                    successCount: 0,
                    failureCount: 0
                };

                if (result.status === 0 && result.result) {
                    batchResult.successCount = result.result.successfulResults?.length || 0;
                    batchResult.failureCount = result.result.failedResults?.length || 0;

                    // Handle failures
                    if (batchResult.failureCount > 0 && result.result.failedResults) {
                        const failureFile = path.join(config.runDir, `batch-${batchNum}-failures.csv`);
                        const failures = result.result.failedResults.map(f => ({
                            Id: f.Id,
                            Error: f.Error
                        }));
                        const failureCsv = stringify(failures, { header: true });
                        await fs.writeFile(failureFile, failureCsv);
                        console.log(`  Failures saved to: ${failureFile}`);

                        // Create rerun file with fixes
                        const rerunFile = path.join(config.runDir, `batch-${batchNum}-rerun.csv`);
                        const rerunRecords = result.result.failedResults.map(f => {
                            const original = batch.find(r => r.Id === f.Id);
                            // Apply automatic fixes (e.g., default picklist values)
                            if (f.Error?.includes('picklist')) {
                                original.Clean_Status__c = 'Review';
                            }
                            return original;
                        });
                        const rerunCsv = stringify(rerunRecords, {
                            header: true,
                            columns: ['Id', ...UPDATE_FIELDS.filter(f => f !== 'Id')]
                        });
                        await fs.writeFile(rerunFile, rerunCsv);
                        console.log(`  Rerun file saved to: ${rerunFile}`);
                    }
                }

                stats.batchResults.push(batchResult);
                console.log(`  Success: ${batchResult.successCount}, Failures: ${batchResult.failureCount}`);
            } catch (error) {
                console.error(`  Batch ${batchNum} failed:`, error.message);
                stats.errors.push({
                    batch: batchNum,
                    error: error.message
                });
            }
        } else {
            console.log(`  [DRY RUN] CSV saved to: ${csvFile}`);
        }
    }
}

/**
 * Generate summary reports
 */
async function generateSummary() {
    console.log('\nGenerating summary reports...');

    const summary = {
        runConfiguration: config,
        executionTime: new Date() - stats.startTime,
        totalContacts: stats.totalContacts,
        processedContacts: stats.processedContacts,
        skippedContacts: stats.skippedContacts,
        classificationBreakdown: stats.classificationCounts,
        deleteReasons: stats.deleteReasons,
        duplicateStatistics: {
            totalComponents: stats.duplicateComponents.length,
            totalDuplicates: stats.duplicateComponents.reduce((sum, c) => sum + c.size - 1, 0),
            sampleComponents: stats.duplicateComponents.slice(0, 3)
        },
        batchResults: stats.batchResults,
        errors: stats.errors
    };

    // Save JSON summary
    const jsonFile = path.join(config.runDir, `summary${config.dryRun ? '-DRYRUN' : ''}.json`);
    await fs.writeFile(jsonFile, JSON.stringify(summary, null, 2));

    // Generate human-readable summary
    const textSummary = `
Contact Hygiene Pipeline - Execution Summary
============================================
Run Mode: ${config.mode} | Dry Run: ${config.dryRun}
Execution Time: ${Math.round(summary.executionTime / 1000)}s
Total Contacts: ${summary.totalContacts}
Processed: ${summary.processedContacts}
Skipped: ${summary.skippedContacts}

Classification Breakdown:
${Object.entries(summary.classificationBreakdown)
    .map(([status, count]) => `  ${status}: ${count}`)
    .join('\n')}

Delete Reasons:
${Object.entries(summary.deleteReasons)
    .map(([reason, count]) => `  ${reason}: ${count}`)
    .join('\n')}

Duplicate Detection:
  Total Components: ${summary.duplicateStatistics.totalComponents}
  Total Duplicates: ${summary.duplicateStatistics.totalDuplicates}

${config.dryRun ? '\n[DRY RUN MODE - No changes were made to Salesforce]' : ''}
`;

    const textFile = path.join(config.runDir, `summary${config.dryRun ? '-DRYRUN' : ''}.txt`);
    await fs.writeFile(textFile, textSummary);

    console.log(textSummary);
    console.log(`\nReports saved to: ${config.runDir}`);
}

/**
 * Main execution
 */
async function main() {
    console.log('====================================');
    console.log('Contact Hygiene Pipeline v1.0');
    console.log('====================================\n');

    // Show help if requested
    if (flags['help']) {
        showUsage();
        process.exit(0);
    }

    // Display configuration
    console.log('Configuration:');
    console.log(`  Org: ${config.orgAlias}`);
    console.log(`  Mode: ${config.mode}`);
    console.log(`  Dry Run: ${config.dryRun}`);
    console.log(`  Batch Size: ${config.batchSize}`);
    console.log(`  Max Wait: ${config.maxWaitSec}s`);
    console.log('');

    try {
        // Setup
        await ensureOutputDir();

        // Export snapshot for rollback (if not dry-run)
        if (!config.dryRun) {
            await exportSnapshot();
        }

        // Get picklist values for validation
        const picklistValues = await getPicklistValues();

        // Process contacts
        const updates = await processContacts();

        // Save updates
        await saveUpdates(updates, picklistValues);

        // Generate summary
        await generateSummary();

        console.log('\n✅ Contact hygiene pipeline completed successfully!');

        if (!config.dryRun && stats.errors.length > 0) {
            console.log(`\n⚠️  Warning: ${stats.errors.length} batches had errors. Check failure files for details.`);
        }
    } catch (error) {
        console.error('\n❌ Pipeline failed:', error);
        process.exit(1);
    }
}

// Run the pipeline
main();