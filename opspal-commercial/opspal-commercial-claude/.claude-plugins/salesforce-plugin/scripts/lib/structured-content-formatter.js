#!/usr/bin/env node
/**
 * Structured Content Formatter
 *
 * Helper library for formatting script outputs in structured formats that
 * Claude Code displays beautifully. Provides consistent formatting for:
 * - Tables (markdown)
 * - Code blocks with syntax highlighting
 * - Section headers with emojis
 * - Lists (bulleted, numbered)
 * - JSON with metadata
 * - Progress indicators
 * - Status badges
 *
 * Features Claude Code v2.0.32 structured content patterns.
 *
 * Usage:
 *   const { StructuredFormatter } = require('./structured-content-formatter');
 *   const formatter = new StructuredFormatter();
 *
 *   // Format table
 *   console.log(formatter.table(data, columns));
 *
 *   // Format code block
 *   console.log(formatter.codeBlock(code, 'javascript'));
 *
 *   // Format section
 *   console.log(formatter.section('Analysis Results', { emoji: '📊', level: 2 }));
 *
 * @version 1.0.0
 * @date 2025-11-04
 * @feature Claude Code v2.0.32 Integration
 */

class StructuredFormatter {
  constructor(options = {}) {
    this.options = {
      emojiEnabled: options.emojiEnabled !== false,
      colorEnabled: options.colorEnabled !== false,
      indentSize: options.indentSize || 2,
      maxTableWidth: options.maxTableWidth || 120,
      theme: options.theme || 'default' // default, compact, verbose
    };

    // Emoji mappings for common sections
    this.sectionEmojis = {
      summary: '📊',
      analysis: '🔍',
      results: '✅',
      errors: '❌',
      warnings: '⚠️',
      info: 'ℹ️',
      metrics: '📈',
      configuration: '⚙️',
      deployment: '🚀',
      security: '🔐',
      performance: '⚡',
      database: '💾',
      api: '🔌',
      testing: '🧪',
      documentation: '📚',
      completion: '✓',
      progress: '⏳'
    };

    // Status badge symbols
    this.statusSymbols = {
      success: '✅',
      failed: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      pending: '⏳',
      skipped: '⏭️',
      blocked: '🚫',
      active: '🟢',
      inactive: '🔴'
    };
  }

  /**
   * Format a markdown table from data
   *
   * @param {Array<Object>} data - Array of objects to display
   * @param {Array<string>|Object} columns - Column names or {key: 'Display Name'}
   * @param {Object} options - Formatting options
   * @returns {string} Formatted markdown table
   *
   * @example
   * formatter.table(
   *   [{ name: 'Account', count: 150 }, { name: 'Contact', count: 300 }],
   *   ['name', 'count']
   * );
   *
   * @example
   * formatter.table(
   *   data,
   *   { name: 'Object Name', count: 'Record Count' },
   *   { align: { count: 'right' } }
   * );
   */
  table(data, columns, options = {}) {
    if (!data || data.length === 0) {
      return this.infoBox('No data to display');
    }

    // Normalize columns
    const columnDefs = Array.isArray(columns)
      ? columns.reduce((acc, col) => ({ ...acc, [col]: col }), {})
      : columns;

    const keys = Object.keys(columnDefs);
    const headers = Object.values(columnDefs);

    // Calculate column widths
    const widths = keys.map(key => {
      const headerWidth = columnDefs[key].length;
      const dataWidth = Math.max(...data.map(row =>
        String(row[key] || '').length
      ));
      return Math.max(headerWidth, dataWidth);
    });

    // Build table header
    let table = '| ' + headers.map((header, i) =>
      header.padEnd(widths[i])
    ).join(' | ') + ' |\n';

    // Add separator
    table += '|' + widths.map(width =>
      '-'.repeat(width + 2)
    ).join('|') + '|\n';

    // Add data rows
    data.forEach(row => {
      table += '| ' + keys.map((key, i) => {
        const value = row[key] !== undefined ? String(row[key]) : '';
        const align = options.align?.[key] || 'left';
        return align === 'right'
          ? value.padStart(widths[i])
          : value.padEnd(widths[i]);
      }).join(' | ') + ' |\n';
    });

    return table;
  }

