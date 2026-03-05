#!/usr/bin/env node

/**
 * Markdown Report Formatter
 *
 * Intelligently converts repetitive list patterns to tables for better PDF readability.
 * Preserves narrative sections and irregular lists.
 *
 * User Preferences:
 * - Convert lists with 5+ items (aggressive conversion)
 * - Detect consistent patterns and extract to table columns
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

class MarkdownReportFormatter {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.minItemsForTable = options.minItemsForTable || 5; // User preference: 5+ items
    this.minAttributesForTable = options.minAttributesForTable || 3; // 3+ consistent attributes
  }

  /**
   * Format markdown content by converting repetitive lists to tables
   * @param {string} markdown - Input markdown content
   * @returns {{content: string, converted: number, preserved: number}}
   */
  format(markdown) {
    const result = {
      content: markdown,
      converted: 0,
      preserved: 0
    };

    // Split into sections (separated by headers or blank lines)
    const sections = this._splitIntoSections(markdown);
    const formattedSections = [];

    for (const section of sections) {
      // Check if this section contains a convertible list
      const converted = this._tryConvertList(section);

      if (converted.isTable) {
        formattedSections.push(converted.content);
        result.converted++;
        if (this.verbose) {
          console.log(`✓ Converted list to table: ${converted.items} items, ${converted.columns} columns`);
        }
      } else {
        formattedSections.push(section);
        if (section.match(/^\d+\.\s|^[-*]\s/m)) {
          result.preserved++;
        }
      }
    }

    result.content = formattedSections.join('');
    return result;
  }

  /**
   * Split markdown into processable sections
   * @private
   */
  _splitIntoSections(markdown) {
    const sections = [];
    const lines = markdown.split('\n');
    let currentSection = [];
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isListItem = /^\d+\.\s|^[-*]\s/.test(line.trim());

      if (isListItem) {
        if (!inList && currentSection.length > 0) {
          // Save previous non-list section
          sections.push(currentSection.join('\n'));
          currentSection = [];
        }
        inList = true;
        currentSection.push(line);
      } else if (inList && line.trim() === '') {
        // Empty line might be part of list or end of list
        const nextLine = lines[i + 1];
        const nextIsListItem = nextLine && /^\d+\.\s|^[-*]\s/.test(nextLine.trim());

        if (nextIsListItem) {
          currentSection.push(line); // Keep empty line in list
        } else {
          // End of list
          sections.push(currentSection.join('\n'));
          currentSection = [line];
          inList = false;
        }
      } else {
        if (inList) {
          // End of list without blank line
          sections.push(currentSection.join('\n'));
          currentSection = [];
          inList = false;
        }
        currentSection.push(line);
      }
    }

    if (currentSection.length > 0) {
      sections.push(currentSection.join('\n'));
    }

    return sections;
  }

  /**
   * Try to convert a list section to a table
   * @private
   */
  _tryConvertList(section) {
    const result = {
      isTable: false,
      content: section,
      items: 0,
      columns: 0
    };

    // Extract list items
    const items = this._extractListItems(section);

    if (items.length < this.minItemsForTable) {
      return result; // Too few items
    }

    // Analyze patterns in items
    const pattern = this._analyzeListPattern(items);

    if (!pattern || pattern.attributes.length < this.minAttributesForTable) {
      return result; // No consistent pattern
    }

    // Convert to table
    const table = this._createTable(items, pattern, section);

    result.isTable = true;
    result.content = table;
    result.items = items.length;
    result.columns = pattern.attributes.length + 1; // +1 for number column

    return result;
  }

  /**
   * Extract list items from section
   * @private
   */
  _extractListItems(section) {
    const items = [];
    const lines = section.split('\n');
    let currentItem = null;

    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s+(.+)$/);
      if (match) {
        if (currentItem) {
          items.push(currentItem);
        }
        currentItem = {
          number: match[1],
          text: match[2],
          fullText: match[2]
        };
      } else if (currentItem && line.trim()) {
        // Continuation of previous item
        currentItem.fullText += ' ' + line.trim();
      }
    }

    if (currentItem) {
      items.push(currentItem);
    }

    return items;
  }

  /**
   * Analyze list pattern to extract table structure
   * @private
   */
  _analyzeListPattern(items) {
    if (items.length === 0) return null;

    // Common patterns to detect:
    // 1. **Name** (Type) - Timing: X, Condition: Y, Sets Z = W
    // 2. **Name**: Description
    // 3. Name (Type) - Description

    const patterns = [
      // Pattern 1: Automation field collision format
      {
        name: 'automation-collision',
        regex: /^\*\*(.+?)\*\*\s+\((.+?)\)\s+-\s+Timing:\s+(.+?),\s+Condition:\s+(.+?),\s+Sets\s+(.+?)\s+=\s+(.+)$/,
        attributes: ['Automation', 'Type', 'Timing', 'Condition', 'Field', 'Value']
      },
      // Pattern 2: Column definition format
      {
        name: 'column-definition',
        regex: /^###?\s+\d+\.\s+(.+?)\n(.+)$/s,
        attributes: ['Column', 'Description']
      },
      // Pattern 3: Simple name-description format
      {
        name: 'name-description',
        regex: /^\*\*(.+?)\*\*:\s+(.+)$/,
        attributes: ['Name', 'Description']
      },
      // Pattern 4: Name (Type) - Description
      {
        name: 'name-type-description',
        regex: /^(.+?)\s+\((.+?)\)\s+-\s+(.+)$/,
        attributes: ['Name', 'Type', 'Description']
      }
    ];

    // Try each pattern
    for (const pattern of patterns) {
      const matches = items.filter(item => pattern.regex.test(item.fullText));
      const matchRate = matches.length / items.length;

      if (matchRate >= 0.7) { // 70% of items match pattern
        return {
          name: pattern.name,
          regex: pattern.regex,
          attributes: pattern.attributes,
          matchRate
        };
      }
    }

    // Fallback: Try to extract attributes from first item
    const firstItem = items[0].fullText;

    // Look for bold text, parentheses, colons, etc.
    const hasBold = /\*\*(.+?)\*\*/.test(firstItem);
    const hasParens = /\((.+?)\)/.test(firstItem);
    const hasColons = firstItem.split(':').length > 1;

    if (hasBold || hasParens || hasColons) {
      // Generic extraction
      const attributes = [];
      if (hasBold) attributes.push('Name');
      if (hasParens) attributes.push('Type');
      if (hasColons) attributes.push('Description');

      return {
        name: 'generic',
        regex: null,
        attributes,
        matchRate: 1.0
      };
    }

    return null;
  }

  /**
   * Create markdown table from items and pattern
   * @private
   */
  _createTable(items, pattern, originalSection) {
    // Extract header and footer from original section
    const lines = originalSection.split('\n');
    const firstListIndex = lines.findIndex(l => /^\d+\.\s/.test(l));
    const header = firstListIndex > 0 ? lines.slice(0, firstListIndex).join('\n') + '\n\n' : '';

    // Build table
    let table = header;

    // Table header
    table += '| # | ' + pattern.attributes.join(' | ') + ' |\n';
    table += '|---' + '|---'.repeat(pattern.attributes.length) + '|\n';

    // Table rows
    for (const item of items) {
      if (pattern.regex) {
        const match = item.fullText.match(pattern.regex);
        if (match) {
          const values = match.slice(1); // Extract captured groups
          const escapedValues = values.map(v => this._escapeTableCell(v));
          table += '| ' + item.number + ' | ' + escapedValues.join(' | ') + ' |\n';
        } else {
          // Fallback for non-matching items
          table += '| ' + item.number + ' | ' + this._escapeTableCell(item.fullText) + ' |'.padEnd(pattern.attributes.length, ' | |') + '\n';
        }
      } else {
        // Generic extraction for items without regex
        const extracted = this._genericExtract(item.fullText, pattern.attributes);
        table += '| ' + item.number + ' | ' + extracted.join(' | ') + ' |\n';
      }
    }

    return table + '\n';
  }

  /**
   * Generic attribute extraction
   * @private
   */
  _genericExtract(text, attributes) {
    const values = [];

    for (const attr of attributes) {
      if (attr === 'Name') {
        const match = text.match(/\*\*(.+?)\*\*/);
        values.push(this._escapeTableCell(match ? match[1] : ''));
      } else if (attr === 'Type') {
        const match = text.match(/\((.+?)\)/);
        values.push(this._escapeTableCell(match ? match[1] : ''));
      } else if (attr === 'Description') {
        // Everything after first colon or dash
        const match = text.match(/[:\-]\s+(.+)/);
        values.push(this._escapeTableCell(match ? match[1] : text));
      } else {
        values.push(''); // Unknown attribute
      }
    }

    return values;
  }

  /**
   * Escape pipe characters in table cells
   * @private
   */
  _escapeTableCell(text) {
    return text
      .replace(/\|/g, '\\|')  // Escape pipes
      .replace(/\n/g, ' ')    // Remove newlines
      .trim();
  }

  /**
   * Generate summary report
   */
  generateSummary(result) {
    let summary = `Markdown Formatting:\n`;
    summary += `  Converted to tables: ${result.converted} list(s)\n`;
    summary += `  Preserved as lists: ${result.preserved} list(s)\n`;
    return summary;
  }
}

module.exports = MarkdownReportFormatter;

// CLI usage
if (require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: markdown-report-formatter.js <input.md> [output.md] [--verbose]');
    console.log('\nConverts repetitive lists to tables for better PDF readability.');
    console.log('\nOptions:');
    console.log('  --verbose    Show detailed processing information');
    console.log('\nExample:');
    console.log('  node markdown-report-formatter.js report.md report-formatted.md --verbose');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputFile = args[1] && !args[1].startsWith('--') ? args[1] : inputFile;
  const verbose = args.includes('--verbose');

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file not found: ${inputFile}`);
    process.exit(1);
  }

  console.log(`Processing: ${inputFile}`);

  const markdown = fs.readFileSync(inputFile, 'utf8');
  const formatter = new MarkdownReportFormatter({ verbose });
  const result = formatter.format(markdown);

  // Write output
  fs.writeFileSync(outputFile, result.content, 'utf8');

  // Print summary
  console.log('\n' + formatter.generateSummary(result));

  if (outputFile !== inputFile) {
    console.log(`\nOutput written to: ${outputFile}`);
  } else {
    console.log(`\nFile updated in place: ${outputFile}`);
  }

  process.exit(0);
}
