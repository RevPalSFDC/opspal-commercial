#!/usr/bin/env node
/**
 * HubSpot Automation Actions V4 API Wrapper
 *
 * Purpose: Create and manage custom workflow actions via HubSpot Automation Actions V4 API
 * Enables developers to create custom workflow actions that integrate external services.
 *
 * KEY FEATURES:
 * - Custom action definitions with input/output fields
 * - Action functions (PRE_ACTION_EXECUTION, PRE_FETCH_OPTIONS, POST_FETCH_OPTIONS)
 * - External options fetching via optionsUrl
 * - Execution rules with custom error messages
 * - Multi-language labels (14 supported languages)
 * - Async state management (BLOCK execution)
 *
 * API ENDPOINTS:
 * - POST /automation/v4/actions/{appId} - Create action
 * - GET /automation/v4/actions/{appId} - List actions
 * - GET /automation/v4/actions/{appId}/{definitionId} - Get action
 * - PATCH /automation/v4/actions/{appId}/{definitionId} - Update action
 * - DELETE /automation/v4/actions/{appId}/{definitionId} - Delete action
 * - PUT /automation/v4/actions/{appId}/{definitionId}/functions/{functionType} - Add function
 *
 * @version 1.0.0
 * @phase Automation Actions V4 Support
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

/**
 * Supported object types for custom actions
 */
const OBJECT_TYPES = {
  CONTACT: 'CONTACT',
  COMPANY: 'COMPANY',
  DEAL: 'DEAL',
  TICKET: 'TICKET',
  QUOTE: 'QUOTE',
  LINE_ITEM: 'LINE_ITEM',
  CUSTOM: 'p-{objectTypeId}'  // Pattern for custom objects
};

/**
 * Field types supported by custom actions
 */
const FIELD_TYPES = {
  STRING: 'string',
  NUMBER: 'number',
  BOOL: 'bool',
  DATE: 'date',
  DATETIME: 'datetime',
  ENUMERATION: 'enumeration',
  PHONE_NUMBER: 'phone_number',
  OBJECT_COORDINATES: 'object_coordinates'
};

/**
 * Field format types for specific use cases
 */
const FIELD_FORMATS = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  RICH_TEXT: 'richtext',
  CURRENCY: 'currency',
  PERCENT: 'percent',
  DURATION: 'duration'
};

/**
 * Action function types
 */
const FUNCTION_TYPES = {
  PRE_ACTION_EXECUTION: 'PRE_ACTION_EXECUTION',      // Modify request before sending to actionUrl
  PRE_FETCH_OPTIONS: 'PRE_FETCH_OPTIONS',            // Customize external option-fetch requests
  POST_FETCH_OPTIONS: 'POST_FETCH_OPTIONS'           // Transform API responses to HubSpot format
};

/**
 * Execution states for async actions
 */
const EXECUTION_STATES = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  BLOCK: 'BLOCK'  // Pause workflow execution
};

/**
 * Supported languages for action labels
 */
const SUPPORTED_LANGUAGES = [
  'en', 'fr', 'de', 'es', 'pt-br', 'ja', 'nl',
  'it', 'pl', 'fi', 'sv', 'zh-cn', 'zh-tw', 'ko'
];

/**
 * Automation Actions V4 API Wrapper
 *
 * Usage:
 * const wrapper = new AutomationActionsV4Wrapper(accessToken, appId);
 *
 * // Create a custom action
 * const action = await wrapper.createAction({
 *   actionUrl: 'https://my-service.com/action',
 *   objectTypes: ['CONTACT', 'DEAL'],
 *   inputFields: [
 *     { name: 'email', type: 'string', label: 'Email Address' }
 *   ],
 *   outputFields: [
 *     { name: 'status', type: 'enumeration', options: ['success', 'failed'] }
 *   ],
 *   labels: { en: { actionName: 'My Custom Action' } }
 * });
 *
 * // Add a function to the action
 * await wrapper.addFunction(action.id, 'PRE_ACTION_EXECUTION', functionCode);
 */