  /**
   * Format a code block with syntax highlighting
   *
   * @param {string} code - Code to display
   * @param {string} language - Language for syntax highlighting
   * @param {Object} options - Formatting options
   * @returns {string} Formatted code block
   *
   * @example
   * formatter.codeBlock('SELECT Id FROM Account', 'sql');
   * formatter.codeBlock(JSON.stringify(data, null, 2), 'json');
   */
  codeBlock(code, language = '', options = {}) {
    const title = options.title ? `// ${options.title}\n` : '';
    return `\`\`\`${language}\n${title}${code}\n\`\`\``;
  }

  /**
   * Format a section header
   *
   * @param {string} title - Section title
   * @param {Object} options - Header options
   * @returns {string} Formatted section header
   *
   * @example
   * formatter.section('Analysis Results', { emoji: '📊', level: 2 });
   * formatter.section('Summary', { type: 'summary', level: 1 });
   */
  section(title, options = {}) {
    const level = options.level || 2;
    const emoji = options.emoji
      || (options.type && this.sectionEmojis[options.type])
      || '';

    const emojiPrefix = emoji && this.options.emojiEnabled
      ? `${emoji} `
      : '';

    const hashes = '#'.repeat(level);
    const divider = options.divider ? '\n' + '─'.repeat(60) + '\n' : '';

    return `${divider}${hashes} ${emojiPrefix}${title}\n`;
  }

  /**
   * Format a bulleted list
   *
   * @param {Array<string>} items - List items
   * @param {Object} options - List options
   * @returns {string} Formatted bulleted list
   *
   * @example
   * formatter.bulletList(['Item 1', 'Item 2', 'Item 3']);
   * formatter.bulletList(items, { emoji: '→', indent: 2 });
   */
  bulletList(items, options = {}) {
    const bullet = options.emoji || '-';
    const indent = ' '.repeat(options.indent || 0);

    return items.map(item => `${indent}${bullet} ${item}`).join('\n');
  }

  /**
   * Format a numbered list
   *
   * @param {Array<string>} items - List items
   * @param {Object} options - List options
   * @returns {string} Formatted numbered list
   *
   * @example
   * formatter.numberedList(['First step', 'Second step', 'Third step']);
   */
  numberedList(items, options = {}) {
    const indent = ' '.repeat(options.indent || 0);
    const startFrom = options.startFrom || 1;

    return items.map((item, i) =>
      `${indent}${i + startFrom}. ${item}`
    ).join('\n');
  }

  /**
   * Format a status badge
   *
   * @param {string} status - Status type (success, failed, warning, etc.)
   * @param {string} message - Status message
   * @returns {string} Formatted status badge
   *
   * @example
   * formatter.statusBadge('success', 'Deployment completed');
   * formatter.statusBadge('failed', 'Validation failed');
   */
  statusBadge(status, message) {
    const symbol = this.statusSymbols[status] || status;
    return `${symbol} **${message}**`;
  }

  /**
   * Format a metrics summary
   *
   * @param {Object} metrics - Metrics object
   * @param {Object} options - Formatting options
   * @returns {string} Formatted metrics display
   *
   * @example
   * formatter.metricsSummary({
   *   'Total Records': 1500,
   *   'Success Rate': '95.2%',
   *   'Duration': '2.5s'
   * });
   */
  metricsSummary(metrics, options = {}) {
    const entries = Object.entries(metrics);
    const maxKeyLength = Math.max(...entries.map(([k]) => k.length));

    let output = '';
    entries.forEach(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      output += `${paddedKey} : ${value}\n`;
    });

