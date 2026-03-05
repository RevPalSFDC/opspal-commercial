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
    description: 'Unified agent routing with complexity analysis (replaces 5-script chain)'
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

    this.results = {
      userLevelHooks: { checks: [], fixes: [], errors: [] },
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
        command: scriptPath,
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
    const timeoutMismatches = new Set();
    const issues = [];
    let reminderPresent = false;

    for (const group of groups) {
      for (const hook of this.getGroupHooks(group)) {
        if (!hook || typeof hook !== 'object') continue;
        if (this.isReminderHook(hook)) {
          reminderPresent = true;
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

    if (timeoutMismatches.size > 0) {
      issues.push('managed-timeout-drift');
    }

    if (!reminderPresent) {
      issues.push(reminderPath ? 'missing-reminder-hook' : 'missing-reminder-hook-and-file');
    }

    return {
      issues,
      groups,
      reminderPresent,
      missingManaged,
      managedDuplicates: [...managedDuplicates],
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

      if (analysis.issues.length > 0) {
        this.results.userLevelHooks.checks.push({
          name: 'UserPromptSubmit hook',
          status: 'drifted',
          message: `Needs reconciliation (${analysis.issues.join(', ')})`
        });
        return {
          exists: true,
          settings,
          reminderPath,
          needsFix: true,
          reason: analysis.issues[0],
          analysis
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

        const retainedHooks = hooks.filter((hook) => !this.isManagedUserPromptHook(hook));
        if (retainedHooks.length === 0) continue;

        const nextGroup = {};
        if (group && typeof group === 'object' && group.matcher !== undefined) {
          nextGroup.matcher = group.matcher;
        }
        nextGroup.hooks = retainedHooks.map((hook) => ({ ...hook }));
        reconciledGroups.push(nextGroup);
      }

      const reminderPresent = reconciledGroups.some((group) =>
        this.getGroupHooks(group).some((hook) => this.isReminderHook(hook))
      );

      if (!reminderPresent) {
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
      }

      reconciledGroups.push({
        hooks: resolvedManagedHooks.hooks
      });

      settings.hooks.UserPromptSubmit = reconciledGroups;

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
  // Run All Fixes
  // ==========================================================================

  async runAllFixes() {
    this.log(`${colors.bold}${colors.cyan}Post-Plugin-Update Fixes${colors.reset}`);
    this.log(`${colors.gray}${'='.repeat(50)}${colors.reset}`);

    const results = {
      userLevelHooks: this.fixUserLevelHooks(),
      pythonPluginFixes: this.fixPythonPluginFixes(),
      reminderFile: this.checkReminderFile()
    };

    // Summary
    this.log(`\n${colors.bold}## Summary${colors.reset}`);

    const totalFixes =
      (results.userLevelHooks.fixed ? 1 : 0) +
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
