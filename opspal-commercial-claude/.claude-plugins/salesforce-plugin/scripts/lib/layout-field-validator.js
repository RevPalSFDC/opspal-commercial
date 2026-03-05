#!/usr/bin/env node

/**
 * Salesforce Layout Field Validator
 *
 * Org-aware validator that verifies all field references in layout XML files
 * exist and are accessible in the target Salesforce org before deployment.
 *
 * Prevents deployment errors like:
 * - "Invalid field:Discount in related list:RelatedQuoteList"
 * - "Invalid field:CustomField__c"
 *
 * Features:
 * - Validates layoutItem field references
 * - Validates relatedList field references
 * - Queries Salesforce describe API for field availability
 * - Supports custom and standard objects
 * - Caches describe results for performance
 *
 * Usage:
 *   node layout-field-validator.js --org <alias> --layout <file>
 *   node layout-field-validator.js --org <alias> --dir <directory>
 *
 * Exit codes:
 *   0 = All fields valid
 *   1 = Invalid fields found (blocks deployment)
 *   2 = Warnings (missing org or cache issues)
 *
 * Created: 2025-10-05
 * From: Quote Light Framework - Layout Deployment Reflection
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Extract object name from layout file name
 * Examples:
 *   "Opportunity-Opportunity Layout.layout-meta.xml" → "Opportunity"
 *   "Account-Account Layout.layout-meta.xml" → "Account"
 *   "CustomObject__c-Layout.layout-meta.xml" → "CustomObject__c"
 */
function extractObjectName(layoutFileName) {
    const match = layoutFileName.match(/^([^-]+)-/);
    return match ? match[1] : null;
}

/**
 * Query Salesforce for object field metadata
 */
function getObjectFields(orgAlias, objectName) {
    console.log(`\n  Fetching field metadata for ${objectName}...`);

    try {
        const cmd = `sf sobject describe --sobject ${objectName} --target-org ${orgAlias} --json`;
        const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        const parsed = JSON.parse(result);

        if (parsed.status !== 0) {
            console.error(`  ❌ Failed to describe ${objectName}: ${parsed.message || 'Unknown error'}`);
            return null;
        }

        const fields = parsed.result.fields.map(f => ({
            name: f.name,
            label: f.label,
            type: f.type,
            custom: f.custom || false
        }));

        console.log(`  ✅ Found ${fields.length} fields for ${objectName}`);
        return fields;

    } catch (error) {
        console.error(`  ❌ Error querying Salesforce: ${error.message}`);
        return null;
    }
}

/**
 * Query Salesforce for related object fields (for related lists)
 */
function getRelatedObjectFields(orgAlias, relatedListName, parentObjectName) {
    // Map common related list names to object names
    const relatedListMap = {
        'RelatedQuoteList': 'Quote',
        'RelatedOpportunityList': 'Opportunity',
        'RelatedContactList': 'Contact',
        'RelatedAccountList': 'Account',
        'RelatedCaseList': 'Case',
        'RelatedLeadList': 'Lead',
        'RelatedLineItemList': 'OpportunityLineItem',
        'RelatedNoteList': 'Note',
        'RelatedFileList': 'ContentDocument',
        'RelatedActivityList': 'Task',
        'RelatedHistoryList': 'Task',
        'RelatedContactRoleList': 'OpportunityContactRole'
    };

    const objectName = relatedListMap[relatedListName];

    if (!objectName) {
        console.log(`  ⚠️  Cannot validate ${relatedListName} - unknown object mapping`);
        return null;
    }

    return getObjectFields(orgAlias, objectName);
}

/**
 * Parse layout XML and extract all field references
 */
function extractFieldReferences(xmlContent) {
    const fieldRefs = {
        layoutFields: [],
        relatedListFields: {}
    };

    // Extract layoutItem field references
    const layoutItemRegex = /<layoutItems>[\s\S]*?<field>(.*?)<\/field>[\s\S]*?<\/layoutItems>/g;
    let match;
    while ((match = layoutItemRegex.exec(xmlContent)) !== null) {
        const fieldName = match[1];
        if (!fieldRefs.layoutFields.includes(fieldName)) {
            fieldRefs.layoutFields.push(fieldName);
        }
    }

    // Extract related list field references
    const relatedListRegex = /<relatedLists>([\s\S]*?)<\/relatedLists>/g;
    while ((match = relatedListRegex.exec(xmlContent)) !== null) {
        const relatedListContent = match[1];

        // Get related list name
        const listNameMatch = relatedListContent.match(/<relatedList>(.*?)<\/relatedList>/);
        if (listNameMatch) {
            const listName = listNameMatch[1];

            // Extract field references for this related list
            const fieldsRegex = /<fields>(.*?)<\/fields>/g;
            let fieldMatch;
            const fields = [];
            while ((fieldMatch = fieldsRegex.exec(relatedListContent)) !== null) {
                fields.push(fieldMatch[1]);
            }

            if (fields.length > 0) {
                fieldRefs.relatedListFields[listName] = fields;
            }
        }
    }

    return fieldRefs;
}

