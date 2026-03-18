#!/usr/bin/env node

/**
 * UAT Input Validator
 *
 * Centralized input validation for UAT framework with:
 * - File existence and readability checks
 * - CSV structure validation
 * - Platform configuration validation
 * - Clear, actionable error messages with suggestions
 *
 * Pattern: Validate early, fail fast, provide context
 *
 * @module uat-input-validator
 * @version 1.0.0
 *
 * @example
 * const { UATInputValidator } = require('./uat-input-validator');
 *
 * const validator = new UATInputValidator();
 * const fileResult = validator.validateCSVFile('/path/to/tests.csv');
 *
 * if (!fileResult.valid) {
 *   console.error('Validation failed:', fileResult.errors);
 *   console.log('Suggestions:', fileResult.suggestions);
 * }
 */

const fs = require('fs');
const path = require('path');

/**
 * UAT Input Validator
 */
class UATInputValidator {
  /**
   * Create an input validator
   * @param {Object} [options={}] - Validator options
   * @param {boolean} [options.verbose=false] - Enable verbose logging
   */
  constructor(options = {}) {
    this.verbose = options.verbose || false;
  }

  /**
   * Validate a CSV file before parsing
   * @param {string} filePath - Path to CSV file
   * @returns {Object} Validation result { valid, errors, warnings, suggestions }
   */
  validateCSVFile(filePath) {
    const errors = [];
    const warnings = [];
    const suggestions = [];

    // Null/undefined check
    if (!filePath) {
      errors.push('File path is required');
      suggestions.push('Provide a valid file path to the CSV file');
      return { valid: false, errors, warnings, suggestions };
    }

    // Convert to string if needed
    const pathStr = String(filePath).trim();

    if (pathStr === '') {
      errors.push('File path cannot be empty');
      suggestions.push('Provide a non-empty file path');
      return { valid: false, errors, warnings, suggestions };
    }

    // File existence check
    if (!fs.existsSync(pathStr)) {
      errors.push(`CSV file not found: ${pathStr}`);
      suggestions.push('Check file path for typos');
      suggestions.push('Use absolute path if relative path is ambiguous');
      suggestions.push(`Current working directory: ${process.cwd()}`);
      return { valid: false, errors, warnings, suggestions };
    }

    // Verify it's a file (not directory)
    const stats = fs.statSync(pathStr);
    if (stats.isDirectory()) {
      errors.push(`Path is a directory, not a file: ${pathStr}`);
      suggestions.push('Provide path to a CSV file, not a directory');
      return { valid: false, errors, warnings, suggestions };
    }

    // File extension check
    const ext = path.extname(pathStr).toLowerCase();
    if (ext !== '.csv') {
      warnings.push(`File does not have .csv extension: ${pathStr} (has ${ext || 'no extension'})`);
      suggestions.push('Rename file to have .csv extension for clarity');
    }

    // File readability check
    try {
      fs.accessSync(pathStr, fs.constants.R_OK);
    } catch (e) {
      errors.push(`Cannot read file: ${pathStr}`);
      suggestions.push('Check file permissions');
      suggestions.push(`Run: chmod +r "${pathStr}"`);
      return { valid: false, errors, warnings, suggestions };
    }

    // File not empty
    if (stats.size === 0) {
      errors.push('CSV file is empty');
      suggestions.push('Add test scenarios to file');
      suggestions.push('Minimum: header row + one data row');
      return { valid: false, errors, warnings, suggestions };
    }

    // Check file size isn't too large (warn at 10MB)
    const sizeMB = stats.size / (1024 * 1024);
    if (sizeMB > 10) {
      warnings.push(`Large file detected: ${sizeMB.toFixed(1)}MB - may be slow to process`);
      suggestions.push('Consider splitting into smaller files for faster execution');
    }

    this.log(`File validated: ${pathStr} (${stats.size} bytes)`);

    return { valid: errors.length === 0, errors, warnings, suggestions };
  }

