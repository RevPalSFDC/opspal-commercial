#!/usr/bin/env node

/**
 * Field Conflict Scanner
 * Scans for field-level conflicts between local metadata and org state
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class FieldConflictScanner {
  constructor(options = {}) {
    this.org = options.org || process.env.SALESFORCE_ORG_ALIAS || 'production';
    this.outputFormat = options.outputFormat || 'json';
  }

  /**
   * Scan for field conflicts
   * @param {Object} options - Scan options
   * @returns {Object} Scan results
   */
  async scan(options) {
    const { existing, planned, output } = options;
    const conflicts = [];
    const warnings = [];
    const compatible = [];

    try {
      // Load existing fields
      const existingFields = this.loadFields(existing);

      // Load planned fields
      const plannedFields = this.loadPlannedFields(planned);

      // Compare each planned field with existing
      for (const plannedField of plannedFields) {
        const existingField = existingFields.find(f =>
          f.name === plannedField.name || f.fullName === plannedField.fullName
        );

        if (existingField) {
          const comparison = this.compareFields(existingField, plannedField);

          if (comparison.hasConflict) {
            conflicts.push(comparison);
          } else if (comparison.hasWarning) {
            warnings.push(comparison);
          } else {
            compatible.push(comparison);
          }
        } else {
          // New field - no conflict
          compatible.push({
            field: plannedField.name || plannedField.fullName,
            status: 'NEW',
            canDeploy: true
          });
        }
      }

      const results = {
        success: true,
        scanDate: new Date().toISOString(),
        org: this.org,
        summary: {
          total: plannedFields.length,
          conflicts: conflicts.length,
          warnings: warnings.length,
          compatible: compatible.length
        },
        conflicts,
        warnings,
        compatible,
        canDeploy: conflicts.length === 0
      };

      // Write output if specified
      if (output) {
        fs.writeFileSync(output, JSON.stringify(results, null, 2));
        console.log(`Results written to ${output}`);
      }

      return results;

    } catch (error) {
      return {
        success: false,
        error: error.message,
        conflicts: [],
        warnings: [],
        canDeploy: false
      };
    }
  }

  /**
   * Load existing fields from JSON or query result
   */
  loadFields(source) {
    if (typeof source === 'string' && source.endsWith('.json')) {
      const data = JSON.parse(fs.readFileSync(source, 'utf8'));
      return data.fields || data.result?.fields || data;
    }
    return source || [];
  }

  /**
   * Load planned fields from directory or file
   */
  loadPlannedFields(source) {
    const fields = [];

    if (fs.existsSync(source)) {
      if (fs.statSync(source).isDirectory()) {
        // Load all field files from directory
        const files = fs.readdirSync(source)
          .filter(f => f.endsWith('.field-meta.xml'));

        files.forEach(file => {
          const content = fs.readFileSync(path.join(source, file), 'utf8');
          const field = this.parseFieldXml(content);
          field.fileName = file;
          fields.push(field);
        });
      } else {
        // Load from JSON file
        const data = JSON.parse(fs.readFileSync(source, 'utf8'));
        return Array.isArray(data) ? data : [data];
      }
    }

    return fields;
  }

  /**
   * Parse field metadata XML
   */
  parseFieldXml(xml) {
    const field = {
      fullName: this.extractXmlValue(xml, 'fullName'),
      label: this.extractXmlValue(xml, 'label'),
      type: this.extractXmlValue(xml, 'type'),
      required: this.extractXmlValue(xml, 'required') === 'true',
      unique: this.extractXmlValue(xml, 'unique') === 'true',
      length: parseInt(this.extractXmlValue(xml, 'length') || '0'),
      precision: parseInt(this.extractXmlValue(xml, 'precision') || '0'),
      scale: parseInt(this.extractXmlValue(xml, 'scale') || '0')
    };

    // Extract field name from fullName
    field.name = field.fullName || field.label?.replace(/\s+/g, '_');

    return field;
  }

  /**
   * Extract value from XML
   */
  extractXmlValue(xml, tag) {
    const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 's');
    const match = xml.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Compare two field definitions
   */
  compareFields(existing, planned) {
    const comparison = {
      field: existing.name || existing.fullName,
      hasConflict: false,
      hasWarning: false,
      issues: [],
      existing: {},
      planned: {}
    };

    // Check type compatibility
    if (existing.type !== planned.type) {
      const compatible = this.areTypesCompatible(existing.type, planned.type);
      if (!compatible) {
        comparison.hasConflict = true;
        comparison.issues.push({
          type: 'TYPE_MISMATCH',
          severity: 'HIGH',
          message: `Cannot convert ${existing.type} to ${planned.type}`,
          existing: existing.type,
          planned: planned.type
        });
      } else {
        comparison.hasWarning = true;
        comparison.issues.push({
          type: 'TYPE_CONVERSION',
          severity: 'MEDIUM',
          message: `Type conversion from ${existing.type} to ${planned.type} may affect data`,
          existing: existing.type,
          planned: planned.type
        });
      }
    }

    // Check length changes
    if (planned.length && existing.length && planned.length < existing.length) {
      comparison.hasConflict = true;
      comparison.issues.push({
        type: 'LENGTH_REDUCTION',
        severity: 'HIGH',
        message: `Field length reduction from ${existing.length} to ${planned.length} may cause data loss`,
        existing: existing.length,
        planned: planned.length
      });
    }

    // Check required field changes
    if (!existing.required && planned.required) {
      comparison.hasWarning = true;
      comparison.issues.push({
        type: 'REQUIRED_FIELD',
        severity: 'MEDIUM',
        message: 'Making field required may affect existing records',
        existing: false,
        planned: true
      });
    }

    // Check unique constraint
    if (!existing.unique && planned.unique) {
      comparison.hasWarning = true;
      comparison.issues.push({
        type: 'UNIQUE_CONSTRAINT',
        severity: 'MEDIUM',
        message: 'Adding unique constraint may fail if duplicates exist',
        existing: false,
        planned: true
      });
    }

    comparison.canDeploy = !comparison.hasConflict;
    comparison.existing = existing;
    comparison.planned = planned;

    return comparison;
  }

  /**
   * Check if field types are compatible for conversion
   */
  areTypesCompatible(fromType, toType) {
    const compatibleConversions = {
      'Checkbox': ['Text'],
      'Currency': ['Number', 'Text'],
      'Date': ['DateTime', 'Text'],
      'DateTime': ['Date', 'Text'],
      'Email': ['Text'],
      'Number': ['Currency', 'Text'],
      'Percent': ['Number', 'Text'],
      'Phone': ['Text'],
      'Picklist': ['Text'],
      'MultiselectPicklist': ['Text'],
      'Text': ['LongTextArea', 'Html', 'EncryptedText'],
      'TextArea': ['LongTextArea', 'Html'],
      'Url': ['Text']
    };

    const conversions = compatibleConversions[fromType] || [];
    return conversions.includes(toType);
  }

  /**
   * Generate conflict report
   */
  generateReport(results) {
    const report = [];

    report.push('Field Conflict Scan Report');
    report.push('=' .repeat(50));
    report.push(`Scan Date: ${results.scanDate}`);
    report.push(`Organization: ${results.org}`);
    report.push('');
    report.push('Summary:');
    report.push(`  Total Fields: ${results.summary.total}`);
    report.push(`  Conflicts: ${results.summary.conflicts}`);
    report.push(`  Warnings: ${results.summary.warnings}`);
    report.push(`  Compatible: ${results.summary.compatible}`);
    report.push('');

    if (results.conflicts.length > 0) {
      report.push('CONFLICTS (Must Resolve):');
      report.push('-' .repeat(30));
      results.conflicts.forEach(conflict => {
        report.push(`  ${conflict.field}:`);
        conflict.issues.forEach(issue => {
          report.push(`    - ${issue.message}`);
        });
      });
      report.push('');
    }

    if (results.warnings.length > 0) {
      report.push('WARNINGS (Review Recommended):');
      report.push('-' .repeat(30));
      results.warnings.forEach(warning => {
        report.push(`  ${warning.field}:`);
        warning.issues.forEach(issue => {
          report.push(`    - ${issue.message}`);
        });
      });
      report.push('');
    }

    report.push(`Deployment Status: ${results.canDeploy ? '✅ Can Deploy' : '❌ Blocked'}`);

    return report.join('\n');
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: field-conflict-scanner.js --existing <file> --planned <dir|file> [--output <file>]');
    process.exit(1);
  }

  const options = {
    existing: args[args.indexOf('--existing') + 1],
    planned: args[args.indexOf('--planned') + 1],
    output: args.includes('--output') ? args[args.indexOf('--output') + 1] : null
  };

  const scanner = new FieldConflictScanner();
  scanner.scan(options).then(results => {
    if (options.output) {
      console.log(`Scan complete. Results saved to ${options.output}`);
    } else {
      console.log(JSON.stringify(results, null, 2));
    }

    if (args.includes('--report')) {
      console.log('\n' + scanner.generateReport(results));
    }

    process.exit(results.canDeploy ? 0 : 1);
  });
}

module.exports = FieldConflictScanner;