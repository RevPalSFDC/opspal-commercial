/**
 * HubSpotDeployer.js
 *
 * HubSpot workflow and property deployment adapter for the Solution Template System.
 * Handles deployment of workflows, properties, forms, and other HubSpot components.
 *
 * @module solution-template-system/deployers/HubSpotDeployer
 */

'use strict';

const https = require('https');
const fs = require('fs');

/**
 * HubSpot component deployer
 */
class HubSpotDeployer {
  constructor(options = {}) {
    this.options = {
      portalId: options.credentials?.portalId || process.env.HUBSPOT_PORTAL_ID,
      accessToken: options.credentials?.accessToken || process.env.HUBSPOT_ACCESS_TOKEN,
      environment: options.credentials?.environment || 'production',
      validateBeforeActivate: options.defaults?.validateBeforeActivate !== false,
      verbose: options.verbose || false,
      ...options
    };

    // API endpoints
    this.baseUrl = 'api.hubapi.com';

    // Metadata type mappings
    this.metadataTypes = {
      workflow: {
        endpoint: '/automation/v4/flows',
        method: 'POST'
      },
      property: {
        endpoint: '/crm/v3/properties',
        createMethod: 'POST'
      },
      form: {
        endpoint: '/marketing/v3/forms',
        method: 'POST'
      },
      emailTemplate: {
        endpoint: '/marketing/v3/emails',
        method: 'POST'
      },
      list: {
        endpoint: '/crm/v3/lists',
        method: 'POST'
      },
      customObject: {
        endpoint: '/crm/v3/schemas',
        method: 'POST'
      }
    };
  }

  /**
   * Deploy a component to HubSpot
   * @param {Object} deployConfig - Deployment configuration
   * @returns {Object} Deployment result
   */
  async deploy(deployConfig) {
    const { component, metadataType, content, environment } = deployConfig;

    try {
      // Validate credentials
      await this.validateCredentials();

      // Parse content
      const payload = this.parseContent(content, metadataType);

      // Deploy based on type
      let result;

      switch (metadataType) {
        case 'workflow':
          result = await this.deployWorkflow(component, payload);
          break;
        case 'property':
          result = await this.deployProperty(component, payload);
          break;
        case 'form':
          result = await this.deployForm(component, payload);
          break;
        case 'emailTemplate':
          result = await this.deployEmailTemplate(component, payload);
          break;
        case 'list':
          result = await this.deployList(component, payload);
          break;
        case 'customObject':
          result = await this.deployCustomObject(component, payload);
          break;
        default:
          throw new Error(`Unknown HubSpot metadata type: ${metadataType}`);
      }

      return {
        success: result.success,
        component: component.id,
        type: metadataType,
        hubspotId: result.id,
        details: result
      };
    } catch (error) {
      return {
        success: false,
        component: component.id,
        type: metadataType,
        error: error.message,
        stack: error.stack
      };
    }
  }

  /**
   * Validate HubSpot credentials
   */
  async validateCredentials() {
    if (!this.options.accessToken) {
      throw new Error('HubSpot access token not configured');
    }

    try {
      const result = await this.makeRequest(
        'GET',
        '/account-info/v3/details'
      );

      this.log(`Connected to HubSpot portal: ${result.portalId}`);
      return true;
    } catch (error) {
      throw new Error(`HubSpot authentication failed: ${error.message}`);
    }
  }

  /**
   * Deploy a workflow
   * @param {Object} component - Component metadata
   * @param {Object} payload - Workflow definition
   * @returns {Object} Deployment result
   */
  async deployWorkflow(component, payload) {
    // Check if workflow exists
    const existing = await this.findWorkflowByName(payload.name || component.id);

    if (existing) {
      // Update existing workflow
      const result = await this.makeRequest(
        'PATCH',
        `/automation/v4/flows/${existing.id}`,
        payload
      );

      return {
        success: true,
        id: result.id,
        action: 'updated',
        previousVersion: existing.version
      };
    } else {
      // Create new workflow
      const result = await this.makeRequest(
        'POST',
        '/automation/v4/flows',
        payload
      );

      return {
        success: true,
        id: result.id,
        action: 'created'
      };
    }
  }

