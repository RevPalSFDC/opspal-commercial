#!/usr/bin/env node

/**
 * Export Contact IDs from Report for Deletion
 * Report: "Contacts for Deletion" (00ORh00000ERxtZMAT)
 * Environment: rentable-production
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

async function getReportContacts() {
    console.log('='.repeat(60));
    console.log('Contact Deletion Report Export');
    console.log('Report: Contacts for Deletion');
    console.log('Environment: rentable-production');
    console.log('='.repeat(60));

    // Get auth info
    const authResult = execSync('sf org display --json --target-org rentable-production', {encoding: 'utf8'});
    const auth = JSON.parse(authResult).result;

    const instanceUrl = auth.instanceUrl;
    const accessToken = auth.accessToken;
    const reportId = '00ORh00000ERxtZMAT';

    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(instanceUrl);

        // Run the report with all details
        const options = {
            hostname: parsedUrl.hostname,
            path: `/services/data/v62.0/analytics/reports/${reportId}?includeDetails=true`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const report = JSON.parse(data);

                    // Extract all Contact IDs from the report
                    const contactIds = [];
                    const contactDetails = [];

                    if (report.factMap) {
                        Object.keys(report.factMap).forEach(key => {
                            const rows = report.factMap[key].rows || [];
                            rows.forEach(row => {
                                // First data cell should be Contact ID
                                if (row.dataCells && row.dataCells.length > 0) {
                                    const contactId = row.dataCells[0].value;
                                    if (contactId) {
                                        contactIds.push(contactId);

                                        // Collect additional details if available
                                        contactDetails.push({
                                            id: contactId,
                                            cells: row.dataCells.map(cell => cell.label || cell.value)
                                        });
                                    }
                                }
                            });
                        });
                    }

                    console.log(`\nTotal contacts found: ${contactIds.length}`);

                    // Save to backup directory
                    const timestamp = new Date().toISOString().split('T')[0];
                    const backupDir = `backups/contacts-deletion-${timestamp}`;

                    if (!fs.existsSync(backupDir)) {
                        fs.mkdirSync(backupDir, { recursive: true });
                    }

                    // Save Contact IDs
                    const idsFile = path.join(backupDir, 'contact-ids.json');
                    fs.writeFileSync(idsFile, JSON.stringify(contactIds, null, 2));
                    console.log(`Contact IDs saved to: ${idsFile}`);

                    // Save full details
                    const detailsFile = path.join(backupDir, 'contact-details.json');
                    fs.writeFileSync(detailsFile, JSON.stringify(contactDetails, null, 2));
                    console.log(`Contact details saved to: ${detailsFile}`);

                    // Save report metadata
                    const metadataFile = path.join(backupDir, 'report-metadata.json');
                    fs.writeFileSync(metadataFile, JSON.stringify({
                        reportId: reportId,
                        reportName: report.reportMetadata?.name,
                        exportDate: new Date().toISOString(),
                        totalRecords: contactIds.length,
                        columns: report.reportMetadata?.detailColumns
                    }, null, 2));
                    console.log(`Report metadata saved to: ${metadataFile}`);

                    resolve({
                        contactIds,
                        contactDetails,
                        totalCount: contactIds.length
                    });

                } catch (e) {
                    reject(new Error(`Failed to parse report data: ${e.message}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

async function querySampleContacts(contactIds, limit = 10) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Querying sample of ${limit} contacts for review...`);
    console.log('='.repeat(60));

    if (!contactIds || contactIds.length === 0) {
        console.log('No contact IDs provided');
        return [];
    }

    const sampleIds = contactIds.slice(0, limit);
    const idList = sampleIds.map(id => `'${id}'`).join(',');

    const query = `SELECT Id, Name, FirstName, LastName, Email, AccountId, Account.Name,
                          Clean_Status__c, Delete_Reason__c, CreatedDate, LastModifiedDate
                   FROM Contact
                   WHERE Id IN (${idList})`;

    try {
        const result = execSync(
            `sf data query --query "${query}" --target-org rentable-production --json`,
            { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
        );

        const data = JSON.parse(result);
        const records = data.result.records;

        console.log(`\nSample Contact Records (${records.length} of ${contactIds.length} total):`);
        console.log('-'.repeat(60));

        records.forEach((contact, index) => {
            console.log(`\n${index + 1}. Contact: ${contact.Name || 'No Name'}`);
            console.log(`   ID: ${contact.Id}`);
            console.log(`   Email: ${contact.Email || 'No Email'}`);
            console.log(`   Account: ${contact.Account?.Name || 'No Account'}`);
            console.log(`   Clean Status: ${contact.Clean_Status__c || 'N/A'}`);
            console.log(`   Delete Reason: ${contact.Delete_Reason__c || 'N/A'}`);
            console.log(`   Created: ${contact.CreatedDate}`);
        });

        return records;

    } catch (error) {
        console.error('Error querying contacts:', error.message);
        return [];
    }
}

// Main execution
async function main() {
    try {
        // Export report data
        const reportData = await getReportContacts();

        // Query sample contacts for review
        const sampleContacts = await querySampleContacts(reportData.contactIds);

        console.log(`\n${'='.repeat(60)}`);
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total contacts in report: ${reportData.totalCount}`);
        console.log(`Backup location: backups/contacts-deletion-${new Date().toISOString().split('T')[0]}/`);
        console.log('\nNext Steps:');
        console.log('1. Review the sample contacts above');
        console.log('2. Run the test deletion script for 5 contacts');
        console.log('3. Verify deletion succeeded');
        console.log('4. Scale up to full deletion if test passes');

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { getReportContacts, querySampleContacts };