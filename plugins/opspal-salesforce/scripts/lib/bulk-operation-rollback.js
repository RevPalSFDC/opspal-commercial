#!/usr/bin/env node

/**
 * Bulk Operation Rollback Module
 *
 * Provides transaction-like behavior for Salesforce bulk operations:
 * - Snapshot creation before operations
 * - Automatic rollback on failure
 * - Recovery point management
 * - Audit trail maintenance
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function getPlaybookVersion(playbookPath) {
    try {
        const repoRoot = path.resolve(__dirname, '..', '..');
        const output = execSync(`git -C "${repoRoot}" log -1 --pretty=format:%h -- "${playbookPath}"`, {
            stdio: ['ignore', 'pipe', 'ignore'],
        }).toString().trim();
        return output || 'untracked';
    } catch (error) {
        return 'unknown';
    }
}

function logPlaybookUsage(playbookPath) {
    const version = getPlaybookVersion(playbookPath);
    console.log(`📘 Playbook: ${playbookPath} (version: ${version})`);
}

class BulkOperationRollback {
    constructor(targetOrg, options = {}) {
        this.targetOrg = targetOrg;
        this.rollbackDir = options.rollbackDir || path.join(os.tmpdir(), 'bulk-rollback');
        this.maxSnapshots = options.maxSnapshots || 10;
        this.enableAutoCleanup = options.enableAutoCleanup !== false;
        this.retentionDays = options.retentionDays || 7;

        if (options.logPlaybook !== false) {
            logPlaybookUsage('docs/playbooks/bulk-data-operations.md');
        }

        this.ensureRollbackDir();
        this.loadTransactionHistory();
    }

    ensureRollbackDir() {
        if (!fs.existsSync(this.rollbackDir)) {
            fs.mkdirSync(this.rollbackDir, { recursive: true });
        }

        // Create subdirectories
        ['snapshots', 'logs', 'recovery'].forEach(dir => {
            const subDir = path.join(this.rollbackDir, dir);
            if (!fs.existsSync(subDir)) {
                fs.mkdirSync(subDir, { recursive: true });
            }
        });
    }

    loadTransactionHistory() {
        const historyFile = path.join(this.rollbackDir, 'transaction-history.json');

        try {
            if (fs.existsSync(historyFile)) {
                this.history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
            } else {
                this.history = {
                    transactions: [],
                    rollbacks: [],
                    lastCleanup: Date.now()
                };
            }
        } catch (error) {
            console.warn('⚠️ Could not load transaction history, starting fresh');
            this.history = {
                transactions: [],
                rollbacks: [],
                lastCleanup: Date.now()
            };
        }

        // Cleanup old entries if needed
        if (this.enableAutoCleanup && Date.now() - this.history.lastCleanup > 86400000) {
            this.cleanupOldSnapshots();
        }
    }

    saveTransactionHistory() {
        const historyFile = path.join(this.rollbackDir, 'transaction-history.json');
        fs.writeFileSync(historyFile, JSON.stringify(this.history, null, 2));
    }

    /**
     * Begin a new transaction
     */
    async beginTransaction(operation, data = {}) {
        const transactionId = this.generateTransactionId();

        console.log(`\n🔄 Beginning transaction ${transactionId}`);

        const transaction = {
            id: transactionId,
            operation: operation,
            startTime: Date.now(),
            status: 'in_progress',
            org: this.targetOrg,
            dataCount: Array.isArray(data) ? data.length : 1,
            snapshot: null,
            createdRecords: [],
            modifiedRecords: [],
            deletedRecords: []
        };

        // Create snapshot based on operation type
        if (operation.includes('create') || operation.includes('insert')) {
            transaction.snapshot = await this.createInsertSnapshot(data);
        } else if (operation.includes('update') || operation.includes('upsert')) {
            transaction.snapshot = await this.createUpdateSnapshot(data);
        } else if (operation.includes('delete')) {
            transaction.snapshot = await this.createDeleteSnapshot(data);
        }

        this.history.transactions.push(transaction);
        this.saveTransactionHistory();

        return transactionId;
    }

    /**
     * Create snapshot for insert operations
     */
    async createInsertSnapshot(data) {
        console.log('📸 Creating insert operation snapshot...');

        const snapshot = {
            type: 'insert',
            timestamp: Date.now(),
            recordCount: Array.isArray(data) ? data.length : 1,
            data: []
        };

        // For inserts, we just track what will be created
        // No need to backup existing data
        if (Array.isArray(data)) {
            snapshot.data = data.map(record => ({
                tempId: this.generateTempId(),
                record: { ...record }
            }));
        }

        const snapshotFile = path.join(
            this.rollbackDir,
            'snapshots',
            `insert_${Date.now()}.json`
        );

        fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
        snapshot.file = snapshotFile;

        console.log(`  Snapshot saved: ${path.basename(snapshotFile)}`);

        return snapshot;
    }

    /**
     * Create snapshot for update operations
     */
    async createUpdateSnapshot(data) {
        console.log('📸 Creating update operation snapshot...');

        const snapshot = {
            type: 'update',
            timestamp: Date.now(),
            recordCount: Array.isArray(data) ? data.length : 1,
            originalData: [],
            newData: data
        };

        // Backup current state of records to be updated
        if (Array.isArray(data) && data.length > 0) {
            const recordIds = data.map(r => r.Id).filter(Boolean);

            if (recordIds.length > 0) {
                // Determine object type from first record
                const objectType = this.detectObjectType(data[0]);

                if (objectType) {
                    snapshot.originalData = await this.backupRecords(objectType, recordIds);
                }
            }
        }

        const snapshotFile = path.join(
            this.rollbackDir,
            'snapshots',
            `update_${Date.now()}.json`
        );

        fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
        snapshot.file = snapshotFile;

        console.log(`  Snapshot saved with ${snapshot.originalData.length} backed up records`);

        return snapshot;
    }

    /**
     * Create snapshot for delete operations
     */
    async createDeleteSnapshot(data) {
        console.log('📸 Creating delete operation snapshot...');

        const snapshot = {
            type: 'delete',
            timestamp: Date.now(),
            recordCount: Array.isArray(data) ? data.length : 1,
            backedUpData: []
        };

        // Backup records before deletion
        if (Array.isArray(data) && data.length > 0) {
            const recordIds = data.map(r => typeof r === 'string' ? r : r.Id).filter(Boolean);

            if (recordIds.length > 0) {
                // For deletes, we need to know the object type
                const objectType = this.detectObjectTypeFromId(recordIds[0]);

                if (objectType) {
                    snapshot.backedUpData = await this.backupRecords(objectType, recordIds);
                    snapshot.objectType = objectType;
                }
            }
        }

        const snapshotFile = path.join(
            this.rollbackDir,
            'snapshots',
            `delete_${Date.now()}.json`
        );

        fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
        snapshot.file = snapshotFile;

        console.log(`  Snapshot saved with ${snapshot.backedUpData.length} backed up records`);

        return snapshot;
    }

    /**
     * Backup records before modification/deletion
     */
    async backupRecords(objectType, recordIds) {
        if (!objectType || recordIds.length === 0) return [];

        console.log(`  Backing up ${recordIds.length} ${objectType} records...`);

        try {
            // Query all fields for the records
            const idList = recordIds.map(id => `'${id}'`).join(',');

            // First get the field list
            const describeCmd = `sf sobject describe --sobject ${objectType} --target-org ${this.targetOrg} --json`;
            const describeResult = JSON.parse(execSync(describeCmd, { encoding: 'utf-8' }));

            if (describeResult.result && describeResult.result.fields) {
                // Get queryable fields
                const queryableFields = describeResult.result.fields
                    .filter(f => f.type !== 'base64' && !f.calculated)
                    .map(f => f.name)
                    .join(',');

                // Query the records
                const query = `SELECT ${queryableFields} FROM ${objectType} WHERE Id IN (${idList})`;
                const queryCmd = `sf data query --query "${query}" --target-org ${this.targetOrg} --json`;
                const queryResult = JSON.parse(execSync(queryCmd, { encoding: 'utf-8' }));

                if (queryResult.result && queryResult.result.records) {
                    return queryResult.result.records;
                }
            }
        } catch (error) {
            console.error(`  ❌ Failed to backup records: ${error.message}`);
        }

        return [];
    }

    /**
     * Commit a transaction
     */
    commitTransaction(transactionId, results = {}) {
        console.log(`\n✅ Committing transaction ${transactionId}`);

        const transaction = this.history.transactions.find(t => t.id === transactionId);

        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }

        transaction.endTime = Date.now();
        transaction.duration = transaction.endTime - transaction.startTime;
        transaction.status = 'committed';
        transaction.results = results;

        // Record created/modified/deleted IDs if available
        if (results.created) {
            transaction.createdRecords = results.created;
        }
        if (results.modified) {
            transaction.modifiedRecords = results.modified;
        }
        if (results.deleted) {
            transaction.deletedRecords = results.deleted;
        }

        this.saveTransactionHistory();

        console.log(`  Transaction committed successfully in ${transaction.duration}ms`);

        return transaction;
    }

    /**
     * Rollback a transaction
     */
    async rollbackTransaction(transactionId, reason = '') {
        console.log(`\n⏮️ Rolling back transaction ${transactionId}`);
        if (reason) {
            console.log(`  Reason: ${reason}`);
        }

        const transaction = this.history.transactions.find(t => t.id === transactionId);

        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }

        if (transaction.status === 'rolled_back') {
            console.log('  Transaction already rolled back');
            return transaction;
        }

        const rollback = {
            transactionId: transactionId,
            timestamp: Date.now(),
            reason: reason,
            status: 'in_progress',
            actions: []
        };

        try {
            // Execute rollback based on operation type
            if (transaction.snapshot) {
                if (transaction.snapshot.type === 'insert') {
                    await this.rollbackInsert(transaction, rollback);
                } else if (transaction.snapshot.type === 'update') {
                    await this.rollbackUpdate(transaction, rollback);
                } else if (transaction.snapshot.type === 'delete') {
                    await this.rollbackDelete(transaction, rollback);
                }
            }

            rollback.status = 'completed';
            transaction.status = 'rolled_back';
            console.log('  ✅ Rollback completed successfully');

        } catch (error) {
            rollback.status = 'failed';
            rollback.error = error.message;
            console.error(`  ❌ Rollback failed: ${error.message}`);
            throw error;
        } finally {
            this.history.rollbacks.push(rollback);
            this.saveTransactionHistory();
        }

        return rollback;
    }

    /**
     * Rollback insert operations
     */
    async rollbackInsert(transaction, rollback) {
        console.log('  Rolling back insert operation...');

        if (transaction.createdRecords.length === 0) {
            console.log('    No records to delete');
            return;
        }

        // Delete the created records
        const objectType = this.detectObjectTypeFromId(transaction.createdRecords[0]);

        if (!objectType) {
            throw new Error('Could not determine object type for rollback');
        }

        // Create CSV for bulk delete
        const csvFile = path.join(this.rollbackDir, 'recovery', `delete_${Date.now()}.csv`);
        const csvContent = 'Id\n' + transaction.createdRecords.join('\n');
        fs.writeFileSync(csvFile, csvContent);

        try {
            const cmd = `sf data delete bulk --sobject ${objectType} --file "${csvFile}" --wait 60 --target-org ${this.targetOrg}`;
            execSync(cmd, { encoding: 'utf-8' });

            rollback.actions.push({
                type: 'delete',
                objectType: objectType,
                recordCount: transaction.createdRecords.length,
                status: 'success'
            });

            console.log(`    Deleted ${transaction.createdRecords.length} ${objectType} records`);

        } catch (error) {
            rollback.actions.push({
                type: 'delete',
                objectType: objectType,
                error: error.message,
                status: 'failed'
            });
            throw error;
        }
    }

    /**
     * Rollback update operations
     */
    async rollbackUpdate(transaction, rollback) {
        console.log('  Rolling back update operation...');

        const snapshot = transaction.snapshot;

        if (!snapshot || snapshot.originalData.length === 0) {
            console.log('    No original data to restore');
            return;
        }

        // Restore original values
        const objectType = this.detectObjectType(snapshot.originalData[0]);

        if (!objectType) {
            throw new Error('Could not determine object type for rollback');
        }

        // Create CSV for bulk update
        const csvFile = path.join(this.rollbackDir, 'recovery', `restore_${Date.now()}.csv`);

        // Convert records to CSV
        const records = snapshot.originalData;
        const headers = Object.keys(records[0]).filter(k => k !== 'attributes');
        let csvContent = headers.join(',') + '\n';

        records.forEach(record => {
            const values = headers.map(h => {
                const value = record[h] || '';
                // Quote values with commas or newlines
                if (value.toString().includes(',') || value.toString().includes('\n')) {
                    return `"${value.toString().replace(/"/g, '""')}"`;
                }
                return value;
            });
            csvContent += values.join(',') + '\n';
        });

        fs.writeFileSync(csvFile, csvContent);

        try {
            const cmd = `sf data upsert bulk --sobject ${objectType} --external-id Id --file "${csvFile}" --wait 60 --target-org ${this.targetOrg}`;
            execSync(cmd, { encoding: 'utf-8' });

            rollback.actions.push({
                type: 'restore',
                objectType: objectType,
                recordCount: records.length,
                status: 'success'
            });

            console.log(`    Restored ${records.length} ${objectType} records to original state`);

        } catch (error) {
            rollback.actions.push({
                type: 'restore',
                objectType: objectType,
                error: error.message,
                status: 'failed'
            });
            throw error;
        }
    }

    /**
     * Rollback delete operations
     */
    async rollbackDelete(transaction, rollback) {
        console.log('  Rolling back delete operation...');

        const snapshot = transaction.snapshot;

        if (!snapshot || snapshot.backedUpData.length === 0) {
            console.log('    No data to restore');
            return;
        }

        // Re-insert deleted records
        const objectType = snapshot.objectType;

        // Remove read-only fields from backed up data
        const recordsToRestore = snapshot.backedUpData.map(record => {
            const cleaned = { ...record };
            // Remove system fields that can't be set on insert
            delete cleaned.Id;
            delete cleaned.CreatedDate;
            delete cleaned.CreatedById;
            delete cleaned.LastModifiedDate;
            delete cleaned.LastModifiedById;
            delete cleaned.SystemModstamp;
            delete cleaned.attributes;
            return cleaned;
        });

        // Create JSON for tree import
        const jsonFile = path.join(this.rollbackDir, 'recovery', `restore_${Date.now()}.json`);
        const jsonData = {
            records: recordsToRestore.map((record, i) => ({
                attributes: {
                    type: objectType,
                    referenceId: `RestoreRef${i}`
                },
                ...record
            }))
        };

        fs.writeFileSync(jsonFile, JSON.stringify(jsonData, null, 2));

        try {
            const cmd = `sf data import tree --files "${jsonFile}" --target-org ${this.targetOrg}`;
            const result = execSync(cmd, { encoding: 'utf-8' });

            rollback.actions.push({
                type: 'restore',
                objectType: objectType,
                recordCount: recordsToRestore.length,
                status: 'success'
            });

            console.log(`    Restored ${recordsToRestore.length} deleted ${objectType} records`);

        } catch (error) {
            rollback.actions.push({
                type: 'restore',
                objectType: objectType,
                error: error.message,
                status: 'failed'
            });
            throw error;
        }
    }

    /**
     * Detect object type from record structure
     */
    detectObjectType(record) {
        if (record.attributes && record.attributes.type) {
            return record.attributes.type;
        }

        // Try to infer from ID if present
        if (record.Id) {
            return this.detectObjectTypeFromId(record.Id);
        }

        // Default to Task if we're dealing with task-like records
        if (record.Subject && record.OwnerId) {
            return 'Task';
        }

        return null;
    }

    /**
     * Detect object type from Salesforce ID
     */
    detectObjectTypeFromId(recordId) {
        if (!recordId || recordId.length < 3) return null;

        const prefix = recordId.substring(0, 3);

        const prefixMap = {
            '001': 'Account',
            '003': 'Contact',
            '005': 'User',
            '006': 'Opportunity',
            '00Q': 'Lead',
            '500': 'Case',
            '00U': 'Event',
            '00T': 'Task'
        };

        return prefixMap[prefix] || null;
    }

    /**
     * Generate unique transaction ID
     */
    generateTransactionId() {
        return `txn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Generate temporary ID for tracking
     */
    generateTempId() {
        return `temp_${crypto.randomBytes(8).toString('hex')}`;
    }

    /**
     * Get transaction status
     */
    getTransactionStatus(transactionId) {
        const transaction = this.history.transactions.find(t => t.id === transactionId);
        return transaction ? transaction.status : 'not_found';
    }

    /**
     * List recent transactions
     */
    listTransactions(limit = 10) {
        return this.history.transactions
            .slice(-limit)
            .reverse()
            .map(t => ({
                id: t.id,
                operation: t.operation,
                status: t.status,
                timestamp: new Date(t.startTime).toISOString(),
                duration: t.duration,
                recordCount: t.dataCount
            }));
    }

    /**
     * Cleanup old snapshots
     */
    cleanupOldSnapshots() {
        console.log('🧹 Cleaning up old snapshots...');

        const cutoff = Date.now() - (this.retentionDays * 24 * 3600000);
        let removed = 0;

        // Clean up old transactions
        this.history.transactions = this.history.transactions.filter(t => {
            if (t.startTime < cutoff && t.status !== 'in_progress') {
                // Delete associated snapshot file
                if (t.snapshot && t.snapshot.file && fs.existsSync(t.snapshot.file)) {
                    fs.unlinkSync(t.snapshot.file);
                    removed++;
                }
                return false;
            }
            return true;
        });

        // Clean up old rollbacks
        this.history.rollbacks = this.history.rollbacks.filter(r => r.timestamp >= cutoff);

        // Clean up orphaned files
        const snapshotDir = path.join(this.rollbackDir, 'snapshots');
        if (fs.existsSync(snapshotDir)) {
            const files = fs.readdirSync(snapshotDir);
            files.forEach(file => {
                const filePath = path.join(snapshotDir, file);
                const stats = fs.statSync(filePath);
                if (stats.mtime.getTime() < cutoff) {
                    fs.unlinkSync(filePath);
                    removed++;
                }
            });
        }

        this.history.lastCleanup = Date.now();
        this.saveTransactionHistory();

        if (removed > 0) {
            console.log(`  Removed ${removed} old snapshot files`);
        }
    }
}

// CLI interface for testing
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Usage: node bulk-operation-rollback.js <command> <target-org> [options]

Commands:
  list              List recent transactions
  status <txn-id>   Get transaction status
  rollback <txn-id> Rollback a transaction
  cleanup           Clean up old snapshots

Examples:
  node bulk-operation-rollback.js list myorg
  node bulk-operation-rollback.js status txn_123456 myorg
  node bulk-operation-rollback.js rollback txn_123456 myorg
        `);
        process.exit(1);
    }

    const command = args[0];
    const targetOrg = args[1];

    const rollbackManager = new BulkOperationRollback(targetOrg);

    switch (command) {
        case 'list':
            const transactions = rollbackManager.listTransactions();
            console.log('\n📜 Recent Transactions:');
            transactions.forEach(t => {
                console.log(`  ${t.id}: ${t.operation} (${t.status}) - ${t.recordCount} records`);
            });
            break;

        case 'status':
            const txnId = args[2];
            if (!txnId) {
                console.error('❌ Transaction ID required');
                process.exit(1);
            }
            const status = rollbackManager.getTransactionStatus(txnId);
            console.log(`Transaction ${txnId}: ${status}`);
            break;

        case 'cleanup':
            rollbackManager.cleanupOldSnapshots();
            console.log('✅ Cleanup completed');
            break;

        default:
            console.error('❌ Unknown command:', command);
            process.exit(1);
    }
}

module.exports = BulkOperationRollback;
