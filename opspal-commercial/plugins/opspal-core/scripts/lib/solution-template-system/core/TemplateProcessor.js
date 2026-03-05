#!/usr/bin/env node

/**
 * TemplateProcessor - Extended Template Engine for Solution Templates
 *
 * Extends SimpleTemplateEngine with additional helpers for solution template processing.
 * Supports unified Handlebars-like syntax across all platforms.
 *
 * Features:
 * - All SimpleTemplateEngine features (variables, conditionals, loops, partials)
 * - Extended helpers: eq, ne, gt, lt, and, or, not, default, upper, lower, etc.
 * - Environment variable substitution: {{env.VAR_NAME}}
 * - Platform pass-through: {{sf:...}}, {{hs:...}}, {{n8n:...}}
 * - Field mapping resolution: {{fieldRef "Object" "Field"}}
 * - Date formatting: {{dateFormat date "YYYY-MM-DD"}}
 * - JSON stringification: {{json object}}
 *
 * @module solution-template-system/core/TemplateProcessor
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Import base engine from runbook-framework
const runbookFrameworkPath = path.resolve(__dirname, '../../../runbook-framework/core/renderer.js');
let SimpleTemplateEngine;

try {
  const renderer = require(runbookFrameworkPath);
  SimpleTemplateEngine = renderer.SimpleTemplateEngine;
} catch (e) {
  // Fallback: Define SimpleTemplateEngine inline if import fails
  console.warn('Could not import SimpleTemplateEngine from runbook-framework, using built-in version');
  SimpleTemplateEngine = require('./SimpleTemplateEngineBase');
}

/**
 * Extended template engine with solution-specific helpers
 */
class TemplateProcessor {
  /**
   * Create a new TemplateProcessor instance
   * @param {Object} options - Processor options
   * @param {Object} [options.partials] - Named partial templates
   * @param {Object} [options.helpers] - Custom helper functions
   * @param {Object} [options.environment] - Environment profile for field mappings
   * @param {boolean} [options.strictMode=false] - Throw errors on undefined variables
   */
  constructor(options = {}) {
    this.partials = options.partials || {};
    this.customHelpers = options.helpers || {};
    this.environment = options.environment || {};
    this.strictMode = options.strictMode || false;

    // Built-in helpers
    this.helpers = {
      // Comparison helpers
      eq: (a, b) => a === b,
      ne: (a, b) => a !== b,
      gt: (a, b) => a > b,
      gte: (a, b) => a >= b,
      lt: (a, b) => a < b,
      lte: (a, b) => a <= b,

      // Logical helpers
      and: (...args) => args.slice(0, -1).every(Boolean),
      or: (...args) => args.slice(0, -1).some(Boolean),
      not: (value) => !value,

      // String helpers
      upper: (str) => String(str).toUpperCase(),
      lower: (str) => String(str).toLowerCase(),
      capitalize: (str) => String(str).charAt(0).toUpperCase() + String(str).slice(1),
      trim: (str) => String(str).trim(),
      replace: (str, search, replacement) => String(str).replace(new RegExp(search, 'g'), replacement),
      concat: (...args) => args.slice(0, -1).join(''),

      // Value helpers
      default: (value, defaultValue) => value !== undefined && value !== null && value !== '' ? value : defaultValue,
      coalesce: (...args) => args.find(arg => arg !== undefined && arg !== null && arg !== ''),

      // Array helpers
      length: (arr) => Array.isArray(arr) ? arr.length : 0,
      first: (arr) => Array.isArray(arr) && arr.length > 0 ? arr[0] : undefined,
      last: (arr) => Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : undefined,
      join: (arr, separator = ', ') => Array.isArray(arr) ? arr.join(separator) : '',
      includes: (arr, value) => Array.isArray(arr) && arr.includes(value),

      // Date helpers
      dateFormat: (date, format = 'YYYY-MM-DD') => {
        const d = date ? new Date(date) : new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return format
          .replace('YYYY', d.getFullYear())
          .replace('MM', pad(d.getMonth() + 1))
          .replace('DD', pad(d.getDate()))
          .replace('HH', pad(d.getHours()))
          .replace('mm', pad(d.getMinutes()))
          .replace('ss', pad(d.getSeconds()));
      },
      now: () => new Date().toISOString(),

      // Object helpers
      json: (obj, indent = 2) => JSON.stringify(obj, null, indent),
      keys: (obj) => typeof obj === 'object' && obj !== null ? Object.keys(obj) : [],
      values: (obj) => typeof obj === 'object' && obj !== null ? Object.values(obj) : [],

      // Math helpers
      add: (a, b) => Number(a) + Number(b),
      subtract: (a, b) => Number(a) - Number(b),
      multiply: (a, b) => Number(a) * Number(b),
      divide: (a, b) => Number(b) !== 0 ? Number(a) / Number(b) : 0,
      round: (n, decimals = 0) => Number(Number(n).toFixed(decimals)),

      // Merge custom helpers
      ...this.customHelpers
    };
  }

