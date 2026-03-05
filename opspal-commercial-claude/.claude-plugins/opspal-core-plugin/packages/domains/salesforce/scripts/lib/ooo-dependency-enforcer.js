#!/usr/bin/env node

/**
 * Salesforce Order of Operations - Dependency Enforcer
 *
 * Implements Section E (Dependency Rules) from the Salesforce Order of Operations playbook.
 *
 * Enforcement Rules:
 * 1. Flow/Trigger may not reference unknown fields → Block activation
 * 2. Dependent picklists: set controlling first; validate dependent value allowed
 * 3. Record Types: set RecordTypeId first when requirements differ
 * 4. Master-Detail: parent must exist before child
 * 5. Duplicate/Validation Rules: detect blockers, don't mutate payload
 *
 * Philosophy: Fail fast with explanation rather than silent payload mutation.
 *
 * @see docs/SALESFORCE_ORDER_OF_OPERATIONS.md Section E
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);
const { DataAccessError } = require('./data-access-error');

class OOODependencyEnforcer {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.cache = new Map();
    }

    /**
     * Validate All Dependencies
     *
     * Runs all dependency checks and returns comprehensive report.
     *
     * @param {object} context - Operation context (manifest, metadata, etc.)
     * @returns {Promise<object>} Validation result with violations
     */
    async validateAll(context) {
        this.log('🔍 Running comprehensive dependency validation...');

        const violations = [];

        // Rule 1: Flow/Trigger Field References
        if (context.flows || context.triggers) {
            this.log('  Checking Rule 1: Flow/Trigger field references...');
            const flowViolations = await this.checkFlowFieldReferences(context);
            violations.push(...flowViolations);
        }

        // Rule 2: Dependent Picklists
        if (context.picklistWrites) {
            this.log('  Checking Rule 2: Dependent picklist order...');
            const picklistViolations = await this.validatePicklistDependencies(context);
            violations.push(...picklistViolations);
        }

        // Rule 3: Record Type Requirements
        if (context.recordTypeWrites) {
            this.log('  Checking Rule 3: Record type write order...');
            const rtViolations = await this.enforceRecordTypeWriteOrder(context);
            violations.push(...rtViolations);
        }

        // Rule 4: Master-Detail Parent Existence
        if (context.masterDetailFields) {
            this.log('  Checking Rule 4: Master-detail parent existence...');
            const mdViolations = await this.validateMasterDetailParent(context);
            violations.push(...mdViolations);
        }

        // Rule 5: Blocking Rules Detection
        if (context.dataWrites) {
            this.log('  Checking Rule 5: Blocking validation/duplicate rules...');
            const ruleViolations = await this.detectBlockingRules(context);
            violations.push(...ruleViolations);
        }

        const result = {
            passed: violations.length === 0,
            violations,
            summary: this.generateSummary(violations)
        };

        if (violations.length > 0) {
            this.log(`❌ Dependency validation failed: ${violations.length} violations`);
        } else {
            this.log('✅ Dependency validation passed');
        }

        return result;
    }

    /**
     * Rule 1: Check Flow/Trigger Field References
     *
     * Ensures all fields referenced in flows/triggers exist before activation.
     * Blocks activation until all referenced fields are verified.
     */
    async checkFlowFieldReferences(context) {
        const violations = [];

        const flows = context.flows || [];
        for (const flow of flows) {
            try {
                // Parse flow metadata to extract field references
                const fieldRefs = await this.extractFlowFieldReferences(flow);

                for (const fieldRef of fieldRefs) {
                    const exists = await this.verifyFieldExists(fieldRef.object, fieldRef.field);

                    if (!exists) {
                        violations.push({
                            rule: 'FLOW_FIELD_REFERENCE',
                            severity: 'CRITICAL',
                            flow: flow.name,
                            object: fieldRef.object,
                            field: fieldRef.field,
                            message: `Flow "${flow.name}" references unknown field ${fieldRef.object}.${fieldRef.field}`,
                            action: 'BLOCK_ACTIVATION',
                            remediation: `Deploy field ${fieldRef.object}.${fieldRef.field} before activating flow`
                        });
                    }
                }
            } catch (error) {
                violations.push({
                    rule: 'FLOW_FIELD_REFERENCE',
                    severity: 'ERROR',
                    flow: flow.name,
                    message: `Failed to parse flow ${flow.name}: ${error.message}`,
                    action: 'MANUAL_REVIEW'
                });
            }
        }

        return violations;
    }

    /**
     * Rule 2: Validate Picklist Dependencies
     *
     * Ensures controlling picklist is set before dependent picklist.
     * Validates dependent value is allowed for the controlling value.
     */
    async validatePicklistDependencies(context) {
        const violations = [];

        const picklistWrites = context.picklistWrites || [];
        for (const write of picklistWrites) {
            try {
                const { object, controllingField, dependentField, controllingValue, dependentValue } = write;

                // Get picklist dependency metadata
                const dependency = await this.getPicklistDependency(object, dependentField);

                if (dependency && dependency.controllingField === controllingField) {
                    // Check if controlling value is set first in write order
                    if (!write.controllingSetFirst) {
                        violations.push({
                            rule: 'DEPENDENT_PICKLIST_ORDER',
                            severity: 'HIGH',
                            object,
                            controllingField,
                            dependentField,
                            message: `Controlling field ${controllingField} must be set before dependent field ${dependentField}`,
                            action: 'REORDER_FIELDS',
                            remediation: `Set ${controllingField} = "${controllingValue}" before ${dependentField}`
                        });
                    }

                    // Validate dependent value is allowed
                    const allowedValues = await this.getAllowedDependentValues(
                        object,
                        dependentField,
                        controllingValue
                    );

                    if (!allowedValues.includes(dependentValue)) {
                        violations.push({
                            rule: 'DEPENDENT_PICKLIST_VALUE',
                            severity: 'CRITICAL',
                            object,
                            dependentField,
                            controllingValue,
                            dependentValue,
                            allowedValues,
                            message: `Value "${dependentValue}" not allowed for ${dependentField} when ${controllingField} = "${controllingValue}"`,
                            action: 'BLOCK_WRITE',
                            remediation: `Use one of: ${allowedValues.join(', ')}`
                        });
                    }
                }
            } catch (error) {
                violations.push({
                    rule: 'DEPENDENT_PICKLIST',
                    severity: 'ERROR',
                    message: `Failed to validate picklist dependency: ${error.message}`,
                    action: 'MANUAL_REVIEW'
                });
            }
        }

        return violations;
    }

    /**
     * Rule 3: Enforce Record Type Write Order
     *
     * When requirements differ by RT, RecordTypeId must be set FIRST.
     * This ensures validation rules and field requirements are correct.
     */
    async enforceRecordTypeWriteOrder(context) {
        const violations = [];

        const rtWrites = context.recordTypeWrites || [];
        for (const write of rtWrites) {
            try {
                const { object, recordTypeId, fields } = write;

                // Get record type metadata
                const recordType = await this.getRecordType(object, recordTypeId);

                if (!recordType) {
                    violations.push({
                        rule: 'RECORD_TYPE_EXISTENCE',
                        severity: 'CRITICAL',
                        object,
                        recordTypeId,
                        message: `Record Type ${recordTypeId} not found for ${object}`,
                        action: 'BLOCK_WRITE',
                        remediation: 'Deploy record type before writing records'
                    });
                    continue;
                }

                // Check if RecordTypeId is set before other fields
                if (!write.recordTypeSetFirst) {
                    violations.push({
                        rule: 'RECORD_TYPE_ORDER',
                        severity: 'HIGH',
                        object,
                        recordType: recordType.Name,
                        message: `RecordTypeId must be set before other fields to ensure correct validation`,
                        action: 'REORDER_FIELDS',
                        remediation: 'Set RecordTypeId first in payload'
                    });
                }

                // Validate fields are valid for this record type
                for (const field of fields) {
                    const isValid = await this.validateFieldForRecordType(object, field, recordTypeId);

                    if (!isValid) {
                        violations.push({
                            rule: 'RECORD_TYPE_FIELD',
                            severity: 'HIGH',
                            object,
                            field,
                            recordType: recordType.Name,
                            message: `Field ${field} may not be available or required for record type ${recordType.Name}`,
                            action: 'VERIFY_LAYOUT',
                            remediation: 'Check page layout and field requirements for this record type'
                        });
                    }
                }
            } catch (error) {
                violations.push({
                    rule: 'RECORD_TYPE',
                    severity: 'ERROR',
                    message: `Failed to validate record type: ${error.message}`,
                    action: 'MANUAL_REVIEW'
                });
            }
        }

        return violations;
    }

    /**
     * Rule 4: Validate Master-Detail Parent Existence
     *
     * Parent record must exist before child.
     * If deploying new MD field, migration plan required.
     */
    async validateMasterDetailParent(context) {
        const violations = [];

        const mdFields = context.masterDetailFields || [];
        for (const mdField of mdFields) {
            try {
                const { childObject, fieldName, parentObject, parentId, isNew } = mdField;

                if (isNew) {
                    // New MD field deployment requires migration plan
                    violations.push({
                        rule: 'MASTER_DETAIL_NEW',
                        severity: 'HIGH',
                        childObject,
                        fieldName,
                        parentObject,
                        message: `New Master-Detail field ${childObject}.${fieldName} requires data migration plan`,
                        action: 'REQUIRE_MIGRATION_PLAN',
                        remediation: 'Provide migration strategy for existing child records'
                    });
                } else if (parentId) {
                    // Verify parent record exists
                    const parentExists = await this.verifyRecordExists(parentObject, parentId);

                    if (!parentExists) {
                        violations.push({
                            rule: 'MASTER_DETAIL_PARENT',
                            severity: 'CRITICAL',
                            childObject,
                            parentObject,
                            parentId,
                            message: `Parent record ${parentObject}.${parentId} does not exist`,
                            action: 'BLOCK_WRITE',
                            remediation: `Create parent record in ${parentObject} before child`
                        });
                    }
                } else {
                    // Parent ID not provided
                    violations.push({
                        rule: 'MASTER_DETAIL_PARENT',
                        severity: 'CRITICAL',
                        childObject,
                        fieldName,
                        parentObject,
                        message: `Parent ID required for Master-Detail field ${fieldName}`,
                        action: 'REQUIRE_PARENT_ID',
                        remediation: `Provide parent ${parentObject} ID in payload`
                    });
                }
            } catch (error) {
                violations.push({
                    rule: 'MASTER_DETAIL',
                    severity: 'ERROR',
                    message: `Failed to validate master-detail: ${error.message}`,
                    action: 'MANUAL_REVIEW'
                });
            }
        }

        return violations;
    }

    /**
     * Rule 5: Detect Blocking Rules
     *
     * Identifies active validation rules and duplicate rules that would block writes.
     * Fails with explanation (rule name + condition) rather than mutating payload.
     */
    async detectBlockingRules(context) {
        const violations = [];

        const dataWrites = context.dataWrites || [];
        for (const write of dataWrites) {
            try {
                const { object, payload } = write;

                // Check validation rules
                const validationRules = await this.getActiveValidationRules(object);
                for (const rule of validationRules) {
                    // Evaluate if this rule would block the write
                    // (This is a simplified check - full evaluation requires formula parsing)
                    const wouldBlock = await this.evaluateValidationRule(rule, payload);

                    if (wouldBlock) {
                        violations.push({
                            rule: 'VALIDATION_RULE_BLOCK',
                            severity: 'CRITICAL',
                            object,
                            validationRule: rule.ValidationName,
                            condition: rule.formula || 'N/A',
                            errorMessage: rule.ErrorMessage,
                            message: `Validation rule "${rule.ValidationName}" would block this write`,
                            action: 'BLOCK_WRITE',
                            remediation: `Modify payload to satisfy: ${rule.ErrorMessage}`
                        });
                    }
                }

                // Check duplicate rules
                const duplicateRules = await this.getActiveDuplicateRules(object);
                for (const rule of duplicateRules) {
                    const wouldBlock = await this.evaluateDuplicateRule(rule, payload);

                    if (wouldBlock) {
                        violations.push({
                            rule: 'DUPLICATE_RULE_BLOCK',
                            severity: 'HIGH',
                            object,
                            duplicateRule: rule.DeveloperName,
                            matchingFields: rule.matchingFields,
                            message: `Duplicate rule "${rule.DeveloperName}" would block this write`,
                            action: 'BLOCK_WRITE',
                            remediation: 'Resolve duplicate or use AllowSave=true'
                        });
                    }
                }
            } catch (error) {
                violations.push({
                    rule: 'BLOCKING_RULES',
                    severity: 'ERROR',
                    message: `Failed to detect blocking rules: ${error.message}`,
                    action: 'MANUAL_REVIEW'
                });
            }
        }

        return violations;
    }

    // ========== Helper Methods ==========

    /**
     * Extract field references from flow metadata
     * @throws {DataAccessError} Feature not yet implemented
     */
    async extractFlowFieldReferences(flow) {
        throw new DataAccessError(
            'FlowFieldExtraction',
            'Flow field reference extraction not yet implemented',
            {
                feature: 'extractFlowFieldReferences',
                status: 'not_implemented',
                workaround: 'Manual field validation required - verify all flow field references exist in org before deployment',
                tracking: 'https://github.com/RevPalSFDC/opspal-internal-marketplace/issues/TBD',
                requiredFor: 'Rule 1: Flow/Trigger field reference validation'
            }
        );
    }

    async verifyFieldExists(objectName, fieldName) {
        const cacheKey = `field_${objectName}_${fieldName}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const query = `
                SELECT QualifiedApiName
                FROM FieldDefinition
                WHERE EntityDefinition.QualifiedApiName = '${objectName}'
                AND QualifiedApiName = '${fieldName}'
            `;

            const { stdout } = await execAsync(
                `sf data query --query "${query.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const result = JSON.parse(stdout);
            const exists = (result.result?.records?.length || 0) > 0;

            this.cache.set(cacheKey, exists);
            return exists;

        } catch (error) {
            this.log(`Warning: Failed to verify field ${objectName}.${fieldName}: ${error.message}`);
            return false;
        }
    }

    /**
     * Get picklist dependency metadata
     * @throws {DataAccessError} Feature not yet implemented
     */
    async getPicklistDependency(objectName, fieldName) {
        throw new DataAccessError(
            'PicklistDependencyQuery',
            'Picklist dependency metadata queries not yet implemented',
            {
                feature: 'getPicklistDependency',
                status: 'not_implemented',
                object: objectName,
                field: fieldName,
                workaround: 'Manual picklist dependency validation required - check controlling/dependent field relationships in org',
                tracking: 'https://github.com/RevPalSFDC/opspal-internal-marketplace/issues/TBD',
                requiredFor: 'Rule 2: Dependent picklist write order validation'
            }
        );
    }

    /**
     * Get allowed dependent picklist values for controlling value
     * @throws {DataAccessError} Feature not yet implemented
     */
    async getAllowedDependentValues(objectName, fieldName, controllingValue) {
        throw new DataAccessError(
            'DependentValueQuery',
            'Dependent picklist value queries not yet implemented',
            {
                feature: 'getAllowedDependentValues',
                status: 'not_implemented',
                object: objectName,
                field: fieldName,
                controllingValue: controllingValue,
                workaround: 'Manual validation required - check picklist value matrix in Setup',
                tracking: 'https://github.com/RevPalSFDC/opspal-internal-marketplace/issues/TBD',
                requiredFor: 'Rule 2: Dependent picklist value validation'
            }
        );
    }

    async getRecordType(objectName, recordTypeId) {
        try {
            const query = `
                SELECT Id, DeveloperName, Name
                FROM RecordType
                WHERE SobjectType = '${objectName}'
                AND Id = '${recordTypeId}'
            `;

            const { stdout } = await execAsync(
                `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const result = JSON.parse(stdout);
            return result.result?.records?.[0] || null;

        } catch (error) {
            return null;
        }
    }

    /**
     * Validate field is on page layout for record type
     * @throws {DataAccessError} Feature not yet implemented
     */
    async validateFieldForRecordType(objectName, fieldName, recordTypeId) {
        throw new DataAccessError(
            'RecordTypeFieldValidation',
            'Record type field layout validation not yet implemented',
            {
                feature: 'validateFieldForRecordType',
                status: 'not_implemented',
                object: objectName,
                field: fieldName,
                recordTypeId: recordTypeId,
                workaround: 'Manual validation required - check page layouts in Setup for this record type',
                tracking: 'https://github.com/RevPalSFDC/opspal-internal-marketplace/issues/TBD',
                requiredFor: 'Rule 3: Record type field requirement validation'
            }
        );
    }

    async verifyRecordExists(objectName, recordId) {
        try {
            const query = `SELECT Id FROM ${objectName} WHERE Id = '${recordId}' LIMIT 1`;

            const { stdout } = await execAsync(
                `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const result = JSON.parse(stdout);
            return (result.result?.records?.length || 0) > 0;

        } catch (error) {
            return false;
        }
    }

    async getActiveValidationRules(objectName) {
        const cacheKey = `validation_rules_${objectName}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const query = `
                SELECT Id, ValidationName, Active, ErrorDisplayField, ErrorMessage
                FROM ValidationRule
                WHERE EntityDefinition.QualifiedApiName = '${objectName}'
                AND Active = true
            `;

            const { stdout } = await execAsync(
                `sf data query --query "${query.replace(/\n/g, ' ')}" --use-tooling-api --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const result = JSON.parse(stdout);
            const rules = result.result?.records || [];

            this.cache.set(cacheKey, rules);
            return rules;

        } catch (error) {
            this.log(`Warning: Failed to get validation rules: ${error.message}`);
            return [];
        }
    }

    /**
     * Evaluate validation rule formula against payload
     * @throws {DataAccessError} Feature not yet implemented
     */
    async evaluateValidationRule(rule, payload) {
        throw new DataAccessError(
            'ValidationRuleEvaluation',
            'Validation rule formula evaluation not yet implemented',
            {
                feature: 'evaluateValidationRule',
                status: 'not_implemented',
                rule: rule.ValidationName,
                complexity: 'High - requires formula parser and evaluation engine',
                workaround: 'Manual validation required - test payload against validation rules in sandbox',
                tracking: 'https://github.com/RevPalSFDC/opspal-internal-marketplace/issues/TBD',
                requiredFor: 'Rule 5: Blocking validation rule detection',
                estimatedEffort: '12-16 hours'
            }
        );
    }

    /**
     * Get active duplicate rules for object
     * @throws {DataAccessError} Feature not yet implemented
     */
    async getActiveDuplicateRules(objectName) {
        throw new DataAccessError(
            'DuplicateRuleQuery',
            'Duplicate rule metadata queries not yet implemented',
            {
                feature: 'getActiveDuplicateRules',
                status: 'not_implemented',
                object: objectName,
                workaround: 'Manual validation required - check active duplicate rules in Setup',
                tracking: 'https://github.com/RevPalSFDC/opspal-internal-marketplace/issues/TBD',
                requiredFor: 'Rule 5: Blocking duplicate rule detection'
            }
        );
    }

    /**
     * Evaluate if payload would trigger duplicate rule
     * @throws {DataAccessError} Feature not yet implemented
     */
    async evaluateDuplicateRule(rule, payload) {
        throw new DataAccessError(
            'DuplicateRuleEvaluation',
            'Duplicate rule evaluation not yet implemented',
            {
                feature: 'evaluateDuplicateRule',
                status: 'not_implemented',
                rule: rule.DeveloperName || 'Unknown',
                workaround: 'Manual validation required - test payload for duplicates in sandbox',
                tracking: 'https://github.com/RevPalSFDC/opspal-internal-marketplace/issues/TBD',
                requiredFor: 'Rule 5: Duplicate rule triggering detection'
            }
        );
    }

    generateSummary(violations) {
        const summary = {
            total: violations.length,
            bySeverity: {},
            byRule: {},
            blocking: violations.filter(v => v.action === 'BLOCK_WRITE' || v.action === 'BLOCK_ACTIVATION').length
        };

        for (const violation of violations) {
            summary.bySeverity[violation.severity] = (summary.bySeverity[violation.severity] || 0) + 1;
            summary.byRule[violation.rule] = (summary.byRule[violation.rule] || 0) + 1;
        }

        return summary;
    }

    log(message) {
        if (this.verbose) {
            console.log(message);
        }
    }
}

