/**
 * Marketo Lead Tools
 *
 * MCP tools for lead management operations in Marketo.
 *
 * @module leads
 * @version 1.0.0
 */

import { apiRequest } from '../auth/oauth-handler.js';

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
          description: 'Fields to return (e.g., ["email", "firstName", "lastName", "company"])'
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
        untilDatetime: {
          type: 'string',
          description: 'End datetime (ISO format)'
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

    case 'mcp__marketo__lead_partitions':
      return await getLeadPartitions();

    default:
      throw new Error(`Unknown lead tool: ${toolName}`);
  }
}

/**
 * Query leads by filter
 */
async function queryLeads(args) {
  const { filterType, filterValues, fields, batchSize = 300, nextPageToken } = args;

  let endpoint = `/rest/v1/leads.json?filterType=${filterType}&filterValues=${filterValues.join(',')}`;

  if (fields && fields.length > 0) {
    endpoint += `&fields=${fields.join(',')}`;
  }

  if (batchSize) {
    endpoint += `&batchSize=${Math.min(batchSize, 300)}`;
  }

  if (nextPageToken) {
    endpoint += `&nextPageToken=${nextPageToken}`;
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
  const { leads, lookupField = 'id' } = args;

  const payload = {
    action: 'updateOnly',
    lookupField,
    input: leads
  };

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
 * Merge duplicate leads
 */
async function mergeLeads(args) {
  const { winnerId, loserIds, mergeInCRM = false } = args;

  // Validate max 3 losers
  if (loserIds.length > 3) {
    throw new Error('Maximum 3 loser leads can be merged at once');
  }

  let endpoint = `/rest/v1/leads/${winnerId}/merge.json?leadIds=${loserIds.join(',')}`;

  if (mergeInCRM) {
    endpoint += '&mergeInCRM=true';
  }

  const result = await apiRequest(endpoint, { method: 'POST' });

  return {
    success: result.success,
    winnerId,
    mergedIds: loserIds,
    requestId: result.requestId
  };
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
 * Get lead activities
 */
async function getLeadActivities(args) {
  const { activityTypeIds, leadIds, sinceDatetime, untilDatetime, batchSize = 300, nextPageToken } = args;

  // First, get paging token if we don't have nextPageToken
  let pagingToken = nextPageToken;

  if (!pagingToken && sinceDatetime) {
    const tokenResult = await apiRequest(`/rest/v1/activities/pagingtoken.json?sinceDatetime=${sinceDatetime}`);
    pagingToken = tokenResult.nextPageToken;
  }

  let endpoint = `/rest/v1/activities.json?`;

  if (pagingToken) {
    endpoint += `nextPageToken=${pagingToken}`;
  }

  if (activityTypeIds && activityTypeIds.length > 0) {
    endpoint += `&activityTypeIds=${activityTypeIds.join(',')}`;
  }

  if (leadIds && leadIds.length > 0) {
    endpoint += `&leadIds=${leadIds.join(',')}`;
  }

  if (batchSize) {
    endpoint += `&batchSize=${Math.min(batchSize, 300)}`;
  }

  const result = await apiRequest(endpoint);

  return {
    success: result.success,
    activities: result.result || [],
    nextPageToken: result.nextPageToken,
    moreResult: result.moreResult
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
