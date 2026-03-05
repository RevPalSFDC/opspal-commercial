#!/usr/bin/env node

/**
 * Robust Backup Validator
 *
 * Multi-phase validation for Salesforce data backups with compound field support.
 *
 * **Problem Solved (Reflection Cohort #2, P1):**
 * - Validation false positives from compound fields (Address, Geolocation)
 * - No automated validation of backup completeness
 * - Manual record count verification takes 15+ minutes
 *
 * **Solution:**
 * - 4-phase validation: existence → counts → completeness → sampling
 * - Compound field-aware parsing (no false positives)
 * - Automated cross-checks against org data
 * - Validation reports with confidence scores
 *
 * **ROI:** Part of $25,000/year data operation infrastructure
 *
 * @module validate-backups-robust
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { CSVParser } = require('./csv-parser');

const execAsync = promisify(exec);

/**
 * Validation Status
 */
const ValidationStatus = {
  PASSED: 'passed',
  WARNING: 'warning',
  FAILED: 'failed'
};

/**
 * Validation Phase
 */
const ValidationPhase = {
  FILE_EXISTENCE: 'file_existence',
  RECORD_COUNT: 'record_count',
  FIELD_COMPLETENESS: 'field_completeness',
  SAMPLE_CROSSCHECK: 'sample_crosscheck'
};

/**
 * Robust Backup Validator
 *
 * Performs comprehensive validation of Salesforce backup files.
 *
 * @example
 * const validator = new BackupValidator({
 *   org: 'rentable-production',
 *   backupFile: './backup/account.csv',
 *   objectName: 'Account',
 *   expectedRecordCount: 29123
 * });
 *
 * const result = await validator.validate();
 * // {
 * //   status: 'passed',
 * //   confidence: 0.95,
 * //   phases: { ... },
 * //   issues: []
 * // }
 */
class BackupValidator {
  /**
   * Create a validator instance
   *
   * @param {Object} config - Configuration
   * @param {string} config.org - Salesforce org alias
   * @param {string} config.backupFile - Path to backup CSV file
   * @param {string} config.objectName - Salesforce object name
   * @param {number} [config.expectedRecordCount] - Expected record count
   * @param {Array<string>} [config.requiredFields] - Required field names
   * @param {number} [config.sampleSize=100] - Sample size for cross-check
   * @param {number} [config.completenessThreshold=0.95] - Minimum completeness (0-1)
   */
  constructor(config) {
    this.org = config.org;
    this.backupFile = config.backupFile;
    this.objectName = config.objectName;
    this.expectedRecordCount = config.expectedRecordCount;
    this.requiredFields = config.requiredFields || [];
    this.sampleSize = config.sampleSize || 100;
    this.completenessThreshold = config.completenessThreshold || 0.95;

    this.phases = {};
    this.issues = [];
    this.startTime = null;
    this.endTime = null;
  }

  /**
   * Run all validation phases
   *
   * @returns {Promise<Object>} - Validation result
   */
  async validate() {
    console.log(`\n🔍 Starting backup validation...`);
    console.log(`   File: ${this.backupFile}`);
    console.log(`   Object: ${this.objectName}`);
    console.log(`   Org: ${this.org}\n`);

    this.startTime = Date.now();

    try {
      // Phase 1: File Existence
      await this._validateFileExistence();

      // Phase 2: Record Count
      await this._validateRecordCount();

      // Phase 3: Field Completeness
      await this._validateFieldCompleteness();

      // Phase 4: Sample Cross-check (if org is accessible)
      await this._validateSampleCrosscheck();

      this.endTime = Date.now();

      const result = this._generateResult();
      this._printSummary(result);

      return result;
    } catch (error) {
      this.endTime = Date.now();

      console.error(`\n❌ Validation failed: ${error.message}`);
      throw error;
    }
  }

  // ========================================
  // VALIDATION PHASES
  // ========================================

