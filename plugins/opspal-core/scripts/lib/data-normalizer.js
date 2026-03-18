#!/usr/bin/env node

/**
 * Cross-Platform Data Normalizer
 *
 * Normalizes data formats across Salesforce, HubSpot, and Marketo to prevent sync errors.
 * Part of Cohort 3 (data-quality) remediation.
 *
 * Related Files:
 * - Rules: .claude-plugins/opspal-core/config/data-normalization-rules.json
 * - Sync Agents: marketo-sfdc-sync-specialist, marketo-hubspot-bridge
 * - Data Quality: scripts/lib/data-quality-framework.js
 *
 * Usage:
 *   const normalizer = new DataNormalizer(rules);
 *   const normalized = normalizer.normalize(data, 'marketo', 'salesforce');
 *
 * Common Issues Addressed:
 * - Marketo '<$1 million' → Salesforce '< $1 million' (space after <)
 * - Marketo 'United States' → Salesforce 'USA'
 * - Case normalization for picklist values
 * - Date format differences
 */

const fs = require('fs');
const path = require('path');

class DataNormalizer {
  constructor(rulesPath, options = {}) {
    this.rulesPath = rulesPath;
    this.options = {
      strict: options.strict !== false,
      logTransformations: options.logTransformations !== false,
      throwOnError: options.throwOnError || false,
    };

    this.rules = null;
    this.transformations = [];
    this.errors = [];
  }

  /**
   * Load normalization rules
   */
  loadRules() {
    try {
      const rulesContent = fs.readFileSync(this.rulesPath, 'utf8');
      this.rules = JSON.parse(rulesContent);
      return true;
    } catch (error) {
      this.errors.push({
        type: 'rules_load',
        message: `Failed to load normalization rules: ${error.message}`,
        path: this.rulesPath,
      });
      return false;
    }
  }

  /**
   * Normalize data from source platform to target platform
   * @param {Object|Array} data - Data to normalize
   * @param {string} sourcePlatform - Source platform (salesforce, hubspot, marketo)
   * @param {string} targetPlatform - Target platform (salesforce, hubspot, marketo)
   * @returns {Object|Array} - Normalized data
   */
  normalize(data, sourcePlatform, targetPlatform) {
    if (!this.rules) {
      if (!this.loadRules()) {
        if (this.options.throwOnError) {
          throw new Error('Failed to load normalization rules');
        }
        return data; // Return unchanged if rules can't be loaded
      }
    }

    // Determine sync direction
    const direction = `${sourcePlatform}-to-${targetPlatform}`;
    const directionRules = this.rules[direction];

    if (!directionRules) {
      // No rules for this direction - return unchanged
      return data;
    }

    // Handle array vs single object
    if (Array.isArray(data)) {
      return data.map(record => this.normalizeRecord(record, directionRules, direction));
    } else {
      return this.normalizeRecord(data, directionRules, direction);
    }
  }

  /**
   * Normalize a single record
   */
  normalizeRecord(record, directionRules, direction) {
    const normalized = { ...record };

    for (const [fieldPath, rule] of Object.entries(directionRules)) {
      try {
        const currentValue = this.getNestedValue(normalized, fieldPath);

        if (currentValue !== undefined && currentValue !== null) {
          const transformedValue = this.applyRule(currentValue, rule, fieldPath);

          if (transformedValue !== currentValue) {
            this.setNestedValue(normalized, fieldPath, transformedValue);

            if (this.options.logTransformations) {
              this.transformations.push({
                direction,
                field: fieldPath,
                originalValue: currentValue,
                transformedValue,
                rule: rule.description || 'No description',
              });
            }
          }
        }
      } catch (error) {
        this.errors.push({
          type: 'transformation_error',
          direction,
          field: fieldPath,
          message: error.message,
        });

        if (this.options.throwOnError) {
          throw error;
        }
      }
    }

    return normalized;
  }

