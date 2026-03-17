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
    { name: 'sf', command: 'sf --version', required: false, plugin: 'opspal-salesforce',
      install: { all: 'npm install -g @salesforce/cli' }},
    { name: 'curl', command: 'which curl', required: false, plugin: 'opspal-hubspot' },
    { name: 'bc', command: 'which bc', required: false, plugin: 'opspal-core' },
    // PDF Generation Dependencies (critical for report generation)
    { name: 'mmdc', command: 'which mmdc', required: false, plugin: 'opspal-core',
      install: { all: 'npm install -g @mermaid-js/mermaid-cli' },
      purpose: 'Mermaid diagram rendering for PDFs' },
    { name: 'chromium', command: 'which chromium-browser || which chromium || which google-chrome', required: false, plugin: 'opspal-core',
      install: { linux: 'sudo apt-get install chromium-browser', darwin: 'brew install chromium' },
      purpose: 'PDF generation via Puppeteer' }
  ],

  environmentVars: {
    required: {
      'salesforce-plugin': ['SFDX_ALIAS', 'SALESFORCE_ENVIRONMENT'],
      'hubspot-plugin': ['HUBSPOT_PORTAL_ID'],
      'opspal-core': ['SUPABASE_URL']
    },
    optional: {
      'all': ['SLACK_WEBHOOK_URL', 'USER_EMAIL'],
      'salesforce-plugin': ['SF_TARGET_ORG', 'SFDX_DEFAULTUSERNAME', 'ENABLE_SUBAGENT_BOOST', 'SF_API_ROUTING_ENABLED', 'SF_BULK_THRESHOLD', 'SF_COMPOSITE_THRESHOLD'],
      'hubspot-plugin': ['HUBSPOT_PRIVATE_APP_TOKEN', 'HUBSPOT_ACCESS_TOKEN'],
      'opspal-core': ['ASANA_ACCESS_TOKEN', 'ASANA_WORKSPACE_ID', 'ENABLE_AUTO_ROUTING']
    },
    // Default values for optional variables - set automatically if not present
    defaults: {
      'ENABLE_SUBAGENT_BOOST': '1',           // Enable sub-agent booster by default
      'SF_API_ROUTING_ENABLED': '1',           // Enable API routing suggestions by default
      'SF_BULK_THRESHOLD': '200',              // Records before suggesting Bulk API
      'SF_COMPOSITE_THRESHOLD': '2'            // Operations before suggesting Composite API
    }
  },

  cacheDirectories: [
    { path: path.join(os.tmpdir(), 'salesforce-reports'), plugin: 'salesforce-plugin' },
    { path: path.join(os.tmpdir(), 'sf-cache'), plugin: 'salesforce-plugin' },
    { path: path.join(os.tmpdir(), 'sf-data'), plugin: 'salesforce-plugin' },
    { path: path.join(os.tmpdir(), 'salesforce-sync'), plugin: 'salesforce-plugin' },
    { path: path.join(os.homedir(), '.claude', 'cache', 'ace-routing'), plugin: 'opspal-core' },
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

function extractHookScriptPath(command) {
  if (typeof command !== 'string') return null;

  const envMatch = command.match(
    /(?:^|\s)env(?:\s+[A-Z_][A-Z0-9_]*=[^\s]+)+\s+(?:"([^"]+\.(?:sh|js))"|'([^']+\.(?:sh|js))'|([^"'`\s;]+\.(?:sh|js)))/
  );
  if (envMatch) return envMatch[1] || envMatch[2] || envMatch[3];

  const bashMatch = command.match(/bash\s+(?:-c\s+)?["']?([^"'\s;]+\.sh)/);
  if (bashMatch) return bashMatch[1];

  const nodeMatch = command.match(/node\s+["']?([^"'\s;]+\.js)/);
  if (nodeMatch) return nodeMatch[1];

  if (command.endsWith('.sh') || command.endsWith('.js')) {
    return command.split(' ')[0];
  }

  const quotedScriptMatch = command.match(/["']([^"']+\.(?:sh|js))["']/);
  if (quotedScriptMatch) return quotedScriptMatch[1];

  return null;
}

function resolveHookCommandPath(command, pluginRoot) {
  const scriptPath = extractHookScriptPath(command);
  if (!scriptPath) return null;

  const substitutedPath = scriptPath.replace('${CLAUDE_PLUGIN_ROOT}', pluginRoot);
  const expandedPath = substitutedPath.startsWith('~/')
    ? path.join(os.homedir(), substitutedPath.slice(2))
    : substitutedPath;

  return path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(pluginRoot, expandedPath);
}

function getHookCommandLabel(command) {
  const scriptPath = extractHookScriptPath(command);
  if (scriptPath) {
    return path.basename(scriptPath);
  }

  if (typeof command !== 'string' || command.trim() === '') {
    return 'unknown-hook-command';
  }

  return command.trim().split(/\s+/)[0];
}

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
      officialPluginFixes: { passed: [], failed: [], warnings: [] },
      npmPackages: { passed: [], failed: [], warnings: [] },
      pdfPipeline: { passed: [], failed: [], warnings: [] },
      securityVulnerabilities: { passed: [], failed: [], warnings: [] },
      routingRegistry: { passed: [], failed: [], warnings: [] },
      hookRegistration: { passed: [], failed: [], warnings: [] }
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
    await this.checkNpmPackages();
    await this.checkSecurityVulnerabilities();
    await this.checkEnvironment();
    await this.checkMCPServers();
    await this.checkCacheDirectories();
    await this.checkHooks();
    await this.checkDatabase();
    await this.checkUserLevelHooks();
    await this.checkOfficialPluginFixes();
    await this.checkPDFPipeline();
    await this.checkRoutingRegistry();
    await this.checkHookRegistration();

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
  // Check 1.5: NPM Package Dependencies
  // ==========================================================================

  async checkNpmPackages() {
    if (this.verbose) {
      console.log(`\n${colors.blue}## NPM Packages${colors.reset}`);
    }

    // Use the centralized dependency checker
    let depChecker;
    try {
      depChecker = require('./check-all-plugin-dependencies');
    } catch (e) {
      // Checker not available
      this.results.npmPackages.warnings.push({
        name: 'dependency-checker',
        reason: 'check-all-plugin-dependencies.js not found'
      });
      if (this.verbose) {
        console.log(`${icons.warn} NPM checker not available`);
      }
      return;
    }

    // Get plugins to check
    const plugins = depChecker.discoverPlugins(
      this.targetPlugin === 'all' ? null : this.targetPlugin
    );

    let totalMissing = 0;
    let totalPresent = 0;
    const pluginsToFix = [];

    for (const plugin of plugins) {
      const results = depChecker.checkPluginDependencies(plugin, false);

      if (!results.hasPackageJson) {
        if (this.verbose) {
          console.log(`${icons.info} ${plugin.name}: no package.json`);
        }
        continue;
      }

      if (results.error) {
        this.results.npmPackages.warnings.push({
          name: plugin.name,
          reason: results.error
        });
        continue;
      }

      // Track results
      for (const dep of results.present) {
        this.results.npmPackages.passed.push({
          name: `${plugin.name}/${dep.name}`,
          version: dep.version
        });
        totalPresent++;
      }

      for (const dep of results.missing) {
        this.results.npmPackages.failed.push({
          name: `${plugin.name}/${dep.name}`,
          version: dep.version,
          plugin: plugin.name
        });
        totalMissing++;

        if (this.verbose) {
          console.log(`${icons.fail} ${plugin.name}/${dep.name} (${dep.version}) - NOT INSTALLED`);
        }
      }

      if (results.missing.length > 0) {
        pluginsToFix.push(plugin);
      }

      if (this.verbose && results.present.length > 0 && results.missing.length === 0) {
        console.log(`${icons.pass} ${plugin.name}: ${results.present.length} packages OK`);
      }
    }

    // Auto-fix: run npm install in plugins with missing packages
    if (this.autoFix && pluginsToFix.length > 0) {
      for (const plugin of pluginsToFix) {
        console.log(`\n${colors.cyan}Installing npm packages in ${plugin.name}...${colors.reset}`);
        if (depChecker.installDependencies(plugin.dir, plugin.name)) {
          this.fixesApplied.push(`Installed npm packages for ${plugin.name}`);
        }
      }
    }

    // Summary if verbose
    if (this.verbose) {
      console.log(`\n  Total: ${totalPresent} present, ${totalMissing} missing`);
    }
  }

  // ==========================================================================
  // Check 1.6: Security Vulnerabilities (npm audit)
  // ==========================================================================

  async checkSecurityVulnerabilities() {
    if (this.verbose) {
      console.log(`\n${colors.blue}## Security Vulnerabilities${colors.reset}`);
    }

    // Run npm audit in JSON format
    let auditResult;
    try {
      // npm audit returns exit code 1 when vulnerabilities exist, so we need to capture it
      auditResult = execSync('npm audit --json 2>/dev/null', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.resolve(CONFIG.pluginsDir, '..'),
        timeout: 60000
      });
    } catch (error) {
      // npm audit returns non-zero when vulnerabilities exist
      if (error.stdout) {
        auditResult = error.stdout;
      } else {
        this.results.securityVulnerabilities.warnings.push({
          name: 'npm audit',
          reason: 'Could not run npm audit'
        });
        if (this.verbose) {
          console.log(`${icons.warn} npm audit: Could not run (${error.message})`);
        }
        return;
      }
    }

    let audit;
    try {
      audit = JSON.parse(auditResult);
    } catch (parseError) {
      this.results.securityVulnerabilities.warnings.push({
        name: 'npm audit',
        reason: 'Could not parse audit results'
      });
      if (this.verbose) {
        console.log(`${icons.warn} npm audit: Could not parse results`);
      }
      return;
    }

    // Parse vulnerabilities
    const vulnerabilities = audit.vulnerabilities || {};
    const metadata = audit.metadata || {};
    const vulnCounts = metadata.vulnerabilities || {};

    const critical = vulnCounts.critical || 0;
    const high = vulnCounts.high || 0;
    const moderate = vulnCounts.moderate || 0;
    const low = vulnCounts.low || 0;
    const total = vulnCounts.total || (critical + high + moderate + low);

    if (total === 0) {
      this.results.securityVulnerabilities.passed.push({
        name: 'npm audit',
        detail: 'No vulnerabilities found'
      });
      if (this.verbose) {
        console.log(`${icons.pass} npm audit: No vulnerabilities found`);
      }
      return;
    }

    // Log each vulnerability
    for (const [pkgName, vuln] of Object.entries(vulnerabilities)) {
      const severity = vuln.severity || 'unknown';
      const via = vuln.via || [];
      const fixAvailable = vuln.fixAvailable;

      // Determine if this is critical/high (fail) or moderate/low (warning)
      if (severity === 'critical' || severity === 'high') {
        this.results.securityVulnerabilities.failed.push({
          name: pkgName,
          severity: severity,
          fixAvailable: !!fixAvailable,
          reason: Array.isArray(via) && via[0]?.title ? via[0].title : `${severity} severity vulnerability`
        });
        if (this.verbose) {
          const fixNote = fixAvailable ? ' (fix available)' : '';
          console.log(`${icons.fail} ${pkgName}: ${severity.toUpperCase()}${fixNote}`);
        }
      } else {
        this.results.securityVulnerabilities.warnings.push({
          name: pkgName,
          severity: severity,
          fixAvailable: !!fixAvailable
        });
        if (this.verbose) {
          console.log(`${icons.warn} ${pkgName}: ${severity}`);
        }
      }
    }

    // Summary
    if (this.verbose) {
      console.log(`\n  Summary: ${critical} critical, ${high} high, ${moderate} moderate, ${low} low`);
    }

    // Auto-fix if enabled
    if (this.autoFix && total > 0) {
      console.log(`\n${colors.cyan}Running npm audit fix...${colors.reset}`);
      try {
        const fixResult = execSync('npm audit fix 2>&1', {
          encoding: 'utf8',
          cwd: path.resolve(CONFIG.pluginsDir, '..'),
          timeout: 120000
        });

        // Check if fix was successful
        if (fixResult.includes('found 0 vulnerabilities')) {
          this.fixesApplied.push('Fixed all npm security vulnerabilities');
          console.log(`  ${colors.green}Fixed all vulnerabilities${colors.reset}`);

          // Clear failed/warnings and mark as passed
          this.results.securityVulnerabilities.failed = [];
          this.results.securityVulnerabilities.warnings = [];
          this.results.securityVulnerabilities.passed.push({
            name: 'npm audit',
            detail: 'All vulnerabilities fixed'
          });
        } else {
          // Some fixes applied
          const match = fixResult.match(/(\d+) vulnerabilities/);
          const remaining = match ? match[1] : 'some';
          this.fixesApplied.push(`Applied npm audit fix (${remaining} remaining)`);
          console.log(`  ${colors.yellow}Partial fix applied, ${remaining} vulnerabilities remain${colors.reset}`);
          console.log(`  ${colors.gray}Run 'npm audit fix --force' for breaking changes or manual review${colors.reset}`);
        }
      } catch (fixError) {
        console.log(`  ${colors.red}npm audit fix failed: ${fixError.message}${colors.reset}`);
      }
    } else if (!this.autoFix && (critical > 0 || high > 0)) {
      if (this.verbose) {
        console.log(`\n  ${colors.yellow}Run with --fix to attempt automatic fixes${colors.reset}`);
      }
    }
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

    // Apply defaults for variables not already set
    this.applyDefaults();

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

  /**
   * Apply default values for optional environment variables
   * Sets values only if not already defined in environment or .env
   */
  applyDefaults() {
    const defaults = CONFIG.environmentVars.defaults || {};

    for (const [varName, defaultValue] of Object.entries(defaults)) {
      if (!process.env[varName]) {
        process.env[varName] = defaultValue;
        if (this.verbose) {
          console.log(`${icons.info} ${varName}: set to default '${defaultValue}'`);
        }
        this.fixesApplied.push({
          type: 'default_applied',
          variable: varName,
          value: defaultValue
        });
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

      const pluginRoot = path.join(CONFIG.pluginsDir, pluginName);
      const pluginJsonPath = path.join(CONFIG.pluginsDir, pluginName, '.claude-plugin', 'plugin.json');
      const hooksJsonPath = path.join(pluginRoot, '.claude-plugin', 'hooks.json');

      if (!fs.existsSync(pluginJsonPath)) continue;

      let pluginConfig;
      try {
        pluginConfig = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      } catch (error) {
        continue;
      }

      let hooks = pluginConfig.hooks || {};
      if (fs.existsSync(hooksJsonPath)) {
        try {
          const hooksConfig = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
          hooks = hooksConfig.hooks || {};
        } catch (error) {
          this.results.hooks.failed.push({
            name: 'hooks.json',
            plugin: pluginName,
            reason: `Invalid JSON: ${error.message}`
          });
          if (this.verbose) {
            console.log(`${icons.fail} hooks.json: invalid JSON (${pluginName})`);
          }
          continue;
        }
      }

      for (const [hookType, hookConfigs] of Object.entries(hooks)) {
        if (!Array.isArray(hookConfigs)) continue;

        for (const hookConfig of hookConfigs) {
          const hookDefs = hookConfig.hooks || [];

          for (const hook of hookDefs) {
            if (hook.type !== 'command') continue;

            const hookPath = resolveHookCommandPath(hook.command, pluginRoot);
            const hookFile = getHookCommandLabel(hook.command);

            if (!hookPath) {
              this.results.hooks.passed.push({
                name: hookFile,
                plugin: pluginName,
                detail: `${hookType} inline shell command`
              });
              if (this.verbose) {
                console.log(`${icons.pass} ${hookFile}: inline shell command (${pluginName})`);
              }
              continue;
            }

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
            } else if (hookPath.endsWith('.js')) {
              const syntaxCheck = this.execSafe(`node --check "${hookPath}"`);
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
    const helperScript = path.join(CONFIG.pluginsDir, 'opspal-core', 'scripts', 'lib', 'check-supabase-status.js');

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
                const seedScript = path.join(CONFIG.pluginsDir, 'opspal-core', 'scripts', 'seed-skills-registry.js');
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
  // Check 9: PDF Pipeline Health (opspal-core)
  // ==========================================================================

  async checkPDFPipeline() {
    // Only check for opspal-core
    if (!this.isTargetedPlugin('opspal-core')) return;

    if (this.verbose) {
      console.log(`\n${colors.blue}## PDF Pipeline${colors.reset}`);
    }

    // Check 1: CSS files exist
    const cssFiles = [
      { name: 'revpal.css', path: path.join(CONFIG.pluginsDir, 'opspal-core', 'templates', 'pdf-styles', 'themes', 'revpal.css') },
      { name: 'revpal-brand.css', path: path.join(CONFIG.pluginsDir, 'opspal-core', 'templates', 'pdf-styles', 'themes', 'revpal-brand.css') },
      { name: 'base.css', path: path.join(CONFIG.pluginsDir, 'opspal-core', 'templates', 'pdf-styles', 'base.css') }
    ];

    for (const css of cssFiles) {
      if (fs.existsSync(css.path)) {
        // Verify branding content
        const content = fs.readFileSync(css.path, 'utf8');
        const hasGrape = content.toLowerCase().includes('#5f3b8c');
        const hasMontserrat = content.toLowerCase().includes('montserrat');

        if (hasGrape && hasMontserrat) {
          this.results.pdfPipeline.passed.push({ name: css.name, detail: 'branded' });
          if (this.verbose) {
            console.log(`${icons.pass} ${css.name}: exists with branding`);
          }
        } else {
          this.results.pdfPipeline.warnings.push({ name: css.name, reason: 'missing brand colors/fonts' });
          if (this.verbose) {
            console.log(`${icons.warn} ${css.name}: missing brand elements`);
          }
        }
      } else {
        this.results.pdfPipeline.failed.push({ name: css.name, reason: 'file not found' });
        if (this.verbose) {
          console.log(`${icons.fail} ${css.name}: not found`);
        }
      }
    }

    // Check 2: mmdc (Mermaid CLI)
    const mmdcVersion = this.execSafe('mmdc --version');
    if (mmdcVersion) {
      this.results.pdfPipeline.passed.push({ name: 'mmdc', version: mmdcVersion });
      if (this.verbose) {
        console.log(`${icons.pass} mmdc: ${mmdcVersion}`);
      }
    } else {
      this.results.pdfPipeline.warnings.push({ name: 'mmdc', reason: 'not installed' });
      if (this.verbose) {
        console.log(`${icons.warn} mmdc: not installed (Mermaid diagrams won't render)`);
      }

      // Auto-fix
      if (this.autoFix) {
        console.log(`  ${colors.cyan}Installing mmdc...${colors.reset}`);
        const installResult = this.execSafe('npm install -g @mermaid-js/mermaid-cli');
        if (installResult !== null) {
          this.fixesApplied.push('Installed @mermaid-js/mermaid-cli');
          console.log(`  ${colors.green}Installed mmdc${colors.reset}`);
        }
      }
    }

    // Check 3: md-to-pdf
    const mdToPdfPath = path.join(CONFIG.pluginsDir, 'opspal-core', 'node_modules', 'md-to-pdf');
    if (fs.existsSync(mdToPdfPath)) {
      this.results.pdfPipeline.passed.push({ name: 'md-to-pdf', detail: 'installed' });
      if (this.verbose) {
        console.log(`${icons.pass} md-to-pdf: installed`);
      }
    } else {
      this.results.pdfPipeline.warnings.push({ name: 'md-to-pdf', reason: 'not installed' });
      if (this.verbose) {
        console.log(`${icons.warn} md-to-pdf: not installed`);
      }

      // Auto-fix
      if (this.autoFix) {
        console.log(`  ${colors.cyan}Installing md-to-pdf...${colors.reset}`);
        const opspalCorePath = path.join(CONFIG.pluginsDir, 'opspal-core');
        const installResult = this.execSafe(`cd "${opspalCorePath}" && npm install md-to-pdf --save`);
        if (installResult !== null) {
          this.fixesApplied.push('Installed md-to-pdf in opspal-core');
          console.log(`  ${colors.green}Installed md-to-pdf${colors.reset}`);
        }
      }
    }

    // Check 4: Reliability system exists
    const reliabilityPath = path.join(CONFIG.pluginsDir, 'opspal-core', 'scripts', 'lib', 'pdf-reliability-system.js');
    if (fs.existsSync(reliabilityPath)) {
      this.results.pdfPipeline.passed.push({ name: 'reliability-system', detail: 'available' });
      if (this.verbose) {
        console.log(`${icons.pass} pdf-reliability-system: available`);
      }
    } else {
      this.results.pdfPipeline.warnings.push({ name: 'reliability-system', reason: 'not found' });
      if (this.verbose) {
        console.log(`${icons.warn} pdf-reliability-system: not found`);
      }
    }

    // Check 5: Chromium/Chrome for Puppeteer
    const chromePath = this.execSafe('which chromium-browser || which chromium || which google-chrome');
    if (chromePath) {
      this.results.pdfPipeline.passed.push({ name: 'chromium', path: chromePath });
      if (this.verbose) {
        console.log(`${icons.pass} chromium: ${chromePath}`);
      }
    } else {
      // Check if puppeteer has bundled chromium
      const puppeteerChrome = path.join(CONFIG.pluginsDir, 'opspal-core', 'node_modules', 'puppeteer', '.local-chromium');
      const puppeteerCache = path.join(os.homedir(), '.cache', 'puppeteer');

      if (fs.existsSync(puppeteerChrome) || fs.existsSync(puppeteerCache)) {
        this.results.pdfPipeline.passed.push({ name: 'chromium', detail: 'puppeteer-bundled' });
        if (this.verbose) {
          console.log(`${icons.pass} chromium: puppeteer-bundled`);
        }
      } else {
        this.results.pdfPipeline.warnings.push({ name: 'chromium', reason: 'not found (PDF generation may fail)' });
        if (this.verbose) {
          console.log(`${icons.warn} chromium: not found (PDF generation may fail)`);
        }
      }
    }
  }

  // ==========================================================================
  // Check 12: Routing Registry Validation (Architecture Audit P1-1)
  // ==========================================================================

  async checkRoutingRegistry() {
    // Only check for opspal-core
    if (!this.isTargetedPlugin('opspal-core')) return;

    if (this.verbose) {
      console.log(`\n${colors.blue}## Routing Registry${colors.reset}`);
    }

    const registryPath = path.join(CONFIG.pluginsDir, 'opspal-core', 'config', 'routing-patterns.json');

    // Check 1: Registry file exists
    if (!fs.existsSync(registryPath)) {
      this.results.routingRegistry.failed.push({
        name: 'routing-patterns.json',
        reason: 'File not found'
      });
      if (this.verbose) {
        console.log(`${icons.fail} routing-patterns.json: not found at ${registryPath}`);
      }
      return;
    }

    // Check 2: Valid JSON
    let registry;
    try {
      const content = fs.readFileSync(registryPath, 'utf8');
      registry = JSON.parse(content);
      this.results.routingRegistry.passed.push({ name: 'JSON syntax' });
      if (this.verbose) {
        console.log(`${icons.pass} routing-patterns.json: valid JSON`);
      }
    } catch (e) {
      this.results.routingRegistry.failed.push({
        name: 'routing-patterns.json',
        reason: `Invalid JSON: ${e.message}`
      });
      if (this.verbose) {
        console.log(`${icons.fail} routing-patterns.json: ${e.message}`);
      }
      return;
    }

    // Check 3: Has required sections
    const requiredSections = ['platformPatterns', 'mandatoryPatterns', 'blockingThresholds'];
    for (const section of requiredSections) {
      if (registry[section]) {
        this.results.routingRegistry.passed.push({ name: section });
        if (this.verbose) {
          console.log(`${icons.pass} ${section}: present`);
        }
      } else {
        this.results.routingRegistry.warnings.push({
          name: section,
          reason: 'Missing section'
        });
        if (this.verbose) {
          console.log(`${icons.warn} ${section}: missing`);
        }
      }
    }

    // Check 4: Canonical source flag (Architecture Audit requirement)
    if (registry.canonicalSource === true) {
      this.results.routingRegistry.passed.push({ name: 'canonicalSource' });
      if (this.verbose) {
        console.log(`${icons.pass} canonicalSource: marked as canonical`);
      }
    } else {
      this.results.routingRegistry.warnings.push({
        name: 'canonicalSource',
        reason: 'Not marked as canonical source of truth'
      });
      if (this.verbose) {
        console.log(`${icons.warn} canonicalSource: not marked (add "canonicalSource": true)`);
      }
    }

    // Check 5: Run routing conflict detector if available
    const conflictDetectorPath = path.join(CONFIG.pluginsDir, '..', 'dev-tools', 'developer-tools-plugin', 'scripts', 'lib', 'routing-conflict-detector.js');
    if (fs.existsSync(conflictDetectorPath)) {
      try {
        // Use execSync directly since conflict detector may exit with non-zero when conflicts exist
        // but still outputs valid JSON to stdout
        let result = '';
        try {
          result = execSync(`node "${conflictDetectorPath}" --json`, { stdio: 'pipe', encoding: 'utf8', timeout: 30000 }).trim();
        } catch (execError) {
          // Capture stdout even on non-zero exit (detector exits 1 when conflicts found)
          if (execError.stdout) {
            result = execError.stdout.toString().trim();
          }
        }
        if (result) {
          const conflicts = JSON.parse(result);
          const protectedConflicts = conflicts.conflicts?.protected?.length || 0;
          const exclusiveIssues = conflicts.exclusiveIssues?.length || 0;
          const crossTypeIssues = conflicts.crossTypeIssues?.length || 0;

          if (protectedConflicts === 0 && exclusiveIssues === 0) {
            this.results.routingRegistry.passed.push({ name: 'conflict detection' });
            if (this.verbose) {
              console.log(`${icons.pass} conflict detection: no critical conflicts`);
            }
          } else {
            this.results.routingRegistry.warnings.push({
              name: 'conflict detection',
              reason: `${protectedConflicts} protected keyword conflicts, ${exclusiveIssues} exclusive keyword issues`
            });
            if (this.verbose) {
              console.log(`${icons.warn} conflict detection: ${protectedConflicts} protected conflicts, ${exclusiveIssues} exclusive issues`);
              console.log(`  ${colors.gray}Run: node ${conflictDetectorPath} --resolve${colors.reset}`);
            }
          }

          // Check 5b: Cross-type conflicts (P1-3)
          if (crossTypeIssues > 0) {
            this.results.routingRegistry.warnings.push({
              name: 'cross-type conflicts',
              reason: `${crossTypeIssues} names exist as both command AND agent`
            });
            if (this.verbose) {
              console.log(`${icons.warn} cross-type conflicts: ${crossTypeIssues} ambiguous names`);
              for (const issue of (conflicts.crossTypeIssues || [])) {
                console.log(`  ${colors.gray}- ${issue.shortName}: command AND agent${colors.reset}`);
              }
            }
          } else {
            this.results.routingRegistry.passed.push({ name: 'cross-type conflicts' });
            if (this.verbose) {
              console.log(`${icons.pass} cross-type conflicts: no ambiguous names`);
            }
          }
        }
      } catch (e) {
        // Conflict detector not available or failed - just skip
        if (this.verbose) {
          console.log(`${icons.info} conflict detection: skipped (${e.message})`);
        }
      }
    }

    // Check 6: Version tracking
    if (registry.version) {
      this.results.routingRegistry.passed.push({ name: `version ${registry.version}` });
      if (this.verbose) {
        console.log(`${icons.pass} version: ${registry.version}`);
      }
    }

    // Check 7: Cross-plugin coordination (P1-4)
    const crossPluginCoordinatorPath = path.join(CONFIG.pluginsDir, 'opspal-core', 'scripts', 'lib', 'cross-plugin-coordinator.js');
    if (fs.existsSync(crossPluginCoordinatorPath)) {
      try {
        let cpResult = '';
        try {
          cpResult = execSync(`node "${crossPluginCoordinatorPath}" check-all --json`, { stdio: 'pipe', encoding: 'utf8', timeout: 30000 }).trim();
        } catch (execError) {
          if (execError.stdout) {
            cpResult = execError.stdout.toString().trim();
          }
        }

        if (cpResult) {
          const cpData = JSON.parse(cpResult);

          if (cpData.invalid === 0) {
            this.results.routingRegistry.passed.push({ name: 'cross-plugin coordination' });
            if (this.verbose) {
              console.log(`${icons.pass} cross-plugin coordination: ${cpData.valid}/${cpData.total} valid`);
            }
          } else {
            this.results.routingRegistry.warnings.push({
              name: 'cross-plugin coordination',
              reason: `${cpData.invalid} invalid cross-plugin references`
            });
            if (this.verbose) {
              console.log(`${icons.warn} cross-plugin coordination: ${cpData.invalid} invalid refs`);
              console.log(`  ${colors.gray}Run: node ${crossPluginCoordinatorPath} check-all --verbose${colors.reset}`);
            }
          }
        }
      } catch (e) {
        // Cross-plugin coordinator not available or failed
        if (this.verbose) {
          console.log(`${icons.info} cross-plugin coordination: skipped`);
        }
      }
    }
  }

  // ==========================================================================
  // Check 13: Hook Registration (Plugin hooks.json → settings.json)
  // ==========================================================================

  async checkHookRegistration() {
    if (this.verbose) {
      console.log(`\n${colors.blue}## Hook Registration${colors.reset}`);
    }

    // Try to load the hook merger
    let HookMerger;
    try {
      HookMerger = require('./hook-merger').HookMerger;
    } catch (e) {
      this.results.hookRegistration.warnings.push({
        name: 'hook-merger',
        reason: 'hook-merger.js module not found'
      });
      if (this.verbose) {
        console.log(`${icons.warn} hook-merger: module not available`);
      }
      return;
    }

    // Run the merger in analysis mode
    const merger = new HookMerger({
      dryRun: true,
      verbose: false,
      write: false
    });

    // Discover hooks
    const pluginHooks = merger.discoverPluginHooks();
    const settings = merger.loadProjectSettings();

    if (!settings) {
      this.results.hookRegistration.failed.push({
        name: 'settings.json',
        reason: 'Could not load project settings'
      });
      if (this.verbose) {
        console.log(`${icons.fail} settings.json: could not load`);
      }
      return;
    }

    // Count existing hooks in settings
    let existingCount = 0;
    for (const eventType in settings.hooks) {
      const eventHooks = settings.hooks[eventType];
      if (Array.isArray(eventHooks)) {
        for (const hookGroup of eventHooks) {
          if (hookGroup.hooks && Array.isArray(hookGroup.hooks)) {
            existingCount += hookGroup.hooks.length;
          }
        }
      }
    }

    // Count hooks in plugins
    let pluginCount = 0;
    for (const plugin of pluginHooks) {
      pluginCount += plugin.hookCount;
    }

    // Run merge to see how many would be added
    const mergedSettings = merger.mergeHooks(settings, pluginHooks);

    let mergedCount = 0;
    for (const eventType in mergedSettings.hooks) {
      const eventHooks = mergedSettings.hooks[eventType];
      if (Array.isArray(eventHooks)) {
        for (const hookGroup of eventHooks) {
          if (hookGroup.hooks && Array.isArray(hookGroup.hooks)) {
            mergedCount += hookGroup.hooks.length;
          }
        }
      }
    }

    const newHooksCount = mergedCount - existingCount;

    if (this.verbose) {
      console.log(`  ${icons.info} Plugins with hooks: ${pluginHooks.length}`);
      console.log(`  ${icons.info} Hooks in plugins: ${pluginCount}`);
      console.log(`  ${icons.info} Hooks in settings: ${existingCount}`);
      console.log(`  ${icons.info} Hooks after merge: ${mergedCount}`);
    }

    if (newHooksCount === 0) {
      // All hooks already registered
      this.results.hookRegistration.passed.push({
        name: 'hook registration',
        detail: `${existingCount} hooks registered`
      });
      if (this.verbose) {
        console.log(`${icons.pass} All plugin hooks registered (${existingCount} total)`);
      }
    } else {
      // Hooks need to be merged
      this.results.hookRegistration.failed.push({
        name: 'hook registration',
        reason: `${newHooksCount} plugin hooks not registered`
      });
      if (this.verbose) {
        console.log(`${icons.fail} ${newHooksCount} plugin hooks not registered in settings.json`);
      }

      // Auto-fix if enabled
      if (this.autoFix) {
        try {
          const writeMerger = new HookMerger({
            dryRun: false,
            verbose: false,
            write: true
          });

          await writeMerger.run();

          this.fixesApplied.push(`Merged ${newHooksCount} plugin hooks into settings.json`);

          // Move from failed to passed
          this.results.hookRegistration.failed = [];
          this.results.hookRegistration.passed.push({
            name: 'hook registration',
            detail: `${mergedCount} hooks registered (${newHooksCount} merged)`,
            note: 'auto-fixed'
          });

          if (this.verbose) {
            console.log(`  ${colors.green}Merged ${newHooksCount} hooks${colors.reset}`);
          }
        } catch (error) {
          console.log(`  ${colors.red}Failed to merge hooks: ${error.message}${colors.reset}`);
        }
      }
    }

    // Check for merger errors
    if (merger.stats && merger.stats.errors && merger.stats.errors.length > 0) {
      for (const error of merger.stats.errors) {
        this.results.hookRegistration.warnings.push({
          name: error.plugin,
          reason: error.error
        });
        if (this.verbose) {
          console.log(`  ${icons.warn} ${error.plugin}: ${error.error}`);
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
      { key: 'dependencies', label: 'System Dependencies' },
      { key: 'npmPackages', label: 'NPM Packages' },
      { key: 'securityVulnerabilities', label: 'Security Vulnerabilities' },
      { key: 'environment', label: 'Environment' },
      { key: 'mcpServers', label: 'MCP Servers' },
      { key: 'cacheDirectories', label: 'Cache Directories' },
      { key: 'hooks', label: 'Hooks' },
      { key: 'database', label: 'Database' },
      { key: 'userLevelHooks', label: 'User-Level Hooks' },
      { key: 'officialPluginFixes', label: 'Official Plugin Fixes' },
      { key: 'pdfPipeline', label: 'PDF Pipeline' },
      { key: 'routingRegistry', label: 'Routing Registry' },
      { key: 'hookRegistration', label: 'Hook Registration' }
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
