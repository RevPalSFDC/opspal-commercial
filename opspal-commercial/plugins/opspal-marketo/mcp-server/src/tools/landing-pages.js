/**
 * Marketo Landing Page MCP Tools
 *
 * Provides MCP tools for landing page operations:
 * - List/get landing pages
 * - Create and clone landing pages
 * - Approve/unapprove pages
 * - Manage page content
 * - Get/update variables
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
 * List landing pages
 */
export async function landingPageList({ folder, status, maxReturn = 200, offset = 0 }) {
  const params = new URLSearchParams();
  if (folder) params.append('folder', JSON.stringify(folder));
  if (status) params.append('status', status);
  params.append('maxReturn', maxReturn.toString());
  params.append('offset', offset.toString());

  const result = await apiRequest(`/rest/asset/v1/landingPages.json?${params}`);

  return {
    success: result.success,
    landingPages: result.result || [],
    moreResult: result.moreResult || false
  };
}

/**
 * Get landing page by ID
 */
export async function landingPageGet({ landingPageId, status }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}.json?${params}`);

  if (!result.success || !result.result?.length) {
    throw new Error(`Landing page not found: ${landingPageId}`);
  }

  return {
    success: true,
    landingPage: result.result[0]
  };
}

/**
 * Get landing page by name
 */
export async function landingPageGetByName({ name, folder, status }) {
  const params = new URLSearchParams();
  params.append('name', name);
  if (folder) params.append('folder', JSON.stringify(folder));
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/landingPage/byName.json?${params}`);

  if (!result.success || !result.result?.length) {
    throw new Error(`Landing page not found: ${name}`);
  }

  return {
    success: true,
    landingPage: result.result[0]
  };
}

/**
 * Create new landing page
 */
export async function landingPageCreate({
  name,
  folder,
  template,
  description,
  title,
  keywords,
  robots,
  customHeadHTML,
  facebookOgTags,
  urlPageName,
  mobileEnabled = true
}) {
  const body = {
    name,
    folder: typeof folder === 'object' ? folder : { id: folder, type: 'Folder' },
    template: typeof template === 'object' ? template : { id: template, type: 'LandingPageTemplate' },
    description,
    title,
    keywords,
    robots,
    customHeadHTML,
    facebookOgTags,
    urlPageName,
    mobileEnabled
  };

  // Remove undefined values
  Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);

  const result = await apiRequest('/rest/asset/v1/landingPages.json', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to create landing page: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    landingPage: result.result[0],
    message: `Landing page "${name}" created successfully`
  };
}

/**
 * Clone existing landing page
 */
export async function landingPageClone({ landingPageId, name, folder, description, template }) {
  const body = {
    name,
    folder: typeof folder === 'object' ? folder : { id: folder, type: 'Folder' },
    description,
    template
  };

  Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);

  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/clone.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to clone landing page: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    landingPage: result.result[0],
    message: `Landing page cloned as "${name}"`
  };
}

/**
 * Update landing page metadata
 */
export async function landingPageUpdate({
  landingPageId,
  name,
  description,
  title,
  keywords,
  robots,
  customHeadHTML,
  facebookOgTags,
  urlPageName,
  mobileEnabled
}) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (description !== undefined) body.description = description;
  if (title !== undefined) body.title = title;
  if (keywords !== undefined) body.keywords = keywords;
  if (robots !== undefined) body.robots = robots;
  if (customHeadHTML !== undefined) body.customHeadHTML = customHeadHTML;
  if (facebookOgTags !== undefined) body.facebookOgTags = facebookOgTags;
  if (urlPageName !== undefined) body.urlPageName = urlPageName;
  if (mobileEnabled !== undefined) body.mobileEnabled = mobileEnabled;

  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to update landing page: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    landingPage: result.result[0],
    message: 'Landing page updated successfully'
  };
}

/**
 * Get landing page content
 */
