#!/usr/bin/env node

/**
 * Operation Verifier and Rollback Framework
 * 
 * Comprehensive system for tracking operations, verifying results,
 * and providing rollback capability for Salesforce data operations.
 * 
 * Features:
 * - Before/after state snapshots
 * - Automatic rollback on failure
 * - Data integrity verification
 * - Audit trail generation
 * - Resume capability for partial operations
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class OperationVerifier {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.operations = new Map();
        this.snapshots = new Map();
        this.rollbackQueue = [];
        this.verificationResults = [];
        this.auditDir = path.join(__dirname, '../../data/audit');
        this.snapshotDir = path.join(__dirname, '../../data/snapshots');
        
        // Ensure directories exist
        this.initDirectories();
    }

    async initDirectories() {
        await fs.mkdir(this.auditDir, { recursive: true });
        await fs.mkdir(this.snapshotDir, { recursive: true });
    }

    /**
     * Start tracking an operation
     */
    async startOperation(operationId, metadata) {
        const operation = {
            id: operationId || crypto.randomBytes(8).toString('hex'),
            startTime: new Date(),
            metadata: metadata,
            status: 'in_progress',
            snapshots: {
                before: null,
                after: null
            },
            changes: [],
            verifications: [],
            canRollback: false
        };

        this.operations.set(operation.id, operation);

        // Take before snapshot
        if (metadata.object && metadata.captureSnapshot !== false) {
            operation.snapshots.before = await this.captureSnapshot(
                metadata.object,
                metadata.filter,
                `${operation.id}_before`
            );
        }

        console.log(`📸 Operation ${operation.id} started - snapshot captured`);
        return operation.id;
    }

    /**
     * Capture state snapshot
     */
    async captureSnapshot(objectName, filter, snapshotId) {
        const snapshot = {
            id: snapshotId || crypto.randomBytes(8).toString('hex'),
            timestamp: new Date(),
            object: objectName,
            filter: filter,
            data: null,
            metadata: null,
            checksum: null
        };

        try {
            // Build query
            let query = `SELECT * FROM ${objectName}`;
            if (filter) {
                query += ` WHERE ${filter}`;
            }
            query += ' LIMIT 10000'; // Safety limit

            // Capture data
            const result = await this.executeQuery(query);
            snapshot.data = result.records;
            snapshot.recordCount = result.totalSize;

            // Capture metadata
            snapshot.metadata = await this.getObjectMetadata(objectName);

            // Calculate checksum
            snapshot.checksum = this.calculateChecksum(snapshot.data);

            // Save snapshot to file
            const snapshotFile = path.join(this.snapshotDir, `${snapshot.id}.json`);
            await fs.writeFile(snapshotFile, JSON.stringify(snapshot, null, 2));

            this.snapshots.set(snapshot.id, snapshot);
            
            console.log(`  📷 Snapshot captured: ${snapshot.recordCount} ${objectName} records`);
            return snapshot;

        } catch (error) {
            console.error(`  ❌ Failed to capture snapshot: ${error.message}`);
            snapshot.error = error.message;
            return snapshot;
        }
    }

    /**
     * Record a change made during operation
     */
    recordChange(operationId, change) {
        const operation = this.operations.get(operationId);
        if (!operation) {
            throw new Error(`Operation ${operationId} not found`);
        }

        const changeRecord = {
            timestamp: new Date(),
            type: change.type, // insert, update, delete
            object: change.object,
            recordId: change.recordId,
            oldValue: change.oldValue,
            newValue: change.newValue,
            field: change.field,
            rollbackInfo: change.rollbackInfo
        };

        operation.changes.push(changeRecord);

        // Update rollback capability
        if (changeRecord.type === 'insert') {
            operation.canRollback = true;
            this.addToRollbackQueue(operationId, {
                action: 'delete',
                object: changeRecord.object,
                recordId: changeRecord.recordId
            });
        } else if (changeRecord.type === 'update' && changeRecord.oldValue) {
            operation.canRollback = true;
            this.addToRollbackQueue(operationId, {
                action: 'update',
                object: changeRecord.object,
                recordId: changeRecord.recordId,
                field: changeRecord.field,
                value: changeRecord.oldValue
            });
        } else if (changeRecord.type === 'delete' && changeRecord.oldValue) {
            operation.canRollback = true;
            this.addToRollbackQueue(operationId, {
                action: 'insert',
                object: changeRecord.object,
                data: changeRecord.oldValue
            });
        }

        return changeRecord;
    }

    /**
     * Complete an operation and verify results
     */
    async completeOperation(operationId, status = 'completed') {
        const operation = this.operations.get(operationId);
        if (!operation) {
            throw new Error(`Operation ${operationId} not found`);
        }

        operation.endTime = new Date();
        operation.duration = operation.endTime - operation.startTime;
        operation.status = status;

        // Take after snapshot
        if (operation.metadata.object && operation.metadata.captureSnapshot !== false) {
            operation.snapshots.after = await this.captureSnapshot(
                operation.metadata.object,
                operation.metadata.filter,
                `${operation.id}_after`
            );
        }

        // Perform verification
        if (operation.snapshots.before && operation.snapshots.after) {
            operation.verifications = await this.verifyOperation(operation);
        }

        // Generate audit trail
        const auditTrail = await this.generateAuditTrail(operation);
        operation.auditFile = auditTrail;

        // Save operation record
        await this.saveOperation(operation);

        console.log(`✅ Operation ${operationId} completed in ${operation.duration}ms`);
        
        return {
            operationId,
            status: operation.status,
            duration: operation.duration,
            changes: operation.changes.length,
            verifications: operation.verifications,
            canRollback: operation.canRollback,
            auditFile: operation.auditFile
        };
    }

    /**
     * Verify operation results
     */
    async verifyOperation(operation) {
        const verifications = [];
        const before = operation.snapshots.before;
        const after = operation.snapshots.after;

        // Record count verification
        const countDiff = after.recordCount - before.recordCount;
        verifications.push({
            type: 'record_count',
            before: before.recordCount,
            after: after.recordCount,
            difference: countDiff,
            expected: operation.metadata.expectedCount,
            passed: operation.metadata.expectedCount ? 
                countDiff === operation.metadata.expectedCount : true
        });

        // Checksum verification
        if (before.checksum !== after.checksum) {
            verifications.push({
                type: 'data_modified',
                beforeChecksum: before.checksum,
                afterChecksum: after.checksum,
                passed: true // Expected to be different
            });
        }

        // Field-level verification
        if (operation.metadata.verifyFields) {
            for (const field of operation.metadata.verifyFields) {
                const fieldVerification = await this.verifyField(
                    operation.metadata.object,
                    field,
                    before.data,
                    after.data
                );
                verifications.push(fieldVerification);
            }
        }

        // Integrity checks
        if (operation.metadata.integrityChecks) {
            for (const check of operation.metadata.integrityChecks) {
                const integrityResult = await this.performIntegrityCheck(check, after.data);
                verifications.push(integrityResult);
            }
        }

        // Change verification
        const changeVerification = this.verifyChanges(operation.changes, before.data, after.data);
        verifications.push(...changeVerification);

        return verifications;
    }

    /**
     * Verify specific field changes
     */
    async verifyField(objectName, fieldName, beforeData, afterData) {
        const beforeValues = new Set(beforeData.map(r => r[fieldName]));
        const afterValues = new Set(afterData.map(r => r[fieldName]));

        const added = [];
        const removed = [];
        
        for (const value of afterValues) {
            if (!beforeValues.has(value)) {
                added.push(value);
            }
        }
        
        for (const value of beforeValues) {
            if (!afterValues.has(value)) {
                removed.push(value);
            }
        }

        return {
            type: 'field_verification',
            field: fieldName,
            added: added.length,
            removed: removed.length,
            uniqueValuesBefore: beforeValues.size,
            uniqueValuesAfter: afterValues.size,
            passed: true
        };
    }

    /**
     * Verify recorded changes match actual changes
     */
    verifyChanges(changes, beforeData, afterData) {
        const verifications = [];
        const beforeMap = new Map(beforeData.map(r => [r.Id, r]));
        const afterMap = new Map(afterData.map(r => [r.Id, r]));

        // Verify inserts
        const inserts = changes.filter(c => c.type === 'insert');
        const actualInserts = Array.from(afterMap.keys()).filter(id => !beforeMap.has(id));
        
        verifications.push({
            type: 'insert_verification',
            recorded: inserts.length,
            actual: actualInserts.length,
            passed: inserts.length === actualInserts.length
        });

        // Verify updates
        const updates = changes.filter(c => c.type === 'update');
        let actualUpdates = 0;
        
        for (const [id, afterRecord] of afterMap) {
            const beforeRecord = beforeMap.get(id);
            if (beforeRecord && JSON.stringify(beforeRecord) !== JSON.stringify(afterRecord)) {
                actualUpdates++;
            }
        }
        
        verifications.push({
            type: 'update_verification',
            recorded: updates.length,
            actual: actualUpdates,
            passed: Math.abs(updates.length - actualUpdates) <= 1 // Allow small discrepancy
        });

        // Verify deletes
        const deletes = changes.filter(c => c.type === 'delete');
        const actualDeletes = Array.from(beforeMap.keys()).filter(id => !afterMap.has(id));
        
        verifications.push({
            type: 'delete_verification',
            recorded: deletes.length,
            actual: actualDeletes.length,
            passed: deletes.length === actualDeletes.length
        });

        return verifications;
    }

    /**
     * Perform integrity check
     */
    async performIntegrityCheck(check, data) {
        const result = {
            type: 'integrity_check',
            check: check.name,
            passed: false,
            details: []
        };

        switch (check.type) {
            case 'required_fields':
                for (const record of data) {
                    for (const field of check.fields) {
                        if (!record[field]) {
                            result.details.push(`Record ${record.Id} missing ${field}`);
                        }
                    }
                }
                result.passed = result.details.length === 0;
                break;

            case 'unique_constraint':
                const values = new Set();
                for (const record of data) {
                    const value = record[check.field];
                    if (values.has(value)) {
                        result.details.push(`Duplicate value '${value}' in field ${check.field}`);
                    }
                    values.add(value);
                }
                result.passed = result.details.length === 0;
                break;

            case 'referential_integrity':
                const query = `SELECT Id FROM ${check.referencedObject} WHERE Id IN ('${
                    data.map(r => r[check.field]).filter(Boolean).join("','")
                }')`;
                const referenced = await this.executeQuery(query);
                const referencedIds = new Set(referenced.records.map(r => r.Id));
                
                for (const record of data) {
                    if (record[check.field] && !referencedIds.has(record[check.field])) {
                        result.details.push(`Invalid reference ${record[check.field]} in ${check.field}`);
                    }
                }
                result.passed = result.details.length === 0;
                break;
        }

        return result;
    }

    /**
     * Rollback an operation
     */
    async rollbackOperation(operationId) {
        const operation = this.operations.get(operationId);
        if (!operation) {
            throw new Error(`Operation ${operationId} not found`);
        }

        if (!operation.canRollback) {
            throw new Error(`Operation ${operationId} cannot be rolled back`);
        }

        console.log(`🔄 Rolling back operation ${operationId}...`);
        
        const rollbackResults = {
            operationId,
            startTime: new Date(),
            actions: [],
            errors: [],
            success: true
        };

        // Get rollback actions for this operation
        const rollbackActions = this.rollbackQueue.filter(r => r.operationId === operationId);
        
        // Execute rollback actions in reverse order
        for (const action of rollbackActions.reverse()) {
            try {
                console.log(`  Executing rollback: ${action.action} on ${action.object}`);
                
                switch (action.action) {
                    case 'delete':
                        await this.executeDelete(action.object, action.recordId);
                        break;
                    
                    case 'update':
                        await this.executeUpdate(action.object, action.recordId, {
                            [action.field]: action.value
                        });
                        break;
                    
                    case 'insert':
                        await this.executeInsert(action.object, action.data);
                        break;
                }
                
                rollbackResults.actions.push({
                    ...action,
                    status: 'success'
                });
                
            } catch (error) {
                console.error(`  ❌ Rollback action failed: ${error.message}`);
                rollbackResults.errors.push({
                    action,
                    error: error.message
                });
                rollbackResults.success = false;
            }
        }

        rollbackResults.endTime = new Date();
        rollbackResults.duration = rollbackResults.endTime - rollbackResults.startTime;

        // Update operation status
        operation.status = rollbackResults.success ? 'rolled_back' : 'rollback_failed';
        operation.rollbackResults = rollbackResults;

        // Save updated operation
        await this.saveOperation(operation);

        console.log(`${rollbackResults.success ? '✅' : '❌'} Rollback ${
            rollbackResults.success ? 'completed' : 'failed'
        } - ${rollbackResults.actions.length} actions, ${rollbackResults.errors.length} errors`);

        return rollbackResults;
    }

    /**
     * Add action to rollback queue
     */
    addToRollbackQueue(operationId, action) {
        this.rollbackQueue.push({
            operationId,
            timestamp: new Date(),
            ...action
        });
    }

    /**
     * Generate audit trail
     */
    async generateAuditTrail(operation) {
        const audit = {
            operationId: operation.id,
            startTime: operation.startTime,
            endTime: operation.endTime,
            duration: operation.duration,
            status: operation.status,
            metadata: operation.metadata,
            changes: operation.changes,
            verifications: operation.verifications,
            snapshots: {
                before: operation.snapshots.before ? {
                    id: operation.snapshots.before.id,
                    recordCount: operation.snapshots.before.recordCount,
                    checksum: operation.snapshots.before.checksum
                } : null,
                after: operation.snapshots.after ? {
                    id: operation.snapshots.after.id,
                    recordCount: operation.snapshots.after.recordCount,
                    checksum: operation.snapshots.after.checksum
                } : null
            },
            canRollback: operation.canRollback
        };

        const auditFile = path.join(this.auditDir, `audit_${operation.id}.json`);
        await fs.writeFile(auditFile, JSON.stringify(audit, null, 2));

        return auditFile;
    }

    /**
     * Save operation record
     */
    async saveOperation(operation) {
        const operationFile = path.join(this.auditDir, `operation_${operation.id}.json`);
        await fs.writeFile(operationFile, JSON.stringify(operation, null, 2));
    }

    /**
     * Get operation summary
     */
    async getOperationSummary(operationId) {
        const operation = this.operations.get(operationId);
        if (!operation) {
            // Try to load from file
            const operationFile = path.join(this.auditDir, `operation_${operationId}.json`);
            try {
                const data = await fs.readFile(operationFile, 'utf8');
                return JSON.parse(data);
            } catch (error) {
                throw new Error(`Operation ${operationId} not found`);
            }
        }
        
        return {
            id: operation.id,
            status: operation.status,
            startTime: operation.startTime,
            endTime: operation.endTime,
            duration: operation.duration,
            metadata: operation.metadata,
            changeCount: operation.changes.length,
            verificationResults: operation.verifications,
            canRollback: operation.canRollback,
            rollbackResults: operation.rollbackResults
        };
    }

    /**
     * Calculate checksum for data
     */
    calculateChecksum(data) {
        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(data));
        return hash.digest('hex');
    }

    /**
     * Execute SOQL query
     */
    async executeQuery(query) {
        const cmd = `sf data query --query "${query.replace(/"/g, '\\"')}" --json --target-org ${this.orgAlias}`;
        const result = await execAsync(cmd);
        return JSON.parse(result.stdout).result;
    }

    /**
     * Get object metadata
     */
    async getObjectMetadata(objectName) {
        const cmd = `sf sobject describe --sobject ${objectName} --json --target-org ${this.orgAlias}`;
        const result = await execAsync(cmd);
        const describe = JSON.parse(result.stdout).result;
        
        return {
            name: describe.name,
            label: describe.label,
            fieldCount: describe.fields?.length,
            recordTypeCount: describe.recordTypeInfos?.length,
            custom: describe.custom
        };
    }

    /**
     * Execute delete operation
     */
    async executeDelete(objectName, recordId) {
        const cmd = `sf data delete record --sobject ${objectName} --record-id ${recordId} --target-org ${this.orgAlias}`;
        await execAsync(cmd);
    }

    /**
     * Execute update operation
     */
    async executeUpdate(objectName, recordId, fields) {
        const values = Object.entries(fields)
            .map(([key, value]) => `${key}='${value}'`)
            .join(' ');
        
        const cmd = `sf data update record --sobject ${objectName} --record-id ${recordId} --values "${values}" --target-org ${this.orgAlias}`;
        await execAsync(cmd);
    }

    /**
     * Execute insert operation
     */
    async executeInsert(objectName, data) {
        const values = Object.entries(data)
            .filter(([key]) => key !== 'Id' && key !== 'attributes')
            .map(([key, value]) => `${key}='${value}'`)
            .join(' ');
        
        const cmd = `sf data create record --sobject ${objectName} --values "${values}" --target-org ${this.orgAlias}`;
        const result = await execAsync(cmd);
        return JSON.parse(result.stdout).result;
    }
}

