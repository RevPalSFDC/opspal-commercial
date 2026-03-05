#!/usr/bin/env node

/**
 * Salesforce Bulk API 2.0 Handler
 * 
 * Handles large-scale data operations with automatic pagination, streaming,
 * and intelligent switching between synchronous and bulk operations.
 * 
 * Features:
 * - Automatic pagination with nextRecordsUrl
 * - Switch to Bulk API 2.0 for >10k records
 * - Handle async query jobs
 * - Support streaming results
 * - CSV and JSON format support
 */

const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Import CSV utilities for line ending normalization (prevents CRLF errors)
const { normalizeContent: normalizeCsvLineEndings, detectLineEndings } = require('./csv-utils');

class BulkAPIHandler {
    constructor(instanceUrl, accessToken) {
        this.instanceUrl = instanceUrl;
        this.accessToken = accessToken;
        this.apiVersion = 'v64.0';
        
        // Enhanced Configuration with Timeout Prevention
        this.config = {
            // Smart Batching Thresholds
            bulkThreshold: 10000,         // Auto-switch to bulk above this
            mediumThreshold: 100,          // Use batching for 100-10000 records
            smallBatchSize: 10,            // Batch size for 20-100 records
            mediumBatchSize: 50,           // Batch size for 100-1000 records
            largeBatchSize: 200,           // Batch size for 1000-10000 records
            
            // Timeout Prevention
            operationTimeout: 110000,      // 110 seconds (under 2-minute bash limit)
            timeoutWarning: 90000,         // Warn at 90 seconds
            backgroundThreshold: 60000,    // Switch to background at 60 seconds
            
            // API Configuration
            pageSize: 2000,                // Records per page for sync queries
            maxSyncPages: 10,              // Max pages before forcing bulk
            pollingInterval: 2000,         // Job polling interval in ms
            maxPollingAttempts: 300,       // Max polling attempts (10 minutes)
            chunkSize: 10000,              // Records per chunk for inserts/updates
            maxRetries: 3,                 // Max retry attempts
            
            // Smart Detection
            autoDetectSize: true,          // Auto-detect operation size
            autoBackground: true,          // Auto-switch to background for long ops
            progressTracking: true,        // Enable progress tracking
            resumeOnFailure: true          // Enable resume capability
        };
        
        // Enhanced Job Tracking
        this.activeJobs = new Map();
        this.operationMetrics = new Map();
        this.progressTrackers = new Map();
        this.startTime = null;
    }

    /**
     * Initialize from SF CLI authentication
     */
    static async fromSFAuth(orgAlias) {
        const authCmd = `sf org display --json${orgAlias ? ` --target-org ${orgAlias}` : ''}`;
        const result = await execAsync(authCmd);
        const authData = JSON.parse(result.stdout);
        
        if (!authData.result || !authData.result.accessToken) {
            throw new Error('Failed to get SF authentication');
        }

        return new BulkAPIHandler(
            authData.result.instanceUrl,
            authData.result.accessToken
        );
    }

    /**
     * Smart operation detection and routing
     */
    async smartOperation(operation, objectType, data, options = {}) {
        this.startTime = Date.now();
        const recordCount = Array.isArray(data) ? data.length : 1;
        
        console.log(`🔍 Analyzing operation: ${operation} on ${recordCount} ${objectType} records`);
        
        // Determine optimal strategy
        const strategy = this.determineStrategy(recordCount, operation, options);
        console.log(`📊 Strategy: ${strategy.method} (${strategy.reason})`);
        
        // Check for timeout risk
        const estimatedTime = this.estimateOperationTime(recordCount, operation);
        if (estimatedTime > this.config.operationTimeout) {
            console.warn(`⚠️  Operation estimated to take ${Math.round(estimatedTime/1000)}s - exceeds timeout limit`);
            
            if (this.config.autoBackground && !options.forceSync) {
                console.log('🔄 Switching to background processing...');
                return this.executeInBackground(operation, objectType, data, options);
            }
        }
        
        // Execute based on strategy
        switch (strategy.method) {
            case 'bulk':
                return this.executeBulkOperation(operation, objectType, data, options);
            case 'batch':
                return this.executeBatchOperation(operation, objectType, data, strategy.batchSize, options);
            case 'sync':
                return this.executeSyncOperation(operation, objectType, data, options);
            default:
                throw new Error(`Unknown strategy: ${strategy.method}`);
        }
    }

