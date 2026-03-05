/**
 * Test describe report type API directly
 */

const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

(async () => {
    try {
        const orgAlias = 'peregrine-main';

        console.log(`\n🔍 Testing describe report type API\n`);

        // Get auth info
        const { stdout } = await execAsync(`sf org display --json --target-org ${orgAlias}`);
        const authData = JSON.parse(stdout);

        if (authData.status !== 0) {
            throw new Error('Authentication failed');
        }

        const instanceUrl = authData.result.instanceUrl;
        const accessToken = authData.result.accessToken;

        console.log('✅ Auth data retrieved');

        // Test describe endpoint
        const endpoint = `/services/data/v64.0/analytics/reportTypes/Opportunity`;
        const url = new URL(`${instanceUrl}${endpoint}`);

        console.log(`\n📡 Testing endpoint: ${url}\n`);

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

        if (response.body) {
            console.log(`\n📦 Response structure:`);
            console.log(`   Has reportMetadata: ${!!response.body.reportMetadata}`);
            console.log(`   Has reportExtendedMetadata: ${!!response.body.reportExtendedMetadata}`);
            console.log(`   Has reportTypeMetadata: ${!!response.body.reportTypeMetadata}`);

            if (response.body.reportMetadata) {
                const rm = response.body.reportMetadata;
                console.log(`\n   reportMetadata keys:`, Object.keys(rm));
                console.log(`     Has detailColumnInfo: ${!!rm.detailColumnInfo}`);

                if (rm.detailColumnInfo) {
                    const sections = Object.keys(rm.detailColumnInfo);
                    console.log(`     Sections (${sections.length}):`, sections.slice(0, 10));

                    if (sections.length > 0) {
                        const firstSection = sections[0];
                        const fields = rm.detailColumnInfo[firstSection];
                        console.log(`\n     Section "${firstSection}" has ${Object.keys(fields).length} fields`);
                        console.log(`     First 10 fields:`);
                        Object.entries(fields).slice(0, 10).forEach(([key, value]) => {
                            console.log(`       ${key} → ${value.label} (${value.dataType})`);
                        });
                    }
                }
            }

            if (response.body.reportExtendedMetadata) {
                const rem = response.body.reportExtendedMetadata;
                console.log(`\n   reportExtendedMetadata keys:`, Object.keys(rem).slice(0, 10));
                console.log(`     Has detailColumnInfo: ${!!rem.detailColumnInfo}`);
            }

            if (response.body.reportTypeMetadata) {
                const rtm = response.body.reportTypeMetadata;
                console.log(`\n   reportTypeMetadata keys:`, Object.keys(rtm).slice(0, 10));
            }

            // Show raw JSON (first 2000 chars)
            console.log(`\n📄 Raw JSON (first 2000 chars):`);
            console.log(JSON.stringify(response.body, null, 2).substring(0, 2000));
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        if (error.stack) {
            console.error(`\n${error.stack}`);
        }
        process.exit(1);
    }
})();
