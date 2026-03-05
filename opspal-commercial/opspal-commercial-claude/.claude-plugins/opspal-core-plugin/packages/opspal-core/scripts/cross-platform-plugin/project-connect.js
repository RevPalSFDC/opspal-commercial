#!/usr/bin/env node

/**
 * Project Connect - Customer Onboarding Orchestrator
 *
 * Autonomous workflow for onboarding customers across:
 * - Supabase (central directory)
 * - GitHub (code repositories)
 * - Google Drive (document storage)
 * - Asana (project management)
 *
 * Features:
 * - Connect-first strategy (prefer existing resources)
 * - Idempotent operations (safe to retry)
 * - Comprehensive logging
 * - Dry-run mode
 * - Rollback on failure
 *
 * Usage:
 *   node project-connect.js \
 *     --customer "Acme Robotics" \
 *     --aliases "Acme Robo,ACME-R" \
 *     --created-by "user@example.com" \
 *     --mode execute \
 *     --dry-run false
 */

const GitHubRepoManager = require('./lib/github-repo-manager');
const GoogleDriveManager = require('./lib/google-drive-manager');
const SupabaseDirectoryManager = require('./lib/supabase-directory-manager');
const AsanaAuthHelper = require('./lib/asana-auth-helper');
const GoogleDriveAuthHelper = require('./lib/google-drive-auth-helper');
const DependencyChecker = require('./lib/dependency-checker');

class ProjectConnect {
  constructor(options = {}) {
    this.customer = options.customer;
    this.aliases = options.aliases || [];
    this.createdBy = options.createdBy || this._detectUserEmail();
    this.mode = options.mode || 'plan';
    this.dryRun = options.dryRun !== false; // Default to true
    this.verbose = options.verbose || false;

    // Optional configuration
    this.customerId = options.customerId || null;
    this.githubOrg = options.githubOrg || null;
    this.driveParentId = options.driveParentId || null;
    this.driveMode = options.driveMode || 'auto';

    // Initialize managers
    this.github = new GitHubRepoManager({
      verbose: this.verbose,
      dryRun: this.dryRun,
      orgName: this.githubOrg
    });

    this.drive = new GoogleDriveManager({
      verbose: this.verbose,
      dryRun: this.dryRun,
      mode: this.driveMode,
      parentFolderId: this.driveParentId
    });

    this.supabase = new SupabaseDirectoryManager({
      verbose: this.verbose,
      dryRun: this.dryRun
    });

    this.asanaAuth = new AsanaAuthHelper({
      verbose: this.verbose
    });

    this.driveAuth = new GoogleDriveAuthHelper({
      verbose: this.verbose
    });

    // Tracking
    this.createdResources = [];
    this.logs = [];
    this.plan = [];
  }

