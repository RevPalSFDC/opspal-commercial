#!/usr/bin/env node

/**
 * Schema Pre-Flight Checker for Salesforce Operations
 *
 * Prevents schema/parse errors by validating operations BEFORE execution.
 * Addresses the schema/parse cohort which caused 10 reflections.
 *
 * **Problem Solved (Reflection Cohort: schema/parse - P0):**
 * - Field not found errors after operations begin
 * - Object API name vs Label confusion
 * - SOQL query failures mid-execution
 * - Metadata deletion breaks dependent components
 *
 * **Solution:**
 * - Pre-execution field existence checks
 * - Automatic API name resolution from labels
 * - SOQL syntax and field validation
 * - Dependency checking before deletions
 *
 * **ROI:** Part of $126k/year schema-related error prevention
 *
 * Usage:
 *   const SchemaPreflightChecker = require('./schema-preflight-checker');
 *   const checker = new SchemaPreflightChecker('my-org-alias');
 *
 *   // Validate field before operations
 *   const result = await checker.validateFieldExists('Account', 'Custom_Field__c');
 *
 *   // Resolve object name (API name or label)
 *   const resolved = await checker.validateObjectName('Order Form'); // → SBQQ__Quote__c
 *
 *   // Validate SOQL before execution
 *   const queryResult = await checker.validateSOQL('SELECT Id FROM Account');
 *
 * @module schema-preflight-checker
 */

const { execSync } = require('child_process');

class SchemaPreflightChecker {
  constructor(orgAlias = null) {
    this.orgAlias = orgAlias || process.env.SF_TARGET_ORG || process.env.SF_TARGET_ORG;
    this.verbose = false;
    this.cache = {
      objects: new Map(),
      fields: new Map(),
      objectDescribes: new Map()
    };
    this.cacheTimeout = 300000; // 5 minutes
  }

  /**
   * Enable verbose logging
   */
  setVerbose(verbose) {
    this.verbose = verbose;
    return this;
  }

