#!/usr/bin/env node

/**
 * Validation Rule Validator
 *
 * Pre-deployment validation checker to catch errors before they reach Salesforce.
 *
 * Features:
 * - Comprehensive pre-deployment validation (11 checks)
 * - Formula syntax validation
 * - Anti-pattern detection with severity levels
 * - Object and field existence verification
 * - Governor limit checks
 * - Integration with complexity calculator
 * - Detailed validation reports
 * - Fix suggestions for common issues
 *
 * Validation Checks:
 * 1. Syntax validation (well-formed formula)
 * 2. Required fields (object, name, formula, errorMessage)
 * 3. Anti-pattern detection (ISBLANK on picklists, deep nesting, etc.)
 * 4. Complexity assessment (score, recommendations)
 * 5. Object existence (target object exists in org)
 * 6. Field existence (all referenced fields exist)
 * 7. Formula length (max 5000 chars)
 * 8. Error message quality (min 10 chars, no generic text)
 * 9. Naming conventions (valid rule name)
 * 10. Governor limits (total rules per object < 500)
 * 11. Conflict detection (duplicate rule names)
 *
 * Usage:
 *   const Validator = require('./validation-rule-validator');
 *   const validator = new Validator('my-org');
 *   const result = await validator.validate(ruleConfig);
 *
 * CLI Usage:
 *   node validation-rule-validator.js --rule rule.json --org my-org
 *   node validation-rule-validator.js --formula "AND(...)" --object Opportunity --org my-org
 *   node validation-rule-validator.js --batch rules.json --org my-org --output report.json
 *
 * @version 1.0.0
 * @see agents/validation-rule-orchestrator.md
 * @see docs/runbooks/validation-rule-management/04-validation-and-best-practices.md
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ValidationRuleValidator {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = {
      strictMode: options.strictMode || false,    // Fail on warnings
      checkOrg: options.checkOrg !== false,       // Verify against org
      verbose: options.verbose || false,          // Detailed output
      ...options
    };

    // Load dependencies
    this.complexityCalculator = require('./validation-rule-complexity-calculator');

    // Cache org metadata
    this.orgMetadataCache = {
      objects: null,
      fields: {}
    };
  }

  /**
   * Validate single validation rule
   *
   * @param {Object} ruleConfig - Rule configuration
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result with issues and fixes
   *
   * @example
   * const result = await validator.validate({
   *   object: 'Opportunity',
   *   name: 'Amount_Required',
   *   formula: 'AND(ISPICKVAL(StageName, "Closed Won"), ISBLANK(Amount))',
   *   errorMessage: 'Amount is required'
   * });
   */
  async validate(ruleConfig, options = {}) {
    const validationResult = {
      valid: true,
      issues: [],
      warnings: [],
      suggestions: [],
      complexity: null,
      antiPatterns: [],
      summary: {}
    };

    this.log('🔍 Starting validation rule validation...');

    // Check 1: Required fields
    this._validateRequiredFields(ruleConfig, validationResult);

    // Check 2: Syntax validation
    this._validateSyntax(ruleConfig, validationResult);

    // Check 3: Anti-pattern detection
    this._detectAntiPatterns(ruleConfig, validationResult);

    // Check 4: Complexity assessment
    this._assessComplexity(ruleConfig, validationResult);

    // Check 5: Formula length
    this._validateFormulaLength(ruleConfig, validationResult);

    // Check 6: Error message quality
    this._validateErrorMessage(ruleConfig, validationResult);

    // Check 7: Naming conventions
    this._validateNamingConventions(ruleConfig, validationResult);

    // Org-specific checks (if enabled)
    if (this.options.checkOrg && this.orgAlias) {
      await this._validateAgainstOrg(ruleConfig, validationResult);
    }

    // Determine overall validity
    validationResult.valid = validationResult.issues.length === 0 &&
      (!this.options.strictMode || validationResult.warnings.length === 0);

    // Generate summary
    validationResult.summary = {
      valid: validationResult.valid,
      issueCount: validationResult.issues.length,
      warningCount: validationResult.warnings.length,
      suggestionCount: validationResult.suggestions.length,
      complexity: validationResult.complexity?.score || 'Unknown',
      complexityCategory: validationResult.complexity?.category || 'Unknown'
    };

    this.log(validationResult.valid ? '✅ Validation passed' : '❌ Validation failed');

    return validationResult;
  }

  /**
   * Validate batch of rules
   *
   * @param {Array} ruleConfigs - Array of rule configurations
   * @returns {Promise<Object>} Batch validation results
   */
  async validateBatch(ruleConfigs) {
    this.log(`📋 Validating ${ruleConfigs.length} rules...`);

    const results = await Promise.all(
      ruleConfigs.map((config, idx) =>
        this.validate(config)
          .then(result => ({ index: idx, rule: `${config.object}.${config.name}`, ...result }))
          .catch(error => ({
            index: idx,
            rule: `${config.object}.${config.name}`,
            valid: false,
            issues: [{ type: 'CRITICAL', message: error.message }]
          }))
      )
    );

    const summary = {
      total: results.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length,
      totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
      totalWarnings: results.reduce((sum, r) => sum + r.warnings.length, 0)
    };

    return {
      summary,
      results
    };
  }

  /**
   * Check 1: Validate required fields
   *
   * @private
   */
  _validateRequiredFields(config, result) {
    const requiredFields = ['object', 'name', 'formula', 'errorMessage'];
    const missingFields = requiredFields.filter(field => !config[field]);

    if (missingFields.length > 0) {
      result.issues.push({
        type: 'CRITICAL',
        check: 'required-fields',
        message: `Missing required fields: ${missingFields.join(', ')}`,
        fix: `Provide all required fields: ${requiredFields.join(', ')}`
      });
    }
  }

  /**
   * Check 2: Validate formula syntax
   *
   * @private
   */
  _validateSyntax(config, result) {
    if (!config.formula) return;

    const formula = config.formula;

    // Check balanced parentheses
    let parenCount = 0;
    for (const char of formula) {
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      if (parenCount < 0) {
        result.issues.push({
          type: 'CRITICAL',
          check: 'syntax',
          message: 'Unbalanced parentheses - too many closing parentheses',
          fix: 'Ensure every opening parenthesis has a matching closing parenthesis'
        });
        return;
      }
    }

    if (parenCount !== 0) {
      result.issues.push({
        type: 'CRITICAL',
        check: 'syntax',
        message: `Unbalanced parentheses - ${parenCount} unclosed opening parentheses`,
        fix: 'Ensure every opening parenthesis has a matching closing parenthesis'
      });
    }

    // Check for common syntax errors
    const syntaxErrors = [
      { pattern: /,,/g, message: 'Double comma detected', fix: 'Remove extra comma' },
      { pattern: /\(\s*,/g, message: 'Comma after opening parenthesis', fix: 'Remove comma' },
      { pattern: /,\s*\)/g, message: 'Comma before closing parenthesis', fix: 'Remove comma' },
      { pattern: /\)\(/g, message: 'Missing operator between expressions', fix: 'Add AND or OR between expressions' }
    ];

    syntaxErrors.forEach(({ pattern, message, fix }) => {
      if (pattern.test(formula)) {
        result.issues.push({
          type: 'ERROR',
          check: 'syntax',
          message,
          fix
        });
      }
    });

    // Check for valid function names
    const functions = formula.match(/\b[A-Z_]+\(/g);
    const validFunctions = [
      'AND', 'OR', 'NOT', 'IF', 'CASE',
      'ISBLANK', 'ISNULL', 'ISCHANGED', 'ISNEW', 'PRIORVALUE',
      'ISPICKVAL', 'TEXT', 'VALUE', 'LEN', 'CONTAINS',
      'TODAY', 'NOW', 'DATE', 'DATEVALUE', 'DATETIMEVALUE',
      'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE',
      'ABS', 'CEILING', 'FLOOR', 'MAX', 'MIN', 'MOD', 'ROUND'
    ];

    if (functions) {
      functions.forEach(func => {
        const funcName = func.replace('(', '');
        if (!validFunctions.includes(funcName)) {
          result.warnings.push({
            type: 'WARNING',
            check: 'syntax',
            message: `Unrecognized function: ${funcName}`,
            suggestion: `Verify function name is correct. Valid functions: ${validFunctions.join(', ')}`
          });
        }
      });
    }
  }

  /**
   * Check 3: Detect anti-patterns
   *
   * @private
   */
  _detectAntiPatterns(config, result) {
    if (!config.formula) return;

    const antiPatterns = this.complexityCalculator.detectAntiPatterns(config.formula);

    antiPatterns.forEach(ap => {
      const issue = {
        type: ap.severity,
        check: 'anti-patterns',
        message: `${ap.pattern}: ${ap.description}`,
        fix: ap.fix
      };

      if (ap.severity === 'CRITICAL' || ap.severity === 'ERROR') {
        result.issues.push(issue);
      } else {
        result.warnings.push(issue);
      }
    });

    result.antiPatterns = antiPatterns;
  }

  /**
   * Check 4: Assess complexity
   *
   * @private
   */
  _assessComplexity(config, result) {
    if (!config.formula) return;

    const complexity = this.complexityCalculator.calculateFromFormula(config.formula);
    result.complexity = complexity;

    // Complexity recommendations
    if (complexity.score > 80) {
      result.warnings.push({
        type: 'WARNING',
        check: 'complexity',
        message: `Very high complexity (${complexity.score}). Consider segmentation.`,
        suggestion: 'Use validation-rule-segmentation-specialist to break into smaller rules'
      });
    } else if (complexity.score > 60) {
      result.suggestions.push({
        type: 'SUGGESTION',
        check: 'complexity',
        message: `High complexity (${complexity.score}). May benefit from segmentation.`,
        suggestion: 'Consider breaking into 2-3 simpler rules for maintainability'
      });
    }

    // Nesting depth warning
    if (complexity.characteristics.nestingDepth > 4) {
      result.warnings.push({
        type: 'WARNING',
        check: 'complexity',
        message: `Deep nesting detected (${complexity.characteristics.nestingDepth} levels)`,
        suggestion: 'Refactor to reduce nesting depth below 4 levels'
      });
    }
  }

  /**
   * Check 5: Validate formula length
   *
   * @private
   */
  _validateFormulaLength(config, result) {
    if (!config.formula) return;

    const maxLength = 5000; // Salesforce limit
    const formula = config.formula;

    if (formula.length > maxLength) {
      result.issues.push({
        type: 'CRITICAL',
        check: 'formula-length',
        message: `Formula exceeds maximum length of ${maxLength} characters (current: ${formula.length})`,
        fix: 'Segment formula into multiple validation rules'
      });
    } else if (formula.length > maxLength * 0.8) {
      result.warnings.push({
        type: 'WARNING',
        check: 'formula-length',
        message: `Formula approaching maximum length (${formula.length}/${maxLength})`,
        suggestion: 'Consider segmentation to stay well under limit'
      });
    }
  }

  /**
   * Check 6: Validate error message quality
   *
   * @private
   */
  _validateErrorMessage(config, result) {
    if (!config.errorMessage) return;

    const errorMessage = config.errorMessage;

    // Minimum length check
    if (errorMessage.length < 10) {
      result.issues.push({
        type: 'ERROR',
        check: 'error-message',
        message: 'Error message too short (min 10 characters)',
        fix: 'Provide a descriptive error message explaining what is wrong and how to fix it'
      });
    }

    // Generic message check
    const genericMessages = ['Error', 'Invalid', 'Required', 'Missing'];
    if (genericMessages.some(generic => errorMessage === generic)) {
      result.warnings.push({
        type: 'WARNING',
        check: 'error-message',
        message: 'Error message is too generic',
        suggestion: 'Provide specific context: what field, what condition, how to fix'
      });
    }

    // Best practice: Include field name
    if (config.formula && config.formula.includes('ISBLANK') && !errorMessage.toLowerCase().includes('required')) {
      result.suggestions.push({
        type: 'SUGGESTION',
        check: 'error-message',
        message: 'Consider including "required" in error message for required field validation'
      });
    }

    // Best practice: Action guidance
    const actionWords = ['please', 'ensure', 'contact', 'update', 'provide', 'enter'];
    if (!actionWords.some(word => errorMessage.toLowerCase().includes(word))) {
      result.suggestions.push({
        type: 'SUGGESTION',
        check: 'error-message',
        message: 'Consider including action guidance in error message (e.g., "Please enter...")'
      });
    }
  }

  /**
   * Check 7: Validate naming conventions
   *
   * @private
   */
  _validateNamingConventions(config, result) {
    if (!config.name) return;

    const name = config.name;

    // Check valid characters
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      result.issues.push({
        type: 'ERROR',
        check: 'naming',
        message: 'Rule name must start with letter and contain only letters, numbers, and underscores',
        fix: 'Use only A-Z, a-z, 0-9, and _ characters'
      });
    }

    // Check length
    if (name.length > 80) {
      result.issues.push({
        type: 'ERROR',
        check: 'naming',
        message: 'Rule name exceeds 80 character limit',
        fix: 'Shorten rule name to 80 characters or less'
      });
    }

    // Best practice: Descriptive names
    if (name.length < 5) {
      result.suggestions.push({
        type: 'SUGGESTION',
        check: 'naming',
        message: 'Rule name is very short',
        suggestion: 'Use descriptive names that explain the validation (e.g., Amount_Required_For_Closed_Won)'
      });
    }

    // Best practice: Naming convention
    if (!/^[A-Z]/.test(name)) {
      result.suggestions.push({
        type: 'SUGGESTION',
        check: 'naming',
        message: 'Rule name should start with capital letter (PascalCase or Snake_Case)',
        suggestion: `Consider: ${name.charAt(0).toUpperCase() + name.slice(1)}`
      });
    }
  }

  /**
   * Check 8-11: Validate against Salesforce org
   *
   * @private
   */
  async _validateAgainstOrg(config, result) {
    if (!config.object) return;

    this.log('🔍 Checking against Salesforce org...');

    // Check 8: Object existence
    await this._validateObjectExists(config, result);

    // Check 9: Field existence
    await this._validateFieldsExist(config, result);

    // Check 10: Governor limits
    await this._checkGovernorLimits(config, result);

    // Check 11: Conflict detection
    await this._checkConflicts(config, result);
  }

  /**
   * Check 8: Validate object exists in org
   *
   * @private
   */
  async _validateObjectExists(config, result) {
    try {
      if (!this.orgMetadataCache.objects) {
        this.log('  Fetching org objects...');
        const objectsQuery = 'SELECT QualifiedApiName FROM EntityDefinition';
        const objectsResult = execSync(
          `sf data query --query "${objectsQuery}" --target-org ${this.orgAlias} --json`,
          { encoding: 'utf-8', timeout: 30000 }
        );

        const objectsData = JSON.parse(objectsResult);
        this.orgMetadataCache.objects = objectsData.result.records.map(r => r.QualifiedApiName);
      }

      if (!this.orgMetadataCache.objects.includes(config.object)) {
        result.issues.push({
          type: 'CRITICAL',
          check: 'object-existence',
          message: `Object '${config.object}' does not exist in org '${this.orgAlias}'`,
          fix: 'Verify object API name or create the object first'
        });
      }
    } catch (error) {
      result.warnings.push({
        type: 'WARNING',
        check: 'object-existence',
        message: `Could not verify object existence: ${error.message}`
      });
    }
  }

  /**
   * Check 9: Validate all referenced fields exist
   *
   * @private
   */
  async _validateFieldsExist(config, result) {
    if (!config.formula) return;

    try {
      // Extract field references from formula
      const fieldReferences = this._extractFieldReferences(config.formula);

      if (fieldReferences.length === 0) return;

      // Get object fields (with caching)
      if (!this.orgMetadataCache.fields[config.object]) {
        this.log(`  Fetching fields for ${config.object}...`);
        const fieldsResult = execSync(
          `sf sobject describe ${config.object} --target-org ${this.orgAlias} --json`,
          { encoding: 'utf-8', timeout: 30000 }
        );

        const fieldsData = JSON.parse(fieldsResult);
        this.orgMetadataCache.fields[config.object] = fieldsData.result.fields.map(f => f.name);
      }

      const objectFields = this.orgMetadataCache.fields[config.object];

      // Check each field reference
      fieldReferences.forEach(fieldRef => {
        const fieldPath = fieldRef.split('.');
        const fieldName = fieldPath[fieldPath.length - 1];

        if (!objectFields.includes(fieldName)) {
          result.issues.push({
            type: 'ERROR',
            check: 'field-existence',
            message: `Field '${fieldRef}' not found on object '${config.object}'`,
            fix: 'Verify field API name or create the field first'
          });
        }
      });
    } catch (error) {
      result.warnings.push({
        type: 'WARNING',
        check: 'field-existence',
        message: `Could not verify field existence: ${error.message}`
      });
    }
  }

  /**
   * Check 10: Check governor limits
   *
   * @private
   */
  async _checkGovernorLimits(config, result) {
    try {
      // Query existing validation rules for this object
      const countQuery = `SELECT COUNT() FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${config.object}'`;
      const countResult = execSync(
        `sf data query --query "${countQuery}" --use-tooling-api --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8', timeout: 30000 }
      );

      const countData = JSON.parse(countResult);
      const currentCount = countData.result.totalSize || 0;

      const maxRules = 500; // Salesforce limit

      if (currentCount >= maxRules) {
        result.issues.push({
          type: 'CRITICAL',
          check: 'governor-limits',
          message: `Object '${config.object}' has reached maximum validation rules (${currentCount}/${maxRules})`,
          fix: 'Consolidate existing rules or delete unused rules'
        });
      } else if (currentCount >= maxRules * 0.9) {
        result.warnings.push({
          type: 'WARNING',
          check: 'governor-limits',
          message: `Object '${config.object}' approaching validation rule limit (${currentCount}/${maxRules})`,
          suggestion: 'Consider consolidating rules to stay under limit'
        });
      }
    } catch (error) {
      result.warnings.push({
        type: 'WARNING',
        check: 'governor-limits',
        message: `Could not verify governor limits: ${error.message}`
      });
    }
  }

  /**
   * Check 11: Check for conflicts (duplicate rule names)
   *
   * @private
   */
  async _checkConflicts(config, result) {
    try {
      const conflictQuery = `SELECT ValidationName FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${config.object}' AND ValidationName = '${config.name}'`;
      const conflictResult = execSync(
        `sf data query --query "${conflictQuery}" --use-tooling-api --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8', timeout: 30000 }
      );

      const conflictData = JSON.parse(conflictResult);

      if (conflictData.result.totalSize > 0) {
        result.issues.push({
          type: 'ERROR',
          check: 'conflicts',
          message: `Validation rule '${config.name}' already exists on object '${config.object}'`,
          fix: 'Use a different rule name or update the existing rule'
        });
      }
    } catch (error) {
      result.warnings.push({
        type: 'WARNING',
        check: 'conflicts',
        message: `Could not check for conflicts: ${error.message}`
      });
    }
  }

  /**
   * Extract field references from formula
   *
   * @private
   */
  _extractFieldReferences(formula) {
    // Match field references (word characters with optional dots for relationships)
    const fieldPattern = /\b([A-Z][A-Za-z0-9_]*(?:\.[A-Z][A-Za-z0-9_]*)*)\b/g;
    const matches = formula.matchAll(fieldPattern);

    const fieldRefs = new Set();
    const excludedKeywords = [
      'AND', 'OR', 'NOT', 'IF', 'CASE', 'TRUE', 'FALSE',
      'ISBLANK', 'ISNULL', 'ISPICKVAL', 'TEXT', 'VALUE',
      'TODAY', 'NOW', 'DATE', 'YEAR', 'MONTH', 'DAY'
    ];

    for (const match of matches) {
      const field = match[1];
      if (!excludedKeywords.includes(field)) {
        fieldRefs.add(field);
      }
    }

    return Array.from(fieldRefs);
  }

  /**
   * Log message if verbose mode enabled
   *
   * @private
   */
  log(message) {
    if (this.options.verbose) {
      console.log(message);
    }
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Validation Rule Validator v1.0.0

Usage:
  node validation-rule-validator.js [options]

Options:
  --rule <path>         Path to JSON rule configuration file
  --batch <path>        Path to JSON array of rule configurations
  --formula <formula>   Validate formula directly
  --object <object>     Object API name (required with --formula)
  --name <name>         Rule name (required with --formula)
  --error <message>     Error message (required with --formula)
  --org <alias>         Salesforce org alias (required for org checks)
  --strict              Fail on warnings (default: false)
  --no-org-check        Skip org-specific validation
  --verbose             Enable detailed logging
  --output <path>       Save validation report to file
  --help, -h            Show this help message

Examples:
  # Validate from file
  node validation-rule-validator.js --rule rule.json --org my-org

  # Validate formula directly
  node validation-rule-validator.js \\
    --formula "AND(ISPICKVAL(StageName, \\"Closed Won\\"), ISBLANK(Amount))" \\
    --object Opportunity --name Amount_Required \\
    --error "Amount is required" --org my-org

  # Validate batch
  node validation-rule-validator.js --batch rules.json --org my-org --output report.json

  # Quick check without org validation
  node validation-rule-validator.js --rule rule.json --no-org-check

Rule JSON Format:
  {
    "object": "Opportunity",
    "name": "Amount_Required",
    "formula": "AND(ISPICKVAL(StageName, \\"Closed Won\\"), ISBLANK(Amount))",
    "errorMessage": "Amount is required for Closed Won opportunities"
  }
`);
    process.exit(0);
  }

  // Parse options
  const options = {
    checkOrg: true,
    verbose: false,
    strictMode: false
  };
  let rulePath, batchPath, outputPath, orgAlias;
  let directFormula, directObject, directName, directError;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--rule' && i + 1 < args.length) {
      rulePath = args[++i];
    } else if (arg === '--batch' && i + 1 < args.length) {
      batchPath = args[++i];
    } else if (arg === '--formula' && i + 1 < args.length) {
      directFormula = args[++i];
    } else if (arg === '--object' && i + 1 < args.length) {
      directObject = args[++i];
    } else if (arg === '--name' && i + 1 < args.length) {
      directName = args[++i];
    } else if (arg === '--error' && i + 1 < args.length) {
      directError = args[++i];
    } else if (arg === '--org' && i + 1 < args.length) {
      orgAlias = args[++i];
    } else if (arg === '--output' && i + 1 < args.length) {
      outputPath = args[++i];
    } else if (arg === '--strict') {
      options.strictMode = true;
    } else if (arg === '--no-org-check') {
      options.checkOrg = false;
    } else if (arg === '--verbose') {
      options.verbose = true;
    }
  }

  // Determine input method
  let ruleConfig, ruleConfigs;

  if (rulePath) {
    if (!fs.existsSync(rulePath)) {
      console.error(`Error: Rule file not found: ${rulePath}`);
      process.exit(1);
    }
    ruleConfig = JSON.parse(fs.readFileSync(rulePath, 'utf-8'));
  } else if (batchPath) {
    if (!fs.existsSync(batchPath)) {
      console.error(`Error: Batch file not found: ${batchPath}`);
      process.exit(1);
    }
    ruleConfigs = JSON.parse(fs.readFileSync(batchPath, 'utf-8'));
  } else if (directFormula) {
    if (!directObject || !directName || !directError) {
      console.error('Error: --object, --name, and --error are required with --formula');
      process.exit(1);
    }
    ruleConfig = {
      object: directObject,
      name: directName,
      formula: directFormula,
      errorMessage: directError
    };
  } else {
    console.error('Error: Must provide --rule, --batch, or --formula');
    process.exit(1);
  }

  // Execute validation
  const validator = new ValidationRuleValidator(orgAlias, options);

  (async () => {
    try {
      let result;

      if (ruleConfigs) {
        // Batch validation
        result = await validator.validateBatch(ruleConfigs);
        console.log('\n' + '='.repeat(80));
        console.log('BATCH VALIDATION COMPLETE');
        console.log('='.repeat(80));
        console.log(JSON.stringify(result.summary, null, 2));

        const invalidRules = result.results.filter(r => !r.valid);
        if (invalidRules.length > 0) {
          console.log(`\n❌ ${invalidRules.length} invalid rules:`);
          invalidRules.forEach(r => {
            console.log(`\n  Rule: ${r.rule}`);
            r.issues.forEach(issue => {
              console.log(`    - ${issue.type}: ${issue.message}`);
            });
          });
        }
      } else {
        // Single validation
        result = await validator.validate(ruleConfig);

        console.log('\n' + '='.repeat(80));
        console.log('VALIDATION RESULT');
        console.log('='.repeat(80));
        console.log(`Rule: ${ruleConfig.object}.${ruleConfig.name}`);
        console.log(`Status: ${result.valid ? '✅ VALID' : '❌ INVALID'}`);
        console.log(`\nSummary: ${JSON.stringify(result.summary, null, 2)}`);

        if (result.issues.length > 0) {
          console.log(`\n❌ Issues (${result.issues.length}):`);
          result.issues.forEach(issue => {
            console.log(`  - ${issue.type}: ${issue.message}`);
            if (issue.fix) console.log(`    Fix: ${issue.fix}`);
          });
        }

        if (result.warnings.length > 0) {
          console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
          result.warnings.forEach(warning => {
            console.log(`  - ${warning.message}`);
            if (warning.suggestion) console.log(`    Suggestion: ${warning.suggestion}`);
          });
        }

        if (result.suggestions.length > 0) {
          console.log(`\n💡 Suggestions (${result.suggestions.length}):`);
          result.suggestions.forEach(suggestion => {
            console.log(`  - ${suggestion.message}`);
          });
        }
      }

      // Save output if requested
      if (outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`\n📝 Validation report saved to: ${outputPath}`);
      }

      process.exit(result.valid || (result.summary && result.summary.valid) ? 0 : 1);
    } catch (error) {
      console.error(`\n❌ Validation failed: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = ValidationRuleValidator;
