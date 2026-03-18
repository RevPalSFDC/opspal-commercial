#!/usr/bin/env node

/**
 * Salesforce Report Metadata Validator
 *
 * Pre-deployment validation to catch schema errors before attempting deployment.
 * Prevents common issues like:
 * - Incorrect field name syntax (ACTIVITY.SUBJECT vs SUBJECT)
 * - Missing folder metadata
 * - Invalid filter language
 * - Duplicate fields in columns and groupings
 * - Invalid chart properties
 *
 * Usage:
 *   node sfdc-report-validator.js <report-file-path> [--fix]
 *
 * @see docs/SALESFORCE_REPORT_DEPLOYMENT_TROUBLESHOOTING.md
 */

const fs = require('fs');
const path = require('path');
const { parseString } = require('xml2js');
const { promisify } = require('util');
const parseXml = promisify(parseString);

const {
  isValidField,
  isGroupableField,
  suggestCorrection,
  getReportTypeSchema
} = require('./sfdc-report-field-reference');

class ReportValidator {
  constructor(reportFilePath, options = {}) {
    this.reportFilePath = reportFilePath;
    this.options = options;
    this.errors = [];
    this.warnings = [];
    this.suggestions = [];
    this.reportData = null;
  }

  /**
   * Main validation entry point
   */
  async validate() {
    try {
      // Step 1: Check file exists
      if (!fs.existsSync(this.reportFilePath)) {
        this.errors.push({
          type: 'file',
          message: `Report file not found: ${this.reportFilePath}`
        });
        return this.getResults();
      }

      // Step 2: Parse XML
      const xmlContent = fs.readFileSync(this.reportFilePath, 'utf-8');
      this.reportData = await parseXml(xmlContent);

      if (!this.reportData || !this.reportData.Report) {
        this.errors.push({
          type: 'parse',
          message: 'Invalid report XML structure'
        });
        return this.getResults();
      }

      const report = this.reportData.Report;

      // Step 3: Validate required fields
      this.validateRequiredFields(report);

      // Step 4: Validate folder metadata exists
      this.validateFolderMetadata(report);

      // Step 5: Validate project config exists
      this.validateProjectConfig();

      // Step 6: Validate field names
      this.validateFieldNames(report);

      // Step 7: Validate columns vs groupings
      this.validateColumnsAndGroupings(report);

      // Step 8: Validate filter configuration
      this.validateFilters(report);

      // Step 9: Validate chart configuration
      this.validateChart(report);

      return this.getResults();

    } catch (error) {
      this.errors.push({
        type: 'fatal',
        message: `Validation failed: ${error.message}`,
        stack: error.stack
      });
      return this.getResults();
    }
  }

  /**
   * Validate required report fields
   */
  validateRequiredFields(report) {
    const required = ['name', 'reportType', 'format'];

    for (const field of required) {
      if (!report[field] || !report[field][0]) {
        this.errors.push({
          type: 'schema',
          message: `Missing required field: ${field}`
        });
      }
    }
  }

  /**
   * Validate folder metadata exists
   */
  validateFolderMetadata(report) {
    if (!report.folderName || !report.folderName[0]) {
      this.warnings.push({
        type: 'folder',
        message: 'No folderName specified - report will go to unfiled$public'
      });
      return;
    }

    const folderName = report.folderName[0];
    const reportDir = path.dirname(this.reportFilePath);
    const folderMetaPath = path.join(reportDir, '..', `${folderName}-meta.xml`);

    if (!fs.existsSync(folderMetaPath)) {
      this.errors.push({
        type: 'folder',
        message: `Folder metadata not found: ${folderMetaPath}`,
        suggestion: `Create ${folderName}-meta.xml with ReportFolder schema`
      });
    }
  }