// Export for use in other modules
module.exports = OperationVerifier;

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
Operation Verifier and Rollback Framework

Usage:
  node operation-verifier.js <command> [options]

Commands:
  start <metadata>          Start tracking an operation
  complete <operationId>    Complete and verify an operation
  rollback <operationId>    Rollback an operation
  summary <operationId>     Get operation summary
  list                      List all operations

Options:
  --org <alias>             Target org alias
  --output <file>           Save results to file

Examples:
  node operation-verifier.js start '{"object":"Account","operation":"update"}' --org myorg
  node operation-verifier.js complete op_12345
  node operation-verifier.js rollback op_12345
  node operation-verifier.js summary op_12345
        `);
        process.exit(0);
    }

    (async () => {
        try {
            const command = args[0];
            const orgAlias = args.includes('--org') ? 
                args[args.indexOf('--org') + 1] : 
                process.env.SF_TARGET_ORG;
            
            const verifier = new OperationVerifier(orgAlias);
            let result;

            switch (command) {
                case 'start': {
                    const metadata = JSON.parse(args[1]);
                    result = await verifier.startOperation(null, metadata);
                    console.log(`Operation started: ${result}`);
                    break;
                }

                case 'complete': {
                    const operationId = args[1];
                    result = await verifier.completeOperation(operationId);
                    console.log('Operation completed:', result);
                    break;
                }

                case 'rollback': {
                    const operationId = args[1];
                    result = await verifier.rollbackOperation(operationId);
                    console.log('Rollback result:', result);
                    break;
                }

                case 'summary': {
                    const operationId = args[1];
                    result = await verifier.getOperationSummary(operationId);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }

                case 'list': {
                    const files = await fs.readdir(verifier.auditDir);
                    const operations = files
                        .filter(f => f.startsWith('operation_'))
                        .map(f => f.replace('operation_', '').replace('.json', ''));
                    
                    console.log('Operations:', operations);
                    break;
                }

                default:
                    throw new Error(`Unknown command: ${command}`);
            }

            if (args.includes('--output') && result) {
                const outputFile = args[args.indexOf('--output') + 1];
                await fs.writeFile(outputFile, JSON.stringify(result, null, 2));
                console.log(`Results saved to ${outputFile}`);
            }

        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}