  /**
   * Register a partial template
   * @param {string} name - Partial name
   * @param {string} content - Partial content
   */
  registerPartial(name, content) {
    this.partials[name] = content;
  }

  /**
   * Register multiple partials at once
   * @param {Object} partials - Map of name -> content
   */
  registerPartials(partials) {
    Object.assign(this.partials, partials);
  }

  /**
   * Register a custom helper function
   * @param {string} name - Helper name
   * @param {Function} fn - Helper function
   */
  registerHelper(name, fn) {
    this.helpers[name] = fn;
  }

  /**
   * Load partials from a directory
   * @param {string} dir - Directory containing partial files
   * @param {string} [extension='.md'] - File extension to load
   * @returns {Object} Map of partial name -> content
   */
  loadPartialsFromDir(dir, extension = '.md') {
    const partials = {};

    if (!fs.existsSync(dir)) {
      return partials;
    }

    fs.readdirSync(dir)
      .filter(f => f.endsWith(extension))
      .forEach(file => {
        const name = path.basename(file, extension);
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        partials[name] = content;
      });

    return partials;
  }

  /**
   * Process a template string with data
   * @param {string} template - Template content
   * @param {Object} data - Data to render
   * @param {Object} [options] - Processing options
   * @returns {string} Rendered output
   */
  process(template, data, options = {}) {
    let output = template;

    // Merge environment data
    const context = {
      ...data,
      env: { ...process.env, ...(data.env || {}) },
      _environment: this.environment,
      _now: new Date().toISOString()
    };

    // 1. Process platform pass-through (preserve these)
    output = this.processPlatformPassThrough(output);

    // 2. Process partials
    output = this.processPartials(output, context);

    // 3. Process extended helpers
    output = this.processHelpers(output, context);

    // 4. Process conditionals (including helper-based)
    output = this.processConditionals(output, context);

    // 5. Process loops
    output = this.processLoops(output, context);

    // 6. Process field references
    output = this.processFieldReferences(output, context);

    // 7. Process environment variables
    output = this.processEnvVariables(output, context);

    // 8. Process simple variables
    output = this.processVariables(output, context);

    // 9. Restore platform pass-through
    output = this.restorePlatformPassThrough(output);

    return output;
  }

