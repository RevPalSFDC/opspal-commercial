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

console.log('🔍 COMPREHENSIVE DEDUPLICATION PROCESSOR');
console.log('=========================================\n');
console.log('Processing ALL contacts to find duplicates across entire database\n');

// Step 1: Export ALL contacts including those already marked
console.log('📥 Step 1: Exporting ALL contacts for comprehensive deduplication...');
const query = `SELECT Id, Email, Phone, MobilePhone, AccountId, Account.Name,
       Name, FirstName, LastName, Title, CreatedDate, LastModifiedDate,
       Clean_Status__c, Sync_Status__c, HubSpot_Contact_ID__c
FROM Contact
WHERE Email != null OR Phone != null OR MobilePhone != null
ORDER BY CreatedDate ASC`;

try {
    const exportCmd = `sf data query --query "${query}" --target-org ${ORG_ALIAS} --json > ${OUTPUT_DIR}/all_contacts.json`;
    console.log('Running comprehensive export (this will take several minutes)...');
    execSync(exportCmd);
    console.log('✅ Export complete!\n');
} catch (error) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
}

// Step 2: Process and identify duplicates
console.log('🔧 Step 2: Identifying duplicates across entire database...');
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

// Helper function to calculate data quality score
function calculateScore(contact) {
    let score = 0;
    if (contact.Email) score += 30;
    if (contact.Phone || contact.MobilePhone) score += 30;
    if (contact.AccountId) score += 20;
    if (contact.Name && contact.Name !== 'Unknown') score += 20;
    if (contact.Title) score += 10;
    if (contact.HubSpot_Contact_ID__c) score += 15; // Bonus for HubSpot sync
    if (contact.Clean_Status__c === 'OK') score += 10; // Bonus for already validated
    return score;
}

// Build maps for duplicate detection
for (const contact of contacts) {
    // Skip if already marked as duplicate
    if (contact.Clean_Status__c === 'Merge') continue;

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

        if (emailDupeCount <= 10 && duplicates.length > 2) {
            console.log(`   - ${email}: ${duplicates.length} contacts (master: ${master.Name || master.Id})`);
        }
    }
}
console.log(`   Total email duplicate groups: ${emailDupeCount}`);
console.log(`   Total email duplicates to mark: ${updateRecords.length}`);

// Process phone duplicates (for contacts not already processed)
const phoneStartCount = updateRecords.length;
console.log('\n📱 Phone Duplicates (not caught by email):');
let phoneDupeCount = 0;
for (const [phone, duplicates] of phoneMap) {
    const unprocessed = duplicates.filter(c => !processedIds.has(c.Id));
    if (unprocessed.length > 1) {
        duplicateGroupCount++;
        phoneDupeCount++;

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
                Clean_Status__c: 'Merge'
            });
        }
    }
}
console.log(`   Phone duplicate groups: ${phoneDupeCount}`);
console.log(`   Phone duplicates to mark: ${updateRecords.length - phoneStartCount}`);

// Process name+company duplicates (requires manual review)
const nameStartCount = updateRecords.length;
console.log('\n👥 Name + Company Duplicates (marked as Review):');
let nameCompanyDupeCount = 0;
for (const [key, duplicates] of nameCompanyMap) {
    const unprocessed = duplicates.filter(c => !processedIds.has(c.Id));
    if (unprocessed.length > 1) {
        duplicateGroupCount++;
        nameCompanyDupeCount++;

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

        // Mark as Review (not Merge) since name matches need verification
        for (let i = 1; i < unprocessed.length; i++) {
            const contact = unprocessed[i];
            processedIds.add(contact.Id);
            totalDuplicates++;
            updateRecords.push({
                Id: contact.Id,
                Clean_Status__c: 'Review' // Needs human review
            });
        }
    }
}
console.log(`   Name+Company duplicate groups: ${nameCompanyDupeCount}`);
console.log(`   Name+Company records to review: ${updateRecords.length - nameStartCount}`);

console.log(`\n📊 Summary:`);
console.log(`   - Total contacts analyzed: ${contacts.length}`);
console.log(`   - Duplicate groups found: ${duplicateGroupCount}`);
console.log(`   - Total duplicate/review records: ${totalDuplicates}`);
console.log(`   - Records to update: ${updateRecords.length}\n`);