  /**
   * Apply normalization rule to a value
   */
  applyRule(value, rule, fieldPath) {
    let transformed = value;

    // Pattern-based replacement
    if (rule.pattern && rule.replacement !== undefined) {
      if (typeof value === 'string') {
        const regex = new RegExp(rule.pattern, rule.flags || 'g');
        transformed = value.replace(regex, rule.replacement);
      }
    }

    // Mapping-based transformation
    if (rule.mapping) {
      const mappedValue = rule.mapping[value];
      if (mappedValue !== undefined) {
        transformed = mappedValue;
      } else if (rule.defaultValue !== undefined) {
        transformed = rule.defaultValue;
      }
    }

    // Case normalization
    if (rule.case) {
      if (typeof transformed === 'string') {
        switch (rule.case) {
          case 'upper':
            transformed = transformed.toUpperCase();
            break;
          case 'lower':
            transformed = transformed.toLowerCase();
            break;
          case 'title':
            transformed = this.toTitleCase(transformed);
            break;
          case 'sentence':
            transformed = this.toSentenceCase(transformed);
            break;
        }
      }
    }

    // Trim whitespace
    if (rule.trim && typeof transformed === 'string') {
      transformed = transformed.trim();
    }

    // Date format transformation
    if (rule.dateFormat) {
      transformed = this.transformDate(transformed, rule.dateFormat.from, rule.dateFormat.to);
    }

    // Number format transformation
    if (rule.numberFormat) {
      transformed = this.transformNumber(transformed, rule.numberFormat);
    }

    // Custom function (if provided)
    if (rule.function) {
      transformed = this.applyCustomFunction(transformed, rule.function, fieldPath);
    }

    return transformed;
  }

  /**
   * Convert to title case
   */
  toTitleCase(str) {
    return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  }

  /**
   * Convert to sentence case
   */
  toSentenceCase(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Transform date format
   */
  transformDate(value, fromFormat, toFormat) {
    // Simple date format transformation
    // In production, would use a library like moment.js or date-fns
    if (typeof value !== 'string') return value;

    try {
      // Basic ISO date handling
      if (fromFormat === 'ISO' && toFormat === 'MM/DD/YYYY') {
        const date = new Date(value);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
      }

      if (fromFormat === 'MM/DD/YYYY' && toFormat === 'ISO') {
        const [month, day, year] = value.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }

      // Add more date format transformations as needed
      return value;
    } catch (error) {
      this.errors.push({
        type: 'date_transformation_error',
        message: `Failed to transform date: ${error.message}`,
        value,
      });
      return value;
    }
  }

  /**
   * Transform number format
   */
  transformNumber(value, format) {
    if (typeof value === 'string') {
      value = parseFloat(value.replace(/[^0-9.-]/g, ''));
    }

    if (isNaN(value)) return value;

    if (format.decimals !== undefined) {
      value = value.toFixed(format.decimals);
    }

    if (format.thousands) {
      value = value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, format.thousands);
    }

    return format.prefix ? format.prefix + value : value;
  }

  /**
   * Apply custom function
   */
  applyCustomFunction(value, functionName, fieldPath) {
    // Predefined custom functions
    const customFunctions = {
      // Phone number normalization
      normalizePhone: (phone) => {
        if (typeof phone !== 'string') return phone;
        // Remove all non-digits
        const digits = phone.replace(/\D/g, '');
        // Format as (XXX) XXX-XXXX if US number
        if (digits.length === 10) {
          return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        }
        return phone;
      },

      // Email normalization
      normalizeEmail: (email) => {
        if (typeof email !== 'string') return email;
        return email.toLowerCase().trim();
      },

      // URL normalization
      normalizeUrl: (url) => {
        if (typeof url !== 'string') return url;
        url = url.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        return url;
      },

      // Remove HTML tags
      stripHtml: (html) => {
        if (typeof html !== 'string') return html;
        return html.replace(/<[^>]*>/g, '');
      },
    };

    if (customFunctions[functionName]) {
      return customFunctions[functionName](value);
    }

    this.errors.push({
      type: 'unknown_function',
      function: functionName,
      field: fieldPath,
      message: `Unknown custom function: ${functionName}`,
    });

    return value;
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, path) {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }

