/**
 * Pre-Batch Validation Framework
 *
 * Validates analysis data freshness and completeness before batch execution.
 * Prevents stale/incomplete data from driving critical business decisions.
 *
 * Features:
 * - Configurable sampling (default: 10 random accounts)
 * - Comparison logic: query actual SF data vs analysis JSON
 * - Staleness detection (warn if >24 hours old)
 * - Automated pre-batch hook integration
 * - Detailed error reporting with remediation steps
 *
 * @module validate-analysis-freshness
 * @version 1.0.0
 * @created 2025-10-14
 * @fixes Reflection Cohort fp-001-data-quality-validation
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG = {
  sampleSize: 10,                    // Number of random records to validate
  stalenessThresholdHours: 24,       // Warn if analysis >24h old
  mismatchThresholdPercent: 10,      // Fail if >10% mismatch
  requiredFields: ['Id', 'Name'],    // Always validate these fields
  verbose: true
};

// =============================================================================
// Validation Results
// =============================================================================

class ValidationResult {
  constructor() {
    this.passed = false;
    this.warnings = [];
    this.errors = [];
    this.metadata = {
      validatedAt: new Date().toISOString(),
      sampleSize: 0,
      staleness: null,
      mismatchPercentage: 0
    };
  }

  addWarning(message) {
    this.warnings.push(message);
  }

  addError(message) {
    this.errors.push(message);
    this.passed = false;
  }

  setPassed(passed) {
    this.passed = passed && this.errors.length === 0;
  }

  toJSON() {
    return {
      passed: this.passed,
      warnings: this.warnings,
      errors: this.errors,
      metadata: this.metadata
    };
  }

  toString() {
    const status = this.passed ? '✅ PASSED' : '❌ FAILED';
    const lines = [
      `\n${status} - Pre-Batch Validation`,
      `Validated: ${this.metadata.validatedAt}`,
      `Sample Size: ${this.metadata.sampleSize}`,
      `Staleness: ${this.metadata.staleness || 'N/A'}`,
      `Mismatch: ${this.metadata.mismatchPercentage.toFixed(2)}%`
    ];

    if (this.warnings.length > 0) {
      lines.push(`\n⚠️  Warnings (${this.warnings.length}):`);
      this.warnings.forEach(w => lines.push(`   - ${w}`));
    }

    if (this.errors.length > 0) {
      lines.push(`\n❌ Errors (${this.errors.length}):`);
      this.errors.forEach(e => lines.push(`   - ${e}`));
    }

    return lines.join('\n');
  }
}

// =============================================================================
// Staleness Check
// =============================================================================

/**
 * Check if analysis file is stale
 *
 * @param {string} analysisFilePath - Path to analysis JSON file
 * @param {number} thresholdHours - Warn if older than this many hours
 * @returns {{isStale: boolean, ageHours: number, createdAt: Date}}
 */
function checkStaleness(analysisFilePath, thresholdHours) {
  if (!fs.existsSync(analysisFilePath)) {
    throw new Error(`Analysis file not found: ${analysisFilePath}`);
  }

  const stats = fs.statSync(analysisFilePath);
  const createdAt = stats.mtime;
  const now = new Date();
  const ageMs = now - createdAt;
  const ageHours = ageMs / (1000 * 60 * 60);

  return {
    isStale: ageHours > thresholdHours,
    ageHours,
    createdAt
  };
}

// =============================================================================
// Sampling Strategy
// =============================================================================

/**
 * Select random sample of records from analysis data
 *
 * @param {Array} analysisRecords - All records from analysis file
 * @param {number} sampleSize - Number of records to sample
 * @returns {Array} Random sample of records
 */
function selectRandomSample(analysisRecords, sampleSize) {
  if (analysisRecords.length <= sampleSize) {
    return analysisRecords;
  }

  const sample = [];
  const indices = new Set();

  while (sample.length < sampleSize) {
    const randomIndex = Math.floor(Math.random() * analysisRecords.length);
    if (!indices.has(randomIndex)) {
      indices.add(randomIndex);
      sample.push(analysisRecords[randomIndex]);
    }
  }

  return sample;
}

// =============================================================================
// Data Comparison
// =============================================================================

/**
 * Compare analysis data with current Salesforce data
 *
 * @param {Object} analysisRecord - Record from analysis JSON
 * @param {Object} liveRecord - Record from Salesforce query
 * @param {Array<string>} fieldsToCompare - Fields to validate
 * @returns {{matches: boolean, differences: Array}}
 */