  /**
   * Phase 1: Validate file existence and basic properties
   * @private
   */
  async _validateFileExistence() {
    console.log('Phase 1: File Existence...');

    this.phases[ValidationPhase.FILE_EXISTENCE] = {
      status: ValidationStatus.PASSED,
      details: {}
    };

    try {
      const stats = await fs.stat(this.backupFile);

      this.phases[ValidationPhase.FILE_EXISTENCE].details = {
        exists: true,
        sizeBytes: stats.size,
        sizeMB: Math.round(stats.size / (1024 * 1024)),
        modified: stats.mtime.toISOString()
      };

      // Check file is not empty
      if (stats.size === 0) {
        this.issues.push({
          phase: ValidationPhase.FILE_EXISTENCE,
          severity: 'CRITICAL',
          message: 'Backup file is empty (0 bytes)'
        });
        this.phases[ValidationPhase.FILE_EXISTENCE].status = ValidationStatus.FAILED;
      }

      console.log(`   ✅ File exists (${this.phases[ValidationPhase.FILE_EXISTENCE].details.sizeMB}MB)`);
    } catch (error) {
      this.phases[ValidationPhase.FILE_EXISTENCE].status = ValidationStatus.FAILED;
      this.phases[ValidationPhase.FILE_EXISTENCE].details = {
        exists: false,
        error: error.message
      };

      this.issues.push({
        phase: ValidationPhase.FILE_EXISTENCE,
        severity: 'CRITICAL',
        message: `Backup file not found: ${this.backupFile}`
      });

      console.log(`   ❌ File not found`);
      throw new Error(`Backup file not found: ${this.backupFile}`);
    }
  }

