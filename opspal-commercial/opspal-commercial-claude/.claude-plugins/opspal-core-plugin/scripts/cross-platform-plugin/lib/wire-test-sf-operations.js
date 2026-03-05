#!/usr/bin/env node
/**
 * Live Wire Sync Test - Salesforce Operations
 *
 * Purpose: Salesforce-specific operations for wire test including field deployment,
 * record queries, upsert, polling, and probe execution.
 *
 * Features:
 * - Deploy custom fields via SF CLI
 * - Query records by Sync Anchor (external ID)
 * - Upsert operations with external ID
 * - Poll for field changes with timeout
 * - Bulk operations support
 * - Probe toggle execution (SF→HS)
 *
 * Usage:
 *   const SFOperations = require('./wire-test-sf-operations');
 *   const sfOps = new SFOperations(config);
 *
 *   // Deploy fields
 *   await sfOps.deployFields(['Account', 'Contact']);
 *
 *   // Query by sync anchor
 *   const record = await sfOps.queryBySyncAnchor('Account', syncAnchor);
 *
 *   // Execute probe
 *   const result = await sfOps.executeProbe(syncAnchor, 'Account', runId);
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class WireTestSFOperations {
    constructor(config) {
        this.config = config;
        this.orgAlias = config.salesforce.orgAlias;
        this.templatePath = path.join(__dirname, '../../templates/wire-test/force-app/main/default');
        this.fields = config.fields || {};
    }

    /**
     * Deploy wire test fields to Salesforce
     * @param {Array<string>} objects - Object API names (e.g., ['Account', 'Contact'])
     * @param {boolean} dryRun - If true, only validate
     * @returns {Promise<object>}
     */
    async deployFields(objects = ['Account', 'Contact'], dryRun = false) {
        console.log('\n🚀 Deploying Wire Test Fields to Salesforce');
        console.log('═'.repeat(60));

        if (!fs.existsSync(this.templatePath)) {
            throw new Error(`Template path not found: ${this.templatePath}`);
        }

        const results = {
            dryRun,
            objects,
            deployed: [],
            errors: []
        };

        try {
            // Build command
            const cmd = [
                'sf', 'project', 'deploy', 'start',
                '--source-dir', this.templatePath,
                '--target-org', this.orgAlias
            ];

            if (dryRun) {
                cmd.push('--dry-run');
            }

            console.log(`\n📦 Command: ${cmd.join(' ')}\n`);

            // Execute deployment
            const output = execSync(cmd.join(' '), {
                encoding: 'utf8',
                stdio: 'pipe'
            });

            console.log(output);

            // Parse deployment result
            if (output.includes('Deployed Source')) {
                results.deployed = objects;
                console.log(`\n✅ Successfully deployed fields for: ${objects.join(', ')}`);
            } else if (output.includes('Deploy Succeeded')) {
                results.deployed = objects;
                console.log(`\n✅ Deployment succeeded`);
            }

        } catch (error) {
            results.errors.push({
                message: error.message,
                stderr: error.stderr ? error.stderr.toString() : null
            });
            console.error(`\n❌ Deployment failed: ${error.message}`);
            throw error;
        }

        return results;
    }

    /**
     * Verify fields exist on object
     * @param {string} objectType - Object API name (e.g., 'Account')
     * @returns {Promise<object>}
     */
    async verifyFields(objectType) {
        console.log(`\n🔍 Verifying Wire Test fields on ${objectType}...`);

        const requiredFields = [
            'Sync_Anchor__c',
            'Wire_Test_1__c',
            'Wire_Test_2__c',
            'Hubspot_ID__c',
            'Last_Sync_Time__c',
            'Manual_Sync__c',
            'Former_SFDC_IDs__c',
            'Former_Hubspot_IDs__c',
            'Wire_Test_Run_ID__c',
            'Wire_Test_Timestamp__c',
            'Last_Sync_Direction__c',
            'Last_Sync_Error__c'
        ];

        try {
            // Describe object to get all fields
            const cmd = `sf sobject describe ${objectType} --target-org ${this.orgAlias} --json`;
            const output = execSync(cmd, { encoding: 'utf8' });
            const result = JSON.parse(output);

            if (result.status !== 0) {
                throw new Error(`Failed to describe ${objectType}: ${result.message}`);
            }

            const existingFields = result.result.fields.map(f => f.name);
            const missing = requiredFields.filter(f => !existingFields.includes(f));
            const existing = requiredFields.filter(f => existingFields.includes(f));

            console.log(`  ✅ Found: ${existing.length}/${requiredFields.length} fields`);

            if (missing.length > 0) {
                console.warn(`  ⚠️  Missing: ${missing.join(', ')}`);
            }

            return {
                objectType,
                total: requiredFields.length,
                existing: existing.length,
                missing,
                allExist: missing.length === 0
            };

        } catch (error) {
            console.error(`  ❌ Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Query record by Sync Anchor
     * @param {string} objectType - Object API name
     * @param {string} syncAnchor - Sync Anchor UUID
     * @returns {Promise<object|null>}
     */
    async queryBySyncAnchor(objectType, syncAnchor) {
        const query = `SELECT Id, Sync_Anchor__c, Wire_Test_1__c, Wire_Test_2__c,
                       Hubspot_ID__c, Last_Sync_Time__c, Wire_Test_Run_ID__c,
                       Wire_Test_Timestamp__c, Last_Sync_Direction__c
                       FROM ${objectType}
                       WHERE Sync_Anchor__c = '${syncAnchor}'`;

        try {
            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
            const output = execSync(cmd, { encoding: 'utf8' });
            const result = JSON.parse(output);

            if (result.status !== 0) {
                throw new Error(`Query failed: ${result.message}`);
            }

            return result.result.records.length > 0 ? result.result.records[0] : null;

        } catch (error) {
            console.error(`Query by Sync Anchor failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Query multiple records by Sync Anchors
     * @param {string} objectType - Object API name
     * @param {Array<string>} syncAnchors - Array of Sync Anchor UUIDs
     * @returns {Promise<Array>}
     */
    async queryBySyncAnchors(objectType, syncAnchors) {
        if (syncAnchors.length === 0) return [];

        const anchorList = syncAnchors.map(a => `'${a}'`).join(',');
        const query = `SELECT Id, Sync_Anchor__c, Wire_Test_1__c, Wire_Test_2__c,
                       Hubspot_ID__c, Last_Sync_Time__c, Wire_Test_Run_ID__c,
                       Wire_Test_Timestamp__c, Last_Sync_Direction__c
                       FROM ${objectType}
                       WHERE Sync_Anchor__c IN (${anchorList})`;

        try {
            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
            const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            const result = JSON.parse(output);

            if (result.status !== 0) {
                throw new Error(`Query failed: ${result.message}`);
            }

            return result.result.records;

        } catch (error) {
            console.error(`Bulk query by Sync Anchors failed: ${error.message}`);
            return [];
        }
    }

    /**
     * Upsert record by Sync Anchor
     * @param {string} objectType - Object API name
     * @param {string} syncAnchor - Sync Anchor UUID
     * @param {object} fields - Fields to update
     * @returns {Promise<object>}
     */
    async upsertBySyncAnchor(objectType, syncAnchor, fields) {
        // Create CSV for upsert
        const tempDir = path.join(__dirname, '../../.temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const csvPath = path.join(tempDir, `upsert-${Date.now()}.csv`);

        // Build CSV header and row
        const allFields = { Sync_Anchor__c: syncAnchor, ...fields };
        const headers = Object.keys(allFields).join(',');
        const values = Object.values(allFields).map(v => {
            if (v === null || v === undefined) return '';
            if (typeof v === 'boolean') return v.toString();
            if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
            return v;
        }).join(',');

        const csv = `${headers}\n${values}`;
        fs.writeFileSync(csvPath, csv);

        try {
            const cmd = `sf data upsert bulk --sobject ${objectType} --file ${csvPath} --external-id Sync_Anchor__c --target-org ${this.orgAlias} --wait 10 --json`;
            const output = execSync(cmd, { encoding: 'utf8' });
            const result = JSON.parse(output);

            // Clean up temp file
            fs.unlinkSync(csvPath);

            if (result.status !== 0) {
                throw new Error(`Upsert failed: ${result.message}`);
            }

            return result.result;

        } catch (error) {
            // Clean up temp file on error
            if (fs.existsSync(csvPath)) {
                fs.unlinkSync(csvPath);
            }
            throw error;
        }
    }

    /**
     * Poll for field change
     * @param {string} objectType - Object API name
     * @param {string} syncAnchor - Sync Anchor UUID
     * @param {string} fieldName - Field to poll (e.g., 'Wire_Test_2__c')
     * @param {*} expectedValue - Expected value
     * @param {string} runId - Wire test run ID (must match)
     * @param {number} slaSeconds - Max wait time
     * @param {number} pollIntervalSeconds - Time between polls
     * @returns {Promise<object>}
     */
    async pollForChange(objectType, syncAnchor, fieldName, expectedValue, runId, slaSeconds = 240, pollIntervalSeconds = 10) {
        const startTime = Date.now();
        const maxTime = slaSeconds * 1000;
        let attempts = 0;

        console.log(`\n⏱️  Polling ${objectType} ${syncAnchor} for ${fieldName} = ${expectedValue} (SLA: ${slaSeconds}s)`);

        while (Date.now() - startTime < maxTime) {
            attempts++;

            try {
                const record = await this.queryBySyncAnchor(objectType, syncAnchor);

                if (!record) {
                    console.warn(`  ⚠️  Attempt ${attempts}: Record not found`);
                } else {
                    const actualValue = record[fieldName];
                    const actualRunId = record.Wire_Test_Run_ID__c;

                    // Check if value and run ID match
                    if (actualValue === expectedValue && actualRunId === runId) {
                        const lagSeconds = Math.round((Date.now() - startTime) / 1000);
                        console.log(`  ✅ Attempt ${attempts}: Match found! Lag: ${lagSeconds}s`);

                        return {
                            status: 'success',
                            attempts,
                            lag_seconds: lagSeconds,
                            record
                        };
                    } else {
                        console.log(`  ⏳ Attempt ${attempts}: ${fieldName}=${actualValue} (expected ${expectedValue}), runId=${actualRunId} (expected ${runId})`);
                    }
                }

                // Wait before next poll
                await this._sleep(pollIntervalSeconds * 1000);

            } catch (error) {
                console.error(`  ❌ Attempt ${attempts}: Error - ${error.message}`);
            }
        }

        // Timeout
        const timeoutSeconds = Math.round((Date.now() - startTime) / 1000);
        console.log(`  ⏱️  Timeout after ${attempts} attempts (${timeoutSeconds}s)`);

        return {
            status: 'timeout',
            attempts,
            lag_seconds: null,
            timeout_seconds: timeoutSeconds
        };
    }

    /**
     * Execute SF→HS probe
     * @param {string} objectType - Object API name
     * @param {string} syncAnchor - Sync Anchor UUID
     * @param {string} runId - Wire test run ID
     * @returns {Promise<object>}
     */
    async executeProbeSFtoHS(objectType, syncAnchor, runId) {
        console.log(`\n🔄 Executing SF→HS probe for ${objectType} ${syncAnchor}`);

        // Step 1: Read current value
        const record = await this.queryBySyncAnchor(objectType, syncAnchor);
        if (!record) {
            throw new Error(`Record not found with Sync Anchor: ${syncAnchor}`);
        }

        const currentValue = record.Wire_Test_1__c || false;
        const newValue = !currentValue;

        console.log(`  Current Wire_Test_1__c: ${currentValue}`);
        console.log(`  Toggling to: ${newValue}`);

        // Step 2: Toggle Wire_Test_1__c and set run metadata
        const updateFields = {
            Wire_Test_1__c: newValue,
            Wire_Test_Run_ID__c: runId,
            Wire_Test_Timestamp__c: new Date().toISOString(),
            Last_Sync_Direction__c: 'SF→HS'
        };

        await this.upsertBySyncAnchor(objectType, syncAnchor, updateFields);
        console.log(`  ✅ Updated Salesforce`);

        return {
            syncAnchor,
            objectType,
            direction: 'SF→HS',
            originalValue: currentValue,
            toggledValue: newValue,
            runId,
            timestamp: updateFields.Wire_Test_Timestamp__c
        };
    }

    /**
     * Backfill Sync Anchor for records without one
     * @param {string} objectType - Object API name
     * @param {number} batchSize - Number of records to process per batch
     * @returns {Promise<object>}
     */
    async backfillSyncAnchors(objectType, batchSize = 200) {
        console.log(`\n🔧 Backfilling Sync Anchors for ${objectType}...`);

        // Query records without Sync Anchor
        const query = `SELECT Id FROM ${objectType} WHERE Sync_Anchor__c = null LIMIT ${batchSize}`;

        try {
            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
            const output = execSync(cmd, { encoding: 'utf8' });
            const result = JSON.parse(output);

            if (result.status !== 0) {
                throw new Error(`Query failed: ${result.message}`);
            }

            const records = result.result.records;
            console.log(`  Found ${records.length} records without Sync Anchor`);

            if (records.length === 0) {
                return { objectType, backfilled: 0, message: 'All records have Sync Anchor' };
            }

            // Generate anchors and create CSV
            const tempDir = path.join(__dirname, '../../.temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const csvPath = path.join(tempDir, `backfill-${Date.now()}.csv`);
            const csvRows = ['Id,Sync_Anchor__c'];

            records.forEach(record => {
                const anchor = crypto.randomUUID();
                csvRows.push(`${record.Id},${anchor}`);
            });

            fs.writeFileSync(csvPath, csvRows.join('\n'));

            // Upsert
            const upsertCmd = `sf data upsert bulk --sobject ${objectType} --file ${csvPath} --external-id Id --target-org ${this.orgAlias} --wait 10 --json`;
            const upsertOutput = execSync(upsertCmd, { encoding: 'utf8' });
            const upsertResult = JSON.parse(upsertOutput);

            // Clean up
            fs.unlinkSync(csvPath);

            if (upsertResult.status !== 0) {
                throw new Error(`Backfill upsert failed: ${upsertResult.message}`);
            }

            console.log(`  ✅ Backfilled ${records.length} records`);

            return {
                objectType,
                backfilled: records.length,
                jobInfo: upsertResult.result
            };

        } catch (error) {
            console.error(`  ❌ Backfill failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Sleep utility
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help') {
        console.log(`
Live Wire Sync Test - Salesforce Operations

Usage:
  node wire-test-sf-operations.js deploy [--dry-run]
  node wire-test-sf-operations.js verify <object-type>
  node wire-test-sf-operations.js query-anchor <object-type> <sync-anchor>
  node wire-test-sf-operations.js backfill <object-type> [batch-size]
  node wire-test-sf-operations.js probe <object-type> <sync-anchor>

Commands:
  deploy        - Deploy wire test fields to Salesforce
  verify        - Verify fields exist on object
  query-anchor  - Query record by Sync Anchor
  backfill      - Backfill Sync Anchors for records without one
  probe         - Execute SF→HS probe (test only)

Examples:
  node wire-test-sf-operations.js deploy --dry-run
  node wire-test-sf-operations.js verify Account
  node wire-test-sf-operations.js query-anchor Account c7b2a1f0-3d0b-43d1-8a6d-4f9e8d21b6e2
  node wire-test-sf-operations.js backfill Account 200
        `);
        process.exit(0);
    }

    // Load configuration
    const ConfigLoader = require('./wire-test-config-loader');
    const config = ConfigLoader.loadOrDefault();

    const sfOps = new WireTestSFOperations(config);

    (async () => {
        try {
            switch (command) {
                case 'deploy':
                    const dryRun = args.includes('--dry-run');
                    const deployResult = await sfOps.deployFields(['Account', 'Contact'], dryRun);
                    console.log('\n✅ Deploy complete');
                    break;

                case 'verify':
                    const objectType = args[1];
                    if (!objectType) {
                        console.error('Error: Object type required');
                        process.exit(1);
                    }
                    await sfOps.verifyFields(objectType);
                    break;

                case 'query-anchor':
                    const queryObjectType = args[1];
                    const syncAnchor = args[2];
                    if (!queryObjectType || !syncAnchor) {
                        console.error('Error: Object type and sync anchor required');
                        process.exit(1);
                    }
                    const record = await sfOps.queryBySyncAnchor(queryObjectType, syncAnchor);
                    console.log('\n📊 Query Result:');
                    console.log(JSON.stringify(record, null, 2));
                    break;

                case 'backfill':
                    const backfillObjectType = args[1];
                    const batchSize = parseInt(args[2]) || 200;
                    if (!backfillObjectType) {
                        console.error('Error: Object type required');
                        process.exit(1);
                    }
                    const backfillResult = await sfOps.backfillSyncAnchors(backfillObjectType, batchSize);
                    console.log('\n✅ Backfill complete');
                    console.log(JSON.stringify(backfillResult, null, 2));
                    break;

                case 'probe':
                    const probeObjectType = args[1];
                    const probeSyncAnchor = args[2];
                    if (!probeObjectType || !probeSyncAnchor) {
                        console.error('Error: Object type and sync anchor required');
                        process.exit(1);
                    }
                    const runId = crypto.randomUUID();
                    const probeResult = await sfOps.executeProbeSFtoHS(probeObjectType, probeSyncAnchor, runId);
                    console.log('\n✅ Probe executed');
                    console.log(JSON.stringify(probeResult, null, 2));
                    break;

                default:
                    console.error(`Unknown command: ${command}`);
                    process.exit(1);
            }
        } catch (error) {
            console.error('\n❌ Error:', error.message);
            if (error.stack) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    })();
}

module.exports = WireTestSFOperations;
