#!/usr/bin/env node
/**
 * Live Wire Sync Test - HubSpot Operations
 *
 * Purpose: HubSpot-specific operations for wire test including record search,
 * update, polling, and probe execution.
 *
 * Features:
 * - Search records by sync_anchor
 * - Update records with batch support
 * - Poll for property changes with timeout
 * - Execute probes (HS→SF)
 * - Backfill sync_anchor for existing records
 * - Rate limiting (100 req/10s)
 *
 * Usage:
 *   const HSOperations = require('./wire-test-hubspot-operations');
 *   const hsOps = new HSOperations(config);
 *
 *   // Search by sync anchor
 *   const record = await hsOps.searchBySyncAnchor('company', syncAnchor);
 *
 *   // Execute probe
 *   const result = await hsOps.executeProbeHStoSF(syncAnchor, 'company', runId);
 */

const https = require('https');
const crypto = require('crypto');

class WireTestHubSpotOperations {
    constructor(config) {
        this.config = config;
        this.portalId = config.hubspot.portalId;
        this.accessToken = config.hubspot.accessToken;
        this.baseUrl = 'api.hubapi.com';
        this.requestCount = 0;
        this.requestWindow = [];
        this.maxRequestsPer10s = config.rate_limiting?.hubspot_max_requests_per_10s || 100;
    }

