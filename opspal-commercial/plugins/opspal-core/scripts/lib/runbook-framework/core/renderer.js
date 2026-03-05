#!/usr/bin/env node

/**
 * Runbook Renderer
 *
 * Platform-agnostic template engine for rendering runbooks.
 * Supports variable substitution, conditionals, loops, and template partials.
 *
 * Features:
 * - Simple variable substitution: {{variable}}
 * - Conditionals: {{#if variable}}...{{else}}...{{/if}}
 * - Loops: {{#each array}}...{{/each}} with {{this.property}} and {{@index}}
 * - Nested property access: {{object.property}}
 * - Template partials: {{> partialName}}
 * - Platform-specific section injection
 *
 * @module runbook-framework/core/renderer
 */

const fs = require('fs');
const path = require('path');

/**
 * Simple template engine with Handlebars-like syntax
 */
class SimpleTemplateEngine {
  /**
   * Create a new template engine instance
   * @param {string} template - Template content
   * @param {Object} [options] - Engine options
   * @param {Object} [options.partials] - Named partial templates
   */
  constructor(template, options = {}) {
    this.template = template;
    this.partials = options.partials || {};
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
   * Render the template with data
   * @param {Object} data - Data to render
   * @returns {string} Rendered output
   */
  render(data) {
    let output = this.template;

    // Process partials first {{> partialName}}
    output = this.processPartials(output, data);

    // Process conditionals {{#if variable}}...{{else}}...{{/if}}
    output = this.processConditionals(output, data);

    // Process loops {{#each array}}...{{/each}}
    output = this.processLoops(output, data);

    // Process simple variables {{variable}} and {{object.property}}
    output = this.processVariables(output, data);

    return output;
  }

  /**
   * Process partial includes
   * @param {string} template - Template content
   * @param {Object} data - Data context
   * @returns {string} Processed template
   */
  processPartials(template, data) {
    // Match {{> partialName}} or {{> partialName context}}
    const regex = /\{\{>\s*(\w+)(?:\s+(\w+))?\}\}/g;

    return template.replace(regex, (match, partialName, contextName) => {
      const partial = this.partials[partialName];
      if (!partial) {
        console.warn(`Partial not found: ${partialName}`);
        return '';
      }

      // Use specified context or full data
      const context = contextName ? this.resolveValue(contextName, data) : data;

      // Recursively render the partial
      const engine = new SimpleTemplateEngine(partial, { partials: this.partials });
      return engine.render(context || data);
    });
  }

  /**
   * Process conditional blocks
   * @param {string} template - Template content
   * @param {Object} data - Data context
   * @returns {string} Processed template
   */
  processConditionals(template, data) {
    // Match nested conditionals - process from innermost out
    const regex = /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;

    let result = template;
    let previousResult;

    // Keep processing until no more changes (handles nested conditionals)
    do {
      previousResult = result;
      result = result.replace(regex, (match, varName, trueBlock, falseBlock) => {
        const value = this.resolveValue(varName, data);
        const isTrue = this.isTruthy(value);

        if (isTrue) {
          return trueBlock;
        } else {
          return falseBlock || '';
        }
      });
    } while (result !== previousResult);

    return result;
  }

  /**
   * Process loop blocks
   * @param {string} template - Template content
   * @param {Object} data - Data context
   * @returns {string} Processed template
   */
  processLoops(template, data) {
    const regex = /\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;

    return template.replace(regex, (match, arrayName, loopBlock) => {
      const array = this.resolveValue(arrayName, data);

      if (!Array.isArray(array) || array.length === 0) {
        return '';
      }

      return array.map((item, index) => {
        let itemBlock = loopBlock;

        // Replace {{@index}} with actual index (1-based for display)
        itemBlock = itemBlock.replace(/\{\{@index\}\}/g, (index + 1).toString());

        // Replace {{@key}} with actual index (0-based)
        itemBlock = itemBlock.replace(/\{\{@key\}\}/g, index.toString());

        // Replace {{this}} with item value (for simple arrays)
        if (typeof item !== 'object' || item === null) {
          itemBlock = itemBlock.replace(/\{\{this\}\}/g, String(item));
        } else {
          // Replace {{this.property}} with item.property
          itemBlock = itemBlock.replace(/\{\{this\.([\w.]+)\}\}/g, (m, prop) => {
            const value = this.resolveNestedValue(prop, item);
            return value !== undefined && value !== null ? String(value) : '';
          });

          // Also support {{property}} directly in loop context
          itemBlock = itemBlock.replace(/\{\{(\w+)\}\}/g, (m, prop) => {
            // Skip special variables
            if (prop.startsWith('@')) return m;

            const value = item[prop];
            return value !== undefined && value !== null ? String(value) : '';
          });
        }

        return itemBlock;
      }).join('');
    });
  }

  /**
   * Process simple variable substitutions
   * @param {string} template - Template content
   * @param {Object} data - Data context
   * @returns {string} Processed template
   */
  processVariables(template, data) {
    return template.replace(/\{\{([\w.]+)\}\}/g, (match, varName) => {
      // Skip special variables and partials
      if (varName.startsWith('@') || varName.startsWith('>')) {
        return match;
      }

      const value = this.resolveValue(varName, data);
      return value !== undefined && value !== null ? String(value) : '';
    });
  }

  /**
   * Resolve a variable name to its value
   * @param {string} varName - Variable name (can include dots for nesting)
   * @param {Object} data - Data context
   * @returns {*} Resolved value
   */
  resolveValue(varName, data) {
    if (varName.includes('.')) {
      return this.resolveNestedValue(varName, data);
    }
    return data[varName];
  }

  /**
   * Resolve nested property path
   * @param {string} path - Dot-separated property path
   * @param {Object} obj - Object to traverse
   * @returns {*} Resolved value
   */
  resolveNestedValue(path, obj) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Check if a value is truthy for conditionals
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
}

/**
 * Runbook Renderer - renders runbooks using templates and platform adapter
 */
class RunbookRenderer {
  /**
   * Create a new renderer instance
   * @param {Object} adapter - Platform adapter instance
   */
  constructor(adapter) {
    this.adapter = adapter;
  }

