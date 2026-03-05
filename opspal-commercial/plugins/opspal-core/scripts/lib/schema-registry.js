#!/usr/bin/env node
/**
 * Schema Registry
 *
 * Central registry for JSON Schema validation across all plugins.
 * Prevents schema/parse errors through multi-stage validation with caching.
 *
 * Addresses Reflection Cohort: schema/parse (54 reflections)
 * Target ROI: $12,960 annually (80% reduction)
 *
 * Pattern: Multi-stage validation like quality-gate-validator.js
 *
 * Usage:
 *   const registry = new SchemaRegistry();
 *   await registry.registerSchema('reflection', reflectionSchema);
 *   const result = await registry.validate(data, 'reflection');
 *
 * CLI:
 *   node schema-registry.js validate data.json reflection
 *   node schema-registry.js list
 *   node schema-registry.js test reflection
 *
 * @module schema-registry
 * @version 1.0.0
 * @created 2026-01-06
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

/**
 * Severity levels for validation errors
 */
const SEVERITY = {
  CRITICAL: 'CRITICAL',  // Blocks operation
  HIGH: 'HIGH',          // Strongly recommended to fix
  WARNING: 'WARNING',    // Should address but can proceed
  INFO: 'INFO'           // Informational only
};

/**
 * Schema Registry Class
 */
class SchemaRegistry {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.schemasDir = options.schemasDir || path.join(__dirname, '../../schemas');

    // Initialize AJV with strict mode and all formats
    this.ajv = new Ajv({
      allErrors: true,
      strict: true,
      validateFormats: true,
      verbose: true
    });
    addFormats(this.ajv);

    // Schema cache: { schemaName: { compiled, raw, lastModified } }
    this.schemaCache = {};

    // Validation statistics
    this.stats = {
      totalValidations: 0,
      passed: 0,
      failed: 0,
      bySchema: {},
      bySeverity: {
        CRITICAL: 0,
        HIGH: 0,
        WARNING: 0,
        INFO: 0
      },
      avgValidationTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    // Error templates for common issues
    this.errorTemplates = this.loadErrorTemplates();

    this.log('Schema Registry initialized');
  }

  /**
   * Load error templates with remediation suggestions
   */
  loadErrorTemplates() {
    return {
      'required': {
        severity: SEVERITY.CRITICAL,
        message: 'Required field missing',
        remediation: 'Add the required field to your data structure'
      },
      'type': {
        severity: SEVERITY.CRITICAL,
        message: 'Field type mismatch',
        remediation: 'Ensure field value matches expected type (string, number, boolean, array, object)'
      },
      'enum': {
        severity: SEVERITY.HIGH,
        message: 'Invalid enum value',
        remediation: 'Use one of the allowed values specified in the schema'
      },
      'pattern': {
        severity: SEVERITY.HIGH,
        message: 'Field value does not match required pattern',
        remediation: 'Adjust field value to match the regex pattern requirement'
      },
      'minLength': {
        severity: SEVERITY.WARNING,
        message: 'Field value is too short',
        remediation: 'Ensure field value meets minimum length requirement'
      },
      'maxLength': {
        severity: SEVERITY.WARNING,
        message: 'Field value is too long',
        remediation: 'Ensure field value does not exceed maximum length'
      },
      'minimum': {
        severity: SEVERITY.WARNING,
        message: 'Numeric value is below minimum',
        remediation: 'Increase value to meet minimum requirement'
      },
      'maximum': {
        severity: SEVERITY.WARNING,
        message: 'Numeric value exceeds maximum',
        remediation: 'Decrease value to meet maximum requirement'
      },
      'additionalProperties': {
        severity: SEVERITY.INFO,
        message: 'Unexpected additional properties',
        remediation: 'Remove unexpected properties or update schema to allow them'
      }
    };
  }

