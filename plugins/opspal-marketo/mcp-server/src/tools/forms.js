/**
 * Marketo Form MCP Tools
 *
 * Provides MCP tools for form operations:
 * - List/get forms
 * - Get form fields
 * - Submit form data
 * - Manage form visibility rules
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
 * List forms
 */
export async function formList({ folder, status, maxReturn = 200, offset = 0 }) {
  const params = new URLSearchParams();
  if (folder) params.append('folder', JSON.stringify(folder));
  if (status) params.append('status', status);
  params.append('maxReturn', maxReturn.toString());
  params.append('offset', offset.toString());

  const result = await apiRequest(`/rest/asset/v1/forms.json?${params}`);

  return {
    success: result.success,
    forms: result.result || [],
    moreResult: result.moreResult || false
  };
}

/**
 * Get form by ID
 */
export async function formGet({ formId, status }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/form/${formId}.json?${params}`);

  if (!result.success || !result.result?.length) {
    throw new Error(`Form not found: ${formId}`);
  }

  return {
    success: true,
    form: result.result[0]
  };
}

/**
 * Get form by name
 */
export async function formGetByName({ name, folder, status }) {
  const params = new URLSearchParams();
  params.append('name', name);
  if (folder) params.append('folder', JSON.stringify(folder));
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/form/byName.json?${params}`);

  if (!result.success || !result.result?.length) {
    throw new Error(`Form not found: ${name}`);
  }

  return {
    success: true,
    form: result.result[0]
  };
}

/**
 * Create new form
 */
export async function formCreate({ name, folder, description, language = 'English', locale = 'en_US', theme = 'simple', labelPosition = 'left' }) {
  const body = {
    name,
    folder: typeof folder === 'object' ? folder : { id: folder, type: 'Folder' },
    description,
    language,
    locale,
    theme,
    labelPosition
  };

  Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);

  const result = await apiRequest('/rest/asset/v1/forms.json', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to create form: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    form: result.result[0],
    message: `Form "${name}" created successfully`
  };
}

/**
 * Clone existing form
 */
export async function formClone({ formId, name, folder, description }) {
  const body = {
    name,
    folder: typeof folder === 'object' ? folder : { id: folder, type: 'Folder' },
    description
  };

  Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);

  const result = await apiRequest(`/rest/asset/v1/form/${formId}/clone.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to clone form: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    form: result.result[0],
    message: `Form cloned as "${name}"`
  };
}

/**
 * Update form metadata
 */
export async function formUpdate({ formId, name, description, language, locale, theme, labelPosition }) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (description !== undefined) body.description = description;
  if (language !== undefined) body.language = language;
  if (locale !== undefined) body.locale = locale;
  if (theme !== undefined) body.theme = theme;
  if (labelPosition !== undefined) body.labelPosition = labelPosition;

  const result = await apiRequest(`/rest/asset/v1/form/${formId}.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to update form: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    form: result.result[0],
    message: 'Form updated successfully'
  };
}

/**
 * Get form fields
 */
export async function formGetFields({ formId, status }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/form/${formId}/fields.json?${params}`);

  return {
    success: result.success,
    fields: result.result || []
  };
}

/**
 * Add field to form
 */
export async function formAddField({ formId, fieldId, label, labelWidth, fieldWidth, required, multiSelect, instructions, hintText, defaultValue, validationMessage }) {
  const body = {
    fieldId,  // Lead field API name
    label,
    labelWidth,
    fieldWidth,
    required,
    multiSelect,
    instructions,
    hintText,
    defaultValue,
    validationMessage
  };

  Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);

  const result = await apiRequest(`/rest/asset/v1/form/${formId}/fields.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to add field: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    field: result.result[0],
    message: `Field "${fieldId}" added to form`
  };
}

/**
 * Update form field
 */
export async function formUpdateField({ formId, fieldId, label, labelWidth, fieldWidth, required, multiSelect, instructions, hintText, defaultValue, validationMessage }) {
  const body = {};
  if (label !== undefined) body.label = label;
  if (labelWidth !== undefined) body.labelWidth = labelWidth;
  if (fieldWidth !== undefined) body.fieldWidth = fieldWidth;
  if (required !== undefined) body.required = required;
  if (multiSelect !== undefined) body.multiSelect = multiSelect;
  if (instructions !== undefined) body.instructions = instructions;
  if (hintText !== undefined) body.hintText = hintText;
  if (defaultValue !== undefined) body.defaultValue = defaultValue;
  if (validationMessage !== undefined) body.validationMessage = validationMessage;

  const result = await apiRequest(`/rest/asset/v1/form/${formId}/field/${fieldId}.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to update field: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    field: result.result[0],
    message: `Field "${fieldId}" updated`
  };
}

/**
 * Delete field from form
 */
export async function formDeleteField({ formId, fieldId }) {
  const result = await apiRequest(`/rest/asset/v1/form/${formId}/field/${fieldId}/delete.json`, {
    method: 'POST'
  });

  if (!result.success) {
    throw new Error(`Failed to delete field: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    message: `Field "${fieldId}" deleted from form`
  };
}

