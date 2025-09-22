#!/usr/bin/env node

/**
 * Batch Processing Utilities - Instance-Agnostic Framework
 * 
 * Provides utilities for efficient batch processing with:
 * - Parallel processing
 * - Rate limiting
 * - Memory management
 * - Progress tracking
 * - Error recovery
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class BatchUtils extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            maxParallelBatches: parseInt(process.env.PARALLEL_BATCHES) || 3,
            batchSize: parseInt(process.env.DEFAULT_BATCH_SIZE) || 1000,
            maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE) || 10000,
            minBatchSize: parseInt(process.env.MIN_BATCH_SIZE) || 10,
            batchDelayMs: parseInt(process.env.BATCH_DELAY_MS) || 1000,
            memoryThresholdMB: parseInt(process.env.MEMORY_WARNING_THRESHOLD_MB) || 1024,
            autoThrottle: process.env.AUTO_THROTTLE === 'true',
            ...config
        };

        // State tracking
        this.activeProcesses = new Set();
        this.completedBatches = new Set();
        this.failedBatches = new Map();
        this.metrics = {
            totalBatches: 0,
            processedBatches: 0,
            failedBatches: 0,
            totalRecords: 0,
            processedRecords: 0,
            startTime: null,
            endTime: null
        };
    }

    /**
     * Create optimized batches from data
     * @param {Array} data Data to batch
     * @param {Object} options Batching options
     */
    createOptimizedBatches(data, options = {}) {
        const batchSize = this.calculateOptimalBatchSize(data.length, options);
        const batches = [];

        for (let i = 0; i < data.length; i += batchSize) {
            const batch = {
                id: `batch_${batches.length + 1}`,
                index: batches.length,
                data: data.slice(i, Math.min(i + batchSize, data.length)),
                startIndex: i,
                endIndex: Math.min(i + batchSize - 1, data.length - 1),
                size: Math.min(batchSize, data.length - i),
                status: 'pending',
                attempts: 0,
                errors: []
            };

            batches.push(batch);
        }

        this.metrics.totalBatches = batches.length;
        this.metrics.totalRecords = data.length;

        this.emit('batches:created', {
            totalBatches: batches.length,
            batchSize: batchSize,
            totalRecords: data.length
        });

        return batches;
    }

    /**
     * Calculate optimal batch size based on various factors
     */
    calculateOptimalBatchSize(totalRecords, options = {}) {
        let batchSize = options.batchSize || this.config.batchSize;

        // Adjust based on total records
        if (totalRecords < 100) {
            batchSize = Math.min(10, totalRecords);
        } else if (totalRecords < 1000) {
            batchSize = Math.min(50, batchSize);
        } else if (totalRecords > 100000) {
            batchSize = Math.min(5000, this.config.maxBatchSize);
        }

        // Adjust based on memory usage
        if (this.config.autoThrottle) {
            const memoryUsage = this.getMemoryUsageMB();
            if (memoryUsage > this.config.memoryThresholdMB * 0.8) {
                batchSize = Math.max(this.config.minBatchSize, Math.floor(batchSize / 2));
                this.emit('throttle:memory', { memoryUsage, newBatchSize: batchSize });
            }
        }

        // Ensure within bounds
        batchSize = Math.max(this.config.minBatchSize, Math.min(this.config.maxBatchSize, batchSize));

        return batchSize;
    }

    /**
     * Process batches in parallel with rate limiting
     * @param {Array} batches Batches to process
     * @param {Function} processor Function to process each batch
     * @param {Object} options Processing options
     */
    async processInParallel(batches, processor, options = {}) {
        const maxParallel = options.maxParallel || this.config.maxParallelBatches;
        const results = [];
        this.metrics.startTime = new Date();

        // Process in chunks to control parallelism
        for (let i = 0; i < batches.length; i += maxParallel) {
            const chunk = batches.slice(i, Math.min(i + maxParallel, batches.length));
            
            // Process chunk in parallel
            const chunkPromises = chunk.map(batch => this.processSingleBatch(batch, processor));
            
            const chunkResults = await Promise.allSettled(chunkPromises);
            
            // Handle results
            for (let j = 0; j < chunkResults.length; j++) {
                const result = chunkResults[j];
                const batch = chunk[j];
                
                if (result.status === 'fulfilled') {
                    this.completedBatches.add(batch.id);
                    this.metrics.processedBatches++;
                    this.metrics.processedRecords += batch.size;
                    results.push(result.value);
                } else {
                    this.failedBatches.set(batch.id, {
                        batch: batch,
                        error: result.reason,
                        timestamp: new Date()
                    });
                    this.metrics.failedBatches++;
                    
                    // Attempt retry if configured
                    if (options.retryFailed) {
                        const retryResult = await this.retryBatch(batch, processor, options);
                        if (retryResult.success) {
                            results.push(retryResult.data);
                        }
                    }
                }
            }

            // Apply rate limiting delay
            if (i + maxParallel < batches.length) {
                await this.applyRateLimit();
            }

            // Emit progress
            this.emitProgress();

            // Check memory and throttle if needed
            if (this.config.autoThrottle) {
                await this.checkAndThrottle();
            }
        }

        this.metrics.endTime = new Date();
        return results;
    }

    /**
     * Process a single batch with error handling
     */
    async processSingleBatch(batch, processor) {
        batch.status = 'processing';
        batch.startTime = new Date();
        
        try {
            this.activeProcesses.add(batch.id);
            const result = await processor(batch);
            
            batch.status = 'completed';
            batch.endTime = new Date();
            batch.processingTime = batch.endTime - batch.startTime;
            
            this.activeProcesses.delete(batch.id);
            
            return {
                batchId: batch.id,
                success: true,
                data: result,
                processingTime: batch.processingTime
            };
        } catch (error) {
            batch.status = 'failed';
            batch.endTime = new Date();
            batch.errors.push({
                attempt: batch.attempts,
                error: error.message,
                timestamp: new Date()
            });
            
            this.activeProcesses.delete(batch.id);
            
            throw error;
        } finally {
            batch.attempts++;
        }
    }

    /**
     * Retry a failed batch
     */
    async retryBatch(batch, processor, options = {}) {
        const maxRetries = options.maxRetries || 3;
        const retryDelay = options.retryDelay || 1000;
        
        if (batch.attempts >= maxRetries) {
            return { success: false, error: 'Max retries exceeded' };
        }
        
        this.emit('batch:retry', { 
            batchId: batch.id, 
            attempt: batch.attempts + 1,
            maxRetries 
        });
        
        // Exponential backoff
        await this.sleep(retryDelay * Math.pow(2, batch.attempts));
        
        try {
            const result = await this.processSingleBatch(batch, processor);
            this.failedBatches.delete(batch.id);
            this.completedBatches.add(batch.id);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Apply rate limiting between batches
     */
    async applyRateLimit() {
        await this.sleep(this.config.batchDelayMs);
    }

    /**
     * Check memory usage and throttle if needed
     */
    async checkAndThrottle() {
        const memoryUsage = this.getMemoryUsageMB();
        
        if (memoryUsage > this.config.memoryThresholdMB) {
            this.emit('throttle:triggered', { memoryUsage });
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
            // Wait for memory to stabilize
            await this.sleep(5000);
            
            // Reduce parallel processing
            if (this.config.maxParallelBatches > 1) {
                this.config.maxParallelBatches = Math.max(1, Math.floor(this.config.maxParallelBatches / 2));
                this.emit('throttle:reduced', { newParallel: this.config.maxParallelBatches });
            }
        }
    }

    /**
     * Process batches sequentially (for memory-constrained environments)
     */
    async processSequentially(batches, processor, options = {}) {
        const results = [];
        this.metrics.startTime = new Date();
        
        for (const batch of batches) {
            try {
                const result = await this.processSingleBatch(batch, processor);
                this.completedBatches.add(batch.id);
                this.metrics.processedBatches++;
                this.metrics.processedRecords += batch.size;
                results.push(result);
            } catch (error) {
                this.failedBatches.set(batch.id, {
                    batch: batch,
                    error: error,
                    timestamp: new Date()
                });
                this.metrics.failedBatches++;
                
                if (!options.continueOnError) {
                    throw error;
                }
            }
            
            // Apply rate limiting
            await this.applyRateLimit();
            
            // Emit progress
            this.emitProgress();
        }
        
        this.metrics.endTime = new Date();
        return results;
    }

    /**
     * Split batch into smaller chunks if it fails
     */
    async splitAndRetry(batch, processor, splitFactor = 2) {
        if (batch.size <= this.config.minBatchSize) {
            throw new Error('Cannot split batch further');
        }
        
        const subBatches = this.createOptimizedBatches(
            batch.data,
            { batchSize: Math.floor(batch.size / splitFactor) }
        );
        
        this.emit('batch:split', {
            originalBatchId: batch.id,
            newBatches: subBatches.length
        });
        
        return await this.processSequentially(subBatches, processor);
    }

    /**
     * Save batch results to file
     */
    async saveBatchResults(results, outputPath) {
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        const output = {
            timestamp: new Date(),
            metrics: this.metrics,
            results: results,
            failedBatches: Array.from(this.failedBatches.entries())
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        this.emit('results:saved', { path: outputPath });
    }

    /**
     * Generate CSV from batch results
     */
    generateCSV(data, headers = null) {
        if (!data || data.length === 0) return '';
        
        // Auto-detect headers if not provided
        if (!headers) {
            headers = Object.keys(data[0]);
        }
        
        const csv = [headers.join(',')];
        
        for (const row of data) {
            const values = headers.map(header => {
                const value = row[header];
                // Escape values containing commas or quotes
                if (value && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value || '';
            });
            csv.push(values.join(','));
        }
        
        return csv.join('\n');
    }

    /**
     * Emit progress update
     */
    emitProgress() {
        const progress = {
            processedBatches: this.metrics.processedBatches,
            totalBatches: this.metrics.totalBatches,
            percentComplete: (this.metrics.processedBatches / this.metrics.totalBatches * 100).toFixed(2),
            processedRecords: this.metrics.processedRecords,
            totalRecords: this.metrics.totalRecords,
            failedBatches: this.metrics.failedBatches,
            activeProcesses: this.activeProcesses.size,
            rate: this.calculateProcessingRate(),
            eta: this.calculateETA()
        };
        
        this.emit('progress', progress);
        
        if (process.env.SHOW_PROGRESS_BAR === 'true') {
            this.displayProgressBar(progress);
        }
    }

    /**
     * Display progress bar in console
     */
    displayProgressBar(progress) {
        const barLength = 40;
        const filledLength = Math.round(barLength * progress.percentComplete / 100);
        const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
        
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(
            `Progress: ${bar} ${progress.percentComplete}% | ` +
            `Batches: ${progress.processedBatches}/${progress.totalBatches} | ` +
            `Rate: ${progress.rate}/sec | ` +
            `ETA: ${progress.eta}`
        );
    }

    /**
     * Calculate processing rate
     */
    calculateProcessingRate() {
        if (!this.metrics.startTime) return 0;
        
        const elapsed = (Date.now() - this.metrics.startTime) / 1000;
        if (elapsed === 0) return 0;
        
        return Math.round(this.metrics.processedRecords / elapsed);
    }

    /**
     * Calculate estimated time of arrival
     */
    calculateETA() {
        const rate = this.calculateProcessingRate();
        if (rate === 0) return 'Unknown';
        
        const remaining = this.metrics.totalRecords - this.metrics.processedRecords;
        const secondsRemaining = remaining / rate;
        
        if (secondsRemaining < 60) {
            return `${Math.round(secondsRemaining)}s`;
        } else if (secondsRemaining < 3600) {
            return `${Math.round(secondsRemaining / 60)}m`;
        } else {
            const hours = Math.floor(secondsRemaining / 3600);
            const minutes = Math.round((secondsRemaining % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }

    /**
     * Get current memory usage in MB
     */
    getMemoryUsageMB() {
        const usage = process.memoryUsage();
        return Math.round(usage.heapUsed / 1024 / 1024);
    }

    /**
     * Utility: Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get batch statistics
     */
    getStatistics() {
        const duration = this.metrics.endTime ?
            this.metrics.endTime - this.metrics.startTime :
            Date.now() - this.metrics.startTime;
        
        return {
            ...this.metrics,
            duration: duration,
            averageProcessingRate: this.calculateProcessingRate(),
            successRate: (this.metrics.processedBatches / this.metrics.totalBatches * 100).toFixed(2),
            failureRate: (this.metrics.failedBatches / this.metrics.totalBatches * 100).toFixed(2),
            completedBatches: this.completedBatches.size,
            failedBatchDetails: Array.from(this.failedBatches.values())
        };
    }

    /**
     * Reset metrics and state
     */
    reset() {
        this.activeProcesses.clear();
        this.completedBatches.clear();
        this.failedBatches.clear();
        this.metrics = {
            totalBatches: 0,
            processedBatches: 0,
            failedBatches: 0,
            totalRecords: 0,
            processedRecords: 0,
            startTime: null,
            endTime: null
        };
    }
}

module.exports = BatchUtils;