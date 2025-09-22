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

console.log('🔍 DEDUPLICATION PROCESSOR - Using existing fields');
console.log('==================================================\n');
console.log('Will mark duplicates as Clean_Status__c = "Merge"');
console.log('And add duplicate info to a tracking file\n');

// Step 1: Export ALL contacts for deduplication
console.log('📥 Step 1: Exporting all contacts for deduplication...');
const query = `SELECT Id, Email, Phone, MobilePhone, AccountId, Account.Name, 
       Name, FirstName, LastName, Title, CreatedDate, LastModifiedDate,
       Clean_Status__c, Sync_Status__c, HubSpot_Contact_ID__c
FROM Contact
WHERE (Email != null OR Phone != null OR MobilePhone != null)
  AND Clean_Status__c != 'Duplicate'
ORDER BY CreatedDate ASC`;

try {
    const exportCmd = `sf data query --query "${query}" --target-org ${ORG_ALIAS} --json > ${OUTPUT_DIR}/contacts_for_dedupe.json`;
    console.log('Running export...');
    execSync(exportCmd);
    console.log('✅ Export complete!\n');
} catch (error) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
}

// Step 2: Process and identify duplicates
console.log('🔧 Step 2: Identifying duplicates...');
const jsonContent = fs.readFileSync(`${OUTPUT_DIR}/contacts_for_dedupe.json`, 'utf8');
const data = JSON.parse(jsonContent);

if (!data.result || !data.result.records || data.result.records.length === 0) {
    console.error('❌ No data exported');
    process.exit(1);
}

const contacts = data.result.records;
console.log(`   Found ${contacts.length} contacts to analyze\n`);

// Build duplicate detection maps
const emailMap = new Map();
const phoneMap = new Map();
const nameCompanyMap = new Map();

// Helper function to calculate data quality score
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
        const emailKey = contact.Email.toLowerCase().trim();
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
        const nameCompanyKey = `${contact.Name.toLowerCase().trim()}_${contact.Account.Name.toLowerCase().trim()}`;
        if (!nameCompanyMap.has(nameCompanyKey)) {
            nameCompanyMap.set(nameCompanyKey, []);
        }
        nameCompanyMap.get(nameCompanyKey).push(contact);
    }
}

// Process duplicates
const updateRecords = [];
const duplicateGroups = [];
const processedIds = new Set();
let duplicateGroupCount = 0;
let totalDuplicates = 0;

console.log('📊 Duplicate Analysis Results:');
console.log('------------------------------');

// Process email duplicates (highest priority)
console.log('\n📧 Email Duplicates:');
let emailDupeCount = 0;
for (const [email, duplicates] of emailMap) {
    if (duplicates.length > 1) {
        duplicateGroupCount++;
        emailDupeCount++;
        
        // Sort by score (highest first), then by created date (oldest first)
        duplicates.sort((a, b) => {
            const scoreA = calculateScore(a);
            const scoreB = calculateScore(b);
            if (scoreA !== scoreB) return scoreB - scoreA;
            return new Date(a.CreatedDate) - new Date(b.CreatedDate);
        });
        
        const master = duplicates[0];
        
        // Track duplicate group
        duplicateGroups.push({
            type: 'Email',
            key: email,
            masterId: master.Id,
            masterName: master.Name,
            duplicateIds: duplicates.slice(1).map(d => d.Id),
            duplicateCount: duplicates.length - 1
        });
        
        // Mark duplicates (not the master)
        for (let i = 1; i < duplicates.length; i++) {
            const contact = duplicates[i];
            if (!processedIds.has(contact.Id)) {
                processedIds.add(contact.Id);
                totalDuplicates++;
                updateRecords.push({
                    Id: contact.Id,
                    Clean_Status__c: 'Merge'
                });
            }
        }
        
        if (duplicates.length > 2) {
            console.log(`   - ${email}: ${duplicates.length} contacts (keeping: ${master.Name || master.Id})`);
        }
    }
}
console.log(`   Total email duplicate groups: ${emailDupeCount}`);
console.log(`   Total email duplicates to mark: ${updateRecords.length}`);

// Process phone duplicates (for contacts not already processed)
const phoneStartCount = updateRecords.length;
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
        
        // Track duplicate group
        duplicateGroups.push({
            type: 'Phone',
            key: `***-***-${phone.slice(-4)}`,
            masterId: master.Id,
            masterName: master.Name,
            duplicateIds: unprocessed.slice(1).map(d => d.Id),
            duplicateCount: unprocessed.length - 1
        });
        
        // Mark duplicates
        for (let i = 1; i < unprocessed.length; i++) {
            const contact = unprocessed[i];
            processedIds.add(contact.Id);
            totalDuplicates++;
            updateRecords.push({
                Id: contact.Id,
                Clean_Status__c: 'Duplicate'
            });
        }
        
        if (unprocessed.length > 2) {
            console.log(`   - Phone ending ${phone.slice(-4)}: ${unprocessed.length} contacts`);
        }
    }
}
console.log(`   Phone duplicate groups: ${duplicateGroupCount - emailDupeCount}`);
console.log(`   Phone duplicates to mark: ${updateRecords.length - phoneStartCount}`);

