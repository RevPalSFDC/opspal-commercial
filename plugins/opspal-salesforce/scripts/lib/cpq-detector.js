/**
 * CPQ Detector
 *
 * Detects Salesforce CPQ (SBQQ namespace) and other quoting system installations
 * to enable intelligent field mapping and template variation selection.
 *
 * Usage:
 *   const CPQDetector = require('./cpq-detector');
 *   const detector = new CPQDetector('my-org-alias');
 *   const result = await detector.detect();
 *   // result: { hasCpq: true, quotingSystem: 'cpq', hasData: true, version: '70.0' }
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Live-first mode - query live org first, use cache only as fallback on API failure
// Set CPQ_LIVE_FIRST=false to use cache-first behavior (not recommended)
const LIVE_FIRST = process.env.GLOBAL_LIVE_FIRST !== 'false' &&
                   process.env.CPQ_LIVE_FIRST !== 'false';

class CPQDetector {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.options = options;
        this.cache = null;
        this.cacheTimestamp = null;
        this.cacheDuration = options.cacheDuration || 3600000; // 1 hour default
        this.liveFirst = options.liveFirst !== undefined ? options.liveFirst : LIVE_FIRST;

        // Load CPQ field mappings for reference
        this.fieldMappingsPath = options.fieldMappingsPath ||
            path.resolve(__dirname, '../../config/cpq-field-mappings.json');

        this.fieldMappings = null;
    }

    /**
     * Load CPQ field mappings from config
     */
    loadFieldMappings() {
        if (this.fieldMappings) return this.fieldMappings;

        try {
            const content = fs.readFileSync(this.fieldMappingsPath, 'utf8');
            this.fieldMappings = JSON.parse(content);
            return this.fieldMappings;
        } catch (error) {
            console.warn(`[CPQDetector] Could not load field mappings: ${error.message}`);
            return null;
        }
    }

    /**
     * Get cached result, respecting live-first mode
     * @param {Object} options - Options
     * @param {boolean} options.useCacheFirst - Force cache-first for this call (for fallback)
     * @returns {Object|null} Cached result or null
     */
    getCached(options = {}) {
        // In live-first mode, skip cache unless explicitly requested (for fallback)
        if (this.liveFirst && !options.useCacheFirst) {
            return null;
        }

        if (this.cache && this.cacheTimestamp &&
            (Date.now() - this.cacheTimestamp) < this.cacheDuration) {
            return this.cache;
        }
        return null;
    }

    /**
     * Get cached fallback (bypasses live-first check)
     * Use this when API fails and you need cached data
     * @returns {Object|null} Cached result or null
     */
    getCachedFallback() {
        return this.getCached({ useCacheFirst: true });
    }

    /**
     * Main detection method - determines quoting system configuration
     *
     * @returns {Object} Detection result with quotingSystem, hasCpq, hasData, version
     */
    async detect() {
        // Check cache (respects live-first mode)
        const cached = this.getCached();
        if (cached) {
            return cached;
        }

        const result = {
            quotingSystem: 'native', // default
            hasCpq: false,
            hasNativeQuote: false,
            hasData: {
                cpq: false,
                native: false
            },
            version: null,
            namespaces: [],
            detectionMethod: 'query',
            timestamp: new Date().toISOString()
        };

        try {
            // Step 1: Check for CPQ namespace objects
            const cpqExists = await this.checkObjectExists('SBQQ__Quote__c');
            result.hasCpq = cpqExists;

            if (cpqExists) {
                result.namespaces.push('SBQQ');

                // Step 2: Check if CPQ has data
                result.hasData.cpq = await this.checkHasData('SBQQ__Quote__c');

                // Step 3: Try to get CPQ version
                result.version = await this.getCpqVersion();
            }

            // Step 4: Check for native Quote object
            const nativeExists = await this.checkObjectExists('Quote');
            result.hasNativeQuote = nativeExists;

            if (nativeExists) {
                result.hasData.native = await this.checkHasData('Quote');
            }

            // Step 5: Check for other CPQ namespaces (Conga, DealHub)
            const congaExists = await this.checkObjectExists('APXT__Proposal__c');
            if (congaExists) {
                result.namespaces.push('APXT');
            }

            const dealHubExists = await this.checkObjectExists('DH__Quote__c');
            if (dealHubExists) {
                result.namespaces.push('DH');
            }

            // Step 6: Determine quoting system type
            result.quotingSystem = this.determineQuotingSystem(result);

            // Cache the result
            this.cache = result;
            this.cacheTimestamp = Date.now();

            return result;

        } catch (error) {
            console.error(`[CPQDetector] Detection failed: ${error.message}`);

            // In live-first mode, try to use cached data as fallback
            if (this.liveFirst) {
                const fallback = this.getCachedFallback();
                if (fallback) {
                    console.warn(`[CPQDetector] API failed, using cached data from ${new Date(this.cacheTimestamp).toISOString()}`);
                    return { ...fallback, _fromCache: true, _cacheWarning: `Live query failed: ${error.message}` };
                }
            }

            result.error = error.message;
            result.detectionMethod = 'fallback';
            return result;
        }
    }

    /**
     * Check if an object exists in the org
     */
    async checkObjectExists(objectApiName) {
        try {
            const query = `SELECT COUNT() FROM EntityDefinition WHERE QualifiedApiName = '${objectApiName}'`;
            const result = this.executeQuery(query, true);
            return result && result.totalSize > 0;
        } catch (error) {
            // Object doesn't exist or not accessible
            return false;
        }
    }

    /**
     * Check if an object has any data
     */
    async checkHasData(objectApiName) {
        try {
            const query = `SELECT COUNT() FROM ${objectApiName}`;
            const result = this.executeQuery(query, objectApiName.includes('__'));
            return result && result.totalSize > 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get CPQ package version
     */
    async getCpqVersion() {
        try {
            const query = `SELECT SBQQ__Version__c FROM SBQQ__Setting__c LIMIT 1`;
            const result = this.executeQuery(query, false);
            if (result && result.records && result.records.length > 0) {
                return result.records[0].SBQQ__Version__c;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Determine quoting system type based on detection results
     */
    determineQuotingSystem(result) {
        // Hybrid: both CPQ and native with data
        if (result.hasCpq && result.hasNativeQuote &&
            result.hasData.cpq && result.hasData.native) {
            return 'hybrid';
        }

        // CPQ: has CPQ with data
        if (result.hasCpq && result.hasData.cpq) {
            return 'cpq';
        }

        // CPQ installed but no data: check if native has data
        if (result.hasCpq && !result.hasData.cpq && result.hasData.native) {
            return 'native';
        }

        // Only native
        if (result.hasNativeQuote && result.hasData.native) {
            return 'native';
        }

        // CPQ installed, preparing for use
        if (result.hasCpq) {
            return 'cpq'; // Assume CPQ will be primary
        }

        // Default
        return 'native';
    }

    /**
     * Execute SOQL query using sf CLI
     */
    executeQuery(query, useToolingApi = false) {
        const toolingFlag = useToolingApi ? ' --use-tooling-api' : '';
        const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias}${toolingFlag} --json`;

        try {
            const output = execSync(cmd, {
                encoding: 'utf8',
                timeout: 30000,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const result = JSON.parse(output);
            if (result.status === 0) {
                return result.result;
            }
            return null;
        } catch (error) {
            if (this.options.verbose) {
                console.warn(`[CPQDetector] Query failed: ${error.message}`);
            }
            return null;
        }
    }

    /**
     * Get field mapping for a specific field role
     *
     * @param {string} fieldRole - Logical field role (e.g., 'amount', 'discount')
     * @param {string} objectType - Object type (e.g., 'Quote', 'Opportunity')
     * @returns {string[]} Array of field API names to try, in priority order
     */
    getFieldCandidates(fieldRole, objectType) {
        const mappings = this.loadFieldMappings();
        if (!mappings) return [];

        const result = this.cache || { quotingSystem: 'native' };
        const objectMapping = mappings.objectMappings[objectType];

        if (!objectMapping) return [];

        // Get the field mapping based on detected quoting system
        if (result.quotingSystem === 'cpq' || result.quotingSystem === 'hybrid') {
            // Prioritize CPQ fields
            const cpqMapping = objectMapping.cpqFieldMappings?.[fieldRole] ||
                              objectMapping.fieldMappings?.[fieldRole];
            if (cpqMapping) {
                return Array.isArray(cpqMapping) ? cpqMapping : [cpqMapping];
            }
        }

        // Native fields
        const nativeField = Object.entries(objectMapping.fieldMappings || {})
            .find(([native]) => native.toLowerCase() === fieldRole.toLowerCase());

        if (nativeField) {
            return [nativeField[0], nativeField[1]]; // Return both native and CPQ equivalent
        }

        return [];
    }

    /**
     * Get CPQ-specific patterns for a metric field role
     *
     * @param {string} metricCategory - Category like 'revenue_metrics', 'discount_metrics'
     * @param {string} fieldRole - Field role like 'amount', 'arr', 'discount'
     * @returns {string[]} Array of CPQ field patterns
     */
    getCpqPatterns(metricCategory, fieldRole) {
        const mappings = this.loadFieldMappings();
        if (!mappings) return [];

        const patterns = mappings.metricCpqPatterns?.[metricCategory]?.[fieldRole];
        return patterns || [];
    }

    /**
     * Translate a native field to its CPQ equivalent
     *
     * @param {string} nativeField - Native field API name
     * @param {string} objectType - Object type
     * @returns {string|null} CPQ field API name or null
     */
    translateToCpq(nativeField, objectType) {
        const mappings = this.loadFieldMappings();
        if (!mappings) return null;

        const objectMapping = mappings.objectMappings[objectType];
        if (!objectMapping) return null;

        return objectMapping.fieldMappings?.[nativeField] || null;
    }

    /**
     * Translate a CPQ field to its native equivalent
     *
     * @param {string} cpqField - CPQ field API name
     * @param {string} objectType - Object type
     * @returns {string|null} Native field API name or null
     */
    translateToNative(cpqField, objectType) {
        const mappings = this.loadFieldMappings();
        if (!mappings) return null;

        const objectMapping = mappings.objectMappings[objectType];
        if (!objectMapping) return null;

        // Reverse lookup in fieldMappings
        const entry = Object.entries(objectMapping.fieldMappings || {})
            .find(([, cpq]) => cpq === cpqField);

        return entry ? entry[0] : null;
    }

    /**
     * Get object API name based on quoting system
     *
     * @param {string} objectType - Logical object type (e.g., 'Quote', 'QuoteLineItem')
     * @returns {string} Actual API name to use
     */
    getObjectApiName(objectType) {
        const result = this.cache || { quotingSystem: 'native' };
        const mappings = this.loadFieldMappings();

        if (!mappings) return objectType;

        const objectMapping = mappings.objectMappings[objectType];
        if (!objectMapping) return objectType;

        if (result.quotingSystem === 'cpq' || result.quotingSystem === 'hybrid') {
            return objectMapping.cpq || objectType;
        }

        return objectMapping.native || objectType;
    }

    /**
     * Clear the detection cache
     */
    clearCache() {
        this.cache = null;
        this.cacheTimestamp = null;
    }

    /**
     * Test helper: Classify quoting system without org connection
     * Used for unit testing the classification logic
     *
     * @param {boolean} hasCpq - Whether CPQ objects exist
     * @param {boolean} hasData - Whether CPQ has data
     * @param {string[]} namespaces - Detected namespaces
     * @returns {string} 'cpq' | 'native' | 'hybrid'
     */
    _classifyQuotingSystem(hasCpq, hasData, namespaces = []) {
        // Simulate the detection result structure
        const mockResult = {
            hasCpq,
            hasNativeQuote: true,
            hasData: {
                cpq: hasData,
                native: !hasCpq || !hasData  // Assume native has data if CPQ doesn't
            },
            namespaces
        };

        return this.determineQuotingSystem(mockResult);
    }

    /**
     * Get a summary for logging/debugging
     */
    getSummary() {
        if (!this.cache) {
            return 'Detection not yet run';
        }

        const c = this.cache;
        return `Quoting System: ${c.quotingSystem.toUpperCase()} | ` +
               `CPQ: ${c.hasCpq ? '✓' : '✗'} (data: ${c.hasData.cpq ? '✓' : '✗'}) | ` +
               `Native: ${c.hasNativeQuote ? '✓' : '✗'} (data: ${c.hasData.native ? '✓' : '✗'}) | ` +
               `Namespaces: ${c.namespaces.length > 0 ? c.namespaces.join(', ') : 'none'} | ` +
               `Version: ${c.version || 'N/A'}`;
    }
}

module.exports = CPQDetector;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help') {
        console.log(`
CPQ Detector - Detect Salesforce CPQ installation and configuration

Usage:
  node cpq-detector.js <org-alias> [options]

Options:
  --test <org-alias>    Run detection and show results
  --json               Output as JSON
  --verbose            Show detailed output

Examples:
  node cpq-detector.js my-org --test
  node cpq-detector.js production --json

Output:
  Quoting System: cpq | native | hybrid
  CPQ Installed: yes/no
  CPQ Has Data: yes/no
  Native Quote Has Data: yes/no
  Namespaces: SBQQ, APXT, DH, etc.
        `);
        process.exit(0);
    }

    const orgAlias = args[0];
    const isJson = args.includes('--json');
    const isVerbose = args.includes('--verbose');

    (async () => {
        console.log(`\n🔍 Detecting CPQ configuration for org: ${orgAlias}\n`);

        const detector = new CPQDetector(orgAlias, { verbose: isVerbose });
        const result = await detector.detect();

        if (isJson) {
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log('Detection Results:');
            console.log('─'.repeat(50));
            console.log(`  Quoting System:    ${result.quotingSystem.toUpperCase()}`);
            console.log(`  CPQ Installed:     ${result.hasCpq ? '✅ Yes' : '❌ No'}`);
            console.log(`  CPQ Has Data:      ${result.hasData.cpq ? '✅ Yes' : '❌ No'}`);
            console.log(`  Native Quote:      ${result.hasNativeQuote ? '✅ Yes' : '❌ No'}`);
            console.log(`  Native Has Data:   ${result.hasData.native ? '✅ Yes' : '❌ No'}`);
            console.log(`  CPQ Version:       ${result.version || 'N/A'}`);
            console.log(`  Namespaces:        ${result.namespaces.length > 0 ? result.namespaces.join(', ') : 'None'}`);
            console.log(`  Detection Method:  ${result.detectionMethod}`);
            console.log('─'.repeat(50));

            // Recommendation
            console.log('\n📋 Recommendation:');
            switch (result.quotingSystem) {
                case 'cpq':
                    console.log('   Use CPQ-specific templates and field mappings');
                    console.log('   Fields: SBQQ__Quote__c, SBQQ__QuoteLine__c, etc.');
                    break;
                case 'hybrid':
                    console.log('   Org uses both CPQ and native quoting');
                    console.log('   Use hybrid templates with fallback field resolution');
                    break;
                case 'native':
                    console.log('   Use standard Salesforce Quote templates');
                    console.log('   Fields: Quote, QuoteLineItem, etc.');
                    break;
            }

            if (result.error) {
                console.log(`\n⚠️  Warning: ${result.error}`);
            }
        }

        console.log('\n');
    })();
}