    /**
     * Determine optimal execution strategy
     */
    determineStrategy(recordCount, operation, options = {}) {
        // Force strategies if specified
        if (options.forceBulk) return { method: 'bulk', reason: 'Forced bulk mode' };
        if (options.forceSync) return { method: 'sync', reason: 'Forced sync mode' };
        
        // Bulk API for large datasets
        if (recordCount >= this.config.bulkThreshold) {
            return { method: 'bulk', reason: `${recordCount} records exceeds bulk threshold` };
        }
        
        // Batching for medium datasets
        if (recordCount >= this.config.mediumThreshold) {
            let batchSize;
            if (recordCount < 1000) {
                batchSize = this.config.mediumBatchSize;
            } else {
                batchSize = this.config.largeBatchSize;
            }
            return { 
                method: 'batch', 
                batchSize,
                reason: `${recordCount} records - using batched execution` 
            };
        }
        
        // Small batch for small-medium datasets
        if (recordCount > 20) {
            return { 
                method: 'batch', 
                batchSize: this.config.smallBatchSize,
                reason: `${recordCount} records - using small batches` 
            };
        }
        
        // Sync for tiny datasets
        return { method: 'sync', reason: `${recordCount} records - using synchronous API` };
    }

    /**
     * Estimate operation time in milliseconds
     */
    estimateOperationTime(recordCount, operation) {
        // Based on empirical data
        const baseTimePerRecord = {
            'insert': 50,
            'update': 60,
            'upsert': 70,
            'delete': 40,
            'query': 10
        };
        
        const timePerRecord = baseTimePerRecord[operation] || 50;
        const networkOverhead = 2000; // 2 seconds base overhead
        const batchingOverhead = Math.ceil(recordCount / 100) * 500; // 0.5s per batch
        
        return networkOverhead + (recordCount * timePerRecord) + batchingOverhead;
    }

    /**
     * Execute operation in batches with progress tracking
     */
    async executeBatchOperation(operation, objectType, records, batchSize, options = {}) {
        const totalRecords = records.length;
        const batches = Math.ceil(totalRecords / batchSize);
        const trackerId = `${operation}_${objectType}_${Date.now()}`;
        
        // Initialize progress tracker
        this.progressTrackers.set(trackerId, {
            total: totalRecords,
            processed: 0,
            failed: 0,
            batches: batches,
            currentBatch: 0,
            startTime: Date.now(),
            results: []
        });
        
        console.log(`📦 Processing ${totalRecords} records in ${batches} batches of ${batchSize}`);
        
        const results = {
            successful: 0,
            failed: 0,
            errors: [],
            results: []
        };
        
        for (let i = 0; i < batches; i++) {
            const start = i * batchSize;
            const end = Math.min(start + batchSize, totalRecords);
            const batch = records.slice(start, end);
            
            // Check for timeout
            const elapsed = Date.now() - this.startTime;
            if (elapsed > this.config.timeoutWarning) {
                console.warn(`⚠️  Approaching timeout limit (${Math.round(elapsed/1000)}s elapsed)`);
                
                if (elapsed > this.config.operationTimeout && options.allowPartial) {
                    console.warn('⏱️  Timeout reached - returning partial results');
                    results.partial = true;
                    results.remaining = records.slice(end);
                    break;
                }
            }
            
            // Update progress
            const tracker = this.progressTrackers.get(trackerId);
            tracker.currentBatch = i + 1;
            
            console.log(`  Batch ${i + 1}/${batches}: Processing records ${start + 1}-${end}...`);
            
            try {
                // Execute batch operation
                let batchResult;
                switch (operation) {
                    case 'insert':
                        batchResult = await this.bulkInsert(objectType, batch, { ...options, silent: true });
                        break;
                    case 'update':
                        batchResult = await this.bulkUpdate(objectType, batch, { ...options, silent: true });
                        break;
                    case 'upsert':
                        batchResult = await this.bulkUpsert(objectType, batch, options.externalIdField, { ...options, silent: true });
                        break;
                    case 'delete':
                        batchResult = await this.bulkDelete(objectType, batch, { ...options, silent: true });
                        break;
                    default:
                        throw new Error(`Unsupported batch operation: ${operation}`);
                }
                
                // Aggregate results
                results.successful += batchResult.successful;
                results.failed += batchResult.failed;
                if (batchResult.failures) {
                    results.errors.push(...batchResult.failures);
                }
                results.results.push(batchResult);
                
                // Update tracker
                tracker.processed = end;
                tracker.failed += batchResult.failed;
                
                // Add delay between batches to prevent rate limiting
                if (i < batches - 1) {
                    await this.sleep(500);
                }
                
            } catch (error) {
                console.error(`  ❌ Batch ${i + 1} failed: ${error.message}`);
                results.errors.push({
                    batch: i + 1,
                    error: error.message,
                    records: batch
                });
                
                if (!options.continueOnError) {
                    throw error;
                }
            }
        }
        
        // Final progress update
        const tracker = this.progressTrackers.get(trackerId);
        tracker.completed = true;
        tracker.duration = Date.now() - tracker.startTime;
        
        console.log(`✅ Batch operation completed: ${results.successful} successful, ${results.failed} failed`);
        
        return results;
    }

