/**
 * Marketo Program Tools
 *
 * MCP tools for program management in Marketo.
 *
 * @module programs
 * @version 2.0.0
 */

import { apiRequest } from '../auth/oauth-handler.js';

/**
 * Program tool definitions for MCP
 */
export const programTools = [
  {
    name: 'mcp__marketo__program_list',
    description: 'List programs in Marketo. Can filter by name, workspace, or tag.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Filter by program name (partial match)'
        },
        workspace: {
          type: 'string',
          description: 'Filter by workspace name'
        },
        filterType: {
          type: 'string',
          description: 'Filter type (e.g., "id", "name", "tag")'
        },
        filterValues: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter values'
        },
        earliestUpdatedAt: {
          type: 'string',
          description: 'Filter by earliest update date (ISO format)'
        },
        latestUpdatedAt: {
          type: 'string',
          description: 'Filter by latest update date (ISO format)'
        },
        maxReturn: {
          type: 'number',
          description: 'Number of records to return (max 200)',
          default: 200
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
          default: 0
        }
      }
    }
  },
  {
    name: 'mcp__marketo__program_get',
    description: 'Get details of a specific program by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        programId: {
          type: 'number',
          description: 'Program ID'
        }
      },
      required: ['programId']
    }
  },
  {
    name: 'mcp__marketo__program_create',
    description: 'Create a new program in Marketo.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Program name (must be unique)'
        },
        type: {
          type: 'string',
          enum: ['program', 'event', 'engagement', 'email'],
          description: 'Program type'
        },
        channel: {
          type: 'string',
          description: 'Program channel (e.g., "Webinar", "Tradeshow", "Content")'
        },
        folder: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Folder ID' },
            type: { type: 'string', enum: ['Folder', 'Program'], default: 'Folder' }
          },
          required: ['id'],
          description: 'Parent folder'
        },
        description: {
          type: 'string',
          description: 'Program description'
        },
        costs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              startDate: { type: 'string', description: 'Cost period start date (YYYY-MM-DD)' },
              cost: { type: 'number', description: 'Cost amount' },
              note: { type: 'string', description: 'Cost note' }
            }
          },
          description: 'Program costs/budget'
        },
        tags: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tagType: { type: 'string' },
              tagValue: { type: 'string' }
            }
          },
          description: 'Program tags'
        }
      },
      required: ['name', 'type', 'channel', 'folder']
    }
  },
  {
    name: 'mcp__marketo__program_clone',
    description: 'Clone an existing program.',
    inputSchema: {
      type: 'object',
      properties: {
        programId: {
          type: 'number',
          description: 'ID of program to clone'
        },
        name: {
          type: 'string',
          description: 'Name for cloned program'
        },
        folder: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Destination folder ID' },
            type: { type: 'string', enum: ['Folder', 'Program'], default: 'Folder' }
          },
          required: ['id'],
          description: 'Destination folder'
        },
        description: {
          type: 'string',
          description: 'Description for cloned program'
        }
      },
      required: ['programId', 'name', 'folder']
    }
  },
  {
    name: 'mcp__marketo__program_members',
    description: 'Get or add program members.',
    inputSchema: {
      type: 'object',
      properties: {
        programId: {
          type: 'number',
          description: 'Program ID'
        },
        action: {
          type: 'string',
          enum: ['get', 'add', 'update'],
          description: 'Action to perform',
          default: 'get'
        },
        leads: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              leadId: { type: 'number' },
              status: { type: 'string' }
            }
          },
          description: 'Leads to add/update (for add/update actions)'
        },
        filterType: {
          type: 'string',
          description: 'Filter type for get (e.g., "leadId")'
        },
        filterValues: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter values for get'
        },
        batchSize: {
          type: 'number',
          description: 'Batch size for get (max 300)',
          default: 300
        },
        nextPageToken: {
          type: 'string',
          description: 'Pagination token'
        }
      },
      required: ['programId']
    }
  },
  {
    name: 'mcp__marketo__program_channels',
    description: 'Get available program channels.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'mcp__marketo__program_tags',
    description: 'Get available program tags.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  // v2.0.0: New program token and engagement tools
  {
    name: 'mcp__marketo__program_tokens_get',
    description: 'Get all My Tokens for a program. Returns token names, types, and values.',
    inputSchema: {
      type: 'object',
      properties: {
        programId: {
          type: 'number',
          description: 'Program ID to get tokens from'
        }
      },
      required: ['programId']
    }
  },
  {
    name: 'mcp__marketo__program_tokens_update',
    description: 'Update multiple My Tokens for a program at once.',
    inputSchema: {
      type: 'object',
      properties: {
        programId: {
          type: 'number',
          description: 'Program ID to update tokens for'
        },
        tokens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Token name (e.g., "Event Name")' },
              type: { type: 'string', enum: ['text', 'number', 'date', 'rich_text', 'score'], description: 'Token type', default: 'text' },
              value: { type: 'string', description: 'Token value' }
            },
            required: ['name', 'value']
          },
          description: 'Array of tokens to update'
        }
      },
      required: ['programId', 'tokens']
    }
  },
  {
    name: 'mcp__marketo__engagement_stream_add_content',
    description: 'Add content (email) to an engagement program stream.',
    inputSchema: {
      type: 'object',
      properties: {
        programId: {
          type: 'number',
          description: 'Engagement program ID'
        },
        streamId: {
          type: 'number',
          description: 'Stream ID to add content to'
        },
        contentId: {
          type: 'number',
          description: 'Email ID to add to stream'
        },
        contentType: {
          type: 'string',
          enum: ['email'],
          description: 'Type of content',
          default: 'email'
        }
      },
      required: ['programId', 'streamId', 'contentId']
    }
  },
  {
    name: 'mcp__marketo__engagement_stream_set_cadence',
    description: 'Configure the cast cadence for an engagement program stream.',
    inputSchema: {
      type: 'object',
      properties: {
        programId: {
          type: 'number',
          description: 'Engagement program ID'
        },
        streamId: {
          type: 'number',
          description: 'Stream ID to configure'
        },
        cadence: {
          type: 'object',
          properties: {
            repeat: { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: 'Repeat frequency' },
            everyNDays: { type: 'number', description: 'Run every N days (for weekly)' },
            weekDays: { type: 'array', items: { type: 'string', enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] }, description: 'Days to run' },
            startTime: { type: 'string', description: 'Start time (HH:MM format)' },
            timezone: { type: 'string', description: 'Timezone (e.g., "America/New_York")' }
          },
          required: ['repeat', 'startTime'],
          description: 'Cadence configuration'
        }
      },
      required: ['programId', 'streamId', 'cadence']
    }
  },
  {
    name: 'mcp__marketo__engagement_transition_rules',
    description: 'Get or configure transition rules between engagement program streams.',
    inputSchema: {
      type: 'object',
      properties: {
        programId: {
          type: 'number',
          description: 'Engagement program ID'
        },
        action: {
          type: 'string',
          enum: ['get', 'update'],
          description: 'Action to perform',
          default: 'get'
        },
        rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sourceStreamId: { type: 'number', description: 'Source stream ID' },
              targetStreamId: { type: 'number', description: 'Target stream ID' },
              triggerType: { type: 'string', enum: ['score', 'data_value', 'exhausted'], description: 'Transition trigger type' },
              triggerField: { type: 'string', description: 'Field to monitor for transition' },
              triggerOperator: { type: 'string', description: 'Comparison operator' },
              triggerValue: { type: 'string', description: 'Value to compare against' }
            }
          },
          description: 'Transition rules (for update action)'
        }
      },
      required: ['programId']
    }
  }
];

