/**
 * Marketo Landing Page Tools (MCP Compatible)
 *
 * MCP tools for landing page operations in Marketo.
 *
 * @module landing-pages-mcp
 * @version 1.0.0
 */

import { apiRequest } from '../auth/oauth-handler.js';

/**
 * Landing page tool definitions for MCP
 */
export const landingPageTools = [
  {
    name: 'mcp__marketo__landing_page_list',
    description: 'List landing pages with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'object', description: 'Folder filter {id, type}' },
        status: { type: 'string', enum: ['draft', 'approved'], description: 'Page status' },
        maxReturn: { type: 'number', description: 'Max results (default 200)' },
        offset: { type: 'number', description: 'Pagination offset' }
      }
    }
  },
  {
    name: 'mcp__marketo__landing_page_get',
    description: 'Get landing page by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Landing page ID' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['landingPageId']
    }
  },
  {
    name: 'mcp__marketo__landing_page_create',
    description: 'Create new landing page from template.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Page name' },
        folder: { type: 'object', description: 'Folder {id, type}' },
        template: { type: 'number', description: 'Template ID' },
        title: { type: 'string', description: 'Page title for browser' },
        description: { type: 'string' },
        keywords: { type: 'string', description: 'SEO keywords' },
        robots: { type: 'string', description: 'Robots meta directive' },
        urlPageName: { type: 'string', description: 'URL slug' },
        mobileEnabled: { type: 'boolean', description: 'Enable mobile version' }
      },
      required: ['name', 'folder', 'template']
    }
  },
  {
    name: 'mcp__marketo__landing_page_clone',
    description: 'Clone existing landing page.',
    inputSchema: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Source page ID' },
        name: { type: 'string', description: 'New page name' },
        folder: { type: 'object', description: 'Target folder' },
        description: { type: 'string' }
      },
      required: ['landingPageId', 'name', 'folder']
    }
  },
  {
    name: 'mcp__marketo__landing_page_approve',
    description: 'Approve landing page draft.',
    inputSchema: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Page ID' }
      },
      required: ['landingPageId']
    }
  },
  {
    name: 'mcp__marketo__landing_page_unapprove',
    description: 'Unapprove landing page.',
    inputSchema: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Page ID' }
      },
      required: ['landingPageId']
    }
  },
  {
    name: 'mcp__marketo__landing_page_get_content',
    description: 'Get landing page content sections.',
    inputSchema: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Page ID' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['landingPageId']
    }
  },
  {
    name: 'mcp__marketo__landing_page_template_list',
    description: 'List landing page templates.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'object', description: 'Folder filter' },
        status: { type: 'string', enum: ['draft', 'approved'] },
        maxReturn: { type: 'number' },
        offset: { type: 'number' }
      }
    }
  },
  {
    name: 'mcp__marketo__landing_page_delete',
    description: 'Delete landing page.',
    inputSchema: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Page ID' }
      },
      required: ['landingPageId']
    }
  }
];

/**
 * Execute landing page tool
 */
export async function executeLandingPageTool(toolName, args) {
  switch (toolName) {
    case 'mcp__marketo__landing_page_list':
      return await listLandingPages(args);
    case 'mcp__marketo__landing_page_get':
      return await getLandingPage(args);
    case 'mcp__marketo__landing_page_create':
      return await createLandingPage(args);
    case 'mcp__marketo__landing_page_clone':
      return await cloneLandingPage(args);
    case 'mcp__marketo__landing_page_approve':
      return await approveLandingPage(args);
    case 'mcp__marketo__landing_page_unapprove':
      return await unapproveLandingPage(args);
    case 'mcp__marketo__landing_page_get_content':
      return await getLandingPageContent(args);
    case 'mcp__marketo__landing_page_template_list':
      return await listLandingPageTemplates(args);
    case 'mcp__marketo__landing_page_delete':
      return await deleteLandingPage(args);
    default:
      throw new Error(`Unknown landing page tool: ${toolName}`);
  }
}

// Implementation functions
async function listLandingPages(args) {
  const { folder, status, maxReturn = 200, offset = 0 } = args;
  const params = new URLSearchParams();
  if (folder) params.append('folder', JSON.stringify(folder));
  if (status) params.append('status', status);
  params.append('maxReturn', maxReturn.toString());
  params.append('offset', offset.toString());

  const result = await apiRequest(`/rest/asset/v1/landingPages.json?${params}`);
  return { success: result.success, landingPages: result.result || [], moreResult: result.moreResult };
}

async function getLandingPage(args) {
  const { landingPageId, status } = args;
  const params = status ? `?status=${status}` : '';
  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}.json${params}`);
  return { success: result.success, landingPage: result.result?.[0] };
}

async function createLandingPage(args) {
  const { name, folder, template, title, description, keywords, robots, urlPageName, mobileEnabled = true } = args;
  const body = { name, folder, template, title, description, keywords, robots, urlPageName, mobileEnabled };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

  const result = await apiRequest('/rest/asset/v1/landingPages.json', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return { success: result.success, landingPage: result.result?.[0], message: `Landing page "${name}" created` };
}

async function cloneLandingPage(args) {
  const { landingPageId, name, folder, description } = args;
  const body = { name, folder, description };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/clone.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return { success: result.success, landingPage: result.result?.[0], message: `Landing page cloned as "${name}"` };
}

async function approveLandingPage(args) {
  const result = await apiRequest(`/rest/asset/v1/landingPage/${args.landingPageId}/approveDraft.json`, { method: 'POST' });
  return { success: result.success, landingPage: result.result?.[0], message: 'Landing page approved' };
}

async function unapproveLandingPage(args) {
  const result = await apiRequest(`/rest/asset/v1/landingPage/${args.landingPageId}/unapprove.json`, { method: 'POST' });
  return { success: result.success, landingPage: result.result?.[0], message: 'Landing page unapproved' };
}

async function getLandingPageContent(args) {
  const { landingPageId, status } = args;
  const params = status ? `?status=${status}` : '';
  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/content.json${params}`);
  return { success: result.success, content: result.result || [] };
}

async function listLandingPageTemplates(args) {
  const { folder, status, maxReturn = 200, offset = 0 } = args;
  const params = new URLSearchParams();
  if (folder) params.append('folder', JSON.stringify(folder));
  if (status) params.append('status', status);
  params.append('maxReturn', maxReturn.toString());
  params.append('offset', offset.toString());

  const result = await apiRequest(`/rest/asset/v1/landingPageTemplates.json?${params}`);
  return { success: result.success, templates: result.result || [], moreResult: result.moreResult };
}

async function deleteLandingPage(args) {
  const result = await apiRequest(`/rest/asset/v1/landingPage/${args.landingPageId}/delete.json`, { method: 'POST' });
  return { success: result.success, message: 'Landing page deleted' };
}

export default { landingPageTools, executeLandingPageTool };
