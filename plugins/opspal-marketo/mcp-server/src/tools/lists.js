/**
 * Marketo List Tools
 *
 * MCP tools for static list and smart list operations.
 *
 * @module lists
 * @version 1.0.0
 */

import { apiRequest } from '../auth/oauth-handler.js';
import { runWithIdempotency } from '../lib/idempotency-store.js';

/**
 * Static list tool definitions
 */
const staticListTools = [
  {
    name: 'mcp__marketo__list_list',
    description: 'List static lists with optional filtering by name or folder.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Filter by list name (partial match)' },
        folder: { type: 'object', description: 'Folder filter {id, type}' },
        maxReturn: { type: 'number', description: 'Max results (default 200)' },
        offset: { type: 'number', description: 'Pagination offset' }
      }
    }
  },
  {
    name: 'mcp__marketo__list_get',
    description: 'Get a static list by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        listId: { type: 'number', description: 'Static list ID' }
      },
      required: ['listId']
    }
  },
  {
    name: 'mcp__marketo__list_create',
    description: 'Create a new static list.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'List name' },
        folder: { type: 'object', description: 'Folder {id, type}' },
        description: { type: 'string', description: 'Optional description' }
      },
      required: ['name', 'folder']
    }
  },
  {
    name: 'mcp__marketo__list_delete',
    description: 'Delete a static list by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        listId: { type: 'number', description: 'Static list ID' }
      },
      required: ['listId']
    }
  },
  {
    name: 'mcp__marketo__list_add_leads',
    description: 'Add leads to a static list (max 300 per request).',
    inputSchema: {
      type: 'object',
      properties: {
        listId: { type: 'number', description: 'Static list ID' },
        leads: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'number', description: 'Lead ID' } },
            required: ['id']
          },
          description: 'Lead IDs to add (max 300)'
        },
        idempotencyKey: {
          type: 'string',
          description: 'Optional key for replay-safe add execution'
        }
      },
      required: ['listId', 'leads']
    }
  },
  {
    name: 'mcp__marketo__list_remove_leads',
    description: 'Remove leads from a static list (max 300 per request).',
    inputSchema: {
      type: 'object',
      properties: {
        listId: { type: 'number', description: 'Static list ID' },
        leads: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'number', description: 'Lead ID' } },
            required: ['id']
          },
          description: 'Lead IDs to remove (max 300)'
        },
        idempotencyKey: {
          type: 'string',
          description: 'Optional key for replay-safe remove execution'
        }
      },
      required: ['listId', 'leads']
    }
  },
  {
    name: 'mcp__marketo__list_leads',
    description: 'List leads that belong to a static list.',
    inputSchema: {
      type: 'object',
      properties: {
        listId: { type: 'number', description: 'Static list ID' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to return'
        },
        batchSize: { type: 'number', description: 'Results per page (max 300)' },
        nextPageToken: { type: 'string', description: 'Pagination token' }
      },
      required: ['listId']
    }
  }
];

/**
 * Smart list tool definitions
 */
const smartListTools = [
  {
    name: 'mcp__marketo__smart_list_list',
    description: 'List smart lists with optional filtering by name or folder.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Filter by smart list name (partial match)' },
        folder: { type: 'object', description: 'Folder filter {id, type}' },
        maxReturn: { type: 'number', description: 'Max results (default 200)' },
        offset: { type: 'number', description: 'Pagination offset' }
      }
    }
  },
  {
    name: 'mcp__marketo__smart_list_get',
    description: 'Get a smart list by ID. Use includeRules to fetch triggers/filters.',
    inputSchema: {
      type: 'object',
      properties: {
        smartListId: { type: 'number', description: 'Smart list ID' },
        includeRules: { type: 'boolean', description: 'Include trigger/filter rules', default: true }
      },
      required: ['smartListId']
    }
  },
  {
    name: 'mcp__marketo__smart_list_clone',
    description: 'Clone a smart list with triggers and filters preserved.',
    inputSchema: {
      type: 'object',
      properties: {
        smartListId: { type: 'number', description: 'Source smart list ID' },
        name: { type: 'string', description: 'New smart list name' },
        folder: { type: 'object', description: 'Target folder {id, type}' },
        description: { type: 'string', description: 'Optional description' }
      },
      required: ['smartListId', 'name', 'folder']
    }
  },
  {
    name: 'mcp__marketo__smart_list_delete',
    description: 'Delete a smart list by ID. System lists cannot be deleted.',
    inputSchema: {
      type: 'object',
      properties: {
        smartListId: { type: 'number', description: 'Smart list ID' }
      },
      required: ['smartListId']
    }
  }
];

const staticListAliases = staticListTools.map(tool => ({
  ...tool,
  name: tool.name.replace('__list_', '__static_list_')
}));

export const listTools = [
  ...staticListTools,
  ...staticListAliases,
  ...smartListTools
];

/**
 * Execute list tool
 */
export async function executeListTool(toolName, args) {
  const normalized = toolName.replace('__static_list_', '__list_');

  switch (normalized) {
    case 'mcp__marketo__list_list':
      return await listStaticLists(args);
    case 'mcp__marketo__list_get':
      return await getStaticList(args);
    case 'mcp__marketo__list_create':
      return await createStaticList(args);
    case 'mcp__marketo__list_delete':
      return await deleteStaticList(args);
    case 'mcp__marketo__list_add_leads':
      return await addLeadsToList(args);
    case 'mcp__marketo__list_remove_leads':
      return await removeLeadsFromList(args);
    case 'mcp__marketo__list_leads':
      return await listLeadsInList(args);
    case 'mcp__marketo__smart_list_list':
      return await listSmartLists(args);
    case 'mcp__marketo__smart_list_get':
      return await getSmartList(args);
    case 'mcp__marketo__smart_list_clone':
      return await cloneSmartList(args);
    case 'mcp__marketo__smart_list_delete':
      return await deleteSmartList(args);
    default:
      throw new Error(`Unknown list tool: ${toolName}`);
  }
}

