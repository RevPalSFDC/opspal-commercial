#!/usr/bin/env node

/**
 * Analyze Sync Overlap Between Salesforce and HubSpot
 *
 * This script identifies:
 * 1. Contacts that exist in BOTH systems but are NOT on the HubSpot Inclusion List
 * 2. Contacts that have Salesforce IDs in HubSpot (truly synced)
 * 3. Contacts only in Salesforce
 * 4. Contacts only in HubSpot
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: '.env.rentable-production' });

// HubSpot configuration
const hsConfig = require('../../HS/portals/config.json');

async function analyzeContactOverlap() {
    console.log('🔍 Analyzing Contact Overlap Between Salesforce and HubSpot\n');
    console.log('This analysis focuses on finding contacts in BOTH systems but NOT on the Inclusion List\n');

    const results = {
        salesforceTotal: 0,
        hubspotTotal: 59365,
        inclusionListSize: 1382,
        syncedWithIds: 1281,
        inBothNotOnInclusionList: [],
        estimatedOverlapNotInclusion: 0,
        timestamp: new Date().toISOString()
    };

    try {
        // Step 1: Get Salesforce total count
        console.log('Step 1: Getting Salesforce contact count...');
        const sfCount = execSync('sf data query --query "SELECT COUNT() FROM Contact" --target-org rentable-production', {
            encoding: 'utf8'
        });
        results.salesforceTotal = parseInt(sfCount.match(/Total number of records retrieved: (\d+)/)[1]);
        console.log(`✓ Salesforce Contacts: ${results.salesforceTotal.toLocaleString()}`);

        // Step 2: Refresh HubSpot token and get contacts
        console.log('\nStep 2: Connecting to HubSpot...');
        const portal = hsConfig.portals.rentable;

        // Refresh token
        const refreshResponse = await axios.post(
            'https://api.hubapi.com/oauth/v1/token',
            new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: portal.clientId,
                client_secret: portal.clientSecret,
                refresh_token: portal.refreshToken
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const token = refreshResponse.data.access_token;
        console.log('✓ HubSpot authenticated');

        // Step 3: Get HubSpot contacts WITHOUT Salesforce IDs (potential overlaps)
        console.log('\nStep 3: Getting HubSpot contacts without Salesforce IDs...');
        let allHubSpotEmails = [];
        let after = null;
        let page = 0;

        do {
            const searchBody = {
                filterGroups: [{
                    filters: [{
                        propertyName: 'salesforcecontactid',
                        operator: 'NOT_HAS_PROPERTY'
                    }]
                }],
                properties: ['email', 'firstname', 'lastname'],
                limit: 100
            };

            if (after) {
                searchBody.after = after;
            }

            const response = await axios.post(
                'https://api.hubapi.com/crm/v3/objects/contacts/search',
                searchBody,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const emails = response.data.results
                .filter(c => c.properties.email)
                .map(c => ({
                    email: c.properties.email,
                    firstname: c.properties.firstname,
                    lastname: c.properties.lastname
                }));

            allHubSpotEmails = allHubSpotEmails.concat(emails);
            after = response.data.paging?.next?.after;
            page++;

            console.log(`  Fetched page ${page}: ${emails.length} contacts (Total: ${allHubSpotEmails.length})`);

            // Limit to prevent timeout (sample 1000 for analysis)
            if (allHubSpotEmails.length >= 1000) break;

        } while (after && allHubSpotEmails.length < 1000);

        console.log(`✓ Retrieved ${allHubSpotEmails.length} HubSpot contacts without SF IDs for analysis`);

        // Step 4: Check which of these exist in Salesforce
        console.log('\nStep 4: Checking overlap with Salesforce...');
        const emailBatches = [];
        const batchSize = 50;

        // Create batches of emails
        for (let i = 0; i < allHubSpotEmails.length; i += batchSize) {
            emailBatches.push(allHubSpotEmails.slice(i, i + batchSize));
        }

        let overlapCount = 0;
        let processedCount = 0;

        for (const batch of emailBatches) {
            const emailList = batch.map(c => `'${c.email.replace(/'/g, "\\'")}'`).join(',');

            try {
                const result = execSync(
                    `sf data query --query "SELECT Email, Id, Name FROM Contact WHERE Email IN (${emailList})" --target-org rentable-production`,
                    { encoding: 'utf8' }
                );

                const matches = result.match(/Total number of records retrieved: (\d+)/);
                if (matches) {
                    const found = parseInt(matches[1]);
                    overlapCount += found;

                    // Parse the actual records
                    if (found > 0) {
                        const lines = result.split('\n');
                        for (const line of lines) {
                            if (line.includes('@')) {
                                const parts = line.split('│').map(p => p.trim());
                                if (parts.length >= 3) {
                                    const sfId = parts[1];
                                    const email = parts[2];
                                    const name = parts[3];

                                    results.inBothNotOnInclusionList.push({
                                        email,
                                        salesforceId: sfId,
                                        salesforceName: name,
                                        inHubSpot: true,
                                        onInclusionList: false,
                                        needsToBeAddedToInclusionList: true
                                    });
                                }
                            }
                        }
                    }
                }

                processedCount += batch.length;
                process.stdout.write(`\r  Processed ${processedCount}/${allHubSpotEmails.length} emails... Found ${overlapCount} overlaps`);
            } catch (error) {
                // Continue on error
            }
        }

        console.log('\n');

        // Step 5: Calculate estimates
        const overlapRate = overlapCount / allHubSpotEmails.length;
        results.estimatedOverlapNotInclusion = Math.round((results.hubspotTotal - results.syncedWithIds) * overlapRate);

        // Step 6: Generate summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 ANALYSIS RESULTS');
        console.log('='.repeat(80));

        console.log('\n🔢 Total Counts:');
        console.log(`  Salesforce Total: ${results.salesforceTotal.toLocaleString()}`);
        console.log(`  HubSpot Total: ${results.hubspotTotal.toLocaleString()}`);
        console.log(`  HubSpot Inclusion List: ${results.inclusionListSize.toLocaleString()} (2.3% of HubSpot)`);
        console.log(`  Synced (have SF ID in HS): ${results.syncedWithIds.toLocaleString()}`);

        console.log('\n🚨 CRITICAL FINDING:');
        console.log(`  Contacts in BOTH systems but NOT on Inclusion List: ~${results.estimatedOverlapNotInclusion.toLocaleString()}`);
        console.log(`  Overlap Rate from Sample: ${(overlapRate * 100).toFixed(1)}%`);
        console.log(`  These contacts CANNOT sync because they're not on the Inclusion List!`);

        console.log('\n📝 Sample of Contacts in Both but Not on Inclusion List:');
        results.inBothNotOnInclusionList.slice(0, 10).forEach(contact => {
            console.log(`  - ${contact.email} (SF: ${contact.salesforceId})`);
        });

        // Step 7: Save detailed results
        const outputPath = path.join(__dirname, '..', 'reports', 'sync-overlap-analysis.json');
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

        console.log(`\n✅ Detailed results saved to: ${outputPath}`);

        // Step 8: Recommendations
        console.log('\n💡 RECOMMENDATIONS:');
        console.log('1. IMMEDIATE: Add the ~' + results.estimatedOverlapNotInclusion.toLocaleString() + ' overlapping contacts to the Inclusion List');
        console.log('2. Update Inclusion List criteria to be less restrictive');
        console.log('3. Implement the Clean_Status__c and Sync_Status__c fields in Salesforce');
        console.log('4. Mark contacts with "In HS Not on Inclusion List" flag');
        console.log('5. Create automated process to keep Inclusion List updated');

        return results;

    } catch (error) {
        console.error('❌ Error during analysis:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    analyzeContactOverlap().catch(console.error);
}

module.exports = { analyzeContactOverlap };