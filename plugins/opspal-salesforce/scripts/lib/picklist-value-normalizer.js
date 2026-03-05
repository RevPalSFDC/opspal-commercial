#!/usr/bin/env node

/**
 * Picklist Value Normalizer
 *
 * Generic solution for normalizing incoming values to match restricted picklist values.
 * Dynamically fetches valid values from org (no hardcoding) and uses fuzzy matching
 * to suggest corrections.
 *
 * Problem Solved:
 * - Restricted picklists reject values that don't exactly match
 * - Incoming data often has variations (suffixes, case, typos)
 * - Bulk data operations fail with "bad value for restricted picklist field"
 *
 * Solution:
 * - Fetch valid picklist values dynamically from org
 * - Apply configurable normalization rules (suffixes, abbreviations, corrections)
 * - Use fuzzy matching to find closest valid value
 * - Pre-validate before bulk operations to prevent failures
 *
 * Usage:
 *   const { PicklistValueNormalizer } = require('./picklist-value-normalizer');
 *   const normalizer = new PicklistValueNormalizer({ orgAlias: 'my-org' });
 *
 *   // Single value normalization
 *   const result = await normalizer.normalizeValue('Account', 'State', 'california');
 *   // { normalized: 'California', original: 'california', confidence: 100, ... }
 *
 *   // Batch CSV normalization
 *   await normalizer.normalizeCSV('./data.csv', 'Account', 'State', { preview: true });
 *
 * Configuration:
 *   All rules are loaded from config/picklist-normalization-rules.json
 *   No instance-specific values are hardcoded.
 *
 * @module picklist-value-normalizer
 * @version 2.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Load dependencies
const PicklistDescriber = require('./picklist-describer');
const { FuzzyMatcher } = require('./fuzzy-matcher');
const { RobustCSVParser } = require('./csv-schema-validator');

// Load field-specific rules from configuration ONLY
let fieldRulesConfig = { defaults: {}, fieldRules: {} };
try {
    const rulesPath = path.join(__dirname, '..', '..', 'config', 'picklist-normalization-rules.json');
    if (fs.existsSync(rulesPath)) {
        fieldRulesConfig = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    }
} catch (error) {
    // Config file not found - use empty defaults
    console.warn('[PicklistValueNormalizer] Config file not found, using empty defaults');
}

/**
 * Error class for normalization failures
 */
class NormalizationError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'NormalizationError';
        this.details = details;
    }
}

/**
 * Picklist Value Normalizer
 *
 * Normalizes incoming values to match valid restricted picklist values
 * by fetching allowed values from the org and using fuzzy matching.
 *
 * All normalization rules come from configuration - no hardcoded values.
 */
class PicklistValueNormalizer {
    /**
     * Create a new PicklistValueNormalizer
     *
     * @param {Object} options - Configuration options
     * @param {string} options.orgAlias - Salesforce org alias
     * @param {number} options.similarityThreshold - Minimum similarity for auto-match (0-100, default 80)
     * @param {boolean} options.autoFix - Auto-fix values that meet threshold (default false)
     * @param {string} options.cacheDir - Directory for caching picklist values
     * @param {number} options.cacheTimeout - Cache timeout in ms (default 1 hour)
     * @param {boolean} options.verbose - Enable verbose logging
     */
    constructor(options = {}) {
        this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG;
        this.similarityThreshold = options.similarityThreshold ||
            (fieldRulesConfig.defaults?.similarityThreshold || 80);
        this.autoFix = options.autoFix !== undefined ?
            options.autoFix : (fieldRulesConfig.defaults?.autoFix || false);
        this.cacheDir = options.cacheDir || path.join(process.cwd(), '.cache', 'picklist-normalizer');
        this.cacheTimeout = options.cacheTimeout || 3600000; // 1 hour
        this.verbose = options.verbose || false;

        // Initialize components
        this.picklistDescriber = new PicklistDescriber({
            orgAlias: this.orgAlias,
            cacheDir: this.cacheDir,
            cacheTimeout: this.cacheTimeout,
            verbose: this.verbose
        });

        this.fuzzyMatcher = new FuzzyMatcher();
        this.csvParser = new RobustCSVParser();

        // Cache for normalization maps
        this._normalizationMaps = new Map();
    }

