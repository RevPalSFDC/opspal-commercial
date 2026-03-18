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

const fs = require('fs');
const path = require('path');
const GitHubRepoManager = require('./lib/github-repo-manager');
const GoogleDriveManager = require('./lib/google-drive-manager');
const SupabaseDirectoryManager = require('./lib/supabase-directory-manager');
const AsanaAuthHelper = require('./lib/asana-auth-helper');
const GoogleDriveAuthHelper = require('./lib/google-drive-auth-helper');
const DependencyChecker = require('./lib/dependency-checker');
const ProjectConnectRegistry = require('./lib/project-connect-registry');
const { setupSymlinks, installGitHooks } = require('./project-connect-schema-migrate');

const DEFAULT_STALE_HOURS = 24;

function toPositiveNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
}

function normalizeAliases(aliasesValue) {
  if (!Array.isArray(aliasesValue)) {
    return [];
  }

  return aliasesValue
    .map(alias => String(alias || '').trim())
    .filter(Boolean);
}

async function runRepoSyncCheck(options = {}) {
  const customerId = String(options.customerId || '').trim();
  if (!customerId) {
    throw new Error('customerId is required for repo sync checks');
  }

  const staleHours = toPositiveNumber(options.staleHours, DEFAULT_STALE_HOURS);
  const remoteFallback = options.remoteFallback !== false;
  const customer = options.customer || null;
  const aliases = normalizeAliases(options.aliases || []);
  const checkActor = options.createdBy || 'project-connect-check';

  const registry = new ProjectConnectRegistry({
    verbose: options.verbose,
    staleAfterHours: staleHours,
    repoRoot: options.repoRoot || undefined,
    registryRoot: options.registryRoot || undefined
  });

  const localStatus = registry.getRepoSyncStatus({
    customerId,
    staleAfterHours: staleHours
  });

  let status = {
    customerId,
    customer,
    synced: localStatus.synced,
    source: localStatus.source,
    stale: localStatus.stale,
    usedRemoteFallback: false,
    lastVerifiedAt: localStatus.lastVerifiedAt,
    reason: localStatus.reason,
    repo: localStatus.repo,
    localRegistry: localStatus.localRegistry,
    checkedAt: new Date().toISOString()
  };

  const shouldFallback = remoteFallback && (!localStatus.found || localStatus.stale);

  if (!shouldFallback) {
    if (localStatus.found && !localStatus.stale) {
      registry.recordCheckResult({
        customerId,
        customer,
        aliases,
        synced: status.synced,
        source: 'local',
        reason: status.reason,
        repoName: status.repo?.name || null,
        repoUrl: status.repo?.url || null,
        actor: checkActor
      });
    }
    return status;
  }

  const github = new GitHubRepoManager({
    verbose: options.verbose,
    dryRun: false,
    orgName: options.githubOrg || null
  });

  const remoteResult = await github.findRepo({
    customerId,
    customer,
    aliases
  });

  if (remoteResult.exists) {
    const persisted = registry.recordCheckResult({
      customerId,
      customer,
      aliases,
      synced: true,
      source: 'remote',
      status: 'connected',
      reason: 'github_repo_found_via_remote_check',
      repoName: remoteResult.name || null,
      repoUrl: remoteResult.url || null,
      actor: checkActor
    });

    status = {
      customerId,
      customer,
      synced: true,
      source: 'remote',
      stale: false,
      usedRemoteFallback: true,
      lastVerifiedAt: persisted.lastVerifiedAt,
      reason: 'github_repo_found_via_remote_check',
      repo: {
        name: remoteResult.name || null,
        url: remoteResult.url || null
      },
      localRegistry: {
        indexPath: persisted.indexPath,
        recordPath: persisted.recordPath
      },
      checkedAt: new Date().toISOString()
    };

    return status;
  }

  const persisted = registry.recordCheckResult({
    customerId,
    customer,
    aliases,
    synced: false,
    source: 'remote',
    status: 'not_synced',
    reason: 'github_repo_not_found_via_remote_check',
    actor: checkActor
  });

  status = {
    customerId,
    customer,
    synced: false,
    source: 'remote',
    stale: false,
    usedRemoteFallback: true,
    lastVerifiedAt: persisted.lastVerifiedAt,
    reason: 'github_repo_not_found_via_remote_check',
    repo: null,
    localRegistry: {
      indexPath: persisted.indexPath,
      recordPath: persisted.recordPath
    },
    checkedAt: new Date().toISOString()
  };

  return status;
}

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

    this.registry = new ProjectConnectRegistry({
      verbose: this.verbose,
      staleAfterHours: options.staleHours || DEFAULT_STALE_HOURS
    });

    // Tracking
    this.createdResources = [];
    this.logs = [];
    this.plan = [];
    this.localRegistry = null;
    this.localRegistryError = null;
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

        const workspaceId = process.env.ASANA_WORKSPACE_ID || 'REDACTED_ASANA_WORKSPACE';
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
          console.log('│ 1. Go to: https://app.asana.com/0/REDACTED_ASANA_WORKSPACE            │');
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

    await this._updateLocalRegistry({
      customerId,
      discovery,
      result
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
   * Persist local sync state for future project sync checks.
   */
  async _updateLocalRegistry({ customerId, discovery, result }) {
    if (this.dryRun) {
      this.localRegistry = {
        skipped: true,
        reason: 'dry_run',
        indexPath: this.registry.indexPath
      };
      return;
    }

    try {
      const persisted = this.registry.upsertFromProjectConnectExecution({
        customerId,
        customer: this.customer,
        aliases: this.aliases,
        github: {
          exists: discovery.github.exists,
          created: result.github.created || false,
          name: result.github.name,
          url: result.github.url
        },
        drive: result.drive,
        asana: result.asana,
        source: 'project-connect',
        actor: this.createdBy
      });

      this.localRegistry = {
        skipped: false,
        synced: persisted.synced,
        lastVerifiedAt: persisted.lastVerifiedAt,
        indexPath: persisted.indexPath,
        recordPath: persisted.recordPath
      };
    } catch (error) {
      this.localRegistryError = error.message;
      this.localRegistry = {
        skipped: false,
        error: error.message,
        indexPath: this.registry.indexPath
      };
      this.log('Failed to update local project-connect registry', error.message);
    }
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
      localRegistry: this.localRegistry,
      dryRun: this.dryRun,
      notes: []
    };

    // Add notes for manual actions
    if (result.drive.manualRequired) {
      output.notes.push('Manual Google Drive folder creation required - see instructions');
    }

    if (this.localRegistry?.skipped && this.localRegistry.reason === 'dry_run') {
      output.notes.push('Local project-connect registry was not updated because dry-run mode is enabled');
    }

    if (this.localRegistryError) {
      output.notes.push(`Local project-connect registry update failed: ${this.localRegistryError}`);
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
   * Check repo sync state using local registry first, with optional remote fallback.
   *
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  static async checkRepoSyncStatus(options = {}) {
    return runRepoSyncCheck(options);
  }

  /**
   * Detect org context from environment/CWD/registry to auto-fill --customer.
   *
   * Priority chain:
   *   1. ORG_SLUG env var
   *   2. CWD path match (/orgs/{slug}/)
   *   3. CLIENT_ORG / SF_TARGET_ORG env fallbacks
   *   4. Single-org work-index (only if exactly 1 org exists in registry)
   *
   * @param {Object} [options]
   * @param {boolean} [options.verbose]
   * @returns {{detected: boolean, source: string, slug: string, customerId?: string, customer?: string, aliases?: string[]}|null}
   */
  static _detectOrgContext(options = {}) {
    const verbose = options.verbose || false;
    const log = (msg) => { if (verbose) console.log(`[OrgDetect] ${msg}`); };

    const registry = new ProjectConnectRegistry({ verbose });

    // 1. ORG_SLUG env var
    if (process.env.ORG_SLUG) {
      const slug = process.env.ORG_SLUG.trim();
      log(`Trying ORG_SLUG="${slug}"`);
      const match = registry.findByOrgSlug(slug);
      if (match) {
        log(`Matched customer "${match.entry.customer}" via ORG_SLUG`);
        return {
          detected: true,
          source: 'ORG_SLUG',
          slug,
          customerId: match.customerId,
          customer: match.entry.customer,
          aliases: match.entry.aliases || []
        };
      }
      // Return slug even without registry match — caller can use it as customer name
      log('ORG_SLUG set but no registry match, using as hint');
      return { detected: true, source: 'ORG_SLUG', slug, customer: null, aliases: [] };
    }

    // 2. CWD path match: /orgs/{slug}/
    const cwd = process.cwd();
    const cwdMatch = cwd.match(/[/\\]orgs[/\\]([^/\\]+)/);
    if (cwdMatch) {
      const slug = cwdMatch[1];
      log(`Trying CWD path slug="${slug}"`);
      const match = registry.findByOrgSlug(slug);
      if (match) {
        log(`Matched customer "${match.entry.customer}" via CWD`);
        return {
          detected: true,
          source: 'CWD',
          slug,
          customerId: match.customerId,
          customer: match.entry.customer,
          aliases: match.entry.aliases || []
        };
      }
    }

    // 3. CLIENT_ORG / SF_TARGET_ORG env fallbacks
    const envFallbacks = ['CLIENT_ORG', 'SF_TARGET_ORG'];
    for (const envVar of envFallbacks) {
      const value = (process.env[envVar] || '').trim();
      if (!value) continue;
      log(`Trying ${envVar}="${value}"`);
      const match = registry.findByOrgSlug(value);
      if (match) {
        log(`Matched customer "${match.entry.customer}" via ${envVar}`);
        return {
          detected: true,
          source: envVar,
          slug: value,
          customerId: match.customerId,
          customer: match.entry.customer,
          aliases: match.entry.aliases || []
        };
      }
    }

    // 4. Single-org shortcut
    const index = registry.loadIndex();
    const customerIds = Object.keys(index.customers || {});
    if (customerIds.length === 1) {
      const id = customerIds[0];
      const entry = index.customers[id];
      log(`Single org in registry: "${entry.customer}" (${id})`);
      return {
        detected: true,
        source: 'single-org',
        slug: entry.orgSlug || '',
        customerId: id,
        customer: entry.customer,
        aliases: entry.aliases || []
      };
    }

    log('No org context detected');
    return null;
  }

  /**
   * List all revpal-* repos from GitHub, cross-referenced with local registry.
   *
   * @param {Object} options
   * @param {boolean} [options.json] - Return structured data instead of printing
   * @param {boolean} [options.verbose]
   * @param {string} [options.githubOrg]
   * @returns {Promise<Array<Object>>}
   */
  static async listRepos(options = {}) {
    const github = new GitHubRepoManager({
      verbose: options.verbose || false,
      dryRun: false,
      orgName: options.githubOrg || null
    });

    const registry = new ProjectConnectRegistry({ verbose: options.verbose || false });
    const repos = await github.listAllRevpalRepos();

    return repos.map(repo => {
      const cloneStatus = repo.customerId
        ? registry.getLocalCloneStatus(repo.customerId)
        : { cloned: false, localClonePath: null };

      return {
        name: repo.name,
        url: repo.url,
        customerId: repo.customerId,
        customerSlug: repo.customerSlug,
        locallyCloned: cloneStatus.cloned,
        localClonePath: cloneStatus.localClonePath
      };
    });
  }

  /**
   * Clone a customer repo locally and update registry.
   *
   * @param {Object} options
   * @param {string} options.customerId - Customer ID to sync
   * @param {boolean} [options.dryRun]
   * @param {boolean} [options.verbose]
   * @param {string} [options.githubOrg]
   * @returns {Promise<Object>}
   */
  static async syncDown(options = {}) {
    const github = new GitHubRepoManager({
      verbose: options.verbose || false,
      dryRun: options.dryRun || false,
      orgName: options.githubOrg || null
    });

    const registry = new ProjectConnectRegistry({ verbose: options.verbose || false });

    // Find the repo for this customer
    const repos = await github.listAllRevpalRepos();
    const targetRepo = repos.find(r =>
      r.customerId && r.customerId === options.customerId.toUpperCase()
    );

    if (!targetRepo) {
      throw new Error(`No revpal-* repository found for customerId "${options.customerId}"`);
    }

    // Determine clone destination: orgs/{slug}/.repo/
    const slug = targetRepo.customerSlug || options.customerId.toLowerCase();
    const repoRoot = path.resolve(__dirname, '../../../../');
    const clonePath = path.join(repoRoot, 'orgs', slug, '.repo');
    const relativePath = path.posix.join('orgs', slug, '.repo');

    // Clone
    const cloneResult = await github.cloneRepo(targetRepo.name, clonePath);

    if (cloneResult.dryRun) {
      return {
        customerId: options.customerId.toUpperCase(),
        repoName: targetRepo.name,
        clonePath: relativePath,
        dryRun: true,
        cloned: false
      };
    }

    if (cloneResult.alreadyExists) {
      return {
        customerId: options.customerId.toUpperCase(),
        repoName: targetRepo.name,
        clonePath: relativePath,
        alreadyExists: true,
        cloned: false
      };
    }

    // Create org directory structure if needed
    const orgDir = path.join(repoRoot, 'orgs', slug);
    if (!fs.existsSync(orgDir)) {
      fs.mkdirSync(orgDir, { recursive: true });
    }

    // Set up symlinks from org root to .repo/ content + install git hooks
    const { symlinks } = setupSymlinks(orgDir, slug);
    if (options.verbose) {
      for (const s of symlinks) {
        console.log(`  Symlink: ${s.name} → ${s.target}`);
      }
    }

    // Update registry with localClonePath
    const record = registry.loadCustomerRecord(options.customerId) ||
      registry._createEmptyCustomerRecord({
        customerId: options.customerId.toUpperCase(),
        customer: null,
        aliases: []
      });

    record.localClonePath = relativePath;
    registry.saveCustomerRecord(options.customerId, record);

    return {
      customerId: options.customerId.toUpperCase(),
      repoName: targetRepo.name,
      clonePath: relativePath,
      cloned: true,
      symlinks: symlinks.length
    };
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
  const isCheckMode = options['check-repo-sync'] === true;
  const isListRepos = options['list-repos'] === true;
  const isSyncDown = options['sync-down'] !== undefined && options['sync-down'] !== false;
  const isJsonOutput = options.json === true;
  const shouldShowUsage = options.help === true || options.h === true;

  const printUsage = () => {
    console.log(`
Project Connect - Customer Onboarding Orchestrator

Usage: node project-connect.js --customer "Name" --created-by "email@example.com" [options]

Modes:
  (default)               Onboard a customer across GitHub, Drive, Asana
  --check-repo-sync       Check repo sync status (local first, optional remote fallback)
  --list-repos            List all revpal-* repos with local clone status
  --sync-down <id>        Clone a customer repo locally (or --sync-down --all)

Required (default mode):
  --customer <name>       Customer name (auto-detected from ORG_SLUG if set)
  --created-by <email>    User email performing operation

Optional:
  --aliases <list>        Comma-separated customer aliases
  --mode <mode>           "plan" or "execute" (default: plan)
  --dry-run <bool>        Test mode (default: true)
  --customer-id <id>      Pre-generated customer ID
  --github-org <name>     GitHub organization name
  --drive-parent <id>     Google Drive parent folder ID
  --drive-mode <mode>     "auto", "api", or "manual" (default: auto)
  --stale-hours <hours>   Local registry staleness threshold (default: 24)
  --no-remote-fallback    Disable remote GitHub fallback for sync check mode
  --json                  Output structured JSON (for --list-repos)
  --verbose               Enable verbose logging
  --help                  Show this usage message

Auto-Detection:
  When --customer is not provided, Project Connect checks (in order):
    1. ORG_SLUG environment variable
    2. CWD path match (/orgs/{slug}/)
    3. CLIENT_ORG / SF_TARGET_ORG env vars
    4. Single-org registry (if only 1 customer exists)

Examples:
  # Auto-detect customer from ORG_SLUG
  ORG_SLUG=acme-corp node project-connect.js --created-by "user@example.com"

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

  # Check repo sync status
  node project-connect.js \\
    --check-repo-sync \\
    --customer-id "RP-ACM123456" \\
    --customer "Acme Robotics"

  # List all customer repos
  node project-connect.js --list-repos
  node project-connect.js --list-repos --json

  # Clone a specific customer repo
  node project-connect.js --sync-down "RP-ACM123456"
  node project-connect.js --sync-down "RP-ACM123456" --dry-run true

  # Clone all customer repos
  node project-connect.js --sync-down --all
    `);
  };

  if (shouldShowUsage) {
    printUsage();
    process.exit(0);
  }

  (async () => {
    try {
      // --list-repos mode
      if (isListRepos) {
        const repos = await ProjectConnect.listRepos({
          verbose: options.verbose || false,
          githubOrg: options['github-org'] || null
        });

        if (isJsonOutput) {
          console.log(JSON.stringify(repos, null, 2));
        } else {
          console.log(`\nFound ${repos.length} customer repo(s):\n`);
          for (const repo of repos) {
            const statusIcon = repo.locallyCloned ? '[OK]' : '[  ]';
            const statusLabel = repo.locallyCloned ? 'CLONED' : 'REMOTE ONLY';
            console.log(`  ${statusIcon} ${repo.name}`);
            console.log(`      ID: ${repo.customerId || 'unknown'} | Status: ${statusLabel}`);
            if (repo.localClonePath) {
              console.log(`      Path: ${repo.localClonePath}`);
            }
            console.log('');
          }
        }
        process.exit(0);
      }

      // --sync-down mode
      if (isSyncDown) {
        const syncAll = options.all === true;
        const dryRun = options['dry-run'] === 'true' || options['dry-run'] === true;

        if (syncAll) {
          const repos = await ProjectConnect.listRepos({
            verbose: options.verbose || false,
            githubOrg: options['github-org'] || null
          });

          const uncloned = repos.filter(r => !r.locallyCloned && r.customerId);
          if (uncloned.length === 0) {
            console.log('All repos are already cloned locally.');
            process.exit(0);
          }

          console.log(`Syncing ${uncloned.length} repo(s)...\n`);
          for (const repo of uncloned) {
            try {
              const result = await ProjectConnect.syncDown({
                customerId: repo.customerId,
                dryRun,
                verbose: options.verbose || false,
                githubOrg: options['github-org'] || null
              });
              const label = result.dryRun ? '[DRY RUN]' : (result.cloned ? '[CLONED]' : '[EXISTS]');
              console.log(`  ${label} ${repo.name} -> ${result.clonePath}`);
            } catch (err) {
              console.error(`  [ERROR] ${repo.name}: ${err.message}`);
            }
          }
          process.exit(0);
        }

        // Single repo sync
        const customerId = typeof options['sync-down'] === 'string' ? options['sync-down'] : null;
        if (!customerId) {
          console.error('Error: --sync-down requires a customerId (e.g., --sync-down RP-ACM123456) or --all');
          process.exit(1);
        }

        const result = await ProjectConnect.syncDown({
          customerId,
          dryRun,
          verbose: options.verbose || false,
          githubOrg: options['github-org'] || null
        });

        if (isJsonOutput) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.dryRun) {
          console.log(`[DRY RUN] Would clone ${result.repoName} to ${result.clonePath}`);
        } else if (result.alreadyExists) {
          console.log(`Already cloned: ${result.repoName} at ${result.clonePath}`);
        } else {
          console.log(`Cloned ${result.repoName} to ${result.clonePath}`);
        }
        process.exit(0);
      }

      // --check-repo-sync mode
      if (isCheckMode) {
        if (!options['customer-id']) {
          console.error('Error: --customer-id is required when using --check-repo-sync');
          printUsage();
          process.exit(1);
        }

        const checkResult = await ProjectConnect.checkRepoSyncStatus({
          customerId: options['customer-id'],
          customer: options.customer || null,
          aliases: options.aliases ? options.aliases.split(',') : [],
          remoteFallback: options['no-remote-fallback'] !== true,
          staleHours: options['stale-hours'] || DEFAULT_STALE_HOURS,
          verbose: options.verbose || false,
          githubOrg: options['github-org'] || null,
          createdBy: options['created-by'] || null
        });

        console.log(JSON.stringify(checkResult, null, 2));
        process.exit(0);
      }

      // Default mode: auto-detect org context if --customer not provided
      if (!options.customer) {
        const detected = ProjectConnect._detectOrgContext({ verbose: options.verbose || false });
        if (detected && detected.customer) {
          options.customer = detected.customer;
          if (!options['customer-id'] && detected.customerId) {
            options['customer-id'] = detected.customerId;
          }
          if (!options.aliases && detected.aliases && detected.aliases.length > 0) {
            options.aliases = detected.aliases.join(',');
          }
          console.log(`Auto-detected customer: "${options.customer}" (via ${detected.source})`);
        }
      }

      if (!options.customer || !options['created-by']) {
        printUsage();
        process.exit(0);
      }

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
        driveMode: options['drive-mode'] || 'auto',
        staleHours: options['stale-hours'] || DEFAULT_STALE_HOURS
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
