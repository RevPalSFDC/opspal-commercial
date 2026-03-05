/**
 * HubSpot Data Adapter
 *
 * Fetches and transforms data from HubSpot for visualization.
 *
 * @module web-viz/adapters/HubSpotAdapter
 * @version 1.0.0
 */

class HubSpotAdapter {
  /**
   * Create a HubSpot adapter
   * @param {Object} options - Adapter options
   */
  constructor(options = {}) {
    this.portalId = options.portalId || options.portal || null;
    this.options = {
      cacheEnabled: options.cacheEnabled !== false,
      cacheTTL: options.cacheTTL || 120000, // 2 minutes default
      ...options
    };

    // Simple in-memory cache
    this.cache = new Map();
  }

  /**
   * Search objects via HubSpot API
   * @param {string} objectType - Object type (contacts, deals, companies)
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  async search(objectType, options = {}) {
    const {
      properties = [],
      filters = [],
      sorts = [],
      limit = 100
    } = options;

    const cacheKey = `search:${objectType}:${JSON.stringify(options)}`;

    // Check cache
    if (this.options.cacheEnabled && !options.skipCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) return cached;
    }

    // Build search request body
    const body = {
      properties,
      limit,
      filterGroups: this._buildFilterGroups(filters),
      sorts: sorts.map(s => ({
        propertyName: s.field,
        direction: s.direction || 'ASCENDING'
      }))
    };

    // Note: In actual implementation, this would call HubSpot MCP
    // For now, we'll throw an error indicating MCP is required
    throw new Error(
      'HubSpot data fetching requires MCP integration. ' +
      'Use mcp_hubspot search tool to fetch data, then pass results to adapter.'
    );
  }

  /**
   * Build filter groups for HubSpot search
   * @private
   */
  _buildFilterGroups(filters) {
    if (!filters || filters.length === 0) return [];

    return [{
      filters: filters.map(f => ({
        propertyName: f.field,
        operator: this._mapOperator(f.op),
        value: f.value
      }))
    }];
  }

  /**
   * Map operator shorthand to HubSpot format
   * @private
   */
  _mapOperator(op) {
    const operators = {
      '=': 'EQ',
      '==': 'EQ',
      '!=': 'NEQ',
      '>': 'GT',
      '>=': 'GTE',
      '<': 'LT',
      '<=': 'LTE',
      'contains': 'CONTAINS_TOKEN',
      'like': 'CONTAINS_TOKEN',
      'in': 'IN'
    };
    return operators[op.toLowerCase()] || op.toUpperCase();
  }

  /**
   * Transform HubSpot API results for visualization
   * @param {Array} results - Raw HubSpot search results
   * @param {Object} options - Transform options
   * @returns {Object} Transformed data with metadata
   */
  transformResults(results, options = {}) {
    if (!Array.isArray(results)) {
      results = results.results || [];
    }

    // Extract properties from each result
    const records = results.map(item => {
      const record = { ...item.properties };
      record.id = item.id;
      record.createdAt = item.createdAt;
      record.updatedAt = item.updatedAt;
      return record;
    });

    return {
      data: records,
      metadata: {
        type: 'hubspot',
        portal: this.portalId,
        recordCount: records.length,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Transform results for chart display
   * @param {Array} results - HubSpot search results
   * @param {Object} spec - Chart specification
   * @returns {Object} Chart-ready data
   */
  transformForChart(results, spec) {
    const { groupByField, valueField, aggregation = 'count' } = spec;
    const records = this.transformResults(results).data;

    // Group and aggregate
    const groups = new Map();

    records.forEach(record => {
      const groupKey = record[groupByField] || 'Unknown';

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(record);
    });

    // Calculate aggregates
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
        default:
          data.push(items.length);
      }
    }

    return {
      labels,
      datasets: [{
        label: spec.label || `${aggregation} by ${groupByField}`,
        data
      }],
      metadata: {
        type: 'hubspot',
        portal: this.portalId,
        recordCount: records.length,
        groupCount: groups.size,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Transform results for table display
   * @param {Array} results - HubSpot search results
   * @param {Object} spec - Table specification
   * @returns {Object} Table-ready data
   */
  transformForTable(results, spec = {}) {
    const transformed = this.transformResults(results);
    const records = transformed.data;

    // Determine columns
    let columns;
    if (spec.columns) {
      columns = spec.columns;
    } else if (records.length > 0) {
      columns = Object.keys(records[0])
        .filter(k => !['id', 'createdAt', 'updatedAt'].includes(k) || spec.includeMetaFields)
        .map(field => ({
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
      metadata: transformed.metadata
    };
  }

  /**
   * Common HubSpot object properties
   */
  static COMMON_PROPERTIES = {
    contacts: [
      'email', 'firstname', 'lastname', 'company', 'phone',
      'lifecyclestage', 'hs_lead_status', 'createdate', 'lastmodifieddate'
    ],
    deals: [
      'dealname', 'amount', 'dealstage', 'pipeline', 'closedate',
      'createdate', 'hs_lastmodifieddate', 'hubspot_owner_id'
    ],
    companies: [
      'name', 'domain', 'industry', 'numberofemployees', 'annualrevenue',
      'city', 'state', 'country', 'createdate', 'hs_lastmodifieddate'
    ]
  };

  /**
   * Get common properties for object type
   * @param {string} objectType - Object type
   * @returns {string[]} Property names
   */
  static getCommonProperties(objectType) {
    return HubSpotAdapter.COMMON_PROPERTIES[objectType] || [];
  }

  /**
   * Format field name as header
   * @private
   */
  _formatHeader(field) {
    return field
      .replace(/^hs_/, '')
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

    // Check for currency
    if (/^\d+(\.\d{2})?$/.test(String(value))) {
      return 'currency';
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
}

module.exports = HubSpotAdapter;