    /**
     * Normalize a key for comparison
     * Strips suffixes, normalizes case, and removes extra whitespace
     *
     * @param {string} value - Value to normalize
     * @param {Object} rules - Field-specific rules from configuration
     * @returns {string} Normalized key
     */
    normalizeKey(value, rules = {}) {
        if (!value || typeof value !== 'string') {
            return '';
        }

        let normalized = value.trim();

        // Apply suffix patterns from configuration only
        const suffixPatterns = rules.suffixPatterns || [];

        for (const pattern of suffixPatterns) {
            const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
            normalized = normalized.replace(regex, '');
        }

        // Normalize whitespace
        normalized = normalized.replace(/\s+/g, ' ').trim();

        // Convert to lowercase for comparison
        return normalized.toLowerCase();
    }

    /**
     * Build a normalization map for a picklist field
     * Creates a bidirectional mapping with suffix variants
     *
     * @param {string} objectName - Salesforce object API name
     * @param {string} fieldName - Field API name
     * @param {string} orgAlias - Org alias (optional, uses instance default)
     * @returns {Promise<Object>} Normalization map
     */
    async buildNormalizationMap(objectName, fieldName, orgAlias = null) {
        const org = orgAlias || this.orgAlias;
        const cacheKey = `${org}:${objectName}.${fieldName}`;

        // Check in-memory cache
        if (this._normalizationMaps.has(cacheKey)) {
            const cached = this._normalizationMaps.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.map;
            }
        }

        if (this.verbose) {
            console.log(`Building normalization map for ${objectName}.${fieldName} in ${org}...`);
        }

        // Fetch picklist values from org
        const picklistData = await this.picklistDescriber.getPicklistValues(objectName, fieldName);

        if (!picklistData || !picklistData.values) {
            throw new NormalizationError(
                `Failed to get picklist values for ${objectName}.${fieldName}`,
                { object: objectName, field: fieldName, org }
            );
        }

        // Get field-specific rules from configuration
        const rules = this._getFieldRules(fieldName);

        // Build the normalization map
        const map = {
            exactValues: new Map(),       // value → canonical value
            normalizedKeys: new Map(),    // normalized key → canonical value
            suffixVariants: new Map(),    // with-suffix key → canonical value
            allValidValues: [],           // List of all valid values
            restricted: picklistData.restricted || false,
            rules
        };

        for (const item of picklistData.values) {
            if (!item.active) continue;

            const value = item.value;
            const normalizedKey = this.normalizeKey(value, rules);

            // Add exact match
            map.exactValues.set(value, value);
            map.exactValues.set(value.toLowerCase(), value);

            // Add normalized key match
            map.normalizedKeys.set(normalizedKey, value);

            // Add suffix variants from configuration
            const suffixes = rules.suffixesToAdd || [];

            for (const suffix of suffixes) {
                const withSuffix = this.normalizeKey(`${value}${suffix}`, {});
                map.suffixVariants.set(withSuffix, value);
            }

            // Add abbreviation expansions from configuration
            const abbreviations = rules.abbreviations || {};

            for (const [abbrev, expansion] of Object.entries(abbreviations)) {
                if (normalizedKey.includes(expansion.toLowerCase())) {
                    const withAbbrev = normalizedKey.replace(expansion.toLowerCase(), abbrev.toLowerCase());
                    map.normalizedKeys.set(withAbbrev, value);
                }
            }

            map.allValidValues.push(value);
        }

        // Cache the map
        this._normalizationMaps.set(cacheKey, {
            map,
            timestamp: Date.now()
        });

        if (this.verbose) {
            console.log(`  Built map with ${map.allValidValues.length} valid values`);
        }