export async function landingPageGetContent({ landingPageId, status }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/content.json?${params}`);

  return {
    success: result.success,
    content: result.result || []
  };
}

/**
 * Update landing page content section
 */
export async function landingPageUpdateContent({ landingPageId, id, type, value, index }) {
  const body = {
    id,
    type,  // 'Text', 'DynamicContent', 'Form', 'Image', 'Rectangle', etc.
    value
  };
  if (index !== undefined) body.index = index;

  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/content/${id}.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to update content: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    message: `Content section "${id}" updated`
  };
}

/**
 * Add content section to landing page
 */
export async function landingPageAddContent({ landingPageId, type, value }) {
  const body = { type, value };

  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/content.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to add content: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    content: result.result[0],
    message: 'Content section added'
  };
}

/**
 * Delete content section from landing page
 */
export async function landingPageDeleteContent({ landingPageId, id }) {
  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/content/${id}/delete.json`, {
    method: 'POST'
  });

  if (!result.success) {
    throw new Error(`Failed to delete content: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    message: `Content section "${id}" deleted`
  };
}

/**
 * Get landing page variables
 */
export async function landingPageGetVariables({ landingPageId, status }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/variables.json?${params}`);

  return {
    success: result.success,
    variables: result.result || []
  };
}

/**
 * Update landing page variable
 */
export async function landingPageUpdateVariable({ landingPageId, name, value }) {
  const body = { value };

  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/variable/${name}.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to update variable: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    variable: result.result[0],
    message: `Variable "${name}" updated`
  };
}

/**
 * Approve landing page
 */
export async function landingPageApprove({ landingPageId }) {
  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/approveDraft.json`, {
    method: 'POST'
  });

  if (!result.success) {
    throw new Error(`Failed to approve landing page: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    landingPage: result.result[0],
    message: 'Landing page approved successfully'
  };
}

/**
 * Unapprove landing page
 */
export async function landingPageUnapprove({ landingPageId }) {
  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/unapprove.json`, {
    method: 'POST'
  });

  if (!result.success) {
    throw new Error(`Failed to unapprove landing page: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    landingPage: result.result[0],
    message: 'Landing page unapproved successfully'
  };
}

/**
 * Discard landing page draft
 */
export async function landingPageDiscardDraft({ landingPageId }) {
  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/discardDraft.json`, {
    method: 'POST'
  });

  if (!result.success) {
    throw new Error(`Failed to discard draft: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    message: 'Landing page draft discarded'
  };
}

/**
 * Get landing page full content (rendered HTML)
 */
export async function landingPageGetFullContent({ landingPageId, status, leadId, segmentation }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (leadId) params.append('leadId', leadId.toString());
  if (segmentation) params.append('segmentation', segmentation);

  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/fullContent.json?${params}`);

  return {
    success: result.success,
    content: result.result?.content
  };
}

/**
 * Delete landing page
 */
export async function landingPageDelete({ landingPageId }) {
  const result = await apiRequest(`/rest/asset/v1/landingPage/${landingPageId}/delete.json`, {
    method: 'POST'
  });

  if (!result.success) {
    throw new Error(`Failed to delete landing page: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    message: 'Landing page deleted successfully'
  };
}

/**
 * List landing page templates
 */
export async function landingPageTemplateList({ folder, status, maxReturn = 200, offset = 0 }) {
  const params = new URLSearchParams();
  if (folder) params.append('folder', JSON.stringify(folder));
  if (status) params.append('status', status);
  params.append('maxReturn', maxReturn.toString());
  params.append('offset', offset.toString());

  const result = await apiRequest(`/rest/asset/v1/landingPageTemplates.json?${params}`);

  return {
    success: result.success,
    templates: result.result || [],
    moreResult: result.moreResult || false
  };
}

/**
 * Get landing page template by ID
 */
export async function landingPageTemplateGet({ templateId, status }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/landingPageTemplate/${templateId}.json?${params}`);

  if (!result.success || !result.result?.length) {
    throw new Error(`Template not found: ${templateId}`);
  }

  return {
    success: true,
    template: result.result[0]
  };
}

/**
 * Get landing page template content
 */
export async function landingPageTemplateGetContent({ templateId, status }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/landingPageTemplate/${templateId}/content.json?${params}`);

  return {
    success: result.success,
    content: result.result?.content
  };
}

/**
 * Get landing page redirect rules
 */
export async function landingPageRedirectRules({ maxReturn = 200, offset = 0 }) {
  const params = new URLSearchParams();
  params.append('maxReturn', maxReturn.toString());
  params.append('offset', offset.toString());

  const result = await apiRequest(`/rest/asset/v1/redirectRules.json?${params}`);

  return {
    success: result.success,
    rules: result.result || [],
    moreResult: result.moreResult || false
  };
}

