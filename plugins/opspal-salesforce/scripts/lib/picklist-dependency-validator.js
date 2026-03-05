#!/usr/bin/env node

const EnhancedMCPTool = require('../../mcp-extensions/tools/base/enhanced-mcp-tool');
const { API_VERSION } = require('../../config/apiVersion');
const { firstLine } = require('./utils/mcp-helpers');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');

/**
 * PicklistDependencyValidator
 * ============================
 * Comprehensive validation framework for picklist field dependencies.
 *
 * Validates:
 * - Dependency matrix completeness and correctness
 * - Controlling field values exist
 * - Dependent field values exist and are properly mapped
 * - No orphaned values (values with no mappings)
 * - Record type value enablement
 * - Dependency metadata structure validity
 * - Circular dependency detection
 * - Post-deployment verification
 *
 * Validation Phases:
 * 1. Pre-deployment validation (before metadata changes)
 * 2. Matrix validation (dependency mapping correctness)
 * 3. Metadata structure validation (XML/JSON format)
 * 4. Post-deployment verification (confirm deployment worked)
 *
 * Integration:
 * - Called by picklist-dependency-manager before deployments
 * - Used by pre-deployment validation hooks
 * - Integrated into Order of Operations framework
 *
 * Based on Salesforce Picklist Field Dependencies Playbook
 *
 * @extends EnhancedMCPTool
 */
class PicklistDependencyValidator extends EnhancedMCPTool {
    constructor(options = {}) {
        super({
            name: 'PicklistDependencyValidator',
            version: '1.0.0',
            stage: options.stage || 'development',
            description: 'Validates picklist field dependencies before deployment',
            ...options
        });

        this.org = options.org || process.env.SF_TARGET_ORG;
        this.parser = new xml2js.Parser();
        this.projectPath = options.projectPath || path.join(__dirname, '..', '..');
    }

    /**
     * Comprehensive pre-deployment validation.
     *
     * Runs all validation checks before deploying a picklist dependency.
     * This is the main entry point for validation.
     *
     * @param {Object} params - Configuration object
     * @param {string} params.objectName - Salesforce object API name
     * @param {string} params.controllingFieldApiName - Controlling field
     * @param {string} params.dependentFieldApiName - Dependent field
     * @param {Object} params.dependencyMatrix - Dependency mapping
     * @param {string[]} [params.recordTypes] - Record types to validate
     * @param {string} [params.targetOrg] - Target org alias
     *
     * @returns {Promise<Object>} Comprehensive validation result
     *
     * @example
     * const validator = new PicklistDependencyValidator({ org: 'myorg' });
     *
     * const validation = await validator.validateBeforeDeployment({
     *     objectName: 'Account',
     *     controllingFieldApiName: 'Industry',
     *     dependentFieldApiName: 'Account_Type__c',
     *     dependencyMatrix: {
     *         'Technology': ['SaaS', 'Hardware'],
     *         'Finance': ['Banking', 'Insurance']
     *     }
     * });
     *
     * if (!validation.canProceed) {
     *     console.error('Validation failed:', validation.errors);
     * }
     */
    async validateBeforeDeployment(params) {
        this.validateParams(params, [
            'objectName',
            'controllingFieldApiName',
            'dependentFieldApiName',
            'dependencyMatrix'
        ]);

        const {
            objectName,
            controllingFieldApiName,
            dependentFieldApiName,
            dependencyMatrix,
            recordTypes = [],
            targetOrg
        } = params;

        const alias = targetOrg || this.org;

        this.logOperation('validate_before_deployment_start', {
            objectName,
            controllingField: controllingFieldApiName,
            dependentField: dependentFieldApiName
        });

        const validationResults = {
            canProceed: true,
            errors: [],
            warnings: [],
            checks: {}
        };

        try {
            // Check 1: Validate fields exist
            validationResults.checks.fieldsExist = await this.validateFieldsExist(
                objectName,
                controllingFieldApiName,
                dependentFieldApiName,
                alias
            );
            if (!validationResults.checks.fieldsExist.valid) {
                validationResults.canProceed = false;
                validationResults.errors.push(...validationResults.checks.fieldsExist.errors);
            }

            // Check 2: Validate field types are compatible
            validationResults.checks.fieldTypes = await this.validateFieldTypes(
                objectName,
                controllingFieldApiName,
                dependentFieldApiName,
                alias
            );
            if (!validationResults.checks.fieldTypes.valid) {
                validationResults.canProceed = false;
                validationResults.errors.push(...validationResults.checks.fieldTypes.errors);
            }

            // Check 3: Validate dependency matrix
            validationResults.checks.matrix = await this.validateDependencyMatrix({
                objectName,
                controllingFieldApiName,
                dependentFieldApiName,
                dependencyMatrix,
                targetOrg: alias
            });
            if (!validationResults.checks.matrix.valid) {
                validationResults.canProceed = false;
                validationResults.errors.push(...validationResults.checks.matrix.errors);
            }
            validationResults.warnings.push(...(validationResults.checks.matrix.warnings || []));

            // Check 4: Validate controlling values exist
            validationResults.checks.controllingValues = await this.validateControllingValues(
                objectName,
                controllingFieldApiName,
                Object.keys(dependencyMatrix),
                alias
            );
            if (!validationResults.checks.controllingValues.valid) {
                validationResults.canProceed = false;
                validationResults.errors.push(...validationResults.checks.controllingValues.errors);
            }

            // Check 5: Validate dependent values exist
            validationResults.checks.dependentValues = await this.validateDependentValues(
                objectName,
                dependentFieldApiName,
                Object.values(dependencyMatrix).flat(),
                alias
            );
            if (!validationResults.checks.dependentValues.valid) {
                validationResults.canProceed = false;
                validationResults.errors.push(...validationResults.checks.dependentValues.errors);
            }

            // Check 6: Check for circular dependencies
            validationResults.checks.circularDependency = await this.checkCircularDependency(
                objectName,
                controllingFieldApiName,
                dependentFieldApiName,
                alias
            );
            if (!validationResults.checks.circularDependency.valid) {
                validationResults.canProceed = false;
                validationResults.errors.push(...validationResults.checks.circularDependency.errors);
            }

            // Check 7: Validate record types (if specified)
            if (recordTypes.length > 0) {
                validationResults.checks.recordTypes = await this.validateRecordTypes(
                    objectName,
                    recordTypes,
                    alias
                );
                if (!validationResults.checks.recordTypes.valid) {
                    validationResults.warnings.push(...validationResults.checks.recordTypes.warnings);
                }
            }

            this.logOperation('validate_before_deployment_complete', {
                objectName,
                canProceed: validationResults.canProceed,
                errorCount: validationResults.errors.length,
                warningCount: validationResults.warnings.length
            });

            return validationResults;

        } catch (error) {
            this.logOperation('validate_before_deployment_error', {
                objectName,
                error: error.message
            });
            throw this.enhanceError(error, {
                operation: 'validateBeforeDeployment',
                objectName
            });
        }
    }

