#!/usr/bin/env node

/**
 * Feature Detector
 *
 * Platform-agnostic feature detection for auto-tailoring runbook sections.
 * Each platform adapter implements specific detection queries.
 *
 * Features Detected:
 * - Salesforce: Lead Lifecycle, Opportunity Pipeline, CPQ, Data Quality, Integrations, Security
 * - HubSpot: Contact Lifecycle, Deal Pipeline, Marketing Automation, Integrations, Content
 *
 * The detector returns a feature flags object that the renderer uses
 * to conditionally include sections in the runbook.
 *
 * @module runbook-framework/core/feature-detector
 */

const { execSync } = require('child_process');

/**
 * Base feature detector - provides common utilities
 */
class FeatureDetector {
  /**
   * Create a new feature detector
   * @param {Object} adapter - Platform adapter instance
   */
  constructor(adapter) {
    this.adapter = adapter;
  }

  /**
   * Execute a Salesforce SOQL query
   * @param {string} soql - SOQL query string
   * @param {Object} [options] - Query options
   * @param {boolean} [options.toolingApi] - Use Tooling API
   * @returns {Object|null} Query result or null on failure
   */
  executeSoqlQuery(soql, options = {}) {
    try {
      const identifier = this.adapter.getInstanceIdentifier();
      let command = `sf data query --query "${soql.replace(/"/g, '\\"')}" --target-org ${identifier} --json`;

      if (options.toolingApi) {
        command += ' --use-tooling-api';
      }

      const result = execSync(command, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60000
      });

      return JSON.parse(result);
    } catch (err) {
      console.warn(`SOQL query failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Execute a HubSpot API request
   * @param {string} endpoint - API endpoint
   * @param {Object} [options] - Request options
   * @returns {Object|null} API response or null on failure
   */
  async executeHubSpotApi(endpoint, options = {}) {
    const accessToken = options.accessToken ||
      this.adapter?.options?.accessToken ||
      process.env.HUBSPOT_PRIVATE_APP_TOKEN ||
      process.env.HUBSPOT_ACCESS_TOKEN;

    if (!accessToken) {
      console.warn('HubSpot feature detection skipped: HUBSPOT_PRIVATE_APP_TOKEN not configured');
      return null;
    }

    const method = options.method || 'GET';
    const baseUrl = options.baseUrl || 'https://api.hubapi.com';
    const url = new URL(endpoint, baseUrl);

    if (options.query && typeof options.query === 'object') {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined || value === null || value === '') continue;
        url.searchParams.set(key, String(value));
      }
    }

    const requestOptions = {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (options.body !== undefined) {
      requestOptions.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, requestOptions);
      const raw = await response.text();

      let parsed = {};
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch (_) {
          parsed = { raw };
        }
      }

      if (!response.ok) {
        if (!options.silent) {
          console.warn(
            `HubSpot API request failed (${method} ${url.pathname}): ` +
            `HTTP ${response.status}`
          );
        }
        return null;
      }

      return parsed;
    } catch (err) {
      if (!options.silent) {
        console.warn(`HubSpot API request failed (${method} ${endpoint}): ${err.message}`);
      }
      return null;
    }
  }

  /**
   * Safely get record count from query result
   * @param {Object} result - Query result
   * @returns {number} Record count
   */
  getRecordCount(result) {
    if (!result || !result.result) return 0;
    if (result.result.totalSize !== undefined) return result.result.totalSize;
    if (result.result.records) return result.result.records.length;
    return 0;
  }

  /**
   * Safely get records from query result
   * @param {Object} result - Query result
   * @returns {Array} Records array
   */
  getRecords(result) {
    if (!result || !result.result || !result.result.records) return [];
    return result.result.records;
  }
}

/**
 * Salesforce-specific feature detection
 */
class SalesforceFeatureDetector extends FeatureDetector {
  /**
   * Detect all Salesforce features
   * @returns {Promise<Object>} Feature flags and details
   */
  async detectFeatures() {
    const features = {
      // Feature flags (boolean)
      hasLeadLifecycle: false,
      hasOpportunityPipeline: false,
      hasDataQualityRules: false,
      hasIntegrations: false,
      hasUserAccessComplexity: false,
      hasCPQ: false,
      hasServiceCloud: false,

      // Feature details (for template rendering)
      featureDetails: {
        leadLifecycle: null,
        opportunityPipeline: null,
        dataQuality: null,
        integrations: [],
        userAccess: null,
        cpq: null,
        serviceCloud: null
      }
    };

    // Run detection in parallel for performance
    const results = await Promise.allSettled([
      this.detectLeadLifecycle(),
      this.detectOpportunityPipeline(),
      this.detectDataQuality(),
      this.detectIntegrations(),
      this.detectUserAccess(),
      this.detectCPQ(),
      this.detectServiceCloud()
    ]);

    // Process results
    const [lead, opp, quality, integrations, access, cpq, service] = results;

    if (lead.status === 'fulfilled' && lead.value) {
      features.hasLeadLifecycle = lead.value.hasLeads;
      features.featureDetails.leadLifecycle = lead.value;
    }

    if (opp.status === 'fulfilled' && opp.value) {
      features.hasOpportunityPipeline = opp.value.hasOpportunities;
      features.featureDetails.opportunityPipeline = opp.value;
    }

    if (quality.status === 'fulfilled' && quality.value) {
      features.hasDataQualityRules = quality.value.hasRules;
      features.featureDetails.dataQuality = quality.value;
    }

    if (integrations.status === 'fulfilled' && integrations.value) {
      features.hasIntegrations = integrations.value.length > 0;
      features.featureDetails.integrations = integrations.value;
    }

    if (access.status === 'fulfilled' && access.value) {
      features.hasUserAccessComplexity = access.value.isComplex;
      features.featureDetails.userAccess = access.value;
    }

    if (cpq.status === 'fulfilled' && cpq.value) {
      features.hasCPQ = cpq.value.hasCPQ;
      features.featureDetails.cpq = cpq.value;
    }

    if (service.status === 'fulfilled' && service.value) {
      features.hasServiceCloud = service.value.hasCases;
      features.featureDetails.serviceCloud = service.value;
    }

    return features;
  }

  /**
   * Detect Lead Lifecycle features
   * @returns {Promise<Object>} Lead lifecycle details
   */
  async detectLeadLifecycle() {
    // Check if leads exist
    const countResult = this.executeSoqlQuery('SELECT COUNT() FROM Lead');
    const leadCount = this.getRecordCount(countResult);

    if (leadCount === 0) {
      return { hasLeads: false };
    }

    // Get lead statuses
    const statusResult = this.executeSoqlQuery(
      'SELECT MasterLabel, IsConverted, SortOrder FROM LeadStatus ORDER BY SortOrder'
    );
    const statuses = this.getRecords(statusResult).map(r => ({
      label: r.MasterLabel,
      isConverted: r.IsConverted ? 'Yes' : 'No',
      sortOrder: r.SortOrder
    }));

    // Get recent conversion rate (last 6 months)
    const conversionResult = this.executeSoqlQuery(`
      SELECT COUNT(Id) total FROM Lead
      WHERE CreatedDate >= LAST_N_DAYS:180 AND IsConverted = true
    `.trim());
    const convertedCount = this.getRecordCount(conversionResult);

    const totalRecentResult = this.executeSoqlQuery(`
      SELECT COUNT(Id) total FROM Lead
      WHERE CreatedDate >= LAST_N_DAYS:180
    `.trim());
    const totalRecent = this.getRecordCount(totalRecentResult);

    const conversionRate = totalRecent > 0
      ? Math.round((convertedCount / totalRecent) * 100)
      : 0;

    return {
      hasLeads: true,
      totalLeads: leadCount,
      stages: statuses,
      conversionRate: `${conversionRate}%`,
      notes: `${leadCount} total leads, ${conversionRate}% conversion rate (last 6 months)`
    };
  }

  /**
   * Detect Opportunity Pipeline features
   * @returns {Promise<Object>} Pipeline details
   */
  async detectOpportunityPipeline() {
    // Check if opportunities exist
    const countResult = this.executeSoqlQuery('SELECT COUNT() FROM Opportunity');
    const oppCount = this.getRecordCount(countResult);

    if (oppCount === 0) {
      return { hasOpportunities: false };
    }

    // Get stage distribution
    const stageResult = this.executeSoqlQuery(`
      SELECT StageName, COUNT(Id) cnt
      FROM Opportunity
      WHERE IsClosed = false
      GROUP BY StageName
      ORDER BY COUNT(Id) DESC
    `.trim());

    const stages = this.getRecords(stageResult).map(r => ({
      name: r.StageName,
      count: r.cnt,
      percentage: Math.round((r.cnt / oppCount) * 100)
    }));

    // Calculate win rate
    const wonResult = this.executeSoqlQuery(`
      SELECT COUNT(Id) cnt FROM Opportunity
      WHERE IsWon = true AND CloseDate >= LAST_N_DAYS:365
    `.trim());
    const wonCount = this.getRecordCount(wonResult);

    const closedResult = this.executeSoqlQuery(`
      SELECT COUNT(Id) cnt FROM Opportunity
      WHERE IsClosed = true AND CloseDate >= LAST_N_DAYS:365
    `.trim());
    const closedCount = this.getRecordCount(closedResult);

    const winRate = closedCount > 0
      ? Math.round((wonCount / closedCount) * 100)
      : 0;

    return {
      hasOpportunities: true,
      totalOpportunities: oppCount,
      stages,
      winRate: `${winRate}%`,
      healthNotes: `${oppCount} total opportunities, ${winRate}% win rate (last 12 months)`
    };
  }

  /**
   * Detect Data Quality rules
   * @returns {Promise<Object>} Data quality details
   */
  async detectDataQuality() {
    // Count validation rules (Tooling API)
    const validationResult = this.executeSoqlQuery(
      'SELECT COUNT() FROM ValidationRule WHERE Active = true',
      { toolingApi: true }
    );
    const validationCount = this.getRecordCount(validationResult);

    // Count duplicate rules
    const dupeResult = this.executeSoqlQuery(
      'SELECT COUNT() FROM DuplicateRule WHERE IsActive = true',
      { toolingApi: true }
    );
    const dupeCount = this.getRecordCount(dupeResult);

    // Get top validation rules
    const topRulesResult = this.executeSoqlQuery(
      'SELECT EntityDefinition.QualifiedApiName, ValidationName FROM ValidationRule WHERE Active = true LIMIT 10',
      { toolingApi: true }
    );
    const topRules = this.getRecords(topRulesResult).map(r => ({
      name: r.ValidationName,
      object: r.EntityDefinition?.QualifiedApiName || 'Unknown',
      description: 'Validation rule'
    }));

    return {
      hasRules: validationCount > 0 || dupeCount > 0,
      validationRuleCount: validationCount,
      duplicateRuleCount: dupeCount,
      objectCount: [...new Set(topRules.map(r => r.object))].length,
      topRules
    };
  }

  /**
   * Detect Integration points
   * @returns {Promise<Object[]>} Integration details
   */
  async detectIntegrations() {
    // Query connected apps (Tooling API)
    const connectedAppsResult = this.executeSoqlQuery(
      'SELECT Name, ContactEmail FROM ConnectedApplication LIMIT 20',
      { toolingApi: true }
    );

    const integrations = this.getRecords(connectedAppsResult).map(r => ({
      name: r.Name,
      type: 'Connected App',
      status: 'Active',
      notes: r.ContactEmail ? `Contact: ${r.ContactEmail}` : ''
    }));

    return integrations;
  }

  /**
   * Detect User Access complexity
   * @returns {Promise<Object>} User access details
   */
  async detectUserAccess() {
    // Count custom permission sets
    const permSetResult = this.executeSoqlQuery(
      'SELECT COUNT() FROM PermissionSet WHERE IsCustom = true'
    );
    const customPermSets = this.getRecordCount(permSetResult);

    // Count active profiles
    const profileResult = this.executeSoqlQuery(
      "SELECT COUNT() FROM Profile WHERE UserType = 'Standard'"
    );
    const activeProfiles = this.getRecordCount(profileResult);

    // Count permission set groups
    const psgResult = this.executeSoqlQuery(
      'SELECT COUNT() FROM PermissionSetGroup'
    );
    const permSetGroups = this.getRecordCount(psgResult);

    // Determine complexity
    const isComplex = customPermSets > 20 || activeProfiles > 10;
    const fragmentationWarning = customPermSets > 50;

    return {
      isComplex,
      customPermissionSets: customPermSets,
      activeProfiles,
      permissionSetGroups: permSetGroups,
      fragmentationWarning
    };
  }

  /**
   * Detect CPQ (Salesforce CPQ / SBQQ)
   * @returns {Promise<Object>} CPQ details
   */
  async detectCPQ() {
    // Check for SBQQ namespace objects
    const cpqResult = this.executeSoqlQuery(
      "SELECT COUNT() FROM SBQQ__Quote__c",
      { toolingApi: false }
    );

    // If query fails, CPQ is not installed
    if (!cpqResult || cpqResult.status === 1) {
      return { hasCPQ: false };
    }

    const quoteCount = this.getRecordCount(cpqResult);

    return {
      hasCPQ: true,
      quoteCount,
      notes: `CPQ installed with ${quoteCount} quotes`
    };
  }

  /**
   * Detect Service Cloud usage
   * @returns {Promise<Object>} Service Cloud details
   */
  async detectServiceCloud() {
    // Check if cases exist
    const caseResult = this.executeSoqlQuery('SELECT COUNT() FROM Case');
    const caseCount = this.getRecordCount(caseResult);

    if (caseCount === 0) {
      return { hasCases: false };
    }

    // Get case status distribution
    const statusResult = this.executeSoqlQuery(`
      SELECT Status, COUNT(Id) cnt
      FROM Case
      WHERE IsClosed = false
      GROUP BY Status
      ORDER BY COUNT(Id) DESC
    `.trim());

    const statuses = this.getRecords(statusResult).map(r => ({
      status: r.Status,
      count: r.cnt
    }));

    return {
      hasCases: true,
      totalCases: caseCount,
      openCaseStatuses: statuses
    };
  }
}

/**
 * HubSpot-specific feature detection
 */
class HubSpotFeatureDetector extends FeatureDetector {
  /**
   * Detect all HubSpot features
   * @returns {Promise<Object>} Feature flags and details
   */
  async detectFeatures() {
    const features = {
      // Feature flags
      hasContactLifecycle: false,
      hasDealPipeline: false,
      hasMarketingAutomation: false,
      hasContentStrategy: false,
      hasIntegrations: false,

      // Feature details
      featureDetails: {
        contactLifecycle: null,
        dealPipeline: null,
        marketingAutomation: null,
        contentStrategy: null,
        integrations: []
      }
    };

    const results = await Promise.allSettled([
      this.detectContactLifecycle(),
      this.detectDealPipeline(),
      this.detectMarketingAutomation(),
      this.detectContentStrategy(),
      this.detectIntegrations()
    ]);

    const [contactLifecycle, dealPipeline, marketingAutomation, contentStrategy, integrations] = results;

    if (contactLifecycle.status === 'fulfilled' && contactLifecycle.value) {
      features.hasContactLifecycle = contactLifecycle.value.hasLifecycleProperty;
      features.featureDetails.contactLifecycle = contactLifecycle.value;
    }

    if (dealPipeline.status === 'fulfilled' && dealPipeline.value) {
      features.hasDealPipeline = dealPipeline.value.hasDealsPipeline;
      features.featureDetails.dealPipeline = dealPipeline.value;
    }

    if (marketingAutomation.status === 'fulfilled' && marketingAutomation.value) {
      features.hasMarketingAutomation = marketingAutomation.value.hasAutomation;
      features.featureDetails.marketingAutomation = marketingAutomation.value;
    }

    if (contentStrategy.status === 'fulfilled' && contentStrategy.value) {
      features.hasContentStrategy = contentStrategy.value.hasContent;
      features.featureDetails.contentStrategy = contentStrategy.value;
    }

    if (integrations.status === 'fulfilled' && integrations.value) {
      features.hasIntegrations = integrations.value.length > 0;
      features.featureDetails.integrations = integrations.value;
    }

    return features;
  }

  /**
   * Detect contact lifecycle setup
   * @returns {Promise<Object>}
   */
  async detectContactLifecycle() {
    const lifecycleProperty = await this.executeHubSpotApi(
      '/crm/v3/properties/contacts/lifecyclestage',
      { silent: true }
    );

    if (!lifecycleProperty || !Array.isArray(lifecycleProperty.options)) {
      return { hasLifecycleProperty: false };
    }

    const contactCount = await this.executeHubSpotApi('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: { limit: 1, properties: ['lifecyclestage'] },
      silent: true
    });

    const stages = lifecycleProperty.options.map((option, index) => ({
      value: option.value,
      label: option.label,
      order: option.displayOrder ?? index
    }));

    return {
      hasLifecycleProperty: true,
      stageCount: stages.length,
      stages,
      totalContacts: contactCount?.total || 0
    };
  }

  /**
   * Detect deal pipeline configuration
   * @returns {Promise<Object>}
   */
  async detectDealPipeline() {
    const pipelineResponse = await this.executeHubSpotApi('/crm/v3/pipelines/deals', { silent: true });
    const pipelines = pipelineResponse?.results || [];

    if (pipelines.length === 0) {
      return { hasDealsPipeline: false };
    }

    const pipelineSummaries = pipelines.map((pipeline) => ({
      id: pipeline.id,
      label: pipeline.label || pipeline.displayOrder || pipeline.id,
      stageCount: Array.isArray(pipeline.stages) ? pipeline.stages.length : 0
    }));

    return {
      hasDealsPipeline: true,
      pipelineCount: pipelineSummaries.length,
      pipelines: pipelineSummaries
    };
  }

  /**
   * Detect marketing automation artifacts
   * @returns {Promise<Object>}
   */
  async detectMarketingAutomation() {
    const workflowResponse = await this.executeHubSpotApi('/automation/v4/workflows', {
      query: { limit: 50 },
      silent: true
    });

    const workflows = workflowResponse?.results || [];
    if (workflows.length > 0) {
      return {
        hasAutomation: true,
        workflowCount: workflows.length,
        sampleWorkflows: workflows.slice(0, 5).map((workflow) => workflow.name || workflow.id)
      };
    }

    const formsResponse = await this.executeHubSpotApi('/marketing/v3/forms', {
      query: { limit: 10 },
      silent: true
    });
    const forms = formsResponse?.results || [];

    return {
      hasAutomation: forms.length > 0,
      workflowCount: 0,
      formCount: forms.length
    };
  }

  /**
   * Detect content and CMS usage
   * @returns {Promise<Object>}
   */
  async detectContentStrategy() {
    const landingPages = await this.executeHubSpotApi('/cms/v3/pages/landing-pages', {
      query: { limit: 20 },
      silent: true
    });
    const blogPosts = await this.executeHubSpotApi('/cms/v3/blogs/posts', {
      query: { limit: 20 },
      silent: true
    });

    const landingPageCount = landingPages?.total || landingPages?.results?.length || 0;
    const blogPostCount = blogPosts?.total || blogPosts?.results?.length || 0;

    return {
      hasContent: landingPageCount > 0 || blogPostCount > 0,
      landingPageCount,
      blogPostCount
    };
  }

  /**
   * Detect installed integrations/apps
   * @returns {Promise<Array<Object>>}
   */
  async detectIntegrations() {
    const response = await this.executeHubSpotApi('/integrations/v1/installed-apps', {
      silent: true
    });

    const apps = Array.isArray(response?.results)
      ? response.results
      : (Array.isArray(response) ? response : []);

    return apps.map((app) => ({
      name: app.name || app.appName || app.id || 'Unknown Integration',
      type: 'HubSpot App',
      status: app.active === false ? 'Inactive' : 'Active',
      notes: app.description || ''
    }));
  }
}

/**
 * Create appropriate feature detector for platform
 * @param {Object} adapter - Platform adapter
 * @returns {FeatureDetector} Platform-specific detector
 */
function createFeatureDetector(adapter) {
  switch (adapter.platform) {
    case 'salesforce':
      return new SalesforceFeatureDetector(adapter);
    case 'hubspot':
      return new HubSpotFeatureDetector(adapter);
    default:
      return new FeatureDetector(adapter);
  }
}

// Export
module.exports = {
  FeatureDetector,
  SalesforceFeatureDetector,
  HubSpotFeatureDetector,
  createFeatureDetector
};