/**
 * Execute program tool
 * @param {string} toolName - Tool name
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} Tool result
 */
export async function executeProgramTool(toolName, args) {
  switch (toolName) {
    case 'mcp__marketo__program_list':
      return await listPrograms(args);

    case 'mcp__marketo__program_get':
      return await getProgram(args);

    case 'mcp__marketo__program_create':
      return await createProgram(args);

    case 'mcp__marketo__program_clone':
      return await cloneProgram(args);

    case 'mcp__marketo__program_members':
      return await handleProgramMembers(args);

    case 'mcp__marketo__program_channels':
      return await getChannels();

    case 'mcp__marketo__program_tags':
      return await getTags();

    // v2.0.0: New token and engagement tools
    case 'mcp__marketo__program_tokens_get':
      return await getProgramTokens(args);

    case 'mcp__marketo__program_tokens_update':
      return await updateProgramTokens(args);

    case 'mcp__marketo__engagement_stream_add_content':
      return await addStreamContent(args);

    case 'mcp__marketo__engagement_stream_set_cadence':
      return await setStreamCadence(args);

    case 'mcp__marketo__engagement_transition_rules':
      return await handleTransitionRules(args);

    default:
      throw new Error(`Unknown program tool: ${toolName}`);
  }
}

/**
 * List programs
 */
