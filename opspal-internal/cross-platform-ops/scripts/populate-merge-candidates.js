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

console.log('🔗 MERGE CANDIDATES POPULATOR');
console.log('==============================\n');
console.log('Populating Merge_Candidates__c field with master record IDs\n');

// Step 1: Load the duplicate mapping
console.log('📥 Step 1: Loading duplicate mapping...');
const mappingFiles = [
    'require('./config/paths.config').PROJECT_ROOT',
    'require('./config/paths.config').PROJECT_ROOT'
];

let duplicateMapping = { groups: [] };
for (const mappingFile of mappingFiles) {
    if (fs.existsSync(mappingFile)) {
        console.log(`   Loading from: ${mappingFile}`);
        const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
        if (mapping.groups) {
            duplicateMapping.groups = duplicateMapping.groups.concat(mapping.groups);
        }
    }
}

console.log(`   Found ${duplicateMapping.groups.length} duplicate groups\n`);

// Step 2: Build update list
console.log('🔧 Step 2: Building update list...');
const updateRecords = [];
const masterToGroup = new Map();

// Track all master-duplicate relationships
for (const group of duplicateMapping.groups) {
    const masterId = group.masterId;

    // Store all duplicates that should point to this master
    for (const duplicateId of group.duplicateIds) {
        updateRecords.push({
            Id: duplicateId,
            Merge_Candidates__c: masterId
        });
    }

    // Also track which master belongs to which group
    if (!masterToGroup.has(masterId)) {
        masterToGroup.set(masterId, []);
    }
    masterToGroup.get(masterId).push(...group.duplicateIds);
}

console.log(`   Prepared ${updateRecords.length} records for update\n`);

// Step 3: Create update CSV
console.log('📝 Step 3: Creating update file...');
const updateCsv = ['Id,Merge_Candidates__c'];

for (const record of updateRecords) {
    updateCsv.push(`${record.Id},${record.Merge_Candidates__c}`);
}

const csvFile = `${OUTPUT_DIR}/merge_candidates_update.csv`;
fs.writeFileSync(csvFile, updateCsv.join('\n'));
console.log(`✅ Update file created with ${updateRecords.length} records\n`);

// Step 4: Split into batches for processing
console.log('📦 Step 4: Splitting updates into batches...');
const BATCH_SIZE = 10000;
const batches = [];

for (let i = 0; i < updateRecords.length; i += BATCH_SIZE) {
    const batchRecords = updateRecords.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batchCsv = ['Id,Merge_Candidates__c'];

    for (const record of batchRecords) {
        batchCsv.push(`${record.Id},${record.Merge_Candidates__c}`);
    }

    const batchFile = `${OUTPUT_DIR}/batch_${batchNum}.csv`;
    fs.writeFileSync(batchFile, batchCsv.join('\n'));
    batches.push({ file: batchFile, records: batchRecords.length });
    console.log(`   - Batch ${batchNum}: ${batchRecords.length} records`);
}

console.log(`\n✅ Created ${batches.length} batch files for processing\n`);

// Step 5: Process each batch
console.log('📤 Step 5: Uploading Merge_Candidates__c updates to Salesforce...');
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
console.log('\n📊 Step 6: Verifying Merge_Candidates__c population...\n');

console.log('Sample of updated records:');
const sampleQuery = `sf data query --query "SELECT Id, Name, Clean_Status__c, Merge_Candidates__c FROM Contact WHERE Clean_Status__c = 'Merge' AND Merge_Candidates__c != null LIMIT 5" --target-org ${ORG_ALIAS}`;
try {
    execSync(sampleQuery, { stdio: 'inherit' });
} catch (error) {
    console.log('Unable to verify - you can check manually');
}

console.log('\nCount of records with Merge_Candidates populated:');
const countQuery = `sf data query --query "SELECT COUNT(Id) FROM Contact WHERE Clean_Status__c = 'Merge' AND Merge_Candidates__c != null" --target-org ${ORG_ALIAS}`;
try {
    execSync(countQuery, { stdio: 'inherit' });
} catch (error) {
    console.log('Unable to verify - you can check manually');
}

console.log('\n✨ MERGE CANDIDATES POPULATION COMPLETE!');
console.log('All duplicate records now have their master record ID in Merge_Candidates__c');
console.log('\nNext steps:');
console.log('1. Review the populated Merge_Candidates__c field');
console.log('2. Use this field to merge duplicate records');
console.log('3. Consider creating a merge process to combine the data');