  /**
   * Deploy a property
   * @param {Object} component - Component metadata
   * @param {Object} payload - Property definition
   * @returns {Object} Deployment result
   */
  async deployProperty(component, payload) {
    const objectType = payload.objectType || 'contacts';
    const propertyName = payload.name || component.id;

    // Check if property exists
    try {
      const existing = await this.makeRequest(
        'GET',
        `/crm/v3/properties/${objectType}/${propertyName}`
      );

      // Update existing property
      const result = await this.makeRequest(
        'PATCH',
        `/crm/v3/properties/${objectType}/${propertyName}`,
        payload
      );

      return {
        success: true,
        id: result.name,
        action: 'updated',
        objectType
      };
    } catch (error) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        // Create new property
        const result = await this.makeRequest(
          'POST',
          `/crm/v3/properties/${objectType}`,
          payload
        );

        return {
          success: true,
          id: result.name,
          action: 'created',
          objectType
        };
      }
      throw error;
    }
  }

  /**
   * Deploy a form
   * @param {Object} component - Component metadata
   * @param {Object} payload - Form definition
   * @returns {Object} Deployment result
   */
  async deployForm(component, payload) {
    // Check if form exists by name
    const existing = await this.findFormByName(payload.name || component.id);

    if (existing) {
      // Update existing form
      const result = await this.makeRequest(
        'PATCH',
        `/marketing/v3/forms/${existing.id}`,
        payload
      );

      return {
        success: true,
        id: result.id,
        action: 'updated'
      };
    } else {
      // Create new form
      const result = await this.makeRequest(
        'POST',
        '/marketing/v3/forms',
        payload
      );

      return {
        success: true,
        id: result.id,
        action: 'created'
      };
    }
  }

  /**
   * Deploy an email template
   * @param {Object} component - Component metadata
   * @param {Object} payload - Email template definition
   * @returns {Object} Deployment result
   */
  async deployEmailTemplate(component, payload) {
    const result = await this.makeRequest(
      'POST',
      '/marketing/v3/emails',
      payload
    );

    return {
      success: true,
      id: result.id,
      action: 'created'
    };
  }

  /**
   * Deploy a list
   * @param {Object} component - Component metadata
   * @param {Object} payload - List definition
   * @returns {Object} Deployment result
   */
  async deployList(component, payload) {
    const result = await this.makeRequest(
      'POST',
      '/crm/v3/lists',
      payload
    );

    return {
      success: true,
      id: result.listId,
      action: 'created'
    };
  }

  /**
   * Deploy a custom object schema
   * @param {Object} component - Component metadata
   * @param {Object} payload - Schema definition
   * @returns {Object} Deployment result
   */
  async deployCustomObject(component, payload) {
    // Check if schema exists
    try {
      const existing = await this.makeRequest(
        'GET',
        `/crm/v3/schemas/${payload.name}`
      );

      // Update existing schema
      const result = await this.makeRequest(
        'PATCH',
        `/crm/v3/schemas/${payload.name}`,
        payload
      );

      return {
        success: true,
        id: result.objectTypeId,
        action: 'updated'
      };
    } catch (error) {
      if (error.message.includes('404')) {
        // Create new schema
        const result = await this.makeRequest(
          'POST',
          '/crm/v3/schemas',
          payload
        );

        return {
          success: true,
          id: result.objectTypeId,
          action: 'created'
        };
      }
      throw error;
    }
  }

  /**
   * Find workflow by name
   * @param {string} name - Workflow name
   * @returns {Object|null} Workflow or null
   */
  async findWorkflowByName(name) {
    try {
      const result = await this.makeRequest(
        'GET',
        '/automation/v4/flows'
      );

      const workflows = result.results || [];
      return workflows.find(w => w.name === name);
    } catch (error) {
      return null;
    }
  }

  /**
   * Find form by name
   * @param {string} name - Form name
   * @returns {Object|null} Form or null
   */
  async findFormByName(name) {
    try {
      const result = await this.makeRequest(
        'GET',
        '/marketing/v3/forms'
      );

      const forms = result.results || [];
      return forms.find(f => f.name === name);
    } catch (error) {
      return null;
    }
  }

  /**
   * Activate a workflow
   * @param {string} workflowId - Workflow ID
   * @returns {Object} Activation result
   */
  async activateWorkflow(workflowId) {
    try {
      await this.makeRequest(
        'POST',
        `/automation/v4/flows/${workflowId}/actions/activate`
      );

      return {
        success: true,
        workflowId,
        status: 'active'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Deactivate a workflow
   * @param {string} workflowId - Workflow ID
   * @returns {Object} Deactivation result
   */
  async deactivateWorkflow(workflowId) {
    try {
      await this.makeRequest(
        'POST',
        `/automation/v4/flows/${workflowId}/actions/deactivate`
      );

      return {
        success: true,
        workflowId,
        status: 'inactive'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Retrieve component for checkpoint
   * @param {Object} component - Component to retrieve
   * @param {string} metadataType - Metadata type
   * @returns {Object} Retrieved content
   */
  async retrieve(component, metadataType) {
    try {
      let endpoint;
      let id = component.hubspotId || component.id;

      switch (metadataType) {
        case 'workflow':
          endpoint = `/automation/v4/flows/${id}`;
          break;
        case 'property':
          endpoint = `/crm/v3/properties/${component.objectType}/${id}`;
          break;
        case 'form':
          endpoint = `/marketing/v3/forms/${id}`;
          break;
        default:
          return { success: false, error: `Retrieve not supported for ${metadataType}` };
      }

      const result = await this.makeRequest('GET', endpoint);

      return {
        success: true,
        content: JSON.stringify(result, null, 2),
        metadata: {
          type: metadataType,
          retrievedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Parse content based on metadata type
   * @param {string} content - Raw content (JSON string or object)
   * @param {string} metadataType - Metadata type
   * @returns {Object} Parsed payload
   */
  parseContent(content, metadataType) {
    if (typeof content === 'object') {
      return content;
    }

    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse ${metadataType} content as JSON: ${error.message}`);
    }
  }

  /**
   * Make HTTP request to HubSpot API
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} body - Request body
   * @returns {Promise<Object>} Response data
   */
  makeRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        path: endpoint,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.options.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};

            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(
                `HubSpot API error ${res.statusCode}: ${parsed.message || data}`
              ));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Log message if verbose mode enabled
   * @param {...any} args - Log arguments
   */
  log(...args) {
    if (this.options.verbose) {
      console.log('[HubSpotDeployer]', ...args);
    }
  }
}

module.exports = HubSpotDeployer;
