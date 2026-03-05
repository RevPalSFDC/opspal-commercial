#!/usr/bin/env node

/**
 * Field Conflict Analyzer
 *
 * Analyzes field conflicts in duplicate company/account records and generates
 * merge recommendations based on configurable strategies.
 *
 * Conflict Resolution Strategies:
 *   - highest-value: For currency/numeric fields, prefer higher value
 *   - most-recent: Prefer most recently modified value
 *   - from-decision: Flag for manual review (decision required)
 *   - favor-master: Always use canonical/master value
 *   - favor-duplicate: Always use duplicate value
 *   - longest-string: For text fields, prefer more complete value
 *   - non-null: Prefer any non-null value
 *
 * Usage:
 *   const FieldConflictAnalyzer = require('./field-conflict-analyzer');
 *   const analyzer = new FieldConflictAnalyzer(config);
 *
 *   // Analyze conflicts in a bundle
 *   const analysis = analyzer.analyzeBundle(bundle);
 *
 *   // Generate merge recommendations
 *   const recommendations = analyzer.generateMergeRecommendations(canonical, duplicates);
 *
 * @version 1.0.0
 */

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_FIELD_STRATEGIES = {
    // Currency fields - prefer higher value (business decision)
    'AnnualRevenue': 'highest-value',
    'NumberOfEmployees': 'highest-value',
    'FY26_SGA__c': 'highest-value',
    'ACV__c': 'highest-value',
    'ARR__c': 'highest-value',
    'TCV__c': 'highest-value',

    // Date fields - prefer most recent
    'LastActivityDate': 'most-recent',
    'LastModifiedDate': 'most-recent',
    'CloseDate': 'most-recent',
    'Contract_End_Date__c': 'most-recent',
    'Renewal_Date__c': 'most-recent',

    // Owner fields - require manual decision
    'OwnerId': 'from-decision',
    'Owner_Id__c': 'from-decision',

    // Segment/classification fields - prefer most recent or manual
    'Segment__c': 'most-recent',
    'Industry': 'most-recent',
    'Type': 'favor-master',
    'Rating': 'favor-master',

    // Text fields - prefer longer/more complete
    'Description': 'longest-string',
    'Notes__c': 'longest-string',

    // Integration IDs - prefer master
    'salesforceaccountid': 'favor-master',
    'External_Id__c': 'favor-master'
};

// Field type to strategy mapping (fallback)
const TYPE_STRATEGY_MAP = {
    'currency': 'highest-value',
    'double': 'highest-value',
    'percent': 'highest-value',
    'date': 'most-recent',
    'datetime': 'most-recent',
    'string': 'longest-string',
    'textarea': 'longest-string',
    'picklist': 'favor-master',
    'reference': 'favor-master',
    'boolean': 'favor-master'
};

// =============================================================================
// Field Conflict Analyzer Class
// =============================================================================

class FieldConflictAnalyzer {
    constructor(config = {}) {
        this.fieldStrategies = {
            ...DEFAULT_FIELD_STRATEGIES,
            ...(config.fieldStrategies || {})
        };

        // Custom fields from criticalCustomFields config
        this.criticalCustomFields = config.criticalCustomFields || {};

        // Merge criticalCustomFields into fieldStrategies
        for (const [fieldName, fieldConfig] of Object.entries(this.criticalCustomFields)) {
            if (fieldConfig.conflictStrategy) {
                this.fieldStrategies[fieldName] = fieldConfig.conflictStrategy;
            }
        }

        this.verbose = config.verbose || false;
    }