  /**
   * Execute Project Connect workflow
   */
  async execute() {
    try {
      this.log('Starting Project Connect workflow');
      this.log('Configuration', {
        customer: this.customer,
        mode: this.mode,
        dryRun: this.dryRun
      });

      // Phase 0: Check Dependencies
      const dependencyChecker = new DependencyChecker({ verbose: false });
      const dependencyResults = dependencyChecker.checkAll();

      if (!dependencyResults.passed) {
        throw new Error('Missing required dependencies. Please install them and try again.');
      }

      // Phase 0 (continued): Check Asana Authentication (per-user, not service account)
      console.log('\n🔐 Checking Asana authentication...');
      const authStatus = this.asanaAuth.checkAuthentication();

      if (!authStatus.authenticated) {
        console.log('\n⚠️  Asana authentication not configured for your user.');
        this.asanaAuth.displaySetupInstructions();

        console.log('\n💡 TIP: You can still use Project Connect without Asana.');
        console.log('   GitHub and Drive will work, Asana will be skipped.\n');

        // Allow proceeding without Asana (graceful degradation)
        this.asanaEnabled = false;
      } else {
        console.log('✅ Asana authentication found');
        this.asanaEnabled = true;

        // Optionally test the token
        if (this.verbose) {
          console.log('   Testing token...');
          const testResult = await this.asanaAuth.testToken();
          if (testResult.valid) {
            console.log('   ✅ Token validated successfully');
          } else {
            console.warn(`   ⚠️  Token validation warning: ${testResult.message}`);
          }
        }
      }

      // Phase 0 (continued): Check Google Drive OAuth Authentication
      console.log('\n🔐 Checking Google Drive authentication...');
      const driveAuthStatus = this.driveAuth.checkAuthentication();

      if (!driveAuthStatus.authenticated) {
        console.log('\n⚠️  Google Drive OAuth not configured for your user.');

        if (this.driveMode === 'api') {
          // API mode requires authentication
          console.log('⚠️  Drive mode is set to "api" but OAuth is not configured.\n');
          this.driveAuth.displaySetupInstructions();
          console.log('\n💡 TIP: Set --drive-mode=auto to fall back to manual mode, or');
          console.log('        set --drive-mode=manual to skip OAuth entirely.\n');
          this.driveEnabled = false;
          this.drive.mode = 'manual'; // Override to manual mode
        } else {
          // Auto or manual mode - graceful degradation
          console.log('   Falling back to manual mode for Drive folder creation.');
          console.log('   You will need to create folders manually and provide folder IDs.\n');
          this.driveEnabled = false;
          this.drive.mode = 'manual';
        }
      } else {
        console.log('✅ Google Drive authentication found');
        this.driveEnabled = true;

        // Optionally test access
        if (this.verbose) {
          console.log('   Testing Drive access...');
          const driveTestResult = await this.driveAuth.testAccess();
          if (driveTestResult.valid) {
            console.log(`   ✅ Drive access verified (${driveTestResult.user.email})`);
          } else {
            console.warn(`   ⚠️  Drive access warning: ${driveTestResult.message}`);
            this.driveEnabled = false;
            this.drive.mode = 'manual';
          }
        }
      }

      // Phase 1: Validate
      this._validate();

      // Phase 2: State Discovery
      const discovery = await this._discover();

      // Phase 3: Decision
      const decision = this._decide(discovery);

      // Phase 4: Execution
      const result = await this._executeDecision(decision, discovery);

      // Phase 5: Output
      return this._formatOutput(result, discovery);

    } catch (error) {
      this.log('Error in Project Connect workflow', error);

      // Attempt rollback
      await this._rollback();

      throw error;
    }
  }

  /**
   * Phase 1: Validate inputs
   */
  _validate() {
    this.log('Validating inputs');

    if (!this.customer || this.customer.trim() === '') {
      throw new Error('Customer name is required');
    }

    if (!this.createdBy || !this.createdBy.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error('Valid createdBy email is required');
    }

    if (!['plan', 'execute'].includes(this.mode)) {
      throw new Error('Mode must be "plan" or "execute"');
    }

    this.plan.push({
      step: 1,
      action: 'validate',
      details: `Validated customer: ${this.customer}, mode: ${this.mode}, dryRun: ${this.dryRun}`
    });
  }

  /**
   * Phase 2: State Discovery
   */
  async _discover() {
    this.log('Discovering state');

    this.plan.push({
      step: 2,
      action: 'discover',
      details: 'Query Supabase and probe external systems'
    });

    // Query Supabase
    const supabaseQuery = await this.supabase.queryCustomer({
      customer: this.customer,
      aliases: this.aliases
    });

    let customerId = this.customerId;

    // If match found, use existing customerId
    if (supabaseQuery.match) {
      customerId = supabaseQuery.customerId;
      this.log('Existing customer found', customerId);
    } else {
      // Generate new customerId
      if (!customerId) {
        customerId = this.supabase.generateCustomerId(this.customer);
      }
      this.log('New customer - generated ID', customerId);
    }

    // Probe external systems
    const [githubResult, driveResult] = await Promise.all([
      this.github.findRepo({
        customerId,
        customer: this.customer,
        aliases: this.aliases
      }),
      this.drive.findFolder({
        customerId,
        customer: this.customer,
        aliases: this.aliases
      })
    ]);

    // TODO: Add Asana search via MCP when available
    const asanaResult = { exists: false };

    return {
      customerId,
      supabaseRecord: supabaseQuery.record || null,
      github: githubResult,
      drive: driveResult,
      asana: asanaResult
    };
  }

  /**
   * Phase 3: Decide on connect vs create
   */
  _decide(discovery) {
    this.log('Making decision');

    const hasMatch = discovery.supabaseRecord !== null;
    const hasAnyResource = discovery.github.exists || discovery.drive.exists || discovery.asana.exists;

    let strategy;

    if (hasMatch || hasAnyResource) {
      strategy = 'connect_and_fill_gaps';
      this.log('Strategy: Connect to existing resources and fill gaps');
    } else {
      strategy = 'create_all';
      this.log('Strategy: Create all new resources');
    }

    this.plan.push({
      step: 3,
      action: 'decide',
      details: `Strategy: ${strategy}`
    });

    return { strategy, discovery };
  }

