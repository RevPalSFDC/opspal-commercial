#!/usr/bin/env node

/**
 * MCP Metadata Tools Diagnostic Test Suite
 * Tests all MCP metadata operations end-to-end
 */

const path = require('path');
const fs = require('fs').promises;

// Import the metadata tools
const { MetadataTools } = require('./mcp-extensions/tools/metadata-tools');

// Colors for output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(80));
    log(title, 'bright');
    console.log('='.repeat(80));
}

function logCommand(command, params) {
    log(`\n📋 Command: ${command}`, 'cyan');
    log(`📝 Parameters: ${JSON.stringify(params, null, 2)}`, 'cyan');
}

function logResult(success, result) {
    if (success) {
        log('✅ SUCCESS', 'green');
        console.log(JSON.stringify(result, null, 2));
    } else {
        log('❌ FAILED', 'red');
        console.error(result);
    }
}

function resolveOrgAlias() {
    const args = process.argv.slice(2);
    const orgIndex = args.findIndex(arg => arg === '--org' || arg === '--target-org');
    const orgFromArgs = orgIndex >= 0 ? args[orgIndex + 1] : null;
    const org = orgFromArgs || process.env.SFDC_INSTANCE || process.env.SF_TARGET_ORG || process.env.ORG;

    if (!org) {
        log('❌ No org alias provided. Use --org or set SFDC_INSTANCE/SF_TARGET_ORG/ORG.', 'red');
        process.exit(1);
    }

    return org;
}

async function runTest(tools, command, params, description) {
    log(`\n🧪 Test: ${description}`, 'yellow');
    logCommand(command, params);

    try {
        const handler = tools.getToolDefinitions()[command].handler;
        const result = await handler(params);
        logResult(true, result);
        return { success: true, result };
    } catch (error) {
        logResult(false, error);
        return { success: false, error: error.message || error };
    }
}

