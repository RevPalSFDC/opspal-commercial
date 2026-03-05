#!/usr/bin/env node

/**
 * Field Type Conversion Validator for Salesforce
 *
 * Validates field type changes to prevent deployment failures:
 * - Blocks incompatible type conversions
 * - Suggests safe conversion paths
 * - Validates picklist value migrations
 * - Checks data loss risk
 *
 * @version 1.0.0
 * @date 2025-12-19
 *
 * Addresses: schema/parse cohort (18 reflections, $52K ROI)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class FieldTypeConversionValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.orgAlias = options.orgAlias || process.env.SALESFORCE_ORG_ALIAS || process.env.SF_TARGET_ORG;

        // Field type conversion compatibility matrix
        // true = allowed, false = blocked, 'warn' = allowed with warning
        this.conversionMatrix = {
            'Text': {
                'Text': true,
                'TextArea': true,
                'LongTextArea': true,
                'Email': 'warn',       // May fail if data doesn't match pattern
                'Phone': 'warn',
                'URL': 'warn',
                'Picklist': 'warn',    // Requires value mapping
                'Number': false,       // Blocked - data loss risk
                'Currency': false,
                'Percent': false,
                'Date': false,
                'DateTime': false,
                'Checkbox': false,
                'Formula': false,      // CRITICAL: Can never convert TO formula
                'Lookup': false,
                'MasterDetail': false,
                'AutoNumber': false
            },
            'TextArea': {
                'Text': 'warn',        // May truncate
                'TextArea': true,
                'LongTextArea': true,
                'RichText': true,
                'Formula': false,
                'Number': false,
                'Picklist': false
            },
            'LongTextArea': {
                'Text': 'warn',        // Will truncate
                'TextArea': 'warn',    // Will truncate
                'LongTextArea': true,
                'RichText': true,
                'Formula': false,
                'Number': false
            },
            'Number': {
                'Number': true,
                'Currency': true,
                'Percent': true,
                'Text': 'warn',        // Loss of numeric operations
                'Formula': false,
                'Picklist': false,
                'Checkbox': false
            },
            'Currency': {
                'Currency': true,
                'Number': true,
                'Percent': 'warn',
                'Text': 'warn',
                'Formula': false
            },
            'Percent': {
                'Percent': true,
                'Number': true,
                'Currency': 'warn',
                'Text': 'warn',
                'Formula': false
            },
            'Date': {
                'Date': true,
                'DateTime': true,
                'Text': 'warn',
                'Formula': false,
                'Number': false
            },
            'DateTime': {
                'DateTime': true,
                'Date': 'warn',        // Loss of time component
                'Text': 'warn',
                'Formula': false,
                'Number': false
            },
            'Checkbox': {
                'Checkbox': true,
                'Picklist': 'warn',    // Requires value mapping
                'Text': 'warn',
                'Formula': false,
                'Number': false
            },
            'Picklist': {
                'Picklist': true,
                'MultiselectPicklist': 'warn',
                'Text': 'warn',
                'Formula': false,
                'Number': false,
                'Checkbox': false
            },
            'MultiselectPicklist': {
                'MultiselectPicklist': true,
                'Picklist': 'warn',    // Data loss if multiple values
                'Text': 'warn',
                'Formula': false,
                'LongTextArea': 'warn'
            },
            'Lookup': {
                'Lookup': true,
                'MasterDetail': false, // Requires special handling
                'Text': false,
                'Formula': false
            },
            'MasterDetail': {
                'MasterDetail': true,
                'Lookup': false,       // Cannot convert without data migration
                'Text': false,
                'Formula': false
            },
            'Formula': {
                // Formula fields CANNOT be converted to anything
                'Text': false,
                'Number': false,
                'Currency': false,
                'Date': false,
                'DateTime': false,
                'Checkbox': false,
                'Picklist': false,
                'Formula': true        // Only reconfiguration allowed
            },
            'AutoNumber': {
                // AutoNumber cannot be converted
                'Text': false,
                'Number': false,
                'AutoNumber': true
            },
            'Email': {
                'Email': true,
                'Text': true,
                'Formula': false
            },
            'Phone': {
                'Phone': true,
                'Text': true,
                'Formula': false
            },
            'URL': {
                'URL': true,
                'Text': true,
                'LongTextArea': true,
                'Formula': false
            }
        };

        // Blocked conversions with specific error messages
        this.blockedConversions = {
            'ANY->Formula': 'Cannot convert any field type to Formula. Create a new Formula field instead.',
            'Formula->ANY': 'Formula fields cannot be converted. Delete and recreate as new type.',
            'AutoNumber->ANY': 'AutoNumber fields cannot be converted.',
            'MasterDetail->Lookup': 'Cannot directly convert Master-Detail to Lookup. Requires data migration.',
            'Lookup->MasterDetail': 'Cannot convert Lookup to Master-Detail without ensuring all records have parent.',
            'Text->Number': 'Cannot convert Text to Number due to potential data loss.',
            'TextArea->Number': 'Cannot convert TextArea to Number.',
            'Checkbox->Number': 'Cannot convert Checkbox to Number.'
        };

        // Data loss risk matrix
        this.dataLossRisk = {
            'LongTextArea->Text': 'HIGH',
            'LongTextArea->TextArea': 'MEDIUM',
            'TextArea->Text': 'MEDIUM',
            'DateTime->Date': 'LOW',
            'MultiselectPicklist->Picklist': 'HIGH',
            'Number->Text': 'LOW',
            'Picklist->Checkbox': 'HIGH'
        };
    }

    /**
     * Validate a field type conversion
     * @param {Object} conversion - Conversion details
     * @returns {Object} Validation result
     */
    validateConversion(conversion) {
        const result = {
            valid: true,
            allowed: true,
            errors: [],
            warnings: [],
            suggestions: [],
            dataLossRisk: 'NONE',
            requiresDataMigration: false
        };

        const { objectName, fieldName, fromType, toType } = conversion;

        // Normalize type names
        const from = this._normalizeTypeName(fromType);
        const to = this._normalizeTypeName(toType);

        // Check if same type (always OK)
        if (from === to) {
            return result;
        }

        // Check blocked conversion patterns
        const blockedKey = `${from}->${to}`;
        const anyToFormula = to === 'Formula';
        const formulaToAny = from === 'Formula';

        if (anyToFormula) {
            result.valid = false;
            result.allowed = false;
            result.errors.push(this.blockedConversions['ANY->Formula']);
            result.suggestions.push(
                `Create a new Formula field "${fieldName}_Formula" instead of converting`
            );
            return result;
        }

        if (formulaToAny) {
            result.valid = false;
            result.allowed = false;
            result.errors.push(this.blockedConversions['Formula->ANY']);
            result.suggestions.push(
                `Delete the Formula field and create a new ${to} field`
            );
            return result;
        }

        if (this.blockedConversions[blockedKey]) {
            result.valid = false;
            result.allowed = false;
            result.errors.push(this.blockedConversions[blockedKey]);
            return result;
        }

        // Check conversion matrix
        const matrix = this.conversionMatrix[from];
        if (!matrix) {
            result.warnings.push(`Unknown source type: ${from}. Cannot validate conversion.`);
            return result;
        }

        const status = matrix[to];

        if (status === false) {
            result.valid = false;
            result.allowed = false;
            result.errors.push(
                `Conversion from ${from} to ${to} is not allowed by Salesforce`
            );
            result.suggestions.push(
                ...this._suggestAlternativeConversion(from, to)
            );
            return result;
        }

        if (status === 'warn') {
            result.warnings.push(
                `Conversion from ${from} to ${to} is allowed but requires careful validation`
            );
        }

        // Check data loss risk
        const riskKey = `${from}->${to}`;
        if (this.dataLossRisk[riskKey]) {
            result.dataLossRisk = this.dataLossRisk[riskKey];
            if (result.dataLossRisk === 'HIGH') {
                result.warnings.push(
                    `HIGH data loss risk: Converting ${from} to ${to} may result in data loss`
                );
                result.requiresDataMigration = true;
            } else if (result.dataLossRisk === 'MEDIUM') {
                result.warnings.push(
                    `MEDIUM data loss risk: Some data may be truncated or modified`
                );
            }
        }

        // Special validations
        if (to === 'Picklist' || to === 'MultiselectPicklist') {
            result.suggestions.push(
                'Ensure picklist values cover all existing data values'
            );
            result.requiresDataMigration = true;
        }

        if (from === 'Lookup' || from === 'MasterDetail') {
            result.warnings.push(
                'Changing relationship fields may affect reports, workflows, and processes'
            );
        }

        return result;
    }

    /**
     * Query current field metadata from Salesforce
     * @param {string} objectName - API name of object
     * @param {string} fieldName - API name of field
     * @returns {Object} Field metadata
     */
    async getFieldMetadata(objectName, fieldName) {
        if (!this.orgAlias) {
            throw new Error('No Salesforce org alias configured. Set SALESFORCE_ORG_ALIAS environment variable.');
        }

        const result = {
            success: false,
            field: null,
            error: null
        };

        try {
            // Query field using Tooling API
            const query = `SELECT Id, DeveloperName, DataType, Length, Precision, Scale, ReferenceTo,
                           RelationshipName, IsCustom, NamespacePrefix, FullName
                           FROM CustomField
                           WHERE TableEnumOrId = '${objectName}'
                           AND DeveloperName = '${fieldName.replace('__c', '')}'`;

            const cmd = `sf data query --query "${query}" --use-tooling-api --target-org "${this.orgAlias}" --json`;

            const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            const response = JSON.parse(output);

            if (response.status === 0 && response.result?.records?.length > 0) {
                result.success = true;
                result.field = response.result.records[0];
            } else {
                // Try describe approach for standard fields
                const describeCmd = `sf sobject describe "${objectName}" --target-org "${this.orgAlias}" --json`;
                const describeOutput = execSync(describeCmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
                const describeResponse = JSON.parse(describeOutput);

                if (describeResponse.status === 0) {
                    const field = describeResponse.result.fields.find(f =>
                        f.name === fieldName || f.name === `${fieldName}__c`
                    );

                    if (field) {
                        result.success = true;
                        result.field = {
                            DeveloperName: field.name,
                            DataType: field.type,
                            Length: field.length,
                            Precision: field.precision,
                            Scale: field.scale,
                            ReferenceTo: field.referenceTo,
                            IsCustom: field.custom
                        };
                    }
                }
            }

            if (!result.success) {
                result.error = `Field ${fieldName} not found on ${objectName}`;
            }

        } catch (error) {
            result.error = error.message;
        }

        return result;
    }

    /**
     * Validate picklist value migration
     * @param {Object} migration - Migration details
     * @returns {Object} Validation result
     */
    validatePicklistMigration(migration) {
        const result = {
            valid: true,
            errors: [],
            warnings: [],
            unmappedValues: [],
            suggestions: []
        };

        const { currentValues, newValues, valueMapping } = migration;

        // Check all current values are mapped
        for (const current of currentValues || []) {
            const mapped = valueMapping?.[current] || newValues?.includes(current);

            if (!mapped) {
                result.unmappedValues.push(current);
            }
        }

        if (result.unmappedValues.length > 0) {
            result.valid = false;
            result.errors.push(
                `${result.unmappedValues.length} existing value(s) have no mapping: ${result.unmappedValues.join(', ')}`
            );
            result.suggestions.push(
                'Create value mapping for all existing values before deployment'
            );
        }

        // Check for potential issues
        if (newValues && currentValues) {
            const removedValues = currentValues.filter(v => !newValues.includes(v) && !valueMapping?.[v]);
            if (removedValues.length > 0) {
                result.warnings.push(
                    `Values being removed: ${removedValues.join(', ')}. Records with these values will need migration.`
                );
            }
        }

        return result;
    }

    /**
     * Generate safe conversion path for blocked conversions
     * @param {string} fromType - Source type
     * @param {string} toType - Target type
     * @returns {Array} Suggested conversion steps
     */
    getSafeConversionPath(fromType, toType) {
        const steps = [];
        const from = this._normalizeTypeName(fromType);
        const to = this._normalizeTypeName(toType);

        // Check if direct conversion is allowed
        const matrix = this.conversionMatrix[from];
        if (matrix && matrix[to] === true) {
            return [{
                step: 1,
                action: `Direct conversion from ${from} to ${to} is allowed`,
                risk: 'LOW'
            }];
        }

        // Suggest multi-step paths
        if (from === 'Formula') {
            steps.push({
                step: 1,
                action: `Create new ${to} field with desired name + "_New"`,
                risk: 'LOW'
            });
            steps.push({
                step: 2,
                action: `Populate new field using data migration or Apex`,
                risk: 'MEDIUM'
            });
            steps.push({
                step: 3,
                action: `Update all references (reports, workflows, etc.)`,
                risk: 'HIGH'
            });
            steps.push({
                step: 4,
                action: `Delete old Formula field`,
                risk: 'LOW'
            });
            steps.push({
                step: 5,
                action: `Rename new field (remove "_New" suffix)`,
                risk: 'LOW'
            });
        } else if (to === 'Formula') {
            steps.push({
                step: 1,
                action: `Create new Formula field with desired calculation`,
                risk: 'LOW'
            });
            steps.push({
                step: 2,
                action: `Update reports and visualizations to use new field`,
                risk: 'MEDIUM'
            });
            steps.push({
                step: 3,
                action: `Delete old ${from} field (optional, if no longer needed)`,
                risk: 'LOW'
            });
        } else if (from === 'Text' && ['Number', 'Currency', 'Percent'].includes(to)) {
            steps.push({
                step: 1,
                action: `Create new ${to} field`,
                risk: 'LOW'
            });
            steps.push({
                step: 2,
                action: `Validate existing Text data can be converted to ${to}`,
                risk: 'MEDIUM',
                query: `SELECT ${from} FROM ObjectName WHERE ${from} != null LIMIT 100`
            });
            steps.push({
                step: 3,
                action: `Migrate data using Apex or Data Loader with transformation`,
                risk: 'MEDIUM'
            });
            steps.push({
                step: 4,
                action: `Update field references`,
                risk: 'HIGH'
            });
        } else {
            // Generic path
            steps.push({
                step: 1,
                action: `Create intermediate field if direct conversion blocked`,
                risk: 'LOW'
            });
            steps.push({
                step: 2,
                action: `Migrate data preserving as much as possible`,
                risk: 'MEDIUM'
            });
            steps.push({
                step: 3,
                action: `Validate migrated data`,
                risk: 'LOW'
            });
            steps.push({
                step: 4,
                action: `Update all downstream references`,
                risk: 'HIGH'
            });
        }

        return steps;
    }

    // === Private Helper Methods ===

    _normalizeTypeName(type) {
        if (!type) return 'Unknown';

        const normalizations = {
            'string': 'Text',
            'textarea': 'TextArea',
            'longtextarea': 'LongTextArea',
            'richtextarea': 'RichText',
            'double': 'Number',
            'int': 'Number',
            'integer': 'Number',
            'boolean': 'Checkbox',
            'reference': 'Lookup',
            'masterdetail': 'MasterDetail',
            'id': 'Id',
            'datetime': 'DateTime',
            'multipicklist': 'MultiselectPicklist'
        };

        const lower = type.toLowerCase().replace(/[_\s]/g, '');
        return normalizations[lower] || type;
    }

    _suggestAlternativeConversion(from, to) {
        const suggestions = [];

        // Find possible intermediate types
        const fromMatrix = this.conversionMatrix[from];
        if (!fromMatrix) return suggestions;

        for (const [intermediate, fromStatus] of Object.entries(fromMatrix)) {
            if (fromStatus === true || fromStatus === 'warn') {
                const intermediateMatrix = this.conversionMatrix[intermediate];
                if (intermediateMatrix && (intermediateMatrix[to] === true || intermediateMatrix[to] === 'warn')) {
                    suggestions.push(
                        `Consider converting ${from} → ${intermediate} → ${to} (two-step conversion)`
                    );
                }
            }
        }

        if (suggestions.length === 0) {
            suggestions.push(
                `Create a new ${to} field and migrate data using Apex or Data Loader`
            );
        }

        return suggestions;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const validator = new FieldTypeConversionValidator({ verbose: true });

    switch (command) {
        case 'validate':
            const fromType = args[1];
            const toType = args[2];
            if (!fromType || !toType) {
                console.error('Usage: field-type-conversion-validator validate <fromType> <toType>');
                process.exit(1);
            }
            const result = validator.validateConversion({
                fromType,
                toType
            });
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.valid ? 0 : 1);
            break;

        case 'get-path':
            const pathFrom = args[1];
            const pathTo = args[2];
            if (!pathFrom || !pathTo) {
                console.error('Usage: field-type-conversion-validator get-path <fromType> <toType>');
                process.exit(1);
            }
            const path = validator.getSafeConversionPath(pathFrom, pathTo);
            console.log(JSON.stringify(path, null, 2));
            break;

        case 'query-field':
            const objectName = args[1];
            const fieldName = args[2];
            if (!objectName || !fieldName) {
                console.error('Usage: field-type-conversion-validator query-field <object> <field>');
                process.exit(1);
            }
            validator.getFieldMetadata(objectName, fieldName)
                .then(result => {
                    console.log(JSON.stringify(result, null, 2));
                    process.exit(result.success ? 0 : 1);
                })
                .catch(err => {
                    console.error('Error:', err.message);
                    process.exit(1);
                });
            break;

        case 'matrix':
            // Print the full conversion matrix
            console.log('\nField Type Conversion Matrix\n');
            console.log('Legend: ✓ = allowed, ✗ = blocked, ⚠ = allowed with warning\n');

            const types = Object.keys(validator.conversionMatrix).slice(0, 10);
            console.log('From\\To'.padEnd(12) + types.map(t => t.substring(0, 8).padEnd(10)).join(''));
            console.log('-'.repeat(12 + types.length * 10));

            for (const from of types) {
                let row = from.substring(0, 10).padEnd(12);
                for (const to of types) {
                    const status = validator.conversionMatrix[from]?.[to];
                    let symbol = '?';
                    if (status === true) symbol = '✓';
                    else if (status === false) symbol = '✗';
                    else if (status === 'warn') symbol = '⚠';
                    row += symbol.padEnd(10);
                }
                console.log(row);
            }
            break;

        default:
            console.log(`
Field Type Conversion Validator - Salesforce field type change validation

Usage:
  field-type-conversion-validator validate <fromType> <toType>  Validate conversion
  field-type-conversion-validator get-path <fromType> <toType>  Get safe conversion path
  field-type-conversion-validator query-field <object> <field>  Query field metadata
  field-type-conversion-validator matrix                        Show conversion matrix

Examples:
  field-type-conversion-validator validate Text Formula
  field-type-conversion-validator validate Number Currency
  field-type-conversion-validator get-path Formula Text
  field-type-conversion-validator query-field Account Industry

Blocked Conversions (will ALWAYS fail):
  - ANY type → Formula (create new Formula instead)
  - Formula → ANY type (delete and recreate)
  - AutoNumber → ANY type
  - MasterDetail → Lookup (requires data migration)
            `);
    }
}

module.exports = { FieldTypeConversionValidator };
