/**
 * Marketo Analytics Tools (MCP Compatible)
 *
 * MCP tools for analytics and reporting in Marketo.
 *
 * @module analytics-mcp
 * @version 1.0.0
 */

import { apiRequest } from '../auth/oauth-handler.js';
import { detectLoopCandidates } from '../lib/routing-analysis.js';

/**
 * Analytics tool definitions for MCP
 */
export const analyticsTools = [
  {
    name: 'mcp__marketo__analytics_program_report',
    description: 'Get program performance report.',
    inputSchema: {
      type: 'object',
      properties: {
        programId: { type: 'number', description: 'Program ID' },
        startDate: { type: 'string', description: 'Start date (ISO 8601)' },
        endDate: { type: 'string', description: 'End date (ISO 8601)' }
      },
      required: ['programId']
    }
  },
  {
    name: 'mcp__marketo__analytics_email_report',
    description: 'Get email performance report with metrics like opens, clicks, bounces.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' },
        startDate: { type: 'string', description: 'Start date' },
        endDate: { type: 'string', description: 'End date' }
      },
      required: ['emailId']
    }
  },
  {
    name: 'mcp__marketo__analytics_lead_changes',
    description: 'Get lead field value changes over time.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start datetime (ISO 8601)' },
        endDate: { type: 'string', description: 'End datetime' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to track changes'
        },
        leadIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Specific lead IDs'
        },
        batchSize: { type: 'number', description: 'Results per page (max 300)' },
        nextPageToken: { type: 'string', description: 'Pagination token' }
      },
      required: ['startDate']
    }
  },
  {
    name: 'mcp__marketo__analytics_activities',
    description: 'Get lead activities (email opens, form fills, web visits, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        activityTypeIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Activity types to retrieve'
        },
        startDate: { type: 'string', description: 'Start datetime' },
        leadIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Specific lead IDs'
        },
        batchSize: { type: 'number' },
        nextPageToken: { type: 'string' }
      }
    }
  },
  {
    name: 'mcp__marketo__analytics_activity_types',
    description: 'Get list of activity types for filtering.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'mcp__marketo__analytics_smart_list_count',
    description: 'Get count of leads in a smart list.',
    inputSchema: {
      type: 'object',
      properties: {
        smartListId: { type: 'number', description: 'Smart list ID' }
      },
      required: ['smartListId']
    }
  },
  {
    name: 'mcp__marketo__analytics_program_members',
    description: 'Get program members with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        programId: { type: 'number', description: 'Program ID' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to return'
        },
        batchSize: { type: 'number' },
        nextPageToken: { type: 'string' }
      },
      required: ['programId']
    }
  },
  {
    name: 'mcp__marketo__analytics_api_usage',
    description: 'Get daily API usage statistics.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'mcp__marketo__analytics_api_errors',
    description: 'Get recent API errors.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'mcp__marketo__analytics_deleted_leads',
    description: 'Get deleted leads since a date.',
    inputSchema: {
      type: 'object',
      properties: {
        sinceDatetime: { type: 'string', description: 'Start datetime (ISO 8601)' },
        batchSize: { type: 'number' },
        nextPageToken: { type: 'string' }
      },
      required: ['sinceDatetime']
    }
  },
  {
    name: 'mcp__marketo__analytics_activity_trace_window',
    description: 'Scan activity pages in a bounded window to avoid paging-token false negatives.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Trace window start (ISO 8601)' },
        activityTypeIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Target activity type IDs (max 10 recommended)'
        },
        leadIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Specific lead IDs (max 30 recommended)'
        },
        batchSize: { type: 'number', description: 'Results per page (max 300)', default: 300 },
        maxPages: { type: 'number', description: 'Max number of pages to scan', default: 15 },
        minTargetEvents: { type: 'number', description: 'Early stop when at least N target events found', default: 1 }
      },
      required: ['startDate']
    }
  },
  {
    name: 'mcp__marketo__analytics_loop_detector',
    description: 'Detect routing loops/races by analyzing lead change oscillations over routing fields.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start datetime (ISO 8601)' },
        endDate: { type: 'string', description: 'End datetime (ISO 8601)' },
        leadIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Lead IDs to inspect'
        },
        routingFields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Routing fields to evaluate for oscillation'
        },
        batchSize: { type: 'number', description: 'Results per page (max 300)', default: 300 },
        maxPages: { type: 'number', description: 'Max pages of lead changes to scan', default: 20 }
      },
      required: ['startDate', 'leadIds', 'routingFields']
    }
  }
];

/**
 * Execute analytics tool
 */
