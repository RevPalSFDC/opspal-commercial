/**
 * Marketo Campaign Tools
 *
 * MCP tools for Smart Campaign management in Marketo.
 *
 * @module campaigns
 * @version 1.0.0
 */

import { apiRequest } from '../auth/oauth-handler.js';

/**
 * Campaign tool definitions for MCP
 */
export const campaignTools = [
  {
    name: 'mcp__marketo__campaign_list',
    description: 'List smart campaigns in Marketo. Can filter by name, program, or workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Filter by campaign name (partial match)'
        },
        programName: {
          type: 'string',
          description: 'Filter by program name'
        },
        workspaceName: {
          type: 'string',
          description: 'Filter by workspace name'
        },
        batchSize: {
          type: 'number',
          description: 'Number of records to return (max 200)',
          default: 200
        },
        nextPageToken: {
          type: 'string',
          description: 'Token for pagination'
        },
        isTriggerable: {
          type: 'boolean',
          description: 'Filter for trigger campaigns only'
        },
        earliestUpdatedAt: {
          type: 'string',
          description: 'Filter by earliest update date (ISO format)'
        },
        latestUpdatedAt: {
          type: 'string',
          description: 'Filter by latest update date (ISO format)'
        }
      }
    }
  },
  {
    name: 'mcp__marketo__campaign_get',
    description: 'Get details of a specific smart campaign by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'number',
          description: 'Campaign ID'
        }
      },
      required: ['campaignId']
    }
  },
  {
    name: 'mcp__marketo__campaign_activate',
    description: 'Activate a trigger campaign. Campaign must have valid smart list and flow.',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'number',
          description: 'Campaign ID to activate'
        }
      },
      required: ['campaignId']
    }
  },
  {
    name: 'mcp__marketo__campaign_deactivate',
    description: 'Deactivate an active trigger campaign.',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'number',
          description: 'Campaign ID to deactivate'
        }
      },
      required: ['campaignId']
    }
  },
  {
    name: 'mcp__marketo__campaign_schedule',
    description: 'Schedule a batch campaign to run at a specific time.',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'number',
          description: 'Campaign ID to schedule'
        },
        runAt: {
          type: 'string',
          description: 'Datetime to run campaign (ISO format). Must be at least 5 minutes in future.'
        },
        cloneToProgramName: {
          type: 'string',
          description: 'Optional: Clone to a new program before running'
        },
        tokens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'string' }
            }
          },
          description: 'Override my tokens for this run'
        }
      },
      required: ['campaignId', 'runAt']
    }
  },
  {
    name: 'mcp__marketo__campaign_request',
    description: 'Request a campaign to run for specific leads. Useful for adding leads to nurture.',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'number',
          description: 'Campaign ID (must be a requestable campaign)'
        },
        leads: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', description: 'Lead ID' }
            },
            required: ['id']
          },
          description: 'Array of lead objects with IDs (max 100)'
        },
        tokens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'string' }
            }
          },
          description: 'Override my tokens for these leads'
        }
      },
      required: ['campaignId', 'leads']
    }
  },
  {
    name: 'mcp__marketo__campaign_types',
    description: 'Get list of available activity types (useful for filtering activities).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * Execute campaign tool
 * @param {string} toolName - Tool name
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} Tool result
 */
export async function executeCampaignTool(toolName, args) {
  switch (toolName) {
    case 'mcp__marketo__campaign_list':
      return await listCampaigns(args);

    case 'mcp__marketo__campaign_get':
      return await getCampaign(args);

    case 'mcp__marketo__campaign_activate':
      return await activateCampaign(args);

    case 'mcp__marketo__campaign_deactivate':
      return await deactivateCampaign(args);

    case 'mcp__marketo__campaign_schedule':
      return await scheduleCampaign(args);

    case 'mcp__marketo__campaign_request':
      return await requestCampaign(args);

    case 'mcp__marketo__campaign_types':
      return await getActivityTypes();

    default:
      throw new Error(`Unknown campaign tool: ${toolName}`);
  }
}

/**
 * List smart campaigns
 */
