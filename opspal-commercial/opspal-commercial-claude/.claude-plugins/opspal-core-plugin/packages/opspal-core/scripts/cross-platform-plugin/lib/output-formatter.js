#!/usr/bin/env node

/**
 * Output Formatter Library
 *
 * Purpose: Provides consistent, branded formatting for all hook outputs
 *          using standardized templates.
 *
 * Pattern: Adopted from claude-code-hooks-mastery repository
 *          https://github.com/disler/claude-code-hooks-mastery
 *
 * Usage:
 *   const OutputFormatter = require('./output-formatter');
 *
 *   // Error message
 *   OutputFormatter.error('Deployment Failed', {
 *     description: 'Validation errors detected',
 *     details: { component: 'Account.cls', error: 'INVALID_FIELD' },
 *     recommendations: ['Verify field exists', 'Check API name']
 *   });
 *
 *   // Success message
 *   OutputFormatter.success('Deployment Complete', {
 *     summary: 'Deployed 15 components',
 *     metrics: { components: 15, coverage: '87%', duration: '3m 24s' }
 *   });
 *
 * Features:
 *   - Consistent formatting across all hooks
 *   - Color-coded message types
 *   - Structured output with sections
 *   - Automatic line wrapping
 *   - Markdown support
 */

class OutputFormatter {
  /**
   * Format an error message
   * @param {string} title - Error title
   * @param {object} options - Additional options
   */
  static error(title, options = {}) {
    const {
      description = '',
      details = null,
      recommendations = [],
      footer = '',
      exitCode = 1
    } = options;

    let output = `❌ **${title}**\n\n`;

    if (description) {
      output += `${description}\n\n`;
    }

    if (details) {
      output += `**Details:**\n`;
      if (typeof details === 'object') {
        for (const [key, value] of Object.entries(details)) {
          output += `- ${key}: ${value}\n`;
        }
      } else {
        output += `${details}\n`;
      }
      output += '\n';
    }

    if (recommendations && recommendations.length > 0) {
      output += `**Recommendations:**\n`;
      recommendations.forEach((rec, i) => {
        output += `${i + 1}. ${rec}\n`;
      });
      output += '\n';
    }

    if (footer) {
      output += `${footer}\n`;
    }

    return {
      message: output.trim(),
      exitCode,
      type: 'error'
    };
  }

  /**
   * Format a warning message
   * @param {string} title - Warning title
   * @param {object} options - Additional options
   */
  static warning(title, options = {}) {
    const {
      description = '',
      context = null,
      suggestions = [],
      footer = '',
      exitCode = 2
    } = options;

    let output = `⚠️  **${title}**\n\n`;

    if (description) {
      output += `${description}\n\n`;
    }

    if (context) {
      output += `**Context:**\n`;
      if (typeof context === 'object') {
        for (const [key, value] of Object.entries(context)) {
          output += `- ${key}: ${value}\n`;
        }
      } else {
        output += `${context}\n`;
      }
      output += '\n';
    }

    if (suggestions && suggestions.length > 0) {
      output += `**Suggestions:**\n`;
      suggestions.forEach((sug, i) => {
        output += `${i + 1}. ${sug}\n`;
      });
      output += '\n';
    }

    if (footer) {
      output += `${footer}\n`;
    }

    return {
      message: output.trim(),
      exitCode,
      type: 'warning'
    };
  }

  /**
   * Format a success message
   * @param {string} title - Success title
   * @param {object} options - Additional options
   */
  static success(title, options = {}) {
    const {
      summary = '',
      metrics = null,
      nextSteps = [],
      footer = '',
      exitCode = 0
    } = options;

    let output = `✅ **${title}**\n\n`;

    if (summary) {
      output += `${summary}\n\n`;
    }

    if (metrics) {
      output += `**Metrics:**\n`;
      if (typeof metrics === 'object') {
        for (const [key, value] of Object.entries(metrics)) {
          output += `- ${key}: ${value}\n`;
        }
      } else {
        output += `${metrics}\n`;
      }
      output += '\n';
    }

    if (nextSteps && nextSteps.length > 0) {
      output += `**Next Steps:**\n`;
      nextSteps.forEach((step, i) => {
        output += `${i + 1}. ${step}\n`;
      });
      output += '\n';
    }

    if (footer) {
      output += `${footer}\n`;
    }

    return {
      message: output.trim(),
      exitCode,
      type: 'success'
    };
  }

  /**
   * Format an info message
   * @param {string} title - Info title
   * @param {object} options - Additional options
   */
  static info(title, options = {}) {
    const {
      content = '',
      details = null,
      footer = '',
      exitCode = 0
    } = options;

    let output = `ℹ️  **${title}**\n\n`;

    if (content) {
      output += `${content}\n\n`;
    }

    if (details) {
      output += `**Details:**\n`;
      if (typeof details === 'object') {
        for (const [key, value] of Object.entries(details)) {
          const icon = value === true || value === 'true' ? '✓' :
                       value === false || value === 'false' ? '✗' : '';
          output += `- ${icon} ${key}: ${value}\n`;
        }
      } else {
        output += `${details}\n`;
      }
      output += '\n';
    }

    if (footer) {
      output += `${footer}\n`;
    }

    return {
      message: output.trim(),
      exitCode,
      type: 'info'
    };
  }