export async function executeAnalyticsTool(toolName, args) {
  switch (toolName) {
    case 'mcp__marketo__analytics_program_report':
      return await getProgramReport(args);
    case 'mcp__marketo__analytics_email_report':
      return await getEmailReport(args);
    case 'mcp__marketo__analytics_lead_changes':
      return await getLeadChanges(args);
    case 'mcp__marketo__analytics_activities':
      return await getActivities(args);
    case 'mcp__marketo__analytics_activity_types':
      return await getActivityTypes();
    case 'mcp__marketo__analytics_smart_list_count':
      return await getSmartListCount(args);
    case 'mcp__marketo__analytics_program_members':
      return await getProgramMembers(args);
    case 'mcp__marketo__analytics_api_usage':
      return await getApiUsage();
    case 'mcp__marketo__analytics_api_errors':
      return await getApiErrors();
    case 'mcp__marketo__analytics_deleted_leads':
      return await getDeletedLeads(args);
    case 'mcp__marketo__analytics_activity_trace_window':
      return await getActivityTraceWindow(args);
    case 'mcp__marketo__analytics_loop_detector':
      return await getLoopDetector(args);
    default:
      throw new Error(`Unknown analytics tool: ${toolName}`);
  }
}

// Implementation functions
async function getProgramReport(args) {
  const { programId, startDate, endDate } = args;
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  const paramStr = params.toString() ? `?${params}` : '';
  const result = await apiRequest(`/rest/v1/program/${programId}/report.json${paramStr}`);

  return {
    success: result.success,
    report: result.result,
    metrics: {
      members: result.result?.members || 0,
      newMembers: result.result?.newMembers || 0,
      success: result.result?.success || 0
    }
  };
}

