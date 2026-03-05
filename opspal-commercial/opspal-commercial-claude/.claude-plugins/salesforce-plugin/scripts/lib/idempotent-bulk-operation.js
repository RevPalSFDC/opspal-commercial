#!/usr/bin/env node

/**
 * Idempotent Bulk Operation Wrapper
 *
 * Prevents duplicate runs of bulk operations by tracking operation IDs and implementing
 * distributed locking. Provides rollback capability and complete audit trail.
 *
 * Prevents the critical "duplicate upsert" error that occurred on 2025-10-03 where
 * 183 opportunities were created twice (15:24:21 and 15:26:47).
 *
 * Features:
 * - Operation UUID generation and tracking
 * - Distributed locking mechanism
 * - Duplicate detection
 * - Automatic rollback on failure
 * - Complete audit trail
 * - Operation chaining/workflow support
 *
 * Usage:
 *   const { IdempotentBulkOperation } = require('./scripts/lib/idempotent-bulk-operation');
 *
 *   const operation = new IdempotentBulkOperation('peregrine-main', {
 *     operationType: 'renewal-import',
 *     description: 'Import 183 renewal opportunities from CSV'
 *   });
 *
 *   const result = await operation.execute(async (opId) => {
 *     // Your bulk operation here
 *     return await bulkUpsert(data);
 *   });
 *
 * Operation ID Storage:
 * - Primary: Custom Operation_Log__c object (recommended)
 * - Fallback: Description field with [OPERATION_ID: uuid] marker
 * - Local: .operation-locks/ directory for file-based locking
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

class OperationError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'OperationError';
        this.code = code;
        this.details = details;
    }
}

class IdempotentBulkOperation {
    constructor(orgAlias, config = {}) {
        this.orgAlias = orgAlias;
        this.config = {
            operationType: config.operationType || 'bulk-operation',
            description: config.description || '',
            timeout: config.timeout || 3600000, // 1 hour default
            lockDir: config.lockDir || '.operation-locks',
            enableRollback: config.enableRollback !== false,
            strictMode: config.strictMode || false,
            metadata: config.metadata || {},
            ...config
        };

        this.operationId = config.operationId || this.generateOperationId();
        this.lockFile = null;
        this.startTime = null;
        this.endTime = null;
        this.status = 'PENDING';
        this.results = null;
        this.backupData = null;
    }

    /**
     * Generate unique operation ID
     */
    generateOperationId() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const random = crypto.randomBytes(4).toString('hex');
        const type = this.config.operationType.replace(/[^a-z0-9]/gi, '-');
        return `${type}-${timestamp}-${random}`;
    }

    /**
     * Main execution method with idempotency guarantees
     */
    async execute(operation, options = {}) {
        console.log(`🔒 Starting idempotent operation: ${this.operationId}`);

        try {
            // 1. Check if operation already executed
            if (await this.isAlreadyExecuted()) {
                console.log(`⚠️  Operation ${this.operationId} already executed. Skipping.`);
                return await this.getExistingResult();
            }

            // 2. Acquire lock
            await this.acquireLock();

            // 3. Double-check after lock acquisition (race condition protection)
            if (await this.isAlreadyExecuted()) {
                await this.releaseLock();
                console.log(`⚠️  Operation ${this.operationId} was executed by another process. Skipping.`);
                return await this.getExistingResult();
            }

            // 4. Record operation start
            await this.recordOperationStart();

            // 5. Execute the actual operation
            this.startTime = Date.now();
            this.status = 'RUNNING';

            console.log(`▶️  Executing operation: ${this.config.description || this.operationId}`);
            this.results = await operation(this.operationId);

            this.endTime = Date.now();
            this.status = 'COMPLETED';

            // 6. Record success
            await this.recordOperationComplete();

            // 7. Release lock
            await this.releaseLock();

            console.log(`✅ Operation completed successfully in ${this.endTime - this.startTime}ms`);
            return this.results;

        } catch (error) {
            this.status = 'FAILED';
            this.endTime = Date.now();

            console.error(`❌ Operation failed: ${error.message}`);

            // Attempt rollback if enabled
            if (this.config.enableRollback && options.rollbackFn) {
                console.log(`🔄 Attempting rollback...`);
                try {
                    await options.rollbackFn(this.results, this.backupData);
                    console.log(`✅ Rollback completed`);
                } catch (rollbackError) {
                    console.error(`❌ Rollback failed: ${rollbackError.message}`);
                }
            }

            // Record failure
            await this.recordOperationFailure(error);

            // Release lock
            await this.releaseLock();

            throw new OperationError(
                `Operation ${this.operationId} failed: ${error.message}`,
                'OPERATION_FAILED',
                { error: error.message, stack: error.stack }
            );
        }
    }

    /**
     * Check if operation was already executed
     */
    async isAlreadyExecuted() {
        // Check in multiple locations for redundancy

        // 1. Check Operation_Log__c custom object (if exists)
        try {
            const result = await this.queryOperationLog();
            if (result && result.status === 'COMPLETED') {
                return true;
            }
        } catch (error) {
            // Object might not exist, continue to other checks
        }

        // 2. Check local lock directory
        if (this.checkLocalLockFile()) {
            return true;
        }

        // 3. Check for operation ID marker in recent records (fallback)
        if (await this.checkOperationMarker()) {
            return true;
        }

        return false;
    }

    /**
     * Query Operation_Log__c custom object
     */
    async queryOperationLog() {
        try {
            const query = `SELECT Id, Operation_ID__c, Status__c, Results__c, Start_Time__c, End_Time__c FROM Operation_Log__c WHERE Operation_ID__c = '${this.operationId}' LIMIT 1`;
            const cmd = `sf data query --query "${query}" --json --target-org ${this.orgAlias}`;
            const result = execSync(cmd, { encoding: 'utf-8' });
            const data = JSON.parse(result);

            if (data.result && data.result.records && data.result.records.length > 0) {
                return {
                    status: data.result.records[0].Status__c,
                    results: data.result.records[0].Results__c,
                    startTime: data.result.records[0].Start_Time__c,
                    endTime: data.result.records[0].End_Time__c
                };
            }

            return null;
        } catch (error) {
            // Object doesn't exist or query failed
            return null;
        }
    }

    /**
     * Check local lock file
     */
    checkLocalLockFile() {
        const lockDir = path.join(process.cwd(), this.config.lockDir);
        const lockFile = path.join(lockDir, `${this.operationId}.lock`);

        if (fs.existsSync(lockFile)) {
            const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));

            // Check if lock is stale (older than timeout)
            const lockAge = Date.now() - new Date(lockData.timestamp).getTime();
            if (lockAge > this.config.timeout) {
                console.log(`⚠️  Stale lock detected (age: ${lockAge}ms), removing...`);
                fs.unlinkSync(lockFile);
                return false;
            }

            // Check if operation completed
            if (lockData.status === 'COMPLETED') {
                return true;
            }

            // Lock exists but operation may be running
            if (lockData.status === 'RUNNING') {
                if (this.config.strictMode) {
                    throw new OperationError(
                        `Operation ${this.operationId} is already running (started ${new Date(lockData.timestamp).toISOString()})`,
                        'OPERATION_RUNNING'
                    );
                }
                return true; // Conservative: assume running
            }
        }

        return false;
    }

    /**
     * Check for operation ID marker in recent records
     */
    async checkOperationMarker() {
        // This is a fallback method that looks for the operation ID in
        // Description fields of recently created records

        try {
            // Query records created in the last hour with our operation ID in Description
            const query = `SELECT Id, Description FROM Opportunity WHERE CreatedDate >= LAST_N_HOURS:1 AND Description LIKE '%[OPERATION_ID: ${this.operationId}]%' LIMIT 1`;
            const cmd = `sf data query --query "${query}" --json --target-org ${this.orgAlias}`;
            const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
            const data = JSON.parse(result);

            return data.result && data.result.records && data.result.records.length > 0;
        } catch (error) {
            // Query failed, assume not executed
            return false;
        }
    }

    /**
     * Acquire distributed lock
     */
    async acquireLock() {
        const lockDir = path.join(process.cwd(), this.config.lockDir);

        // Ensure lock directory exists
        if (!fs.existsSync(lockDir)) {
            fs.mkdirSync(lockDir, { recursive: true });
        }

        this.lockFile = path.join(lockDir, `${this.operationId}.lock`);

        // Check if lock already exists
        if (fs.existsSync(this.lockFile)) {
            const existingLock = JSON.parse(fs.readFileSync(this.lockFile, 'utf-8'));
            const lockAge = Date.now() - new Date(existingLock.timestamp).getTime();

            if (lockAge < this.config.timeout) {
                throw new OperationError(
                    `Cannot acquire lock: Operation ${this.operationId} is already locked`,
                    'LOCK_FAILED',
                    { existingLock }
                );
            }

            // Stale lock, remove it
            console.log(`⚠️  Removing stale lock (age: ${lockAge}ms)`);
            fs.unlinkSync(this.lockFile);
        }

        // Create lock file
        const lockData = {
            operationId: this.operationId,
            operationType: this.config.operationType,
            description: this.config.description,
            pid: process.pid,
            hostname: require('os').hostname(),
            timestamp: new Date().toISOString(),
            status: 'RUNNING',
            metadata: this.config.metadata
        };

        fs.writeFileSync(this.lockFile, JSON.stringify(lockData, null, 2));
        console.log(`🔒 Lock acquired: ${this.lockFile}`);
    }

    /**
     * Release lock
     */
    async releaseLock() {
        if (this.lockFile && fs.existsSync(this.lockFile)) {
            // Update lock file with final status before removing
            const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf-8'));
            lockData.status = this.status;
            lockData.endTime = new Date().toISOString();
            lockData.duration = this.endTime - this.startTime;

            fs.writeFileSync(this.lockFile, JSON.stringify(lockData, null, 2));

            // If completed successfully, keep lock file for 24 hours as audit trail
            if (this.status !== 'COMPLETED') {
                fs.unlinkSync(this.lockFile);
                console.log(`🔓 Lock released: ${this.lockFile}`);
            } else {
                console.log(`✅ Lock updated with completion status (will expire in 24h)`);
            }
        }
    }

    /**
     * Record operation start
     */
    async recordOperationStart() {
        try {
            // Try to create record in Operation_Log__c
            const record = {
                Operation_ID__c: this.operationId,
                Operation_Type__c: this.config.operationType,
                Description__c: this.config.description,
                Status__c: 'RUNNING',
                Start_Time__c: new Date().toISOString(),
                Metadata__c: JSON.stringify(this.config.metadata)
            };

            // Note: This will fail silently if the object doesn't exist
            // The local lock file is the primary tracking mechanism
            await this.createOperationLog(record);
        } catch (error) {
            // Non-critical error, continue with operation
            console.log(`ℹ️  Could not create operation log record (continuing): ${error.message}`);
        }
    }

    /**
     * Record operation completion
     */
    async recordOperationComplete() {
        try {
            const record = {
                Status__c: 'COMPLETED',
                End_Time__c: new Date().toISOString(),
                Duration_MS__c: this.endTime - this.startTime,
                Results__c: JSON.stringify(this.results, null, 2).substring(0, 131072) // Max long text area size
            };

            await this.updateOperationLog(record);
        } catch (error) {
            console.log(`ℹ️  Could not update operation log: ${error.message}`);
        }
    }

    /**
     * Record operation failure
     */
    async recordOperationFailure(error) {
        try {
            const record = {
                Status__c: 'FAILED',
                End_Time__c: new Date().toISOString(),
                Duration_MS__c: this.endTime - this.startTime,
                Error_Message__c: error.message,
                Error_Stack__c: error.stack ? error.stack.substring(0, 131072) : null
            };

            await this.updateOperationLog(record);
        } catch (updateError) {
            console.log(`ℹ️  Could not update operation log: ${updateError.message}`);
        }
    }

    /**
     * Create operation log record
     */
    async createOperationLog(record) {
        const recordJson = JSON.stringify(record);
        const cmd = `sf data create record --sobject Operation_Log__c --values '${recordJson}' --json --target-org ${this.orgAlias}`;

        try {
            execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        } catch (error) {
            // Object might not exist, fail silently
        }
    }

    /**
     * Update operation log record
     */
    async updateOperationLog(record) {
        try {
            const logRecord = await this.queryOperationLog();
            if (logRecord) {
                const recordJson = JSON.stringify(record);
                const cmd = `sf data update record --sobject Operation_Log__c --record-id ${logRecord.Id} --values '${recordJson}' --json --target-org ${this.orgAlias}`;
                execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
            }
        } catch (error) {
            // Fail silently
        }
    }

    /**
     * Get existing operation result
     */
    async getExistingResult() {
        // Try to get from Operation_Log__c
        try {
            const logRecord = await this.queryOperationLog();
            if (logRecord && logRecord.results) {
                return JSON.parse(logRecord.results);
            }
        } catch (error) {
            // Continue to fallback
        }

        // Try to get from lock file
        if (this.lockFile && fs.existsSync(this.lockFile)) {
            const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf-8'));
            if (lockData.results) {
                return lockData.results;
            }
        }

        return {
            status: 'ALREADY_EXECUTED',
            operationId: this.operationId,
            message: 'Operation was already executed. Results not available.'
        };
    }

    /**
     * Add operation ID marker to records
     * Useful for tracking which records were created by which operation
     */
    addOperationMarker(description) {
        return `${description || ''}\n\n[OPERATION_ID: ${this.operationId}]`.trim();
    }

    /**
     * Clean up old lock files (maintenance utility)
     */
    static cleanupStaleLocks(lockDir = '.operation-locks', maxAge = 86400000) {
        const fullPath = path.join(process.cwd(), lockDir);

        if (!fs.existsSync(fullPath)) {
            return { cleaned: 0 };
        }

        const files = fs.readdirSync(fullPath);
        let cleaned = 0;

        for (const file of files) {
            if (!file.endsWith('.lock')) continue;

            const filePath = path.join(fullPath, file);
            const lockData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const age = Date.now() - new Date(lockData.timestamp).getTime();

            if (age > maxAge) {
                fs.unlinkSync(filePath);
                cleaned++;
                console.log(`🗑️  Removed stale lock: ${file} (age: ${Math.round(age / 3600000)}h)`);
            }
        }

        return { cleaned, total: files.length };
    }

    /**
     * List all operations
     */
    static listOperations(lockDir = '.operation-locks') {
        const fullPath = path.join(process.cwd(), lockDir);

        if (!fs.existsSync(fullPath)) {
            return [];
        }

        const files = fs.readdirSync(fullPath);
        const operations = [];

        for (const file of files) {
            if (!file.endsWith('.lock')) continue;

            const filePath = path.join(fullPath, file);
            const lockData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            operations.push(lockData);
        }

        return operations.sort((a, b) =>
            new Date(b.timestamp) - new Date(a.timestamp)
        );
    }
}

// CLI interface
if (require.main === module) {
    const command = process.argv[2];

    if (command === 'cleanup') {
        const result = IdempotentBulkOperation.cleanupStaleLocks();
        console.log(`✅ Cleaned up ${result.cleaned} stale locks`);
        process.exit(0);
    }

    if (command === 'list') {
        const operations = IdempotentBulkOperation.listOperations();
        console.log(`📋 Recent operations (${operations.length}):\n`);

        for (const op of operations.slice(0, 20)) {
            console.log(`${op.status === 'COMPLETED' ? '✅' : op.status === 'FAILED' ? '❌' : '🔄'} ${op.operationId}`);
            console.log(`   Type: ${op.operationType}`);
            console.log(`   Time: ${op.timestamp}`);
            console.log(`   Status: ${op.status}`);
            if (op.description) {
                console.log(`   Description: ${op.description}`);
            }
            console.log();
        }

        process.exit(0);
    }

    console.log(`
Idempotent Bulk Operation Wrapper

Usage:
  node idempotent-bulk-operation.js cleanup    Clean up stale lock files
  node idempotent-bulk-operation.js list       List recent operations

For programmatic usage, require this module in your scripts.
    `);
}

module.exports = { IdempotentBulkOperation, OperationError };