    /**
     * Analyze conflicts in a bundle of duplicate records
     *
     * @param {Object} bundle - Bundle containing canonical and duplicates
     * @returns {Object} Conflict analysis results
     */
    analyzeBundle(bundle) {
        const { canonical, duplicates } = bundle;

        if (!canonical || !duplicates || duplicates.length === 0) {
            return {
                hasConflicts: false,
                conflicts: [],
                recommendations: [],
                requiresManualReview: false
            };
        }

        const conflicts = [];
        const recommendations = [];
        let requiresManualReview = false;

        // Get all field names from all records
        const allFields = new Set();
        this._extractFields(canonical, allFields);
        duplicates.forEach(dup => this._extractFields(dup, allFields));

        // Analyze each field
        for (const fieldName of allFields) {
            const canonicalValue = this._getFieldValue(canonical, fieldName);
            const duplicateValues = duplicates.map(dup => ({
                companyId: dup.id || dup.companyId,
                value: this._getFieldValue(dup, fieldName),
                lastModified: dup.lastModifiedDate || dup.LastModifiedDate || dup.hs_lastmodifieddate
            }));

            // Check for conflicts
            const conflict = this._analyzeFieldConflict(fieldName, canonicalValue, duplicateValues);

            if (conflict.hasConflict) {
                conflicts.push(conflict);

                // Generate recommendation
                const recommendation = this._generateRecommendation(fieldName, canonicalValue, duplicateValues, canonical);
                recommendations.push(recommendation);

                if (recommendation.strategy === 'from-decision') {
                    requiresManualReview = true;
                }
            }
        }

        return {
            bundleId: bundle.bundleId || bundle.clusterKey,
            canonicalId: canonical.id || canonical.companyId,
            hasConflicts: conflicts.length > 0,
            conflictCount: conflicts.length,
            conflicts,
            recommendations,
            requiresManualReview,
            manualReviewFields: recommendations
                .filter(r => r.strategy === 'from-decision')
                .map(r => r.fieldName)
        };
    }

    /**
     * Generate merge recommendations for a canonical record and its duplicates
     *
     * @param {Object} canonical - Canonical/master record
     * @param {Object[]} duplicates - Array of duplicate records
     * @returns {Object[]} Array of field recommendations
     */
    generateMergeRecommendations(canonical, duplicates) {
        const analysis = this.analyzeBundle({ canonical, duplicates });
        return analysis.recommendations;
    }

    /**
     * Get field merge recommendations as a map for the merger
     *
     * @param {Object} canonical - Canonical record
     * @param {Object[]} duplicates - Duplicate records
     * @returns {Object} Map of fieldName → { value, reason }
     */
    getFieldRecommendationsMap(canonical, duplicates) {
        const recommendations = this.generateMergeRecommendations(canonical, duplicates);
        const map = {};

        for (const rec of recommendations) {
            if (rec.recommendedValue !== undefined && rec.strategy !== 'from-decision') {
                map[rec.fieldName] = {
                    value: rec.recommendedValue,
                    reason: rec.reason,
                    strategy: rec.strategy,
                    confidence: rec.confidence
                };
            }
        }

        return map;
    }

    /**
     * Analyze a single field for conflicts
     */
    _analyzeFieldConflict(fieldName, canonicalValue, duplicateValues) {
        const nonNullDuplicates = duplicateValues.filter(dv => dv.value !== null && dv.value !== undefined && dv.value !== '');

        // No conflict if canonical has value and no duplicates have different values
        const hasConflict = nonNullDuplicates.some(dv => !this._valuesEqual(canonicalValue, dv.value));

        return {
            fieldName,
            hasConflict,
            canonicalValue,
            duplicateValues: nonNullDuplicates,
            valueCount: nonNullDuplicates.length + (canonicalValue !== null && canonicalValue !== undefined && canonicalValue !== '' ? 1 : 0)
        };
    }