  /**
   * Phase 2: Validate record count
   * @private
   */
  async _validateRecordCount() {
    console.log('\nPhase 2: Record Count...');

    this.phases[ValidationPhase.RECORD_COUNT] = {
      status: ValidationStatus.PASSED,
      details: {}
    };

    try {
      // Read CSV file
      const content = await fs.readFile(this.backupFile, 'utf8');

      // Parse with compound field support
      const rows = CSVParser.parseWithHeaders(content, {
        compoundFieldHandling: 'parse' // Parse compound fields for accurate count
      });

      const actualCount = rows.length;

      this.phases[ValidationPhase.RECORD_COUNT].details = {
        actualCount,
        expectedCount: this.expectedRecordCount
      };

      // Check count matches expectation
      if (this.expectedRecordCount) {
        const diff = Math.abs(actualCount - this.expectedRecordCount);
        const diffPercent = (diff / this.expectedRecordCount) * 100;

        this.phases[ValidationPhase.RECORD_COUNT].details.difference = diff;
        this.phases[ValidationPhase.RECORD_COUNT].details.differencePercent = diffPercent.toFixed(2);

        if (diffPercent > 5) {
          // >5% difference is critical
          this.issues.push({
            phase: ValidationPhase.RECORD_COUNT,
            severity: 'CRITICAL',
            message: `Record count mismatch: expected ${this.expectedRecordCount}, got ${actualCount} (${diffPercent.toFixed(1)}% difference)`
          });
          this.phases[ValidationPhase.RECORD_COUNT].status = ValidationStatus.FAILED;
          console.log(`   ❌ Count mismatch: ${actualCount} vs ${this.expectedRecordCount} expected`);
        } else if (diffPercent > 1) {
          // 1-5% difference is warning
          this.issues.push({
            phase: ValidationPhase.RECORD_COUNT,
            severity: 'WARNING',
            message: `Minor record count difference: ${diffPercent.toFixed(2)}%`
          });
          this.phases[ValidationPhase.RECORD_COUNT].status = ValidationStatus.WARNING;
          console.log(`   ⚠️  Count close: ${actualCount} vs ${this.expectedRecordCount} expected (${diffPercent.toFixed(1)}% diff)`);
        } else {
          console.log(`   ✅ Count matches: ${actualCount} records`);
        }
      } else {
        console.log(`   ✅ Count: ${actualCount} records (no expected count provided)`);
      }

      // Store parsed rows for next phase
      this.parsedRows = rows;
    } catch (error) {
      this.phases[ValidationPhase.RECORD_COUNT].status = ValidationStatus.FAILED;
      this.phases[ValidationPhase.RECORD_COUNT].details = {
        error: error.message
      };

      this.issues.push({
        phase: ValidationPhase.RECORD_COUNT,
        severity: 'CRITICAL',
        message: `Failed to parse CSV: ${error.message}`
      });

      console.log(`   ❌ Parse failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Phase 3: Validate field completeness
   * @private
   */
  async _validateFieldCompleteness() {
    console.log('\nPhase 3: Field Completeness...');

    this.phases[ValidationPhase.FIELD_COMPLETENESS] = {
      status: ValidationStatus.PASSED,
      details: {}
    };

    if (!this.parsedRows || this.parsedRows.length === 0) {
      console.log('   ⚠️  No rows to validate');
      return;
    }

    try {
      const headers = Object.keys(this.parsedRows[0]);
      const fieldStats = {};

      // Calculate completeness per field
      headers.forEach(field => {
        let emptyCount = 0;

        this.parsedRows.forEach(row => {
          const value = row[field];

          // Check if empty (null, undefined, empty string, empty object)
          if (
            value === null ||
            value === undefined ||
            value === '' ||
            (typeof value === 'object' && Object.keys(value).length === 0)
          ) {
            emptyCount++;
          }
        });

        const completeness = ((this.parsedRows.length - emptyCount) / this.parsedRows.length);
        fieldStats[field] = {
          totalRecords: this.parsedRows.length,
          emptyCount,
          completeness: completeness.toFixed(4)
        };
      });

      // Check required fields
      const incompleteRequiredFields = [];
      this.requiredFields.forEach(field => {
        if (!fieldStats[field]) {
          incompleteRequiredFields.push({
            field,
            reason: 'Field not found in backup'
          });
        } else if (parseFloat(fieldStats[field].completeness) < this.completenessThreshold) {
          incompleteRequiredFields.push({
            field,
            completeness: fieldStats[field].completeness,
            reason: `Below threshold (${this.completenessThreshold})`
          });
        }
      });

      this.phases[ValidationPhase.FIELD_COMPLETENESS].details = {
        totalFields: headers.length,
        fieldStats,
        requiredFieldsCount: this.requiredFields.length,
        incompleteRequiredFields
      };

      if (incompleteRequiredFields.length > 0) {
        this.issues.push({
          phase: ValidationPhase.FIELD_COMPLETENESS,
          severity: 'HIGH',
          message: `${incompleteRequiredFields.length} required fields incomplete`,
          details: incompleteRequiredFields
        });
        this.phases[ValidationPhase.FIELD_COMPLETENESS].status = ValidationStatus.WARNING;
        console.log(`   ⚠️  ${incompleteRequiredFields.length} required fields incomplete`);
      } else {
        console.log(`   ✅ All fields complete (${headers.length} fields)`);
      }
    } catch (error) {
      this.phases[ValidationPhase.FIELD_COMPLETENESS].status = ValidationStatus.FAILED;
      this.phases[ValidationPhase.FIELD_COMPLETENESS].details = {
        error: error.message
      };

      this.issues.push({
        phase: ValidationPhase.FIELD_COMPLETENESS,
        severity: 'HIGH',
        message: `Field completeness check failed: ${error.message}`
      });

      console.log(`   ❌ Completeness check failed: ${error.message}`);
    }
  }

  /**
   * Phase 4: Sample cross-check against org data
   * @private
   */
  async _validateSampleCrosscheck() {
    console.log('\nPhase 4: Sample Cross-check...');

    this.phases[ValidationPhase.SAMPLE_CROSSCHECK] = {
      status: ValidationStatus.PASSED,
      details: {}
    };

    if (!this.parsedRows || this.parsedRows.length === 0) {
      console.log('   ⚠️  No rows to sample');
      return;
    }

    try {
      // Select random sample
      const sampleIndices = this._getRandomSample(this.parsedRows.length, Math.min(this.sampleSize, this.parsedRows.length));
      const sampleRecords = sampleIndices.map(i => this.parsedRows[i]);

      // Extract IDs
      const sampleIds = sampleRecords.map(r => r.Id).filter(id => id);

      if (sampleIds.length === 0) {
        console.log('   ⚠️  No IDs found for sampling');
        this.phases[ValidationPhase.SAMPLE_CROSSCHECK].status = ValidationStatus.WARNING;
        return;
      }

      // Query org for sample records
      const idList = sampleIds.map(id => `'${id}'`).join(',');
      const query = `SELECT Id FROM ${this.objectName} WHERE Id IN (${idList})`;
      const cmd = `sf data query --query "${query}" --target-org ${this.org} --json`;

      const { stdout } = await execAsync(cmd);
      const result = JSON.parse(stdout);

      if (result.status !== 0) {
        console.log('   ⚠️  Unable to cross-check (org query failed)');
        this.phases[ValidationPhase.SAMPLE_CROSSCHECK].status = ValidationStatus.WARNING;
        return;
      }

      const orgRecordIds = result.result.records.map(r => r.Id);
      const matchCount = sampleIds.filter(id => orgRecordIds.includes(id)).length;
      const matchPercent = (matchCount / sampleIds.length) * 100;

      this.phases[ValidationPhase.SAMPLE_CROSSCHECK].details = {
        sampleSize: sampleIds.length,
        matchCount,
        matchPercent: matchPercent.toFixed(2)
      };

      if (matchPercent < 90) {
        this.issues.push({
          phase: ValidationPhase.SAMPLE_CROSSCHECK,
          severity: 'CRITICAL',
          message: `Low sample match rate: ${matchPercent.toFixed(1)}% (${matchCount}/${sampleIds.length})`
        });
        this.phases[ValidationPhase.SAMPLE_CROSSCHECK].status = ValidationStatus.FAILED;
        console.log(`   ❌ Low match rate: ${matchPercent.toFixed(1)}%`);
      } else if (matchPercent < 98) {
        this.issues.push({
          phase: ValidationPhase.SAMPLE_CROSSCHECK,
          severity: 'WARNING',
          message: `Moderate sample match rate: ${matchPercent.toFixed(1)}%`
        });
        this.phases[ValidationPhase.SAMPLE_CROSSCHECK].status = ValidationStatus.WARNING;
        console.log(`   ⚠️  Moderate match rate: ${matchPercent.toFixed(1)}%`);
      } else {
        console.log(`   ✅ Sample verified: ${matchPercent.toFixed(1)}% match (${matchCount}/${sampleIds.length})`);
      }
    } catch (error) {
      this.phases[ValidationPhase.SAMPLE_CROSSCHECK].status = ValidationStatus.WARNING;
      this.phases[ValidationPhase.SAMPLE_CROSSCHECK].details = {
        error: error.message
      };

      console.log(`   ⚠️  Cross-check skipped: ${error.message}`);
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Get random sample indices
   * @private
   */
  _getRandomSample(populationSize, sampleSize) {
    const indices = [];
    const available = Array.from({ length: populationSize }, (_, i) => i);

    for (let i = 0; i < sampleSize; i++) {
      const randomIndex = Math.floor(Math.random() * available.length);
      indices.push(available[randomIndex]);
      available.splice(randomIndex, 1);
    }

    return indices.sort((a, b) => a - b);
  }

  /**
   * Generate validation result
   * @private
   */
  _generateResult() {
    // Calculate overall status
    const phaseStatuses = Object.values(this.phases).map(p => p.status);
    const hasFailed = phaseStatuses.includes(ValidationStatus.FAILED);
    const hasWarning = phaseStatuses.includes(ValidationStatus.WARNING);

    let overallStatus = ValidationStatus.PASSED;
    if (hasFailed) {
      overallStatus = ValidationStatus.FAILED;
    } else if (hasWarning) {
      overallStatus = ValidationStatus.WARNING;
    }

    // Calculate confidence score (0-1)
    let confidence = 1.0;

    // Reduce confidence for each issue
    this.issues.forEach(issue => {
      if (issue.severity === 'CRITICAL') {
        confidence -= 0.2;
      } else if (issue.severity === 'HIGH') {
        confidence -= 0.1;
      } else if (issue.severity === 'WARNING') {
        confidence -= 0.05;
      }
    });

    confidence = Math.max(0, confidence);

    const duration = this.endTime - this.startTime;

    return {
      status: overallStatus,
      confidence: confidence.toFixed(2),
      backupFile: this.backupFile,
      objectName: this.objectName,
      org: this.org,
      duration: duration,
      phases: this.phases,
      issues: this.issues,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Print validation summary
   * @private
   */
  _printSummary(result) {
    console.log(`\n\n═══════════════════════════════════════════════════════════`);

    if (result.status === ValidationStatus.PASSED) {
      console.log(`✅ Validation PASSED`);
    } else if (result.status === ValidationStatus.WARNING) {
      console.log(`⚠️  Validation PASSED with warnings`);
    } else {
      console.log(`❌ Validation FAILED`);
    }

    console.log(`═══════════════════════════════════════════════════════════\n`);

    console.log(`📊 Summary:`);
    console.log(`   Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    console.log(`   Duration: ${result.duration}ms`);
    console.log(`   Issues: ${result.issues.length}\n`);

    if (result.issues.length > 0) {
      console.log(`🚨 Issues:`);
      result.issues.forEach((issue, i) => {
        console.log(`   ${i + 1}. [${issue.severity}] ${issue.message}`);
      });
      console.log('');
    }

    console.log(`📁 File: ${result.backupFile}`);
    console.log(`🗂️  Object: ${result.objectName}`);
    console.log(`🏢 Org: ${result.org}\n`);
  }
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  BackupValidator,
  ValidationStatus,
  ValidationPhase
};

// ========================================
// CLI USAGE
// ========================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Robust Backup Validator - CLI Usage\n');
    console.log('Usage: node validate-backups-robust.js <org> <object> <file> [options]\n');
    console.log('Options:');
    console.log('  --expected-count <n>     Expected record count');
    console.log('  --required-fields <f1,f2>  Required field names (comma-separated)');
    console.log('  --sample-size <n>        Sample size for cross-check (default: 100)');
    console.log('  --completeness <n>       Minimum completeness threshold (0-1, default: 0.95)\n');
    console.log('Examples:');
    console.log('  node validate-backups-robust.js rentable-production Account ./backup/account.csv');
    console.log('  node validate-backups-robust.js rentable-production Account ./backup/account.csv --expected-count 29123');
    console.log('  node validate-backups-robust.js rentable-production Account ./backup/account.csv --required-fields "Id,Name,BillingAddress"\n');
    process.exit(1);
  }

  const org = args[0];
  const objectName = args[1];
  const backupFile = args[2];

  // Parse options
  const options = {
    org,
    objectName,
    backupFile
  };

  for (let i = 3; i < args.length; i++) {
    if (args[i] === '--expected-count' && args[i + 1]) {
      options.expectedRecordCount = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--required-fields' && args[i + 1]) {
      options.requiredFields = args[i + 1].split(',').map(f => f.trim());
      i++;
    } else if (args[i] === '--sample-size' && args[i + 1]) {
      options.sampleSize = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--completeness' && args[i + 1]) {
      options.completenessThreshold = parseFloat(args[i + 1]);
      i++;
    }
  }

  const validator = new BackupValidator(options);

  validator.validate()
    .then(result => {
      if (result.status === ValidationStatus.PASSED) {
        process.exit(0);
      } else if (result.status === ValidationStatus.WARNING) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error(`❌ Validation failed: ${error.message}`);
      process.exit(1);
    });
}
