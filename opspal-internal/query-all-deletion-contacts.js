#!/usr/bin/env node

/**
 * Query ALL Contacts matching the deletion criteria
 * Replicates the "Contacts for Deletion" report filters without the 2000 record API limit
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('='.repeat(70));
console.log('FULL Contact Deletion Query (No 2000 Record Limit)');
console.log('='.repeat(70));

// First, get the total count
const countQuery = `
SELECT COUNT()
FROM Contact
WHERE (Clean_Status__c != 'OK' OR Clean_Status__c = null)
  AND Clean_Status__c IN ('Delete', 'Archive', 'Review')
  AND (Account.Number_of_Units__c = null OR Account.Number_of_Units__c = 0)
  AND (Account.ALN_of_Units__c = null OR Account.ALN_of_Units__c = 0)
  AND (Account.RCA_of_Units__c = null OR Account.RCA_of_Units__c = 0)
`.replace(/\n/g, ' ').trim();

console.log('\nExecuting count query...');
console.log('Query filters:');
console.log('  - Clean_Status__c IN (Delete, Archive, Review)');
console.log('  - Clean_Status__c != OK');
console.log('  - Account.Number_of_Units__c is null or 0');
console.log('  - Account.ALN_of_Units__c is null or 0');
console.log('  - Account.RCA_of_Units__c is null or 0');
console.log();

try {
    const countResult = execSync(
        `sf data query --query "${countQuery}" --target-org rentable-production --json`,
        { encoding: 'utf8' }
    );

    const countData = JSON.parse(countResult);
    const totalCount = countData.result.totalSize;

    console.log(`\n✅ TOTAL CONTACTS MATCHING DELETION CRITERIA: ${totalCount.toLocaleString()}`);
    console.log(`📊 Report API Limit: 2,000 records`);
    console.log(`📈 Additional records beyond report: ${(totalCount - 2000).toLocaleString()}`);

    // Now get a sample with more details
    const sampleQuery = `
    SELECT Id, Name, FirstName, LastName, Email,
           Clean_Status__c, Delete_Reason__c,
           Account.Name, Account.Number_of_Units__c,
           Account.ALN_of_Units__c, Account.RCA_of_Units__c,
           CreatedDate, LastActivityDate
    FROM Contact
    WHERE (Clean_Status__c != 'OK' OR Clean_Status__c = null)
      AND Clean_Status__c IN ('Delete', 'Archive', 'Review')
      AND (Account.Number_of_Units__c = null OR Account.Number_of_Units__c = 0)
      AND (Account.ALN_of_Units__c = null OR Account.ALN_of_Units__c = 0)
      AND (Account.RCA_of_Units__c = null OR Account.RCA_of_Units__c = 0)
    LIMIT 20
    `.replace(/\n/g, ' ').trim();

    console.log('\n' + '='.repeat(70));
    console.log('Sample of Contacts (showing 20 of ' + totalCount.toLocaleString() + ')');
    console.log('='.repeat(70));

    const sampleResult = execSync(
        `sf data query --query "${sampleQuery}" --target-org rentable-production --json`,
        { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
    );

    const sampleData = JSON.parse(sampleResult);
    const records = sampleData.result.records;

    // Group by Clean_Status__c
    const statusGroups = {};
    records.forEach(r => {
        const status = r.Clean_Status__c || 'null';
        if (!statusGroups[status]) statusGroups[status] = [];
        statusGroups[status].push(r);
    });

    Object.keys(statusGroups).forEach(status => {
        console.log(`\nClean_Status__c = "${status}" (${statusGroups[status].length} in sample):`);
        statusGroups[status].slice(0, 5).forEach(contact => {
            console.log(`  - ${contact.Name || 'No Name'} (${contact.Id})`);
            console.log(`    Account: ${contact.Account?.Name || 'N/A'}`);
            console.log(`    Delete Reason: ${contact.Delete_Reason__c || 'N/A'}`);
        });
    });

    // Get distribution of Clean_Status__c values
    console.log('\n' + '='.repeat(70));
    console.log('Distribution Analysis');
    console.log('='.repeat(70));

    const statusQueries = ['Delete', 'Archive', 'Review'].map(status => {
        const statusCountQuery = `
        SELECT COUNT()
        FROM Contact
        WHERE Clean_Status__c = '${status}'
          AND (Account.Number_of_Units__c = null OR Account.Number_of_Units__c = 0)
          AND (Account.ALN_of_Units__c = null OR Account.ALN_of_Units__c = 0)
          AND (Account.RCA_of_Units__c = null OR Account.RCA_of_Units__c = 0)
        `.replace(/\n/g, ' ').trim();

        const result = execSync(
            `sf data query --query "${statusCountQuery}" --target-org rentable-production --json`,
            { encoding: 'utf8' }
        );

        const data = JSON.parse(result);
        return { status, count: data.result.totalSize };
    });

    statusQueries.forEach(({ status, count }) => {
        const percentage = ((count / totalCount) * 100).toFixed(1);
        console.log(`  ${status}: ${count.toLocaleString()} contacts (${percentage}%)`);
    });

    // Save results
    const timestamp = new Date().toISOString();
    const results = {
        queryDate: timestamp,
        totalMatchingContacts: totalCount,
        reportAPILimit: 2000,
        additionalRecordsBeyondReport: totalCount - 2000,
        filters: {
            clean_status: "IN ('Delete', 'Archive', 'Review') AND != 'OK'",
            account_number_of_units: "null or 0",
            account_aln_of_units: "null or 0",
            account_rca_of_units: "null or 0"
        },
        distribution: statusQueries,
        sampleRecords: records.slice(0, 20)
    };

    const outputFile = `full-deletion-query-results-${timestamp.split('T')[0]}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log(`✅ Total Contacts for Deletion: ${totalCount.toLocaleString()}`);
    console.log(`📄 Full results saved to: ${outputFile}`);
    console.log(`⚠️  Report API shows only: 2,000 records`);
    console.log(`📊 Missing from report view: ${(totalCount - 2000).toLocaleString()} records`);

    if (totalCount > 10000) {
        console.log('\n⚠️  WARNING: Large dataset detected!');
        console.log('   Bulk API recommended for processing this many records.');
    }

} catch (error) {
    console.error('Error executing query:', error.message);
    process.exit(1);
}