/**
 * N8nDeployer.js
 *
 * n8n workflow deployment adapter for the Solution Template System.
 * Handles deployment of workflows, credentials, and workflow configurations.
 *
 * @module solution-template-system/deployers/N8nDeployer
 */

'use strict';

const https = require('https');
const http = require('http');
const url = require('url');

/**
 * n8n workflow deployer
 */
class N8nDeployer {
  constructor(options = {}) {
    this.options = {
      baseUrl: options.credentials?.baseUrl || process.env.N8N_BASE_URL,
      apiKey: options.credentials?.apiKey || process.env.N8N_API_KEY,
      activateOnDeploy: options.defaults?.activateOnDeploy || false,
      verbose: options.verbose || false,
      ...options
    };

    // Parse base URL
    if (this.options.baseUrl) {
      const parsed = url.parse(this.options.baseUrl);
      this.protocol = parsed.protocol === 'https:' ? https : http;
      this.hostname = parsed.hostname;
      this.port = parsed.port || (parsed.protocol === 'https:' ? 443 : 80);
      this.basePath = parsed.pathname?.replace(/\/$/, '') || '';
    }

    // Metadata type mappings
    this.metadataTypes = {
      workflow: {
        endpoint: '/workflows',
        method: 'POST'
      },
      credential: {
        endpoint: '/credentials',
        method: 'POST'
      }
    };
  }

