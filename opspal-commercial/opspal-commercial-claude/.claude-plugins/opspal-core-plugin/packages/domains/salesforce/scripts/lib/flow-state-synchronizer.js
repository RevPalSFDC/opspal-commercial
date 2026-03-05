#!/usr/bin/env node

/**
 * Flow State Synchronizer (Phase 3.1)
 *
 * Provides state verification and synchronization for Salesforce Flow operations
 * to prevent state drift and enable automatic rollback on failures.
 *
 * Features:
 * - Pre-operation state snapshot (active versions, activation status)
 * - Post-operation state verification
 * - Automatic rollback on state mismatch
 * - Synchronization barrier for parallel operations
 * - State history tracking
 *
 * Prevention Target: Flow state drift, partial deployments, activation conflicts
 * ROI: $81K annual value (per Phase 3.1 specification)
 *
 * Usage:
 *   const FlowStateSynchronizer = require('./flow-state-synchronizer');
 *   const sync = new FlowStateSynchronizer(orgAlias, { verbose: true });
 *
 *   // Snapshot before operation
 *   const snapshot = await sync.createSnapshot();
 *
 *   // ... perform operations ...
 *
 *   // Verify after operation
 *   const verification = await sync.verify(snapshot);
 *
 *   // Rollback if needed
 *   if (!verification.valid) {
 *     await sync.rollback(snapshot);
 *   }
 *
 * CLI:
 *   node flow-state-synchronizer.js snapshot <org>
 *   node flow-state-synchronizer.js verify <org> <snapshot-id>
 *   node flow-state-synchronizer.js rollback <org> <snapshot-id>
 *   node flow-state-synchronizer.js history <org>
 *
 * @module flow-state-synchronizer
 * @version 1.0.0
 * @created 2025-12-09
 * @addresses Cohort - State Verification & Synchronization ($81K ROI)
 */

const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');
const crypto = require('crypto');

class FlowStateSynchronizer {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.snapshotDir = options.snapshotDir || './.flow-snapshots';
        this.rollbackTimeout = options.rollbackTimeout || 30000; // 30 seconds max rollback time

        // Synchronization barrier for parallel operations
        this.activeLocks = new Map();
        this.lockTimeout = options.lockTimeout || 60000; // 1 minute lock timeout

        // State history
        this.historyFile = path.join(this.snapshotDir, `${orgAlias}-history.json`);

        // Ensure snapshot directory exists
        if (!fs.existsSync(this.snapshotDir)) {
            fs.mkdirSync(this.snapshotDir, { recursive: true });
        }

