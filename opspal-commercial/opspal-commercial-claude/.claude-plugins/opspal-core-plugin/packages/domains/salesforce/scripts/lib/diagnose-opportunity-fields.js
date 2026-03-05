/**
 * Diagnose Opportunity report type fields
 */

const ReportsRestAPI = require('./reports-rest-api');

(async () => {
    try {
        const orgAlias = process.argv[2] || 'peregrine-main';

        console.log(`\n🔍 Diagnosing Opportunity report type fields\n`);

        // Create API instance
        const api = await ReportsRestAPI.fromSFAuth(orgAlias);

        console.log('✅ API instance created');

        // Describe Opportunity report type
        console.log('\n📊 Describing Opportunity report type...');
        const description = await api.describeReportType('Opportunity');

        console.log(`\n✅ Report Type: ${description.type}`);
        console.log(`   Label: ${description.label}`);
        console.log(`   Base Object: ${description.baseObject}`);
        console.log(`   Total Fields: ${description.totalFields}`);

        // Show first 30 fields
        console.log('\nFirst 30 fields:');
        description.fields.slice(0, 30).forEach((field, idx) => {
            console.log(`   ${idx + 1}. ${field.label} → ${field.token} (${field.dataType})`);
        });

        // Search for Owner-related fields
        console.log('\n🔍 Owner-related fields:');
        const ownerFields = description.fields.filter(f =>
            f.token.toLowerCase().includes('owner') ||
            f.label.toLowerCase().includes('owner')
        );
        ownerFields.forEach(f => {
            console.log(`   ✅ ${f.label} → ${f.token} (${f.dataType})`);
        });

        // Search for common template fields
        console.log('\n🔍 Common template fields:');
        const searchTerms = ['account', 'amount', 'close', 'stage', 'probability', 'name'];
        searchTerms.forEach(term => {
            const matches = description.fields.filter(f =>
                f.token.toLowerCase().includes(term) ||
                f.label.toLowerCase().includes(term)
            );
            if (matches.length > 0) {
                console.log(`\n   ${term.toUpperCase()}:`);
                matches.slice(0, 5).forEach(f => {
                    console.log(`     - ${f.label} → ${f.token}`);
                });
            }
        });

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        if (error.stack) {
            console.error(`\n${error.stack}`);
        }
        process.exit(1);
    }
})();