async function listPrograms(args) {
  const {
    name,
    workspace,
    filterType,
    filterValues,
    earliestUpdatedAt,
    latestUpdatedAt,
    maxReturn = 200,
    offset = 0
  } = args;

  let endpoint = '/rest/asset/v1/programs.json?';

  const params = [];

  if (filterType && filterValues) {
    params.push(`filterType=${filterType}`);
    params.push(`filterValues=${filterValues.join(',')}`);
  }

  if (name) params.push(`name=${encodeURIComponent(name)}`);
  if (workspace) params.push(`workspace=${encodeURIComponent(workspace)}`);
  if (earliestUpdatedAt) params.push(`earliestUpdatedAt=${earliestUpdatedAt}`);
  if (latestUpdatedAt) params.push(`latestUpdatedAt=${latestUpdatedAt}`);
  params.push(`maxReturn=${Math.min(maxReturn, 200)}`);
  params.push(`offset=${offset}`);

  endpoint += params.join('&');

  const result = await apiRequest(endpoint);

  return {
    success: result.success,
    programs: result.result || [],
    nextOffset: result.result?.length === maxReturn ? offset + maxReturn : null
  };
}

/**
 * Get program details
 */
async function getProgram(args) {
  const { programId } = args;

  const result = await apiRequest(`/rest/asset/v1/program/${programId}.json`);

  return {
    success: result.success,
    program: result.result?.[0] || null
  };
}

/**
 * Create program
 */
async function createProgram(args) {
  const { name, type, channel, folder, description, costs, tags } = args;

  // Build form data (Marketo asset API uses form-urlencoded)
  const params = new URLSearchParams();
  params.append('name', name);
  params.append('type', type);
  params.append('channel', channel);
  params.append('folder', JSON.stringify(folder));

  if (description) params.append('description', description);
  if (costs) params.append('costs', JSON.stringify(costs));
  if (tags) params.append('tags', JSON.stringify(tags));

  const result = await apiRequest('/rest/asset/v1/programs.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  return {
    success: result.success,
    program: result.result?.[0] || null
  };
}

/**
 * Clone program
 */
async function cloneProgram(args) {
  const { programId, name, folder, description } = args;

  const params = new URLSearchParams();
  params.append('name', name);
  params.append('folder', JSON.stringify(folder));

  if (description) params.append('description', description);

  const result = await apiRequest(`/rest/asset/v1/program/${programId}/clone.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  return {
    success: result.success,
    program: result.result?.[0] || null
  };
}

/**
 * Handle program members (get/add/update)
 */
async function handleProgramMembers(args) {
  const { programId, action = 'get', leads, filterType, filterValues, batchSize = 300, nextPageToken } = args;

  if (action === 'get') {
    let endpoint = `/rest/v1/programs/${programId}/members.json?`;

    if (filterType && filterValues) {
      endpoint += `filterType=${filterType}&filterValues=${filterValues.join(',')}`;
    }

    endpoint += `&batchSize=${Math.min(batchSize, 300)}`;

    if (nextPageToken) {
      endpoint += `&nextPageToken=${nextPageToken}`;
    }

    const result = await apiRequest(endpoint);

    return {
      success: result.success,
      members: result.result || [],
      nextPageToken: result.nextPageToken,
      moreResult: result.moreResult
    };

  } else if (action === 'add' || action === 'update') {
    if (!leads || leads.length === 0) {
      throw new Error('Leads array required for add/update action');
    }

    const payload = {
      input: leads.map(l => ({
        leadId: l.leadId,
        status: l.status
      }))
    };

    const endpoint = action === 'add'
      ? `/rest/v1/programs/${programId}/members.json`
      : `/rest/v1/programs/${programId}/members/status.json`;

    const result = await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return {
      success: result.success,
      results: result.result || []
    };
  }

  throw new Error(`Unknown action: ${action}`);
}

/**
 * Get available channels
 */
async function getChannels() {
  const result = await apiRequest('/rest/asset/v1/channels.json');

  return {
    success: result.success,
    channels: result.result || []
  };
}

/**
 * Get available tags
 */
async function getTags() {
  const result = await apiRequest('/rest/asset/v1/tagTypes.json');

  return {
    success: result.success,
    tags: result.result || []
  };
}

// ============================================================================
// v2.0.0: New Program Token and Engagement Stream Functions
// ============================================================================

/**
 * Get program tokens
 */
async function getProgramTokens(args) {
  const { programId } = args;

  const result = await apiRequest(`/rest/asset/v1/folder/${programId}/tokens.json?folderType=Program`);

  return {
    success: result.success,
    tokens: result.result || [],
    programId
  };
}

/**
 * Update program tokens
 */
async function updateProgramTokens(args) {
  const { programId, tokens } = args;

  const results = [];

  for (const token of tokens) {
    const params = new URLSearchParams();
    params.append('name', token.name);
    params.append('type', token.type || 'text');
    params.append('value', token.value);
    params.append('folderType', 'Program');

    try {
      const result = await apiRequest(`/rest/asset/v1/folder/${programId}/tokens.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      results.push({
        name: token.name,
        success: result.success,
        errors: result.errors || []
      });
    } catch (error) {
      results.push({
        name: token.name,
        success: false,
        error: error.message
      });
    }
  }

  const successCount = results.filter(r => r.success).length;

  return {
    success: successCount === tokens.length,
    updated: successCount,
    total: tokens.length,
    results,
    programId
  };
}

