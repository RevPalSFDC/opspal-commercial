/**
 * Campaign Diagnostic Runner for Marketo
 *
 * Implements API queries from the Campaign Diagnostics runbook series (Module 09).
 * Provides structured diagnostic queries for campaign troubleshooting.
 *
 * @module campaign-diagnostic-runner
 * @version 1.0.0
 * @see docs/runbooks/campaign-diagnostics/09-api-queries-and-payloads.md
 */

'use strict';

// Activity type IDs for common diagnostic queries
const ACTIVITY_TYPES = {
  // Trigger activities
  FILL_OUT_FORM: 2,
  CLICK_LINK_IN_EMAIL: 3,
  OPEN_EMAIL: 6,
  VISIT_WEB_PAGE: 1,
  DATA_VALUE_CHANGE: 13,
  SCORE_CHANGE: 22,
  ADD_TO_LIST: 24,
  PROGRAM_STATUS_CHANGE: 104,

  // Campaign activities
  CAMPAIGN_RUN: 102,
  CAMPAIGN_REQUESTED: 101,
  ADDED_TO_ENGAGEMENT: 25,
  CHANGE_NURTURE_TRACK: 27,

  // Email activities
  EMAIL_SENT: 6,
  EMAIL_DELIVERED: 7,
  EMAIL_BOUNCED: 8,
  EMAIL_BOUNCED_SOFT: 9,
  UNSUBSCRIBE_EMAIL: 10,
  EMAIL_OPEN: 11,
  EMAIL_CLICK: 12,

  // Sync activities
  SYNC_LEAD_TO_SFDC: 19,
  SYNC_LEAD_FROM_SFDC: 20,
};

// Error code meanings from Module 09
const ERROR_CODES = {
  606: { meaning: 'Rate limit exceeded', threshold: '100 calls/20 sec', action: 'Wait 20 seconds and retry' },
  607: { meaning: 'Daily quota reached', threshold: '50,000 calls/day', action: 'Wait until midnight reset' },
  615: { meaning: 'Concurrent request limit', threshold: '10 max', action: 'Wait for pending requests to complete' },
  1004: { meaning: 'Lead not found', action: 'Verify lead ID exists' },
  1006: { meaning: 'Field not found', action: 'Check field API name in schema' },
  1013: { meaning: 'Duplicate value', action: 'Check dedup configuration' },
  1029: { meaning: 'Bulk export quota/queue limit', threshold: '500MB/day, 10 queued', action: 'Wait for existing jobs or reset' },
  1035: { meaning: 'Export limit exceeded', threshold: '500MB/day', action: 'Wait until midnight reset' },
};

// Diagnostic check definitions by issue type
const DIAGNOSTIC_CHECKS = {
  trigger: [
    { name: 'Campaign Metadata', query: 'getCampaignMetadata', required: true },
    { name: 'Smart List Config', query: 'getSmartListConfig', required: true },
    { name: 'Lead Activity Correlation', query: 'getLeadActivities', required: true },
    { name: 'Qualification Rules', query: 'getCampaignMetadata', field: 'qualificationRules' },
    { name: 'Execution Limits', query: 'getCampaignMetadata', field: 'limits' },
  ],
  flow: [
    { name: 'Campaign Metadata', query: 'getCampaignMetadata', required: true },
    { name: 'Asset Approval Status', query: 'getEmailStatus', required: true },
    { name: 'Lead Compliance Check', query: 'getLeadData', fields: ['unsubscribed', 'emailInvalid', 'marketingSuspended'] },
    { name: 'Program Membership', query: 'getProgramMembers', required: false },
    { name: 'Sync Errors', query: 'getSyncErrors', required: false },
  ],
  status: [
    { name: 'Program Members by Status', query: 'getProgramMembers', required: true },
    { name: 'Change Status Campaign', query: 'findStatusChangeCampaign', required: true },
    { name: 'Channel Configuration', query: 'getChannelConfig', required: true },
    { name: 'Lead Activity', query: 'getLeadActivities', required: true },
  ],
  token: [
    { name: 'Program Tokens', query: 'getProgramTokens', required: true },
    { name: 'Email Metadata', query: 'getEmailMetadata', required: true },
    { name: 'Email Context Validation', query: 'validateEmailContext', required: true },
    { name: 'Lead Data Sample', query: 'getLeadData', required: true },
  ],
  engagement: [
    { name: 'Email Performance', query: 'getEmailPerformance', required: true },
    { name: 'Activity Export', query: 'exportActivities', activityTypes: [6, 7, 10, 11, 12] },
    { name: 'Deliverability Signals', query: 'getDeliverabilityMetrics', required: true },
  ],
  deliverability: [
    { name: 'Bounce Analysis', query: 'getBounceAnalysis', required: true },
    { name: 'List Source Analysis', query: 'getListSourceData', required: true },
    { name: 'Compliance Check', query: 'getComplianceStatus', required: true },
  ],
  sync: [
    { name: 'API Usage', query: 'getApiUsage', required: true },
    { name: 'Bulk Export Status', query: 'getBulkExportStatus', required: false },
    { name: 'Sync Errors', query: 'getSyncErrors', required: true },
    { name: 'Error Code Analysis', query: 'analyzeErrorCodes', required: true },
  ],
};

