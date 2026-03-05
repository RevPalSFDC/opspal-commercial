#!/usr/bin/env node

/**
 * Field Type Resolver
 *
 * Resolves Salesforce field types to determine TEXT() wrapping requirements.
 * Queries field metadata and provides intelligent TEXT() usage recommendations.
 *
 * Usage:
 *   const resolver = new FieldTypeResolver(orgAlias);
 *   const needsText = await resolver.needsTextWrapper('Opportunity', 'Status');
 *
 * @module field-type-resolver
 * @version 1.0.0
 * @created 2025-10-24
 * @addresses Cohort #5 - Flow TEXT() Wrapping ($12k ROI)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class FieldTypeResolver {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.cacheDir = options.cacheDir || path.join(process.cwd(), '.cache/field-types');

        this.rulesConfig = this.loadRules();

        // Create cache directory
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Load formula type rules
     */
    loadRules() {
        try {
            const rulesPath = path.join(__dirname, '../../config/formula-type-rules.json');
            if (fs.existsSync(rulesPath)) {
                return JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
            }
        } catch (error) {
            if (this.verbose) {
                console.warn(`Warning: Could not load formula type rules: ${error.message}`);
            }
        }
        return { text_wrapping_rules: {} };
    }

    /**
     * Determine if field needs TEXT() wrapper
     *
     * @param {string} objectName - Object API name
     * @param {string} fieldName - Field API name
     * @returns {Object} Result with needsText boolean and reasoning
     */
    async needsTextWrapper(objectName, fieldName) {
        const result = {
            needsText: false,
            fieldType: null,
            reason: '',
            confidence: 'LOW'
        };

        // Get field type
        const fieldMetadata = await this.getFieldType(objectName, fieldName);

        if (!fieldMetadata) {
            result.reason = 'Field not found or metadata unavailable';
            return result;
        }

        result.fieldType = fieldMetadata.type;

        // Check against rules
        const neverWrapTypes = this.rulesConfig.text_wrapping_rules.never_wrap?.field_types || [];
        const alwaysWrapTypes = this.rulesConfig.text_wrapping_rules.always_wrap?.field_types || [];

        if (neverWrapTypes.includes(fieldMetadata.type.toLowerCase())) {
            result.needsText = false;
            result.reason = `${fieldMetadata.type} fields are already Text type - TEXT() is redundant`;
            result.confidence = 'HIGH';
        } else if (alwaysWrapTypes.includes(fieldMetadata.type.toLowerCase())) {
            result.needsText = true;
            result.reason = `${fieldMetadata.type} fields need TEXT() for string comparisons`;
            result.confidence = 'HIGH';
        } else {
            result.needsText = false;
            result.reason = `Unknown field type ${fieldMetadata.type} - recommend checking`;
            result.confidence = 'MEDIUM';
        }

        return result;
    }

    /**
     * Get field type from Salesforce
     *
     * @param {string} objectName - Object API name
     * @param {string} fieldName - Field API name
     * @returns {Object} Field metadata
     */
    async getFieldType(objectName, fieldName) {
        // Check cache first
        const cacheKey = `${objectName}.${fieldName}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            if (this.verbose) {
                console.log(`✅ Cache hit for ${cacheKey}`);
            }
            return cached;
        }

        // Query Salesforce
        try {
            const cmd = `sf sobject describe --sobject ${objectName} --target-org ${this.orgAlias} --json`;
            const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            const response = JSON.parse(output);

            if (response.status === 0 && response.result && response.result.fields) {
                const field = response.result.fields.find(f =>
                    f.name.toLowerCase() === fieldName.toLowerCase()
                );

                if (field) {
                    // Cache result
                    this.saveToCache(cacheKey, field);
                    return field;
                }
            }
        } catch (error) {
            if (this.verbose) {
                console.warn(`Warning: Could not query field type: ${error.message}`);
            }
        }

        return null;
    }

    /**
     * Check if field is ID type
     *
     * @param {string} objectName - Object API name
     * @param {string} fieldName - Field API name
     * @returns {boolean} True if ID type
     */
    async isIdField(objectName, fieldName) {
        const fieldMetadata = await this.getFieldType(objectName, fieldName);

        if (!fieldMetadata) return false;

        const idTypes = ['id', 'reference', 'lookup', 'masterdetail'];
        return idTypes.includes(fieldMetadata.type.toLowerCase()) ||
               idTypes.some(type => fieldMetadata.type.toLowerCase().includes(type));
    }

    /**
     * Check if field is picklist type
     */
    async isPicklistField(objectName, fieldName) {
        const fieldMetadata = await this.getFieldType(objectName, fieldName);

        if (!fieldMetadata) return false;

        return fieldMetadata.type === 'picklist' ||
               fieldMetadata.type === 'multipicklist';
    }

    /**
     * Get recommended TEXT() usage
     *
     * @param {string} formula - Formula expression
     * @param {string} objectName - Object API name
     * @returns {Object} Recommendations
     */
    async analyzeFormula(formula, objectName) {
        const result = {
            formula: formula,
            issues: [],
            corrections: []
        };

        // Find all TEXT() calls
        const textCallRegex = /TEXT\s*\(\s*(\w+)\s*\)/gi;
        let match;

        while ((match = textCallRegex.exec(formula)) !== null) {
            const fieldName = match[1];
            const fullMatch = match[0];

            const needsText = await this.needsTextWrapper(objectName, fieldName);

            if (!needsText.needsText && needsText.confidence === 'HIGH') {
                result.issues.push({
                    type: 'REDUNDANT_TEXT',
                    field: fieldName,
                    message: `Redundant TEXT() on ${fieldName} - ${needsText.reason}`,
                    severity: 'ERROR',
                    original: fullMatch,
                    suggested: fieldName
                });

                result.corrections.push({
                    from: fullMatch,
                    to: fieldName,
                    reason: needsText.reason
                });
            }
        }

        // Find picklist comparisons without TEXT()
        const picklistCompareRegex = /(\w+)\s*=\s*['"]/gi;

        while ((match = picklistCompareRegex.exec(formula)) !== null) {
            const fieldName = match[1];

            // Skip if already wrapped in TEXT()
            const beforeMatch = formula.substring(0, match.index);
            if (beforeMatch.endsWith('TEXT(')) continue;

            const isPicklist = await this.isPicklistField(objectName, fieldName);

            if (isPicklist) {
                result.issues.push({
                    type: 'MISSING_TEXT',
                    field: fieldName,
                    message: `Missing TEXT() on picklist field ${fieldName}`,
                    severity: 'ERROR',
                    original: match[0],
                    suggested: `TEXT(${fieldName}) = '`
                });
            }
        }

        return result;
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
            // Cache miss
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
}

