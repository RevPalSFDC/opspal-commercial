/**
 * Marketo Lead Tools
 *
 * MCP tools for lead management and routing diagnostics.
 *
 * @module leads
 * @version 1.1.0
 */

import { apiRequest } from '../auth/oauth-handler.js';
import {
  buildActivitySummary,
  detectLoopCandidates,
  selectCanonicalLead
} from '../lib/routing-analysis.js';
import { runWithIdempotency } from '../lib/idempotency-store.js';

const DEFAULT_ROUTING_FIELDS = [
  'sfdcLeadId',
  'sfdcContactId',
  'sfdcOwnerId',
  'leadStatus',
  'leadLifecycleStage',
  'segment'
];

/**
 * Lead tool definitions for MCP
 */
export const leadTools = [
  {
    name: 'mcp__marketo__lead_query',
    description: 'Query leads from Marketo with optional filters. Returns lead records matching criteria.',
    inputSchema: {
      type: 'object',
      properties: {
        filterType: {
          type: 'string',
          description: 'Field to filter by (e.g., "email", "id", "company")',
          default: 'email'
        },
        filterValues: {
          type: 'array',
          items: { type: 'string' },
          description: 'Values to filter by (max 300 values)'
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to return'
        },
        batchSize: {
          type: 'number',
          description: 'Number of records to return (max 300)',
          default: 300
        },
        nextPageToken: {
          type: 'string',
          description: 'Token for pagination'
        }
      },
      required: ['filterType', 'filterValues']
    }
  },
  {
    name: 'mcp__marketo__lead_create',
    description: 'Create or update leads in Marketo. Uses upsert by default.',
    inputSchema: {
      type: 'object',
      properties: {
        leads: {
          type: 'array',
          items: {
            type: 'object',
            description: 'Lead record with field values'
          },
          description: 'Array of lead objects to create/update (max 300)'
        },
        action: {
          type: 'string',
          enum: ['createOnly', 'updateOnly', 'createOrUpdate'],
          description: 'Sync action',
          default: 'createOrUpdate'
        },
        lookupField: {
          type: 'string',
          description: 'Field to dedupe on (default: email)',
          default: 'email'
        },
        partitionName: {
          type: 'string',
          description: 'Lead partition name (if using partitions)'
        }
      },
      required: ['leads']
    }
  },
  {
    name: 'mcp__marketo__lead_update',
    description: 'Update existing leads in Marketo by ID or lookup field.',
    inputSchema: {
      type: 'object',
      properties: {
        leads: {
          type: 'array',
          items: {
            type: 'object',
            description: 'Lead record with id and fields to update'
          },
          description: 'Array of lead objects with updates (max 300)'
        },
        lookupField: {
          type: 'string',
          description: 'Field to lookup by (default: id)',
          default: 'id'
        },
        idempotencyKey: {
          type: 'string',
          description: 'Optional key for replay-safe update execution'
        }
      },
      required: ['leads']
    }
  },
  {
    name: 'mcp__marketo__lead_merge',
    description: 'Merge duplicate leads. Winner lead absorbs loser leads.',
    inputSchema: {
      type: 'object',
      properties: {
        winnerId: {
          type: 'number',
          description: 'ID of the winning lead (will be kept)'
        },
        loserIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'IDs of losing leads (will be merged into winner, max 3)'
        },
        mergeInCRM: {
          type: 'boolean',
          description: 'Also merge in connected CRM',
          default: false
        },
        idempotencyKey: {
          type: 'string',
          description: 'Optional key for replay-safe merge execution'
        }
      },
      required: ['winnerId', 'loserIds']
    }
  },
  {
    name: 'mcp__marketo__lead_describe',
    description: 'Get lead field schema - all available fields and their metadata.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'mcp__marketo__lead_activities',
    description: 'Get activity log for leads. Returns activities like email opens, form fills, web visits.',
    inputSchema: {
      type: 'object',
      properties: {
        activityTypeIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by activity type IDs'
        },
        leadIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by lead IDs (max 30)'
        },
        sinceDatetime: {
          type: 'string',
          description: 'Start datetime (ISO format)'
        },
        batchSize: {
          type: 'number',
          description: 'Number of records (max 300)',
          default: 300
        },
        nextPageToken: {
          type: 'string',
          description: 'Pagination token'
        }
      }
    }
  },
  {
    name: 'mcp__marketo__lead_activity_paging_token',
    description: 'Get activity API paging token for a given start timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        sinceDatetime: {
          type: 'string',
          description: 'Start datetime (ISO format)'
        }
      },
      required: ['sinceDatetime']
    }
  },
  {
    name: 'mcp__marketo__lead_list_membership',
    description: 'Get all static list memberships for a lead.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'number', description: 'Lead ID' },
        batchSize: { type: 'number', description: 'Results per page (max 300)', default: 300 },
        nextPageToken: { type: 'string', description: 'Pagination token' },
        maxPages: { type: 'number', description: 'Maximum pages to scan', default: 10 }
      },
      required: ['leadId']
    }
  },
  {
    name: 'mcp__marketo__lead_program_membership',
    description: 'Get all program memberships for a lead.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'number', description: 'Lead ID' },
        batchSize: { type: 'number', description: 'Results per page (max 300)', default: 300 },
        nextPageToken: { type: 'string', description: 'Pagination token' },
        maxPages: { type: 'number', description: 'Maximum pages to scan', default: 10 }
      },
      required: ['leadId']
    }
  },
  {
    name: 'mcp__marketo__lead_smart_campaign_membership',
    description: 'Get smart campaign memberships for a lead.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'number', description: 'Lead ID' },
        batchSize: { type: 'number', description: 'Results per page (max 300)', default: 300 },
        nextPageToken: { type: 'string', description: 'Pagination token' },
        maxPages: { type: 'number', description: 'Maximum pages to scan', default: 10 }
      },
      required: ['leadId']
    }
  },
  {
    name: 'mcp__marketo__lead_routing_trace',
    description: 'Run canonical lead-routing diagnostics: identity, memberships, activities, smart-list correlation, and loop/race inference.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'number', description: 'Direct lead ID (preferred when known)' },
        filterType: { type: 'string', description: 'Lookup filter type when leadId is unknown', default: 'email' },
        filterValues: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lookup values when leadId is unknown'
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lead fields to fetch during identity resolution'
        },
        sinceDatetime: { type: 'string', description: 'Trace window start (ISO format)' },
        untilDatetime: { type: 'string', description: 'Trace window end (ISO format, lead changes only)' },
        activityTypeIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional filter for activities'
        },
        candidateCampaignIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Additional campaign IDs to inspect'
        },
        routingFields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields used for loop/race oscillation detection'
        },
        maxActivityPages: { type: 'number', description: 'Maximum activity pages to scan', default: 20 },
        maxMembershipPages: { type: 'number', description: 'Maximum membership pages to scan', default: 10 },
        includeCampaignDetails: { type: 'boolean', description: 'Include campaign + smart-list inspection', default: true },
        maxCampaignInspections: { type: 'number', description: 'Maximum campaigns to inspect', default: 10 }
      }
    }
  },
  {
    name: 'mcp__marketo__lead_partitions',
    description: 'List all lead partitions in the Marketo instance.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * Execute lead tool
 * @param {string} toolName - Tool name
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} Tool result
 */