    /**
     * Generate a recommendation for a field conflict
     */
    _generateRecommendation(fieldName, canonicalValue, duplicateValues, canonical) {
        const strategy = this._getStrategy(fieldName);
        let recommendedValue = canonicalValue;
        let reason = '';
        let confidence = 1.0;
        let sourceRecord = 'canonical';

        const nonNullDuplicates = duplicateValues.filter(dv => dv.value !== null && dv.value !== undefined && dv.value !== '');

        switch (strategy) {
            case 'highest-value': {
                const allValues = [
                    { value: canonicalValue, source: 'canonical', id: canonical.id || canonical.companyId },
                    ...nonNullDuplicates.map(dv => ({ value: dv.value, source: 'duplicate', id: dv.companyId }))
                ].filter(v => v.value !== null && v.value !== undefined);

                const highest = allValues.reduce((max, curr) => {
                    const currNum = parseFloat(curr.value) || 0;
                    const maxNum = parseFloat(max.value) || 0;
                    return currNum > maxNum ? curr : max;
                }, allValues[0] || { value: canonicalValue, source: 'canonical' });

                recommendedValue = highest.value;
                sourceRecord = highest.source;
                reason = `Highest value selected: ${recommendedValue} (${sourceRecord === 'canonical' ? 'canonical' : 'from duplicate'})`;
                confidence = 0.9;
                break;
            }

            case 'most-recent': {
                const allValues = [
                    { value: canonicalValue, lastModified: canonical.lastModifiedDate || canonical.LastModifiedDate, source: 'canonical' },
                    ...nonNullDuplicates.map(dv => ({ value: dv.value, lastModified: dv.lastModified, source: 'duplicate', id: dv.companyId }))
                ].filter(v => v.value !== null && v.value !== undefined && v.lastModified);

                if (allValues.length > 0) {
                    const mostRecent = allValues.reduce((latest, curr) => {
                        const currDate = new Date(curr.lastModified);
                        const latestDate = new Date(latest.lastModified);
                        return currDate > latestDate ? curr : latest;
                    }, allValues[0]);

                    recommendedValue = mostRecent.value;
                    sourceRecord = mostRecent.source;
                    reason = `Most recently modified value selected (${new Date(mostRecent.lastModified).toISOString().split('T')[0]})`;
                    confidence = 0.85;
                }
                break;
            }

            case 'longest-string': {
                const allValues = [
                    { value: canonicalValue, source: 'canonical' },
                    ...nonNullDuplicates.map(dv => ({ value: dv.value, source: 'duplicate', id: dv.companyId }))
                ].filter(v => v.value !== null && v.value !== undefined);

                if (allValues.length > 0) {
                    const longest = allValues.reduce((max, curr) => {
                        const currLen = String(curr.value || '').length;
                        const maxLen = String(max.value || '').length;
                        return currLen > maxLen ? curr : max;
                    }, allValues[0]);

                    recommendedValue = longest.value;
                    sourceRecord = longest.source;
                    reason = `Longest/most complete value selected (${String(recommendedValue).length} chars)`;
                    confidence = 0.8;
                }
                break;
            }

            case 'non-null': {
                if (canonicalValue !== null && canonicalValue !== undefined && canonicalValue !== '') {
                    recommendedValue = canonicalValue;
                    reason = 'Canonical value preserved (non-null)';
                } else if (nonNullDuplicates.length > 0) {
                    recommendedValue = nonNullDuplicates[0].value;
                    sourceRecord = 'duplicate';
                    reason = 'Non-null value from duplicate selected';
                }
                confidence = 0.95;
                break;
            }

            case 'favor-master':
            case 'favor-canonical': {
                recommendedValue = canonicalValue;
                reason = 'Canonical value favored by strategy';
                confidence = 1.0;
                break;
            }

            case 'favor-duplicate': {
                if (nonNullDuplicates.length > 0) {
                    recommendedValue = nonNullDuplicates[0].value;
                    sourceRecord = 'duplicate';
                    reason = 'Duplicate value favored by strategy';
                    confidence = 0.9;
                }
                break;
            }

            case 'from-decision':
            default: {
                recommendedValue = null;
                reason = 'MANUAL REVIEW REQUIRED - Multiple conflicting values';
                confidence = 0;

                // Include all options for manual review
                const options = [
                    { value: canonicalValue, source: 'canonical', label: 'Keep canonical' },
                    ...nonNullDuplicates.map(dv => ({
                        value: dv.value,
                        source: 'duplicate',
                        id: dv.companyId,
                        label: `Use duplicate ${dv.companyId}`
                    }))
                ];

                return {
                    fieldName,
                    strategy,
                    requiresDecision: true,
                    canonicalValue,
                    options,
                    recommendedValue: null,
                    reason,
                    confidence
                };
            }
        }

        return {
            fieldName,
            strategy,
            requiresDecision: false,
            canonicalValue,
            recommendedValue,
            sourceRecord,
            reason,
            confidence
        };
    }