class AutomationActionsV4Wrapper {
  constructor(accessToken, appId, options = {}) {
    if (!accessToken) {
      throw new Error('AutomationActionsV4Wrapper requires accessToken');
    }
    if (!appId) {
      throw new Error('AutomationActionsV4Wrapper requires appId');
    }

    this.accessToken = accessToken;
    this.appId = appId;
    this.verbose = options.verbose || false;
    this.timeout = options.timeout || 30000;
  }

  /**
   * Create a new custom action definition
   * @param {Object} config - Action configuration
   * @param {string} config.actionUrl - URL to receive action execution requests
   * @param {string[]} config.objectTypes - Object types this action supports
   * @param {Array} config.inputFields - Input field definitions
   * @param {Array} config.outputFields - Output field definitions
   * @param {Object} config.labels - Multi-language labels
   * @param {Array} config.executionRules - Execution rules (optional)
   * @param {boolean} config.published - Publish action immediately (optional)
   * @returns {Promise<Object>} Created action definition
   */
  async createAction(config) {
    const {
      actionUrl,
      objectTypes = ['CONTACT'],
      inputFields = [],
      outputFields = [],
      labels = {},
      executionRules = [],
      published = false
    } = config;

    if (!actionUrl) {
      throw new Error('actionUrl is required for custom action');
    }

    // Build action definition
    const actionDefinition = {
      actionUrl,
      objectTypes: this.normalizeObjectTypes(objectTypes),
      inputFields: this.buildInputFields(inputFields),
      outputFields: this.buildOutputFields(outputFields),
      labels: this.buildLabels(labels),
      published
    };

    // Add execution rules if provided
    if (executionRules.length > 0) {
      actionDefinition.executionRules = this.buildExecutionRules(executionRules);
    }

    const url = `${HUBSPOT_API_BASE}/automation/v4/actions/${this.appId}`;

    if (this.verbose) {
      console.log(`Creating action for app ${this.appId}...`);
      console.log(`  Action URL: ${actionUrl}`);
      console.log(`  Object types: ${objectTypes.join(', ')}`);
      console.log(`  Input fields: ${inputFields.length}`);
      console.log(`  Output fields: ${outputFields.length}`);
    }

    const result = await this.makeRequest(url, actionDefinition, 'POST');

    if (this.verbose) {
      console.log(`✓ Action created: ${result.id}`);
    }

    return result;
  }

  /**
   * Update an existing action definition
   * @param {string} definitionId - Action definition ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated action definition
   */
  async updateAction(definitionId, updates) {
    const url = `${HUBSPOT_API_BASE}/automation/v4/actions/${this.appId}/${definitionId}`;

    // Build update payload
    const updatePayload = {};

    if (updates.actionUrl) {
      updatePayload.actionUrl = updates.actionUrl;
    }
    if (updates.objectTypes) {
      updatePayload.objectTypes = this.normalizeObjectTypes(updates.objectTypes);
    }
    if (updates.inputFields) {
      updatePayload.inputFields = this.buildInputFields(updates.inputFields);
    }
    if (updates.outputFields) {
      updatePayload.outputFields = this.buildOutputFields(updates.outputFields);
    }
    if (updates.labels) {
      updatePayload.labels = this.buildLabels(updates.labels);
    }
    if (updates.executionRules) {
      updatePayload.executionRules = this.buildExecutionRules(updates.executionRules);
    }
    if (typeof updates.published === 'boolean') {
      updatePayload.published = updates.published;
    }

    if (this.verbose) {
      console.log(`Updating action ${definitionId}...`);
    }

    const result = await this.makeRequest(url, updatePayload, 'PATCH');

    if (this.verbose) {
      console.log(`✓ Action updated: ${definitionId}`);
    }

    return result;
  }

  /**
   * Delete an action definition
   * @param {string} definitionId - Action definition ID
   * @returns {Promise<void>}
   */
  async deleteAction(definitionId) {
    const url = `${HUBSPOT_API_BASE}/automation/v4/actions/${this.appId}/${definitionId}`;

    if (this.verbose) {
      console.log(`Deleting action ${definitionId}...`);
    }

    await this.makeRequest(url, null, 'DELETE');

    if (this.verbose) {
      console.log(`✓ Action deleted: ${definitionId}`);
    }
  }