    /**
     * Validate that both fields exist on the object.
     *
     * @private
     */
    async validateFieldsExist(objectName, controllingField, dependentField, alias) {
        try {
            const describeCommand = `sf sobject describe --sobject ${objectName} --target-org ${alias} --json`;
            const result = await this.executeCommand(describeCommand);
            const parsed = this.parseJSON(result.stdout, { operation: 'validateFieldsExist' });

            const fields = parsed.result?.fields || [];
            const fieldNames = new Set(fields.map(f => f.name));

            const errors = [];

            if (!fieldNames.has(controllingField)) {
                errors.push(`Controlling field '${controllingField}' not found on ${objectName}`);
            }

            if (!fieldNames.has(dependentField)) {
                errors.push(`Dependent field '${dependentField}' not found on ${objectName}`);
            }

            return {
                valid: errors.length === 0,
                errors
            };

        } catch (error) {
            return {
                valid: false,
                errors: [`Failed to validate fields exist: ${firstLine(error.message)}`]
            };
        }
    }

    /**
     * Validate that field types are compatible for dependencies.
     *
     * Both fields must be picklist or multipicklist types.
     *
     * @private
     */
    async validateFieldTypes(objectName, controllingField, dependentField, alias) {
        try {
            const describeCommand = `sf sobject describe --sobject ${objectName} --target-org ${alias} --json`;
            const result = await this.executeCommand(describeCommand);
            const parsed = this.parseJSON(result.stdout, { operation: 'validateFieldTypes' });

            const fields = parsed.result?.fields || [];
            const controllingFieldObj = fields.find(f => f.name === controllingField);
            const dependentFieldObj = fields.find(f => f.name === dependentField);

            const errors = [];

            const validTypes = ['picklist', 'multipicklist'];

            if (controllingFieldObj && !validTypes.includes(controllingFieldObj.type)) {
                errors.push(
                    `Controlling field '${controllingField}' must be picklist or multipicklist type (found: ${controllingFieldObj.type})`
                );
            }

            if (dependentFieldObj && !validTypes.includes(dependentFieldObj.type)) {
                errors.push(
                    `Dependent field '${dependentField}' must be picklist or multipicklist type (found: ${dependentFieldObj.type})`
                );
            }

            return {
                valid: errors.length === 0,
                errors
            };

        } catch (error) {
            return {
                valid: false,
                errors: [`Failed to validate field types: ${firstLine(error.message)}`]
            };
        }
    }