// Export all tools for MCP registration
export const landingPageTools = {
  mcp__marketo__landing_page_list: {
    description: 'List landing pages with optional filtering',
    parameters: {
      type: 'object',
      properties: {
        folder: { type: 'object', description: 'Folder filter {id, type}' },
        status: { type: 'string', enum: ['draft', 'approved'], description: 'Page status' },
        maxReturn: { type: 'number', description: 'Max results (default 200)' },
        offset: { type: 'number', description: 'Pagination offset' }
      }
    },
    handler: landingPageList
  },
  mcp__marketo__landing_page_get: {
    description: 'Get landing page by ID',
    parameters: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Landing page ID' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['landingPageId']
    },
    handler: landingPageGet
  },
  mcp__marketo__landing_page_get_by_name: {
    description: 'Get landing page by name',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Landing page name' },
        folder: { type: 'object', description: 'Folder to search' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['name']
    },
    handler: landingPageGetByName
  },
  mcp__marketo__landing_page_create: {
    description: 'Create new landing page from template',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Page name' },
        folder: { type: 'object', description: 'Folder {id, type}' },
        template: { type: 'object', description: 'Template {id, type}' },
        description: { type: 'string' },
        title: { type: 'string', description: 'Page title for browser' },
        keywords: { type: 'string', description: 'SEO keywords' },
        robots: { type: 'string', description: 'Robots meta directive' },
        customHeadHTML: { type: 'string', description: 'Custom HTML for <head>' },
        urlPageName: { type: 'string', description: 'URL slug' },
        mobileEnabled: { type: 'boolean', description: 'Enable mobile version' }
      },
      required: ['name', 'folder', 'template']
    },
    handler: landingPageCreate
  },
  mcp__marketo__landing_page_clone: {
    description: 'Clone existing landing page',
    parameters: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Source page ID' },
        name: { type: 'string', description: 'New page name' },
        folder: { type: 'object', description: 'Target folder' },
        description: { type: 'string' }
      },
      required: ['landingPageId', 'name', 'folder']
    },
    handler: landingPageClone
  },
  mcp__marketo__landing_page_update: {
    description: 'Update landing page metadata',
    parameters: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Page ID' },
        name: { type: 'string' },
        description: { type: 'string' },
        title: { type: 'string' },
        keywords: { type: 'string' },
        robots: { type: 'string' },
        customHeadHTML: { type: 'string' },
        urlPageName: { type: 'string' },
        mobileEnabled: { type: 'boolean' }
      },
      required: ['landingPageId']
    },
    handler: landingPageUpdate
  },
  mcp__marketo__landing_page_get_content: {
    description: 'Get landing page content sections',
    parameters: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Page ID' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['landingPageId']
    },
    handler: landingPageGetContent
  },
  mcp__marketo__landing_page_update_content: {
    description: 'Update landing page content section',
    parameters: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Page ID' },
        id: { type: 'string', description: 'Content section ID' },
        type: { type: 'string', description: 'Content type (Text, Form, Image, etc.)' },
        value: { type: 'string', description: 'Content value' },
        index: { type: 'number', description: 'Position index' }
      },
      required: ['landingPageId', 'id', 'type', 'value']
    },
    handler: landingPageUpdateContent
  },
  mcp__marketo__landing_page_approve: {
    description: 'Approve landing page draft',
    parameters: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Page ID' }
      },
      required: ['landingPageId']
    },
    handler: landingPageApprove
  },
  mcp__marketo__landing_page_unapprove: {
    description: 'Unapprove landing page',
    parameters: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Page ID' }
      },
      required: ['landingPageId']
    },
    handler: landingPageUnapprove
  },
  mcp__marketo__landing_page_delete: {
    description: 'Delete landing page',
    parameters: {
      type: 'object',
      properties: {
        landingPageId: { type: 'number', description: 'Page ID' }
      },
      required: ['landingPageId']
    },
    handler: landingPageDelete
  },
  mcp__marketo__landing_page_template_list: {
    description: 'List landing page templates',
    parameters: {
      type: 'object',
      properties: {
        folder: { type: 'object', description: 'Folder filter' },
        status: { type: 'string', enum: ['draft', 'approved'] },
        maxReturn: { type: 'number' },
        offset: { type: 'number' }
      }
    },
    handler: landingPageTemplateList
  },
  mcp__marketo__landing_page_template_get: {
    description: 'Get landing page template by ID',
    parameters: {
      type: 'object',
      properties: {
        templateId: { type: 'number', description: 'Template ID' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['templateId']
    },
    handler: landingPageTemplateGet
  }
};
