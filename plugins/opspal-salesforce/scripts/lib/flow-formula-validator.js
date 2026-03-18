#!/usr/bin/env node
/**
 * Flow Formula Validator for Salesforce
 *
 * Scans flow XML for picklist comparisons and validates TEXT() wrapper is present.
 * Detects common formula errors that cause deployment/activation failures.
 *
 * Usage:
 *   node flow-formula-validator.js <flowXmlPath> [orgAlias]
 *   node flow-formula-validator.js <flowXmlPath> [orgAlias] --auto-fix
 *
 * Examples:
 *   node flow-formula-validator.js flows/Quote_Approval.flow-meta.xml delta-sandbox
 *   node flow-formula-validator.js flows/Quote_Approval.flow-meta.xml delta-sandbox --auto-fix
 *
 * Author: RevPal Operations
 * Date: 2025-10-06
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const { execSync } = require('child_process');
const colors = require('colors/safe');

/**
 * Known picklist fields that require TEXT() wrapper
 * Can be extended with org-specific fields
 */
const COMMON_PICKLIST_FIELDS = [
    'Type', 'Status', 'Stage', 'StageName', 'Priority', 'Rating',
    'Industry', 'LeadSource', 'Type_Contract__c', 'Approval_Status__c',
    'RecordType', 'Category__c', 'Reason__c', 'Origin', 'AccountSource'
];

/**
 * Formula patterns that indicate potential issues
 */