  /**
   * Set nested value in object using dot notation
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = obj;

    for (const key of keys) {
      if (!current[key]) {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
  }

  /**
   * Get transformation log
   */
  getTransformations() {
    return this.transformations;
  }

  /**
   * Get errors
   */
  getErrors() {
    return this.errors;
  }

  /**
   * Reset logs
   */
  reset() {
    this.transformations = [];
    this.errors = [];
  }

  /**
   * Generate transformation report
   */
  generateReport() {
    const report = {
      summary: {
        totalTransformations: this.transformations.length,
        errors: this.errors.length,
      },
      transformationsByDirection: {},
      transformationsByField: {},
      errors: this.errors,
    };

    // Group by direction
    for (const transformation of this.transformations) {
      if (!report.transformationsByDirection[transformation.direction]) {
        report.transformationsByDirection[transformation.direction] = [];
      }
      report.transformationsByDirection[transformation.direction].push(transformation);
    }

    // Group by field
    for (const transformation of this.transformations) {
      if (!report.transformationsByField[transformation.field]) {
        report.transformationsByField[transformation.field] = [];
      }
      report.transformationsByField[transformation.field].push(transformation);
    }

    return report;
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.log('Usage: node data-normalizer.js <source-platform> <target-platform> <input-file> <output-file>');
    console.log('');
    console.log('Platforms: salesforce, hubspot, marketo');
    console.log('');
    console.log('Options:');
    console.log('  --rules <path>      Custom rules file');
    console.log('  --no-log            Disable transformation logging');
    console.log('  --throw-on-error    Throw on errors instead of continuing');
    console.log('  --report            Generate transformation report');
    process.exit(1);
  }

  const sourcePlatform = args[0];
  const targetPlatform = args[1];
  const inputFile = args[2];
  const outputFile = args[3];

  // Parse options
  const options = {
    logTransformations: !args.includes('--no-log'),
    throwOnError: args.includes('--throw-on-error'),
  };

  const generateReport = args.includes('--report');

  // Rules path
  const rulesIndex = args.indexOf('--rules');
  const rulesPath = rulesIndex !== -1 && args[rulesIndex + 1]
    ? args[rulesIndex + 1]
    : path.join(__dirname, '../../config/data-normalization-rules.json');

  // Load input data
  let data;
  try {
    const inputContent = fs.readFileSync(inputFile, 'utf8');
    data = JSON.parse(inputContent);
  } catch (error) {
    console.error(`Error loading input file: ${error.message}`);
    process.exit(1);
  }

  // Normalize data
  const normalizer = new DataNormalizer(rulesPath, options);

  try {
    const normalized = normalizer.normalize(data, sourcePlatform, targetPlatform);

    // Write output
    fs.writeFileSync(outputFile, JSON.stringify(normalized, null, 2));
    console.log(`✅ Normalized data written to: ${outputFile}`);

    // Print transformations
    if (options.logTransformations) {
      const transformations = normalizer.getTransformations();
      console.log(`\nTransformations applied: ${transformations.length}`);

      if (transformations.length > 0 && transformations.length <= 10) {
        console.log('\nSample transformations:');
        for (const t of transformations.slice(0, 10)) {
          console.log(`  ${t.field}: "${t.originalValue}" → "${t.transformedValue}"`);
        }
      }
    }

    // Generate report if requested
    if (generateReport) {
      const report = normalizer.generateReport();
      const reportPath = outputFile.replace(/\.json$/, '-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📊 Transformation report: ${reportPath}`);
    }

    // Print errors
    const errors = normalizer.getErrors();
    if (errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${errors.length}`);
      for (const error of errors.slice(0, 5)) {
        console.log(`  • [${error.type}] ${error.message}`);
      }
      if (errors.length > 5) {
        console.log(`  ... and ${errors.length - 5} more`);
      }
    }

    process.exit(errors.length > 0 ? 2 : 0);
  } catch (error) {
    console.error('Normalization error:', error.message);
    process.exit(1);
  }
}

module.exports = DataNormalizer;
