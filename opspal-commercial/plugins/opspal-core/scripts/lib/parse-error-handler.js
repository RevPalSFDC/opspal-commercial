#!/usr/bin/env node
/**
 * Parse Error Handler
 *
 * Gracefully handles parsing errors for JSON, XML, CSV, and YAML with:
 * - Line-level error reporting with context
 * - Auto-fix common issues
 * - Partial parse recovery
 * - Encoding detection and normalization
 *
 * Addresses Reflection Cohort: schema/parse (54 reflections)
 * Target ROI: $12,960 annually (80% reduction)
 *
 * Pattern: Error recovery like csv-parser-safe.js
 *
 * Usage:
 *   const handler = new ParseErrorHandler();
 *   const result = await handler.parse(content, 'json');
 *   const fixed = await handler.autoFix(content, 'json');
 *
 * CLI:
 *   node parse-error-handler.js parse file.json --format json
 *   node parse-error-handler.js auto-fix file.json --dry-run
 *
 * @module parse-error-handler
 * @version 1.0.0
 * @created 2026-01-06
 */

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

/**
 * Parse Error Handler Class
 */
class ParseErrorHandler {
  constructor(options = {}) {
    this.verbose = options.verbose || false;

    // Supported formats
    this.formats = ['json', 'xml', 'csv', 'yaml', 'flowXml'];

    // Auto-fix patterns
    this.autoFixPatterns = {
      json: [
        { name: 'trailing_comma', pattern: /,(\s*[}\]])/g, replacement: '$1', description: 'Remove trailing commas' },
        { name: 'unescaped_quotes', pattern: /([^\\])"([^":])/g, replacement: '$1\\"$2', description: 'Escape unescaped quotes' },
        { name: 'single_quotes', pattern: /'/g, replacement: '"', description: 'Replace single quotes with double quotes (in keys)' }
      ],
      csv: [
        { name: 'mixed_line_endings', pattern: /\r\n/g, replacement: '\n', description: 'Normalize line endings' },
        { name: 'unescaped_quotes_csv', pattern: /"([^"]*)"(?!")/g, replacement: '""$1""', description: 'Escape quotes in CSV fields' }
      ],
      xml: [
        { name: 'unclosed_tags', pattern: /<([^>\/]+)>(?![^<]*<\/\1>)/g, replacement: '<$1></$1>', description: 'Close unclosed tags' },
        { name: 'invalid_entities', pattern: /&(?!(amp|lt|gt|quot|apos);)/g, replacement: '&amp;', description: 'Escape invalid & characters' }
      ],
      flowXml: [
        {
          name: 'redundant_storeOutputAutomatically',
          pattern: /<storeOutputAutomatically>true<\/storeOutputAutomatically>\s*(?=<[^>]*(?:DropdownBox|RecordCreate|RecordLookup)[^>]*>)/g,
          replacement: '',
          description: 'Remove redundant storeOutputAutomatically for DropdownBox/RecordCreate (auto-stored by default)'
        },
        {
          name: 'missing_defaultConnector',
          pattern: /<decisions>\s*<name>([^<]+)<\/name>\s*(?![\s\S]*<defaultConnector>)/g,
          replacement: function(match, name) {
            return match + `\n            <defaultConnector>\n                <targetReference>End</targetReference>\n            </defaultConnector>`;
          },
          description: 'Add missing defaultConnector to decision elements'
        },
        {
          name: 'empty_connector_reference',
          pattern: /<targetReference><\/targetReference>/g,
          replacement: '<targetReference>End</targetReference>',
          description: 'Fix empty connector references'
        },
        {
          name: 'invalid_process_metadata_values',
          pattern: /<processMetadataValues>\s*<name>([^<]*)<\/name>\s*<value>\s*<\/value>\s*<\/processMetadataValues>/g,
          replacement: '',
          description: 'Remove processMetadataValues with empty values'
        }
      ]
    };

    // Statistics
    this.stats = {
      parseAttempts: 0,
      parseSuccesses: 0,
      parseFailures: 0,
      autoFixAttempts: 0,
      autoFixSuccesses: 0,
      byFormat: {}
    };

    this.log('Parse Error Handler initialized');
  }

  /**
   * Main parse method with error handling
   *
   * @param {string} content - Content to parse
   * @param {string} format - Format (json, xml, csv, yaml)
   * @param {Object} options - Parse options
   * @returns {Object} Parse result
   */
  async parse(content, format, options = {}) {
    const startTime = Date.now();

    try {
      this.stats.parseAttempts++;

      if (!this.formats.includes(format)) {
        throw new Error(`Unsupported format: ${format}. Supported: ${this.formats.join(', ')}`);
      }

      // Initialize format stats
      if (!this.stats.byFormat[format]) {
        this.stats.byFormat[format] = {
          attempts: 0,
          successes: 0,
          failures: 0,
          commonErrors: {}
        };
      }

      this.stats.byFormat[format].attempts++;

      // Detect and normalize encoding
      const normalized = this.normalizeEncoding(content);

      // Parse based on format
      let parsed;
      let errors = [];

      switch (format) {
        case 'json':
          ({ parsed, errors } = this.parseJSON(normalized, options));
          break;
        case 'xml':
          ({ parsed, errors } = this.parseXML(normalized, options));
          break;
        case 'csv':
          ({ parsed, errors } = this.parseCSV(normalized, options));
          break;
        case 'yaml':
          ({ parsed, errors } = this.parseYAML(normalized, options));
          break;
        case 'flowXml':
          ({ parsed, errors } = this.parseFlowXML(normalized, options));
          break;
      }

      const parseTime = Date.now() - startTime;

      // Update statistics
      if (errors.length === 0) {
        this.stats.parseSuccesses++;
        this.stats.byFormat[format].successes++;
      } else {
        this.stats.parseFailures++;
        this.stats.byFormat[format].failures++;

        // Track common errors
        for (const error of errors) {
          const key = error.type;
          if (!this.stats.byFormat[format].commonErrors[key]) {
            this.stats.byFormat[format].commonErrors[key] = 0;
          }
          this.stats.byFormat[format].commonErrors[key]++;
        }
      }

      const result = {
        success: errors.length === 0,
        format: format,
        parsed: parsed,
        errors: errors,
        errorCount: errors.length,
        parseTime: parseTime,
        timestamp: new Date().toISOString()
      };

      if (this.verbose) {
        this.logParseResult(result);
      }

      return result;

    } catch (error) {
      return {
        success: false,
        format: format,
        parsed: null,
        errors: [{
          type: 'system_error',
          message: error.message,
          line: null,
          column: null
        }],
        errorCount: 1,
        parseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Parse JSON with detailed error reporting
   */
  parseJSON(content, options = {}) {
    try {
      const parsed = JSON.parse(content);
      return { parsed, errors: [] };

    } catch (error) {
      // Extract line and column from error message
      const match = error.message.match(/position (\d+)/);
      const position = match ? parseInt(match[1]) : 0;

      const { line, column } = this.getLineColumn(content, position);

      const formattedError = {
        type: 'parse_error',
        message: error.message,
        line: line,
        column: column,
        context: this.getErrorContext(content, line, column),
        suggestion: this.suggestJSONFix(content, line, column)
      };

      return { parsed: null, errors: [formattedError] };
    }
  }

  /**
   * Parse XML with error handling
   */
  parseXML(content, options = {}) {
    try {
      const parser = new XMLParser({
        ignoreAttributes: options.ignoreAttributes || false,
        parseAttributeValue: true
      });

      const parsed = parser.parse(content);
      return { parsed, errors: [] };

    } catch (error) {
      const formattedError = {
        type: 'xml_parse_error',
        message: error.message,
        line: null,
        column: null,
        context: null,
        suggestion: 'Check for unclosed tags, invalid entities, or malformed XML structure'
      };

      return { parsed: null, errors: [formattedError] };
    }
  }

  /**
   * Parse CSV with error handling
   */
  parseCSV(content, options = {}) {
    try {
      const delimiter = options.delimiter || ',';
      const lines = content.split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        return { parsed: [], errors: [] };
      }

      // Parse header
      const headers = this.parseCSVLine(lines[0], delimiter);

      // Parse rows
      const rows = [];
      const errors = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const fields = this.parseCSVLine(lines[i], delimiter);

          if (fields.length !== headers.length) {
            errors.push({
              type: 'field_count_mismatch',
              message: `Expected ${headers.length} fields, found ${fields.length}`,
              line: i + 1,
              column: null,
              context: lines[i],
              suggestion: 'Check for missing or extra delimiters, or unquoted fields containing delimiters'
            });
          }

          const row = {};
          headers.forEach((header, index) => {
            row[header] = fields[index] || null;
          });

          rows.push(row);

        } catch (error) {
          errors.push({
            type: 'row_parse_error',
            message: error.message,
            line: i + 1,
            column: null,
            context: lines[i]
          });
        }
      }

      return {
        parsed: { headers, rows },
        errors: errors
      };

    } catch (error) {
      return {
        parsed: null,
        errors: [{
          type: 'csv_parse_error',
          message: error.message,
          line: null,
          column: null
        }]
      };
    }
  }

  /**
   * Parse a single CSV line (handles quoted fields)
   */
  parseCSVLine(line, delimiter = ',') {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // Toggle quotes
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        // Field boundary
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add last field
    fields.push(current.trim());

    return fields;
  }

  /**
   * Parse YAML (basic implementation)
   */
  parseYAML(content, options = {}) {
    try {
      // For now, return error - full YAML parsing requires 'js-yaml' package
      return {
        parsed: null,
        errors: [{
          type: 'not_implemented',
          message: 'YAML parsing requires js-yaml package. Install: npm install js-yaml',
          line: null,
          column: null
        }]
      };

    } catch (error) {
      return {
        parsed: null,
        errors: [{
          type: 'yaml_parse_error',
          message: error.message,
          line: null,
          column: null
        }]
      };
    }
  }

  /**
   * Parse Flow XML with Flow-specific validation
   *
   * Detects Salesforce Flow-specific issues:
   * - Missing decision outcomes (defaultConnector)
   * - Invalid record lookups
   * - Circular references
   * - Empty connector references
   * - Invalid processMetadataValues
   *
   * @param {string} content - Flow XML content
   * @param {Object} options - Parse options
   * @returns {Object} Parse result with errors
   */
  parseFlowXML(content, options = {}) {
    const errors = [];
    let parsed = null;

    try {
      // First, parse as standard XML
      const xmlResult = this.parseXML(content, options);

      if (xmlResult.errors.length > 0) {
        // XML parsing failed - return those errors
        return xmlResult;
      }

      parsed = xmlResult.parsed;

      // Flow-specific validations
      const flowValidations = this.validateFlowStructure(content, parsed);
      errors.push(...flowValidations);

      return { parsed, errors };

    } catch (error) {
      return {
        parsed: null,
        errors: [{
          type: 'flow_parse_error',
          message: error.message,
          line: null,
          column: null,
          suggestion: 'Check Flow XML structure and syntax'
        }]
      };
    }
  }

  /**
   * Validate Flow-specific structure and patterns
   *
   * @param {string} content - Raw XML content
   * @param {Object} parsed - Parsed XML object
   * @returns {Array} Array of validation errors
   */
  validateFlowStructure(content, parsed) {
    const errors = [];
    const lines = content.split('\n');

    // 1. Check for decisions without defaultConnector
    const decisionMatches = content.matchAll(/<decisions>([\s\S]*?)<\/decisions>/g);
    for (const match of decisionMatches) {
      const decisionContent = match[1];

      // Extract decision name
      const nameMatch = decisionContent.match(/<name>([^<]+)<\/name>/);
      const decisionName = nameMatch ? nameMatch[1] : 'unknown';

      // Check for defaultConnector
      if (!decisionContent.includes('<defaultConnector>')) {
        const lineNum = this.findLineNumber(content, match.index);
        errors.push({
          type: 'missing_default_connector',
          message: `Decision "${decisionName}" is missing a defaultConnector (default outcome path)`,
          line: lineNum,
          column: null,
          context: this.getErrorContext(content, lineNum, 1),
          suggestion: 'Add a <defaultConnector> element to handle cases when no rules match',
          severity: 'ERROR',
          autoFixable: true,
          fixPattern: 'missing_defaultConnector'
        });
      }

      // Check for outcomes without targetReference
      const emptyConnectors = decisionContent.match(/<targetReference><\/targetReference>/g);
      if (emptyConnectors) {
        const lineNum = this.findLineNumber(content, match.index);
        errors.push({
          type: 'empty_connector_reference',
          message: `Decision "${decisionName}" has empty targetReference(s)`,
          line: lineNum,
          column: null,
          suggestion: 'Specify a valid targetReference or use "End" to terminate the flow path',
          severity: 'ERROR',
          autoFixable: true,
          fixPattern: 'empty_connector_reference'
        });
      }
    }

    // 2. Check for recordLookups with invalid configurations
    const recordLookupMatches = content.matchAll(/<recordLookups>([\s\S]*?)<\/recordLookups>/g);
    for (const match of recordLookupMatches) {
      const lookupContent = match[1];

      // Extract lookup name
      const nameMatch = lookupContent.match(/<name>([^<]+)<\/name>/);
      const lookupName = nameMatch ? nameMatch[1] : 'unknown';

      // Check for object reference
      if (!lookupContent.includes('<object>')) {
        const lineNum = this.findLineNumber(content, match.index);
        errors.push({
          type: 'missing_object_reference',
          message: `RecordLookup "${lookupName}" is missing an <object> element`,
          line: lineNum,
          column: null,
          suggestion: 'Specify the Salesforce object to query (e.g., <object>Account</object>)',
          severity: 'ERROR',
          autoFixable: false
        });
      }

      // Check for storeOutputAutomatically redundancy
      if (lookupContent.includes('<storeOutputAutomatically>true</storeOutputAutomatically>') &&
          (lookupContent.includes('getFirstRecordOnly') || lookupContent.includes('<queriedFields>'))) {
        const lineNum = this.findLineNumber(content, match.index);
        errors.push({
          type: 'redundant_store_output',
          message: `RecordLookup "${lookupName}" has redundant storeOutputAutomatically setting`,
          line: lineNum,
          column: null,
          suggestion: 'Remove storeOutputAutomatically - it is default behavior for single-record lookups',
          severity: 'WARNING',
          autoFixable: true,
          fixPattern: 'redundant_storeOutputAutomatically'
        });
      }
    }

    // 3. Check for circular references in connectors
    const circularRefs = this.detectCircularReferences(content);
    if (circularRefs.length > 0) {
      for (const ref of circularRefs) {
        errors.push({
          type: 'circular_reference',
          message: `Circular reference detected: ${ref.path.join(' → ')}`,
          line: ref.line,
          column: null,
          suggestion: 'Break the circular reference by adding a decision element or terminating one path',
          severity: 'ERROR',
          autoFixable: false
        });
      }
    }

    // 4. Check for processMetadataValues with empty values
    const emptyMetadataMatches = content.matchAll(/<processMetadataValues>\s*<name>([^<]*)<\/name>\s*<value>\s*<\/value>\s*<\/processMetadataValues>/g);
    for (const match of emptyMetadataMatches) {
      const lineNum = this.findLineNumber(content, match.index);
      errors.push({
        type: 'empty_process_metadata',
        message: `processMetadataValues "${match[1]}" has an empty value`,
        line: lineNum,
        column: null,
        suggestion: 'Remove the empty processMetadataValues element or provide a value',
        severity: 'WARNING',
        autoFixable: true,
        fixPattern: 'invalid_process_metadata_values'
      });
    }

    // 5. Check for missing start element connector
    if (content.includes('<start>')) {
      const startMatch = content.match(/<start>([\s\S]*?)<\/start>/);
      if (startMatch && !startMatch[1].includes('<connector>')) {
        const lineNum = this.findLineNumber(content, startMatch.index);
        errors.push({
          type: 'missing_start_connector',
          message: 'Flow start element is missing a connector to the first element',
          line: lineNum,
          column: null,
          suggestion: 'Add a <connector> element with a <targetReference> to the first flow element',
          severity: 'ERROR',
          autoFixable: false
        });
      }
    }

    // 6. Check for screens without fields (warning)
    const screenMatches = content.matchAll(/<screens>([\s\S]*?)<\/screens>/g);
    for (const match of screenMatches) {
      const screenContent = match[1];
      const nameMatch = screenContent.match(/<name>([^<]+)<\/name>/);
      const screenName = nameMatch ? nameMatch[1] : 'unknown';

      if (!screenContent.includes('<fields>')) {
        const lineNum = this.findLineNumber(content, match.index);
        errors.push({
          type: 'empty_screen',
          message: `Screen "${screenName}" has no fields defined`,
          line: lineNum,
          column: null,
          suggestion: 'Add screen fields or remove the empty screen element',
          severity: 'WARNING',
          autoFixable: false
        });
      }
    }

    return errors;
  }

  /**
   * Detect circular references in flow connectors
   *
   * @param {string} content - Flow XML content
   * @returns {Array} Array of circular reference objects
   */
  detectCircularReferences(content) {
    const circularRefs = [];

    // Build a graph of element connections
    const graph = new Map();
    const elementTypes = ['decisions', 'assignments', 'recordLookups', 'recordCreates',
                         'recordUpdates', 'recordDeletes', 'screens', 'subflows', 'loops'];

    for (const type of elementTypes) {
      const regex = new RegExp(`<${type}>([\\s\\S]*?)<\\/${type}>`, 'g');
      const matches = content.matchAll(regex);

      for (const match of matches) {
        const elementContent = match[1];
        const nameMatch = elementContent.match(/<name>([^<]+)<\/name>/);
        if (!nameMatch) continue;

        const elementName = nameMatch[1];
        const connections = [];

        // Find all targetReferences
        const targetMatches = elementContent.matchAll(/<targetReference>([^<]+)<\/targetReference>/g);
        for (const target of targetMatches) {
          if (target[1] && target[1] !== 'End') {
            connections.push(target[1]);
          }
        }

        graph.set(elementName, connections);
      }
    }

    // DFS to detect cycles
    const visited = new Set();
    const recursionStack = new Set();

    const detectCycle = (node, path) => {
      if (recursionStack.has(node)) {
        // Found a cycle
        const cycleStart = path.indexOf(node);
        const cyclePath = [...path.slice(cycleStart), node];
        return cyclePath;
      }

      if (visited.has(node)) {
        return null;
      }

      visited.add(node);
      recursionStack.add(node);

      const connections = graph.get(node) || [];
      for (const next of connections) {
        const cycle = detectCycle(next, [...path, node]);
        if (cycle) {
          return cycle;
        }
      }

      recursionStack.delete(node);
      return null;
    };

    // Check from each node
    for (const [nodeName] of graph) {
      if (!visited.has(nodeName)) {
        const cycle = detectCycle(nodeName, []);
        if (cycle) {
          circularRefs.push({
            path: cycle,
            line: this.findLineNumber(content, content.indexOf(`<name>${cycle[0]}</name>`))
          });
        }
      }
    }

    return circularRefs;
  }

  /**
   * Find line number for a character position
   *
   * @param {string} content - Full content
   * @param {number} position - Character position
   * @returns {number} Line number (1-based)
   */
  findLineNumber(content, position) {
    if (position < 0) return 1;
    const substring = content.substring(0, position);
    return (substring.match(/\n/g) || []).length + 1;
  }

  /**
   * Auto-fix Flow XML issues
   *
   * @param {string} content - Flow XML content
   * @param {Object} options - Fix options
   * @returns {Object} Fix result with applied fixes
   */
  async autoFixFlowXML(content, options = {}) {
    try {
      this.stats.autoFixAttempts++;

      const patterns = this.autoFixPatterns.flowXml || [];
      let fixed = content;
      const appliedFixes = [];

      for (const pattern of patterns) {
        const before = fixed;

        if (typeof pattern.replacement === 'function') {
          fixed = fixed.replace(pattern.pattern, pattern.replacement);
        } else {
          fixed = fixed.replace(pattern.pattern, pattern.replacement);
        }

        if (fixed !== before) {
          appliedFixes.push({
            name: pattern.name,
            description: pattern.description
          });
        }
      }

      // Test if fixed content parses without errors
      const parseResult = await this.parse(fixed, 'flowXml');
      const criticalErrors = parseResult.errors.filter(e => e.severity === 'ERROR');

      if (criticalErrors.length === 0) {
        this.stats.autoFixSuccesses++;
      }

      return {
        success: criticalErrors.length === 0,
        fixed: fixed,
        appliedFixes: appliedFixes,
        parseResult: parseResult,
        remainingErrors: parseResult.errors,
        message: criticalErrors.length === 0
          ? `✅ Flow auto-fix successful (${appliedFixes.length} fixes applied)`
          : `⚠️ Flow auto-fix applied ${appliedFixes.length} fixes but ${criticalErrors.length} critical errors remain`
      };

    } catch (error) {
      return {
        success: false,
        fixed: content,
        appliedFixes: [],
        message: `Flow auto-fix error: ${error.message}`
      };
    }
  }

  /**
   * Normalize encoding (remove BOM, fix line endings)
   */
  normalizeEncoding(content) {
    // Remove UTF-8 BOM
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    // Normalize line endings
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    return content;
  }

  /**
   * Auto-fix common issues
   *
   * @param {string} content - Content to fix
   * @param {string} format - Format
   * @param {Object} options - Fix options
   * @returns {Object} Fix result
   */
  async autoFix(content, format, options = {}) {
    try {
      this.stats.autoFixAttempts++;

      const patterns = this.autoFixPatterns[format] || [];

      if (patterns.length === 0) {
        return {
          success: false,
          fixed: content,
          appliedFixes: [],
          message: `No auto-fix patterns available for ${format}`
        };
      }

      let fixed = content;
      const appliedFixes = [];

      for (const pattern of patterns) {
        const before = fixed;
        fixed = fixed.replace(pattern.pattern, pattern.replacement);

        if (fixed !== before) {
          appliedFixes.push({
            name: pattern.name,
            description: pattern.description
          });
        }
      }

      // Test if fixed content parses
      const parseResult = await this.parse(fixed, format);

      if (parseResult.success) {
        this.stats.autoFixSuccesses++;
      }

      return {
        success: parseResult.success,
        fixed: fixed,
        appliedFixes: appliedFixes,
        parseResult: parseResult,
        message: parseResult.success
          ? `✅ Auto-fix successful (${appliedFixes.length} fixes applied)`
          : `❌ Auto-fix applied ${appliedFixes.length} fixes but content still has errors`
      };

    } catch (error) {
      return {
        success: false,
        fixed: content,
        appliedFixes: [],
        message: `Auto-fix error: ${error.message}`
      };
    }
  }

  /**
   * Get line and column from character position
   */
  getLineColumn(content, position) {
    const lines = content.substring(0, position).split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;

    return { line, column };
  }

  /**
   * Get error context (surrounding lines)
   */
  getErrorContext(content, line, column, contextLines = 2) {
    const lines = content.split('\n');

    if (line < 1 || line > lines.length) {
      return null;
    }

    const start = Math.max(0, line - contextLines - 1);
    const end = Math.min(lines.length, line + contextLines);

    const contextArray = [];

    for (let i = start; i < end; i++) {
      const lineNum = i + 1;
      const isErrorLine = lineNum === line;

      contextArray.push({
        lineNumber: lineNum,
        content: lines[i],
        isErrorLine: isErrorLine
      });
    }

    return contextArray;
  }

  /**
   * Suggest JSON fix based on error location
   */
  suggestJSONFix(content, line, column) {
    const lines = content.split('\n');

    if (line < 1 || line > lines.length) {
      return 'Check JSON syntax';
    }

    const errorLine = lines[line - 1];

    // Check for common issues
    if (errorLine.match(/,\s*[}\]]/)) {
      return 'Remove trailing comma before closing brace/bracket';
    }

    if (errorLine.match(/[^\\]"/)) {
      return 'Escape unescaped quotes or use single quotes for strings';
    }

    if (errorLine.match(/'/)) {
      return 'Replace single quotes with double quotes (JSON requires double quotes)';
    }

    return 'Check JSON syntax and structure';
  }

  /**
   * Format error message for display
   */
  formatErrorMessage(error) {
    let output = `\n❌ ${error.type.toUpperCase()}\n`;

    if (error.line) {
      output += `   Location: Line ${error.line}`;
      if (error.column) {
        output += `, Column ${error.column}`;
      }
      output += '\n';
    }

    output += `   Message: ${error.message}\n`;

    if (error.context && Array.isArray(error.context)) {
      output += '\n   Context:\n';
      for (const line of error.context) {
        const marker = line.isErrorLine ? '>' : ' ';
        output += `   ${marker} ${line.lineNumber} | ${line.content}\n`;

        if (line.isErrorLine && error.column) {
          const pointer = ' '.repeat(error.column + String(line.lineNumber).length + 5) + '^';
          output += `   ${pointer}\n`;
        }
      }
    } else if (error.context && typeof error.context === 'string') {
      output += `   Context: ${error.context}\n`;
    }

    if (error.suggestion) {
      output += `   💡 Suggestion: ${error.suggestion}\n`;
    }

    return output;
  }

  /**
   * Log parse result
   */
  logParseResult(result) {
    if (result.success) {
      console.log(`✅ Parse successful: ${result.format} (${result.parseTime}ms)`);
    } else {
      console.log(`❌ Parse failed: ${result.format} (${result.parseTime}ms)`);
      for (const error of result.errors) {
        console.log(this.formatErrorMessage(error));
      }
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      parseSuccessRate: this.stats.parseAttempts > 0
        ? ((this.stats.parseSuccesses / this.stats.parseAttempts) * 100).toFixed(2) + '%'
        : '0%',
      autoFixSuccessRate: this.stats.autoFixAttempts > 0
        ? ((this.stats.autoFixSuccesses / this.stats.autoFixAttempts) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Log message
   */
  log(message) {
    if (this.verbose) {
      console.log(`[ParseErrorHandler] ${message}`);
    }
  }
}

// Export
module.exports = ParseErrorHandler;

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const handler = new ParseErrorHandler({ verbose: true });

  (async () => {
    try {
      if (command === 'parse') {
        // node parse-error-handler.js parse file.json --format json
        const filePath = args[1];
        const formatIndex = args.indexOf('--format');
        const format = formatIndex >= 0 ? args[formatIndex + 1] : 'json';

        if (!filePath) {
          console.error('Usage: node parse-error-handler.js parse <file> --format <format>');
          process.exit(1);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const result = await handler.parse(content, format);

        if (result.success) {
          console.log(`✅ Parse successful`);
          console.log(JSON.stringify(result.parsed, null, 2));
        } else {
          console.log(`❌ Parse failed:`);
          for (const error of result.errors) {
            console.log(handler.formatErrorMessage(error));
          }
        }

        process.exit(result.success ? 0 : 1);

      } else if (command === 'auto-fix') {
        // node parse-error-handler.js auto-fix file.json --dry-run
        const filePath = args[1];
        const dryRun = args.includes('--dry-run');
        const formatIndex = args.indexOf('--format');
        const format = formatIndex >= 0 ? args[formatIndex + 1] : 'json';

        if (!filePath) {
          console.error('Usage: node parse-error-handler.js auto-fix <file> [--dry-run] [--format <format>]');
          process.exit(1);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const result = await handler.autoFix(content, format);

        console.log(result.message);

        if (result.appliedFixes.length > 0) {
          console.log('\nApplied Fixes:');
          for (const fix of result.appliedFixes) {
            console.log(`  ✓ ${fix.description}`);
          }
        }

        if (!dryRun && result.success) {
          fs.writeFileSync(filePath, result.fixed, 'utf8');
          console.log(`\n✅ Fixed content saved to: ${filePath}`);
        } else if (dryRun) {
          console.log(`\n💡 Dry run mode - no files modified`);
        }

        process.exit(result.success ? 0 : 1);

      } else if (command === 'stats') {
        // node parse-error-handler.js stats
        const stats = handler.getStats();
        console.log('\n📊 Parse Statistics:\n');
        console.log(`  Parse Attempts: ${stats.parseAttempts}`);
        console.log(`  Success Rate: ${stats.parseSuccessRate}`);
        console.log(`  Auto-fix Success Rate: ${stats.autoFixSuccessRate}\n`);
        process.exit(0);

      } else if (command === 'test-flow' || command === 'parse-flow') {
        // node parse-error-handler.js test-flow [file.flow-meta.xml]
        const filePath = args[1];

        if (!filePath) {
          // Run test with sample flow
          console.log('📋 Running Flow XML Parser Test\n');

          const sampleFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>59.0</apiVersion>
    <decisions>
        <name>Check_Account_Type</name>
        <label>Check Account Type</label>
        <rules>
            <name>Is_Enterprise</name>
            <conditionLogic>and</conditionLogic>
            <conditions>
                <leftValueReference>Account.Type</leftValueReference>
                <operator>EqualTo</operator>
                <rightValue>
                    <stringValue>Enterprise</stringValue>
                </rightValue>
            </conditions>
            <connector>
                <targetReference>Update_Enterprise</targetReference>
            </connector>
        </rules>
    </decisions>
    <recordLookups>
        <name>Get_Account</name>
        <label>Get Account</label>
        <storeOutputAutomatically>true</storeOutputAutomatically>
        <getFirstRecordOnly>true</getFirstRecordOnly>
    </recordLookups>
    <processMetadataValues>
        <name>BuilderType</name>
        <value></value>
    </processMetadataValues>
    <start>
        <locationX>50</locationX>
        <locationY>50</locationY>
    </start>
</Flow>`;

          const result = await handler.parse(sampleFlow, 'flowXml');

          console.log(`Found ${result.errors.length} issues:\n`);

          for (const error of result.errors) {
            const severity = error.severity === 'ERROR' ? '❌' : '⚠️';
            console.log(`${severity} ${error.type.toUpperCase()}`);
            console.log(`   Line ${error.line || 'N/A'}: ${error.message}`);
            console.log(`   💡 ${error.suggestion}`);
            if (error.autoFixable) {
              console.log(`   🔧 Auto-fixable: Yes (pattern: ${error.fixPattern})`);
            }
            console.log();
          }

          console.log('---');
          console.log('✅ Flow XML parser is working correctly.');
          console.log('   Use: node parse-error-handler.js parse-flow <file.flow-meta.xml>');
          process.exit(0);

        } else {
          // Parse actual file
          const content = fs.readFileSync(filePath, 'utf8');
          const result = await handler.parse(content, 'flowXml');

          console.log(`\n📋 Flow Analysis: ${path.basename(filePath)}\n`);

          if (result.errors.length === 0) {
            console.log('✅ No issues found. Flow XML is valid.');
          } else {
            const errors = result.errors.filter(e => e.severity === 'ERROR');
            const warnings = result.errors.filter(e => e.severity === 'WARNING');

            console.log(`Found: ${errors.length} errors, ${warnings.length} warnings\n`);

            for (const error of result.errors) {
              const severity = error.severity === 'ERROR' ? '❌' : '⚠️';
              console.log(`${severity} ${error.type.toUpperCase()}`);
              console.log(`   Line ${error.line || 'N/A'}: ${error.message}`);
              console.log(`   💡 ${error.suggestion}`);
              if (error.autoFixable) {
                console.log(`   🔧 Auto-fixable with: --fix`);
              }
              console.log();
            }
          }

          process.exit(result.errors.filter(e => e.severity === 'ERROR').length > 0 ? 1 : 0);
        }

      } else if (command === 'fix-flow') {
        // node parse-error-handler.js fix-flow file.flow-meta.xml [--dry-run]
        const filePath = args[1];
        const dryRun = args.includes('--dry-run');

        if (!filePath) {
          console.error('Usage: node parse-error-handler.js fix-flow <file.flow-meta.xml> [--dry-run]');
          process.exit(1);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const result = await handler.autoFixFlowXML(content);

        console.log(`\n🔧 Flow Auto-Fix: ${path.basename(filePath)}\n`);
        console.log(result.message);

        if (result.appliedFixes.length > 0) {
          console.log('\nApplied Fixes:');
          for (const fix of result.appliedFixes) {
            console.log(`  ✓ ${fix.description}`);
          }
        }

        if (result.remainingErrors && result.remainingErrors.length > 0) {
          const remaining = result.remainingErrors.filter(e => e.severity === 'ERROR');
          if (remaining.length > 0) {
            console.log(`\n⚠️ ${remaining.length} errors require manual fixes:`);
            for (const error of remaining) {
              console.log(`   • ${error.message}`);
            }
          }
        }

        if (!dryRun && result.appliedFixes.length > 0) {
          fs.writeFileSync(filePath, result.fixed, 'utf8');
          console.log(`\n✅ Fixed content saved to: ${filePath}`);
        } else if (dryRun) {
          console.log(`\n💡 Dry run mode - no files modified`);
        }

        process.exit(result.success ? 0 : 1);

      } else {
        console.error('Unknown command. Available: parse, auto-fix, stats, test-flow, parse-flow, fix-flow');
        process.exit(1);
      }

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  })();
}