export async function executeLeadTool(toolName, args) {
  switch (toolName) {
    case 'mcp__marketo__lead_query':
      return await queryLeads(args);

    case 'mcp__marketo__lead_create':
      return await createLeads(args);

    case 'mcp__marketo__lead_update':
      return await updateLeads(args);

    case 'mcp__marketo__lead_merge':
      return await mergeLeads(args);

    case 'mcp__marketo__lead_describe':
      return await describeLeads();

    case 'mcp__marketo__lead_activities':
      return await getLeadActivities(args);

    case 'mcp__marketo__lead_activity_paging_token':
      return await getActivityPagingToken(args);

    case 'mcp__marketo__lead_list_membership':
      return await getLeadListMembership(args);

    case 'mcp__marketo__lead_program_membership':
      return await getLeadProgramMembership(args);

    case 'mcp__marketo__lead_smart_campaign_membership':
      return await getLeadSmartCampaignMembership(args);

    case 'mcp__marketo__lead_routing_trace':
      return await runLeadRoutingTrace(args);

    case 'mcp__marketo__lead_partitions':
      return await getLeadPartitions();

    default:
      throw new Error(`Unknown lead tool: ${toolName}`);
  }
}

function clampBatchSize(batchSize, max = 300) {
  return Math.min(batchSize || max, max);
}

