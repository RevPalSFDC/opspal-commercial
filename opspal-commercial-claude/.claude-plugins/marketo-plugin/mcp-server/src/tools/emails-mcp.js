/**
 * Marketo Email Tools (MCP Compatible)
 *
 * MCP tools for email asset operations in Marketo.
 *
 * @module emails-mcp
 * @version 1.0.0
 */

import { apiRequest } from '../auth/oauth-handler.js';

/**
 * Email tool definitions for MCP
 */
export const emailTools = [
  {
    name: 'mcp__marketo__email_list',
    description: 'List email assets with optional filtering by folder and status.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'object', description: 'Folder to filter by {id, type}' },
        status: { type: 'string', enum: ['draft', 'approved'], description: 'Email status filter' },
        maxReturn: { type: 'number', description: 'Max results (default 200)' },
        offset: { type: 'number', description: 'Pagination offset' }
      }
    }
  },
  {
    name: 'mcp__marketo__email_get',
    description: 'Get email asset by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' },
        status: { type: 'string', enum: ['draft', 'approved'], description: 'Version to retrieve' }
      },
      required: ['emailId']
    }
  },
  {
    name: 'mcp__marketo__email_create',
    description: 'Create new email from template.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Email name' },
        folder: { type: 'object', description: 'Folder {id, type}' },
        template: { type: 'number', description: 'Template ID' },
        description: { type: 'string' },
        subject: { type: 'string', description: 'Email subject line' },
        fromName: { type: 'string', description: 'From name' },
        fromEmail: { type: 'string', description: 'From email address' },
        replyEmail: { type: 'string', description: 'Reply-to address' },
        operational: { type: 'boolean', description: 'Operational email (ignores unsubscribe)' }
      },
      required: ['name', 'folder', 'template']
    }
  },
  {
    name: 'mcp__marketo__email_clone',
    description: 'Clone existing email.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Source email ID' },
        name: { type: 'string', description: 'New email name' },
        folder: { type: 'object', description: 'Target folder' },
        description: { type: 'string' }
      },
      required: ['emailId', 'name', 'folder']
    }
  },
  {
    name: 'mcp__marketo__email_approve',
    description: 'Approve email draft.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' }
      },
      required: ['emailId']
    }
  },
  {
    name: 'mcp__marketo__email_unapprove',
    description: 'Unapprove email (create draft).',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' }
      },
      required: ['emailId']
    }
  },
  {
    name: 'mcp__marketo__email_send_sample',
    description: 'Send sample email to specified address.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' },
        emailAddress: { type: 'string', description: 'Recipient email' },
        textOnly: { type: 'boolean', description: 'Send text version only' }
      },
      required: ['emailId', 'emailAddress']
    }
  },
  {
    name: 'mcp__marketo__email_get_content',
    description: 'Get email content sections.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['emailId']
    }
  },
  {
    name: 'mcp__marketo__email_template_list',
    description: 'List email templates.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'object', description: 'Folder filter' },
        status: { type: 'string', enum: ['draft', 'approved'] },
        maxReturn: { type: 'number' },
        offset: { type: 'number' }
      }
    }
  }
];

/**
 * Execute email tool
 */
export async function executeEmailTool(toolName, args) {
  switch (toolName) {
    case 'mcp__marketo__email_list':
      return await listEmails(args);
    case 'mcp__marketo__email_get':
      return await getEmail(args);
    case 'mcp__marketo__email_create':
      return await createEmail(args);
    case 'mcp__marketo__email_clone':
      return await cloneEmail(args);
    case 'mcp__marketo__email_approve':
      return await approveEmail(args);
    case 'mcp__marketo__email_unapprove':
      return await unapproveEmail(args);
    case 'mcp__marketo__email_send_sample':
      return await sendSampleEmail(args);
    case 'mcp__marketo__email_get_content':
      return await getEmailContent(args);
    case 'mcp__marketo__email_template_list':
      return await listEmailTemplates(args);
    default:
      throw new Error(`Unknown email tool: ${toolName}`);
  }
}

// Implementation functions
async function listEmails(args) {
  const { folder, status, maxReturn = 200, offset = 0 } = args;
  const params = new URLSearchParams();
  if (folder) params.append('folder', JSON.stringify(folder));
  if (status) params.append('status', status);
  params.append('maxReturn', maxReturn.toString());
  params.append('offset', offset.toString());

  const result = await apiRequest(`/rest/asset/v1/emails.json?${params}`);
  return { success: result.success, emails: result.result || [], moreResult: result.moreResult };
}

async function getEmail(args) {
  const { emailId, status } = args;
  const params = status ? `?status=${status}` : '';
  const result = await apiRequest(`/rest/asset/v1/email/${emailId}.json${params}`);
  return { success: result.success, email: result.result?.[0] };
}

async function createEmail(args) {
  const { name, folder, template, description, subject, fromName, fromEmail, replyEmail, operational } = args;
  const body = { name, folder, template, description, subject, fromName, fromEmail, replyEmail, operational };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

  const result = await apiRequest('/rest/asset/v1/emails.json', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return { success: result.success, email: result.result?.[0], message: `Email "${name}" created` };
}

async function cloneEmail(args) {
  const { emailId, name, folder, description } = args;
  const body = { name, folder, description };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/clone.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return { success: result.success, email: result.result?.[0], message: `Email cloned as "${name}"` };
}

async function approveEmail(args) {
  const result = await apiRequest(`/rest/asset/v1/email/${args.emailId}/approveDraft.json`, { method: 'POST' });
  return { success: result.success, email: result.result?.[0], message: 'Email approved' };
}

async function unapproveEmail(args) {
  const result = await apiRequest(`/rest/asset/v1/email/${args.emailId}/unapprove.json`, { method: 'POST' });
  return { success: result.success, email: result.result?.[0], message: 'Email unapproved' };
}

async function sendSampleEmail(args) {
  const { emailId, emailAddress, textOnly = false } = args;
  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/sendSample.json`, {
    method: 'POST',
    body: JSON.stringify({ emailAddress, textOnly })
  });
  return { success: result.success, message: `Sample sent to ${emailAddress}` };
}

async function getEmailContent(args) {
  const { emailId, status } = args;
  const params = status ? `?status=${status}` : '';
  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/content.json${params}`);
  return { success: result.success, content: result.result || [] };
}

async function listEmailTemplates(args) {
  const { folder, status, maxReturn = 200, offset = 0 } = args;
  const params = new URLSearchParams();
  if (folder) params.append('folder', JSON.stringify(folder));
  if (status) params.append('status', status);
  params.append('maxReturn', maxReturn.toString());
  params.append('offset', offset.toString());

  const result = await apiRequest(`/rest/asset/v1/emailTemplates.json?${params}`);
  return { success: result.success, templates: result.result || [], moreResult: result.moreResult };
}

export default { emailTools, executeEmailTool };
