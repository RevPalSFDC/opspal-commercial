#!/usr/bin/env node

/**
 * Bulk Decision Generator - Phase 2 Enhancement
 *
 * Extends DedupSafetyEngine with batch processing capabilities:
 * - Batch record preloading (reduces API calls 2N → 1)
 * - Parallel processing with concurrency control
 * - Progress tracking with ETA
 * - Checkpoint and resume capability
 * - Memory-efficient streaming for 50k+ pairs
 *
 * Implementation Date: 2025-10-16
 * Part of: PHASE2_DESIGN.md - Task 2.3
 *
 * Usage:
 *   node bulk-decision-generator.js process <org-alias> <pairs-file> [options]
 *   node bulk-decision-generator.js resume <checkpoint-file> [options]
 */

const fs = require('fs');
const path = require('path');
const DedupSafetyEngine = require('./dedup-safety-engine');

class BulkDecisionGenerator extends DedupSafetyEngine {
    constructor(orgAlias, backupDir, importanceReport, config = null, bulkHandler = null) {
        super(orgAlias, backupDir, importanceReport, config, bulkHandler);

        // Bulk processing configuration
        this.batchSize = (config && config.batchSize) || 100;
        this.concurrency = (config && config.concurrency) || 5;
        this.checkpointInterval = (config && config.checkpointInterval) || 1000;
        this.checkpointFile = (config && config.checkpointFile) || 'bulk-dedup-checkpoint.json';

        // Progress tracking
        this.progress = {
            totalPairs: 0,
            processedPairs: 0,
            startTime: null,
            lastCheckpointTime: null,
            currentBatch: 0,
            decisionsBreakdown: {
                approved: 0,
                review: 0,
                blocked: 0
            }
        };

        // Record cache for batch preloading
        this.recordCache = new Map();
    }

    /**
     * Process bulk pairs with batch preloading and progress tracking
     * @param {Array} pairsArray - Array of { idA, idB } objects
     * @param {Object} options - { resumeFromCheckpoint: true/false }
     * @returns {Object} - Processing summary
     */
    async processBulk(pairsArray, options = {}) {
        this.log(`Starting bulk processing: ${pairsArray.length} pairs`, 'INFO');
        this.log(`Batch size: ${this.batchSize}, Concurrency: ${this.concurrency}`, 'INFO');

        // Initialize progress
        this.progress.totalPairs = pairsArray.length;
        this.progress.startTime = Date.now();
        this.progress.lastCheckpointTime = Date.now();

        // Resume from checkpoint if requested
        let startIndex = 0;
        if (options.resumeFromCheckpoint && fs.existsSync(this.checkpointFile)) {
            const checkpoint = this.loadCheckpoint();
            startIndex = checkpoint.processedPairs;
            this.progress = checkpoint.progress;
            this.decisions = checkpoint.decisions || [];
            this.stats = checkpoint.stats || this.stats;
            this.log(`Resuming from checkpoint: ${startIndex}/${pairsArray.length} pairs`, 'INFO');
        }

        // Split remaining pairs into batches
        const remainingPairs = pairsArray.slice(startIndex);
        const batches = this.createBatches(remainingPairs, this.batchSize);

        this.log(`Processing ${batches.length} batches...`, 'INFO');

        // Process batches with concurrency control
        for (let i = 0; i < batches.length; i += this.concurrency) {
            const concurrentBatches = batches.slice(i, Math.min(i + this.concurrency, batches.length));

            // Process batches in parallel
            const batchPromises = concurrentBatches.map((batch, idx) =>
                this.processBatch(batch, i + idx)
            );

            await Promise.all(batchPromises);

            // Update progress after each concurrency group
            this.updateProgress();
            this.displayProgress();

            // Checkpoint if interval reached
            if (this.progress.processedPairs % this.checkpointInterval < this.batchSize * this.concurrency) {
                this.saveCheckpoint(pairsArray);
            }

            // Clear record cache periodically to manage memory
            if (this.recordCache.size > 10000) {
                this.recordCache.clear();
                this.log('Cleared record cache to manage memory', 'INFO');
            }
        }

        // Final summary
        const summary = this.generateBulkSummary();
        this.log('\n' + '═'.repeat(70), 'INFO');
        this.log('BULK PROCESSING COMPLETE', 'INFO');
        this.log('═'.repeat(70), 'INFO');
        this.displayProgress();

        return summary;
    }