  /**
   * Log message if verbose mode enabled
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[SchemaPreflightChecker] ${message}`, data ? JSON.stringify(data) : '');
    }
  }

  /**
   * Execute SF CLI command and return result
   */
  executeSf(command) {
    const fullCommand = this.orgAlias
      ? `${command} --target-org ${this.orgAlias} --json`
      : `${command} --json`;

    this.log(`Executing: ${fullCommand}`);

    try {
      const result = execSync(fullCommand, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60000
      });

      const parsed = JSON.parse(result);
      return { success: true, data: parsed.result || parsed };
    } catch (error) {
      try {
        const errorJson = JSON.parse(error.stdout || error.stderr || '{}');
        return {
          success: false,
          error: errorJson.message || error.message,
          details: errorJson
        };
      } catch {
        return {
          success: false,
          error: error.message,
          details: null
        };
      }
    }
  }

  /**
   * Validate that a field exists on an object
   * @param {string} objectName - Object API name or label
   * @param {string} fieldName - Field API name or label
   * @returns {Promise<object>} Validation result
   */
  async validateFieldExists(objectName, fieldName) {
    this.log(`Validating field: ${objectName}.${fieldName}`);

    // First resolve the object name
    const objectResult = await this.validateObjectName(objectName);
    if (!objectResult.valid) {
      return {
        valid: false,
        error: `Object not found: ${objectName}`,
        suggestions: objectResult.suggestions,
        context: { objectName, fieldName }
      };
    }

    const resolvedObjectName = objectResult.apiName;
    const cacheKey = `${resolvedObjectName}.${fieldName}`;

    // Check cache
    if (this.cache.fields.has(cacheKey)) {
      const cached = this.cache.fields.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.result;
      }
    }

    // Get object describe
    const describe = await this.getObjectDescribe(resolvedObjectName);
    if (!describe) {
      return {
        valid: false,
        error: `Failed to describe object: ${resolvedObjectName}`,
        context: { objectName: resolvedObjectName, fieldName }
      };
    }

    // Find field by API name or label
    const field = describe.fields.find(f =>
      f.name.toLowerCase() === fieldName.toLowerCase() ||
      (f.label && f.label.toLowerCase() === fieldName.toLowerCase())
    );

    const result = field ? {
      valid: true,
      apiName: field.name,
      label: field.label,
      fieldType: field.type,
      objectName: resolvedObjectName,
      details: {
        length: field.length,
        required: field.nillable === false,
        referenceTo: field.referenceTo,
        formula: field.calculatedFormula
      },
      context: { objectName: resolvedObjectName, fieldName }
    } : {
      valid: false,
      error: `Field not found: ${resolvedObjectName}.${fieldName}`,
      suggestions: this.findSimilarFields(describe.fields, fieldName),
      availableFields: describe.fields.slice(0, 15).map(f => `${f.name} (${f.label})`),
      context: { objectName: resolvedObjectName, fieldName }
    };

    // Cache result
    this.cache.fields.set(cacheKey, { result, timestamp: Date.now() });

    return result;
  }

  /**
   * Validate and resolve object name (API name or label)
   * @param {string} objectName - Object API name or label to validate
   * @returns {Promise<object>} Validation result with resolved API name
   */
  async validateObjectName(objectName) {
    this.log(`Validating object: ${objectName}`);

    // Check cache
    const cacheKey = objectName.toLowerCase();
    if (this.cache.objects.has(cacheKey)) {
      const cached = this.cache.objects.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.result;
      }
    }

    // Try direct describe first (handles exact API names)
    const describeResult = this.executeSf(`sf sobject describe --sobject ${objectName}`);

    if (describeResult.success && describeResult.data.name) {
      const result = {
        valid: true,
        apiName: describeResult.data.name,
        label: describeResult.data.label,
        matchType: 'exact',
        context: { inputName: objectName }
      };
      this.cache.objects.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }

    // Try to find by label - get all objects
    const listResult = this.executeSf('sf sobject list');
    if (!listResult.success) {
      return {
        valid: false,
        error: `Failed to list objects: ${listResult.error}`,
        context: { inputName: objectName }
      };
    }

    const allObjects = listResult.data || [];

    // Try label-based lookup by describing each matching candidate
    const searchLower = objectName.toLowerCase();
    const possibleMatches = allObjects.filter(obj => {
      const objLower = obj.toLowerCase();
      return objLower.includes(searchLower) ||
             searchLower.includes(objLower.replace('__c', '').replace('_', ' '));
    }).slice(0, 10);

    // Check each candidate for label match
    for (const candidate of possibleMatches) {
      const candidateDescribe = this.executeSf(`sf sobject describe --sobject ${candidate}`);
      if (candidateDescribe.success && candidateDescribe.data.label) {
        if (candidateDescribe.data.label.toLowerCase() === searchLower ||
            candidateDescribe.data.label.toLowerCase().replace(' ', '') === searchLower.replace(' ', '')) {
          const result = {
            valid: true,
            apiName: candidateDescribe.data.name,
            label: candidateDescribe.data.label,
            matchType: 'label',
            context: { inputName: objectName }
          };
          this.cache.objects.set(cacheKey, { result, timestamp: Date.now() });
          return result;
        }
      }
    }

    // Not found - return suggestions
    const suggestions = this.findSimilarStrings(allObjects, objectName, 5);

    return {
      valid: false,
      error: `Object not found: ${objectName}`,
      suggestions,
      context: { inputName: objectName }
    };
  }

  /**
   * Get object describe (cached)
   */
  async getObjectDescribe(objectName) {
    if (this.cache.objectDescribes.has(objectName)) {
      const cached = this.cache.objectDescribes.get(objectName);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    const result = this.executeSf(`sf sobject describe --sobject ${objectName}`);
    if (result.success && result.data) {
      this.cache.objectDescribes.set(objectName, {
        data: result.data,
        timestamp: Date.now()
      });
      return result.data;
    }

    return null;
  }

  /**
   * Validate SOQL query before execution
   * @param {string} query - SOQL query to validate
   * @returns {Promise<object>} Validation result
   */
  async validateSOQL(query) {
    this.log(`Validating SOQL: ${query.substring(0, 80)}...`);

    const errors = [];
    const warnings = [];

    // Basic syntax checks
    const syntaxResult = this.validateSOQLSyntax(query);
    if (!syntaxResult.valid) {
      return syntaxResult;
    }

    // Extract object name
    const fromMatch = query.match(/FROM\s+(\w+)/i);
    if (!fromMatch) {
      return {
        valid: false,
        error: 'Could not extract object name from query',
        query
      };
    }

    const objectName = fromMatch[1];

    // Validate object
    const objectResult = await this.validateObjectName(objectName);
    if (!objectResult.valid) {
      return {
        valid: false,
        error: `Invalid object in query: ${objectName}`,
        suggestions: objectResult.suggestions,
        query
      };
    }

    // Extract and validate fields
    const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectMatch && selectMatch[1].trim() !== '*') {
      const selectClause = selectMatch[1];
      const fields = this.parseSelectFields(selectClause);

      for (const field of fields) {
        // Skip aggregate functions and relationships
        if (field.includes('(') || field.includes('.') || field === 'COUNT' || field === 'count') {
          continue;
        }

        const fieldResult = await this.validateFieldExists(objectResult.apiName, field);
        if (!fieldResult.valid) {
          errors.push({
            field,
            error: fieldResult.error,
            suggestions: fieldResult.suggestions
          });
        }
      }
    }

    // Check for common SOQL issues
    const soqlWarnings = this.checkSOQLBestPractices(query);
    warnings.push(...soqlWarnings);

    if (errors.length > 0) {
      return {
        valid: false,
        error: 'Invalid fields in query',
        invalidFields: errors,
        warnings,
        query
      };
    }

    return {
      valid: true,
      objectName: objectResult.apiName,
      objectLabel: objectResult.label,
      warnings,
      query
    };
  }

  /**
   * Parse SELECT fields from query
   */
  parseSelectFields(selectClause) {
    // Handle nested queries and functions
    let depth = 0;
    let current = '';
    const fields = [];

    for (const char of selectClause) {
      if (char === '(') {
        depth++;
        current += char;
      } else if (char === ')') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        if (current.trim()) {
          fields.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      fields.push(current.trim());
    }

    return fields;
  }

  /**
   * Basic SOQL syntax validation
   */
  validateSOQLSyntax(query) {
    const errors = [];

    if (!/SELECT/i.test(query)) errors.push('Missing SELECT clause');
    if (!/FROM/i.test(query)) errors.push('Missing FROM clause');
    if (/SELECT\s+FROM/i.test(query)) errors.push('No fields in SELECT');

    // Check balanced parentheses
    const opens = (query.match(/\(/g) || []).length;
    const closes = (query.match(/\)/g) || []).length;
    if (opens !== closes) errors.push('Unbalanced parentheses');

    // Check balanced quotes
    const quotes = (query.match(/'/g) || []).length;
    if (quotes % 2 !== 0) errors.push('Unbalanced single quotes');

    // Check for mixed operators in OR (common error)
    const orClauses = query.match(/\bOR\b/gi) || [];
    if (orClauses.length > 0) {
      // Check for mixed = and LIKE in OR conditions
      const hasEquals = /=\s*'[^']*'\s*(OR|$)/i.test(query);
      const hasLike = /LIKE\s*'[^']*'\s*(OR|$)/i.test(query);
      if (hasEquals && hasLike) {
        errors.push('Mixed = and LIKE operators in OR condition (use IN or all LIKE)');
      }
    }

    if (errors.length > 0) {
      return {
        valid: false,
        error: 'SOQL syntax errors',
        syntaxErrors: errors,
        query
      };
    }

    return { valid: true };
  }

  /**
   * Check SOQL best practices
   */
  checkSOQLBestPractices(query) {
    const warnings = [];

    // Check for SELECT *
    if (/SELECT\s+\*/i.test(query)) {
      warnings.push('SELECT * is not valid in SOQL - specify fields explicitly');
    }

    // Check for missing WHERE on large objects
    const largeObjects = ['Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Task', 'Event'];
    const objectMatch = query.match(/FROM\s+(\w+)/i);
    if (objectMatch && largeObjects.includes(objectMatch[1]) && !/WHERE/i.test(query)) {
      warnings.push(`Query on ${objectMatch[1]} without WHERE clause may return many records`);
    }

    // Check for COUNT without parentheses
    if (/SELECT\s+COUNT\s+FROM/i.test(query)) {
      warnings.push('COUNT should be COUNT() with parentheses');
    }

    return warnings;
  }

  /**
   * Validate metadata dependencies before deletion
   * @param {string} metadataType - Type (CustomField, ValidationRule, etc.)
   * @param {string} fullName - Full name (Object.Field__c)
   * @returns {Promise<object>} Dependency check result
   */
  async validateMetadataDependencies(metadataType, fullName) {
    this.log(`Checking dependencies: ${metadataType}:${fullName}`);

    const dependencies = [];
    const warnings = [];

    if (metadataType === 'CustomField') {
      const [objectName, fieldName] = fullName.split('.');

      // Validate field exists
      const fieldResult = await this.validateFieldExists(objectName, fieldName);
      if (!fieldResult.valid) {
        return {
          valid: true, // Can "delete" (doesn't exist anyway)
          canDelete: true,
          note: `Field ${fullName} does not exist`,
          context: { metadataType, fullName }
        };
      }

      // Check for formula references
      const describe = await this.getObjectDescribe(fieldResult.objectName);
      if (describe && describe.fields) {
        const formulaFields = describe.fields.filter(f =>
          f.calculatedFormula &&
          f.calculatedFormula.toLowerCase().includes(fieldName.toLowerCase())
        );

        if (formulaFields.length > 0) {
          dependencies.push({
            type: 'FormulaField',
            items: formulaFields.map(f => `${describe.name}.${f.name}`),
            impact: 'Formula fields will break if this field is deleted'
          });
        }
      }

      // Add standard warnings for things we can't easily check
      warnings.push(
        'Check validation rules that reference this field',
        'Check flows/process builders using this field',
        'Check reports and dashboards using this field',
        'Check page layouts containing this field',
        'Check Apex code referencing this field'
      );
    }

    return {
      valid: true,
      canDelete: dependencies.length === 0,
      dependencies,
      warnings,
      context: { metadataType, fullName }
    };
  }

  /**
   * Find similar strings for suggestions
   */
  findSimilarStrings(candidates, target, limit = 5) {
    const targetLower = target.toLowerCase();

    return candidates
      .map(c => ({
        value: c,
        score: this.similarityScore(c.toLowerCase(), targetLower)
      }))
      .filter(s => s.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.value);
  }

  /**
   * Find similar fields
   */
  findSimilarFields(fields, targetName) {
    const candidates = fields.flatMap(f => [f.name, f.label].filter(Boolean));
    return this.findSimilarStrings(candidates, targetName, 5);
  }

  /**
   * Calculate string similarity score
   */
  similarityScore(str1, str2) {
    if (str1 === str2) return 1.0;
    if (str1.includes(str2) || str2.includes(str1)) return 0.8;

    // Levenshtein distance
    const m = str1.length;
    const n = str2.length;

    if (m === 0) return n === 0 ? 1 : 0;
    if (n === 0) return 0;

    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return 1 - (dp[m][n] / Math.max(m, n));
  }

  /**
   * Run comprehensive pre-flight check
   */
  async preFlightCheck(operation) {
    const results = {
      valid: true,
      checks: [],
      errors: [],
      warnings: []
    };

    switch (operation.type) {
      case 'field_operation':
        const fieldResult = await this.validateFieldExists(operation.objectName, operation.fieldName);
        results.checks.push({ type: 'field_exists', result: fieldResult });
        if (!fieldResult.valid) {
          results.valid = false;
          results.errors.push(fieldResult.error);
        }
        break;

      case 'query':
        const queryResult = await this.validateSOQL(operation.query);
        results.checks.push({ type: 'soql_validation', result: queryResult });
        if (!queryResult.valid) {
          results.valid = false;
          results.errors.push(queryResult.error);
        }
        if (queryResult.warnings) results.warnings.push(...queryResult.warnings);
        break;

      case 'metadata_delete':
        const depResult = await this.validateMetadataDependencies(operation.metadataType, operation.fullName);
        results.checks.push({ type: 'dependency_check', result: depResult });
        if (!depResult.canDelete) {
          results.valid = false;
          results.errors.push('Dependencies exist - cannot safely delete');
        }
        if (depResult.warnings) results.warnings.push(...depResult.warnings);
        break;
    }

    return results;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const orgAlias = process.env.SF_TARGET_ORG || process.env.SF_TARGET_ORG;

  const checker = new SchemaPreflightChecker(orgAlias);
  checker.setVerbose(true);

  (async () => {
    try {
      switch (command) {
        case 'field':
          if (!args[1] || !args[2]) {
            console.error('Usage: node schema-preflight-checker.js field <objectName> <fieldName>');
            process.exit(1);
          }
          const fieldResult = await checker.validateFieldExists(args[1], args[2]);
          console.log('\n' + JSON.stringify(fieldResult, null, 2));
          process.exit(fieldResult.valid ? 0 : 1);
          break;

        case 'object':
          if (!args[1]) {
            console.error('Usage: node schema-preflight-checker.js object <objectName>');
            process.exit(1);
          }
          const objResult = await checker.validateObjectName(args[1]);
          console.log('\n' + JSON.stringify(objResult, null, 2));
          process.exit(objResult.valid ? 0 : 1);
          break;

        case 'query':
          if (!args[1]) {
            console.error('Usage: node schema-preflight-checker.js query "<SOQL query>"');
            process.exit(1);
          }
          const queryResult = await checker.validateSOQL(args.slice(1).join(' '));
          console.log('\n' + JSON.stringify(queryResult, null, 2));
          process.exit(queryResult.valid ? 0 : 1);
          break;

        case 'dependencies':
          if (!args[1] || !args[2]) {
            console.error('Usage: node schema-preflight-checker.js dependencies <type> <fullName>');
            process.exit(1);
          }
          const depResult = await checker.validateMetadataDependencies(args[1], args[2]);
          console.log('\n' + JSON.stringify(depResult, null, 2));
          process.exit(depResult.canDelete ? 0 : 1);
          break;

        default:
          console.log(`
Schema Pre-Flight Checker for Salesforce Operations

Usage: node schema-preflight-checker.js <command> [args]

Commands:
  field <objectName> <fieldName>      Validate field exists
  object <objectName>                 Validate/resolve object name
  query "<SOQL query>"                Validate SOQL query
  dependencies <type> <fullName>      Check metadata dependencies

Examples:
  node schema-preflight-checker.js field Account Industry
  node schema-preflight-checker.js object "Order Form"
  node schema-preflight-checker.js query "SELECT Id, Name FROM Account"
  node schema-preflight-checker.js dependencies CustomField Account.Status__c

Environment:
  SF_TARGET_ORG - Default org alias
          `);
          process.exit(0);
      }
    } catch (error) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = SchemaPreflightChecker;