  /**
   * Process platform-specific pass-through syntax
   * These are preserved as-is for the target platform to interpret
   * @param {string} template - Template content
   * @returns {string} Template with pass-throughs marked
   */
  processPlatformPassThrough(template) {
    // Mark platform pass-throughs for preservation
    // {{sf:...}}, {{hs:...}}, {{n8n:...}}
    return template
      .replace(/\{\{sf:([^}]+)\}\}/g, '___SF_PASSTHROUGH_$1___')
      .replace(/\{\{hs:([^}]+)\}\}/g, '___HS_PASSTHROUGH_$1___')
      .replace(/\{\{n8n:([^}]+)\}\}/g, '___N8N_PASSTHROUGH_$1___');
  }

  /**
   * Restore platform pass-through markers to their original syntax
   * @param {string} template - Processed template
   * @returns {string} Template with restored pass-throughs
   */
  restorePlatformPassThrough(template) {
    return template
      .replace(/___SF_PASSTHROUGH_([^_]+)___/g, '$1')  // SF syntax without wrapper
      .replace(/___HS_PASSTHROUGH_([^_]+)___/g, '$1')  // HS syntax without wrapper
      .replace(/___N8N_PASSTHROUGH_([^_]+)___/g, '={{$1}}');  // n8n expression syntax
  }

  /**
   * Process partial includes
   * @param {string} template - Template content
   * @param {Object} context - Data context
   * @returns {string} Processed template
   */
  processPartials(template, context) {
    const regex = /\{\{>\s*(\w+)(?:\s+(\w+))?\}\}/g;

    return template.replace(regex, (match, partialName, contextName) => {
      const partial = this.partials[partialName];
      if (!partial) {
        if (this.strictMode) {
          throw new Error(`Partial not found: ${partialName}`);
        }
        console.warn(`Partial not found: ${partialName}`);
        return '';
      }

      const partialContext = contextName ? this.resolveValue(contextName, context) : context;
      return this.process(partial, partialContext || context);
    });
  }

  /**
   * Process helper functions
   * Syntax: {{helperName arg1 arg2 ...}} or {{helperName arg1 arg2 "literal"}}
   * @param {string} template - Template content
   * @param {Object} context - Data context
   * @returns {string} Processed template
   */
  processHelpers(template, context) {
    // Match {{helperName arg1 arg2 ...}}
    const helperRegex = /\{\{(\w+)\s+([^}]+)\}\}/g;

    return template.replace(helperRegex, (match, helperName, argsString) => {
      const helper = this.helpers[helperName];
      if (!helper) {
        // Not a helper, return original for variable processing
        return match;
      }

      // Parse arguments (handles quoted strings and variable references)
      const args = this.parseHelperArgs(argsString, context);

      try {
        const result = helper(...args);
        return result !== undefined && result !== null ? String(result) : '';
      } catch (e) {
        console.error(`Helper error (${helperName}):`, e.message);
        return this.strictMode ? match : '';
      }
    });
  }

  /**
   * Parse helper arguments from string
   * @param {string} argsString - Arguments string
   * @param {Object} context - Data context
   * @returns {Array} Parsed arguments
   */
  parseHelperArgs(argsString, context) {
    const args = [];
    const regex = /"([^"]*)"|\S+/g;
    let match;

    while ((match = regex.exec(argsString)) !== null) {
      const arg = match[1] !== undefined ? match[1] : match[0];

      // Check if it's a quoted string
      if (match[1] !== undefined) {
        args.push(arg);
      }
      // Check if it's a number
      else if (!isNaN(arg)) {
        args.push(Number(arg));
      }
      // Check if it's a boolean
      else if (arg === 'true') {
        args.push(true);
      }
      else if (arg === 'false') {
        args.push(false);
      }
      // Otherwise resolve as variable
      else {
        args.push(this.resolveValue(arg, context));
      }
    }

    return args;
  }

  /**
   * Process conditional blocks
   * Supports: {{#if var}}, {{#if (eq var1 var2)}}, {{#unless var}}
   * @param {string} template - Template content
   * @param {Object} context - Data context
   * @returns {string} Processed template
   */
  processConditionals(template, context) {
    let result = template;
    let previousResult;

    // Process {{#unless ...}}...{{/unless}}
    const unlessRegex = /\{\{#unless\s+([\w.]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g;
    result = result.replace(unlessRegex, (match, varName, block) => {
      const value = this.resolveValue(varName, context);
      return !this.isTruthy(value) ? block : '';
    });

    // Process {{#if (helper args)}}
    const helperConditionRegex = /\{\{#if\s+\((\w+)\s+([^)]+)\)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
    result = result.replace(helperConditionRegex, (match, helperName, argsString, trueBlock, falseBlock) => {
      const helper = this.helpers[helperName];
      if (!helper) return match;

      const args = this.parseHelperArgs(argsString, context);
      const isTrue = helper(...args);
      return isTrue ? trueBlock : (falseBlock || '');
    });

    // Process standard {{#if var}}
    const ifRegex = /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;

    do {
      previousResult = result;
      result = result.replace(ifRegex, (match, varName, trueBlock, falseBlock) => {
        const value = this.resolveValue(varName, context);
        const isTrue = this.isTruthy(value);
        return isTrue ? trueBlock : (falseBlock || '');
      });
    } while (result !== previousResult);

    return result;
  }

  /**
   * Process loop blocks
   * @param {string} template - Template content
   * @param {Object} context - Data context
   * @returns {string} Processed template
   */
  processLoops(template, context) {
    const regex = /\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;

    return template.replace(regex, (match, arrayName, loopBlock) => {
      const array = this.resolveValue(arrayName, context);

      if (!Array.isArray(array) || array.length === 0) {
        return '';
      }

      return array.map((item, index) => {
        let itemBlock = loopBlock;

        // Special variables
        itemBlock = itemBlock.replace(/\{\{@index\}\}/g, String(index + 1));
        itemBlock = itemBlock.replace(/\{\{@key\}\}/g, String(index));
        itemBlock = itemBlock.replace(/\{\{@first\}\}/g, String(index === 0));
        itemBlock = itemBlock.replace(/\{\{@last\}\}/g, String(index === array.length - 1));

        if (typeof item !== 'object' || item === null) {
          itemBlock = itemBlock.replace(/\{\{this\}\}/g, String(item));
        } else {
          // {{this.property}}
          itemBlock = itemBlock.replace(/\{\{this\.([\w.]+)\}\}/g, (m, prop) => {
            const value = this.resolveNestedValue(prop, item);
            return value !== undefined && value !== null ? String(value) : '';
          });

          // {{property}} in loop context
          itemBlock = itemBlock.replace(/\{\{(\w+)\}\}/g, (m, prop) => {
            if (prop.startsWith('@') || prop === 'this') return m;
            const value = item[prop];
            if (value !== undefined && value !== null) return String(value);
            // Fall back to outer context
            const outerValue = this.resolveValue(prop, context);
            return outerValue !== undefined && outerValue !== null ? String(outerValue) : '';
          });
        }

        return itemBlock;
      }).join('');
    });
  }

  /**
   * Process field reference helpers
   * Syntax: {{fieldRef "Object" "Field"}} or {{fieldRef Object Field}}
   * @param {string} template - Template content
   * @param {Object} context - Data context
   * @returns {string} Processed template
   */
  processFieldReferences(template, context) {
    const regex = /\{\{fieldRef\s+"?(\w+)"?\s+"?(\w+)"?\}\}/g;

    return template.replace(regex, (match, objectName, fieldName) => {
      const env = context._environment || this.environment;
      const fieldMappings = env.fieldMappings || {};

      const objectMappings = fieldMappings[objectName];
      if (objectMappings && objectMappings[fieldName]) {
        return objectMappings[fieldName];
      }

      // Return original field name if no mapping found
      return fieldName;
    });
  }

  /**
   * Process environment variable references
   * Syntax: {{env.VAR_NAME}}
   * @param {string} template - Template content
   * @param {Object} context - Data context
   * @returns {string} Processed template
   */
  processEnvVariables(template, context) {
    return template.replace(/\{\{env\.(\w+)\}\}/g, (match, varName) => {
      const value = context.env?.[varName] || process.env[varName];
      if (value !== undefined) {
        return value;
      }
      if (this.strictMode) {
        throw new Error(`Environment variable not found: ${varName}`);
      }
      return match;
    });
  }

  /**
   * Process simple variable substitutions
   * @param {string} template - Template content
   * @param {Object} context - Data context
   * @returns {string} Processed template
   */
  processVariables(template, context) {
    return template.replace(/\{\{([\w.]+)\}\}/g, (match, varName) => {
      if (varName.startsWith('@') || varName.startsWith('>') || varName === 'this') {
        return match;
      }

      const value = this.resolveValue(varName, context);

      if (value !== undefined && value !== null) {
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      }

      if (this.strictMode) {
        throw new Error(`Variable not found: ${varName}`);
      }

      return '';
    });
  }

  /**
   * Resolve a variable name to its value
   * @param {string} varName - Variable name (can include dots)
   * @param {Object} context - Data context
   * @returns {*} Resolved value
   */
  resolveValue(varName, context) {
    if (varName.includes('.')) {
      return this.resolveNestedValue(varName, context);
    }
    return context[varName];
  }

  /**
   * Resolve nested property path
   * @param {string} path - Dot-separated path
   * @param {Object} obj - Object to traverse
   * @returns {*} Resolved value
   */
  resolveNestedValue(path, obj) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Check if a value is truthy
   * @param {*} value - Value to check
   * @returns {boolean} True if truthy
   */
  isTruthy(value) {
    if (value === undefined || value === null || value === false) {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === 'object') {
      return Object.keys(value).length > 0;
    }
    if (typeof value === 'string') {
      return value.length > 0;
    }
    return Boolean(value);
  }

  /**
   * Process a template file
   * @param {string} filePath - Path to template file
   * @param {Object} data - Data to render
   * @param {Object} [options] - Processing options
   * @returns {string} Rendered output
   */
  processFile(filePath, data, options = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Template file not found: ${filePath}`);
    }

    const template = fs.readFileSync(filePath, 'utf-8');
    return this.process(template, data, options);
  }

  /**
   * Validate template syntax without rendering
   * @param {string} template - Template content
   * @returns {Object} Validation result with errors array
   */
  validate(template) {
    const errors = [];

    // Check for unbalanced conditionals
    const ifCount = (template.match(/\{\{#if\s/g) || []).length;
    const endIfCount = (template.match(/\{\{\/if\}\}/g) || []).length;
    if (ifCount !== endIfCount) {
      errors.push(`Unbalanced conditionals: ${ifCount} {{#if}} vs ${endIfCount} {{/if}}`);
    }

    // Check for unbalanced loops
    const eachCount = (template.match(/\{\{#each\s/g) || []).length;
    const endEachCount = (template.match(/\{\{\/each\}\}/g) || []).length;
    if (eachCount !== endEachCount) {
      errors.push(`Unbalanced loops: ${eachCount} {{#each}} vs ${endEachCount} {{/each}}`);
    }

    // Check for unbalanced unless
    const unlessCount = (template.match(/\{\{#unless\s/g) || []).length;
    const endUnlessCount = (template.match(/\{\{\/unless\}\}/g) || []).length;
    if (unlessCount !== endUnlessCount) {
      errors.push(`Unbalanced unless: ${unlessCount} {{#unless}} vs ${endUnlessCount} {{/unless}}`);
    }

    // Check for unknown helpers
    const helperMatches = template.match(/\{\{(\w+)\s+[^}]+\}\}/g) || [];
    for (const match of helperMatches) {
      const helperName = match.match(/\{\{(\w+)/)?.[1];
      if (helperName && !['if', 'unless', 'each', 'fieldRef'].includes(helperName) && !this.helpers[helperName]) {
        // Could be a variable, not an error
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export
module.exports = TemplateProcessor;
module.exports.TemplateProcessor = TemplateProcessor;
