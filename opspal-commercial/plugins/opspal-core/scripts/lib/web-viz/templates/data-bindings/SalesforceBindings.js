/**
 * Salesforce Data Bindings
 *
 * Generates and executes SOQL queries for dashboard template data bindings.
 * Supports all RevOps template types with proper query construction and
 * result transformation.
 *
 * @module web-viz/templates/data-bindings/SalesforceBindings
 * @version 1.0.0
 */

const { execSync } = require('child_process');

class SalesforceBindings {
  /**
   * Create SalesforceBindings
   * @param {string} orgAlias - Salesforce org alias
   */
  constructor(orgAlias = null) {
    this.orgAlias = orgAlias;
    this.queryCache = new Map();
    this.cacheTTL = 60000; // 1 minute cache
  }

  /**
   * Execute a data binding
   * @param {Object} binding - Data binding specification
   * @param {Object} filters - Active filters
   * @returns {Promise<*>} Query results
   */
  async executeBinding(binding, filters = {}) {
    const queryId = binding.query || binding.queryId;

    // Check for predefined query
    if (queryId && this.queries[queryId]) {
      return this.executePredefinedQuery(queryId, filters);
    }

    // Build custom query from binding spec
    if (binding.salesforce) {
      return this.executeCustomQuery(binding.salesforce, filters);
    }

    throw new Error(`Invalid binding specification: ${JSON.stringify(binding)}`);
  }

  /**
   * Execute a predefined query by ID
   * @param {string} queryId - Query identifier
   * @param {Object} filters - Active filters
   * @returns {Promise<*>} Query results
   */
  async executePredefinedQuery(queryId, filters) {
    const queryDef = this.queries[queryId];
    if (!queryDef) {
      throw new Error(`Unknown query: ${queryId}`);
    }

    const soql = typeof queryDef === 'function' ? queryDef(filters) : queryDef;
    return this.runSOQL(soql);
  }

  /**
   * Execute a custom query from binding spec
   * @param {Object} spec - Query specification
   * @param {Object} filters - Active filters
   * @returns {Promise<*>} Query results
   */
  async executeCustomQuery(spec, filters) {
    const soql = this.buildSOQL(spec, filters);
    return this.runSOQL(soql);
  }

  /**
   * Build SOQL from specification
   * @param {Object} spec - Query spec { object, fields, filters, groupBy, orderBy, limit }
   * @param {Object} filters - Active filters
   * @returns {string} SOQL query
   */
  buildSOQL(spec, filters) {
    const parts = [];

    // SELECT clause
    const fields = Array.isArray(spec.fields) ? spec.fields.join(', ') : spec.fields;
    parts.push(`SELECT ${fields}`);

    // FROM clause
    parts.push(`FROM ${spec.object}`);

    // WHERE clause
    const whereConditions = [...(spec.filters || [])];

    // Apply runtime filters
    if (filters.timePeriod) {
      whereConditions.push(this.getTimePeriodFilter(filters.timePeriod, spec.dateField || 'CreatedDate'));
    }
    if (filters.owner && spec.ownerField) {
      whereConditions.push(`${spec.ownerField} = '${filters.owner}'`);
    }

    if (whereConditions.length > 0) {
      parts.push(`WHERE ${whereConditions.join(' AND ')}`);
    }

    // GROUP BY clause
    if (spec.groupBy) {
      const groupBy = Array.isArray(spec.groupBy) ? spec.groupBy.join(', ') : spec.groupBy;
      parts.push(`GROUP BY ${groupBy}`);
    }

    // ORDER BY clause
    if (spec.orderBy) {
      parts.push(`ORDER BY ${spec.orderBy}`);
    }

    // LIMIT clause
    if (spec.limit) {
      parts.push(`LIMIT ${spec.limit}`);
    }

    return parts.join(' ');
  }

  /**
   * Get time period filter
   * @param {string} period - Period identifier
   * @param {string} dateField - Date field name
   * @returns {string} Filter clause
   */
  getTimePeriodFilter(period, dateField) {
    const periodMap = {
      'this-quarter': `${dateField} = THIS_FISCAL_QUARTER`,
      'last-quarter': `${dateField} = LAST_FISCAL_QUARTER`,
      'this-year': `${dateField} = THIS_FISCAL_YEAR`,
      'last-year': `${dateField} = LAST_FISCAL_YEAR`,
      'this-month': `${dateField} = THIS_MONTH`,
      'last-month': `${dateField} = LAST_MONTH`,
      'last-30-days': `${dateField} = LAST_N_DAYS:30`,
      'last-90-days': `${dateField} = LAST_N_DAYS:90`
    };

    return periodMap[period] || periodMap['this-quarter'];
  }

  /**
   * Run SOQL query
   * @param {string} soql - SOQL query string
   * @returns {Promise<Array>} Query results
   */
  async runSOQL(soql) {
    // Check cache
    const cacheKey = `${this.orgAlias}:${soql}`;
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const orgFlag = this.orgAlias ? `-o ${this.orgAlias}` : '';
      const escapedQuery = soql.replace(/"/g, '\\"');
      const cmd = `sf data query ${orgFlag} --query "${escapedQuery}" --json`;

      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
      const parsed = JSON.parse(result);

      const data = parsed.result?.records || [];

      // Cache result
      this.queryCache.set(cacheKey, { data, timestamp: Date.now() });

      return data;
    } catch (error) {
      throw new Error(`SOQL query failed: ${error.message}`);
    }
  }

