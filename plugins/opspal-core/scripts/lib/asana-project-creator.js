#!/usr/bin/env node

/**
 * Asana Project Creator
 *
 * Creates Asana projects with full support for organizations (requires team parameter).
 *
 * Features:
 * - Detects workspace type (personal vs organization)
 * - Lists available teams in organization workspaces
 * - Creates projects with team assignment
 * - Search for existing projects before creating duplicates
 * - Comprehensive project setup with description, owner, privacy
 *
 * Usage:
 *   const AsanaProjectCreator = require('./asana-project-creator');
 *   const creator = new AsanaProjectCreator();
 *
 *   // Auto-detect and create
 *   const project = await creator.createOrFindProject('My Project', 'Project description');
 *
 *   // Create with specific team
 *   const project = await creator.createProject({
 *     name: 'My Project',
 *     notes: 'Project description',
 *     team: 'teamGid'
 *   });
 *
 * API Reference:
 *   POST /workspaces/{workspace_gid}/projects
 *   Body (Personal): { "data": { "name": "...", "workspace": "..." } }
 *   Body (Organization): { "data": { "name": "...", "workspace": "...", "team": "..." } }
 */

const https = require('https');

class AsanaProjectCreator {
  constructor(workspaceId = null) {
    this.workspaceId = workspaceId || process.env.ASANA_WORKSPACE_ID || 'REDACTED_ASANA_WORKSPACE';
    this.token = process.env.ASANA_ACCESS_TOKEN;

    if (!this.token) {
      throw new Error('ASANA_ACCESS_TOKEN environment variable is required');
    }

    // Cache workspace type and teams
    this.workspaceType = null;
    this.teams = null;
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
   * Detect workspace type (personal vs organization)
   * @returns {Promise<Object>} Workspace details including type
   */
  async detectWorkspaceType() {
    if (this.workspaceType !== null) {
      return this.workspaceType;
    }

    console.log('🔍 Detecting workspace type...');

    try {
      const workspace = await this.asanaRequest('GET', `/workspaces/${this.workspaceId}`);

      this.workspaceType = {
        gid: workspace.gid,
        name: workspace.name,
        isOrganization: workspace.is_organization || false,
        type: workspace.is_organization ? 'organization' : 'personal'
      };

      console.log(`✅ Workspace type: ${this.workspaceType.type}`);
      console.log(`   Name: ${this.workspaceType.name}`);

      return this.workspaceType;
    } catch (error) {
      console.error(`❌ Error detecting workspace type: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get available teams in organization workspace
   * @returns {Promise<Array>} Array of team objects
   */
  async getWorkspaceTeams() {
    const workspaceType = await this.detectWorkspaceType();

    if (!workspaceType.isOrganization) {
      console.log('ℹ️  Personal workspace - teams not applicable');
      return [];
    }

    if (this.teams !== null) {
      console.log('📦 Using cached teams');
      return this.teams;
    }

    console.log('🔄 Fetching teams...');

    try {
      this.teams = await this.asanaRequest('GET', `/organizations/${this.workspaceId}/teams`);

      console.log(`✅ Found ${this.teams.length} teams:`);
      this.teams.forEach((team, i) => {
        console.log(`   ${i + 1}. ${team.name} (${team.gid})`);
      });

      return this.teams;
    } catch (error) {
      console.error(`❌ Error fetching teams: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search for existing project by name
   * @param {string} name - Project name to search for
   * @returns {Promise<Object|null>} Project object if found, null otherwise
   */
  async searchProject(name) {
    console.log(`🔍 Searching for existing project: "${name}"...`);

    try {
      const projects = await this.asanaRequest(
        'GET',
        `/workspaces/${this.workspaceId}/projects?archived=false`
      );

      // Case-insensitive name match
      const match = projects.find(
        p => p.name.toLowerCase() === name.toLowerCase()
      );

      if (match) {
        console.log(`✅ Found existing project: ${match.name} (${match.gid})`);
        return match;
      } else {
        console.log(`ℹ️  No existing project found with name: "${name}"`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error searching projects: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new Asana project
   * @param {Object} options - Project creation options
   * @param {string} options.name - Project name (required)
   * @param {string} options.notes - Project description
   * @param {string} options.team - Team GID (required for organizations)
   * @param {string} options.owner - Owner user GID
   * @param {string} options.color - Project color
   * @param {string} options.privacy - 'public' or 'private'
   * @returns {Promise<Object>} Created project object
   */
  async createProject(options) {
    const { name, notes, team, owner, color, privacy } = options;

    if (!name) {
      throw new Error('Project name is required');
    }

    // Detect workspace type
    const workspaceType = await this.detectWorkspaceType();

    console.log(`\n🚀 Creating project: "${name}"...`);
    console.log(`   Workspace: ${workspaceType.name} (${workspaceType.type})`);

    // Build request body
    const projectData = {
      name,
      workspace: this.workspaceId
    };

    if (notes) {
      projectData.notes = notes;
    }

    if (owner) {
      projectData.owner = owner;
    }

    if (color) {
      projectData.color = color;
    }

    if (privacy) {
      projectData.privacy_setting = privacy;
    }

    // For organizations, team is REQUIRED
    if (workspaceType.isOrganization) {
      if (!team) {
        console.log('\n⚠️  Organization workspace requires team parameter');
        console.log('   Fetching available teams...');

        const teams = await this.getWorkspaceTeams();

        if (teams.length === 0) {
          throw new Error('No teams available in organization');
        }

        // Use first team as default
        projectData.team = teams[0].gid;
        console.log(`   Using default team: ${teams[0].name} (${teams[0].gid})`);
      } else {
        projectData.team = team;
      }
    }

    try {
      const project = await this.asanaRequest(
        'POST',
        `/workspaces/${this.workspaceId}/projects`,
        projectData
      );

      console.log(`\n✅ Project created successfully!`);
      console.log(`   Name: ${project.name}`);
      console.log(`   GID: ${project.gid}`);
      console.log(`   URL: https://app.asana.com/0/${project.gid}`);

      return project;
    } catch (error) {
      console.error(`\n❌ Error creating project: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create project or find existing
   * @param {string} name - Project name
   * @param {string} notes - Project description
   * @param {boolean} searchFirst - Search before creating (default true)
   * @param {Object} options - Additional creation options
   * @returns {Promise<Object>} Project object (created or found)
   */
  async createOrFindProject(name, notes = '', searchFirst = true, options = {}) {
    // Search for existing project first
    if (searchFirst) {
      const existing = await this.searchProject(name);

      if (existing) {
        console.log(`\nℹ️  Using existing project instead of creating new one`);
        return {
          ...existing,
          wasCreated: false,
          wasFound: true
        };
      }
    }

    // Create new project
    const project = await this.createProject({
      name,
      notes,
      ...options
    });

    return {
      ...project,
      wasCreated: true,
      wasFound: false
    };
  }

  /**
   * Get project details
   * @param {string} projectGid - Project GID
   * @returns {Promise<Object>} Full project object
   */
  async getProject(projectGid) {
    try {
      const project = await this.asanaRequest('GET', `/projects/${projectGid}`);
      return project;
    } catch (error) {
      console.error(`❌ Error fetching project: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update project details
   * @param {string} projectGid - Project GID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated project object
   */
  async updateProject(projectGid, updates) {
    console.log(`🔄 Updating project ${projectGid}...`);

    try {
      const project = await this.asanaRequest(
        'PUT',
        `/projects/${projectGid}`,
        updates
      );

      console.log(`✅ Project updated successfully`);
      return project;
    } catch (error) {
      console.error(`❌ Error updating project: ${error.message}`);
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const name = process.argv[3];
  const notes = process.argv[4];

  const creator = new AsanaProjectCreator();

  (async () => {
    try {
      switch (command) {
        case 'detect':
          await creator.detectWorkspaceType();
          break;

        case 'teams':
          await creator.getWorkspaceTeams();
          break;

        case 'search':
          if (!name) {
            console.error('Usage: node asana-project-creator.js search <name>');
            process.exit(1);
          }
          await creator.searchProject(name);
          break;

        case 'create':
          if (!name) {
            console.error('Usage: node asana-project-creator.js create <name> [notes]');
            process.exit(1);
          }
          await creator.createOrFindProject(name, notes || '', false);
          break;

        case 'create-or-find':
          if (!name) {
            console.error('Usage: node asana-project-creator.js create-or-find <name> [notes]');
            process.exit(1);
          }
          await creator.createOrFindProject(name, notes || '', true);
          break;

        default:
          console.log('Asana Project Creator\n');
          console.log('Usage:');
          console.log('  node asana-project-creator.js detect              - Detect workspace type');
          console.log('  node asana-project-creator.js teams               - List available teams');
          console.log('  node asana-project-creator.js search <name>       - Search for project');
          console.log('  node asana-project-creator.js create <name> [notes] - Create new project');
          console.log('  node asana-project-creator.js create-or-find <name> [notes] - Search then create');
          console.log('');
          console.log('Examples:');
          console.log('  node asana-project-creator.js detect');
          console.log('  node asana-project-creator.js create "CPQ Implementation" "Salesforce CPQ setup"');
          console.log('  node asana-project-creator.js create-or-find "Field Cleanup" "Account field audit"');
          process.exit(1);
      }
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = AsanaProjectCreator;