/**
 * Reorder form fields
 */
export async function formReorderFields({ formId, fieldList }) {
  // fieldList is array of field positions: [{column, row, fieldId}, ...]
  const body = { fieldList };

  const result = await apiRequest(`/rest/asset/v1/form/${formId}/reArrange.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to reorder fields: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    message: 'Form fields reordered'
  };
}

/**
 * Add fieldset to form
 */
export async function formAddFieldset({ formId, label }) {
  const body = { label };

  const result = await apiRequest(`/rest/asset/v1/form/${formId}/fieldSet.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to add fieldset: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    fieldset: result.result[0],
    message: `Fieldset "${label}" added`
  };
}

/**
 * Add rich text block to form
 */
export async function formAddRichText({ formId, text }) {
  const body = { text };

  const result = await apiRequest(`/rest/asset/v1/form/${formId}/richText.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to add rich text: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    richText: result.result[0],
    message: 'Rich text block added'
  };
}

/**
 * Get visibility rules for form field
 */
export async function formGetVisibilityRules({ formId, fieldId }) {
  const result = await apiRequest(`/rest/asset/v1/form/${formId}/field/${fieldId}/visibility.json`);

  return {
    success: result.success,
    rules: result.result || []
  };
}

/**
 * Add visibility rule to form field
 */
export async function formAddVisibilityRule({ formId, fieldId, ruleType, targetField, operator, values, altLabel }) {
  const body = {
    ruleType,  // 'show' or 'hide'
    targetField,
    operator,  // 'is', 'isNot', 'contains', 'startsWith', etc.
    values,    // Array of values
    altLabel
  };

  const result = await apiRequest(`/rest/asset/v1/form/${formId}/field/${fieldId}/visibility.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to add visibility rule: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    rule: result.result[0],
    message: 'Visibility rule added'
  };
}

/**
 * Get submit button configuration
 */
export async function formGetSubmitButton({ formId }) {
  const result = await apiRequest(`/rest/asset/v1/form/${formId}/submit.json`);

  return {
    success: result.success,
    submitButton: result.result ? result.result[0] : null
  };
}

/**
 * Update submit button
 */
export async function formUpdateSubmitButton({ formId, label, waitingLabel }) {
  const body = {};
  if (label !== undefined) body.label = label;
  if (waitingLabel !== undefined) body.waitingLabel = waitingLabel;

  const result = await apiRequest(`/rest/asset/v1/form/${formId}/submit.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to update submit button: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    submitButton: result.result[0],
    message: 'Submit button updated'
  };
}

/**
 * Get thank you page configuration
 */
export async function formGetThankYouPage({ formId, status }) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const result = await apiRequest(`/rest/asset/v1/form/${formId}/thankYouPage.json?${params}`);

  return {
    success: result.success,
    thankYouPage: result.result ? result.result[0] : null
  };
}

/**
 * Update thank you page
 */
export async function formUpdateThankYouPage({ formId, followupType, followupValue, default: isDefault }) {
  const body = {
    followupType,  // 'url', 'lp', 'message'
    followupValue, // URL, LP ID, or message text
    default: isDefault
  };

  const result = await apiRequest(`/rest/asset/v1/form/${formId}/thankYouPage.json`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to update thank you page: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    thankYouPage: result.result[0],
    message: 'Thank you page updated'
  };
}

/**
 * Approve form
 */
export async function formApprove({ formId }) {
  const result = await apiRequest(`/rest/asset/v1/form/${formId}/approveDraft.json`, {
    method: 'POST'
  });

  if (!result.success) {
    throw new Error(`Failed to approve form: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    form: result.result[0],
    message: 'Form approved successfully'
  };
}

/**
 * Discard form draft
 */
export async function formDiscardDraft({ formId }) {
  const result = await apiRequest(`/rest/asset/v1/form/${formId}/discardDraft.json`, {
    method: 'POST'
  });

  if (!result.success) {
    throw new Error(`Failed to discard draft: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    message: 'Form draft discarded'
  };
}

/**
 * Delete form
 */
export async function formDelete({ formId }) {
  const result = await apiRequest(`/rest/asset/v1/form/${formId}/delete.json`, {
    method: 'POST'
  });

  if (!result.success) {
    throw new Error(`Failed to delete form: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    message: 'Form deleted successfully'
  };
}

/**
 * Submit form (for external submissions)
 */
export async function formSubmit({ formId, leadFormFields, visitorData, cookie }) {
  const body = {
    formId,
    leadFormFields,  // Array of {id, value} objects
    visitorData,     // Optional visitor tracking data
    cookie          // Optional Munchkin cookie
  };

  Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);

  const result = await apiRequest('/rest/v1/leads/submitForm.json', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!result.success) {
    throw new Error(`Failed to submit form: ${JSON.stringify(result.errors)}`);
  }

  return {
    success: true,
    result: result.result[0],
    message: 'Form submitted successfully'
  };
}

