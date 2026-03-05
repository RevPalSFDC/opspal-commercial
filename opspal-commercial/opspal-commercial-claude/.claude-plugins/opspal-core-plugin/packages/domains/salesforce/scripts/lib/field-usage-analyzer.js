#!/usr/bin/env node

/**
 * Field Usage Analyzer
 *
 * Analyzes Salesforce field population rates and usage patterns to:
 * - Determine if field is suitable for use in flows/automation
 * - Recommend alternatives for unpopulated fields
 * - Identify better standard field options
 *
 * Usage:
 *   const analyzer = new FieldUsageAnalyzer(orgAlias);
 *   const result = await analyzer.analyze('Opportunity', 'Net_Price__c');
 *
 * @module field-usage-analyzer
 * @version 1.0.0
 * @created 2025-10-24
 * @addresses Cohort #4 - Flow Field References ($13k ROI)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class FieldUsageAnalyzer {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.cacheDir = options.cacheDir || path.join(process.cwd(), '.cache/field-usage');

        // Thresholds
        this.populationThresholds = {
            CRITICAL: 0.01,  // <1% populated
            LOW: 0.10,       // <10% populated
            MEDIUM: 0.50,    // <50% populated
            GOOD: 0.90       // >90% populated
        };

        this.stats = {
            totalAnalyses: 0,
            cacheHits: 0,
            cacheMisses: 0
        };

        // Create cache directory
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Analyze field usage
     *
     * @param {string} objectName - Object API name
     * @param {string} fieldName - Field API name
     * @returns {Object} Analysis result
     */
    async analyze(objectName, fieldName) {
        this.stats.totalAnalyses++;

        const result = {
            object: objectName,
            field: fieldName,
            exists: false,
            fieldType: null,
            isStandard: false,
            populationRate: 0,
            populationLevel: 'UNKNOWN',
            totalRecords: 0,
            populatedRecords: 0,
            recommendations: [],
            alternatives: [],
            suitableForFlows: false
        };

        // Check cache
        const cacheKey = `${objectName}.${fieldName}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            this.stats.cacheHits++;
            if (this.verbose) {
                console.log(`✅ Cache hit for ${objectName}.${fieldName}`);
            }
            return cached;
        }

        this.stats.cacheMisses++;

        // Get field metadata
        const fieldMetadata = this.getFieldMetadata(objectName, fieldName);
        if (!fieldMetadata) {
            result.recommendations.push({
                type: 'ERROR',
                message: `Field ${fieldName} does not exist on ${objectName}`,
                action: 'Verify field name and object'
            });
            return result;
        }

        result.exists = true;
        result.fieldType = fieldMetadata.type;
        result.isStandard = !fieldName.endsWith('__c');

        // Get population rate
        const populationData = this.getPopulationRate(objectName, fieldName);
        result.totalRecords = populationData.totalRecords;
        result.populatedRecords = populationData.populatedRecords;
        result.populationRate = populationData.rate;
        result.populationLevel = this.categorizePopulation(populationData.rate);

        // Determine suitability for flows
        result.suitableForFlows = result.populationRate >= this.populationThresholds.MEDIUM;

        // Generate recommendations
        result.recommendations = this.generateRecommendations(result, fieldMetadata);

        // Find alternatives if field is poorly populated
        if (result.populationRate < this.populationThresholds.MEDIUM) {
            result.alternatives = this.findAlternatives(objectName, fieldName, fieldMetadata);
        }

        // Cache result
        this.saveToCache(cacheKey, result);

        return result;
    }

    /**
     * Get field metadata from Salesforce
     */
    getFieldMetadata(objectName, fieldName) {
        try {
            const cmd = `sf sobject describe --sobject ${objectName} --target-org ${this.orgAlias} --json`;
            const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            const response = JSON.parse(output);

            if (response.status === 0 && response.result && response.result.fields) {
                return response.result.fields.find(f =>
                    f.name.toLowerCase() === fieldName.toLowerCase()
                );
            }
        } catch (error) {
            if (this.verbose) {
                console.warn(`Warning: Could not get field metadata: ${error.message}`);
            }
        }

        return null;
    }

    /**
     * Get field population rate
     */
    getPopulationRate(objectName, fieldName) {
        const result = {
            totalRecords: 0,
            populatedRecords: 0,
            rate: 0
        };

        try {
            // Get total record count
            const totalCmd = `sf data query --query "SELECT COUNT() FROM ${objectName}" --target-org ${this.orgAlias} --json`;
            const totalOutput = execSync(totalCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            const totalResponse = JSON.parse(totalOutput);

            if (totalResponse.status === 0 && totalResponse.result && totalResponse.result.records) {
                result.totalRecords = totalResponse.result.records[0].expr0 || 0;
            }

            if (result.totalRecords === 0) {
                return result; // No records to analyze
            }

            // Get populated record count
            const populatedCmd = `sf data query --query "SELECT COUNT() FROM ${objectName} WHERE ${fieldName} != null" --target-org ${this.orgAlias} --json`;
            const populatedOutput = execSync(populatedCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            const populatedResponse = JSON.parse(populatedOutput);

            if (populatedResponse.status === 0 && populatedResponse.result && populatedResponse.result.records) {
                result.populatedRecords = populatedResponse.result.records[0].expr0 || 0;
            }

            // Calculate rate
            if (result.totalRecords > 0) {
                result.rate = result.populatedRecords / result.totalRecords;
            }

        } catch (error) {
            if (this.verbose) {
                console.warn(`Warning: Could not get population rate: ${error.message}`);
            }
        }

        return result;
    }

    /**
     * Categorize population rate
     */
    categorizePopulation(rate) {
        if (rate >= this.populationThresholds.GOOD) return 'GOOD';
        if (rate >= this.populationThresholds.MEDIUM) return 'MEDIUM';
        if (rate >= this.populationThresholds.LOW) return 'LOW';
        if (rate >= this.populationThresholds.CRITICAL) return 'CRITICAL';
        return 'EMPTY';
    }

    /**
     * Generate recommendations
     */
    generateRecommendations(result, fieldMetadata) {
        const recommendations = [];

        if (!result.exists) {
            recommendations.push({
                type: 'ERROR',
                message: 'Field does not exist',
                action: 'Verify field name or create field'
            });
            return recommendations;
        }

        // Population-based recommendations
        if (result.populationLevel === 'CRITICAL' || result.populationLevel === 'EMPTY') {
            recommendations.push({
                type: 'ERROR',
                message: `Field is {result.populationRate * 100}% populated - too low for reliable use`,
                action: 'Find alternative field or populate this field before using in automation'
            });
        } else if (result.populationLevel === 'LOW') {
            recommendations.push({
                type: 'WARNING',
                message: `Field is only ${(result.populationRate * 100).toFixed(1)}% populated`,
                action: 'Consider using more populated alternative or add null checks in flow'
            });
        } else if (result.populationLevel === 'MEDIUM') {
            recommendations.push({
                type: 'INFO',
                message: `Field is ${(result.populationRate * 100).toFixed(1)}% populated - acceptable with null handling`,
                action: 'Include null checks in flow logic'
            });
        }

        // Standard vs custom field recommendations
        if (!result.isStandard && result.populationRate < this.populationThresholds.GOOD) {
            recommendations.push({
                type: 'INFO',
                message: 'Custom field with imperfect population - check if standard alternative exists',
                action: 'Run: findAlternatives()'
            });
        }

        return recommendations;
    }

    /**
     * Find alternative fields
     */
    findAlternatives(objectName, fieldName, fieldMetadata) {
        const alternatives = [];

        // Load standard field mapping
        const mappingPath = path.join(__dirname, '../../config/standard-field-mapping.json');
        let mapping = {};

        try {
            if (fs.existsSync(mappingPath)) {
                mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
            }
        } catch (error) {
            // Mapping file not available
        }

        // Check for known confusions
        for (const [confusionKey, confusion] of Object.entries(mapping.common_confusions || {})) {
            if (fieldName.includes(confusionKey.split('_')[0]) || confusion.confusion.includes(fieldName)) {
                const correctUsage = confusion.correct_usage[objectName.toLowerCase()];
                if (correctUsage) {
                    alternatives.push({
                        field: correctUsage.field,
                        type: correctUsage.type,
                        description: correctUsage.description,
                        reason: confusion.recommendation
                    });
                }
            }
        }

        // Check object-specific mapping
        const objectMapping = mapping.object_field_mapping?.[objectName];
        if (objectMapping) {
            for (const [category, fieldInfo] of Object.entries(objectMapping)) {
                if (fieldInfo.standard_field && fieldInfo.recommended) {
                    alternatives.push({
                        field: fieldInfo.standard_field,
                        type: fieldInfo.type,
                        description: fieldInfo.description,
                        reason: 'Standard field - more reliable'
                    });
                }
            }
        }

        return alternatives;
    }

    /**
     * Cache management
     */
    getFromCache(key) {
        try {
            const cachePath = path.join(this.cacheDir, `${key}.json`);
            if (fs.existsSync(cachePath)) {
                const cacheAge = Date.now() - fs.statSync(cachePath).mtimeMs;
                const cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours

                if (cacheAge < cacheExpiry) {
                    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                }
            }
        } catch (error) {
            // Cache miss or error
        }

        return null;
    }

    saveToCache(key, data) {
        try {
            const cachePath = path.join(this.cacheDir, `${key}.json`);
            fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
        } catch (error) {
            // Cache write failed - not critical
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        return this.stats;
    }
}

// CLI usage
if (require.main === module) {
    const orgAlias = process.argv[2];
    const objectName = process.argv[3];
    const fieldName = process.argv[4];

    if (!orgAlias || !objectName || !fieldName) {
        console.log('Field Usage Analyzer');
        console.log('');
        console.log('Usage:');
        console.log('  node field-usage-analyzer.js <org-alias> <object> <field>');
        console.log('');
        console.log('Example:');
        console.log('  node field-usage-analyzer.js my-org Opportunity Contract_Term_Months__c');
        process.exit(1);
    }

    const analyzer = new FieldUsageAnalyzer(orgAlias, { verbose: true });

    analyzer.analyze(objectName, fieldName).then(result => {
        console.log('\n=== Field Usage Analysis ===\n');
        console.log(`Object: ${result.object}`);
        console.log(`Field: ${result.field}`);
        console.log(`Exists: ${result.exists ? '✅ Yes' : '❌ No'}`);

        if (result.exists) {
            console.log(`Type: ${result.fieldType}`);
            console.log(`Standard Field: ${result.isStandard ? 'Yes' : 'No (Custom)'}`);
            console.log(`Population Rate: ${(result.populationRate * 100).toFixed(1)}% (${result.populatedRecords}/${result.totalRecords})`);
            console.log(`Population Level: ${result.populationLevel}`);
            console.log(`Suitable for Flows: ${result.suitableForFlows ? '✅ Yes' : '❌ No'}`);

            if (result.recommendations.length > 0) {
                console.log('\n--- Recommendations ---');
                for (const rec of result.recommendations) {
                    console.log(`${rec.type === 'ERROR' ? '❌' : rec.type === 'WARNING' ? '⚠️' : '💡'} ${rec.message}`);
                    console.log(`   Action: ${rec.action}`);
                }
            }

            if (result.alternatives.length > 0) {
                console.log('\n--- Alternative Fields ---');
                for (const alt of result.alternatives) {
                    console.log(`✅ ${alt.field} (${alt.type})`);
                    console.log(`   ${alt.description}`);
                    console.log(`   Reason: ${alt.reason}`);
                }
            }
        }

        process.exit(result.exists && result.suitableForFlows ? 0 : 1);
    }).catch(error => {
        console.error('Analysis error:', error);
        process.exit(1);
    });
}

module.exports = FieldUsageAnalyzer;