/**
 * Validate field references against org metadata
 */
function validateFields(fieldRefs, objectFields, relatedFields, layoutFileName) {
    const errors = [];
    const warnings = [];

    // Create field name lookup (case-insensitive)
    const objectFieldNames = new Set(objectFields.map(f => f.name.toLowerCase()));

    // Validate layout fields
    console.log(`\n  Validating ${fieldRefs.layoutFields.length} layout field(s)...`);
    fieldRefs.layoutFields.forEach(fieldName => {
        if (!objectFieldNames.has(fieldName.toLowerCase())) {
            errors.push({
                severity: 'ERROR',
                type: 'layoutItem',
                field: fieldName,
                message: `Field "${fieldName}" does not exist or is not accessible`,
                fix: `Verify field exists in org or remove from layout`
            });
        }
    });

    // Validate related list fields
    Object.entries(fieldRefs.relatedListFields).forEach(([listName, fields]) => {
        console.log(`\n  Validating ${fields.length} field(s) in ${listName}...`);

        const relatedObjFields = relatedFields[listName];

        if (!relatedObjFields) {
            warnings.push({
                severity: 'WARNING',
                type: 'relatedList',
                list: listName,
                message: `Cannot validate ${listName} - object mapping unknown`,
                fix: `Manual verification required or remove related list`
            });
            return;
        }

        const relatedFieldNames = new Set(relatedObjFields.map(f => f.name.toLowerCase()));

        fields.forEach(fieldName => {
            // Skip special field names (CORE.*, TASK.*, etc.)
            if (fieldName.includes('.')) {
                return; // These are standard Salesforce field references
            }

            if (!relatedFieldNames.has(fieldName.toLowerCase())) {
                errors.push({
                    severity: 'ERROR',
                    type: 'relatedList',
                    list: listName,
                    field: fieldName,
                    message: `Field "${fieldName}" does not exist in ${listName}`,
                    fix: `Remove field from related list or verify it exists in org`
                });
            }
        });
    });

    return { errors, warnings };
}

/**
 * Validate a single layout file
 */
function validateLayoutFile(orgAlias, layoutFilePath) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Validating Field References: ${path.basename(layoutFilePath)}`);
    console.log(`Org: ${orgAlias}`);
    console.log(`${'='.repeat(80)}`);

    // Read file
    if (!fs.existsSync(layoutFilePath)) {
        console.error(`\n❌ ERROR: File not found: ${layoutFilePath}`);
        return { success: false, errorCount: 1, warningCount: 0 };
    }

    const xmlContent = fs.readFileSync(layoutFilePath, 'utf-8');
    const layoutFileName = path.basename(layoutFilePath);

    // Extract object name from layout file name
    const objectName = extractObjectName(layoutFileName);
    if (!objectName) {
        console.error(`\n❌ ERROR: Cannot determine object name from layout file: ${layoutFileName}`);
        return { success: false, errorCount: 1, warningCount: 0 };
    }

    console.log(`  Object: ${objectName}`);

    // Get object field metadata from org
    const objectFields = getObjectFields(orgAlias, objectName);
    if (!objectFields) {
        console.error(`\n❌ ERROR: Failed to fetch field metadata for ${objectName}`);
        return { success: false, errorCount: 1, warningCount: 0 };
    }

    // Extract field references from layout
    console.log(`\n  Extracting field references from layout...`);
    const fieldRefs = extractFieldReferences(xmlContent);
    console.log(`  ✅ Found ${fieldRefs.layoutFields.length} layout field(s)`);
    console.log(`  ✅ Found ${Object.keys(fieldRefs.relatedListFields).length} related list(s)`);

    // Get related object fields for each related list
    const relatedFields = {};
    Object.keys(fieldRefs.relatedListFields).forEach(listName => {
        const fields = getRelatedObjectFields(orgAlias, listName, objectName);
        if (fields) {
            relatedFields[listName] = fields;
        }
    });

    // Validate all field references
    const { errors, warnings } = validateFields(fieldRefs, objectFields, relatedFields, layoutFileName);

    // Display results
    if (errors.length > 0 || warnings.length > 0) {
        console.log(`\n${'─'.repeat(80)}`);
        console.log(`Issues Found:`);
        console.log(`${'─'.repeat(80)}`);

        errors.forEach(err => {
            if (err.type === 'layoutItem') {
                console.log(`\n❌ Layout Field Error: ${err.field}`);
            } else {
                console.log(`\n❌ Related List Error: ${err.list} → ${err.field}`);
            }
            console.log(`   ${err.message}`);
            console.log(`   Fix: ${err.fix}`);
        });

        warnings.forEach(warn => {
            console.log(`\n⚠️  ${warn.message}`);
            console.log(`   ${warn.fix}`);
        });
    }

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Validation Summary`);
    console.log(`${'='.repeat(80)}`);
    console.log(`\nErrors:   ${errors.length} ❌`);
    console.log(`Warnings: ${warnings.length} ⚠️\n`);

    if (errors.length > 0) {
        console.log(`🚫 DEPLOYMENT BLOCKED - Fix field reference errors before deploying\n`);
        return { success: false, errorCount: errors.length, warningCount: warnings.length };
    } else if (warnings.length > 0) {
        console.log(`⚠️  Deployment allowed but warnings should be reviewed\n`);
        return { success: true, errorCount: 0, warningCount: warnings.length };
    } else {
        console.log(`✅ All field references are valid!\n`);
        return { success: true, errorCount: 0, warningCount: 0 };
    }
}

