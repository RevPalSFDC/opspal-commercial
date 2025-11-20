#!/usr/bin/env node

/**
 * Error Handler Utility
 *
 * Loads and formats error messages from YAML templates
 * Provides consistent error display across all plugins
 *
 * Usage:
 *   const { ErrorHandler } = require('./error-handler');
 *   const handler = new ErrorHandler('salesforce'); // or 'hubspot', 'cross-platform'
 *
 *   // Format and display error
 *   handler.display('ERR-101', { org_alias: 'production' });
 *
 *   // Get error object only
 *   const error = handler.format('ERR-201', { error_details: 'Field not found' });
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class ErrorHandler {
  /**
   * Initialize error handler for a specific plugin
   * @param {string} plugin - Plugin name: 'salesforce', 'hubspot', or 'cross-platform'
   */
  constructor(plugin) {
    this.plugin = plugin;
    this.errors = this.loadErrorTemplates(plugin);
  }

  /**
   * Load error templates from YAML file
   * @param {string} plugin - Plugin name
   * @returns {Object} Error templates
   */
  loadErrorTemplates(plugin) {
    const pluginMap = {
      'salesforce': 'salesforce-essentials',
      'hubspot': 'hubspot-essentials',
      'cross-platform': 'cross-platform-essentials'
    };

    const pluginDir = pluginMap[plugin];
    if (!pluginDir) {
      throw new Error(`Unknown plugin: ${plugin}. Use 'salesforce', 'hubspot', or 'cross-platform'`);
    }

    const templatePath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      `${pluginDir}`,
      'templates',
      'error-messages.yaml'
    );

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Error template not found: ${templatePath}`);
    }

    const content = fs.readFileSync(templatePath, 'utf8');
    return yaml.load(content);
  }

  /**
   * Format error message with variable substitution
   * @param {string} errorCode - Error code (e.g., 'ERR-101', 'ERR-HUB-201', 'ERR-CP-301')
   * @param {Object} variables - Variables to substitute in message
   * @returns {Object} Formatted error object
   */
  format(errorCode, variables = {}) {
    const error = this.errors[errorCode];

    if (!error) {
      return {
        code: 'ERR-999',
        title: 'Unknown Error',
        message: `Error code ${errorCode} not found in error templates`,
        causes: ['Invalid error code'],
        next_steps: ['Check error code spelling', 'Report this issue'],
        severity: 'high'
      };
    }

    // Substitute variables in message
    let message = error.message;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`{${key}}`, 'g'), value);
    }

    return {
      code: errorCode,
      title: error.title,
      message: message,
      causes: error.causes || [],
      next_steps: error.next_steps || [],
      related_agents: error.related_agents || [],
      related_commands: error.related_commands || [],
      severity: error.severity || 'medium'
    };
  }

  /**
   * Display formatted error message to console
   * @param {string} errorCode - Error code
   * @param {Object} variables - Variables to substitute
   */
  display(errorCode, variables = {}) {
    const error = this.format(errorCode, variables);
    console.error(this.formatOutput(error));
  }

  /**
   * Format error object as human-readable string
   * @param {Object} error - Formatted error object
   * @returns {string} Formatted error message
   */
  formatOutput(error) {
    let output = `\n❌ ${error.title} (${error.code})\n\n`;
    output += `${error.message}\n`;

    if (error.causes && error.causes.length > 0) {
      output += `\n**Possible Causes:**\n`;
      error.causes.forEach(cause => {
        output += `  • ${cause}\n`;
      });
    }

    if (error.next_steps && error.next_steps.length > 0) {
      output += `\n**Next Steps:**\n`;
      error.next_steps.forEach(step => {
        output += `  ${step}\n`;
      });
    }

    if (error.related_agents && error.related_agents.length > 0) {
      output += `\n**Related Agents:**\n`;
      error.related_agents.forEach(agent => {
        output += `  • ${agent}\n`;
      });
    }

    if (error.related_commands && error.related_commands.length > 0) {
      output += `\n**Related Commands:**\n`;
      error.related_commands.forEach(cmd => {
        output += `  • ${cmd}\n`;
      });
    }

    output += `\n**Severity:** ${error.severity.toUpperCase()}\n`;

    return output;
  }

  /**
   * Get error as JSON (useful for API responses)
   * @param {string} errorCode - Error code
   * @param {Object} variables - Variables to substitute
   * @returns {string} JSON formatted error
   */
  toJSON(errorCode, variables = {}) {
    const error = this.format(errorCode, variables);
    return JSON.stringify(error, null, 2);
  }

  /**
   * Throw error with formatted message
   * @param {string} errorCode - Error code
   * @param {Object} variables - Variables to substitute
   * @throws {Error} Formatted error
   */
  throw(errorCode, variables = {}) {
    const error = this.format(errorCode, variables);
    const errorObj = new Error(this.formatOutput(error));
    errorObj.code = errorCode;
    errorObj.severity = error.severity;
    errorObj.details = error;
    throw errorObj;
  }

  /**
   * Check if error code exists
   * @param {string} errorCode - Error code to check
   * @returns {boolean} True if error exists
   */
  exists(errorCode) {
    return !!this.errors[errorCode];
  }

  /**
   * List all error codes for this plugin
   * @returns {string[]} Array of error codes
   */
  listErrorCodes() {
    return Object.keys(this.errors).sort();
  }

  /**
   * Get errors by category (based on code range)
   * @param {string} category - Category code range (e.g., '100-199' for connection errors)
   * @returns {Object} Errors in category
   */
  getByCategory(category) {
    const [start, end] = category.split('-').map(Number);
    const categoryErrors = {};

    Object.entries(this.errors).forEach(([code, error]) => {
      const numericCode = parseInt(code.match(/\d+/)[0]);
      if (numericCode >= start && numericCode <= end) {
        categoryErrors[code] = error;
      }
    });

    return categoryErrors;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Error Handler Utility - Display formatted error messages

Usage:
  node error-handler.js <plugin> <error-code> [variables-json]

  <plugin>       : salesforce, hubspot, or cross-platform
  <error-code>   : Error code (e.g., ERR-101, ERR-HUB-201, ERR-CP-301)
  [variables-json]: Optional JSON object with variables (e.g., '{"org_alias":"prod"}')

Commands:
  node error-handler.js <plugin> list              - List all error codes
  node error-handler.js <plugin> category <range>  - Show errors in category (e.g., "100-199")

Examples:
  node error-handler.js salesforce ERR-101 '{"org_alias":"production"}'
  node error-handler.js hubspot ERR-HUB-201 '{"property_name":"email"}'
  node error-handler.js cross-platform ERR-CP-101
  node error-handler.js salesforce list
  node error-handler.js hubspot category 200-299
`);
    process.exit(0);
  }

  const plugin = args[0];
  const command = args[1];

  try {
    const handler = new ErrorHandler(plugin);

    if (command === 'list') {
      console.log(`\nError codes for ${plugin}:\n`);
      handler.listErrorCodes().forEach(code => {
        const error = handler.errors[code];
        console.log(`  ${code}: ${error.title}`);
      });
      console.log('');
    } else if (command === 'category' && args[2]) {
      const category = args[2];
      console.log(`\nErrors in category ${category} for ${plugin}:\n`);
      const errors = handler.getByCategory(category);
      Object.entries(errors).forEach(([code, error]) => {
        console.log(`  ${code}: ${error.title}`);
      });
      console.log('');
    } else {
      const errorCode = command;
      const variables = args[2] ? JSON.parse(args[2]) : {};
      handler.display(errorCode, variables);
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = { ErrorHandler };
