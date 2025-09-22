#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ORG_ALIAS = 'rentable-production';
const OUTPUT_DIR = 'require('./config/paths.config').PROJECT_ROOT';

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('🔍 DEDUPLICATION PROCESSOR - Finding and marking duplicate contacts');
console.log('============================================================\n');

// Step 1: Export ALL contacts for deduplication analysis
console.log('📥 Step 1: Exporting all contacts for deduplication analysis...');
const query = `SELECT Id, Email, Phone, MobilePhone, AccountId, Account.Name, 
       Name, FirstName, LastName, Title, CreatedDate, LastModifiedDate,
       Clean_Status__c, Sync_Status__c, HubSpot_Contact_ID__c,
       Is_Duplicate__c, Master_Contact_Id__c
FROM Contact
WHERE Email != null OR Phone != null OR MobilePhone != null
ORDER BY CreatedDate ASC`;

try {
    const exportCmd = `sf data query --query "${query}" --target-org ${ORG_ALIAS} --json > ${OUTPUT_DIR}/all_contacts.json`;
    console.log('Running export (this may take several minutes)...');
    execSync(exportCmd);
    console.log('✅ Export complete!\n');
} catch (error) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
}

// Step 2: Process and identify duplicates
console.log('🔧 Step 2: Identifying duplicates...');
const jsonContent = fs.readFileSync(`${OUTPUT_DIR}/all_contacts.json`, 'utf8');
const data = JSON.parse(jsonContent);

if (!data.result || !data.result.records || data.result.records.length === 0) {
    console.error('❌ No data exported');
    process.exit(1);
}

const contacts = data.result.records;
console.log(`   Found ${contacts.length} total contacts to analyze\n`);

// Build duplicate detection maps
const emailMap = new Map();
const phoneMap = new Map();
const nameCompanyMap = new Map();

// Helper function to calculate data completeness score
function calculateScore(contact) {
    let score = 0;
    if (contact.Email) score += 30;
    if (contact.Phone || contact.MobilePhone) score += 30;
    if (contact.AccountId) score += 20;
    if (contact.Name && contact.Name !== 'Unknown') score += 20;
    if (contact.Title) score += 10;
    if (contact.HubSpot_Contact_ID__c) score += 15; // Bonus for HubSpot sync
    return score;
}

// Build maps for duplicate detection
for (const contact of contacts) {
    // Email duplicates
    if (contact.Email) {
        const emailKey = contact.Email.toLowerCase();
        if (!emailMap.has(emailKey)) {
            emailMap.set(emailKey, []);
        }
        emailMap.get(emailKey).push(contact);
    }
    
    // Phone duplicates (normalize phone numbers)
    const phone = contact.Phone || contact.MobilePhone;
    if (phone) {
        const phoneKey = phone.replace(/\D/g, ''); // Remove non-digits
        if (phoneKey.length >= 10) { // Valid phone
            if (!phoneMap.has(phoneKey)) {
                phoneMap.set(phoneKey, []);
            }
            phoneMap.get(phoneKey).push(contact);
        }
    }
    
    // Name + Company duplicates
    if (contact.Name && contact.Account && contact.Account.Name) {
        const nameCompanyKey = `${contact.Name.toLowerCase()}_${contact.Account.Name.toLowerCase()}`;
        if (!nameCompanyMap.has(nameCompanyKey)) {
            nameCompanyMap.set(nameCompanyKey, []);
        }
        nameCompanyMap.get(nameCompanyKey).push(contact);
    }
}

// Process duplicates and determine masters
const updateRecords = [];
const processedIds = new Set();
let duplicateGroupCount = 0;
let totalDuplicates = 0;

console.log('📊 Duplicate Analysis Results:');
console.log('------------------------------');