  /**
   * Get a specific action definition
   * @param {string} definitionId - Action definition ID
   * @returns {Promise<Object>} Action definition
   */
  async getAction(definitionId) {
    const url = `${HUBSPOT_API_BASE}/automation/v4/actions/${this.appId}/${definitionId}`;
    return await this.makeRequest(url, null, 'GET');
  }

  /**
   * List all action definitions for the app
   * @param {Object} options - List options
   * @param {number} options.limit - Max results (default 10)
   * @param {string} options.after - Pagination cursor
   * @returns {Promise<Object>} List of action definitions
   */
  async listActions(options = {}) {
    const { limit = 10, after } = options;

    let url = `${HUBSPOT_API_BASE}/automation/v4/actions/${this.appId}?limit=${limit}`;
    if (after) {
      url += `&after=${after}`;
    }

    const result = await this.makeRequest(url, null, 'GET');

    if (this.verbose) {
      console.log(`Found ${result.results?.length || 0} actions`);
    }

    return result;
  }

  /**
   * Get all actions (with automatic pagination)
   * @returns {Promise<Array>} All action definitions
   */
  async getAllActions() {
    const allActions = [];
    let after = null;

    do {
      const response = await this.listActions({ limit: 100, after });
      if (response.results) {
        allActions.push(...response.results);
      }
      after = response.paging?.next?.after;
    } while (after);

    return allActions;
  }

  /**
   * Publish an action (make it available in workflow editor)
   * @param {string} definitionId - Action definition ID
   * @returns {Promise<Object>} Updated action definition
   */
  async publishAction(definitionId) {
    return await this.updateAction(definitionId, { published: true });
  }

  /**
   * Unpublish an action (hide from workflow editor)
   * @param {string} definitionId - Action definition ID
   * @returns {Promise<Object>} Updated action definition
   */
  async unpublishAction(definitionId) {
    return await this.updateAction(definitionId, { published: false });
  }

  /**
   * Add a function to an action
   * @param {string} definitionId - Action definition ID
   * @param {string} functionType - Function type (PRE_ACTION_EXECUTION, etc.)
   * @param {string} functionSource - JavaScript source code for the function
   * @returns {Promise<Object>} Function configuration
   */
  async addFunction(definitionId, functionType, functionSource) {
    if (!FUNCTION_TYPES[functionType]) {
      throw new Error(`Invalid function type: ${functionType}. Must be one of: ${Object.keys(FUNCTION_TYPES).join(', ')}`);
    }

    const url = `${HUBSPOT_API_BASE}/automation/v4/actions/${this.appId}/${definitionId}/functions/${functionType}`;

    const payload = {
      functionType,
      functionSource
    };

    if (this.verbose) {
      console.log(`Adding ${functionType} function to action ${definitionId}...`);
    }

    const result = await this.makeRequest(url, payload, 'PUT');

    if (this.verbose) {
      console.log(`✓ Function added: ${functionType}`);
    }

    return result;
  }

  /**
   * Get a function attached to an action
   * @param {string} definitionId - Action definition ID
   * @param {string} functionType - Function type
   * @returns {Promise<Object>} Function configuration
   */
  async getFunction(definitionId, functionType) {
    const url = `${HUBSPOT_API_BASE}/automation/v4/actions/${this.appId}/${definitionId}/functions/${functionType}`;
    return await this.makeRequest(url, null, 'GET');
  }

  /**
   * Delete a function from an action
   * @param {string} definitionId - Action definition ID
   * @param {string} functionType - Function type
   * @returns {Promise<void>}
   */
  async deleteFunction(definitionId, functionType) {
    const url = `${HUBSPOT_API_BASE}/automation/v4/actions/${this.appId}/${definitionId}/functions/${functionType}`;
    await this.makeRequest(url, null, 'DELETE');
  }

  /**
   * List all functions attached to an action
   * @param {string} definitionId - Action definition ID
   * @returns {Promise<Object>} List of functions
   */
  async listFunctions(definitionId) {
    const url = `${HUBSPOT_API_BASE}/automation/v4/actions/${this.appId}/${definitionId}/functions`;
    return await this.makeRequest(url, null, 'GET');
  }

