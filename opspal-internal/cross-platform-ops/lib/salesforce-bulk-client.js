/**
 * Salesforce Bulk API 2.0 Client
 * Proper implementation following official API lifecycle
 * Handles >2M records with streaming, compression, and error recovery
 */

const https = require('https');
const { promisify } = require('util');
const zlib = require('zlib');
const { pipeline } = require('stream');
const pipelineAsync = promisify(pipeline);
const { EventEmitter } = require('events');

class SalesforceBulkClient extends EventEmitter {
    constructor(config = {}) {
        super();
        this.instanceUrl = config.instanceUrl;
        this.accessToken = config.accessToken;
        this.apiVersion = config.apiVersion || 'v64.0';
        this.maxRetries = config.maxRetries || 3;
        this.retryDelay = config.retryDelay || 1000;
        this.keepAliveAgent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 30000,
            maxSockets: 10
        });
    }

    /**
     * Create a new bulk job following Bulk API 2.0 lifecycle
     * @param {string} object - Salesforce object name (e.g., 'Contact')
     * @param {string} operation - Operation type (insert|update|upsert|delete)
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Job information
     */
    async createJob(object, operation, options = {}) {
        const jobRequest = {
            object,
            operation,
            lineEnding: options.lineEnding || 'LF',
            columnDelimiter: options.columnDelimiter || 'COMMA',
            contentType: 'CSV'
        };

        if (operation === 'upsert' && options.externalIdFieldName) {
            jobRequest.externalIdFieldName = options.externalIdFieldName;
        }

        const response = await this._makeRequest('POST', `/services/data/${this.apiVersion}/jobs/ingest`, jobRequest);

        this.emit('jobCreated', response);
        return response;
    }

    /**
     * Upload CSV data to a job with streaming and compression
     * @param {string} jobId - Job ID from createJob
     * @param {ReadStream|string} csvData - CSV data stream or string
     * @param {Object} options - Upload options
     * @returns {Promise<Object>} Upload result
     */
    async uploadCSV(jobId, csvData, options = {}) {
        const headers = {
            'Content-Type': 'text/csv',
            'Accept-Encoding': 'gzip'
        };

        // If gzip compression requested (recommended)
        if (options.compress !== false) {
            headers['Content-Encoding'] = 'gzip';
        }

        let dataStream = csvData;

        // Convert string to stream if needed
        if (typeof csvData === 'string') {
            const { Readable } = require('stream');
            dataStream = Readable.from(csvData);
        }

        // Apply size limit (150MB)
        const maxSize = options.maxSizeBytes || 150 * 1024 * 1024;
        let uploadedBytes = 0;

        dataStream.on('data', chunk => {
            uploadedBytes += chunk.length;
            if (uploadedBytes > maxSize) {
                dataStream.destroy(new Error(`File size exceeds ${maxSize} bytes limit`));
            }
            this.emit('uploadProgress', { jobId, bytes: uploadedBytes });
        });

        // Compress if requested
        if (options.compress !== false) {
            dataStream = dataStream.pipe(zlib.createGzip());
        }

        const response = await this._streamRequest(
            'PUT',
            `/services/data/${this.apiVersion}/jobs/ingest/${jobId}/batches`,
            dataStream,
            headers
        );

        this.emit('dataUploaded', { jobId, bytes: uploadedBytes });
        return response;
    }

    /**
     * Close job and mark as ready for processing
     * @param {string} jobId - Job ID
     * @returns {Promise<Object>} Job status
     */
    async closeJob(jobId) {
        const response = await this._makeRequest(
            'PATCH',
            `/services/data/${this.apiVersion}/jobs/ingest/${jobId}`,
            { state: 'UploadComplete' }
        );

        this.emit('jobClosed', response);
        return response;
    }

    /**
     * Poll job status with exponential backoff
     * @param {string} jobId - Job ID
     * @param {Object} options - Polling options
     * @returns {Promise<Object>} Final job status
     */
    async pollJobStatus(jobId, options = {}) {
        const maxWaitMs = options.maxWaitMs || 600000; // 10 minutes default
        const pollIntervalMs = options.pollIntervalMs || 1000;
        const maxPollInterval = 30000; // Max 30 seconds between polls

        const startTime = Date.now();
        let currentInterval = pollIntervalMs;
        let consecutiveFailures = 0;

        while (Date.now() - startTime < maxWaitMs) {
            try {
                const job = await this.getJob(jobId);

                this.emit('statusPolled', job);

                if (['JobComplete', 'Failed', 'Aborted'].includes(job.state)) {
                    return job;
                }

                // Reset failures on successful poll
                consecutiveFailures = 0;

                // Exponential backoff for polling interval
                await this._sleep(currentInterval);
                currentInterval = Math.min(currentInterval * 1.5, maxPollInterval);

            } catch (error) {
                consecutiveFailures++;
                if (consecutiveFailures >= 3) {
                    throw new Error(`Failed to poll job status after ${consecutiveFailures} attempts: ${error.message}`);
                }
                await this._sleep(5000); // Wait 5 seconds on error
            }
        }

        throw new Error(`Job ${jobId} did not complete within ${maxWaitMs}ms`);
    }

    /**
     * Get current job information
     * @param {string} jobId - Job ID
     * @returns {Promise<Object>} Job information
     */
    async getJob(jobId) {
        return await this._makeRequest('GET', `/services/data/${this.apiVersion}/jobs/ingest/${jobId}`);
    }

    /**
     * Download job results (successful, failed, or unprocessed records)
     * @param {string} jobId - Job ID
     * @param {string} type - Result type: 'successfulResults'|'failedResults'|'unprocessedRecords'
     * @returns {Promise<Stream>} Result stream
     */
    async downloadResults(jobId, type = 'successfulResults') {
        const validTypes = ['successfulResults', 'failedResults', 'unprocessedRecords'];
        if (!validTypes.includes(type)) {
            throw new Error(`Invalid result type. Must be one of: ${validTypes.join(', ')}`);
        }

        const response = await this._streamRequest(
            'GET',
            `/services/data/${this.apiVersion}/jobs/ingest/${jobId}/${type}`,
            null,
            { 'Accept-Encoding': 'gzip' }
        );

        return response;
    }

    /**
     * Download all results and reconcile
     * @param {string} jobId - Job ID
     * @returns {Promise<Object>} Reconciliation summary
     */
    async downloadAllResults(jobId) {
        const results = {
            successful: [],
            failed: [],
            unprocessed: []
        };

        // Download all result types in parallel
        const [successStream, failedStream, unprocessedStream] = await Promise.all([
            this.downloadResults(jobId, 'successfulResults').catch(() => null),
            this.downloadResults(jobId, 'failedResults').catch(() => null),
            this.downloadResults(jobId, 'unprocessedRecords').catch(() => null)
        ]);

        // Parse results
        if (successStream) {
            results.successful = await this._parseCSVStream(successStream);
        }
        if (failedStream) {
            results.failed = await this._parseCSVStream(failedStream);
        }
        if (unprocessedStream) {
            results.unprocessed = await this._parseCSVStream(unprocessedStream);
        }

        const summary = {
            totalProcessed: results.successful.length + results.failed.length,
            successful: results.successful.length,
            failed: results.failed.length,
            unprocessed: results.unprocessed.length,
            results
        };

        this.emit('resultsDownloaded', summary);
        return summary;
    }

    /**
     * Abort a running job
     * @param {string} jobId - Job ID
     * @returns {Promise<Object>} Job status
     */
    async abortJob(jobId) {
        const response = await this._makeRequest(
            'PATCH',
            `/services/data/${this.apiVersion}/jobs/ingest/${jobId}`,
            { state: 'Aborted' }
        );

        this.emit('jobAborted', response);
        return response;
    }

    /**
     * Delete a job
     * @param {string} jobId - Job ID
     * @returns {Promise<void>}
     */
    async deleteJob(jobId) {
        await this._makeRequest('DELETE', `/services/data/${this.apiVersion}/jobs/ingest/${jobId}`);
        this.emit('jobDeleted', { jobId });
    }

    /**
     * Get all jobs
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of jobs
     */
    async getAllJobs(options = {}) {
        const queryParams = new URLSearchParams();
        if (options.isPkChunkingEnabled !== undefined) {
            queryParams.set('isPkChunkingEnabled', options.isPkChunkingEnabled);
        }
        if (options.jobType) {
            queryParams.set('jobType', options.jobType);
        }
        if (options.concurrencyMode) {
            queryParams.set('concurrencyMode', options.concurrencyMode);
        }

        const query = queryParams.toString();
        const path = `/services/data/${this.apiVersion}/jobs/ingest${query ? '?' + query : ''}`;

        const response = await this._makeRequest('GET', path);
        return response.records || [];
    }

    /**
     * Execute complete bulk operation with automatic lifecycle management
     * @param {string} object - Salesforce object
     * @param {string} operation - Operation type
     * @param {Stream|string} csvData - CSV data
     * @param {Object} options - Options
     * @returns {Promise<Object>} Operation results
     */
    async executeBulkOperation(object, operation, csvData, options = {}) {
        let jobId;

        try {
            // Step 1: Create job
            const job = await this.createJob(object, operation, options);
            jobId = job.id;

            // Step 2: Upload data
            await this.uploadCSV(jobId, csvData, options);

            // Step 3: Close job
            await this.closeJob(jobId);

            // Step 4: Poll for completion
            const finalStatus = await this.pollJobStatus(jobId, options);

            // Step 5: Download and reconcile results
            const results = await this.downloadAllResults(jobId);

            return {
                jobId,
                status: finalStatus,
                results
            };

        } catch (error) {
            // Attempt to abort job on error
            if (jobId) {
                try {
                    await this.abortJob(jobId);
                } catch (abortError) {
                    console.error('Failed to abort job:', abortError);
                }
            }
            throw error;
        }
    }

    // Private helper methods

    async _makeRequest(method, path, body = null, headers = {}) {
        const url = new URL(this.instanceUrl + path);

        const requestOptions = {
            method,
            hostname: url.hostname,
            path: url.pathname + url.search,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...headers
            },
            agent: this.keepAliveAgent
        };

        return new Promise((resolve, reject) => {
            const req = https.request(requestOptions, res => {
                let data = '';

                res.on('data', chunk => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(data ? JSON.parse(data) : {});
                        } catch (e) {
                            resolve(data);
                        }
                    } else {
                        const error = new Error(`API request failed: ${res.statusCode}`);
                        error.statusCode = res.statusCode;
                        error.response = data;
                        reject(error);
                    }
                });
            });

            req.on('error', reject);

            if (body) {
                req.write(JSON.stringify(body));
            }

            req.end();
        });
    }

    async _streamRequest(method, path, stream = null, headers = {}) {
        const url = new URL(this.instanceUrl + path);

        const requestOptions = {
            method,
            hostname: url.hostname,
            path: url.pathname + url.search,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                ...headers
            },
            agent: this.keepAliveAgent
        };

        return new Promise((resolve, reject) => {
            const req = https.request(requestOptions, res => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(res);
                } else {
                    let errorData = '';
                    res.on('data', chunk => errorData += chunk);
                    res.on('end', () => {
                        const error = new Error(`Stream request failed: ${res.statusCode}`);
                        error.statusCode = res.statusCode;
                        error.response = errorData;
                        reject(error);
                    });
                }
            });

            req.on('error', reject);

            if (stream) {
                stream.pipe(req);
            } else {
                req.end();
            }
        });
    }

    async _parseCSVStream(stream) {
        const { parse } = require('csv-parse');
        const records = [];

        return new Promise((resolve, reject) => {
            stream
                .pipe(parse({ columns: true }))
                .on('data', record => records.push(record))
                .on('end', () => resolve(records))
                .on('error', reject);
        });
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = SalesforceBulkClient;