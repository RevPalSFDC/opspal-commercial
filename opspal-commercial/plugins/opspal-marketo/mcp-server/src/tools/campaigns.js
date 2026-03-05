/**
 * Marketo Campaign Tools
 *
 * MCP tools for Smart Campaign management in Marketo.
 * Supports full CRUD operations: Create, Read, Update, Clone, Delete
 *
 * @module campaigns
 * @version 2.0.0
 */

import { apiRequest } from '../auth/oauth-handler.js';
import { runWithIdempotency } from '../lib/idempotency-store.js';

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
        },
        idempotencyKey: {
          type: 'string',
          description: 'Optional key for replay-safe schedule execution'
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
        },
        idempotencyKey: {
          type: 'string',
          description: 'Optional key for replay-safe trigger execution'
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
  },
  {
    name: 'mcp__marketo__campaign_create',
    description: 'Create a new Smart Campaign. Note: Creates an empty campaign without triggers or flow steps - use clone for functional campaigns.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Unique name for the campaign'
        },
        folder: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Folder or Program ID' },
            type: { type: 'string', enum: ['Folder', 'Program'], description: 'Container type' }
          },
          required: ['id', 'type'],
          description: 'Destination folder or program'
        },
        description: {
          type: 'string',
          description: 'Campaign description'
        }
      },
      required: ['name', 'folder']
    }
  },
  {
    name: 'mcp__marketo__campaign_update',
    description: 'Update a Smart Campaign name and/or description. Note: Only metadata can be updated - triggers and flow cannot be modified via API.',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'number',
          description: 'Campaign ID to update'
        },
        name: {
          type: 'string',
          description: 'New campaign name'
        },
        description: {
          type: 'string',
          description: 'New campaign description'
        }
      },
      required: ['campaignId']
    }
  },
  {
    name: 'mcp__marketo__campaign_clone',
    description: 'Clone a Smart Campaign including Smart List and Flow. This is the primary method for creating functional campaigns with triggers and flows.',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'number',
          description: 'Source campaign ID to clone'
        },
        name: {
          type: 'string',
          description: 'Name for the new campaign'
        },
        folder: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Folder or Program ID' },
            type: { type: 'string', enum: ['Folder', 'Program'], description: 'Container type' }
          },
          required: ['id', 'type'],
          description: 'Destination folder or program'
        },
        description: {
          type: 'string',
          description: 'Description for the new campaign'
        }
      },
      required: ['campaignId', 'name', 'folder']
    }
  },
  {
    name: 'mcp__marketo__campaign_delete',
    description: 'Permanently delete a Smart Campaign. Campaign must be deactivated first. This action is irreversible.',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'number',
          description: 'Campaign ID to delete'
        }
      },
      required: ['campaignId']
    }
  },
  {
    name: 'mcp__marketo__campaign_get_smart_list',
    description: 'Get the Smart List (triggers and filters) for a campaign. Returns rule definitions when includeRules is true.',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'number',
          description: 'Campaign ID'
        },
        includeRules: {
          type: 'boolean',
          description: 'Include trigger and filter rule definitions',
          default: true
        }
      },
      required: ['campaignId']
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

    case 'mcp__marketo__campaign_create':
      return await createCampaign(args);

    case 'mcp__marketo__campaign_update':
      return await updateCampaign(args);

    case 'mcp__marketo__campaign_clone':
      return await cloneCampaign(args);

    case 'mcp__marketo__campaign_delete':
      return await deleteCampaign(args);

    case 'mcp__marketo__campaign_get_smart_list':
      return await getCampaignSmartList(args);

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
  const { campaignId, runAt, cloneToProgramName, tokens, idempotencyKey } = args;

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

  return await runWithIdempotency({
    key: idempotencyKey,
    operation: 'campaign_schedule',
    payload: { campaignId, ...payload }
  }, async () => {
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
  });
}

/**
 * Request campaign for leads
 */
