#!/usr/bin/env node

/**
 * Post-Plugin-Update Fixes
 *
 * Applies fixes discovered through testing that can't be done via normal plugin installation.
 *
 * Fixes Applied:
 * 1. User-Level Hook Configuration - Configures ~/.claude/settings.json with working hook format
 * 2. Official Plugin Python Fixes - Creates symlinks/init files for Python-based plugins
 * 3. Routing Reminder Validation - Ensures reminder file exists
 *
 * Background:
 * - Project-level hooks don't inject output (Claude Code bug)
 * - User-level ~/.claude/settings.json works for hook output injection
 * - Official docs format required (no `matcher` field)
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
    (projectRoot) => path.join(projectRoot, '.claude-plugins', 'cross-platform-plugin', 'docs', 'reminder.md'),
    // Installed from marketplace (revpal-internal-plugins)
    () => {
      const cacheBase = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'revpal-internal-plugins', 'cross-platform-plugin');
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

      // Check if hooks section exists
      if (!settings.hooks) {
        this.results.userLevelHooks.checks.push({
          name: 'hooks section',
          status: 'missing',
          message: 'No hooks section in settings'
        });
        return { exists: true, settings, needsFix: true, reason: 'no-hooks-section' };
      }

      // Check if UserPromptSubmit hook exists
      if (!settings.hooks.UserPromptSubmit || !Array.isArray(settings.hooks.UserPromptSubmit)) {
        this.results.userLevelHooks.checks.push({
          name: 'UserPromptSubmit hook',
          status: 'missing',
          message: 'No UserPromptSubmit hook configured'
        });
        return { exists: true, settings, needsFix: true, reason: 'no-userpromptsubmit' };
      }

      // Check hook format (should NOT have matcher field at top level)
      const hook = settings.hooks.UserPromptSubmit[0];
      if (hook.matcher !== undefined) {
        this.results.userLevelHooks.checks.push({
          name: 'hook format',
          status: 'incorrect',
          message: 'Hook has matcher field (should use official docs format)'
        });
        return { exists: true, settings, needsFix: true, reason: 'wrong-format' };
      }

      // Check if hook has nested hooks array
      if (!hook.hooks || !Array.isArray(hook.hooks)) {
        this.results.userLevelHooks.checks.push({
          name: 'hook structure',
          status: 'incorrect',
          message: 'Hook missing nested hooks array'
        });
        return { exists: true, settings, needsFix: true, reason: 'wrong-structure' };
      }

      // Check if command points to existing file
      const innerHook = hook.hooks[0];
      if (innerHook && innerHook.command) {
        const match = innerHook.command.match(/cat\s+(.+)$/);
        if (match) {
          const filePath = match[1].trim();
          if (!fs.existsSync(filePath)) {
            this.results.userLevelHooks.checks.push({
              name: 'reminder file',
              status: 'missing',
              message: `File not found: ${filePath}`
            });
            return { exists: true, settings, needsFix: true, reason: 'file-missing' };
          }
        }
      }

      this.log(`${icons.pass} User-level hooks configured correctly`);
      this.results.userLevelHooks.checks.push({
        name: 'configuration',
        status: 'valid',
        message: 'Hooks configured correctly'
      });
      return { exists: true, settings, needsFix: false };

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

    // Find reminder file in various locations
    const reminderPath = this.findReminderFile();

    if (!reminderPath) {
      this.log(`${icons.fail} Could not find reminder.md in any known location`);
      this.results.userLevelHooks.errors.push({
        name: 'reminder file',
        message: 'Could not find reminder.md - searched local and installed plugin locations'
      });
      return { fixed: false, reason: 'reminder-not-found' };
    }

    this.log(`${icons.info} Found reminder at: ${reminderPath}`, 'verbose');

    // Build the correct hook configuration
    const hookConfig = {
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: 'command',
              command: `cat ${reminderPath}`
            }
          ]
        }
      ]
    };

    try {
      let settings = {};

      // Load existing settings if file exists
      if (check.exists && check.settings) {
        settings = check.settings;
      } else if (fs.existsSync(CONFIG.userSettingsPath)) {
        settings = JSON.parse(fs.readFileSync(CONFIG.userSettingsPath, 'utf8'));
      }

      // Merge hooks (preserve other settings)
      settings.hooks = settings.hooks || {};
      settings.hooks.UserPromptSubmit = hookConfig.UserPromptSubmit;

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
        action: 'configured',
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
        if (!fs.statSync(pluginDir).isDirectory()) continue;
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