/**
 * Get available form fields (lead fields that can be added)
 */
export async function formAvailableFields() {
  const result = await apiRequest('/rest/asset/v1/form/fields.json');

  return {
    success: result.success,
    fields: result.result || []
  };
}

// Export all tools for MCP registration
export const formTools = {
  mcp__marketo__form_list: {
    description: 'List forms with optional filtering',
    parameters: {
      type: 'object',
      properties: {
        folder: { type: 'object', description: 'Folder filter {id, type}' },
        status: { type: 'string', enum: ['draft', 'approved'] },
        maxReturn: { type: 'number', description: 'Max results (default 200)' },
        offset: { type: 'number', description: 'Pagination offset' }
      }
    },
    handler: formList
  },
  mcp__marketo__form_get: {
    description: 'Get form by ID',
    parameters: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['formId']
    },
    handler: formGet
  },
  mcp__marketo__form_get_by_name: {
    description: 'Get form by name',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Form name' },
        folder: { type: 'object', description: 'Folder to search' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['name']
    },
    handler: formGetByName
  },
  mcp__marketo__form_create: {
    description: 'Create new form',
    parameters: {
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
    },
    handler: formCreate
  },
  mcp__marketo__form_clone: {
    description: 'Clone existing form',
    parameters: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Source form ID' },
        name: { type: 'string', description: 'New form name' },
        folder: { type: 'object', description: 'Target folder' },
        description: { type: 'string' }
      },
      required: ['formId', 'name', 'folder']
    },
    handler: formClone
  },
  mcp__marketo__form_update: {
    description: 'Update form metadata',
    parameters: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' },
        name: { type: 'string' },
        description: { type: 'string' },
        language: { type: 'string' },
        locale: { type: 'string' },
        theme: { type: 'string' },
        labelPosition: { type: 'string' }
      },
      required: ['formId']
    },
    handler: formUpdate
  },
  mcp__marketo__form_get_fields: {
    description: 'Get form fields',
    parameters: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' },
        status: { type: 'string', enum: ['draft', 'approved'] }
      },
      required: ['formId']
    },
    handler: formGetFields
  },
  mcp__marketo__form_add_field: {
    description: 'Add field to form',
    parameters: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' },
        fieldId: { type: 'string', description: 'Lead field API name' },
        label: { type: 'string', description: 'Field label' },
        labelWidth: { type: 'number', description: 'Label width in pixels' },
        fieldWidth: { type: 'number', description: 'Field width in pixels' },
        required: { type: 'boolean', description: 'Is field required' },
        instructions: { type: 'string', description: 'Help text below field' },
        hintText: { type: 'string', description: 'Placeholder text' },
        defaultValue: { type: 'string', description: 'Default value' },
        validationMessage: { type: 'string', description: 'Validation error message' }
      },
      required: ['formId', 'fieldId']
    },
    handler: formAddField
  },
  mcp__marketo__form_update_field: {
    description: 'Update form field',
    parameters: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' },
        fieldId: { type: 'string', description: 'Field ID' },
        label: { type: 'string' },
        labelWidth: { type: 'number' },
        fieldWidth: { type: 'number' },
        required: { type: 'boolean' },
        instructions: { type: 'string' },
        hintText: { type: 'string' },
        defaultValue: { type: 'string' },
        validationMessage: { type: 'string' }
      },
      required: ['formId', 'fieldId']
    },
    handler: formUpdateField
  },
  mcp__marketo__form_delete_field: {
    description: 'Delete field from form',
    parameters: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' },
        fieldId: { type: 'string', description: 'Field ID to delete' }
      },
      required: ['formId', 'fieldId']
    },
    handler: formDeleteField
  },
  mcp__marketo__form_approve: {
    description: 'Approve form draft',
    parameters: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' }
      },
      required: ['formId']
    },
    handler: formApprove
  },
  mcp__marketo__form_delete: {
    description: 'Delete form',
    parameters: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'Form ID' }
      },
      required: ['formId']
    },
    handler: formDelete
  },
  mcp__marketo__form_submit: {
    description: 'Submit form data externally',
    parameters: {
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
        visitorData: { type: 'object', description: 'Optional visitor tracking data' },
        cookie: { type: 'string', description: 'Optional Munchkin cookie' }
      },
      required: ['formId', 'leadFormFields']
    },
    handler: formSubmit
  },
  mcp__marketo__form_available_fields: {
    description: 'Get available fields that can be added to forms',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: formAvailableFields
  }
};
