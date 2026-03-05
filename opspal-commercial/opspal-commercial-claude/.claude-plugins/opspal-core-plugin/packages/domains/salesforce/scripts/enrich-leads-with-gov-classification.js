#!/usr/bin/env node

/**
 * Salesforce Lead/Contact Government Classification Enrichment
 *
 * Enriches Salesforce Leads and Contacts with government organization classifications.
 * Queries records with government email domains, classifies them using the
 * gov-org-classifier system, and updates custom fields.
 *
 * @module enrich-leads-with-gov-classification
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const GovOrgBatchClassifier = require('../../scripts/lib/gov-org-batch-classifier');

// Custom field definitions for government classification
const CUSTOM_FIELDS = {
  Gov_Org_Bucket__c: {
    label: 'Government Organization Bucket',
    type: 'Picklist',
    values: [
      'Local Law Enforcement',
      'County Sheriff',
      'University Police',
      'District Attorney',
      'County Prosecutors',
      'Commonwealth Attorney',
      'Municipal Fire Department',
      'County Fire Department',
      'County EMS',
      'Hospital EMS Divisions',
      'City/County EM Office',
      'Public Safety Answering Points',
      '911 Center',
      'Department of Corrections (DOC)',
      'Parole/Probation Boards',
      'State Attorney General\'s Office (AGO)',
      'Department of Transportation (DOT)',
      'Highway Authority',
      'Ports Authority',
      'State Office of Emergency Management (State OEM)',
      'Highway Patrol',
      'State Police',
      'Bureau of Investigation / State Investigative Divisions',
      'Commercial Vehicle Enforcement',
      'Conservation Agencies',
      'FEMA',
      'DHS Sub-Agency',
      'Federal Protective Service',
      'U.S. Marshals Service',
      'FEMA Regional Office',
      'Not Applicable',
      'Unclassified'
    ]
  },
  Gov_Org_Confidence__c: {
    label: 'Government Classification Confidence',
    type: 'Number',
    precision: 3,
    scale: 0,
    description: 'Confidence score for government organization classification (0-100)'
  },
  Gov_Org_Classification_Date__c: {
    label: 'Classification Date',
    type: 'Date',
    description: 'Date when government organization classification was performed'
  },
  Gov_Org_Rationale__c: {
    label: 'Classification Rationale',
    type: 'LongTextArea',
    length: 1000,
    visibleLines: 3,
    description: 'Explanation of why this bucket was selected'
  },
  Gov_Org_Jurisdiction__c: {
    label: 'Jurisdiction',
    type: 'Text',
    length: 255,
    description: 'Geographic jurisdiction (city, county, state)'
  }
};

class SalesforceGovClassifier {
  constructor(options = {}) {
    this.orgAlias = options.orgAlias || process.env.SALESFORCE_ORG_ALIAS || 'production';
    this.objectType = options.objectType || 'Lead'; // Lead or Contact
    this.batchSize = options.batchSize || 50;
    this.confidenceThreshold = options.confidenceThreshold || 0.7;
    this.dryRun = options.dryRun || false;

    // Initialize classifier
    this.classifier = new GovOrgBatchClassifier({
      batchSize: this.batchSize,
      delay: 2000, // 2 second delay between batches
      outputDir: path.join(__dirname, `../data/gov-classifications-${this.objectType.toLowerCase()}`)
    });

    this.stats = {
      total: 0,
      classified: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };
  }

  /**
   * Execute Salesforce CLI command
   */
  async sfCommand(command, options = {}) {
    try {
      const fullCommand = `sf ${command} --target-org ${this.orgAlias} --json`;
      console.log(`   Executing: ${fullCommand.substring(0, 100)}...`);

      const { stdout, stderr } = await execAsync(fullCommand, { maxBuffer: 10 * 1024 * 1024 });

      if (stderr && !stderr.includes('warning')) {
        console.error(`   Warning: ${stderr}`);
      }

      return JSON.parse(stdout);
    } catch (error) {
      if (error.stdout) {
        try {
          const result = JSON.parse(error.stdout);
          if (result.status !== 0) {
            throw new Error(result.message || 'Salesforce command failed');
          }
          return result;
        } catch (parseError) {
          throw new Error(`Command failed: ${error.message}`);
        }
      }
      throw error;
    }
  }

  /**
   * Initialize: Create custom fields if they don't exist
   */
  async initialize() {
    console.log(`🔧 Initializing government classification system for ${this.objectType}...\n`);

    // Check existing fields
    const describeResult = await this.sfCommand(`sobject describe --sobject ${this.objectType}`);

    if (describeResult.status !== 0) {
      throw new Error(`Failed to describe ${this.objectType}: ${describeResult.message}`);
    }

    const existingFields = describeResult.result.fields.map(f => f.name);

    // Create missing fields
    for (const [fieldName, fieldDef] of Object.entries(CUSTOM_FIELDS)) {
      if (existingFields.includes(fieldName)) {
        console.log(`   ℹ️  Field exists: ${fieldName}`);
        continue;
      }

      console.log(`   Creating field: ${fieldName}...`);

      // Build field metadata XML
      const fieldXml = this.buildFieldXml(fieldName, fieldDef);
      const xmlPath = `/tmp/${fieldName}.field-meta.xml`;
      fs.writeFileSync(xmlPath, fieldXml);

      if (!this.dryRun) {
        try {
          await this.sfCommand(`project deploy start --source-dir /tmp --metadata-dir ${xmlPath}`);
          console.log(`   ✅ Created field: ${fieldName}`);
        } catch (error) {
          console.log(`   ⚠️  Error creating ${fieldName}:`, error.message);
        }
      } else {
        console.log(`   [DRY RUN] Would create field: ${fieldName}`);
      }
    }

    console.log('\n✅ Initialization complete\n');
  }

  /**
   * Build field metadata XML
   */
  buildFieldXml(fieldName, fieldDef) {
    let fieldXml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${fieldName}</fullName>
    <label>${fieldDef.label}</label>
    <type>${fieldDef.type}</type>`;

    if (fieldDef.type === 'Picklist') {
      fieldXml += '\n    <valueSet>';
      fieldXml += '\n        <restricted>true</restricted>';
      fieldXml += '\n        <valueSetDefinition>';
      fieldXml += '\n            <sorted>false</sorted>';
      fieldDef.values.forEach(value => {
        fieldXml += `\n            <value>
                <fullName>${value}</fullName>
                <default>false</default>
                <label>${value}</label>
            </value>`;
      });
      fieldXml += '\n        </valueSetDefinition>';
      fieldXml += '\n    </valueSet>';
    } else if (fieldDef.type === 'Number') {
      fieldXml += `\n    <precision>${fieldDef.precision}</precision>`;
      fieldXml += `\n    <scale>${fieldDef.scale}</scale>`;
    } else if (fieldDef.type === 'Text') {
      fieldXml += `\n    <length>${fieldDef.length}</length>`;
    } else if (fieldDef.type === 'LongTextArea') {
      fieldXml += `\n    <length>${fieldDef.length}</length>`;
      fieldXml += `\n    <visibleLines>${fieldDef.visibleLines}</visibleLines>`;
    }

    if (fieldDef.description) {
      fieldXml += `\n    <description>${fieldDef.description}</description>`;
    }

    fieldXml += '\n</CustomField>';

    return fieldXml;
  }

  /**
   * Query records needing classification
   */
  async queryRecordsNeedingClassification(filter = {}) {
    console.log(`🔍 Querying ${this.objectType}s needing classification...\n`);

    // Build WHERE clause
    const whereClauses = [
      "(Email LIKE '%.gov' OR Email LIKE '%.us' OR Email LIKE '%.edu')"
    ];

    if (filter.unclassifiedOnly) {
      whereClauses.push('Gov_Org_Bucket__c = null');
    }

    const whereClause = whereClauses.join(' AND ');

    // Build SOQL query
    const fields = [
      'Id',
      'FirstName',
      'LastName',
      'Email',
      'Company',
      'Title',
      'Gov_Org_Bucket__c'
    ];

    const soql = `SELECT ${fields.join(', ')} FROM ${this.objectType} WHERE ${whereClause}`;

    console.log(`   Query: ${soql}\n`);

    // Execute query
    const result = await this.sfCommand(`data query --query "${soql}"`);

    if (result.status !== 0) {
      throw new Error(`Query failed: ${result.message}`);
    }

    const records = result.result.records || [];
    console.log(`✅ Found ${records.length} ${this.objectType.toLowerCase()}s\n`);

    return records;
  }

  /**
   * Convert Salesforce record to classification input format
   */
  recordToClassificationInput(record) {
    return {
      company: record.Company || null,
      email: record.Email || null,
      name: record.FirstName && record.LastName
        ? `${record.FirstName} ${record.LastName}`
        : record.FirstName || record.LastName || null,
      title: record.Title || null,
      _salesforceId: record.Id // Store ID for updates
    };
  }

  /**
   * Prepare CSV for bulk update
   */
  prepareBulkUpdateCsv(classifications) {
    const headers = [
      'Id',
      'Gov_Org_Bucket__c',
      'Gov_Org_Confidence__c',
      'Gov_Org_Classification_Date__c',
      'Gov_Org_Rationale__c',
      'Gov_Org_Jurisdiction__c'
    ];

    const rows = classifications
      .filter(c => c.classification.confidence >= this.confidenceThreshold)
      .map(c => {
        const row = [
          c.input._salesforceId,
          c.classification.bucket,
          Math.round(c.classification.confidence * 100),
          new Date().toISOString().split('T')[0],
          `"${c.classification.rationale.replace(/"/g, '""')}"`,
          c.normalized && c.normalized.jurisdiction ? `"${c.normalized.jurisdiction}"` : ''
        ];
        return row.join(',');
      });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Bulk update via Data Loader / Bulk API
   */
  async bulkUpdate(csvData) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const csvPath = path.join(__dirname, `../data/gov-update-${timestamp}.csv`);

    // Write CSV file
    fs.writeFileSync(csvPath, csvData);
    console.log(`   💾 Saved update CSV: ${csvPath}\n`);

    if (this.dryRun) {
      console.log('   [DRY RUN] Would execute bulk upsert');
      return { success: true, dryRun: true };
    }

    // Execute bulk upsert
    console.log('   ⏳ Executing bulk upsert...');

    try {
      const result = await this.sfCommand(
        `data upsert bulk --sobject ${this.objectType} --file ${csvPath} --external-id Id --wait 10`
      );

      if (result.status === 0 && result.result) {
        console.log(`   ✅ Bulk update complete`);
        console.log(`      Records processed: ${result.result.numberRecordsProcessed || 0}`);
        console.log(`      Records failed: ${result.result.numberRecordsFailed || 0}`);

        return {
          success: true,
          processed: result.result.numberRecordsProcessed || 0,
          failed: result.result.numberRecordsFailed || 0,
          jobId: result.result.id
        };
      } else {
        throw new Error(result.message || 'Bulk update failed');
      }
    } catch (error) {
      console.error(`   ❌ Bulk update failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Main enrichment workflow
   */
  async enrich(options = {}) {
    console.log(`🚀 Starting Government Organization Classification Enrichment\n`);
    console.log(`   Org: ${this.orgAlias}`);
    console.log(`   Object: ${this.objectType}`);
    console.log(`   Confidence Threshold: ${this.confidenceThreshold}`);
    console.log(`   Dry Run: ${this.dryRun ? 'YES' : 'NO'}\n`);

    // Step 1: Query records
    const records = await this.queryRecordsNeedingClassification(options.filter || {});

    if (records.length === 0) {
      console.log(`✅ No ${this.objectType.toLowerCase()}s need classification\n`);
      return;
    }

    this.stats.total = records.length;

    // Step 2: Convert to classification input format
    const inputs = records.map(r => this.recordToClassificationInput(r));

    // Step 3: Classify using gov-org-batch-classifier
    console.log('🤖 Classifying records...\n');
    const classifications = await this.classifier.classifyBatch(inputs);

    // Step 4: Filter by confidence threshold
    const highConfidence = classifications.filter(
      c => c.classification.confidence >= this.confidenceThreshold
    );

    console.log(`\n📊 Classification Results:`);
    console.log(`   Total: ${classifications.length}`);
    console.log(`   High Confidence (≥${this.confidenceThreshold}): ${highConfidence.length}`);
    console.log(`   Will Update: ${highConfidence.length}\n`);

    this.stats.classified = classifications.length;
    this.stats.skipped = classifications.length - highConfidence.length;

    // Step 5: Prepare bulk update CSV
    const csvData = this.prepareBulkUpdateCsv(classifications);

    // Step 6: Bulk update Salesforce
    console.log('💾 Updating records in Salesforce...\n');
    const updateResult = await this.bulkUpdate(csvData);

    if (updateResult.success) {
      this.stats.updated = updateResult.processed || highConfidence.length;
    } else {
      this.stats.errors = highConfidence.length;
    }

    // Step 7: Save detailed results
    this.saveResults(classifications);

    // Print summary
    this.printSummary();

    return {
      stats: this.stats,
      classifications,
      updateResult
    };
  }

  /**
   * Save results to file
   */
  saveResults(classifications) {
    const outputDir = path.join(__dirname, `../data/gov-classifications-${this.objectType.toLowerCase()}`);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDir, `classification-results-${timestamp}.json`);

    fs.writeFileSync(outputPath, JSON.stringify(classifications, null, 2));
    console.log(`\n💾 Detailed results saved to: ${outputPath}\n`);
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 ENRICHMENT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total ${this.objectType}s Queried:   ${this.stats.total}`);
    console.log(`Successfully Classified:           ${this.stats.classified}`);
    console.log(`Updated in Salesforce:             ${this.stats.updated}`);
    console.log(`Skipped (Low Confidence):          ${this.stats.skipped}`);
    console.log(`Errors:                            ${this.stats.errors}`);
    console.log('='.repeat(60) + '\n');
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  function printUsage() {
    console.log('Usage: enrich-leads-with-gov-classification.js [options]');
    console.log('\nOptions:');
    console.log('  --init                 Initialize custom fields (run first)');
    console.log('  --org <alias>          Salesforce org alias (default: $SALESFORCE_ORG_ALIAS)');
    console.log('  --object <type>        Object type: Lead or Contact (default: Lead)');
    console.log('  --confidence <n>       Confidence threshold 0-1 (default: 0.7)');
    console.log('  --batch-size <n>       Batch size (default: 50)');
    console.log('  --dry-run              Preview changes without updating');
    console.log('  --unclassified-only    Only process records without classification');
    console.log('  --help, -h             Show this help message');
    process.exit(0);
  }

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
  }

  // Parse options
  const options = {
    init: args.includes('--init'),
    orgAlias: null,
    objectType: 'Lead',
    confidenceThreshold: 0.7,
    batchSize: 50,
    dryRun: args.includes('--dry-run'),
    filter: {
      unclassifiedOnly: args.includes('--unclassified-only')
    }
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--org') {
      options.orgAlias = args[++i];
    } else if (args[i] === '--object') {
      options.objectType = args[++i];
    } else if (args[i] === '--confidence') {
      options.confidenceThreshold = parseFloat(args[++i]);
    } else if (args[i] === '--batch-size') {
      options.batchSize = parseInt(args[++i]);
    }
  }

  // Validate object type
  if (!['Lead', 'Contact'].includes(options.objectType)) {
    console.error('Error: --object must be Lead or Contact');
    process.exit(1);
  }

  // Run
  const enricher = new SalesforceGovClassifier(options);

  (async () => {
    try {
      if (options.init) {
        await enricher.initialize();
      } else {
        await enricher.enrich(options);
      }
    } catch (error) {
      console.error('\n❌ Enrichment failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}

module.exports = SalesforceGovClassifier;
