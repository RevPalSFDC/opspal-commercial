/**
 * Test Analytics API directly to see raw responses
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const https = require('https');
const execAsync = promisify(exec);

(async () => {
    try {
        const orgAlias = process.argv[2] || 'peregrine-main';

        console.log(`\n🔍 Testing Analytics API for org: ${orgAlias}\n`);

        // Get auth info
        const { stdout } = await execAsync(`sf org display --json --target-org ${orgAlias}`);
        const authData = JSON.parse(stdout);

        if (authData.status !== 0) {
            throw new Error('Authentication failed');
        }

        const instanceUrl = authData.result.instanceUrl;
        const accessToken = authData.result.accessToken;

        console.log('✅ Auth data retrieved');
        console.log(`   Instance URL: ${instanceUrl}`);
        console.log(`   Token: ${accessToken.substring(0, 20)}...`);

        // Test Analytics API
        const endpoint = `/services/data/v64.0/analytics/reportTypes`;
        const url = new URL(`${instanceUrl}${endpoint}`);

        console.log(`\n📡 Testing endpoint: ${url}`);

        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
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
                        resolve({ statusCode: res.statusCode, body: result, rawData: data });
                    } catch (e) {
                        resolve({ statusCode: res.statusCode, body: null, rawData: data, parseError: e.message });
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });

        console.log(`\n✅ Response received:`);
        console.log(`   Status Code: ${response.statusCode}`);
        console.log(`   Raw Data Length: ${response.rawData?.length || 0} bytes`);

        if (response.body) {
            if (Array.isArray(response.body)) {
                console.log(`   Array with ${response.body.length} items`);
                if (response.body.length > 0) {
                    console.log(`\nFirst item:`, JSON.stringify(response.body[0], null, 2));
                }
            } else if (response.body.reportTypes) {
                console.log(`   Object with reportTypes array: ${response.body.reportTypes.length} items`);
                if (response.body.reportTypes.length > 0) {
                    console.log(`\nFirst item:`, JSON.stringify(response.body.reportTypes[0], null, 2));
                }
            } else {
                console.log(`   Other object:`, JSON.stringify(response.body, null, 2).substring(0, 500));
            }
        } else {
            console.log(`   No body or parse error: ${response.parseError || 'N/A'}`);
            console.log(`\nRaw data (first 500 chars):`);
            console.log(response.rawData?.substring(0, 500) || 'N/A');
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        if (error.stack) {
            console.error(`\n${error.stack}`);
        }
        process.exit(1);
    }
})();