/**
 * Validate all layout files in a directory
 */
function validateDirectory(orgAlias, dirPath) {
    if (!fs.existsSync(dirPath)) {
        console.error(`❌ ERROR: Directory not found: ${dirPath}`);
        process.exit(1);
    }

    const files = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.layout-meta.xml'))
        .map(f => path.join(dirPath, f));

    if (files.length === 0) {
        console.log(`⚠️  No layout files found in ${dirPath}`);
        process.exit(2);
    }

    console.log(`\nFound ${files.length} layout file(s) to validate\n`);

    let totalErrors = 0;
    let totalWarnings = 0;
    const results = [];

    files.forEach(file => {
        const result = validateLayoutFile(orgAlias, file);
        results.push({ file: path.basename(file), ...result });
        totalErrors += result.errorCount;
        totalWarnings += result.warningCount;
    });

    // Overall summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Overall Validation Summary`);
    console.log(`${'='.repeat(80)}\n`);

    results.forEach(r => {
        const status = r.success ? '✅' : '❌';
        console.log(`${status} ${r.file}: ${r.errorCount} errors, ${r.warningCount} warnings`);
    });

    console.log(`\nTotal Errors:   ${totalErrors} ❌`);
    console.log(`Total Warnings: ${totalWarnings} ⚠️\n`);

    if (totalErrors > 0) {
        console.log(`🚫 DEPLOYMENT BLOCKED - Fix all field reference errors before deploying\n`);
        process.exit(1);
    } else if (totalWarnings > 0) {
        console.log(`⚠️  Deployment allowed but warnings should be reviewed\n`);
        process.exit(2);
    } else {
        console.log(`✅ All layout files validated successfully!\n`);
        process.exit(0);
    }
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Salesforce Layout Field Validator

Usage:
  node layout-field-validator.js --org <alias> --layout <file>
  node layout-field-validator.js --org <alias> --dir <directory>

Examples:
  node layout-field-validator.js --org myorg --layout force-app/main/default/layouts/Opportunity-Layout.layout-meta.xml
  node layout-field-validator.js --org myorg --dir force-app/main/default/layouts/

Options:
  --org <alias>       Salesforce org alias (required)
  --layout <file>     Path to layout file to validate
  --dir <directory>   Directory containing layout files to validate

Exit codes:
  0 = All field references valid
  1 = Invalid fields found (blocks deployment)
  2 = Warnings found (non-blocking)

Note: Requires Salesforce CLI (sf) to be installed and authenticated to the target org
        `);
        process.exit(1);
    }

    let orgAlias = null;
    let layoutFile = null;
    let directory = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--org' && args[i + 1]) {
            orgAlias = args[i + 1];
            i++;
        } else if (args[i] === '--layout' && args[i + 1]) {
            layoutFile = args[i + 1];
            i++;
        } else if (args[i] === '--dir' && args[i + 1]) {
            directory = args[i + 1];
            i++;
        }
    }

    if (!orgAlias) {
        console.error(`❌ ERROR: --org parameter is required\n`);
        process.exit(1);
    }

    if (layoutFile) {
        const result = validateLayoutFile(orgAlias, layoutFile);
        process.exit(result.success ? (result.warningCount > 0 ? 2 : 0) : 1);
    } else if (directory) {
        validateDirectory(orgAlias, directory);
    } else {
        console.error(`❌ ERROR: Either --layout or --dir parameter is required\n`);
        process.exit(1);
    }
}

module.exports = {
    validateLayoutFile,
    validateDirectory,
    extractObjectName,
    extractFieldReferences,
    getObjectFields
};
