/**
 * Marketo Analytics MCP Tools
 *
 * Provides MCP tools for analytics and reporting:
 * - Program performance reports
 * - Email performance reports
 * - Lead activity analysis
 * - Lead field changes tracking
 * - Smart list membership counts
 */

import { getAccessToken, getBaseUrl } from '../auth/oauth-handler.js';

/**
 * Make authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
  const token = await getAccessToken();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`API Error: ${response.status} - ${JSON.stringify(error)}`);
  }

  return response.json();
}

/**
 * Get program performance report
 */
export async function analyticsProgramReport({ programId, startDate, endDate, filterType }) {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (filterType) params.append('filterType', filterType);

  const result = await apiRequest(`/rest/v1/program/${programId}/report.json?${params}`);

  if (!result.success) {
    throw new Error(`Failed to get program report: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    report: result.result,
    metrics: {
      members: result.result?.members || 0,
      newMembers: result.result?.newMembers || 0,
      success: result.result?.success || 0,
      cost: result.result?.cost || 0,
      engagement: result.result?.engagement || 0
    }
  };
}

/**
 * Get email performance report
 */
export async function analyticsEmailReport({ emailId, startDate, endDate }) {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/performance.json?${params}`);

  if (!result.success) {
    throw new Error(`Failed to get email report: ${JSON.stringify(result.errors)}`);
  }

  const metrics = result.result?.[0] || {};

  return {
    success: true,
    report: result.result,
    metrics: {
      sent: metrics.sent || 0,
      delivered: metrics.delivered || 0,
      opened: metrics.opened || 0,
      clicked: metrics.clicked || 0,
      unsubscribed: metrics.unsubscribed || 0,
      bounced: metrics.bounced || 0,
      deliveryRate: metrics.delivered && metrics.sent
        ? ((metrics.delivered / metrics.sent) * 100).toFixed(2) + '%'
        : '0%',
      openRate: metrics.opened && metrics.delivered
        ? ((metrics.opened / metrics.delivered) * 100).toFixed(2) + '%'
        : '0%',
      clickRate: metrics.clicked && metrics.delivered
        ? ((metrics.clicked / metrics.delivered) * 100).toFixed(2) + '%'
        : '0%',
      clickToOpenRate: metrics.clicked && metrics.opened
        ? ((metrics.clicked / metrics.opened) * 100).toFixed(2) + '%'
        : '0%'
    }
  };
}

/**
 * Get lead changes (field value changes)
 */
export async function analyticsLeadChanges({
  startDate,
  endDate,
  activityTypeIds,
  fields,
  listId,
  leadIds,
  batchSize = 300,
  nextPageToken
}) {
  const params = new URLSearchParams();
  params.append('sinceDatetime', startDate);
  if (endDate) params.append('untilDatetime', endDate);
  if (activityTypeIds) params.append('activityTypeIds', activityTypeIds.join(','));
  if (fields) params.append('fields', fields.join(','));
  if (listId) params.append('listId', listId.toString());
  if (leadIds) params.append('leadIds', leadIds.join(','));
  params.append('batchSize', batchSize.toString());
  if (nextPageToken) params.append('nextPageToken', nextPageToken);

  const result = await apiRequest(`/rest/v1/activities/leadchanges.json?${params}`);

  return {
    success: result.success,
    changes: result.result || [],
    moreResult: result.moreResult || false,
    nextPageToken: result.nextPageToken
  };
}

/**
 * Get lead activities
 */
export async function analyticsActivities({
  activityTypeIds,
  startDate,
  endDate,
  leadIds,
  listId,
  assetIds,
  batchSize = 300,
  nextPageToken
}) {
  const params = new URLSearchParams();
  if (activityTypeIds) params.append('activityTypeIds', activityTypeIds.join(','));
  if (startDate) params.append('sinceDatetime', startDate);
  if (endDate) params.append('untilDatetime', endDate);
  if (leadIds) params.append('leadIds', leadIds.join(','));
  if (listId) params.append('listId', listId.toString());
  if (assetIds) params.append('assetIds', assetIds.join(','));
  params.append('batchSize', batchSize.toString());
  if (nextPageToken) params.append('nextPageToken', nextPageToken);

  const result = await apiRequest(`/rest/v1/activities.json?${params}`);

  return {
    success: result.success,
    activities: result.result || [],
    moreResult: result.moreResult || false,
    nextPageToken: result.nextPageToken
  };
}

/**
 * Get activity types (for filtering)
 */
export async function analyticsActivityTypes() {
  const result = await apiRequest('/rest/v1/activities/types.json');

  return {
    success: result.success,
    activityTypes: result.result || []
  };
}

/**
 * Get paging token for activity queries
 */
export async function analyticsGetPagingToken({ sinceDatetime }) {
  const params = new URLSearchParams();
  params.append('sinceDatetime', sinceDatetime);

  const result = await apiRequest(`/rest/v1/activities/pagingtoken.json?${params}`);

  if (!result.success) {
    throw new Error(`Failed to get paging token: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    nextPageToken: result.nextPageToken
  };
}

/**
 * Get smart list leads count
 */
export async function analyticsSmartListCount({ smartListId }) {
  const result = await apiRequest(`/rest/asset/v1/smartList/${smartListId}/leads/count.json`);

  if (!result.success) {
    throw new Error(`Failed to get smart list count: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    count: result.result?.[0]?.count || 0
  };
}

/**
 * Get smart list leads
 */
export async function analyticsSmartListLeads({ smartListId, fields, batchSize = 300, nextPageToken }) {
  const params = new URLSearchParams();
  if (fields) params.append('fields', fields.join(','));
  params.append('batchSize', batchSize.toString());
  if (nextPageToken) params.append('nextPageToken', nextPageToken);

  const result = await apiRequest(`/rest/v1/leads/list/${smartListId}.json?${params}`);

  return {
    success: result.success,
    leads: result.result || [],
    moreResult: result.moreResult || false,
    nextPageToken: result.nextPageToken
  };
}

/**
 * Get program members
 */
export async function analyticsProgramMembers({ programId, fields, batchSize = 300, nextPageToken, filterType, filterValues }) {
  const params = new URLSearchParams();
  if (fields) params.append('fields', fields.join(','));
  params.append('batchSize', batchSize.toString());
  if (nextPageToken) params.append('nextPageToken', nextPageToken);
  if (filterType) params.append('filterType', filterType);
  if (filterValues) params.append('filterValues', filterValues.join(','));

  const result = await apiRequest(`/rest/v1/leads/programs/${programId}.json?${params}`);

  return {
    success: result.success,
    members: result.result || [],
    moreResult: result.moreResult || false,
    nextPageToken: result.nextPageToken
  };
}

/**
 * Get daily API usage stats
 */
export async function analyticsApiUsage() {
  const result = await apiRequest('/rest/v1/stats/usage.json');

  if (!result.success) {
    throw new Error(`Failed to get API usage: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    usage: result.result || [],
    summary: {
      total: result.result?.reduce((sum, day) => sum + (day.total || 0), 0) || 0,
      remaining: 50000 - (result.result?.reduce((sum, day) => sum + (day.total || 0), 0) || 0)
    }
  };
}

/**
 * Get errors from recent API calls
 */
export async function analyticsApiErrors() {
  const result = await apiRequest('/rest/v1/stats/errors.json');

  return {
    success: result.success,
    errors: result.result || []
  };
}

/**
 * Get deleted leads
 */
export async function analyticsDeletedLeads({ sinceDatetime, batchSize = 300, nextPageToken }) {
  const params = new URLSearchParams();
  params.append('sinceDatetime', sinceDatetime);
  params.append('batchSize', batchSize.toString());
  if (nextPageToken) params.append('nextPageToken', nextPageToken);

  const result = await apiRequest(`/rest/v1/activities/deletedleads.json?${params}`);

  return {
    success: result.success,
    deletedLeads: result.result || [],
    moreResult: result.moreResult || false,
    nextPageToken: result.nextPageToken
  };
}

/**
 * Get engagement program stream performance
 */
export async function analyticsEngagementStreamPerformance({ programId }) {
  const result = await apiRequest(`/rest/asset/v1/program/${programId}/streams.json`);

  if (!result.success) {
    throw new Error(`Failed to get stream performance: ${JSON.stringify(result.errors)}`);
  }

  const streams = result.result || [];

  return {
    success: true,
    streams: streams.map(stream => ({
      id: stream.id,
      name: stream.name,
      isDefault: stream.isDefault,
      contentCount: stream.content?.length || 0,
      status: stream.isDefault ? 'default' : 'active'
    }))
  };
}

/**
 * Calculate funnel metrics from stage data
 */
export async function analyticsFunnelMetrics({ stages, startDate, endDate }) {
  // This is a helper function that would typically aggregate data
  // from multiple lead queries to calculate funnel conversion rates

  const funnelData = [];
  let previousCount = 0;

  for (const stage of stages) {
    // Query leads in each stage
    const params = new URLSearchParams();
    params.append('filterType', 'leadStatus');  // or custom field
    params.append('filterValues', stage);

    const result = await apiRequest(`/rest/v1/leads.json?${params}`);
    const count = result.result?.length || 0;

    const conversionRate = previousCount > 0
      ? ((count / previousCount) * 100).toFixed(2) + '%'
      : '100%';

    funnelData.push({
      stage,
      count,
      conversionRate,
      dropoff: previousCount > 0 ? previousCount - count : 0
    });

    previousCount = count;
  }

  return {
    success: true,
    funnel: funnelData,
    totalConversion: funnelData.length > 1 && funnelData[0].count > 0
      ? ((funnelData[funnelData.length - 1].count / funnelData[0].count) * 100).toFixed(2) + '%'
      : '0%'
  };
}

/**
 * Get lead score distribution
 */
export async function analyticsScoreDistribution({ scoreField = 'leadScore', buckets = [0, 25, 50, 75, 100] }) {
  const distribution = [];

  for (let i = 0; i < buckets.length - 1; i++) {
    const min = buckets[i];
    const max = buckets[i + 1];

    // This would need a smart list or filter query in practice
    distribution.push({
      range: `${min}-${max}`,
      min,
      max,
      count: 0,  // Would be populated from actual query
      percentage: '0%'
    });
  }

  return {
    success: true,
    scoreField,
    distribution,
    note: 'Use smart lists with score filters for accurate distribution data'
  };
}

// Export all tools for MCP registration
export const analyticsTools = {
  mcp__marketo__analytics_program_report: {
    description: 'Get program performance report',
    parameters: {
      type: 'object',
      properties: {
        programId: { type: 'number', description: 'Program ID' },
        startDate: { type: 'string', description: 'Start date (ISO 8601)' },
        endDate: { type: 'string', description: 'End date (ISO 8601)' },
        filterType: { type: 'string', description: 'Filter type' }
      },
      required: ['programId']
    },
    handler: analyticsProgramReport
  },
  mcp__marketo__analytics_email_report: {
    description: 'Get email performance report',
    parameters: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' },
        startDate: { type: 'string', description: 'Start date' },
        endDate: { type: 'string', description: 'End date' }
      },
      required: ['emailId']
    },
    handler: analyticsEmailReport
  },
  mcp__marketo__analytics_lead_changes: {
    description: 'Get lead field value changes',
    parameters: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start datetime (ISO 8601)' },
        endDate: { type: 'string', description: 'End datetime' },
        activityTypeIds: { type: 'array', items: { type: 'number' }, description: 'Activity type IDs to filter' },
        fields: { type: 'array', items: { type: 'string' }, description: 'Fields to track changes' },
        listId: { type: 'number', description: 'Static list filter' },
        leadIds: { type: 'array', items: { type: 'number' }, description: 'Specific lead IDs' },
        batchSize: { type: 'number', description: 'Results per page (max 300)' },
        nextPageToken: { type: 'string', description: 'Pagination token' }
      },
      required: ['startDate']
    },
    handler: analyticsLeadChanges
  },
  mcp__marketo__analytics_activities: {
    description: 'Get lead activities',
    parameters: {
      type: 'object',
      properties: {
        activityTypeIds: { type: 'array', items: { type: 'number' }, description: 'Activity types to retrieve' },
        startDate: { type: 'string', description: 'Start datetime' },
        endDate: { type: 'string', description: 'End datetime' },
        leadIds: { type: 'array', items: { type: 'number' }, description: 'Specific lead IDs' },
        listId: { type: 'number', description: 'Static list filter' },
        assetIds: { type: 'array', items: { type: 'number' }, description: 'Asset IDs (forms, emails, etc.)' },
        batchSize: { type: 'number' },
        nextPageToken: { type: 'string' }
      }
    },
    handler: analyticsActivities
  },
  mcp__marketo__analytics_activity_types: {
    description: 'Get list of activity types for filtering',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: analyticsActivityTypes
  },
  mcp__marketo__analytics_smart_list_count: {
    description: 'Get count of leads in a smart list',
    parameters: {
      type: 'object',
      properties: {
        smartListId: { type: 'number', description: 'Smart list ID' }
      },
      required: ['smartListId']
    },
    handler: analyticsSmartListCount
  },
  mcp__marketo__analytics_smart_list_leads: {
    description: 'Get leads from a smart list',
    parameters: {
      type: 'object',
      properties: {
        smartListId: { type: 'number', description: 'Smart list ID' },
        fields: { type: 'array', items: { type: 'string' }, description: 'Fields to return' },
        batchSize: { type: 'number' },
        nextPageToken: { type: 'string' }
      },
      required: ['smartListId']
    },
    handler: analyticsSmartListLeads
  },
  mcp__marketo__analytics_program_members: {
    description: 'Get program members',
    parameters: {
      type: 'object',
      properties: {
        programId: { type: 'number', description: 'Program ID' },
        fields: { type: 'array', items: { type: 'string' }, description: 'Fields to return' },
        batchSize: { type: 'number' },
        nextPageToken: { type: 'string' },
        filterType: { type: 'string', description: 'Filter field' },
        filterValues: { type: 'array', items: { type: 'string' }, description: 'Filter values' }
      },
      required: ['programId']
    },
    handler: analyticsProgramMembers
  },
  mcp__marketo__analytics_api_usage: {
    description: 'Get daily API usage statistics',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: analyticsApiUsage
  },
  mcp__marketo__analytics_api_errors: {
    description: 'Get recent API errors',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: analyticsApiErrors
  },
  mcp__marketo__analytics_deleted_leads: {
    description: 'Get deleted leads since a date',
    parameters: {
      type: 'object',
      properties: {
        sinceDatetime: { type: 'string', description: 'Start datetime (ISO 8601)' },
        batchSize: { type: 'number' },
        nextPageToken: { type: 'string' }
      },
      required: ['sinceDatetime']
    },
    handler: analyticsDeletedLeads
  },
  mcp__marketo__analytics_engagement_streams: {
    description: 'Get engagement program stream performance',
    parameters: {
      type: 'object',
      properties: {
        programId: { type: 'number', description: 'Engagement program ID' }
      },
      required: ['programId']
    },
    handler: analyticsEngagementStreamPerformance
  },
  mcp__marketo__analytics_funnel_metrics: {
    description: 'Calculate funnel conversion metrics',
    parameters: {
      type: 'object',
      properties: {
        stages: { type: 'array', items: { type: 'string' }, description: 'Stage names in order' },
        startDate: { type: 'string', description: 'Start date for analysis' },
        endDate: { type: 'string', description: 'End date for analysis' }
      },
      required: ['stages']
    },
    handler: analyticsFunnelMetrics
  }
};
