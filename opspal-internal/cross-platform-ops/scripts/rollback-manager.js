#!/usr/bin/env node

/**
 * Rollback Manager for Cross-Platform Sync Operations
 * Provides snapshot, rollback, and recovery capabilities
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');

class RollbackManager {
    constructor(configPath) {
        this.config = this.loadConfig(configPath);
        this.snapshotDir = path.join(__dirname, '..', 'snapshots');
        this.rollbackLog = [];
        this.currentSnapshot = null;

        // Create snapshot directory if it doesn't exist
        if (!fs.existsSync(this.snapshotDir)) {
            fs.mkdirSync(this.snapshotDir, { recursive: true });
        }
    }

    loadConfig(configPath) {
        const fullPath = path.resolve(configPath);
        const configContent = fs.readFileSync(fullPath, 'utf8');
        return yaml.load(configContent);
    }

    /**
     * Create a snapshot before sync operation
     */
    async createSnapshot(operation) {
        const snapshotId = this.generateSnapshotId();
        const timestamp = new Date().toISOString();

        console.log(`📸 Creating snapshot ${snapshotId}...`);

        const snapshot = {
            id: snapshotId,
            timestamp,
            operation,
            data: {
                salesforce: {},
                hubspot: {}
            },
            metadata: {
                recordCounts: {},
                checksums: {},
                systemState: {}
            }
        };

        try {
            // Capture Salesforce state
            snapshot.data.salesforce = await this.captureSalesforceState(operation.objectType);

            // Capture HubSpot state
            snapshot.data.hubspot = await this.captureHubSpotState(operation.objectType);

            // Calculate checksums
            snapshot.metadata.checksums = this.calculateChecksums(snapshot.data);

            // Save snapshot to disk
            const snapshotPath = path.join(this.snapshotDir, `${snapshotId}.json`);
            fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

            // Update current snapshot reference
            this.currentSnapshot = snapshot;

            console.log(`✅ Snapshot ${snapshotId} created successfully`);
            console.log(`   Records captured: SF=${Object.keys(snapshot.data.salesforce).length}, HS=${Object.keys(snapshot.data.hubspot).length}`);

            return snapshotId;
        } catch (error) {
            console.error(`❌ Failed to create snapshot: ${error.message}`);
            throw error;
        }
    }

    /**
     * Capture Salesforce state
     */
    async captureSalesforceState(objectType) {
        // In production, this would query actual Salesforce data
        // For simulation, generating sample data

        const state = {};
        const recordCount = Math.floor(Math.random() * 100) + 50;

        for (let i = 0; i < recordCount; i++) {
            const recordId = `00Q${String(i).padStart(15, '0')}`;
            state[recordId] = {
                Id: recordId,
                LastModifiedDate: new Date(Date.now() - Math.random() * 86400000).toISOString(),
                FirstName: `First${i}`,
                LastName: `Last${i}`,
                Email: `email${i}@example.com`,
                _checksum: this.generateChecksum(`${recordId}-${Date.now()}`)
            };
        }

        return state;
    }

    /**
     * Capture HubSpot state
     */
    async captureHubSpotState(objectType) {
        // In production, this would query actual HubSpot data
        // For simulation, generating sample data

        const state = {};
        const recordCount = Math.floor(Math.random() * 100) + 50;

        for (let i = 0; i < recordCount; i++) {
            const recordId = String(1000 + i);
            state[recordId] = {
                id: recordId,
                updatedAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
                firstname: `First${i}`,
                lastname: `Last${i}`,
                email: `email${i}@example.com`,
                _checksum: this.generateChecksum(`${recordId}-${Date.now()}`)
            };
        }

        return state;
    }

    /**
     * Execute rollback to a specific snapshot
     */
    async executeRollback(snapshotId, options = {}) {
        const {
            dryRun = false,
            partial = false,
            recordIds = [],
            skipValidation = false
        } = options;

        console.log(`🔄 Starting rollback to snapshot ${snapshotId}...`);

        // Load snapshot
        const snapshot = this.loadSnapshot(snapshotId);
        if (!snapshot) {
            throw new Error(`Snapshot ${snapshotId} not found`);
        }

        // Validate snapshot integrity
        if (!skipValidation) {
            const isValid = this.validateSnapshot(snapshot);
            if (!isValid) {
                throw new Error('Snapshot validation failed - data may be corrupted');
            }
        }

        // Create rollback plan
        const rollbackPlan = this.createRollbackPlan(snapshot, { partial, recordIds });

        // Display rollback plan
        this.displayRollbackPlan(rollbackPlan);

        if (dryRun) {
            console.log('🔍 DRY RUN MODE - No changes will be made');
            return this.simulateRollback(rollbackPlan);
        }

        // Execute rollback
        const results = await this.performRollback(rollbackPlan);

        // Log rollback operation
        this.logRollback({
            snapshotId,
            timestamp: new Date().toISOString(),
            plan: rollbackPlan,
            results
        });

        return results;
    }

    /**
     * Create rollback plan
     */
    createRollbackPlan(snapshot, options) {
        const plan = {
            snapshotId: snapshot.id,
            timestamp: snapshot.timestamp,
            operations: [],
            recordsToRestore: {
                salesforce: [],
                hubspot: []
            },
            estimatedTime: 0,
            risk: 'low'
        };

        // Determine which records need restoration
        if (options.partial && options.recordIds.length > 0) {
            // Partial rollback - specific records only
            plan.recordsToRestore.salesforce = options.recordIds.filter(id =>
                snapshot.data.salesforce[id]
            );
            plan.recordsToRestore.hubspot = options.recordIds.filter(id =>
                snapshot.data.hubspot[id]
            );
        } else {
            // Full rollback
            plan.recordsToRestore.salesforce = Object.keys(snapshot.data.salesforce);
            plan.recordsToRestore.hubspot = Object.keys(snapshot.data.hubspot);
        }

        // Generate operations
        plan.operations = this.generateRollbackOperations(plan.recordsToRestore);

        // Calculate estimated time
        plan.estimatedTime = this.estimateRollbackTime(plan);

        // Assess risk level
        plan.risk = this.assessRollbackRisk(plan);

        return plan;
    }

    /**
     * Generate rollback operations
     */
    generateRollbackOperations(recordsToRestore) {
        const operations = [];

        // Salesforce restore operations
        if (recordsToRestore.salesforce.length > 0) {
            operations.push({
                platform: 'salesforce',
                type: 'bulk_update',
                recordCount: recordsToRestore.salesforce.length,
                batches: Math.ceil(recordsToRestore.salesforce.length / 200)
            });
        }

        // HubSpot restore operations
        if (recordsToRestore.hubspot.length > 0) {
            operations.push({
                platform: 'hubspot',
                type: 'batch_update',
                recordCount: recordsToRestore.hubspot.length,
                batches: Math.ceil(recordsToRestore.hubspot.length / 100)
            });
        }

        return operations;
    }

    /**
     * Perform actual rollback
     */
    async performRollback(plan) {
        const results = {
            success: true,
            restored: {
                salesforce: 0,
                hubspot: 0
            },
            failed: {
                salesforce: 0,
                hubspot: 0
            },
            errors: []
        };

        console.log('⚡ Executing rollback operations...');

        // Execute operations in sequence
        for (const operation of plan.operations) {
            try {
                console.log(`  Processing ${operation.platform}: ${operation.recordCount} records in ${operation.batches} batches`);

                // Simulate rollback execution
                // In production, this would call actual APIs
                await this.delay(1000);

                if (Math.random() > 0.95) {
                    throw new Error(`Random failure in ${operation.platform}`);
                }

                results.restored[operation.platform] = operation.recordCount;

            } catch (error) {
                results.success = false;
                results.failed[operation.platform] = operation.recordCount;
                results.errors.push({
                    platform: operation.platform,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Validate snapshot integrity
     */
    validateSnapshot(snapshot) {
        console.log('🔍 Validating snapshot integrity...');

        // Verify checksums
        const currentChecksums = this.calculateChecksums(snapshot.data);

        for (const [key, value] of Object.entries(snapshot.metadata.checksums)) {
            if (currentChecksums[key] !== value) {
                console.error(`❌ Checksum mismatch for ${key}`);
                return false;
            }
        }

        console.log('✅ Snapshot validation successful');
        return true;
    }

    /**
     * Display rollback plan
     */
    displayRollbackPlan(plan) {
        console.log('\n📋 Rollback Plan:');
        console.log(`  Snapshot: ${plan.snapshotId}`);
        console.log(`  Created: ${plan.timestamp}`);
        console.log(`  Risk Level: ${plan.risk}`);
        console.log(`  Estimated Time: ${plan.estimatedTime} seconds`);
        console.log('\n  Operations:');

        for (const op of plan.operations) {
            console.log(`    - ${op.platform}: ${op.recordCount} records (${op.batches} batches)`);
        }

        console.log('\n  Records to Restore:');
        console.log(`    Salesforce: ${plan.recordsToRestore.salesforce.length}`);
        console.log(`    HubSpot: ${plan.recordsToRestore.hubspot.length}`);
    }

    /**
     * Simulate rollback for dry run
     */
    simulateRollback(plan) {
        console.log('\n🎭 Simulating rollback...');

        const simulatedResults = {
            success: true,
            restored: {
                salesforce: plan.recordsToRestore.salesforce.length,
                hubspot: plan.recordsToRestore.hubspot.length
            },
            failed: {
                salesforce: 0,
                hubspot: 0
            },
            errors: [],
            simulation: true
        };

        console.log('✅ Simulation complete - no actual changes made');
        console.log(`   Would restore: SF=${simulatedResults.restored.salesforce}, HS=${simulatedResults.restored.hubspot}`);

        return simulatedResults;
    }

    /**
     * List available snapshots
     */
    listSnapshots(limit = 10) {
        const files = fs.readdirSync(this.snapshotDir)
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse()
            .slice(0, limit);

        const snapshots = files.map(file => {
            const data = JSON.parse(fs.readFileSync(path.join(this.snapshotDir, file), 'utf8'));
            return {
                id: data.id,
                timestamp: data.timestamp,
                operation: data.operation,
                recordCount: Object.keys(data.data.salesforce).length + Object.keys(data.data.hubspot).length,
                size: fs.statSync(path.join(this.snapshotDir, file)).size
            };
        });

        return snapshots;
    }

    /**
     * Clean old snapshots
     */
    cleanOldSnapshots(retentionDays = 7) {
        const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
        let deletedCount = 0;

        const files = fs.readdirSync(this.snapshotDir);

        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const filePath = path.join(this.snapshotDir, file);
            const stats = fs.statSync(filePath);

            if (stats.mtime.getTime() < cutoffTime) {
                fs.unlinkSync(filePath);
                deletedCount++;
                console.log(`  Deleted old snapshot: ${file}`);
            }
        }

        console.log(`🧹 Cleaned ${deletedCount} old snapshots`);
        return deletedCount;
    }

    /**
     * Utility functions
     */
    generateSnapshotId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        return `snap_${timestamp}_${random}`;
    }

    generateChecksum(data) {
        return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
    }

    calculateChecksums(data) {
        return {
            salesforce: this.generateChecksum(data.salesforce),
            hubspot: this.generateChecksum(data.hubspot),
            combined: this.generateChecksum(data)
        };
    }

    loadSnapshot(snapshotId) {
        const snapshotPath = path.join(this.snapshotDir, `${snapshotId}.json`);

        if (!fs.existsSync(snapshotPath)) {
            return null;
        }

        return JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    }

    estimateRollbackTime(plan) {
        // Estimate based on record count and API limits
        const sfTime = (plan.recordsToRestore.salesforce.length / 200) * 5; // 5 seconds per batch
        const hsTime = (plan.recordsToRestore.hubspot.length / 100) * 3; // 3 seconds per batch

        return Math.ceil(sfTime + hsTime);
    }

    assessRollbackRisk(plan) {
        const totalRecords = plan.recordsToRestore.salesforce.length +
                           plan.recordsToRestore.hubspot.length;

        if (totalRecords > 10000) return 'high';
        if (totalRecords > 1000) return 'medium';
        return 'low';
    }

    logRollback(rollbackInfo) {
        this.rollbackLog.push(rollbackInfo);

        // Save to file
        const logPath = path.join(this.snapshotDir, 'rollback_log.json');
        fs.writeFileSync(logPath, JSON.stringify(this.rollbackLog, null, 2));
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const manager = new RollbackManager('../config/cross-platform-config.yaml');

    switch (command) {
        case 'snapshot':
            // Create a new snapshot
            manager.createSnapshot({
                type: 'sync',
                objectType: 'contacts',
                source: 'cli'
            }).then(snapshotId => {
                console.log(`\n✅ Snapshot created: ${snapshotId}`);
            }).catch(error => {
                console.error(`\n❌ Error: ${error.message}`);
                process.exit(1);
            });
            break;

        case 'rollback':
            // Execute rollback
            const snapshotId = args[1];
            if (!snapshotId) {
                console.error('Usage: rollback-manager.js rollback <snapshot-id>');
                process.exit(1);
            }

            manager.executeRollback(snapshotId, {
                dryRun: args.includes('--dry-run')
            }).then(results => {
                if (results.success) {
                    console.log('\n✅ Rollback completed successfully');
                } else {
                    console.log('\n⚠️ Rollback completed with errors');
                }
                console.log(JSON.stringify(results, null, 2));
            }).catch(error => {
                console.error(`\n❌ Rollback failed: ${error.message}`);
                process.exit(1);
            });
            break;

        case 'list':
            // List snapshots
            const snapshots = manager.listSnapshots(args[1] || 10);
            console.log('\n📦 Available Snapshots:\n');
            snapshots.forEach(snap => {
                console.log(`  ${snap.id}`);
                console.log(`    Created: ${snap.timestamp}`);
                console.log(`    Records: ${snap.recordCount}`);
                console.log(`    Size: ${(snap.size / 1024).toFixed(2)} KB\n`);
            });
            break;

        case 'clean':
            // Clean old snapshots
            const days = parseInt(args[1]) || 7;
            manager.cleanOldSnapshots(days);
            break;

        default:
            console.log(`
Rollback Manager for Cross-Platform Sync

Usage: rollback-manager.js <command> [options]

Commands:
    snapshot              Create a new snapshot
    rollback <id>         Rollback to a specific snapshot
    list [limit]          List available snapshots
    clean [days]          Remove snapshots older than N days

Options:
    --dry-run            Simulate rollback without making changes

Examples:
    rollback-manager.js snapshot
    rollback-manager.js rollback snap_123456_abc --dry-run
    rollback-manager.js list 20
    rollback-manager.js clean 30
            `);
    }
}

module.exports = RollbackManager;