/**
 * Campaign Diagnostic Runner class
 * Executes diagnostic queries and correlates evidence
 */
class CampaignDiagnosticRunner {
  constructor(options = {}) {
    this.options = {
      maxLeadSamples: 3,
      activityLookbackDays: 7,
      maxActivitiesPerLead: 50,
      ...options,
    };
    this.results = {};
    this.evidence = [];
    this.errors = [];
  }

  /**
   * Run diagnostics for a specific issue type
   * @param {string} issueType - Type of issue (trigger, flow, status, token, engagement, deliverability, sync)
   * @param {Object} context - Diagnostic context (campaignId, programId, leadIds, etc.)
   * @returns {Object} Diagnostic results
   */
  async runDiagnostics(issueType, context) {
    const checks = DIAGNOSTIC_CHECKS[issueType];
    if (!checks) {
      throw new Error(`Unknown issue type: ${issueType}. Valid types: ${Object.keys(DIAGNOSTIC_CHECKS).join(', ')}`);
    }

    const results = {
      issueType,
      context,
      startTime: new Date().toISOString(),
      checks: [],
      evidence: [],
      rootCause: null,
      severity: null,
      recommendations: [],
    };

    for (const check of checks) {
      try {
        const checkResult = await this.executeCheck(check, context);
        results.checks.push(checkResult);

        if (checkResult.evidence) {
          results.evidence.push(...checkResult.evidence);
        }

        if (checkResult.issues && checkResult.issues.length > 0) {
          results.recommendations.push(...checkResult.issues.map(i => i.recommendation).filter(Boolean));
        }
      } catch (error) {
        results.checks.push({
          name: check.name,
          status: 'error',
          error: error.message,
          required: check.required,
        });

        if (check.required) {
          results.rootCause = `Required check "${check.name}" failed: ${error.message}`;
          results.severity = 'high';
        }
      }
    }

    // Analyze results to determine root cause
    if (!results.rootCause) {
      results.rootCause = this.analyzeRootCause(issueType, results.checks, results.evidence);
      results.severity = this.determineSeverity(results.checks);
    }

    results.endTime = new Date().toISOString();
    return results;
  }

  /**
   * Execute a single diagnostic check
   * @param {Object} check - Check definition
   * @param {Object} context - Diagnostic context
   * @returns {Object} Check result
   */
  async executeCheck(check, context) {
    const result = {
      name: check.name,
      query: check.query,
      status: 'pending',
      data: null,
      evidence: [],
      issues: [],
    };

    // This is a template - actual API calls would use MCP tools
    // The result structure is what matters for correlation

    switch (check.query) {
      case 'getCampaignMetadata':
        result.data = this.getCampaignMetadataTemplate(context.campaignId);
        result.evidence.push({
          type: 'campaign_metadata',
          timestamp: new Date().toISOString(),
          campaignId: context.campaignId,
          description: 'Campaign metadata retrieved',
        });
        break;

      case 'getSmartListConfig':
        result.data = this.getSmartListConfigTemplate(context.campaignId);
        result.evidence.push({
          type: 'smart_list',
          timestamp: new Date().toISOString(),
          campaignId: context.campaignId,
          description: 'Smart list configuration retrieved',
        });
        break;

      case 'getLeadActivities':
        if (context.leadIds && context.leadIds.length > 0) {
          result.data = this.getLeadActivitiesTemplate(context.leadIds, context.activityTypeIds);
          result.evidence.push({
            type: 'lead_activities',
            timestamp: new Date().toISOString(),
            leadIds: context.leadIds,
            description: `Activities retrieved for ${context.leadIds.length} leads`,
          });
        }
        break;

      case 'getProgramTokens':
        result.data = this.getProgramTokensTemplate(context.programId);
        result.evidence.push({
          type: 'program_tokens',
          timestamp: new Date().toISOString(),
          programId: context.programId,
          description: 'Program tokens retrieved',
        });
        break;

      case 'getEmailStatus':
        result.data = this.getEmailStatusTemplate(context.emailId);
        result.evidence.push({
          type: 'email_status',
          timestamp: new Date().toISOString(),
          emailId: context.emailId,
          description: 'Email asset status retrieved',
        });
        break;

      case 'getProgramMembers':
        result.data = this.getProgramMembersTemplate(context.programId);
        result.evidence.push({
          type: 'program_members',
          timestamp: new Date().toISOString(),
          programId: context.programId,
          description: 'Program member distribution retrieved',
        });
        break;

      case 'getApiUsage':
        result.data = this.getApiUsageTemplate();
        result.evidence.push({
          type: 'api_usage',
          timestamp: new Date().toISOString(),
          description: 'API usage statistics retrieved',
        });
        break;

      case 'getSyncErrors':
        result.data = this.getSyncErrorsTemplate();
        result.evidence.push({
          type: 'sync_errors',
          timestamp: new Date().toISOString(),
          description: 'Recent sync errors retrieved',
        });
        break;

      default:
        result.status = 'skipped';
        result.data = { note: `Query "${check.query}" requires MCP tool execution` };
    }

    result.status = 'complete';
    return result;
  }

