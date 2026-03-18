/**
 * Marketo Email MCP Tools
 *
 * Provides MCP tools for email asset operations:
 * - List/get email assets
 * - Create and clone emails
 * - Approve/unapprove emails
 * - Send sample emails
 * - Get email content and variables
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
 * List email assets
 */
export async function emailList({ folder, status, maxReturn = 200, offset = 0 }) {
  const params = new URLSearchParams();
  if (folder) params.append('folder', JSON.stringify(folder));
  if (status) params.append('status', status);
  params.append('maxReturn', maxReturn.toString());
  params.append('offset', offset.toString());

  const result = await apiRequest(`/rest/asset/v1/emails.json?${params}`);

  return {
    success: result.success,
    emails: result.result || [],
    moreResult: result.moreResult || false
  };
}

/**
 * Get email by ID
 */
export async function emailGet({ emailId, status }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/email/${emailId}.json?${params}`);

  if (!result.success || !result.result?.length) {
    throw new Error(`Email not found: ${emailId}`);
  }

  return {
    success: true,
    email: result.result[0]
  };
}

/**
 * Get email by name
 */
export async function emailGetByName({ name, folder, status }) {
  const params = new URLSearchParams();
  params.append('name', name);
  if (folder) params.append('folder', JSON.stringify(folder));
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/email/byName.json?${params}`);

  if (!result.success || !result.result?.length) {
    throw new Error(`Email not found: ${name}`);
  }

  return {
    success: true,
    email: result.result[0]
  };
}

/**
 * Create new email
 */
export async function emailCreate({ name, folder, template, description, subject, fromName, fromEmail, replyEmail, operational = false }) {
  const body = {
    name,
    folder: typeof folder === 'object' ? folder : { id: folder, type: 'Folder' },
    template: typeof template === 'object' ? template : { id: template, type: 'EmailTemplate' },
    description,
    subject,
    fromName,
    fromEmail,
    replyEmail,
    operational
  };

  // Remove undefined values
  Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);

  const result = await apiRequest('/rest/asset/v1/emails.json', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to create email: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    email: result.result[0],
    message: `Email "${name}" created successfully`
  };
}

/**
 * Clone existing email
 */
export async function emailClone({ emailId, name, folder, description, operational }) {
  const body = {
    name,
    folder: typeof folder === 'object' ? folder : { id: folder, type: 'Folder' },
    description,
    operational
  };

  Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);

  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/clone.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to clone email: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    email: result.result[0],
    message: `Email cloned as "${name}"`
  };
}

/**
 * Update email metadata
 */
export async function emailUpdate({ emailId, name, description, subject, fromName, fromEmail, replyEmail, operational }) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (description !== undefined) body.description = description;
  if (subject !== undefined) body.subject = subject;
  if (fromName !== undefined) body.fromName = fromName;
  if (fromEmail !== undefined) body.fromEmail = fromEmail;
  if (replyEmail !== undefined) body.replyEmail = replyEmail;
  if (operational !== undefined) body.operational = operational;

  const result = await apiRequest(`/rest/asset/v1/email/${emailId}.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to update email: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    email: result.result[0],
    message: 'Email updated successfully'
  };
}

/**
 * Get email content
 */
export async function emailGetContent({ emailId, status }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/content.json?${params}`);

  return {
    success: result.success,
    content: result.result || []
  };
}

/**
 * Update email content section
 */
export async function emailUpdateContent({ emailId, htmlId, type, value, textValue }) {
  const body = {
    htmlId,
    type,  // 'Text', 'DynamicContent', 'Snippet', 'HTML'
    value
  };
  if (textValue) body.textValue = textValue;

  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/content/${htmlId}.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to update content: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    message: `Content section "${htmlId}" updated`
  };
}

/**
 * Get email variables
 */
