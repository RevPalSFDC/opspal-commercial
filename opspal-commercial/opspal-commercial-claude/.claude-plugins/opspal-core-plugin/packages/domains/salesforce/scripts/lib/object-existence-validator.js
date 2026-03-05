#!/usr/bin/env node
/**
 * Object Existence Validator for Salesforce
 *
 * Validates that specified objects exist in target org before automation generation.
 * Prevents automation failures due to CPQ/Standard object assumptions.
 *
 * Usage:
 *   node object-existence-validator.js <orgAlias> <objectName>
 *
 * Examples:
 *   node object-existence-validator.js rentable-sandbox Quote
 *   node object-existence-validator.js hivemq-prod SBQQ__Quote__c
 *
 * Author: RevPal Operations
 * Date: 2025-10-06
 */

const { execSync } = require('child_process');
const colors = require('colors/safe');

/**
 * Common object variants mapping
 * Maps base object names to their possible variants
 */
const OBJECT_VARIANTS = {
    'Quote': ['SBQQ__Quote__c', 'Quote'],
    'QuoteLine': ['SBQQ__QuoteLine__c', 'QuoteLineItem'],
    'Product': ['SBQQ__Product__c', 'Product2'],
    'Subscription': ['SBQQ__Subscription__c', 'Subscription__c'],
    'Contract': ['SBQQ__Contract__c', 'Contract'],
    'Order': ['Order', 'Order__c'],
    'Account': ['Account', 'PersonAccount'],
    'PriceBook': ['SBQQ__PriceBook__c', 'Pricebook2']
};

/**
 * CPQ package object prefixes
 */
const CPQ_PREFIXES = ['SBQQ__', 'sbaa__'];

/**
 * Queries Salesforce for object existence
 * @param {string} orgAlias - Target org
 * @param {string} objectName - Object API name to check
 * @returns {boolean} True if object exists
 */
function queryObjectExists(orgAlias, objectName) {
    try {
        const cmd = `sf sobject describe --sobject ${objectName} --target-org ${orgAlias} --json 2>/dev/null`;
        const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

        if (result.status === 0 && result.result && result.result.name) {
            return true;
        }
        return false;
    } catch (error) {
        // Object doesn't exist or error querying
        return false;
    }
}

/**
 * Gets list of all objects in org
 * @param {string} orgAlias - Target org
 * @returns {Array} Array of object names
 */
function getAllObjects(orgAlias) {
    try {
        const cmd = `sf sobject list --target-org ${orgAlias} --json 2>/dev/null`;
        const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

        if (result.status === 0 && result.result) {
            return result.result.map(obj => obj.name);
        }
        return [];
    } catch (error) {
        console.error(colors.red('❌ Error querying objects:'), error.message);
        return [];
    }
}

/**
 * Detects if org has CPQ installed
 * @param {string} orgAlias - Target org
 * @returns {boolean} True if CPQ is detected
 */
function detectCPQ(orgAlias) {
    const cpqObjects = ['SBQQ__Quote__c', 'SBQQ__QuoteLine__c', 'SBQQ__Product__c'];
    for (const obj of cpqObjects) {
        if (queryObjectExists(orgAlias, obj)) {
            return true;
        }
    }
    return false;
}

/**
 * Validates that specified object exists in target org
 * @param {string} orgAlias - Target org
 * @param {string} objectName - Object to validate
 * @returns {Object} Validation result
 */
async function validateObjectExists(orgAlias, objectName) {
    console.log(colors.cyan(`\n🔍 Validating object: ${objectName} in ${orgAlias}...\n`));

    // Check if object exists as-is
    if (queryObjectExists(orgAlias, objectName)) {
        const isStandard = !objectName.includes('__');
        const isCPQ = CPQ_PREFIXES.some(prefix => objectName.startsWith(prefix));

        return {
            exists: true,
            actualName: objectName,
            isStandard: isStandard,
            isCPQ: isCPQ,
            suggestion: null,
            message: `✅ Object ${objectName} exists in org`
        };
    }

    // Object doesn't exist - provide suggestions
    const baseObjectName = objectName.replace(/__c$/, '').replace(/^SBQQ__/, '').replace(/^sbaa__/, '');
    const suggestions = [];

    // Check for variants
    if (OBJECT_VARIANTS[baseObjectName]) {
        for (const variant of OBJECT_VARIANTS[baseObjectName]) {
            if (queryObjectExists(orgAlias, variant)) {
                suggestions.push(variant);
            }
        }
    }

    // Check for similar objects
    const allObjects = getAllObjects(orgAlias);
    const similarObjects = allObjects.filter(obj =>
        obj.toLowerCase().includes(baseObjectName.toLowerCase()) ||
        baseObjectName.toLowerCase().includes(obj.replace(/__c$/, '').toLowerCase())
    );

    suggestions.push(...similarObjects.filter(obj => !suggestions.includes(obj)));

    return {
        exists: false,
        actualName: null,
        isStandard: false,
        isCPQ: false,
        suggestion: suggestions.length > 0 ? suggestions[0] : null,
        allSuggestions: suggestions,
        message: suggestions.length > 0
            ? `❌ Object ${objectName} does not exist. Did you mean: ${suggestions.join(', ')}?`
            : `❌ Object ${objectName} does not exist and no similar objects found.`
    };
}

