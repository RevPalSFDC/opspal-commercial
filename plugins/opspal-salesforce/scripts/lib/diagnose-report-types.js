/**
 * Diagnostic script to check report type availability
 */

const ReportsRestAPI = require('./reports-rest-api');

(async () => {
    try {
        const orgAlias = process.argv[2] || process.env.ORG;
        if (!orgAlias) {
            console.error('Usage: node diagnose-report-types.js <org-alias>');
            process.exit(1);
        }

        console.log(`\n🔍 Diagnosing report types for org: ${orgAlias}\n`);

        // Create API instance
        const api = await ReportsRestAPI.fromSFAuth(orgAlias);

        console.log('✅ API instance created');
        console.log(`   Instance URL: ${api.instanceUrl}`);
        console.log(`   API Version: ${api.apiVersion}`);

        // Try to get report types
        console.log('\n📊 Fetching report types...');
        const types = await api.getReportTypes();

        console.log(`\n✅ Found ${types.length} report types`);

        // Show first 10
        console.log('\nFirst 10 report types:');
        types.slice(0, 10).forEach((type, idx) => {
            console.log(`   ${idx + 1}. ${type.label || 'N/A'} (${type.type || 'N/A'})`);
        });

        // Try to find Opportunity types
        console.log('\n🔍 Looking for Opportunity-related types:');
        const oppTypes = types.filter(t =>
            t.label?.toLowerCase().includes('opport') ||
            t.type?.toLowerCase().includes('opport')
        );

        if (oppTypes.length > 0) {
            oppTypes.forEach(type => {
                console.log(`   ✅ ${type.label} → ${type.type}`);
            });
        } else {
            console.log('   ⚠️  No Opportunity report types found');
        }

        // Try to resolve "Opportunity"
        console.log('\n🔍 Attempting to resolve "Opportunity":');
        try {
            const resolved = await api.resolveReportType('Opportunity');
            console.log(`   ✅ Resolved to: ${resolved}`);
        } catch (error) {
            console.log(`   ❌ Failed: ${error.message}`);
        }

        // Check cache
        console.log('\n📦 Cache status:');
        console.log(`   Report types cached: ${api.cache.reportTypes ? 'YES' : 'NO'}`);
        if (api.cache.reportTypes) {
            console.log(`   Cached count: ${api.cache.reportTypes.length}`);
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        if (error.stack) {
            console.error(`\n${error.stack}`);
        }
        process.exit(1);
    }
})();