    return output;
  }

  /**
   * Format a JSON object with metadata
   *
   * @param {Object} data - Data to format as JSON
   * @param {Object} metadata - Metadata to include
   * @returns {string} Formatted JSON with metadata header
   *
   * @example
   * formatter.jsonWithMetadata(
   *   { result: 'success' },
   *   { timestamp: new Date(), version: '1.0' }
   * );
   */
  jsonWithMetadata(data, metadata = {}) {
    const metaComment = Object.entries(metadata).map(([k, v]) =>
      `// ${k}: ${v}`
    ).join('\n');

    return this.codeBlock(
      `${metaComment ? metaComment + '\n' : ''}${JSON.stringify(data, null, 2)}`,
      'json'
    );
  }

  /**
   * Format a key-value pairs display
   *
   * @param {Object} pairs - Key-value pairs
   * @param {Object} options - Display options
   * @returns {string} Formatted key-value display
   *
   * @example
   * formatter.keyValuePairs({
   *   'Org ID': '00D1234567890',
   *   'Org Name': 'Production',
   *   'API Version': '62.0'
   * });
   */
  keyValuePairs(pairs, options = {}) {
    const separator = options.separator || ':';
    const indent = ' '.repeat(options.indent || 0);

    return Object.entries(pairs).map(([key, value]) =>
      `${indent}**${key}**${separator} ${value}`
    ).join('\n');
  }

  /**
   * Format a summary box
   *
   * @param {string} title - Box title
   * @param {Array<string>|string} content - Box content
   * @param {Object} options - Box options
   * @returns {string} Formatted summary box
   *
   * @example
   * formatter.summaryBox('Quick Stats', [
   *   'Total: 1500',
   *   'Success: 1425',
   *   'Failed: 75'
   * ]);
   */
  summaryBox(title, content, options = {}) {
    const width = options.width || 60;
    const symbol = options.symbol || '═';
    const emoji = options.emoji || this.sectionEmojis[options.type] || '';

    const topBorder = symbol.repeat(width);
    const bottomBorder = symbol.repeat(width);

    const titleLine = emoji
      ? `  ${emoji} ${title}`
      : `  ${title}`;

    const contentLines = Array.isArray(content)
      ? content.map(line => `  ${line}`).join('\n')
      : `  ${content}`;

    return `${topBorder}\n${titleLine}\n${topBorder}\n${contentLines}\n${bottomBorder}`;
  }

  /**
   * Format an info box (lighter style)
   *
   * @param {string} message - Info message
   * @param {Object} options - Box options
   * @returns {string} Formatted info box
   */
  infoBox(message, options = {}) {
    const symbol = options.symbol || 'ℹ️';
    const border = options.border ? '\n' + '─'.repeat(60) : '';
    return `${border}\n${symbol} ${message}${border}`;
  }

  /**
   * Format a warning box
   *
   * @param {string} message - Warning message
   * @param {Array<string>} details - Warning details
   * @returns {string} Formatted warning box
   */
  warningBox(message, details = []) {
    let output = `⚠️  **WARNING**: ${message}\n`;
    if (details.length > 0) {
      output += '\n' + this.bulletList(details);
    }
    return output;
  }

  /**
   * Format an error box
   *
   * @param {string} message - Error message
   * @param {Array<string>} details - Error details
   * @returns {string} Formatted error box
   */
  errorBox(message, details = []) {
    let output = `❌ **ERROR**: ${message}\n`;
    if (details.length > 0) {
      output += '\n' + this.bulletList(details);
    }
    return output;
  }

  /**
   * Format a success box
   *
   * @param {string} message - Success message
   * @param {Object} metrics - Success metrics
   * @returns {string} Formatted success box
   */
  successBox(message, metrics = {}) {
    let output = `✅ **SUCCESS**: ${message}\n`;
    if (Object.keys(metrics).length > 0) {
      output += '\n' + this.metricsSummary(metrics);
    }
    return output;
  }

  /**
   * Format a progress bar (text-based)
   *
   * @param {number} current - Current progress
   * @param {number} total - Total items
   * @param {Object} options - Progress options
   * @returns {string} Formatted progress bar
   *
   * @example
   * formatter.progressBar(75, 100, { width: 40 });
   * // Output: [==============================----------] 75%
   */
  progressBar(current, total, options = {}) {
    const width = options.width || 40;
    const percent = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;

    const bar = '='.repeat(filled) + '-'.repeat(empty);
    const label = options.label || 'Progress';

    return `${label}: [${bar}] ${percent}% (${current}/${total})`;
  }

  /**
   * Format a comparison table (before/after, old/new)
   *
   * @param {Array<Object>} comparisons - Comparison data
   * @param {Object} options - Table options
   * @returns {string} Formatted comparison table
   *
   * @example
   * formatter.comparisonTable([
   *   { item: 'API Calls', before: 1000, after: 750, change: '-25%' },
   *   { item: 'Response Time', before: '2.5s', after: '1.8s', change: '-28%' }
   * ]);
   */
  comparisonTable(comparisons, options = {}) {
    const columns = {
      item: 'Item',
      before: options.beforeLabel || 'Before',
      after: options.afterLabel || 'After',
      change: 'Change'
    };

    return this.table(comparisons, columns);
  }

  /**
   * Format a hierarchical tree structure
   *
   * @param {Object} tree - Tree data
   * @param {Object} options - Tree options
   * @returns {string} Formatted tree
   *
   * @example
   * formatter.tree({
   *   name: 'Account',
   *   children: [
   *     { name: 'Contact', children: [] },
   *     { name: 'Opportunity', children: [] }
   *   ]
   * });
   */
  tree(node, options = {}, level = 0) {
    const indent = '  '.repeat(level);
    const branch = level > 0 ? '├─ ' : '';
    const emoji = options.emoji?.(node) || '';

    let output = `${indent}${branch}${emoji}${node.name}\n`;

    if (node.children && node.children.length > 0) {
      node.children.forEach((child, i) => {
        const isLast = i === node.children.length - 1;
        output += this.tree(child, options, level + 1);
      });
    }

    return output;
  }

  /**
   * Format a timeline of events
   *
   * @param {Array<Object>} events - Timeline events
   * @param {Object} options - Timeline options
   * @returns {string} Formatted timeline
   *
   * @example
   * formatter.timeline([
   *   { timestamp: '10:00', event: 'Started deployment' },
   *   { timestamp: '10:05', event: 'Validation passed' },
   *   { timestamp: '10:10', event: 'Deployment complete' }
   * ]);
   */
  timeline(events, options = {}) {
    const marker = options.marker || '•';

    return events.map(event => {
      const time = event.timestamp;
      const description = event.event;
      const status = event.status ? ` ${this.statusSymbols[event.status]}` : '';

      return `${time} ${marker} ${description}${status}`;
    }).join('\n');
  }

  /**
   * Format a complete report with sections
   *
   * @param {Object} report - Report data
   * @param {Object} options - Report options
   * @returns {string} Formatted complete report
   *
   * @example
   * formatter.report({
   *   title: 'Automation Audit Report',
   *   summary: { total: 150, errors: 5 },
   *   sections: [
   *     { title: 'Overview', content: '...' },
   *     { title: 'Findings', content: '...' }
   *   ]
   * });
   */
  report(report, options = {}) {
    let output = '';

    // Title
    output += this.section(report.title, { level: 1, emoji: report.emoji });
    output += '\n';

    // Summary
    if (report.summary) {
      output += this.section('Summary', { type: 'summary', level: 2 });
      output += this.keyValuePairs(report.summary);
      output += '\n\n';
    }

    // Sections
    if (report.sections) {
      report.sections.forEach(section => {
        output += this.section(section.title, {
          level: section.level || 2,
          emoji: section.emoji,
          type: section.type
        });
        output += section.content + '\n\n';
      });
    }

    // Footer
    if (report.footer) {
      output += '\n' + '─'.repeat(60) + '\n';
      output += report.footer + '\n';
    }

    return output;
  }
}

