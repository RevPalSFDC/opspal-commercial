/**
 * Salesforce Data Adapter
 *
 * Fetches and transforms data from Salesforce for visualization.
 * Integrates with existing Salesforce MCP tools.
 *
 * @module web-viz/adapters/SalesforceAdapter
 * @version 1.0.0
 */

const path = require('path');

class SalesforceAdapter {
  /**
   * Create a Salesforce adapter
   * @param {Object} options - Adapter options
   */
  constructor(options = {}) {
    this.orgAlias = options.orgAlias || options.org || null;
    this.options = {
      cacheEnabled: options.cacheEnabled !== false,
      cacheTTL: options.cacheTTL || 60000, // 1 minute default
      ...options
    };

    // Simple in-memory cache
    this.cache = new Map();
  }

  /**
   * Execute SOQL query
   * @param {string} query - SOQL query string
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Query results
   */
  async query(query, options = {}) {
    const cacheKey = `query:${query}:${this.orgAlias}`;

    // Check cache
    if (this.options.cacheEnabled && !options.skipCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) return cached;
    }

    // Execute query via CLI
    const { execSync } = require('child_process');
    const orgFlag = this.orgAlias ? ` -o ${this.orgAlias}` : '';

    try {
      const result = execSync(
        `sf data query --query "${query.replace(/"/g, '\\"')}" --json${orgFlag}`,
        { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
      );

      const data = JSON.parse(result);
      const records = data.result?.records || [];

      // Cache result
      if (this.options.cacheEnabled) {
        this._setCache(cacheKey, records);
      }

      return records;
    } catch (error) {
      throw new Error(`Salesforce query failed: ${error.message}`);
    }
  }

  /**
   * Build SOQL query from specification
   * @param {Object} spec - Query specification
   * @returns {string} SOQL query
   */
  buildQuery(spec) {
    const {
      object,
      fields = ['Id'],
      filters = [],
      groupBy = [],
      orderBy = null,
      limit = null
    } = spec;

    let query = `SELECT ${fields.join(', ')} FROM ${object}`;

    // WHERE clause
    if (filters.length > 0) {
      const whereClauses = filters.map(f => this._buildFilterClause(f));
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // GROUP BY
    if (groupBy.length > 0) {
      query += ` GROUP BY ${groupBy.join(', ')}`;
    }

    // ORDER BY
    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    // LIMIT
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    return query;
  }

  /**
   * Build filter clause
   * @private
   */
  _buildFilterClause(filter) {
    const { field, op, value } = filter;
    const operator = this._mapOperator(op);

    if (value === null) {
      return `${field} ${op === '=' ? '=' : '!='} null`;
    }

    if (typeof value === 'string') {
      return `${field} ${operator} '${value.replace(/'/g, "\\'")}'`;
    }

    if (Array.isArray(value)) {
      const values = value.map(v =>
        typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : v
      ).join(', ');
      return `${field} IN (${values})`;
    }

    return `${field} ${operator} ${value}`;
  }

  /**
   * Map operator shorthand to SOQL
   * @private
   */
  _mapOperator(op) {
    const operators = {
      '=': '=',
      '==': '=',
      '!=': '!=',
      '<>': '!=',
      '>': '>',
      '>=': '>=',
      '<': '<',
      '<=': '<=',
      'like': 'LIKE',
      'in': 'IN',
      'not in': 'NOT IN'
    };
    return operators[op.toLowerCase()] || op;
  }

  /**
   * Fetch data and transform for visualization
   * @param {Object} spec - Data specification
   * @returns {Promise<Object>} Transformed data with metadata
   */
  async fetchForVisualization(spec) {
    const query = typeof spec === 'string' ? spec : this.buildQuery(spec);
    const records = await this.query(query);

    return {
      data: records,
      metadata: {
        type: 'salesforce',
        org: this.orgAlias,
        query,
        recordCount: records.length,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Fetch aggregate data for charts
   * @param {Object} spec - Aggregation specification
   * @returns {Promise<Object>} Chart-ready data
   */
  async fetchAggregateForChart(spec) {
    const {
      object,
      groupByField,
      aggregateField,
      aggregateFunction = 'SUM',
      filters = [],
      limit = 10
    } = spec;

    const aggExpr = aggregateField === 'Id'
      ? `COUNT(${aggregateField})`
      : `${aggregateFunction}(${aggregateField})`;

    const query = this.buildQuery({
      object,
      fields: [groupByField, `${aggExpr} total`],
      filters,
      groupBy: [groupByField],
      orderBy: 'total DESC',
      limit
    });

    const records = await this.query(query);

    // Transform to Chart.js format
    return {
      labels: records.map(r => r[groupByField] || 'Unknown'),
      datasets: [{
        label: `${aggregateFunction} of ${aggregateField}`,
        data: records.map(r => r.total || r.expr0 || 0)
      }],
      metadata: {
        type: 'salesforce',
        org: this.orgAlias,
        query,
        recordCount: records.length,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Fetch data for table display
   * @param {Object} spec - Table specification
   * @returns {Promise<Object>} Table-ready data
   */
  async fetchForTable(spec) {
    const { object, fields, filters = [], orderBy, limit = 100 } = spec;

    const query = this.buildQuery({
      object,
      fields,
      filters,
      orderBy,
      limit
    });

    const records = await this.query(query);

    // Flatten nested objects (e.g., Account.Name)
    const flatRecords = records.map(r => this._flattenRecord(r));

    return {
      data: flatRecords,
      columns: this._inferColumns(flatRecords, fields),
      metadata: {
        type: 'salesforce',
        org: this.orgAlias,
        query,
        recordCount: records.length,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Flatten nested record (e.g., Account.Name -> Account_Name)
   * @private
   */
  _flattenRecord(record, prefix = '') {
    const result = {};

    for (const [key, value] of Object.entries(record)) {
      if (key === 'attributes') continue;

      const newKey = prefix ? `${prefix}_${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this._flattenRecord(value, newKey));
      } else {
        result[newKey] = value;
      }
    }

    return result;
  }

  /**
   * Infer column definitions from data
   * @private
   */
  _inferColumns(records, requestedFields) {
    if (records.length === 0) {
      return requestedFields.map(f => ({
        field: f.replace(/\./g, '_'),
        header: this._formatHeader(f)
      }));
    }

    const sampleRecord = records[0];
    return Object.keys(sampleRecord).map(field => ({
      field,
      header: this._formatHeader(field),
      type: this._inferType(sampleRecord[field])
    }));
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

    // Check for currency (starts with number, contains decimal)
    if (/^\d+(\.\d{2})?$/.test(String(value))) {
      return 'currency';
    }

    // Check for date
    if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) {
      return 'date';
    }

    // Check for percent
    if (String(value).endsWith('%')) {
      return 'percent';
    }

    return 'string';
  }

  /**
   * Get from cache
   * @private
   */
  _getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.options.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Set cache
   * @private
   */
  _setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      enabled: this.options.cacheEnabled,
      ttl: this.options.cacheTTL
    };
  }
}

module.exports = SalesforceAdapter;
