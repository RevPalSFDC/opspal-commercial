/**
 * Test Analytics API directly without cache
 */

const ReportsRestAPI = require('./reports-rest-api');

(async () => {
    try {
        const orgAlias = process.argv[2] || 'peregrine-main';

        console.log(`\n🔍 Testing Analytics API (no cache) for org: ${orgAlias}\n`);

        // Create API instance
        const api = await ReportsRestAPI.fromSFAuth(orgAlias);

        // Force clear cache
        api.cache.reportTypes = null;

        console.log('✅ API instance created (cache cleared)');

        // Fetch report types directly
        console.log('\n📊 Fetching report types (bypassing cache)...');
        const types = await api.getReportTypes();

        console.log(`\n✅ Found ${types.length} report types`);

        // Show first 20
        console.log('\nFirst 20 report types:');
        types.slice(0, 20).forEach((type, idx) => {
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

            // Try to resolve "Opportunity"
            console.log('\n🔍 Attempting to resolve "Opportunity":');
            try {
                const resolved = await api.resolveReportType('Opportunity');
                console.log(`   ✅ Resolved to: ${resolved}`);
            } catch (error) {
                console.log(`   ❌ Failed: ${error.message}`);
            }
        } else {
            console.log('   ⚠️  No Opportunity report types found');
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        if (error.stack) {
            console.error(`\n${error.stack}`);
        }
        process.exit(1);
    }
})();