async function main() {
    const orgAlias = resolveOrgAlias();

    logSection('MCP METADATA TOOLS DIAGNOSTIC TEST SUITE');
    log(`Target Org: ${orgAlias}`, 'blue');
    log(`Timestamp: ${new Date().toISOString()}`, 'blue');

    // Set the default username
    process.env.SF_TARGET_ORG = orgAlias;

    // Initialize metadata tools
    const tools = new MetadataTools({
        stage: 'production',
        org: orgAlias
    });

    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    // Test 1: Quick Action Creation and Placement
    logSection('1. QUICK ACTION CREATION & PLACEMENT');

    const quickActionCreate = await runTest(
        tools,
        'mcp_salesforce_quick_action_create',
        {
            objectName: 'Account',
            developerName: 'Account_Auto_Test',
            label: 'Account Auto Test',
            actionType: 'Update',
            fields: ['Name']
        },
        'Create Quick Action on Account'
    );
    results.tests.push({ name: 'Quick Action Create', ...quickActionCreate });

    if (quickActionCreate.success) {
        const quickActionAssign = await runTest(
            tools,
            'mcp_salesforce_quick_action_assign',
            {
                objectName: 'Account',
                layoutName: 'Account Layout',
                actionName: 'Account.Account_Auto_Test',
                contexts: ['Record', 'Mobile'],
                position: 'end'
            },
            'Assign Quick Action to Layout'
        );
        results.tests.push({ name: 'Quick Action Assign', ...quickActionAssign });
    }

    // Test 2: Duplicate Rule Toggle
    logSection('2. DUPLICATE RULE TOGGLE');

    const duplicateActivate = await runTest(
        tools,
        'mcp_salesforce_duplicate_rule_toggle',
        {
            objectName: 'Account',
            ruleName: 'Standard_Account_DuplicateRule',
            active: true
        },
        'Activate Account Duplicate Rule'
    );
    results.tests.push({ name: 'Duplicate Rule Activate', ...duplicateActivate });

    const duplicateDeactivate = await runTest(
        tools,
        'mcp_salesforce_duplicate_rule_toggle',
        {
            objectName: 'Account',
            ruleName: 'Standard_Account_DuplicateRule',
            active: false
        },
        'Deactivate Account Duplicate Rule'
    );
    results.tests.push({ name: 'Duplicate Rule Deactivate', ...duplicateDeactivate });

    // Test 3: Translation Updates
    logSection('3. TRANSLATION UPDATES (GLOBAL VALUE SET)');

    const translationUpdate = await runTest(
        tools,
        'mcp_salesforce_translation_global_picklist',
        {
            locale: 'fr',
            globalValueSet: 'Industry',
            value: 'Agriculture',
            translation: 'Agriculture (FR)'
        },
        'Update French Translation for Industry'
    );
    results.tests.push({ name: 'Translation Update', ...translationUpdate });

    // Verify the translation
    if (translationUpdate.success) {
        log('\n📖 Retrieving French translations to verify...', 'yellow');
        try {
            const { execSync } = require('child_process');
            const retrieveCmd = `sf project retrieve start --metadata "Translations:fr" --target-org ${orgAlias} --json`;
            const retrieveResult = JSON.parse(execSync(retrieveCmd, { encoding: 'utf8' }));

            if (retrieveResult.status === 0) {
                // Check if translation file exists and read it
                const translationFile = path.join(process.cwd(), 'force-app/main/default/translations/fr.translation-meta.xml');
                const exists = await fs.access(translationFile).then(() => true).catch(() => false);

                if (exists) {
                    const content = await fs.readFile(translationFile, 'utf8');
                    const industryMatch = content.match(/<globalPicklists>[\s\S]*?<name>Industry<\/name>[\s\S]*?<\/globalPicklists>/);
                    if (industryMatch) {
                        log('✅ Translation file snippet:', 'green');
                        console.log(industryMatch[0]);
                    }
                }
            }
        } catch (error) {
            log('⚠️  Could not retrieve translation for verification', 'yellow');
        }
    }

    // Test 4: Record Type Assignment Batching
    logSection('4. RECORD TYPE ASSIGNMENT BATCHING');

    const recordTypeAssign = await runTest(
        tools,
        'mcp_salesforce_recordtype_assign_profiles',
        {
            objectName: 'Account',
            developerName: 'Retail',
            profileNames: ['System Administrator', 'Standard User'],
            makeDefault: true
        },
        'Batch Assign Record Type to Profiles'
    );
    results.tests.push({ name: 'Record Type Assignment', ...recordTypeAssign });

    // Test 5: Picklist Value Operations
    logSection('5. PICKLIST VALUE ADD & REMOVE');

    // First check if Status__c field exists
    log('\n🔍 Checking if Account.Status__c exists...', 'yellow');
    try {
        const { execSync } = require('child_process');
        const describeCmd = `sf sobject describe --sobject Account --json --target-org ${orgAlias}`;
        const describeResult = JSON.parse(execSync(describeCmd, { encoding: 'utf8' }));

        const statusField = describeResult.result.fields.find(f => f.name === 'Status__c');
        if (statusField) {
            log('✅ Field Status__c exists, proceeding with test', 'green');

            const picklistAdd = await runTest(
                tools,
                'mcp_salesforce_picklist_add_values',
                {
                    objectName: 'Account',
                    fieldName: 'Status__c',
                    values: ['AutoTest']
                },
                'Add Picklist Value'
            );
            results.tests.push({ name: 'Picklist Add Value', ...picklistAdd });

            if (picklistAdd.success) {
                const picklistRemove = await runTest(
                    tools,
                    'mcp_salesforce_picklist_remove_values',
                    {
                        objectName: 'Account',
                        fieldApiName: 'Status__c',
                        values: ['AutoTest']
                    },
                    'Remove Picklist Value'
                );
                results.tests.push({ name: 'Picklist Remove Value', ...picklistRemove });
            }
        } else {
            log('⚠️  Field Status__c does not exist, creating it first', 'yellow');
            // Create the field first
            const fieldCreate = await runTest(
                tools,
                'mcp_salesforce_field_create',
                {
                    objectName: 'Account',
                    fieldName: 'Status__c',
                    fieldType: 'Picklist',
                    label: 'Status',
                    picklistValues: ['Active', 'Inactive', 'Pending']
                },
                'Create Status__c Picklist Field'
            );

            if (fieldCreate.success) {
                // Now test add/remove
                const picklistAdd = await runTest(
                    tools,
                    'mcp_salesforce_picklist_add_values',
                    {
                        objectName: 'Account',
                        fieldApiName: 'Status__c',
                        values: ['AutoTest']
                    },
                    'Add Picklist Value'
                );
                results.tests.push({ name: 'Picklist Add Value', ...picklistAdd });

                if (picklistAdd.success) {
                    const picklistRemove = await runTest(
                        tools,
                        'mcp_salesforce_picklist_remove_values',
                        {
                            objectName: 'Account',
                            fieldName: 'Status__c',
                            values: ['AutoTest']
                        },
                        'Remove Picklist Value'
                    );
                    results.tests.push({ name: 'Picklist Remove Value', ...picklistRemove });
                }
            }
        }
    } catch (error) {
        log('⚠️  Could not check field existence, proceeding anyway', 'yellow');
    }

    // Summary
    logSection('TEST SUMMARY');

    results.passed = results.tests.filter(t => t.success).length;
    results.failed = results.tests.filter(t => !t.success).length;

    log(`Total Tests: ${results.tests.length}`, 'bright');
    log(`✅ Passed: ${results.passed}`, 'green');
    log(`❌ Failed: ${results.failed}`, 'red');

    console.log('\n📊 Detailed Results:');
    results.tests.forEach((test, index) => {
        const icon = test.success ? '✅' : '❌';
        const color = test.success ? 'green' : 'red';
        log(`${index + 1}. ${icon} ${test.name}`, color);
        if (!test.success && test.error) {
            console.log(`   Error: ${test.error}`);
        }
    });

    // Write results to file
    const resultsFile = path.join(process.cwd(), 'mcp-diagnostic-results.json');
    await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
    log(`\n📄 Results saved to: ${resultsFile}`, 'blue');

    process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
main().catch(error => {
    log('Fatal error running tests:', 'red');
    console.error(error);
    process.exit(1);
});