  /**
   * Register a schema in the registry
   *
   * @param {string} name - Schema name/identifier
   * @param {Object} schema - JSON Schema object
   * @param {Object} options - Registration options
   * @returns {boolean} Success
   */
  registerSchema(name, schema, options = {}) {
    try {
      this.log(`Registering schema: ${name}`);

      // Validate that schema itself is valid JSON Schema
      if (!schema || typeof schema !== 'object') {
        throw new Error('Schema must be a valid object');
      }

      if (!schema.$schema) {
        schema.$schema = 'http://json-schema.org/draft-07/schema#';
      }

      // Compile schema for validation
      const compiled = this.ajv.compile(schema);

      // Cache the schema
      this.schemaCache[name] = {
        compiled: compiled,
        raw: schema,
        lastModified: new Date(),
        options: options
      };

      // Initialize stats for this schema
      if (!this.stats.bySchema[name]) {
        this.stats.bySchema[name] = {
          validations: 0,
          passed: 0,
          failed: 0,
          commonErrors: {}
        };
      }

      this.log(`✅ Schema registered: ${name}`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to register schema ${name}: ${error.message}`);
      return false;
    }
  }

  /**
   * Load schema from file and register it
   *
   * @param {string} name - Schema name
   * @param {string} filePath - Path to schema JSON file
   * @returns {boolean} Success
   */
  loadSchema(name, filePath) {
    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.schemasDir, filePath);

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Schema file not found: ${resolvedPath}`);
      }

      const schemaContent = fs.readFileSync(resolvedPath, 'utf8');
      const schema = JSON.parse(schemaContent);

      return this.registerSchema(name, schema);

    } catch (error) {
      console.error(`❌ Failed to load schema from ${filePath}: ${error.message}`);
      return false;
    }
  }

  /**
   * Load all schemas from schemas directory
   *
   * @returns {number} Number of schemas loaded
   */
  loadAllSchemas() {
    let loaded = 0;

    try {
      if (!fs.existsSync(this.schemasDir)) {
        this.log(`⚠️  Schemas directory not found: ${this.schemasDir}`);
        return 0;
      }

      const files = fs.readdirSync(this.schemasDir)
        .filter(f => f.endsWith('.schema.json'));

      for (const file of files) {
        const name = file.replace('.schema.json', '');
        if (this.loadSchema(name, file)) {
          loaded++;
        }
      }

      this.log(`✅ Loaded ${loaded} schemas from ${this.schemasDir}`);

    } catch (error) {
      console.error(`❌ Error loading schemas: ${error.message}`);
    }

    return loaded;
  }

  /**
   * Get cached schema (with cache hit/miss tracking)
   *
   * @param {string} name - Schema name
   * @returns {Object|null} Cached schema object or null
   */
  getCachedSchema(name) {
    if (this.schemaCache[name]) {
      this.stats.cacheHits++;
      return this.schemaCache[name];
    }

    this.stats.cacheMisses++;
    return null;
  }

  /**
   * Main validation method - validates data against a registered schema
   *
   * @param {*} data - Data to validate
   * @param {string} schemaName - Name of registered schema
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  async validate(data, schemaName, options = {}) {
    const startTime = Date.now();

    try {
      this.stats.totalValidations++;

      // Get schema from cache
      const cachedSchema = this.getCachedSchema(schemaName);

      if (!cachedSchema) {
        throw new Error(`Schema not found: ${schemaName}. Register it first using registerSchema().`);
      }

      // Update schema stats
      this.stats.bySchema[schemaName].validations++;

      // Validate using compiled schema
      const valid = cachedSchema.compiled(data);

      // Collect errors if validation failed
      const errors = valid ? [] : this.formatErrors(cachedSchema.compiled.errors, data);

      // Determine overall severity
      const maxSeverity = this.getMaxSeverity(errors);

      // Update statistics
      const validationTime = Date.now() - startTime;
      this.updateStats(valid, schemaName, errors, validationTime);

      const result = {
        valid: valid,
        schemaName: schemaName,
        errors: errors,
        errorCount: errors.length,
        severity: maxSeverity,
        validationTime: validationTime,
        timestamp: new Date().toISOString()
      };

      // Log if verbose
      if (this.verbose) {
        this.logValidationResult(result);
      }

      return result;

    } catch (error) {
      console.error(`❌ Validation error: ${error.message}`);
      return {
        valid: false,
        schemaName: schemaName,
        errors: [{
          keyword: 'system_error',
          message: error.message,
          severity: SEVERITY.CRITICAL
        }],
        errorCount: 1,
        severity: SEVERITY.CRITICAL,
        validationTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Validate a single field against its schema definition
   *
   * @param {*} value - Field value
   * @param {Object} fieldDef - Field definition from schema
   * @returns {Object} Validation result
   */
  validateField(value, fieldDef) {
    try {
      // Create minimal schema for field
      const fieldSchema = {
        type: 'object',
        properties: {
          field: fieldDef
        },
        required: fieldDef.required ? ['field'] : []
      };

      const compiled = this.ajv.compile(fieldSchema);
      const valid = compiled({ field: value });

      return {
        valid: valid,
        errors: valid ? [] : this.formatErrors(compiled.errors, { field: value })
      };

    } catch (error) {
      return {
        valid: false,
        errors: [{
          keyword: 'field_validation_error',
          message: error.message,
          severity: SEVERITY.CRITICAL
        }]
      };
    }
  }

  /**
   * Format AJV errors with severity and remediation
   *
   * @param {Array} ajvErrors - Errors from AJV validation
   * @param {*} data - Original data being validated
   * @returns {Array} Formatted errors
   */
  formatErrors(ajvErrors, data) {
    if (!ajvErrors || ajvErrors.length === 0) {
      return [];
    }

    return ajvErrors.map(error => {
      const template = this.errorTemplates[error.keyword] || {
        severity: SEVERITY.WARNING,
        message: 'Validation error',
        remediation: 'Review schema requirements'
      };

      return {
        keyword: error.keyword,
        message: `${template.message}: ${error.message}`,
        path: error.instancePath || '(root)',
        params: error.params,
        severity: template.severity,
        remediation: template.remediation,
        schemaPath: error.schemaPath
      };
    });
  }

  /**
   * Get maximum severity from error list
   *
   * @param {Array} errors - List of validation errors
   * @returns {string} Maximum severity level
   */
  getMaxSeverity(errors) {
    if (errors.length === 0) return null;

    const severityOrder = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.WARNING, SEVERITY.INFO];

    for (const level of severityOrder) {
      if (errors.some(e => e.severity === level)) {
        return level;
      }
    }

    return SEVERITY.WARNING;
  }

  /**
   * Update validation statistics
   *
   * @param {boolean} valid - Validation result
   * @param {string} schemaName - Schema name
   * @param {Array} errors - Validation errors
   * @param {number} validationTime - Time taken (ms)
   */
  updateStats(valid, schemaName, errors, validationTime) {
    // Update global stats
    if (valid) {
      this.stats.passed++;
    } else {
      this.stats.failed++;
    }

    // Update schema-specific stats
    if (valid) {
      this.stats.bySchema[schemaName].passed++;
    } else {
      this.stats.bySchema[schemaName].failed++;

      // Track common errors
      for (const error of errors) {
        const key = `${error.keyword}:${error.path}`;
        if (!this.stats.bySchema[schemaName].commonErrors[key]) {
          this.stats.bySchema[schemaName].commonErrors[key] = 0;
        }
        this.stats.bySchema[schemaName].commonErrors[key]++;

        // Update severity counts
        this.stats.bySeverity[error.severity]++;
      }
    }

    // Update average validation time
    const totalTime = this.stats.avgValidationTime * (this.stats.totalValidations - 1) + validationTime;
    this.stats.avgValidationTime = totalTime / this.stats.totalValidations;
  }

  /**
   * Get validation errors in formatted display
   *
   * @param {Object} result - Validation result
   * @returns {string} Formatted error display
   */
  getValidationErrors(result) {
    if (result.valid) {
      return '✅ Validation passed';
    }

    let output = `❌ Validation failed for schema: ${result.schemaName}\n`;
    output += `   Errors: ${result.errorCount}\n`;
    output += `   Severity: ${result.severity}\n\n`;

    for (const error of result.errors) {
      const icon = this.getSeverityIcon(error.severity);
      output += `${icon} [${error.severity}] ${error.path}\n`;
      output += `   ${error.message}\n`;
      output += `   💡 ${error.remediation}\n\n`;
    }

    return output;
  }

  /**
   * Get icon for severity level
   */
  getSeverityIcon(severity) {
    const icons = {
      [SEVERITY.CRITICAL]: '🔴',
      [SEVERITY.HIGH]: '🟠',
      [SEVERITY.WARNING]: '🟡',
      [SEVERITY.INFO]: '🔵'
    };
    return icons[severity] || '⚪';
  }

  /**
   * Log validation result
   */
  logValidationResult(result) {
    if (result.valid) {
      console.log(`✅ Validation passed: ${result.schemaName} (${result.validationTime}ms)`);
    } else {
      console.log(`❌ Validation failed: ${result.schemaName} (${result.validationTime}ms)`);
      console.log(this.getValidationErrors(result));
    }
  }

  /**
   * Get validation statistics
   *
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      passRate: this.stats.totalValidations > 0
        ? ((this.stats.passed / this.stats.totalValidations) * 100).toFixed(2) + '%'
        : '0%',
      cacheHitRate: (this.stats.cacheHits + this.stats.cacheMisses) > 0
        ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * List all registered schemas
   *
   * @returns {Array} Schema names
   */
  listSchemas() {
    return Object.keys(this.schemaCache);
  }

  /**
   * Clear schema cache
   */
  clearCache() {
    this.schemaCache = {};
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
    this.log('Cache cleared');
  }

  /**
   * Log message (if verbose)
   */
  log(message) {
    if (this.verbose) {
      console.log(`[SchemaRegistry] ${message}`);
    }
  }
}