// Step 3: Create update CSV
console.log('📝 Step 3: Creating comprehensive update file...');
const updateCsv = ['Id,Clean_Status__c'];

for (const record of updateRecords) {
    updateCsv.push(`${record.Id},${record.Clean_Status__c}`);
}

fs.writeFileSync(`${OUTPUT_DIR}/comprehensive_dedupe_updates.csv`, updateCsv.join('\n'));
console.log(`✅ Update file created with ${updateRecords.length} records`);

// Save duplicate mapping for reference
const duplicateMapping = {
    summary: {
        totalContactsAnalyzed: contacts.length,
        totalGroups: duplicateGroupCount,
        totalDuplicates: totalDuplicates,
        byType: {
            email: emailDupeCount,
            phone: phoneDupeCount,
            nameCompany: nameCompanyDupeCount
        }
    },
    groups: duplicateGroups,
    generatedAt: new Date().toISOString()
};

fs.writeFileSync(`${OUTPUT_DIR}/comprehensive_duplicate_mapping.json`, JSON.stringify(duplicateMapping, null, 2));
console.log(`✅ Duplicate mapping saved to comprehensive_duplicate_mapping.json\n`);

// Step 4: Split updates into batches for processing
console.log('📦 Step 4: Splitting updates into manageable batches...');
const BATCH_SIZE = 10000; // Process 10k records at a time
const batches = [];

for (let i = 0; i < updateRecords.length; i += BATCH_SIZE) {
    const batchRecords = updateRecords.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batchCsv = ['Id,Clean_Status__c'];

    for (const record of batchRecords) {
        batchCsv.push(`${record.Id},${record.Clean_Status__c}`);
    }

    const batchFile = `${OUTPUT_DIR}/batch_${batchNum}.csv`;
    fs.writeFileSync(batchFile, batchCsv.join('\n'));
    batches.push({ file: batchFile, records: batchRecords.length });
    console.log(`   - Batch ${batchNum}: ${batchRecords.length} records`);
}

console.log(`\n✅ Created ${batches.length} batch files for processing`);

// Step 5: Process each batch
console.log('\n📤 Step 5: Uploading updates to Salesforce in batches...');
let successfulUpdates = 0;
let failedUpdates = 0;

for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\n   Processing batch ${i + 1}/${batches.length} (${batch.records} records)...`);

    try {
        const importCmd = `sf data upsert bulk --sobject Contact --external-id Id --file ${batch.file} --target-org ${ORG_ALIAS} --wait 30`;
        execSync(importCmd, { stdio: 'inherit' });
        successfulUpdates += batch.records;
        console.log(`   ✅ Batch ${i + 1} complete`);
    } catch (error) {
        console.error(`   ❌ Batch ${i + 1} failed:`, error.message);
        failedUpdates += batch.records;
        console.log(`   Continuing with next batch...`);
    }
}

console.log(`\n📊 Update Results:`);
console.log(`   - Successfully updated: ${successfulUpdates} records`);
console.log(`   - Failed to update: ${failedUpdates} records`);

// Step 6: Verify results
console.log('\n📊 Step 6: Verifying comprehensive deduplication results...\n');
console.log('Updated Clean Status Distribution:');
const statusQuery = `sf data query --query "SELECT Clean_Status__c, COUNT(Id) count FROM Contact WHERE Clean_Status__c != null GROUP BY Clean_Status__c ORDER BY Clean_Status__c" --target-org ${ORG_ALIAS}`;
execSync(statusQuery, { stdio: 'inherit' });

console.log('\n✨ COMPREHENSIVE DEDUPLICATION COMPLETE!');
console.log(`Total duplicate records identified: ${totalDuplicates}`);
console.log(`- Email duplicates marked as 'Merge'`);
console.log(`- Phone duplicates marked as 'Merge'`);
console.log(`- Name+Company potential duplicates marked as 'Review'`);
console.log(`\nDuplicate mapping saved to: ${OUTPUT_DIR}/comprehensive_duplicate_mapping.json`);
console.log('\nNext steps:');
console.log('1. Review contacts marked as "Merge" for merging/deletion');
console.log('2. Review contacts marked as "Review" for manual verification');
console.log('3. Use comprehensive_duplicate_mapping.json to see master records');
console.log('4. Consider implementing automated merge process for confirmed duplicates');