  /**
   * Validate CSV content structure
   * @param {string} content - CSV file content
   * @returns {Object} Validation result { valid, errors, warnings, suggestions, headers }
   */
  validateCSVStructure(content) {
    const errors = [];
    const warnings = [];
    const suggestions = [];

    // Null/undefined check
    if (!content) {
      errors.push('CSV content is empty or undefined');
      return { valid: false, errors, warnings, suggestions, headers: [] };
    }

    // Convert to string and normalize line endings
    const contentStr = String(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Split into lines (ignore empty lines at end)
    const lines = contentStr.split('\n').filter(l => l.trim());

    if (lines.length === 0) {
      errors.push('CSV file contains no data');
      suggestions.push('Add at least a header row and one data row');
      return { valid: false, errors, warnings, suggestions, headers: [] };
    }

    if (lines.length < 2) {
      errors.push('CSV must have at least header row and one data row');
      suggestions.push(`Found only ${lines.length} row(s)`);
      suggestions.push('Add test scenario data below the header row');
      return { valid: false, errors, warnings, suggestions, headers: [] };
    }

    // Parse header row
    const headers = this.parseCSVLine(lines[0]);
    this.log(`Found ${headers.length} columns: ${headers.join(', ')}`);

    // Check for required columns
    const testScenarioCol = headers.findIndex(h =>
      /test.?scenario/i.test(h) ||
      /test.?case/i.test(h) ||
      /scenario/i.test(h)
    );

    if (testScenarioCol === -1) {
      errors.push('Missing required column: "Test Scenario" (or "Test Scenarios", "Scenario", "Test Case")');
      suggestions.push('Add a column header containing "Test Scenario"');
      suggestions.push('Column should contain arrow-separated steps (e.g., "Create Account → Add Opp → Verify")');
      suggestions.push(`Current headers: ${headers.join(', ')}`);
      return { valid: false, errors, warnings, suggestions, headers };
    }

    // Check for common useful columns (warnings only)
    const epicCol = headers.findIndex(h => /epic/i.test(h));
    if (epicCol === -1) {
      warnings.push('No "Epic" column found - test cases won\'t be grouped');
    }

    const userStoryCol = headers.findIndex(h => /user.?story/i.test(h));
    if (userStoryCol === -1) {
      warnings.push('No "User Story" column found - traceability limited');
    }

    // Check for empty rows in data
    let emptyRows = 0;
    for (let i = 1; i < lines.length; i++) {
      const row = this.parseCSVLine(lines[i]);
      if (row.every(cell => !cell.trim())) {
        emptyRows++;
      } else if (testScenarioCol < row.length && !row[testScenarioCol].trim()) {
        // Row has data but test scenario cell is empty or whitespace-only
        warnings.push(`Row ${i + 1} has no test scenario defined`);
      }
    }

    if (emptyRows > 0) {
      warnings.push(`Found ${emptyRows} empty row(s) that will be skipped`);
    }

    // Count actual test scenarios
    const scenarioCount = lines.slice(1).filter(line => {
      const row = this.parseCSVLine(line);
      return row[testScenarioCol] && row[testScenarioCol].trim();
    }).length;

    this.log(`Found ${scenarioCount} test scenario(s)`);

    if (scenarioCount === 0) {
      errors.push('No test scenarios found in data rows');
      suggestions.push('Add test scenarios with arrow-separated steps');
      suggestions.push('Example: "Create Account → Add Contact → Verify"');
      return { valid: false, errors, warnings, suggestions, headers };
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      headers,
      stats: {
        totalRows: lines.length - 1,
        scenarioCount,
        emptyRows,
        columns: headers.length
      }
    };
  }

  /**
   * Validate platform configuration
   * @param {string} platform - Platform name
   * @param {Object} [config={}] - Platform configuration
   * @param {string} [config.orgAlias] - Salesforce org alias
   * @param {string} [config.portalId] - HubSpot portal ID
   * @returns {Object} Validation result { valid, errors, warnings, suggestions }
   */
  validatePlatformConfig(platform, config = {}) {
    const errors = [];
    const warnings = [];
    const suggestions = [];

    // Platform check
    const validPlatforms = ['salesforce', 'hubspot'];
    const normalizedPlatform = platform ? String(platform).toLowerCase().trim() : '';

    if (!normalizedPlatform) {
      errors.push('Platform is required');
      suggestions.push(`Supported platforms: ${validPlatforms.join(', ')}`);
      return { valid: false, errors, warnings, suggestions };
    }

    if (!validPlatforms.includes(normalizedPlatform)) {
      errors.push(`Unknown platform: ${platform}`);
      suggestions.push(`Supported platforms: ${validPlatforms.join(', ')}`);
      suggestions.push('Use --platform salesforce or --platform hubspot');
      return { valid: false, errors, warnings, suggestions };
    }

    // Platform-specific validation
    if (normalizedPlatform === 'salesforce') {
      if (!config.orgAlias) {
        errors.push('Salesforce requires org alias');
        suggestions.push('Provide --org <alias> parameter');
        suggestions.push('List available orgs: sf org list');
        suggestions.push('Login to org: sf org login web --alias my-sandbox');
        return { valid: false, errors, warnings, suggestions };
      }

      // Warn about production-looking org names
      const alias = config.orgAlias.toLowerCase();
      if (alias.includes('prod') || alias === 'production' || alias === 'main') {
        warnings.push(`⚠️ Org alias "${config.orgAlias}" looks like production - use caution!`);
        suggestions.push('Consider using a sandbox for test execution');
      }
    }

    if (normalizedPlatform === 'hubspot') {
      if (!config.portalId && !config.accessToken) {
        warnings.push('HubSpot portal ID not specified - will use default');
        suggestions.push('Provide portal ID for multi-portal environments');
      }
    }

    return { valid: errors.length === 0, errors, warnings, suggestions };
  }

  /**
   * Validate test data object
   * @param {Object} testData - Test data to validate
   * @returns {Object} Validation result { valid, errors, warnings, suggestions }
   */
  validateTestData(testData) {
    const errors = [];
    const warnings = [];
    const suggestions = [];

    if (testData === null || testData === undefined) {
      // Null test data is OK - will use defaults
      return { valid: true, errors, warnings, suggestions };
    }

    if (typeof testData !== 'object') {
      errors.push(`Test data must be an object, got ${typeof testData}`);
      suggestions.push('Provide test data as a JavaScript object or JSON');
      return { valid: false, errors, warnings, suggestions };
    }

    // Check for common issues in test data
    for (const [key, value] of Object.entries(testData)) {
      // Check for placeholder values
      if (typeof value === 'string') {
        if (value.includes('{{') || value.includes('<%')) {
          warnings.push(`Field "${key}" contains unresolved template: ${value}`);
        }
        if (value === '' || value.toLowerCase() === 'todo' || value.toLowerCase() === 'tbd') {
          warnings.push(`Field "${key}" has placeholder value: "${value}"`);
        }
      }

      // Check for null values (may be intentional)
      if (value === null) {
        this.log(`Field "${key}" is null - will be omitted from operations`);
      }
    }

    return { valid: errors.length === 0, errors, warnings, suggestions };
  }

  /**
   * Validate filter configuration
   * @param {Object} filters - Filter configuration
   * @returns {Object} Validation result { valid, errors, warnings, suggestions }
   */
  validateFilters(filters) {
    const errors = [];
    const warnings = [];
    const suggestions = [];

    if (!filters || typeof filters !== 'object') {
      // No filters is valid
      return { valid: true, errors, warnings, suggestions };
    }

    const validFilterKeys = ['epic', 'scenario', 'userStory', 'status', 'tag'];

    for (const key of Object.keys(filters)) {
      if (!validFilterKeys.includes(key)) {
        warnings.push(`Unknown filter key: ${key}`);
        suggestions.push(`Valid filter keys: ${validFilterKeys.join(', ')}`);
      }

      const value = filters[key];
      if (value !== undefined && value !== null && typeof value !== 'string') {
        errors.push(`Filter "${key}" must be a string, got ${typeof value}`);
      }
    }

    return { valid: errors.length === 0, errors, warnings, suggestions };
  }

  /**
   * Run all validations for test execution
   * @param {Object} params - Execution parameters
   * @param {string} params.csvPath - Path to CSV file
   * @param {string} params.platform - Platform name
   * @param {Object} [params.config] - Platform configuration
   * @param {Object} [params.testData] - Test data
   * @param {Object} [params.filters] - Test filters
   * @returns {Object} Combined validation result
   */
  validateAll(params) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      details: {}
    };