  /**
   * Format a progress update
   * @param {string} message - Progress message
   * @param {object} options - Progress options
   */
  static progress(message, options = {}) {
    const {
      current = 0,
      total = 0,
      percentage = null,
      eta = null
    } = options;

    let output = `⏳ ${message}`;

    if (total > 0) {
      output += ` [${current}/${total}]`;
    }

    if (percentage !== null) {
      output += ` (${percentage}%)`;
    }

    if (eta) {
      output += ` - ETA: ${eta}`;
    }

    return {
      message: output,
      exitCode: 0,
      type: 'progress'
    };
  }

  /**
   * Format output for hook response
   * @param {object} formatted - Formatted output from error/warning/success/info
   * @param {boolean} toStderr - Output to stderr for hooks
   */
  static output(formatted, toStderr = true) {
    const stream = toStderr ? process.stderr : process.stdout;
    stream.write(formatted.message + '\n');
    return formatted.exitCode;
  }

  /**
   * Format and exit (for hooks)
   * @param {object} formatted - Formatted output
   */
  static outputAndExit(formatted) {
    const stream = (formatted.type === 'error' || formatted.type === 'warning')
      ? process.stderr
      : process.stdout;

    stream.write(formatted.message + '\n');
    process.exit(formatted.exitCode);
  }

  /**
   * Create a formatted table
   * @param {array} rows - Array of row objects
   * @param {array} columns - Column definitions
   */
  static table(rows, columns) {
    if (!rows || rows.length === 0) {
      return 'No data available';
    }

    // Calculate column widths
    const widths = columns.map(col => {
      const headerWidth = col.label.length;
      const dataWidth = Math.max(...rows.map(row =>
        String(row[col.key] || '').length
      ));
      return Math.max(headerWidth, dataWidth);
    });

    // Build header
    let output = '';
    output += '| ';
    columns.forEach((col, i) => {
      output += col.label.padEnd(widths[i]) + ' | ';
    });
    output += '\n';

    // Build separator
    output += '|';
    columns.forEach((col, i) => {
      output += '-'.repeat(widths[i] + 2) + '|';
    });
    output += '\n';

    // Build rows
    rows.forEach(row => {
      output += '| ';
      columns.forEach((col, i) => {
        const value = String(row[col.key] || '');
        output += value.padEnd(widths[i]) + ' | ';
      });
      output += '\n';
    });

    return output;
  }

  /**
   * Wrap text to specified width
   * @param {string} text - Text to wrap
   * @param {number} width - Maximum line width
   */
  static wrap(text, width = 80) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      if ((currentLine + word).length > width) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine += word + ' ';
      }
    });

    if (currentLine) {
      lines.push(currentLine.trim());
    }

    return lines.join('\n');
  }
}