  /**
   * Predefined queries for common data bindings
   */
  queries = {
    // Sales Pipeline queries
    'pipeline-total': (filters) => `
      SELECT SUM(Amount) totalAmount
      FROM Opportunity
      WHERE IsClosed = false
      ${filters.timePeriod ? `AND CloseDate = ${this.getTimePeriodValue(filters.timePeriod)}` : ''}
    `.trim().replace(/\s+/g, ' '),

    'pipeline-count': (filters) => `
      SELECT COUNT(Id) total
      FROM Opportunity
      WHERE IsClosed = false
      ${filters.timePeriod ? `AND CloseDate = ${this.getTimePeriodValue(filters.timePeriod)}` : ''}
    `.trim().replace(/\s+/g, ' '),

    'pipeline-by-stage': (filters) => `
      SELECT StageName, COUNT(Id) count, SUM(Amount) amount
      FROM Opportunity
      WHERE IsClosed = false
      ${filters.timePeriod ? `AND CloseDate = ${this.getTimePeriodValue(filters.timePeriod)}` : ''}
      GROUP BY StageName
      ORDER BY StageName
    `.trim().replace(/\s+/g, ' '),

    'top-opportunities': (filters) => `
      SELECT Name, Owner.Name ownerName, Amount, StageName, CloseDate
      FROM Opportunity
      WHERE IsClosed = false
      ${filters.timePeriod ? `AND CloseDate = ${this.getTimePeriodValue(filters.timePeriod)}` : ''}
      ORDER BY Amount DESC
      LIMIT 20
    `.trim().replace(/\s+/g, ' '),

    'win-rate': (filters) => `
      SELECT
        COUNT(Id) total,
        SUM(CASE WHEN IsWon = true THEN 1 ELSE 0 END) won
      FROM Opportunity
      WHERE IsClosed = true
      ${filters.timePeriod ? `AND CloseDate = ${this.getTimePeriodValue(filters.timePeriod)}` : ''}
    `.trim().replace(/\s+/g, ' '),

    // Territory queries
    'territory-count': () => `
      SELECT COUNT(Id) total FROM Territory2
    `.trim(),

    'accounts-by-territory': () => `
      SELECT Territory2.Name territoryName, COUNT(Id) accountCount
      FROM ObjectTerritory2Association
      WHERE ObjectId IN (SELECT Id FROM Account)
      GROUP BY Territory2.Name
    `.trim().replace(/\s+/g, ' '),

    // Automation queries (Tooling API)
    'flow-count': () => `
      SELECT COUNT(Id) total FROM Flow WHERE Status = 'Active'
    `.trim(),

    'flows-by-type': () => `
      SELECT ProcessType, COUNT(Id) count
      FROM Flow
      WHERE Status = 'Active'
      GROUP BY ProcessType
    `.trim().replace(/\s+/g, ' '),

    // Data Quality queries
    'account-completeness': () => `
      SELECT
        COUNT(Id) total,
        COUNT(Industry) hasIndustry,
        COUNT(Website) hasWebsite,
        COUNT(Phone) hasPhone,
        COUNT(BillingCity) hasBillingCity
      FROM Account
    `.trim().replace(/\s+/g, ' '),

    'contact-completeness': () => `
      SELECT
        COUNT(Id) total,
        COUNT(Email) hasEmail,
        COUNT(Phone) hasPhone,
        COUNT(Title) hasTitle,
        COUNT(MailingCity) hasMailingCity
      FROM Contact
    `.trim().replace(/\s+/g, ' '),

    // Executive Summary queries
    'qtd-revenue': () => `
      SELECT SUM(Amount) revenue
      FROM Opportunity
      WHERE IsWon = true AND CloseDate = THIS_FISCAL_QUARTER
    `.trim().replace(/\s+/g, ' '),

    'revenue-by-week': () => `
      SELECT CALENDAR_WEEK(CloseDate) week, SUM(Amount) amount
      FROM Opportunity
      WHERE IsWon = true AND CloseDate = THIS_FISCAL_QUARTER
      GROUP BY CALENDAR_WEEK(CloseDate)
      ORDER BY CALENDAR_WEEK(CloseDate)
    `.trim().replace(/\s+/g, ' ')
  };

  /**
   * Get time period value for inline query
   * @param {string} period - Period identifier
   * @returns {string} SOQL date literal
   */
  getTimePeriodValue(period) {
    const map = {
      'this-quarter': 'THIS_FISCAL_QUARTER',
      'last-quarter': 'LAST_FISCAL_QUARTER',
      'this-year': 'THIS_FISCAL_YEAR',
      'last-year': 'LAST_FISCAL_YEAR',
      'this-month': 'THIS_MONTH',
      'last-month': 'LAST_MONTH',
      'last-30-days': 'LAST_N_DAYS:30',
      'last-90-days': 'LAST_N_DAYS:90'
    };
    return map[period] || 'THIS_FISCAL_QUARTER';
  }

  /**
   * Clear query cache
   */
  clearCache() {
    this.queryCache.clear();
  }
}

module.exports = SalesforceBindings;