/**
 * Discovers which variant of common objects exist
 * @param {string} orgAlias - Target org
 * @param {string} baseObject - Base object type
 * @returns {Object} Discovery result
 */
async function discoverObjectVariant(orgAlias, baseObject) {
    console.log(colors.cyan(`\n🔍 Discovering object variant for: ${baseObject} in ${orgAlias}...\n`));

    const variants = OBJECT_VARIANTS[baseObject];
    if (!variants) {
        // Not a known object with variants
        const exists = queryObjectExists(orgAlias, baseObject);
        return {
            exists: exists,
            variant: exists ? baseObject : null,
            hasCPQ: false,
            isStandard: !baseObject.includes('__'),
            message: exists
                ? `✅ Object ${baseObject} exists (no known variants)`
                : `❌ Object ${baseObject} does not exist`
        };
    }

    // Check each variant in order of preference
    for (const variant of variants) {
        if (queryObjectExists(orgAlias, variant)) {
            const isCPQ = CPQ_PREFIXES.some(prefix => variant.startsWith(prefix));
            const isStandard = !variant.includes('__');

            return {
                exists: true,
                variant: variant,
                hasCPQ: isCPQ,
                isStandard: isStandard,
                baseObject: baseObject,
                allVariants: variants,
                message: `✅ Found ${baseObject} as ${variant}${isCPQ ? ' (CPQ)' : ''}${isStandard ? ' (Standard)' : ''}`
            };
        }
    }

    // None of the variants exist
    return {
        exists: false,
        variant: null,
        hasCPQ: false,
        isStandard: false,
        baseObject: baseObject,
        allVariants: variants,
        message: `❌ None of the ${baseObject} variants exist: ${variants.join(', ')}`
    };
}

/**
 * Main execution function
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(colors.yellow('Usage: node object-existence-validator.js <orgAlias> <objectName> [--discover]'));
        console.log(colors.gray('\nExamples:'));
        console.log(colors.gray('  node object-existence-validator.js rentable-sandbox Quote'));
        console.log(colors.gray('  node object-existence-validator.js hivemq-prod SBQQ__Quote__c'));
        console.log(colors.gray('  node object-existence-validator.js myorg Quote --discover'));
        process.exit(1);
    }

    const orgAlias = args[0];
    const objectName = args[1];
    const discover = args.includes('--discover');

    try {
        let result;

        if (discover) {
            // Use discovery mode
            result = await discoverObjectVariant(orgAlias, objectName);
        } else {
            // Use validation mode
            result = await validateObjectExists(orgAlias, objectName);
        }

        // Display results
        console.log(result.message);

        if (!result.exists && result.allSuggestions && result.allSuggestions.length > 0) {
            console.log(colors.yellow('\n💡 Suggestions:'));
            result.allSuggestions.forEach(sugg => {
                console.log(colors.gray(`   - ${sugg}`));
            });
        }

        // Detect CPQ if not already done
        if (!discover && !result.exists) {
            const hasCPQ = detectCPQ(orgAlias);
            if (hasCPQ) {
                console.log(colors.cyan('\n📦 CPQ detected in org'));
                if (objectName === 'Quote' || objectName === 'QuoteLine') {
                    console.log(colors.yellow(`   💡 Try: SBQQ__${objectName}__c`));
                }
            }
        }

        // Output JSON for programmatic use
        if (process.env.JSON_OUTPUT) {
            console.log('\n' + JSON.stringify(result, null, 2));
        }

        // Exit with appropriate code
        process.exit(result.exists ? 0 : 1);

    } catch (error) {
        console.error(colors.red('❌ Error:'), error.message);
        process.exit(1);
    }
}

// Export functions for use as library
module.exports = {
    validateObjectExists,
    discoverObjectVariant,
    queryObjectExists,
    detectCPQ,
    getAllObjects
};

// Run if called directly
if (require.main === module) {
    main();
}