#!/usr/bin/env node

/**
 * Mark Master Records Script
 *
 * This script identifies and marks master (survivor) records with Is_Master__c = true
 * and marks duplicates with Is_Master__c = false along with the master record reference.
 *
 * CRITICAL: This must be run BEFORE any merge operations to ensure proper record survival.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration from environment
const ORG_ALIAS = process.env.SALESFORCE_ORG_ALIAS || 'rentable-production';
const OUTPUT_DIR = process.env.OUTPUT_DIRECTORY || './output/master-marking';
const DRY_RUN = process.env.DRY_RUN_DEFAULT === 'true';

// Master selection strategy from environment
const MASTER_SELECTION = process.env.DEDUPE_MASTER_SELECTION || 'highest_quality';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('🎯 MASTER RECORD MARKING SYSTEM');
console.log('================================\n');
console.log(`Environment: ${ORG_ALIAS}`);
console.log(`Master Selection Strategy: ${MASTER_SELECTION}`);
console.log(`Dry Run: ${DRY_RUN}\n`);

// Step 1: Load duplicate mapping
console.log('📥 Step 1: Loading duplicate mapping...');
const mappingFile = path.join(OUTPUT_DIR, '../duplicate_mapping.json');

if (!fs.existsSync(mappingFile)) {
    console.error('❌ Duplicate mapping file not found. Run deduplication analysis first.');
    process.exit(1);
}

const duplicateMapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
console.log(`   Found ${duplicateMapping.groups.length} duplicate groups\n`);

// Step 2: Prepare master marking updates
console.log('🏆 Step 2: Preparing master record markings...');

const masterUpdates = [];
const duplicateUpdates = [];
const stats = {
    totalGroups: duplicateMapping.groups.length,
    totalMasters: 0,
    totalDuplicates: 0,
    avgDuplicatesPerMaster: 0
};

// Process each duplicate group
for (const group of duplicateMapping.groups) {
    // Validate master selection
    if (!group.masterId) {
        console.warn(`⚠️  No master selected for group ${group.groupId}`);
        continue;
    }

    // Mark master record
    masterUpdates.push({
        Id: group.masterId,
        Is_Master__c: true,
        Clean_Status__c: 'Master',
        Duplicate_Count__c: group.duplicateIds.length,
        Master_Selection_Method__c: group.selectionMethod || MASTER_SELECTION,
        Master_Score__c: group.masterScore || 100
    });

    stats.totalMasters++;

    // Mark duplicate records
    for (const duplicateId of group.duplicateIds) {
        duplicateUpdates.push({
            Id: duplicateId,
            Is_Master__c: false,
            Clean_Status__c: 'Duplicate',
            Merge_Candidates__c: group.masterId,
            Master_Score__c: group.duplicateScores?.[duplicateId] || 0
        });
        stats.totalDuplicates++;
    }
}

stats.avgDuplicatesPerMaster = (stats.totalDuplicates / stats.totalMasters).toFixed(2);

console.log(`\n📊 Master Marking Statistics:`);
console.log(`   - Total Duplicate Groups: ${stats.totalGroups}`);
console.log(`   - Master Records Identified: ${stats.totalMasters}`);
console.log(`   - Duplicate Records Identified: ${stats.totalDuplicates}`);
console.log(`   - Average Duplicates per Master: ${stats.avgDuplicatesPerMaster}\n`);

// Step 3: Create CSV files for updates
console.log('📝 Step 3: Creating update files...');

// Create master updates CSV
const masterCsvFile = path.join(OUTPUT_DIR, 'master_records_update.csv');
const masterCsv = ['Id,Is_Master__c,Clean_Status__c,Duplicate_Count__c,Master_Selection_Method__c,Master_Score__c'];

for (const update of masterUpdates) {
    masterCsv.push([
        update.Id,
        update.Is_Master__c,
        update.Clean_Status__c,
        update.Duplicate_Count__c,
        update.Master_Selection_Method__c,
        update.Master_Score__c
    ].join(','));
}

fs.writeFileSync(masterCsvFile, masterCsv.join('\n'));
console.log(`   ✅ Master records file created: ${masterUpdates.length} records`);

// Create duplicate updates CSV
const duplicateCsvFile = path.join(OUTPUT_DIR, 'duplicate_records_update.csv');
const duplicateCsv = ['Id,Is_Master__c,Clean_Status__c,Merge_Candidates__c,Master_Score__c'];

for (const update of duplicateUpdates) {
    duplicateCsv.push([
        update.Id,
        update.Is_Master__c,
        update.Clean_Status__c,
        update.Merge_Candidates__c,
        update.Master_Score__c
    ].join(','));
}

fs.writeFileSync(duplicateCsvFile, duplicateCsv.join('\n'));
console.log(`   ✅ Duplicate records file created: ${duplicateUpdates.length} records\n`);

// Step 4: Apply updates to Salesforce (if not dry run)
if (!DRY_RUN) {
    console.log('📤 Step 4: Applying updates to Salesforce...\n');

    // Update master records
    console.log('   Updating master records...');
    try {
        const masterCmd = `sf data upsert bulk --sobject Contact --external-id Id --file "${masterCsvFile}" --target-org ${ORG_ALIAS} --wait 30`;
        const masterResult = execSync(masterCmd, { encoding: 'utf8' });
        console.log('   ✅ Master records updated successfully\n');
    } catch (error) {
        console.error('   ❌ Failed to update master records:', error.message);
    }

    // Update duplicate records
    console.log('   Updating duplicate records...');
    try {
        const duplicateCmd = `sf data upsert bulk --sobject Contact --external-id Id --file "${duplicateCsvFile}" --target-org ${ORG_ALIAS} --wait 30`;
        const duplicateResult = execSync(duplicateCmd, { encoding: 'utf8' });
        console.log('   ✅ Duplicate records updated successfully\n');
    } catch (error) {
        console.error('   ❌ Failed to update duplicate records:', error.message);
    }
} else {
    console.log('ℹ️  DRY RUN MODE - No updates applied to Salesforce');
    console.log('   Review the generated CSV files and run without DRY_RUN to apply changes.\n');
}

// Step 5: Validation queries
console.log('🔍 Step 5: Validation Queries...\n');

const validationQueries = [
    {
        name: 'Master Records Count',
        query: `SELECT COUNT(Id) FROM Contact WHERE Is_Master__c = true`
    },
    {
        name: 'Duplicate Records Count',
        query: `SELECT COUNT(Id) FROM Contact WHERE Is_Master__c = false AND Clean_Status__c = 'Duplicate'`
    },
    {
        name: 'Records with Merge Candidates',
        query: `SELECT COUNT(Id) FROM Contact WHERE Merge_Candidates__c != null`
    },
    {
        name: 'Sample Master Records',
        query: `SELECT Id, Name, Email, Is_Master__c, Duplicate_Count__c FROM Contact WHERE Is_Master__c = true LIMIT 5`
    }
];

console.log('Run these queries to validate the marking:\n');
for (const vq of validationQueries) {
    console.log(`-- ${vq.name}`);
    console.log(`sf data query --query "${vq.query}" --target-org ${ORG_ALIAS}\n`);
}

// Step 6: Generate summary report
console.log('📊 Step 6: Generating Summary Report...\n');

const summaryReport = {
    timestamp: new Date().toISOString(),
    environment: ORG_ALIAS,
    dryRun: DRY_RUN,
    masterSelectionStrategy: MASTER_SELECTION,
    statistics: stats,
    files: {
        masterUpdates: masterCsvFile,
        duplicateUpdates: duplicateCsvFile
    },
    nextSteps: [
        '1. Verify Is_Master__c field markings',
        '2. Review master selection quality',
        '3. Check relationship preservation needs',
        '4. Proceed with merge operations'
    ]
};

const reportFile = path.join(OUTPUT_DIR, 'master_marking_report.json');
fs.writeFileSync(reportFile, JSON.stringify(summaryReport, null, 2));

console.log('✨ MASTER RECORD MARKING COMPLETE!\n');
console.log('Summary:');
console.log(`  - ${stats.totalMasters} master records marked with Is_Master__c = true`);
console.log(`  - ${stats.totalDuplicates} duplicate records marked with Is_Master__c = false`);
console.log(`  - Files saved in: ${OUTPUT_DIR}\n`);

console.log('Next Steps:');
console.log('1. Review the generated CSV files');
console.log('2. Run validation queries to confirm markings');
console.log('3. Proceed with merge operations using Is_Master__c field');
console.log('4. Master records will survive the merge process\n');

// Helper function to calculate data quality score
function calculateQualityScore(record) {
    const weights = {
        email: parseFloat(process.env.QUALITY_WEIGHT_EMAIL) || 0.30,
        phone: parseFloat(process.env.QUALITY_WEIGHT_PHONE) || 0.25,
        name: parseFloat(process.env.QUALITY_WEIGHT_NAME) || 0.20,
        company: parseFloat(process.env.QUALITY_WEIGHT_COMPANY) || 0.15,
        address: parseFloat(process.env.QUALITY_WEIGHT_ADDRESS) || 0.10
    };

    let score = 0;
    if (record.Email) score += weights.email * 100;
    if (record.Phone || record.MobilePhone) score += weights.phone * 100;
    if (record.Name && record.Name !== 'Unknown') score += weights.name * 100;
    if (record.AccountId) score += weights.company * 100;
    if (record.MailingStreet || record.MailingCity) score += weights.address * 100;

    // Bonus for external sync
    if (record.HubSpot_Contact_ID__c) score += 15;

    return Math.min(100, score);
}