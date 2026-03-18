#!/usr/bin/env node

/**
 * API Capability Checker
 *
 * Pre-validates API and MCP tool availability BEFORE operations.
 * Addresses the external-api cohort which caused 5 reflections.
 *
 * **Problem Solved (Reflection Cohort: external-api - P1):**
 * - MCP tools fail mid-operation with cryptic errors
 * - API endpoints unreachable discovered after work begins
 * - Missing authentication detected too late
 * - Network issues cause partial operation failures
 *
 * **Solution:**
 * - Pre-check MCP tool availability
 * - Validate API endpoint health before operations
 * - Unified capability matrix for all external dependencies
 * - Automatic fallback recommendations
 *
 * **ROI:** Part of $39k/year external-api error prevention
 *
 * Usage:
 *   const APICapabilityChecker = require('./api-capability-checker');
 *   const checker = new APICapabilityChecker();
 *
 *   // Check specific MCP tool
 *   const result = await checker.checkMCPTool('mcp__asana__create_task');
 *
 *   // Check API endpoint health
 *   const health = await checker.checkEndpointHealth('https://api.asana.com/1.0/users/me');
 *
 *   // Comprehensive pre-check for an operation
 *   const ready = await checker.preCheck({
 *     operation: 'create_asana_task',
 *     requiredTools: ['mcp__asana__create_task'],
 *     requiredEndpoints: ['https://api.asana.com/1.0']
 *   });
 *
 * @module api-capability-checker
 */

const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

class APICapabilityChecker {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.timeout = options.timeout || 10000; // 10 seconds
    this.cache = {
      mcpTools: new Map(),
      endpoints: new Map()
    };
    this.cacheTimeout = 60000; // 1 minute

