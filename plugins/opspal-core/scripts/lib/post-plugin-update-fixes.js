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
const {
  DEFAULT_MARKETPLACE_NAME,
  listMarketplaceNames
} = require('./marketplace-config');
const {
  normalizeProjectHookSettings,
  sanitizeSettingsPermissions
} = require('./hook-settings-normalizer');

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
    // Installed from marketplace cache
    () => {
      const cacheRoot = path.join(os.homedir(), '.claude', 'plugins', 'cache');
      if (fs.existsSync(cacheRoot)) {
        for (const marketplaceName of fs.readdirSync(cacheRoot)) {
          const cacheBase = path.join(cacheRoot, marketplaceName, 'opspal-core');
          if (!fs.existsSync(cacheBase)) {
            continue;
          }
          const entries = fs.readdirSync(cacheBase);
          for (const entry of entries) {
            const reminderPath = path.join(cacheBase, entry, 'docs', 'reminder.md');
            if (fs.existsSync(reminderPath)) {
              return reminderPath;
            }
          }
        }
      }
      return null;
    }
  ]
};

const MANAGED_USER_PROMPT_HOOKS = [
  {
    key: 'user-prompt-dispatcher',
    file: 'user-prompt-dispatcher.sh',
    timeout: 30,
    description: 'Sequential UPS dispatcher: first-run, task-graph, routing-refresher, unified-router, task-scope (ambient extractor runs async)'
  }
];
// Ambient hooks are now registered in hooks.json and dispatched by the plugin
// system. The fixer no longer needs to add them to settings.json.
const MANAGED_USER_LEVEL_EVENT_HOOKS = [];
const USER_LEVEL_PROJECT_OWNED_EVENTS = new Set(['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop']);
const USER_LEVEL_PROJECT_HOOK_PATTERNS = [
  DEFAULT_MARKETPLACE_NAME,
  'opspal-internal-plugins',
  `.claude-plugins/${['opspal', 'salesforce'].join('-')}`,
  'session-start-repo-sync.sh',
  'post-git-push-slack-notifier.sh'
];
const USER_LEVEL_OPSPAL_PLUGIN_HOOK_PATTERN =
  /(?:\/|^)(?:\.claude-plugins|plugins)\/(opspal-[^/'"\s]+)\/hooks\/|\.claude\/plugins\/marketplaces\/[^/'"\s]+\/plugins\/(opspal-[^/'"\s]+)\/hooks\/|\.claude\/plugins\/cache\/[^/'"\s]+\/(opspal-[^/'"\s]+)\/[^/'"\s]+\/hooks\//;