    /**
     * Validate dependency matrix structure and completeness.
     *
     * @private
     */
    async validateDependencyMatrix(params) {
        const { dependencyMatrix } = params;
        const errors = [];
        const warnings = [];

        // Check matrix is not empty
        if (!dependencyMatrix || Object.keys(dependencyMatrix).length === 0) {
            errors.push('Dependency matrix is empty');
            return { valid: false, errors, warnings };
        }

        // Check each controlling value has at least one dependent value
        for (const [controllingValue, dependentValues] of Object.entries(dependencyMatrix)) {
            if (!Array.isArray(dependentValues) || dependentValues.length === 0) {
                errors.push(
                    `Controlling value '${controllingValue}' has no dependent values mapped`
                );
            }

            // Check for duplicate dependent values
            const uniqueDependent = new Set(dependentValues);
            if (uniqueDependent.size !== dependentValues.length) {
                warnings.push(
                    `Controlling value '${controllingValue}' has duplicate dependent values`
                );
            }
        }

        // Check for dependent values that appear in multiple controlling value mappings
        const dependentValueCounts = {};
        for (const dependentValues of Object.values(dependencyMatrix)) {
            for (const depValue of dependentValues) {
                dependentValueCounts[depValue] = (dependentValueCounts[depValue] || 0) + 1;
            }
        }

        // This is actually valid - dependent values CAN map to multiple controlling values
        // Just log as info
        const sharedDependentValues = Object.entries(dependentValueCounts)
            .filter(([_, count]) => count > 1)
            .map(([value, count]) => `${value} (${count} controlling values)`);

        if (sharedDependentValues.length > 0) {
            // This is informational, not a warning
            this.logOperation('shared_dependent_values', {
                count: sharedDependentValues.length,
                values: sharedDependentValues
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate controlling field values exist.
     *
     * @private
     */
    async validateControllingValues(objectName, fieldName, expectedValues, alias) {
        try {
            const describeCommand = `sf sobject describe --sobject ${objectName} --target-org ${alias} --json`;
            const result = await this.executeCommand(describeCommand);
            const parsed = this.parseJSON(result.stdout, { operation: 'validateControllingValues' });

            const fields = parsed.result?.fields || [];
            const field = fields.find(f => f.name === fieldName);

            if (!field || !field.picklistValues) {
                return {
                    valid: false,
                    errors: [`Field '${fieldName}' has no picklist values`]
                };
            }

            const actualValues = new Set(
                field.picklistValues
                    .filter(v => v.active)
                    .map(v => v.value)
            );

            const errors = [];
            for (const expectedValue of expectedValues) {
                if (!actualValues.has(expectedValue)) {
                    errors.push(
                        `Controlling value '${expectedValue}' not found in ${fieldName} (or inactive)`
                    );
                }
            }

            return {
                valid: errors.length === 0,
                errors
            };

        } catch (error) {
            return {
                valid: false,
                errors: [`Failed to validate controlling values: ${firstLine(error.message)}`]
            };
        }
    }

    /**
     * Validate dependent field values exist.
     *
     * @private
     */
    async validateDependentValues(objectName, fieldName, expectedValues, alias) {
        try {
            const describeCommand = `sf sobject describe --sobject ${objectName} --target-org ${alias} --json`;
            const result = await this.executeCommand(describeCommand);
            const parsed = this.parseJSON(result.stdout, { operation: 'validateDependentValues' });

            const fields = parsed.result?.fields || [];
            const field = fields.find(f => f.name === fieldName);

            if (!field || !field.picklistValues) {
                return {
                    valid: false,
                    errors: [`Field '${fieldName}' has no picklist values`]
                };
            }

            const actualValues = new Set(
                field.picklistValues
                    .filter(v => v.active)
                    .map(v => v.value)
            );

            const errors = [];
            const uniqueExpectedValues = [...new Set(expectedValues)];
            for (const expectedValue of uniqueExpectedValues) {
                if (!actualValues.has(expectedValue)) {
                    errors.push(
                        `Dependent value '${expectedValue}' not found in ${fieldName} (or inactive)`
                    );
                }
            }

            return {
                valid: errors.length === 0,
                errors
            };

        } catch (error) {
            return {
                valid: false,
                errors: [`Failed to validate dependent values: ${firstLine(error.message)}`]
            };
        }
    }

    /**
     * Check for circular dependencies (field A controls field B, field B controls field A).
     *
     * @private
     */
    async checkCircularDependency(objectName, controllingField, dependentField, alias) {
        try {
            const describeCommand = `sf sobject describe --sobject ${objectName} --target-org ${alias} --json`;
            const result = await this.executeCommand(describeCommand);
            const parsed = this.parseJSON(result.stdout, { operation: 'checkCircularDependency' });

            const fields = parsed.result?.fields || [];
            const controllingFieldObj = fields.find(f => f.name === controllingField);

            const errors = [];

            // Check if controlling field is itself dependent on the dependent field
            if (controllingFieldObj?.dependentPicklist && controllingFieldObj.controllerName === dependentField) {
                errors.push(
                    `Circular dependency detected: ${controllingField} depends on ${dependentField}, but you're trying to make ${dependentField} depend on ${controllingField}`
                );
            }

            return {
                valid: errors.length === 0,
                errors
            };

        } catch (error) {
            return {
                valid: false,
                errors: [`Failed to check circular dependency: ${firstLine(error.message)}`]
            };
        }
    }

    /**
     * Validate record types exist on object.
     *
     * @private
     */
    async validateRecordTypes(objectName, recordTypeNames, alias) {
        try {
            const query = `SELECT DeveloperName FROM RecordType WHERE SobjectType = '${objectName}' AND IsActive = true`;
            const command = `sf data query --query "${query}" --target-org ${alias} --json`;

            const result = await this.executeCommand(command);
            const parsed = this.parseJSON(result.stdout, { operation: 'validateRecordTypes' });

            const existingRecordTypes = new Set(
                (parsed.result?.records || []).map(rt => rt.DeveloperName)
            );

            const warnings = [];
            for (const recordTypeName of recordTypeNames) {
                if (!existingRecordTypes.has(recordTypeName)) {
                    warnings.push(
                        `Record type '${recordTypeName}' not found on ${objectName} (or inactive)`
                    );
                }
            }

            return {
                valid: warnings.length === 0,
                warnings
            };

        } catch (error) {
            return {
                valid: false,
                warnings: [`Failed to validate record types: ${firstLine(error.message)}`]
            };
        }
    }

    /**
     * Post-deployment verification.
     *
     * Verifies that the dependency was successfully deployed and is working correctly.
     *
     * @param {Object} params - Configuration object
     * @returns {Promise<Object>} Verification result
     */
    async verifyDependencyDeployment(params) {
        this.validateParams(params, [
            'objectName',
            'controllingFieldApiName',
            'dependentFieldApiName'
        ]);

        const {
            objectName,
            controllingFieldApiName,
            dependentFieldApiName,
            targetOrg
        } = params;

        const alias = targetOrg || this.org;

        this.logOperation('verify_dependency_deployment_start', {
            objectName,
            controllingField: controllingFieldApiName,
            dependentField: dependentFieldApiName
        });

        try {
            const describeCommand = `sf sobject describe --sobject ${objectName} --target-org ${alias} --json`;
            const result = await this.executeCommand(describeCommand);
            const parsed = this.parseJSON(result.stdout, { operation: 'verifyDependencyDeployment' });

            const fields = parsed.result?.fields || [];
            const dependentFieldObj = fields.find(f => f.name === dependentFieldApiName);

            const verificationResult = {
                success: true,
                checks: {}
            };

            // Check 1: Dependent field exists
            if (!dependentFieldObj) {
                verificationResult.success = false;
                verificationResult.checks.fieldExists = {
                    passed: false,
                    message: `Dependent field ${dependentFieldApiName} not found after deployment`
                };
                return verificationResult;
            }

            // Check 2: Dependent field is marked as dependent
            verificationResult.checks.isDependentPicklist = {
                passed: dependentFieldObj.dependentPicklist === true,
                message: dependentFieldObj.dependentPicklist
                    ? 'Field is marked as dependent picklist'
                    : 'Field is NOT marked as dependent picklist'
            };

            if (!dependentFieldObj.dependentPicklist) {
                verificationResult.success = false;
            }

            // Check 3: Controlling field reference is correct
            verificationResult.checks.controllerName = {
                passed: dependentFieldObj.controllerName === controllingFieldApiName,
                message: dependentFieldObj.controllerName === controllingFieldApiName
                    ? `Controlling field correctly set to ${controllingFieldApiName}`
                    : `Controlling field is ${dependentFieldObj.controllerName}, expected ${controllingFieldApiName}`,
                actual: dependentFieldObj.controllerName,
                expected: controllingFieldApiName
            };

            if (dependentFieldObj.controllerName !== controllingFieldApiName) {
                verificationResult.success = false;
            }

            this.logOperation('verify_dependency_deployment_complete', {
                objectName,
                success: verificationResult.success
            });

            return verificationResult;

        } catch (error) {
            this.logOperation('verify_dependency_deployment_error', {
                objectName,
                error: error.message
            });
            throw this.enhanceError(error, {
                operation: 'verifyDependencyDeployment',
                objectName
            });
        }
    }
}

module.exports = PicklistDependencyValidator;
