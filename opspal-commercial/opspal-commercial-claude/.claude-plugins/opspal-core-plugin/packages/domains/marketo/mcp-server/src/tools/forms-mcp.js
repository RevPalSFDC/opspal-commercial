/**
 * Marketo Form Tools (MCP Compatible)
 *
 * MCP tools for form operations in Marketo.
 *
 * @module forms-mcp
 * @version 1.0.0
 */

import { apiRequest } from '../auth/oauth-handler.js';

/**
 * Form tool definitions for MCP
 */
export const formTools = [
  {
    name: 'mcp__marketo__form_list',
    description: 'List forms with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'object', description: 'Folder filter {id, type}' },
        status: { type: 'string', enum: ['draft', 'approved'] },
        maxReturn: { type: 'number', description: 'Max results (default 200)' },
        offset: { type: 'number', description: 'Pagination offset' }
      }
    }
  },
  {
    name: 'mcp__marketo__form_get',
    description: 'Get form by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['formId']
    }
  },
  {
    name: 'mcp__marketo__form_create',
    description: 'Create new form.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Form name' },
        folder: { type: 'object', description: 'Folder {id, type}' },
        description: { type: 'string' },
        language: { type: 'string', description: 'Form language (default English)' },
        locale: { type: 'string', description: 'Locale code (default en_US)' },
        theme: { type: 'string', description: 'Form theme' },
        labelPosition: { type: 'string', enum: ['left', 'above'], description: 'Field label position' }
      },
      required: ['name', 'folder']
    }
  },
  {
    name: 'mcp__marketo__form_clone',
    description: 'Clone existing form.',
    inputSchema: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Source form ID' },
        name: { type: 'string', description: 'New form name' },
        folder: { type: 'object', description: 'Target folder' },
        description: { type: 'string' }
      },
      required: ['formId', 'name', 'folder']
    }
  },
  {
    name: 'mcp__marketo__form_get_fields',
    description: 'Get form fields.',
    inputSchema: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['formId']
    }
  },
  {
    name: 'mcp__marketo__form_add_field',
    description: 'Add field to form.',
    inputSchema: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' },
        fieldId: { type: 'string', description: 'Lead field API name' },
        label: { type: 'string', description: 'Field label' },
        required: { type: 'boolean', description: 'Is field required' },
        hintText: { type: 'string', description: 'Placeholder text' },
        defaultValue: { type: 'string', description: 'Default value' }
      },
      required: ['formId', 'fieldId']
    }
  },
  {
    name: 'mcp__marketo__form_approve',
    description: 'Approve form draft.',
    inputSchema: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' }
      },
      required: ['formId']
    }
  },
  {
    name: 'mcp__marketo__form_delete',
    description: 'Delete form.',
    inputSchema: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' }
      },
      required: ['formId']
    }
  },
  {
    name: 'mcp__marketo__form_submit',
    description: 'Submit form data externally.',
    inputSchema: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' },
        leadFormFields: {
          type: 'array',
          description: 'Array of field values [{id, value}]',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              value: { type: 'string' }
            }
          }
        },
        cookie: { type: 'string', description: 'Optional Munchkin cookie' }
      },
      required: ['formId', 'leadFormFields']
    }
  },
  {
    name: 'mcp__marketo__form_available_fields',
    description: 'Get available fields that can be added to forms.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * Execute form tool
 */
export async function executeFormTool(toolName, args) {
  switch (toolName) {
    case 'mcp__marketo__form_list':
      return await listForms(args);
    case 'mcp__marketo__form_get':
      return await getForm(args);
    case 'mcp__marketo__form_create':
      return await createForm(args);
    case 'mcp__marketo__form_clone':
      return await cloneForm(args);
    case 'mcp__marketo__form_get_fields':
      return await getFormFields(args);
    case 'mcp__marketo__form_add_field':
      return await addFormField(args);
    case 'mcp__marketo__form_approve':
      return await approveForm(args);
    case 'mcp__marketo__form_delete':
      return await deleteForm(args);
    case 'mcp__marketo__form_submit':
      return await submitForm(args);
    case 'mcp__marketo__form_available_fields':
      return await getAvailableFields();
    default:
      throw new Error(`Unknown form tool: ${toolName}`);
  }
}

// Implementation functions
async function listForms(args) {
  const { folder, status, maxReturn = 200, offset = 0 } = args;
  const params = new URLSearchParams();
  if (folder) params.append('folder', JSON.stringify(folder));
  if (status) params.append('status', status);
  params.append('maxReturn', maxReturn.toString());
  params.append('offset', offset.toString());

  const result = await apiRequest(`/rest/asset/v1/forms.json?${params}`);
  return { success: result.success, forms: result.result || [], moreResult: result.moreResult };
}

async function getForm(args) {
  const { formId, status } = args;
  const params = status ? `?status=${status}` : '';
  const result = await apiRequest(`/rest/asset/v1/form/${formId}.json${params}`);
  return { success: result.success, form: result.result?.[0] };
}

async function createForm(args) {
  const { name, folder, description, language = 'English', locale = 'en_US', theme = 'simple', labelPosition = 'left' } = args;
  const body = { name, folder, description, language, locale, theme, labelPosition };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

  const result = await apiRequest('/rest/asset/v1/forms.json', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return { success: result.success, form: result.result?.[0], message: `Form "${name}" created` };
}

async function cloneForm(args) {
  const { formId, name, folder, description } = args;
  const body = { name, folder, description };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

  const result = await apiRequest(`/rest/asset/v1/form/${formId}/clone.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return { success: result.success, form: result.result?.[0], message: `Form cloned as "${name}"` };
}

async function getFormFields(args) {
  const { formId, status } = args;
  const params = status ? `?status=${status}` : '';
  const result = await apiRequest(`/rest/asset/v1/form/${formId}/fields.json${params}`);
  return { success: result.success, fields: result.result || [] };
}

async function addFormField(args) {
  const { formId, fieldId, label, required, hintText, defaultValue } = args;
  const body = { fieldId, label, required, hintText, defaultValue };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

  const result = await apiRequest(`/rest/asset/v1/form/${formId}/fields.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return { success: result.success, field: result.result?.[0], message: `Field "${fieldId}" added` };
}

async function approveForm(args) {
  const result = await apiRequest(`/rest/asset/v1/form/${args.formId}/approveDraft.json`, { method: 'POST' });
  return { success: result.success, form: result.result?.[0], message: 'Form approved' };
}

async function deleteForm(args) {
  const result = await apiRequest(`/rest/asset/v1/form/${args.formId}/delete.json`, { method: 'POST' });
  return { success: result.success, message: 'Form deleted' };
}

async function submitForm(args) {
  const { formId, leadFormFields, cookie } = args;
  const body = { formId, leadFormFields, cookie };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

  const result = await apiRequest('/rest/v1/leads/submitForm.json', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return { success: result.success, result: result.result?.[0], message: 'Form submitted' };
}

async function getAvailableFields() {
  const result = await apiRequest('/rest/asset/v1/form/fields.json');
  return { success: result.success, fields: result.result || [] };
}

export default { formTools, executeFormTool };