  /**
   * Deploy a component to n8n
   * @param {Object} deployConfig - Deployment configuration
   * @returns {Object} Deployment result
   */
  async deploy(deployConfig) {
    const { component, metadataType, content, environment } = deployConfig;

    try {
      // Validate connection
      await this.validateConnection();

      // Parse content
      const payload = this.parseContent(content, metadataType);

      // Deploy based on type
      let result;

      switch (metadataType) {
        case 'workflow':
          result = await this.deployWorkflow(component, payload);
          break;
        case 'credential':
          result = await this.deployCredential(component, payload);
          break;
        default:
          throw new Error(`Unknown n8n metadata type: ${metadataType}`);
      }

      return {
        success: result.success,
        component: component.id,
        type: metadataType,
        n8nId: result.id,
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
   * Validate n8n connection
   */
  async validateConnection() {
    if (!this.options.baseUrl) {
      throw new Error('n8n base URL not configured');
    }

    if (!this.options.apiKey) {
      throw new Error('n8n API key not configured');
    }

    try {
      const result = await this.makeRequest('GET', '/workflows', { limit: 1 });
      this.log(`Connected to n8n instance`);
      return true;
    } catch (error) {
      throw new Error(`n8n connection failed: ${error.message}`);
    }
  }

  /**
   * Deploy a workflow
   * @param {Object} component - Component metadata
   * @param {Object} payload - Workflow definition
   * @returns {Object} Deployment result
   */
  async deployWorkflow(component, payload) {
    // Ensure workflow has required fields
    const workflowData = {
      name: payload.name || component.id,
      nodes: payload.nodes || [],
      connections: payload.connections || {},
      settings: payload.settings || {},
      staticData: payload.staticData || null,
      ...payload
    };

    // Check if workflow exists by name
    const existing = await this.findWorkflowByName(workflowData.name);

    if (existing) {
      // Update existing workflow
      workflowData.id = existing.id;

      const result = await this.makeRequest(
        'PATCH',
        `/workflows/${existing.id}`,
        workflowData
      );

      // Optionally activate
      if (this.options.activateOnDeploy && !result.active) {
        await this.activateWorkflow(result.id);
      }

      return {
        success: true,
        id: result.id,
        action: 'updated',
        active: result.active,
        previousVersion: existing.versionId
      };
    } else {
      // Create new workflow
      const result = await this.makeRequest(
        'POST',
        '/workflows',
        workflowData
      );

      // Optionally activate
      if (this.options.activateOnDeploy) {
        await this.activateWorkflow(result.id);
      }

      return {
        success: true,
        id: result.id,
        action: 'created',
        active: result.active
      };
    }
  }

  /**
   * Deploy a credential
   * @param {Object} component - Component metadata
   * @param {Object} payload - Credential definition
   * @returns {Object} Deployment result
   */
  async deployCredential(component, payload) {
    const credentialData = {
      name: payload.name || component.id,
      type: payload.type,
      data: payload.data || {},
      ...payload
    };

    // Check if credential exists
    const existing = await this.findCredentialByName(credentialData.name, credentialData.type);

    if (existing) {
      // Update existing credential
      const result = await this.makeRequest(
        'PATCH',
        `/credentials/${existing.id}`,
        credentialData
      );

      return {
        success: true,
        id: result.id,
        action: 'updated'
      };
    } else {
      // Create new credential
      const result = await this.makeRequest(
        'POST',
        '/credentials',
        credentialData
      );

      return {
        success: true,
        id: result.id,
        action: 'created'
      };
    }
  }

  /**
   * Find workflow by name
   * @param {string} name - Workflow name
   * @returns {Object|null} Workflow or null
   */
  async findWorkflowByName(name) {
    try {
      const result = await this.makeRequest('GET', '/workflows');
      const workflows = result.data || [];
      return workflows.find(w => w.name === name);
    } catch (error) {
      return null;
    }
  }

  /**
   * Find credential by name and type
   * @param {string} name - Credential name
   * @param {string} type - Credential type
   * @returns {Object|null} Credential or null
   */
  async findCredentialByName(name, type) {
    try {
      const result = await this.makeRequest('GET', '/credentials');
      const credentials = result.data || [];
      return credentials.find(c => c.name === name && c.type === type);
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
      const result = await this.makeRequest(
        'PATCH',
        `/workflows/${workflowId}`,
        { active: true }
      );

      return {
        success: true,
        workflowId,
        active: result.active
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
      const result = await this.makeRequest(
        'PATCH',
        `/workflows/${workflowId}`,
        { active: false }
      );

      return {
        success: true,
        workflowId,
        active: result.active
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Retrieve workflow for checkpoint
   * @param {Object} component - Component to retrieve
   * @param {string} metadataType - Metadata type
   * @returns {Object} Retrieved content
   */
  async retrieve(component, metadataType) {
    try {
      let endpoint;
      let id = component.n8nId || component.id;

      switch (metadataType) {
        case 'workflow':
          endpoint = `/workflows/${id}`;
          break;
        case 'credential':
          // n8n doesn't expose credential data for security
          return {
            success: false,
            error: 'Credential retrieval not supported for security reasons'
          };
        default:
          return { success: false, error: `Retrieve not supported for ${metadataType}` };
      }

      const result = await this.makeRequest('GET', endpoint);

      return {
        success: true,
        content: JSON.stringify(result, null, 2),
        metadata: {
          type: metadataType,
          active: result.active,
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
   * Delete a workflow
   * @param {string} workflowId - Workflow ID
   * @returns {Object} Deletion result
   */
  async deleteWorkflow(workflowId) {
    try {
      await this.makeRequest('DELETE', `/workflows/${workflowId}`);

      return {
        success: true,
        workflowId,
        deleted: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute a workflow (for testing)
   * @param {string} workflowId - Workflow ID
   * @param {Object} data - Input data
   * @returns {Object} Execution result
   */
  async executeWorkflow(workflowId, data = {}) {
    try {
      const result = await this.makeRequest(
        'POST',
        `/workflows/${workflowId}/execute`,
        data
      );

      return {
        success: true,
        executionId: result.executionId,
        data: result.data
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
   * @param {string} content - Raw content
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
   * Make HTTP request to n8n API
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} body - Request body
   * @returns {Promise<Object>} Response data
   */
  makeRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const fullPath = `${this.basePath}/api/v1${endpoint}`;

      const options = {
        hostname: this.hostname,
        port: this.port,
        path: fullPath,
        method: method,
        headers: {
          'X-N8N-API-KEY': this.options.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      const req = this.protocol.request(options, (res) => {
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
                `n8n API error ${res.statusCode}: ${parsed.message || data}`
              ));
            }
          } catch (e) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({});
            } else {
              reject(new Error(`Failed to parse response: ${data}`));
            }
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
      console.log('[N8nDeployer]', ...args);
    }
  }
}

module.exports = N8nDeployer;
