#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('📧 Exporting Contacts for HubSpot Inclusion List Addition\n');

// Load the overlap analysis results
const reportPath = path.join(__dirname, '../reports/sync-overlap-analysis.json');
const analysisData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

// Note: The JSON has swapped field names
// The "salesforceId" field actually contains emails
const emailsToExport = analysisData.inBothNotOnInclusionList.map(c => c.salesforceId);

// Create CSV export
const csvPath = path.join(__dirname, '../reports/contacts-for-inclusion-list.csv');
const csvContent = 'Email\n' + emailsToExport.join('\n');
fs.writeFileSync(csvPath, csvContent);

console.log(`✅ Export Complete!\n`);
console.log(`📊 Statistics:`);
console.log(`   - Total contacts to add: ${emailsToExport.length}`);
console.log(`   - Export file: ${csvPath}\n`);

console.log(`📝 Sample of emails to be added:`);
emailsToExport.slice(0, 10).forEach(email => {
    console.log(`   - ${email}`);
});

console.log(`\n🔧 Next Steps:`);
console.log(`   1. Open HubSpot and navigate to Lists`);
console.log(`   2. Find the Inclusion List (ID: 26)`);
console.log(`   3. Import the CSV file: ${csvPath}`);
console.log(`   4. These contacts will then be eligible for sync`);

// Also create a JSON report
const jsonReportPath = path.join(__dirname, '../reports/inclusion-list-additions.json');
const report = {
    generatedAt: new Date().toISOString(),
    totalContactsToAdd: emailsToExport.length,
    hubspotInclusionListId: 26,
    csvExportPath: csvPath,
    emails: emailsToExport
};
fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2));

console.log(`\n✅ JSON report saved to: ${jsonReportPath}`);