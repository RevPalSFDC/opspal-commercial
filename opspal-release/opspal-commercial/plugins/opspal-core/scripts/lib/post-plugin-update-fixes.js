#!/usr/bin/env node

/**
 * Post-Plugin-Update Fixes
 *
 * Applies fixes discovered through testing that can't be done via normal plugin installation.
 *
 * Fixes Applied:
 * 1. User-Level Hook Configuration - Reconciles ~/.claude/settings.json UserPromptSubmit hooks safely
 * 2. Official Plugin Python Fixes - Creates symlinks/init files for Python-based plugins
 * 3. Routing Reminder Validation - Ensures reminder file exists
 * 4. Plugin Cache Routing Asset Sync - Keeps critical routing scripts aligned with matching cache versions
 *
 * Background:
 * - Project-level hooks don't inject output (Claude Code bug)
 * - User-level ~/.claude/settings.json works for hook output injection
 * - User-level hooks may include custom groups that must be preserved
 *
 * @version 1.0.0
 * @date 2025-12-15
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  userSettingsPath: path.join(os.homedir(), '.claude', 'settings.json'),
  officialPluginsCache: path.join(os.homedir(), '.claude', 'plugins', 'cache', 'claude-plugins-official'),

  // Plugins that need Python import fixes
  pythonPluginFixes: [
    {
      name: 'hookify',
      symlink: 'hookify',  // Create symlink with this name pointing to .
      initFile: true       // Create __init__.py
    }
  ],

  // Reminder file locations to search (in priority order)
  reminderFileLocations: [
    // Local development - project root docs
    (projectRoot) => path.join(projectRoot, 'docs', 'reminder.md'),
    // Local development - inside plugin directory
    (projectRoot) => path.join(projectRoot, '.claude-plugins', 'opspal-core', 'docs', 'reminder.md'),
    // Installed from marketplace (revpal-internal-plugins)
    () => {
      const cacheBase = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'revpal-internal-plugins', 'opspal-core');
      if (fs.existsSync(cacheBase)) {
        const entries = fs.readdirSync(cacheBase);
        for (const entry of entries) {
          const reminderPath = path.join(cacheBase, entry, 'docs', 'reminder.md');
          if (fs.existsSync(reminderPath)) {
            return reminderPath;
          }
        }
      }
      return null;
    }
  ]
};

const MANAGED_USER_PROMPT_HOOKS = [
  {
    key: 'unified-router',
    file: 'unified-router.sh',
    timeout: 10000,
    description: 'Unified agent routing with complexity analysis (replaces 5-script chain)',
    env: {
      ROUTING_ADAPTIVE_CONTINUE: '1',
      ENABLE_HARD_BLOCKING: '0',
      ENABLE_COMPLEXITY_HARD_BLOCKING: '0',
      USER_PROMPT_MANDATORY_HARD_BLOCKING: '0'
    }
  },
  {
    key: 'pre-task-graph-trigger',
    file: 'pre-task-graph-trigger.sh',
    timeout: 5000,
    description: 'Detect when Task Graph orchestration is needed based on complexity'
  },
  {
    key: 'intake-suggestion',
    file: 'intake-suggestion.sh',
    timeout: 5000,
    description: 'Suggest /intake for project-level requests using complexity scoring and language detection'
  }
];
const USER_LEVEL_PROJECT_OWNED_EVENTS = new Set(['SessionStart', 'PreToolUse', 'PostToolUse']);
const USER_LEVEL_PROJECT_HOOK_PATTERNS = [
  'opspal-internal-plugins',
  `.claude-plugins/${['opspal', 'salesforce'].join('-')}`,
  'session-start-repo-sync.sh',
  'post-git-push-slack-notifier.sh'
];

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
  fix: `${colors.blue}🔧${colors.reset}`,
  info: `${colors.cyan}ℹ️${colors.reset}`
};

// ============================================================================
// Post-Plugin-Update Fixes Class
// ============================================================================

class PostPluginUpdateFixes {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
    this.projectRoot = options.projectRoot || process.cwd();
    this.corePluginRoot = options.corePluginRoot || process.env.CLAUDE_PLUGIN_ROOT || null;

    this.results = {
      userLevelHooks: { checks: [], fixes: [], errors: [] },
      pluginCacheAssets: { checks: [], fixes: [], errors: [] },
      pythonPluginFixes: { checks: [], fixes: [], errors: [] },
      reminderFile: { checks: [], fixes: [], errors: [] }
    };
  }

  log(message, level = 'info') {
    if (level === 'verbose' && !this.verbose) return;
    console.log(message);
  }

  /**
   * Find the reminder.md file in various locations
   * @returns {string|null} Absolute path to reminder.md or null if not found
   */
  findReminderFile() {
    for (const locationFn of CONFIG.reminderFileLocations) {
      try {
        const result = locationFn(this.projectRoot);
        if (result && fs.existsSync(result)) {
          return result;
        }
      } catch (e) {
        // Skip this location on error
      }
    }
    return null;
  }

  normalizeGroupMatcher(matcher) {
    if (typeof matcher !== 'string') return undefined;
    return matcher.trim() === '' ? undefined : matcher;
  }

  extractReminderPath(command) {
    if (typeof command !== 'string') return null;

    const quotedMatch = command.match(/cat\s+["']([^"']+\.md)["']/);
    if (quotedMatch) return quotedMatch[1];

    const plainMatch = command.match(/cat\s+([^\s"'`]+\.md)/);
    if (plainMatch) return plainMatch[1];

    return null;
  }

  isProjectOwnedNonUserPromptHook(eventName, hook) {
    if (!USER_LEVEL_PROJECT_OWNED_EVENTS.has(eventName)) {
      return false;
    }
    if (!hook || typeof hook.command !== 'string') {
      return false;
    }

    return USER_LEVEL_PROJECT_HOOK_PATTERNS.some((pattern) => hook.command.includes(pattern));
  }

  evaluateProjectOwnedHookDrift(settings) {
    const issues = [];
    let projectOwnedHooks = 0;
    let emptyMatchers = 0;

    for (const [eventName, groups] of Object.entries(settings?.hooks || {})) {
      if (!Array.isArray(groups)) continue;

      for (const group of groups) {
        if (typeof group?.matcher === 'string' && group.matcher.trim() === '') {
          emptyMatchers += 1;
        }

        for (const hook of this.getGroupHooks(group)) {
          if (this.isProjectOwnedNonUserPromptHook(eventName, hook)) {
            projectOwnedHooks += 1;
          }
        }
      }
    }

    if (projectOwnedHooks > 0) {
      issues.push('project-owned-event-hooks');
    }

    if (emptyMatchers > 0) {
      issues.push('empty-matchers');
    }

    return {
      issues,
      projectOwnedHooks,
      emptyMatchers
    };
  }

  reconcileNonUserPromptHooks(settings) {
    for (const [eventName, groups] of Object.entries(settings?.hooks || {})) {
      if (!Array.isArray(groups)) continue;

      const nextGroups = [];

      for (const group of groups) {
        const retainedHooks = this.getGroupHooks(group)
          .filter((hook) => !this.isProjectOwnedNonUserPromptHook(eventName, hook))
          .map((hook) => ({ ...hook }));

        if (retainedHooks.length === 0) {
          continue;
        }

        const nextGroup = {
          hooks: retainedHooks
        };
        const matcher = this.normalizeGroupMatcher(group?.matcher);
        if (matcher !== undefined) {
          nextGroup.matcher = matcher;
        }
        nextGroups.push(nextGroup);
      }

      if (nextGroups.length > 0) {
        settings.hooks[eventName] = nextGroups;
      } else {
        delete settings.hooks[eventName];
      }
    }
  }

  // ==========================================================================
  // User-Level Hook Configuration
  // ==========================================================================

  getUserPromptSubmitGroups(settings) {
    if (!settings || typeof settings !== 'object') return [];
    if (!settings.hooks || typeof settings.hooks !== 'object') return [];
    return Array.isArray(settings.hooks.UserPromptSubmit) ? settings.hooks.UserPromptSubmit : [];
  }

  getGroupHooks(group) {
    if (!group || typeof group !== 'object') return [];
    if (Array.isArray(group.hooks)) return group.hooks;
    if (group.type || group.command) return [group];
    return [];
  }

  getManagedHookKey(command) {
    if (typeof command !== 'string' || command.trim() === '') return null;
    for (const hookDef of MANAGED_USER_PROMPT_HOOKS) {
      if (command.includes(hookDef.file)) {
        return hookDef.key;
      }
    }
    return null;
  }

  isManagedUserPromptHook(hook) {
    if (!hook || typeof hook !== 'object') return false;
    return this.getManagedHookKey(hook.command) !== null;
  }

  isReminderHook(hook) {
    if (!hook || typeof hook !== 'object') return false;
    return typeof hook.command === 'string' && hook.command.includes('reminder.md');
  }

  extractScriptPath(command) {
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

  toCanonicalScriptPath(command) {
    const scriptPath = this.extractScriptPath(command);
    if (!scriptPath) return null;

    const expanded = scriptPath.startsWith('~/')
      ? path.join(os.homedir(), scriptPath.slice(2))
      : scriptPath;

    if (path.isAbsolute(expanded)) {
      return path.resolve(expanded);
    }

    return path.resolve(this.projectRoot, expanded);
  }

  findCorePluginRoot() {
    if (this.corePluginRoot && fs.existsSync(this.corePluginRoot)) {
      const requiredHookPath = (root, file) => path.join(root, 'hooks', file);
      const hasAllHooks = MANAGED_USER_PROMPT_HOOKS.every((hookDef) =>
        fs.existsSync(requiredHookPath(this.corePluginRoot, hookDef.file))
      );
      if (hasAllHooks) {
        return this.corePluginRoot;
      }
    }

    const candidateRoots = [
      path.join(this.projectRoot, 'plugins', 'opspal-core'),
      path.join(this.projectRoot, '.claude-plugins', 'opspal-core')
    ];

    const requiredHookPath = (root, file) => path.join(root, 'hooks', file);

    for (const candidate of candidateRoots) {
      if (!fs.existsSync(candidate)) continue;
      const hasAllHooks = MANAGED_USER_PROMPT_HOOKS.every((hookDef) =>
        fs.existsSync(requiredHookPath(candidate, hookDef.file))
      );
      if (hasAllHooks) {
        return candidate;
      }
    }

    const cacheBase = path.join(
      os.homedir(),
      '.claude',
      'plugins',
      'cache',
      'revpal-internal-plugins',
      'opspal-core'
    );

    if (!fs.existsSync(cacheBase)) {
      return null;
    }

    for (const entry of fs.readdirSync(cacheBase)) {
      const candidate = path.join(cacheBase, entry);
      if (!fs.existsSync(candidate)) continue;
      const hasAllHooks = MANAGED_USER_PROMPT_HOOKS.every((hookDef) =>
        fs.existsSync(requiredHookPath(candidate, hookDef.file))
      );
      if (hasAllHooks) {
        return candidate;
      }
    }

    return null;
  }

  getPluginVersion(pluginRoot) {
    if (!pluginRoot) return null;

    const pluginJsonPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
    if (!fs.existsSync(pluginJsonPath)) {
      return null;
    }

    try {
      const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      return typeof pluginJson.version === 'string' ? pluginJson.version.trim() : null;
    } catch (_error) {
      return null;
    }
  }

  getCachePluginBase() {
    return path.join(
      os.homedir(),
      '.claude',
      'plugins',
      'cache',
      'revpal-internal-plugins',
      'opspal-core'
    );
  }

  getMarketplacePluginRoot() {
    const directPath = path.join(
      os.homedir(),
      '.claude',
      'plugins',
      'marketplaces',
      'revpal-internal-plugins',
      'plugins',
      'opspal-core'
    );

    if (fs.existsSync(directPath)) {
      return directPath;
    }

    return null;
  }

  resolveCacheAssetSyncSource() {
    const candidates = [
      this.corePluginRoot,
      path.join(this.projectRoot, 'plugins', 'opspal-core'),
      path.join(this.projectRoot, '.claude-plugins', 'opspal-core'),
      this.getMarketplacePluginRoot()
    ];

    for (const candidate of candidates) {
      if (!candidate || !fs.existsSync(candidate)) {
        continue;
      }

      const version = this.getPluginVersion(candidate);
      if (!version) {
        continue;
      }

      return {
        root: candidate,
        version
      };
    }

    return null;
  }

  copyCacheAsset(sourcePath, targetPath) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);

    const sourceStat = fs.statSync(sourcePath);
    fs.chmodSync(targetPath, sourceStat.mode);
  }

  buildManagedHookCommand(scriptPath, hookDef) {
    if (!hookDef?.env || Object.keys(hookDef.env).length === 0) {
      return scriptPath;
    }

    const envParts = Object.entries(hookDef.env)
      .map(([key, value]) => `${key}=${value}`);

    return `env ${envParts.join(' ')} ${scriptPath}`;
  }

  resolveManagedUserPromptHooks(existingGroups) {
    const hooksByKey = new Map();
    const corePluginRoot = this.findCorePluginRoot();

    for (const group of existingGroups) {
      for (const hook of this.getGroupHooks(group)) {
        const key = this.getManagedHookKey(hook.command);
        if (!key || hooksByKey.has(key)) continue;
        hooksByKey.set(key, hook.command);
      }
    }

    const resolvedHooks = [];

    for (const hookDef of MANAGED_USER_PROMPT_HOOKS) {
      let command = null;

      if (corePluginRoot) {
        command = path.join(corePluginRoot, 'hooks', hookDef.file);
      } else if (hooksByKey.has(hookDef.key)) {
        const existingCommand = hooksByKey.get(hookDef.key);
        command = this.toCanonicalScriptPath(existingCommand) || existingCommand;
      } else {
        const fallback = path.join(this.projectRoot, 'plugins', 'opspal-core', 'hooks', hookDef.file);
        if (fs.existsSync(fallback)) {
          command = fallback;
        }
      }

      if (!command) {
        return {
          error: `Unable to resolve managed hook path for ${hookDef.file}`
        };
      }

      const scriptPath = this.toCanonicalScriptPath(command);
      if (!scriptPath || !fs.existsSync(scriptPath)) {
        return {
          error: `Managed hook script not found for ${hookDef.file}: ${command}`
        };
      }

      resolvedHooks.push({
        type: 'command',
        command: this.buildManagedHookCommand(scriptPath, hookDef),
        timeout: hookDef.timeout,
        description: hookDef.description
      });
    }

    return { hooks: resolvedHooks };
  }

  evaluateUserPromptSubmit(settings, reminderPath) {
    const groups = this.getUserPromptSubmitGroups(settings);
    const managedSeen = new Map();
    const managedDuplicates = new Set();
    const missingManaged = [];
    const managedPathDrift = new Set();
    const managedCommandDrift = new Set();
    const timeoutMismatches = new Set();
    const issues = [];
    let reminderPresent = false;
    let reminderPathDrift = false;
    const resolvedManagedHooks = this.resolveManagedUserPromptHooks(groups);
    const expectedManagedPaths = new Map();
    const expectedManagedCommands = new Map();

    if (!resolvedManagedHooks.error) {
      for (let index = 0; index < MANAGED_USER_PROMPT_HOOKS.length; index += 1) {
        const hookDef = MANAGED_USER_PROMPT_HOOKS[index];
        const hook = resolvedManagedHooks.hooks[index];
        const scriptPath = this.toCanonicalScriptPath(hook.command);
        if (scriptPath) {
          expectedManagedPaths.set(hookDef.key, scriptPath);
        }
        expectedManagedCommands.set(hookDef.key, hook.command.trim());
      }
    }

    for (const group of groups) {
      for (const hook of this.getGroupHooks(group)) {
        if (!hook || typeof hook !== 'object') continue;
        if (this.isReminderHook(hook)) {
          reminderPresent = true;
          const currentReminderPath = this.extractReminderPath(hook.command);
          if (!currentReminderPath || !fs.existsSync(currentReminderPath)) {
            reminderPathDrift = true;
          } else if (reminderPath && path.resolve(currentReminderPath) !== path.resolve(reminderPath)) {
            reminderPathDrift = true;
          }
        }

        const key = this.getManagedHookKey(hook.command);
        if (!key) continue;

        const hookDef = MANAGED_USER_PROMPT_HOOKS.find((item) => item.key === key);
        if (!hookDef) continue;

        if (managedSeen.has(key)) {
          managedDuplicates.add(key);
          continue;
        }

        managedSeen.set(key, hook);

        if (hook.timeout !== hookDef.timeout) {
          timeoutMismatches.add(key);
        }

        const currentPath = this.toCanonicalScriptPath(hook.command);
        const expectedPath = expectedManagedPaths.get(key);
        if (!currentPath || !fs.existsSync(currentPath) || (expectedPath && currentPath !== expectedPath)) {
          managedPathDrift.add(key);
        }

        const expectedCommand = expectedManagedCommands.get(key);
        if (expectedCommand && hook.command.trim() !== expectedCommand) {
          managedCommandDrift.add(key);
        }
      }
    }

    for (const hookDef of MANAGED_USER_PROMPT_HOOKS) {
      if (!managedSeen.has(hookDef.key)) {
        missingManaged.push(hookDef.key);
      }
    }

    if (!settings.hooks || typeof settings.hooks !== 'object') {
      issues.push('no-hooks-section');
    }

    if (!Array.isArray(settings?.hooks?.UserPromptSubmit)) {
      issues.push('no-userpromptsubmit');
    }

    if (missingManaged.length > 0) {
      issues.push('missing-managed-hooks');
    }

    if (managedDuplicates.size > 0) {
      issues.push('duplicate-managed-hooks');
    }

    if (resolvedManagedHooks.error || managedPathDrift.size > 0 || managedCommandDrift.size > 0) {
      issues.push('managed-path-drift');
    }

    if (timeoutMismatches.size > 0) {
      issues.push('managed-timeout-drift');
    }

    if (!reminderPresent) {
      issues.push(reminderPath ? 'missing-reminder-hook' : 'missing-reminder-hook-and-file');
    } else if (reminderPathDrift) {
      issues.push('reminder-path-drift');
    }

    return {
      issues,
      groups,
      reminderPresent,
      missingManaged,
      managedPathDrift: [...managedPathDrift],
      managedCommandDrift: [...managedCommandDrift],
      managedDuplicates: [...managedDuplicates],
      reminderPathDrift,
      timeoutMismatches: [...timeoutMismatches]
    };
  }

  checkUserLevelHooks() {
    this.log(`\n${colors.bold}## User-Level Hooks${colors.reset}`);

    // Check if settings file exists
    if (!fs.existsSync(CONFIG.userSettingsPath)) {
      this.results.userLevelHooks.checks.push({
        name: 'settings.json exists',
        status: 'missing',
        message: 'File does not exist'
      });
      return { exists: false, needsFix: true };
    }

    try {
      const settings = JSON.parse(fs.readFileSync(CONFIG.userSettingsPath, 'utf8'));
      const reminderPath = this.findReminderFile();
      const analysis = this.evaluateUserPromptSubmit(settings, reminderPath);
      const projectHookAnalysis = this.evaluateProjectOwnedHookDrift(settings);

      if (analysis.issues.length > 0 || projectHookAnalysis.issues.length > 0) {
        const combinedIssues = [...analysis.issues, ...projectHookAnalysis.issues];
        this.results.userLevelHooks.checks.push({
          name: 'UserPromptSubmit hook',
          status: 'drifted',
          message: `Needs reconciliation (${combinedIssues.join(', ')})`
        });
        return {
          exists: true,
          settings,
          reminderPath,
          needsFix: true,
          reason: combinedIssues[0],
          analysis,
          projectHookAnalysis
        };
      }

      this.log(`${icons.pass} User-level hooks configured correctly`);
      this.results.userLevelHooks.checks.push({
        name: 'configuration',
        status: 'valid',
        message: 'Hooks configured correctly'
      });
      return { exists: true, settings, reminderPath, needsFix: false, analysis };

    } catch (error) {
      this.results.userLevelHooks.errors.push({
        name: 'parse error',
        message: error.message
      });
      return { exists: true, needsFix: true, reason: 'parse-error', error };
    }
  }

  fixUserLevelHooks() {
    const check = this.checkUserLevelHooks();

    if (!check.needsFix) {
      return { fixed: false, reason: 'already-configured' };
    }

    try {
      let settings = {};

      // Load existing settings if file exists
      if (check.exists && check.settings) {
        settings = check.settings;
      } else if (fs.existsSync(CONFIG.userSettingsPath)) {
        settings = JSON.parse(fs.readFileSync(CONFIG.userSettingsPath, 'utf8'));
      }

      settings.hooks = settings.hooks || {};
      const existingGroups = this.getUserPromptSubmitGroups(settings);
      const resolvedManagedHooks = this.resolveManagedUserPromptHooks(existingGroups);

      if (resolvedManagedHooks.error) {
        this.results.userLevelHooks.errors.push({
          name: 'managed hooks',
          message: resolvedManagedHooks.error
        });
        this.log(`${icons.fail} ${resolvedManagedHooks.error}`);
        return { fixed: false, reason: 'managed-hooks-unresolved' };
      }

      const reconciledGroups = [];

      for (const group of existingGroups) {
        const hooks = this.getGroupHooks(group);
        if (hooks.length === 0) continue;

        const retainedHooks = hooks.filter((hook) => !this.isManagedUserPromptHook(hook) && !this.isReminderHook(hook));
        if (retainedHooks.length === 0) continue;

        const nextGroup = {
          hooks: retainedHooks.map((hook) => ({ ...hook }))
        };
        const matcher = this.normalizeGroupMatcher(group?.matcher);
        if (matcher !== undefined) {
          nextGroup.matcher = matcher;
        }
        reconciledGroups.push(nextGroup);
      }

      const reminderPath = check.reminderPath || this.findReminderFile();
      if (!reminderPath) {
        this.log(`${icons.fail} Could not find reminder.md in any known location`);
        this.results.userLevelHooks.errors.push({
          name: 'reminder file',
          message: 'Could not find reminder.md - searched local and installed plugin locations'
        });
        return { fixed: false, reason: 'reminder-not-found' };
      }

      this.log(`${icons.info} Found reminder at: ${reminderPath}`, 'verbose');
      reconciledGroups.unshift({
        hooks: [
          {
            type: 'command',
            command: `cat ${reminderPath}`,
            timeout: 5000
          }
        ]
      });

      reconciledGroups.push({
        hooks: resolvedManagedHooks.hooks
      });

      settings.hooks.UserPromptSubmit = reconciledGroups;
      this.reconcileNonUserPromptHooks(settings);

      if (this.dryRun) {
        this.log(`${icons.info} [DRY RUN] Would update ${CONFIG.userSettingsPath}`);
        this.log(`${colors.gray}${JSON.stringify(settings.hooks.UserPromptSubmit, null, 2)}${colors.reset}`, 'verbose');
      } else {
        // Ensure directory exists
        const dir = path.dirname(CONFIG.userSettingsPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(CONFIG.userSettingsPath, JSON.stringify(settings, null, 2));
        this.log(`${icons.fix} Updated ${CONFIG.userSettingsPath}`);
      }

      this.results.userLevelHooks.fixes.push({
        name: 'UserPromptSubmit hook',
        action: 'reconciled',
        path: CONFIG.userSettingsPath
      });

      return { fixed: true, path: CONFIG.userSettingsPath };

    } catch (error) {
      this.results.userLevelHooks.errors.push({
        name: 'fix error',
        message: error.message
      });
      this.log(`${icons.fail} Failed to update settings: ${error.message}`);
      return { fixed: false, error };
    }
  }

  // ==========================================================================
  // Python Plugin Fixes (hookify, etc.)
  // ==========================================================================

  checkPythonPluginFixes() {
    this.log(`\n${colors.bold}## Official Plugin Fixes${colors.reset}`);

    const issues = [];

    for (const pluginConfig of CONFIG.pythonPluginFixes) {
      const pluginCacheDir = path.join(CONFIG.officialPluginsCache, pluginConfig.name);

      if (!fs.existsSync(pluginCacheDir)) {
        this.log(`${icons.info} ${pluginConfig.name}: not installed`, 'verbose');
        continue;
      }

      // Find the actual plugin directory (could be hash-named)
      const entries = fs.readdirSync(pluginCacheDir);
      for (const entry of entries) {
        const pluginDir = path.join(pluginCacheDir, entry);

        // Use lstatSync to handle broken symlinks gracefully
        let stat;
        try {
          stat = fs.lstatSync(pluginDir);
        } catch (e) {
          continue; // Skip if we can't stat the entry
        }

        // Skip symlinks (could be broken) and non-directories
        if (stat.isSymbolicLink()) continue;
        if (!stat.isDirectory()) continue;
        if (entry === 'unknown') continue; // Skip 'unknown' directory

        // Check symlink
        if (pluginConfig.symlink) {
          const symlinkPath = path.join(pluginDir, pluginConfig.symlink);
          if (!fs.existsSync(symlinkPath)) {
            issues.push({
              plugin: pluginConfig.name,
              dir: pluginDir,
              type: 'symlink',
              path: symlinkPath,
              target: '.'
            });
            this.results.pythonPluginFixes.checks.push({
              name: `${pluginConfig.name} symlink`,
              status: 'missing',
              message: `Missing ${pluginConfig.symlink} symlink`
            });
          } else {
            this.log(`${icons.pass} ${pluginConfig.name}: symlink exists`);
          }
        }

        // Check __init__.py
        if (pluginConfig.initFile) {
          const initPath = path.join(pluginDir, '__init__.py');
          if (!fs.existsSync(initPath)) {
            issues.push({
              plugin: pluginConfig.name,
              dir: pluginDir,
              type: 'init',
              path: initPath
            });
            this.results.pythonPluginFixes.checks.push({
              name: `${pluginConfig.name} __init__.py`,
              status: 'missing',
              message: `Missing __init__.py`
            });
          } else {
            this.log(`${icons.pass} ${pluginConfig.name}: __init__.py exists`);
          }
        }
      }
    }

    return issues;
  }

  fixPythonPluginFixes() {
    const issues = this.checkPythonPluginFixes();

    if (issues.length === 0) {
      return { fixed: false, reason: 'no-issues' };
    }

    const fixes = [];

    for (const issue of issues) {
      try {
        if (issue.type === 'symlink') {
          if (this.dryRun) {
            this.log(`${icons.info} [DRY RUN] Would create symlink: ${issue.path} -> ${issue.target}`);
          } else {
            // Remove if exists (might be broken)
            if (fs.existsSync(issue.path)) {
              fs.unlinkSync(issue.path);
            }
            fs.symlinkSync(issue.target, issue.path);
            this.log(`${icons.fix} Created symlink: ${issue.path} -> ${issue.target}`);
          }
          fixes.push({ type: 'symlink', path: issue.path });
        } else if (issue.type === 'init') {
          if (this.dryRun) {
            this.log(`${icons.info} [DRY RUN] Would create: ${issue.path}`);
          } else {
            fs.writeFileSync(issue.path, '');
            this.log(`${icons.fix} Created: ${issue.path}`);
          }
          fixes.push({ type: 'init', path: issue.path });
        }

        this.results.pythonPluginFixes.fixes.push({
          name: `${issue.plugin} ${issue.type}`,
          action: 'created',
          path: issue.path
        });

      } catch (error) {
        this.results.pythonPluginFixes.errors.push({
          name: `${issue.plugin} ${issue.type}`,
          message: error.message
        });
        this.log(`${icons.fail} Failed to fix ${issue.plugin}: ${error.message}`);
      }
    }

    return { fixed: fixes.length > 0, fixes };
  }

  // ==========================================================================
  // Reminder File Validation
  // ==========================================================================

  checkReminderFile() {
    this.log(`\n${colors.bold}## Reminder File${colors.reset}`);

    const reminderPath = this.findReminderFile();

    if (!reminderPath) {
      this.results.reminderFile.checks.push({
        name: 'reminder.md',
        status: 'missing',
        message: 'Not found in any known location (project, plugin, or installed)'
      });
      this.log(`${icons.warn} Reminder file not found in any location`);
      return { exists: false, path: null };
    }

    const content = fs.readFileSync(reminderPath, 'utf8');
    const wordCount = content.split(/\s+/).length;

    // Check if it's still the test content
    if (content.includes('TEST: Hook Output Injection')) {
      this.results.reminderFile.checks.push({
        name: 'reminder.md',
        status: 'test-content',
        message: 'Contains test content, needs real routing instructions'
      });
      this.log(`${icons.warn} Reminder file contains test content`);
      return { exists: true, path: reminderPath, isTestContent: true, wordCount };
    }

    this.log(`${icons.pass} Reminder file found: ${reminderPath} (${wordCount} words)`);
    this.results.reminderFile.checks.push({
      name: 'reminder.md',
      status: 'valid',
      message: `Found at ${reminderPath} (${wordCount} words)`
    });
    return { exists: true, path: reminderPath, wordCount };
  }

  // ==========================================================================
  // Plugin Cache hooks.json Reconciliation
  // ==========================================================================

  /**
   * Ensures the plugin-level hooks.json in ~/.claude/plugins/cache/ has the
   * correct env overrides on the unified-router command. Without these, the
   * router defaults to hard-blocking prompts that match mandatory routes.
   */
  fixPluginCacheHooksJson() {
    this.log(`\n${colors.bold}## Plugin Cache hooks.json${colors.reset}`);

    const cacheBase = this.getCachePluginBase();

    if (!fs.existsSync(cacheBase)) {
      this.log(`${icons.info} No cached opspal-core found, skipping`);
      return { fixed: false, reason: 'no-cache' };
    }

    const requiredEnvPrefix = 'env ROUTING_ADAPTIVE_CONTINUE=1 ENABLE_HARD_BLOCKING=0 ENABLE_COMPLEXITY_HARD_BLOCKING=0 USER_PROMPT_MANDATORY_HARD_BLOCKING=0 ';
    const bareCommand = '${CLAUDE_PLUGIN_ROOT}/hooks/unified-router.sh';
    let totalFixed = 0;

    for (const entry of fs.readdirSync(cacheBase)) {
      const hooksJsonPath = path.join(cacheBase, entry, '.claude-plugin', 'hooks.json');
      if (!fs.existsSync(hooksJsonPath)) continue;

      try {
        const content = fs.readFileSync(hooksJsonPath, 'utf8');
        const hooksConfig = JSON.parse(content);
        let modified = false;

        const upsGroups = hooksConfig?.hooks?.UserPromptSubmit;
        if (!Array.isArray(upsGroups)) continue;

        for (const group of upsGroups) {
          const hooks = Array.isArray(group.hooks) ? group.hooks : [];
          for (const hook of hooks) {
            if (typeof hook.command !== 'string') continue;
            if (!hook.command.includes('unified-router.sh')) continue;

            // Check if it already has all required env vars
            if (hook.command.includes('ENABLE_HARD_BLOCKING=0') &&
                hook.command.includes('ENABLE_COMPLEXITY_HARD_BLOCKING=0') &&
                hook.command.includes('USER_PROMPT_MANDATORY_HARD_BLOCKING=0') &&
                hook.command.includes('ROUTING_ADAPTIVE_CONTINUE=1')) {
              this.log(`${icons.pass} Cache ${entry}: hooks.json already has env overrides`);
              continue;
            }

            // Replace command with env-prefixed version
            const newCommand = requiredEnvPrefix + bareCommand;
            if (this.dryRun) {
              this.log(`${icons.info} [DRY RUN] Would patch ${entry} hooks.json`);
            } else {
              hook.command = newCommand;
              modified = true;
            }
          }
        }

        if (modified) {
          fs.writeFileSync(hooksJsonPath, JSON.stringify(hooksConfig, null, 2));
          this.log(`${icons.fix} Patched cache ${entry}/.claude-plugin/hooks.json with env overrides`);
          totalFixed++;
        }
      } catch (err) {
        this.log(`${icons.fail} Failed to patch ${entry}: ${err.message}`);
        this.results.pluginCacheAssets.errors.push({
          name: `cache-hooks-${entry}`,
          message: err.message
        });
      }
    }

    return { fixed: totalFixed > 0, count: totalFixed };
  }

  syncPluginCacheRoutingAssets() {
    this.log(`\n${colors.bold}## Plugin Cache Routing Assets${colors.reset}`);

    const cacheBase = this.getCachePluginBase();
    if (!fs.existsSync(cacheBase)) {
      this.log(`${icons.info} No cached opspal-core found, skipping`);
      return { fixed: false, reason: 'no-cache' };
    }

    const syncSource = this.resolveCacheAssetSyncSource();
    if (!syncSource) {
      this.log(`${icons.info} No routing asset source found, skipping`);
      return { fixed: false, reason: 'no-source' };
    }

    const matchingEntries = fs.readdirSync(cacheBase)
      .filter((entry) => entry === syncSource.version)
      .map((entry) => path.join(cacheBase, entry));

    if (matchingEntries.length === 0) {
      const message = `No cache entry matches source version ${syncSource.version}; skipping asset sync to avoid version drift`;
      this.log(`${icons.info} ${message}`);
      this.results.pluginCacheAssets.checks.push({
        name: 'routing-cache-asset-sync',
        status: 'skipped',
        message
      });
      return { fixed: false, reason: 'no-matching-cache-version', sourceVersion: syncSource.version };
    }

    const assets = [
      'hooks/unified-router.sh',
      'hooks/pre-tool-use-contract-validation.sh',
      'hooks/pre-task-agent-validator.sh',
      'scripts/lib/routing-state-manager.js',
      'config/mcp-tool-policies.json'
    ];

    let copied = 0;
    for (const cacheRoot of matchingEntries) {
      for (const relativePath of assets) {
        const sourcePath = path.join(syncSource.root, relativePath);
        if (!fs.existsSync(sourcePath)) {
          this.results.pluginCacheAssets.errors.push({
            name: `missing-source-${relativePath}`,
            message: `Missing source asset: ${sourcePath}`
          });
          continue;
        }

        const targetPath = path.join(cacheRoot, relativePath);
        if (this.dryRun) {
          this.log(`${icons.info} [DRY RUN] Would sync ${relativePath} into ${cacheRoot}`);
          copied += 1;
          continue;
        }

        this.copyCacheAsset(sourcePath, targetPath);
        copied += 1;
      }
    }

    if (copied > 0) {
      const versionList = matchingEntries.map((entry) => path.basename(entry)).join(', ');
      this.log(`${icons.fix} Synced routing assets into cache version(s): ${versionList}`);
      this.results.pluginCacheAssets.fixes.push({
        name: 'routing-cache-assets',
        message: `Synced ${copied} asset copies from ${syncSource.root}`
      });
    }

    return {
      fixed: copied > 0,
      count: copied,
      sourceVersion: syncSource.version
    };
  }

  // ==========================================================================
  // Run All Fixes
  // ==========================================================================

  async runAllFixes() {
    this.log(`${colors.bold}${colors.cyan}Post-Plugin-Update Fixes${colors.reset}`);
    this.log(`${colors.gray}${'='.repeat(50)}${colors.reset}`);

    const results = {
      userLevelHooks: this.fixUserLevelHooks(),
      pluginCacheHooks: this.fixPluginCacheHooksJson(),
      pluginCacheAssets: this.syncPluginCacheRoutingAssets(),
      pythonPluginFixes: this.fixPythonPluginFixes(),
      reminderFile: this.checkReminderFile()
    };

    // Summary
    this.log(`\n${colors.bold}## Summary${colors.reset}`);

    const totalFixes =
      (results.userLevelHooks.fixed ? 1 : 0) +
      (results.pluginCacheHooks?.fixed ? results.pluginCacheHooks.count || 1 : 0) +
      (results.pluginCacheAssets?.fixed ? results.pluginCacheAssets.count || 1 : 0) +
      (results.pythonPluginFixes.fixed ? results.pythonPluginFixes.fixes?.length || 0 : 0);

    if (totalFixes > 0) {
      this.log(`${icons.fix} Applied ${totalFixes} fix(es)`);
    } else {
      this.log(`${icons.pass} No fixes needed`);
    }

    if (results.reminderFile.isTestContent) {
      this.log(`${icons.warn} Reminder file needs real routing content`);
    }

    return results;
  }

  // ==========================================================================
  // Run All Checks (without fixing)
  // ==========================================================================

  runAllChecks() {
    this.log(`${colors.bold}${colors.cyan}Post-Plugin-Update Checks${colors.reset}`);
    this.log(`${colors.gray}${'='.repeat(50)}${colors.reset}`);

    const results = {
      userLevelHooks: this.checkUserLevelHooks(),
      pluginCacheHooks: this.fixPluginCacheHooksJson(),  // Always fix cache — it's idempotent
      pluginCacheAssets: this.syncPluginCacheRoutingAssets(),
      pythonPluginFixes: this.checkPythonPluginFixes(),
      reminderFile: this.checkReminderFile()
    };

    return results;
  }

  getResults() {
    return this.results;
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    dryRun: args.includes('--dry-run'),
    fix: args.includes('--fix'),
    projectRoot: process.cwd()
  };

  // Handle --project-root option
  const projectRootIdx = args.findIndex(a => a.startsWith('--project-root'));
  if (projectRootIdx !== -1) {
    if (args[projectRootIdx].includes('=')) {
      options.projectRoot = args[projectRootIdx].split('=')[1];
    } else if (args[projectRootIdx + 1]) {
      options.projectRoot = args[projectRootIdx + 1];
    }
  }

  const fixer = new PostPluginUpdateFixes(options);

  if (options.fix) {
    fixer.runAllFixes();
  } else {
    fixer.runAllChecks();
  }
}

module.exports = { PostPluginUpdateFixes, CONFIG };
