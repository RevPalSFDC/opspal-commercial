#!/usr/bin/env node

/**
 * Bulk API 2.0 Example Workflows
 * Production-ready examples for common use cases
 */

const path = require('path');
const chalk = require('chalk');

// Import our Bulk API 2.0 components
const SalesforceBulkClient = require('../lib/salesforce-bulk-client');
const CsvSplitter = require('../lib/csv-splitter');
const JobOrchestrator = require('../lib/job-orchestrator');
const ResultReconciler = require('../lib/result-reconciler');
const SalesforceAuth = require('../lib/salesforce-auth');

/**
 * Example 1: Simple Contact Update
 * Update a small batch of contacts (< 10,000 records)
 */
async function simpleContactUpdate() {
    console.log(chalk.blue('\n📋 Example 1: Simple Contact Update\n'));

    const auth = new SalesforceAuth();
    const bulkClient = await auth.getBulkClient();

    // For small files, direct processing
    const csvData = `Id,Email,Clean_Status__c
003XX000000001,updated1@example.com,Verified
003XX000000002,updated2@example.com,Verified
003XX000000003,updated3@example.com,Verified`;

    try {
        const result = await bulkClient.executeBulkOperation(
            'Contact',
            'update',
            csvData
        );

        console.log(chalk.green('✅ Update complete:'));
        console.log(`  Job ID: ${result.jobId}`);
        console.log(`  Status: ${result.status}`);
        console.log(`  Success: ${result.results.successful.length}`);
        console.log(`  Failed: ${result.results.failed.length}`);

    } catch (error) {
        console.error(chalk.red(`❌ Update failed: ${error.message}`));
    }
}

/**
 * Example 2: Large Contact Import
 * Import 2M+ contacts with automatic splitting and concurrency
 */
async function largeContactImport() {
    console.log(chalk.blue('\n📋 Example 2: Large Contact Import (2M+ records)\n'));

    const auth = new SalesforceAuth();
    const bulkClient = await auth.getBulkClient();

    // Initialize components
    const splitter = new CsvSplitter({
        maxSizeMB: 100  // 100MB chunks
    });

    const orchestrator = new JobOrchestrator(bulkClient, {
        maxConcurrent: 10,  // Process 10 files simultaneously
        checkpointDir: './checkpoints'
    });

    const reconciler = new ResultReconciler({
        outputDir: './reports/reconciliation'
    });

    try {
        // Step 1: Analyze file
        const filePath = './data/contacts-2million.csv';
        const estimate = await splitter.estimateSplits(filePath);

        console.log(chalk.cyan(`File Analysis:
  Total Size: ${estimate.totalSizeMB}MB
  Total Rows: ${estimate.totalRows.toLocaleString()}
  Files Needed: ${estimate.estimatedFiles}`));

        // Step 2: Split if needed
        let filesToProcess = [filePath];
        if (estimate.estimatedFiles > 1) {
            console.log(chalk.yellow('Splitting file...'));
            filesToProcess = [];

            for await (const split of splitter.smartSplit(filePath)) {
                filesToProcess.push(split.filePath);
                console.log(`  Created: ${split.filePath} (${split.rows} rows)`);
            }
        }

        // Step 3: Process with orchestration
        console.log(chalk.yellow('\nProcessing files...'));
        const results = await orchestrator.processFiles(
            filesToProcess,
            'Contact',
            'insert',
            { compress: true }
        );

        // Step 4: Reconcile results
        const reconciliation = await reconciler.reconcileResults(results, []);

        console.log(chalk.green(`\n✅ Import Complete:
  Total Processed: ${results.summary.totalRecordsProcessed.toLocaleString()}
  Successful: ${results.summary.totalRecordsProcessed - results.summary.totalRecordsFailed}
  Failed: ${results.summary.totalRecordsFailed}
  Success Rate: ${reconciliation.successRate}%
  Duration: ${(results.summary.durationMs / 1000 / 60).toFixed(2)} minutes`));

        // Step 5: Handle failures
        if (reconciliation.failedRecords.length > 0) {
            console.log(chalk.yellow(`\n⚠️ ${reconciliation.failedRecords.length} records failed`));
            console.log('Dead letter queue: ./reports/reconciliation/dead_letter_*.csv');
        }

    } catch (error) {
        console.error(chalk.red(`❌ Import failed: ${error.message}`));
    }
}

/**
 * Example 3: Daily Data Hygiene Job
 * Clean and update contact data with error recovery
 */
