#!/usr/bin/env node

/**
 * Template Engine for PDF Generation
 *
 * EJS-powered templating with custom helpers and backward compatibility
 * for legacy {{placeholder}} syntax.
 *
 * Features:
 * - Full EJS syntax support (<%= %>, <%- %>, <% %>)
 * - Conditional blocks and loops
 * - Include/partial support
 * - Custom helpers (formatDate, uppercase, pluralize, etc.)
 * - Backward compatibility with {{placeholder}} syntax
 * - Auto-detection of template format
 *
 * @version 1.0.0
 * @date 2025-12-25
 */

const ejs = require('ejs');
const fs = require('fs').promises;
const path = require('path');

class TemplateEngine {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.partialsDir = options.partialsDir || path.join(__dirname, '../../templates/pdf-partials');
    this.cache = new Map();
    this.cacheEnabled = options.cache !== false;

    // Initialize built-in helpers
    this.helpers = {
      ...this._getBuiltInHelpers(),
      ...(options.helpers || {})
    };
  }

  /**
   * Render a template string with data
   * @param {string} template - Template string (EJS or legacy format)
   * @param {Object} data - Data to inject into template
   * @param {Object} options - Rendering options
   * @returns {Promise<string>} Rendered content
   */
  async render(template, data = {}, options = {}) {
    try {
      // Detect template format and convert if needed
      const isLegacy = this._isLegacyFormat(template);
      const ejsTemplate = isLegacy ? this._convertLegacyToEJS(template) : template;

      if (this.verbose && isLegacy) {
        console.log('  Converting legacy {{}} template to EJS format');
      }

      // Get default values for common template variables
      const defaults = this._getTemplateDefaults();

      // Merge defaults, data, and helpers (data overrides defaults)
      const templateData = {
        ...defaults,
        ...data,
        ...this.helpers,
        include: async (partialName, partialData = {}) => {
          return this.renderPartial(partialName, { ...defaults, ...data, ...partialData });
        }
      };

      // EJS options
      const ejsOptions = {
        async: true,
        cache: this.cacheEnabled,
        filename: options.filename || 'template',
        ...options
      };

      // Render template
      const rendered = await ejs.render(ejsTemplate, templateData, ejsOptions);
      return rendered;

    } catch (error) {
      console.error('Template rendering error:', error.message);
      throw error;
    }
  }

  /**
   * Get default values for common template variables
   * This prevents ReferenceError when templates check for optional variables
   * @private
   */
  _getTemplateDefaults() {
    return {
      // Common metadata fields
      title: '',
      subtitle: '',
      org: '',
      author: '',
      date: new Date().toISOString().split('T')[0],
      version: '1.0',
      reportType: '',
      classification: '',
      confidentiality: '',

      // Branding
      logoPath: null,

      // Salesforce-specific
      sandboxName: '',
      scope: '',
      objectName: '',
      apiName: '',

      // HubSpot-specific
      portalId: '',
      hubId: '',

      // Security audit
      riskLevel: '',
      complianceFrameworks: [],

      // Integration
      platforms: [],

      // Data quality
      recordsAnalyzed: null,
      qualityScore: null,

      // Arrays that might be iterated
      findings: [],
      recommendations: [],
      items: []
    };
  }

  /**
   * Render a template file
   * @param {string} templatePath - Path to template file
   * @param {Object} data - Data to inject
   * @param {Object} options - Rendering options
   * @returns {Promise<string>} Rendered content
   */
  async renderFile(templatePath, data = {}, options = {}) {
    try {
      // Check cache first
      const cacheKey = templatePath;
      let template;

      if (this.cacheEnabled && this.cache.has(cacheKey)) {
        template = this.cache.get(cacheKey);
      } else {
        template = await fs.readFile(templatePath, 'utf8');
        if (this.cacheEnabled) {
          this.cache.set(cacheKey, template);
        }
      }

      return this.render(template, data, {
        ...options,
        filename: templatePath
      });

    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Template file not found: ${templatePath}`);
      }
      throw error;
    }
  }

  /**
   * Render a partial template
   * @param {string} partialName - Name of partial (without extension)
   * @param {Object} data - Data for partial
   * @returns {Promise<string>} Rendered partial
   */
  async renderPartial(partialName, data = {}) {
    const partialPath = path.join(this.partialsDir, `${partialName}.ejs`);
    return this.renderFile(partialPath, data);
  }

  /**
   * Check if template uses legacy {{placeholder}} format
   * @private
   */
  _isLegacyFormat(template) {
    // Check for legacy {{variable}} patterns (not EJS <%=)
    const legacyPattern = /\{\{[^}]+\}\}/;
    const ejsPattern = /<%[-=]?/;

    const hasLegacy = legacyPattern.test(template);
    const hasEJS = ejsPattern.test(template);

    // If has EJS syntax, treat as EJS even if has some {{}}
    return hasLegacy && !hasEJS;
  }

  /**
   * Convert legacy {{placeholder}} to EJS syntax
   * @private
   */
  _convertLegacyToEJS(template) {
    let converted = template;

    // Convert simple placeholders: {{variable}} -> <%= variable %>
    converted = converted.replace(/\{\{(\w+)\}\}/g, '<%= $1 %>');

    // Convert conditional blocks: {{#if var}}...{{/if}} -> <% if (var) { %>...<% } %>
    converted = converted.replace(/\{\{#if\s+(\w+)\}\}/g, '<% if ($1) { %>');
    converted = converted.replace(/\{\{\/if\}\}/g, '<% } %>');

    // Convert else: {{else}} -> <% } else { %>
    converted = converted.replace(/\{\{else\}\}/g, '<% } else { %>');

    // Convert each loops: {{#each items}}...{{/each}}
    // -> <% items.forEach(function(item) { %>...<% }); %>
    converted = converted.replace(/\{\{#each\s+(\w+)\}\}/g, '<% $1.forEach(function(item) { %>');
    converted = converted.replace(/\{\{\/each\}\}/g, '<% }); %>');

    // Convert helper calls: {{formatDate date}} -> <%= formatDate(date) %>
    converted = converted.replace(/\{\{(\w+)\s+(\w+)\}\}/g, '<%= $1($2) %>');

    // Convert dot notation: {{object.property}} -> <%= object.property %>
    converted = converted.replace(/\{\{([\w.]+)\}\}/g, '<%= $1 %>');

    return converted;
  }

  /**
   * Get built-in template helpers
   * @private
   */
  _getBuiltInHelpers() {
    return {
      // Date formatting
      formatDate: (date, format = 'long') => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return date;

        const formats = {
          short: { month: 'numeric', day: 'numeric', year: 'numeric' },
          long: { month: 'long', day: 'numeric', year: 'numeric' },
          iso: null, // Special handling
          full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
        };

        if (format === 'iso') {
          return d.toISOString().split('T')[0];
        }

        return d.toLocaleDateString('en-US', formats[format] || formats.long);
      },

      // String transformations
      uppercase: (str) => String(str || '').toUpperCase(),
      lowercase: (str) => String(str || '').toLowerCase(),
      capitalize: (str) => {
        const s = String(str || '');
        return s.charAt(0).toUpperCase() + s.slice(1);
      },
      titleCase: (str) => {
        return String(str || '').replace(/\w\S*/g, (txt) =>
          txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
      },

      // Number formatting
      number: (num, decimals = 0) => {
        if (num === null || num === undefined) return '';
        return Number(num).toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        });
      },
      percent: (num, decimals = 1) => {
        if (num === null || num === undefined) return '';
        return Number(num).toFixed(decimals) + '%';
      },
      currency: (num, currency = 'USD') => {
        if (num === null || num === undefined) return '';
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency
        }).format(num);
      },

      // Pluralization
      pluralize: (count, singular, plural) => {
        const p = plural || singular + 's';
        return count === 1 ? singular : p;
      },

      // Conditional helpers
      ifEquals: (a, b, yes, no = '') => a === b ? yes : no,
      ifGreater: (a, b, yes, no = '') => a > b ? yes : no,
      ifLess: (a, b, yes, no = '') => a < b ? yes : no,

      // Array helpers
      join: (arr, separator = ', ') => {
        if (!Array.isArray(arr)) return '';
        return arr.join(separator);
      },
      first: (arr) => Array.isArray(arr) ? arr[0] : arr,
      last: (arr) => Array.isArray(arr) ? arr[arr.length - 1] : arr,
      length: (arr) => Array.isArray(arr) ? arr.length : 0,

      // Truncation
      truncate: (str, length = 100, suffix = '...') => {
        const s = String(str || '');
        if (s.length <= length) return s;
        return s.substring(0, length - suffix.length) + suffix;
      },

      // HTML escaping (safe by default in EJS with <%=)
      escapeHtml: (str) => {
        return String(str || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      },

      // Markdown helpers (for template context)
      nl2br: (str) => String(str || '').replace(/\n/g, '<br>'),

      // Status helpers
      statusBadge: (status) => {
        const statusMap = {
          success: 'status-success',
          warning: 'status-warning',
          danger: 'status-danger',
          error: 'status-danger',
          info: 'status-info'
        };
        const className = statusMap[status?.toLowerCase()] || 'status-info';
        return `<span class="status ${className}">${status}</span>`;
      },

      // Current date/time
      now: () => new Date(),
      today: () => new Date().toISOString().split('T')[0],
      year: () => new Date().getFullYear()
    };
  }

  /**
   * Register a custom helper
   * @param {string} name - Helper name
   * @param {Function} fn - Helper function
   */
  registerHelper(name, fn) {
    if (typeof fn !== 'function') {
      throw new Error(`Helper must be a function: ${name}`);
    }
    this.helpers[name] = fn;
  }

  /**
   * Clear the template cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Compile a template for repeated use
   * @param {string} template - Template string
   * @param {Object} options - Compile options
   * @returns {Function} Compiled template function
   */
  compile(template, options = {}) {
    const isLegacy = this._isLegacyFormat(template);
    const ejsTemplate = isLegacy ? this._convertLegacyToEJS(template) : template;

    return ejs.compile(ejsTemplate, {
      async: true,
      ...options
    });
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: template-engine.js <template-file> [--data <json-file>] [--output <file>]');
    console.log('\nOptions:');
    console.log('  --data <file>     JSON file with template data');
    console.log('  --output <file>   Output file (default: stdout)');
    console.log('  --verbose         Verbose output');
    console.log('\nExamples:');
    console.log('  template-engine.js cover.ejs --data metadata.json');
    console.log('  template-engine.js template.md --data data.json --output output.md');
    process.exit(1);
  }

  const templateFile = args[0];
  const dataIndex = args.indexOf('--data');
  const outputIndex = args.indexOf('--output');
  const verbose = args.includes('--verbose');

  const engine = new TemplateEngine({ verbose });

  (async () => {
    try {
      // Load data if provided
      let data = {};
      if (dataIndex >= 0 && args[dataIndex + 1]) {
        const dataContent = await fs.readFile(args[dataIndex + 1], 'utf8');
        data = JSON.parse(dataContent);
      }

      // Render template
      const rendered = await engine.renderFile(templateFile, data);

      // Output
      if (outputIndex >= 0 && args[outputIndex + 1]) {
        await fs.writeFile(args[outputIndex + 1], rendered, 'utf8');
        console.log(`Template rendered to: ${args[outputIndex + 1]}`);
      } else {
        console.log(rendered);
      }

      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = TemplateEngine;