    /**
     * Create batches from pairs array
     * @param {Array} pairs - Array of pair objects
     * @param {Number} batchSize - Size of each batch
     * @returns {Array} - Array of batches
     */
    createBatches(pairs, batchSize) {
        const batches = [];
        for (let i = 0; i < pairs.length; i += batchSize) {
            batches.push(pairs.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Process a single batch with record preloading
     * @param {Array} batch - Array of pairs in this batch
     * @param {Number} batchIndex - Index of this batch
     * @returns {Array} - Array of decisions
     */
    async processBatch(batch, batchIndex) {
        try {
            // Step 1: Preload all records in batch with single query
            await this.preloadRecords(batch);

            // Step 2: Analyze all pairs in batch
            const decisions = [];
            for (const pair of batch) {
                try {
                    const decision = await this.analyzePair(pair.idA, pair.idB);
                    decisions.push(decision);
                    this.decisions.push(decision);

                    // Update breakdown counters
                    this.progress.decisionsBreakdown[decision.decision.toLowerCase()]++;
                    this.progress.processedPairs++;

                } catch (error) {
                    this.log(`Error analyzing pair ${pair.idA}/${pair.idB}: ${error.message}`, 'ERROR');
                    this.progress.processedPairs++;
                }
            }

            return decisions;

        } catch (error) {
            this.log(`Error processing batch ${batchIndex}: ${error.message}`, 'ERROR');
            return [];
        }
    }

    /**
     * Preload all records in batch with single SOQL query
     * Optimization: Reduces API calls from 2N to 1 per batch
     * @param {Array} batch - Array of pairs
     */
    async preloadRecords(batch) {
        // Extract all unique IDs from batch
        const allIds = new Set();
        for (const pair of batch) {
            allIds.add(pair.idA);
            allIds.add(pair.idB);
        }

        // Filter out IDs already in cache or backup
        const uncachedIds = [];
        for (const id of allIds) {
            if (!this.recordCache.has(id) && !this.backupData.active[id]) {
                uncachedIds.push(id);
            }
        }

        // If all records already cached/loaded, skip query
        if (uncachedIds.length === 0) {
            return;
        }

        // Query uncached records with single SOQL (if bulk handler available)
        if (this.bulkHandler) {
            try {
                const query = `SELECT FIELDS(ALL) FROM Account WHERE Id IN ('${uncachedIds.join("','")}')`;
                const records = await this.bulkHandler.syncQuery(query, { single: false });

                // Cache records
                for (const record of records) {
                    this.recordCache.set(record.Id, record);
                    // Also add to backup data for analyzePair compatibility
                    this.backupData.active[record.Id] = record;
                }

                this.log(`Preloaded ${records.length} records for batch`, 'INFO');

            } catch (error) {
                this.log(`Failed to preload records: ${error.message}`, 'WARN');
                // Non-fatal: analyzePair will fall back to individual lookups
            }
        }
    }

    /**
     * Update progress metrics
     */
    updateProgress() {
        const now = Date.now();
        const elapsedMs = now - this.progress.startTime;
        const elapsedSec = elapsedMs / 1000;

        // Calculate rate (pairs/sec)
        const rate = this.progress.processedPairs / elapsedSec;

        // Calculate ETA
        const remainingPairs = this.progress.totalPairs - this.progress.processedPairs;
        const etaSec = remainingPairs / rate;

        this.progress.rate = rate;
        this.progress.elapsed = this.formatDuration(elapsedMs);
        this.progress.eta = this.formatDuration(etaSec * 1000);
    }

    /**
     * Display progress to console
     */
    displayProgress() {
        const percentage = ((this.progress.processedPairs / this.progress.totalPairs) * 100).toFixed(1);
        const progressBar = this.createProgressBar(this.progress.processedPairs, this.progress.totalPairs);

        console.log('\n' + '─'.repeat(70));
        console.log(`Progress: ${progressBar} ${percentage}%`);
        console.log(`Processed: ${this.progress.processedPairs} / ${this.progress.totalPairs} pairs`);
        console.log(`Rate: ${this.progress.rate.toFixed(2)} pairs/sec`);
        console.log(`Elapsed: ${this.progress.elapsed}`);
        console.log(`ETA: ${this.progress.eta}`);
        console.log(`Decisions: ✅ ${this.progress.decisionsBreakdown.approved} | ⚠ ${this.progress.decisionsBreakdown.review} | 🛑 ${this.progress.decisionsBreakdown.blocked}`);
        console.log('─'.repeat(70));
    }

    /**
     * Create visual progress bar
     */
    createProgressBar(current, total, width = 40) {
        const percentage = current / total;
        const filled = Math.round(percentage * width);
        const empty = width - filled;
        return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
    }

    /**
     * Format duration in milliseconds to HH:MM:SS
     */
    formatDuration(ms) {
        if (isNaN(ms) || !isFinite(ms)) return '00:00:00';

        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return [hours, minutes, seconds]
            .map(n => String(n).padStart(2, '0'))
            .join(':');
    }

    /**
     * Save checkpoint to file
     */
    saveCheckpoint(allPairs) {
        const checkpoint = {
            timestamp: new Date().toISOString(),
            orgAlias: this.orgAlias,
            totalPairs: allPairs.length,
            processedPairs: this.progress.processedPairs,
            progress: this.progress,
            stats: this.stats,
            decisions: this.decisions,
            remainingPairs: allPairs.slice(this.progress.processedPairs)
        };

        fs.writeFileSync(this.checkpointFile, JSON.stringify(checkpoint, null, 2));
        this.log(`Checkpoint saved: ${this.progress.processedPairs}/${allPairs.length} pairs`, 'INFO');
    }

    /**
     * Load checkpoint from file
     */
    loadCheckpoint() {
        try {
            const checkpoint = JSON.parse(fs.readFileSync(this.checkpointFile, 'utf8'));
            return checkpoint;
        } catch (error) {
            this.log(`Failed to load checkpoint: ${error.message}`, 'ERROR');
            return null;
        }
    }

    /**
     * Delete checkpoint file
     */
    deleteCheckpoint() {
        if (fs.existsSync(this.checkpointFile)) {
            fs.unlinkSync(this.checkpointFile);
            this.log('Checkpoint file deleted', 'INFO');
        }
    }

    /**
     * Generate bulk processing summary
     */
    generateBulkSummary() {
        return {
            totalPairs: this.progress.totalPairs,
            processedPairs: this.progress.processedPairs,
            elapsed: this.progress.elapsed,
            rate: this.progress.rate,
            decisions: this.progress.decisionsBreakdown,
            stats: this.stats,
            decisionsFile: `Generated ${this.decisions.length} decisions`
        };
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || args.includes('--help')) {
        console.log(`
Bulk Decision Generator - Phase 2 Enhancement

Usage:
  node bulk-decision-generator.js process <org-alias> <pairs-file> [options]
  node bulk-decision-generator.js resume <checkpoint-file> [options]

Commands:
  process    Process duplicate pairs in bulk with batch optimization
  resume     Resume from checkpoint file

Options:
  --backup <dir>           Path to backup directory
  --importance <file>      Path to importance report
  --config <file>          Path to configuration JSON
  --output <file>          Output file for results (default: bulk-dedup-decisions.json)
  --batch-size <N>         Records per batch (default: 100)
  --concurrency <N>        Parallel batches (default: 5)
  --checkpoint-interval <N> Save checkpoint every N pairs (default: 1000)
  --checkpoint-file <file> Checkpoint file path (default: bulk-dedup-checkpoint.json)

Examples:
  node bulk-decision-generator.js process peregrine-main duplicate-pairs.json
  node bulk-decision-generator.js process rentable-sandbox pairs.csv --batch-size 500 --concurrency 10
  node bulk-decision-generator.js resume bulk-dedup-checkpoint.json
        `);
        process.exit(0);
    }

    // Parse options
    const getOption = (flag, defaultValue = null) => {
        const index = args.indexOf(flag);
        return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
    };

    const orgAlias = args[1];
    const inputFile = args[2];

    // Configuration
    const config = {
        batchSize: parseInt(getOption('--batch-size', '100')),
        concurrency: parseInt(getOption('--concurrency', '5')),
        checkpointInterval: parseInt(getOption('--checkpoint-interval', '1000')),
        checkpointFile: getOption('--checkpoint-file', 'bulk-dedup-checkpoint.json')
    };

    let backupDir = getOption('--backup') || path.join(__dirname, `../../backups/${orgAlias}`);
    let importanceReport = getOption('--importance') || path.join(__dirname, `../../field-importance-reports`);
    const configFile = getOption('--config');
    const outputFile = getOption('--output', 'bulk-dedup-decisions.json');

    // Load config file if provided
    if (configFile && fs.existsSync(configFile)) {
        const fileConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        Object.assign(config, fileConfig);
    }

    // Find latest backup
    if (fs.existsSync(backupDir) && !fs.existsSync(path.join(backupDir, 'backup_manifest.json'))) {
        const subdirs = fs.readdirSync(backupDir)
            .filter(f => fs.statSync(path.join(backupDir, f)).isDirectory())
            .sort()
            .reverse();
        if (subdirs.length > 0) {
            backupDir = path.join(backupDir, subdirs[0]);
        }
    }

    // Find latest importance report
    let importanceFile = importanceReport;
    if (fs.existsSync(importanceReport) && fs.statSync(importanceReport).isDirectory()) {
        const files = fs.readdirSync(importanceReport)
            .filter(f => f.startsWith('importance-fields-') && f.endsWith('.txt'))
            .sort()
            .reverse();
        if (files.length > 0) {
            importanceFile = path.join(importanceReport, files[0]);
        }
    }

    (async () => {
        try {
            // Initialize bulk handler (required for bulk operations)
            const BulkAPIHandler = require('./bulk-api-handler');
            const bulkHandler = new BulkAPIHandler(orgAlias);

            // Initialize generator
            const generator = new BulkDecisionGenerator(
                orgAlias,
                backupDir,
                importanceFile,
                config,
                bulkHandler
            );

            if (command === 'process') {
                if (!inputFile || !fs.existsSync(inputFile)) {
                    console.error('Error: Pairs file not found');
                    process.exit(1);
                }

                // Load pairs
                const fileContent = fs.readFileSync(inputFile, 'utf8');
                let pairs;

                // Parse JSON or CSV
                if (inputFile.endsWith('.json')) {
                    pairs = JSON.parse(fileContent);
                } else if (inputFile.endsWith('.csv')) {
                    // Simple CSV parsing (assumes idA,idB format)
                    const lines = fileContent.trim().split('\n').slice(1); // Skip header
                    pairs = lines.map(line => {
                        const [idA, idB] = line.split(',').map(s => s.trim());
                        return { idA, idB };
                    });
                } else {
                    console.error('Error: Unsupported file format (use .json or .csv)');
                    process.exit(1);
                }

                console.log(`Loaded ${pairs.length} duplicate pairs from ${inputFile}`);

                // Process bulk
                const summary = await generator.processBulk(pairs);

                // Generate report
                generator.generateReport();

                // Save results
                generator.saveResults(outputFile);

                // Delete checkpoint on successful completion
                generator.deleteCheckpoint();

                console.log(`\n✅ Processing complete. Results saved to: ${outputFile}`);

            } else if (command === 'resume') {
                const checkpointFile = inputFile;

                if (!checkpointFile || !fs.existsSync(checkpointFile)) {
                    console.error('Error: Checkpoint file not found');
                    process.exit(1);
                }

                // Load checkpoint
                const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));

                console.log(`Resuming from checkpoint: ${checkpoint.processedPairs}/${checkpoint.totalPairs} pairs`);

                // Resume processing
                const summary = await generator.processBulk(checkpoint.remainingPairs, {
                    resumeFromCheckpoint: true
                });

                // Generate report
                generator.generateReport();

                // Save results
                generator.saveResults(outputFile);

                // Delete checkpoint on successful completion
                generator.deleteCheckpoint();

                console.log(`\n✅ Processing complete. Results saved to: ${outputFile}`);

            } else {
                console.error(`Unknown command: ${command}`);
                process.exit(1);
            }

            process.exit(0);

        } catch (error) {
            console.error('Error:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    })();
}

module.exports = BulkDecisionGenerator;