async function dailyDataHygiene() {
    console.log(chalk.blue('\n📋 Example 3: Daily Data Hygiene Job\n'));

    const auth = new SalesforceAuth();

    // Check API limits first
    const limitCheck = await auth.checkBulkApiLimit();
    if (!limitCheck.canProceed) {
        console.error(chalk.red(`❌ Cannot proceed: ${limitCheck.error}`));
        return;
    }

    const bulkClient = await auth.getBulkClient();
    const orchestrator = new JobOrchestrator(bulkClient, {
        maxConcurrent: 5,  // Conservative for daily job
        saveCheckpoints: true
    });

    // Monitor progress
    orchestrator.on('jobStart', ({ jobId, activeJobs }) => {
        console.log(chalk.cyan(`  Starting job ${jobId} (${activeJobs} active)`));
    });

    orchestrator.on('jobComplete', ({ jobId, successful, failed, durationMs }) => {
        console.log(chalk.green(`  ✓ Job ${jobId}: ${successful} success, ${failed} failed (${(durationMs/1000).toFixed(1)}s)`));
    });

    orchestrator.on('jobFailed', ({ jobId, error }) => {
        console.log(chalk.red(`  ✗ Job ${jobId} failed: ${error}`));
    });

    try {
        const hygieneJobs = [
            {
                file: './data/contacts-to-clean.csv',
                object: 'Contact',
                operation: 'update',
                description: 'Clean status updates'
            },
            {
                file: './data/contacts-to-verify.csv',
                object: 'Contact',
                operation: 'update',
                description: 'Email verification'
            },
            {
                file: './data/contacts-to-enrich.csv',
                object: 'Contact',
                operation: 'update',
                description: 'Data enrichment'
            }
        ];

        console.log(chalk.yellow('Processing hygiene jobs...'));
        const results = await orchestrator.processJobs(hygieneJobs);

        console.log(chalk.green(`\n✅ Hygiene Complete:
  Jobs Run: ${hygieneJobs.length}
  Total Records: ${results.summary.totalRecordsProcessed.toLocaleString()}
  Success Rate: ${((1 - results.summary.totalRecordsFailed / results.summary.totalRecordsProcessed) * 100).toFixed(1)}%`));

    } catch (error) {
        console.error(chalk.red(`❌ Hygiene job failed: ${error.message}`));
    }
}

/**
 * Example 4: Migration with Checkpoints
 * Migrate data from legacy system with resume capability
 */
async function migrationWithCheckpoints() {
    console.log(chalk.blue('\n📋 Example 4: Migration with Resume Capability\n'));

    const auth = new SalesforceAuth();
    const bulkClient = await auth.getBulkClient();

    const orchestrator = new JobOrchestrator(bulkClient, {
        maxConcurrent: 10,
        checkpointDir: './migration-checkpoints',
        saveCheckpoints: true
    });

    // Check for existing checkpoints
    const checkpoints = await orchestrator.loadCheckpoints();
    if (checkpoints) {
        console.log(chalk.yellow('📌 Found existing checkpoint, resuming...'));
        console.log(`  Completed: ${checkpoints.processedFiles.length} files`);
        console.log(`  Remaining: ${checkpoints.remainingFiles.length} files`);
    }

    try {
        const migrationFiles = checkpoints?.remainingFiles || [
            './migration/accounts.csv',
            './migration/contacts.csv',
            './migration/opportunities.csv',
            './migration/cases.csv'
        ];

        const jobs = migrationFiles.map(file => ({
            file,
            object: path.basename(file, '.csv').charAt(0).toUpperCase() +
                    path.basename(file, '.csv').slice(1).slice(0, -1),  // Remove 's'
            operation: 'upsert',
            externalIdFieldName: 'Legacy_ID__c'
        }));

        console.log(chalk.yellow(`Processing ${jobs.length} migration files...`));

        const results = await orchestrator.processJobs(jobs);

        console.log(chalk.green(`\n✅ Migration Complete:
  Files Processed: ${results.summary.successfulFiles}
  Total Records: ${results.summary.totalRecordsProcessed.toLocaleString()}
  Duration: ${(results.summary.durationMs / 1000 / 60).toFixed(2)} minutes`));

        // Clear checkpoints after successful completion
        await orchestrator.clearCheckpoints();

    } catch (error) {
        console.error(chalk.red(`❌ Migration failed: ${error.message}`));
        console.log(chalk.yellow('💡 Run again to resume from checkpoint'));
    }
}

/**
 * Example 5: Error Recovery Workflow
 * Process failed records from previous job
 */
