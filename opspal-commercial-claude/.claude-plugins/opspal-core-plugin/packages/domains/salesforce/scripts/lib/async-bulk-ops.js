#!/usr/bin/env node
/**
 * Async Bulk Operation Framework
 *
 * Purpose: Handle 60k+ record operations without timeout by submitting jobs
 * and monitoring asynchronously. Prevents blocking operations and allows
 * resume after interruption.
 *
 * Key Features:
 * - Submit bulk jobs and exit immediately (no waiting)
 * - Monitor job progress with polling
 * - Resume interrupted operations
 * - Track multiple jobs simultaneously
 * - Automatic retry with exponential backoff
 *
 * Usage Examples:
 *
 * // Submit a bulk update job
 * const jobId = await submitBulkUpdate('Contact', csvPath, 'rentable-production');
 * console.log(`Job submitted: ${jobId}`);
 *
 * // Monitor job progress
 * const status = await monitorJob(jobId, 'rentable-production', { poll: true });
 *
 * // Check job status without polling
 * const quickStatus = await getBulkJobStatus(jobId, 'rentable-production');
 *
 * // Resume monitoring after interruption
 * await resumeJob(jobId, 'rentable-production');
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

class AsyncBulkOps {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.jobsDir = options.jobsDir || path.join(__dirname, '../.bulk-jobs');
        this.pollInterval = options.pollInterval || 30000; // 30 seconds default
        this.maxRetries = options.maxRetries || 3;

        // Ensure jobs directory exists
        if (!fs.existsSync(this.jobsDir)) {
            fs.mkdirSync(this.jobsDir, { recursive: true });
        }
    }

    /**
     * Submit a bulk update job and exit immediately
     * @param {string} sobject - Salesforce object (e.g., 'Contact', 'Account')
     * @param {string} csvPath - Path to CSV file with records to update
     * @param {object} options - Additional options
     * @returns {Promise<string>} Job ID
     */
    async submitBulkUpdate(sobject, csvPath, options = {}) {
        return this._submitBulkJob('update', sobject, csvPath, options);
    }

    /**
     * Submit a bulk insert job and exit immediately
     * @param {string} sobject - Salesforce object
     * @param {string} csvPath - Path to CSV file
     * @param {object} options - Additional options
     * @returns {Promise<string>} Job ID
     */
    async submitBulkInsert(sobject, csvPath, options = {}) {
        return this._submitBulkJob('upsert', sobject, csvPath, options);
    }

    /**
     * Submit a bulk delete job and exit immediately
     * @param {string} sobject - Salesforce object
     * @param {string} csvPath - Path to CSV file with Ids
     * @param {object} options - Additional options
     * @returns {Promise<string>} Job ID
     */
    async submitBulkDelete(sobject, csvPath, options = {}) {
        return this._submitBulkJob('delete', sobject, csvPath, options);
    }

    /**
     * Internal method to submit bulk job
     */
    async _submitBulkJob(operation, sobject, csvPath, options = {}) {
        const wait = options.wait || 0; // Don't wait by default
        const batchSize = options.batchSize || 10000;

        try {
            console.log(`📤 Submitting ${operation} job for ${sobject}...`);
            console.log(`   CSV: ${csvPath}`);
            console.log(`   Org: ${this.orgAlias}`);

            const command = `sf data ${operation} bulk --sobject ${sobject} --file "${csvPath}" --target-org ${this.orgAlias} --wait ${wait} --json`;

            const result = execSync(command, {
                encoding: 'utf-8',
                maxBuffer: 100 * 1024 * 1024,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const data = JSON.parse(result);

            if (data.status !== 0) {
                throw new Error(`Bulk job submission failed: ${data.message}`);
            }

            const jobId = data.result?.jobInfo?.id || data.result?.id;

            if (!jobId) {
                throw new Error('No job ID returned from Salesforce');
            }

            // Save job metadata
            const jobMetadata = {
                jobId,
                operation,
                sobject,
                csvPath,
                orgAlias: this.orgAlias,
                submittedAt: new Date().toISOString(),
                status: 'Submitted',
                recordsProcessed: 0,
                recordsFailed: 0,
                recordsTotal: this._countRecordsInCSV(csvPath)
            };

            this._saveJobMetadata(jobId, jobMetadata);

            console.log(`✅ Job submitted successfully!`);
            console.log(`   Job ID: ${jobId}`);
            console.log(`   Total records: ${jobMetadata.recordsTotal.toLocaleString()}`);
            console.log(`\n📊 Monitor progress with:`);
            console.log(`   node ${path.join(__dirname, '../monitor-bulk-job.js')} ${jobId}`);

            return jobId;

        } catch (error) {
            console.error(`❌ Failed to submit bulk job:`, error.message);
            throw error;
        }
    }

    /**
     * Monitor a bulk job with polling
     * @param {string} jobId - Job ID to monitor
     * @param {object} options - Monitoring options
     * @returns {Promise<object>} Final job status
     */
    async monitorJob(jobId, options = {}) {
        const poll = options.poll !== false; // Poll by default
        const pollInterval = options.pollInterval || this.pollInterval;
        const silent = options.silent || false;

        if (!silent) {
            console.log(`\n🔍 Monitoring job ${jobId}...`);
        }

        let status = await this.getBulkJobStatus(jobId);
        const jobMetadata = this._loadJobMetadata(jobId);

        if (!silent) {
            this._displayJobStatus(status, jobMetadata);
        }

        // If not polling or job is complete, return immediately
        if (!poll || ['Completed', 'Failed', 'Aborted'].includes(status.state)) {
            return status;
        }

        // Poll until job completes
        return new Promise((resolve, reject) => {
            const interval = setInterval(async () => {
                try {
                    status = await this.getBulkJobStatus(jobId);

                    if (!silent) {
                        readline.cursorTo(process.stdout, 0);
                        process.stdout.write(`   ${status.state} - ${status.recordsProcessed}/${status.recordsTotal} records (${status.percentComplete}%)`);
                    }

                    // Update metadata
                    if (jobMetadata) {
                        jobMetadata.status = status.state;
                        jobMetadata.recordsProcessed = status.recordsProcessed;
                        jobMetadata.recordsFailed = status.recordsFailed;
                        jobMetadata.lastCheckedAt = new Date().toISOString();
                        this._saveJobMetadata(jobId, jobMetadata);
                    }

                    // Check if complete
                    if (['Completed', 'Failed', 'Aborted'].includes(status.state)) {
                        clearInterval(interval);
                        if (!silent) {
                            console.log('\n');
                            this._displayJobStatus(status, jobMetadata);
                        }
                        resolve(status);
                    }

                } catch (error) {
                    clearInterval(interval);
                    reject(error);
                }
            }, pollInterval);
        });
    }

    /**
     * Get current status of a bulk job
     * @param {string} jobId - Job ID
     * @returns {Promise<object>} Job status
     */
    async getBulkJobStatus(jobId) {
        try {
            const command = `sf data query --query "SELECT Id, State, JobType, TotalProcessingTime, NumberRecordsProcessed, NumberRecordsFailed, TotalJobItems FROM AsyncApexJob WHERE Id = '${jobId}'" --target-org ${this.orgAlias} --use-tooling-api --json`;

            const result = execSync(command, {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const data = JSON.parse(result);

            if (data.status !== 0 || !data.result.records || data.result.records.length === 0) {
                // Try Bulk API v2 endpoint
                return this._getBulkV2Status(jobId);
            }

            const record = data.result.records[0];

            return {
                jobId,
                state: record.State,
                jobType: record.JobType,
                recordsTotal: record.TotalJobItems || 0,
                recordsProcessed: record.NumberRecordsProcessed || 0,
                recordsFailed: record.NumberRecordsFailed || 0,
                percentComplete: record.TotalJobItems ? Math.round((record.NumberRecordsProcessed / record.TotalJobItems) * 100) : 0,
                processingTime: record.TotalProcessingTime || 0
            };

        } catch (error) {
            console.error(`❌ Failed to get job status:`, error.message);
            throw error;
        }
    }

    /**
     * Get Bulk API v2 job status (fallback)
     */
    async _getBulkV2Status(jobId) {
        try {
            const command = `sf data query --query "SELECT Id, State, Operation, TotalProcessingTime, NumberRecordsProcessed, NumberRecordsFailed, NumberRecordsTotal FROM BulkIngestJob WHERE Id = '${jobId}'" --target-org ${this.orgAlias} --use-tooling-api --json`;

            const result = execSync(command, {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const data = JSON.parse(result);

            if (data.status !== 0 || !data.result.records || data.result.records.length === 0) {
                throw new Error('Job not found');
            }

            const record = data.result.records[0];

            return {
                jobId,
                state: record.State,
                jobType: record.Operation,
                recordsTotal: record.NumberRecordsTotal || 0,
                recordsProcessed: record.NumberRecordsProcessed || 0,
                recordsFailed: record.NumberRecordsFailed || 0,
                percentComplete: record.NumberRecordsTotal ? Math.round((record.NumberRecordsProcessed / record.NumberRecordsTotal) * 100) : 0,
                processingTime: record.TotalProcessingTime || 0
            };

        } catch (error) {
            console.error(`❌ Job not found in Bulk API v2:`, error.message);
            throw error;
        }
    }

    /**
     * Resume monitoring a previously submitted job
     * @param {string} jobId - Job ID to resume
     * @returns {Promise<object>} Final job status
     */
    async resumeJob(jobId) {
        console.log(`🔄 Resuming job ${jobId}...`);
        const jobMetadata = this._loadJobMetadata(jobId);

        if (jobMetadata) {
            console.log(`   Submitted: ${new Date(jobMetadata.submittedAt).toLocaleString()}`);
            console.log(`   Object: ${jobMetadata.sobject}`);
            console.log(`   Operation: ${jobMetadata.operation}`);
        }

        return this.monitorJob(jobId, { poll: true });
    }

    /**
     * List all tracked jobs
     * @param {object} options - Filter options
     * @returns {Array<object>} Array of job metadata
     */
    listJobs(options = {}) {
        const filter = options.filter || 'all'; // all, active, completed, failed

        const jobFiles = fs.readdirSync(this.jobsDir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const metadata = JSON.parse(fs.readFileSync(path.join(this.jobsDir, f), 'utf-8'));
                return metadata;
            });

        if (filter === 'all') {
            return jobFiles;
        }

        return jobFiles.filter(job => {
            if (filter === 'active') {
                return !['Completed', 'Failed', 'Aborted'].includes(job.status);
            }
            if (filter === 'completed') {
                return job.status === 'Completed';
            }
            if (filter === 'failed') {
                return job.status === 'Failed' || job.status === 'Aborted';
            }
            return true;
        });
    }

    /**
     * Count records in CSV file
     */
    _countRecordsInCSV(csvPath) {
        try {
            const content = fs.readFileSync(csvPath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim().length > 0);
            return Math.max(0, lines.length - 1); // Exclude header
        } catch (error) {
            return 0;
        }
    }

    /**
     * Save job metadata to disk
     */
    _saveJobMetadata(jobId, metadata) {
        const metadataPath = path.join(this.jobsDir, `${jobId}.json`);
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    }

    /**
     * Load job metadata from disk
     */
    _loadJobMetadata(jobId) {
        const metadataPath = path.join(this.jobsDir, `${jobId}.json`);
        if (fs.existsSync(metadataPath)) {
            return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        }
        return null;
    }

    /**
     * Display job status in formatted output
     */
    _displayJobStatus(status, metadata) {
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`📊 Job Status: ${status.state}`);
        console.log(`${'═'.repeat(60)}`);

        if (metadata) {
            console.log(`Job ID:          ${status.jobId}`);
            console.log(`Object:          ${metadata.sobject}`);
            console.log(`Operation:       ${metadata.operation}`);
            console.log(`Submitted:       ${new Date(metadata.submittedAt).toLocaleString()}`);
        }

        console.log(`\nProgress:`);
        console.log(`   Total:        ${status.recordsTotal.toLocaleString()}`);
        console.log(`   Processed:    ${status.recordsProcessed.toLocaleString()} (${status.percentComplete}%)`);
        console.log(`   Failed:       ${status.recordsFailed.toLocaleString()}`);

        if (status.state === 'Completed') {
            console.log(`\n✅ Job completed successfully!`);
        } else if (status.state === 'Failed') {
            console.log(`\n❌ Job failed!`);
        }

        console.log(`${'═'.repeat(60)}\n`);
    }
}

// Export for use in other scripts
module.exports = AsyncBulkOps;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log(`
Async Bulk Operation Framework

Usage:
  node async-bulk-ops.js submit <operation> <sobject> <csv-path> <org-alias>
  node async-bulk-ops.js monitor <job-id> <org-alias>
  node async-bulk-ops.js resume <job-id> <org-alias>
  node async-bulk-ops.js list <org-alias> [filter]
  node async-bulk-ops.js status <job-id> <org-alias>

Commands:
  submit   - Submit a bulk job and exit
  monitor  - Monitor a job with polling
  resume   - Resume monitoring an interrupted job
  list     - List all tracked jobs (filter: all|active|completed|failed)
  status   - Get current status without polling

Examples:
  node async-bulk-ops.js submit update Contact updates.csv rentable-production
  node async-bulk-ops.js monitor 7501234567890ABCD rentable-production
  node async-bulk-ops.js list rentable-production active
        `);
        process.exit(0);
    }

    (async () => {
        if (command === 'submit') {
            const [operation, sobject, csvPath, orgAlias] = args.slice(1);
            const ops = new AsyncBulkOps(orgAlias);

            if (operation === 'update') {
                await ops.submitBulkUpdate(sobject, csvPath);
            } else if (operation === 'insert' || operation === 'upsert') {
                await ops.submitBulkInsert(sobject, csvPath);
            } else if (operation === 'delete') {
                await ops.submitBulkDelete(sobject, csvPath);
            } else {
                console.error(`Unknown operation: ${operation}`);
                process.exit(1);
            }
        } else if (command === 'monitor') {
            const [jobId, orgAlias] = args.slice(1);
            const ops = new AsyncBulkOps(orgAlias);
            await ops.monitorJob(jobId, { poll: true });
        } else if (command === 'resume') {
            const [jobId, orgAlias] = args.slice(1);
            const ops = new AsyncBulkOps(orgAlias);
            await ops.resumeJob(jobId);
        } else if (command === 'list') {
            const [orgAlias, filter = 'all'] = args.slice(1);
            const ops = new AsyncBulkOps(orgAlias);
            const jobs = ops.listJobs({ filter });

            console.log(`\n📋 Tracked Jobs (${filter}):\n`);
            jobs.forEach(job => {
                console.log(`   ${job.jobId} - ${job.sobject} ${job.operation} - ${job.status}`);
                console.log(`      Submitted: ${new Date(job.submittedAt).toLocaleString()}`);
                console.log(`      Records: ${job.recordsProcessed}/${job.recordsTotal}\n`);
            });
        } else if (command === 'status') {
            const [jobId, orgAlias] = args.slice(1);
            const ops = new AsyncBulkOps(orgAlias);
            const status = await ops.getBulkJobStatus(jobId);
            const metadata = ops._loadJobMetadata(jobId);
            ops._displayJobStatus(status, metadata);
        } else {
            console.error(`Unknown command: ${command}`);
            process.exit(1);
        }
    })().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}