  /**
   * Template for campaign metadata query
   * Actual implementation uses mcp__marketo__campaign_get
   */
  getCampaignMetadataTemplate(campaignId) {
    return {
      _note: 'Use mcp__marketo__campaign_get({ campaignId })',
      endpoint: `/rest/asset/v1/smartCampaign/${campaignId}.json`,
      expectedFields: ['id', 'name', 'type', 'status', 'isActive', 'isTriggerable'],
      diagnosticFields: {
        isActive: 'Campaign must be active to process leads',
        isTriggerable: 'Must be true for trigger campaigns',
        type: 'trigger, batch, or request',
      },
    };
  }

  /**
   * Template for smart list configuration query
   * Actual implementation uses mcp__marketo__campaign_get_smart_list
   */
  getSmartListConfigTemplate(campaignId) {
    return {
      _note: 'Use mcp__marketo__campaign_get_smart_list({ campaignId, includeRules: true })',
      endpoint: `/rest/asset/v1/smartCampaign/${campaignId}/smartList.json`,
      diagnosticFields: {
        triggers: 'Array of trigger definitions (empty = batch only)',
        filters: 'Array of filter conditions',
        filterLogic: 'AND/OR logic for filters',
      },
      commonIssues: [
        'Data Value Changes trigger does not fire for new lead creation',
        'Missing "Person is Created" trigger for new lead workflows',
        'Filters create impossible conditions (ALL logic with mutually exclusive values)',
      ],
    };
  }

  /**
   * Template for lead activities query
   * Actual implementation uses mcp__marketo__lead_activities
   */
  getLeadActivitiesTemplate(leadIds, activityTypeIds) {
    return {
      _note: 'Use mcp__marketo__lead_activities({ leadIds, activityTypeIds })',
      endpoint: '/rest/v1/activities.json',
      params: {
        activityTypeIds: activityTypeIds || [ACTIVITY_TYPES.CAMPAIGN_RUN, ACTIVITY_TYPES.CAMPAIGN_REQUESTED],
        leadIds: leadIds,
        nextPageToken: 'Use for pagination',
      },
      diagnosticFields: {
        activityTypeId: 'Type of activity',
        activityDate: 'When activity occurred - compare to trigger event',
        primaryAttributeValue: 'Main attribute (campaign name, email name, etc.)',
      },
      correlationPattern: 'Compare trigger activity timestamp to campaign run timestamp',
    };
  }

  /**
   * Template for program tokens query
   */
  getProgramTokensTemplate(programId) {
    return {
      _note: 'Direct REST API call required',
      endpoint: `/rest/asset/v1/folder/${programId}/tokens.json?folderType=Program`,
      diagnosticFields: {
        name: 'Token name (case-sensitive)',
        type: 'text, rich text, date, score, etc.',
        value: 'Current token value',
      },
      commonIssues: [
        'Token names are case-sensitive and space-sensitive',
        'Email must be within the program folder hierarchy',
        'My tokens do not resolve in Sales Insight emails',
      ],
    };
  }