        // Statistics
        this.stats = {
            snapshotsCreated: 0,
            verificationsRun: 0,
            rollbacksExecuted: 0,
            statesDrifted: 0,
            locksAcquired: 0
        };
    }

    /**
     * Create a state snapshot before operations
     *
     * @param {Object} options - Snapshot options
     * @returns {Object} Snapshot with flow states and metadata
     */
    async createSnapshot(options = {}) {
        const { flowNames = [], includeInactive = false, tags = [] } = options;

        const snapshotId = this._generateSnapshotId();
        const snapshot = {
            id: snapshotId,
            orgAlias: this.orgAlias,
            timestamp: new Date().toISOString(),
            tags,
            flows: {},
            metadata: {
                totalFlows: 0,
                activeFlows: 0,
                inactiveFlows: 0,
                draftFlows: 0
            },
            checksum: null
        };

        try {
            // Query FlowDefinition for flow versions (IsActive and ApiVersion are not on FlowDefinition)
            const flowQuery = flowNames.length > 0
                ? `SELECT Id, DeveloperName, ActiveVersionId, LatestVersionId, Description FROM FlowDefinition WHERE DeveloperName IN ('${flowNames.join("','")}') ORDER BY DeveloperName`
                : `SELECT Id, DeveloperName, ActiveVersionId, LatestVersionId, Description FROM FlowDefinition ORDER BY DeveloperName`;

            const flowResult = this._executeQuery(flowQuery, true);

            if (flowResult.status === 0 && flowResult.result?.records) {
                for (const flow of flowResult.result.records) {
                    snapshot.flows[flow.DeveloperName] = {
                        id: flow.Id,
                        developerName: flow.DeveloperName,
                        activeVersionId: flow.ActiveVersionId,
                        latestVersionId: flow.LatestVersionId,
                        isActive: flow.ActiveVersionId != null, // Active if has an active version
                        apiVersion: null, // Will be populated from FlowVersionView if available
                        description: flow.Description
                    };

                    snapshot.metadata.totalFlows++;
                    if (flow.ActiveVersionId) {
                        snapshot.metadata.activeFlows++;
                    } else {
                        snapshot.metadata.inactiveFlows++;
                    }
                }
            }

            // Query FlowVersionView for version details if we have active versions
            const activeVersionIds = Object.values(snapshot.flows)
                .filter(f => f.activeVersionId)
                .map(f => f.activeVersionId);

            if (activeVersionIds.length > 0) {
                const versionQuery = `SELECT Id, DurableId, FlowDefinitionId, VersionNumber, Status, ProcessType, ApiVersion FROM FlowVersionView WHERE DurableId IN ('${activeVersionIds.join("','")}')`;
                const versionResult = this._executeQuery(versionQuery, true);

                if (versionResult.status === 0 && versionResult.result?.records) {
                    for (const version of versionResult.result.records) {
                        // Find matching flow and add version info
                        for (const flowName in snapshot.flows) {
                            if (snapshot.flows[flowName].activeVersionId === version.DurableId) {
                                snapshot.flows[flowName].activeVersion = {
                                    versionNumber: version.VersionNumber,
                                    status: version.Status,
                                    processType: version.ProcessType,
                                    apiVersion: version.ApiVersion
                                };
                                break;
                            }
                        }
                    }
                }
            }

            // Generate checksum
            snapshot.checksum = this._calculateChecksum(snapshot.flows);

            // Save snapshot
            const snapshotPath = this._saveSnapshot(snapshot);
            snapshot.filePath = snapshotPath;

            // Update history
            this._addToHistory(snapshot);

            this.stats.snapshotsCreated++;

            if (this.verbose) {
                console.log(`📸 Snapshot ${snapshotId} created: ${snapshot.metadata.totalFlows} flows (${snapshot.metadata.activeFlows} active)`);
            }

            return snapshot;

        } catch (error) {
            throw new Error(`Failed to create snapshot: ${error.message}`);
        }
    }

    /**
     * Verify current state against a snapshot
     *
     * @param {Object|string} snapshot - Snapshot object or snapshot ID
     * @returns {Object} Verification result with drift details
     */
    async verify(snapshot) {
        // Load snapshot if ID provided
        if (typeof snapshot === 'string') {
            snapshot = this._loadSnapshot(snapshot);
        }

        const verification = {
            snapshotId: snapshot.id,
            timestamp: new Date().toISOString(),
            valid: true,
            drifts: [],
            summary: {
                totalChecked: 0,
                unchanged: 0,
                activated: 0,
                deactivated: 0,
                versionChanged: 0,
                deleted: 0,
                new: 0
            }
        };

        try {
            // Get current state
            const currentSnapshot = await this.createSnapshot({
                flowNames: Object.keys(snapshot.flows)
            });

            // Compare states
            for (const flowName in snapshot.flows) {
                verification.summary.totalChecked++;
                const original = snapshot.flows[flowName];
                const current = currentSnapshot.flows[flowName];

                if (!current) {
                    // Flow was deleted
                    verification.valid = false;
                    verification.drifts.push({
                        type: 'DELETED',
                        flowName,
                        severity: 'ERROR',
                        original: {
                            activeVersionId: original.activeVersionId,
                            isActive: original.isActive
                        },
                        current: null
                    });
                    verification.summary.deleted++;
                    continue;
                }

                // Check activation state
                if (original.isActive && !current.isActive) {
                    verification.valid = false;
                    verification.drifts.push({
                        type: 'DEACTIVATED',
                        flowName,
                        severity: 'ERROR',
                        original: { isActive: true, activeVersionId: original.activeVersionId },
                        current: { isActive: false, activeVersionId: current.activeVersionId }
                    });
                    verification.summary.deactivated++;
                } else if (!original.isActive && current.isActive) {
                    verification.drifts.push({
                        type: 'ACTIVATED',
                        flowName,
                        severity: 'WARNING',
                        original: { isActive: false },
                        current: { isActive: true, activeVersionId: current.activeVersionId }
                    });
                    verification.summary.activated++;
                }

                // Check active version
                if (original.activeVersionId !== current.activeVersionId) {
                    verification.drifts.push({
                        type: 'VERSION_CHANGED',
                        flowName,
                        severity: 'WARNING',
                        original: { activeVersionId: original.activeVersionId },
                        current: { activeVersionId: current.activeVersionId }
                    });
                    verification.summary.versionChanged++;
                }

                if (verification.drifts.filter(d => d.flowName === flowName).length === 0) {
                    verification.summary.unchanged++;
                }
            }

            // Check for new flows
            for (const flowName in currentSnapshot.flows) {
                if (!snapshot.flows[flowName]) {
                    verification.drifts.push({
                        type: 'NEW',
                        flowName,
                        severity: 'INFO',
                        original: null,
                        current: {
                            activeVersionId: currentSnapshot.flows[flowName].activeVersionId,
                            isActive: currentSnapshot.flows[flowName].isActive
                        }
                    });
                    verification.summary.new++;
                }
            }

            // Update stats
            this.stats.verificationsRun++;
            if (!verification.valid) {
                this.stats.statesDrifted++;
            }

            if (this.verbose) {
                const status = verification.valid ? '✅' : '❌';
                console.log(`${status} Verification complete: ${verification.summary.unchanged}/${verification.summary.totalChecked} unchanged, ${verification.drifts.length} drift(s)`);
            }

            return verification;

        } catch (error) {
            throw new Error(`Verification failed: ${error.message}`);
        }
    }

    /**
     * Rollback to snapshot state
     *
     * @param {Object|string} snapshot - Snapshot object or snapshot ID
     * @param {Object} options - Rollback options
     * @returns {Object} Rollback result
     */
    async rollback(snapshot, options = {}) {
        const { dryRun = false, force = false } = options;

        // Load snapshot if ID provided
        if (typeof snapshot === 'string') {
            snapshot = this._loadSnapshot(snapshot);
        }

        const rollbackResult = {
            snapshotId: snapshot.id,
            timestamp: new Date().toISOString(),
            dryRun,
            success: true,
            operations: [],
            errors: []
        };

        const startTime = Date.now();

        try {
            // Get current state
            const verification = await this.verify(snapshot);

            if (verification.valid && !force) {
                rollbackResult.success = true;
                rollbackResult.message = 'No rollback needed - state matches snapshot';
                return rollbackResult;
            }

            // Process each drift
            for (const drift of verification.drifts) {
                // Check timeout
                if (Date.now() - startTime > this.rollbackTimeout) {
                    rollbackResult.success = false;
                    rollbackResult.errors.push({
                        type: 'TIMEOUT',
                        message: `Rollback timed out after ${this.rollbackTimeout}ms`
                    });
                    break;
                }

                const operation = {
                    flowName: drift.flowName,
                    driftType: drift.type,
                    action: null,
                    success: false
                };

                try {
                    switch (drift.type) {
                        case 'DEACTIVATED':
                            // Reactivate flow
                            operation.action = 'REACTIVATE';
                            if (!dryRun) {
                                await this._activateFlow(drift.flowName, drift.original.activeVersionId);
                            }
                            operation.success = true;
                            break;

                        case 'ACTIVATED':
                            // This is typically okay - just log
                            operation.action = 'SKIP';
                            operation.message = 'Newly activated flow - manual review recommended';
                            operation.success = true;
                            break;

                        case 'VERSION_CHANGED':
                            // Rollback to original version
                            operation.action = 'ROLLBACK_VERSION';
                            if (!dryRun && drift.original.activeVersionId) {
                                await this._activateFlow(drift.flowName, drift.original.activeVersionId);
                            }
                            operation.success = true;
                            break;

                        case 'DELETED':
                            // Cannot restore deleted flows - log error
                            operation.action = 'CANNOT_RESTORE';
                            operation.success = false;
                            operation.message = 'Cannot restore deleted flow - manual intervention required';
                            rollbackResult.errors.push({
                                type: 'DELETED_FLOW',
                                flowName: drift.flowName,
                                message: 'Flow was deleted and cannot be automatically restored'
                            });
                            break;

                        case 'NEW':
                            // Skip new flows
                            operation.action = 'SKIP';
                            operation.message = 'New flow - not in original snapshot';
                            operation.success = true;
                            break;
                    }
                } catch (error) {
                    operation.success = false;
                    operation.error = error.message;
                    rollbackResult.errors.push({
                        type: 'OPERATION_FAILED',
                        flowName: drift.flowName,
                        action: operation.action,
                        message: error.message
                    });
                }

                rollbackResult.operations.push(operation);
            }

            // Update overall success
            rollbackResult.success = rollbackResult.errors.length === 0;
            rollbackResult.duration = Date.now() - startTime;

            this.stats.rollbacksExecuted++;

            if (this.verbose) {
                const status = rollbackResult.success ? '✅' : '❌';
                console.log(`${status} Rollback ${dryRun ? '(dry-run) ' : ''}complete: ${rollbackResult.operations.filter(o => o.success).length}/${rollbackResult.operations.length} operations succeeded`);
            }

            return rollbackResult;

        } catch (error) {
            rollbackResult.success = false;
            rollbackResult.errors.push({
                type: 'ROLLBACK_FAILED',
                message: error.message
            });
            return rollbackResult;
        }
    }

    /**
     * Acquire synchronization lock for flow operations
     *
     * @param {string} flowName - Flow to lock
     * @returns {Object} Lock object
     */
    async acquireLock(flowName) {
        const lockKey = `${this.orgAlias}:${flowName}`;
        const now = Date.now();

        // Check for existing lock
        if (this.activeLocks.has(lockKey)) {
            const existingLock = this.activeLocks.get(lockKey);

            // Check if lock has expired
            if (now - existingLock.timestamp < this.lockTimeout) {
                throw new Error(`Flow ${flowName} is locked by operation ${existingLock.operationId}`);
            }

            // Lock expired - remove it
            this.activeLocks.delete(lockKey);
        }

        // Create new lock
        const lock = {
            flowName,
            operationId: crypto.randomBytes(8).toString('hex'),
            timestamp: now,
            orgAlias: this.orgAlias
        };

        this.activeLocks.set(lockKey, lock);
        this.stats.locksAcquired++;

        if (this.verbose) {
            console.log(`🔒 Lock acquired for ${flowName} (operation: ${lock.operationId})`);
        }

        return lock;
    }

    /**
     * Release synchronization lock
     *
     * @param {Object} lock - Lock object to release
     */
    releaseLock(lock) {
        const lockKey = `${lock.orgAlias}:${lock.flowName}`;

        if (this.activeLocks.has(lockKey)) {
            const existingLock = this.activeLocks.get(lockKey);

            if (existingLock.operationId === lock.operationId) {
                this.activeLocks.delete(lockKey);

                if (this.verbose) {
                    console.log(`🔓 Lock released for ${lock.flowName}`);
                }
            }
        }
    }

    /**
     * Get state history for org
     *
     * @returns {Array} History entries
     */
    getHistory() {
        if (!fs.existsSync(this.historyFile)) {
            return [];
        }

        try {
            return JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        } catch {
            return [];
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        return { ...this.stats };
    }

    // =========================================================================
    // Private Helper Methods
    // =========================================================================

    _generateSnapshotId() {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(4).toString('hex');
        return `snap-${timestamp}-${random}`;
    }

    _calculateChecksum(flows) {
        const data = JSON.stringify(flows, Object.keys(flows).sort());
        return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
    }

    _executeQuery(query, useToolingApi = false) {
        const toolingFlag = useToolingApi ? '--use-tooling-api' : '';
        const cmd = `sf data query --query "${query.replace(/"/g, '\\"')}" ${toolingFlag} --target-org ${this.orgAlias} --json`;

        try {
            const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            return JSON.parse(output);
        } catch (error) {
            if (error.stdout) {
                try {
                    return JSON.parse(error.stdout);
                } catch {
                    // Fall through
                }
            }
            return { status: 1, message: error.message, result: { records: [] } };
        }
    }

    _saveSnapshot(snapshot) {
        const filename = `${snapshot.id}-${this.orgAlias}.json`;
        const filePath = path.join(this.snapshotDir, filename);
        fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
        return filePath;
    }

    _loadSnapshot(snapshotId) {
        // Try direct filename first
        let filePath = path.join(this.snapshotDir, `${snapshotId}-${this.orgAlias}.json`);

        if (!fs.existsSync(filePath)) {
            // Try with .json extension
            filePath = path.join(this.snapshotDir, `${snapshotId}.json`);
        }

        if (!fs.existsSync(filePath)) {
            // Search for matching snapshot
            const files = fs.readdirSync(this.snapshotDir)
                .filter(f => f.includes(snapshotId) && f.endsWith('.json'));

            if (files.length === 0) {
                throw new Error(`Snapshot ${snapshotId} not found`);
            }

            filePath = path.join(this.snapshotDir, files[0]);
        }

        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    _addToHistory(snapshot) {
        const history = this.getHistory();

        history.push({
            id: snapshot.id,
            timestamp: snapshot.timestamp,
            totalFlows: snapshot.metadata.totalFlows,
            activeFlows: snapshot.metadata.activeFlows,
            checksum: snapshot.checksum
        });

        // Keep last 50 entries
        const trimmed = history.slice(-50);

        fs.writeFileSync(this.historyFile, JSON.stringify(trimmed, null, 2));
    }

    async _activateFlow(flowName, versionId) {
        // Use sf flow activate command or Tooling API
        const cmd = `sf flow activate --flow-name ${flowName} --target-org ${this.orgAlias} --json`;

        try {
            const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            return JSON.parse(output);
        } catch (error) {
            // Fall back to Tooling API update
            throw new Error(`Failed to activate flow ${flowName}: ${error.message}`);
        }
    }
}

// CLI interface
if (require.main === module) {
    const [,, command, orgAlias, arg1] = process.argv;

    const showHelp = () => {
        console.log(`
Flow State Synchronizer (Phase 3.1)

Usage:
  node flow-state-synchronizer.js <command> <org-alias> [args]

Commands:
  snapshot <org>                    Create state snapshot
  verify <org> <snapshot-id>        Verify current state against snapshot
  rollback <org> <snapshot-id>      Rollback to snapshot state
  rollback-dry <org> <snapshot-id>  Dry-run rollback (no changes)
  history <org>                     Show snapshot history
  stats <org>                       Show synchronizer statistics

Examples:
  node flow-state-synchronizer.js snapshot myorg
  node flow-state-synchronizer.js verify myorg snap-abc123
  node flow-state-synchronizer.js rollback-dry myorg snap-abc123
  node flow-state-synchronizer.js history myorg
        `);
    };

    if (!command || !orgAlias) {
        showHelp();
        process.exit(1);
    }

    const sync = new FlowStateSynchronizer(orgAlias, { verbose: true });

    async function main() {
        switch (command) {
            case 'snapshot': {
                console.log(`Creating snapshot for org: ${orgAlias}...\n`);
                const snapshot = await sync.createSnapshot();

                console.log('\nSnapshot Details:');
                console.log('─'.repeat(50));
                console.log(`  ID: ${snapshot.id}`);
                console.log(`  Checksum: ${snapshot.checksum}`);
                console.log(`  Total Flows: ${snapshot.metadata.totalFlows}`);
                console.log(`  Active: ${snapshot.metadata.activeFlows}`);
                console.log(`  Inactive: ${snapshot.metadata.inactiveFlows}`);
                console.log(`  File: ${snapshot.filePath}`);
                break;
            }

            case 'verify': {
                if (!arg1) {
                    console.error('Error: snapshot-id required');
                    showHelp();
                    process.exit(1);
                }

                console.log(`Verifying state against snapshot: ${arg1}...\n`);
                const verification = await sync.verify(arg1);

                console.log('\nVerification Result:');
                console.log('─'.repeat(50));
                console.log(`  Valid: ${verification.valid ? 'Yes' : 'NO - DRIFT DETECTED'}`);
                console.log(`  Checked: ${verification.summary.totalChecked}`);
                console.log(`  Unchanged: ${verification.summary.unchanged}`);
                console.log(`  Drifts: ${verification.drifts.length}`);

                if (verification.drifts.length > 0) {
                    console.log('\nDrift Details:');
                    verification.drifts.forEach(d => {
                        console.log(`  ${d.severity === 'ERROR' ? '❌' : '⚠️'}  ${d.flowName}: ${d.type}`);
                    });
                }
                break;
            }

            case 'rollback':
            case 'rollback-dry': {
                if (!arg1) {
                    console.error('Error: snapshot-id required');
                    showHelp();
                    process.exit(1);
                }

                const dryRun = command === 'rollback-dry';
                console.log(`${dryRun ? '[DRY-RUN] ' : ''}Rolling back to snapshot: ${arg1}...\n`);

                const result = await sync.rollback(arg1, { dryRun });

                console.log('\nRollback Result:');
                console.log('─'.repeat(50));
                console.log(`  Success: ${result.success ? 'Yes' : 'No'}`);
                console.log(`  Duration: ${result.duration}ms`);
                console.log(`  Operations: ${result.operations.length}`);

                if (result.operations.length > 0) {
                    console.log('\nOperations:');
                    result.operations.forEach(op => {
                        console.log(`  ${op.success ? '✅' : '❌'} ${op.flowName}: ${op.action}`);
                    });
                }

                if (result.errors.length > 0) {
                    console.log('\nErrors:');
                    result.errors.forEach(err => {
                        console.log(`  ❌ ${err.type}: ${err.message}`);
                    });
                }
                break;
            }

            case 'history': {
                console.log(`Snapshot history for org: ${orgAlias}\n`);
                const history = sync.getHistory();

                if (history.length === 0) {
                    console.log('No snapshots found.');
                } else {
                    console.log('─'.repeat(70));
                    console.log(`${'ID'.padEnd(25)} ${'Timestamp'.padEnd(25)} ${'Flows'.padEnd(10)} ${'Active'}`);
                    console.log('─'.repeat(70));

                    history.slice(-20).forEach(h => {
                        console.log(`${h.id.padEnd(25)} ${h.timestamp.substring(0, 19).padEnd(25)} ${String(h.totalFlows).padEnd(10)} ${h.activeFlows}`);
                    });
                }
                break;
            }

            case 'stats': {
                console.log(`Statistics for org: ${orgAlias}\n`);
                const stats = sync.getStats();

                console.log('─'.repeat(40));
                Object.entries(stats).forEach(([key, value]) => {
                    console.log(`  ${key}: ${value}`);
                });
                break;
            }

            default:
                console.error(`Unknown command: ${command}`);
                showHelp();
                process.exit(1);
        }
    }

    main().catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
    });
}

module.exports = FlowStateSynchronizer;