  /**
   * Validate project config exists
   */
  validateProjectConfig() {
    let currentDir = path.dirname(this.reportFilePath);
    let found = false;

    // Search up to 5 levels
    for (let i = 0; i < 5; i++) {
      const projectConfigPath = path.join(currentDir, 'sfdx-project.json');
      if (fs.existsSync(projectConfigPath)) {
        found = true;
        break;
      }
      currentDir = path.dirname(currentDir);
    }

    if (!found) {
      this.errors.push({
        type: 'config',
        message: 'Project config not found in project hierarchy',
        suggestion: 'Create Salesforce project config (sfdx-project.json) with packageDirectories configuration'
      });
    }
  }

  /**
   * Validate field names against report type schema
   */
  validateFieldNames(report) {
    if (!report.reportType || !report.reportType[0]) {
      return; // Already caught in required fields
    }

    const reportType = report.reportType[0];
    const schema = getReportTypeSchema(reportType);

    if (!schema) {
      this.warnings.push({
        type: 'schema',
        message: `Unknown report type: ${reportType} - cannot validate fields`
      });
      return;
    }

    // Validate column fields
    if (report.columns && Array.isArray(report.columns)) {
      for (const col of report.columns) {
        if (col.field && col.field[0]) {
          const fieldName = col.field[0];
          const validation = isValidField(reportType, fieldName);

          if (!validation.valid) {
            const suggestion = suggestCorrection(reportType, fieldName);

            this.errors.push({
              type: 'field',
              message: `Invalid column field: ${validation.error}`,
              field: fieldName,
              suggestion: suggestion ? `Use: ${suggestion.corrected}` : null
            });
          }
        }
      }
    }

    // Validate grouping fields
    if (report.groupingsDown && Array.isArray(report.groupingsDown)) {
      for (const group of report.groupingsDown) {
        if (group.field && group.field[0]) {
          const fieldName = group.field[0];
          const validation = isGroupableField(reportType, fieldName);

          if (!validation.valid) {
            this.errors.push({
              type: 'field',
              message: `Invalid grouping field: ${validation.error}`,
              field: fieldName
            });
          }
        }
      }
    }

    // Validate filter fields
    if (report.filter && report.filter[0] && report.filter[0].criteriaItems) {
      const items = report.filter[0].criteriaItems;
      for (const item of items) {
        if (item.column && item.column[0]) {
          const fieldName = item.column[0];
          const validation = isValidField(reportType, fieldName);

          if (!validation.valid) {
            this.errors.push({
              type: 'field',
              message: `Invalid filter field: ${validation.error}`,
              field: fieldName
            });
          }
        }
      }
    }

    // Validate sort column
    if (report.sortColumn && report.sortColumn[0]) {
      const fieldName = report.sortColumn[0];
      const validation = isValidField(reportType, fieldName);

      if (!validation.valid) {
        this.errors.push({
          type: 'field',
          message: `Invalid sort column: ${validation.error}`,
          field: fieldName
        });
      }
    }

    // Validate chart grouping column
    if (report.chart && report.chart[0] && report.chart[0].groupingColumn && report.chart[0].groupingColumn[0]) {
      const fieldName = report.chart[0].groupingColumn[0];
      const validation = isValidField(reportType, fieldName);

      if (!validation.valid) {
        this.errors.push({
          type: 'field',
          message: `Invalid chart grouping column: ${validation.error}`,
          field: fieldName
        });
      }
    }

    // Validate timeFrameFilter dateColumn
    if (report.timeFrameFilter && report.timeFrameFilter[0] && report.timeFrameFilter[0].dateColumn && report.timeFrameFilter[0].dateColumn[0]) {
      const fieldName = report.timeFrameFilter[0].dateColumn[0];
      const validation = isValidField(reportType, fieldName);

      if (!validation.valid) {
        this.errors.push({
          type: 'field',
          message: `Invalid timeFrameFilter dateColumn: ${validation.error}`,
          field: fieldName
        });
      }
    }
  }

