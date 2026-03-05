/**
 * File Data Adapter
 *
 * Loads and transforms data from CSV and JSON files for visualization.
 *
 * @module web-viz/adapters/FileAdapter
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');

class FileAdapter {
  /**
   * Create a file adapter
   * @param {Object} options - Adapter options
   */
  constructor(options = {}) {
    this.options = {
      basePath: options.basePath || process.cwd(),
      encoding: options.encoding || 'utf-8',
      ...options
    };
  }

  /**
   * Load data from file
   * @param {string} filePath - Path to file
   * @param {Object} options - Load options
   * @returns {Promise<Array>} Loaded data
   */
  async load(filePath, options = {}) {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.options.basePath, filePath);

    const ext = path.extname(fullPath).toLowerCase();
    const content = await fs.readFile(fullPath, this.options.encoding);

    let data;
    switch (ext) {
      case '.json':
        data = this._parseJSON(content, options);
        break;
      case '.csv':
        data = this._parseCSV(content, options);
        break;
      case '.tsv':
        data = this._parseCSV(content, { ...options, delimiter: '\t' });
        break;
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }

    return {
      data,
      metadata: {
        type: 'file',
        path: filePath,
        format: ext.slice(1),
        recordCount: data.length,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Parse JSON content
   * @private
   */
  _parseJSON(content, options = {}) {
    const parsed = JSON.parse(content);

    // Handle different JSON structures
    if (Array.isArray(parsed)) {
      return parsed;
    }

    // If object with data array
    if (parsed.data && Array.isArray(parsed.data)) {
      return parsed.data;
    }

    // If object with records array
    if (parsed.records && Array.isArray(parsed.records)) {
      return parsed.records;
    }

    // If object with results array
    if (parsed.results && Array.isArray(parsed.results)) {
      return parsed.results;
    }

    // If specific path provided
    if (options.dataPath) {
      const pathParts = options.dataPath.split('.');
      let result = parsed;
      for (const part of pathParts) {
        result = result?.[part];
      }
      if (Array.isArray(result)) {
        return result;
      }
    }

    // Convert object to single-item array
    return [parsed];
  }

  /**
   * Parse CSV content
   * @private
   */
  _parseCSV(content, options = {}) {
    const {
      delimiter = ',',
      hasHeader = true,
      columns = null,
      skipEmpty = true,
      trimValues = true
    } = options;

    const lines = content.split(/\r?\n/);
    if (lines.length === 0) return [];

    // Determine columns
    let headers;
    let dataStartIndex;

    if (hasHeader) {
      headers = this._parseCSVLine(lines[0], delimiter);
      dataStartIndex = 1;
    } else if (columns) {
      headers = columns;
      dataStartIndex = 0;
    } else {
      // Generate column names
      const firstLine = this._parseCSVLine(lines[0], delimiter);
      headers = firstLine.map((_, i) => `column_${i + 1}`);
      dataStartIndex = 0;
    }

    // Parse data rows
    const records = [];

    for (let i = dataStartIndex; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty lines
      if (skipEmpty && (!line || line.trim() === '')) {
        continue;
      }

      const values = this._parseCSVLine(line, delimiter);
      const record = {};

      headers.forEach((header, j) => {
        let value = values[j];

        if (trimValues && typeof value === 'string') {
          value = value.trim();
        }

        // Type conversion
        value = this._convertValue(value);

        record[header] = value;
      });

      records.push(record);
    }

    return records;
  }

  /**
   * Parse a single CSV line handling quoted values
   * @private
   */
  _parseCSVLine(line, delimiter = ',') {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current);
    return values;
  }

  /**
   * Convert string value to appropriate type
   * @private
   */
  _convertValue(value) {
    if (value === '' || value === null || value === undefined) {
      return null;
    }

    // Boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Number
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      const num = parseFloat(value);
      if (!isNaN(num)) return num;
    }

    // Date (ISO format)
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return value; // Keep as string for display, but validated
      }
    }

    return value;
  }

  /**
   * Load and transform for visualization
   * @param {string} filePath - Path to file
   * @param {Object} options - Options
   * @returns {Promise<Object>} Transformed data
   */
  async loadForVisualization(filePath, options = {}) {
    const result = await this.load(filePath, options);
    return result;
  }

  /**
   * Load and transform for chart
   * @param {string} filePath - Path to file
   * @param {Object} spec - Chart specification
   * @returns {Promise<Object>} Chart-ready data
   */
  async loadForChart(filePath, spec) {
    const result = await this.load(filePath, spec);
    const records = result.data;

    const { labelField, valueField, aggregation } = spec;

    if (aggregation) {
      // Aggregate data
      return this._aggregateForChart(records, spec);
    }

    // Direct mapping
    return {
      labels: records.map(r => r[labelField] || ''),
      datasets: [{
        label: spec.label || valueField,
        data: records.map(r => r[valueField] || 0)
      }],
      metadata: result.metadata
    };
  }

  /**
   * Aggregate data for chart
   * @private
   */
  _aggregateForChart(records, spec) {
    const { groupByField, valueField, aggregation = 'sum' } = spec;

    const groups = new Map();

    records.forEach(record => {
      const key = record[groupByField] || 'Unknown';

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(record);
    });

    const labels = [];
    const data = [];

    for (const [key, items] of groups) {
      labels.push(key);

      switch (aggregation) {
        case 'count':
          data.push(items.length);
          break;
        case 'sum':
          data.push(items.reduce((sum, item) =>
            sum + (parseFloat(item[valueField]) || 0), 0));
          break;
        case 'avg':
          const sum = items.reduce((s, item) =>
            s + (parseFloat(item[valueField]) || 0), 0);
          data.push(items.length > 0 ? sum / items.length : 0);
          break;
        case 'min':
          data.push(Math.min(...items.map(item =>
            parseFloat(item[valueField]) || Infinity)));
          break;
        case 'max':
          data.push(Math.max(...items.map(item =>
            parseFloat(item[valueField]) || -Infinity)));
          break;
        default:
          data.push(items.length);
      }
    }

    return {
      labels,
      datasets: [{
        label: spec.label || `${aggregation} of ${valueField}`,
        data
      }],
      metadata: {
        type: 'file',
        recordCount: records.length,
        groupCount: groups.size,
        aggregation,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Load and transform for table
   * @param {string} filePath - Path to file
   * @param {Object} spec - Table specification
   * @returns {Promise<Object>} Table-ready data
   */
  async loadForTable(filePath, spec = {}) {
    const result = await this.load(filePath, spec);
    const records = result.data;

    // Determine columns
    let columns;
    if (spec.columns) {
      columns = spec.columns;
    } else if (records.length > 0) {
      columns = Object.keys(records[0]).map(field => ({
        field,
        header: this._formatHeader(field),
        type: this._inferType(records[0][field])
      }));
    } else {
      columns = [];
    }

    return {
      data: records,
      columns,
      metadata: result.metadata
    };
  }

  /**
   * Format field name as header
   * @private
   */
  _formatHeader(field) {
    return field
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^\w/, c => c.toUpperCase())
      .trim();
  }

  /**
   * Infer data type from value
   * @private
   */
  _inferType(value) {
    if (value === null || value === undefined) return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';

    // Check for date
    if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) {
      return 'date';
    }

    return 'string';
  }

  /**
   * Check if file exists
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>}
   */
  async exists(filePath) {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.options.basePath, filePath);

    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file info
   * @param {string} filePath - Path to file
   * @returns {Promise<Object>}
   */
  async getInfo(filePath) {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.options.basePath, filePath);

    const stats = await fs.stat(fullPath);

    return {
      path: fullPath,
      name: path.basename(fullPath),
      extension: path.extname(fullPath),
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime
    };
  }
}

module.exports = FileAdapter;