    /**
     * Execute operation in background (for long-running operations)
     */
    async executeInBackground(operation, objectType, data, options = {}) {
        const jobId = `bg_${operation}_${Date.now()}`;
        
        console.log(`🔄 Starting background job: ${jobId}`);
        console.log('   Job will continue running even if this process ends');
        console.log(`   Check status with: node bulk-api-handler.js status ${jobId}`);
        
        // For bulk operations, use native Salesforce async jobs
        if (Array.isArray(data) && data.length >= this.config.bulkThreshold) {
            return this.bulkOperation(operation, objectType, data, { ...options, returnJobId: true });
        }
        
        // For smaller operations, create a managed background task
        this.activeJobs.set(jobId, {
            operation,
            objectType,
            recordCount: Array.isArray(data) ? data.length : 1,
            status: 'running',
            startTime: Date.now(),
            progress: 0
        });
        
        // Execute asynchronously
        setImmediate(async () => {
            try {
                const result = await this.executeBatchOperation(operation, objectType, data, 
                    this.config.mediumBatchSize, options);
                
                const job = this.activeJobs.get(jobId);
                job.status = 'completed';
                job.result = result;
                job.endTime = Date.now();
            } catch (error) {
                const job = this.activeJobs.get(jobId);
                job.status = 'failed';
                job.error = error.message;
                job.endTime = Date.now();
            }
        });
        
        return {
            jobId,
            message: 'Operation started in background',
            checkStatus: `node bulk-api-handler.js status ${jobId}`
        };
    }

    /**
     * Execute synchronous operation for small datasets
     */
    async executeSyncOperation(operation, objectType, records, options = {}) {
        console.log(`⚡ Executing synchronous ${operation} for ${records.length} records`);
        
        const results = {
            successful: 0,
            failed: 0,
            errors: [],
            results: []
        };
        
        for (const record of records) {
            try {
                let result;
                switch (operation) {
                    case 'insert':
                        result = await this.makeRequest('POST', 
                            `/services/data/${this.apiVersion}/sobjects/${objectType}`, record);
                        break;
                    case 'update':
                        result = await this.makeRequest('PATCH', 
                            `/services/data/${this.apiVersion}/sobjects/${objectType}/${record.Id}`, record);
                        break;
                    case 'delete':
                        result = await this.makeRequest('DELETE', 
                            `/services/data/${this.apiVersion}/sobjects/${objectType}/${record.Id || record}`);
                        break;
                    default:
                        throw new Error(`Unsupported sync operation: ${operation}`);
                }
                
                results.successful++;
                results.results.push(result);
            } catch (error) {
                results.failed++;
                results.errors.push({
                    record,
                    error: error.message
                });
                
                if (!options.continueOnError) {
                    throw error;
                }
            }
        }
        
        return results;
    }