    /**
     * HTTP request wrapper with rate limiting
     * @private
     */
    async _makeRequest(method, path, data = null) {
        // Rate limiting check
        await this._checkRateLimit();

        return new Promise((resolve, reject) => {
            const postData = data ? JSON.stringify(data) : null;

            const options = {
                hostname: this.baseUrl,
                path: path,
                method: method,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            if (postData) {
                options.headers['Content-Length'] = Buffer.byteLength(postData);
            }

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    this._recordRequest();

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(responseData));
                        } catch (e) {
                            resolve(responseData);
                        }
                    } else if (res.statusCode === 429) {
                        // Rate limited - retry after delay
                        const retryAfter = parseInt(res.headers['retry-after'] || '10');
                        console.warn(`⚠️  Rate limited, retrying after ${retryAfter}s`);
                        setTimeout(() => {
                            this._makeRequest(method, path, data).then(resolve).catch(reject);
                        }, retryAfter * 1000);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (postData) {
                req.write(postData);
            }

            req.end();
        });
    }

    /**
     * Check rate limit before making request
     * @private
     */
    async _checkRateLimit() {
        const now = Date.now();
        const tenSecondsAgo = now - 10000;

        // Remove requests older than 10 seconds
        this.requestWindow = this.requestWindow.filter(timestamp => timestamp > tenSecondsAgo);

        // If we're at the limit, wait
        if (this.requestWindow.length >= this.maxRequestsPer10s) {
            const oldestRequest = this.requestWindow[0];
            const waitTime = 10000 - (now - oldestRequest) + 100; // Add 100ms buffer

            if (waitTime > 0) {
                console.log(`⏱️  Rate limit approached, waiting ${Math.round(waitTime / 1000)}s...`);
                await this._sleep(waitTime);
            }
        }
    }

    /**
     * Record a request for rate limiting
     * @private
     */
    _recordRequest() {
        this.requestWindow.push(Date.now());
        this.requestCount++;
    }

    /**
     * Search for record by sync_anchor
     * @param {string} objectType - 'company' or 'contact'
     * @param {string} syncAnchor - Sync Anchor UUID
     * @returns {Promise<object|null>}
     */
    async searchBySyncAnchor(objectType, syncAnchor) {
        const endpoint = objectType === 'company' ? 'companies' : 'contacts';
        const path = `/crm/v3/objects/${endpoint}/search`;

        const searchBody = {
            filterGroups: [
                {
                    filters: [
                        {
                            propertyName: 'sync_anchor',
                            operator: 'EQ',
                            value: syncAnchor
                        }
                    ]
                }
            ],
            properties: [
                'sync_anchor',
                'wire_test_1',
                'wire_test_2',
                'salesforce_id',
                'last_sync_time',
                'wire_test_run_id',
                'wire_test_timestamp',
                'last_sync_direction'
            ],
            limit: 1
        };

        try {
            const result = await this._makeRequest('POST', path, searchBody);
            return result.results && result.results.length > 0 ? result.results[0] : null;
        } catch (error) {
            console.error(`Search by sync_anchor failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Search multiple records by sync anchors
     * @param {string} objectType - 'company' or 'contact'
     * @param {Array<string>} syncAnchors - Array of Sync Anchor UUIDs
     * @returns {Promise<Array>}
     */
    async searchBySyncAnchors(objectType, syncAnchors) {
        if (syncAnchors.length === 0) return [];

        const endpoint = objectType === 'company' ? 'companies' : 'contacts';
        const path = `/crm/v3/objects/${endpoint}/search`;

        const searchBody = {
            filterGroups: [
                {
                    filters: syncAnchors.map(anchor => ({
                        propertyName: 'sync_anchor',
                        operator: 'EQ',
                        value: anchor
                    }))
                }
            ],
            properties: [
                'sync_anchor',
                'wire_test_1',
                'wire_test_2',
                'salesforce_id',
                'last_sync_time',
                'wire_test_run_id',
                'wire_test_timestamp',
                'last_sync_direction'
            ],
            limit: 100
        };

        try {
            const result = await this._makeRequest('POST', path, searchBody);
            return result.results || [];
        } catch (error) {
            console.error(`Bulk search by sync_anchors failed: ${error.message}`);
            return [];
        }
    }

    /**
     * Update record by ID
     * @param {string} objectType - 'company' or 'contact'
     * @param {string} recordId - HubSpot record ID
     * @param {object} properties - Properties to update
     * @returns {Promise<object>}
     */
    async updateRecord(objectType, recordId, properties) {
        const endpoint = objectType === 'company' ? 'companies' : 'contacts';
        const path = `/crm/v3/objects/${endpoint}/${recordId}`;

        const updateBody = { properties };

        try {
            return await this._makeRequest('PATCH', path, updateBody);
        } catch (error) {
            console.error(`Update record failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Poll for property change
     * @param {string} objectType - 'company' or 'contact'
     * @param {string} syncAnchor - Sync Anchor UUID
     * @param {string} propertyName - Property to poll (e.g., 'wire_test_1')
     * @param {*} expectedValue - Expected value
     * @param {string} runId - Wire test run ID (must match)
     * @param {number} slaSeconds - Max wait time
     * @param {number} pollIntervalSeconds - Time between polls
     * @returns {Promise<object>}
     */
    async pollForChange(objectType, syncAnchor, propertyName, expectedValue, runId, slaSeconds = 240, pollIntervalSeconds = 10) {
        const startTime = Date.now();
        const maxTime = slaSeconds * 1000;
        let attempts = 0;

        console.log(`\n⏱️  Polling HubSpot ${objectType} ${syncAnchor} for ${propertyName} = ${expectedValue} (SLA: ${slaSeconds}s)`);

        while (Date.now() - startTime < maxTime) {
            attempts++;

            try {
                const record = await this.searchBySyncAnchor(objectType, syncAnchor);

                if (!record) {
                    console.warn(`  ⚠️  Attempt ${attempts}: Record not found`);
                } else {
                    const actualValue = record.properties[propertyName];
                    const actualRunId = record.properties.wire_test_run_id;

                    // Convert boolean string to boolean for comparison
                    const actualBool = actualValue === 'true' || actualValue === true;
                    const expectedBool = expectedValue === 'true' || expectedValue === true;

                    // Check if value and run ID match
                    if (actualBool === expectedBool && actualRunId === runId) {
                        const lagSeconds = Math.round((Date.now() - startTime) / 1000);
                        console.log(`  ✅ Attempt ${attempts}: Match found! Lag: ${lagSeconds}s`);

                        return {
                            status: 'success',
                            attempts,
                            lag_seconds: lagSeconds,
                            record
                        };
                    } else {
                        console.log(`  ⏳ Attempt ${attempts}: ${propertyName}=${actualValue} (expected ${expectedValue}), runId=${actualRunId} (expected ${runId})`);
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
     * Execute HS→SF probe
     * @param {string} objectType - 'company' or 'contact'
     * @param {string} syncAnchor - Sync Anchor UUID
     * @param {string} runId - Wire test run ID
     * @returns {Promise<object>}
     */
    async executeProbeHStoSF(objectType, syncAnchor, runId) {
        console.log(`\n🔄 Executing HS→SF probe for ${objectType} ${syncAnchor}`);

        // Step 1: Find record
        const record = await this.searchBySyncAnchor(objectType, syncAnchor);
        if (!record) {
            throw new Error(`Record not found with sync_anchor: ${syncAnchor}`);
        }

        const recordId = record.id;
        const currentValue = record.properties.wire_test_2 === 'true' || record.properties.wire_test_2 === true;
        const newValue = !currentValue;

        console.log(`  Current wire_test_2: ${currentValue}`);
        console.log(`  Toggling to: ${newValue}`);

        // Step 2: Toggle wire_test_2 and set run metadata
        const updateProperties = {
            wire_test_2: newValue.toString(),
            wire_test_run_id: runId,
            wire_test_timestamp: new Date().toISOString(),
            last_sync_direction: 'HS→SF'
        };

        await this.updateRecord(objectType, recordId, updateProperties);
        console.log(`  ✅ Updated HubSpot`);

        return {
            syncAnchor,
            objectType,
            recordId,
            direction: 'HS→SF',
            originalValue: currentValue,
            toggledValue: newValue,
            runId,
            timestamp: updateProperties.wire_test_timestamp
        };
    }

    /**
     * Backfill sync_anchor for records without one
     * @param {string} objectType - 'company' or 'contact'
     * @param {number} batchSize - Number of records to process
     * @returns {Promise<object>}
     */
    async backfillSyncAnchors(objectType, batchSize = 100) {
        console.log(`\n🔧 Backfilling sync_anchor for HubSpot ${objectType}...`);

        const endpoint = objectType === 'company' ? 'companies' : 'contacts';
        const searchPath = `/crm/v3/objects/${endpoint}/search`;

        // Search for records without sync_anchor
        const searchBody = {
            filterGroups: [
                {
                    filters: [
                        {
                            propertyName: 'sync_anchor',
                            operator: 'NOT_HAS_PROPERTY'
                        }
                    ]
                }
            ],
            properties: ['sync_anchor', 'salesforce_id'],
            limit: batchSize
        };

        try {
            const searchResult = await this._makeRequest('POST', searchPath, searchBody);
            const records = searchResult.results || [];

            console.log(`  Found ${records.length} records without sync_anchor`);

            if (records.length === 0) {
                return { objectType, backfilled: 0, message: 'All records have sync_anchor' };
            }

            // Update records with new sync_anchor
            const results = {
                objectType,
                backfilled: 0,
                errors: 0,
                details: []
            };

            for (const record of records) {
                try {
                    const anchor = crypto.randomUUID();
                    await this.updateRecord(objectType, record.id, { sync_anchor: anchor });
                    results.backfilled++;
                    console.log(`  ✅ Backfilled ${record.id}: ${anchor}`);

                    results.details.push({
                        recordId: record.id,
                        syncAnchor: anchor,
                        status: 'success'
                    });

                } catch (error) {
                    results.errors++;
                    console.error(`  ❌ Failed to backfill ${record.id}: ${error.message}`);

                    results.details.push({
                        recordId: record.id,
                        status: 'error',
                        error: error.message
                    });
                }
            }

            console.log(`  ✅ Backfilled ${results.backfilled} records (${results.errors} errors)`);
            return results;

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

    /**
     * Get rate limit statistics
     * @returns {object}
     */
    getRateLimitStats() {
        const now = Date.now();
        const tenSecondsAgo = now - 10000;
        const recentRequests = this.requestWindow.filter(t => t > tenSecondsAgo);

        return {
            totalRequests: this.requestCount,
            requestsLast10s: recentRequests.length,
            limit: this.maxRequestsPer10s,
            remaining: Math.max(0, this.maxRequestsPer10s - recentRequests.length)
        };
    }
}

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help') {
        console.log(`
Live Wire Sync Test - HubSpot Operations

Usage:
  node wire-test-hubspot-operations.js search-anchor <object-type> <sync-anchor>
  node wire-test-hubspot-operations.js update <object-type> <record-id> <property> <value>
  node wire-test-hubspot-operations.js backfill <object-type> [batch-size]
  node wire-test-hubspot-operations.js probe <object-type> <sync-anchor>
  node wire-test-hubspot-operations.js rate-limit-stats

Commands:
  search-anchor - Search for record by sync_anchor
  update        - Update record properties
  backfill      - Backfill sync_anchor for records without one
  probe         - Execute HS→SF probe (test only)
  rate-limit-stats - Show rate limit statistics

Examples:
  node wire-test-hubspot-operations.js search-anchor company c7b2a1f0-3d0b-43d1-8a6d-4f9e8d21b6e2
  node wire-test-hubspot-operations.js update company 12345 wire_test_2 true
  node wire-test-hubspot-operations.js backfill company 100
  node wire-test-hubspot-operations.js probe company c7b2a1f0-3d0b-43d1-8a6d-4f9e8d21b6e2
        `);
        process.exit(0);
    }

    // Load configuration
    const ConfigLoader = require('./wire-test-config-loader');
    const config = ConfigLoader.loadOrDefault();

    if (!config.hubspot.portalId || !config.hubspot.accessToken) {
        console.error('❌ Error: HubSpot configuration missing');
        console.error('Set HUBSPOT_PORTAL_ID and HUBSPOT_PRIVATE_APP_TOKEN environment variables');
        process.exit(1);
    }

    const hsOps = new WireTestHubSpotOperations(config);

    (async () => {
        try {
            switch (command) {
                case 'search-anchor':
                    const objectType = args[1];
                    const syncAnchor = args[2];
                    if (!objectType || !syncAnchor) {
                        console.error('Error: Object type and sync anchor required');
                        process.exit(1);
                    }
                    const record = await hsOps.searchBySyncAnchor(objectType, syncAnchor);
                    console.log('\n📊 Search Result:');
                    console.log(JSON.stringify(record, null, 2));
                    break;

                case 'update':
                    const updateObjectType = args[1];
                    const recordId = args[2];
                    const property = args[3];
                    const value = args[4];
                    if (!updateObjectType || !recordId || !property || !value) {
                        console.error('Error: Object type, record ID, property, and value required');
                        process.exit(1);
                    }
                    const updateResult = await hsOps.updateRecord(updateObjectType, recordId, { [property]: value });
                    console.log('\n✅ Update complete');
                    console.log(JSON.stringify(updateResult, null, 2));
                    break;

                case 'backfill':
                    const backfillObjectType = args[1];
                    const batchSize = parseInt(args[2]) || 100;
                    if (!backfillObjectType) {
                        console.error('Error: Object type required');
                        process.exit(1);
                    }
                    const backfillResult = await hsOps.backfillSyncAnchors(backfillObjectType, batchSize);
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
                    const probeResult = await hsOps.executeProbeHStoSF(probeObjectType, probeSyncAnchor, runId);
                    console.log('\n✅ Probe executed');
                    console.log(JSON.stringify(probeResult, null, 2));
                    break;

                case 'rate-limit-stats':
                    const stats = hsOps.getRateLimitStats();
                    console.log('\n📊 Rate Limit Statistics');
                    console.log('═'.repeat(60));
                    console.log(`Total Requests: ${stats.totalRequests}`);
                    console.log(`Requests (last 10s): ${stats.requestsLast10s}/${stats.limit}`);
                    console.log(`Remaining: ${stats.remaining}`);
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

module.exports = WireTestHubSpotOperations;