function normalizeFilterValues(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function defaultSinceDatetime() {
  return new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
}

/**
 * Query leads by filter
 */
async function queryLeads(args) {
  const { filterType, filterValues, fields, batchSize = 300, nextPageToken } = args;
  const normalizedFilterValues = normalizeFilterValues(filterValues);
  if (normalizedFilterValues.length === 0) {
    throw new Error('filterValues must contain at least one value');
  }

  let endpoint = `/rest/v1/leads.json?filterType=${encodeURIComponent(filterType)}&filterValues=${encodeURIComponent(normalizedFilterValues.join(','))}`;

  if (fields && fields.length > 0) {
    endpoint += `&fields=${encodeURIComponent(fields.join(','))}`;
  }

  if (batchSize) {
    endpoint += `&batchSize=${clampBatchSize(batchSize)}`;
  }

  if (nextPageToken) {
    endpoint += `&nextPageToken=${encodeURIComponent(nextPageToken)}`;
  }

  const result = await apiRequest(endpoint);

  return {
    success: result.success,
    leads: result.result || [],
    nextPageToken: result.nextPageToken,
    moreResult: result.moreResult
  };
}

/**
 * Create or update leads
 */
async function createLeads(args) {
  const { leads, action = 'createOrUpdate', lookupField = 'email', partitionName } = args;

  const payload = {
    action,
    lookupField,
    input: leads
  };

  if (partitionName) {
    payload.partitionName = partitionName;
  }

  const result = await apiRequest('/rest/v1/leads.json', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return {
    success: result.success,
    results: result.result || [],
    requestId: result.requestId
  };
}

/**
 * Update existing leads
 */
async function updateLeads(args) {
  const { leads, lookupField = 'id', idempotencyKey } = args;

  const payload = {
    action: 'updateOnly',
    lookupField,
    input: leads
  };

  return await runWithIdempotency({
    key: idempotencyKey,
    operation: 'lead_update',
    payload
  }, async () => {
    const result = await apiRequest('/rest/v1/leads.json', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return {
      success: result.success,
      results: result.result || [],
      requestId: result.requestId
    };
  });
}

/**
 * Merge duplicate leads
 */
async function mergeLeads(args) {
  const { winnerId, loserIds, mergeInCRM = false, idempotencyKey } = args;

  if (loserIds.length > 3) {
    throw new Error('Maximum 3 loser leads can be merged at once');
  }

  let endpoint = `/rest/v1/leads/${winnerId}/merge.json?leadIds=${loserIds.join(',')}`;
  if (mergeInCRM) {
    endpoint += '&mergeInCRM=true';
  }

  return await runWithIdempotency({
    key: idempotencyKey,
    operation: 'lead_merge',
    payload: { winnerId, loserIds, mergeInCRM }
  }, async () => {
    const result = await apiRequest(endpoint, { method: 'POST' });

    return {
      success: result.success,
      winnerId,
      mergedIds: loserIds,
      requestId: result.requestId
    };
  });
}

/**
 * Describe lead schema
 */
async function describeLeads() {
  const result = await apiRequest('/rest/v1/leads/describe.json');

  return {
    success: result.success,
    fields: result.result || [],
    totalFields: result.result?.length || 0
  };
}

/**
 * Get activity paging token
 */
async function getActivityPagingToken(args) {
  const { sinceDatetime } = args;
  const result = await apiRequest(`/rest/v1/activities/pagingtoken.json?sinceDatetime=${encodeURIComponent(sinceDatetime)}`);

  return {
    success: result.success,
    sinceDatetime,
    nextPageToken: result.nextPageToken
  };
}

/**
 * Get lead activities
 */
async function getLeadActivities(args) {
  const { activityTypeIds, leadIds, sinceDatetime, batchSize = 300, nextPageToken } = args;

  let pagingToken = nextPageToken;
  if (!pagingToken && sinceDatetime) {
    const tokenResult = await getActivityPagingToken({ sinceDatetime });
    pagingToken = tokenResult.nextPageToken;
  }

  const params = new URLSearchParams();
  if (pagingToken) params.append('nextPageToken', pagingToken);
  if (activityTypeIds && activityTypeIds.length > 0) params.append('activityTypeIds', activityTypeIds.join(','));
  if (leadIds && leadIds.length > 0) params.append('leadIds', leadIds.join(','));
  params.append('batchSize', String(clampBatchSize(batchSize)));

  const result = await apiRequest(`/rest/v1/activities.json?${params}`);

  return {
    success: result.success,
    activities: result.result || [],
    nextPageToken: result.nextPageToken,
    moreResult: result.moreResult
  };
}

async function getPagedMembership(endpointBase, { batchSize = 300, nextPageToken, maxPages = 10 }) {
  const items = [];
  let token = nextPageToken || null;
  let more = true;
  let pagesFetched = 0;
  const cappedPages = Math.max(1, maxPages || 10);

  while (more && pagesFetched < cappedPages) {
    const params = new URLSearchParams();
    params.append('batchSize', String(clampBatchSize(batchSize)));
    if (token) params.append('nextPageToken', token);

    const page = await apiRequest(`${endpointBase}?${params}`);
    const resultItems = page.result || [];
    items.push(...resultItems);

    token = page.nextPageToken || null;
    more = page.moreResult === true && !!token;
    pagesFetched += 1;
  }

  return {
    items,
    nextPageToken: token,
    moreResult: more,
    pagesFetched,
    truncated: more
  };
}

async function getLeadListMembership(args) {
  const { leadId } = args;
  const paged = await getPagedMembership(`/rest/v1/leads/${leadId}/listMembership.json`, args);
  return {
    success: true,
    leadId,
    memberships: paged.items,
    nextPageToken: paged.nextPageToken,
    moreResult: paged.moreResult,
    pagesFetched: paged.pagesFetched,
    truncated: paged.truncated
  };
}

async function getLeadProgramMembership(args) {
  const { leadId } = args;
  const paged = await getPagedMembership(`/rest/v1/leads/${leadId}/programMembership.json`, args);
  return {
    success: true,
    leadId,
    memberships: paged.items,
    nextPageToken: paged.nextPageToken,
    moreResult: paged.moreResult,
    pagesFetched: paged.pagesFetched,
    truncated: paged.truncated
  };
}

async function getLeadSmartCampaignMembership(args) {
  const { leadId } = args;
  const paged = await getPagedMembership(`/rest/v1/leads/${leadId}/smartCampaignMembership.json`, args);
  return {
    success: true,
    leadId,
    memberships: paged.items,
    nextPageToken: paged.nextPageToken,
    moreResult: paged.moreResult,
    pagesFetched: paged.pagesFetched,
    truncated: paged.truncated
  };
}

async function getLeadChangesForWindow({
  leadId,
  sinceDatetime,
  untilDatetime,
  maxPages = 20,
  batchSize = 300
}) {
  const changes = [];
  let more = true;
  let nextPageToken = null;
  let pagesFetched = 0;
  const cappedPages = Math.max(1, maxPages);

  while (more && pagesFetched < cappedPages) {
    const params = new URLSearchParams();
    params.append('sinceDatetime', sinceDatetime);
    params.append('leadIds', String(leadId));
    params.append('batchSize', String(clampBatchSize(batchSize)));
    if (untilDatetime) params.append('untilDatetime', untilDatetime);
    if (nextPageToken) params.append('nextPageToken', nextPageToken);

    const page = await apiRequest(`/rest/v1/activities/leadchanges.json?${params}`);
    changes.push(...(page.result || []));
    nextPageToken = page.nextPageToken || null;
    more = page.moreResult === true && !!nextPageToken;
    pagesFetched += 1;
  }

  return {
    changes,
    pagesFetched,
    nextPageToken,
    moreResult: more,
    truncated: more
  };
}

async function getActivitiesForWindow({
  leadId,
  sinceDatetime,
  activityTypeIds,
  maxPages = 20,
  batchSize = 300
}) {
  const activityToken = await getActivityPagingToken({ sinceDatetime });
  let nextPageToken = activityToken.nextPageToken;
  let pagesFetched = 0;
  const cappedPages = Math.max(1, maxPages);
  const activities = [];
  let more = Boolean(nextPageToken);
  let emptyPages = 0;

  while (more && pagesFetched < cappedPages) {
    const params = new URLSearchParams();
    params.append('nextPageToken', nextPageToken);
    params.append('leadIds', String(leadId));
    params.append('batchSize', String(clampBatchSize(batchSize)));
    if (activityTypeIds && activityTypeIds.length > 0) {
      params.append('activityTypeIds', activityTypeIds.join(','));
    }

    const page = await apiRequest(`/rest/v1/activities.json?${params}`);
    const pageActivities = page.result || [];
    activities.push(...pageActivities);

    if (pageActivities.length === 0) {
      emptyPages += 1;
    }

    nextPageToken = page.nextPageToken || null;
    more = page.moreResult === true && !!nextPageToken;
    pagesFetched += 1;
  }

  return {
    sinceDatetime,
    initialPageToken: activityToken.nextPageToken,
    activities,
    pagesFetched,
    nextPageToken,
    moreResult: more,
    truncated: more,
    emptyPages
  };
}

async function inspectCandidateCampaigns(campaignIds = []) {
  const inspections = [];

  for (const campaignId of campaignIds) {
    try {
      const metadataResult = await apiRequest(`/rest/asset/v1/smartCampaign/${campaignId}.json`);
      const campaign = metadataResult.result?.[0] || null;
      const smartListResult = await apiRequest(`/rest/asset/v1/smartCampaign/${campaignId}/smartList.json?includeRules=true`);

      inspections.push({
        campaignId,
        campaign,
        smartList: smartListResult.result?.[0] || null
      });
    } catch (error) {
      inspections.push({
        campaignId,
        error: error.message
      });
    }
  }

  return inspections;
}

function uniqueCampaignIds(campaignMemberships = [], candidateCampaignIds = []) {
  const ids = new Set();
  for (const item of campaignMemberships) {
    if (item && Number.isFinite(Number(item.id))) {
      ids.add(Number(item.id));
    }
  }
  for (const id of candidateCampaignIds || []) {
    if (Number.isFinite(Number(id))) {
      ids.add(Number(id));
    }
  }
  return [...ids];
}

/**
 * Canonical lead-routing trace
 */
async function runLeadRoutingTrace(args) {
  const {
    leadId,
    filterType = 'email',
    filterValues,
    fields,
    sinceDatetime = defaultSinceDatetime(),
    untilDatetime,
    activityTypeIds,
    candidateCampaignIds = [],
    routingFields = DEFAULT_ROUTING_FIELDS,
    maxActivityPages = 20,
    maxMembershipPages = 10,
    includeCampaignDetails = true,
    maxCampaignInspections = 10
  } = args;

  let leadLookup;

  if (leadId) {
    leadLookup = await queryLeads({
      filterType: 'id',
      filterValues: [String(leadId)],
      fields: fields || ['id', 'email', 'createdAt', 'updatedAt', ...routingFields],
      batchSize: 300
    });
  } else {
    const normalizedFilterValues = normalizeFilterValues(filterValues);
    if (normalizedFilterValues.length === 0) {
      throw new Error('leadId or filterValues must be provided');
    }

    leadLookup = await queryLeads({
      filterType,
      filterValues: normalizedFilterValues,
      fields: fields || ['id', 'email', 'createdAt', 'updatedAt', ...routingFields],
      batchSize: 300
    });
  }

  const resolution = selectCanonicalLead(leadLookup.leads || [], leadId ? 'id' : filterType);
  const canonicalLead = resolution.canonicalLead;
  if (!canonicalLead) {
    return {
      success: true,
      found: false,
      reason: 'No lead matched the provided identifier(s)',
      lookup: {
        leadId: leadId || null,
        filterType,
        filterValues: filterValues || null
      }
    };
  }

  const [listMembership, programMembership, smartCampaignMembership, activitiesWindow, leadChangesWindow, activityTypes] = await Promise.all([
    getLeadListMembership({ leadId: canonicalLead.id, maxPages: maxMembershipPages }),
    getLeadProgramMembership({ leadId: canonicalLead.id, maxPages: maxMembershipPages }),
    getLeadSmartCampaignMembership({ leadId: canonicalLead.id, maxPages: maxMembershipPages }),
    getActivitiesForWindow({
      leadId: canonicalLead.id,
      sinceDatetime,
      activityTypeIds,
      maxPages: maxActivityPages
    }),
    getLeadChangesForWindow({
      leadId: canonicalLead.id,
      sinceDatetime,
      untilDatetime,
      maxPages: maxActivityPages
    }),
    apiRequest('/rest/v1/activities/types.json')
  ]);

  const loopSignals = detectLoopCandidates(leadChangesWindow.changes, routingFields);

  const campaignIds = uniqueCampaignIds(smartCampaignMembership.memberships, candidateCampaignIds)
    .slice(0, Math.max(1, maxCampaignInspections));

  const campaignInspection = includeCampaignDetails
    ? await inspectCandidateCampaigns(campaignIds)
    : [];

  const activitySummary = buildActivitySummary(activitiesWindow.activities);
  const possiblePagingWindowMismatch =
    activitiesWindow.emptyPages > 0 &&
    activitiesWindow.activities.length === 0 &&
    (activitiesWindow.moreResult || activitiesWindow.truncated);

  const inferences = {
    duplicateRisk: resolution.duplicateRisk,
    duplicateCount: resolution.duplicates.length,
    anonymousLeadRisk: !canonicalLead.email,
    loopSignal: loopSignals.hasLoopSignal,
    possiblePagingWindowMismatch,
    scheduleDelayRisk: campaignInspection.some(item =>
      item?.campaign?.type === 'batch'
    ),
    requestableCandidateCount: campaignInspection.filter(item =>
      item?.campaign?.isRequestable === true
    ).length
  };

  return {
    success: true,
    found: true,
    canonicalLead,
    canonicalResolution: {
      method: resolution.method,
      duplicateRisk: resolution.duplicateRisk,
      duplicates: resolution.duplicates.map(lead => ({
        id: lead.id,
        email: lead.email,
        updatedAt: lead.updatedAt
      }))
    },
    membershipSnapshot: {
      listMembership,
      programMembership,
      smartCampaignMembership
    },
    activityTrace: {
      sinceDatetime,
      untilDatetime: untilDatetime || null,
      typesCatalogCount: activityTypes.result?.length || 0,
      activities: activitiesWindow.activities,
      leadChanges: leadChangesWindow.changes,
      summary: activitySummary,
      paging: {
        activities: {
          pagesFetched: activitiesWindow.pagesFetched,
          nextPageToken: activitiesWindow.nextPageToken,
          moreResult: activitiesWindow.moreResult,
          truncated: activitiesWindow.truncated,
          emptyPages: activitiesWindow.emptyPages
        },
        leadChanges: {
          pagesFetched: leadChangesWindow.pagesFetched,
          nextPageToken: leadChangesWindow.nextPageToken,
          moreResult: leadChangesWindow.moreResult,
          truncated: leadChangesWindow.truncated
        }
      }
    },
    campaignInspection,
    loopSignals,
    inferences,
    diagnosticNotes: [
      'Smart List rules are read via includeRules=true; Smart Campaign Flow steps are not REST-readable.',
      'Activities pagination is time-token based; continue paging until moreResult=false to avoid false negatives.'
    ]
  };
}

/**
 * Get lead partitions
 */
async function getLeadPartitions() {
  const result = await apiRequest('/rest/v1/leads/partitions.json');

  return {
    success: result.success,
    partitions: result.result || []
  };
}

export default {
  leadTools,
  executeLeadTool
};
