#!/usr/bin/env node

/**
 * Plugin Update Manager
 *
 * Comprehensive post-installation and post-update validation for all installed plugins.
 * Checks dependencies, environment variables, MCP servers, cache directories, hooks, and database.
 *
 * Usage:
 *   node plugin-update-manager.js [--plugin <name>] [--check-only] [--fix] [--verbose]
 *
 * @version 1.0.0
 * @date 2025-12-13
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Import post-plugin-update fixes module
let PostPluginUpdateFixes;
try {
  PostPluginUpdateFixes = require('./post-plugin-update-fixes').PostPluginUpdateFixes;
} catch (e) {
  // Module not available - will skip those checks
}

// ============================================================================
// ANSI Colors
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

const icons = {
  pass: `${colors.green}✅${colors.reset}`,
  fail: `${colors.red}❌${colors.reset}`,
  warn: `${colors.yellow}⚠️${colors.reset}`,
  info: `${colors.blue}ℹ️${colors.reset}`
};

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  pluginsDir: path.resolve(__dirname, '../../../'),

  dependencies: [
    { name: 'jq', command: 'which jq', required: true, plugin: 'all',
      install: { darwin: 'brew install jq', linux: 'sudo apt-get install jq', win32: 'choco install jq' }},
    { name: 'node', command: 'node --version', required: true, plugin: 'all', minVersion: '18.0.0' },
    { name: 'sf', command: 'sf --version', required: false, plugin: 'salesforce-plugin',
      install: { all: 'npm install -g @salesforce/cli' }},
    { name: 'curl', command: 'which curl', required: false, plugin: 'hubspot-plugin' },
    { name: 'bc', command: 'which bc', required: false, plugin: 'cross-platform-plugin' }
  ],

  environmentVars: {
    required: {
      'salesforce-plugin': ['SFDX_ALIAS', 'SALESFORCE_ENVIRONMENT'],
      'hubspot-plugin': ['HUBSPOT_PORTAL_ID'],
      'cross-platform-plugin': ['SUPABASE_URL']
    },
    optional: {
      'all': ['SLACK_WEBHOOK_URL', 'USER_EMAIL'],
      'salesforce-plugin': ['SF_TARGET_ORG', 'SFDX_DEFAULTUSERNAME', 'ENABLE_SUBAGENT_BOOST'],
      'hubspot-plugin': ['HUBSPOT_PRIVATE_APP_TOKEN', 'HUBSPOT_ACCESS_TOKEN'],
      'cross-platform-plugin': ['ASANA_ACCESS_TOKEN', 'ASANA_WORKSPACE_ID', 'ENABLE_AUTO_ROUTING']
    }
  },

  cacheDirectories: [
    { path: '/tmp/salesforce-reports', plugin: 'salesforce-plugin' },
    { path: '/tmp/sf-cache', plugin: 'salesforce-plugin' },
    { path: '/tmp/sf-data', plugin: 'salesforce-plugin' },
    { path: '/tmp/salesforce-sync', plugin: 'salesforce-plugin' },
    { path: path.join(os.homedir(), '.claude', 'cache', 'ace-routing'), plugin: 'cross-platform-plugin' },
    { path: './instances', plugin: 'salesforce-plugin', relative: true }
  ],

  mcpServers: [
    'playwright',
    'supabase',
    'asana',
    'salesforce-dx',
    'hubspot-v4',
    'hubspot-enhanced-v3',
    'n8n',
    'context7',
    'lucid'
  ]
};

// ============================================================================
// Plugin Update Manager Class
// ============================================================================

class PluginUpdateManager {
  constructor(options = {}) {
    this.targetPlugin = options.plugin || 'all';
    this.checkOnly = options.checkOnly || false;
    this.autoFix = options.fix || false;
    this.verbose = options.verbose || false;

    this.results = {
      dependencies: { passed: [], failed: [], warnings: [] },
      environment: { passed: [], failed: [], warnings: [] },
      mcpServers: { passed: [], failed: [], warnings: [] },
      cacheDirectories: { passed: [], failed: [], warnings: [] },
      hooks: { passed: [], failed: [], warnings: [] },
      database: { passed: [], failed: [], warnings: [] },
      userLevelHooks: { passed: [], failed: [], warnings: [] },
      officialPluginFixes: { passed: [], failed: [], warnings: [] }
    };

    this.fixesApplied = [];
  }

  /**
   * Run all checks
   */
  async run() {
    console.log(`\n${colors.bold}Plugin Update Check - ${new Date().toISOString().split('T')[0]}${colors.reset}`);
    console.log('='.repeat(50));

    await this.checkDependencies();
    await this.checkEnvironment();
    await this.checkMCPServers();
    await this.checkCacheDirectories();
    await this.checkHooks();
    await this.checkDatabase();
    await this.checkUserLevelHooks();
    await this.checkOfficialPluginFixes();

    this.generateReport();

    return this.getExitCode();
  }

  /**
   * Check if plugin is targeted
   */
  isTargetedPlugin(plugin) {
    return this.targetPlugin === 'all' || this.targetPlugin === plugin || plugin === 'all';
  }

  /**
   * Execute command safely
   */
  execSafe(command, options = {}) {
    try {
      return execSync(command, { stdio: 'pipe', encoding: 'utf8', timeout: 10000, ...options }).trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * Get installed plugins
   */
  getInstalledPlugins() {
    const plugins = [];
    const pluginsDir = CONFIG.pluginsDir;

    if (fs.existsSync(pluginsDir)) {
      const entries = fs.readdirSync(pluginsDir);
      for (const entry of entries) {
        const pluginJsonPath = path.join(pluginsDir, entry, '.claude-plugin', 'plugin.json');
        if (fs.existsSync(pluginJsonPath)) {
          plugins.push(entry);
        }
      }
    }

    return plugins;
  }

  // ==========================================================================
  // Check 1: System Dependencies
  // ==========================================================================

  async checkDependencies() {
    if (this.verbose) {
      console.log(`\n${colors.blue}## Dependencies${colors.reset}`);
    }

    for (const dep of CONFIG.dependencies) {
      if (!this.isTargetedPlugin(dep.plugin)) continue;

      const result = this.execSafe(dep.command);
      const isPresent = result !== null;

      let version = '';
      if (isPresent && dep.name === 'node') {
        version = result.replace('v', '');
        if (dep.minVersion && !this.versionGte(version, dep.minVersion)) {
          this.results.dependencies.failed.push({
            name: dep.name,
            reason: `Version ${version} < ${dep.minVersion}`,
            required: dep.required
          });
          if (this.verbose) {
            console.log(`${icons.fail} ${dep.name}: ${version} < ${dep.minVersion} (${dep.required ? 'required' : 'optional'})`);
          }
          continue;
        }
      } else if (isPresent) {
        // Try to extract version
        const versionMatch = result.match(/[\d.]+/);
        if (versionMatch) version = versionMatch[0];
      }

      if (isPresent) {
        this.results.dependencies.passed.push({ name: dep.name, version, plugin: dep.plugin });
        if (this.verbose) {
          console.log(`${icons.pass} ${dep.name}: ${version || 'installed'} (${dep.plugin})`);
        }
      } else if (dep.required) {
        this.results.dependencies.failed.push({ name: dep.name, required: true, plugin: dep.plugin });
        if (this.verbose) {
          console.log(`${icons.fail} ${dep.name}: missing (required)`);
        }

        // Attempt auto-fix
        if (this.autoFix && dep.install) {
          this.tryInstallDependency(dep);
        }
      } else {
        this.results.dependencies.warnings.push({ name: dep.name, plugin: dep.plugin });
        if (this.verbose) {
          console.log(`${icons.warn} ${dep.name}: missing (optional)`);
        }
      }
    }
  }

  /**
   * Try to install a dependency
   */
  tryInstallDependency(dep) {
    const platform = process.platform;
    const installCmd = dep.install[platform] || dep.install.all;

    if (!installCmd) return;

    // Don't run sudo commands automatically
    if (installCmd.includes('sudo')) {
      console.log(`  ${colors.yellow}Manual install required:${colors.reset} ${installCmd}`);
      return;
    }

    console.log(`  ${colors.cyan}Attempting to install ${dep.name}...${colors.reset}`);
    const result = this.execSafe(installCmd);

    if (result !== null) {
      this.fixesApplied.push(`Installed ${dep.name}`);
      console.log(`  ${colors.green}Installed ${dep.name}${colors.reset}`);
    } else {
      console.log(`  ${colors.red}Failed to install ${dep.name}${colors.reset}`);
    }
  }

  /**
   * Version comparison
   */
  versionGte(version, minVersion) {
    const v1 = version.split('.').map(Number);
    const v2 = minVersion.split('.').map(Number);

    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
      const n1 = v1[i] || 0;
      const n2 = v2[i] || 0;
      if (n1 > n2) return true;
      if (n1 < n2) return false;
    }
    return true;
  }

  // ==========================================================================
  // Check 2: Environment Variables
  // ==========================================================================

  async checkEnvironment() {
    if (this.verbose) {
      console.log(`\n${colors.blue}## Environment Variables${colors.reset}`);
    }

    // Load .env file if exists
    this.loadEnvFile();

    // Check required vars
    for (const [plugin, vars] of Object.entries(CONFIG.environmentVars.required)) {
      if (!this.isTargetedPlugin(plugin)) continue;

      for (const varName of vars) {
        const value = process.env[varName];
        if (value) {
          this.results.environment.passed.push({ name: varName, plugin });
          if (this.verbose) {
            const displayValue = value.length > 20 ? value.substring(0, 17) + '...' : value;
            console.log(`${icons.pass} ${varName}: ${displayValue} (${plugin})`);
          }
        } else {
          this.results.environment.failed.push({ name: varName, plugin, required: true });
          if (this.verbose) {
            console.log(`${icons.fail} ${varName}: not set (${plugin} - required)`);
          }
        }
      }
    }

    // Check optional vars
    for (const [plugin, vars] of Object.entries(CONFIG.environmentVars.optional)) {
      if (!this.isTargetedPlugin(plugin)) continue;

      for (const varName of vars) {
        const value = process.env[varName];
        if (value) {
          this.results.environment.passed.push({ name: varName, plugin, optional: true });
          if (this.verbose) {
            console.log(`${icons.pass} ${varName}: set (${plugin})`);
          }
        } else {
          this.results.environment.warnings.push({ name: varName, plugin });
          if (this.verbose) {
            console.log(`${icons.warn} ${varName}: not set (optional)`);
          }
        }
      }
    }
  }

  /**
   * Load .env file from project root
   */
  loadEnvFile() {
    const envPaths = [
      path.join(process.cwd(), '.env'),
      path.join(CONFIG.pluginsDir, '..', '.env'),
      path.join(os.homedir(), '.claude', '.env')
    ];

    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        try {
          const content = fs.readFileSync(envPath, 'utf8');
          const lines = content.split('\n');

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              const [key, ...valueParts] = trimmed.split('=');
              const value = valueParts.join('=').replace(/^["']|["']$/g, '');
              if (key && value && !process.env[key]) {
                process.env[key] = value;
              }
            }
          }
        } catch (error) {
          // Ignore read errors
        }
        break;
      }
    }
  }

  // ==========================================================================
  // Check 3: MCP Server Status
  // ==========================================================================

  async checkMCPServers() {
    if (this.verbose) {
      console.log(`\n${colors.blue}## MCP Servers${colors.reset}`);
    }

    // Read .mcp.json
    const mcpPath = path.join(CONFIG.pluginsDir, '..', '.mcp.json');
    let mcpConfig = {};

    if (fs.existsSync(mcpPath)) {
      try {
        mcpConfig = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      } catch (error) {
        this.results.mcpServers.failed.push({ name: '.mcp.json', reason: 'Invalid JSON' });
        if (this.verbose) {
          console.log(`${icons.fail} .mcp.json: Invalid JSON`);
        }
        return;
      }
    } else {
      this.results.mcpServers.warnings.push({ name: '.mcp.json', reason: 'Not found' });
      if (this.verbose) {
        console.log(`${icons.warn} .mcp.json: Not found (MCP servers not configured)`);
      }
      return;
    }

    const servers = mcpConfig.mcpServers || {};

    for (const serverName of CONFIG.mcpServers) {
      const serverConfig = servers[serverName];

      if (!serverConfig) {
        this.results.mcpServers.warnings.push({ name: serverName, reason: 'Not configured' });
        if (this.verbose) {
          console.log(`${icons.warn} ${serverName}: Not configured`);
        }
        continue;
      }

      // Server is configured
      this.results.mcpServers.passed.push({ name: serverName });
      if (this.verbose) {
        console.log(`${icons.pass} ${serverName}: configured`);
      }
    }
  }

  // ==========================================================================
  // Check 4: Cache Directories
  // ==========================================================================

  async checkCacheDirectories() {
    if (this.verbose) {
      console.log(`\n${colors.blue}## Cache Directories${colors.reset}`);
    }

    for (const dir of CONFIG.cacheDirectories) {
      if (!this.isTargetedPlugin(dir.plugin)) continue;

      const dirPath = dir.relative ? path.resolve(process.cwd(), dir.path) : dir.path;
      const exists = fs.existsSync(dirPath);

      if (exists) {
        this.results.cacheDirectories.passed.push({ path: dir.path, plugin: dir.plugin });
        if (this.verbose) {
          console.log(`${icons.pass} ${dir.path}: exists`);
        }
      } else {
        this.results.cacheDirectories.warnings.push({ path: dir.path, plugin: dir.plugin });
        if (this.verbose) {
          console.log(`${icons.warn} ${dir.path}: missing`);
        }

        // Auto-fix: create directory
        if (this.autoFix) {
          try {
            fs.mkdirSync(dirPath, { recursive: true });
            this.fixesApplied.push(`Created ${dir.path}`);
            console.log(`  ${colors.green}Created ${dir.path}${colors.reset}`);
          } catch (error) {
            console.log(`  ${colors.red}Failed to create ${dir.path}${colors.reset}`);
          }
        }
      }
    }
  }

  // ==========================================================================
  // Check 5: Hook Validation
  // ==========================================================================

  async checkHooks() {
    if (this.verbose) {
      console.log(`\n${colors.blue}## Hooks${colors.reset}`);
    }

    const plugins = this.getInstalledPlugins();

    for (const pluginName of plugins) {
      if (!this.isTargetedPlugin(pluginName)) continue;

      const pluginJsonPath = path.join(CONFIG.pluginsDir, pluginName, '.claude-plugin', 'plugin.json');

      if (!fs.existsSync(pluginJsonPath)) continue;

      let pluginConfig;
      try {
        pluginConfig = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      } catch (error) {
        continue;
      }

      const hooks = pluginConfig.hooks || {};

      for (const [hookType, hookConfigs] of Object.entries(hooks)) {
        if (!Array.isArray(hookConfigs)) continue;

        for (const hookConfig of hookConfigs) {
          const hookDefs = hookConfig.hooks || [];

          for (const hook of hookDefs) {
            if (hook.type !== 'command') continue;

            // Resolve hook path
            let hookPath = hook.command;
            hookPath = hookPath.replace('${CLAUDE_PLUGIN_ROOT}', path.join(CONFIG.pluginsDir, pluginName));

            const hookFile = path.basename(hookPath);

            if (!fs.existsSync(hookPath)) {
              this.results.hooks.failed.push({ name: hookFile, plugin: pluginName, reason: 'File not found' });
              if (this.verbose) {
                console.log(`${icons.fail} ${hookFile}: File not found (${pluginName})`);
              }
              continue;
            }

            // Check executable permission
            try {
              fs.accessSync(hookPath, fs.constants.X_OK);
            } catch (error) {
              this.results.hooks.warnings.push({ name: hookFile, plugin: pluginName, reason: 'Not executable' });
              if (this.verbose) {
                console.log(`${icons.warn} ${hookFile}: Not executable (${pluginName})`);
              }

              // Auto-fix: make executable
              if (this.autoFix) {
                try {
                  fs.chmodSync(hookPath, 0o755);
                  this.fixesApplied.push(`chmod +x ${hookFile}`);
                  console.log(`  ${colors.green}Made ${hookFile} executable${colors.reset}`);
                } catch (err) {
                  console.log(`  ${colors.red}Failed to chmod ${hookFile}${colors.reset}`);
                }
              }
              continue;
            }

            // Validate bash syntax
            if (hookPath.endsWith('.sh')) {
              const syntaxCheck = this.execSafe(`bash -n "${hookPath}"`);
              if (syntaxCheck === null) {
                this.results.hooks.failed.push({ name: hookFile, plugin: pluginName, reason: 'Syntax error' });
                if (this.verbose) {
                  console.log(`${icons.fail} ${hookFile}: Syntax error (${pluginName})`);
                }
                continue;
              }
            }

            this.results.hooks.passed.push({ name: hookFile, plugin: pluginName });
            if (this.verbose) {
              console.log(`${icons.pass} ${hookFile}: valid (${pluginName})`);
            }
          }
        }
      }
    }
  }

  // ==========================================================================
  // Check 6: Database Connectivity
  // ==========================================================================

  async checkDatabase() {
    if (this.verbose) {
      console.log(`\n${colors.blue}## Database${colors.reset}`);
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      this.results.database.warnings.push({ name: 'Supabase', reason: 'Credentials not configured' });
      if (this.verbose) {
        console.log(`${icons.warn} Supabase: Credentials not configured`);
      }
      return;
    }

    // Use helper script to check database via Supabase SDK
    const helperScript = path.join(CONFIG.pluginsDir, 'cross-platform-plugin', 'scripts', 'lib', 'check-supabase-status.js');

    try {
      const result = this.execSafe(`node "${helperScript}"`);

      if (result) {
        try {
          // Parse the last JSON line (skip dotenv output)
          const lines = result.trim().split('\n');
          const jsonLine = lines.find(line => line.startsWith('{') && line.endsWith('}'));
          const dbStatus = jsonLine ? JSON.parse(jsonLine) : null;

          if (dbStatus && dbStatus.connected) {
            this.results.database.passed.push({ name: 'Supabase', status: 'connected' });
            if (this.verbose) {
              console.log(`${icons.pass} Supabase: connected`);
            }

            if (dbStatus.count > 0) {
              this.results.database.passed.push({ name: 'skills', count: dbStatus.count });
              if (this.verbose) {
                console.log(`${icons.pass} skills table: ${dbStatus.count} skills`);
              }
            } else {
              this.results.database.warnings.push({ name: 'skills', reason: 'Empty' });
              if (this.verbose) {
                console.log(`${icons.warn} skills table: empty (run seed-skills-registry.js)`);
              }

              // Auto-fix: run seed script
              if (this.autoFix) {
                const seedScript = path.join(CONFIG.pluginsDir, 'cross-platform-plugin', 'scripts', 'seed-skills-registry.js');
                if (fs.existsSync(seedScript)) {
                  console.log(`  ${colors.cyan}Running seed-skills-registry.js...${colors.reset}`);
                  const seedResult = this.execSafe(`node "${seedScript}"`);
                  if (seedResult !== null) {
                    this.fixesApplied.push('Seeded skills registry');
                    console.log(`  ${colors.green}Seeded skills registry${colors.reset}`);
                  }
                }
              }
            }
          } else if (dbStatus && dbStatus.error) {
            this.results.database.failed.push({ name: 'Supabase', reason: dbStatus.error });
            if (this.verbose) {
              console.log(`${icons.fail} Supabase: ${dbStatus.error}`);
            }
          } else {
            this.results.database.warnings.push({ name: 'Supabase', reason: 'Could not parse response' });
            if (this.verbose) {
              console.log(`${icons.warn} Supabase: Could not parse response`);
            }
          }
        } catch (parseError) {
          this.results.database.warnings.push({ name: 'Supabase', reason: 'Could not parse response' });
          if (this.verbose) {
            console.log(`${icons.warn} Supabase: Could not parse response`);
          }
        }
      } else {
        this.results.database.failed.push({ name: 'Supabase', reason: 'Query failed' });
        if (this.verbose) {
          console.log(`${icons.fail} Supabase: Query failed`);
        }
      }
    } catch (error) {
      this.results.database.failed.push({ name: 'Supabase', reason: error.message });
      if (this.verbose) {
        console.log(`${icons.fail} Supabase: ${error.message}`);
      }
    }
  }

  // ==========================================================================
  // Check 7: User-Level Hook Configuration
  // ==========================================================================

  async checkUserLevelHooks() {
    if (!PostPluginUpdateFixes) {
      if (this.verbose) {
        console.log(`\n${colors.blue}## User-Level Hooks${colors.reset}`);
        console.log(`${icons.warn} PostPluginUpdateFixes module not available`);
      }
      this.results.userLevelHooks.warnings.push({ name: 'module', reason: 'Module not available' });
      return;
    }

    if (this.verbose) {
      console.log(`\n${colors.blue}## User-Level Hooks${colors.reset}`);
    }

    const fixer = new PostPluginUpdateFixes({
      verbose: this.verbose,
      dryRun: !this.autoFix,
      projectRoot: path.resolve(CONFIG.pluginsDir, '..')
    });

    const check = fixer.checkUserLevelHooks();

    if (check.needsFix) {
      const reason = check.reason || 'needs configuration';
      this.results.userLevelHooks.failed.push({
        name: 'UserPromptSubmit hook',
        reason: reason
      });

      if (this.verbose) {
        console.log(`${icons.fail} UserPromptSubmit hook: ${reason}`);
      }

      // Auto-fix if enabled
      if (this.autoFix) {
        const result = fixer.fixUserLevelHooks();
        if (result.fixed) {
          this.fixesApplied.push(`Configured UserPromptSubmit hook in ~/.claude/settings.json`);
          // Move from failed to passed
          this.results.userLevelHooks.failed.pop();
          this.results.userLevelHooks.passed.push({
            name: 'UserPromptSubmit hook',
            note: 'auto-fixed'
          });
        }
      }
    } else {
      this.results.userLevelHooks.passed.push({ name: 'UserPromptSubmit hook' });
      if (this.verbose) {
        console.log(`${icons.pass} UserPromptSubmit hook: configured correctly`);
      }
    }
  }

  // ==========================================================================
  // Check 8: Official Plugin Fixes (Python imports, etc.)
  // ==========================================================================

  async checkOfficialPluginFixes() {
    if (!PostPluginUpdateFixes) {
      if (this.verbose) {
        console.log(`\n${colors.blue}## Official Plugin Fixes${colors.reset}`);
        console.log(`${icons.warn} PostPluginUpdateFixes module not available`);
      }
      this.results.officialPluginFixes.warnings.push({ name: 'module', reason: 'Module not available' });
      return;
    }

    if (this.verbose) {
      console.log(`\n${colors.blue}## Official Plugin Fixes${colors.reset}`);
    }

    const fixer = new PostPluginUpdateFixes({
      verbose: this.verbose,
      dryRun: !this.autoFix,
      projectRoot: path.resolve(CONFIG.pluginsDir, '..')
    });

    const issues = fixer.checkPythonPluginFixes();

    if (issues.length > 0) {
      for (const issue of issues) {
        this.results.officialPluginFixes.failed.push({
          name: `${issue.plugin} ${issue.type}`,
          reason: `Missing ${issue.type}`
        });

        if (this.verbose) {
          console.log(`${icons.fail} ${issue.plugin}: missing ${issue.type}`);
        }
      }

      // Auto-fix if enabled
      if (this.autoFix) {
        const result = fixer.fixPythonPluginFixes();
        if (result.fixed && result.fixes) {
          for (const fix of result.fixes) {
            this.fixesApplied.push(`Created ${fix.type} for Python plugin at ${fix.path}`);
          }
          // Move from failed to passed
          this.results.officialPluginFixes.failed = [];
          this.results.officialPluginFixes.passed.push({
            name: 'Python plugin imports',
            note: 'auto-fixed'
          });
        }
      }
    } else {
      // Check if any plugins need fixing were found
      const fixer2 = new PostPluginUpdateFixes({
        verbose: false,
        dryRun: true,
        projectRoot: path.resolve(CONFIG.pluginsDir, '..')
      });
      const recheck = fixer2.checkPythonPluginFixes();

      if (recheck.length === 0) {
        // Either all fixed or no plugins to fix
        this.results.officialPluginFixes.passed.push({ name: 'Python plugin imports' });
        if (this.verbose) {
          console.log(`${icons.pass} Python plugin imports: OK`);
        }
      }
    }
  }

  // ==========================================================================
  // Report Generation
  // ==========================================================================

  generateReport() {
    console.log('\n' + '='.repeat(50));

    const categories = [
      { key: 'dependencies', label: 'Dependencies' },
      { key: 'environment', label: 'Environment' },
      { key: 'mcpServers', label: 'MCP Servers' },
      { key: 'cacheDirectories', label: 'Cache Directories' },
      { key: 'hooks', label: 'Hooks' },
      { key: 'database', label: 'Database' },
      { key: 'userLevelHooks', label: 'User-Level Hooks' },
      { key: 'officialPluginFixes', label: 'Official Plugin Fixes' }
    ];

    let totalPassed = 0;
    let totalFailed = 0;
    let totalWarnings = 0;

    for (const cat of categories) {
      const r = this.results[cat.key];
      const passed = r.passed.length;
      const failed = r.failed.length;
      const warnings = r.warnings.length;
      const total = passed + failed + warnings;

      totalPassed += passed;
      totalFailed += failed;
      totalWarnings += warnings;

      let icon = icons.pass;
      let status = `${passed}/${total} passed`;

      if (failed > 0) {
        icon = icons.fail;
        status = `${failed} failed`;
      } else if (warnings > 0) {
        icon = icons.warn;
        status = `${passed}/${total} - ${warnings} warnings`;
      }

      console.log(`${icon} ${cat.label} (${status})`);
    }

    console.log('\n' + '-'.repeat(50));

    // Overall status
    let overallIcon = icons.pass;
    let overallStatus = 'READY';

    if (totalFailed > 0) {
      overallIcon = icons.fail;
      overallStatus = 'ISSUES FOUND';
    } else if (totalWarnings > 0) {
      overallIcon = icons.warn;
      overallStatus = `READY (${totalWarnings} warnings)`;
    }

    console.log(`${overallIcon} Overall: ${colors.bold}${overallStatus}${colors.reset}`);

    // Fixes applied
    if (this.fixesApplied.length > 0) {
      console.log(`\n${colors.cyan}Fixes Applied:${colors.reset}`);
      for (const fix of this.fixesApplied) {
        console.log(`  - ${fix}`);
      }
    }

    // Suggestions
    if (!this.verbose && (totalFailed > 0 || totalWarnings > 0)) {
      console.log(`\nRun with ${colors.cyan}--verbose${colors.reset} for details`);
    }

    if (!this.autoFix && (totalFailed > 0 || totalWarnings > 0)) {
      console.log(`Run with ${colors.cyan}--fix${colors.reset} to auto-resolve issues`);
    }

    console.log('');
  }

  /**
   * Get exit code based on results
   */
  getExitCode() {
    const hasFailed = Object.values(this.results).some(r => r.failed.length > 0);
    if (hasFailed) return 1;
    return 0;
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

function parseArgs(args) {
  const options = {
    plugin: 'all',
    checkOnly: false,
    fix: false,
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--plugin' && args[i + 1]) {
      options.plugin = args[++i];
    } else if (arg === '--check-only') {
      options.checkOnly = true;
    } else if (arg === '--fix') {
      options.fix = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Plugin Update Manager

Validates plugin dependencies, environment, MCP servers, caches, hooks, and database.

Usage:
  node plugin-update-manager.js [options]

Options:
  --plugin <name>   Target specific plugin (default: all)
  --check-only      Report issues without fixing
  --fix             Auto-fix resolvable issues
  --verbose, -v     Show detailed output
  --help, -h        Show this help message

Examples:
  # Basic check
  node plugin-update-manager.js

  # Verbose check
  node plugin-update-manager.js --verbose

  # Auto-fix issues
  node plugin-update-manager.js --fix

  # Check specific plugin
  node plugin-update-manager.js --plugin salesforce-plugin --verbose
`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const manager = new PluginUpdateManager(options);
  const exitCode = await manager.run();
  process.exit(exitCode);
}

// Run CLI
if (require.main === module) {
  main();
}

module.exports = { PluginUpdateManager };