  /**
   * Load partials from a directory
   * @param {string} dir - Directory containing partial templates
   * @returns {Object} Map of partial name -> content
   */
  loadPartialsFromDir(dir) {
    const partials = {};

    if (!fs.existsSync(dir)) {
      return partials;
    }

    fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .forEach(file => {
        const name = path.basename(file, '.md');
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        partials[name] = content;
      });

    return partials;
  }

  /**
   * Get default template content
   * @returns {string} Default template
   */
  getDefaultTemplate() {
    return `# {{platformDisplayName}} Runbook: {{identifier}}

**Last Updated:** {{lastUpdated}}
**Observations:** {{observationCount}}

---

## Platform Overview

{{#if platformDescription}}
{{platformDescription}}
{{else}}
This runbook documents the operational patterns for this {{platformDisplayName}} instance.
{{/if}}

---

## Data Model

{{#if objects}}
{{#each objects}}
### {{this.name}}
- **API Name:** {{this.api_name}}
- **Record Count:** {{this.record_count}}
- **Custom Fields:** {{this.custom_fields_count}}

{{/each}}
{{else}}
No objects documented yet.
{{/if}}

---

## Key Workflows

{{#if workflows}}
{{#each workflows}}
### {{this.name}}
- **Type:** {{this.type}}
- **Status:** {{this.status}}

{{/each}}
{{else}}
No workflows documented yet.
{{/if}}

---

## Known Exceptions

{{#if known_exceptions}}
{{#each known_exceptions}}
### {{this.name}}
{{this.description}}

**Workaround:** {{this.workaround}}

{{/each}}
{{else}}
No exceptions documented.
{{/if}}

---

## Recommendations

{{#if recommendations}}
{{#each recommendations}}
- {{this}}
{{/each}}
{{else}}
No recommendations at this time.
{{/if}}

---

*Generated by OpsPal by RevPal*
`;
  }

  /**
   * Render a runbook from template and data
   * @param {Object} data - Data to render
   * @param {string} [templatePath] - Custom template path
   * @returns {Promise<string>} Rendered runbook content
   */
  async render(data, templatePath) {
    // Load template
    let template;
    if (templatePath && fs.existsSync(templatePath)) {
      template = fs.readFileSync(templatePath, 'utf-8');
    } else {
      // Try adapter's template paths
      const adapterPaths = this.adapter.getTemplatePaths();
      if (adapterPaths.base && fs.existsSync(adapterPaths.base)) {
        template = fs.readFileSync(adapterPaths.base, 'utf-8');
      } else {
        template = this.getDefaultTemplate();
      }
    }

    // Load partials
    const partials = {};

    // Load shared partials
    const frameworkRoot = path.resolve(__dirname, '..');
    const sharedPartialsDir = path.join(frameworkRoot, 'templates', 'shared');
    Object.assign(partials, this.loadPartialsFromDir(sharedPartialsDir));

    // Load platform-specific partials
    const platformPartialsDir = path.join(frameworkRoot, 'templates', this.adapter.platform);
    Object.assign(partials, this.loadPartialsFromDir(platformPartialsDir));

    // Create engine and render
    const engine = new SimpleTemplateEngine(template, { partials });
    return engine.render(data);
  }

  /**
   * Render a partial directly
   * @param {string} partialName - Name of partial to render
   * @param {Object} data - Data context
   * @returns {string} Rendered partial
   */
  renderPartial(partialName, data) {
    const frameworkRoot = path.resolve(__dirname, '..');

    // Try platform-specific first
    let partialPath = path.join(frameworkRoot, 'templates', this.adapter.platform, `${partialName}.md`);
    if (!fs.existsSync(partialPath)) {
      // Fall back to shared
      partialPath = path.join(frameworkRoot, 'templates', 'shared', `${partialName}.md`);
    }

    if (!fs.existsSync(partialPath)) {
      throw new Error(`Partial not found: ${partialName}`);
    }

    const partial = fs.readFileSync(partialPath, 'utf-8');
    const engine = new SimpleTemplateEngine(partial);
    return engine.render(data);
  }
}

// Export
module.exports = RunbookRenderer;

// Also export template engine for direct use
module.exports.SimpleTemplateEngine = SimpleTemplateEngine;
