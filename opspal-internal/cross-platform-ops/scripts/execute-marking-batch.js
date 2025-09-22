#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Executing Contact Marking Batch Job in Salesforce\n');

// Load the overlap analysis results
const reportPath = path.join(__dirname, '../reports/sync-overlap-analysis.json');
const analysisData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

// Extract contact IDs that need marking - note: JSON has swapped field names
const contactsToMark = analysisData.inBothNotOnInclusionList.map(c => c.email); // The "email" field contains SF IDs
const emailsToExport = analysisData.inBothNotOnInclusionList.map(c => c.salesforceId); // The "salesforceId" field contains emails
const totalToMark = contactsToMark.length;

console.log(`📊 Found ${totalToMark} contacts to mark as "In HubSpot Not on Inclusion List"\n`);

// Create Apex script to execute the batch job with specific IDs
const apexScript = `
// Mark contacts that exist in both systems but are NOT on the Inclusion List
List<String> contactIds = new List<String>{
    ${contactsToMark.slice(0, 100).map(id => `'${id}'`).join(',\n    ')}
};

// Update contacts with the flag
List<Contact> contactsToUpdate = new List<Contact>();
for (Contact c : [SELECT Id, Email, In_HubSpot_Not_Inclusion_List__c, Sync_Status__c
                  FROM Contact
                  WHERE Id IN :contactIds]) {
    c.In_HubSpot_Not_Inclusion_List__c = true;
    c.Sync_Status__c = 'In HS Not on Inclusion List';
    contactsToUpdate.add(c);
}

if (!contactsToUpdate.isEmpty()) {
    update contactsToUpdate;
    System.debug('✅ Updated ' + contactsToUpdate.size() + ' contacts');
} else {
    System.debug('❌ No contacts found to update');
}

// Also run the full batch job for comprehensive marking
ContactMarkingBatch batch = new ContactMarkingBatch();
Database.executeBatch(batch, 200);
System.debug('🚀 Batch job started for comprehensive contact marking');
`;

// Save the Apex script
const scriptPath = path.join(__dirname, 'temp-marking-script.apex');
fs.writeFileSync(scriptPath, apexScript);

console.log('📝 Executing Apex script to mark contacts...\n');

try {
    // Switch to SFDC directory for proper auth
    process.chdir('require('./config/paths.config').PROJECT_ROOT');

    // Execute the Apex script
    const output = execSync(
        `sf apex run --file "${scriptPath}" --target-org rentable-production`,
        { encoding: 'utf8' }
    );

    console.log('✅ Apex execution output:', output);

    // Query to verify the update
    console.log('\n🔍 Verifying updates...\n');

    const verifyQuery = `sf data query --query "SELECT COUNT(Id) FROM Contact WHERE In_HubSpot_Not_Inclusion_List__c = true" --target-org rentable-production --json`;
    const verifyResult = JSON.parse(execSync(verifyQuery, { encoding: 'utf8' }));

    if (verifyResult.result && verifyResult.result.records) {
        const count = verifyResult.result.records[0].expr0;
        console.log(`✅ Contacts marked as "In HubSpot Not on Inclusion List": ${count}`);
    }

    // Check batch job status
    const batchQuery = `sf data query --query "SELECT Id, Status, TotalJobItems, JobItemsProcessed, NumberOfErrors FROM AsyncApexJob WHERE ApexClass.Name = 'ContactMarkingBatch' ORDER BY CreatedDate DESC LIMIT 1" --target-org rentable-production --json`;
    const batchResult = JSON.parse(execSync(batchQuery, { encoding: 'utf8' }));

    if (batchResult.result && batchResult.result.records && batchResult.result.records.length > 0) {
        const job = batchResult.result.records[0];
        console.log(`\n📊 Batch Job Status:`);
        console.log(`   Job ID: ${job.Id}`);
        console.log(`   Status: ${job.Status}`);
        console.log(`   Total Items: ${job.TotalJobItems || 'Processing...'}`);
        console.log(`   Processed: ${job.JobItemsProcessed || 0}`);
        console.log(`   Errors: ${job.NumberOfErrors || 0}`);
    }

    // Extract emails for export
    console.log('\n📧 Preparing email list for HubSpot Inclusion List addition...\n');

    const exportPath = path.join(__dirname, '../reports/contacts-for-inclusion-list.csv');

    // Create CSV with emails (using the correct field mapping)
    const csvContent = 'Email\n' + emailsToExport.join('\n');
    fs.writeFileSync(exportPath, csvContent);

    console.log(`✅ Email list exported to: ${exportPath}`);
    console.log(`   Total emails: ${emailsToExport.length}`);
    console.log(`   Ready for HubSpot Inclusion List import`);

} catch (error) {
    console.error('❌ Error executing marking batch:', error.message);
    if (error.stdout) {
        console.error('Output:', error.stdout.toString());
    }
    if (error.stderr) {
        console.error('Error output:', error.stderr.toString());
    }
} finally {
    // Clean up temp file
    if (fs.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath);
    }
}

console.log('\n✨ Contact marking process complete!');