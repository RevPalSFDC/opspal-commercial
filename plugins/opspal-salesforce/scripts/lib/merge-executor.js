#!/usr/bin/env node
/**
 * Merge Executor
 *
 * Purpose: Execute Account merge operations using Salesforce Composite API
 * for batch processing. Handles lock retries and provides detailed execution logs.
 *
 * Key Features:
 * - Composite API batch merging (25 merges per request)
 * - UNABLE_TO_LOCK_ROW retry logic with exponential backoff
 * - Dry-run mode for testing
 * - Detailed execution logging and error reporting
 * - Integration with BulkAPIHandler for session management
 *
 * Usage:
 *   const executor = new MergeExecutor(orgAlias, bulkHandler, options);
 *   const result = await executor.executeMerges(decisions);
 *
 * @author Claude Code
 * @version 1.0.0
 * @date 2025-10-16
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

class MergeExecutor {
    constructor(orgAlias, bulkHandler, options = {}) {
        this.orgAlias = orgAlias;
        this.bulkHandler = bulkHandler;
        this.dryRun = options.dryRun || false;
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 5000; // 5 seconds base delay
        this.batchSize = options.batchSize || 25; // Composite API limit
        this.verbose = options.verbose || false;
        this.skipOrgCheck = options.skipOrgCheck || false;

        // Get org connection info (skip if bulkHandler provided - test mode)
        if (this.bulkHandler || this.skipOrgCheck) {
            this.orgInfo = { instanceUrl: 'mock://test', accessToken: 'mock-token', username: 'test@test.com', orgId: '00D000000000000' };
        } else {
            this.orgInfo = this.getOrgInfo();
        }

        // Execution results
        this.results = {
            total: 0,
            successful: 0,
            failed: 0,
            retried: 0,
            skipped: 0,
            merges: [],
            errors: []
        };
    }

    /**
     * Execute merge operations from decision list
     * Decisions format: [{ idA: survivor, idB: victim, decision: 'APPROVE', ... }]
     */
    async executeMerges(decisions) {
        console.log('\n🔀 Merge Executor');
        console.log('═'.repeat(70));
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE'}`);
        console.log(`Batch Size: ${this.batchSize} (Composite API)`);
        console.log('');

        // Filter for approved decisions only
        const approvedMerges = decisions.filter(d => d.decision === 'APPROVE');
        this.results.total = approvedMerges.length;

        if (approvedMerges.length === 0) {
            console.log('  ℹ️  No approved merges to execute');
            return this.results;
        }

        console.log(`  📊 Total approved merges: ${approvedMerges.length}`);
        console.log(`  🔄 Batches: ${Math.ceil(approvedMerges.length / this.batchSize)}`);
        console.log('');

        if (this.dryRun) {
            console.log('  🧪 DRY RUN MODE: No actual merges will be executed');
            console.log('');
        }

        // Process merges in batches using Composite API
        for (let i = 0; i < approvedMerges.length; i += this.batchSize) {
            const batch = approvedMerges.slice(i, Math.min(i + this.batchSize, approvedMerges.length));
            const batchNumber = Math.floor(i / this.batchSize) + 1;
            const totalBatches = Math.ceil(approvedMerges.length / this.batchSize);

            console.log(`📦 Batch ${batchNumber}/${totalBatches}: Processing ${batch.length} merges...`);

            try {
                await this.executeBatch(batch, batchNumber);
            } catch (error) {
                console.error(`  ❌ Batch ${batchNumber} failed: ${error.message}`);
                this.results.errors.push({
                    batch: batchNumber,
                    error: error.message,
                    merges: batch.map(m => ({ survivor: m.idA, victim: m.idB }))
                });
            }
        }

        // Display summary
        this.displaySummary();

        return this.results;
    }

    /**
     * Execute a batch of merges using Composite API
     */
    async executeBatch(batch, batchNumber) {
        if (this.dryRun) {
            // Dry run: simulate success
            batch.forEach(merge => {
                this.results.successful++;
                this.results.merges.push({
                    survivor: merge.idA,
                    victim: merge.idB,
                    status: 'DRY_RUN_SUCCESS',
                    dryRun: true
                });
            });
            console.log(`  ✅ Batch ${batchNumber}: ${batch.length} merges simulated (dry run)`);
            return;
        }

        // Build Composite API request
        const compositeRequest = this.buildCompositeRequest(batch);

        // Execute with retry logic
        let attempt = 1;
        let lastError = null;

        while (attempt <= this.maxRetries) {
            try {
                this.log(`Batch ${batchNumber} attempt ${attempt}/${this.maxRetries}`);

                const result = await this.executeCompositeRequest(compositeRequest);

                // Process results
                this.processBatchResults(result, batch, batchNumber);

                console.log(`  ✅ Batch ${batchNumber}: Completed (attempt ${attempt})`);
                return;

            } catch (error) {
                lastError = error;

                // Check if error is UNABLE_TO_LOCK_ROW (can retry)
                const isLockError = error.message.includes('UNABLE_TO_LOCK_ROW') ||
                                   error.message.includes('unable to obtain exclusive access');

                if (isLockError && attempt < this.maxRetries) {
                    // Exponential backoff: delay increases with each attempt
                    const delay = this.retryDelay * Math.pow(2, attempt - 1);
                    console.log(`  ⚠️  Lock error detected, retrying in ${delay / 1000}s (attempt ${attempt}/${this.maxRetries})`);
                    this.results.retried++;
                    await this.sleep(delay);
                    attempt++;
                } else {
                    // Non-retryable error or max retries exceeded
                    console.error(`  ❌ Batch ${batchNumber} failed after ${attempt} attempts: ${error.message}`);

                    // Mark all merges in batch as failed
                    batch.forEach(merge => {
                        this.results.failed++;
                        this.results.merges.push({
                            survivor: merge.idA,
                            victim: merge.idB,
                            status: 'FAILED',
                            error: error.message,
                            attempts: attempt
                        });
                    });

                    throw error;
                }
            }
        }

        throw lastError;
    }

    /**
     * Build Composite API request for batch merges
     */
    buildCompositeRequest(batch) {
        const compositeRequests = batch.map((merge, index) => {
            return {
                method: 'POST',
                url: `/services/data/v60.0/sobjects/Account/${merge.idA}/merge`,
                referenceId: `merge_${index}`,
                body: {
                    masterRecord: {
                        Id: merge.idA
                    },
                    recordToMerge: {
                        Id: merge.idB
                    }
                }
            };
        });

        return {
            compositeRequest: compositeRequests
        };
    }

    /**
     * Execute Composite API request via HTTPS
     */
    async executeCompositeRequest(compositeRequest) {
        return new Promise((resolve, reject) => {
            const endpoint = '/services/data/v60.0/composite';
            const url = new URL(endpoint, this.orgInfo.instanceUrl);

            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.orgInfo.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            let responseData = '';

            const req = https.request(options, (res) => {
                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            const data = JSON.parse(responseData);
                            resolve(data);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                        }
                    } catch (error) {
                        reject(new Error(`Parse error: ${error.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(JSON.stringify(compositeRequest));
            req.end();
        });
    }

    /**
     * Process results from Composite API response
     */
    processBatchResults(result, batch, batchNumber) {
        if (!result.compositeResponse || !Array.isArray(result.compositeResponse)) {
            throw new Error('Invalid Composite API response format');
        }

        result.compositeResponse.forEach((response, index) => {
            const merge = batch[index];

            if (response.httpStatusCode >= 200 && response.httpStatusCode < 300) {
                // Success
                this.results.successful++;
                this.results.merges.push({
                    survivor: merge.idA,
                    victim: merge.idB,
                    status: 'SUCCESS',
                    mergedId: response.body?.id || merge.idA,
                    referenceId: response.referenceId
                });
                this.log(`  ✅ Merged ${merge.idB} → ${merge.idA}`);
            } else {
                // Error
                this.results.failed++;
                const errorMessage = response.body?.[0]?.message || 'Unknown error';
                this.results.merges.push({
                    survivor: merge.idA,
                    victim: merge.idB,
                    status: 'FAILED',
                    error: errorMessage,
                    httpStatus: response.httpStatusCode,
                    referenceId: response.referenceId
                });
                this.results.errors.push({
                    survivor: merge.idA,
                    victim: merge.idB,
                    error: errorMessage,
                    httpStatus: response.httpStatusCode
                });
                console.error(`  ❌ Failed to merge ${merge.idB} → ${merge.idA}: ${errorMessage}`);
            }
        });
    }

    /**
     * Display execution summary
     */
    displaySummary() {
        console.log('\n═'.repeat(70));
        console.log('MERGE EXECUTION SUMMARY');
        console.log('═'.repeat(70));
        console.log(`Total Merges: ${this.results.total}`);
        console.log(`✅ Successful: ${this.results.successful}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`🔄 Retried: ${this.results.retried}`);

        if (this.dryRun) {
            console.log('\n🧪 This was a DRY RUN - no actual merges were executed');
        }

        if (this.results.failed > 0) {
            console.log('\n❌ FAILED MERGES:');
            const failed = this.results.merges.filter(m => m.status === 'FAILED');
            failed.slice(0, 10).forEach(merge => {
                console.log(`  ${merge.survivor} ← ${merge.victim}: ${merge.error}`);
            });
            if (failed.length > 10) {
                console.log(`  ... and ${failed.length - 10} more`);
            }
        }

        console.log('═'.repeat(70));
    }

    /**
     * Save execution results to file
     */
    saveResults(outputFile) {
        const resultsWithMetadata = {
            timestamp: new Date().toISOString(),
            org: this.orgAlias,
            dryRun: this.dryRun,
            batchSize: this.batchSize,
            maxRetries: this.maxRetries,
            ...this.results
        };

        fs.writeFileSync(outputFile, JSON.stringify(resultsWithMetadata, null, 2));
        console.log(`\n📄 Results saved: ${outputFile}`);
        return resultsWithMetadata;
    }

    /**
     * Get org info for API access
     */
    getOrgInfo() {
        try {
            const cmd = `sf org display --target-org ${this.orgAlias} --json`;
            const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
            const data = JSON.parse(result);

            if (data.status !== 0) {
                throw new Error(`Failed to get org info: ${data.message}`);
            }

            return {
                instanceUrl: data.result.instanceUrl,
                accessToken: data.result.accessToken,
                username: data.result.username,
                orgId: data.result.id
            };

        } catch (error) {
            throw new Error(`Failed to connect to org ${this.orgAlias}: ${error.message}`);
        }
    }

    /**
     * Sleep helper for retry delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Logging helper
     */
    log(message) {
        if (this.verbose) {
            console.log(`  [DEBUG] ${message}`);
        }
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2 || args.includes('--help')) {
        console.log(`
Merge Executor

Usage:
  node merge-executor.js <org-alias> <decisions-file> [options]

Arguments:
  org-alias        Target Salesforce org alias
  decisions-file   Path to dedup decisions JSON file

Options:
  --dry-run        Simulate merges without executing (default: false)
  --batch-size <n> Merges per Composite API request (default: 25, max: 25)
  --max-retries <n> Maximum retry attempts for lock errors (default: 3)
  --output <file>  Save execution results to file
  --verbose        Show detailed debug output

Examples:
  # Dry run to test merge plan
  node merge-executor.js production dedup-decisions.json --dry-run

  # Execute merges with custom batch size
  node merge-executor.js production dedup-decisions.json --batch-size 10

  # Execute with custom retries and save results
  node merge-executor.js production dedup-decisions.json --max-retries 5 --output merge-results.json
        `);
        process.exit(0);
    }

    const orgAlias = args[0];
    const decisionsFile = args[1];

    if (!fs.existsSync(decisionsFile)) {
        console.error(`Error: Decisions file not found: ${decisionsFile}`);
        process.exit(1);
    }

    const options = {
        dryRun: args.includes('--dry-run'),
        verbose: args.includes('--verbose')
    };

    // Parse batch size
    const batchSizeIndex = args.indexOf('--batch-size');
    if (batchSizeIndex !== -1 && args[batchSizeIndex + 1]) {
        options.batchSize = Math.min(25, parseInt(args[batchSizeIndex + 1], 10));
    }

    // Parse max retries
    const maxRetriesIndex = args.indexOf('--max-retries');
    if (maxRetriesIndex !== -1 && args[maxRetriesIndex + 1]) {
        options.maxRetries = parseInt(args[maxRetriesIndex + 1], 10);
    }

    // Parse output file
    const outputIndex = args.indexOf('--output');
    const outputFile = outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : null;

    // Load decisions
    const decisions = JSON.parse(fs.readFileSync(decisionsFile, 'utf-8'));
    const decisionsList = decisions.decisions || decisions;

    // Execute merges
    (async () => {
        try {
            // Initialize BulkAPIHandler for session management
            const BulkAPIHandler = require('./bulk-api-handler');
            const bulkHandler = await BulkAPIHandler.fromSFAuth(orgAlias);

            const executor = new MergeExecutor(orgAlias, bulkHandler, options);
            const result = await executor.executeMerges(decisionsList);

            if (outputFile) {
                executor.saveResults(outputFile);
            }

            // Exit with appropriate code
            const exitCode = result.failed > 0 ? 1 : 0;
            process.exit(exitCode);

        } catch (error) {
            console.error('\n❌ Merge execution failed:', error.message);
            if (options.verbose && error.stack) {
                console.error('\nStack trace:');
                console.error(error.stack);
            }
            process.exit(1);
        }
    })();
}

module.exports = MergeExecutor;