  /**
   * Phase 4: Execute decision
   */
  async _executeDecision(decision, discovery) {
    this.log('Executing decision');

    const { customerId } = discovery;
    const result = {
      customerId,
      github: null,
      drive: null,
      asana: null
    };

    // GitHub
    if (discovery.github.exists) {
      result.github = discovery.github;
      await this._logAccess({
        customerId,
        system: 'github',
        systemId: result.github.name,
        object: 'repo',
        action: 'connect'
      });
    } else {
      const repoName = this.github.generateRepoName(customerId, this.customer);
      result.github = await this.github.createRepo({
        name: repoName,
        visibility: 'private',
        description: `${this.customer} RevPal Project`
      });
      this.createdResources.push({ system: 'github', id: repoName });
      await this._logAccess({
        customerId,
        system: 'github',
        systemId: repoName,
        object: 'repo',
        action: result.github.created ? 'create' : 'connect'
      });
    }

    // Google Drive
    if (discovery.drive.exists) {
      result.drive = discovery.drive;
      await this._logAccess({
        customerId,
        system: 'drive',
        systemId: result.drive.folderId,
        object: 'folder',
        action: 'connect'
      });
    } else {
      const folderName = this.drive.generateFolderName(this.customer, customerId);
      result.drive = await this.drive.createFolder({
        name: folderName,
        parentId: this.driveParentId
      });
      this.createdResources.push({ system: 'drive', id: result.drive.folderId });
      await this._logAccess({
        customerId,
        system: 'drive',
        systemId: result.drive.folderId,
        object: 'folder',
        action: result.drive.created ? 'create' : 'connect'
      });
    }

    // Asana (per-user authentication required)
    if (this.asanaEnabled) {
      try {
        console.log('\n📋 Searching for Asana project...');

        const workspaceId = process.env.ASANA_WORKSPACE_ID || 'REDACTED_WORKSPACE_ID';
        const projectName = `RevPal – ${this.customer}`;

        // Build search pattern - use regex to match project name
        const searchPattern = projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Search for existing project using Asana API (MCP tools not available in script context)
        // For now, we use curl to call Asana API directly with user's token
        const { execSync } = require('child_process');
        const token = process.env.ASANA_ACCESS_TOKEN;

        let existingProjects = [];
        try {
          const searchCmd = `curl -s -H "Authorization: Bearer ${token}" "https://app.asana.com/api/1.0/workspaces/${workspaceId}/projects?archived=false&limit=100"`;
          const response = execSync(searchCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
          const data = JSON.parse(response);

          if (data.data && Array.isArray(data.data)) {
            // Filter projects by name match
            existingProjects = data.data.filter(project =>
              project.name === projectName ||
              project.name.toLowerCase().includes(this.customer.toLowerCase())
            );
          }
        } catch (searchError) {
          console.warn('⚠️  Asana search failed, using manual mode:', searchError.message);
        }

        if (existingProjects.length > 0) {
          // Connect to existing project
          console.log(`✅ Found existing Asana project: ${existingProjects[0].name}`);
          result.asana = {
            exists: true,
            created: false,
            connected: true,
            projectId: existingProjects[0].gid,
            projectUrl: `https://app.asana.com/0/${existingProjects[0].gid}`,
            projectName: existingProjects[0].name,
            projects: existingProjects
          };

          await this._logAccess({
            customerId,
            system: 'asana',
            systemId: existingProjects[0].gid,
            object: 'project',
            action: 'connect'
          });
        } else {
          // Project doesn't exist - provide manual creation instructions
          console.log(`\n⚠️  No existing Asana project found for "${projectName}"`);
          console.log('\n📝 Manual Asana Project Creation Required:');
          console.log('┌────────────────────────────────────────────────────────────────┐');
          console.log('│ 1. Go to: https://app.asana.com/0/REDACTED_WORKSPACE_ID            │');
          console.log(`│ 2. Click "New Project"                                         │`);
          console.log(`│ 3. Name: "${projectName}"                                      │`);
          console.log('│ 4. Set visibility: Private (default)                           │');
          console.log('│ 5. Click "Create Project"                                      │');
          console.log('│ 6. Copy the project URL                                        │');
          console.log('│ 7. Run Project Connect again with --asana-project-id=<GID>    │');
          console.log('└────────────────────────────────────────────────────────────────┘');

          result.asana = {
            exists: false,
            created: false,
            manualRequired: true,
            projectName,
            workspaceId,
            workspaceUrl: `https://app.asana.com/0/${workspaceId}`,
            instructions: 'Manual project creation required - see console output'
          };

          // Note: Asana MCP doesn't currently support project creation
          // This is a known limitation - projects must be created manually
          // or via Asana API directly (not through MCP)
        }
      } catch (error) {
        console.error('❌ Asana integration error:', error.message);
        result.asana = {
          exists: false,
          created: false,
          error: error.message,
          userAuthenticated: true,
          fallback: 'Asana integration failed - continuing without Asana'
        };
      }
    } else {
      console.log('\n⏭️  Skipping Asana (user not authenticated)');
      result.asana = {
        exists: false,
        created: false,
        projects: [],
        skipped: true,
        message: 'Asana skipped - user authentication required',
        userAuthenticated: false
      };
    }

    // Upsert Supabase directory
    const asanaProjectIds = result.asana && result.asana.projectId ? [result.asana.projectId] : [];
    const asanaProjectUrls = result.asana && result.asana.projectUrl ? [result.asana.projectUrl] : [];

    const directoryResult = await this.supabase.upsertCustomerDirectory({
      customerId,
      customer: this.customer,
      aliases: this.aliases,
      githubRepo: result.github.name,
      githubRepoUrl: result.github.url,
      driveFolderId: result.drive.folderId,
      driveFolderUrl: result.drive.url,
      asanaProjectIds,
      asanaProjectUrls,
      createdBy: this.createdBy,
      lastAccessedBy: this.createdBy
    });

    // Build execution summary
    const asanaStatus = result.asana.connected ? 'connected' :
                       result.asana.manualRequired ? 'manual required' :
                       result.asana.skipped ? 'skipped' : 'not configured';

    this.plan.push({
      step: 4,
      action: 'execute',
      details: `GitHub: ${result.github.created ? 'created' : 'connected'}, Drive: ${result.drive.created ? 'created' : 'connected'}, Asana: ${asanaStatus}`
    });

    // Confirm project accessed
    await this._logAccess({
      customerId,
      system: 'supabase',
      systemId: customerId,
      object: 'project_access',
      action: 'confirm'
    });

    this.plan.push({
      step: 5,
      action: 'confirm',
      details: 'Project accessed and directory updated'
    });

    return {
      ...result,
      supabaseRecord: directoryResult.record,
      supabaseBefore: discovery.supabaseRecord,
      supabaseAfter: directoryResult.record
    };
  }

  /**
   * Log access operation
   */
  async _logAccess(entry) {
    const logResult = await this.supabase.logAccess({
      ...entry,
      userEmail: this.createdBy,
      runningScript: 'project-connect'
    });

    this.logs.push({
      system: entry.system,
      systemId: entry.systemId,
      object: entry.object,
      action: entry.action,
      date: new Date().toISOString(),
      user: this.createdBy,
      logId: logResult.logId
    });
  }

  /**
   * Rollback created resources
   */
  async _rollback() {
    if (this.createdResources.length === 0) {
      return;
    }

    console.error('\n🔄 Rolling back created resources...\n');

    for (const resource of this.createdResources.reverse()) {
      try {
        switch (resource.system) {
          case 'github':
            await this.github.deleteRepo(resource.id);
            console.log(`✅ Rolled back GitHub repo: ${resource.id}`);
            break;
          case 'drive':
            await this.drive.deleteFolder(resource.id);
            console.log(`✅ Rolled back Drive folder: ${resource.id}`);
            break;
          default:
            console.warn(`⚠️  Cannot rollback ${resource.system}: ${resource.id}`);
        }
      } catch (error) {
        console.error(`❌ Failed to rollback ${resource.system}: ${error.message}`);
      }
    }
  }

  /**
   * Format output
   */
  _formatOutput(result, discovery) {
    const output = {
      plan: this.plan,
      result: {
        customerId: result.customerId,
        github: {
          exists: discovery.github.exists,
          created: result.github.created || false,
          url: result.github.url,
          name: result.github.name
        },
        drive: {
          exists: discovery.drive.exists,
          created: result.drive.created || false,
          folderId: result.drive.folderId,
          url: result.drive.url,
          name: result.drive.name
        },
        asana: result.asana
      },
      supabase: {
        before: result.supabaseBefore,
        after: result.supabaseAfter
      },
      logs: this.logs,
      dryRun: this.dryRun,
      notes: []
    };

    // Add notes for manual actions
    if (result.drive.manualRequired) {
      output.notes.push('Manual Google Drive folder creation required - see instructions');
    }

    return output;
  }

  /**
   * Log message
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[ProjectConnect] ${message}`, data !== null ? data : '');
    }
  }

  /**
   * Generate human-friendly summary
   */
  static generateSummary(output) {
    const { customerId, github, drive, asana } = output.result;

    const actions = [];

    if (github.created) {
      actions.push('Created GitHub repository');
    } else if (github.exists) {
      actions.push('Connected to existing GitHub repository');
    }

    if (drive.created) {
      actions.push('Created Google Drive folder');
    } else if (drive.exists) {
      actions.push('Connected to existing Google Drive folder');
    }

    if (asana.created) {
      actions.push('Created Asana project');
    } else if (asana.exists) {
      actions.push('Connected to existing Asana project');
    }

    const summary = `
✅ Project Connect completed successfully for ${output.result.github.name.replace('revpal-', '').replace(/-/g, ' ')} (${customerId}).
${actions.join('. ')}.
Updated Supabase directory and logged ${output.logs.length} access operations.
All resources are now linked and ready for team collaboration.
    `.trim();

    return summary;
  }

  /**
   * Automatically detect user email from environment or git config
   *
   * Priority order:
   * 1. USER_EMAIL environment variable
   * 2. REVPAL_USER_EMAIL environment variable
   * 3. Git config user.email
   * 4. null (caller must prompt)
   *
   * @private
   * @returns {string|null} User email or null if not found
   */
  _detectUserEmail() {
    // Check environment variables first
    if (process.env.USER_EMAIL) {
      this.log('Detected email from USER_EMAIL environment variable');
      return process.env.USER_EMAIL;
    }

    if (process.env.REVPAL_USER_EMAIL) {
      this.log('Detected email from REVPAL_USER_EMAIL environment variable');
      return process.env.REVPAL_USER_EMAIL;
    }

    // Try git config
    try {
      const { execSync } = require('child_process');
      const gitEmail = execSync('git config --get user.email', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
      }).trim();

      if (gitEmail && gitEmail.includes('@')) {
        this.log('Detected email from git config');
        return gitEmail;
      }
    } catch (error) {
      // Git config not set or git not available - that's ok
      this.log('Git config user.email not found');
    }

    // No email found - caller will need to prompt
    this.log('No user email detected - will need to prompt');
    return null;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  const parseArgs = () => {
    const parsed = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].substring(2);
        const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
        parsed[key] = value;
        if (value !== true) i++;
      }
    }
    return parsed;
  };

  const options = parseArgs();

  if (!options.customer || !options['created-by']) {
    console.log(`
Project Connect - Customer Onboarding Orchestrator

Usage: node project-connect.js --customer "Name" --created-by "email@example.com" [options]

Required:
  --customer <name>       Customer name
  --created-by <email>    User email performing operation

Optional:
  --aliases <list>        Comma-separated customer aliases
  --mode <mode>           "plan" or "execute" (default: plan)
  --dry-run <bool>        Test mode (default: true)
  --customer-id <id>      Pre-generated customer ID
  --github-org <name>     GitHub organization name
  --drive-parent <id>     Google Drive parent folder ID
  --drive-mode <mode>     "auto", "api", or "manual" (default: auto)
  --verbose               Enable verbose logging

Examples:
  # Plan mode (dry run)
  node project-connect.js \\
    --customer "Acme Robotics" \\
    --aliases "Acme Robo,ACME-R" \\
    --created-by "user@example.com"

  # Execute mode (actual changes)
  node project-connect.js \\
    --customer "Acme Robotics" \\
    --created-by "user@example.com" \\
    --mode execute \\
    --dry-run false \\
    --verbose
    `);
    process.exit(0);
  }

  (async () => {
    try {
      const connector = new ProjectConnect({
        customer: options.customer,
        aliases: options.aliases ? options.aliases.split(',') : [],
        createdBy: options['created-by'],
        mode: options.mode || 'plan',
        dryRun: options['dry-run'] !== 'false',
        verbose: options.verbose || false,
        customerId: options['customer-id'] || null,
        githubOrg: options['github-org'] || null,
        driveParentId: options['drive-parent'] || null,
        driveMode: options['drive-mode'] || 'auto'
      });

      const result = await connector.execute();

      // Print result
      console.log('\n' + '='.repeat(80));
      console.log('PROJECT CONNECT RESULT');
      console.log('='.repeat(80));
      console.log(JSON.stringify(result, null, 2));
      console.log('='.repeat(80));

      // Print summary
      console.log('\n' + ProjectConnect.generateSummary(result));

      process.exit(0);
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}

module.exports = ProjectConnect;
