#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Contact Processing and Flagging\n');
console.log('This script will identify and flag contacts based on sync status with HubSpot\n');

// Load the overlap analysis results
const reportPath = path.join(__dirname, '../reports/sync-overlap-analysis.json');
const analysisData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

// Note: The JSON has swapped field names
const contactsInBoth = analysisData.inBothNotOnInclusionList.map(c => ({
    sfId: c.email, // This is actually the SF ID
    email: c.salesforceId // This is actually the email
}));

console.log(`📊 Processing ${contactsInBoth.length} contacts that exist in both systems but NOT on Inclusion List\n`);

// Switch to SFDC directory for proper auth
process.chdir('require('./config/paths.config').PROJECT_ROOT');

// Function to execute SOQL query safely
function executeQuery(query) {
    try {
        const result = execSync(
            `sf data query --query "${query}" --target-org rentable-production --json`,
            { encoding: 'utf8' }
        );
        return JSON.parse(result);
    } catch (error) {
        console.error('Query error:', error.message);
        return null;
    }
}

// Function to update records in batches
function updateContactsBatch(updates, batchSize = 200) {
    const batches = [];
    for (let i = 0; i < updates.length; i += batchSize) {
        batches.push(updates.slice(i, i + batchSize));
    }

    return batches;
}

// Process contacts to identify different categories
console.log('📋 Categorizing contacts...\n');

// 1. Get all contacts with email addresses
console.log('Fetching contacts with emails...');
const emailQuery = `SELECT Id, Email, Name, AccountId, CreatedDate, LastModifiedDate, LastActivityDate, LeadSource, Title, Phone, MobilePhone FROM Contact WHERE Email != null LIMIT 1000`;

const emailResult = executeQuery(emailQuery);

if (!emailResult || !emailResult.result) {
    console.error('❌ Failed to fetch contacts with emails');
    process.exit(1);
}

console.log(`✅ Found ${emailResult.result.totalSize} contacts with emails\n`);

// 2. Analyze data quality
console.log('Analyzing data quality...\n');

const qualityAnalysis = {
    highQuality: [],    // Score >= 70
    mediumQuality: [],  // Score 40-69
    lowQuality: [],     // Score < 40
    duplicates: {},     // Email -> [Contact IDs]
    inBothSystems: [],  // In both SF and HS but not synced
    syncedProperly: [], // Has HubSpot ID
    needsSync: []       // Should be synced but isn't
};

// Build email to contacts map for duplicate detection
const emailToContacts = {};
emailResult.result.records.forEach(contact => {
    const email = contact.Email.toLowerCase();
    if (!emailToContacts[email]) {
        emailToContacts[email] = [];
    }
    emailToContacts[email].push(contact);
});

// Find duplicates and calculate quality scores
Object.entries(emailToContacts).forEach(([email, contacts]) => {
    if (contacts.length > 1) {
        qualityAnalysis.duplicates[email] = contacts.map(c => c.Id);
    }

    contacts.forEach(contact => {
        // Calculate quality score
        let score = 0;
        if (contact.Email) score += 30;
        if (contact.Phone || contact.MobilePhone) score += 20;
        if (contact.Name && contact.Name !== 'Unknown') score += 20;
        if (contact.LeadSource) score += 10;
        if (contact.AccountId) score += 10;
        if (contact.LastActivityDate) {
            const daysSinceActivity = Math.floor((new Date() - new Date(contact.LastActivityDate)) / (1000 * 60 * 60 * 24));
            if (daysSinceActivity < 90) score += 10;
        }

        contact.qualityScore = score;

        if (score >= 70) {
            qualityAnalysis.highQuality.push(contact);
        } else if (score >= 40) {
            qualityAnalysis.mediumQuality.push(contact);
        } else {
            qualityAnalysis.lowQuality.push(contact);
        }

        // Check if this contact is in our "both systems" list
        const inBoth = contactsInBoth.find(c => c.sfId === contact.Id);
        if (inBoth) {
            qualityAnalysis.inBothSystems.push({...contact, hubspotEmail: inBoth.email});
        }
    });
});