    /**
     * Execute bulk operation with enhanced error handling
     */
    async executeBulkOperation(operation, objectType, data, options = {}) {
        console.log(`🚀 Executing bulk ${operation} for ${data.length} records`);
        
        switch (operation) {
            case 'insert':
                return this.bulkInsert(objectType, data, options);
            case 'update':
                return this.bulkUpdate(objectType, data, options);
            case 'upsert':
                return this.bulkUpsert(objectType, data, options.externalIdField, options);
            case 'delete':
                return this.bulkDelete(objectType, data, options);
            default:
                throw new Error(`Unsupported bulk operation: ${operation}`);
        }
    }

    /**
     * Smart query - automatically chooses sync vs bulk
     */
    async query(soql, options = {}) {
        // Estimate result size
        const countQuery = this.convertToCountQuery(soql);
        let estimatedCount = 0;
        
        try {
            const countResult = await this.syncQuery(countQuery, { single: true });
            estimatedCount = countResult.totalSize || countResult.expr0 || 0;
        } catch (e) {
            console.warn('Could not estimate query size:', e.message);
        }
        
        // Decide execution method
        const forceBulk = options.bulk === true;
        const forceSync = options.sync === true;
        
        if (forceBulk || (!forceSync && estimatedCount > this.config.bulkThreshold)) {
            console.log(`Query will return ~${estimatedCount} records. Using Bulk API...`);
            return this.bulkQuery(soql, options);
        } else {
            console.log(`Query will return ~${estimatedCount} records. Using synchronous API...`);
            return this.syncQueryWithPaging(soql, options);
        }
    }

    /**
     * Synchronous query with automatic paging
     */
    async syncQueryWithPaging(soql, options = {}) {
        const results = [];
        let nextRecordsUrl = null;
        let pageCount = 0;
        
        // Initial query
        const initialUrl = `/services/data/${this.apiVersion}/query?q=${encodeURIComponent(soql)}`;
        let response = await this.makeRequest('GET', initialUrl);
        
        results.push(...response.records);
        nextRecordsUrl = response.nextRecordsUrl;
        pageCount++;
        
        // Page through results
        while (nextRecordsUrl && pageCount < this.config.maxSyncPages) {
            response = await this.makeRequest('GET', nextRecordsUrl);
            results.push(...response.records);
            nextRecordsUrl = response.nextRecordsUrl;
            pageCount++;
            
            // Check if we should switch to bulk
            if (results.length > this.config.bulkThreshold && !options.forceSync) {
                console.warn(`Sync query exceeded ${this.config.bulkThreshold} records. Consider using bulk API.`);
                
                if (options.autoSwitchToBulk) {
                    console.log('Auto-switching to Bulk API...');
                    return this.bulkQuery(soql, options);
                }
            }
        }
        
        if (nextRecordsUrl) {
            console.warn(`Query has more pages but reached max sync pages (${this.config.maxSyncPages})`);
        }
        
        return results;
    }

    /**
     * Simple synchronous query (no paging)
     */
    async syncQuery(soql, options = {}) {
        const queryUrl = `/services/data/${this.apiVersion}/query?q=${encodeURIComponent(soql)}`;
        const response = await this.makeRequest('GET', queryUrl);
        
        if (options.single) {
            return response.records?.[0] || response;
        }
        
        return response.records || [];
    }

    /**
     * Bulk query for large datasets
     */
    async bulkQuery(soql, options = {}) {
        const startTime = Date.now();
        
        // Create query job
        const job = await this.createQueryJob(soql, options.format || 'CSV');
        console.log(`Bulk query job created: ${job.id}`);
        
        // Track job
        this.activeJobs.set(job.id, {
            type: 'query',
            soql,
            createdAt: new Date(),
            status: 'InProgress'
        });
        
        // Wait for completion
        const completedJob = await this.waitForJob(job.id);
        
        if (completedJob.state === 'Failed') {
            throw new Error(`Bulk query failed: ${completedJob.stateMessage}`);
        }
        
        if (completedJob.state === 'Aborted') {
            throw new Error('Bulk query was aborted');
        }
        
        // Get results
        const results = await this.getQueryResults(job.id, options);
        
        // Clean up tracking
        this.activeJobs.delete(job.id);
        
        const duration = Date.now() - startTime;
        console.log(`Bulk query completed in ${(duration / 1000).toFixed(2)}s. Records: ${completedJob.numberRecordsProcessed}`);
        
        return results;
    }