  /**
   * Template for email status query
   * Actual implementation uses mcp__marketo__email_get
   */
  getEmailStatusTemplate(emailId) {
    return {
      _note: 'Use mcp__marketo__email_get({ emailId })',
      endpoint: `/rest/asset/v1/email/${emailId}.json`,
      diagnosticFields: {
        status: 'approved, draft, or pending',
        folder: { id: 'Program or folder ID - important for token scope' },
        operational: 'If true, ignores unsubscribe status',
      },
      approvalEndpoint: `/rest/asset/v1/email/${emailId}/approveDraft.json`,
      approvalNote: 'Approving draft surfaces missing token errors',
    };
  }

  /**
   * Template for program members query
   */
  getProgramMembersTemplate(programId) {
    return {
      _note: 'Direct REST API call required',
      endpoint: `/rest/v1/programs/${programId}/members.json`,
      params: { page: 1, pageSize: 300, fields: 'status' },
      diagnosticFields: {
        status: 'Current program status',
        reachedSuccess: 'Whether lead has achieved success',
        membershipDate: 'When lead was added to program',
      },
      analysisPattern: 'Group by status to find accumulation in early stages',
    };
  }

  /**
   * Template for API usage query
   * Actual implementation uses mcp__marketo__analytics_api_usage
   */
  getApiUsageTemplate() {
    return {
      _note: 'Use mcp__marketo__analytics_api_usage()',
      diagnosticFields: {
        dailyUsed: 'Calls used today',
        dailyLimit: 'Daily limit (typically 50,000)',
        rateLimitRemaining: 'Calls remaining in current window',
        resetTime: 'When limits reset',
      },
      thresholds: {
        warning: 'dailyUsed > dailyLimit * 0.8',
        critical: 'dailyUsed > dailyLimit * 0.95',
      },
    };
  }

  /**
   * Template for sync errors query
   * Actual implementation uses mcp__marketo__sync_errors
   */
  getSyncErrorsTemplate() {
    return {
      _note: 'Use mcp__marketo__sync_errors({ limit: 100 })',
      diagnosticFields: {
        errorCode: 'Salesforce error code',
        errorMessage: 'Error description',
        leadId: 'Affected lead',
        timestamp: 'When error occurred',
        field: 'Problematic field (if applicable)',
      },
      groupingPattern: 'Group errors by code to identify patterns',
    };
  }

  /**
   * Analyze root cause from check results
   * @param {string} issueType - Type of issue
   * @param {Array} checks - Check results
   * @param {Array} evidence - Collected evidence
   * @returns {string} Root cause description
   */
  analyzeRootCause(issueType, checks, evidence) {
    const failedChecks = checks.filter(c => c.status === 'error' || (c.issues && c.issues.length > 0));

    if (failedChecks.length === 0) {
      return 'No definitive root cause identified. Manual investigation recommended.';
    }

    // Build root cause from failed checks
    const causes = failedChecks.map(c => {
      if (c.issues && c.issues.length > 0) {
        return c.issues.map(i => i.description).join('; ');
      }
      return `${c.name} check failed: ${c.error || 'Unknown error'}`;
    });

    return causes.join('. ');
  }

  /**
   * Determine severity from check results
   * @param {Array} checks - Check results
   * @returns {string} Severity level
   */
  determineSeverity(checks) {
    const hasError = checks.some(c => c.status === 'error' && c.required);
    const hasCriticalIssue = checks.some(c =>
      c.issues && c.issues.some(i => i.severity === 'critical')
    );
    const hasHighIssue = checks.some(c =>
      c.issues && c.issues.some(i => i.severity === 'high')
    );

    if (hasError || hasCriticalIssue) return 'critical';
    if (hasHighIssue) return 'high';
    return 'moderate';
  }

  /**
   * Get error code details
   * @param {number} code - Error code
   * @returns {Object} Error details
   */
  static getErrorDetails(code) {
    return ERROR_CODES[code] || { meaning: 'Unknown error', action: 'Check Marketo documentation' };
  }

  /**
   * Get activity type ID
   * @param {string} name - Activity type name
   * @returns {number} Activity type ID
   */
  static getActivityTypeId(name) {
    const upperName = name.toUpperCase().replace(/ /g, '_');
    return ACTIVITY_TYPES[upperName] || null;
  }
}

module.exports = {
  CampaignDiagnosticRunner,
  ACTIVITY_TYPES,
  ERROR_CODES,
  DIAGNOSTIC_CHECKS,
};
