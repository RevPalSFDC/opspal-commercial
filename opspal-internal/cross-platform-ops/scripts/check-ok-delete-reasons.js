#!/usr/bin/env node
/**
 * Check OK status contacts with Delete_Reason populated
 */

const { execSync } = require('child_process');

const query = `SELECT Id, FirstName, LastName, Email, Clean_Status__c, Delete_Reason__c 
               FROM Contact 
               WHERE Clean_Status__c = 'OK' 
               AND (Delete_Reason__c != null AND Delete_Reason__c != '')
               LIMIT 100`;

console.log('Checking for OK status contacts with Delete_Reason populated...');

try {
    const result = execSync(
        `sf data query --query "${query}" --target-org rentable-production --json`,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const data = JSON.parse(result);
    const records = data.result.records;
    
    console.log(`\nFound ${data.result.totalSize} OK status contacts with Delete_Reason populated`);
    
    if (records.length > 0) {
        console.log('\nSample records:');
        records.slice(0, 5).forEach(r => {
            console.log(`  ${r.Id}: ${r.FirstName} ${r.LastName} - Delete_Reason: "${r.Delete_Reason__c}"`);
        });
    }
} catch (error) {
    console.error('Error:', error.message);
}