    // Validate CSV file
    const fileResult = this.validateCSVFile(params.csvPath);
    results.details.file = fileResult;
    if (!fileResult.valid) {
      results.valid = false;
      results.errors.push(...fileResult.errors);
    }
    results.warnings.push(...fileResult.warnings);
    results.suggestions.push(...fileResult.suggestions);

    // If file is valid, validate structure
    if (fileResult.valid) {
      const content = fs.readFileSync(params.csvPath, 'utf8');
      const structureResult = this.validateCSVStructure(content);
      results.details.structure = structureResult;
      if (!structureResult.valid) {
        results.valid = false;
        results.errors.push(...structureResult.errors);
      }
      results.warnings.push(...structureResult.warnings);
      results.suggestions.push(...structureResult.suggestions);
    }

    // Validate platform config
    const platformResult = this.validatePlatformConfig(params.platform, params.config || {});
    results.details.platform = platformResult;
    if (!platformResult.valid) {
      results.valid = false;
      results.errors.push(...platformResult.errors);
    }
    results.warnings.push(...platformResult.warnings);
    results.suggestions.push(...platformResult.suggestions);

    // Validate test data if provided
    if (params.testData) {
      const dataResult = this.validateTestData(params.testData);
      results.details.testData = dataResult;
      if (!dataResult.valid) {
        results.valid = false;
        results.errors.push(...dataResult.errors);
      }
      results.warnings.push(...dataResult.warnings);
    }

    // Validate filters if provided
    if (params.filters) {
      const filterResult = this.validateFilters(params.filters);
      results.details.filters = filterResult;
      if (!filterResult.valid) {
        results.valid = false;
        results.errors.push(...filterResult.errors);
      }
      results.warnings.push(...filterResult.warnings);
    }

    // Deduplicate suggestions
    results.suggestions = [...new Set(results.suggestions)];

    return results;
  }

  /**
   * Parse a CSV line handling quotes
   * @param {string} line - CSV line to parse
   * @returns {Array<string>} Array of field values
   */
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    // Don't forget last field
    result.push(current);

    return result;
  }

  /**
   * Logging helper
   */
  log(message) {
    if (this.verbose) {
      console.log(`[UATInputValidator] ${message}`);
    }
  }
}

module.exports = { UATInputValidator };