const PROBLEMATIC_PATTERNS = [
    // Direct picklist comparison without TEXT()
    /(\w+__c|\w+)\s*=\s*['"][\w\s]+['"]/g,
    // ISBLANK on potential picklist
    /ISBLANK\s*\(\s*(\w+__c|\w+)\s*\)/g,
    // ISNULL on potential picklist
    /ISNULL\s*\(\s*(\w+__c|\w+)\s*\)/g
];

/**
 * Parse flow XML file
 * @param {string} flowXmlPath - Path to flow-meta.xml file
 * @returns {Object} Parsed flow object
 */
async function parseFlowXml(flowXmlPath) {
    const parser = new xml2js.Parser();
    const xmlContent = fs.readFileSync(flowXmlPath, 'utf8');
    return await parser.parseStringPromise(xmlContent);
}

/**
 * Get field metadata from Salesforce org
 * @param {string} orgAlias - Target org
 * @param {string} objectName - Object API name
 * @param {string} fieldName - Field API name
 * @returns {Object} Field metadata
 */
function getFieldMetadata(orgAlias, objectName, fieldName) {
    try {
        const cmd = `sf sobject describe --sobject ${objectName} --target-org ${orgAlias} --json 2>/dev/null`;
        const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

        if (result.status === 0 && result.result && result.result.fields) {
            const field = result.result.fields.find(f =>
                f.name.toLowerCase() === fieldName.toLowerCase()
            );
            return field || null;
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Check if field is a picklist type
 * @param {Object} fieldMetadata - Field metadata from Salesforce
 * @returns {boolean} True if field is picklist type
 */
function isPicklistField(fieldMetadata) {
    if (!fieldMetadata) return false;
    return fieldMetadata.type === 'picklist' ||
           fieldMetadata.type === 'multipicklist' ||
           fieldMetadata.type === 'combobox';
}

/**
 * Extract formulas from flow elements
 * @param {Object} flow - Parsed flow object
 * @returns {Array} Array of formula objects with location info
 */
function extractFormulas(flow) {
    const formulas = [];

    // Helper to safely access nested properties
    const safeAccess = (obj, path) => {
        return path.split('.').reduce((curr, prop) => curr?.[prop], obj);
    };

    // Extract from decisions (rules)
    const decisions = flow.Flow?.decisions || [];
    decisions.forEach(decision => {
        const rules = decision.rules || [];
        rules.forEach(rule => {
            const conditions = rule.conditions || [];
            conditions.forEach((condition, idx) => {
                if (condition.value && condition.value[0]) {
                    formulas.push({
                        type: 'decision',
                        elementName: decision.name?.[0] || 'Unknown',
                        ruleName: rule.name?.[0] || 'Unknown',
                        conditionIndex: idx,
                        leftValue: condition.leftValueReference?.[0] || '',
                        operator: condition.operator?.[0] || '',
                        rightValue: condition.value[0].stringValue?.[0] || condition.value[0].elementReference?.[0] || '',
                        formula: `${condition.leftValueReference?.[0]} ${condition.operator?.[0]} ${condition.value[0].stringValue?.[0] || condition.value[0].elementReference?.[0]}`,
                        location: `Decision: ${decision.name?.[0]} > Rule: ${rule.name?.[0]}`
                    });
                }
            });
        });
    });

    // Extract from formulas
    const formulaElements = flow.Flow?.formulas || [];
    formulaElements.forEach(formula => {
        if (formula.expression && formula.expression[0]) {
            formulas.push({
                type: 'formula',
                elementName: formula.name?.[0] || 'Unknown',
                expression: formula.expression[0],
                dataType: formula.dataType?.[0] || 'Unknown',
                location: `Formula: ${formula.name?.[0]}`
            });
        }
    });

    // Extract from assignments
    const assignments = flow.Flow?.assignments || [];
    assignments.forEach(assignment => {
        const rules = assignment.assignmentItems || [];
        rules.forEach(item => {
            if (item.value && item.value[0]) {
                const value = item.value[0].stringValue?.[0] ||
                            item.value[0].elementReference?.[0] ||
                            item.value[0].formulaValue?.[0] || '';
                if (value.includes('=') || value.includes('(')) {
                    formulas.push({
                        type: 'assignment',
                        elementName: assignment.name?.[0] || 'Unknown',
                        assignToReference: item.assignToReference?.[0] || '',
                        operator: item.operator?.[0] || '',
                        value: value,
                        location: `Assignment: ${assignment.name?.[0]}`
                    });
                }
            }
        });
    });

    return formulas;
}

/**
 * Validate formulas for common errors
 * @param {Array} formulas - Array of formula objects
 * @param {string} orgAlias - Optional org alias for field validation
 * @returns {Object} Validation results
 */
async function validateFormulas(formulas, orgAlias) {
    const errors = [];
    const warnings = [];
    const fixes = [];

    formulas.forEach(formula => {
        // Check for picklist comparisons without TEXT()
        if (formula.type === 'decision' || formula.type === 'assignment') {
            const fieldName = formula.leftValue || formula.assignToReference || '';
            const value = formula.rightValue || formula.value || '';

            // Check if field name looks like a picklist
            const mightBePicklist = COMMON_PICKLIST_FIELDS.some(pf =>
                fieldName.toLowerCase().includes(pf.toLowerCase())
            );

            // Check for direct string comparison
            if (mightBePicklist && value && typeof value === 'string' &&
                !formula.formula?.includes('TEXT(')) {
                errors.push({
                    type: 'PICKLIST_WITHOUT_TEXT',
                    location: formula.location,
                    field: fieldName,
                    message: `Picklist field '${fieldName}' compared without TEXT() wrapper`,
                    fix: `TEXT(${fieldName}) ${formula.operator || '='} '${value}'`,
                    element: formula
                });

                fixes.push({
                    type: 'wrap_with_text',
                    element: formula,
                    original: formula.formula,
                    fixed: `TEXT(${fieldName}) ${formula.operator || '='} '${value}'`
                });
            }
        }

        // Check formula expressions
        if (formula.type === 'formula' && formula.expression) {
            const expr = formula.expression;

            // Check for ISBLANK on picklist
            const isBlankMatch = expr.match(/ISBLANK\s*\(\s*([\w.]+)\s*\)/);
            if (isBlankMatch) {
                const fieldName = isBlankMatch[1];
                const mightBePicklist = COMMON_PICKLIST_FIELDS.some(pf =>
                    fieldName.toLowerCase().includes(pf.toLowerCase())
                );

                if (mightBePicklist) {
                    warnings.push({
                        type: 'ISBLANK_ON_PICKLIST',
                        location: formula.location,
                        field: fieldName,
                        message: `ISBLANK() used on potential picklist field '${fieldName}'`,
                        suggestion: `Use: TEXT(${fieldName}) = ""`,
                        element: formula
                    });

                    fixes.push({
                        type: 'replace_isblank',
                        element: formula,
                        original: expr,
                        fixed: expr.replace(/ISBLANK\s*\(\s*([\w.]+)\s*\)/, 'TEXT($1) = ""')
                    });
                }
            }

            // Check for ISNULL on picklist
            const isNullMatch = expr.match(/ISNULL\s*\(\s*([\w.]+)\s*\)/);
            if (isNullMatch) {
                const fieldName = isNullMatch[1];
                const mightBePicklist = COMMON_PICKLIST_FIELDS.some(pf =>
                    fieldName.toLowerCase().includes(pf.toLowerCase())
                );

                if (mightBePicklist) {
                    warnings.push({
                        type: 'ISNULL_ON_PICKLIST',
                        location: formula.location,
                        field: fieldName,
                        message: `ISNULL() used on potential picklist field '${fieldName}'`,
                        suggestion: `Use: TEXT(${fieldName}) = ""`,
                        element: formula
                    });

                    fixes.push({
                        type: 'replace_isnull',
                        element: formula,
                        original: expr,
                        fixed: expr.replace(/ISNULL\s*\(\s*([\w.]+)\s*\)/, 'TEXT($1) = ""')
                    });
                }
            }

            // Check for direct picklist comparison in formulas
            COMMON_PICKLIST_FIELDS.forEach(picklistField => {
                const pattern = new RegExp(`\\b${picklistField}\\s*=\\s*['"]`, 'i');
                if (pattern.test(expr) && !expr.includes(`TEXT(${picklistField}`)) {
                    errors.push({
                        type: 'PICKLIST_COMPARISON_IN_FORMULA',
                        location: formula.location,
                        field: picklistField,
                        message: `Direct comparison of picklist field '${picklistField}' without TEXT()`,
                        suggestion: `Wrap with TEXT(): TEXT(${picklistField})`,
                        element: formula
                    });
                }
            });
        }
    });

    // If org alias provided, do deeper validation
    if (orgAlias) {
        // Additional org-specific validation can be added here
        console.log(colors.gray(`Note: Org-specific validation for ${orgAlias} not yet implemented`));
    }

    return { errors, warnings, fixes };
}

/**
 * Apply fixes to flow XML
 * @param {string} flowXmlPath - Path to flow-meta.xml file
 * @param {Array} fixes - Array of fixes to apply
 * @returns {Object} Result of fix application
 */
async function autoFixFlowFormulas(flowXmlPath, fixes) {
    if (fixes.length === 0) {
        return {
            success: true,
            fixesApplied: 0,
            message: 'No fixes needed'
        };
    }

    // Read the XML file
    let xmlContent = fs.readFileSync(flowXmlPath, 'utf8');
    const backupPath = flowXmlPath.replace('.flow-meta.xml', '.flow-meta.xml.backup');

    // Create backup
    fs.writeFileSync(backupPath, xmlContent);
    console.log(colors.gray(`📁 Backup created: ${backupPath}`));

    let fixesApplied = 0;

    // Apply each fix
    fixes.forEach(fix => {
        const before = xmlContent.length;

        switch (fix.type) {
            case 'wrap_with_text':
                // This would require more complex XML manipulation
                // For now, log what needs to be done manually
                console.log(colors.yellow(`⚠️  Manual fix needed at ${fix.element.location}:`));
                console.log(colors.gray(`   Change: ${fix.original}`));
                console.log(colors.green(`   To: ${fix.fixed}`));
                break;

            case 'replace_isblank':
            case 'replace_isnull':
                xmlContent = xmlContent.replace(fix.original, fix.fixed);
                if (xmlContent.length !== before) {
                    fixesApplied++;
                    console.log(colors.green(`✅ Fixed: ${fix.original} → ${fix.fixed}`));
                }
                break;
        }
    });

    if (fixesApplied > 0) {
        // Save the fixed file
        const fixedPath = flowXmlPath.replace('.flow-meta.xml', '.fixed.flow-meta.xml');
        fs.writeFileSync(fixedPath, xmlContent);

        return {
            success: true,
            fixesApplied: fixesApplied,
            newFilePath: fixedPath,
            backupPath: backupPath,
            message: `Applied ${fixesApplied} fixes. Fixed file: ${fixedPath}`
        };
    }

    return {
        success: false,
        fixesApplied: 0,
        message: 'Fixes require manual intervention (complex XML structure changes)'
    };
}

/**
 * Main validation function
 * @param {string} flowXmlPath - Path to flow-meta.xml file
 * @param {string} orgAlias - Target org for schema validation
 * @returns {Object} Validation results
 */
async function validateFlowFormulas(flowXmlPath, orgAlias) {
    console.log(colors.cyan(`\n🔍 Validating flow formulas: ${path.basename(flowXmlPath)}\n`));

    if (!fs.existsSync(flowXmlPath)) {
        throw new Error(`Flow file not found: ${flowXmlPath}`);
    }

    try {
        // Parse the flow XML
        const flow = await parseFlowXml(flowXmlPath);

        // Extract formulas
        const formulas = extractFormulas(flow);
        console.log(colors.gray(`📊 Found ${formulas.length} formula expressions to validate\n`));

        // Validate formulas
        const validation = await validateFormulas(formulas, orgAlias);

        // Generate summary
        const summary = {
            valid: validation.errors.length === 0,
            errors: validation.errors,
            warnings: validation.warnings,
            fixes: validation.fixes,
            totalFormulas: formulas.length,
            errorCount: validation.errors.length,
            warningCount: validation.warnings.length,
            fixableCount: validation.fixes.length
        };

        return summary;

    } catch (error) {
        console.error(colors.red('❌ Error parsing flow:'), error.message);
        throw error;
    }
}

/**
 * Display validation results
 * @param {Object} results - Validation results
 */
function displayResults(results) {
    console.log(colors.cyan('\n📋 Validation Summary:\n'));

    if (results.valid) {
        console.log(colors.green('✅ Flow formulas are valid!\n'));
    } else {
        console.log(colors.red(`❌ Found ${results.errorCount} errors\n`));
    }

    // Display errors
    if (results.errors.length > 0) {
        console.log(colors.red('Errors:'));
        results.errors.forEach((error, idx) => {
            console.log(colors.red(`  ${idx + 1}. ${error.message}`));
            console.log(colors.gray(`     Location: ${error.location}`));
            if (error.fix) {
                console.log(colors.green(`     Fix: ${error.fix}`));
            }
            console.log();
        });
    }

    // Display warnings
    if (results.warnings.length > 0) {
        console.log(colors.yellow('Warnings:'));
        results.warnings.forEach((warning, idx) => {
            console.log(colors.yellow(`  ${idx + 1}. ${warning.message}`));
            console.log(colors.gray(`     Location: ${warning.location}`));
            if (warning.suggestion) {
                console.log(colors.green(`     Suggestion: ${warning.suggestion}`));
            }
            console.log();
        });
    }

    // Summary
    console.log(colors.cyan('Summary:'));
    console.log(colors.gray(`  Total Formulas: ${results.totalFormulas}`));
    console.log(colors.red(`  Errors: ${results.errorCount}`));
    console.log(colors.yellow(`  Warnings: ${results.warningCount}`));
    console.log(colors.green(`  Auto-fixable: ${results.fixableCount}`));
}

/**
 * Main execution function
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log(colors.yellow('Usage: node flow-formula-validator.js <flowXmlPath> [orgAlias] [--auto-fix]'));
        console.log(colors.gray('\nExamples:'));
        console.log(colors.gray('  node flow-formula-validator.js flows/Quote_Approval.flow-meta.xml'));
        console.log(colors.gray('  node flow-formula-validator.js flows/Quote_Approval.flow-meta.xml delta-sandbox'));
        console.log(colors.gray('  node flow-formula-validator.js flows/Quote_Approval.flow-meta.xml delta-sandbox --auto-fix'));
        process.exit(1);
    }

    const flowXmlPath = args[0];
    const orgAlias = args.find(arg => !arg.startsWith('--') && arg !== flowXmlPath) || null;
    const autoFix = args.includes('--auto-fix');

    try {
        // Validate the flow
        const results = await validateFlowFormulas(flowXmlPath, orgAlias);

        // Display results
        displayResults(results);

        // Apply fixes if requested
        if (autoFix && results.fixes.length > 0) {
            console.log(colors.cyan('\n🔧 Applying automatic fixes...\n'));
            const fixResult = await autoFixFlowFormulas(flowXmlPath, results.fixes);
            console.log(fixResult.message);
        } else if (results.fixes.length > 0 && !autoFix) {
            console.log(colors.yellow('\n💡 Run with --auto-fix to apply automatic fixes'));
        }

        // Exit with appropriate code
        process.exit(results.valid ? 0 : 1);

    } catch (error) {
        console.error(colors.red('❌ Error:'), error.message);
        process.exit(1);
    }
}

// Export functions for use as library
module.exports = {
    validateFlowFormulas,
    autoFixFlowFormulas,
    parseFlowXml,
    extractFormulas,
    validateFormulas
};

// Run if called directly
if (require.main === module) {
    main();
}