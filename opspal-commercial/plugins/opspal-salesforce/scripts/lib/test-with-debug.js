/**
 * Test with full debugging
 */

const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

(async () => {
    try {
        const orgAlias = 'acme-production';

        console.log(`\n🔍 Testing with full debugging\n`);

        // Get auth info
        const { stdout } = await execAsync(`sf org display --json --target-org ${orgAlias}`);
        const authData = JSON.parse(stdout);

        if (authData.status !== 0) {
            throw new Error('Authentication failed');
        }

        const instanceUrl = authData.result.instanceUrl;
        const accessToken = authData.result.accessToken;

        console.log('✅ Auth data retrieved');

        // Make API request
        const endpoint = `/services/data/v64.0/analytics/reportTypes`;
        const url = new URL(`${instanceUrl}${endpoint}`);

        console.log(`\n📡 Making request to: ${url}\n`);

        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        };

        const response = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = data ? JSON.parse(data) : null;
                        resolve({ statusCode: res.statusCode, body: result });
                    } catch (e) {
                        resolve({ statusCode: res.statusCode, body: null, parseError: e.message });
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });

        console.log(`✅ Response: ${response.statusCode}`);
        console.log(`   Body is array: ${Array.isArray(response.body)}`);
        console.log(`   Body length: ${response.body?.length || 0}`);

        if (Array.isArray(response.body)) {
            console.log(`\n🔍 Processing categories...`);
            const allTypes = [];
            response.body.forEach((category, idx) => {
                console.log(`\n   Category ${idx + 1}: ${category.label || 'N/A'}`);
                console.log(`     Has reportTypes: ${!!category.reportTypes}`);
                console.log(`     reportTypes is array: ${Array.isArray(category.reportTypes)}`);
                console.log(`     reportTypes length: ${category.reportTypes?.length || 0}`);

                if (category.reportTypes && Array.isArray(category.reportTypes)) {
                    allTypes.push(...category.reportTypes);
                }
            });

            console.log(`\n✅ Total types after flattening: ${allTypes.length}`);

            if (allTypes.length > 0) {
                console.log(`\nFirst 5 types:`);
                allTypes.slice(0, 5).forEach((type, idx) => {
                    console.log(`   ${idx + 1}. ${type.label} → ${type.type}`);
                });

                // Search for Opportunity
                const oppTypes = allTypes.filter(t =>
                    t.label?.toLowerCase().includes('opport') ||
                    t.type?.toLowerCase().includes('opport')
                );

                console.log(`\n🔍 Found ${oppTypes.length} Opportunity-related types:`);
                oppTypes.forEach(t => {
                    console.log(`   - ${t.label} → ${t.type}`);
                });
            }
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        if (error.stack) {
            console.error(`\n${error.stack}`);
        }
        process.exit(1);
    }
})();