async function getEmailReport(args) {
  const { emailId, startDate, endDate } = args;
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  const paramStr = params.toString() ? `?${params}` : '';
  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/performance.json${paramStr}`);

  const metrics = result.result?.[0] || {};
  return {
    success: result.success,
    report: result.result,
    metrics: {
      sent: metrics.sent || 0,
      delivered: metrics.delivered || 0,
      opened: metrics.opened || 0,
      clicked: metrics.clicked || 0,
      unsubscribed: metrics.unsubscribed || 0,
      bounced: metrics.bounced || 0,
      openRate: metrics.delivered ? ((metrics.opened / metrics.delivered) * 100).toFixed(2) + '%' : '0%',
      clickRate: metrics.delivered ? ((metrics.clicked / metrics.delivered) * 100).toFixed(2) + '%' : '0%'
    }
  };
}

async function getLeadChanges(args) {
  const { startDate, endDate, fields, leadIds, batchSize = 300, nextPageToken } = args;
  const params = new URLSearchParams();
  params.append('sinceDatetime', startDate);
  if (endDate) params.append('untilDatetime', endDate);
  if (fields) params.append('fields', fields.join(','));
  if (leadIds) params.append('leadIds', leadIds.join(','));
  params.append('batchSize', batchSize.toString());
  if (nextPageToken) params.append('nextPageToken', nextPageToken);

  const result = await apiRequest(`/rest/v1/activities/leadchanges.json?${params}`);
  return {
    success: result.success,
    changes: result.result || [],
    moreResult: result.moreResult,
    nextPageToken: result.nextPageToken
  };
}

async function getActivities(args) {
  const { activityTypeIds, startDate, leadIds, batchSize = 300, nextPageToken } = args;

  // Get paging token if needed
  let pagingToken = nextPageToken;
  if (!pagingToken && startDate) {
    const tokenResult = await apiRequest(`/rest/v1/activities/pagingtoken.json?sinceDatetime=${startDate}`);
    pagingToken = tokenResult.nextPageToken;
  }

  const params = new URLSearchParams();
  if (pagingToken) params.append('nextPageToken', pagingToken);
  if (activityTypeIds) params.append('activityTypeIds', activityTypeIds.join(','));
  if (leadIds) params.append('leadIds', leadIds.join(','));
  params.append('batchSize', batchSize.toString());

  const result = await apiRequest(`/rest/v1/activities.json?${params}`);
  return {
    success: result.success,
    activities: result.result || [],
    moreResult: result.moreResult,
    nextPageToken: result.nextPageToken
  };
}

async function getActivityTypes() {
  const result = await apiRequest('/rest/v1/activities/types.json');
  return { success: result.success, activityTypes: result.result || [] };
}

async function getSmartListCount(args) {
  const result = await apiRequest(`/rest/asset/v1/smartList/${args.smartListId}/leads/count.json`);
  return { success: result.success, count: result.result?.[0]?.count || 0 };
}

async function getProgramMembers(args) {
  const { programId, fields, batchSize = 300, nextPageToken } = args;
  const params = new URLSearchParams();
  if (fields) params.append('fields', fields.join(','));
  params.append('batchSize', batchSize.toString());
  if (nextPageToken) params.append('nextPageToken', nextPageToken);

  const result = await apiRequest(`/rest/v1/leads/programs/${programId}.json?${params}`);
  return {
    success: result.success,
    members: result.result || [],
    moreResult: result.moreResult,
    nextPageToken: result.nextPageToken
  };
}

async function getApiUsage() {
  const result = await apiRequest('/rest/v1/stats/usage.json');
  const total = result.result?.reduce((sum, day) => sum + (day.total || 0), 0) || 0;
  return {
    success: result.success,
    usage: result.result || [],
    summary: { total, remaining: 50000 - total }
  };
}

async function getApiErrors() {
  const result = await apiRequest('/rest/v1/stats/errors.json');
  return { success: result.success, errors: result.result || [] };
}

async function getDeletedLeads(args) {
  const { sinceDatetime, batchSize = 300, nextPageToken } = args;
  const params = new URLSearchParams();
  params.append('sinceDatetime', sinceDatetime);
  params.append('batchSize', batchSize.toString());
  if (nextPageToken) params.append('nextPageToken', nextPageToken);

  const result = await apiRequest(`/rest/v1/activities/deletedleads.json?${params}`);
  return {
    success: result.success,
    deletedLeads: result.result || [],
    moreResult: result.moreResult,
    nextPageToken: result.nextPageToken
  };
}

async function getActivityTraceWindow(args) {
  const {
    startDate,
    activityTypeIds,
    leadIds,
    batchSize = 300,
    maxPages = 15,
    minTargetEvents = 1
  } = args;

  const tokenResult = await apiRequest(`/rest/v1/activities/pagingtoken.json?sinceDatetime=${encodeURIComponent(startDate)}`);
  let nextPageToken = tokenResult.nextPageToken;
  let moreResult = Boolean(nextPageToken);
  let pagesScanned = 0;
  let emptyPages = 0;
  const activities = [];
  const cappedPages = Math.max(1, maxPages);
  const cappedBatchSize = Math.min(batchSize, 300);

  while (moreResult && pagesScanned < cappedPages) {
    const params = new URLSearchParams();
    params.append('nextPageToken', nextPageToken);
    params.append('batchSize', String(cappedBatchSize));
    if (activityTypeIds && activityTypeIds.length > 0) params.append('activityTypeIds', activityTypeIds.join(','));
    if (leadIds && leadIds.length > 0) params.append('leadIds', leadIds.join(','));

    const page = await apiRequest(`/rest/v1/activities.json?${params}`);
    const pageActivities = page.result || [];
    activities.push(...pageActivities);

    if (pageActivities.length === 0) {
      emptyPages += 1;
    }

    nextPageToken = page.nextPageToken || null;
    moreResult = page.moreResult === true && !!nextPageToken;
    pagesScanned += 1;

    if (activities.length >= minTargetEvents) {
      break;
    }
  }

  return {
    success: true,
    startDate,
    activities,
    paging: {
      pagesScanned,
      emptyPages,
      nextPageToken,
      moreResult,
      truncated: moreResult,
      possiblePagingWindowMismatch: activities.length === 0 && emptyPages > 0 && moreResult
    }
  };
}

async function getLoopDetector(args) {
  const {
    startDate,
    endDate,
    leadIds,
    routingFields,
    batchSize = 300,
    maxPages = 20
  } = args;

  const cappedPages = Math.max(1, maxPages);
  const cappedBatchSize = Math.min(batchSize, 300);
  const results = [];

  for (const leadId of leadIds) {
    const changes = [];
    let nextPageToken = null;
    let moreResult = true;
    let pagesScanned = 0;

    while (moreResult && pagesScanned < cappedPages) {
      const params = new URLSearchParams();
      params.append('sinceDatetime', startDate);
      params.append('leadIds', String(leadId));
      params.append('batchSize', String(cappedBatchSize));
      if (endDate) params.append('untilDatetime', endDate);
      if (nextPageToken) params.append('nextPageToken', nextPageToken);

      const page = await apiRequest(`/rest/v1/activities/leadchanges.json?${params}`);
      changes.push(...(page.result || []));
      nextPageToken = page.nextPageToken || null;
      moreResult = page.moreResult === true && !!nextPageToken;
      pagesScanned += 1;
    }

    const loopSignals = detectLoopCandidates(changes, routingFields);
    results.push({
      leadId,
      pagesScanned,
      sampledChanges: changes.length,
      truncated: moreResult,
      ...loopSignals
    });
  }

  return {
    success: true,
    startDate,
    endDate: endDate || null,
    inspectedLeads: leadIds.length,
    results
  };
}

export default { analyticsTools, executeAnalyticsTool };