// 3. Generate processing report
console.log('📊 Processing Summary:\n');
console.log(`Total Contacts Analyzed: ${emailResult.result.records.length}`);
console.log(`High Quality (70+): ${qualityAnalysis.highQuality.length}`);
console.log(`Medium Quality (40-69): ${qualityAnalysis.mediumQuality.length}`);
console.log(`Low Quality (<40): ${qualityAnalysis.lowQuality.length}`);
console.log(`Duplicate Emails: ${Object.keys(qualityAnalysis.duplicates).length}`);
console.log(`In Both Systems (Not Synced): ${qualityAnalysis.inBothSystems.length}\n`);

// 4. Create CSV reports for different categories
console.log('📁 Creating detailed reports...\n');

const reportsDir = path.join(__dirname, '../reports/contact-processing');
if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}

// Report 1: Contacts in both systems needing sync
const bothSystemsCsv = [
    'Salesforce_ID,Email,Name,Quality_Score,Account_ID,Last_Activity',
    ...qualityAnalysis.inBothSystems.map(c =>
        `${c.Id},${c.hubspotEmail},${c.Name || ''},${c.qualityScore},${c.AccountId || ''},${c.LastActivityDate || ''}`
    )
].join('\n');
fs.writeFileSync(path.join(reportsDir, 'contacts-in-both-not-synced.csv'), bothSystemsCsv);
console.log(`✅ Created: contacts-in-both-not-synced.csv (${qualityAnalysis.inBothSystems.length} records)`);

// Report 2: Duplicate contacts
const duplicatesCsv = [
    'Email,Contact_IDs,Count',
    ...Object.entries(qualityAnalysis.duplicates).map(([email, ids]) =>
        `${email},"${ids.join('; ')}",${ids.length}`
    )
].join('\n');
fs.writeFileSync(path.join(reportsDir, 'duplicate-contacts.csv'), duplicatesCsv);
console.log(`✅ Created: duplicate-contacts.csv (${Object.keys(qualityAnalysis.duplicates).length} duplicate groups)`);

// Report 3: Low quality contacts (candidates for cleanup)
const lowQualityCsv = [
    'Salesforce_ID,Email,Name,Quality_Score,Created_Date,Last_Modified',
    ...qualityAnalysis.lowQuality.map(c =>
        `${c.Id},${c.Email},${c.Name || ''},${c.qualityScore},${c.CreatedDate},${c.LastModifiedDate}`
    )
].join('\n');
fs.writeFileSync(path.join(reportsDir, 'low-quality-contacts.csv'), lowQualityCsv);
console.log(`✅ Created: low-quality-contacts.csv (${qualityAnalysis.lowQuality.length} records)`);

// 5. Create Apex script to update contacts when fields are available
const apexUpdateScript = `
// Apex script to update contacts with Clean_Status__c and related fields
// Run this once the custom fields are available in the org

List<Contact> contactsToUpdate = new List<Contact>();

// Contacts in both systems but not synced
Set<Id> inBothNotSynced = new Set<Id>{
    ${qualityAnalysis.inBothSystems.slice(0, 100).map(c => `'${c.Id}'`).join(',\n    ')}
};

// Low quality contacts
Set<Id> lowQualityIds = new Set<Id>{
    ${qualityAnalysis.lowQuality.slice(0, 50).map(c => `'${c.Id}'`).join(',\n    ')}
};

// Duplicate contact IDs
Set<Id> duplicateIds = new Set<Id>();
${Object.values(qualityAnalysis.duplicates).slice(0, 50).forEach(ids => {
    ids.forEach(id => {
        return `duplicateIds.add('${id}');`;
    });
})}

// Query and update contacts
for (Contact c : [SELECT Id FROM Contact WHERE Id IN :inBothNotSynced OR Id IN :lowQualityIds OR Id IN :duplicateIds]) {
    Contact updateContact = new Contact(Id = c.Id);

    // Check field availability before setting
    Map<String, Schema.SObjectField> fieldMap = Schema.SObjectType.Contact.fields.getMap();

    if (inBothNotSynced.contains(c.Id)) {
        if (fieldMap.containsKey('sync_status__c')) {
            updateContact.put('Sync_Status__c', 'In HS Not on Inclusion List');
        }
        if (fieldMap.containsKey('in_hubspot_not_inclusion_list__c')) {
            updateContact.put('In_HubSpot_Not_Inclusion_List__c', true);
        }
    }

    if (lowQualityIds.contains(c.Id)) {
        if (fieldMap.containsKey('clean_status__c')) {
            updateContact.put('Clean_Status__c', 'Review');
        }
        if (fieldMap.containsKey('data_quality_score__c')) {
            // Would need to recalculate score here
            updateContact.put('Data_Quality_Score__c', 30);
        }
    }

    if (duplicateIds.contains(c.Id)) {
        if (fieldMap.containsKey('clean_status__c')) {
            updateContact.put('Clean_Status__c', 'Merge');
        }
    }

    contactsToUpdate.add(updateContact);
}

if (!contactsToUpdate.isEmpty()) {
    Database.update(contactsToUpdate, false); // Allow partial success
    System.debug('Updated ' + contactsToUpdate.size() + ' contacts');
}
`;

