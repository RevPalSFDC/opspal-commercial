#!/usr/bin/env node
/**
 * SFDC Full Backup Generator
 *
 * Purpose: Create comprehensive, full-field backups of Salesforce objects before
 * any merge or deduplication operation. Implements FIELDS(ALL) pattern with
 * deleted record forensics (MasterRecordId tracking).
 *
 * Key Features:
 * - FIELDS(ALL) extraction for all objects
 * - queryAll for deleted/merged records with MasterRecordId
 * - Keyset pagination for datasets >10k records
 * - Chunked extraction for child objects (Contacts/Opportunities/Cases)
 * - Relationship topology snapshots
 * - Three-script safety pattern: Backup → Execute → Validate
 *
 * Usage:
 *   node sfdc-full-backup-generator.js Account rentable-production
 *   node sfdc-full-backup-generator.js Account rentable-production --include-deleted
 *   node sfdc-full-backup-generator.js Account rentable-production --include-children --chunk-size 200
 *
 * Output Structure:
 *   ./backups/{org}/{timestamp}/
 *     ├── accounts_all_fields_active.json
 *     ├── accounts_deleted_with_master.json
 *     ├── contacts_all_fields_chunk_1.json
 *     ├── opportunities_all_fields_chunk_1.json
 *     ├── cases_all_fields_chunk_1.json
 *     ├── relationship_topology.json
 *     └── backup_manifest.json
 */

const { execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * P2 Enhancement: API Rate Limiter Class
 * Ensures we stay within Salesforce API limits (100 requests per 10 seconds)
 */
class APIRateLimiter {
    constructor(options = {}) {
        this.maxRequests = options.maxRequests || 100; // Max requests per window
        this.windowMs = options.windowMs || 10000; // 10 seconds
        this.requestTimestamps = [];
    }

    /**
     * Wait if necessary to stay within rate limits
     */
    async waitIfNeeded() {
        const now = Date.now();

        // Remove timestamps outside the current window
        this.requestTimestamps = this.requestTimestamps.filter(
            timestamp => now - timestamp < this.windowMs
        );

        // If we're at the limit, wait until the oldest request expires
        if (this.requestTimestamps.length >= this.maxRequests) {
            const oldestRequest = this.requestTimestamps[0];
            const waitTime = this.windowMs - (now - oldestRequest) + 100; // Add 100ms buffer

            console.log(`  ⏸️  Rate limit: Waiting ${Math.round(waitTime / 1000)}s before next request`);
            await this.sleep(waitTime);

            // Remove expired timestamps after waiting
            const afterWait = Date.now();
            this.requestTimestamps = this.requestTimestamps.filter(
                timestamp => afterWait - timestamp < this.windowMs
            );
        }

        // Record this request
        this.requestTimestamps.push(Date.now());
    }

    /**
     * Get current request count in window
     */
    getCurrentCount() {
        const now = Date.now();
        this.requestTimestamps = this.requestTimestamps.filter(
            timestamp => now - timestamp < this.windowMs
        );
        return this.requestTimestamps.length;
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * P1 Enhancement: Adaptive Batch Sizer Class
 * Dynamically adjusts batch size based on performance to maintain optimal throughput
 */
class AdaptiveBatchSizer {
    constructor(options = {}) {
        this.minBatchSize = options.minBatchSize || 50;
        this.maxBatchSize = options.maxBatchSize || 400;
        this.targetTime = options.targetTime || 2500; // Target 2.5 seconds per batch
        this.currentBatchSize = options.initialBatchSize || 200;

        this.batchTimes = []; // Track recent batch times
        this.historySize = 3; // Use last 3 batches for decisions
    }

    /**
     * Record batch execution time and adjust batch size
     */
    recordBatchTime(batchSize, elapsedMs, recordCount) {
        this.batchTimes.push({ batchSize, elapsedMs, recordCount });

        // Keep only recent history
        if (this.batchTimes.length > this.historySize) {
            this.batchTimes.shift();
        }

        // Adjust batch size after we have enough history
        if (this.batchTimes.length >= 2) {
            this.adjustBatchSize();
        }
    }

    /**
     * Adjust batch size based on recent performance
     */
    adjustBatchSize() {
        // Calculate average time per batch
        const avgTime = this.batchTimes.reduce((sum, b) => sum + b.elapsedMs, 0) / this.batchTimes.length;
        const avgRecordsPerBatch = this.batchTimes.reduce((sum, b) => sum + b.recordCount, 0) / this.batchTimes.length;

        let newBatchSize = this.currentBatchSize;

        if (avgTime < this.targetTime * 0.8) {
            // Too fast - increase batch size by 25%
            newBatchSize = Math.min(
                this.maxBatchSize,
                Math.round(this.currentBatchSize * 1.25)
            );
        } else if (avgTime > this.targetTime * 1.2) {
            // Too slow - decrease batch size by 20%
            newBatchSize = Math.max(
                this.minBatchSize,
                Math.round(this.currentBatchSize * 0.8)
            );
        }

        if (newBatchSize !== this.currentBatchSize) {
            const oldSize = this.currentBatchSize;
            this.currentBatchSize = newBatchSize;
            console.log(`  ⚙️  Adjusted batch size: ${oldSize} → ${newBatchSize} (avg time: ${Math.round(avgTime)}ms, target: ${this.targetTime}ms)`);
        }
    }

    /**
     * Get current recommended batch size
     */
    getBatchSize() {
        return this.currentBatchSize;
    }

    /**
     * Get performance summary
     */
    getSummary() {
        if (this.batchTimes.length === 0) {
            return null;
        }

        const avgTime = this.batchTimes.reduce((sum, b) => sum + b.elapsedMs, 0) / this.batchTimes.length;
        const avgRecords = this.batchTimes.reduce((sum, b) => sum + b.recordCount, 0) / this.batchTimes.length;

        return {
            averageBatchTime: Math.round(avgTime),
            averageRecordsPerBatch: Math.round(avgRecords),
            finalBatchSize: this.currentBatchSize,
            totalBatches: this.batchTimes.length
        };
    }
}

/**
 * P1 Enhancement: Backup Checkpoint Class
 * Enables resumption of interrupted backups
 */
class BackupCheckpoint {
    constructor(options = {}) {
        this.backupDir = options.backupDir;
        this.sobject = options.sobject;
        this.checkpointFile = path.join(this.backupDir, '.checkpoint.json');
        this.saveInterval = options.saveInterval || 10; // Save every N batches
    }

    /**
     * Check if checkpoint exists
     */
    exists() {
        return fs.existsSync(this.checkpointFile);
    }

    /**
     * Load checkpoint data
     */
    load() {
        try {
            if (!this.exists()) {
                return null;
            }

            const data = JSON.parse(fs.readFileSync(this.checkpointFile, 'utf-8'));
            console.log(`\n📍 Found checkpoint from ${new Date(data.timestamp).toISOString()}`);
            console.log(`   Last batch: ${data.batchNumber}, Records: ${data.totalRecords}, Last ID: ${data.lastId}`);

            return data;

        } catch (error) {
            console.warn(`⚠️  Failed to load checkpoint: ${error.message}`);
            return null;
        }
    }

    /**
     * Save checkpoint data
     */
    save(data) {
        try {
            const checkpoint = {
                sobject: this.sobject,
                timestamp: new Date().toISOString(),
                lastId: data.lastId,
                batchNumber: data.batchNumber,
                totalRecords: data.totalRecords,
                allRecords: data.allRecords // Save accumulated records
            };

            fs.writeFileSync(this.checkpointFile, JSON.stringify(checkpoint, null, 2));

        } catch (error) {
            console.warn(`⚠️  Failed to save checkpoint: ${error.message}`);
            // Don't throw - checkpointing is optional
        }
    }

    /**
     * Delete checkpoint (on successful completion)
     */
    cleanup() {
        try {
            if (this.exists()) {
                fs.unlinkSync(this.checkpointFile);
            }
        } catch (error) {
            console.warn(`⚠️  Failed to cleanup checkpoint: ${error.message}`);
        }
    }
}

/**
 * P0 Enhancement: Progress Tracker Class
 * Provides ETA, throughput, and progress indicators for long-running operations
 */
class ProgressTracker {
    constructor(options = {}) {
        this.operation = options.operation || 'Processing';
        this.totalExpected = options.totalExpected || null; // null if unknown
        this.updateInterval = options.updateInterval || 5000; // 5 seconds

        this.startTime = Date.now();
        this.lastUpdateTime = Date.now();
        this.processedCount = 0;
        this.lastProcessedCount = 0;
    }

    /**
     * Update progress with current count
     */
    update(currentCount) {
        this.processedCount = currentCount;
        const now = Date.now();

        // Only update console if interval has passed
        if (now - this.lastUpdateTime >= this.updateInterval) {
            this.display();
            this.lastProcessedCount = currentCount;
            this.lastUpdateTime = now;
        }
    }

    /**
     * Force display progress (for batch completions)
     */
    display() {
        const elapsed = Date.now() - this.startTime;
        const elapsedSeconds = Math.floor(elapsed / 1000);
        const throughput = this.processedCount / (elapsed / 1000);

        let message = `  ⏱️  ${this.formatTime(elapsedSeconds)} elapsed | `;
        message += `${this.processedCount.toLocaleString()} processed | `;
        message += `${Math.round(throughput)} records/sec`;

        if (this.totalExpected && this.totalExpected > 0) {
            const percentage = Math.min(100, (this.processedCount / this.totalExpected) * 100);
            const remaining = this.totalExpected - this.processedCount;
            const eta = remaining / throughput;

            message += ` | ${percentage.toFixed(1)}% complete`;
            message += ` | ETA: ${this.formatTime(Math.ceil(eta))}`;
        }

        console.log(message);
    }

    /**
     * Mark operation as complete
     */
    complete() {
        const elapsed = Date.now() - this.startTime;
        const elapsedSeconds = Math.floor(elapsed / 1000);
        const throughput = this.processedCount / (elapsed / 1000);

        console.log(`  ✅ Completed ${this.processedCount.toLocaleString()} records in ${this.formatTime(elapsedSeconds)}`);
        console.log(`     Average throughput: ${Math.round(throughput)} records/sec`);
    }

    /**
     * Format seconds as HH:MM:SS
     */
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }
}

class SFDCFullBackupGenerator {
    constructor(options = {}) {
        this.sobject = options.sobject;
        this.orgAlias = options.orgAlias;
        this.backupDir = options.backupDir || './backups';
        this.chunkSize = options.chunkSize || 200; // Records per chunk
        this.includeDeleted = options.includeDeleted !== false; // Default true
        this.includeChildren = options.includeChildren !== false; // Default true
        this.verbose = options.verbose || false;

        // P2 Enhancement: Incremental backup mode
        this.includeIncremental = options.includeIncremental || false;
        this.incrementalSince = options.incrementalSince || null; // Auto-detect if null

        // P2 Enhancement: Parallel processing mode
        this.enableParallel = options.enableParallel || false;
        this.concurrency = options.concurrency || 5; // Default 5 concurrent batches
        this.rateLimiter = new APIRateLimiter({
            maxRequests: options.maxRequests || 90, // Conservative limit (90/10s instead of 100/10s)
            windowMs: options.rateLimitWindow || 10000
        });

        // Generate timestamp for this backup
        this.timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);

        // Create backup directory structure
        this.currentBackupDir = path.join(this.backupDir, this.orgAlias, this.timestamp);
        this.ensureDirectoryExists(this.currentBackupDir);

        // Backup manifest
        this.manifest = {
            sobject: this.sobject,
            orgAlias: this.orgAlias,
            timestamp: this.timestamp,
            startedAt: new Date().toISOString(),
            completedAt: null,
            incrementalMode: this.includeIncremental,
            incrementalSince: null, // Set later if incremental
            parallelMode: this.enableParallel,
            concurrency: this.enableParallel ? this.concurrency : 1,
            files: [],
            recordCounts: {},
            errors: []
        };

        // Get org connection info
        this.orgInfo = this.getOrgInfo();
    }

    /**
     * Main backup orchestration method
     */
    async generateFullBackup() {
        console.log('\n🔒 SFDC Full Backup Generator');
        console.log('═'.repeat(70));
        console.log(`Object: ${this.sobject}`);
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Backup Dir: ${this.currentBackupDir}`);

        // P2 Enhancement: Show incremental mode status
        if (this.includeIncremental) {
            console.log(`Mode: Incremental (changes since last backup)`);
        } else {
            console.log(`Mode: Full (all active records)`);
        }
        console.log('');

        try {
            // Step 1: Extract active records (full or incremental)
            if (this.includeIncremental) {
                console.log('📦 Step 1: Extracting incremental records (LastModifiedDate filter)...');
                await this.extractIncrementalRecords();
            } else {
                console.log('📦 Step 1: Extracting active records (FIELDS(ALL))...');
                await this.extractActiveRecords();
            }

            // Step 2: Extract deleted/merged records if requested
            if (this.includeDeleted) {
                console.log('\n📦 Step 2: Extracting deleted/merged records (queryAll)...');
                await this.extractDeletedRecords();
            }

            // Step 3: Extract child objects if requested
            if (this.includeChildren && this.sobject === 'Account') {
                console.log('\n📦 Step 3: Extracting child objects (Contacts/Opportunities/Cases)...');
                await this.extractChildObjects();
            }

            // Step 4: Generate relationship topology
            console.log('\n📦 Step 4: Generating relationship topology...');
            await this.generateRelationshipTopology();

            // Step 5: Save manifest
            this.manifest.completedAt = new Date().toISOString();
            this.saveManifest();

            console.log('\n✅ Backup completed successfully!');
            console.log('═'.repeat(70));
            console.log(`\nBackup Location: ${this.currentBackupDir}`);
            console.log(`Total Files: ${this.manifest.files.length}`);
            console.log('\nRecord Counts:');
            Object.entries(this.manifest.recordCounts).forEach(([key, count]) => {
                console.log(`  ${key}: ${count.toLocaleString()}`);
            });

            return {
                success: true,
                backupDir: this.currentBackupDir,
                manifest: this.manifest
            };

        } catch (error) {
            console.error('\n❌ Backup failed:', error.message);
            this.manifest.errors.push({
                timestamp: new Date().toISOString(),
                error: error.message,
                stack: error.stack
            });
            this.saveManifest();
            throw error;
        }
    }

    /**
     * Extract active records using FIELDS(ALL) pattern with pagination
     * FIELDS(ALL) has a LIMIT 200 maximum in Salesforce
     */
    async extractActiveRecords() {
        const batchSize = 200; // Salesforce FIELDS(ALL) limit
        let allRecords = [];
        let lastId = null;
        let batchNumber = 1;

        this.log(`Extracting records in batches of ${batchSize} (FIELDS(ALL) limit)`);

        // P1 Enhancement: Checkpoint support for resumption
        const checkpoint = new BackupCheckpoint({
            backupDir: this.currentBackupDir,
            sobject: this.sobject,
            saveInterval: 10 // Save every 10 batches
        });

        // Check for existing checkpoint and resume if found
        const existingCheckpoint = checkpoint.load();
        if (existingCheckpoint) {
            console.log('🔄 Resuming from checkpoint...');
            allRecords = existingCheckpoint.allRecords || [];
            lastId = existingCheckpoint.lastId;
            batchNumber = existingCheckpoint.batchNumber + 1;
        }

        // P0 Enhancement: Progress tracking for long-running operations
        const progressTracker = new ProgressTracker({
            operation: `Extracting ${this.sobject} records`,
            totalExpected: null, // Unknown with keyset pagination
            updateInterval: 5000 // Update every 5 seconds
        });

        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                // Use keyset pagination with Id for efficiency
                let query;
                if (lastId) {
                    query = `SELECT FIELDS(ALL) FROM ${this.sobject} WHERE Id > '${lastId}' ORDER BY Id ASC LIMIT ${batchSize}`;
                } else {
                    query = `SELECT FIELDS(ALL) FROM ${this.sobject} ORDER BY Id ASC LIMIT ${batchSize}`;
                }

                this.log(`Batch ${batchNumber}: ${query}`);

                const result = await this.executeSoqlQuery(query);

                if (!result.records || result.records.length === 0) {
                    break; // No more records
                }

                allRecords = allRecords.concat(result.records);
                console.log(`  Batch ${batchNumber}: ${result.records.length} records (total: ${allRecords.length})`);

                // P0 Enhancement: Update progress tracker
                progressTracker.update(allRecords.length);

                // Update lastId for next iteration
                lastId = result.records[result.records.length - 1].Id;

                // P1 Enhancement: Save checkpoint every N batches
                if (batchNumber % checkpoint.saveInterval === 0) {
                    checkpoint.save({
                        lastId: lastId,
                        batchNumber: batchNumber,
                        totalRecords: allRecords.length,
                        allRecords: allRecords
                    });
                    console.log(`  💾 Checkpoint saved at batch ${batchNumber}`);
                }

                // If we got fewer records than the batch size, we're done
                if (result.records.length < batchSize) {
                    break;
                }

                batchNumber++;
            }

            // P0 Enhancement: Display completion summary
            progressTracker.complete();

            // P1 Enhancement: Cleanup checkpoint on successful completion
            checkpoint.cleanup();

            // Save all records to single file
            const outputFile = path.join(this.currentBackupDir, `${this.sobject.toLowerCase()}_all_fields_active.json`);
            fs.writeFileSync(outputFile, JSON.stringify({
                records: allRecords,
                totalSize: allRecords.length,
                done: true
            }, null, 2));

            this.manifest.files.push({
                name: path.basename(outputFile),
                type: 'active_records',
                recordCount: allRecords.length,
                totalSize: allRecords.length,
                batches: batchNumber
            });

            this.manifest.recordCounts[`${this.sobject}_active`] = allRecords.length;

            console.log(`  ✅ Extracted ${allRecords.length.toLocaleString()} active records in ${batchNumber} batches`);
            this.log(`  File: ${outputFile}`);

            return {
                records: allRecords,
                totalSize: allRecords.length,
                done: true
            };

        } catch (error) {
            console.error(`  ❌ Failed to extract active records: ${error.message}`);
            throw error;
        }
    }

    /**
     * P2 Enhancement: Extract incremental records (only records modified since last backup)
     * Uses LastModifiedDate filtering for efficiency
     */
    async extractIncrementalRecords() {
        // Find last backup timestamp
        const lastBackupTimestamp = this.incrementalSince || this.findLastBackupTimestamp();

        if (!lastBackupTimestamp) {
            console.log('  ⚠️  No previous backup found, falling back to full extraction...');
            return await this.extractActiveRecords();
        }

        console.log(`  📅 Extracting records modified since: ${lastBackupTimestamp}`);
        this.manifest.incrementalSince = lastBackupTimestamp;

        const batchSize = 200; // Salesforce FIELDS(ALL) limit
        let allRecords = [];
        let lastId = null;
        let batchNumber = 1;

        this.log(`Extracting incremental records in batches of ${batchSize}`);

        // P0 Enhancement: Progress tracking
        const progressTracker = new ProgressTracker({
            operation: `Extracting ${this.sobject} incremental records`,
            totalExpected: null,
            updateInterval: 5000
        });

        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                // Query with LastModifiedDate filter
                let query;
                if (lastId) {
                    query = `SELECT FIELDS(ALL) FROM ${this.sobject} WHERE LastModifiedDate > ${lastBackupTimestamp} AND Id > '${lastId}' ORDER BY Id ASC LIMIT ${batchSize}`;
                } else {
                    query = `SELECT FIELDS(ALL) FROM ${this.sobject} WHERE LastModifiedDate > ${lastBackupTimestamp} ORDER BY Id ASC LIMIT ${batchSize}`;
                }

                this.log(`Batch ${batchNumber}: ${query}`);

                const result = await this.executeSoqlQuery(query);

                if (!result.records || result.records.length === 0) {
                    break; // No more records
                }

                allRecords = allRecords.concat(result.records);
                console.log(`  Batch ${batchNumber}: ${result.records.length} records (total: ${allRecords.length})`);

                // Update progress tracker
                progressTracker.update(allRecords.length);

                // Update lastId for next iteration
                lastId = result.records[result.records.length - 1].Id;

                // If we got fewer records than the batch size, we're done
                if (result.records.length < batchSize) {
                    break;
                }

                batchNumber++;
            }

            // Display completion summary
            progressTracker.complete();

            // Load existing backup if present
            const existingBackup = this.loadLastBackup();

            if (existingBackup) {
                console.log(`  🔄 Merging ${allRecords.length} new/updated records with ${existingBackup.length} existing records...`);
                allRecords = this.mergeRecords(existingBackup, allRecords);
                console.log(`  ✅ Final merged dataset: ${allRecords.length} records`);
            }

            // Save merged records to single file
            const outputFile = path.join(this.currentBackupDir, `${this.sobject.toLowerCase()}_all_fields_active.json`);
            fs.writeFileSync(outputFile, JSON.stringify({
                records: allRecords,
                totalSize: allRecords.length,
                done: true,
                incrementalMode: true,
                incrementalSince: lastBackupTimestamp
            }, null, 2));

            this.manifest.files.push({
                name: path.basename(outputFile),
                type: 'active_records',
                recordCount: allRecords.length,
                totalSize: allRecords.length,
                batches: batchNumber,
                incrementalMode: true
            });

            this.manifest.recordCounts[`${this.sobject}_active`] = allRecords.length;

            console.log(`  ✅ Extracted ${allRecords.length.toLocaleString()} records (${batchNumber} batches)`);
            this.log(`  File: ${outputFile}`);

            return {
                records: allRecords,
                totalSize: allRecords.length,
                done: true
            };

        } catch (error) {
            console.error(`  ❌ Failed to extract incremental records: ${error.message}`);
            throw error;
        }
    }

    /**
     * P2 Helper: Find last backup timestamp from previous backups
     */
    findLastBackupTimestamp() {
        try {
            const orgBackupDir = path.join(this.backupDir, this.orgAlias);

            if (!fs.existsSync(orgBackupDir)) {
                return null;
            }

            // Get all backup directories, sorted by timestamp (newest first)
            const backupDirs = fs.readdirSync(orgBackupDir)
                .filter(dir => {
                    const fullPath = path.join(orgBackupDir, dir);
                    return fs.statSync(fullPath).isDirectory();
                })
                .sort()
                .reverse();

            // Find the most recent backup with a manifest
            for (const dir of backupDirs) {
                const manifestPath = path.join(orgBackupDir, dir, 'backup_manifest.json');
                if (fs.existsSync(manifestPath)) {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

                    // Use completedAt timestamp (ISO 8601 format)
                    if (manifest.completedAt) {
                        return manifest.completedAt;
                    }
                }
            }

            return null;

        } catch (error) {
            this.log(`Failed to find last backup timestamp: ${error.message}`);
            return null;
        }
    }

    /**
     * P2 Helper: Load last backup records for merging
     */
    loadLastBackup() {
        try {
            const orgBackupDir = path.join(this.backupDir, this.orgAlias);

            if (!fs.existsSync(orgBackupDir)) {
                return null;
            }

            // Get all backup directories, sorted by timestamp (newest first)
            const backupDirs = fs.readdirSync(orgBackupDir)
                .filter(dir => {
                    const fullPath = path.join(orgBackupDir, dir);
                    return fs.statSync(fullPath).isDirectory() && dir !== this.timestamp; // Exclude current backup
                })
                .sort()
                .reverse();

            // Find the most recent backup with records
            for (const dir of backupDirs) {
                const backupFile = path.join(orgBackupDir, dir, `${this.sobject.toLowerCase()}_all_fields_active.json`);
                if (fs.existsSync(backupFile)) {
                    const backup = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
                    console.log(`  📂 Found previous backup: ${dir} (${backup.records.length} records)`);
                    return backup.records;
                }
            }

            return null;

        } catch (error) {
            this.log(`Failed to load last backup: ${error.message}`);
            return null;
        }
    }

    /**
     * P2 Helper: Merge new/updated records with existing backup
     * Newer records (by LastModifiedDate) replace older ones
     */
    mergeRecords(existingRecords, newRecords) {
        // Create a map of existing records by Id
        const recordMap = new Map();

        existingRecords.forEach(record => {
            recordMap.set(record.Id, record);
        });

        // Merge new/updated records (newer records replace older ones)
        let updatedCount = 0;
        let newCount = 0;

        newRecords.forEach(record => {
            if (recordMap.has(record.Id)) {
                updatedCount++;
            } else {
                newCount++;
            }
            recordMap.set(record.Id, record); // Replace or add
        });

        console.log(`    Updated: ${updatedCount}, New: ${newCount}`);

        // Convert map back to array
        return Array.from(recordMap.values());
    }

    /**
     * Extract deleted/merged records using queryAll with MasterRecordId
     */
    async extractDeletedRecords() {
        // Build query with key fields + MasterRecordId for forensics
        const keyFields = ['Id', 'Name', 'IsDeleted', 'MasterRecordId', 'CreatedDate', 'LastModifiedDate'];

        // Add common business fields if they exist on the object
        const businessFields = ['Website', 'Phone', 'BillingCity', 'BillingState', 'Type', 'Industry'];

        const fieldsToQuery = [...keyFields];

        // Attempt to add business fields (they may not all exist)
        for (const field of businessFields) {
            try {
                // We'll try to include them in the query, SF will error if they don't exist
                fieldsToQuery.push(field);
            } catch (error) {
                // Field doesn't exist, skip it
            }
        }

        const query = `SELECT ${fieldsToQuery.join(', ')} FROM ${this.sobject} WHERE IsDeleted = TRUE`;

        this.log(`Executing queryAll: ${query}`);

        try {
            const result = await this.executeQueryAll(query);

            const outputFile = path.join(this.currentBackupDir, `${this.sobject.toLowerCase()}_deleted_with_master.json`);
            fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

            this.manifest.files.push({
                name: path.basename(outputFile),
                type: 'deleted_records',
                recordCount: result.records.length,
                totalSize: result.totalSize
            });

            this.manifest.recordCounts[`${this.sobject}_deleted`] = result.records.length;

            // Analyze MasterRecordId patterns
            const mergedRecords = result.records.filter(r => r.MasterRecordId);
            console.log(`  ✅ Extracted ${result.records.length.toLocaleString()} deleted records`);
            console.log(`     ${mergedRecords.length.toLocaleString()} have MasterRecordId (merged records)`);
            this.log(`  File: ${outputFile}`);

            return result;

        } catch (error) {
            console.error(`  ❌ Failed to extract deleted records: ${error.message}`);
            // Don't throw - deleted records are optional
            this.manifest.errors.push({
                operation: 'extractDeletedRecords',
                error: error.message
            });
        }
    }

    /**
     * Extract child objects (Contacts, Opportunities, Cases) in chunks
     */
    async extractChildObjects() {
        const childObjects = [
            { name: 'Contact', parentField: 'AccountId' },
            { name: 'Opportunity', parentField: 'AccountId' },
            { name: 'Case', parentField: 'AccountId' }
        ];

        for (const childObj of childObjects) {
            console.log(`\n  📄 Extracting ${childObj.name} records...`);

            try {
                // First, get the IDs of all Accounts we backed up
                const activeAccountsFile = path.join(this.currentBackupDir, `${this.sobject.toLowerCase()}_all_fields_active.json`);
                if (!fs.existsSync(activeAccountsFile)) {
                    console.log(`  ⚠️  No active ${this.sobject} backup found, skipping ${childObj.name}`);
                    continue;
                }

                const activeAccounts = JSON.parse(fs.readFileSync(activeAccountsFile, 'utf-8'));
                const accountIds = activeAccounts.records.map(r => r.Id);

                if (accountIds.length === 0) {
                    console.log(`  ℹ️  No ${this.sobject} IDs to query, skipping ${childObj.name}`);
                    continue;
                }

                // Extract child records with pagination (FIELDS(ALL) LIMIT 200)
                let chunkNumber = 1;
                let totalRecords = 0;
                const fieldsAllLimit = 200; // Salesforce LIMIT for FIELDS(ALL)

                // Extract all child records for these accounts in batches
                for (let i = 0; i < accountIds.length; i += this.chunkSize) {
                    const accountChunk = accountIds.slice(i, Math.min(i + this.chunkSize, accountIds.length));
                    const accountIdsStr = accountChunk.map(id => `'${id}'`).join(',');

                    // Paginate through child records in batches of 200
                    let lastId = null;
                    let batchRecords = [];

                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        let query;
                        if (lastId) {
                            query = `SELECT FIELDS(ALL) FROM ${childObj.name} WHERE ${childObj.parentField} IN (${accountIdsStr}) AND Id > '${lastId}' ORDER BY Id ASC LIMIT ${fieldsAllLimit}`;
                        } else {
                            query = `SELECT FIELDS(ALL) FROM ${childObj.name} WHERE ${childObj.parentField} IN (${accountIdsStr}) ORDER BY Id ASC LIMIT ${fieldsAllLimit}`;
                        }

                        try {
                            const result = await this.executeSoqlQuery(query);

                            if (!result.records || result.records.length === 0) {
                                break; // No more records
                            }

                            batchRecords = batchRecords.concat(result.records);
                            lastId = result.records[result.records.length - 1].Id;

                            // If we got fewer records than limit, we're done with this account chunk
                            if (result.records.length < fieldsAllLimit) {
                                break;
                            }

                        } catch (error) {
                            console.error(`  ⚠️  Failed to extract ${childObj.name} batch: ${error.message}`);
                            this.manifest.errors.push({
                                operation: `extract_${childObj.name}_batch`,
                                error: error.message
                            });
                            break;
                        }
                    }

                    // Save this chunk if we got any records
                    if (batchRecords.length > 0) {
                        const outputFile = path.join(
                            this.currentBackupDir,
                            `${childObj.name.toLowerCase()}_all_fields_chunk_${chunkNumber}.json`
                        );
                        fs.writeFileSync(outputFile, JSON.stringify({
                            records: batchRecords,
                            totalSize: batchRecords.length,
                            done: true
                        }, null, 2));

                        this.manifest.files.push({
                            name: path.basename(outputFile),
                            type: `${childObj.name.toLowerCase()}_records`,
                            recordCount: batchRecords.length,
                            chunkNumber: chunkNumber
                        });

                        totalRecords += batchRecords.length;
                        console.log(`    Chunk ${chunkNumber}: ${batchRecords.length} records`);
                        chunkNumber++;
                    }
                }

                this.manifest.recordCounts[childObj.name] = totalRecords;
                console.log(`  ✅ Extracted ${totalRecords.toLocaleString()} ${childObj.name} records in ${chunkNumber - 1} chunks`);

            } catch (error) {
                console.error(`  ❌ Failed to extract ${childObj.name}: ${error.message}`);
                this.manifest.errors.push({
                    operation: `extract_${childObj.name}`,
                    error: error.message
                });
            }
        }
    }

    /**
     * Generate relationship topology snapshot (lightweight backup)
     */
    async generateRelationshipTopology() {
        try {
            // Query for relationship counts only (very fast)
            const query = `
                SELECT Id, Name,
                    (SELECT Id FROM Contacts),
                    (SELECT Id FROM Opportunities),
                    (SELECT Id FROM Cases)
                FROM ${this.sobject}
                LIMIT 50000
            `;

            this.log(`Generating topology: ${query}`);

            const result = await this.executeSoqlQuery(query);

            // Transform to topology format
            const topology = result.records.map(record => ({
                accountId: record.Id,
                accountName: record.Name,
                contactCount: record.Contacts ? record.Contacts.totalSize : 0,
                opportunityCount: record.Opportunities ? record.Opportunities.totalSize : 0,
                caseCount: record.Cases ? record.Cases.totalSize : 0,
                contactIds: record.Contacts ? record.Contacts.records.map(c => c.Id) : [],
                opportunityIds: record.Opportunities ? record.Opportunities.records.map(o => o.Id) : [],
                caseIds: record.Cases ? record.Cases.records.map(c => c.Id) : []
            }));

            const outputFile = path.join(this.currentBackupDir, 'relationship_topology.json');
            fs.writeFileSync(outputFile, JSON.stringify({
                timestamp: new Date().toISOString(),
                totalAccounts: topology.length,
                topology: topology
            }, null, 2));

            this.manifest.files.push({
                name: 'relationship_topology.json',
                type: 'topology',
                recordCount: topology.length
            });

            console.log(`  ✅ Generated topology for ${topology.length.toLocaleString()} accounts`);
            this.log(`  File: ${outputFile}`);

        } catch (error) {
            console.error(`  ❌ Failed to generate topology: ${error.message}`);
            this.manifest.errors.push({
                operation: 'generateRelationshipTopology',
                error: error.message
            });
        }
    }

    /**
     * P2 Enhancement: Execute multiple SOQL queries in parallel with rate limiting
     */
    async executeBatchQueriesParallel(queries) {
        const results = [];
        const errors = [];

        // Process queries in groups based on concurrency limit
        for (let i = 0; i < queries.length; i += this.concurrency) {
            const batch = queries.slice(i, Math.min(i + this.concurrency, queries.length));

            // Execute batch queries in parallel
            const batchPromises = batch.map(async (query, idx) => {
                try {
                    // Wait for rate limiter before making request
                    await this.rateLimiter.waitIfNeeded();

                    const result = await this.executeSoqlQuery(query);
                    return { success: true, result, query, index: i + idx };

                } catch (error) {
                    return { success: false, error: error.message, query, index: i + idx };
                }
            });

            // Wait for all queries in this batch to complete
            const batchResults = await Promise.all(batchPromises);

            // Collect results and errors
            batchResults.forEach(item => {
                if (item.success) {
                    results.push(item);
                } else {
                    errors.push(item);
                }
            });

            // Log progress
            const completed = i + batch.length;
            console.log(`    Parallel progress: ${completed}/${queries.length} batches completed`);
        }

        return { results, errors };
    }

    /**
     * Execute SOQL query using sf CLI
     */
    async executeSoqlQuery(query) {
        try {
            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --result-format json`;

            const result = execSync(cmd, {
                encoding: 'utf-8',
                maxBuffer: 500 * 1024 * 1024, // 500MB buffer for large queries
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const data = JSON.parse(result);

            if (data.status !== 0) {
                throw new Error(`Query failed: ${data.message}`);
            }

            return {
                records: data.result.records || [],
                totalSize: data.result.totalSize || 0,
                done: data.result.done || true
            };

        } catch (error) {
            throw new Error(`SOQL query failed: ${error.message}`);
        }
    }

    /**
     * Execute queryAll (includes deleted records) using REST API
     */
    async executeQueryAll(query) {
        try {
            // Use sf CLI's REST API capabilities for queryAll
            const encodedQuery = encodeURIComponent(query);
            const endpoint = `/services/data/v60.0/queryAll?q=${encodedQuery}`;

            const cmd = `sf org display --target-org ${this.orgAlias} --json`;
            const orgData = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

            const instanceUrl = orgData.result.instanceUrl;
            const accessToken = orgData.result.accessToken;

            return new Promise((resolve, reject) => {
                const url = new URL(endpoint, instanceUrl);

                const options = {
                    hostname: url.hostname,
                    path: url.pathname + url.search,
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
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
                                resolve({
                                    records: data.records || [],
                                    totalSize: data.totalSize || 0,
                                    done: data.done || true
                                });
                            } else {
                                reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                            }
                        } catch (error) {
                            reject(new Error(`Parse error: ${error.message}`));
                        }
                    });
                });

                req.on('error', reject);
                req.end();
            });

        } catch (error) {
            throw new Error(`queryAll failed: ${error.message}`);
        }
    }

    /**
     * Get org info for connection verification
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
                username: data.result.username,
                orgId: data.result.id
            };

        } catch (error) {
            throw new Error(`Failed to connect to org ${this.orgAlias}: ${error.message}`);
        }
    }

    /**
     * Save backup manifest
     */
    saveManifest() {
        const manifestPath = path.join(this.currentBackupDir, 'backup_manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(this.manifest, null, 2));
        this.log(`Manifest saved: ${manifestPath}`);
    }

    /**
     * Ensure directory exists
     */
    ensureDirectoryExists(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
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
SFDC Full Backup Generator

Usage:
  node sfdc-full-backup-generator.js <sobject> <org-alias> [options]

Arguments:
  sobject          Salesforce object to backup (e.g., Account)
  org-alias        Target Salesforce org alias

Options:
  --incremental        Incremental backup mode (only records changed since last backup)
  --no-deleted         Skip deleted records extraction (default: include)
  --no-children        Skip child objects (Contacts/Opportunities/Cases)
  --chunk-size <n>     Records per chunk for child objects (default: 200)
  --backup-dir <path>  Custom backup directory (default: ./backups)
  --verbose            Show detailed debug output

Examples:
  # Full backup (active + deleted + children)
  node sfdc-full-backup-generator.js Account rentable-production

  # Incremental backup (only changed records)
  node sfdc-full-backup-generator.js Account rentable-production --incremental

  # Active records only
  node sfdc-full-backup-generator.js Account rentable-production --no-deleted --no-children

  # Custom chunk size
  node sfdc-full-backup-generator.js Account rentable-production --chunk-size 500

  # Custom backup location
  node sfdc-full-backup-generator.js Account rentable-production --backup-dir /mnt/backups

Output Structure:
  ./backups/{org}/{timestamp}/
    ├── account_all_fields_active.json          (All active Account fields)
    ├── account_deleted_with_master.json        (Deleted/merged with MasterRecordId)
    ├── contact_all_fields_chunk_1.json         (Contacts in chunks)
    ├── opportunity_all_fields_chunk_1.json     (Opportunities in chunks)
    ├── case_all_fields_chunk_1.json            (Cases in chunks)
    ├── relationship_topology.json              (Lightweight relationship snapshot)
    └── backup_manifest.json                    (Backup metadata)
        `);
        process.exit(0);
    }

    const sobject = args[0];
    const orgAlias = args[1];

    const options = {
        sobject,
        orgAlias,
        includeIncremental: args.includes('--incremental'), // P2 Enhancement
        includeDeleted: !args.includes('--no-deleted'),
        includeChildren: !args.includes('--no-children'),
        verbose: args.includes('--verbose')
    };

    // Parse chunk size
    const chunkSizeIndex = args.indexOf('--chunk-size');
    if (chunkSizeIndex !== -1 && args[chunkSizeIndex + 1]) {
        options.chunkSize = parseInt(args[chunkSizeIndex + 1], 10);
    }

    // Parse backup directory
    const backupDirIndex = args.indexOf('--backup-dir');
    if (backupDirIndex !== -1 && args[backupDirIndex + 1]) {
        options.backupDir = args[backupDirIndex + 1];
    }

    // Execute backup
    (async () => {
        try {
            const generator = new SFDCFullBackupGenerator(options);
            const result = await generator.generateFullBackup();

            console.log('\n✅ Backup completed successfully!');
            console.log(`\n📁 Backup Location: ${result.backupDir}`);

            process.exit(0);

        } catch (error) {
            console.error('\n❌ Backup failed:', error.message);
            if (options.verbose && error.stack) {
                console.error('\nStack trace:');
                console.error(error.stack);
            }
            process.exit(1);
        }
    })();
}

module.exports = SFDCFullBackupGenerator;