        return map;
    }

    /**
     * Find the closest matching picklist value
     *
     * @param {string} inputValue - Value to match
     * @param {string[]} validValues - List of valid picklist values
     * @param {Object} rules - Field-specific rules from configuration
     * @returns {Object} Match result with value, similarity, and reason
     */
    findClosestMatch(inputValue, validValues, rules = {}) {
        if (!inputValue || validValues.length === 0) {
            return { match: null, similarity: 0, reason: 'No input or valid values' };
        }

        const inputNormalized = this.normalizeKey(inputValue, rules);
        let bestMatch = null;
        let bestSimilarity = 0;
        let matchReason = '';

        for (const validValue of validValues) {
            const validNormalized = this.normalizeKey(validValue, rules);

            // Exact normalized match
            if (inputNormalized === validNormalized) {
                return {
                    match: validValue,
                    similarity: 100,
                    reason: 'Exact normalized match'
                };
            }

            // Calculate similarity
            const similarity = this.fuzzyMatcher.calculateSimilarity(
                inputNormalized,
                validNormalized
            );

            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = validValue;
                matchReason = `Fuzzy match (${similarity.toFixed(1)}% similar)`;
            }
        }

        // Apply typo corrections from configuration
        const corrections = rules.corrections || {};

        for (const [typo, correct] of Object.entries(corrections)) {
            if (inputNormalized.includes(typo.toLowerCase())) {
                const corrected = inputNormalized.replace(typo.toLowerCase(), correct.toLowerCase());

                for (const validValue of validValues) {
                    const validNormalized = this.normalizeKey(validValue, rules);
                    if (corrected === validNormalized) {
                        return {
                            match: validValue,
                            similarity: 98,
                            reason: `Typo correction: "${typo}" → "${correct}"`
                        };
                    }
                }
            }
        }

        return {
            match: bestMatch,
            similarity: bestSimilarity,
            reason: matchReason
        };
    }

    /**
     * Normalize a single value against the picklist
     *
     * @param {string} objectName - Salesforce object API name
     * @param {string} fieldName - Field API name
     * @param {string} inputValue - Value to normalize
     * @param {string} orgAlias - Org alias (optional)
     * @returns {Promise<Object>} Normalization result
     */
    async normalizeValue(objectName, fieldName, inputValue, orgAlias = null) {
        if (!inputValue || typeof inputValue !== 'string') {
            return {
                original: inputValue,
                normalized: null,
                valid: false,
                reason: 'Empty or invalid input'
            };
        }

        const trimmed = inputValue.trim();
        if (!trimmed) {
            return {
                original: inputValue,
                normalized: null,
                valid: false,
                reason: 'Empty value after trimming'
            };
        }

        // Build normalization map
        const map = await this.buildNormalizationMap(objectName, fieldName, orgAlias);

        // Check exact match first
        if (map.exactValues.has(trimmed)) {
            return {
                original: inputValue,
                normalized: map.exactValues.get(trimmed),
                valid: true,
                confidence: 100,
                reason: 'Exact match'
            };
        }

        // Check normalized key match
        const normalizedKey = this.normalizeKey(trimmed, map.rules);
        if (map.normalizedKeys.has(normalizedKey)) {
            return {
                original: inputValue,
                normalized: map.normalizedKeys.get(normalizedKey),
                valid: true,
                confidence: 98,
                reason: 'Normalized match (case/whitespace)'
            };
        }

        // Check suffix variant match
        if (map.suffixVariants.has(normalizedKey)) {
            return {
                original: inputValue,
                normalized: map.suffixVariants.get(normalizedKey),
                valid: true,
                confidence: 95,
                reason: 'Suffix variant match'
            };
        }

        // Try fuzzy matching
        const fuzzyResult = this.findClosestMatch(trimmed, map.allValidValues, map.rules);

        if (fuzzyResult.similarity >= this.similarityThreshold) {
            return {
                original: inputValue,
                normalized: fuzzyResult.match,
                valid: true,
                confidence: Math.round(fuzzyResult.similarity),
                reason: fuzzyResult.reason,
                suggestion: this.autoFix ? null : `Consider normalizing to "${fuzzyResult.match}"`
            };
        }

        // No acceptable match found
        return {
            original: inputValue,
            normalized: null,
            valid: false,
            confidence: Math.round(fuzzyResult.similarity),
            reason: `No match found above ${this.similarityThreshold}% threshold`,
            suggestion: fuzzyResult.match ?
                `Closest match: "${fuzzyResult.match}" (${fuzzyResult.similarity.toFixed(1)}%)` :
                'No similar values found',
            validValues: map.allValidValues.slice(0, 10) // Show first 10 valid values
        };
    }

    /**
     * Validate a batch of records
     *
     * @param {Object[]} records - Array of records with the field to validate
     * @param {string} objectName - Salesforce object API name
     * @param {string} fieldName - Field API name
     * @param {string} orgAlias - Org alias (optional)
     * @returns {Promise<Object>} Batch validation result
     */
    async validateBatch(records, objectName, fieldName, orgAlias = null) {
        const results = {
            totalRecords: records.length,
            validCount: 0,
            normalizableCount: 0,
            invalidCount: 0,
            details: {
                valid: [],
                normalizable: [],
                invalid: []
            },
            summary: {}
        };

        // Build normalization map once
        const map = await this.buildNormalizationMap(objectName, fieldName, orgAlias);

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const value = record[fieldName];

            // Skip empty values
            if (!value || (typeof value === 'string' && !value.trim())) {
                results.validCount++;
                results.details.valid.push({
                    index: i,
                    value: value,
                    reason: 'Empty value (allowed)'
                });
                continue;
            }

            // Normalize the value
            const result = await this.normalizeValue(objectName, fieldName, value, orgAlias);

            if (result.valid && result.confidence === 100) {
                results.validCount++;
                results.details.valid.push({
                    index: i,
                    value: value,
                    reason: result.reason
                });
            } else if (result.valid && result.confidence >= this.similarityThreshold) {
                results.normalizableCount++;
                results.details.normalizable.push({
                    index: i,
                    original: value,
                    normalized: result.normalized,
                    confidence: result.confidence,
                    reason: result.reason
                });
            } else {
                results.invalidCount++;
                results.details.invalid.push({
                    index: i,
                    value: value,
                    confidence: result.confidence,
                    reason: result.reason,
                    suggestion: result.suggestion
                });
            }
        }

        // Generate summary
        results.summary = {
            passRate: ((results.validCount / results.totalRecords) * 100).toFixed(1) + '%',
            normalizableRate: ((results.normalizableCount / results.totalRecords) * 100).toFixed(1) + '%',
            failRate: ((results.invalidCount / results.totalRecords) * 100).toFixed(1) + '%',
            recommendation: results.invalidCount > 0 ?
                `${results.invalidCount} values need manual review` :
                results.normalizableCount > 0 ?
                    `${results.normalizableCount} values can be auto-normalized` :
                    'All values are valid'
        };

        return results;
    }

    /**
     * Normalize picklist values in a CSV file
     *
     * @param {string} csvPath - Path to CSV file
     * @param {string} objectName - Salesforce object API name
     * @param {string} fieldColumn - Column name containing the field values
     * @param {string} orgAlias - Org alias (optional)
     * @param {Object} options - Processing options
     * @param {boolean} options.preview - Only preview changes, don't write
     * @param {string} options.output - Output file path (default: overwrites input)
     * @param {number} options.previewRows - Number of rows to show in preview
     * @returns {Promise<Object>} Processing result
     */
    async normalizeCSV(csvPath, objectName, fieldColumn, orgAlias = null, options = {}) {
        const {
            preview = false,
            output = csvPath,
            previewRows = 10
        } = options;

        if (!fs.existsSync(csvPath)) {
            throw new NormalizationError(`CSV file not found: ${csvPath}`);
        }

        // Read and parse CSV
        const csvContent = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
        const rows = this.csvParser.parse(csvContent, [fieldColumn]);

        if (rows.length === 0) {
            return {
                success: false,
                error: 'No data rows found in CSV'
            };
        }

        console.log(`\nProcessing ${rows.length} rows from ${csvPath}...`);
        console.log(`Field column: ${fieldColumn}`);
        console.log(`Object: ${objectName}`);

        // Build normalization map
        const map = await this.buildNormalizationMap(objectName, fieldColumn, orgAlias);

        const results = {
            totalRows: rows.length,
            unchanged: 0,
            normalized: 0,
            failed: 0,
            changes: [],
            failures: []
        };

        // Process each row
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const originalValue = row[fieldColumn];

            if (!originalValue || !originalValue.trim()) {
                results.unchanged++;
                continue;
            }

            const result = await this.normalizeValue(objectName, fieldColumn, originalValue, orgAlias);

            if (result.valid && result.normalized !== originalValue) {
                results.normalized++;
                results.changes.push({
                    row: i + 2, // 1-indexed, plus header
                    original: originalValue,
                    normalized: result.normalized,
                    confidence: result.confidence,
                    reason: result.reason
                });

                // Update the row
                row[fieldColumn] = result.normalized;
            } else if (!result.valid) {
                results.failed++;
                results.failures.push({
                    row: i + 2,
                    value: originalValue,
                    reason: result.reason,
                    suggestion: result.suggestion
                });
            } else {
                results.unchanged++;
            }
        }

        // Generate output
        console.log('\n' + '═'.repeat(60));
        console.log('Normalization Results:');
        console.log('═'.repeat(60));
        console.log(`Total rows:     ${results.totalRows}`);
        console.log(`Unchanged:      ${results.unchanged}`);
        console.log(`Normalized:     ${results.normalized}`);
        console.log(`Failed:         ${results.failed}`);
        console.log('═'.repeat(60));

        if (results.changes.length > 0) {
            console.log('\nChanges preview:');
            const previewChanges = results.changes.slice(0, previewRows);
            for (const change of previewChanges) {
                console.log(`  Row ${change.row}: "${change.original}" → "${change.normalized}" (${change.confidence}%)`);
            }
            if (results.changes.length > previewRows) {
                console.log(`  ... and ${results.changes.length - previewRows} more changes`);
            }
        }

        if (results.failures.length > 0) {
            console.log('\nFailures requiring manual review:');
            const previewFailures = results.failures.slice(0, previewRows);
            for (const failure of previewFailures) {
                console.log(`  Row ${failure.row}: "${failure.value}"`);
                console.log(`    Reason: ${failure.reason}`);
                if (failure.suggestion) {
                    console.log(`    Suggestion: ${failure.suggestion}`);
                }
            }
            if (results.failures.length > previewRows) {
                console.log(`  ... and ${results.failures.length - previewRows} more failures`);
            }
        }

        // Write output if not preview mode
        if (!preview && results.changes.length > 0) {
            const headers = Object.keys(rows[0]).filter(k => !k.startsWith('_'));
            const outputContent = this.csvParser.generate(rows, headers);
            fs.writeFileSync(output, outputContent, 'utf8');
            console.log(`\nOutput written to: ${output}`);
        } else if (preview) {
            console.log('\n[PREVIEW MODE] No changes written to file.');
        }

        return results;
    }

    /**
     * Get field-specific rules from configuration
     * Supports inheritance via "inherits" key
     * @private
     */
    _getFieldRules(fieldName) {
        let rules = fieldRulesConfig.fieldRules?.[fieldName] || {};

        // Handle inheritance
        if (rules.inherits && fieldRulesConfig.fieldRules?.[rules.inherits]) {
            const parentRules = fieldRulesConfig.fieldRules[rules.inherits];
            rules = { ...parentRules, ...rules };
            delete rules.inherits;
        }

        // Convert string patterns to RegExp
        if (rules.suffixPatterns) {
            rules.suffixPatterns = rules.suffixPatterns.map(p =>
                typeof p === 'string' ? new RegExp(p, 'i') : p
            );
        }

        return rules;
    }

    /**
     * Clear the normalization map cache
     */
    clearCache() {
        this._normalizationMaps.clear();
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Picklist Value Normalizer

Normalizes incoming values to match valid restricted picklist values.
All rules are loaded from config/picklist-normalization-rules.json.

Usage:
  picklist-value-normalizer.js test --input <value> --object <name> --field <name> --org <alias>
  picklist-value-normalizer.js csv --input <file> --object <name> --field <name> --org <alias> [options]

Commands:
  test        Test normalization of a single value
  csv         Normalize values in a CSV file

Options:
  --input <value/file>   Input value (for test) or CSV file path (for csv)
  --object <name>        Salesforce object API name (e.g., Account)
  --field <name>         Field API name (e.g., State, Industry)
  --org <alias>          Salesforce org alias
  --preview              Preview changes without writing (csv mode)
  --output <file>        Output file path (default: overwrite input)
  --threshold <n>        Similarity threshold (default: 80)
  --verbose              Verbose output

Examples:
  # Test single value normalization
  node picklist-value-normalizer.js test --input "california" \\
    --object Account --field BillingState --org my-org

  # Preview CSV normalization
  node picklist-value-normalizer.js csv --input data.csv --object Account \\
    --field Industry --org my-org --preview

  # Normalize and save to new file
  node picklist-value-normalizer.js csv --input data.csv --object Account \\
    --field Type --org my-org --output normalized.csv

Configuration:
  Add field-specific rules to config/picklist-normalization-rules.json
        `);
        process.exit(0);
    }

    const command = args[0];

    // Parse arguments
    const getArg = (name) => {
        const index = args.indexOf(`--${name}`);
        return index !== -1 ? args[index + 1] : null;
    };

    const hasFlag = (name) => args.includes(`--${name}`);

    async function run() {
        try {
            const normalizer = new PicklistValueNormalizer({
                orgAlias: getArg('org'),
                similarityThreshold: getArg('threshold') ? parseInt(getArg('threshold'), 10) : undefined,
                verbose: hasFlag('verbose')
            });

            if (command === 'test') {
                const input = getArg('input');
                const object = getArg('object');
                const field = getArg('field');

                if (!input || !object || !field) {
                    console.error('Error: --input, --object, and --field are required');
                    process.exit(1);
                }

                console.log(`\nTesting normalization:`);
                console.log(`  Input: "${input}"`);
                console.log(`  Object: ${object}`);
                console.log(`  Field: ${field}`);
                console.log(`  Org: ${normalizer.orgAlias}`);

                const result = await normalizer.normalizeValue(object, field, input);

                console.log('\nResult:');
                console.log(JSON.stringify(result, null, 2));

                if (result.valid) {
                    console.log(`\n✅ Value can be normalized: "${result.original}" → "${result.normalized}"`);
                } else {
                    console.log(`\n❌ Value cannot be normalized`);
                    if (result.validValues) {
                        console.log(`\nValid values (first 10):`);
                        result.validValues.forEach(v => console.log(`  • ${v}`));
                    }
                }

            } else if (command === 'csv') {
                const input = getArg('input');
                const object = getArg('object');
                const field = getArg('field');
                const output = getArg('output');
                const preview = hasFlag('preview');

                if (!input || !object || !field) {
                    console.error('Error: --input, --object, and --field are required');
                    process.exit(1);
                }

                await normalizer.normalizeCSV(input, object, field, null, {
                    preview,
                    output: output || input
                });

            } else {
                console.error(`Unknown command: ${command}`);
                console.error('Use --help to see available commands');
                process.exit(1);
            }

        } catch (error) {
            console.error(`\nError: ${error.message}`);
            if (error.details) {
                console.error('Details:', JSON.stringify(error.details, null, 2));
            }
            process.exit(1);
        }
    }

    run();
}

module.exports = {
    PicklistValueNormalizer,
    NormalizationError
};