// Export
module.exports = { StructuredFormatter };

// CLI Testing
if (require.main === module) {
  const formatter = new StructuredFormatter();

  console.log('=== Structured Content Formatter Demo ===\n');

  // Demo table
  console.log(formatter.section('Table Example', { type: 'summary' }));
  console.log(formatter.table(
    [
      { object: 'Account', records: 1500, size: '2.5 MB' },
      { object: 'Contact', records: 3200, size: '5.1 MB' },
      { object: 'Opportunity', records: 850, size: '1.8 MB' }
    ],
    { object: 'Object Name', records: 'Records', size: 'Size' }
  ));
  console.log('');

  // Demo code block
  console.log(formatter.section('Code Block Example', { type: 'api' }));
  console.log(formatter.codeBlock(
    'SELECT Id, Name FROM Account WHERE Industry = \'Technology\'',
    'sql'
  ));
  console.log('');

  // Demo metrics
  console.log(formatter.section('Metrics Example', { type: 'metrics' }));
  console.log(formatter.metricsSummary({
    'Total Records': '1,500',
    'Success Rate': '95.2%',
    'Duration': '2.5 seconds',
    'Throughput': '600 records/sec'
  }));
  console.log('');

  // Demo status badges
  console.log(formatter.section('Status Badges', { type: 'results' }));
  console.log(formatter.statusBadge('success', 'Deployment completed'));
  console.log(formatter.statusBadge('warning', 'Minor issues detected'));
  console.log(formatter.statusBadge('failed', 'Validation failed'));
  console.log('');

  // Demo boxes
  console.log(formatter.section('Message Boxes', { type: 'info' }));
  console.log(formatter.successBox('Operation completed successfully', {
    'Records Processed': 1500,
    'Duration': '2.5s'
  }));
  console.log('');
  console.log(formatter.warningBox('Potential issues detected', [
    'Field API name mismatch on 3 objects',
    'Missing record types on 2 layouts'
  ]));
  console.log('');

  console.log('=== Demo Complete ===');
}