    /**
     * Get strategy for a field
     */
    _getStrategy(fieldName) {
        // Check explicit field strategy
        if (this.fieldStrategies[fieldName]) {
            return this.fieldStrategies[fieldName];
        }

        // Check critical custom fields
        if (this.criticalCustomFields[fieldName]?.conflictStrategy) {
            return this.criticalCustomFields[fieldName].conflictStrategy;
        }

        // Infer from field name patterns
        const lowerName = fieldName.toLowerCase();

        if (lowerName.includes('revenue') || lowerName.includes('amount') ||
            lowerName.includes('arr') || lowerName.includes('mrr') ||
            lowerName.includes('acv') || lowerName.includes('tcv') ||
            lowerName.includes('sga') || lowerName.includes('price')) {
            return 'highest-value';
        }

        if (lowerName.includes('date') || lowerName.includes('_at') ||
            lowerName.includes('modified') || lowerName.includes('created')) {
            return 'most-recent';
        }

        if (lowerName.includes('owner') || lowerName === 'ownerid') {
            return 'from-decision';
        }

        if (lowerName.includes('description') || lowerName.includes('notes') ||
            lowerName.includes('comment')) {
            return 'longest-string';
        }

        // Default strategy
        return 'favor-master';
    }

    /**
     * Extract field names from a record
     */
    _extractFields(record, fieldSet) {
        if (!record) return;

        for (const key of Object.keys(record)) {
            // Skip metadata fields
            if (key.startsWith('_') || key === 'attributes') continue;
            fieldSet.add(key);
        }
    }

    /**
     * Get field value from record (handles nested properties)
     */
    _getFieldValue(record, fieldName) {
        if (!record) return null;

        // Direct access
        if (record[fieldName] !== undefined) {
            return record[fieldName];
        }

        // Try lowercase
        const lowerKey = fieldName.toLowerCase();
        for (const key of Object.keys(record)) {
            if (key.toLowerCase() === lowerKey) {
                return record[key];
            }
        }

        return null;
    }

    /**
     * Compare two values for equality
     */
    _valuesEqual(a, b) {
        if (a === b) return true;
        if (a === null || a === undefined || a === '') {
            return b === null || b === undefined || b === '';
        }
        return String(a) === String(b);
    }

    /**
     * Generate summary report of all conflicts in multiple bundles
     */
    generateConflictSummary(bundles) {
        const summary = {
            totalBundles: bundles.length,
            bundlesWithConflicts: 0,
            bundlesRequiringManualReview: 0,
            totalConflicts: 0,
            conflictsByField: {},
            manualReviewFields: new Set()
        };

        for (const bundle of bundles) {
            const analysis = this.analyzeBundle(bundle);

            if (analysis.hasConflicts) {
                summary.bundlesWithConflicts++;
                summary.totalConflicts += analysis.conflictCount;

                for (const conflict of analysis.conflicts) {
                    if (!summary.conflictsByField[conflict.fieldName]) {
                        summary.conflictsByField[conflict.fieldName] = 0;
                    }
                    summary.conflictsByField[conflict.fieldName]++;
                }
            }

            if (analysis.requiresManualReview) {
                summary.bundlesRequiringManualReview++;
                analysis.manualReviewFields.forEach(f => summary.manualReviewFields.add(f));
            }
        }

        summary.manualReviewFields = Array.from(summary.manualReviewFields);

        return summary;
    }
}

// =============================================================================
// CLI
// =============================================================================

function printUsage() {
    console.log(`
Field Conflict Analyzer

Usage:
  node field-conflict-analyzer.js analyze <bundles.json>
  node field-conflict-analyzer.js summarize <bundles.json>
  node field-conflict-analyzer.js list-strategies

Commands:
  analyze <file>       Analyze conflicts in bundles JSON file
  summarize <file>     Generate summary report
  list-strategies      List available conflict strategies

Options:
  --output <file>      Write output to file
  --verbose            Show detailed output

Examples:
  node field-conflict-analyzer.js analyze ./bundles.json --output conflicts.json
  node field-conflict-analyzer.js summarize ./bundles.json
  node field-conflict-analyzer.js list-strategies
`);
}