/**
 * Add content to engagement stream
 */
async function addStreamContent(args) {
  const { programId, streamId, contentId, contentType = 'email' } = args;

  const payload = {
    contentId,
    contentType
  };

  const result = await apiRequest(`/rest/asset/v1/program/${programId}/stream/${streamId}/content.json`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return {
    success: result.success,
    stream: result.result?.[0] || null,
    programId,
    streamId,
    contentId
  };
}

/**
 * Set stream cadence
 */
async function setStreamCadence(args) {
  const { programId, streamId, cadence } = args;

  // Build cadence payload
  const payload = {
    repeat: cadence.repeat,
    everyNDays: cadence.everyNDays,
    weekDays: cadence.weekDays,
    startTime: cadence.startTime,
    timezone: cadence.timezone
  };

  // Filter out undefined values
  Object.keys(payload).forEach(key => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  const result = await apiRequest(`/rest/asset/v1/program/${programId}/stream/${streamId}/cadence.json`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return {
    success: result.success,
    cadence: result.result?.[0] || null,
    programId,
    streamId
  };
}

/**
 * Handle transition rules (get/update)
 */
async function handleTransitionRules(args) {
  const { programId, action = 'get', rules } = args;

  if (action === 'get') {
    // Get engagement program details including streams and transition rules
    const result = await apiRequest(`/rest/asset/v1/program/${programId}.json`);

    const program = result.result?.[0];

    if (!program) {
      return {
        success: false,
        error: 'Program not found',
        programId
      };
    }

    // Extract transition rules from program structure
    const transitionRules = [];

    // Note: Actual transition rules are typically stored in smart campaigns
    // This returns the program structure that would contain them
    return {
      success: true,
      program: {
        id: program.id,
        name: program.name,
        type: program.type
      },
      transitionRules,
      note: 'Transition rules are configured via smart campaigns within the engagement program'
    };

  } else if (action === 'update') {
    if (!rules || rules.length === 0) {
      return {
        success: false,
        error: 'Rules array required for update action'
      };
    }

    // Transition rules are typically implemented via smart campaigns
    // Return guidance on how to configure them
    return {
      success: true,
      message: 'Transition rules should be configured via smart campaigns',
      guidance: rules.map(rule => ({
        description: `Transition from Stream ${rule.sourceStreamId} to Stream ${rule.targetStreamId}`,
        implementation: {
          campaignName: `Transition - Stream ${rule.sourceStreamId} to ${rule.targetStreamId}`,
          trigger: rule.triggerType === 'exhausted' ? 'Exhausted Content' : 'Score is Changed',
          filter: rule.triggerType === 'score'
            ? `${rule.triggerField} ${rule.triggerOperator} ${rule.triggerValue}`
            : null,
          flowStep: `Change Engagement Program Stream - Stream ${rule.targetStreamId}`
        }
      }))
    };
  }

  return {
    success: false,
    error: `Unknown action: ${action}`
  };
}

export default {
  programTools,
  executeProgramTool
};
