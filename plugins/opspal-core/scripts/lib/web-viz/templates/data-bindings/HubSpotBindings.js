/**
 * HubSpot Data Bindings
 *
 * Generates and executes HubSpot API queries for dashboard template data bindings.
 * Supports RevOps templates with HubSpot CRM data.
 *
 * @module web-viz/templates/data-bindings/HubSpotBindings
 * @version 1.1.0
 *
 * Supported Templates:
 * - Sales Pipeline (deals, stages, pipeline metrics)
 * - Automation Audit (workflows)
 * - Data Quality (contact/company completeness)
 * - Executive Summary (revenue, forecasts)
 * - Process Documentation (static - no queries)
 *
 * NOT Supported (Salesforce-only):
 * - Territory Planning (no Territory2 equivalent)
 * - Automation Diagnostics (no ApexLog equivalent)
 */

const { execSync } = require('child_process');

class HubSpotBindings {
  /**
   * Create HubSpotBindings
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = options;
    this.portalId = options.portalId || process.env.HUBSPOT_PORTAL_ID;
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
    if (binding.hubspot) {
      return this.executeCustomQuery(binding.hubspot, filters);
    }

    throw new Error(`Invalid HubSpot binding specification: ${JSON.stringify(binding)}`);
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
      throw new Error(`Unknown HubSpot query: ${queryId}`);
    }

    return typeof queryDef === 'function' ? queryDef(filters, this) : queryDef;
  }

  /**
   * Execute a custom query from binding spec
   * @param {Object} spec - Query specification
   * @param {Object} filters - Active filters
   * @returns {Promise<*>} Query results
   */
  async executeCustomQuery(spec, filters) {
    const { object, properties, aggregation, groupBy } = spec;

    // Build HubSpot API search request
    const searchRequest = this.buildSearchRequest(object, properties, filters, spec.filters);

    return this.executeSearch(object, searchRequest);
  }

  /**
   * Build HubSpot search request body
   * @param {string} object - Object type (contacts, companies, deals)
   * @param {string[]} properties - Properties to retrieve
   * @param {Object} filters - Runtime filters
   * @param {Object} staticFilters - Static filter conditions
   * @returns {Object} Search request body
   */
  buildSearchRequest(object, properties, filters, staticFilters = {}) {
    const request = {
      properties: properties || [],
      limit: 100,
      filterGroups: []
    };

    const filterConditions = [];

    // Add time period filter
    if (filters.timePeriod) {
      const { startDate, endDate } = this.getTimePeriodFilter(filters.timePeriod);
      filterConditions.push({
        propertyName: this.getDateProperty(object),
        operator: 'BETWEEN',
        highValue: endDate,
        value: startDate
      });
    }

    // Add static filters
    if (staticFilters) {
      for (const [property, condition] of Object.entries(staticFilters)) {
        if (condition.notIn) {
          // NOT IN filter
          filterConditions.push({
            propertyName: property,
            operator: 'NOT_IN',
            values: condition.notIn
          });
        } else if (condition.in) {
          // IN filter
          filterConditions.push({
            propertyName: property,
            operator: 'IN',
            values: condition.in
          });
        } else if (typeof condition === 'string') {
          // Equality filter
          filterConditions.push({
            propertyName: property,
            operator: 'EQ',
            value: condition
          });
        }
      }
    }

    if (filterConditions.length > 0) {
      request.filterGroups.push({ filters: filterConditions });
    }

    return request;
  }

  /**
   * Get the appropriate date property for an object
   * @param {string} object - Object type
   * @returns {string} Date property name
   */
  getDateProperty(object) {
    const dateProperties = {
      deals: 'closedate',
      contacts: 'createdate',
      companies: 'createdate',
      tickets: 'createdate'
    };
    return dateProperties[object] || 'createdate';
  }

