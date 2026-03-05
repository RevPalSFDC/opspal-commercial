#!/usr/bin/env node

/**
 * Quick Action Validator for Salesforce
 *
 * Validates Quick Action type changes before deployment to prevent failures
 * due to incompatible type transitions.
 *
 * Problem Solved (Reflection Cohort: tool-contract):
 *   Quick Action type changes can fail silently or cause deployment errors
 *   when transitioning between incompatible types (e.g., LightningWebComponent
 *   to VisualforcePage).
 *
 * Validation Checks:
 * - Detects Quick Action type transitions
 * - Blocks incompatible type changes
 * - Validates component references exist
 * - Checks object binding compatibility
 *
 * @version 1.0.0
 * @date 2026-01-02
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Quick Action type compatibility matrix
// Keys are "from" types, values are array of compatible "to" types
const TYPE_COMPATIBILITY = {
    // LWC-based actions
    'LightningWebComponent': ['LightningWebComponent'],
    'LightningComponent': ['LightningComponent', 'LightningWebComponent'],

    // Visualforce-based actions
    'VisualforcePage': ['VisualforcePage'],

    // Standard actions (can be changed within category)
    'Create': ['Create', 'Update', 'LogACall'],
    'Update': ['Update', 'Create', 'LogACall'],
    'LogACall': ['LogACall', 'Create', 'Update'],

    // Flow-based actions
    'Flow': ['Flow'],
    'QuickAction': ['QuickAction'], // Custom Quick Actions

    // Email actions
    'SendEmail': ['SendEmail'],

    // Canvas actions
    'Canvas': ['Canvas'],

    // Post actions (Chatter)
    'Post': ['Post']
};

// Types that require specific metadata
const TYPE_REQUIREMENTS = {
    'LightningWebComponent': ['lwcComponent'],
    'LightningComponent': ['auraComponent'],
    'VisualforcePage': ['visualforcePage'],
    'Flow': ['flowName'],
    'Canvas': ['canvas']
};

class QuickActionValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.orgAlias = options.orgAlias || process.env.SALESFORCE_ORG_ALIAS;
        this.strictMode = options.strictMode || false;
    }

    /**
     * Validate a Quick Action file before deployment
     * @param {string} filePath - Path to .quickAction-meta.xml file
     * @returns {Object} Validation result
     */
    async validateFile(filePath) {
        const result = {
            valid: true,
            filePath,
            errors: [],
            warnings: [],
            quickAction: null
        };

        if (!fs.existsSync(filePath)) {
            result.valid = false;
            result.errors.push(`File not found: ${filePath}`);
            return result;
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const quickAction = this._parseQuickAction(content);

        if (!quickAction) {
            result.valid = false;
            result.errors.push('Failed to parse Quick Action XML');
            return result;
        }

        result.quickAction = quickAction;

        // Get current org state for comparison
        if (this.orgAlias) {
            const orgState = await this._queryOrgQuickAction(quickAction.fullName);

            if (orgState) {
                // Validate type transition
                const typeValidation = this._validateTypeTransition(
                    orgState.type,
                    quickAction.type
                );

                if (!typeValidation.valid) {
                    result.valid = false;
                    result.errors.push(typeValidation.error);
                    result.warnings.push(typeValidation.suggestion);
                }
            }
        }

        // Validate required fields for type
        const fieldValidation = this._validateRequiredFields(quickAction);
        if (!fieldValidation.valid) {
            result.valid = false;
            result.errors.push(...fieldValidation.errors);
        }

        // Validate component references
        const componentValidation = await this._validateComponentReferences(quickAction);
        if (!componentValidation.valid) {
            if (this.strictMode) {
                result.valid = false;
                result.errors.push(...componentValidation.errors);
            } else {
                result.warnings.push(...componentValidation.errors);
            }
        }

        return result;
    }

    /**
     * Parse Quick Action XML
     */
    _parseQuickAction(xmlContent) {
        try {
            // Simple XML parsing for Quick Action
            const getTagValue = (tag) => {
                const match = xmlContent.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'));
                return match ? match[1].trim() : null;
            };

            const fullNameMatch = xmlContent.match(/<fullName>(.*?)<\/fullName>/);
            const typeMatch = xmlContent.match(/<type>(.*?)<\/type>/);
            const labelMatch = xmlContent.match(/<label>(.*?)<\/label>/);

            return {
                fullName: fullNameMatch ? fullNameMatch[1] : null,
                type: typeMatch ? typeMatch[1] : null,
                label: labelMatch ? labelMatch[1] : null,
                lwcComponent: getTagValue('lwc') || getTagValue('lightningWebComponent'),
                auraComponent: getTagValue('lightningComponent'),
                visualforcePage: getTagValue('page'),
                flowName: getTagValue('flowDefinition') || getTagValue('flow'),
                canvas: getTagValue('canvas'),
                targetObject: getTagValue('targetObject'),
                raw: xmlContent
            };
        } catch (error) {
            if (this.verbose) {
                console.error(`Parse error: ${error.message}`);
            }
            return null;
        }
    }

    /**
     * Query org for existing Quick Action
     */
    async _queryOrgQuickAction(fullName) {
        if (!this.orgAlias || !fullName) {
            return null;
        }

        try {
            const cmd = `sf data query --query "SELECT DeveloperName, Type, TargetSobjectType FROM QuickActionDefinition WHERE DeveloperName = '${fullName}'" --use-tooling-api --target-org ${this.orgAlias} --json`;

            const output = execSync(cmd, {
                encoding: 'utf8',
                timeout: 30000,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const result = JSON.parse(output);
            const records = result.result?.records || [];

            if (records.length > 0) {
                return {
                    developerName: records[0].DeveloperName,
                    type: records[0].Type,
                    targetObject: records[0].TargetSobjectType
                };
            }

            return null;
        } catch (error) {
            if (this.verbose) {
                console.error(`Query error: ${error.message}`);
            }
            return null;
        }
    }

    /**
     * Validate type transition
     */
    _validateTypeTransition(fromType, toType) {
        if (!fromType || !toType) {
            return { valid: true };
        }

        if (fromType === toType) {
            return { valid: true };
        }

        const compatibleTypes = TYPE_COMPATIBILITY[fromType] || [];

        if (compatibleTypes.includes(toType)) {
            return { valid: true };
        }

        return {
            valid: false,
            error: `Incompatible Quick Action type transition: ${fromType} → ${toType}`,
            suggestion: `Delete the existing Quick Action and recreate it, or keep the same type. Compatible transitions from ${fromType}: ${compatibleTypes.join(', ') || 'none'}`
        };
    }

    /**
     * Validate required fields based on type
     */
    _validateRequiredFields(quickAction) {
        const result = { valid: true, errors: [] };

        if (!quickAction.type) {
            result.valid = false;
            result.errors.push('Quick Action type is required');
            return result;
        }

        const requirements = TYPE_REQUIREMENTS[quickAction.type];
        if (!requirements) {
            return result; // No specific requirements for this type
        }

        for (const field of requirements) {
            if (!quickAction[field]) {
                result.valid = false;
                result.errors.push(`Quick Action type '${quickAction.type}' requires '${field}' to be specified`);
            }
        }

        return result;
    }

    /**
     * Validate component references exist
     */
    async _validateComponentReferences(quickAction) {
        const result = { valid: true, errors: [] };

        if (!this.orgAlias) {
            return result;
        }

        // Check LWC component exists
        if (quickAction.lwcComponent) {
            const exists = await this._componentExists('LightningComponentBundle', quickAction.lwcComponent);
            if (!exists) {
                result.valid = false;
                result.errors.push(`Referenced LWC component '${quickAction.lwcComponent}' not found in org`);
            }
        }

        // Check Aura component exists
        if (quickAction.auraComponent) {
            const exists = await this._componentExists('AuraDefinitionBundle', quickAction.auraComponent);
            if (!exists) {
                result.valid = false;
                result.errors.push(`Referenced Aura component '${quickAction.auraComponent}' not found in org`);
            }
        }

        // Check Visualforce page exists
        if (quickAction.visualforcePage) {
            const exists = await this._componentExists('ApexPage', quickAction.visualforcePage);
            if (!exists) {
                result.valid = false;
                result.errors.push(`Referenced Visualforce page '${quickAction.visualforcePage}' not found in org`);
            }
        }

        // Check Flow exists
        if (quickAction.flowName) {
            const exists = await this._componentExists('FlowDefinition', quickAction.flowName);
            if (!exists) {
                result.valid = false;
                result.errors.push(`Referenced Flow '${quickAction.flowName}' not found in org`);
            }
        }

        return result;
    }

    /**
     * Check if a component exists in the org
     */
    async _componentExists(metadataType, componentName) {
        try {
            const queries = {
                'LightningComponentBundle': `SELECT DeveloperName FROM LightningComponentBundle WHERE DeveloperName = '${componentName}'`,
                'AuraDefinitionBundle': `SELECT DeveloperName FROM AuraDefinitionBundle WHERE DeveloperName = '${componentName}'`,
                'ApexPage': `SELECT Name FROM ApexPage WHERE Name = '${componentName}'`,
                'FlowDefinition': `SELECT DeveloperName FROM FlowDefinition WHERE DeveloperName = '${componentName}'`
            };

            const query = queries[metadataType];
            if (!query) return true; // Unknown type, assume exists

            const cmd = `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`;

            const output = execSync(cmd, {
                encoding: 'utf8',
                timeout: 30000,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const result = JSON.parse(output);
            return (result.result?.records?.length || 0) > 0;
        } catch (error) {
            if (this.verbose) {
                console.error(`Component check error: ${error.message}`);
            }
            return true; // Assume exists on error
        }
    }

    /**
     * Validate multiple Quick Action files
     * @param {string} directory - Directory containing Quick Action files
     * @returns {Object} Validation results
     */
    async validateDirectory(directory) {
        const results = {
            directory,
            timestamp: new Date().toISOString(),
            files: [],
            summary: {
                total: 0,
                valid: 0,
                invalid: 0,
                warnings: 0
            }
        };

        // Find all Quick Action files
        const files = this._findQuickActionFiles(directory);
        results.summary.total = files.length;

        for (const file of files) {
            const validation = await this.validateFile(file);
            results.files.push(validation);

            if (validation.valid) {
                results.summary.valid++;
            } else {
                results.summary.invalid++;
            }

            if (validation.warnings.length > 0) {
                results.summary.warnings++;
            }
        }

        results.allValid = results.summary.invalid === 0;

        return results;
    }

    /**
     * Find Quick Action files in directory
     */
    _findQuickActionFiles(directory) {
        const files = [];

        const walk = (dir) => {
            if (!fs.existsSync(dir)) return;

            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    walk(fullPath);
                } else if (entry.name.endsWith('.quickAction-meta.xml')) {
                    files.push(fullPath);
                }
            }
        };

        walk(directory);
        return files;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === 'help') {
        console.log(`
Quick Action Validator

Usage:
  node quick-action-validator.js <command> [options]

Commands:
  validate <file>          Validate a single Quick Action file
  validate-dir <directory> Validate all Quick Actions in a directory

Options:
  --org <alias>    Salesforce org alias for comparison
  --strict         Treat warnings as errors
  --verbose        Enable verbose output

Examples:
  node quick-action-validator.js validate ./force-app/main/default/quickActions/Account.NewCase.quickAction-meta.xml
  node quick-action-validator.js validate-dir ./force-app --org my-sandbox
`);
        process.exit(0);
    }

    const orgIndex = args.indexOf('--org');
    const orgAlias = orgIndex >= 0 ? args[orgIndex + 1] : null;
    const verbose = args.includes('--verbose');
    const strictMode = args.includes('--strict');

    const validator = new QuickActionValidator({ orgAlias, verbose, strictMode });

    (async () => {
        try {
            switch (command) {
                case 'validate': {
                    const filePath = args[1];
                    if (!filePath) {
                        console.error('Error: File path required');
                        process.exit(1);
                    }

                    const result = await validator.validateFile(filePath);
                    console.log(JSON.stringify(result, null, 2));

                    if (!result.valid) {
                        process.exit(1);
                    }
                    break;
                }

                case 'validate-dir': {
                    const directory = args[1] || '.';
                    const results = await validator.validateDirectory(directory);
                    console.log(JSON.stringify(results, null, 2));

                    if (!results.allValid) {
                        process.exit(1);
                    }
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

module.exports = { QuickActionValidator };