export async function emailGetVariables({ emailId, status }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/variables.json?${params}`);

  return {
    success: result.success,
    variables: result.result || []
  };
}

/**
 * Update email variable
 */
export async function emailUpdateVariable({ emailId, name, value, moduleId }) {
  const body = { value };
  if (moduleId) body.moduleId = moduleId;

  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/variable/${name}.json`, {
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
 * Approve email
 */
export async function emailApprove({ emailId }) {
  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/approveDraft.json`, {
    method: 'POST'
  });

  if (!result.success) {
    throw new Error(`Failed to approve email: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    email: result.result[0],
    message: 'Email approved successfully'
  };
}

/**
 * Unapprove email
 */
export async function emailUnapprove({ emailId }) {
  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/unapprove.json`, {
    method: 'POST'
  });

  if (!result.success) {
    throw new Error(`Failed to unapprove email: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    email: result.result[0],
    message: 'Email unapproved successfully'
  };
}

/**
 * Discard email draft
 */
export async function emailDiscardDraft({ emailId }) {
  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/discardDraft.json`, {
    method: 'POST'
  });

  if (!result.success) {
    throw new Error(`Failed to discard draft: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    message: 'Email draft discarded'
  };
}

/**
 * Send sample email
 */
export async function emailSendSample({ emailId, emailAddress, textOnly = false }) {
  const body = {
    emailAddress,
    textOnly
  };

  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/sendSample.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to send sample: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    message: `Sample email sent to ${emailAddress}`
  };
}

/**
 * Get email full content (HTML)
 */
export async function emailGetFullContent({ emailId, status, leadId }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (leadId) params.append('leadId', leadId.toString());

  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/fullContent.json?${params}`);

  return {
    success: result.success,
    htmlContent: result.result?.content,
    textContent: result.result?.textContent
  };
}

/**
 * Delete email
 */
export async function emailDelete({ emailId }) {
  const result = await apiRequest(`/rest/asset/v1/email/${emailId}/delete.json`, {
    method: 'POST'
  });

  if (!result.success) {
    throw new Error(`Failed to delete email: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    message: 'Email deleted successfully'
  };
}

/**
 * List email templates
 */
export async function emailTemplateList({ folder, status, maxReturn = 200, offset = 0 }) {
  const params = new URLSearchParams();
  if (folder) params.append('folder', JSON.stringify(folder));
  if (status) params.append('status', status);
  params.append('maxReturn', maxReturn.toString());
  params.append('offset', offset.toString());

  const result = await apiRequest(`/rest/asset/v1/emailTemplates.json?${params}`);

  return {
    success: result.success,
    templates: result.result || [],
    moreResult: result.moreResult || false
  };
}

/**
 * Get email template by ID
 */
export async function emailTemplateGet({ templateId, status }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/emailTemplate/${templateId}.json?${params}`);

  if (!result.success || !result.result?.length) {
    throw new Error(`Template not found: ${templateId}`);
  }

  return {
    success: true,
    template: result.result[0]
  };
}

/**
 * Get email template content
 */
export async function emailTemplateGetContent({ templateId, status }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/emailTemplate/${templateId}/content.json?${params}`);

  return {
    success: result.success,
    content: result.result?.content
  };
}

