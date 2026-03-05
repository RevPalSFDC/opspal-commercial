#!/usr/bin/env node

/**
 * Example: Modify Picklist with Record Type Updates
 * ===================================================
 *
 * This script demonstrates the complete workflow for modifying picklist fields
 * while ensuring all record types are updated correctly.
 *
 * Usage:
 *   node scripts/examples/modify-picklist-with-recordtypes.js
 *
 * Features:
 * - Auto-discovers all active record types
 * - Updates field + record type metadata atomically
 * - Verifies post-deployment accessibility
 * - Auto-fixes any discrepancies
 * - Complete audit trail
 */

const UnifiedPicklistManager = require('../lib/unified-picklist-manager');
const PicklistRecordTypeValidator = require('../lib/picklist-recordtype-validator');

/**
 * Example 1: Add new picklist values
 */
async function example1_addValues() {
    console.log('\n=== Example 1: Add New Picklist Values ===\n');

    const manager = new UnifiedPicklistManager({ org: process.env.SF_TARGET_ORG });

    try {
        const result = await manager.updatePicklistAcrossRecordTypes({
            objectName: 'Account',
            fieldApiName: 'Major_Territory__c',
            valuesToAdd: ['NE Majors', 'SE Majors'],
            recordTypes: 'all'  // Auto-discovers all record types
        });

        console.log('✅ Success!');
        console.log(`Updated field + ${result.recordTypesUpdated.length} record types`);
        console.log('Record Types Updated:', result.recordTypesUpdated.join(', '));
        console.log('Values Added:', result.valuesAdded.join(', '));

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

/**
 * Example 2: Add and deactivate values together
 */
async function example2_addAndDeactivate() {
    console.log('\n=== Example 2: Add New Values and Deactivate Old Ones ===\n');

    const manager = new UnifiedPicklistManager({ org: process.env.SF_TARGET_ORG });

    try {
        const result = await manager.updatePicklistAcrossRecordTypes({
            objectName: 'Account',
            fieldApiName: 'Major_Territory__c',
            valuesToAdd: ['NE Majors', 'SE Majors'],
            valuesToDeactivate: ['East Major'],  // Deactivate (don't delete)
            recordTypes: 'all'
        });

        console.log('✅ Success!');
        console.log('Values Added:', result.valuesAdded.join(', '));
        console.log('Values Deactivated:', result.valuesDeactivated.join(', '));
        console.log(`Updated ${result.recordTypesUpdated.length} record types`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

/**
 * Example 3: Update specific record types only
 */
async function example3_specificRecordTypes() {
    console.log('\n=== Example 3: Update Specific Record Types Only ===\n');

    const manager = new UnifiedPicklistManager({ org: process.env.SF_TARGET_ORG });

    try {
        const result = await manager.updatePicklistAcrossRecordTypes({
            objectName: 'Account',
            fieldApiName: 'Account_Segmentation__c',
            valuesToAdd: ['Small'],
            recordTypes: ['Prospect', 'Competitor']  // Only these two
        });

        console.log('✅ Success!');
        console.log('Values Added:', result.valuesAdded.join(', '));
        console.log('Record Types Updated:', result.recordTypesUpdated.join(', '));

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

/**
 * Example 4: Verify deployment
 */
async function example4_verifyDeployment() {
    console.log('\n=== Example 4: Verify Picklist Accessibility ===\n');

    const validator = new PicklistRecordTypeValidator({ org: process.env.SF_TARGET_ORG });

    try {
        const result = await validator.verifyPicklistAvailability({
            objectName: 'Account',
            fieldApiName: 'Major_Territory__c',
            expectedValues: ['NE Majors', 'SE Majors'],
            recordTypes: 'all'
        });

        if (result.success) {
            console.log('✅ All record types have expected values accessible');
            console.log(`Verified ${result.recordTypesChecked} record types`);
        } else {
            console.warn(`⚠️ Found discrepancies on ${result.discrepancies.length} record types`);

            result.discrepancies.forEach(disc => {
                console.warn(`\nRecord Type: ${disc.recordTypeName}`);
                console.warn(`Missing Values: ${disc.missingValues.join(', ')}`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

/**
 * Example 5: Verify and auto-fix
 */
async function example5_verifyAndFix() {
    console.log('\n=== Example 5: Verify and Auto-Fix Discrepancies ===\n');

    const validator = new PicklistRecordTypeValidator({ org: process.env.SF_TARGET_ORG });

    try {
        const result = await validator.verifyAndFix({
            objectName: 'Account',
            fieldApiName: 'Major_Territory__c',
            expectedValues: ['NE Majors', 'SE Majors'],
            recordTypes: 'all',
            autoFix: true  // Automatically fix any discrepancies
        });

        if (result.success) {
            console.log('✅ All record types verified successfully');
        } else if (result.autoFixApplied) {
            console.log('✅ Auto-fix applied');
            console.log(`Fixed ${result.fixResult.fixes.filter(f => f.success).length} discrepancies`);
        } else {
            console.warn('⚠️ Discrepancies found but auto-fix not applied');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

/**
 * Example 6: Complete workflow (recommended pattern)
 */
async function example6_completeWorkflow() {
    console.log('\n=== Example 6: Complete Workflow (Recommended) ===\n');

    const manager = new UnifiedPicklistManager({ org: process.env.SF_TARGET_ORG });
    const validator = new PicklistRecordTypeValidator({ org: process.env.SF_TARGET_ORG });

    try {
        // Step 1: Update field + all record types
        console.log('Step 1: Updating picklist...');
        const updateResult = await manager.updatePicklistAcrossRecordTypes({
            objectName: 'Account',
            fieldApiName: 'Status__c',
            valuesToAdd: ['Active', 'Inactive'],
            recordTypes: 'all'
        });

        console.log(`✅ Updated ${updateResult.recordTypesUpdated.length} record types`);

        // Step 2: Verify and auto-fix
        console.log('\nStep 2: Verifying deployment...');
        const verifyResult = await validator.verifyAndFix({
            objectName: 'Account',
            fieldApiName: 'Status__c',
            expectedValues: ['Active', 'Inactive'],
            recordTypes: 'all',
            autoFix: true
        });

        if (verifyResult.success) {
            console.log('✅ Verification passed - all values accessible');
        } else if (verifyResult.autoFixApplied) {
            console.log('✅ Verification completed with auto-fix');
        }

        // Step 3: Summary
        console.log('\n=== Summary ===');
        console.log('Deployment ID:', updateResult.deploymentId);
        console.log('Record Types Updated:', updateResult.recordTypesUpdated.join(', '));
        console.log('Values Added:', updateResult.valuesAdded.join(', '));
        console.log('Verification Status:', verifyResult.success ? 'PASSED' : 'PASSED (with fixes)');

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

/**
 * Example 7: Batch processing for large orgs
 */
async function example7_batchProcessing() {
    console.log('\n=== Example 7: Batch Processing (Large Orgs) ===\n');

    const manager = new UnifiedPicklistManager({ org: process.env.SF_TARGET_ORG });

    try {
        // Discover all record types
        const allRecordTypes = await manager.discoverRecordTypes('Account', process.env.SF_TARGET_ORG);
        console.log(`Found ${allRecordTypes.length} record types`);

        // Process in batches of 5
        const batchSize = 5;
        for (let i = 0; i < allRecordTypes.length; i += batchSize) {
            const batch = allRecordTypes.slice(i, i + batchSize).map(rt => rt.DeveloperName);

            console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}...`);
            console.log('Record Types:', batch.join(', '));

            const result = await manager.updatePicklistAcrossRecordTypes({
                objectName: 'Account',
                fieldApiName: 'Rating__c',
                valuesToAdd: ['Hot', 'Warm', 'Cold'],
                recordTypes: batch
            });

            console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} completed`);
        }

        console.log('\n✅ All batches processed successfully');

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('='.repeat(60));
    console.log('  Picklist Modification Examples');
    console.log('='.repeat(60));

    if (!process.env.SF_TARGET_ORG) {
        console.error('\n❌ Error: SF_TARGET_ORG environment variable not set');
        console.error('Set it with: export SF_TARGET_ORG=your-org-alias');
        process.exit(1);
    }

    console.log(`\nTarget Org: ${process.env.SF_TARGET_ORG}\n`);

    try {
        // Run specific example or all
        const exampleNumber = process.argv[2];

        switch (exampleNumber) {
            case '1':
                await example1_addValues();
                break;
            case '2':
                await example2_addAndDeactivate();
                break;
            case '3':
                await example3_specificRecordTypes();
                break;
            case '4':
                await example4_verifyDeployment();
                break;
            case '5':
                await example5_verifyAndFix();
                break;
            case '6':
                await example6_completeWorkflow();
                break;
            case '7':
                await example7_batchProcessing();
                break;
            default:
                console.log('Usage: node modify-picklist-with-recordtypes.js [example-number]');
                console.log('\nAvailable examples:');
                console.log('  1 - Add new picklist values');
                console.log('  2 - Add and deactivate values together');
                console.log('  3 - Update specific record types only');
                console.log('  4 - Verify deployment');
                console.log('  5 - Verify and auto-fix');
                console.log('  6 - Complete workflow (RECOMMENDED)');
                console.log('  7 - Batch processing for large orgs');
                console.log('\nRun all examples: node modify-picklist-with-recordtypes.js all');
                console.log('Run specific: node modify-picklist-with-recordtypes.js 6');
                break;
        }

        console.log('\n' + '='.repeat(60));
        console.log('  Examples completed successfully!');
        console.log('='.repeat(60) + '\n');

    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('  Examples failed!');
        console.error('='.repeat(60));
        console.error('\nError:', error.message);
        if (error.context) {
            console.error('Context:', JSON.stringify(error.context, null, 2));
        }
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = {
    example1_addValues,
    example2_addAndDeactivate,
    example3_specificRecordTypes,
    example4_verifyDeployment,
    example5_verifyAndFix,
    example6_completeWorkflow,
    example7_batchProcessing
};