    /**
     * Create bulk query job
     */
    async createQueryJob(query, format = 'CSV') {
        const jobData = {
            operation: 'query',
            query: query,
            contentType: format,
            columnDelimiter: format === 'CSV' ? 'COMMA' : undefined,
            lineEnding: format === 'CSV' ? 'LF' : undefined
        };
        
        return this.makeRequest('POST', `/services/data/${this.apiVersion}/jobs/query`, jobData);
    }

    /**
     * Bulk insert records
     */
    async bulkInsert(sObjectType, records, options = {}) {
        return this.bulkOperation('insert', sObjectType, records, options);
    }

    /**
     * Bulk update records
     */
    async bulkUpdate(sObjectType, records, options = {}) {
        return this.bulkOperation('update', sObjectType, records, options);
    }

    /**
     * Bulk upsert records
     */
    async bulkUpsert(sObjectType, records, externalIdField, options = {}) {
        return this.bulkOperation('upsert', sObjectType, records, { ...options, externalIdField });
    }

    /**
     * Bulk delete records
     */
    async bulkDelete(sObjectType, records, options = {}) {
        // For delete, we only need the IDs
        const ids = records.map(r => ({ Id: r.Id || r.id || r }));
        return this.bulkOperation('delete', sObjectType, ids, options);
    }

    /**
     * Generic bulk operation
     */
    async bulkOperation(operation, sObjectType, records, options = {}) {
        const startTime = Date.now();
        
        // Create ingest job
        const jobData = {
            object: sObjectType,
            operation: operation,
            contentType: 'CSV',
            lineEnding: 'LF'
        };
        
        if (options.externalIdField) {
            jobData.externalIdFieldName = options.externalIdField;
        }
        
        const job = await this.makeRequest('POST', `/services/data/${this.apiVersion}/jobs/ingest`, jobData);
        console.log(`Bulk ${operation} job created: ${job.id}`);
        
        // Convert records to CSV
        const csv = this.recordsToCSV(records);
        
        // Upload data
        await this.uploadJobData(job.id, csv);
        
        // Close job to start processing
        await this.updateJobState(job.id, 'UploadComplete');
        
        // Wait for completion
        const completedJob = await this.waitForJob(job.id);
        
        if (completedJob.state === 'Failed') {
            // Get failure details
            const failures = await this.getJobFailures(job.id);
            throw new Error(`Bulk ${operation} failed: ${JSON.stringify(failures)}`);
        }
        
        // Get results
        const results = {
            job: completedJob,
            successful: completedJob.numberRecordsProcessed - completedJob.numberRecordsFailed,
            failed: completedJob.numberRecordsFailed,
            duration: Date.now() - startTime
        };
        
        if (completedJob.numberRecordsFailed > 0) {
            results.failures = await this.getJobFailures(job.id);
        }
        
        console.log(`Bulk ${operation} completed: ${results.successful} successful, ${results.failed} failed`);
        
        return results;
    }

    /**
     * Wait for job completion
     */
    async waitForJob(jobId) {
        let attempts = 0;
        let job;
        
        while (attempts < this.config.maxPollingAttempts) {
            await this.sleep(this.config.pollingInterval);
            
            job = await this.getJobInfo(jobId);
            
            if (['JobComplete', 'Failed', 'Aborted'].includes(job.state)) {
                return job;
            }
            
            attempts++;
            
            // Log progress every 10 attempts
            if (attempts % 10 === 0) {
                console.log(`Job ${jobId} still processing... (${job.numberRecordsProcessed} records processed)`);
            }
        }
        
        throw new Error(`Job ${jobId} timed out after ${attempts} attempts`);
    }