// Process email duplicates (highest priority)
console.log('\n📧 Email Duplicates:');
for (const [email, duplicates] of emailMap) {
    if (duplicates.length > 1 && !duplicates.every(c => processedIds.has(c.Id))) {
        duplicateGroupCount++;
        
        // Sort by score (highest first), then by created date (oldest first)
        duplicates.sort((a, b) => {
            const scoreA = calculateScore(a);
            const scoreB = calculateScore(b);
            if (scoreA !== scoreB) return scoreB - scoreA;
            return new Date(a.CreatedDate) - new Date(b.CreatedDate);
        });
        
        const master = duplicates[0];
        
        // Mark all contacts in this group
        for (let i = 0; i < duplicates.length; i++) {
            const contact = duplicates[i];
            if (!processedIds.has(contact.Id)) {
                processedIds.add(contact.Id);
                
                if (i === 0) {
                    // This is the master
                    updateRecords.push({
                        Id: contact.Id,
                        Is_Duplicate__c: false,
                        Master_Contact_Id__c: null,
                        Duplicate_Type__c: null
                    });
                } else {
                    // This is a duplicate
                    totalDuplicates++;
                    updateRecords.push({
                        Id: contact.Id,
                        Is_Duplicate__c: true,
                        Master_Contact_Id__c: master.Id,
                        Duplicate_Type__c: 'Email',
                        Clean_Status__c: 'Delete' // Mark duplicates for deletion
                    });
                }
            }
        }
        
        if (duplicates.length > 2) {
            console.log(`   - ${email}: ${duplicates.length} duplicates found`);
        }
    }
}
console.log(`   Total email duplicate groups: ${duplicateGroupCount}`);

// Process phone duplicates (for contacts not already processed)
const phoneGroupCount = duplicateGroupCount;
console.log('\n📱 Phone Duplicates (not caught by email):');
for (const [phone, duplicates] of phoneMap) {
    const unprocessed = duplicates.filter(c => !processedIds.has(c.Id));
    if (unprocessed.length > 1) {
        duplicateGroupCount++;
        
        unprocessed.sort((a, b) => {
            const scoreA = calculateScore(a);
            const scoreB = calculateScore(b);
            if (scoreA !== scoreB) return scoreB - scoreA;
            return new Date(a.CreatedDate) - new Date(b.CreatedDate);
        });
        
        const master = unprocessed[0];
        
        for (let i = 0; i < unprocessed.length; i++) {
            const contact = unprocessed[i];
            processedIds.add(contact.Id);
            
            if (i === 0) {
                updateRecords.push({
                    Id: contact.Id,
                    Is_Duplicate__c: false,
                    Master_Contact_Id__c: null,
                    Duplicate_Type__c: null
                });
            } else {
                totalDuplicates++;
                updateRecords.push({
                    Id: contact.Id,
                    Is_Duplicate__c: true,
                    Master_Contact_Id__c: master.Id,
                    Duplicate_Type__c: 'Phone',
                    Clean_Status__c: 'Delete'
                });
            }
        }
        
        if (unprocessed.length > 2) {
            console.log(`   - Phone ending ...${phone.slice(-4)}: ${unprocessed.length} duplicates`);
        }
    }
}
console.log(`   Phone duplicate groups: ${duplicateGroupCount - phoneGroupCount}`);

// Process name+company duplicates (lowest priority)
const nameGroupCount = duplicateGroupCount;
console.log('\n👥 Name + Company Duplicates (not caught by email/phone):');
for (const [key, duplicates] of nameCompanyMap) {
    const unprocessed = duplicates.filter(c => !processedIds.has(c.Id));
    if (unprocessed.length > 1) {
        duplicateGroupCount++;
        
        unprocessed.sort((a, b) => {
            const scoreA = calculateScore(a);
            const scoreB = calculateScore(b);
            if (scoreA !== scoreB) return scoreB - scoreA;
            return new Date(a.CreatedDate) - new Date(b.CreatedDate);
        });
        
        const master = unprocessed[0];
        
        for (let i = 0; i < unprocessed.length; i++) {
            const contact = unprocessed[i];
            processedIds.add(contact.Id);
            
            if (i === 0) {
                updateRecords.push({
                    Id: contact.Id,
                    Is_Duplicate__c: false,
                    Master_Contact_Id__c: null,
                    Duplicate_Type__c: null
                });
            } else {
                totalDuplicates++;
                updateRecords.push({
                    Id: contact.Id,
                    Is_Duplicate__c: true,
                    Master_Contact_Id__c: master.Id,
                    Duplicate_Type__c: 'Name_Company',
                    Clean_Status__c: 'Review' // Name+Company duplicates need review
                });
            }
        }
        
        if (unprocessed.length > 2) {
            const [name, company] = key.split('_');
            console.log(`   - ${name} at ${company}: ${unprocessed.length} duplicates`);
        }
    }
}
console.log(`   Name+Company duplicate groups: ${duplicateGroupCount - nameGroupCount}`);