  /**
   * Validate no duplicate fields in columns and groupings
   */
  validateColumnsAndGroupings(report) {
    if (!report.groupingsDown || !report.columns) {
      return;
    }

    const format = report.format && report.format[0];
    if (format !== 'Summary') {
      return; // Only applies to Summary format
    }

    const groupedFields = [];
    for (const group of report.groupingsDown) {
      if (group.field && group.field[0]) {
        groupedFields.push(group.field[0]);
      }
    }

    for (const col of report.columns) {
      if (col.field && col.field[0]) {
        const fieldName = col.field[0];
        if (groupedFields.includes(fieldName)) {
          this.errors.push({
            type: 'grouping',
            message: `Field "${fieldName}" cannot be in both columns and groupingsDown for Summary format`,
            suggestion: `Remove "${fieldName}" from columns (keep in groupingsDown only)`
          });
        }
      }
    }
  }

  /**
   * Validate filter configuration
   */
  validateFilters(report) {
    if (!report.filter || !report.filter[0]) {
      return;
    }

    const filter = report.filter[0];

    // Validate language
    if (filter.language && filter.language[0]) {
      const lang = filter.language[0];
      if (lang === '1' || !lang.match(/^[a-z]{2}_[A-Z]{2}$/)) {
        this.errors.push({
          type: 'filter',
          message: `Invalid filter language: "${lang}"`,
          suggestion: 'Use locale format like "en_US", not numeric values'
        });
      }
    }
  }

  /**
   * Validate chart configuration
   */
  validateChart(report) {
    if (!report.chart || !report.chart[0]) {
      return;
    }

    const chart = report.chart[0];

    // For Activity reports, some chart properties may be invalid
    const reportType = report.reportType && report.reportType[0];
    if (reportType === 'Activity') {
      if (chart.legendPosition && chart.legendPosition[0] === 'Right') {
        this.warnings.push({
          type: 'chart',
          message: 'legendPosition "Right" may not be supported for Activity reports',
          suggestion: 'Consider removing legendPosition or using different value'
        });
      }
    }
  }

  /**
   * Get validation results
   */
  getResults() {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      suggestions: this.suggestions,
      summary: {
        errorCount: this.errors.length,
        warningCount: this.warnings.length,
        suggestionCount: this.suggestions.length
      }
    };
  }

  /**
   * Format results for console output
   */
  formatResults(results) {
    const lines = [];

    lines.push('═══════════════════════════════════════');
    lines.push('Salesforce Report Validation Results');
    lines.push('═══════════════════════════════════════\n');

    if (results.valid) {
      lines.push('✅ Report is valid!\n');
    } else {
      lines.push('❌ Report has errors that must be fixed\n');
    }

    if (results.errors.length > 0) {
      lines.push(`🔴 Errors (${results.errors.length}):`);
      results.errors.forEach((err, i) => {
        lines.push(`\n${i + 1}. [${err.type}] ${err.message}`);
        if (err.field) {
          lines.push(`   Field: ${err.field}`);
        }
        if (err.suggestion) {
          lines.push(`   💡 ${err.suggestion}`);
        }
      });
      lines.push('');
    }

    if (results.warnings.length > 0) {
      lines.push(`⚠️  Warnings (${results.warnings.length}):`);
      results.warnings.forEach((warn, i) => {
        lines.push(`\n${i + 1}. [${warn.type}] ${warn.message}`);
        if (warn.suggestion) {
          lines.push(`   💡 ${warn.suggestion}`);
        }
      });
      lines.push('');
    }

    if (results.valid && results.warnings.length === 0) {
      lines.push('✨ No warnings - ready for deployment!');
    }

    lines.push('\n═══════════════════════════════════════');

    return lines.join('\n');
  }
}

// Export for use as library
module.exports = ReportValidator;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node sfdc-report-validator.js <report-file-path>');
    console.log('\nExample:');
    console.log('  node sfdc-report-validator.js force-app/main/default/reports/MyFolder/MyReport.report-meta.xml');
    process.exit(0);
  }

  const reportPath = args[0];
  const validator = new ReportValidator(reportPath);

  validator.validate().then(results => {
    console.log(validator.formatResults(results));

    if (!results.valid) {
      process.exit(1);
    }
  }).catch(error => {
    console.error('Fatal error during validation:', error);
    process.exit(1);
  });
}