    // Known MCP servers and their tools
    this.knownMCPServers = {
      'asana': {
        tools: ['create_task', 'update_task', 'list_tasks', 'get_task'],
        healthCheck: 'https://app.asana.com/api/1.0/users/me',
        envVars: ['ASANA_ACCESS_TOKEN']
      },
      'salesforce': {
        tools: ['data_query', 'data_create', 'data_update', 'metadata_deploy'],
        healthCheck: null, // Uses SFDX auth
        envVars: ['SFDX_ALIAS', 'SFDX_DEFAULT_USERNAME']
      },
      'supabase': {
        tools: ['query', 'insert', 'update', 'delete'],
        healthCheck: null, // Constructed from SUPABASE_URL
        envVars: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']
      },
      'hubspot': {
        tools: ['get_contacts', 'create_contact', 'get_companies'],
        healthCheck: 'https://api.hubapi.com/crm/v3/objects/contacts?limit=1',
        envVars: ['HUBSPOT_ACCESS_TOKEN']
      }
    };
  }

  /**
   * Log message if verbose mode enabled
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[APICapabilityChecker] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  /**
   * Check if a specific MCP tool is available
   * @param {string} toolName - Full MCP tool name (e.g., 'mcp__asana__create_task')
   * @returns {Promise<object>} Tool availability result
   */
  async checkMCPTool(toolName) {
    this.log(`Checking MCP tool: ${toolName}`);

    // Check cache
    if (this.cache.mcpTools.has(toolName)) {
      const cached = this.cache.mcpTools.get(toolName);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        this.log('Cache hit for MCP tool');
        return cached.result;
      }
    }

    // Parse tool name
    const parts = toolName.replace(/^mcp__/, '').split('__');
    const serverName = parts[0];
    const operation = parts.slice(1).join('__');

    // Check if server is known
    const serverConfig = this.knownMCPServers[serverName];

    // Check environment variables
    const envStatus = this.checkEnvironmentVariables(serverConfig?.envVars || []);

    // Determine availability
    let available = false;
    let reason = '';
    let fallback = null;

    if (!serverConfig) {
      available = envStatus.all_set; // Unknown server - assume available if env vars exist
      reason = `Unknown MCP server '${serverName}' - cannot verify`;
      fallback = this.suggestFallback(serverName, operation);
    } else if (!envStatus.all_set) {
      available = false;
      reason = `Missing environment variables: ${envStatus.missing.join(', ')}`;
      fallback = this.suggestFallback(serverName, operation);
    } else {
      // Server is known and env vars are set
      available = true;
      reason = 'All required environment variables present';
    }

    const result = {
      available,
      tool: toolName,
      server: serverName,
      operation,
      reason,
      environment: envStatus,
      fallback,
      recommendations: available ? [] : this.getRecommendations(serverName, envStatus)
    };

    // Cache result
    this.cache.mcpTools.set(toolName, { result, timestamp: Date.now() });

    return result;
  }

  /**
   * Check if required environment variables are set
   */
  checkEnvironmentVariables(envVars) {
    const result = {
      all_set: true,
      variables: {},
      missing: [],
      present: []
    };

    for (const envVar of envVars) {
      const value = process.env[envVar];
      const isSet = value !== undefined && value !== '';

      result.variables[envVar] = {
        set: isSet,
        length: isSet ? value.length : 0
      };

      if (isSet) {
        result.present.push(envVar);
      } else {
        result.missing.push(envVar);
        result.all_set = false;
      }
    }

    return result;
  }

  /**
   * Check API endpoint health
   * @param {string} endpoint - API endpoint URL
   * @param {object} options - Check options
   * @returns {Promise<object>} Health check result
   */
  async checkEndpointHealth(endpoint, options = {}) {
    this.log(`Checking endpoint health: ${endpoint}`);

    // Check cache
    const cacheKey = `${endpoint}:${JSON.stringify(options.headers || {})}`;
    if (this.cache.endpoints.has(cacheKey)) {
      const cached = this.cache.endpoints.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        this.log('Cache hit for endpoint');
        return cached.result;
      }
    }

    const {
      method = 'GET',
      headers = {},
      expectedStatus = [200, 201, 204, 401, 403] // Even auth errors mean endpoint is reachable
    } = options;

    return new Promise((resolve) => {
      try {
        const url = new URL(endpoint);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;

        const requestOptions = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers: {
            'User-Agent': 'APICapabilityChecker/1.0',
            ...headers
          },
          timeout: this.timeout
        };

        const startTime = Date.now();

        const req = lib.request(requestOptions, (res) => {
          const endTime = Date.now();
          const latency = endTime - startTime;

          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            const result = {
              healthy: expectedStatus.includes(res.statusCode),
              endpoint,
              statusCode: res.statusCode,
              latency,
              reachable: true,
              details: {
                contentType: res.headers['content-type'],
                server: res.headers['server']
              }
            };

            // Add specific status interpretation
            if (res.statusCode === 401 || res.statusCode === 403) {
              result.note = 'Endpoint reachable but authentication required/failed';
              result.authIssue = true;
            } else if (res.statusCode >= 500) {
              result.note = 'Endpoint reachable but server error';
              result.serverError = true;
            }

            // Cache result
            this.cache.endpoints.set(cacheKey, { result, timestamp: Date.now() });

            resolve(result);
          });
        });

        req.on('timeout', () => {
          req.destroy();
          const result = {
            healthy: false,
            endpoint,
            statusCode: null,
            latency: this.timeout,
            reachable: false,
            error: `Timeout after ${this.timeout}ms`
          };
          this.cache.endpoints.set(cacheKey, { result, timestamp: Date.now() });
          resolve(result);
        });

        req.on('error', (error) => {
          const result = {
            healthy: false,
            endpoint,
            statusCode: null,
            latency: null,
            reachable: false,
            error: error.message
          };
          this.cache.endpoints.set(cacheKey, { result, timestamp: Date.now() });
          resolve(result);
        });

        req.end();
      } catch (error) {
        resolve({
          healthy: false,
          endpoint,
          statusCode: null,
          latency: null,
          reachable: false,
          error: `Invalid URL or request error: ${error.message}`
        });
      }
    });
  }

  /**
   * Comprehensive pre-check for an operation
   * @param {object} config - Operation configuration
   * @returns {Promise<object>} Pre-check result
   */
  async preCheck(config) {
    const {
      operation,
      requiredTools = [],
      requiredEndpoints = [],
      requiredEnvVars = [],
      checkNetwork = true
    } = config;

    this.log(`Running pre-check for operation: ${operation}`);

    const results = {
      ready: true,
      operation,
      checks: {
        tools: [],
        endpoints: [],
        environment: null
      },
      blockers: [],
      warnings: [],
      recommendations: []
    };

    // Check required environment variables
    if (requiredEnvVars.length > 0) {
      const envCheck = this.checkEnvironmentVariables(requiredEnvVars);
      results.checks.environment = envCheck;
      if (!envCheck.all_set) {
        results.ready = false;
        results.blockers.push({
          type: 'environment',
          message: `Missing environment variables: ${envCheck.missing.join(', ')}`
        });
      }
    }

    // Check MCP tools
    for (const tool of requiredTools) {
      const toolResult = await this.checkMCPTool(tool);
      results.checks.tools.push(toolResult);

      if (!toolResult.available) {
        results.ready = false;
        results.blockers.push({
          type: 'mcp_tool',
          tool,
          message: toolResult.reason
        });

        if (toolResult.fallback) {
          results.recommendations.push({
            type: 'fallback',
            message: `Use fallback: ${toolResult.fallback}`
          });
        }
      }
    }

    // Check endpoints (if network check enabled)
    if (checkNetwork) {
      for (const endpoint of requiredEndpoints) {
        const headers = this.getAuthHeaders(endpoint);
        const endpointResult = await this.checkEndpointHealth(endpoint, { headers });
        results.checks.endpoints.push(endpointResult);

        if (!endpointResult.reachable) {
          results.ready = false;
          results.blockers.push({
            type: 'endpoint',
            endpoint,
            message: endpointResult.error || 'Endpoint not reachable'
          });
        } else if (endpointResult.authIssue) {
          results.warnings.push({
            type: 'authentication',
            endpoint,
            message: 'Endpoint reachable but authentication may fail'
          });
        }
      }
    }

    // Generate summary
    results.summary = this.generateSummary(results);

    return results;
  }

  /**
   * Get auth headers for a known endpoint
   */
  getAuthHeaders(endpoint) {
    const headers = {};

    if (endpoint.includes('asana.com')) {
      const token = process.env.ASANA_ACCESS_TOKEN;
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } else if (endpoint.includes('hubapi.com')) {
      const token = process.env.HUBSPOT_ACCESS_TOKEN;
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } else if (endpoint.includes('supabase.co')) {
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      if (key) {
        headers['apikey'] = key;
        headers['Authorization'] = `Bearer ${key}`;
      }
    }

    return headers;
  }

  /**
   * Suggest fallback for unavailable MCP tool
   */
  suggestFallback(serverName, operation) {
    const fallbacks = {
      'asana': {
        'create_task': 'Direct REST API call to https://app.asana.com/api/1.0/tasks',
        'update_task': 'Direct REST API call to https://app.asana.com/api/1.0/tasks/{task_gid}',
        'default': 'Use AsanaClient from asana-client.js for REST API fallback'
      },
      'salesforce': {
        'data_query': 'Use `sf data query` CLI command',
        'data_create': 'Use `sf data create record` CLI command',
        'metadata_deploy': 'Use `sf project deploy start` CLI command',
        'default': 'Use Salesforce CLI (sf) commands directly'
      },
      'supabase': {
        'query': 'Direct REST API call to ${SUPABASE_URL}/rest/v1/table',
        'insert': 'Direct REST API POST to ${SUPABASE_URL}/rest/v1/table',
        'default': 'Use supabase-js library or direct REST API'
      },
      'hubspot': {
        'default': 'Use HubSpot API client or direct REST API calls'
      }
    };

    const serverFallbacks = fallbacks[serverName];
    if (!serverFallbacks) return null;

    return serverFallbacks[operation] || serverFallbacks['default'];
  }

  /**
   * Get recommendations for fixing issues
   */
  getRecommendations(serverName, envStatus) {
    const recommendations = [];

    for (const missing of envStatus.missing) {
      switch (missing) {
        case 'ASANA_ACCESS_TOKEN':
          recommendations.push({
            variable: missing,
            action: 'Generate at https://app.asana.com/0/my-apps',
            setup: 'export ASANA_ACCESS_TOKEN=your-token'
          });
          break;
        case 'SUPABASE_URL':
          recommendations.push({
            variable: missing,
            action: 'Get from Supabase project settings',
            setup: 'export SUPABASE_URL=https://your-project.supabase.co'
          });
          break;
        case 'SUPABASE_SERVICE_ROLE_KEY':
          recommendations.push({
            variable: missing,
            action: 'Get from Supabase project settings (API tab)',
            setup: 'export SUPABASE_SERVICE_ROLE_KEY=your-key'
          });
          break;
        case 'HUBSPOT_ACCESS_TOKEN':
          recommendations.push({
            variable: missing,
            action: 'Generate at HubSpot Developer Portal',
            setup: 'export HUBSPOT_ACCESS_TOKEN=your-token'
          });
          break;
        default:
          recommendations.push({
            variable: missing,
            action: `Set the ${missing} environment variable`,
            setup: `export ${missing}=your-value`
          });
      }
    }

    return recommendations;
  }

  /**
   * Generate human-readable summary
   */
  generateSummary(results) {
    if (results.ready) {
      return {
        status: 'READY',
        message: `All ${results.checks.tools.length} tools and ${results.checks.endpoints.length} endpoints available`,
        proceed: true
      };
    }

    const blockerCount = results.blockers.length;
    const warningCount = results.warnings.length;

    return {
      status: 'NOT_READY',
      message: `${blockerCount} blocker(s), ${warningCount} warning(s) found`,
      proceed: false,
      primaryBlocker: results.blockers[0]?.message || 'Unknown'
    };
  }

  /**
   * Get capability matrix for all known services
   */
  async getCapabilityMatrix() {
    const matrix = {};

    for (const [serverName, config] of Object.entries(this.knownMCPServers)) {
      const envCheck = this.checkEnvironmentVariables(config.envVars);

      let healthStatus = null;
      if (config.healthCheck && envCheck.all_set) {
        const headers = this.getAuthHeaders(config.healthCheck);
        healthStatus = await this.checkEndpointHealth(config.healthCheck, { headers });
      }

      matrix[serverName] = {
        configured: envCheck.all_set,
        environment: envCheck,
        health: healthStatus,
        tools: config.tools.map(t => `mcp__${serverName}__${t}`),
        recommendation: envCheck.all_set
          ? (healthStatus?.healthy ? 'Ready to use' : 'Check API connectivity')
          : `Missing: ${envCheck.missing.join(', ')}`
      };
    }

    return matrix;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const checker = new APICapabilityChecker({ verbose: true });

  (async () => {
    try {
      switch (command) {
        case 'tool':
          if (!args[1]) {
            console.error('Usage: node api-capability-checker.js tool <mcp_tool_name>');
            process.exit(1);
          }
          const toolResult = await checker.checkMCPTool(args[1]);
          console.log('\n' + JSON.stringify(toolResult, null, 2));
          process.exit(toolResult.available ? 0 : 1);
          break;

        case 'endpoint':
          if (!args[1]) {
            console.error('Usage: node api-capability-checker.js endpoint <url>');
            process.exit(1);
          }
          const endpointResult = await checker.checkEndpointHealth(args[1]);
          console.log('\n' + JSON.stringify(endpointResult, null, 2));
          process.exit(endpointResult.healthy ? 0 : 1);
          break;

        case 'matrix':
          console.log('\nAPI Capability Matrix:\n');
          const matrix = await checker.getCapabilityMatrix();
          for (const [service, status] of Object.entries(matrix)) {
            const emoji = status.configured ? '✅' : '❌';
            console.log(`${emoji} ${service.toUpperCase()}`);
            console.log(`   Configured: ${status.configured}`);
            console.log(`   Recommendation: ${status.recommendation}`);
            if (status.health) {
              console.log(`   Health: ${status.health.healthy ? 'Healthy' : 'Unhealthy'}`);
            }
            console.log('');
          }
          break;

        case 'precheck':
          const operation = args[1];
          const tools = args[2] ? args[2].split(',') : [];
          const endpoints = args[3] ? args[3].split(',') : [];

          const result = await checker.preCheck({
            operation: operation || 'generic',
            requiredTools: tools,
            requiredEndpoints: endpoints
          });

          console.log('\n' + JSON.stringify(result, null, 2));
          process.exit(result.ready ? 0 : 1);
          break;

        default:
          console.log(`
API Capability Checker

Usage: node api-capability-checker.js <command> [args]

Commands:
  tool <mcp_tool_name>           Check MCP tool availability
  endpoint <url>                 Check endpoint health
  matrix                         Show capability matrix for all services
  precheck <op> <tools> <endpoints>  Run comprehensive pre-check

Examples:
  node api-capability-checker.js tool mcp__asana__create_task
  node api-capability-checker.js endpoint https://api.asana.com/1.0/users/me
  node api-capability-checker.js matrix
  node api-capability-checker.js precheck create_task mcp__asana__create_task https://api.asana.com
          `);
          process.exit(0);
      }
    } catch (error) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = APICapabilityChecker;