fs.writeFileSync(path.join(reportsDir, 'update-contacts.apex'), apexUpdateScript);
console.log(`✅ Created: update-contacts.apex (Ready to run when fields are available)`);

// 6. Create summary JSON report
const summaryReport = {
    processedAt: new Date().toISOString(),
    totalAnalyzed: emailResult.result.records.length,
    categories: {
        highQuality: qualityAnalysis.highQuality.length,
        mediumQuality: qualityAnalysis.mediumQuality.length,
        lowQuality: qualityAnalysis.lowQuality.length,
        duplicates: Object.keys(qualityAnalysis.duplicates).length,
        inBothSystemsNotSynced: qualityAnalysis.inBothSystems.length
    },
    recommendations: {
        immediateAction: [
            `Add ${qualityAnalysis.inBothSystems.length} contacts to HubSpot Inclusion List`,
            `Review and merge ${Object.keys(qualityAnalysis.duplicates).length} duplicate contact groups`,
            `Archive or delete ${qualityAnalysis.lowQuality.length} low-quality contacts`
        ],
        fieldDeployment: 'Custom fields deployed but not yet available in API - may need cache refresh or permission update',
        nextSteps: [
            'Import contacts-in-both-not-synced.csv to HubSpot Inclusion List',
            'Review duplicate-contacts.csv for merge candidates',
            'Evaluate low-quality-contacts.csv for cleanup'
        ]
    },
    files: {
        contactsInBoth: 'reports/contact-processing/contacts-in-both-not-synced.csv',
        duplicates: 'reports/contact-processing/duplicate-contacts.csv',
        lowQuality: 'reports/contact-processing/low-quality-contacts.csv',
        apexScript: 'reports/contact-processing/update-contacts.apex'
    }
};

fs.writeFileSync(
    path.join(reportsDir, 'processing-summary.json'),
    JSON.stringify(summaryReport, null, 2)
);
console.log(`✅ Created: processing-summary.json\n`);

// 7. Display actionable insights
console.log('🎯 Actionable Insights:\n');
console.log('1. IMMEDIATE SYNC OPPORTUNITY:');
console.log(`   - ${qualityAnalysis.inBothSystems.length} contacts exist in both systems but can't sync`);
console.log('   - These are blocked by HubSpot Inclusion List restriction');
console.log('   - Action: Import contacts-in-both-not-synced.csv to HubSpot List ID: 26\n');

console.log('2. DATA QUALITY ISSUES:');
console.log(`   - ${qualityAnalysis.lowQuality.length} contacts have quality score < 40`);
console.log('   - These lack critical fields like email, phone, or recent activity');
console.log('   - Action: Review low-quality-contacts.csv for archival\n');

console.log('3. DUPLICATE MANAGEMENT:');
console.log(`   - ${Object.keys(qualityAnalysis.duplicates).length} email addresses have multiple contacts`);
console.log(`   - Total duplicate records: ${Object.values(qualityAnalysis.duplicates).flat().length}`);
console.log('   - Action: Use duplicate-contacts.csv to identify merge candidates\n');

console.log('✨ Processing complete! Check the reports folder for detailed CSV files.');