async function errorRecoveryWorkflow() {
    console.log(chalk.blue('\n📋 Example 5: Error Recovery Workflow\n'));

    const auth = new SalesforceAuth();
    const bulkClient = await auth.getBulkClient();
    const reconciler = new ResultReconciler();

    try {
        // Load dead letter queue from previous job
        const deadLetterFile = './reports/reconciliation/dead_letter_latest.csv';

        // Analyze error patterns
        const analysis = await reconciler.analyzeDeadLetterQueue(deadLetterFile);

        console.log(chalk.cyan('Error Analysis:'));
        Object.entries(analysis.errorCategories).forEach(([error, data]) => {
            console.log(`  ${error}: ${data.count} records`);
            if (data.examples && data.examples.length > 0) {
                console.log(`    Example: ${data.examples[0]}`);
            }
        });

        // Retry with fixes based on error type
        const retryStrategies = {
            'DUPLICATE_VALUE': {
                operation: 'update',  // Switch from insert to update
                externalId: 'Email'
            },
            'REQUIRED_FIELD_MISSING': {
                // Would need to enrich data first
                skip: true
            },
            'UNABLE_TO_LOCK_ROW': {
                operation: 'update',
                maxConcurrent: 1,  // Serialize to avoid locking
                retryDelay: 5000
            }
        };

        // Process each error category
        for (const [errorType, records] of Object.entries(analysis.byErrorType)) {
            const strategy = retryStrategies[errorType];

            if (strategy?.skip) {
                console.log(chalk.yellow(`⏭️  Skipping ${errorType} records (needs data fix)`));
                continue;
            }

            console.log(chalk.yellow(`\n🔄 Retrying ${records.length} ${errorType} records...`));

            const result = await bulkClient.executeBulkOperation(
                'Contact',
                strategy?.operation || 'update',
                records,
                strategy
            );

            console.log(chalk.green(`  Success: ${result.results.successful.length}`));
            console.log(chalk.red(`  Failed: ${result.results.failed.length}`));
        }

    } catch (error) {
        console.error(chalk.red(`❌ Recovery failed: ${error.message}`));
    }
}

/**
 * Example 6: Real-time Monitoring
 * Monitor bulk jobs with live updates
 */
async function realtimeMonitoring() {
    console.log(chalk.blue('\n📋 Example 6: Real-time Job Monitoring\n'));

    const auth = new SalesforceAuth();
    const bulkClient = await auth.getBulkClient();

    // Setup monitoring
    bulkClient.on('jobCreated', (job) => {
        console.log(chalk.cyan(`📝 Job created: ${job.id}`));
    });

    bulkClient.on('uploadProgress', ({ jobId, bytes, total }) => {
        const percent = ((bytes / total) * 100).toFixed(1);
        console.log(chalk.yellow(`⬆️  Upload progress: ${percent}% (${(bytes/1024/1024).toFixed(2)}MB)`));
    });

    bulkClient.on('statusChange', ({ jobId, oldStatus, newStatus }) => {
        console.log(chalk.blue(`🔄 Status change: ${oldStatus} → ${newStatus}`));
    });

    bulkClient.on('jobComplete', ({ jobId, numberBatchesTotal, numberRecordsProcessed }) => {
        console.log(chalk.green(`✅ Job complete: ${numberRecordsProcessed.toLocaleString()} records`));
    });

    bulkClient.on('jobFailed', ({ jobId, stateMessage }) => {
        console.log(chalk.red(`❌ Job failed: ${stateMessage}`));
    });

    try {
        // Start a monitored job
        const csvData = `Id,Clean_Status__c
003XX000000001,Monitored
003XX000000002,Monitored`;

        const result = await bulkClient.executeBulkOperation(
            'Contact',
            'update',
            csvData,
            { monitor: true }
        );

        console.log(chalk.green('\n✅ Monitoring complete'));

    } catch (error) {
        console.error(chalk.red(`❌ Monitoring failed: ${error.message}`));
    }
}

/**
 * Main menu
 */
async function main() {
    console.log(chalk.bold.cyan('\n🚀 Bulk API 2.0 Example Workflows\n'));

    const examples = [
        { name: 'Simple Contact Update', fn: simpleContactUpdate },
        { name: 'Large Contact Import (2M+)', fn: largeContactImport },
        { name: 'Daily Data Hygiene', fn: dailyDataHygiene },
        { name: 'Migration with Checkpoints', fn: migrationWithCheckpoints },
        { name: 'Error Recovery', fn: errorRecoveryWorkflow },
        { name: 'Real-time Monitoring', fn: realtimeMonitoring }
    ];

    // Check command line arguments
    const exampleIndex = process.argv[2] ? parseInt(process.argv[2]) - 1 : null;

    if (exampleIndex !== null && examples[exampleIndex]) {
        await examples[exampleIndex].fn();
    } else {
        console.log('Available examples:');
        examples.forEach((ex, i) => {
            console.log(`  ${i + 1}. ${ex.name}`);
        });
        console.log(chalk.yellow('\nUsage: node examples/bulk-api-workflows.js [number]'));
        console.log(chalk.gray('Example: node examples/bulk-api-workflows.js 2'));
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    simpleContactUpdate,
    largeContactImport,
    dailyDataHygiene,
    migrationWithCheckpoints,
    errorRecoveryWorkflow,
    realtimeMonitoring
};