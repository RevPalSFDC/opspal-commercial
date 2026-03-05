#!/usr/bin/env node

/**
 * ValidationEngine - Solution and Deployment Validation
 *
 * Provides comprehensive validation for solution manifests, templates,
 * environment profiles, and pre-deployment checks.
 *
 * Features:
 * - JSON Schema validation for solution manifests
 * - Template syntax validation
 * - Pre-deployment checks (field exists, user accessible, etc.)
 * - Environment profile validation
 * - Parameter validation against schema
 *
 * @module solution-template-system/core/ValidationEngine
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Schema paths
const SCHEMAS_DIR = path.resolve(__dirname, '../../../solutions/schemas');

/**
 * Validation result structure
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {Array<Object>} errors - Error details
 * @property {Array<Object>} warnings - Warning details
 * @property {Object} [metadata] - Additional validation metadata
 */

/**
 * Validation Engine
 */
class ValidationEngine {
  /**
   * Create a new ValidationEngine instance
   * @param {Object} options - Engine options
   * @param {boolean} [options.strictMode=false] - Treat warnings as errors
   * @param {boolean} [options.verbose=false] - Log detailed validation steps
   */
  constructor(options = {}) {
    this.strictMode = options.strictMode || false;
    this.verbose = options.verbose || false;

    // Load schemas
    this.schemas = this.loadSchemas();

    // Custom validators registry
    this.customValidators = new Map();

    // Register built-in pre-deploy check validators
    this.registerPreDeployValidators();
  }

