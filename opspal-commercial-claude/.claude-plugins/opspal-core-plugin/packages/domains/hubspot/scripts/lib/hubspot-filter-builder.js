#!/usr/bin/env node

/**
 * HubSpot Filter Builder
 *
 * Builds HubSpot Lists API filter structures with correct format:
 * - Root filter must be OR type
 * - Nested filters must be AND type
 * - Validates filter structure before API calls
 *
 * Usage:
 *   const builder = new HubSpotFilterBuilder();
 *   const filter = builder.build([conditions]);
 *
 * @module hubspot-filter-builder
 * @version 1.0.0
 * @created 2025-10-24
 * @addresses Cohort #2 - HubSpot Lists API Issues ($10k ROI)
 */

const HubSpotOperatorTranslator = require('./hubspot-operator-translator');
const HubSpotAssociationMapper = require('./hubspot-association-mapper');

class HubSpotFilterBuilder {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.translator = new HubSpotOperatorTranslator({ verbose: false });
        this.associationMapper = new HubSpotAssociationMapper({ verbose: false });
    }

    /**
     * Build filter structure
     *
     * @param {Array} conditions - Array of condition objects
     * @param {Object} options - Build options
     * @returns {Object} Complete filter structure
     */
    build(conditions, options = {}) {
        if (!Array.isArray(conditions) || conditions.length === 0) {
            throw new Error('Conditions must be a non-empty array');
        }

        // Build individual filters
        const filters = conditions.map(condition => this.buildFilter(condition));

        // HubSpot requires: Root OR with nested AND
        const filterBranches = filters.map(filter => ({
            filterBranchType: 'AND',
            filterBranchOperator: 'AND',
            filters: [filter]
        }));

        const rootFilter = {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filterBranches: filterBranches
        };

        if (this.verbose) {
            console.log('✅ Built filter structure with OR-with-nested-AND pattern');
        }

        return rootFilter;
    }

    /**
     * Build a single filter object
     *
     * @param {Object} condition - Condition object
     * @returns {Object} Filter object
     */
    buildFilter(condition) {
        const filter = {
            filterType: condition.filterType || 'PROPERTY'
        };

        // Add property name
        if (condition.property) {
            filter.property = condition.property;
        }

        // Build operation
        if (condition.operator) {
            const hubspotOperator = this.translator.translate(condition.operator);

            if (!hubspotOperator) {
                throw new Error(`Invalid operator: ${condition.operator}`);
            }

            const fieldType = condition.fieldType || 'string';
            const operationType = this.translator.getOperationType(hubspotOperator, fieldType);

            filter.operation = {
                operationType: operationType,
                operator: hubspotOperator
            };

            // Add values if provided
            if (condition.values) {
                filter.operation.values = Array.isArray(condition.values)
                    ? condition.values
                    : [condition.values];
            }
        }

        // Add association info if filtering by related object
        if (condition.associatedObject) {
            const fromObject = condition.objectType || 'contacts';
            const toObject = condition.associatedObject;

            const associationId = this.associationMapper.getAssociationId(fromObject, toObject);

            if (!associationId) {
                throw new Error(`No association found: ${fromObject} → ${toObject}`);
            }

            filter.associationTypeId = associationId;
            filter.associationCategory = 'HUBSPOT_DEFINED';
        }

        return filter;
    }

    /**
     * Build simple filter (single condition)
     *
     * @param {string} property - Property name
     * @param {string} operator - Operator (standard or HubSpot)
     * @param {any} value - Filter value
     * @param {Object} options - Additional options
     * @returns {Object} Complete filter structure
     */
    buildSimple(property, operator, value, options = {}) {
        const condition = {
            property: property,
            operator: operator,
            values: [value],
            fieldType: options.fieldType || 'string',
            filterType: options.filterType || 'PROPERTY'
        };

        if (options.associatedObject) {
            condition.associatedObject = options.associatedObject;
            condition.objectType = options.objectType;
        }

        return this.build([condition], options);
    }

    /**
     * Build complex filter (multiple conditions)
     *
     * @param {Array} conditions - Array of conditions
     * @param {string} combineWith - How to combine (AND or OR)
     * @returns {Object} Complete filter structure
     */
    buildComplex(conditions, combineWith = 'AND') {
        if (combineWith.toUpperCase() === 'AND') {
            // All conditions must be true - put in single AND branch
            const filters = conditions.map(c => this.buildFilter(c));

            return {
                filterBranchType: 'OR',
                filterBranchOperator: 'OR',
                filterBranches: [{
                    filterBranchType: 'AND',
                    filterBranchOperator: 'AND',
                    filters: filters
                }]
            };
        } else {
            // Any condition can be true - use multiple OR branches
            return this.build(conditions);
        }
    }

    /**
     * Validate filter structure
     *
     * @param {Object} filter - Filter to validate
     * @returns {Object} Validation result
     */
    validate(filter) {
        const errors = [];

        // Check root filter structure
        if (!filter.filterBranchType) {
            errors.push('Missing filterBranchType at root level');
        } else if (filter.filterBranchType !== 'OR') {
            errors.push(`Root filterBranchType must be OR, got ${filter.filterBranchType}`);
        }

        if (!filter.filterBranchOperator) {
            errors.push('Missing filterBranchOperator at root level');
        } else if (filter.filterBranchOperator !== 'OR') {
            errors.push(`Root filterBranchOperator must be OR, got ${filter.filterBranchOperator}`);
        }

        // Check filter branches
        if (!filter.filterBranches || !Array.isArray(filter.filterBranches)) {
            errors.push('Missing or invalid filterBranches array');
        } else {
            for (let i = 0; i < filter.filterBranches.length; i++) {
                const branch = filter.filterBranches[i];

                if (branch.filterBranchType !== 'AND') {
                    errors.push(`Branch ${i}: filterBranchType must be AND, got ${branch.filterBranchType}`);
                }

                if (branch.filterBranchOperator !== 'AND') {
                    errors.push(`Branch ${i}: filterBranchOperator must be AND, got ${branch.filterBranchOperator}`);
                }

                if (!branch.filters || !Array.isArray(branch.filters)) {
                    errors.push(`Branch ${i}: Missing or invalid filters array`);
                } else {
                    // Validate individual filters
                    for (let j = 0; j < branch.filters.length; j++) {
                        const filterErrors = this.validateFilter(branch.filters[j]);
                        if (filterErrors.length > 0) {
                            errors.push(`Branch ${i}, Filter ${j}: ${filterErrors.join(', ')}`);
                        }
                    }
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Validate a single filter object
     *
     * @param {Object} filter - Filter to validate
     * @returns {Array} Array of error messages
     */
    validateFilter(filter) {
        const errors = [];

        if (!filter.filterType) {
            errors.push('Missing filterType');
        }

        if (!filter.property && filter.filterType === 'PROPERTY') {
            errors.push('Missing property name');
        }

        if (filter.operation) {
            if (!filter.operation.operationType) {
                errors.push('Missing operation.operationType');
            }

            if (!filter.operation.operator) {
                errors.push('Missing operation.operator');
            } else {
                // Validate operator is HubSpot format
                if (!this.translator.isHubSpotOperator(filter.operation.operator)) {
                    errors.push(`Invalid HubSpot operator: ${filter.operation.operator}`);
                }
            }
        }

        // Validate association info if present
        if (filter.associationTypeId && !filter.associationCategory) {
            errors.push('Missing associationCategory (should be HUBSPOT_DEFINED)');
        }

        return errors;
    }

    /**
     * Convert flat conditions to HubSpot filter format
     *
     * @param {Object} flatConditions - Flat condition object
     * @returns {Object} HubSpot filter structure
     */
    fromFlatConditions(flatConditions) {
        // Example input:
        // {
        //   industry: 'Technology',
        //   lifecyclestage: ['customer', 'opportunity'],
        //   created_date: { operator: '>=', value: '2024-01-01' }
        // }

        const conditions = [];

        for (const [property, value] of Object.entries(flatConditions)) {
            if (typeof value === 'object' && !Array.isArray(value)) {
                // Complex condition with operator
                conditions.push({
                    property: property,
                    operator: value.operator || '=',
                    values: [value.value],
                    fieldType: value.fieldType || 'string'
                });
            } else if (Array.isArray(value)) {
                // Array means IN operator
                conditions.push({
                    property: property,
                    operator: 'IN',
                    values: value,
                    fieldType: 'string'
                });
            } else {
                // Simple equality
                conditions.push({
                    property: property,
                    operator: '=',
                    values: [value],
                    fieldType: 'string'
                });
            }
        }

        return this.build(conditions);
    }
}

// CLI usage
if (require.main === module) {
    const builder = new HubSpotFilterBuilder({ verbose: true });

    const command = process.argv[2];

    if (command === 'simple') {
        // Build simple filter
        const property = process.argv[3];
        const operator = process.argv[4];
        const value = process.argv[5];

        if (!property || !operator || !value) {
            console.error('Usage: node hubspot-filter-builder.js simple <property> <operator> <value>');
            process.exit(1);
        }

        const filter = builder.buildSimple(property, operator, value);
        console.log('\n✅ Filter Structure:');
        console.log(JSON.stringify(filter, null, 2));

    } else if (command === 'complex') {
        // Build complex filter from JSON
        const conditionsJson = process.argv[3];

        if (!conditionsJson) {
            console.error('Usage: node hubspot-filter-builder.js complex \'[{"property":"industry","operator":"=","values":["Technology"]}]\'');
            process.exit(1);
        }

        try {
            const conditions = JSON.parse(conditionsJson);
            const filter = builder.build(conditions);
            console.log('\n✅ Filter Structure:');
            console.log(JSON.stringify(filter, null, 2));
        } catch (error) {
            console.error(`\n❌ Error: ${error.message}`);
            process.exit(1);
        }

    } else if (command === 'validate') {
        // Validate filter structure
        const filterJson = process.argv[3];

        if (!filterJson) {
            console.error('Usage: node hubspot-filter-builder.js validate \'<filter-json>\'');
            process.exit(1);
        }

        try {
            const filter = JSON.parse(filterJson);
            const result = builder.validate(filter);

            if (result.valid) {
                console.log('\n✅ Filter structure is valid');
            } else {
                console.log('\n❌ Filter validation failed:');
                for (const error of result.errors) {
                    console.log(`   - ${error}`);
                }
            }

            process.exit(result.valid ? 0 : 1);
        } catch (error) {
            console.error(`\n❌ Error: ${error.message}`);
            process.exit(1);
        }

    } else {
        console.log('HubSpot Filter Builder');
        console.log('');
        console.log('Usage:');
        console.log('  node hubspot-filter-builder.js simple <property> <operator> <value>');
        console.log('  node hubspot-filter-builder.js complex <conditions-json>');
        console.log('  node hubspot-filter-builder.js validate <filter-json>');
        console.log('');
        console.log('Examples:');
        console.log('  node hubspot-filter-builder.js simple industry "=" Technology');
        console.log('  node hubspot-filter-builder.js complex \'[{"property":"industry","operator":"=","values":["Tech"]}]\'');
    }
}

module.exports = HubSpotFilterBuilder;