async function listCampaigns(args) {
  const {
    name,
    programName,
    workspaceName,
    batchSize = 200,
    nextPageToken,
    isTriggerable,
    earliestUpdatedAt,
    latestUpdatedAt
  } = args;

  let endpoint = '/rest/asset/v1/smartCampaigns.json?';

  const params = [];

  if (name) params.push(`name=${encodeURIComponent(name)}`);
  if (programName) params.push(`programName=${encodeURIComponent(programName)}`);
  if (workspaceName) params.push(`workspaceName=${encodeURIComponent(workspaceName)}`);
  if (batchSize) params.push(`maxReturn=${Math.min(batchSize, 200)}`);
  if (nextPageToken) params.push(`offset=${nextPageToken}`);
  if (isTriggerable !== undefined) params.push(`isTriggerable=${isTriggerable}`);
  if (earliestUpdatedAt) params.push(`earliestUpdatedAt=${earliestUpdatedAt}`);
  if (latestUpdatedAt) params.push(`latestUpdatedAt=${latestUpdatedAt}`);

  endpoint += params.join('&');

  const result = await apiRequest(endpoint);

  return {
    success: result.success,
    campaigns: result.result || [],
    nextPageToken: result.result?.length === batchSize ? (parseInt(nextPageToken || 0) + batchSize).toString() : null
  };
}

/**
 * Get campaign details
 */
async function getCampaign(args) {
  const { campaignId } = args;

  const result = await apiRequest(`/rest/asset/v1/smartCampaign/${campaignId}.json`);

  return {
    success: result.success,
    campaign: result.result?.[0] || null
  };
}

/**
 * Activate trigger campaign
 */
async function activateCampaign(args) {
  const { campaignId } = args;

  const result = await apiRequest(`/rest/asset/v1/smartCampaign/${campaignId}/activate.json`, {
    method: 'POST'
  });

  return {
    success: result.success,
    campaignId,
    status: result.result?.[0]?.status || 'unknown',
    message: result.result?.[0] ? 'Campaign activated successfully' : 'Activation result unclear'
  };
}

/**
 * Deactivate trigger campaign
 */
async function deactivateCampaign(args) {
  const { campaignId } = args;

  const result = await apiRequest(`/rest/asset/v1/smartCampaign/${campaignId}/deactivate.json`, {
    method: 'POST'
  });

  return {
    success: result.success,
    campaignId,
    status: result.result?.[0]?.status || 'unknown',
    message: result.result?.[0] ? 'Campaign deactivated successfully' : 'Deactivation result unclear'
  };
}

/**
 * Schedule batch campaign
 */
async function scheduleCampaign(args) {
  const { campaignId, runAt, cloneToProgramName, tokens } = args;

  const payload = {
    input: {
      runAt
    }
  };

  if (cloneToProgramName) {
    payload.input.cloneToProgramName = cloneToProgramName;
  }

  if (tokens && tokens.length > 0) {
    payload.input.tokens = tokens;
  }

  const result = await apiRequest(`/rest/v1/campaigns/${campaignId}/schedule.json`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return {
    success: result.success,
    campaignId,
    scheduledAt: runAt,
    result: result.result?.[0] || null
  };
}

/**
 * Request campaign for leads
 */
async function requestCampaign(args) {
  const { campaignId, leads, tokens } = args;

  // Validate max 100 leads
  if (leads.length > 100) {
    throw new Error('Maximum 100 leads can be requested at once');
  }

  const payload = {
    input: {
      leads
    }
  };

  if (tokens && tokens.length > 0) {
    payload.input.tokens = tokens;
  }

  const result = await apiRequest(`/rest/v1/campaigns/${campaignId}/trigger.json`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return {
    success: result.success,
    campaignId,
    leadsRequested: leads.length,
    result: result.result || []
  };
}

/**
 * Get activity types
 */
async function getActivityTypes() {
  const result = await apiRequest('/rest/v1/activities/types.json');

  return {
    success: result.success,
    activityTypes: result.result || [],
    totalTypes: result.result?.length || 0
  };
}

export default {
  campaignTools,
  executeCampaignTool
};