// Mark all non-duplicate contacts that weren't already processed
for (const contact of contacts) {
    if (!processedIds.has(contact.Id)) {
        updateRecords.push({
            Id: contact.Id,
            Is_Duplicate__c: false,
            Master_Contact_Id__c: null,
            Duplicate_Type__c: null
        });
    }
}

console.log(`\n📊 Summary:`);
console.log(`   - Total contacts analyzed: ${contacts.length}`);
console.log(`   - Duplicate groups found: ${duplicateGroupCount}`);
console.log(`   - Total duplicate records: ${totalDuplicates}`);
console.log(`   - Records to update: ${updateRecords.length}\n`);

// Step 3: Create update CSV
console.log('📝 Step 3: Creating update file...');
const updateCsv = ['Id,Is_Duplicate__c,Master_Contact_Id__c,Duplicate_Type__c,Clean_Status__c'];

for (const record of updateRecords) {
    const row = [
        record.Id,
        record.Is_Duplicate__c || '',
        record.Master_Contact_Id__c || '',
        record.Duplicate_Type__c || '',
        record.Clean_Status__c || ''
    ].join(',');
    updateCsv.push(row);
}

fs.writeFileSync(`${OUTPUT_DIR}/dedupe_updates.csv`, updateCsv.join('\n'));
console.log(`✅ Update file created with ${updateRecords.length} records\n`);

// Step 4: Bulk update back to Salesforce
console.log('📤 Step 4: Uploading deduplication results to Salesforce...');
try {
    const importCmd = `sf data upsert bulk --sobject Contact --external-id Id --file ${OUTPUT_DIR}/dedupe_updates.csv --target-org ${ORG_ALIAS} --wait 30`;
    console.log('Running bulk update (this may take several minutes)...');
    execSync(importCmd, { stdio: 'inherit' });
    console.log('✅ Deduplication update complete!\n');
} catch (error) {
    console.error('❌ Update failed:', error.message);
    process.exit(1);
}

// Step 5: Verify results
console.log('📊 Step 5: Verifying deduplication results...\n');
console.log('Duplicate Status Distribution:');
const dupStatusQuery = `sf data query --query "SELECT Is_Duplicate__c, COUNT(Id) count FROM Contact WHERE Is_Duplicate__c != null GROUP BY Is_Duplicate__c" --target-org ${ORG_ALIAS}`;
execSync(dupStatusQuery, { stdio: 'inherit' });

console.log('\nDuplicates by Type:');
const dupTypeQuery = `sf data query --query "SELECT Duplicate_Type__c, COUNT(Id) count FROM Contact WHERE Duplicate_Type__c != null GROUP BY Duplicate_Type__c" --target-org ${ORG_ALIAS}`;
execSync(dupTypeQuery, { stdio: 'inherit' });

console.log('\nContacts marked for deletion (duplicates):');
const deleteQuery = `sf data query --query "SELECT COUNT(Id) FROM Contact WHERE Clean_Status__c = 'Delete' AND Is_Duplicate__c = true" --target-org ${ORG_ALIAS}`;
execSync(deleteQuery, { stdio: 'inherit' });

console.log('\n✨ DEDUPLICATION COMPLETE!');
console.log(`Total duplicate records identified: ${totalDuplicates}`);
console.log(`These duplicates have been marked with Is_Duplicate__c = true`);
console.log(`Master record IDs have been stored in Master_Contact_Id__c`);
console.log(`Duplicate types recorded in Duplicate_Type__c field`);