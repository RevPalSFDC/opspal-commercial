#!/usr/bin/env node

/**
 * LWC-Apex Field Validator
 *
 * Validates that all fields referenced in LWC templates are included in
 * corresponding Apex @AuraEnabled method SOQL queries.
 *
 * Prevents "cannot read properties of undefined" errors by ensuring:
 * 1. All template field references exist in Apex queries
 * 2. Relationship field access uses null-safe conditional rendering
 * 3. Field names match exactly (including relationship notation)
 *
 * Usage:
 *   node scripts/lib/lwc-apex-field-validator.js <lwc-component-path> [apex-class-path]
 *   node scripts/lib/lwc-apex-field-validator.js force-app/main/default/lwc/approvalStatus
 *
 * Exit codes:
 *   0 = All validations passed
 *   1 = Validation errors found
 *   2 = Usage error or missing files
 */

const fs = require('fs');
const path = require('path');

class LWCApexFieldValidator {
    constructor(lwcPath, apexPath = null) {
        this.lwcPath = lwcPath;
        this.apexPath = apexPath;
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Main validation entry point
     */
    async validate() {
        console.log('🔍 LWC-Apex Field Validator\n');

        // Step 1: Parse LWC template
        const templatePath = path.join(this.lwcPath, `${path.basename(this.lwcPath)}.html`);
        if (!fs.existsSync(templatePath)) {
            this.addError(`LWC template not found: ${templatePath}`);
            return this.getResults();
        }

        const templateContent = fs.readFileSync(templatePath, 'utf8');
        const templateFields = this.extractTemplateFields(templateContent);
        console.log(`📄 Template: ${path.basename(templatePath)}`);
        console.log(`   Found ${templateFields.length} field references\n`);

        // Step 2: Find Apex class
        const jsPath = path.join(this.lwcPath, `${path.basename(this.lwcPath)}.js`);
        if (!fs.existsSync(jsPath)) {
            this.addError(`LWC JavaScript not found: ${jsPath}`);
            return this.getResults();
        }

        const jsContent = fs.readFileSync(jsPath, 'utf8');
        const apexClassName = this.extractApexClassName(jsContent);

        if (!apexClassName) {
            this.addWarning('Could not determine Apex class from @wire decorators');
            return this.getResults();
        }

        console.log(`🔗 Apex class: ${apexClassName}`);

        // Step 3: Find and parse Apex class
        const apexClassPath = this.apexPath || this.findApexClass(apexClassName);
        if (!apexClassPath || !fs.existsSync(apexClassPath)) {
            this.addError(`Apex class not found: ${apexClassName}`);
            return this.getResults();
        }

        const apexContent = fs.readFileSync(apexClassPath, 'utf8');
        const apexQueries = this.extractApexQueries(apexContent);
        console.log(`   Found ${apexQueries.length} SOQL queries\n`);

        // Step 4: Validate field references
        this.validateFieldReferences(templateFields, apexQueries, templateContent);

        return this.getResults();
    }

    /**
     * Extract field references from LWC template
     * Looks for {object.field}, {object.relationship.field}, etc.
     */
    extractTemplateFields(content) {
        const fields = new Set();

        // Match {variable.field} and {variable.relationship__r.field}
        const fieldPattern = /\{([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z0-9_.]+)\}/g;
        let match;

        while ((match = fieldPattern.exec(content)) !== null) {
            const fieldRef = match[1];
            // Skip built-in references like $Flow, $User, etc.
            if (!fieldRef.startsWith('$')) {
                fields.add(fieldRef);
            }
        }

        return Array.from(fields);
    }

    /**
     * Extract Apex class name from LWC JavaScript
     * Looks for import statements: import methodName from '@salesforce/apex/ClassName.methodName'
     */
    extractApexClassName(content) {
        const importPattern = /import\s+\w+\s+from\s+['"]@salesforce\/apex\/([a-zA-Z_][a-zA-Z0-9_]*)\.(\w+)['"]/;
        const match = content.match(importPattern);
        return match ? match[1] : null;
    }

    /**
     * Find Apex class file
     */
    findApexClass(className) {
        const possiblePaths = [
            `force-app/main/default/classes/${className}.cls`,
            `../classes/${className}.cls`,
            path.join(this.lwcPath, `../../classes/${className}.cls`)
        ];

        for (const testPath of possiblePaths) {
            const fullPath = path.resolve(testPath);
            if (fs.existsSync(fullPath)) {
                return fullPath;
            }
        }

        return null;
    }

    /**
     * Extract SOQL queries from Apex class
     */
    extractApexQueries(content) {
        const queries = [];

        // Match SELECT ... FROM ... (multiline, greedy)
        const queryPattern = /\[[\s\n]*SELECT\s+([\s\S]+?)\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi;
        let match;

        while ((match = queryPattern.exec(content)) !== null) {
            const selectClause = match[1];
            const objectName = match[2];

            // Extract field names from SELECT clause
            const fields = this.parseSelectClause(selectClause);

            queries.push({
                objectName,
                fields,
                raw: match[0]
            });
        }

        return queries;
    }

    /**
     * Parse SELECT clause to extract field names
     */
    parseSelectClause(selectClause) {
        const fields = new Set();

        // Split by comma, handle relationship fields
        const fieldParts = selectClause.split(',').map(f => f.trim());

        for (const part of fieldParts) {
            // Remove spaces, newlines, and extract field name
            const cleaned = part.replace(/[\s\n]+/g, ' ').trim();

            // Skip aggregate functions like COUNT(), MAX(), etc.
            if (/^(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(cleaned)) {
                continue;
            }

            // Extract field name (handle relationship notation)
            const fieldMatch = cleaned.match(/([a-zA-Z_][a-zA-Z0-9_.]*)/);
            if (fieldMatch) {
                fields.add(fieldMatch[1]);
            }
        }

        return Array.from(fields);
    }

    /**
     * Validate that template field references exist in Apex queries
     */
    validateFieldReferences(templateFields, apexQueries, templateContent) {
        console.log('✓ Validation Results:\n');

        const allApexFields = new Set();
        apexQueries.forEach(q => q.fields.forEach(f => allApexFields.add(f)));

        for (const templateField of templateFields) {
            // Parse template field: "request.Rule__r.Rule_Name__c" → need "Rule__r.Rule_Name__c"
            const parts = templateField.split('.');
            if (parts.length < 2) continue;

            const [variable, ...fieldPath] = parts;
            const fieldReference = fieldPath.join('.');

            // Check if field exists in any Apex query
            if (!allApexFields.has(fieldReference)) {
                this.addError(
                    `Field "${fieldReference}" used in template but not found in Apex query`,
                    { templateField, suggestion: `Add "${fieldReference}" to SELECT clause in Apex method` }
                );
            }

            // Check for null-unsafe relationship field access
            if (fieldReference.includes('__r.')) {
                const hasConditional = this.checkNullSafetyConditional(templateContent, templateField);
                if (!hasConditional) {
                    this.addWarning(
                        `Relationship field "${fieldReference}" may cause errors if null`,
                        {
                            templateField,
                            suggestion: `Wrap in <template if:true={${variable}.${fieldPath[0]}}>...</template>`
                        }
                    );
                }
            }
        }
    }

    /**
     * Check if a field reference is wrapped in null-safety conditional
     */
    checkNullSafetyConditional(templateContent, fieldRef) {
        // Look for <template if:true={object.relationship__r}> pattern
        const parts = fieldRef.split('.');
        if (parts.length < 2) return true;

        const [variable, relationshipField] = parts;

        // Check if there's a conditional for this relationship
        const conditionalPattern = new RegExp(
            `<template\\s+if:(?:true|false)=\\{${variable}\\.${relationshipField}(?:\\}|[^}]*\\})`,
            'i'
        );

        return conditionalPattern.test(templateContent);
    }

    /**
     * Add error to results
     */
    addError(message, details = {}) {
        this.errors.push({ message, ...details });
    }

    /**
     * Add warning to results
     */
    addWarning(message, details = {}) {
        this.warnings.push({ message, ...details });
    }

    /**
     * Get validation results
     */
    getResults() {
        const hasErrors = this.errors.length > 0;
        const hasWarnings = this.warnings.length > 0;

        if (hasErrors) {
            console.log('❌ ERRORS:\n');
            this.errors.forEach((err, i) => {
                console.log(`  ${i + 1}. ${err.message}`);
                if (err.suggestion) {
                    console.log(`     💡 ${err.suggestion}`);
                }
                console.log('');
            });
        }

        if (hasWarnings) {
            console.log('⚠️  WARNINGS:\n');
            this.warnings.forEach((warn, i) => {
                console.log(`  ${i + 1}. ${warn.message}`);
                if (warn.suggestion) {
                    console.log(`     💡 ${warn.suggestion}`);
                }
                console.log('');
            });
        }

        if (!hasErrors && !hasWarnings) {
            console.log('✅ All validations passed!\n');
        }

        return {
            success: !hasErrors,
            errors: this.errors,
            warnings: this.warnings
        };
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage: node lwc-apex-field-validator.js <lwc-component-path> [apex-class-path]');
        console.error('Example: node lwc-apex-field-validator.js force-app/main/default/lwc/approvalStatus');
        process.exit(2);
    }

    const [lwcPath, apexPath] = args;
    const validator = new LWCApexFieldValidator(lwcPath, apexPath);

    validator.validate().then(result => {
        process.exit(result.success ? 0 : 1);
    }).catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(2);
    });
}

module.exports = LWCApexFieldValidator;