  /**
   * Get revisions of an action
   * @param {string} definitionId - Action definition ID
   * @param {Object} options - List options
   * @returns {Promise<Object>} List of revisions
   */
  async getRevisions(definitionId, options = {}) {
    const { limit = 10, after } = options;

    let url = `${HUBSPOT_API_BASE}/automation/v4/actions/${this.appId}/${definitionId}/revisions?limit=${limit}`;
    if (after) {
      url += `&after=${after}`;
    }

    return await this.makeRequest(url, null, 'GET');
  }

  /**
   * Get a specific revision of an action
   * @param {string} definitionId - Action definition ID
   * @param {string} revisionId - Revision ID
   * @returns {Promise<Object>} Revision details
   */
  async getRevision(definitionId, revisionId) {
    const url = `${HUBSPOT_API_BASE}/automation/v4/actions/${this.appId}/${definitionId}/revisions/${revisionId}`;
    return await this.makeRequest(url, null, 'GET');
  }

  // ==================== Helper Methods ====================

  /**
   * Normalize object types to API format
   */
  normalizeObjectTypes(types) {
    return types.map(type => {
      if (typeof type === 'string') {
        // Handle predefined types
        if (OBJECT_TYPES[type.toUpperCase()]) {
          return type.toUpperCase();
        }
        // Handle custom object IDs
        if (type.startsWith('p-') || type.match(/^\d+-\d+$/)) {
          return type;
        }
        return type.toUpperCase();
      }
      return type;
    });
  }

  /**
   * Build input field definitions
   */
  buildInputFields(fields) {
    return fields.map((field, index) => {
      const inputField = {
        typeDefinition: {
          name: field.name,
          type: field.type || FIELD_TYPES.STRING,
          fieldType: field.fieldType || field.format || FIELD_FORMATS.TEXT
        },
        isRequired: field.required !== false,
        supportedValueTypes: field.supportedValueTypes || ['STATIC_VALUE']
      };

      // Add options for enumeration fields
      if (field.type === FIELD_TYPES.ENUMERATION && field.options) {
        inputField.typeDefinition.options = field.options.map(opt => ({
          value: typeof opt === 'string' ? opt : opt.value,
          label: typeof opt === 'string' ? opt : opt.label,
          description: typeof opt === 'object' ? opt.description : undefined,
          displayOrder: typeof opt === 'object' ? opt.displayOrder : undefined
        }));
      }

      // Add external options URL if provided
      if (field.optionsUrl) {
        inputField.typeDefinition.externalOptionsReferenceType = field.optionsReferenceType || 'OPTION';
        inputField.typeDefinition.externalOptions = true;
        inputField.typeDefinition.optionsUrl = field.optionsUrl;
      }

      // Add field dependencies (visibility conditions)
      if (field.dependsOn) {
        inputField.typeDefinition.referencedObjectType = field.dependsOn.type || 'SINGLE_FIELD';
        inputField.typeDefinition.referencedPropertyName = field.dependsOn.property;
      }

      return inputField;
    });
  }

  /**
   * Build output field definitions
   */
  buildOutputFields(fields) {
    return fields.map((field, index) => {
      const outputField = {
        typeDefinition: {
          name: field.name,
          type: field.type || FIELD_TYPES.STRING,
          fieldType: field.fieldType || field.format || FIELD_FORMATS.TEXT
        }
      };

      // Add options for enumeration fields
      if (field.type === FIELD_TYPES.ENUMERATION && field.options) {
        outputField.typeDefinition.options = field.options.map(opt => ({
          value: typeof opt === 'string' ? opt : opt.value,
          label: typeof opt === 'string' ? opt : opt.label
        }));
      }

      return outputField;
    });
  }

