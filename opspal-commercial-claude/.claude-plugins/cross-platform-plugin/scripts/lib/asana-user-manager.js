#!/usr/bin/env node

/**
 * Asana User Manager
 *
 * Manages user assignments and stakeholder mapping for Asana tasks.
 *
 * Features:
 * - Fetches and caches workspace users
 * - Maps agent names to Asana user GIDs
 * - Determines stakeholders based on phase and task type
 * - Validates user mapping configuration
 *
 * Usage:
 *   const AsanaUserManager = require('./asana-user-manager');
 *   const manager = new AsanaUserManager(workspaceId);
 *   const assignee = await manager.getAssigneeForAgent('sfdc-metadata-manager');
 *   const followers = await manager.getStakeholderGIDs(['technical_lead', 'qa_lead']);
 *
 * CLI Commands:
 *   node asana-user-manager.js fetch-users    - Fetch and display workspace users
 *   node asana-user-manager.js validate       - Validate configuration
 *   node asana-user-manager.js setup          - Interactive setup wizard
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

class AsanaUserManager {
  constructor(workspaceId = null, configPath = null) {
    this.workspaceId = workspaceId || process.env.ASANA_WORKSPACE_ID || 'REDACTED_WORKSPACE_ID';
    this.token = process.env.ASANA_ACCESS_TOKEN;

    if (!this.token) {
      throw new Error('ASANA_ACCESS_TOKEN environment variable is required');
    }

    // Default config path
    this.configPath = configPath || path.join(
      __dirname, '../../config/asana-user-mapping.json'
    );

    // Load configuration
    this.config = this.loadConfig();

    // User cache (in-memory, expires after 1 hour)
    this.userCache = null;
    this.cacheExpiry = null;
  }

  /**
   * Load user mapping configuration from JSON file
   */
  loadConfig() {
    try {
      if (!fs.existsSync(this.configPath)) {
        console.warn(`⚠️  Configuration file not found: ${this.configPath}`);
        return this.getDefaultConfig();
      }

      const configData = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.error(`❌ Error loading configuration: ${error.message}`);
      return this.getDefaultConfig();
    }
  }

  /**
   * Get default configuration structure
   */
  getDefaultConfig() {
    return {
      version: '1.0.0',
      workspaceId: this.workspaceId,
      agentToUserMapping: {},
      stakeholderRoles: {},
      phaseStakeholders: {},
      taskTypeStakeholders: {}
    };
  }

  /**
   * Save configuration to JSON file
   */
  saveConfig() {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      this.config.lastUpdated = new Date().toISOString().split('T')[0];
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf8'
      );

      console.log(`✅ Configuration saved to ${this.configPath}`);
      return true;
    } catch (error) {
      console.error(`❌ Error saving configuration: ${error.message}`);
      return false;
    }
  }

  /**
   * Make Asana API request
   */
  asanaRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'app.asana.com',
        path: `/api/1.0${path}`,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed.data);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      if (data) req.write(JSON.stringify({ data }));
      req.end();
    });
  }

  /**
   * Fetch all users in the workspace
   * @param {boolean} forceRefresh - Force cache refresh
   * @returns {Promise<Array>} Array of user objects
   */
  async getWorkspaceUsers(forceRefresh = false) {
    // Check cache
    if (!forceRefresh && this.userCache && this.cacheExpiry > Date.now()) {
      console.log('📦 Using cached workspace users');
      return this.userCache;
    }

    console.log('🔄 Fetching workspace users from Asana...');

    try {
      const users = await this.asanaRequest('GET', `/workspaces/${this.workspaceId}/users`);

      // Cache for 1 hour
      this.userCache = users;
      this.cacheExpiry = Date.now() + (60 * 60 * 1000);

      console.log(`✅ Found ${users.length} users in workspace`);
      return users;
    } catch (error) {
      console.error(`❌ Error fetching workspace users: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get assignee GID for a given agent name
   * @param {string} agentName - Name of the agent (e.g., 'sfdc-metadata-manager')
   * @returns {string|null} Asana user GID or null
   */
  getAssigneeForAgent(agentName) {
    const mapping = this.config.agentToUserMapping[agentName];

    if (!mapping) {
      console.warn(`⚠️  No user mapping found for agent: ${agentName}`);
      return this.config.defaultAssigneeGid || null;
    }

    if (!mapping.assigneeGid) {
      console.warn(`⚠️  Agent "${agentName}" has no assignee GID configured`);
      return this.config.defaultAssigneeGid || null;
    }

    return mapping.assigneeGid;
  }

  /**
   * Get stakeholder GIDs for given roles
   * @param {Array<string>} roles - Array of role names (e.g., ['technical_lead', 'qa_lead'])
   * @returns {Array<string>} Array of user GIDs
   */
  getStakeholderGIDs(roles) {
    if (!Array.isArray(roles)) {
      roles = [roles];
    }

    const gids = [];

    for (const role of roles) {
      const stakeholder = this.config.stakeholderRoles[role];

      if (!stakeholder) {
        console.warn(`⚠️  No stakeholder configuration found for role: ${role}`);
        continue;
      }

      if (!stakeholder.gid) {
        console.warn(`⚠️  Role "${role}" has no GID configured`);
        continue;
      }

      gids.push(stakeholder.gid);
    }

    return gids;
  }

  /**
   * Get stakeholders for a specific phase
   * @param {string} phase - Phase name (e.g., 'foundation', 'configuration')
   * @returns {Array<string>} Array of user GIDs
   */
  getPhaseStakeholders(phase) {
    const phaseKey = phase.toLowerCase();
    const roles = this.config.phaseStakeholders[phaseKey] || [];
    return this.getStakeholderGIDs(roles);
  }

  /**
   * Get stakeholders for a specific task type
   * @param {string} taskType - Task type (e.g., 'data', 'functional', 'technical')
   * @returns {Array<string>} Array of user GIDs
   */
  getTaskTypeStakeholders(taskType) {
    const typeKey = taskType.toLowerCase();
    const roles = this.config.taskTypeStakeholders[typeKey] || [];
    return this.getStakeholderGIDs(roles);
  }

  /**
   * Get combined stakeholders for phase + task type
   * @param {string} phase - Phase name
   * @param {string} taskType - Task type
   * @returns {Array<string>} Unique array of user GIDs
   */
  getCombinedStakeholders(phase, taskType) {
    const phaseStakeholders = this.getPhaseStakeholders(phase);
    const typeStakeholders = this.getTaskTypeStakeholders(taskType);

    // Combine and deduplicate
    const combined = [...new Set([...phaseStakeholders, ...typeStakeholders])];
    return combined;
  }

  /**
   * Validate configuration
   * @returns {Object} Validation results
   */
  async validateConfiguration() {
    console.log('🔍 Validating Asana user mapping configuration...\n');

    const results = {
      valid: true,
      errors: [],
      warnings: [],
      stats: {
        totalAgents: 0,
        configuredAgents: 0,
        totalRoles: 0,
        configuredRoles: 0
      }
    };

    // Validate workspace ID
    if (!this.config.workspaceId) {
      results.errors.push('Missing workspace ID in configuration');
      results.valid = false;
    }

    // Validate agent mappings
    const agents = this.config.agentToUserMapping || {};
    results.stats.totalAgents = Object.keys(agents).length;

    for (const [agentName, mapping] of Object.entries(agents)) {
      if (mapping.assigneeGid) {
        results.stats.configuredAgents++;
      } else {
        results.warnings.push(`Agent "${agentName}" has no assignee GID`);
      }
    }

    // Validate stakeholder roles
    const roles = this.config.stakeholderRoles || {};
    results.stats.totalRoles = Object.keys(roles).length;

    for (const [roleName, role] of Object.entries(roles)) {
      if (role.gid) {
        results.stats.configuredRoles++;
      } else {
        results.warnings.push(`Role "${roleName}" has no GID configured`);
      }
    }

    // Try to fetch workspace users to verify token
    try {
      await this.getWorkspaceUsers(true);
    } catch (error) {
      results.errors.push(`Cannot access workspace users: ${error.message}`);
      results.valid = false;
    }

    // Print results
    console.log('📊 Validation Results:\n');
    console.log(`Workspace ID: ${this.config.workspaceId}`);
    console.log(`Agent Mappings: ${results.stats.configuredAgents}/${results.stats.totalAgents} configured`);
    console.log(`Stakeholder Roles: ${results.stats.configuredRoles}/${results.stats.totalRoles} configured`);
    console.log('');

    if (results.errors.length > 0) {
      console.log('❌ Errors:');
      results.errors.forEach(err => console.log(`  - ${err}`));
      console.log('');
    }

    if (results.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      results.warnings.forEach(warn => console.log(`  - ${warn}`));
      console.log('');
    }

    if (results.valid && results.errors.length === 0) {
      console.log('✅ Configuration is valid');
    } else {
      console.log('❌ Configuration has errors that must be fixed');
    }

    return results;
  }

  /**
   * Fetch workspace users and update configuration
   */
  async updateConfigurationWithUsers() {
    console.log('🔄 Fetching workspace users and updating configuration...\n');

    const users = await this.getWorkspaceUsers(true);

    console.log('📋 Workspace Users:\n');
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email || 'no email'})`);
      console.log(`   GID: ${user.gid}`);
      console.log('');
    });

    console.log('💡 Next Steps:');
    console.log('1. Edit the configuration file: ' + this.configPath);
    console.log('2. Update agent assigneeGid values with user GIDs above');
    console.log('3. Update stakeholder role GIDs with user GIDs above');
    console.log('4. Run: node asana-user-manager.js validate');
    console.log('');

    return users;
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];

  const manager = new AsanaUserManager();

  (async () => {
    try {
      switch (command) {
        case 'fetch-users':
          await manager.updateConfigurationWithUsers();
          break;

        case 'validate':
          await manager.validateConfiguration();
          break;

        case 'setup':
          console.log('🚀 Asana User Manager Setup\n');
          console.log('This wizard will help you configure user assignments.\n');
          await manager.updateConfigurationWithUsers();
          break;

        default:
          console.log('Asana User Manager\n');
          console.log('Usage:');
          console.log('  node asana-user-manager.js fetch-users    - Fetch and display workspace users');
          console.log('  node asana-user-manager.js validate       - Validate configuration');
          console.log('  node asana-user-manager.js setup          - Run setup wizard');
          console.log('');
          console.log('Configuration file: ' + manager.configPath);
          process.exit(1);
      }
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = AsanaUserManager;