  /**
   * Execute HubSpot search via MCP or CLI
   * @param {string} object - Object type
   * @param {Object} request - Search request body
   * @returns {Promise<Array>} Search results
   */
  async executeSearch(object, request) {
    // Check cache
    const cacheKey = `${object}:${JSON.stringify(request)}`;
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      // Try HubSpot MCP if available
      const HubSpotAdapter = require('../../adapters/HubSpotAdapter');
      const adapter = new HubSpotAdapter(this.options);
      const data = await adapter.search(object, request);

      // Cache result
      this.queryCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      // Return empty with message if adapter not available
      console.warn(`HubSpot query failed: ${error.message}`);
      return {
        results: [],
        message: 'HubSpot adapter not available - use demo data'
      };
    }
  }

  /**
   * Get time period filter for HubSpot
   * @param {string} period - Period identifier
   * @returns {Object} HubSpot filter object with startDate and endDate
   */
  getTimePeriodFilter(period) {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
      case 'this-quarter':
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        startDate = quarterStart.toISOString();
        endDate = now.toISOString();
        break;

      case 'last-quarter':
        const lastQuarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 3, 1);
        const lastQuarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 0);
        startDate = lastQuarterStart.toISOString();
        endDate = lastQuarterEnd.toISOString();
        break;

      case 'this-month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        endDate = now.toISOString();
        break;

      case 'last-month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
        break;

      case 'last-30-days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        endDate = now.toISOString();
        break;

      case 'last-90-days':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
        endDate = now.toISOString();
        break;

      case 'this-year':
        startDate = new Date(now.getFullYear(), 0, 1).toISOString();
        endDate = now.toISOString();
        break;

      case 'last-year':
        startDate = new Date(now.getFullYear() - 1, 0, 1).toISOString();
        endDate = new Date(now.getFullYear() - 1, 11, 31).toISOString();
        break;

      default:
        // Default to this quarter
        const defaultStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        startDate = defaultStart.toISOString();
        endDate = now.toISOString();
    }

    return { startDate, endDate };
  }

  /**
   * Predefined queries for common HubSpot data bindings
   * Maps Salesforce concepts to HubSpot equivalents
   */
  queries = {
    // ==========================================
    // Sales Pipeline Queries (Deals)
    // ==========================================

    'pipeline-total': async (filters, self) => {
      // Sum of deal amounts in open stages
      const request = self.buildSearchRequest(
        'deals',
        ['amount', 'dealstage'],
        filters,
        { dealstage: { notIn: ['closedwon', 'closedlost'] } }
      );

      const result = await self.executeSearch('deals', request);
      const deals = result.results || result || [];

      const totalAmount = deals.reduce((sum, deal) => {
        return sum + (parseFloat(deal.properties?.amount) || 0);
      }, 0);

      return {
        totalAmount,
        dealCount: deals.length
      };
    },

    'pipeline-count': async (filters, self) => {
      const request = self.buildSearchRequest(
        'deals',
        ['dealstage'],
        filters,
        { dealstage: { notIn: ['closedwon', 'closedlost'] } }
      );

      const result = await self.executeSearch('deals', request);
      const deals = result.results || result || [];

      return {
        total: deals.length
      };
    },

    'pipeline-by-stage': async (filters, self) => {
      const request = self.buildSearchRequest(
        'deals',
        ['dealstage', 'amount'],
        filters,
        { dealstage: { notIn: ['closedwon', 'closedlost'] } }
      );

      const result = await self.executeSearch('deals', request);
      const deals = result.results || result || [];

      // Group by stage
      const byStage = {};
      for (const deal of deals) {
        const stage = deal.properties?.dealstage || 'Unknown';
        if (!byStage[stage]) {
          byStage[stage] = { count: 0, amount: 0 };
        }
        byStage[stage].count++;
        byStage[stage].amount += parseFloat(deal.properties?.amount) || 0;
      }

      return Object.entries(byStage).map(([stage, data]) => ({
        stageName: stage,
        count: data.count,
        amount: data.amount
      }));
    },

    'top-opportunities': async (filters, self) => {
      const request = self.buildSearchRequest(
        'deals',
        ['dealname', 'amount', 'dealstage', 'closedate', 'hubspot_owner_id'],
        filters,
        { dealstage: { notIn: ['closedwon', 'closedlost'] } }
      );
      request.sorts = [{ propertyName: 'amount', direction: 'DESCENDING' }];
      request.limit = 20;

      const result = await self.executeSearch('deals', request);
      const deals = result.results || result || [];

      return deals.map(deal => ({
        id: deal.id,
        name: deal.properties?.dealname,
        amount: parseFloat(deal.properties?.amount) || 0,
        stageName: deal.properties?.dealstage,
        closeDate: deal.properties?.closedate,
        ownerId: deal.properties?.hubspot_owner_id
      }));
    },

    'win-rate': async (filters, self) => {
      // Get closed deals
      const request = self.buildSearchRequest(
        'deals',
        ['dealstage'],
        filters,
        { dealstage: { in: ['closedwon', 'closedlost'] } }
      );

      const result = await self.executeSearch('deals', request);
      const deals = result.results || result || [];

      const total = deals.length;
      const won = deals.filter(d => d.properties?.dealstage === 'closedwon').length;
      const rate = total > 0 ? (won / total) * 100 : 0;

      return { total, won, rate };
    },

    'avg-deal-size': async (filters, self) => {
      const request = self.buildSearchRequest(
        'deals',
        ['amount'],
        filters,
        { dealstage: 'closedwon' }
      );

      const result = await self.executeSearch('deals', request);
      const deals = result.results || result || [];

      const total = deals.reduce((sum, d) => sum + (parseFloat(d.properties?.amount) || 0), 0);
      const avg = deals.length > 0 ? total / deals.length : 0;

      return { avgAmount: avg, dealCount: deals.length };
    },

    // ==========================================
    // Automation Queries (Workflows)
    // ==========================================

    'workflow-count': async (filters, self) => {
      // HubSpot workflows require special API endpoint
      // This returns placeholder - actual implementation needs workflow API
      return {
        total: 0,
        active: 0,
        message: 'Use HubSpot MCP tool for workflow data: mcp__hubspot__list_workflows'
      };
    },

    'workflows-by-type': async (filters, self) => {
      return {
        results: [],
        message: 'Use HubSpot MCP tool for workflow data'
      };
    },

    'automation-count': async (filters, self) => {
      return {
        total: 0,
        message: 'Use HubSpot MCP tool for automation data'
      };
    },

    // ==========================================
    // Data Quality Queries
    // ==========================================

    'contact-completeness': async (filters, self) => {
      const request = self.buildSearchRequest(
        'contacts',
        ['email', 'phone', 'company', 'jobtitle', 'city'],
        filters
      );
      request.limit = 1000;

      const result = await self.executeSearch('contacts', request);
      const contacts = result.results || result || [];

      const total = contacts.length;
      const hasEmail = contacts.filter(c => c.properties?.email).length;
      const hasPhone = contacts.filter(c => c.properties?.phone).length;
      const hasCompany = contacts.filter(c => c.properties?.company).length;
      const hasTitle = contacts.filter(c => c.properties?.jobtitle).length;
      const hasCity = contacts.filter(c => c.properties?.city).length;

      return {
        total,
        hasEmail,
        hasPhone,
        hasCompany,
        hasTitle,
        hasCity,
        emailPercent: total > 0 ? (hasEmail / total) * 100 : 0,
        phonePercent: total > 0 ? (hasPhone / total) * 100 : 0,
        companyPercent: total > 0 ? (hasCompany / total) * 100 : 0
      };
    },

    'company-completeness': async (filters, self) => {
      const request = self.buildSearchRequest(
        'companies',
        ['domain', 'industry', 'annualrevenue', 'numberofemployees', 'phone', 'city'],
        filters
      );
      request.limit = 1000;

      const result = await self.executeSearch('companies', request);
      const companies = result.results || result || [];

      const total = companies.length;
      const hasDomain = companies.filter(c => c.properties?.domain).length;
      const hasIndustry = companies.filter(c => c.properties?.industry).length;
      const hasRevenue = companies.filter(c => c.properties?.annualrevenue).length;
      const hasEmployees = companies.filter(c => c.properties?.numberofemployees).length;
      const hasPhone = companies.filter(c => c.properties?.phone).length;

      return {
        total,
        hasDomain,
        hasIndustry,
        hasRevenue,
        hasEmployees,
        hasPhone,
        domainPercent: total > 0 ? (hasDomain / total) * 100 : 0,
        industryPercent: total > 0 ? (hasIndustry / total) * 100 : 0,
        revenuePercent: total > 0 ? (hasRevenue / total) * 100 : 0
      };
    },

    'deal-completeness': async (filters, self) => {
      const request = self.buildSearchRequest(
        'deals',
        ['amount', 'closedate', 'dealstage', 'pipeline', 'hubspot_owner_id'],
        filters
      );
      request.limit = 1000;

      const result = await self.executeSearch('deals', request);
      const deals = result.results || result || [];

      const total = deals.length;
      const hasAmount = deals.filter(d => d.properties?.amount).length;
      const hasCloseDate = deals.filter(d => d.properties?.closedate).length;
      const hasOwner = deals.filter(d => d.properties?.hubspot_owner_id).length;

      return {
        total,
        hasAmount,
        hasCloseDate,
        hasOwner,
        amountPercent: total > 0 ? (hasAmount / total) * 100 : 0,
        closeDatePercent: total > 0 ? (hasCloseDate / total) * 100 : 0
      };
    },

    // ==========================================
    // Executive Summary Queries
    // ==========================================

    'qtd-revenue': async (filters, self) => {
      const request = self.buildSearchRequest(
        'deals',
        ['amount', 'closedate'],
        { timePeriod: 'this-quarter' },
        { dealstage: 'closedwon' }
      );

      const result = await self.executeSearch('deals', request);
      const deals = result.results || result || [];

      const revenue = deals.reduce((sum, d) => sum + (parseFloat(d.properties?.amount) || 0), 0);

      return {
        revenue,
        dealCount: deals.length
      };
    },

    'revenue-by-week': async (filters, self) => {
      const request = self.buildSearchRequest(
        'deals',
        ['amount', 'closedate'],
        { timePeriod: 'this-quarter' },
        { dealstage: 'closedwon' }
      );
      request.limit = 500;

      const result = await self.executeSearch('deals', request);
      const deals = result.results || result || [];

      // Group by week
      const byWeek = {};
      for (const deal of deals) {
        const closeDate = new Date(deal.properties?.closedate);
        const weekStart = new Date(closeDate);
        weekStart.setDate(closeDate.getDate() - closeDate.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!byWeek[weekKey]) {
          byWeek[weekKey] = 0;
        }
        byWeek[weekKey] += parseFloat(deal.properties?.amount) || 0;
      }

      return Object.entries(byWeek)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, amount]) => ({ week, amount }));
    },

    'revenue-by-segment': async (filters, self) => {
      // HubSpot doesn't have built-in segments, use custom property or pipeline
      const request = self.buildSearchRequest(
        'deals',
        ['amount', 'pipeline'],
        { timePeriod: 'this-quarter' },
        { dealstage: 'closedwon' }
      );

      const result = await self.executeSearch('deals', request);
      const deals = result.results || result || [];

      // Group by pipeline as proxy for segment
      const bySegment = {};
      for (const deal of deals) {
        const segment = deal.properties?.pipeline || 'Default';
        if (!bySegment[segment]) {
          bySegment[segment] = 0;
        }
        bySegment[segment] += parseFloat(deal.properties?.amount) || 0;
      }

      return Object.entries(bySegment).map(([segment, amount]) => ({
        segment,
        amount
      }));
    },

    'quota-attainment': async (filters, self) => {
      // Quota not natively in HubSpot - return placeholder
      return {
        actual: 0,
        quota: 0,
        percent: 0,
        message: 'Quota data requires custom property or external source'
      };
    },

    'forecast-summary': async (filters, self) => {
      // Get deals by probability/stage for forecast
      const request = self.buildSearchRequest(
        'deals',
        ['amount', 'dealstage', 'closedate'],
        filters,
        { dealstage: { notIn: ['closedwon', 'closedlost'] } }
      );

      const result = await self.executeSearch('deals', request);
      const deals = result.results || result || [];

      // Simple forecast buckets based on stage
      const stageWeights = {
        'appointmentscheduled': 0.2,
        'qualifiedtobuy': 0.4,
        'presentationscheduled': 0.6,
        'decisionmakerboughtin': 0.8,
        'contractsent': 0.9
      };

      let commit = 0;
      let bestCase = 0;
      let pipeline = 0;

      for (const deal of deals) {
        const amount = parseFloat(deal.properties?.amount) || 0;
        const stage = deal.properties?.dealstage?.toLowerCase();
        const weight = stageWeights[stage] || 0.3;

        if (weight >= 0.8) {
          commit += amount;
        }
        if (weight >= 0.5) {
          bestCase += amount;
        }
        pipeline += amount;
      }

      return { commit, bestCase, pipeline };
    }
  };

  /**
   * Clear query cache
   */
  clearCache() {
    this.queryCache.clear();
  }

  /**
   * Check if HubSpot is available
   * @returns {boolean}
   */
  isAvailable() {
    return !!this.portalId || !!process.env.HUBSPOT_ACCESS_TOKEN;
  }
}

module.exports = HubSpotBindings;