// CLI Support
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log(`
Salesforce Order of Operations - Dependency Enforcer

Usage:
  node ooo-dependency-enforcer.js validate <manifest> <org> [options]

Commands:
  validate    Validate all dependencies from manifest/context

Options:
  --context <json>    Operation context as JSON file
  --verbose           Show detailed logging

Example:
  node ooo-dependency-enforcer.js validate package.xml myorg \\
    --context context.json \\
    --verbose
        `);
        process.exit(0);
    }

    async function runCLI() {
        if (command !== 'validate') {
            console.error(`Unknown command: ${command}`);
            process.exit(1);
        }

        const manifest = args[1];
        const org = args[2];

        if (!manifest || !org) {
            console.error('Error: Manifest and org are required');
            process.exit(1);
        }

        const options = {
            verbose: args.includes('--verbose')
        };

        const contextIndex = args.indexOf('--context');
        let context = {};
        if (contextIndex !== -1 && args[contextIndex + 1]) {
            const contextFile = args[contextIndex + 1];
            context = JSON.parse(await fs.readFile(contextFile, 'utf8'));
        }

        const enforcer = new OOODependencyEnforcer(org, options);

        try {
            const result = await enforcer.validateAll(context);
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.passed ? 0 : 1);

        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    }

    runCLI();
}

module.exports = { OOODependencyEnforcer };
