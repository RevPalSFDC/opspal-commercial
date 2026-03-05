#!/usr/bin/env node

/**
 * Dependent Picklist Validator for Salesforce
 *
 * Validates dependent picklist operations before execution to prevent failures like:
 * - "Segment2__c is a dependent picklist controlled by Market__c"
 * - "Sub_Segment__c has controlling field dependency on Segment2__c"
 *
 * Features:
 * - Auto-query mode: Queries controlling field state from org before updates
 * - Caches controlling field mappings per org (5-minute TTL)
 * - Validates picklist values against controlling field constraints
 * - Blocks operations that would violate dependencies
 *
 * @version 1.0.0
 * @date 2026-01-02
 *
 * Addresses: schema/parse cohort (dependent picklist issues)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Cache for controlling field mappings (5-minute TTL)
const CACHE_TTL_MS = 5 * 60 * 1000;
const dependencyCache = new Map();

class DependentPicklistValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.orgAlias = options.orgAlias || process.env.SALESFORCE_ORG_ALIAS || process.env.SF_TARGET_ORG;
        this.autoQuery = options.autoQuery !== false; // Auto-query is ON by default
    }

    /**
     * Get cache key for dependency info
     */
    getCacheKey(objectName, fieldName) {
        return `${this.orgAlias}:${objectName}:${fieldName}`;
    }

    /**
     * Check if cached dependency info is still valid
     */
    isCacheValid(cacheEntry) {
        return cacheEntry && (Date.now() - cacheEntry.timestamp < CACHE_TTL_MS);
    }

    /**
     * Query Salesforce for field dependency information
     * @param {string} objectName - API name of the object
     * @param {string} fieldName - API name of the field
     * @returns {Object} Dependency information
     */
    async queryFieldDependency(objectName, fieldName) {
        const cacheKey = this.getCacheKey(objectName, fieldName);
        const cached = dependencyCache.get(cacheKey);

        if (this.isCacheValid(cached)) {
            if (this.verbose) {
                console.log(`   Using cached dependency info for ${objectName}.${fieldName}`);
            }
            return cached.data;
        }

        if (this.verbose) {
            console.log(`   Querying dependency info for ${objectName}.${fieldName}...`);
        }

        try {
            // Query field describe to get dependency info
            const orgFlag = this.orgAlias ? `--target-org ${this.orgAlias}` : '';
            const describeCmd = `sf sobject describe ${objectName} ${orgFlag} --json`;

            const result = JSON.parse(execSync(describeCmd, {
                encoding: 'utf8',
                maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large objects
            }));

            const objectDescribe = result.result;
            const fieldDescribe = objectDescribe.fields?.find(f =>
                f.name === fieldName || f.name.toLowerCase() === fieldName.toLowerCase()
            );

            if (!fieldDescribe) {
                return {
                    found: false,
                    error: `Field ${fieldName} not found on ${objectName}`
                };
            }

            const dependencyInfo = {
                found: true,
                fieldName: fieldDescribe.name,
                fieldType: fieldDescribe.type,
                isDependent: !!fieldDescribe.controllerName,
                controllingField: fieldDescribe.controllerName || null,
                picklistValues: fieldDescribe.picklistValues || [],
                dependentPicklist: fieldDescribe.dependentPicklist || null,
                validFor: {} // Map of controlling value -> valid dependent values
            };

            // Build validFor map if this is a dependent picklist
            if (dependencyInfo.isDependent && fieldDescribe.picklistValues) {
                for (const pv of fieldDescribe.picklistValues) {
                    if (pv.validFor) {
                        // validFor is a base64-encoded bitmap of valid controlling indices
                        // We'll decode it in the validation step
                        dependencyInfo.validFor[pv.value] = pv.validFor;
                    }
                }
            }

            // Cache the result
            dependencyCache.set(cacheKey, {
                timestamp: Date.now(),
                data: dependencyInfo
            });

            return dependencyInfo;

        } catch (error) {
            console.error(`   Error querying field dependency: ${error.message}`);
            return {
                found: false,
                error: error.message
            };
        }
    }

    /**
     * Get controlling field values for an object
     * @param {string} objectName - API name of the object
     * @param {string} controllingField - API name of the controlling field
     * @returns {Array} List of valid controlling values
     */
    async getControllingFieldValues(objectName, controllingField) {
        const cacheKey = `${this.orgAlias}:${objectName}:${controllingField}:values`;
        const cached = dependencyCache.get(cacheKey);

        if (this.isCacheValid(cached)) {
            return cached.data;
        }

        try {
            const orgFlag = this.orgAlias ? `--target-org ${this.orgAlias}` : '';
            const describeCmd = `sf sobject describe ${objectName} ${orgFlag} --json`;

            const result = JSON.parse(execSync(describeCmd, {
                encoding: 'utf8',
                maxBuffer: 50 * 1024 * 1024
            }));

            const fieldDescribe = result.result.fields?.find(f =>
                f.name === controllingField || f.name.toLowerCase() === controllingField.toLowerCase()
            );

            if (!fieldDescribe) {
                return [];
            }

            const values = (fieldDescribe.picklistValues || [])
                .filter(pv => pv.active)
                .map((pv, index) => ({
                    value: pv.value,
                    label: pv.label,
                    index: index
                }));

            dependencyCache.set(cacheKey, {
                timestamp: Date.now(),
                data: values
            });

            return values;

        } catch (error) {
            console.error(`   Error getting controlling field values: ${error.message}`);
            return [];
        }
    }

    /**
     * Decode validFor bitmap to get valid controlling indices
     * @param {string} validForBase64 - Base64-encoded bitmap
     * @returns {Array} Array of valid controlling indices
     */
    decodeValidFor(validForBase64) {
        if (!validForBase64) return [];

        try {
            const bytes = Buffer.from(validForBase64, 'base64');
            const validIndices = [];

            for (let byteIndex = 0; byteIndex < bytes.length; byteIndex++) {
                const byte = bytes[byteIndex];
                for (let bit = 0; bit < 8; bit++) {
                    if ((byte & (0x80 >> bit)) !== 0) {
                        validIndices.push(byteIndex * 8 + bit);
                    }
                }
            }

            return validIndices;
        } catch (error) {
            return [];
        }
    }

    /**
     * Validate a dependent picklist value against controlling field
     * @param {string} objectName - API name of the object
     * @param {string} dependentField - API name of the dependent field
     * @param {string} dependentValue - Value to set on dependent field
     * @param {string} controllingValue - Current value of controlling field
     * @returns {Object} Validation result
     */
    async validateDependentValue(objectName, dependentField, dependentValue, controllingValue) {
        const result = {
            valid: false,
            dependentField,
            dependentValue,
            controllingValue,
            errors: [],
            warnings: []
        };

        // Query dependency info
        const depInfo = await this.queryFieldDependency(objectName, dependentField);

        if (!depInfo.found) {
            result.errors.push(depInfo.error || `Field ${dependentField} not found`);
            return result;
        }

        // If not a dependent picklist, no validation needed
        if (!depInfo.isDependent) {
            result.valid = true;
            result.warnings.push(`${dependentField} is not a dependent picklist - no validation needed`);
            return result;
        }

        // Get controlling field values with indices
        const controllingValues = await this.getControllingFieldValues(
            objectName,
            depInfo.controllingField
        );

        // Find the index of the controlling value
        const controllingEntry = controllingValues.find(cv =>
            cv.value === controllingValue || cv.label === controllingValue
        );

        if (!controllingEntry) {
            result.errors.push(
                `Controlling field ${depInfo.controllingField} value "${controllingValue}" not found. ` +
                `Valid values: ${controllingValues.map(cv => cv.value).join(', ')}`
            );
            return result;
        }

        // Check if dependent value is valid for this controlling value
        const validForBase64 = depInfo.validFor[dependentValue];

        if (!validForBase64) {
            result.errors.push(
                `Dependent value "${dependentValue}" is not a valid picklist value for ${dependentField}. ` +
                `Valid values: ${Object.keys(depInfo.validFor).join(', ')}`
            );
            return result;
        }

        const validIndices = this.decodeValidFor(validForBase64);

        if (!validIndices.includes(controllingEntry.index)) {
            // Find valid controlling values for this dependent value
            const validControllingValues = controllingValues
                .filter(cv => validIndices.includes(cv.index))
                .map(cv => cv.value);

            result.errors.push(
                `"${dependentValue}" is not valid when ${depInfo.controllingField} = "${controllingValue}". ` +
                `This value is only valid when ${depInfo.controllingField} is one of: ${validControllingValues.join(', ')}`
            );
            return result;
        }

        result.valid = true;
        return result;
    }

    /**
     * Validate an update operation for dependent picklists
     * @param {string} objectName - API name of the object
     * @param {Object} updates - Field-value pairs to update
     * @param {Object} currentRecord - Current record values (for context)
     * @returns {Object} Validation result
     */
    async validateUpdate(objectName, updates, currentRecord = {}) {
        const result = {
            valid: true,
            objectName,
            errors: [],
            warnings: [],
            validatedFields: []
        };

        // Get list of all dependent fields being updated
        const dependentFields = [];

        for (const [fieldName, newValue] of Object.entries(updates)) {
            const depInfo = await this.queryFieldDependency(objectName, fieldName);

            if (depInfo.found && depInfo.isDependent) {
                dependentFields.push({
                    fieldName,
                    newValue,
                    controllingField: depInfo.controllingField
                });
            }
        }

        // Validate each dependent field
        for (const dep of dependentFields) {
            // Get controlling value - from updates if being changed, else from current record
            const controllingValue = updates[dep.controllingField] || currentRecord[dep.controllingField];

            if (!controllingValue) {
                result.warnings.push(
                    `Cannot validate ${dep.fieldName}: controlling field ${dep.controllingField} ` +
                    `value not provided in updates or current record`
                );
                continue;
            }

            const validation = await this.validateDependentValue(
                objectName,
                dep.fieldName,
                dep.newValue,
                controllingValue
            );

            result.validatedFields.push({
                field: dep.fieldName,
                value: dep.newValue,
                controllingField: dep.controllingField,
                controllingValue,
                valid: validation.valid
            });

            if (!validation.valid) {
                result.valid = false;
                result.errors.push(...validation.errors);
            }

            result.warnings.push(...validation.warnings);
        }

        return result;
    }

    /**
     * Get all dependent picklist relationships for an object
     * @param {string} objectName - API name of the object
     * @returns {Array} List of dependency relationships
     */
    async getDependencies(objectName) {
        const cacheKey = `${this.orgAlias}:${objectName}:dependencies`;
        const cached = dependencyCache.get(cacheKey);

        if (this.isCacheValid(cached)) {
            return cached.data;
        }

        try {
            const orgFlag = this.orgAlias ? `--target-org ${this.orgAlias}` : '';
            const describeCmd = `sf sobject describe ${objectName} ${orgFlag} --json`;

            const result = JSON.parse(execSync(describeCmd, {
                encoding: 'utf8',
                maxBuffer: 50 * 1024 * 1024
            }));

            const dependencies = [];

            for (const field of result.result.fields || []) {
                if (field.controllerName) {
                    dependencies.push({
                        dependentField: field.name,
                        dependentLabel: field.label,
                        controllingField: field.controllerName,
                        picklistValueCount: field.picklistValues?.length || 0
                    });
                }
            }

            dependencyCache.set(cacheKey, {
                timestamp: Date.now(),
                data: dependencies
            });

            return dependencies;

        } catch (error) {
            console.error(`   Error getting dependencies: ${error.message}`);
            return [];
        }
    }

    /**
     * Clear the dependency cache
     */
    clearCache() {
        dependencyCache.clear();
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === 'help') {
        console.log(`
Dependent Picklist Validator

Usage:
  node dependent-picklist-validator.js <command> [options]

Commands:
  dependencies <object>              List all dependent picklist relationships
  validate <object> <field> <value> <controlling-value>  Validate a specific value
  check-update <object> <json-updates> [json-current]    Validate an update operation

Options:
  --org <alias>    Salesforce org alias
  --verbose        Enable verbose output

Examples:
  node dependent-picklist-validator.js dependencies Account
  node dependent-picklist-validator.js validate Account Sub_Segment__c "CIO" "Local Government"
  node dependent-picklist-validator.js check-update Account '{"Segment2__c":"Technology"}' '{"Market__c":"Enterprise"}'
`);
        process.exit(0);
    }

    const orgIndex = args.indexOf('--org');
    const orgAlias = orgIndex >= 0 ? args[orgIndex + 1] : null;
    const verbose = args.includes('--verbose');

    const validator = new DependentPicklistValidator({ orgAlias, verbose });

    (async () => {
        try {
            switch (command) {
                case 'dependencies': {
                    const objectName = args[1];
                    if (!objectName) {
                        console.error('Error: Object name required');
                        process.exit(1);
                    }

                    console.log(`\nDependent Picklist Dependencies for ${objectName}:\n`);
                    const deps = await validator.getDependencies(objectName);

                    if (deps.length === 0) {
                        console.log('  No dependent picklist relationships found.');
                    } else {
                        for (const dep of deps) {
                            console.log(`  ${dep.dependentField} (${dep.dependentLabel})`);
                            console.log(`    Controlled by: ${dep.controllingField}`);
                            console.log(`    Values: ${dep.picklistValueCount}`);
                            console.log('');
                        }
                    }
                    break;
                }

                case 'validate': {
                    const [, objectName, field, value, controllingValue] = args;

                    if (!objectName || !field || !value || !controllingValue) {
                        console.error('Error: Required: object field value controlling-value');
                        process.exit(1);
                    }

                    const result = await validator.validateDependentValue(
                        objectName, field, value, controllingValue
                    );

                    if (result.valid) {
                        console.log(`\n\u2713 Valid: "${value}" is allowed when controlling field = "${controllingValue}"`);
                    } else {
                        console.error(`\n\u2717 Invalid:`);
                        result.errors.forEach(e => console.error(`  - ${e}`));
                        process.exit(1);
                    }
                    break;
                }

                case 'check-update': {
                    const [, objectName, updatesJson, currentJson] = args;

                    if (!objectName || !updatesJson) {
                        console.error('Error: Required: object json-updates');
                        process.exit(1);
                    }

                    const updates = JSON.parse(updatesJson);
                    const current = currentJson ? JSON.parse(currentJson) : {};

                    const result = await validator.validateUpdate(objectName, updates, current);

                    console.log(`\nUpdate Validation for ${objectName}:\n`);

                    if (result.validatedFields.length === 0) {
                        console.log('  No dependent picklist fields in update.');
                    } else {
                        for (const vf of result.validatedFields) {
                            const icon = vf.valid ? '\u2713' : '\u2717';
                            console.log(`  ${icon} ${vf.field} = "${vf.value}"`);
                            console.log(`      (when ${vf.controllingField} = "${vf.controllingValue}")`);
                        }
                    }

                    if (result.errors.length > 0) {
                        console.log('\nErrors:');
                        result.errors.forEach(e => console.error(`  - ${e}`));
                        process.exit(1);
                    }

                    if (result.warnings.length > 0) {
                        console.log('\nWarnings:');
                        result.warnings.forEach(w => console.warn(`  - ${w}`));
                    }

                    console.log(result.valid ? '\n\u2713 Update is valid' : '\n\u2717 Update has validation errors');
                    break;
                }

                default:
                    console.error(`Unknown command: ${command}`);
                    process.exit(1);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = {
    DependentPicklistValidator,
    clearDependencyCache: () => dependencyCache.clear()
};