// Export all tools for MCP registration
export const emailTools = {
  mcp__marketo__email_list: {
    description: 'List email assets with optional filtering by folder and status',
    parameters: {
      type: 'object',
      properties: {
        folder: { type: 'object', description: 'Folder to filter by {id, type}' },
        status: { type: 'string', enum: ['draft', 'approved'], description: 'Email status filter' },
        maxReturn: { type: 'number', description: 'Max results (default 200)' },
        offset: { type: 'number', description: 'Pagination offset' }
      }
    },
    handler: emailList
  },
  mcp__marketo__email_get: {
    description: 'Get email asset by ID',
    parameters: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' },
        status: { type: 'string', enum: ['draft', 'approved'], description: 'Version to retrieve' }
      },
      required: ['emailId']
    },
    handler: emailGet
  },
  mcp__marketo__email_get_by_name: {
    description: 'Get email asset by name',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Email name' },
        folder: { type: 'object', description: 'Folder to search in' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['name']
    },
    handler: emailGetByName
  },
  mcp__marketo__email_create: {
    description: 'Create new email from template',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Email name' },
        folder: { type: 'object', description: 'Folder {id, type}' },
        template: { type: 'object', description: 'Template {id, type}' },
        description: { type: 'string' },
        subject: { type: 'string', description: 'Email subject line' },
        fromName: { type: 'string', description: 'From name' },
        fromEmail: { type: 'string', description: 'From email address' },
        replyEmail: { type: 'string', description: 'Reply-to address' },
        operational: { type: 'boolean', description: 'Operational email (ignores unsubscribe)' }
      },
      required: ['name', 'folder', 'template']
    },
    handler: emailCreate
  },
  mcp__marketo__email_clone: {
    description: 'Clone existing email',
    parameters: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Source email ID' },
        name: { type: 'string', description: 'New email name' },
        folder: { type: 'object', description: 'Target folder' },
        description: { type: 'string' },
        operational: { type: 'boolean' }
      },
      required: ['emailId', 'name', 'folder']
    },
    handler: emailClone
  },
  mcp__marketo__email_update: {
    description: 'Update email metadata',
    parameters: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' },
        name: { type: 'string' },
        description: { type: 'string' },
        subject: { type: 'string' },
        fromName: { type: 'string' },
        fromEmail: { type: 'string' },
        replyEmail: { type: 'string' },
        operational: { type: 'boolean' }
      },
      required: ['emailId']
    },
    handler: emailUpdate
  },
  mcp__marketo__email_get_content: {
    description: 'Get email content sections',
    parameters: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['emailId']
    },
    handler: emailGetContent
  },
  mcp__marketo__email_update_content: {
    description: 'Update email content section',
    parameters: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' },
        htmlId: { type: 'string', description: 'Content section ID' },
        type: { type: 'string', enum: ['Text', 'DynamicContent', 'Snippet', 'HTML'] },
        value: { type: 'string', description: 'Content value' },
        textValue: { type: 'string', description: 'Plain text alternative' }
      },
      required: ['emailId', 'htmlId', 'type', 'value']
    },
    handler: emailUpdateContent
  },
  mcp__marketo__email_approve: {
    description: 'Approve email draft',
    parameters: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' }
      },
      required: ['emailId']
    },
    handler: emailApprove
  },
  mcp__marketo__email_unapprove: {
    description: 'Unapprove email (create draft)',
    parameters: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' }
      },
      required: ['emailId']
    },
    handler: emailUnapprove
  },
  mcp__marketo__email_send_sample: {
    description: 'Send sample email to specified address',
    parameters: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' },
        emailAddress: { type: 'string', description: 'Recipient email' },
        textOnly: { type: 'boolean', description: 'Send text version only' }
      },
      required: ['emailId', 'emailAddress']
    },
    handler: emailSendSample
  },
  mcp__marketo__email_delete: {
    description: 'Delete email asset',
    parameters: {
      type: 'object',
      properties: {
        emailId: { type: 'number', description: 'Email ID' }
      },
      required: ['emailId']
    },
    handler: emailDelete
  },
  mcp__marketo__email_template_list: {
    description: 'List email templates',
    parameters: {
      type: 'object',
      properties: {
        folder: { type: 'object', description: 'Folder filter' },
        status: { type: 'string', enum: ['draft', 'approved'] },
        maxReturn: { type: 'number' },
        offset: { type: 'number' }
      }
    },
    handler: emailTemplateList
  },
  mcp__marketo__email_template_get: {
    description: 'Get email template by ID',
    parameters: {
      type: 'object',
      properties: {
        templateId: { type: 'number', description: 'Template ID' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['templateId']
    },
    handler: emailTemplateGet
  }
};
