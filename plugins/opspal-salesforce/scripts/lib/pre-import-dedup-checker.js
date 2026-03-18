#!/usr/bin/env node

/**
 * Pre-Import Duplicate Detection Checker
 *
 * Mandatory duplicate detection before Salesforce data imports.
 * Part of Cohort 2 (tool-contract) remediation.
 *
 * Related Files:
 * - Agent: .claude-plugins/opspal-salesforce/agents/sfdc-data-import-manager.md (to be modified)
 * - Enforcer: .claude/scripts/lib/tool-contract-enforcer.js
 * - Data Ops: .claude-plugins/opspal-salesforce/scripts/lib/data-operations.js
 *
 * Usage:
 *   const checker = new PreImportDedupChecker(orgAlias);
 *   const result = await checker.checkForDuplicates(records, matchRules);
 *
 * Exit Codes:
 *   0 - No duplicates found
 *   1 - Duplicates found
 *   2 - Errors during check
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Valid org alias pattern - alphanumeric, underscores, and hyphens only
const VALID_ORG_ALIAS = /^[a-zA-Z0-9_-]+$/;

class PreImportDedupChecker {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = {
      fuzzyThreshold: options.fuzzyThreshold || 0.85,
      maxRecordsToCheck: options.maxRecordsToCheck || 10000,
      matchFields: options.matchFields || ['Email', 'Name'],
      objectType: options.objectType || 'Lead',
      enableFuzzyMatching: options.enableFuzzyMatching !== false,
    };

    this.duplicates = [];
    this.newRecords = [];
    this.errors = [];
  }

  /**
   * Check for duplicates in records before import
   * @param {Array} records - Records to import
   * @param {Object} matchRules - Custom matching rules
   * @returns {Object} - Duplicate check results
   */
  async checkForDuplicates(records, matchRules = {}) {
    if (!records || records.length === 0) {
      return {
        duplicates: [],
        newRecords: [],
        summary: {
          total: 0,
          duplicates: 0,
          new: 0,
        },
      };
    }

    // Merge custom rules with defaults
    const rules = {
      ...this.options,
      ...matchRules,
    };

    // Build match criteria
    const matchFields = rules.matchFields || this.options.matchFields;

    // Query for existing records
    const existingRecords = await this.queryExistingRecords(
      records,
      matchFields,
      rules.objectType || this.options.objectType
    );

    // Perform matching
    for (const record of records) {
      const duplicateMatch = this.findDuplicate(record, existingRecords, matchFields, rules);

      if (duplicateMatch) {
        this.duplicates.push({
          newRecord: record,
          existingRecord: duplicateMatch.record,
          confidence: duplicateMatch.confidence,
          matchedFields: duplicateMatch.matchedFields,
          recommendation: this.getRecommendation(duplicateMatch.confidence),
        });
      } else {
        this.newRecords.push(record);
      }
    }

    return {
      duplicates: this.duplicates,
      newRecords: this.newRecords,
      summary: {
        total: records.length,
        duplicates: this.duplicates.length,
        new: this.newRecords.length,
        duplicateRate: (this.duplicates.length / records.length * 100).toFixed(2) + '%',
      },
      errors: this.errors,
    };
  }

  /**
   * Query existing records from Salesforce
   */
  async queryExistingRecords(records, matchFields, objectType) {
    try {
      // Validate org alias to prevent injection
      if (!VALID_ORG_ALIAS.test(this.orgAlias)) {
        this.errors.push({
          type: 'validation_error',
          message: `Invalid org alias format: ${this.orgAlias}. Must be alphanumeric with underscores/hyphens only.`,
        });
        return [];
      }

      // Build WHERE clause with values from records
      const whereConditions = this.buildWhereConditions(records, matchFields);

      if (whereConditions.length === 0) {
        return [];
      }

      // Build SOQL query
      const fieldsToSelect = ['Id', ...matchFields, 'CreatedDate', 'LastModifiedDate'];
      const query = `SELECT ${fieldsToSelect.join(', ')} FROM ${objectType} WHERE ${whereConditions} LIMIT ${this.options.maxRecordsToCheck}`;

      // Execute query using spawnSync with args array to prevent shell injection
      const result = spawnSync('sf', [
        'data', 'query',
        '--query', query,
        '--target-org', this.orgAlias,
        '--json'
      ], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000  // 2 minute timeout
      });

      if (result.error) {
        this.errors.push({
          type: 'query_exception',
          message: result.error.message,
        });
        return [];
      }

      const parsed = JSON.parse(result.stdout);

      if (parsed.status !== 0) {
        this.errors.push({
          type: 'query_error',
          message: parsed.message || 'Failed to query existing records',
        });
        return [];
      }

      return parsed.result.records || [];
    } catch (error) {
      this.errors.push({
        type: 'query_exception',
        message: error.message,
      });
      return [];
    }
  }

  /**
   * Build WHERE conditions for query
   */
  buildWhereConditions(records, matchFields) {
    const conditions = [];
    const valuesByField = {};

    // Collect unique values for each match field
    for (const field of matchFields) {
      valuesByField[field] = new Set();
    }

    for (const record of records) {
      for (const field of matchFields) {
        if (record[field]) {
          valuesByField[field].add(this.escapeSOQLString(record[field]));
        }
      }
    }

    // Build IN clauses
    for (const [field, values] of Object.entries(valuesByField)) {
      if (values.size > 0) {
        const valuesList = Array.from(values).map(v => `'${v}'`).join(', ');
        conditions.push(`${field} IN (${valuesList})`);
      }
    }

    return conditions.join(' OR ');
  }

  /**
   * Escape SOQL string
   * IMPORTANT: Backslashes must be escaped FIRST, then single quotes.
   * This prevents double-escaping issues.
   */
  escapeSOQLString(value) {
    if (typeof value !== 'string') {
      return String(value);
    }
    // Escape backslashes first, then single quotes (correct order)
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  /**
   * Find duplicate match for a record
   */
  findDuplicate(newRecord, existingRecords, matchFields, rules) {
    let bestMatch = null;
    let highestConfidence = 0;

    for (const existingRecord of existingRecords) {
      const matchResult = this.calculateMatch(newRecord, existingRecord, matchFields, rules);

      if (matchResult.confidence > highestConfidence) {
        highestConfidence = matchResult.confidence;
        bestMatch = {
          record: existingRecord,
          confidence: matchResult.confidence,
          matchedFields: matchResult.matchedFields,
        };
      }
    }

    // Return match if confidence exceeds threshold
    if (highestConfidence >= (rules.fuzzyThreshold || this.options.fuzzyThreshold)) {
      return bestMatch;
    }

    return null;
  }

  /**
   * Calculate match confidence between two records
   */
  calculateMatch(newRecord, existingRecord, matchFields, rules) {
    const matchedFields = [];
    let totalScore = 0;
    let maxScore = 0;

    for (const field of matchFields) {
      const newValue = newRecord[field];
      const existingValue = existingRecord[field];

      maxScore += 1;

      if (!newValue || !existingValue) {
        continue;
      }

      // Exact match
      if (newValue === existingValue) {
        totalScore += 1;
        matchedFields.push({
          field,
          match: 'exact',
          newValue,
          existingValue,
        });
      }
      // Fuzzy match (if enabled)
      else if (rules.enableFuzzyMatching && typeof newValue === 'string' && typeof existingValue === 'string') {
        const similarity = this.calculateStringSimilarity(
          newValue.toLowerCase(),
          existingValue.toLowerCase()
        );

        if (similarity >= (rules.fuzzyThreshold || this.options.fuzzyThreshold)) {
          totalScore += similarity;
          matchedFields.push({
            field,
            match: 'fuzzy',
            similarity,
            newValue,
            existingValue,
          });
        }
      }
    }

    const confidence = maxScore > 0 ? totalScore / maxScore : 0;

    return {
      confidence,
      matchedFields,
    };
  }

  /**
   * Calculate string similarity (Levenshtein distance normalized)
   */
  calculateStringSimilarity(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    // Levenshtein distance matrix
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // Deletion
          matrix[i][j - 1] + 1,      // Insertion
          matrix[i - 1][j - 1] + cost // Substitution
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLength = Math.max(len1, len2);

    return 1 - (distance / maxLength);
  }

  /**
   * Get recommendation based on confidence
   */
  getRecommendation(confidence) {
    if (confidence >= 0.95) {
      return {
        action: 'skip',
        reason: 'Exact or near-exact match - record already exists',
      };
    } else if (confidence >= 0.85) {
      return {
        action: 'merge',
        reason: 'Strong match - consider updating existing record instead',
      };
    } else if (confidence >= 0.70) {
      return {
        action: 'review',
        reason: 'Potential match - manual review recommended',
      };
    } else {
      return {
        action: 'proceed',
        reason: 'Low match confidence - likely a new record',
      };
    }
  }

  /**
   * Generate duplicate report
   */
  generateReport() {
    const report = {
      summary: {
        total: this.duplicates.length + this.newRecords.length,
        duplicates: this.duplicates.length,
        new: this.newRecords.length,
        duplicateRate: this.duplicates.length > 0
          ? ((this.duplicates.length / (this.duplicates.length + this.newRecords.length)) * 100).toFixed(2) + '%'
          : '0%',
      },
      duplicatesByConfidence: {
        exact: this.duplicates.filter(d => d.confidence >= 0.95).length,
        strong: this.duplicates.filter(d => d.confidence >= 0.85 && d.confidence < 0.95).length,
        moderate: this.duplicates.filter(d => d.confidence >= 0.70 && d.confidence < 0.85).length,
        weak: this.duplicates.filter(d => d.confidence < 0.70).length,
      },
      recommendations: {
        skip: this.duplicates.filter(d => d.recommendation.action === 'skip').length,
        merge: this.duplicates.filter(d => d.recommendation.action === 'merge').length,
        review: this.duplicates.filter(d => d.recommendation.action === 'review').length,
        proceed: this.duplicates.filter(d => d.recommendation.action === 'proceed').length,
      },
      errors: this.errors,
    };

    return report;
  }

  /**
   * Print duplicate report
   */
  printReport() {
    const report = this.generateReport();

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║          Pre-Import Duplicate Detection Report              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log(`Total Records: ${report.summary.total}`);
    console.log(`Duplicates Found: ${report.summary.duplicates} (${report.summary.duplicateRate})`);
    console.log(`New Records: ${report.summary.new}\n`);

    if (report.summary.duplicates > 0) {
      console.log('Duplicates by Confidence:');
      console.log(`  Exact (≥95%): ${report.duplicatesByConfidence.exact}`);
      console.log(`  Strong (85-95%): ${report.duplicatesByConfidence.strong}`);
      console.log(`  Moderate (70-85%): ${report.duplicatesByConfidence.moderate}`);
      console.log(`  Weak (<70%): ${report.duplicatesByConfidence.weak}\n`);

      console.log('Recommended Actions:');
      console.log(`  Skip (exact duplicates): ${report.recommendations.skip}`);
      console.log(`  Merge (update existing): ${report.recommendations.merge}`);
      console.log(`  Review (manual check): ${report.recommendations.review}`);
      console.log(`  Proceed (likely new): ${report.recommendations.proceed}\n`);

      console.log('⚠️  WARNING: Import contains duplicates.');
      console.log('   Review duplicate list and take appropriate action.\n');
    } else {
      console.log('✅ No duplicates detected. Safe to proceed with import.\n');
    }

    if (report.errors.length > 0) {
      console.log('❌ ERRORS:');
      for (const error of report.errors) {
        console.log(`  • [${error.type}] ${error.message}`);
      }
      console.log('');
    }
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Usage: node pre-import-dedup-checker.js <org-alias> <object-type> <records-file>');
    console.log('');
    console.log('Options:');
    console.log('  --match-fields <field1,field2>  Fields to match on (default: Email,Name)');
    console.log('  --fuzzy-threshold <0-1>         Fuzzy match threshold (default: 0.85)');
    console.log('  --no-fuzzy                      Disable fuzzy matching');
    console.log('  --json                          Output JSON format');
    process.exit(1);
  }

  const orgAlias = args[0];
  const objectType = args[1];
  const recordsFile = args[2];

  // Parse options
  const options = {
    objectType,
  };

  const matchFieldsIndex = args.indexOf('--match-fields');
  if (matchFieldsIndex !== -1 && args[matchFieldsIndex + 1]) {
    options.matchFields = args[matchFieldsIndex + 1].split(',');
  }

  const fuzzyThresholdIndex = args.indexOf('--fuzzy-threshold');
  if (fuzzyThresholdIndex !== -1 && args[fuzzyThresholdIndex + 1]) {
    options.fuzzyThreshold = parseFloat(args[fuzzyThresholdIndex + 1]);
  }

  if (args.includes('--no-fuzzy')) {
    options.enableFuzzyMatching = false;
  }

  const jsonOutput = args.includes('--json');

  // Load records
  let records;
  try {
    const recordsContent = fs.readFileSync(recordsFile, 'utf8');
    records = JSON.parse(recordsContent);
  } catch (error) {
    console.error(`Error loading records file: ${error.message}`);
    process.exit(2);
  }

  // Run duplicate check
  const checker = new PreImportDedupChecker(orgAlias, options);

  (async () => {
    try {
      const result = await checker.checkForDuplicates(records);

      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        checker.printReport();
      }

      // Exit code based on duplicates found
      process.exit(result.duplicates.length > 0 ? 1 : 0);
    } catch (error) {
      console.error('Error during duplicate check:', error.message);
      process.exit(2);
    }
  })();
}

module.exports = PreImportDedupChecker;
