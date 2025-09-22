#!/usr/bin/env node

/**
 * Base Processor Class - Instance-Agnostic Data Processing Framework
 *
 * This abstract class provides the foundation for all data processing operations.
 * Extend this class to implement specific operations like deduplication, migration, etc.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class BaseProcessor extends EventEmitter {
    constructor(config = {}) {
        super();

        // Configuration
        this.config = {
            batchSize: parseInt(process.env.DEFAULT_BATCH_SIZE) || 1000,
            maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
            retryDelay: parseInt(process.env.RETRY_DELAY_MS) || 1000,
            dryRun: process.env.DRY_RUN_DEFAULT === 'true',
            validateBeforeProcess: process.env.VALIDATE_BEFORE_PROCESS === 'true',
            enableCheckpoints: process.env.ENABLE_CHECKPOINTS === 'true',
            checkpointInterval: parseInt(process.env.CHECKPOINT_INTERVAL) || 100,
            ...config
        };

        // State management
        this.sessionId = this.generateSessionId();
        this.state = {
            status: 'initialized',
            totalRecords: 0,
            processedRecords: 0,
            successCount: 0,
            errorCount: 0,
            skipCount: 0,
            startTime: null,
            endTime: null,
            currentBatch: 0,
            errors: [],
            checkpoints: []
        };

        // Checkpoint management
        this.checkpointFile = this.config.checkpointFile ||
            `./checkpoints/${this.sessionId}.json`;

        // Audit logging
        this.auditLog = [];
        this.auditFile = process.env.AUDIT_FILE ||
            `./logs/audit-${this.sessionId}.log`;

        // Performance tracking
        this.metrics = {
            apiCalls: 0,
            apiResponseTime: [],
            memoryUsage: [],
            processingTime: []
        };
    }

    /**
     * Initialize the processor
     * Override this method to add custom initialization
     */
    async initialize() {
        this.log('info', 'Initializing processor...');

        // Load checkpoint if exists
        if (this.config.enableCheckpoints && fs.existsSync(this.checkpointFile)) {
            await this.loadCheckpoint();
        }

        // Create necessary directories
        this.ensureDirectories();

        // Initialize connection (to be implemented by subclasses)
        await this.initializeConnection();

        this.state.status = 'ready';
        this.emit('initialized', this.state);

        return this;
    }

    /**
     * Main processing method
     * @param {Object} options Processing options
     */
    async process(options = {}) {
        try {
            this.state.startTime = new Date();
            this.state.status = 'processing';
            this.emit('processing:start', this.state);

            // Pre-processing validation
            if (this.config.validateBeforeProcess) {
                await this.validate();
            }

            // Fetch data to process
            const data = await this.fetchData(options);
            this.state.totalRecords = data.length;

            // Process in batches
            const batches = this.createBatches(data, this.config.batchSize);

            for (let i = 0; i < batches.length; i++) {
                this.state.currentBatch = i + 1;

                // Check if we should resume from checkpoint
                if (this.shouldSkipBatch(i)) {
                    this.log('info', `Skipping batch ${i + 1} (already processed)`);
                    continue;
                }

                try {
                    await this.processBatch(batches[i], i);

                    // Save checkpoint
                    if (this.shouldSaveCheckpoint()) {
                        await this.saveCheckpoint();
                    }
                } catch (error) {
                    await this.handleBatchError(error, batches[i], i);
                }

                // Emit progress
                this.emitProgress();
            }

            // Post-processing
            await this.postProcess();

            this.state.status = 'completed';
            this.state.endTime = new Date();
            this.emit('processing:complete', this.state);

            // Generate report
            return this.generateReport();

        } catch (error) {
            this.state.status = 'error';
            this.state.endTime = new Date();
            this.emit('processing:error', { error, state: this.state });
            throw error;
        }
    }

    /**
     * Process a single batch of records
     * @param {Array} batch Batch of records to process
     * @param {Number} batchIndex Index of the batch
     */
    async processBatch(batch, batchIndex) {
        this.log('info', `Processing batch ${batchIndex + 1} with ${batch.length} records`);

        const results = [];

        for (const record of batch) {
            try {
                // Track processing time
                const startTime = Date.now();

                // Process individual record (to be implemented by subclasses)
                const result = await this.processRecord(record);

                // Track metrics
                this.metrics.processingTime.push(Date.now() - startTime);

                // Update state
                this.state.processedRecords++;
                if (result.success) {
                    this.state.successCount++;
                } else if (result.skipped) {
                    this.state.skipCount++;
                } else {
                    this.state.errorCount++;
                }

                // Audit log
                if (process.env.AUDIT_TRAIL === 'true') {
                    this.addAuditEntry(record, result);
                }

                results.push(result);

            } catch (error) {
                await this.handleRecordError(error, record);
            }
        }

        return results;
    }

    /**
     * Process a single record (abstract method)
     * Must be implemented by subclasses
     * @param {Object} record Record to process
     */
    async processRecord(record) {
        throw new Error('processRecord method must be implemented by subclass');
    }

    /**
     * Fetch data to process (abstract method)
     * Must be implemented by subclasses
     * @param {Object} options Fetch options
     */
    async fetchData(options) {
        throw new Error('fetchData method must be implemented by subclass');
    }

    /**
     * Initialize connection (abstract method)
     * Must be implemented by subclasses
     */
    async initializeConnection() {
        throw new Error('initializeConnection method must be implemented by subclass');
    }

    /**
     * Validate before processing
     */
    async validate() {
        this.log('info', 'Validating configuration and data...');

        // Check required configuration
        const requiredConfig = this.getRequiredConfig();
        for (const key of requiredConfig) {
            if (!this.config[key] && !process.env[key]) {
                throw new Error(`Required configuration missing: ${key}`);
            }
        }

        // Custom validation (can be overridden)
        await this.customValidation();

        return true;
    }

    /**
     * Custom validation (override in subclasses)
     */
    async customValidation() {
        // Override in subclasses for custom validation
        return true;
    }

    /**
     * Get required configuration keys (override in subclasses)
     */
    getRequiredConfig() {
        return [];
    }

    /**
     * Post-processing operations
     */
    async postProcess() {
        this.log('info', 'Running post-processing operations...');

        // Save final checkpoint
        if (this.config.enableCheckpoints) {
            await this.saveCheckpoint();
        }

        // Save audit log
        if (process.env.AUDIT_TRAIL === 'true') {
            await this.saveAuditLog();
        }

        // Custom post-processing (can be overridden)
        await this.customPostProcess();
    }

    /**
     * Custom post-processing (override in subclasses)
     */
    async customPostProcess() {
        // Override in subclasses
    }

    /**
     * Create batches from data array
     */
    createBatches(data, batchSize) {
        const batches = [];
        for (let i = 0; i < data.length; i += batchSize) {
            batches.push(data.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Handle batch processing error
     */
    async handleBatchError(error, batch, batchIndex) {
        this.log('error', `Error processing batch ${batchIndex + 1}: ${error.message}`);

        if (this.config.maxRetries > 0) {
            for (let retry = 1; retry <= this.config.maxRetries; retry++) {
                this.log('info', `Retrying batch ${batchIndex + 1} (attempt ${retry}/${this.config.maxRetries})`);

                await this.sleep(this.config.retryDelay * Math.pow(2, retry - 1));

                try {
                    await this.processBatch(batch, batchIndex);
                    return;
                } catch (retryError) {
                    if (retry === this.config.maxRetries) {
                        this.state.errors.push({
                            batch: batchIndex,
                            error: retryError.message,
                            records: batch.length
                        });
                    }
                }
            }
        }
    }

    /**
     * Handle individual record error
     */
    async handleRecordError(error, record) {
        this.log('error', `Error processing record ${record.Id || 'unknown'}: ${error.message}`);

        this.state.errorCount++;
        this.state.errors.push({
            record: record.Id || 'unknown',
            error: error.message,
            timestamp: new Date()
        });
    }

    /**
     * Save checkpoint
     */
    async saveCheckpoint() {
        const checkpoint = {
            sessionId: this.sessionId,
            timestamp: new Date(),
            state: this.state,
            config: this.config
        };

        const dir = path.dirname(this.checkpointFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(this.checkpointFile, JSON.stringify(checkpoint, null, 2));
        this.log('debug', `Checkpoint saved: ${this.checkpointFile}`);
    }

    /**
     * Load checkpoint
     */
    async loadCheckpoint() {
        if (fs.existsSync(this.checkpointFile)) {
            const checkpoint = JSON.parse(fs.readFileSync(this.checkpointFile, 'utf8'));
            this.state = checkpoint.state;
            this.log('info', `Checkpoint loaded: ${checkpoint.state.processedRecords} records already processed`);
        }
    }

    /**
     * Should save checkpoint
     */
    shouldSaveCheckpoint() {
        return this.config.enableCheckpoints &&
               this.state.processedRecords % this.config.checkpointInterval === 0;
    }

    /**
     * Should skip batch (already processed)
     */
    shouldSkipBatch(batchIndex) {
        return this.state.checkpoints.includes(batchIndex);
    }

    /**
     * Add audit log entry
     */
    addAuditEntry(record, result) {
        this.auditLog.push({
            timestamp: new Date(),
            sessionId: this.sessionId,
            recordId: record.Id || 'unknown',
            operation: this.constructor.name,
            before: record,
            after: result.data,
            status: result.success ? 'success' : 'error',
            error: result.error
        });
    }

    /**
     * Save audit log
     */
    async saveAuditLog() {
        const dir = path.dirname(this.auditFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const auditContent = this.auditLog.map(entry => JSON.stringify(entry)).join('\n');
        fs.writeFileSync(this.auditFile, auditContent);
        this.log('info', `Audit log saved: ${this.auditFile}`);
    }

    /**
     * Emit progress update
     */
    emitProgress() {
        const progress = {
            processed: this.state.processedRecords,
            total: this.state.totalRecords,
            percentage: (this.state.processedRecords / this.state.totalRecords * 100).toFixed(2),
            success: this.state.successCount,
            errors: this.state.errorCount,
            skipped: this.state.skipCount,
            currentBatch: this.state.currentBatch,
            rate: this.calculateProcessingRate()
        };

        this.emit('progress', progress);

        if (process.env.REPORT_INTERVAL_RECORDS &&
            this.state.processedRecords % parseInt(process.env.REPORT_INTERVAL_RECORDS) === 0) {
            this.log('info', `Progress: ${progress.percentage}% (${progress.processed}/${progress.total})`);
        }
    }

    /**
     * Calculate processing rate
     */
    calculateProcessingRate() {
        if (!this.state.startTime) return 0;

        const elapsed = (Date.now() - this.state.startTime) / 1000;
        return Math.round(this.state.processedRecords / elapsed);
    }

    /**
     * Generate final report
     */
    generateReport() {
        const duration = this.state.endTime - this.state.startTime;

        return {
            sessionId: this.sessionId,
            status: this.state.status,
            summary: {
                totalRecords: this.state.totalRecords,
                processed: this.state.processedRecords,
                success: this.state.successCount,
                errors: this.state.errorCount,
                skipped: this.state.skipCount
            },
            performance: {
                duration: duration,
                durationFormatted: this.formatDuration(duration),
                averageRate: this.calculateProcessingRate(),
                averageProcessingTime: this.calculateAverageMetric(this.metrics.processingTime),
                averageApiResponseTime: this.calculateAverageMetric(this.metrics.apiResponseTime)
            },
            errors: this.state.errors,
            auditFile: this.auditFile,
            checkpointFile: this.checkpointFile
        };
    }

    /**
     * Utility: Generate session ID
     */
    generateSessionId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Utility: Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Utility: Format duration
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Utility: Calculate average of metric array
     */
    calculateAverageMetric(metricArray) {
        if (!metricArray || metricArray.length === 0) return 0;
        return metricArray.reduce((a, b) => a + b, 0) / metricArray.length;
    }

    /**
     * Utility: Ensure required directories exist
     */
    ensureDirectories() {
        const dirs = [
            './checkpoints',
            './logs',
            './output',
            './tmp'
        ];

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }

    /**
     * Logging utility
     */
    log(level, message, data = null) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            sessionId: this.sessionId,
            data
        };

        // Console output
        if (process.env.LOG_LEVEL && this.shouldLog(level)) {
            console.log(`[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}`);
            if (data) console.log(JSON.stringify(data, null, 2));
        }

        // Emit log event
        this.emit('log', logEntry);
    }

    /**
     * Check if should log based on level
     */
    shouldLog(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const configLevel = process.env.LOG_LEVEL || 'info';
        return levels.indexOf(level) >= levels.indexOf(configLevel);
    }
}

module.exports = BaseProcessor;