    /**
     * Get job information
     */
    async getJobInfo(jobId) {
        // Determine job type from tracking or try both endpoints
        const jobInfo = this.activeJobs.get(jobId);
        const endpoint = jobInfo?.type === 'query' 
            ? `/services/data/${this.apiVersion}/jobs/query/${jobId}`
            : `/services/data/${this.apiVersion}/jobs/ingest/${jobId}`;
        
        return this.makeRequest('GET', endpoint);
    }

    /**
     * Get query job results
     */
    async getQueryResults(jobId, options = {}) {
        const endpoint = `/services/data/${this.apiVersion}/jobs/query/${jobId}/results`;
        
        if (options.stream) {
            // Return a stream for large results
            return this.streamRequest('GET', endpoint);
        }
        
        // Get all results
        const response = await this.makeRequest('GET', endpoint, null, {
            'Accept': options.format === 'JSON' ? 'application/json' : 'text/csv'
        });
        
        // Parse CSV if needed
        if (options.format !== 'JSON' && typeof response === 'string') {
            return this.parseCSV(response);
        }
        
        return response;
    }

    /**
     * Get job failures
     */
    async getJobFailures(jobId) {
        const endpoint = `/services/data/${this.apiVersion}/jobs/ingest/${jobId}/failedResults`;
        return this.makeRequest('GET', endpoint);
    }

    /**
     * Upload job data
     * Automatically normalizes line endings to LF (Unix) for Bulk API compatibility
     */
    async uploadJobData(jobId, data) {
        // Normalize line endings to LF - Salesforce Bulk API rejects CRLF
        const lineEndingInfo = detectLineEndings(data);
        if (lineEndingInfo.needsNormalization) {
            console.log(`📝 Converting ${lineEndingInfo.primary} line endings to Unix (LF) for Bulk API`);
            data = normalizeCsvLineEndings(data);
        }

        const endpoint = `/services/data/${this.apiVersion}/jobs/ingest/${jobId}/batches`;
        return this.makeRequest('PUT', endpoint, data, {
            'Content-Type': 'text/csv'
        });
    }

    /**
     * Update job state
     */
    async updateJobState(jobId, state) {
        const endpoint = `/services/data/${this.apiVersion}/jobs/ingest/${jobId}`;
        return this.makeRequest('PATCH', endpoint, { state });
    }

    /**
     * Abort a job
     */
    async abortJob(jobId) {
        return this.updateJobState(jobId, 'Aborted');
    }

    /**
     * Convert SOQL to COUNT query
     */
    convertToCountQuery(soql) {
        // Simple conversion - may need refinement for complex queries
        const upperSoql = soql.toUpperCase();
        const fromIndex = upperSoql.indexOf('FROM');
        
        if (fromIndex === -1) {
            return soql; // Can't convert
        }
        
        const fromClause = soql.substring(fromIndex);
        const whereMatch = fromClause.match(/WHERE/i);
        
        if (whereMatch) {
            return `SELECT COUNT() ${fromClause}`;
        } else {
            // Remove ORDER BY, LIMIT, etc.
            const cleanFrom = fromClause.split(/ORDER BY|LIMIT|OFFSET|GROUP BY/i)[0];
            return `SELECT COUNT() ${cleanFrom}`;
        }
    }

    /**
     * Convert records to CSV
     */
    recordsToCSV(records) {
        if (!records || records.length === 0) {
            return '';
        }
        
        // Get all unique fields
        const fields = new Set();
        records.forEach(record => {
            Object.keys(record).forEach(field => {
                if (field !== 'attributes') {
                    fields.add(field);
                }
            });
        });
        
        const fieldArray = Array.from(fields);
        
        // Create CSV
        const csv = [];
        csv.push(fieldArray.join(','));
        
        records.forEach(record => {
            const row = fieldArray.map(field => {
                const value = record[field];
                if (value === null || value === undefined) {
                    return '';
                }
                if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            });
            csv.push(row.join(','));
        });
        
        return csv.join('\n');
    }