function compareRecords(analysisRecord, liveRecord, fieldsToCompare) {
  const differences = [];

  for (const field of fieldsToCompare) {
    const analysisValue = analysisRecord[field];
    const liveValue = liveRecord[field];

    if (analysisValue !== liveValue) {
      differences.push({
        field,
        analysisValue,
        liveValue
      });
    }
  }

  return {
    matches: differences.length === 0,
    differences
  };
}

// =============================================================================
// Salesforce Query Execution
// =============================================================================

/**
 * Query Salesforce for current record data
 *
 * @param {Array<string>} recordIds - IDs to query
 * @param {Array<string>} fields - Fields to retrieve
 * @param {string} objectType - Salesforce object type (e.g., 'Account')
 * @param {string} targetUsername - Salesforce org alias
 * @returns {Promise<Array>} Current records from Salesforce
 */
async function queryLiveRecords(recordIds, fields, objectType, targetUsername) {
  const fieldList = fields.join(', ');
  const idList = recordIds.map(id => `'${id}'`).join(', ');
  const query = `SELECT ${fieldList} FROM ${objectType} WHERE Id IN (${idList})`;

  const cmd = `sf data query --query "${query}" --target-org ${targetUsername} --json`;

  try {
    const { stdout } = await execAsync(cmd);
    const result = JSON.parse(stdout);

    if (!result.result || !result.result.records) {
      throw new Error('Query returned no results');
    }

    return result.result.records;
  } catch (error) {
    throw new Error(`Failed to query live data: ${error.message}`);
  }
}

// =============================================================================
// Main Validation Function
// =============================================================================

/**
 * Validate analysis data freshness and completeness
 *
 * @param {Object} options
 * @param {string} options.analysisFilePath - Path to analysis JSON file
 * @param {string} options.targetUsername - Salesforce org alias
 * @param {string} [options.objectType='Account'] - Salesforce object type
 * @param {Array<string>} [options.fieldsToValidate] - Fields to compare (defaults to all common fields)
 * @param {number} [options.sampleSize=10] - Number of records to sample
 * @param {number} [options.stalenessThresholdHours=24] - Staleness threshold
 * @param {number} [options.mismatchThresholdPercent=10] - Allowed mismatch percentage
 * @param {boolean} [options.verbose=true] - Log detailed output
 * @returns {Promise<ValidationResult>}
 *
 * @example
 * const result = await validateAnalysisFreshness({
 *   analysisFilePath: './merge-analysis.json',
 *   targetUsername: 'myOrg',
 *   objectType: 'Account',
 *   fieldsToValidate: ['Id', 'Name', 'NumberOfEmployees'],
 *   sampleSize: 10
 * });
 *
 * if (!result.passed) {
 *   console.error(result.toString());
 *   process.exit(1);
 * }
 */
