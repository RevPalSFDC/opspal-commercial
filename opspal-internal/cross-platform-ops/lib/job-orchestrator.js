/**
 * Job Orchestrator for Salesforce Bulk API 2.0
 * Manages concurrent job execution with queue, backpressure, and monitoring
 * Respects Salesforce limits (25 concurrent jobs max)
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');

class JobOrchestrator extends EventEmitter {
    constructor(bulkClient, options = {}) {
        super();
        this.bulkClient = bulkClient;

        // Concurrency control
        this.maxConcurrent = Math.min(options.maxConcurrent || 10, 25); // SF limit is 25
        this.activeJobs = new Map();
        this.jobQueue = [];
        this.processing = false;

        // Job tracking
        this.completedJobs = [];
        this.failedJobs = [];
        this.totalJobs = 0;

        // Performance metrics
        this.metrics = {
            startTime: null,
            endTime: null,
            totalRecordsProcessed: 0,
            totalRecordsFailed: 0,
            totalBytesUploaded: 0,
            avgJobDurationMs: 0,
            recordsPerSecond: 0
        };

        // Configuration
        this.checkpointDir = options.checkpointDir || './checkpoints';
        this.saveCheckpoints = options.saveCheckpoints !== false;
        this.retryFailed = options.retryFailed !== false;
        this.maxRetries = options.maxRetries || 3;

        // Backpressure control
        this.pauseOnHighMemory = options.pauseOnHighMemory !== false;
        this.memoryThresholdMB = options.memoryThresholdMB || 1024;
        this.lastMemoryCheck = Date.now();
    }

    /**
     * Process multiple CSV files with controlled concurrency
     * @param {Array<string>} filePaths - Array of CSV file paths
     * @param {string} object - Salesforce object name
     * @param {string} operation - Operation type
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Aggregated results
     */
    async processFiles(filePaths, object, operation, options = {}) {
        this.metrics.startTime = Date.now();
        this.totalJobs = filePaths.length;

        this.emit('orchestrationStart', {
            totalFiles: filePaths.length,
            maxConcurrent: this.maxConcurrent,
            object,
            operation
        });

        // Create checkpoint directory if needed
        if (this.saveCheckpoints) {
            await fs.mkdir(this.checkpointDir, { recursive: true });
        }

        // Queue all jobs
        for (const filePath of filePaths) {
            this.jobQueue.push({
                filePath,
                object,
                operation,
                options,
                retryCount: 0,
                id: this._generateJobId(filePath)
            });
        }

        // Start processing
        this.processing = true;
        await this._processQueue();

        // Wait for all jobs to complete
        while (this.activeJobs.size > 0 || this.jobQueue.length > 0) {
            await this._sleep(1000);
        }

        this.processing = false;
        this.metrics.endTime = Date.now();

        // Calculate final metrics
        this._calculateMetrics();

        const results = {
            successful: this.completedJobs,
            failed: this.failedJobs,
            metrics: this.metrics,
            summary: {
                totalFiles: filePaths.length,
                successfulFiles: this.completedJobs.length,
                failedFiles: this.failedJobs.length,
                totalRecordsProcessed: this.metrics.totalRecordsProcessed,
                totalRecordsFailed: this.metrics.totalRecordsFailed,
                durationMs: this.metrics.endTime - this.metrics.startTime
            }
        };

        this.emit('orchestrationComplete', results);
        return results;
    }

    /**
     * Process the job queue with concurrency control
     */
    async _processQueue() {
        while (this.processing && (this.jobQueue.length > 0 || this.activeJobs.size > 0)) {
            // Check memory pressure
            if (await this._checkMemoryPressure()) {
                this.emit('backpressure', {
                    reason: 'memory',
                    activeJobs: this.activeJobs.size,
                    queuedJobs: this.jobQueue.length
                });
                await this._sleep(5000); // Wait 5 seconds
                continue;
            }

            // Process jobs up to concurrency limit
            while (this.activeJobs.size < this.maxConcurrent && this.jobQueue.length > 0) {
                const job = this.jobQueue.shift();
                this._startJob(job);
            }

            // Wait a bit before checking again
            await this._sleep(100);
        }
    }

    /**
     * Start processing a single job
     */
    async _startJob(job) {
        const jobStartTime = Date.now();

        this.activeJobs.set(job.id, {
            ...job,
            startTime: jobStartTime,
            status: 'running'
        });

        this.emit('jobStart', {
            jobId: job.id,
            filePath: job.filePath,
            activeJobs: this.activeJobs.size,
            queuedJobs: this.jobQueue.length
        });

        try {
            // Read file stream
            const { createReadStream } = require('fs');
            const csvStream = createReadStream(job.filePath);

            // Get file size for metrics
            const stats = await fs.stat(job.filePath);
            const fileSize = stats.size;

            // Execute bulk operation
            const result = await this.bulkClient.executeBulkOperation(
                job.object,
                job.operation,
                csvStream,
                {
                    ...job.options,
                    compress: true
                }
            );

            // Update metrics
            this.metrics.totalBytesUploaded += fileSize;
            this.metrics.totalRecordsProcessed += result.results.successful;
            this.metrics.totalRecordsFailed += result.results.failed;

            // Save successful job
            const jobResult = {
                ...job,
                result,
                durationMs: Date.now() - jobStartTime,
                fileSize,
                status: 'completed'
            };

            this.completedJobs.push(jobResult);
            this.activeJobs.delete(job.id);

            // Save checkpoint
            if (this.saveCheckpoints) {
                await this._saveCheckpoint(jobResult);
            }

            // Save results to file
            if (result.results.failed > 0) {
                await this._saveFailedRecords(job.id, result.results.results.failed);
            }

            this.emit('jobComplete', {
                jobId: job.id,
                successful: result.results.successful,
                failed: result.results.failed,
                durationMs: jobResult.durationMs
            });

        } catch (error) {
            await this._handleJobError(job, error);
        }
    }

    /**
     * Handle job errors with retry logic
     */
    async _handleJobError(job, error) {
        this.activeJobs.delete(job.id);

        // Check if we should retry
        if (job.retryCount < this.maxRetries && this._isRetryableError(error)) {
            job.retryCount++;

            // Exponential backoff
            const backoffMs = Math.min(1000 * Math.pow(2, job.retryCount), 30000);

            this.emit('jobRetry', {
                jobId: job.id,
                retryCount: job.retryCount,
                error: error.message,
                backoffMs
            });

            // Re-queue with delay
            setTimeout(() => {
                this.jobQueue.push(job);
            }, backoffMs);

        } else {
            // Job failed permanently
            const jobResult = {
                ...job,
                error: error.message,
                errorStack: error.stack,
                status: 'failed'
            };

            this.failedJobs.push(jobResult);

            // Save failed job info
            if (this.saveCheckpoints) {
                await this._saveCheckpoint(jobResult);
            }

            this.emit('jobFailed', {
                jobId: job.id,
                error: error.message,
                retryCount: job.retryCount
            });
        }
    }

    /**
     * Check if error is retryable
     */
    _isRetryableError(error) {
        const retryableErrors = [
            'UNABLE_TO_LOCK_ROW',
            'REQUEST_TIMEOUT',
            'CONCURRENT_REQUEST',
            'SERVER_UNAVAILABLE',
            'REQUEST_LIMIT_EXCEEDED',
            'ECONNRESET',
            'ETIMEDOUT',
            'ENOTFOUND'
        ];

        const errorMessage = error.message || '';
        return retryableErrors.some(e => errorMessage.includes(e));
    }

    /**
     * Check memory pressure
     */
    async _checkMemoryPressure() {
        if (!this.pauseOnHighMemory) return false;

        // Check every 5 seconds
        if (Date.now() - this.lastMemoryCheck < 5000) {
            return false;
        }

        this.lastMemoryCheck = Date.now();

        const used = process.memoryUsage();
        const heapUsedMB = used.heapUsed / 1024 / 1024;

        if (heapUsedMB > this.memoryThresholdMB) {
            this.emit('memoryPressure', {
                heapUsedMB,
                thresholdMB: this.memoryThresholdMB
            });

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            return true;
        }

        return false;
    }

    /**
     * Save checkpoint for job
     */
    async _saveCheckpoint(jobResult) {
        const checkpointPath = path.join(
            this.checkpointDir,
            `checkpoint_${jobResult.id}.json`
        );

        await fs.writeFile(
            checkpointPath,
            JSON.stringify(jobResult, null, 2)
        );
    }

    /**
     * Save failed records to CSV
     */
    async _saveFailedRecords(jobId, failedRecords) {
        if (!failedRecords || failedRecords.length === 0) return;

        const { stringify } = require('csv-stringify/sync');
        const failedCsv = stringify(failedRecords, { header: true });

        const failedPath = path.join(
            this.checkpointDir,
            `failed_${jobId}.csv`
        );

        await fs.writeFile(failedPath, failedCsv);

        this.emit('failedRecordsSaved', {
            jobId,
            path: failedPath,
            count: failedRecords.length
        });
    }

    /**
     * Resume from checkpoints
     */
    async resumeFromCheckpoints() {
        const checkpointFiles = await fs.readdir(this.checkpointDir);
        const checkpoints = [];

        for (const file of checkpointFiles) {
            if (file.startsWith('checkpoint_') && file.endsWith('.json')) {
                const content = await fs.readFile(
                    path.join(this.checkpointDir, file),
                    'utf8'
                );
                checkpoints.push(JSON.parse(content));
            }
        }

        // Identify incomplete jobs
        const completedIds = new Set(checkpoints
            .filter(c => c.status === 'completed')
            .map(c => c.id));

        const incompleteJobs = checkpoints
            .filter(c => !completedIds.has(c.id) && c.status !== 'completed');

        this.emit('resumeFromCheckpoints', {
            total: checkpoints.length,
            completed: completedIds.size,
            incomplete: incompleteJobs.length
        });

        return incompleteJobs;
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            activeJobs: this.activeJobs.size,
            queuedJobs: this.jobQueue.length,
            completedJobs: this.completedJobs.length,
            failedJobs: this.failedJobs.length,
            totalJobs: this.totalJobs,
            metrics: this.metrics,
            activeJobDetails: Array.from(this.activeJobs.values()).map(job => ({
                id: job.id,
                filePath: job.filePath,
                status: job.status,
                durationMs: Date.now() - job.startTime
            }))
        };
    }

    /**
     * Cancel all jobs
     */
    async cancelAll() {
        this.processing = false;

        // Cancel active jobs
        for (const [jobId, job] of this.activeJobs) {
            if (job.bulkJobId) {
                try {
                    await this.bulkClient.abortJob(job.bulkJobId);
                } catch (error) {
                    console.error(`Failed to abort job ${jobId}:`, error);
                }
            }
        }

        // Clear queue
        this.jobQueue = [];

        this.emit('cancelAll', {
            cancelledActive: this.activeJobs.size,
            cancelledQueued: this.jobQueue.length
        });

        this.activeJobs.clear();
    }

    /**
     * Calculate final metrics
     */
    _calculateMetrics() {
        const durationMs = this.metrics.endTime - this.metrics.startTime;
        const durationSec = durationMs / 1000;

        this.metrics.avgJobDurationMs = this.completedJobs.length > 0
            ? this.completedJobs.reduce((sum, job) => sum + job.durationMs, 0) / this.completedJobs.length
            : 0;

        this.metrics.recordsPerSecond = durationSec > 0
            ? Math.round(this.metrics.totalRecordsProcessed / durationSec)
            : 0;

        this.metrics.throughputMBps = durationSec > 0
            ? (this.metrics.totalBytesUploaded / 1024 / 1024 / durationSec).toFixed(2)
            : 0;
    }

    /**
     * Generate unique job ID
     */
    _generateJobId(filePath) {
        const basename = path.basename(filePath);
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        return `${basename}_${timestamp}_${random}`;
    }

    /**
     * Sleep helper
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = JobOrchestrator;