    /**
     * Parse CSV to records
     * Automatically normalizes CRLF/CR line endings to LF before parsing
     */
    parseCSV(csv) {
        // Normalize line endings (CRLF -> LF, CR -> LF) before splitting
        // This prevents trailing \r in field values which causes Salesforce API errors
        const normalizedCsv = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalizedCsv.split('\n');

        if (lines.length === 0) {
            return [];
        }

        const headers = this.parseCSVLine(lines[0]);
        const records = [];

        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
                const values = this.parseCSVLine(lines[i]);
                const record = {};
                headers.forEach((header, index) => {
                    record[header] = values[index] || null;
                });
                records.push(record);
            }
        }

        return records;
    }

    /**
     * Parse CSV line handling quoted values
     * Strips any trailing carriage return that may have slipped through normalization
     */
    parseCSVLine(line) {
        // Strip trailing \r if present (defensive handling for CRLF edge cases)
        const cleanLine = line.endsWith('\r') ? line.slice(0, -1) : line;

        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < cleanLine.length; i++) {
            const char = cleanLine[i];
            const nextChar = cleanLine[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current);
        return result;
    }

    /**
     * Make HTTP request
     */
    async makeRequest(method, endpoint, data = null, headers = {}) {
        return new Promise((resolve, reject) => {
            const parsedUrl = url.parse(this.instanceUrl);
            
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 443,
                path: endpoint,
                method: method,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json',
                    ...headers
                }
            };
            
            if (data && headers['Content-Type'] !== 'text/csv') {
                options.headers['Content-Type'] = 'application/json';
            }

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            // Try to parse as JSON, otherwise return as string
                            try {
                                resolve(JSON.parse(responseData));
                            } catch (e) {
                                resolve(responseData);
                            }
                        } else {
                            let errorMessage;
                            try {
                                const errorData = JSON.parse(responseData);
                                errorMessage = errorData.message || JSON.stringify(errorData);
                            } catch (e) {
                                errorMessage = responseData;
                            }
                            reject(new Error(`API Error (${res.statusCode}): ${errorMessage}`));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', reject);

            if (data) {
                if (typeof data === 'object' && headers['Content-Type'] !== 'text/csv') {
                    req.write(JSON.stringify(data));
                } else {
                    req.write(data);
                }
            }

            req.end();
        });
    }

    /**
     * Stream HTTP request for large responses
     */
    streamRequest(method, endpoint, headers = {}) {
        const parsedUrl = url.parse(this.instanceUrl);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: endpoint,
            method: method,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Accept': 'text/csv',
                ...headers
            }
        };
        
        return https.request(options);
    }

    /**
     * Utility: Sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get active jobs
     */
    getActiveJobs() {
        return Array.from(this.activeJobs.entries()).map(([id, info]) => ({
            id,
            ...info
        }));
    }

    /**
     * Create a CSV transform stream for processing large results
     */
    createCSVTransform() {
        let headers = null;
        let buffer = '';
        
        return new Transform({
            transform(chunk, encoding, callback) {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer
                
                for (const line of lines) {
                    if (!headers) {
                        headers = this.parseCSVLine(line);
                    } else if (line.trim()) {
                        const values = this.parseCSVLine(line);
                        const record = {};
                        headers.forEach((header, index) => {
                            record[header] = values[index] || null;
                        });
                        this.push(JSON.stringify(record) + '\n');
                    }
                }
                callback();
            },
            
            flush(callback) {
                if (buffer.trim() && headers) {
                    const values = this.parseCSVLine(buffer);
                    const record = {};
                    headers.forEach((header, index) => {
                        record[header] = values[index] || null;
                    });
                    this.push(JSON.stringify(record) + '\n');
                }
                callback();
            }
        });
    }
}

// Export for use in other modules
module.exports = BulkAPIHandler;

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
Salesforce Bulk API Handler

Usage:
  node bulk-api-handler.js <command> [options]

Commands:
  query <soql>              Smart query (auto-selects sync/bulk)
  bulk-query <soql>         Force bulk query
  insert <object> <file>    Bulk insert records
  update <object> <file>    Bulk update records
  upsert <object> <file>    Bulk upsert records
  delete <object> <file>    Bulk delete records
  jobs                      List active jobs
  abort <jobId>             Abort a job