  /**
   * Load JSON schemas from the schemas directory
   * @returns {Object} Map of schema name -> schema object
   */
  loadSchemas() {
    const schemas = {};

    if (!fs.existsSync(SCHEMAS_DIR)) {
      console.warn('Schemas directory not found:', SCHEMAS_DIR);
      return schemas;
    }

    for (const file of fs.readdirSync(SCHEMAS_DIR)) {
      if (file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(SCHEMAS_DIR, file), 'utf-8');
          const schema = JSON.parse(content);
          schemas[file.replace('.json', '')] = schema;
        } catch (e) {
          console.error(`Failed to load schema ${file}:`, e.message);
        }
      }
    }

    return schemas;
  }

  /**
   * Validate a solution manifest
   * @param {Object|string} solution - Solution object or path to solution.json
   * @returns {ValidationResult} Validation result
   */
  validateSolution(solution) {
    const errors = [];
    const warnings = [];

    // Load solution if path provided
    if (typeof solution === 'string') {
      try {
        solution = JSON.parse(fs.readFileSync(solution, 'utf-8'));
      } catch (e) {
        return {
          valid: false,
          errors: [{ type: 'parse_error', message: `Failed to parse solution: ${e.message}` }],
          warnings: []
        };
      }
    }

    // Required fields
    const requiredFields = ['name', 'version', 'description', 'components'];
    for (const field of requiredFields) {
      if (!solution[field]) {
        errors.push({
          type: 'required_field',
          field,
          message: `Missing required field: ${field}`
        });
      }
    }

    // Validate name format
    if (solution.name && !/^[a-z][a-z0-9-]*$/.test(solution.name)) {
      errors.push({
        type: 'invalid_format',
        field: 'name',
        message: 'Name must be lowercase with hyphens, starting with a letter'
      });
    }

    // Validate version format
    if (solution.version && !/^\d+\.\d+\.\d+$/.test(solution.version)) {
      errors.push({
        type: 'invalid_format',
        field: 'version',
        message: 'Version must be semantic (MAJOR.MINOR.PATCH)'
      });
    }

    // Validate components
    if (Array.isArray(solution.components)) {
      const componentIds = new Set();

      for (let i = 0; i < solution.components.length; i++) {
        const component = solution.components[i];
        const prefix = `components[${i}]`;

        // Required component fields
        if (!component.id) {
          errors.push({ type: 'required_field', field: `${prefix}.id`, message: 'Component missing id' });
        }
        if (!component.type) {
          errors.push({ type: 'required_field', field: `${prefix}.type`, message: 'Component missing type' });
        }
        if (!component.template) {
          errors.push({ type: 'required_field', field: `${prefix}.template`, message: 'Component missing template' });
        }

        // Check for duplicate IDs
        if (component.id) {
          if (componentIds.has(component.id)) {
            errors.push({
              type: 'duplicate_id',
              field: `${prefix}.id`,
              message: `Duplicate component ID: ${component.id}`
            });
          }
          componentIds.add(component.id);
        }

        // Validate dependencies reference existing components
        if (component.dependencies) {
          for (const dep of component.dependencies) {
            if (!solution.components.find(c => c.id === dep)) {
              errors.push({
                type: 'invalid_reference',
                field: `${prefix}.dependencies`,
                message: `Dependency references unknown component: ${dep}`
              });
            }
          }
        }

        // Validate component type format
        if (component.type && !component.type.includes(':')) {
          warnings.push({
            type: 'format_warning',
            field: `${prefix}.type`,
            message: `Component type should use platform:metadataType format (e.g., salesforce:flow)`
          });
        }
      }

      // Check for circular dependencies
      const circularDeps = this.detectCircularDependencies(solution.components);
      if (circularDeps.length > 0) {
        errors.push({
          type: 'circular_dependency',
          message: `Circular dependencies detected: ${circularDeps.join(' -> ')}`
        });
      }
    }

    // Validate parameters
    if (solution.parameters) {
      for (const [paramName, paramConfig] of Object.entries(solution.parameters)) {
        if (!paramConfig.type) {
          errors.push({
            type: 'required_field',
            field: `parameters.${paramName}.type`,
            message: 'Parameter missing type'
          });
        }
        if (!paramConfig.description) {
          warnings.push({
            type: 'missing_description',
            field: `parameters.${paramName}.description`,
            message: 'Parameter should have a description'
          });
        }
      }
    }

    // Validate preDeployChecks
    if (solution.preDeployChecks) {
      for (let i = 0; i < solution.preDeployChecks.length; i++) {
        const check = solution.preDeployChecks[i];
        if (!check.type) {
          errors.push({
            type: 'required_field',
            field: `preDeployChecks[${i}].type`,
            message: 'Pre-deploy check missing type'
          });
        }
        if (!check.errorMessage) {
          warnings.push({
            type: 'missing_error_message',
            field: `preDeployChecks[${i}].errorMessage`,
            message: 'Pre-deploy check should have an error message'
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        componentCount: solution.components?.length || 0,
        parameterCount: Object.keys(solution.parameters || {}).length,
        preDeployCheckCount: solution.preDeployChecks?.length || 0
      }
    };
  }

  /**
   * Detect circular dependencies in components
   * @param {Array<Object>} components - Component list
   * @returns {Array<string>} Circular dependency chain or empty array
   */
  detectCircularDependencies(components) {
    const graph = new Map();

    // Build adjacency list
    for (const component of components) {
      graph.set(component.id, component.dependencies || []);
    }

    // DFS to detect cycles
    const visited = new Set();
    const recursionStack = new Set();
    const cyclePath = [];

    const hasCycle = (nodeId, path = []) => {
      if (recursionStack.has(nodeId)) {
        // Found cycle - return path from cycle start
        const cycleStart = path.indexOf(nodeId);
        return path.slice(cycleStart).concat(nodeId);
      }

      if (visited.has(nodeId)) {
        return [];
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const dependencies = graph.get(nodeId) || [];
      for (const dep of dependencies) {
        const cycle = hasCycle(dep, [...path]);
        if (cycle.length > 0) {
          return cycle;
        }
      }

      recursionStack.delete(nodeId);
      return [];
    };

    for (const component of components) {
      if (!visited.has(component.id)) {
        const cycle = hasCycle(component.id);
        if (cycle.length > 0) {
          return cycle;
        }
      }
    }

    return [];
  }

  /**
   * Validate an environment profile
   * @param {Object|string} profile - Profile object or path
   * @returns {ValidationResult} Validation result
   */
  validateEnvironmentProfile(profile) {
    const errors = [];
    const warnings = [];

    // Load profile if path provided
    if (typeof profile === 'string') {
      try {
        profile = JSON.parse(fs.readFileSync(profile, 'utf-8'));
      } catch (e) {
        return {
          valid: false,
          errors: [{ type: 'parse_error', message: `Failed to parse profile: ${e.message}` }],
          warnings: []
        };
      }
    }

    // Required fields
    if (!profile.name) {
      errors.push({
        type: 'required_field',
        field: 'name',
        message: 'Profile missing required "name" field'
      });
    }

    // Validate name format
    if (profile.name && !/^[a-z][a-z0-9-]*$/.test(profile.name)) {
      errors.push({
        type: 'invalid_format',
        field: 'name',
        message: 'Profile name must be lowercase with hyphens'
      });
    }

    // Check for secrets in credentials
    if (profile.credentials) {
      const sensitiveKeys = ['token', 'secret', 'password', 'key', 'apikey', 'accesstoken'];

      const checkForSecrets = (obj, path) => {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = `${path}.${key}`;

          if (typeof value === 'object' && value !== null) {
            checkForSecrets(value, currentPath);
          } else if (typeof value === 'string') {
            const keyLower = key.toLowerCase();
            if (
              sensitiveKeys.some(sk => keyLower.includes(sk)) &&
              !value.startsWith('{{env.') &&
              !value.startsWith('${')
            ) {
              warnings.push({
                type: 'potential_secret',
                field: currentPath,
                message: `Potential secret detected - use environment variable reference instead`
              });
            }
          }
        }
      };

      checkForSecrets(profile.credentials, 'credentials');
    }

    // Validate extends path if present
    if (profile.extends && typeof profile.extends === 'string') {
      // Just validate format - actual resolution happens in EnvironmentManager
      if (!profile.extends.endsWith('.json')) {
        warnings.push({
          type: 'format_warning',
          field: 'extends',
          message: 'extends should reference a .json file'
        });
      }
    }

    // Validate type
    const validTypes = ['development', 'sandbox', 'staging', 'uat', 'production', 'client'];
    if (profile.type && !validTypes.includes(profile.type)) {
      warnings.push({
        type: 'unknown_type',
        field: 'type',
        message: `Unknown environment type: ${profile.type}. Valid types: ${validTypes.join(', ')}`
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate template syntax
   * @param {string} template - Template content
   * @returns {ValidationResult} Validation result
   */
  validateTemplate(template) {
    const errors = [];
    const warnings = [];

    // Check for balanced tags
    const tagPairs = [
      { open: /\{\{#if\s/g, close: /\{\{\/if\}\}/g, name: 'if' },
      { open: /\{\{#unless\s/g, close: /\{\{\/unless\}\}/g, name: 'unless' },
      { open: /\{\{#each\s/g, close: /\{\{\/each\}\}/g, name: 'each' }
    ];

    for (const pair of tagPairs) {
      const openCount = (template.match(pair.open) || []).length;
      const closeCount = (template.match(pair.close) || []).length;

      if (openCount !== closeCount) {
        errors.push({
          type: 'unbalanced_tags',
          tag: pair.name,
          message: `Unbalanced {{#${pair.name}}} tags: ${openCount} open, ${closeCount} close`
        });
      }
    }

    // Check for potentially unresolved variables
    const unresolvedVars = template.match(/\{\{[^}]+\}\}/g) || [];
    const potentiallyDynamic = unresolvedVars.filter(v => {
      // Skip known patterns that are likely intentional
      const content = v.slice(2, -2).trim();
      return !content.startsWith('#') &&
        !content.startsWith('/') &&
        !content.startsWith('>') &&
        !content.startsWith('@') &&
        !content.startsWith('sf:') &&
        !content.startsWith('hs:') &&
        !content.startsWith('n8n:');
    });

    // This is informational, not an error
    if (potentiallyDynamic.length > 10) {
      warnings.push({
        type: 'many_variables',
        count: potentiallyDynamic.length,
        message: `Template has ${potentiallyDynamic.length} variable references - ensure all are defined`
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        variableCount: potentiallyDynamic.length
      }
    };
  }

  /**
   * Validate parameters against solution schema
   * @param {Object} parameters - Parameters to validate
   * @param {Object} parameterSchema - Parameter schema from solution
   * @returns {ValidationResult} Validation result
   */
  validateParameters(parameters, parameterSchema) {
    const errors = [];
    const warnings = [];

    for (const [paramName, schema] of Object.entries(parameterSchema)) {
      const value = parameters[paramName];

      // Check required
      if (schema.required && (value === undefined || value === null)) {
        errors.push({
          type: 'required_parameter',
          parameter: paramName,
          message: `Required parameter missing: ${paramName}`
        });
        continue;
      }

      // Skip validation if not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      const expectedType = schema.type;
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (expectedType === 'number' && actualType !== 'number') {
        errors.push({
          type: 'type_mismatch',
          parameter: paramName,
          expected: 'number',
          actual: actualType,
          message: `Parameter ${paramName} must be a number`
        });
      } else if (expectedType === 'boolean' && actualType !== 'boolean') {
        errors.push({
          type: 'type_mismatch',
          parameter: paramName,
          expected: 'boolean',
          actual: actualType,
          message: `Parameter ${paramName} must be a boolean`
        });
      } else if (expectedType === 'string' && actualType !== 'string') {
        errors.push({
          type: 'type_mismatch',
          parameter: paramName,
          expected: 'string',
          actual: actualType,
          message: `Parameter ${paramName} must be a string`
        });
      } else if (expectedType === 'array' && !Array.isArray(value)) {
        errors.push({
          type: 'type_mismatch',
          parameter: paramName,
          expected: 'array',
          actual: actualType,
          message: `Parameter ${paramName} must be an array`
        });
      }

      // Range validation for numbers
      if (expectedType === 'number' && typeof value === 'number') {
        if (schema.min !== undefined && value < schema.min) {
          errors.push({
            type: 'range_error',
            parameter: paramName,
            message: `Parameter ${paramName} must be at least ${schema.min}`
          });
        }
        if (schema.max !== undefined && value > schema.max) {
          errors.push({
            type: 'range_error',
            parameter: paramName,
            message: `Parameter ${paramName} must be at most ${schema.max}`
          });
        }
      }

      // Length validation
      if ((expectedType === 'string' || expectedType === 'array') && value) {
        const length = value.length;
        if (schema.minLength !== undefined && length < schema.minLength) {
          errors.push({
            type: 'length_error',
            parameter: paramName,
            message: `Parameter ${paramName} must have at least ${schema.minLength} items/characters`
          });
        }
        if (schema.maxLength !== undefined && length > schema.maxLength) {
          errors.push({
            type: 'length_error',
            parameter: paramName,
            message: `Parameter ${paramName} must have at most ${schema.maxLength} items/characters`
          });
        }
      }

      // Pattern validation for strings
      if (expectedType === 'string' && typeof value === 'string' && schema.pattern) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(value)) {
          errors.push({
            type: 'pattern_error',
            parameter: paramName,
            message: `Parameter ${paramName} does not match required pattern: ${schema.pattern}`
          });
        }
      }

      // Enum validation
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push({
          type: 'enum_error',
          parameter: paramName,
          message: `Parameter ${paramName} must be one of: ${schema.enum.join(', ')}`
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Register pre-deployment validators
   * @private
   */
  registerPreDeployValidators() {
    // Field exists check
    this.customValidators.set('fieldExists', async (check, context) => {
      const { platform, object, field } = check;
      const { orgAlias } = context.credentials?.salesforce || {};

      if (platform !== 'salesforce' || !orgAlias) {
        return { valid: true, skipped: true, reason: 'Not applicable or no credentials' };
      }

      try {
        const cmd = `sf sobject describe ${object} --target-org ${orgAlias} --json`;
        const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));
        const fields = result.result?.fields || [];
        const fieldExists = fields.some(f => f.name === field);

        return {
          valid: fieldExists,
          message: fieldExists ? `Field ${object}.${field} exists` : check.errorMessage
        };
      } catch (e) {
        return { valid: false, message: `Failed to check field: ${e.message}` };
      }
    });

    // Object exists check
    this.customValidators.set('objectExists', async (check, context) => {
      const { platform, object } = check;
      const { orgAlias } = context.credentials?.salesforce || {};

      if (platform !== 'salesforce' || !orgAlias) {
        return { valid: true, skipped: true };
      }

      try {
        const cmd = `sf sobject describe ${object} --target-org ${orgAlias} --json`;
        execSync(cmd, { encoding: 'utf-8' });
        return { valid: true, message: `Object ${object} exists` };
      } catch (e) {
        return { valid: false, message: check.errorMessage || `Object ${object} does not exist` };
      }
    });

    // User accessible check
    this.customValidators.set('userAccessible', async (check, context) => {
      // Placeholder - would query user records
      return { valid: true, skipped: true, reason: 'User validation not implemented' };
    });

    // Custom code check
    this.customValidators.set('customCode', async (check, context) => {
      if (!check.script) {
        return { valid: false, message: 'customCode check requires script path' };
      }

      const scriptPath = path.resolve(context.solutionDir || '.', check.script);
      if (!fs.existsSync(scriptPath)) {
        return { valid: false, message: `Script not found: ${check.script}` };
      }

      try {
        const validator = require(scriptPath);
        if (typeof validator === 'function') {
          return await validator(check, context);
        }
        return { valid: false, message: 'Custom script must export a function' };
      } catch (e) {
        return { valid: false, message: `Custom validation failed: ${e.message}` };
      }
    });
  }

  /**
   * Run pre-deployment checks
   * @param {Array<Object>} checks - Pre-deploy checks from solution
   * @param {Object} context - Deployment context (credentials, parameters, etc.)
   * @returns {Promise<ValidationResult>} Validation result
   */
  async runPreDeployChecks(checks, context) {
    const errors = [];
    const warnings = [];
    const results = [];

    for (const check of checks) {
      const validator = this.customValidators.get(check.type);

      if (!validator) {
        warnings.push({
          type: 'unknown_check',
          checkType: check.type,
          message: `Unknown pre-deploy check type: ${check.type}`
        });
        continue;
      }

      try {
        const result = await validator(check, context);
        results.push({ check: check.type, ...result });

        if (!result.valid && !result.skipped) {
          if (check.severity === 'warning') {
            warnings.push({
              type: 'pre_deploy_warning',
              checkType: check.type,
              message: result.message || check.errorMessage
            });
          } else {
            errors.push({
              type: 'pre_deploy_error',
              checkType: check.type,
              message: result.message || check.errorMessage
            });
          }
        }
      } catch (e) {
        errors.push({
          type: 'check_error',
          checkType: check.type,
          message: `Check failed with error: ${e.message}`
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        checksRun: results.length,
        checksPassed: results.filter(r => r.valid).length,
        checksSkipped: results.filter(r => r.skipped).length
      }
    };
  }

  /**
   * Register a custom validator
   * @param {string} name - Validator name
   * @param {Function} validator - Validator function (async supported)
   */
  registerValidator(name, validator) {
    this.customValidators.set(name, validator);
  }

  /**
   * Combine multiple validation results
   * @param {Array<ValidationResult>} results - Results to combine
   * @returns {ValidationResult} Combined result
   */
  combineResults(results) {
    return {
      valid: results.every(r => r.valid),
      errors: results.flatMap(r => r.errors || []),
      warnings: results.flatMap(r => r.warnings || []),
      metadata: {
        validationCount: results.length,
        passedCount: results.filter(r => r.valid).length
      }
    };
  }
}

// Export
module.exports = ValidationEngine;
module.exports.ValidationEngine = ValidationEngine;