// CLI usage
if (require.main === module) {
    const command = process.argv[2];

    if (!command) {
        console.log('Field Type Resolver');
        console.log('');
        console.log('Usage:');
        console.log('  node field-type-resolver.js needs-text <org> <object> <field>');
        console.log('  node field-type-resolver.js is-id <org> <object> <field>');
        console.log('  node field-type-resolver.js analyze <org> <object> <formula>');
        console.log('');
        console.log('Examples:');
        console.log('  node field-type-resolver.js needs-text my-org Opportunity Status');
        console.log('  node field-type-resolver.js is-id my-org Opportunity AccountId');
        console.log('  node field-type-resolver.js analyze my-org Opportunity "TEXT(AccountId) = \'001...\'"');
        process.exit(1);
    }

    const orgAlias = process.argv[3];
    const objectName = process.argv[4];

    if (!orgAlias || !objectName) {
        console.error('Error: Missing required arguments');
        process.exit(1);
    }

    const resolver = new FieldTypeResolver(orgAlias, { verbose: true });

    if (command === 'needs-text') {
        const fieldName = process.argv[5];
        if (!fieldName) {
            console.error('Error: Missing field name');
            process.exit(1);
        }

        resolver.needsTextWrapper(objectName, fieldName).then(result => {
            console.log(`\n${result.needsText ? '✅' : '❌'} TEXT() ${result.needsText ? 'REQUIRED' : 'NOT REQUIRED'}`);
            console.log(`Field Type: ${result.fieldType}`);
            console.log(`Reason: ${result.reason}`);
            console.log(`Confidence: ${result.confidence}`);
            process.exit(0);
        });

    } else if (command === 'is-id') {
        const fieldName = process.argv[5];
        if (!fieldName) {
            console.error('Error: Missing field name');
            process.exit(1);
        }

        resolver.isIdField(objectName, fieldName).then(isId => {
            console.log(`\n${isId ? '✅' : '❌'} ${fieldName} ${isId ? 'IS' : 'IS NOT'} an ID field`);
            process.exit(0);
        });

    } else if (command === 'analyze') {
        const formula = process.argv[5];
        if (!formula) {
            console.error('Error: Missing formula');
            process.exit(1);
        }

        resolver.analyzeFormula(formula, objectName).then(result => {
            console.log('\n=== Formula Analysis ===\n');
            console.log(`Formula: ${result.formula}`);

            if (result.issues.length > 0) {
                console.log('\n--- Issues Found ---');
                for (const issue of result.issues) {
                    console.log(`\n${issue.severity === 'ERROR' ? '❌' : '⚠️'} [${issue.type}] ${issue.field}`);
                    console.log(`   ${issue.message}`);
                    console.log(`   Original: ${issue.original}`);
                    console.log(`   Suggested: ${issue.suggested}`);
                }
            }

            if (result.corrections.length > 0) {
                console.log('\n--- Suggested Corrections ---');
                for (const correction of result.corrections) {
                    console.log(`Replace: ${correction.from}`);
                    console.log(`With:    ${correction.to}`);
                    console.log(`Reason:  ${correction.reason}\n`);
                }
            }

            if (result.issues.length === 0) {
                console.log('\n✅ No issues found');
            }

            process.exit(result.issues.length === 0 ? 0 : 1);
        });
    }
}

module.exports = FieldTypeResolver;