if (require.main === module) {
    const fs = require('fs');
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }

    const verbose = args.includes('--verbose');
    const outputIndex = args.indexOf('--output');
    const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : null;

    const command = args[0];

    switch (command) {
        case 'analyze': {
            const bundlesFile = args[1];
            if (!bundlesFile) {
                console.error('Error: Bundles file required');
                process.exit(1);
            }

            if (!fs.existsSync(bundlesFile)) {
                console.error(`Error: File not found: ${bundlesFile}`);
                process.exit(1);
            }

            const bundlesData = JSON.parse(fs.readFileSync(bundlesFile, 'utf8'));
            const bundles = bundlesData.bundles || bundlesData.canonicalMap || [bundlesData];

            const analyzer = new FieldConflictAnalyzer({ verbose });
            const results = bundles.map(b => analyzer.analyzeBundle(b));

            const output = JSON.stringify(results, null, 2);

            if (outputFile) {
                fs.writeFileSync(outputFile, output);
                console.log(`Analysis written to: ${outputFile}`);
            } else {
                console.log(output);
            }
            break;
        }

        case 'summarize': {
            const bundlesFile = args[1];
            if (!bundlesFile) {
                console.error('Error: Bundles file required');
                process.exit(1);
            }

            if (!fs.existsSync(bundlesFile)) {
                console.error(`Error: File not found: ${bundlesFile}`);
                process.exit(1);
            }

            const bundlesData = JSON.parse(fs.readFileSync(bundlesFile, 'utf8'));
            const bundles = bundlesData.bundles || bundlesData.canonicalMap || [bundlesData];

            const analyzer = new FieldConflictAnalyzer({ verbose });
            const summary = analyzer.generateConflictSummary(bundles);

            console.log('\n📊 Conflict Summary Report');
            console.log('═'.repeat(60));
            console.log(`Total bundles analyzed: ${summary.totalBundles}`);
            console.log(`Bundles with conflicts: ${summary.bundlesWithConflicts} (${((summary.bundlesWithConflicts / summary.totalBundles) * 100).toFixed(1)}%)`);
            console.log(`Total conflicts found: ${summary.totalConflicts}`);
            console.log(`Bundles requiring manual review: ${summary.bundlesRequiringManualReview}`);
            console.log('');
            console.log('Conflicts by field:');
            Object.entries(summary.conflictsByField)
                .sort((a, b) => b[1] - a[1])
                .forEach(([field, count]) => {
                    console.log(`  ${field}: ${count}`);
                });
            console.log('');
            if (summary.manualReviewFields.length > 0) {
                console.log(`Fields requiring manual review: ${summary.manualReviewFields.join(', ')}`);
            }
            console.log('═'.repeat(60));
            break;
        }

        case 'list-strategies': {
            console.log('\nAvailable Conflict Resolution Strategies:\n');
            const strategies = [
                ['highest-value', 'Select the highest numeric value (currency, numbers)'],
                ['most-recent', 'Select the most recently modified value'],
                ['from-decision', 'Require manual decision (flag for review)'],
                ['favor-master', 'Always use the canonical/master value'],
                ['favor-duplicate', 'Always use the duplicate value'],
                ['longest-string', 'Select the longest/most complete text value'],
                ['non-null', 'Use any non-null value (canonical preferred)']
            ];

            strategies.forEach(([name, description]) => {
                console.log(`  ${name}`);
                console.log(`    ${description}`);
                console.log('');
            });

            console.log('\nDefault Field Strategies:');
            Object.entries(DEFAULT_FIELD_STRATEGIES).slice(0, 10).forEach(([field, strategy]) => {
                console.log(`  ${field}: ${strategy}`);
            });
            console.log('  ...');
            break;
        }

        default:
            console.error(`Unknown command: ${command}`);
            printUsage();
            process.exit(1);
    }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = FieldConflictAnalyzer;
module.exports.DEFAULT_FIELD_STRATEGIES = DEFAULT_FIELD_STRATEGIES;
module.exports.TYPE_STRATEGY_MAP = TYPE_STRATEGY_MAP;