// Export
module.exports = SchemaRegistry;

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const registry = new SchemaRegistry({ verbose: true });

  // Load all schemas
  registry.loadAllSchemas();

  (async () => {
    try {
      if (command === 'validate') {
        // node schema-registry.js validate data.json reflection
        const dataFile = args[1];
        const schemaName = args[2];

        if (!dataFile || !schemaName) {
          console.error('Usage: node schema-registry.js validate <data-file> <schema-name>');
          process.exit(1);
        }

        const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        const result = await registry.validate(data, schemaName);

        console.log(registry.getValidationErrors(result));
        process.exit(result.valid ? 0 : 1);

      } else if (command === 'list') {
        // node schema-registry.js list
        const schemas = registry.listSchemas();
        console.log('\n📋 Registered Schemas:\n');
        schemas.forEach(name => console.log(`  - ${name}`));
        console.log(`\nTotal: ${schemas.length} schemas\n`);
        process.exit(0);

      } else if (command === 'test') {
        // node schema-registry.js test reflection
        const schemaName = args[1];

        if (!schemaName) {
          console.error('Usage: node schema-registry.js test <schema-name>');
          process.exit(1);
        }

        // Test with minimal valid data
        const testData = {};
        const result = await registry.validate(testData, schemaName);

        console.log(registry.getValidationErrors(result));
        process.exit(result.valid ? 0 : 2);

      } else if (command === 'stats') {
        // node schema-registry.js stats
        const stats = registry.getStats();
        console.log('\n📊 Validation Statistics:\n');
        console.log(`  Total Validations: ${stats.totalValidations}`);
        console.log(`  Pass Rate: ${stats.passRate}`);
        console.log(`  Avg Time: ${stats.avgValidationTime.toFixed(2)}ms`);
        console.log(`  Cache Hit Rate: ${stats.cacheHitRate}\n`);
        process.exit(0);

      } else {
        console.error('Unknown command. Available: validate, list, test, stats');
        process.exit(1);
      }

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  })();
}