async function requestCampaign(args) {
  const { campaignId, leads, tokens, idempotencyKey } = args;

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

  return await runWithIdempotency({
    key: idempotencyKey,
    operation: 'campaign_request',
    payload: { campaignId, ...payload }
  }, async () => {
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
  });
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

/**
 * Create a new Smart Campaign
 * Note: Creates empty campaign - no triggers/flows (use clone for functional campaigns)
 */
async function createCampaign(args) {
  const { name, folder, description } = args;

  // Build form-urlencoded body (Marketo Asset API requirement)
  const params = new URLSearchParams();
  params.append('name', name);
  params.append('folder', JSON.stringify(folder));
  if (description) {
    params.append('description', description);
  }

  const result = await apiRequest('/rest/asset/v1/smartCampaigns.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  return {
    success: result.success,
    campaign: result.result?.[0] || null,
    warnings: result.warnings || [],
    message: result.success
      ? 'Campaign created (empty - no triggers/flows). Use clone for functional campaigns.'
      : `Creation failed: ${result.errors?.[0]?.message || 'Unknown error'}`
  };
}

/**
 * Update Smart Campaign metadata
 * Only name and description can be updated via API
 */
async function updateCampaign(args) {
  const { campaignId, name, description } = args;

  if (!name && !description) {
    throw new Error('At least one of name or description must be provided');
  }

  // Build form-urlencoded body
  const params = new URLSearchParams();
  if (name) params.append('name', name);
  if (description) params.append('description', description);

  const result = await apiRequest(`/rest/asset/v1/smartCampaign/${campaignId}.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  return {
    success: result.success,
    campaign: result.result?.[0] || null,
    message: result.success
      ? 'Campaign metadata updated'
      : `Update failed: ${result.errors?.[0]?.message || 'Unknown error'}`
  };
}

/**
 * Clone a Smart Campaign
 * Primary method for creating functional campaigns with triggers and flows
 */
async function cloneCampaign(args) {
  const { campaignId, name, folder, description } = args;

  // Build form-urlencoded body
  const params = new URLSearchParams();
  params.append('name', name);
  params.append('folder', JSON.stringify(folder));
  if (description) {
    params.append('description', description);
  }

  const result = await apiRequest(`/rest/asset/v1/smartCampaign/${campaignId}/clone.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  return {
    success: result.success,
    campaign: result.result?.[0] || null,
    sourceId: campaignId,
    message: result.success
      ? `Campaign cloned successfully. New ID: ${result.result?.[0]?.id}`
      : `Clone failed: ${result.errors?.[0]?.message || 'Unknown error'}`
  };
}

/**
 * Delete a Smart Campaign
 * Campaign must be deactivated first - this action is irreversible
 */
async function deleteCampaign(args) {
  const { campaignId } = args;

  const result = await apiRequest(`/rest/asset/v1/smartCampaign/${campaignId}/delete.json`, {
    method: 'POST'
  });

  return {
    success: result.success,
    deletedId: campaignId,
    message: result.success
      ? `Campaign ${campaignId} permanently deleted`
      : `Delete failed: ${result.errors?.[0]?.message || 'Unknown error'}`
  };
}

/**
 * Get Smart List for a campaign
 * Returns triggers and filters when includeRules is true
 */
async function getCampaignSmartList(args) {
  const { campaignId, includeRules = true } = args;

  let endpoint = `/rest/asset/v1/smartCampaign/${campaignId}/smartList.json`;
  if (includeRules) {
    endpoint += '?includeRules=true';
  }

  const result = await apiRequest(endpoint);

  return {
    success: result.success,
    smartListId: result.result?.[0]?.id || null,
    rules: result.result?.[0]?.rules || null,
    triggers: result.result?.[0]?.rules?.triggers || [],
    filters: result.result?.[0]?.rules?.filters || [],
    filterLogic: result.result?.[0]?.rules?.filterLogic || null,
    message: result.success
      ? `Smart List retrieved for campaign ${campaignId}`
      : `Retrieval failed: ${result.errors?.[0]?.message || 'Unknown error'}`
  };
}

export default {
  campaignTools,
  executeCampaignTool
};
