#!/usr/bin/env node

/**
 * HubSpot Lists API Validator
 *
 * Validates HubSpot Lists API requests before execution to prevent the 4 common errors:
 * 1. Wrong association ID (280 vs 279)
 * 2. Invalid operator syntax (>= vs IS_GREATER_THAN_OR_EQUAL_TO)
 * 3. Missing operationType field
 * 4. Invalid filter structure (must be OR with nested AND)
 *
 * Usage:
 *   const validator = new HubSpotListsAPIValidator();
 *   const result = await validator.validate(listRequest);
 *
 * @module hubspot-lists-api-validator
 * @version 1.0.0
 * @created 2025-10-24
 * @addresses Cohort #2 - HubSpot Lists API Issues ($10k ROI)
 */

const HubSpotAssociationMapper = require('./hubspot-association-mapper');
const HubSpotOperatorTranslator = require('./hubspot-operator-translator');
const HubSpotFilterBuilder = require('./hubspot-filter-builder');

class HubSpotListsAPIValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.autoFix = options.autoFix || false;

        this.associationMapper = new HubSpotAssociationMapper({ verbose: false });
        this.operatorTranslator = new HubSpotOperatorTranslator({ verbose: false });
        this.filterBuilder = new HubSpotFilterBuilder({ verbose: false });

        this.stats = {
            totalValidations: 0,
            passed: 0,
            failed: 0,
            autoFixed: 0,
            errors: {
                association: 0,
                operator: 0,
                operationType: 0,
                filterStructure: 0
            }
        };
    }

    /**
     * Validate Lists API request
     *
     * @param {Object} request - Lists API request object
     * @param {Object} context - Additional context
     * @returns {Object} Validation result
     */
    async validate(request, context = {}) {
        this.stats.totalValidations++;

        const result = {
            valid: false,
            errors: [],
            warnings: [],
            fixes: [],
            correctedRequest: null
        };

        // Validate filter structure
        if (request.filterBranch || request.filterBranches) {
            const filterResult = this.validateFilterStructure(request);
            if (!filterResult.valid) {
                result.errors.push(...filterResult.errors);
                this.stats.errors.filterStructure++;
            }
            if (filterResult.warnings) {
                result.warnings.push(...filterResult.warnings);
            }
        }

        // Validate individual filters
        const filters = this.extractFilters(request);
        for (const filter of filters) {
            const filterErrors = this.validateFilter(filter, context);
            if (filterErrors.length > 0) {
                result.errors.push(...filterErrors);
            }
        }

        // Determine overall validity
        result.valid = result.errors.length === 0;

        // Update stats
        if (result.valid) {
            this.stats.passed++;
        } else {
            this.stats.failed++;
        }

        // Auto-fix if enabled
        if (!result.valid && this.autoFix) {
            const fixResult = this.autoFixRequest(request, result.errors);
            if (fixResult.success) {
                result.correctedRequest = fixResult.correctedRequest;
                result.fixes = fixResult.fixes;
                this.stats.autoFixed++;

                if (this.verbose) {
                    console.log(`✅ Auto-fixed ${fixResult.fixes.length} error(s)`);
                }
            }
        }

        return result;
    }

    /**
     * Validate filter structure
     *
     * @param {Object} request - Lists API request
     * @returns {Object} Validation result
     */
    validateFilterStructure(request) {
        const errors = [];
        const warnings = [];

        const filter = request.filterBranch || request;

        // Check root level
        if (filter.filterBranchType && filter.filterBranchType !== 'OR') {
            errors.push({
                type: 'filterStructure',
                message: `Root filterBranchType must be OR, got ${filter.filterBranchType}`,
                field: 'filterBranchType',
                expected: 'OR',
                actual: filter.filterBranchType
            });
        }

        if (filter.filterBranchOperator && filter.filterBranchOperator !== 'OR') {
            errors.push({
                type: 'filterStructure',
                message: `Root filterBranchOperator must be OR, got ${filter.filterBranchOperator}`,
                field: 'filterBranchOperator',
                expected: 'OR',
                actual: filter.filterBranchOperator
            });
        }

        // Check nested branches
        if (filter.filterBranches && Array.isArray(filter.filterBranches)) {
            for (let i = 0; i < filter.filterBranches.length; i++) {
                const branch = filter.filterBranches[i];

                if (branch.filterBranchType !== 'AND') {
                    errors.push({
                        type: 'filterStructure',
                        message: `Nested filterBranchType must be AND, got ${branch.filterBranchType}`,
                        field: `filterBranches[${i}].filterBranchType`,
                        expected: 'AND',
                        actual: branch.filterBranchType
                    });
                }

                if (branch.filterBranchOperator !== 'AND') {
                    errors.push({
                        type: 'filterStructure',
                        message: `Nested filterBranchOperator must be AND, got ${branch.filterBranchOperator}`,
                        field: `filterBranches[${i}].filterBranchOperator`,
                        expected: 'AND',
                        actual: branch.filterBranchOperator
                    });
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings
        };
    }

    /**
     * Validate a single filter
     *
     * @param {Object} filter - Filter object
     * @param {Object} context - Validation context
     * @returns {Array} Array of error objects
     */
    validateFilter(filter, context = {}) {
        const errors = [];

        // Validate association ID
        if (filter.associationTypeId) {
            const assocError = this.validateAssociation(filter, context);
            if (assocError) {
                errors.push(assocError);
                this.stats.errors.association++;
            }
        }

        // Validate operation
        if (filter.operation) {
            // Check operationType field
            if (!filter.operation.operationType) {
                errors.push({
                    type: 'operationType',
                    message: 'Missing required field: operationType',
                    field: 'operation.operationType',
                    suggestion: 'Add operationType (MULTISTRING, NUMBER, TIME_RANGED, etc.)'
                });
                this.stats.errors.operationType++;
            }

            // Check operator format
            if (filter.operation.operator) {
                if (!this.operatorTranslator.isHubSpotOperator(filter.operation.operator)) {
                    const translated = this.operatorTranslator.translate(filter.operation.operator);
                    errors.push({
                        type: 'operator',
                        message: `Invalid HubSpot operator: ${filter.operation.operator}`,
                        field: 'operation.operator',
                        actual: filter.operation.operator,
                        suggested: translated,
                        suggestion: translated ? `Use '${translated}' instead` : 'Use HubSpot verbose operator name'
                    });
                    this.stats.errors.operator++;
                }
            }
        }

        return errors;
    }

    /**
     * Validate association ID
     *
     * @param {Object} filter - Filter object
     * @param {Object} context - Context with objectType info
     * @returns {Object|null} Error object or null
     */
    validateAssociation(filter, context) {
        if (!context.objectType || !filter.property) {
            return null; // Can't validate without context
        }

        // Try to determine associated object from property
        const associatedObject = this.guessAssociatedObject(filter.property);
        if (!associatedObject) {
            return null; // Can't guess object type
        }

        // Get correct association ID
        const correctId = this.associationMapper.getAssociationId(
            context.objectType,
            associatedObject
        );

        if (correctId && filter.associationTypeId !== correctId) {
            return {
                type: 'association',
                message: `Wrong association ID: ${filter.associationTypeId} (should be ${correctId})`,
                field: 'associationTypeId',
                actual: filter.associationTypeId,
                expected: correctId,
                suggestion: `Use ${correctId} for ${context.objectType}→${associatedObject}`
            };
        }

        return null;
    }

    /**
     * Auto-fix request errors
     *
     * @param {Object} request - Original request
     * @param {Array} errors - Errors to fix
     * @returns {Object} Fix result
     */
    autoFixRequest(request, errors) {
        const correctedRequest = JSON.parse(JSON.stringify(request));
        const fixes = [];

        for (const error of errors) {
            if (error.type === 'operator' && error.suggested) {
                // Fix operator
                this.setNestedProperty(correctedRequest, error.field, error.suggested);
                fixes.push({
                    type: 'operator',
                    message: `Fixed operator: ${error.actual} → ${error.suggested}`,
                    field: error.field
                });
            } else if (error.type === 'association' && error.expected) {
                // Fix association ID
                this.setNestedProperty(correctedRequest, error.field, error.expected);
                fixes.push({
                    type: 'association',
                    message: `Fixed association ID: ${error.actual} → ${error.expected}`,
                    field: error.field
                });
            } else if (error.type === 'operationType') {
                // Add missing operationType
                const filter = this.getNestedProperty(correctedRequest, error.field.split('.').slice(0, -1).join('.'));
                if (filter && filter.operator) {
                    const operationType = this.operatorTranslator.getOperationType(filter.operator);
                    this.setNestedProperty(correctedRequest, error.field, operationType);
                    fixes.push({
                        type: 'operationType',
                        message: `Added operationType: ${operationType}`,
                        field: error.field
                    });
                }
            }
        }

        return {
            success: fixes.length > 0,
            correctedRequest: correctedRequest,
            fixes: fixes
        };
    }

    /**
     * Extract all filters from request
     */
    extractFilters(request) {
        const filters = [];

        const collectFilters = (obj) => {
            if (obj.filters && Array.isArray(obj.filters)) {
                filters.push(...obj.filters);
            }
            if (obj.filterBranches && Array.isArray(obj.filterBranches)) {
                for (const branch of obj.filterBranches) {
                    collectFilters(branch);
                }
            }
        };

        collectFilters(request);
        return filters;
    }

    /**
     * Guess associated object from property name
     */
    guessAssociatedObject(property) {
        const lowerProp = property.toLowerCase();

        if (lowerProp.includes('company') || lowerProp.includes('domain')) {
            return 'companies';
        }
        if (lowerProp.includes('deal') || lowerProp.includes('pipeline')) {
            return 'deals';
        }
        if (lowerProp.includes('ticket')) {
            return 'tickets';
        }
        if (lowerProp.includes('contact')) {
            return 'contacts';
        }

        return null;
    }

    /**
     * Get nested property value
     */
    getNestedProperty(obj, path) {
        return path.split('.').reduce((acc, part) => acc?.[part], obj);
    }

    /**
     * Set nested property value
     */
    setNestedProperty(obj, path, value) {
        const parts = path.split('.');
        const last = parts.pop();
        const target = parts.reduce((acc, part) => acc[part], obj);
        if (target) {
            target[last] = value;
        }
    }

    /**
     * Get validation statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalValidations > 0
                ? (this.stats.passed / this.stats.totalValidations * 100).toFixed(1) + '%'
                : 'N/A',
            autoFixRate: this.stats.failed > 0
                ? (this.stats.autoFixed / this.stats.failed * 100).toFixed(1) + '%'
                : 'N/A'
        };
    }
}

// CLI usage
if (require.main === module) {
    const validator = new HubSpotListsAPIValidator({ verbose: true, autoFix: true });

    const command = process.argv[2];

    if (command === 'validate') {
        // Validate request
        const requestJson = process.argv[3];
        const contextJson = process.argv[4] || '{}';

        if (!requestJson) {
            console.error('Usage: node hubspot-lists-api-validator.js validate <request-json> [context-json]');
            process.exit(1);
        }

        try {
            const request = JSON.parse(requestJson);
            const context = JSON.parse(contextJson);

            validator.validate(request, context).then(result => {
                console.log('\n=== Validation Result ===\n');
                console.log(`Status: ${result.valid ? '✅ VALID' : '❌ INVALID'}`);

                if (result.errors.length > 0) {
                    console.log('\n--- Errors ---');
                    for (const error of result.errors) {
                        console.log(`\n[${error.type}] ${error.message}`);
                        if (error.suggestion) {
                            console.log(`  Suggestion: ${error.suggestion}`);
                        }
                    }
                }

                if (result.warnings.length > 0) {
                    console.log('\n--- Warnings ---');
                    for (const warning of result.warnings) {
                        console.log(`  ${warning.message}`);
                    }
                }

                if (result.fixes.length > 0) {
                    console.log('\n--- Auto-Fixes Applied ---');
                    for (const fix of result.fixes) {
                        console.log(`  ✅ ${fix.message}`);
                    }

                    console.log('\n--- Corrected Request ---');
                    console.log(JSON.stringify(result.correctedRequest, null, 2));
                }

                console.log('\n--- Statistics ---');
                const stats = validator.getStats();
                console.log(`Success Rate: ${stats.successRate}`);
                console.log(`Auto-Fix Rate: ${stats.autoFixRate}`);

                process.exit(result.valid ? 0 : 1);
            });
        } catch (error) {
            console.error(`\n❌ Error: ${error.message}`);
            process.exit(1);
        }

    } else {
        console.log('HubSpot Lists API Validator');
        console.log('');
        console.log('Usage:');
        console.log('  node hubspot-lists-api-validator.js validate <request-json> [context-json]');
        console.log('');
        console.log('Example:');
        console.log('  node hubspot-lists-api-validator.js validate \'{"filterBranches":[...]}\'');
    }
}

module.exports = HubSpotListsAPIValidator;
