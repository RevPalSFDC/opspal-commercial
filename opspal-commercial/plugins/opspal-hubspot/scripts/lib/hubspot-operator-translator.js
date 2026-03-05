#!/usr/bin/env node

/**
 * HubSpot Operator Translator
 *
 * Translates standard SQL/programming operators to HubSpot's verbose operator names.
 * Examples:
 * - >= → IS_GREATER_THAN_OR_EQUAL_TO
 * - = → IS_EQUAL_TO
 * - LIKE → CONTAINS
 *
 * Usage:
 *   const translator = new HubSpotOperatorTranslator();
 *   const hubspotOp = translator.translate('>='); // IS_GREATER_THAN_OR_EQUAL_TO
 *
 * @module hubspot-operator-translator
 * @version 1.0.0
 * @created 2025-10-24
 * @addresses Cohort #2 - HubSpot Lists API Issues ($10k ROI)
 */

const fs = require('fs');
const path = require('path');

class HubSpotOperatorTranslator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.configPath = options.configPath || path.join(__dirname, '../../config/hubspot-operator-mappings.json');
        this.config = this.loadConfig();
        this.operatorMap = this.buildOperatorMap();
    }

    /**
     * Load operator mappings configuration
     */
    loadConfig() {
        try {
            const content = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`Failed to load operator config: ${error.message}`);
            return { operators: {} };
        }
    }

    /**
     * Build flat operator map for quick lookups
     */
    buildOperatorMap() {
        const map = {};

        for (const [category, operators] of Object.entries(this.config.operators || {})) {
            for (const [stdOp, details] of Object.entries(operators)) {
                map[stdOp.toUpperCase()] = details.hubspot;
            }
        }

        return map;
    }

    /**
     * Translate standard operator to HubSpot operator
     *
     * @param {string} standardOperator - Standard operator (e.g., '>=', 'LIKE')
     * @returns {string|null} HubSpot operator or null if not found
     */
    translate(standardOperator) {
        const normalized = standardOperator.trim().toUpperCase();
        const hubspotOp = this.operatorMap[normalized];

        if (hubspotOp) {
            if (this.verbose) {
                console.log(`✅ Translated: ${standardOperator} → ${hubspotOp}`);
            }
            return hubspotOp;
        }

        // Check if it's already a HubSpot operator
        if (this.isHubSpotOperator(normalized)) {
            if (this.verbose) {
                console.log(`✅ Already HubSpot format: ${standardOperator}`);
            }
            return normalized;
        }

        if (this.verbose) {
            console.warn(`⚠️  No translation found for: ${standardOperator}`);
        }

        return null;
    }

    /**
     * Check if operator is already in HubSpot format
     *
     * @param {string} operator - Operator to check
     * @returns {boolean} True if already HubSpot format
     */
    isHubSpotOperator(operator) {
        const normalized = operator.toUpperCase();
        const hubspotOperators = new Set(Object.values(this.operatorMap));
        return hubspotOperators.has(normalized);
    }

    /**
     * Get reverse translation (HubSpot → standard)
     *
     * @param {string} hubspotOperator - HubSpot operator
     * @returns {Array<string>} Array of standard operators
     */
    reverseTranslate(hubspotOperator) {
        const normalized = hubspotOperator.toUpperCase();
        return this.config.reverse_lookup[normalized] || [];
    }

    /**
     * Get operation type for operator
     *
     * @param {string} operator - HubSpot operator
     * @param {string} fieldType - Field type hint (string, number, date)
     * @returns {string} Operation type (MULTISTRING, NUMBER, etc.)
     */
    getOperationType(operator, fieldType = 'string') {
        const hubspotOp = this.isHubSpotOperator(operator) ? operator : this.translate(operator);

        if (!hubspotOp) {
            return null;
        }

        // Check each operation type for applicable operators
        for (const [opType, details] of Object.entries(this.config.operation_types || {})) {
            if (details.applicable_operators.includes(hubspotOp.toUpperCase())) {
                // Match by field type preference
                if (fieldType === 'number' && opType === 'NUMBER') return opType;
                if (fieldType === 'date' && opType === 'TIME_RANGED') return opType;
                if (fieldType === 'boolean' && opType === 'BOOL') return opType;
                if (fieldType === 'enum' && opType === 'ENUMERATION') return opType;

                // Default to first match
                return opType;
            }
        }

        // Fallback to MULTISTRING for string operations
        return 'MULTISTRING';
    }

    /**
     * Build complete operation object
     *
     * @param {string} operator - Standard or HubSpot operator
     * @param {Array} values - Values for the operation
     * @param {string} fieldType - Field type (string, number, date, etc.)
     * @returns {Object} Complete operation object
     */
    buildOperation(operator, values, fieldType = 'string') {
        const hubspotOp = this.translate(operator);

        if (!hubspotOp) {
            throw new Error(`Cannot translate operator: ${operator}`);
        }

        const operationType = this.getOperationType(hubspotOp, fieldType);

        return {
            operationType: operationType,
            operator: hubspotOp,
            values: Array.isArray(values) ? values : [values]
        };
    }

    /**
     * Validate operation object
     *
     * @param {Object} operation - Operation object to validate
     * @returns {Object} Validation result
     */
    validateOperation(operation) {
        const errors = [];

        // Check required fields
        if (!operation.operator) {
            errors.push('Missing required field: operator');
        }

        if (!operation.operationType) {
            errors.push('Missing required field: operationType');
        }

        // Check operator is valid HubSpot format
        if (operation.operator && !this.isHubSpotOperator(operation.operator)) {
            errors.push(`Invalid HubSpot operator: ${operation.operator}`);

            // Suggest translation
            const translation = this.translate(operation.operator);
            if (translation) {
                errors.push(`Suggestion: Use '${translation}' instead of '${operation.operator}'`);
            }
        }

        // Check operator is applicable for operation type
        if (operation.operator && operation.operationType) {
            const opTypeDetails = this.config.operation_types[operation.operationType];
            if (opTypeDetails && !opTypeDetails.applicable_operators.includes(operation.operator)) {
                errors.push(`Operator ${operation.operator} not applicable for type ${operation.operationType}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Get common mistakes for reference
     */
    getCommonMistakes() {
        return this.config.common_mistakes || [];
    }

    /**
     * Get all supported standard operators
     */
    getSupportedOperators() {
        return Object.keys(this.operatorMap);
    }
}

// CLI usage
if (require.main === module) {
    const translator = new HubSpotOperatorTranslator({ verbose: true });

    const command = process.argv[2];

    if (command === 'translate') {
        // Translate operator
        const operator = process.argv[3];

        if (!operator) {
            console.error('Usage: node hubspot-operator-translator.js translate <operator>');
            process.exit(1);
        }

        const translated = translator.translate(operator);
        if (translated) {
            console.log(`\n✅ HubSpot Operator: ${translated}`);
        } else {
            console.log(`\n❌ No translation found for: ${operator}`);
            process.exit(1);
        }

    } else if (command === 'build') {
        // Build operation object
        const operator = process.argv[3];
        const value = process.argv[4];
        const fieldType = process.argv[5] || 'string';

        if (!operator || !value) {
            console.error('Usage: node hubspot-operator-translator.js build <operator> <value> [fieldType]');
            process.exit(1);
        }

        try {
            const operation = translator.buildOperation(operator, [value], fieldType);
            console.log('\n✅ Operation Object:');
            console.log(JSON.stringify(operation, null, 2));
        } catch (error) {
            console.error(`\n❌ Error: ${error.message}`);
            process.exit(1);
        }

    } else if (command === 'validate') {
        // Validate operation object
        const operationJson = process.argv[3];

        if (!operationJson) {
            console.error('Usage: node hubspot-operator-translator.js validate \'{"operator":">=","operationType":"NUMBER"}\'');
            process.exit(1);
        }

        try {
            const operation = JSON.parse(operationJson);
            const result = translator.validateOperation(operation);

            if (result.valid) {
                console.log('\n✅ Operation is valid');
            } else {
                console.log('\n❌ Operation validation failed:');
                for (const error of result.errors) {
                    console.log(`   - ${error}`);
                }
            }

            process.exit(result.valid ? 0 : 1);
        } catch (error) {
            console.error(`\n❌ Error parsing JSON: ${error.message}`);
            process.exit(1);
        }

    } else if (command === 'list') {
        // List all supported operators
        console.log('\n=== Supported Operators ===\n');

        const operators = translator.getSupportedOperators();
        operators.sort().forEach(op => {
            const hubspotOp = translator.translate(op);
            console.log(`${op.padEnd(20)} → ${hubspotOp}`);
        });

    } else {
        console.log('HubSpot Operator Translator');
        console.log('');
        console.log('Usage:');
        console.log('  node hubspot-operator-translator.js translate <operator>');
        console.log('  node hubspot-operator-translator.js build <operator> <value> [fieldType]');
        console.log('  node hubspot-operator-translator.js validate <operation-json>');
        console.log('  node hubspot-operator-translator.js list');
        console.log('');
        console.log('Examples:');
        console.log('  node hubspot-operator-translator.js translate ">=');
        console.log('  node hubspot-operator-translator.js build ">=" "100" "number"');
        console.log('  node hubspot-operator-translator.js list');
    }
}

module.exports = HubSpotOperatorTranslator;