async function validateAnalysisFreshness(options) {
  const {
    analysisFilePath,
    targetUsername,
    objectType = 'Account',
    fieldsToValidate,
    sampleSize = DEFAULT_CONFIG.sampleSize,
    stalenessThresholdHours = DEFAULT_CONFIG.stalenessThresholdHours,
    mismatchThresholdPercent = DEFAULT_CONFIG.mismatchThresholdPercent,
    verbose = DEFAULT_CONFIG.verbose
  } = options;

  const result = new ValidationResult();

  if (verbose) {
    console.log('\n🔍 Starting Pre-Batch Validation');
    console.log(`   Analysis File: ${analysisFilePath}`);
    console.log(`   Target Org: ${targetUsername}`);
    console.log(`   Object Type: ${objectType}`);
    console.log(`   Sample Size: ${sampleSize}`);
  }

  try {
    // Step 1: Check staleness
    if (verbose) console.log('\n📅 Step 1: Checking file staleness...');

    const staleness = checkStaleness(analysisFilePath, stalenessThresholdHours);
    result.metadata.staleness = `${staleness.ageHours.toFixed(1)} hours old`;

    if (staleness.isStale) {
      result.addWarning(
        `Analysis file is ${staleness.ageHours.toFixed(1)} hours old (threshold: ${stalenessThresholdHours}h). ` +
        `Consider re-running analysis for most current data.`
      );
    }

    if (verbose) {
      console.log(`   File age: ${staleness.ageHours.toFixed(1)} hours`);
      console.log(`   ${staleness.isStale ? '⚠️  STALE' : '✅ FRESH'}`);
    }

    // Step 2: Load analysis data
    if (verbose) console.log('\n📄 Step 2: Loading analysis data...');

    const analysisData = JSON.parse(fs.readFileSync(analysisFilePath, 'utf8'));

    if (!analysisData || !analysisData.accounts || analysisData.accounts.length === 0) {
      result.addError('Analysis file is empty or has no accounts');
      return result;
    }

    if (verbose) console.log(`   Total records in analysis: ${analysisData.accounts.length}`);

    // Step 3: Select random sample
    if (verbose) console.log('\n🎲 Step 3: Selecting random sample...');

    const sample = selectRandomSample(analysisData.accounts, sampleSize);
    result.metadata.sampleSize = sample.length;

    if (verbose) console.log(`   Sample size: ${sample.length} records`);

    // Step 4: Determine fields to validate
    const fields = fieldsToValidate || Object.keys(sample[0]).filter(k => k !== 'attributes');

    if (verbose) {
      console.log(`\n🔑 Step 4: Fields to validate:`);
      console.log(`   ${fields.join(', ')}`);
    }

    // Step 5: Query live data
    if (verbose) console.log('\n🌐 Step 5: Querying live Salesforce data...');

    const recordIds = sample.map(r => r.Id);
    const liveRecords = await queryLiveRecords(recordIds, fields, objectType, targetUsername);

    if (verbose) console.log(`   Retrieved: ${liveRecords.length} live records`);

    // Step 6: Compare data
    if (verbose) console.log('\n⚖️  Step 6: Comparing analysis vs live data...');

    let mismatches = 0;
    const comparisonDetails = [];

    for (const analysisRecord of sample) {
      const liveRecord = liveRecords.find(lr => lr.Id === analysisRecord.Id);

      if (!liveRecord) {
        mismatches++;
        result.addError(`Record ${analysisRecord.Id} not found in Salesforce (may have been deleted)`);
        continue;
      }

      const comparison = compareRecords(analysisRecord, liveRecord, fields);

      if (!comparison.matches) {
        mismatches++;
        comparisonDetails.push({
          recordId: analysisRecord.Id,
          differences: comparison.differences
        });

        if (verbose) {
          console.log(`   ❌ Mismatch: ${analysisRecord.Id}`);
          comparison.differences.forEach(diff => {
            console.log(`      ${diff.field}: "${diff.analysisValue}" → "${diff.liveValue}"`);
          });
        }
      }
    }

    const mismatchPercentage = (mismatches / sample.length) * 100;
    result.metadata.mismatchPercentage = mismatchPercentage;

    if (verbose) {
      console.log(`\n📊 Validation Results:`);
      console.log(`   Mismatches: ${mismatches}/${sample.length} (${mismatchPercentage.toFixed(2)}%)`);
      console.log(`   Threshold: ${mismatchThresholdPercent}%`);
    }

    // Step 7: Evaluate results
    if (mismatchPercentage > mismatchThresholdPercent) {
      result.addError(
        `Data mismatch ${mismatchPercentage.toFixed(2)}% exceeds threshold ${mismatchThresholdPercent}%. ` +
        `Analysis data is likely stale or incomplete. Re-run analysis before batch execution.`
      );
    } else {
      result.setPassed(true);
    }

    // Save detailed comparison report
    if (comparisonDetails.length > 0) {
      const reportPath = analysisFilePath.replace('.json', '-validation-report.json');
      fs.writeFileSync(reportPath, JSON.stringify({
        validation: result.toJSON(),
        comparisonDetails
      }, null, 2));

      if (verbose) {
        console.log(`\n📄 Detailed report saved: ${reportPath}`);
      }
    }

  } catch (error) {
    result.addError(`Validation failed: ${error.message}`);
  }

  if (verbose) {
    console.log(result.toString());
  }

  return result;
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  const analysisFilePath = process.argv[2];
  const targetUsername = process.argv[3];

  if (!analysisFilePath || !targetUsername) {
    console.log('Usage: node validate-analysis-freshness.js <analysis-file> <target-org>');
    console.log('');
    console.log('Example:');
    console.log('  node validate-analysis-freshness.js ./merge-analysis.json myOrg');
    process.exit(1);
  }

  try {
    const result = await validateAnalysisFreshness({
      analysisFilePath,
      targetUsername,
      verbose: true
    });

    if (!result.passed) {
      console.error('\n❌ Validation failed - aborting batch execution');
      console.error('\nRemediation steps:');
      console.error('1. Re-run analysis query to get fresh data');
      console.error('2. Verify no concurrent modifications to Salesforce records');
      console.error('3. Re-run this validation');
      process.exit(1);
    }

    console.log('\n✅ Validation passed - safe to proceed with batch execution');
    process.exit(0);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  validateAnalysisFreshness,
  checkStaleness,
  selectRandomSample,
  compareRecords,
  ValidationResult
};