/**
 * CLI usage
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'demo-error') {
    const formatted = OutputFormatter.error('Deployment Failed', {
      description: 'The Salesforce deployment encountered validation errors.',
      details: {
        component: 'Account.cls',
        error: 'INVALID_FIELD_FOR_INSERT_UPDATE',
        line: 42,
        field: 'CustomField__c'
      },
      recommendations: [
        'Verify the field exists in the target org',
        'Check field API name matches exactly',
        'Ensure field is accessible by deployment user'
      ],
      footer: 'Run /reflect to report this issue'
    });
    OutputFormatter.output(formatted);

  } else if (command === 'demo-warning') {
    const formatted = OutputFormatter.warning('Low Confidence Routing', {
      description: 'The routing system has moderate confidence in agent recommendation.',
      context: {
        'Recommended Agent': 'sfdc-metadata-manager',
        'Confidence': '65%',
        'Complexity': '0.45',
        'Keywords Matched': '3/5'
      },
      suggestions: [
        'Review alternative agents if task has specific requirements',
        'Use [USE: agent-name] to override routing',
        'Increase ROUTING_CONFIDENCE_THRESHOLD for more certainty'
      ],
      footer: 'Proceeding with recommended agent...'
    });
    OutputFormatter.output(formatted);

  } else if (command === 'demo-success') {
    const formatted = OutputFormatter.success('Deployment Complete', {
      summary: 'Successfully deployed 15 components to production org.',
      metrics: {
        'Components Deployed': 15,
        'Tests Run': 42,
        'Code Coverage': '87%',
        'Duration': '3m 24s'
      },
      nextSteps: [
        'Verify changes in production',
        'Monitor for errors in next 24 hours',
        'Update documentation if needed'
      ],
      footer: 'Org: production-org | User: deployment@company.com'
    });
    OutputFormatter.output(formatted, false);

  } else if (command === 'demo-table') {
    const data = [
      { hook: 'pre-compact', executions: 145, avgTime: '23ms', errors: 0 },
      { hook: 'post-tool-use', executions: 1523, avgTime: '187ms', errors: 8 },
      { hook: 'pre-operation-idempotency', executions: 89, avgTime: '45ms', errors: 2 }
    ];

    const columns = [
      { key: 'hook', label: 'Hook Name' },
      { key: 'executions', label: 'Executions' },
      { key: 'avgTime', label: 'Avg Time' },
      { key: 'errors', label: 'Errors' }
    ];

    console.log(OutputFormatter.table(data, columns));

  } else if (command === 'warning' || command === 'warn') {
    // CLI usage for bash hooks: node output-formatter.js warning "title" "description" "key:value,key:value" "suggestion,suggestion"
    const title = args[1] || 'Warning';
    const description = args[2] || '';
    const contextStr = args[3] || '';
    const suggestionsStr = args[4] || '';
    const footer = args[5] || '';

    // Parse context
    const context = {};
    if (contextStr) {
      contextStr.split(',').forEach(pair => {
        const [key, value] = pair.split(':');
        if (key && value) context[key.trim()] = value.trim();
      });
    }

    // Parse suggestions
    const suggestions = suggestionsStr ? suggestionsStr.split(',').map(s => s.trim()) : [];

    const formatted = OutputFormatter.warning(title, {
      description,
      context: Object.keys(context).length > 0 ? context : null,
      suggestions,
      footer
    });
    OutputFormatter.outputAndExit(formatted);

  } else if (command === 'error' || command === 'err') {
    // CLI usage: node output-formatter.js error "title" "description" "key:value,key:value" "rec,rec"
    const title = args[1] || 'Error';
    const description = args[2] || '';
    const detailsStr = args[3] || '';
    const recommendationsStr = args[4] || '';
    const footer = args[5] || '';

    // Parse details
    const details = {};
    if (detailsStr) {
      detailsStr.split(',').forEach(pair => {
        const [key, value] = pair.split(':');
        if (key && value) details[key.trim()] = value.trim();
      });
    }

    // Parse recommendations
    const recommendations = recommendationsStr ? recommendationsStr.split(',').map(r => r.trim()) : [];

    const formatted = OutputFormatter.error(title, {
      description,
      details: Object.keys(details).length > 0 ? details : null,
      recommendations,
      footer
    });
    OutputFormatter.outputAndExit(formatted);

  } else if (command === 'success' || command === 'ok') {
    // CLI usage: node output-formatter.js success "title" "summary" "key:value,key:value" "step,step"
    const title = args[1] || 'Success';
    const summary = args[2] || '';
    const metricsStr = args[3] || '';
    const nextStepsStr = args[4] || '';
    const footer = args[5] || '';

    // Parse metrics
    const metrics = {};
    if (metricsStr) {
      metricsStr.split(',').forEach(pair => {
        const [key, value] = pair.split(':');
        if (key && value) metrics[key.trim()] = value.trim();
      });
    }

    // Parse next steps
    const nextSteps = nextStepsStr ? nextStepsStr.split(',').map(s => s.trim()) : [];

    const formatted = OutputFormatter.success(title, {
      summary,
      metrics: Object.keys(metrics).length > 0 ? metrics : null,
      nextSteps,
      footer
    });
    OutputFormatter.outputAndExit(formatted);

  } else if (command === 'info' || command === 'information') {
    // CLI usage: node output-formatter.js info "title" "content" "key:value,key:value"
    const title = args[1] || 'Information';
    const content = args[2] || '';
    const detailsStr = args[3] || '';
    const footer = args[4] || '';

    // Parse details
    const details = {};
    if (detailsStr) {
      detailsStr.split(',').forEach(pair => {
        const [key, value] = pair.split(':');
        if (key && value) details[key.trim()] = value.trim();
      });
    }

    const formatted = OutputFormatter.info(title, {
      content,
      details: Object.keys(details).length > 0 ? details : null,
      footer
    });
    OutputFormatter.outputAndExit(formatted);

  } else {
    console.log('Output Formatter - Usage:');
    console.log('');
    console.log('Demos:');
    console.log('  node output-formatter.js demo-error    # Demo error format');
    console.log('  node output-formatter.js demo-warning  # Demo warning format');
    console.log('  node output-formatter.js demo-success  # Demo success format');
    console.log('  node output-formatter.js demo-table    # Demo table format');
    console.log('');
    console.log('CLI usage (for bash hooks):');
    console.log('  node output-formatter.js warning "title" "description" "key:val,key:val" "sug,sug"');
    console.log('  node output-formatter.js error "title" "description" "key:val,key:val" "rec,rec"');
    console.log('  node output-formatter.js success "title" "summary" "key:val,key:val" "step,step"');
    console.log('  node output-formatter.js info "title" "content" "key:val,key:val"');
    console.log('');
    console.log('Library usage:');
    console.log('  const OutputFormatter = require("./output-formatter");');
    console.log('  const formatted = OutputFormatter.error("Title", { ... });');
    console.log('  OutputFormatter.output(formatted);');
  }
}

module.exports = OutputFormatter;