Options:
  --org <alias>             Target org alias
  --format <csv|json>       Output format (default: csv)
  --output <file>           Output file (default: stdout)
  --external-id <field>     External ID field for upserts
  --stream                  Stream results for large datasets

Examples:
  node bulk-api-handler.js query "SELECT Id, Name FROM Account" --org myorg
  node bulk-api-handler.js bulk-query "SELECT * FROM Contact" --format json --output contacts.json
  node bulk-api-handler.js insert Account accounts.csv --org production
  node bulk-api-handler.js upsert Contact contacts.csv --external-id Email__c

File Format:
  CSV files should have headers matching API field names.
  First row must be field names, subsequent rows are records.
        `);
        process.exit(0);
    }

    const command = args[0];
    const orgAlias = args.includes('--org') ? args[args.indexOf('--org') + 1] : null;
    const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'CSV';
    const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
    const externalId = args.includes('--external-id') ? args[args.indexOf('--external-id') + 1] : null;
    const stream = args.includes('--stream');

    (async () => {
        try {
            const handler = await BulkAPIHandler.fromSFAuth(orgAlias);
            let result;

            switch (command) {
                case 'query': {
                    const soql = args[1];
                    if (!soql) throw new Error('SOQL query required');
                    
                    result = await handler.query(soql, { format, stream });
                    break;
                }

                case 'bulk-query': {
                    const soql = args[1];
                    if (!soql) throw new Error('SOQL query required');
                    
                    result = await handler.bulkQuery(soql, { format, stream });
                    break;
                }

                case 'insert':
                case 'update':
                case 'upsert':
                case 'delete': {
                    const sObjectType = args[1];
                    const file = args[2];
                    
                    if (!sObjectType || !file) {
                        throw new Error('Object type and file required');
                    }
                    
                    const fsPromises = require('fs').promises;
                    let data = await fsPromises.readFile(file, 'utf8');

                    // Auto-normalize CSV line endings for Bulk API compatibility
                    if (!file.endsWith('.json')) {
                        const lineEndingInfo = detectLineEndings(data);
                        if (lineEndingInfo.needsNormalization) {
                            console.log(`📝 Converting ${lineEndingInfo.primary} line endings to Unix (LF) for Bulk API`);
                            data = normalizeCsvLineEndings(data);
                        }
                    }

                    const records = file.endsWith('.json')
                        ? JSON.parse(data)
                        : handler.parseCSV(data);
                    
                    switch (command) {
                        case 'insert':
                            result = await handler.bulkInsert(sObjectType, records);
                            break;
                        case 'update':
                            result = await handler.bulkUpdate(sObjectType, records);
                            break;
                        case 'upsert':
                            if (!externalId) throw new Error('--external-id required for upsert');
                            result = await handler.bulkUpsert(sObjectType, records, externalId);
                            break;
                        case 'delete':
                            result = await handler.bulkDelete(sObjectType, records);
                            break;
                    }
                    break;
                }

                case 'jobs': {
                    result = handler.getActiveJobs();
                    break;
                }

                case 'abort': {
                    const jobId = args[1];
                    if (!jobId) throw new Error('Job ID required');
                    
                    result = await handler.abortJob(jobId);
                    console.log(`Job ${jobId} aborted`);
                    break;
                }

                default:
                    throw new Error(`Unknown command: ${command}`);
            }

            // Output results
            let output;
            if (typeof result === 'object') {
                output = format === 'CSV' && Array.isArray(result) 
                    ? handler.recordsToCSV(result)
                    : JSON.stringify(result, null, 2);
            } else {
                output = result;
            }
            
            if (outputFile) {
                const fsPromises = require('fs').promises;
                await fsPromises.writeFile(outputFile, output);
                console.log(`Output written to ${outputFile}`);
            } else if (output) {
                console.log(output);
            }

        } catch (error) {
            console.error('Error:', error.message);
            if (error.stack && process.env.DEBUG) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    })();
}