async function listStaticLists(args) {
  const { name, folder, maxReturn = 200, offset = 0 } = args;
  const params = new URLSearchParams();
  if (name) params.append('name', name);
  if (folder) params.append('folder', JSON.stringify(folder));
  params.append('maxReturn', maxReturn.toString());
  params.append('offset', offset.toString());

  const result = await apiRequest(`/rest/asset/v1/staticLists.json?${params}`);
  return {
    success: result.success,
    lists: result.result || [],
    moreResult: result.moreResult || false
  };
}

async function getStaticList(args) {
  const { listId } = args;
  const result = await apiRequest(`/rest/asset/v1/staticList/${listId}.json`);
  return { success: result.success, list: result.result?.[0] || null };
}

async function createStaticList(args) {
  const { name, folder, description } = args;

  const params = new URLSearchParams();
  params.append('name', name);
  params.append('folder', JSON.stringify(folder));
  if (description) params.append('description', description);

  const result = await apiRequest('/rest/asset/v1/staticLists.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  return {
    success: result.success,
    list: result.result?.[0] || null,
    message: result.success ? `Static list "${name}" created` : 'List creation failed'
  };
}

async function deleteStaticList(args) {
  const { listId } = args;
  const result = await apiRequest(`/rest/asset/v1/staticList/${listId}/delete.json`, {
    method: 'POST'
  });

  return {
    success: result.success,
    deletedId: listId,
    message: result.success ? `Static list ${listId} deleted` : 'Delete failed'
  };
}

async function addLeadsToList(args) {
  const { listId, leads, idempotencyKey } = args;

  if (leads.length > 300) {
    throw new Error('Maximum 300 leads can be added per request');
  }

  const payload = { input: leads };
  return await runWithIdempotency({
    key: idempotencyKey,
    operation: 'list_add_leads',
    payload: { listId, leads }
  }, async () => {
    const result = await apiRequest(`/rest/v1/lists/${listId}/leads.json`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return {
      success: result.success,
      listId,
      result: result.result || [],
      message: result.success ? `Added ${leads.length} lead(s) to list` : 'Add to list failed'
    };
  });
}

async function removeLeadsFromList(args) {
  const { listId, leads, idempotencyKey } = args;

  if (leads.length > 300) {
    throw new Error('Maximum 300 leads can be removed per request');
  }

  const payload = { input: leads };
  return await runWithIdempotency({
    key: idempotencyKey,
    operation: 'list_remove_leads',
    payload: { listId, leads }
  }, async () => {
    const result = await apiRequest(`/rest/v1/lists/${listId}/leads.json`, {
      method: 'DELETE',
      body: JSON.stringify(payload)
    });

    return {
      success: result.success,
      listId,
      result: result.result || [],
      message: result.success ? `Removed ${leads.length} lead(s) from list` : 'Remove from list failed'
    };
  });
}

async function listLeadsInList(args) {
  const { listId, fields, batchSize = 300, nextPageToken } = args;

  let endpoint = `/rest/v1/leads.json?filterType=listId&filterValues=${listId}`;

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
    nextPageToken: result.nextPageToken || null
  };
}

async function listSmartLists(args) {
  const { name, folder, maxReturn = 200, offset = 0 } = args;
  const params = new URLSearchParams();
  if (name) params.append('name', name);
  if (folder) params.append('folder', JSON.stringify(folder));
  params.append('maxReturn', maxReturn.toString());
  params.append('offset', offset.toString());

  const result = await apiRequest(`/rest/asset/v1/smartLists.json?${params}`);
  return {
    success: result.success,
    smartLists: result.result || [],
    moreResult: result.moreResult || false
  };
}

async function getSmartList(args) {
  const { smartListId, includeRules = true } = args;
  const query = includeRules ? '?includeRules=true' : '';

  const result = await apiRequest(`/rest/asset/v1/smartList/${smartListId}.json${query}`);

  return {
    success: result.success,
    smartList: result.result?.[0] || null,
    rules: result.result?.[0]?.rules || null
  };
}

async function cloneSmartList(args) {
  const { smartListId, name, folder, description } = args;

  const params = new URLSearchParams();
  params.append('name', name);
  params.append('folder', JSON.stringify(folder));
  if (description) params.append('description', description);

  const result = await apiRequest(`/rest/asset/v1/smartList/${smartListId}/clone.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  return {
    success: result.success,
    smartList: result.result?.[0] || null,
    sourceId: smartListId,
    message: result.success ? 'Smart list cloned' : 'Clone failed'
  };
}

async function deleteSmartList(args) {
  const { smartListId } = args;
  const result = await apiRequest(`/rest/asset/v1/smartList/${smartListId}/delete.json`, {
    method: 'POST'
  });

  return {
    success: result.success,
    deletedId: smartListId,
    message: result.success ? `Smart list ${smartListId} deleted` : 'Delete failed'
  };
}

export default {
  listTools,
  executeListTool
};