// Process name+company duplicates (requires manual review)
const nameStartCount = updateRecords.length;
console.log('\n👥 Name + Company Duplicates (marked as Review):');
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
        const [name, company] = key.split('_');
        
        // Track duplicate group
        duplicateGroups.push({
            type: 'Name_Company',
            key: `${name} at ${company}`,
            masterId: master.Id,
            masterName: master.Name,
            duplicateIds: unprocessed.slice(1).map(d => d.Id),
            duplicateCount: unprocessed.length - 1
        });
        
        // Mark as Review (not Duplicate) since name matches need verification
        for (let i = 1; i < unprocessed.length; i++) {
            const contact = unprocessed[i];
            processedIds.add(contact.Id);
            totalDuplicates++;
            updateRecords.push({
                Id: contact.Id,
                Clean_Status__c: 'Review' // Needs human review
            });
        }
        
        if (unprocessed.length > 2) {
            console.log(`   - ${name} at ${company}: ${unprocessed.length} contacts`);
        }
    }
}
console.log(`   Name+Company duplicate groups: ${duplicateGroupCount - emailDupeCount - (updateRecords.length - phoneStartCount)/(updateRecords.length - nameStartCount + 1)}`);
console.log(`   Name+Company records to review: ${updateRecords.length - nameStartCount}`);

console.log(`\n📊 Summary:`);
console.log(`   - Total contacts analyzed: ${contacts.length}`);
console.log(`   - Duplicate groups found: ${duplicateGroupCount}`);
console.log(`   - Total duplicate/review records: ${totalDuplicates}`);
console.log(`   - Records to update: ${updateRecords.length}\n`);

// Step 3: Create update CSV
console.log('📝 Step 3: Creating update file...');
const updateCsv = ['Id,Clean_Status__c'];

for (const record of updateRecords) {
    updateCsv.push(`${record.Id},${record.Clean_Status__c}`);
}

fs.writeFileSync(`${OUTPUT_DIR}/dedupe_updates.csv`, updateCsv.join('\n'));
console.log(`✅ Update file created with ${updateRecords.length} records`);

// Save duplicate mapping for reference
const duplicateMapping = {
    summary: {
        totalGroups: duplicateGroupCount,
        totalDuplicates: totalDuplicates,
        byType: {
            email: emailDupeCount,
            phone: duplicateGroups.filter(g => g.type === 'Phone').length,
            nameCompany: duplicateGroups.filter(g => g.type === 'Name_Company').length
        }
    },
    groups: duplicateGroups,
    generatedAt: new Date().toISOString()
};

fs.writeFileSync(`${OUTPUT_DIR}/duplicate_mapping.json`, JSON.stringify(duplicateMapping, null, 2));
console.log(`✅ Duplicate mapping saved to duplicate_mapping.json\n`);

// Step 4: Bulk update back to Salesforce
console.log('📤 Step 4: Uploading deduplication results to Salesforce...');
try {
    const importCmd = `sf data upsert bulk --sobject Contact --external-id Id --file ${OUTPUT_DIR}/dedupe_updates.csv --target-org ${ORG_ALIAS} --wait 30`;
    console.log('Running bulk update...');
    execSync(importCmd, { stdio: 'inherit' });
    console.log('\n✅ Deduplication update complete!\n');
} catch (error) {
    console.error('❌ Update failed:', error.message);
    console.log('\nYou can manually upload the file: ' + OUTPUT_DIR + '/dedupe_updates.csv');
    process.exit(1);
}

// Step 5: Verify results
console.log('📊 Step 5: Verifying deduplication results...\n');
console.log('Updated Clean Status Distribution:');
const statusQuery = `sf data query --query "SELECT Clean_Status__c, COUNT(Id) count FROM Contact WHERE Clean_Status__c != null GROUP BY Clean_Status__c ORDER BY Clean_Status__c" --target-org ${ORG_ALIAS}`;
execSync(statusQuery, { stdio: 'inherit' });

console.log('\n✨ DEDUPLICATION COMPLETE!');
console.log(`Total duplicate records identified: ${totalDuplicates}`);
console.log(`- Email duplicates marked as 'Merge'`);
console.log(`- Phone duplicates marked as 'Merge'`);
console.log(`- Name+Company potential duplicates marked as 'Review'`);
console.log(`\nDuplicate mapping saved to: ${OUTPUT_DIR}/duplicate_mapping.json`);
console.log('\nNext steps:');
console.log('1. Review contacts marked as "Merge" for merging/deletion');
console.log('2. Review contacts marked as "Review" for manual verification');
console.log('3. Use duplicate_mapping.json to see which records are masters');