  /**
   * Build multi-language labels
   */
  buildLabels(labels) {
    const result = {};

    // Ensure at least English labels exist
    if (!labels.en) {
      labels.en = labels;
    }

    for (const lang of SUPPORTED_LANGUAGES) {
      if (labels[lang]) {
        result[lang] = {
          actionName: labels[lang].actionName || labels[lang].name,
          actionDescription: labels[lang].actionDescription || labels[lang].description,
          actionCardContent: labels[lang].actionCardContent || labels[lang].cardContent,
          appDisplayName: labels[lang].appDisplayName || labels[lang].appName,
          inputFieldLabels: labels[lang].inputFieldLabels || {},
          outputFieldLabels: labels[lang].outputFieldLabels || {}
        };

        // Clean up undefined values
        Object.keys(result[lang]).forEach(key => {
          if (result[lang][key] === undefined) {
            delete result[lang][key];
          }
        });
      }
    }

    return result;
  }

  /**
   * Build execution rules
   */
  buildExecutionRules(rules) {
    return rules.map(rule => {
      const executionRule = {
        conditions: this.buildConditions(rule.conditions || rule.when),
        effect: {
          type: rule.effect?.type || rule.effectType || 'ERROR',
          message: rule.effect?.message || rule.message
        }
      };

      return executionRule;
    });
  }

  /**
   * Build conditions for execution rules
   */
  buildConditions(conditions) {
    if (!conditions) return [];

    return conditions.map(condition => ({
      propertyName: condition.property || condition.propertyName,
      operator: condition.operator || 'EQ',
      value: condition.value
    }));
  }

  /**
   * Make HTTP request
   */
  async makeRequest(url, payload, method) {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (payload && method !== 'GET') {
      options.body = JSON.stringify(payload);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    options.signal = controller.signal;

    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      // Handle DELETE with no content
      if (method === 'DELETE' && response.status === 204) {
        return { success: true };
      }

      const responseText = await response.text();

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.message || errorJson.error || errorMessage;
        } catch (e) {
          errorMessage = responseText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      return responseText ? JSON.parse(responseText) : { success: true };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}

// Export wrapper and constants
module.exports = AutomationActionsV4Wrapper;
module.exports.OBJECT_TYPES = OBJECT_TYPES;
module.exports.FIELD_TYPES = FIELD_TYPES;
module.exports.FIELD_FORMATS = FIELD_FORMATS;
module.exports.FUNCTION_TYPES = FUNCTION_TYPES;
module.exports.EXECUTION_STATES = EXECUTION_STATES;
module.exports.SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;

// CLI usage
if (require.main === module) {
  console.log('AutomationActionsV4Wrapper - HubSpot Automation Actions V4 API');
  console.log('');
  console.log('Create custom workflow actions that integrate external services.');
  console.log('');
  console.log('KEY FEATURES:');
  console.log('  - Custom action definitions with input/output fields');
  console.log('  - Action functions (PRE_ACTION_EXECUTION, PRE_FETCH_OPTIONS, POST_FETCH_OPTIONS)');
  console.log('  - External options fetching via optionsUrl');
  console.log('  - Execution rules with custom error messages');
  console.log('  - Multi-language labels (14 supported languages)');
  console.log('  - Async state management (BLOCK execution)');
  console.log('');
  console.log('USAGE:');
  console.log('  const wrapper = new AutomationActionsV4Wrapper(accessToken, appId);');
  console.log('');
  console.log('  // Create action');
  console.log('  const action = await wrapper.createAction({');
  console.log('    actionUrl: "https://my-service.com/action",');
  console.log('    objectTypes: ["CONTACT", "DEAL"],');
  console.log('    inputFields: [{ name: "email", type: "string" }],');
  console.log('    labels: { en: { actionName: "My Action" } }');
  console.log('  });');
  console.log('');
  console.log('  // Add function');
  console.log('  await wrapper.addFunction(action.id, "PRE_ACTION_EXECUTION", code);');
  console.log('');
  console.log('  // List actions');
  console.log('  const actions = await wrapper.getAllActions();');
  console.log('');
  console.log('FUNCTION TYPES:');
  Object.keys(FUNCTION_TYPES).forEach(type => {
    console.log(`  - ${type}`);
  });
  console.log('');
  console.log('FIELD TYPES:');
  Object.keys(FIELD_TYPES).forEach(type => {
    console.log(`  - ${type}: ${FIELD_TYPES[type]}`);
  });
}