const CORE_PLUGIN_NAME = 'opspal-core';
const CRITICAL_FINISH_UPDATE_RUNTIME_HELPERS = [
  'scripts/finish-opspal-update.sh',
  'scripts/lib/post-plugin-update-fixes.js',
  'scripts/lib/hook-merger.js',
  'scripts/lib/reconcile-hook-registration.js'
];
const AMBIENT_RUNTIME_ASSETS = [
  'config/ambient-reflection-config.json',
  'hooks/ambient-candidate-extractor.sh',
  'hooks/ambient-flush-trigger.sh',
  'hooks/ambient-hook-error-observer.sh',
  'hooks/session-capture-init.sh',
  'scripts/lib/ambient/ambient-reflection-submitter.js',
  'scripts/lib/ambient/config-loader.js',
  'scripts/lib/ambient/extractors/post-tool-extractor.js',
  'scripts/lib/ambient/extractors/subagent-extractor.js',
  'scripts/lib/ambient/extractors/task-completed-extractor.js',
  'scripts/lib/ambient/extractors/user-prompt-extractor.js',
  'scripts/lib/ambient/flush-trigger-engine.js',
  'scripts/lib/ambient/hook-error-observer.js',
  'scripts/lib/ambient/hook-reflection-interceptor.js',
  'scripts/lib/ambient/reflection-candidate-buffer.js',
  'scripts/lib/ambient/reflection-compiler.js',
  'scripts/lib/ambient/shadow-validator.js',
  'scripts/lib/ambient/skill-candidate-detector.js',
  'scripts/lib/ambient/utils.js'
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
    this.strict = options.strict || false;
    this.projectRoot = options.projectRoot || process.cwd();
    this.corePluginRoot = options.corePluginRoot || process.env.CLAUDE_PLUGIN_ROOT || null;

    this.results = {
      installedRuntime: { checks: [], fixes: [], errors: [] },
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
    const preferredRoots = [
      this.findCorePluginRoot(),
      this.resolveCacheAssetSyncSource()?.root
    ].filter(Boolean);

    for (const preferredRoot of [...new Set(preferredRoots.map((root) => path.resolve(root)))]) {
      const preferredReminderPath = path.join(preferredRoot, 'docs', 'reminder.md');
      if (fs.existsSync(preferredReminderPath)) {
        return preferredReminderPath;
      }
    }

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
    if (this.isManagedEventHook(eventName, hook)) {
      return false;
    }

    return USER_LEVEL_PROJECT_HOOK_PATTERNS.some((pattern) => hook.command.includes(pattern)) ||
      USER_LEVEL_OPSPAL_PLUGIN_HOOK_PATTERN.test(hook.command);
  }

  evaluateProjectOwnedHookDrift(settings) {
    const issues = [];
    let projectOwnedHooks = 0;
    let emptyMatchers = 0;
    const permissionSanitization = sanitizeSettingsPermissions(settings);

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

    if (permissionSanitization.removedBashDenyRules > 0) {
      issues.push('legacy-bash-deny-rules');
    }

    return {
      issues,
      projectOwnedHooks,
      emptyMatchers,
      removedBashDenyRules: permissionSanitization.removedBashDenyRules
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

  reconcileManagedEventHooks(settings) {
    for (const groupDefinition of MANAGED_USER_LEVEL_EVENT_HOOKS) {
      const existingGroups = Array.isArray(settings?.hooks?.[groupDefinition.event])
        ? settings.hooks[groupDefinition.event]
        : [];
      const resolved = this.resolveManagedEventHooks(groupDefinition, existingGroups);

      if (resolved.error) {
        return resolved;
      }

      const reconciledGroups = [];

      for (const group of existingGroups) {
        const hooks = this.getGroupHooks(group);
        if (hooks.length === 0) {
          continue;
        }

        const retainedHooks = hooks
          .filter((hook) => !this.isManagedEventHook(groupDefinition.event, hook))
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
        reconciledGroups.push(nextGroup);
      }

      const managedGroup = {
        hooks: resolved.hooks
      };
      const matcher = this.normalizeGroupMatcher(groupDefinition.matcher);
      if (matcher !== undefined) {
        managedGroup.matcher = matcher;
      }
      reconciledGroups.push(managedGroup);
      settings.hooks[groupDefinition.event] = reconciledGroups;
    }

    return { ok: true };
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

  getManagedEventHookKey(eventName, command) {
    if (typeof command !== 'string' || command.trim() === '') return null;
    const group = MANAGED_USER_LEVEL_EVENT_HOOKS.find((entry) => entry.event === eventName);
    if (!group) return null;

    for (const hookDef of group.hooks) {
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
    return typeof hook.command === 'string' && (
      hook.command.includes('reminder.md') ||
      hook.command.includes('user-prompt-reminder.sh')
    );
  }

  isManagedEventHook(eventName, hook) {
    if (!hook || typeof hook !== 'object') return false;
    return this.getManagedEventHookKey(eventName, hook.command) !== null;
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
    const requiredHookPath = (root, file) => path.join(root, 'hooks', file);
    const requiredHookFiles = [
      ...MANAGED_USER_PROMPT_HOOKS.map((hookDef) => hookDef.file),
      ...MANAGED_USER_LEVEL_EVENT_HOOKS.flatMap((group) => group.hooks.map((hookDef) => hookDef.file))
    ];

    for (const candidate of this.getCorePluginCandidates()) {
      const hasAllHooks = [...new Set(requiredHookFiles)].every((hookFile) =>
        fs.existsSync(requiredHookPath(candidate.root, hookFile))
      );
      if (hasAllHooks) {
        return candidate.root;
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

  isSemverLike(version) {
    return typeof version === 'string' && /^[0-9]+\.[0-9]+\.[0-9]+(?:[-.][0-9A-Za-z.-]+)?$/.test(version.trim());
  }

  compareVersions(leftVersion, rightVersion) {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const parse = (version) => {
      if (!this.isSemverLike(version)) {
        return null;
      }

      const match = version.trim().match(/^([0-9]+)\.([0-9]+)\.([0-9]+)(?:[-.]?(.+))?$/);
      if (!match) {
        return null;
      }

      return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] ? match[4].split(/[.-]/).filter(Boolean) : []
      };
    };

    const left = parse(leftVersion);
    const right = parse(rightVersion);

    if (!left || !right) {
      return collator.compare(leftVersion || '', rightVersion || '');
    }

    for (const key of ['major', 'minor', 'patch']) {
      if (left[key] !== right[key]) {
        return left[key] - right[key];
      }
    }

    if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1;
    if (left.prerelease.length > 0 && right.prerelease.length === 0) return -1;

    const length = Math.max(left.prerelease.length, right.prerelease.length);
    for (let index = 0; index < length; index += 1) {
      const leftToken = left.prerelease[index];
      const rightToken = right.prerelease[index];
      if (leftToken === undefined) return -1;
      if (rightToken === undefined) return 1;

      const leftNumeric = /^[0-9]+$/.test(leftToken);
      const rightNumeric = /^[0-9]+$/.test(rightToken);
      if (leftNumeric && rightNumeric) {
        const difference = Number(leftToken) - Number(rightToken);
        if (difference !== 0) {
          return difference;
        }
        continue;
      }
      if (leftNumeric) return -1;
      if (rightNumeric) return 1;

      const difference = collator.compare(leftToken, rightToken);
      if (difference !== 0) {
        return difference;
      }
    }

    return 0;
  }

  getClaudeRoots() {
    const roots = [
      path.join(os.homedir(), '.claude')
    ];

    if (process.env.CLAUDE_HOME) {
      roots.push(process.env.CLAUDE_HOME);
    }
    if (process.env.CLAUDE_CONFIG_DIR) {
      roots.push(process.env.CLAUDE_CONFIG_DIR);
    }

    return [...new Set(
      roots
        .filter(Boolean)
        .map((root) => path.resolve(root))
    )];
  }

  getUserSettingsPath(claudeRoot = this.getClaudeRoots()[0]) {
    return path.join(claudeRoot, 'settings.json');
  }

  getUserSettingsTargets() {
    return this.getClaudeRoots().map((claudeRoot) => ({
      claudeRoot,
      settingsPath: this.getUserSettingsPath(claudeRoot)
    }));
  }

  getInstalledPluginsPath(claudeRoot = this.getClaudeRoots()[0]) {
    return path.join(claudeRoot, 'plugins', 'installed_plugins.json');
  }

  getMarketplaceNames() {
    return listMarketplaceNames({
      projectDir: this.projectRoot,
      scriptDir: __dirname,
      pluginName: CORE_PLUGIN_NAME
    });
  }

  getCachePluginBase(claudeRoot = this.getClaudeRoots()[0], marketplaceName = this.getMarketplaceNames()[0]) {
    return path.join(
      claudeRoot,
      'plugins',
      'cache',
      marketplaceName,
      CORE_PLUGIN_NAME
    );
  }

  getCachePluginBases(claudeRoot = this.getClaudeRoots()[0]) {
    const bases = [];
    const seen = new Set();
    const addBase = (candidate) => {
      if (!candidate || !fs.existsSync(candidate)) {
        return;
      }

      const resolvedCandidate = path.resolve(candidate);
      if (seen.has(resolvedCandidate)) {
        return;
      }

      seen.add(resolvedCandidate);
      bases.push(resolvedCandidate);
    };

    const cacheRoot = path.join(claudeRoot, 'plugins', 'cache');
    for (const marketplaceName of this.getMarketplaceNames()) {
      addBase(this.getCachePluginBase(claudeRoot, marketplaceName));
    }

    if (fs.existsSync(cacheRoot)) {
      for (const entry of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }
        addBase(path.join(cacheRoot, entry.name, CORE_PLUGIN_NAME));
      }
    }

    return bases;
  }

  getMarketplacePluginRoot(claudeRoot = this.getClaudeRoots()[0]) {
    return this.getMarketplacePluginRoots(claudeRoot)[0] || null;
  }

  getMarketplacePluginRoots(claudeRoot = this.getClaudeRoots()[0]) {
    const roots = [];
    const marketplaceBase = path.join(claudeRoot, 'plugins', 'marketplaces');
    if (fs.existsSync(marketplaceBase)) {
      for (const entry of fs.readdirSync(marketplaceBase, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }

        const candidate = path.join(marketplaceBase, entry.name, 'plugins', CORE_PLUGIN_NAME);
        if (fs.existsSync(candidate)) {
          roots.push(path.resolve(candidate));
        }
      }
    }

    return [...new Set(roots)];
  }

  getCachePluginRoots(claudeRoot = this.getClaudeRoots()[0]) {
    return this.getCachePluginBases(claudeRoot).flatMap((cacheBase) => fs.readdirSync(cacheBase)
      .map((entry) => path.join(cacheBase, entry))
      .filter((candidate) => {
        try {
          return fs.statSync(candidate).isDirectory();
        } catch (_error) {
          return false;
        }
      })
      .map((candidate) => path.resolve(candidate)));
  }

  getInstalledPluginRecords(installedPlugins) {
    const pluginMap = installedPlugins?.plugins;
    if (!pluginMap || typeof pluginMap !== 'object') {
      return [];
    }

    const preferredNames = this.getMarketplaceNames();
    const preferredOrder = new Map(preferredNames.map((name, index) => [name, index]));

    return Object.entries(pluginMap)
      .filter(([key, entries]) => key.startsWith(`${CORE_PLUGIN_NAME}@`) && Array.isArray(entries) && entries.length > 0)
      .map(([key, entries]) => ({
        key,
        entries,
        marketplaceName: key.split('@')[1] || preferredNames[0] || DEFAULT_MARKETPLACE_NAME
      }))
      .sort((left, right) => {
        const leftOrder = preferredOrder.get(left.marketplaceName) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = preferredOrder.get(right.marketplaceName) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return left.key.localeCompare(right.key);
      });
  }

  getCorePluginCandidates() {
    const candidates = [];
    const seen = new Set();
    const addCandidate = (candidate, priority) => {
      if (!candidate || !fs.existsSync(candidate)) {
        return;
      }

      const resolvedRoot = path.resolve(candidate);
      if (seen.has(resolvedRoot)) {
        return;
      }

      const version = this.getPluginVersion(resolvedRoot);
      if (!version) {
        return;
      }

      seen.add(resolvedRoot);
      candidates.push({
        root: resolvedRoot,
        version,
        priority
      });
    };

    addCandidate(this.corePluginRoot, 0);
    addCandidate(path.join(this.projectRoot, 'plugins', 'opspal-core'), 1);
    addCandidate(path.join(this.projectRoot, '.claude-plugins', 'opspal-core'), 2);

    for (const claudeRoot of this.getClaudeRoots()) {
      for (const marketplaceRoot of this.getMarketplacePluginRoots(claudeRoot)) {
        addCandidate(marketplaceRoot, 10);
      }
      for (const cacheRoot of this.getCachePluginRoots(claudeRoot)) {
        addCandidate(cacheRoot, 20);
      }
    }

    return candidates.sort((left, right) => {
      const versionDifference = this.compareVersions(right.version, left.version);
      if (versionDifference !== 0) {
        return versionDifference;
      }
      return left.priority - right.priority;
    });
  }

  resolveCacheAssetSyncSource() {
    const [candidate] = this.getCorePluginCandidates();
    return candidate || null;
  }

  listStaleVersionDirectories(pluginRoot, keepVersion) {
    if (!pluginRoot || !fs.existsSync(pluginRoot)) {
      return [];
    }

    return fs.readdirSync(pluginRoot)
      .map((entry) => path.join(pluginRoot, entry))
      .filter((candidate) => {
        try {
          return fs.statSync(candidate).isDirectory();
        } catch (_error) {
          return false;
        }
      })
      .filter((candidate) => {
        const version = path.basename(candidate);
        return this.isSemverLike(version) && version !== keepVersion;
      });
  }

  pruneVersionDirectories(pluginRoot, keepVersion) {
    const staleDirectories = this.listStaleVersionDirectories(pluginRoot, keepVersion);
    for (const staleDirectory of staleDirectories) {
      if (this.dryRun) {
        this.log(`${icons.info} [DRY RUN] Would remove stale cache version ${staleDirectory}`);
        continue;
      }
      fs.rmSync(staleDirectory, { recursive: true, force: true });
    }
    return staleDirectories;
  }

  readJsonFile(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_error) {
      return null;
    }
  }

  replaceDirectory(sourcePath, targetPath) {
    const sourceRealPath = fs.realpathSync(sourcePath);
    const parentDir = path.dirname(targetPath);
    const tempDir = path.join(
      parentDir,
      `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}`
    );

    fs.mkdirSync(parentDir, { recursive: true });

    if (fs.existsSync(targetPath)) {
      const targetRealPath = fs.realpathSync(targetPath);
      if (targetRealPath === sourceRealPath) {
        return false;
      }
      fs.rmSync(targetPath, { recursive: true, force: true });
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.cpSync(sourcePath, tempDir, { recursive: true, force: true, dereference: true });
    fs.renameSync(tempDir, targetPath);
    return true;
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

  verifyCacheHooksConfig(hooksJsonPath) {
    const hooksConfig = this.readJsonFile(hooksJsonPath);
    if (!hooksConfig) {
      return {
        ok: false,
        issues: [`Invalid JSON: ${hooksJsonPath}`]
      };
    }

    const issues = [];
    const userPromptGroups = Array.isArray(hooksConfig?.hooks?.UserPromptSubmit)
      ? hooksConfig.hooks.UserPromptSubmit
      : [];
    const preToolGroups = Array.isArray(hooksConfig?.hooks?.PreToolUse)
      ? hooksConfig.hooks.PreToolUse
      : [];

    const unifiedRouterHook = userPromptGroups
      .flatMap((group) => Array.isArray(group?.hooks) ? group.hooks : [])
      .find((hook) => typeof hook?.command === 'string' && hook.command.includes('user-prompt-dispatcher.sh'));

    if (!unifiedRouterHook) {
      issues.push('UserPromptSubmit missing user-prompt-dispatcher hook');
    }

    const wildcardGatePresent = preToolGroups.some((group) => (
      group?.matcher === '*' &&
      Array.isArray(group?.hooks) &&
      group.hooks.some((hook) => typeof hook?.command === 'string' && hook.command.includes('pre-tool-use-contract-validation.sh'))
    ));

    if (!wildcardGatePresent) {
      issues.push('PreToolUse missing wildcard routing gate');
    }

    return {
      ok: issues.length === 0,
      issues
    };
  }

  inspectInstalledRuntimePath(installPath, targetVersion) {
    const issues = [];
    if (!installPath || !fs.existsSync(installPath)) {
      return {
        ok: false,
        issues: [`Missing install path: ${installPath || '(empty)'}`]
      };
    }

    const pluginJsonPath = path.join(installPath, '.claude-plugin', 'plugin.json');
    const hooksJsonPath = path.join(installPath, '.claude-plugin', 'hooks.json');
    const requiredFiles = [
      'hooks/user-prompt-dispatcher.sh',
      'hooks/pre-tool-use-contract-validation.sh',
      'hooks/pre-task-agent-validator.sh',
      'hooks/post-tool-use.sh',
      ...CRITICAL_FINISH_UPDATE_RUNTIME_HELPERS,
      ...AMBIENT_RUNTIME_ASSETS,
      'scripts/ci/validate-routing.sh',
      'scripts/lib/task-router.js',
      'scripts/lib/complexity-scorer.js',
      'scripts/lib/pre-execution-validator.js',
      'scripts/lib/routing-index-builder.js',
      'scripts/lib/routing-routability-audit.js',
      'scripts/lib/sync-claudemd.js',
      'scripts/lib/routing-state-manager.js',
      'config/mcp-tool-policies.json'
    ];

    const pluginJson = this.readJsonFile(pluginJsonPath);
    if (!pluginJson) {
      issues.push(`Missing or invalid plugin.json: ${pluginJsonPath}`);
    } else if (pluginJson.version !== targetVersion) {
      issues.push(`plugin.json version ${pluginJson.version || 'missing'} != ${targetVersion}`);
    }

    const hooksCheck = this.verifyCacheHooksConfig(hooksJsonPath);
    if (!hooksCheck.ok) {
      issues.push(...hooksCheck.issues);
    }

    for (const relativePath of requiredFiles) {
      const absolutePath = path.join(installPath, relativePath);
      if (!fs.existsSync(absolutePath) && !fs.existsSync(`${absolutePath}.enc`)) {
        issues.push(`Missing runtime asset: ${relativePath}`);
      }
    }

    return {
      ok: issues.length === 0,
      issues
    };
  }

  checkInstalledRuntime() {
    this.log(`\n${colors.bold}## Installed Runtime${colors.reset}`);

    const syncSource = this.resolveCacheAssetSyncSource();
    if (!syncSource) {
      const message = 'Unable to resolve opspal-core source root for runtime verification';
      this.results.installedRuntime.errors.push({
        name: 'runtime-source',
        message
      });
      this.log(`${icons.fail} ${message}`);
      return { needsFix: true, reason: 'no-source' };
    }

    const roots = this.getClaudeRoots();
    let checkedEntries = 0;
    const issues = [];

    for (const claudeRoot of roots) {
      const installedPluginsPath = this.getInstalledPluginsPath(claudeRoot);
      if (!fs.existsSync(installedPluginsPath)) {
        continue;
      }

      const installedPlugins = this.readJsonFile(installedPluginsPath);
      if (!installedPlugins) {
        issues.push(`Invalid JSON: ${installedPluginsPath}`);
        this.results.installedRuntime.errors.push({
          name: path.basename(installedPluginsPath),
          message: `Failed to parse ${installedPluginsPath}`
        });
        continue;
      }

      const records = this.getInstalledPluginRecords(installedPlugins);
      if (records.length === 0) {
        this.results.installedRuntime.checks.push({
          name: `installed-runtime:${claudeRoot}`,
          status: 'skipped',
          message: `${CORE_PLUGIN_NAME} is not installed under ${claudeRoot}`
        });
        continue;
      }

      for (const record of records) {
        const expectedInstallPath = path.join(
          this.getCachePluginBase(claudeRoot, record.marketplaceName),
          syncSource.version
        );
        checkedEntries += record.entries.length;
        const rootIssues = [];

        for (const entry of record.entries) {
          const currentInstallPath = typeof entry?.installPath === 'string' && entry.installPath.trim()
            ? entry.installPath
            : expectedInstallPath;

          if (entry?.version !== syncSource.version) {
            rootIssues.push(`installed version ${entry?.version || 'missing'} != ${syncSource.version}`);
          }
          if (path.resolve(currentInstallPath) !== path.resolve(expectedInstallPath)) {
            rootIssues.push(`installPath drifted: ${currentInstallPath}`);
          }

          const runtimeInspection = this.inspectInstalledRuntimePath(currentInstallPath, syncSource.version);
          if (!runtimeInspection.ok) {
            rootIssues.push(...runtimeInspection.issues);
          }
        }

        if (this.strict && record.entries.length > 1) {
          rootIssues.push(`strict mode requires a single install record (found ${record.entries.length})`);
        }

        const staleVersionDirs = this.strict
          ? this.listStaleVersionDirectories(this.getCachePluginBase(claudeRoot, record.marketplaceName), syncSource.version)
          : [];
        if (this.strict && staleVersionDirs.length > 0) {
          rootIssues.push(`strict mode found stale cache versions: ${staleVersionDirs.map((dir) => path.basename(dir)).join(', ')}`);
        }

        if (rootIssues.length === 0) {
          this.results.installedRuntime.checks.push({
            name: `installed-runtime:${claudeRoot}:${record.key}`,
            status: 'valid',
            message: `${expectedInstallPath} matches source version ${syncSource.version}`
          });
        } else {
          issues.push(...rootIssues.map((issue) => `${claudeRoot} (${record.key}): ${issue}`));
          this.results.installedRuntime.checks.push({
            name: `installed-runtime:${claudeRoot}:${record.key}`,
            status: 'drifted',
            message: rootIssues.join('; ')
          });
        }
      }
    }

    if (checkedEntries === 0) {
      const message = `No installed ${CORE_PLUGIN_NAME} marketplace entries found in configured Claude roots`;
      this.log(`${icons.info} ${message}`);
      this.results.installedRuntime.checks.push({
        name: 'installed-runtime',
        status: 'skipped',
        message
      });
      return { needsFix: false, reason: 'not-installed' };
    }

    if (issues.length === 0) {
      this.log(`${icons.pass} Installed runtime matches source version ${syncSource.version}`);
      return {
        needsFix: false,
        sourceVersion: syncSource.version,
        checkedEntries
      };
    }

    this.log(`${icons.fail} Installed runtime drift detected for ${checkedEntries} entry(s)`);
    return {
      needsFix: true,
      sourceVersion: syncSource.version,
      checkedEntries,
      issues
    };
  }

  reconcileInstalledRuntime() {
    this.log(`\n${colors.bold}## Installed Runtime${colors.reset}`);

    const syncSource = this.resolveCacheAssetSyncSource();
    if (!syncSource) {
      const message = 'Unable to resolve opspal-core source root for runtime reconciliation';
      this.results.installedRuntime.errors.push({
        name: 'runtime-source',
        message
      });
      this.log(`${icons.fail} ${message}`);
      return { fixed: false, reason: 'no-source' };
    }

    const roots = this.getClaudeRoots();
    const timestamp = new Date().toISOString();
    let repairedRoots = 0;
    let repairedEntries = 0;
    let installedEntriesFound = 0;

    for (const claudeRoot of roots) {
      const installedPluginsPath = this.getInstalledPluginsPath(claudeRoot);
      if (!fs.existsSync(installedPluginsPath)) {
        continue;
      }

      const installedPlugins = this.readJsonFile(installedPluginsPath);
      if (!installedPlugins) {
        this.results.installedRuntime.errors.push({
          name: path.basename(installedPluginsPath),
          message: `Failed to parse ${installedPluginsPath}`
        });
        continue;
      }

      const records = this.getInstalledPluginRecords(installedPlugins);
      if (records.length === 0) {
        continue;
      }

      for (const record of records) {
        installedEntriesFound += record.entries.length;
        const expectedInstallPath = path.join(
          this.getCachePluginBase(claudeRoot, record.marketplaceName),
          syncSource.version
        );
        const staleVersionDirs = this.strict
          ? this.listStaleVersionDirectories(this.getCachePluginBase(claudeRoot, record.marketplaceName), syncSource.version)
          : [];
        const strictMetadataDrift = this.strict && record.entries.length > 1;

        const needsRepair = record.entries.some((entry) => {
          const currentInstallPath = typeof entry?.installPath === 'string' && entry.installPath.trim()
            ? entry.installPath
            : expectedInstallPath;
          return (
            entry?.version !== syncSource.version ||
            path.resolve(currentInstallPath) !== path.resolve(expectedInstallPath) ||
            !this.inspectInstalledRuntimePath(currentInstallPath, syncSource.version).ok
          );
        }) || !fs.existsSync(expectedInstallPath) || strictMetadataDrift || staleVersionDirs.length > 0;

        if (!needsRepair) {
          this.results.installedRuntime.checks.push({
            name: `installed-runtime:${claudeRoot}:${record.key}`,
            status: 'valid',
            message: `${expectedInstallPath} already matches source version ${syncSource.version}`
          });
          continue;
        }

        if (this.dryRun) {
          this.log(`${icons.info} [DRY RUN] Would sync ${syncSource.root} -> ${expectedInstallPath}`);
          if (this.strict && staleVersionDirs.length > 0) {
            for (const staleDirectory of staleVersionDirs) {
              this.log(`${icons.info} [DRY RUN] Would remove stale cache version ${staleDirectory}`);
            }
          }
          repairedRoots += 1;
          repairedEntries += record.entries.length;
          continue;
        }

        this.replaceDirectory(syncSource.root, expectedInstallPath);
        repairedRoots += 1;

        const normalizedEntries = [];
        const seenEntries = new Set();

        for (const entry of record.entries) {
          if (entry.version !== syncSource.version || entry.installPath !== expectedInstallPath) {
            repairedEntries += 1;
          }

          const normalizedEntry = {
            ...entry,
            version: syncSource.version,
            installPath: expectedInstallPath,
            lastUpdated: timestamp
          };
          const entryKey = `${normalizedEntry.version}|${normalizedEntry.installPath}`;
          if (this.strict && seenEntries.has(entryKey)) {
            repairedEntries += 1;
            continue;
          }

          seenEntries.add(entryKey);
          normalizedEntries.push(normalizedEntry);
        }

        installedPlugins.plugins[record.key] = normalizedEntries;
        fs.writeFileSync(installedPluginsPath, JSON.stringify(installedPlugins, null, 2) + '\n');
        this.results.installedRuntime.fixes.push({
          name: `installed-runtime:${claudeRoot}:${record.key}`,
          message: `Synced cache bundle and install record to ${expectedInstallPath}`
        });

        if (this.strict && staleVersionDirs.length > 0) {
          this.pruneVersionDirectories(this.getCachePluginBase(claudeRoot, record.marketplaceName), syncSource.version);
          this.results.installedRuntime.fixes.push({
            name: `installed-runtime-prune:${claudeRoot}:${record.key}`,
            message: `Removed stale cache versions (${staleVersionDirs.map((dir) => path.basename(dir)).join(', ')})`
          });
        }
        this.log(`${icons.fix} Reconciled installed runtime under ${claudeRoot} (${record.key})`);
      }
    }

    if (installedEntriesFound === 0) {
      const message = `No installed ${CORE_PLUGIN_NAME} marketplace entries found in configured Claude roots`;
      this.log(`${icons.info} ${message}`);
      this.results.installedRuntime.checks.push({
        name: 'installed-runtime',
        status: 'skipped',
        message
      });
      return { fixed: false, reason: 'not-installed' };
    }

    return {
      fixed: repairedRoots > 0,
      roots: repairedRoots,
      entries: repairedEntries,
      sourceVersion: syncSource.version
    };
  }


  /**
   * Reconcile cache entries for ALL opspal-* sibling plugins in the marketplace.
   * The core reconcileInstalledRuntime() only handles opspal-core. This method
   * iterates every opspal-* plugin in the marketplace source, detects version
   * drift against the installed cache, and refreshes when needed.
   */
  reconcileSiblingPluginCaches() {
    this.log(`\n${colors.bold}## Sibling Plugin Cache Reconciliation${colors.reset}`);

    const pluginsDir = path.join(this.projectRoot, 'plugins');
    if (!fs.existsSync(pluginsDir)) {
      this.log(`${icons.info} No plugins directory found at ${pluginsDir}`);
      return { fixed: false, reason: 'no-plugins-dir' };
    }

    const siblingPlugins = fs.readdirSync(pluginsDir)
      .filter((name) => name.startsWith('opspal-') && name !== CORE_PLUGIN_NAME)
      .filter((name) => {
        const pluginDir = path.join(pluginsDir, name);
        return fs.statSync(pluginDir).isDirectory() && this.getPluginVersion(pluginDir);
      });

    if (siblingPlugins.length === 0) {
      this.log(`${icons.info} No sibling opspal-* plugins found`);
      return { fixed: false, reason: 'no-siblings' };
    }

    const roots = this.getClaudeRoots();
    const timestamp = new Date().toISOString();
    let totalRepaired = 0;

    for (const pluginName of siblingPlugins) {
      const sourceDir = path.join(pluginsDir, pluginName);
      const sourceVersion = this.getPluginVersion(sourceDir);
      if (!sourceVersion) continue;

      for (const claudeRoot of roots) {
        const installedPluginsPath = this.getInstalledPluginsPath(claudeRoot);
        if (!fs.existsSync(installedPluginsPath)) continue;

        const installedPlugins = this.readJsonFile(installedPluginsPath);
        if (!installedPlugins?.plugins) continue;

        // Find installed entries for this plugin across all marketplaces
        const matchingKeys = Object.keys(installedPlugins.plugins)
          .filter((key) => key.startsWith(`${pluginName}@`));

        for (const key of matchingKeys) {
          const entries = installedPlugins.plugins[key];
          if (!Array.isArray(entries) || entries.length === 0) continue;

          const marketplaceName = key.split('@')[1] || 'opspal-commercial';
          const cachePluginBase = path.join(
            claudeRoot, 'plugins', 'cache', marketplaceName, pluginName
          );
          const expectedInstallPath = path.join(cachePluginBase, sourceVersion);

          const needsRepair = entries.some((entry) =>
            entry?.version !== sourceVersion ||
            !fs.existsSync(expectedInstallPath)
          );

          if (!needsRepair) continue;

          if (this.dryRun) {
            this.log(`${icons.info} [DRY RUN] Would sync ${pluginName} ${entries[0]?.version || 'unknown'} -> ${sourceVersion}`);
            totalRepaired += 1;
            continue;
          }

          // Copy source plugin to expected cache path
          this.replaceDirectory(sourceDir, expectedInstallPath);

          // Update installed_plugins.json entries
          const updatedEntries = entries.map((entry) => ({
            ...entry,
            version: sourceVersion,
            installPath: expectedInstallPath,
            lastUpdated: timestamp
          }));

          installedPlugins.plugins[key] = updatedEntries;
          fs.writeFileSync(installedPluginsPath, JSON.stringify(installedPlugins, null, 2) + '\n');

          this.log(`${icons.fix} Reconciled ${pluginName}: ${entries[0]?.version || 'unknown'} -> ${sourceVersion}`);
          this.results.installedRuntime.fixes.push({
            name: `sibling-cache:${claudeRoot}:${key}`,
            message: `Synced ${pluginName} cache to ${sourceVersion}`
          });
          totalRepaired += 1;
        }
      }
    }

    if (totalRepaired === 0) {
      this.log(`${icons.pass} All sibling plugin caches match source versions`);
    }

    return { fixed: totalRepaired > 0, count: totalRepaired };
  }

  /**
   * Prune stale opspal-* entries from installed_plugins.json when the plugin
   * directory no longer exists in the marketplace.  This prevents Claude Code
   * from emitting "plugin-not-found" errors on startup after a plugin has been
   * deprecated and removed from the marketplace.
   */
  pruneOrphanedInstalledPluginEntries() {
    this.log(`\n${colors.bold}## Orphaned Installed Plugin Entries${colors.reset}`);

    const roots = this.getClaudeRoots();
    let totalPruned = 0;

    for (const claudeRoot of roots) {
      const installedPluginsPath = this.getInstalledPluginsPath(claudeRoot);
      if (!fs.existsSync(installedPluginsPath)) {
        continue;
      }

      let installedPlugins;
      try {
        installedPlugins = this.readJsonFile(installedPluginsPath);
      } catch (_err) {
        // readJsonFile never throws — but be safe
      }

      if (!installedPlugins?.plugins || typeof installedPlugins.plugins !== 'object') {
        continue;
      }

      const keysToRemove = [];

      for (const key of Object.keys(installedPlugins.plugins)) {
        if (!key.startsWith('opspal-')) {
          continue;
        }

        const atIndex = key.indexOf('@');
        if (atIndex === -1) {
          continue;
        }

        const pluginName = key.slice(0, atIndex);
        const marketplaceName = key.slice(atIndex + 1);

        if (!pluginName || !marketplaceName) {
          continue;
        }

        // Check whether the plugin exists in the marketplace directory.
        // Accept either a .claude-plugin/plugin.json or a top-level plugin.json.
        const marketplacePluginDir = path.join(
          claudeRoot, 'plugins', 'marketplaces', marketplaceName, 'plugins', pluginName
        );
        const hasPluginJson =
          fs.existsSync(path.join(marketplacePluginDir, '.claude-plugin', 'plugin.json')) ||
          fs.existsSync(path.join(marketplacePluginDir, 'plugin.json'));

        if (!fs.existsSync(marketplacePluginDir) || !hasPluginJson) {
          keysToRemove.push({ key, pluginName, marketplaceName, marketplacePluginDir });
        }
      }

      if (keysToRemove.length === 0) {
        continue;
      }

      for (const { key, pluginName, marketplaceName } of keysToRemove) {
        if (this.dryRun) {
          this.log(`${icons.info} [DRY RUN] Would remove orphaned entry: ${key}`);
        } else {
          delete installedPlugins.plugins[key];
          this.log(`${icons.fix} Removed orphaned installed entry: ${key}`);

          // Also clean up the versioned cache directory if it exists.
          const cachePluginDir = path.join(
            claudeRoot, 'plugins', 'cache', marketplaceName, pluginName
          );
          if (fs.existsSync(cachePluginDir)) {
            try {
              fs.rmSync(cachePluginDir, { recursive: true, force: true });
              this.log(`${icons.fix} Removed orphaned cache directory: ${cachePluginDir}`);
            } catch (err) {
              this.log(`${icons.warn} Could not remove cache directory ${cachePluginDir}: ${err.message}`);
            }
          }
        }

        totalPruned += 1;
      }

      if (!this.dryRun && keysToRemove.length > 0) {
        try {
          fs.writeFileSync(installedPluginsPath, JSON.stringify(installedPlugins, null, 2) + '\n');
        } catch (err) {
          this.log(`${icons.warn} Failed to write ${installedPluginsPath}: ${err.message}`);
        }
      }

      // Also remove orphaned entries from enabledPlugins in settings.json files.
      // Claude Code syncs enabledPlugins → installed_plugins.json on startup, so
      // if we only clean installed_plugins.json the entry gets re-added next launch.
      const orphanedKeys = new Set(keysToRemove.map(k => k.key));
      if (orphanedKeys.size > 0) {
        const settingsPaths = [
          path.join(claudeRoot, 'settings.json'),
          path.join(claudeRoot, 'settings.local.json')
        ];
        // Also check project-level settings if PWD/.claude/settings.json exists
        const projectSettings = path.join(process.cwd(), '.claude', 'settings.json');
        if (fs.existsSync(projectSettings)) {
          settingsPaths.push(projectSettings);
        }
        const projectLocalSettings = path.join(process.cwd(), '.claude', 'settings.local.json');
        if (fs.existsSync(projectLocalSettings)) {
          settingsPaths.push(projectLocalSettings);
        }

        // Build a set of orphaned plugin name fragments to match in hook commands
        const orphanedPluginNames = new Set(keysToRemove.map(k => k.pluginName));

        for (const sp of settingsPaths) {
          if (!fs.existsSync(sp)) continue;
          try {
            const settings = JSON.parse(fs.readFileSync(sp, 'utf8'));
            let settingsModified = false;

            // 1. Remove orphaned enabledPlugins entries
            if (Array.isArray(settings.enabledPlugins)) {
              const before = settings.enabledPlugins.length;
              settings.enabledPlugins = settings.enabledPlugins.filter(p => !orphanedKeys.has(p));
              const removed = before - settings.enabledPlugins.length;
              if (removed > 0) {
                this.log(`${icons.fix} Removed ${removed} orphaned enabledPlugins entry(s) from ${sp}`);
                settingsModified = true;
              }
            }

            // 2. Remove hook entries whose commands reference orphaned plugins.
            //    Hook commands that contain paths like "plugins/opspal-data-hygiene/"
            //    or "opspal-data-hygiene/hooks/" will fire and fail at runtime.
            if (settings.hooks && typeof settings.hooks === 'object') {
              for (const [eventType, entries] of Object.entries(settings.hooks)) {
                if (!Array.isArray(entries)) continue;
                const beforeLen = entries.length;
                settings.hooks[eventType] = entries.filter(entry => {
                  const hooks = entry.hooks || [];
                  const hasOrphanRef = hooks.some(hook => {
                    const cmd = hook.command || '';
                    return [...orphanedPluginNames].some(name =>
                      cmd.includes(`/${name}/`) || cmd.includes(`${name}/hooks/`)
                    );
                  });
                  if (hasOrphanRef) {
                    this.log(`${icons.fix} Removed orphaned ${eventType} hook referencing removed plugin from ${sp}`);
                  }
                  return !hasOrphanRef;
                });
                if (settings.hooks[eventType].length < beforeLen) {
                  settingsModified = true;
                }
                // Clean up empty arrays
                if (settings.hooks[eventType].length === 0) {
                  delete settings.hooks[eventType];
                }
              }
            }

            if (settingsModified) {
              if (this.dryRun) {
                this.log(`${icons.info} [DRY RUN] Would update ${sp}`);
              } else {
                fs.writeFileSync(sp, JSON.stringify(settings, null, 2) + '\n');
                this.log(`${icons.fix} Updated ${sp}`);
              }
            }
          } catch (err) {
            this.log(`${icons.warn} Could not clean orphaned references in ${sp}: ${err.message}`);
          }
        }
      }
    }

    if (totalPruned === 0) {
      this.log(`${icons.pass} No orphaned installed plugin entries found`);
    }

    return { fixed: totalPruned > 0 && !this.dryRun, count: totalPruned };
  }

  resolveManagedHooks(hookDefinitions, existingGroups) {
    const hooksByKey = new Map();
    const corePluginRoot = this.findCorePluginRoot();

    for (const group of existingGroups) {
      for (const hook of this.getGroupHooks(group)) {
        const key = hookDefinitions.find((hookDef) => hook.command.includes(hookDef.file))?.key;
        if (!key || hooksByKey.has(key)) {
          continue;
        }
        hooksByKey.set(key, hook.command);
      }
    }

    const resolvedHooks = [];

    for (const hookDef of hookDefinitions) {
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

  resolveManagedUserPromptHooks(existingGroups) {
    return this.resolveManagedHooks(MANAGED_USER_PROMPT_HOOKS, existingGroups);
  }

  resolveManagedEventHooks(groupDefinition, existingGroups) {
    return this.resolveManagedHooks(groupDefinition.hooks, existingGroups);
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

    // Reminder hook is no longer required — dispatcher handles routing context.
    // Its absence is expected and not an issue.

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

  evaluateManagedEventHooks(settings) {
    const issues = [];
    const missingManaged = [];
    const managedPathDrift = new Set();
    const timeoutMismatches = new Set();
    const matcherDrift = new Set();
    const duplicates = new Set();

    for (const groupDefinition of MANAGED_USER_LEVEL_EVENT_HOOKS) {
      const groups = Array.isArray(settings?.hooks?.[groupDefinition.event]) ? settings.hooks[groupDefinition.event] : [];
      const resolvedHooks = this.resolveManagedEventHooks(groupDefinition, groups);
      const expectedCommands = new Map();

      if (!resolvedHooks.error) {
        for (let index = 0; index < groupDefinition.hooks.length; index += 1) {
          expectedCommands.set(groupDefinition.hooks[index].key, resolvedHooks.hooks[index].command.trim());
        }
      } else {
        issues.push(`managed-event-unresolved:${groupDefinition.event}`);
      }

      for (const hookDef of groupDefinition.hooks) {
        const matches = [];

        for (const group of groups) {
          for (const hook of this.getGroupHooks(group)) {
            if (this.getManagedEventHookKey(groupDefinition.event, hook?.command) === hookDef.key) {
              matches.push({ group, hook });
            }
          }
        }

        if (matches.length === 0) {
          missingManaged.push(`${groupDefinition.event}:${hookDef.key}`);
          continue;
        }

        if (matches.length > 1) {
          duplicates.add(`${groupDefinition.event}:${hookDef.key}`);
        }

        const primary = matches[0];
        const expectedMatcher = this.normalizeGroupMatcher(groupDefinition.matcher);
        const actualMatcher = this.normalizeGroupMatcher(primary.group?.matcher);
        if (expectedMatcher !== actualMatcher) {
          matcherDrift.add(`${groupDefinition.event}:${hookDef.key}`);
        }

        if (primary.hook?.timeout !== hookDef.timeout) {
          timeoutMismatches.add(`${groupDefinition.event}:${hookDef.key}`);
        }

        const expectedCommand = expectedCommands.get(hookDef.key);
        if (!expectedCommand || typeof primary.hook?.command !== 'string' || primary.hook.command.trim() !== expectedCommand) {
          managedPathDrift.add(`${groupDefinition.event}:${hookDef.key}`);
        }
      }
    }

    if (missingManaged.length > 0) {
      issues.push('missing-managed-event-hooks');
    }
    if (duplicates.size > 0) {
      issues.push('duplicate-managed-event-hooks');
    }
    if (managedPathDrift.size > 0) {
      issues.push('managed-event-path-drift');
    }
    if (timeoutMismatches.size > 0) {
      issues.push('managed-event-timeout-drift');
    }
    if (matcherDrift.size > 0) {
      issues.push('managed-event-matcher-drift');
    }

    return {
      issues,
      missingManaged,
      managedPathDrift: [...managedPathDrift],
      timeoutMismatches: [...timeoutMismatches],
      matcherDrift: [...matcherDrift],
      duplicates: [...duplicates]
    };
  }

  inspectUserLevelHooksTarget(target) {
    const { claudeRoot, settingsPath } = target;
    const resultName = `UserPromptSubmit:${claudeRoot}`;

    if (!fs.existsSync(settingsPath)) {
      this.results.userLevelHooks.checks.push({
        name: resultName,
        status: 'missing',
        message: `${settingsPath} does not exist`
      });
      return { ...target, exists: false, needsFix: true };
    }

    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const reminderPath = this.findReminderFile();
      const analysis = this.evaluateUserPromptSubmit(settings, reminderPath);
      const managedEventAnalysis = this.evaluateManagedEventHooks(settings);
      const projectHookAnalysis = this.evaluateProjectOwnedHookDrift(settings);

      if (analysis.issues.length > 0 || managedEventAnalysis.issues.length > 0 || projectHookAnalysis.issues.length > 0) {
        const combinedIssues = [...analysis.issues, ...managedEventAnalysis.issues, ...projectHookAnalysis.issues];
        this.results.userLevelHooks.checks.push({
          name: resultName,
          status: 'drifted',
          message: `${settingsPath} needs reconciliation (${combinedIssues.join(', ')})`
        });
        return {
          ...target,
          exists: true,
          settings,
          reminderPath,
          needsFix: true,
          reason: combinedIssues[0],
          analysis,
          managedEventAnalysis,
          projectHookAnalysis
        };
      }

      this.results.userLevelHooks.checks.push({
        name: resultName,
        status: 'valid',
        message: `${settingsPath} configured correctly`
      });
      return { ...target, exists: true, settings, reminderPath, needsFix: false, analysis, managedEventAnalysis };

    } catch (error) {
      this.results.userLevelHooks.errors.push({
        name: settingsPath,
        message: error.message
      });
      return { ...target, exists: true, needsFix: true, reason: 'parse-error', error };
    }
  }

  checkUserLevelHooks() {
    this.log(`\n${colors.bold}## User-Level Hooks${colors.reset}`);

    const inspections = this.getUserSettingsTargets()
      .map((target) => this.inspectUserLevelHooksTarget(target));
    const needsFix = inspections.some((inspection) => inspection.needsFix);

    if (!needsFix) {
      this.log(`${icons.pass} User-level hooks configured correctly across ${inspections.length} Claude root(s)`);
    }

    return {
      exists: inspections.some((inspection) => inspection.exists),
      needsFix,
      inspections
    };
  }

  fixUserLevelHooksTarget(target) {
    const settingsPath = target.settingsPath;

    try {
      let settings = {};

      if (target.exists && target.settings) {
        settings = target.settings;
      } else if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }

      settings.hooks = settings.hooks || {};
      const existingGroups = this.getUserPromptSubmitGroups(settings);
      const resolvedManagedHooks = this.resolveManagedUserPromptHooks(existingGroups);

      if (resolvedManagedHooks.error) {
        this.results.userLevelHooks.errors.push({
          name: settingsPath,
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

      // Reminder hook (user-prompt-reminder.sh) is no longer injected into settings.json.
      // The user-prompt-dispatcher.sh (registered in hooks.json) handles routing context
      // via routing-context-refresher.sh. The standalone reminder was a separate imperative
      // routing table that ran on every prompt and caused governance deadlocks by conflicting
      // with the dispatcher's informational scope/routing output.
      // Any existing reminder hook entries are stripped by the retainedHooks filter above.

      reconciledGroups.push({
        hooks: resolvedManagedHooks.hooks
      });

      settings.hooks.UserPromptSubmit = reconciledGroups;
      this.reconcileNonUserPromptHooks(settings);
      const managedEventResult = this.reconcileManagedEventHooks(settings);
      if (managedEventResult?.error) {
        this.results.userLevelHooks.errors.push({
          name: settingsPath,
          message: managedEventResult.error
        });
        this.log(`${icons.fail} ${managedEventResult.error}`);
        return { fixed: false, reason: 'managed-event-hooks-unresolved' };
      }
      sanitizeSettingsPermissions(settings);

      if (this.dryRun) {
        this.log(`${icons.info} [DRY RUN] Would update ${settingsPath}`);
        this.log(`${colors.gray}${JSON.stringify(settings.hooks.UserPromptSubmit, null, 2)}${colors.reset}`, 'verbose');
      } else {
        const dir = path.dirname(settingsPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        this.log(`${icons.fix} Updated ${settingsPath}`);
      }

      this.results.userLevelHooks.fixes.push({
        name: `UserPromptSubmit hook:${target.claudeRoot}`,
        action: 'reconciled',
        path: settingsPath
      });

      return { fixed: true, path: settingsPath };

    } catch (error) {
      this.results.userLevelHooks.errors.push({
        name: settingsPath,
        message: error.message
      });
      this.log(`${icons.fail} Failed to update settings ${settingsPath}: ${error.message}`);
      return { fixed: false, error };
    }
  }

  fixUserLevelHooks() {
    const check = this.checkUserLevelHooks();

    if (!check.needsFix) {
      return { fixed: false, reason: 'already-configured' };
    }

    const paths = [];
    for (const target of check.inspections.filter((inspection) => inspection.needsFix)) {
      const result = this.fixUserLevelHooksTarget(target);
      if (result.fixed && result.path) {
        paths.push(result.path);
      }
    }

    return {
      fixed: paths.length > 0,
      count: paths.length,
      paths
    };
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
   * Checks that the plugin-level hooks.json in ~/.claude/plugins/cache/ has
   * the user-prompt-dispatcher registered. Env vars are managed internally
   * by the dispatcher and no longer need to be set on the hooks.json command.
   */
  fixPluginCacheHooksJson() {
    this.log(`\n${colors.bold}## Plugin Cache hooks.json${colors.reset}`);

    let totalFixed = 0;

    for (const claudeRoot of this.getClaudeRoots()) {
      for (const cacheBase of this.getCachePluginBases(claudeRoot)) {
        for (const entry of fs.readdirSync(cacheBase)) {
          const hooksJsonPath = path.join(cacheBase, entry, '.claude-plugin', 'hooks.json');
          if (!fs.existsSync(hooksJsonPath)) continue;

          try {
            const content = fs.readFileSync(hooksJsonPath, 'utf8');
            let hooksConfig = JSON.parse(content);
            const installRoot = path.dirname(path.dirname(hooksJsonPath));
            const normalizedHooksConfig = normalizeProjectHookSettings(hooksConfig, {
              projectRoot: installRoot
            });
            let modified = JSON.stringify(normalizedHooksConfig) !== JSON.stringify(hooksConfig);
            hooksConfig = normalizedHooksConfig;

            const upsGroups = hooksConfig?.hooks?.UserPromptSubmit;
            if (!Array.isArray(upsGroups)) continue;

            const hasDispatcher = upsGroups
              .flatMap((group) => Array.isArray(group.hooks) ? group.hooks : [])
              .some((hook) => typeof hook.command === 'string' && hook.command.includes('user-prompt-dispatcher.sh'));

            if (hasDispatcher) {
              this.log(`${icons.pass} Cache ${entry}: hooks.json has user-prompt-dispatcher`);
            } else {
              this.log(`${icons.warn} Cache ${entry}: hooks.json missing user-prompt-dispatcher (will be fixed on next plugin sync)`);
            }

            if (modified) {
              fs.writeFileSync(hooksJsonPath, JSON.stringify(hooksConfig, null, 2));
              this.log(`${icons.fix} Normalized cache ${entry}/.claude-plugin/hooks.json`);
              totalFixed++;
            }
          } catch (err) {
            this.log(`${icons.fail} Failed to check ${entry}: ${err.message}`);
            this.results.pluginCacheAssets.errors.push({
              name: `cache-hooks-${entry}`,
              message: err.message
            });
          }
        }
      }
    }

    return { fixed: totalFixed > 0, count: totalFixed };
  }

  syncPluginCacheRoutingAssets() {
    this.log(`\n${colors.bold}## Plugin Cache Routing Assets${colors.reset}`);

    const syncSource = this.resolveCacheAssetSyncSource();
    if (!syncSource) {
      this.log(`${icons.info} No routing asset source found, skipping`);
      return { fixed: false, reason: 'no-source' };
    }

    const assets = [
      '.claude-plugin/hooks.json',
      'docs/reminder.md',
      'hooks/user-prompt-dispatcher.sh',
      'hooks/permission-request-handler.sh',
      'hooks/pre-operation-data-validator.sh',
      'hooks/pre-tool-use-contract-validation.sh',
      'hooks/pre-task-agent-validator.sh',
      'hooks/post-tool-use.sh',
      ...CRITICAL_FINISH_UPDATE_RUNTIME_HELPERS,
      ...AMBIENT_RUNTIME_ASSETS,
      'scripts/lib/hook-event-normalizer.js',
      'scripts/lib/hook-settings-normalizer.js',
      'scripts/lib/routing-context-refresher.js',
      'scripts/lib/routing-state-manager.js',
      'config/mcp-tool-policies.json'
    ];

    let copied = 0;
    let matchingCacheRoots = 0;

    for (const claudeRoot of this.getClaudeRoots()) {
      for (const cacheBase of this.getCachePluginBases(claudeRoot)) {
        const matchingEntries = fs.readdirSync(cacheBase)
          .filter((entry) => entry === syncSource.version)
          .map((entry) => path.join(cacheBase, entry));

        if (matchingEntries.length === 0) {
          continue;
        }

        matchingCacheRoots += matchingEntries.length;

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
      }
    }

    if (matchingCacheRoots === 0) {
      const message = `No cache entry matches source version ${syncSource.version}; skipping asset sync to avoid version drift`;
      this.log(`${icons.info} ${message}`);
      this.results.pluginCacheAssets.checks.push({
        name: 'routing-cache-asset-sync',
        status: 'skipped',
        message
      });
      return { fixed: false, reason: 'no-matching-cache-version', sourceVersion: syncSource.version };
    }

    if (copied > 0) {
      this.log(`${icons.fix} Synced routing assets into cache version ${syncSource.version}`);
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
      installedRuntime: this.reconcileInstalledRuntime(),
      siblingCaches: this.reconcileSiblingPluginCaches(),
      orphanedEntries: this.pruneOrphanedInstalledPluginEntries(),
      userLevelHooks: this.fixUserLevelHooks(),
      pluginCacheHooks: this.fixPluginCacheHooksJson(),
      pluginCacheAssets: this.syncPluginCacheRoutingAssets(),
      pythonPluginFixes: this.fixPythonPluginFixes(),
      reminderFile: this.checkReminderFile()
    };

    // Summary
    this.log(`\n${colors.bold}## Summary${colors.reset}`);

    const totalFixes =
      (results.installedRuntime?.fixed ? (results.installedRuntime.entries || results.installedRuntime.roots || 1) : 0) +
      (results.siblingCaches?.fixed ? results.siblingCaches.count || 1 : 0) +
      (results.orphanedEntries?.fixed ? results.orphanedEntries.count || 1 : 0) +
      (results.userLevelHooks.fixed ? results.userLevelHooks.count || 1 : 0) +
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
      installedRuntime: this.checkInstalledRuntime(),
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
    dryRun: args.includes('--dry-run') || !args.includes('--fix'),
    fix: args.includes('--fix'),
    strict: args.includes('--strict'),
    verifyRuntime: args.includes('--verify-runtime') || args.includes('--check-runtime'),
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

  if (options.verifyRuntime) {
    const result = fixer.checkInstalledRuntime();
    process.exit(result.needsFix ? 1 : 0);
  } else if (options.fix) {
    fixer.runAllFixes();
  } else {
    fixer.runAllChecks();
  }
}

module.exports = { PostPluginUpdateFixes, CONFIG };
