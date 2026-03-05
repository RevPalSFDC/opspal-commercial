#!/usr/bin/env node

/**
 * Apex Body Retriever
 *
 * Retrieves Apex source code (Body field) from Salesforce Tooling API in batches.
 * Used for JavaDoc extraction and entry condition parsing.
 *
 * Features:
 * - Batch queries to minimize API calls (max 200 records per query)
 * - Automatic retry with exponential backoff
 * - Progress tracking and error handling
 * - Returns Map<Id, Body> for efficient lookup
 *
 * @version 1.0.0
 * @date 2025-10-21
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ApexBodyRetriever {
    constructor(options = {}) {
        this.orgAlias = options.orgAlias || process.env.ORG;
        this.verbose = options.verbose || false;
        this.batchSize = options.batchSize || 200; // Tooling API max
        this.maxRetries = options.maxRetries || 3;
        this.retryDelayMs = options.retryDelayMs || 1000;

        if (!this.orgAlias) {
            throw new Error('Org alias required. Set ORG environment variable or pass orgAlias option.');
        }
    }

    /**
     * Retrieve Apex Body fields for triggers
     * @param {Array<string>} triggerIds - Array of ApexTrigger IDs
     * @returns {Map<string, string>} Map of trigger ID → Body source code
     */
    async retrieveTriggerBodies(triggerIds) {
        if (!triggerIds || triggerIds.length === 0) {
            return new Map();
        }

        console.log(`\n📥 Retrieving Apex trigger bodies for ${triggerIds.length} triggers...`);

        const bodies = new Map();
        const batches = this.createBatches(triggerIds);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`  Batch ${i + 1}/${batches.length}: ${batch.length} triggers`);

            const batchBodies = await this.queryApexBodies('ApexTrigger', batch);
            batchBodies.forEach((body, id) => bodies.set(id, body));

            // Rate limiting pause between batches
            if (i < batches.length - 1) {
                await this.sleep(200);
            }
        }

        console.log(`✅ Retrieved ${bodies.size} trigger bodies\n`);
        return bodies;
    }

    /**
     * Retrieve Apex Body fields for classes
     * @param {Array<string>} classIds - Array of ApexClass IDs
     * @returns {Map<string, string>} Map of class ID → Body source code
     */
    async retrieveClassBodies(classIds) {
        if (!classIds || classIds.length === 0) {
            return new Map();
        }

        console.log(`\n📥 Retrieving Apex class bodies for ${classIds.length} classes...`);

        const bodies = new Map();
        const batches = this.createBatches(classIds);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`  Batch ${i + 1}/${batches.length}: ${batch.length} classes`);

            const batchBodies = await this.queryApexBodies('ApexClass', batch);
            batchBodies.forEach((body, id) => bodies.set(id, body));

            // Rate limiting pause between batches
            if (i < batches.length - 1) {
                await this.sleep(200);
            }
        }

        console.log(`✅ Retrieved ${bodies.size} class bodies\n`);
        return bodies;
    }

    /**
     * Query Apex Body fields via Tooling API
     * @param {string} objectType - 'ApexTrigger' or 'ApexClass'
     * @param {Array<string>} ids - Array of record IDs
     * @returns {Map<string, string>} Map of ID → Body
     */
    async queryApexBodies(objectType, ids) {
        if (!ids || ids.length === 0) {
            return new Map();
        }

        // Build WHERE clause with ID list
        const idList = ids.map(id => `'${id}'`).join(',');
        const query = `SELECT Id, Body FROM ${objectType} WHERE Id IN (${idList})`;

        let attempt = 0;
        let lastError = null;

        while (attempt < this.maxRetries) {
            try {
                const result = this.executeToolingQuery(query);

                if (!result || !result.records) {
                    throw new Error('Invalid query result');
                }

                // Convert records array to Map
                const bodies = new Map();
                result.records.forEach(record => {
                    if (record.Id && record.Body) {
                        bodies.set(record.Id, record.Body);
                    }
                });

                return bodies;

            } catch (error) {
                lastError = error;
                attempt++;

                if (attempt < this.maxRetries) {
                    const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
                    console.warn(`  ⚠️  Query failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms...`);
                    await this.sleep(delay);
                }
            }
        }

        console.error(`  ❌ Failed to retrieve ${objectType} bodies after ${this.maxRetries} attempts:`, lastError.message);
        return new Map(); // Return empty map on failure
    }

    /**
     * Execute Tooling API query
     * @param {string} query - SOQL query
     * @returns {Object} Query result
     */
    executeToolingQuery(query) {
        try {
            const cmd = `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`;

            if (this.verbose) {
                console.log(`  🔍 Query: ${query}`);
            }

            const output = execSync(cmd, {
                encoding: 'utf8',
                maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large Apex bodies
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const result = JSON.parse(output);

            if (result.status !== 0) {
                throw new Error(result.message || 'Query failed');
            }

            return result.result;

        } catch (error) {
            if (error.stdout) {
                try {
                    const result = JSON.parse(error.stdout);
                    if (result.message) {
                        throw new Error(result.message);
                    }
                } catch (parseError) {
                    // Fall through to generic error
                }
            }
            throw new Error(`Tooling API query failed: ${error.message}`);
        }
    }

    /**
     * Create batches from array of IDs
     * @param {Array<string>} ids - Array of IDs
     * @returns {Array<Array<string>>} Array of batches
     */
    createBatches(ids) {
        const batches = [];
        for (let i = 0; i < ids.length; i += this.batchSize) {
            batches.push(ids.slice(i, i + this.batchSize));
        }
        return batches;
    }

    /**
     * Sleep utility
     * @param {number} ms - Milliseconds to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ApexBodyRetriever;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node apex-body-retriever.js <type> <id1> [id2] [id3] ... [--verbose]');
        console.log('');
        console.log('Retrieves Apex source code (Body field) from Salesforce Tooling API.');
        console.log('');
        console.log('Arguments:');
        console.log('  type      - "trigger" or "class"');
        console.log('  id1, id2  - Apex record IDs (18-character)');
        console.log('');
        console.log('Options:');
        console.log('  --verbose - Show detailed query information');
        console.log('');
        console.log('Environment:');
        console.log('  ORG - Salesforce org alias (required)');
        console.log('');
        console.log('Example:');
        console.log('  ORG=gamma-corp node apex-body-retriever.js trigger 01q3p000000fyb4AAA 01q3p000000fywMAAQ --verbose');
        process.exit(1);
    }

    const type = args[0].toLowerCase();
    const verbose = args.includes('--verbose');
    const ids = args.slice(1).filter(arg => !arg.startsWith('--') && arg.length === 18);

    if (type !== 'trigger' && type !== 'class') {
        console.error('Error: Type must be "trigger" or "class"');
        process.exit(1);
    }

    if (ids.length === 0) {
        console.error('Error: At least one ID required');
        process.exit(1);
    }

    (async () => {
        try {
            const retriever = new ApexBodyRetriever({ verbose });

            const bodies = type === 'trigger'
                ? await retriever.retrieveTriggerBodies(ids)
                : await retriever.retrieveClassBodies(ids);

            console.log('\n=== Retrieved Bodies ===\n');
            bodies.forEach((body, id) => {
                console.log(`ID: ${id}`);
                console.log(`Length: ${body.length} characters`);
                console.log(`Preview: ${body.substring(0, 200)}...`);
                console.log('');
            });

            console.log(`Total: ${bodies.size} bodies retrieved`);

        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}
