#!/usr/bin/env node

/**
 * Universal Report Creation Test
 * 
 * Tests report creation across any Salesforce instance
 * Usage: node test-universal-report.js [org-alias]
 */

const UniversalReportCreator = require('./lib/universal-report-creator');

async function main() {
    const orgAlias = process.argv[2] || process.env.SF_TARGET_ORG || process.env.SF_TARGET_ORG;
    
    if (!orgAlias) {
        console.error('Usage: node test-universal-report.js [org-alias]');
        console.error('Or set SF_TARGET_ORG environment variable');
        process.exit(1);
    }

    console.log(`\n🔧 Testing Universal Report Creation for: ${orgAlias}`);
    console.log('='.repeat(60));

    try {
        // Initialize creator
        console.log('\n📊 Initializing Universal Report Creator...');
        const creator = await UniversalReportCreator.create(orgAlias);
        
        // Display org capabilities
        console.log('\n🔍 Detected Org Capabilities:');
        const summary = creator.getCapabilitiesSummary();
        console.log(`  • Standard Objects: ${summary.standardObjects.join(', ') || 'None'}`);
        console.log(`  • Custom Objects: ${summary.customObjects}`);
        console.log(`  • Has Activities: ${summary.hasActivities ? '✓' : '✗'}`);
        console.log(`  • Has Gong: ${summary.hasGong ? '✓' : '✗'}`);
        console.log(`  • Writable Folders: ${summary.writableFolders}`);
        console.log(`  • Recommendation: ${summary.recommendation}`);
        
        // Test 1: Simple report
        console.log('\n📝 Test 1: Creating Simple Adaptive Report...');
        try {
            const result1 = await creator.createSimpleReport('Universal_Test_Simple');
            console.log(`  ✅ Created: ${result1.reportName} (${result1.reportId})`);
            console.log(`  📁 Folder: ${result1.folder}`);
            console.log(`  📊 Fields: ${result1.fieldCount}`);
            console.log(`  🔗 URL: ${result1.url}`);
        } catch (error) {
            console.log(`  ❌ Failed: ${error.message}`);
        }
        
        // Test 2: Activities report (if available)
        if (summary.hasActivities) {
            console.log('\n📝 Test 2: Creating Activities Report...');
            try {
                const result2 = await creator.createActivitiesReport({
                    name: 'Universal_Test_Activities'
                });
                console.log(`  ✅ Created: ${result2.reportName} (${result2.reportId})`);
            } catch (error) {
                console.log(`  ❌ Failed: ${error.message}`);
            }
        } else {
            console.log('\n📝 Test 2: Activities Report - SKIPPED (not available)');
        }
        
        // Test 3: Summary report with grouping
        console.log('\n📝 Test 3: Creating Summary Report with Grouping...');
        try {
            const result3 = await creator.createSummaryReport({
                name: 'Universal_Test_Summary',
                reportType: summary.standardObjects[0] || 'Opportunity'
            });
            console.log(`  ✅ Created: ${result3.reportName} (${result3.reportId})`);
            console.log(`  📊 Type: ${result3.metadata.reportType.type}`);
            console.log(`  📈 Format: ${result3.metadata.reportFormat}`);
        } catch (error) {
            console.log(`  ❌ Failed: ${error.message}`);
        }
        
        // Test 4: Custom adaptive report
        console.log('\n📝 Test 4: Creating Fully Adaptive Report...');
        try {
            const result4 = await creator.createAdaptiveReport({
                name: 'Universal_Test_Adaptive',
                format: 'TABULAR',
                filters: [
                    {
                        field: 'CREATED_DATE',
                        operator: 'equals',
                        value: 'THIS_MONTH'
                    }
                ]
            });
            console.log(`  ✅ Created: ${result4.reportName} (${result4.reportId})`);
            console.log(`  📊 Auto-selected type: ${result4.metadata.reportType.type}`);
            console.log(`  📋 Auto-selected fields: ${result4.metadata.detailColumns.slice(0, 3).join(', ')}...`);
        } catch (error) {
            console.log(`  ❌ Failed: ${error.message}`);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Universal Report Testing Complete!');
        console.log('\nThese reports work across ANY Salesforce instance by:');
        console.log('  1. Auto-detecting available objects and fields');
        console.log('  2. Using only standard, universal field tokens');
        console.log('  3. Adapting to org-specific capabilities');
        console.log('  4. Self-healing validation errors');
        
    } catch (error) {
        console.error(`\n❌ Fatal Error: ${error.message}`);
        console.error('\nTroubleshooting:');
        console.error('  1. Verify authentication: sf org display');
        console.error('  2. Check user permissions for report creation');
        console.error('  3. Ensure at least one folder has write access');
        process.exit(1);
    }
}

// Run the test
main().catch(console.error);