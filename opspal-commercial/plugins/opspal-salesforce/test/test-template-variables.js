/**
 * Test Template Variable Support in Salesforce Analytics REST API
 *
 * Purpose: Determine if Salesforce accepts template variables like $User.Id
 * in report filters via REST API, or if they must be added manually via UI.
 *
 * Test Cases:
 * 1. $User.Id - Current user's ID
 * 2. $User.ManagerId - Current user's manager
 * 3. $User.Role - Current user's role name
 *
 * Expected Outcomes:
 * - ✅ ACCEPTED: Variable stored as-is, evaluates dynamically per user
 * - ❌ REJECTED: API returns error about invalid filter value
 * - ⚠️ LITERAL: Variable stored as string "$User.Id" (treated as literal text)
 */

const ReportsRestAPI = require('../scripts/lib/reports-rest-api');

function resolveOrgAlias() {
    const org = process.env.SFDC_INSTANCE || process.env.SF_TARGET_ORG || process.env.ORG;
    if (!org) {
        console.error('❌ No org alias provided. Set SFDC_INSTANCE, SF_TARGET_ORG, or ORG.');
        process.exit(1);
    }
    return org;
}

async function testTemplateVariables() {
    console.log('\n🧪 Testing Template Variable Support in Analytics REST API\n');

    const api = await ReportsRestAPI.fromSFAuth(resolveOrgAlias());

    // Test cases: different template variables
    const testCases = [
        {
            name: '$User.Id',
            description: 'Current user ID',
            filter: {
                column: 'OWNER_ID',
                operator: 'equals',
                value: '$User.Id'
            }
        },
        {
            name: '$User.ManagerId',
            description: 'Current user manager ID',
            filter: {
                column: 'REPORTS_TO_ID',
                operator: 'equals',
                value: '$User.ManagerId'
            }
        },
        {
            name: '$User.Role',
            description: 'Current user role',
            filter: {
                column: 'OWNER_ROLE',
                operator: 'equals',
                value: '$User.Role'
            }
        }
    ];

    const results = [];

    for (const testCase of testCases) {
        console.log(`\n━━━ Test: ${testCase.name} (${testCase.description}) ━━━`);

        const reportMetadata = {
            name: `TEST: Template Variable ${testCase.name}`,
            reportType: { type: 'Opportunity' },
            reportFormat: 'TABULAR',
            detailColumns: ['OPPORTUNITY_NAME', 'ACCOUNT_NAME'],
            reportFilters: [testCase.filter]
        };

        // Get a writable folder
        const folders = await api.getWritableFolders();
        if (folders.length > 0) {
            reportMetadata.folderId = folders[0].id;
        }

        try {
            console.log(`   📝 Creating report with filter: ${testCase.filter.column} = ${testCase.filter.value}`);

            const result = await api.createReport(reportMetadata);

            console.log(`   ✅ ACCEPTED: Report created with ID ${result.reportId}`);

            // Query back the filter to see how it's stored
            console.log('   🔍 Querying report to verify filter storage...');
            const endpoint = `/services/data/${api.apiVersion}/analytics/reports/${result.reportId}/describe`;
            const describe = await api.apiRequest(endpoint);

            const appliedFilter = describe.reportMetadata.reportFilters.find(
                f => f.column === testCase.filter.column
            );

            if (appliedFilter) {
                console.log(`   📊 Stored filter value: "${appliedFilter.value}"`);

                if (appliedFilter.value === testCase.filter.value) {
                    console.log(`   ✅ Variable preserved as-is (likely dynamic)`);
                    results.push({
                        variable: testCase.name,
                        status: 'ACCEPTED',
                        storedAs: appliedFilter.value,
                        reportId: result.reportId,
                        conclusion: 'API accepts template variables - likely evaluates dynamically'
                    });
                } else {
                    console.log(`   ⚠️  Value changed to: ${appliedFilter.value}`);
                    results.push({
                        variable: testCase.name,
                        status: 'MODIFIED',
                        storedAs: appliedFilter.value,
                        reportId: result.reportId,
                        conclusion: 'API modified the value - check if it resolves correctly'
                    });
                }
            } else {
                console.log(`   ⚠️  Filter not found in report metadata`);
                results.push({
                    variable: testCase.name,
                    status: 'MISSING',
                    reportId: result.reportId,
                    conclusion: 'Filter was not applied - may have been silently dropped'
                });
            }

            // Clean up test report
            console.log(`   🧹 Cleaning up test report...`);
            await api.deleteReport(result.reportId);

        } catch (error) {
            console.log(`   ❌ REJECTED: ${error.message}`);

            const errorDetails = error.body ? JSON.stringify(error.body, null, 2) : 'No details';
            console.log(`   📋 Error details: ${errorDetails}`);

            results.push({
                variable: testCase.name,
                status: 'REJECTED',
                error: error.message,
                errorCode: error.statusCode,
                conclusion: 'API does not accept template variables in this format'
            });
        }
    }

    // Summary
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 TEMPLATE VARIABLE TEST SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.variable}`);
        console.log(`   Status: ${result.status}`);
        if (result.storedAs) console.log(`   Stored As: ${result.storedAs}`);
        if (result.error) console.log(`   Error: ${result.error}`);
        console.log(`   Conclusion: ${result.conclusion}`);
        console.log('');
    });

    // Overall assessment
    const acceptedCount = results.filter(r => r.status === 'ACCEPTED').length;
    const rejectedCount = results.filter(r => r.status === 'REJECTED').length;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 OVERALL ASSESSMENT\n');

    if (acceptedCount === testCases.length) {
        console.log('✅ RESULT: Salesforce Analytics REST API ACCEPTS template variables');
        console.log('   → Implementation: Remove skip logic, pass variables through');
        console.log('   → Variables will evaluate dynamically per user viewing report');
    } else if (rejectedCount === testCases.length) {
        console.log('❌ RESULT: Salesforce Analytics REST API REJECTS template variables');
        console.log('   → Implementation: Keep skip logic, document manual addition via UI');
        console.log('   → Users must add dynamic filters manually in Salesforce UI');
    } else {
        console.log('⚠️  RESULT: Mixed results - some variables work, some don\'t');
        console.log('   → Implementation: Selective pass-through based on test results');
        console.log('   → Document which variables work programmatically vs manually');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return results;
}

// Run tests
if (require.main === module) {
    testTemplateVariables()
        .then(results => {
            console.log('✅ Template variable testing complete');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Test failed:', error.message);
            if (error.stack) console.error(error.stack);
            process.exit(1);
        });
}

module.exports = testTemplateVariables;
