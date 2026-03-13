#!/usr/bin/env node

/**
 * Hook Health Checker - Comprehensive Hook System Diagnostics
 *
 * Purpose: Diagnose all issues with Claude Code hooks including silent failures
 *
 * Features:
 * - 10-stage diagnostic pipeline
 * - Silent failure detection (empty output, missing fields, hidden errors)
 * - Circuit breaker state analysis
 * - Log analysis for patterns
 * - Multiple output formats (terminal, JSON, markdown)
 * - Actionable fix recommendations
 *
 * Usage:
 *   node hook-health-checker.js                    # Full diagnostic
 *   node hook-health-checker.js --quick            # Skip execution tests
 *   node hook-health-checker.js --verbose          # Include all details
 *   node hook-health-checker.js --format json      # JSON output
 *   node hook-health-checker.js --format markdown  # Markdown report
 *   node hook-health-checker.js --save             # Save report to file
 *   node hook-health-checker.js --watch [interval] # Real-time monitoring
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// =============================================================================
// Constants
// =============================================================================

const HEALTH_STATUS = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  UNHEALTHY: 'UNHEALTHY'
};

const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO'
};

const HOOK_TYPES = [
  'UserPromptSubmit',
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'PreCommit',
  'PostCommit',
  'PreCompact',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'TaskCompleted',
  'Setup'
];

// Hooks that should return JSON with systemMessage
const HOOKS_EXPECTING_OUTPUT = ['UserPromptSubmit'];

// Hooks that may return JSON with decision field
const HOOKS_WITH_DECISION = ['PreToolUse', 'PermissionRequest'];

// Hook type classification for context injection analysis
const CONTEXT_INJECTING_HOOKS = ['UserPromptSubmit', 'SessionStart', 'SubagentStart', 'PreCompact'];
const DECISION_HOOKS = ['PreToolUse', 'PermissionRequest'];
const SIDE_EFFECT_HOOKS = ['PostToolUse', 'Stop', 'SubagentStop', 'TaskCompleted', 'PreCommit', 'PostCommit', 'Setup'];

const VALID_CONTEXT_KEYS = {
  UserPromptSubmit: ['systemMessage', 'hookSpecificOutput', 'suppressOutput', 'decision', 'hookEventName'],
  SessionStart: ['systemMessage', 'hookSpecificOutput', 'suppressOutput', 'hookEventName'],
  SubagentStart: ['systemMessage', 'hookSpecificOutput', 'suppressOutput', 'hookEventName'],
  PreCompact: ['systemMessage', 'hookSpecificOutput', 'suppressOutput', 'hookEventName']
};

const STDOUT_CONTAMINATION_PATTERNS = [
  /^(debug|log|info|warn|error|trace):/i,
  /^processing/i,
  /^\[.*\]/,
  /^#/,
  /^echo /,
  /^set -/
];

const STATIC_CONTEXT_PATTERNS = {
  systemMessage: /["']systemMessage["']\s*:/,
  additionalContext: /additionalContext/,
  hookSpecificOutput: /hookSpecificOutput/,
  suppressOutput: /suppressOutput/,
  permissionDecision: /permissionDecision/,
  emptyJson: /echo\s+['"]?\{\}['"]?\s*$/m,
  echoEmpty: /echo\s*$/m
};

// Test inputs for each hook type
const TEST_INPUTS = {
  UserPromptSubmit: {
    message: 'healthcheck diagnostic test',
    userMessage: 'healthcheck diagnostic test',
    user_message: 'healthcheck diagnostic test',
    cwd: process.cwd(),
    hook_event_name: 'UserPromptSubmit',
    _test: true
  },
  SessionStart: {
    cwd: process.cwd(),
    hook_event_name: 'SessionStart',
    _test: true
  },
  PreToolUse: {
    tool_name: 'Test',
    tool_input: { test: true },
    hook_event_name: 'PreToolUse',
    _test: true
  },
  PostToolUse: {
    tool_name: 'Test',
    tool_result: { success: true },
    hook_event_name: 'PostToolUse',
    _test: true
  },
  PermissionRequest: {
    tool_name: 'Bash',
    tool: 'Bash',
    input: { command: 'sf data query --query "SELECT Id FROM Account LIMIT 1"' },
    hook_event_name: 'PermissionRequest',
    _test: true
  },
  PreCommit: {
    files: ['test.txt'],
    hook_event_name: 'PreCommit',
    _test: true
  },
  PostCommit: {
    files: ['test.txt'],
    hook_event_name: 'PostCommit',
    _test: true
  },
  PreCompact: {
    hook_event_name: 'PreCompact',
    _test: true
  },
  Stop: {
    hook_event_name: 'Stop',
    _test: true
  },
  SubagentStart: {
    hook_event_name: 'SubagentStart',
    session_id: 'healthcheck-session',
    cwd: process.cwd(),
    agent_id: 'healthcheck-agent-id',
    agent_type: 'opspal-core:implementation-planner',
    subagent_type: 'opspal-core:implementation-planner',
    prompt: 'healthcheck subagent startup',
    _test: true
  },
  SubagentStop: {
    hook_event_name: 'SubagentStop',
    session_id: 'healthcheck-session',
    cwd: process.cwd(),
    agent_id: 'healthcheck-agent-id',
    agent_type: 'opspal-core:implementation-planner',
    subagent_type: 'opspal-core:implementation-planner',
    success: true,
    stop_reason: 'completed',
    _test: true
  },
  TaskCompleted: {
    hook_event_name: 'TaskCompleted',
    session_id: 'healthcheck-session',
    cwd: process.cwd(),
    agent_type: 'opspal-core:implementation-planner',
    subagent_type: 'opspal-core:implementation-planner',
    success: true,
    duration_ms: 1234,
    token_count: 456,
    tool_uses: 3,
    _test: true
  },
  Setup: {
    hook_event_name: 'Setup',
    cwd: process.cwd(),
    _test: true
  }
};

// Common dependencies to check for
const COMMON_DEPENDENCIES = ['jq', 'node', 'bash', 'bc', 'curl', 'grep', 'sed', 'awk', 'sf', 'sfdx'];

// Colors for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

// Box drawing characters
const BOX = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  teeRight: '├',
  teeLeft: '┤',
  doubleTL: '╔',
  doubleTR: '╗',
  doubleBL: '╚',
  doubleBR: '╝',
  doubleH: '═',
  doubleV: '║',
  doubleTeeR: '╠',
  doubleTeeL: '╣'
};

// =============================================================================
// Check Result Class
// =============================================================================

class CheckResult {
  constructor(stage, name, status, message, details = {}) {
    this.stage = stage;
    this.name = name;
    this.status = status;
    this.message = message;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.severity = this._calculateSeverity();
    this.fix = details.fix || null;
  }

  _calculateSeverity() {
    if (this.status === HEALTH_STATUS.UNHEALTHY) {
      return SEVERITY.CRITICAL;
    }
    if (this.details?.isEnvironmentConstraint) {
      return SEVERITY.LOW;
    }
    if (this.status === HEALTH_STATUS.DEGRADED) {
      return this.details.isSilentFailure ? SEVERITY.HIGH : SEVERITY.MEDIUM;
    }
    return SEVERITY.INFO;
  }

  isHealthy() {
    return this.status === HEALTH_STATUS.HEALTHY;
  }

  toJSON() {
    return {
      stage: this.stage,
      name: this.name,
      status: this.status,
      severity: this.severity,
      message: this.message,
      details: this.details,
      fix: this.fix,
      timestamp: this.timestamp
    };
  }
}

// =============================================================================
// Hook Health Checker Class
// =============================================================================

class HookHealthChecker {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.verbose = options.verbose || false;
    this.quick = options.quick || false;
    this.format = options.format || 'terminal';

    this.pluginDirs = [];
    this.hookConfigs = [];
    this.seenPluginRealPaths = new Set();
    this.seenHookConfigRealPaths = new Set();
    this.results = [];
    this.recommendations = [];

    this.logDir = path.join(os.homedir(), '.claude', 'logs');
    this.hookLogSubdir = path.join(this.logDir, 'hooks');
    this.circuitStateFile = path.join(this.projectRoot, '.claude', 'hook-circuit-state.json');
  }

  // ---------------------------------------------------------------------------
  // Main Entry Point
  // ---------------------------------------------------------------------------

  async runDiagnostics() {
    const startTime = Date.now();

    // Stage 1: Configuration Discovery
    await this.discoverHookConfigs();

    // Stage 2: File Existence & Permissions
    await this.checkFilePermissions();

    // Stage 3: Syntax Validation
    await this.validateSyntax();

    // Stage 4: Dependency Detection
    await this.checkDependencies();

    // Stage 5: Execution Test (skip if --quick)
    if (!this.quick) {
      await this.testExecution();
    }

    // Stage 6: Output Validation (Silent Failure Detection)
    if (!this.quick) {
      await this.validateOutputs();
    }

    // Stage 7: Circuit Breaker State
    await this.checkCircuitBreakerState();

    // Stage 8: Log Analysis
    await this.analyzeRecentLogs();

    // Stage 9: Cross-Reference Validation
    await this.crossReferenceConfigs();

    // Stage 10: Context Injection Diagnostic
    await this.checkContextInjection();

    // Generate Summary
    const summary = this.generateSummary(Date.now() - startTime);

    return summary;
  }

  // ---------------------------------------------------------------------------
  // Stage 1: Configuration Discovery
  // ---------------------------------------------------------------------------

  async discoverHookConfigs() {
    const stage = 1;
    const stageName = 'Configuration Discovery';

    // Check project-level hooks.json
    const projectHooksPath = path.join(this.projectRoot, '.claude', 'hooks', 'hooks.json');
    if (fs.existsSync(projectHooksPath)) {
      try {
        const content = JSON.parse(fs.readFileSync(projectHooksPath, 'utf8'));
        this.hookConfigs.push({
          source: 'project',
          path: projectHooksPath,
          pluginRoot: this.projectRoot,
          config: content
        });
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.HEALTHY,
          `Project hooks.json found`,
          { path: projectHooksPath, hookTypes: Object.keys(content.hooks || {}) }
        ));
      } catch (e) {
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.UNHEALTHY,
          `Project hooks.json has invalid JSON`,
          { path: projectHooksPath, error: e.message, fix: `Fix JSON syntax in ${projectHooksPath}` }
        ));
      }
    } else {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.DEGRADED,
        `No project-level hooks.json found`,
        {
          expectedPath: projectHooksPath,
          fix: `Create ${projectHooksPath} with hook configurations`
        }
      ));
    }

    // Check project-level settings.json for hooks
    const settingsPath = path.join(this.projectRoot, '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (settings.hooks && Object.keys(settings.hooks).length > 0) {
          let totalHooks = 0;
          for (const eventType of Object.keys(settings.hooks)) {
            for (const group of settings.hooks[eventType]) {
              totalHooks += (group.hooks || []).length;
            }
          }
          this.hookConfigs.push({
            source: 'settings.json',
            path: settingsPath,
            pluginRoot: this.projectRoot,
            config: { hooks: settings.hooks }
          });
          this.results.push(new CheckResult(
            stage, stageName, HEALTH_STATUS.HEALTHY,
            `settings.json: ${Object.keys(settings.hooks).length} event types, ${totalHooks} hooks`,
            { path: settingsPath, eventTypes: Object.keys(settings.hooks), totalHooks }
          ));
        }
      } catch (e) {
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.DEGRADED,
          `settings.json parse error`,
          { path: settingsPath, error: e.message }
        ));
      }
    }

    // Check global settings.json for hooks
    const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    if (fs.existsSync(globalSettingsPath) && globalSettingsPath !== settingsPath) {
      try {
        const globalSettings = JSON.parse(fs.readFileSync(globalSettingsPath, 'utf8'));
        if (globalSettings.hooks && Object.keys(globalSettings.hooks).length > 0) {
          let totalHooks = 0;
          for (const eventType of Object.keys(globalSettings.hooks)) {
            for (const group of globalSettings.hooks[eventType]) {
              totalHooks += (group.hooks || []).length;
            }
          }
          this.hookConfigs.push({
            source: 'global-settings.json',
            path: globalSettingsPath,
            pluginRoot: os.homedir(),
            config: { hooks: globalSettings.hooks }
          });
          this.results.push(new CheckResult(
            stage, stageName, HEALTH_STATUS.HEALTHY,
            `global settings.json: ${Object.keys(globalSettings.hooks).length} event types, ${totalHooks} hooks`,
            { path: globalSettingsPath, eventTypes: Object.keys(globalSettings.hooks), totalHooks }
          ));
        }
      } catch (e) {
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.DEGRADED,
          `global settings.json parse error`,
          { path: globalSettingsPath, error: e.message }
        ));
      }
    }

    // Discover plugin directories
    const pluginDirs = [
      path.join(this.projectRoot, '.claude-plugins'),
      path.join(this.projectRoot, 'plugins')
    ];

    for (const baseDir of pluginDirs) {
      if (!fs.existsSync(baseDir)) continue;

      // Directories to skip - these are not actual plugins
      const SKIP_DIRS = ['.claude', 'scripts', 'hooks', 'node_modules', '.git', 'docs', 'templates'];

      const plugins = fs.readdirSync(baseDir).filter(f => {
        const fullPath = path.join(baseDir, f);
        return fs.statSync(fullPath).isDirectory() && !SKIP_DIRS.includes(f);
      });

      for (const plugin of plugins) {
        const pluginPath = path.join(baseDir, plugin);
        let pluginRealPath = pluginPath;
        try {
          pluginRealPath = fs.realpathSync(pluginPath);
        } catch {
          // Fall back to unresolved path if realpath fails.
        }

        // Skip duplicated plugin mounts (e.g., plugins/ and .claude-plugins/ symlink views)
        if (this.seenPluginRealPaths.has(pluginRealPath)) {
          continue;
        }
        this.seenPluginRealPaths.add(pluginRealPath);
        this.pluginDirs.push(pluginPath);

        // Check for hooks.json in .claude-plugin/
        const hooksJsonPaths = [
          path.join(pluginPath, '.claude-plugin', 'hooks.json'),
          path.join(pluginPath, 'hooks.json')
        ];

        let found = false;
        for (const hooksPath of hooksJsonPaths) {
          if (fs.existsSync(hooksPath)) {
            try {
              let hooksRealPath = hooksPath;
              try {
                hooksRealPath = fs.realpathSync(hooksPath);
              } catch {
                // Keep original path if realpath fails.
              }

              if (this.seenHookConfigRealPaths.has(hooksRealPath)) {
                found = true;
                break;
              }

              const content = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
              this.hookConfigs.push({
                source: `plugin:${plugin}`,
                path: hooksPath,
                pluginRoot: pluginPath,
                config: content
              });
              this.seenHookConfigRealPaths.add(hooksRealPath);
              found = true;
              break;
            } catch (e) {
              this.results.push(new CheckResult(
                stage, stageName, HEALTH_STATUS.DEGRADED,
                `Plugin ${plugin} has invalid hooks.json`,
                { path: hooksPath, error: e.message }
              ));
            }
          }
        }

        // Check if plugin has hooks directory but no hooks.json
        const hooksDir = path.join(pluginPath, 'hooks');
        if (fs.existsSync(hooksDir) && !found) {
          const hookFiles = fs.readdirSync(hooksDir).filter(f => f.endsWith('.sh') || f.endsWith('.js'));
          if (hookFiles.length > 0) {
            this.results.push(new CheckResult(
              stage, stageName, HEALTH_STATUS.DEGRADED,
              `Plugin ${plugin} has hook scripts but no hooks.json`,
              {
                hookScripts: hookFiles,
                fix: `Create hooks.json in ${pluginPath}/.claude-plugin/`
              }
            ));
          }
        }
      }
    }

    // Summary result
    if (this.hookConfigs.length === 0) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.UNHEALTHY,
        `No hook configurations found`,
        { fix: 'Add hooks to .claude/settings.json under the "hooks" key, or create .claude/hooks/hooks.json with hook definitions' }
      ));
    } else {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.HEALTHY,
        `Found ${this.hookConfigs.length} hook configuration(s)`,
        { configs: this.hookConfigs.map(c => c.source) }
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 2: File Existence & Permissions
  // ---------------------------------------------------------------------------

  async checkFilePermissions() {
    const stage = 2;
    const stageName = 'File Permissions';
    let allGood = true;

    for (const configEntry of this.hookConfigs) {
      const hooks = configEntry.config.hooks || {};

      for (const [hookType, hookArray] of Object.entries(hooks)) {
        const hooksList = Array.isArray(hookArray) ? hookArray : [hookArray];

        for (const hookDef of hooksList) {
          const hooksToCheck = hookDef.hooks || [hookDef];

          for (const hook of hooksToCheck) {
            if (hook.type !== 'command' && hook.command === undefined) continue;

            const command = hook.command;
            if (!command) continue;

            // Extract the script path from the command
            const scriptPath = this._extractScriptPath(command, configEntry.path, configEntry.pluginRoot);
            if (!scriptPath) continue;

            // Resolve full path - if it starts with plugin root placeholder, expand it
            const fullPath = path.isAbsolute(scriptPath)
              ? scriptPath
              : path.join(configEntry.pluginRoot || this.projectRoot, scriptPath);

            if (!fs.existsSync(fullPath)) {
              this.results.push(new CheckResult(
                stage, stageName, HEALTH_STATUS.UNHEALTHY,
                `Hook script not found: ${scriptPath}`,
                {
                  hookType,
                  command,
                  expectedPath: fullPath,
                  source: configEntry.source,
                  fix: `Create ${fullPath} or update command in hooks.json`
                }
              ));
              allGood = false;
              continue;
            }

            // Check if executable (for shell scripts)
            if (scriptPath.endsWith('.sh')) {
              try {
                fs.accessSync(fullPath, fs.constants.X_OK);
              } catch {
                this.results.push(new CheckResult(
                  stage, stageName, HEALTH_STATUS.DEGRADED,
                  `Hook script not executable: ${scriptPath}`,
                  {
                    hookType,
                    path: fullPath,
                    fix: `chmod +x ${fullPath}`
                  }
                ));
                allGood = false;
              }
            }
          }
        }
      }
    }

    if (allGood) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.HEALTHY,
        'All hook scripts exist and are executable',
        {}
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 3: Syntax Validation
  // ---------------------------------------------------------------------------

  async validateSyntax() {
    const stage = 3;
    const stageName = 'Syntax Validation';
    const scripts = this._collectAllScripts();
    let allValid = true;
    let probeBlockedByEnv = false;

    for (const script of scripts) {
      if (script.endsWith('.sh')) {
        const result = await this._runCommand('bash', ['-n', script], { timeout: 3000 });
        if (result.errorCode === 'EPERM') {
          probeBlockedByEnv = true;
          break;
        }
        if (result.exitCode !== 0) {
          this.results.push(new CheckResult(
            stage, stageName, HEALTH_STATUS.UNHEALTHY,
            `Syntax error in ${path.basename(script)}`,
            {
              path: script,
              error: result.stderr || result.stdout || result.errorMessage || 'Unknown syntax failure',
              fix: `Fix syntax errors: bash -n "${script}"`
            }
          ));
          allValid = false;
        }
      } else if (script.endsWith('.js')) {
        const result = await this._runCommand('node', ['--check', script], { timeout: 3000 });
        if (result.errorCode === 'EPERM') {
          probeBlockedByEnv = true;
          break;
        }
        if (result.exitCode !== 0) {
          this.results.push(new CheckResult(
            stage, stageName, HEALTH_STATUS.UNHEALTHY,
            `Syntax error in ${path.basename(script)}`,
            {
              path: script,
              error: result.stderr || result.stdout || result.errorMessage || 'Unknown syntax failure',
              fix: `Fix syntax errors in ${script}`
            }
          ));
          allValid = false;
        }
      }
    }

    if (probeBlockedByEnv) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.DEGRADED,
        'Syntax probes blocked by environment (EPERM). Syntax status is inconclusive.',
        {
          isEnvironmentConstraint: true,
          fix: 'Run syntax checks in an environment that allows local process spawning (bash/node).'
        }
      ));
      return;
    }

    if (allValid) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.HEALTHY,
        `All ${scripts.length} hook scripts have valid syntax`,
        { scriptsChecked: scripts.length }
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 4: Dependency Detection
  // ---------------------------------------------------------------------------

  async checkDependencies() {
    const stage = 4;
    const stageName = 'Dependency Detection';
    const scripts = this._collectAllScripts();
    const missingDeps = new Set();
    const depUsage = {};
    let probeBlockedByEnv = false;

    for (const script of scripts) {
      if (!script.endsWith('.sh')) continue;

      try {
        const content = fs.readFileSync(script, 'utf8');

        for (const dep of COMMON_DEPENDENCIES) {
          // Check if dependency is used in script
          const patterns = [
            new RegExp(`\\b${dep}\\b`, 'g'),
            new RegExp(`command -v ${dep}`, 'g'),
            new RegExp(`which ${dep}`, 'g')
          ];

          for (const pattern of patterns) {
            if (pattern.test(content)) {
              depUsage[dep] = depUsage[dep] || [];
              depUsage[dep].push(path.basename(script));

              // Check if dependency is available
              const depCheck = await this._runCommand('bash', ['-lc', `command -v ${dep}`], { timeout: 3000 });
              if (depCheck.errorCode === 'EPERM') {
                probeBlockedByEnv = true;
                break;
              }
              if (depCheck.exitCode !== 0) {
                missingDeps.add(dep);
              }
              break;
            }
          }
          if (probeBlockedByEnv) break;
        }
        if (probeBlockedByEnv) break;
      } catch (e) {
        // Skip files we can't read
      }
      if (probeBlockedByEnv) break;
    }

    if (probeBlockedByEnv) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.DEGRADED,
        'Dependency probes blocked by environment (EPERM). Dependency status is inconclusive.',
        {
          isEnvironmentConstraint: true,
          fix: 'Run dependency checks in an environment that allows local process spawning.'
        }
      ));
      return;
    }

    if (missingDeps.size > 0) {
      const fixes = {
        jq: 'brew install jq (macOS) or apt-get install jq (Linux)',
        node: 'Install from https://nodejs.org/',
        bc: 'brew install bc (macOS) or apt-get install bc (Linux)',
        curl: 'brew install curl (macOS) or apt-get install curl (Linux)'
      };

      for (const dep of missingDeps) {
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.DEGRADED,
          `Missing dependency: ${dep}`,
          {
            dependency: dep,
            usedBy: depUsage[dep] || [],
            fix: fixes[dep] || `Install ${dep}`
          }
        ));
      }
    } else {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.HEALTHY,
        'All detected dependencies are available',
        { dependencies: Object.keys(depUsage) }
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 5: Execution Test
  // ---------------------------------------------------------------------------

  async testExecution() {
    const stage = 5;
    const stageName = 'Execution Test';
    const timeout = 5000; // 5 seconds

    for (const configEntry of this.hookConfigs) {
      const hooks = configEntry.config.hooks || {};
      const pluginRoot = configEntry.pluginRoot || this.projectRoot;

      for (const [hookType, hookArray] of Object.entries(hooks)) {
        const hooksList = Array.isArray(hookArray) ? hookArray : [hookArray];

        for (const hookDef of hooksList) {
          const hooksToExecute = hookDef.hooks || [hookDef];

          for (const hook of hooksToExecute) {
            if (hook.type !== 'command' && hook.command === undefined) continue;

            const command = hook.command;
            if (!command) continue;

            const testInput = TEST_INPUTS[hookType] || { _test: true };
            const resolvedCommand = this._expandEnvVars(command, pluginRoot);
            const result = await this._executeHook(resolvedCommand, testInput, timeout, { pluginRoot });

            if (result.timedOut) {
              this.results.push(new CheckResult(
                stage, stageName, HEALTH_STATUS.DEGRADED,
                `Hook timed out: ${this._getHookName(command, pluginRoot)}`,
                {
                  hookType,
                  command,
                  resolvedCommand,
                  source: configEntry.source,
                  timeout,
                  isSilentFailure: true,
                  fix: 'Optimize hook or increase timeout'
                }
              ));
            } else if (result.exitCode !== 0) {
              this.results.push(new CheckResult(
                stage, stageName, HEALTH_STATUS.DEGRADED,
                `Hook failed (exit ${result.exitCode}): ${this._getHookName(command, pluginRoot)}`,
                {
                  hookType,
                  command,
                  resolvedCommand,
                  source: configEntry.source,
                  exitCode: result.exitCode,
                  stderr: result.stderr?.slice(0, 500),
                  fix: `Debug hook: bash -x ${this._extractScriptPath(command, configEntry.path, pluginRoot)}`
                }
              ));
            } else {
              // Store output for Stage 6 validation
              hook._testOutput = result.stdout;
              hook._testDuration = result.duration;
              hook._testCommand = resolvedCommand;
              hook._testSource = configEntry.source;
              hook._testHookType = hookType;
              hook._testPluginRoot = pluginRoot;
            }
          }
        }
      }
    }

    // Add success result if no issues
    const issues = this.results.filter(r => r.stage === stage && !r.isHealthy());
    if (issues.length === 0) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.HEALTHY,
        'All hooks executed successfully',
        {}
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 6: Output Validation (Silent Failure Detection)
  // ---------------------------------------------------------------------------

  async validateOutputs() {
    const stage = 6;
    const stageName = 'Output Validation (Silent Failures)';
    let silentFailures = 0;

    for (const configEntry of this.hookConfigs) {
      const hooks = configEntry.config.hooks || {};

      for (const [hookType, hookArray] of Object.entries(hooks)) {
        const hooksList = Array.isArray(hookArray) ? hookArray : [hookArray];

        for (const hookDef of hooksList) {
          const hooksToCheck = hookDef.hooks || [hookDef];

          for (const hook of hooksToCheck) {
            if (!hook._testOutput) continue;

            const output = hook._testOutput;
            const command = hook._testCommand || hook.command;
            const hookName = this._getHookName(command, hook._testPluginRoot);
            const source = hook._testSource || configEntry.source;

            // Check 1: Empty output when expecting output
            if (HOOKS_EXPECTING_OUTPUT.includes(hookType)) {
              // UserPromptSubmit hooks may legitimately emit:
              // - no output (no-op)
              // - plain text (added to context)
              // - JSON (structured control/context)
              if (!output || !output.trim()) {
                continue;
              }

              // Check 2: Validate JSON only when output is JSON.
              // Non-JSON text is valid for UserPromptSubmit.
              try {
                const parsed = JSON.parse(output);

                // Check 3: Invalid decision values
                if (parsed.decision !== undefined && parsed.decision !== 'block') {
                  this.results.push(new CheckResult(
                    stage, stageName, HEALTH_STATUS.DEGRADED,
                    `Silent failure: ${hookName} has invalid decision value`,
                    {
                      hookType,
                      command,
                      source,
                      isSilentFailure: true,
                      decision: parsed.decision,
                      fix: 'Use decision=\"block\" or omit decision'
                    }
                  ));
                  silentFailures++;
                }

                const hookSpecificOutput = parsed?.hookSpecificOutput;
                if (
                  hookSpecificOutput &&
                  hookSpecificOutput.hookEventName &&
                  hookSpecificOutput.hookEventName !== hookType
                ) {
                  this.results.push(new CheckResult(
                    stage, stageName, HEALTH_STATUS.DEGRADED,
                    `Silent failure: ${hookName} has mismatched hookEventName`,
                    {
                      hookType,
                      command,
                      source,
                      isSilentFailure: true,
                      reportedHookEventName: hookSpecificOutput.hookEventName,
                      fix: `Set hookSpecificOutput.hookEventName to "${hookType}" or omit it`
                    }
                  ));
                  silentFailures++;
                }
              } catch {
                // Plain text output is valid for UserPromptSubmit hooks.
              }
            }

            // Check 4: PreToolUse decision field
            if (HOOKS_WITH_DECISION.includes(hookType) && output.trim()) {
              try {
                const parsed = JSON.parse(output);

                const hookSpecificOutput = parsed?.hookSpecificOutput || {};
                const permissionDecision = hookSpecificOutput.permissionDecision;
                if (
                  permissionDecision !== undefined &&
                  !['allow', 'deny', 'ask', 'approve', 'block'].includes(permissionDecision)
                ) {
                  this.results.push(new CheckResult(
                    stage, stageName, HEALTH_STATUS.DEGRADED,
                    `Silent failure: ${hookName} has invalid permissionDecision`,
                    {
                      hookType,
                      command,
                      source,
                      isSilentFailure: true,
                      permissionDecision,
                      fix: 'Use permissionDecision: allow, deny, or ask'
                    }
                  ));
                  silentFailures++;
                }

                if (
                  hookSpecificOutput.hookEventName &&
                  hookSpecificOutput.hookEventName !== hookType
                ) {
                  this.results.push(new CheckResult(
                    stage, stageName, HEALTH_STATUS.DEGRADED,
                    `Silent failure: ${hookName} has mismatched hookEventName`,
                    {
                      hookType,
                      command,
                      source,
                      isSilentFailure: true,
                      reportedHookEventName: hookSpecificOutput.hookEventName,
                      fix: `Set hookSpecificOutput.hookEventName to "${hookType}" or omit it`
                    }
                  ));
                  silentFailures++;
                }
              } catch {
                // Non-JSON output can be acceptable for no-op hooks.
              }
            }

            // Check 5: Hidden error patterns in output
            const errorPatterns = [
              /error:/i, /\bfailed\b/i, /exception/i, /traceback/i,
              /cannot find/i, /command not found/i, /permission denied/i,
              /no such file/i, /not found/i
            ];

            for (const pattern of errorPatterns) {
              if (pattern.test(output)) {
                this.results.push(new CheckResult(
                  stage, stageName, HEALTH_STATUS.DEGRADED,
                  `Silent failure: ${hookName} contains error message but exited 0`,
                  {
                    hookType,
                    command,
                    source,
                    isSilentFailure: true,
                    matchedPattern: pattern.toString(),
                    outputPreview: output.slice(0, 300),
                    fix: 'Hook should exit non-zero on errors'
                  }
                ));
                silentFailures++;
                break;
              }
            }
          }
        }
      }
    }

    if (silentFailures === 0) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.HEALTHY,
        'No silent failures detected',
        {}
      ));
    } else {
      this.recommendations.push({
        severity: SEVERITY.HIGH,
        message: `${silentFailures} silent failure(s) detected - hooks complete but produce invalid output`
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 7: Circuit Breaker State
  // ---------------------------------------------------------------------------

  async checkCircuitBreakerState() {
    const stage = 7;
    const stageName = 'Circuit Breaker State';

    if (!fs.existsSync(this.circuitStateFile)) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.HEALTHY,
        'No circuit breaker state file (not triggered)',
        { path: this.circuitStateFile }
      ));
      return;
    }

    try {
      const state = JSON.parse(fs.readFileSync(this.circuitStateFile, 'utf8'));

      if (state.state === 'OPEN') {
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.UNHEALTHY,
          'Circuit breaker is OPEN - hooks are being bypassed',
          {
            state: state.state,
            failureCount: state.failureCount,
            lastStateChange: state.lastStateChange,
            fix: `Reset circuit: rm ${this.circuitStateFile}`
          }
        ));
      } else if (state.state === 'HALF_OPEN') {
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.DEGRADED,
          'Circuit breaker is HALF_OPEN - testing recovery',
          {
            state: state.state,
            failureCount: state.failureCount,
            recoveryAttempts: state.recoveryAttempts
          }
        ));
      } else {
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.HEALTHY,
          'Circuit breaker is CLOSED (normal)',
          {
            state: state.state,
            failureCount: state.failureCount,
            successCount: state.successCount
          }
        ));

        // Note high failure count (informational only - CLOSED circuit is healthy)
        if (state.failureCount > 10) {
          this.results.push(new CheckResult(
            stage, stageName, HEALTH_STATUS.HEALTHY,
            `Historical failure count: ${state.failureCount} (circuit recovered)`,
            {
              failureCount: state.failureCount,
              note: 'Circuit is CLOSED and operating normally. Historical failures are informational only.'
            }
          ));
        }
      }
    } catch (e) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.DEGRADED,
        'Could not parse circuit breaker state',
        { error: e.message }
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 8: Log Analysis
  // ---------------------------------------------------------------------------

  async analyzeRecentLogs() {
    const stage = 8;
    const stageName = 'Log Analysis';

    // Collect log files from both the hooks subdirectory and parent logs directory
    const logFilePaths = [];

    // Scan hooks subdirectory for all .jsonl files
    if (fs.existsSync(this.hookLogSubdir)) {
      try {
        const subFiles = fs.readdirSync(this.hookLogSubdir).filter(f => f.endsWith('.jsonl'));
        for (const f of subFiles) {
          logFilePaths.push(path.join(this.hookLogSubdir, f));
        }
      } catch { /* skip if unreadable */ }
    }

    // Scan parent logs directory for hook-related .jsonl files
    if (fs.existsSync(this.logDir)) {
      try {
        const parentFiles = fs.readdirSync(this.logDir).filter(f =>
          f.endsWith('.jsonl') && f.toLowerCase().includes('hook')
        );
        for (const f of parentFiles) {
          const fullPath = path.join(this.logDir, f);
          if (!logFilePaths.includes(fullPath)) {
            logFilePaths.push(fullPath);
          }
        }
      } catch { /* skip if unreadable */ }
    }

    if (logFilePaths.length === 0) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.HEALTHY,
        'No hook log files found',
        { searchedPaths: [this.hookLogSubdir, this.logDir] }
      ));
      return;
    }

    try {
      const recentErrors = [];
      const errorPatterns = {};
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      for (const logPath of logFilePaths) {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.trim().split('\n').filter(l => l);

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            const entryTime = new Date(entry.timestamp).getTime();

            if (entryTime < oneDayAgo) continue;

            if (entry.level === 'error') {
              recentErrors.push(entry);

              // Pattern detection
              const pattern = this._extractErrorPattern(entry.message);
              errorPatterns[pattern] = (errorPatterns[pattern] || 0) + 1;
            }
          } catch {
            // Skip invalid lines
          }
        }
      }

      if (recentErrors.length === 0) {
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.HEALTHY,
          'No errors in hook logs (last 24 hours)',
          { logsAnalyzed: logFilePaths.length }
        ));
      } else {
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.DEGRADED,
          `${recentErrors.length} error(s) in hook logs (last 24 hours)`,
          {
            errorCount: recentErrors.length,
            patterns: errorPatterns,
            recentErrors: recentErrors.slice(0, 5).map(e => ({
              hook: e.hook,
              message: e.message?.slice(0, 100),
              timestamp: e.timestamp
            }))
          }
        ));
      }

      // Stage 8b: Wire in hook-execution-analyzer if available
      try {
        const { HookExecutionAnalyzer } = require('./hook-execution-analyzer');
        const analyzer = new HookExecutionAnalyzer({ hours: 24, verbose: false });
        const execResults = await analyzer.analyze();
        if (execResults.failed > 0) {
          this.results.push(new CheckResult(stage, stageName, HEALTH_STATUS.DEGRADED,
            `${execResults.failed} hook execution failures in last 24h`,
            { failures: execResults.failures?.slice(0, 5) }
          ));
        }
        if (execResults.slow > 0) {
          this.results.push(new CheckResult(stage, stageName, HEALTH_STATUS.DEGRADED,
            `${execResults.slow} slow hooks detected (>100ms)`,
            { details: 'Run hook-execution-analyzer.js --verbose for details' }
          ));
        }
      } catch {
        // Non-fatal: analyzer not available or failed
      }
    } catch (e) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.DEGRADED,
        'Could not analyze hook logs',
        { error: e.message }
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 9: Cross-Reference Validation
  // ---------------------------------------------------------------------------

  async crossReferenceConfigs() {
    const stage = 9;
    const stageName = 'Cross-Reference Validation';

    // Find all hook scripts
    const allScripts = new Set();
    for (const pluginDir of this.pluginDirs) {
      const hooksDir = path.join(pluginDir, 'hooks');
      if (fs.existsSync(hooksDir)) {
        const files = fs.readdirSync(hooksDir).filter(f => f.endsWith('.sh') || f.endsWith('.js'));
        files.forEach(f => allScripts.add(path.join(hooksDir, f)));
      }
    }

    const projectHooksDir = path.join(this.projectRoot, '.claude', 'hooks');
    if (fs.existsSync(projectHooksDir)) {
      const files = fs.readdirSync(projectHooksDir).filter(f => f.endsWith('.sh') || f.endsWith('.js'));
      files.forEach(f => allScripts.add(path.join(projectHooksDir, f)));
    }

    // Find configured scripts
    const configuredScripts = new Set();
    for (const configEntry of this.hookConfigs) {
      const hooks = configEntry.config.hooks || {};

      for (const hookArray of Object.values(hooks)) {
        const hooksList = Array.isArray(hookArray) ? hookArray : [hookArray];

        for (const hookDef of hooksList) {
          const hooksToCheck = hookDef.hooks || [hookDef];

          for (const hook of hooksToCheck) {
            const command = hook.command;
            if (!command) continue;

            const scriptPath = this._extractScriptPath(command, configEntry.path, configEntry.pluginRoot);
            if (scriptPath) {
              const fullPath = path.isAbsolute(scriptPath)
                ? scriptPath
                : path.join(configEntry.pluginRoot || this.projectRoot, scriptPath);
              configuredScripts.add(fullPath);
            }
          }
        }
      }
    }

    // Find orphaned scripts (exist but not configured)
    const orphaned = [...allScripts].filter(s => !configuredScripts.has(s));

    if (orphaned.length > 0 && this.verbose) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.HEALTHY,
        `${orphaned.length} orphaned hook script(s) found`,
        {
          orphanedScripts: orphaned.map(s => path.relative(this.projectRoot, s)),
          note: 'Scripts exist but are not registered in any hooks.json'
        }
      ));
    }

    // Check for duplicate registrations
    const commandCounts = {};
    for (const configEntry of this.hookConfigs) {
      const hooks = configEntry.config.hooks || {};

      for (const [hookType, hookArray] of Object.entries(hooks)) {
        const hooksList = Array.isArray(hookArray) ? hookArray : [hookArray];

        for (const hookDef of hooksList) {
          const hooksToCheck = hookDef.hooks || [hookDef];

          for (const hook of hooksToCheck) {
            const command = hook.command;
            if (!command) continue;

            const key = `${hookType}:${command}`;
            commandCounts[key] = (commandCounts[key] || 0) + 1;
          }
        }
      }
    }

    const duplicates = Object.entries(commandCounts).filter(([_, count]) => count > 1);
    if (duplicates.length > 0) {
      // Check if duplicates are from symlinked directories (.claude-plugins/ <-> plugins/)
      // This is expected when both directories are scanned and one is a symlink
      const hasSymlinkStructure =
        fs.existsSync(path.join(this.projectRoot, '.claude-plugins')) &&
        fs.existsSync(path.join(this.projectRoot, 'plugins'));

      if (hasSymlinkStructure) {
        // Duplicates are expected from symlink structure - report as INFO, no score penalty
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.HEALTHY,
          `${duplicates.length} hook(s) registered via symlink structure (expected)`,
          {
            note: 'Duplicates are from .claude-plugins/ and plugins/ directories (symlinked)',
            count: duplicates.length
          }
        ));
      } else {
        // Real duplicates - report as warning
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.DEGRADED,
          `${duplicates.length} duplicate hook registration(s)`,
          {
            duplicates: duplicates.map(([key, count]) => ({ key, count })),
            fix: 'Remove duplicate entries from hooks.json files'
          }
        ));
      }
    }

    if (orphaned.length === 0 && duplicates.length === 0) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.HEALTHY,
        'Hook configurations are consistent',
        {}
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 10: Context Injection Diagnostic
  // ---------------------------------------------------------------------------

  _classifyHookRole(hookType) {
    if (CONTEXT_INJECTING_HOOKS.includes(hookType)) return 'context-injecting';
    if (DECISION_HOOKS.includes(hookType)) return 'decision-making';
    if (SIDE_EFFECT_HOOKS.includes(hookType)) return 'side-effect';
    return 'unknown';
  }

  _analyzeOutputForContextInjection(output, hookType, hookName) {
    const role = this._classifyHookRole(hookType);
    const result = { verdict: 'UNKNOWN', details: '', recommendation: null };

    // Side-effect hooks should not produce stdout
    if (role === 'side-effect') {
      if (output && output.trim()) {
        result.verdict = 'SIDE_EFFECT_STDOUT';
        result.details = `Side-effect hook produced stdout (${output.trim().length} chars)`;
        result.recommendation = 'Remove stdout output — side-effect hooks should only use stderr or file I/O';
      } else {
        result.verdict = 'NOOP';
        result.details = 'Side-effect hook correctly produces no stdout';
      }
      return result;
    }

    // Empty output from context-injecting or decision hooks
    if (!output || !output.trim()) {
      if (role === 'context-injecting') {
        result.verdict = 'NOOP';
        result.details = 'Empty output — hook chose not to inject (valid no-op)';
      } else {
        result.verdict = 'NOOP';
        result.details = 'Empty output';
      }
      return result;
    }

    const trimmed = output.trim();

    // UserPromptSubmit hooks can legitimately return plain text (added as systemMessage)
    // Only JSON output needs envelope validation; plain text is always valid for context injection
    if (hookType === 'UserPromptSubmit' && !trimmed.startsWith('{')) {
      result.verdict = 'WILL_INJECT';
      result.details = `Plain text context injection (${trimmed.length} chars)`;
      return result;
    }

    // Check for stdout contamination (non-JSON before JSON)
    const lines = trimmed.split('\n');
    const firstLine = lines[0].trim();
    if (lines.length > 1 || !firstLine.startsWith('{')) {
      for (const pattern of STDOUT_CONTAMINATION_PATTERNS) {
        if (pattern.test(firstLine)) {
          result.verdict = 'CONTAMINATED';
          result.details = `stdout contamination detected: "${firstLine.substring(0, 80)}"`;
          result.recommendation = 'Redirect debug output to stderr (>&2) or remove it';
          return result;
        }
      }
    }

    // Try to parse as JSON
    let parsed;
    try {
      // Find the last JSON object in output (skip contamination prefix)
      const jsonMatch = trimmed.match(/\{[\s\S]*\}$/);
      if (!jsonMatch) {
        // For context-injecting hooks other than UserPromptSubmit, non-JSON is invalid
        if (role === 'context-injecting') {
          result.verdict = 'INVALID';
          result.details = 'Output is not valid JSON (non-UserPromptSubmit context hooks must use JSON)';
          result.recommendation = 'Wrap context in {"systemMessage": "..."} envelope';
          return result;
        }
        result.verdict = 'INVALID';
        result.details = 'Output is not valid JSON';
        result.recommendation = 'Hook must output valid JSON or nothing';
        return result;
      }
      parsed = JSON.parse(jsonMatch[0]);
      if (jsonMatch[0] !== trimmed) {
        result.verdict = 'CONTAMINATED';
        result.details = 'stdout has non-JSON prefix before JSON payload';
        result.recommendation = 'Remove all stdout before JSON — Claude Code reads the full stdout buffer';
        return result;
      }
    } catch (e) {
      result.verdict = 'INVALID';
      result.details = `JSON parse error: ${e.message}`;
      result.recommendation = 'Fix JSON syntax in hook output';
      return result;
    }

    // Empty JSON object
    if (Object.keys(parsed).length === 0) {
      result.verdict = 'NOOP';
      result.details = 'Returns empty JSON {} — valid no-op';
      return result;
    }

    // Validate envelope keys for context-injecting hooks
    if (role === 'context-injecting') {
      const validKeys = VALID_CONTEXT_KEYS[hookType] || [];
      const hasContextKey = parsed.systemMessage ||
        (parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext);

      if (hasContextKey) {
        result.verdict = 'WILL_INJECT';
        const injectionPaths = [];
        if (parsed.systemMessage) injectionPaths.push('systemMessage');
        if (parsed.hookSpecificOutput?.additionalContext) injectionPaths.push('hookSpecificOutput.additionalContext');
        result.details = `Context injection via: ${injectionPaths.join(', ')}`;
      } else {
        // Has keys but none that inject context
        const keys = Object.keys(parsed);
        const unknownKeys = keys.filter(k => !validKeys.includes(k));
        if (unknownKeys.length > 0) {
          result.verdict = 'INVALID';
          result.details = `Unknown envelope keys: ${unknownKeys.join(', ')}`;
          result.recommendation = `Valid keys for ${hookType}: ${validKeys.join(', ')}`;
        } else {
          result.verdict = 'NOOP';
          result.details = 'Valid JSON but no context injection keys present';
        }
      }
      return result;
    }

    // Decision hooks
    if (role === 'decision-making') {
      if (parsed.permissionDecision) {
        result.verdict = 'WILL_INJECT';
        result.details = `Decision hook with permissionDecision: ${parsed.permissionDecision}`;
      } else {
        result.verdict = 'NOOP';
        result.details = 'Decision hook without permissionDecision — passes through';
      }
      return result;
    }

    result.verdict = 'UNKNOWN';
    result.details = `Unclassified hook type: ${hookType}`;
    return result;
  }

  _staticAnalyzeHookScript(scriptPath, hookType) {
    const role = this._classifyHookRole(hookType);
    const result = { verdict: 'UNKNOWN', details: '', recommendation: null, static: true };

    try {
      const content = fs.readFileSync(scriptPath, 'utf8');

      // B5: Check HEALTHCHECK_REQUIRES annotation — skip if required env vars missing
      const requiresMatch = content.match(/^#\s*HEALTHCHECK_REQUIRES:\s*(.+)$/m);
      if (requiresMatch) {
        const requiredVars = requiresMatch[1].split(',').map(v => v.trim());
        const missing = requiredVars.filter(v => !process.env[v]);
        if (missing.length > 0) {
          result.verdict = 'SKIPPED';
          result.details = `Requires env: ${missing.join(', ')} (not set)`;
          return result;
        }
      }

      if (role === 'side-effect') {
        // Check if script globally redirects stdout→stderr via exec
        const hasGlobalRedirect = /exec\s+(\d+>&1\s+)?1>&2/.test(content);
        if (hasGlobalRedirect) {
          result.verdict = 'NOOP';
          result.details = 'Static: global exec redirect to stderr detected (stdout silenced)';
          return result;
        }

        // B1: Line-by-line analysis — only flag bare echo/printf that write to stdout
        const SAFE_ECHO_PATTERNS = [
          />>/,           // append redirect
          />\s*[/$"]/,    // redirect to file/var
          />\s*&/,        // fd redirect (>&2, >&3, etc.)
          /\|/,           // piped
          /\$\(/,         // command substitution
          /`/,            // backtick substitution
          />&2/,          // explicit stderr
          />&3/,          // explicit fd3
          /^echo\s+['"]?\{/,  // JSON object output (intentional hook response)
          /^echo\s+['"]\s*['"]\s*$/,  // echo "" (empty string)
          /^echo\s*$/,        // bare echo (newline only)
          /^printf\s+['"]?\{/, // printf JSON output
        ];

        const lines = content.split('\n');
        const unsafeLines = [];
        // Track function boundaries — echo inside a function is often captured by $(funcname)
        let inFunction = false;
        let functionBraceDepth = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          // Skip comments and blank lines
          if (!line || /^\s*#/.test(line)) continue;

          // Track function definitions: funcname() { or function funcname {
          if (/^\w+\s*\(\)\s*\{/.test(line) || /^function\s+\w+/.test(line)) {
            inFunction = true;
            functionBraceDepth = 1;
            continue;
          }
          if (inFunction) {
            // Count braces to track nesting
            for (const ch of line) {
              if (ch === '{') functionBraceDepth++;
              else if (ch === '}') functionBraceDepth--;
            }
            if (functionBraceDepth <= 0) {
              inFunction = false;
              functionBraceDepth = 0;
            }
            // Skip echo/printf inside function bodies — output is typically captured by callers
            continue;
          }

          // Only check lines with echo or printf
          if (!/\b(echo|printf)\b/.test(line)) continue;

          // Handle multiline echo: if line has unmatched quote, check closing line for redirect
          const quoteCount = (line.match(/"/g) || []).length;
          if (quoteCount % 2 !== 0) {
            // Unmatched quote — scan ahead for closing quote line
            let multilineSafe = false;
            for (let j = i + 1; j < lines.length; j++) {
              const closingLine = lines[j];
              const closingQuotes = (closingLine.match(/"/g) || []).length;
              if (closingQuotes % 2 !== 0) {
                // Found closing line — check if it has a redirect
                if (/>&2|>&3|>>|>\s*[/$"]/.test(closingLine)) {
                  multilineSafe = true;
                }
                i = j; // Skip past multiline string
                break;
              }
            }
            if (multilineSafe) continue;
          }

          // Check if any safe pattern matches
          const isSafe = SAFE_ECHO_PATTERNS.some(pat => pat.test(line));
          if (!isSafe) {
            unsafeLines.push({ lineNum: i + 1, line: line.substring(0, 120) });
          }
        }

        if (unsafeLines.length > 0) {
          result.verdict = 'SIDE_EFFECT_STDOUT';
          result.details = `Static: ${unsafeLines.length} line(s) may write to stdout: ${unsafeLines.map(l => `L${l.lineNum}`).join(', ')}`;
          result.recommendation = 'Redirect output to stderr (>&2) or to a file';
        } else {
          result.verdict = 'NOOP';
          result.details = 'Static: no bare stdout output detected';
        }
        return result;
      }

      if (role === 'context-injecting') {
        const hasSystemMessage = STATIC_CONTEXT_PATTERNS.systemMessage.test(content);
        const hasAdditionalContext = STATIC_CONTEXT_PATTERNS.additionalContext.test(content);
        const hasEmptyJson = STATIC_CONTEXT_PATTERNS.emptyJson.test(content);

        if (hasSystemMessage || hasAdditionalContext) {
          result.verdict = 'WILL_INJECT';
          const paths = [];
          if (hasSystemMessage) paths.push('systemMessage');
          if (hasAdditionalContext) paths.push('additionalContext');
          result.details = `Static: found context keys: ${paths.join(', ')}`;
          if (hasEmptyJson) {
            result.details += ' (also has empty JSON no-op path)';
          }
        } else if (hasEmptyJson) {
          result.verdict = 'NOOP';
          result.details = 'Static: only outputs empty JSON {}';
        } else {
          result.verdict = 'UNKNOWN';
          result.details = 'Static: could not determine context injection behavior';
        }
        return result;
      }

      if (role === 'decision-making') {
        const hasDecision = STATIC_CONTEXT_PATTERNS.permissionDecision.test(content);
        result.verdict = hasDecision ? 'WILL_INJECT' : 'UNKNOWN';
        result.details = hasDecision
          ? 'Static: found permissionDecision key'
          : 'Static: could not find permissionDecision pattern';
        return result;
      }
    } catch (e) {
      result.verdict = 'UNKNOWN';
      result.details = `Static analysis failed: ${e.message}`;
    }

    return result;
  }

  async checkContextInjection() {
    const stage = 10;
    const stageName = 'Context Injection Diagnostic';

    const counters = {
      total: 0,
      contextInjecting: 0,
      decisionMaking: 0,
      sideEffect: 0,
      confirmed: 0,
      noop: 0,
      contaminated: 0,
      sideEffectStdout: 0,
      invalid: 0,
      unknown: 0
    };

    const issues = [];

    for (const configEntry of this.hookConfigs) {
      const hooks = configEntry.config.hooks || {};

      for (const [eventType, hookArray] of Object.entries(hooks)) {
        const hooksList = Array.isArray(hookArray) ? hookArray : [hookArray];

        for (const hookDef of hooksList) {
          const hooksToCheck = hookDef.hooks || [hookDef];

          for (const hook of hooksToCheck) {
            counters.total++;
            const role = this._classifyHookRole(eventType);

            if (role === 'context-injecting') counters.contextInjecting++;
            else if (role === 'decision-making') counters.decisionMaking++;
            else if (role === 'side-effect') counters.sideEffect++;

            let analysis;

            if (hook._testOutput !== undefined) {
              // Use execution output from Stage 5
              analysis = this._analyzeOutputForContextInjection(
                hook._testOutput, eventType, hook.command
              );
            } else if (!this.quick) {
              // No execution data and not quick mode — skip
              continue;
            } else {
              // Quick mode: static analysis
              const scriptPath = this._extractScriptPath(hook.command, configEntry.path, configEntry.pluginRoot);
              if (scriptPath) {
                const fullPath = path.isAbsolute(scriptPath)
                  ? scriptPath
                  : path.join(configEntry.pluginRoot || this.projectRoot, scriptPath);
                if (fs.existsSync(fullPath)) {
                  analysis = this._staticAnalyzeHookScript(fullPath, eventType);
                } else {
                  continue; // Script not found — already reported in Stage 2
                }
              } else {
                continue; // Can't analyze inline hooks statically
              }
            }

            if (!analysis) continue;

            switch (analysis.verdict) {
              case 'WILL_INJECT':
                counters.confirmed++;
                break;
              case 'NOOP':
                counters.noop++;
                break;
              case 'CONTAMINATED':
                counters.contaminated++;
                issues.push({
                  hook: hook.command?.substring(0, 100),
                  eventType,
                  verdict: analysis.verdict,
                  details: analysis.details,
                  recommendation: analysis.recommendation
                });
                break;
              case 'SIDE_EFFECT_STDOUT':
                counters.sideEffectStdout++;
                issues.push({
                  hook: hook.command?.substring(0, 100),
                  eventType,
                  verdict: analysis.verdict,
                  details: analysis.details,
                  recommendation: analysis.recommendation
                });
                break;
              case 'INVALID':
                counters.invalid++;
                issues.push({
                  hook: hook.command?.substring(0, 100),
                  eventType,
                  verdict: analysis.verdict,
                  details: analysis.details,
                  recommendation: analysis.recommendation
                });
                break;
              default:
                counters.unknown++;
            }
          }
        }
      }
    }

    // Emit results
    const totalIssues = counters.contaminated + counters.sideEffectStdout + counters.invalid;

    if (totalIssues === 0) {
      this.results.push(new CheckResult(
        stage, stageName, HEALTH_STATUS.HEALTHY,
        `${counters.total} hooks analyzed: ${counters.confirmed} inject context, ${counters.noop} no-op, ${counters.sideEffect} side-effect`,
        { counters }
      ));
    } else {
      if (counters.contaminated > 0) {
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.DEGRADED,
          `${counters.contaminated} hook(s) have stdout contamination — JSON may not reach context`,
          { issues: issues.filter(i => i.verdict === 'CONTAMINATED'), counters }
        ));
      }
      if (counters.sideEffectStdout > 0) {
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.DEGRADED,
          `${counters.sideEffectStdout} side-effect hook(s) produce stdout — should be silent`,
          { issues: issues.filter(i => i.verdict === 'SIDE_EFFECT_STDOUT'), counters }
        ));
      }
      if (counters.invalid > 0) {
        this.results.push(new CheckResult(
          stage, stageName, HEALTH_STATUS.UNHEALTHY,
          `${counters.invalid} hook(s) produce invalid output — context injection will fail`,
          { issues: issues.filter(i => i.verdict === 'INVALID'), counters }
        ));
      }
    }

    if (this.verbose && issues.length > 0) {
      for (const issue of issues) {
        this.results.push(new CheckResult(
          stage, stageName,
          issue.verdict === 'INVALID' ? HEALTH_STATUS.UNHEALTHY : HEALTH_STATUS.DEGRADED,
          `[${issue.eventType}] ${issue.verdict}: ${issue.details}`,
          { hook: issue.hook, recommendation: issue.recommendation }
        ));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  generateSummary(durationMs) {
    const stage = 10;

    // Count by status
    const counts = {
      healthy: 0,
      degraded: 0,
      unhealthy: 0
    };

    for (const result of this.results) {
      if (result.status === HEALTH_STATUS.HEALTHY) counts.healthy++;
      else if (result.status === HEALTH_STATUS.DEGRADED) counts.degraded++;
      else if (result.status === HEALTH_STATUS.UNHEALTHY) counts.unhealthy++;
    }

    // Environment-constrained probes are informational warnings in constrained
    // runtimes; avoid penalizing score or overall status.
    const environmentConstrainedChecks = this.results.filter(
      result => result.status === HEALTH_STATUS.DEGRADED && result.details?.isEnvironmentConstraint
    ).length;
    const effectiveCounts = {
      healthy: counts.healthy + environmentConstrainedChecks,
      degraded: Math.max(0, counts.degraded - environmentConstrainedChecks),
      unhealthy: counts.unhealthy
    };

    // Calculate health score (0-100)
    const total = effectiveCounts.healthy + effectiveCounts.degraded + effectiveCounts.unhealthy;
    const score = total > 0
      ? Math.round((effectiveCounts.healthy * 100 + effectiveCounts.degraded * 50) / total)
      : 100;

    // Determine overall status
    let overallStatus = HEALTH_STATUS.HEALTHY;
    if (effectiveCounts.unhealthy > 0) {
      overallStatus = HEALTH_STATUS.UNHEALTHY;
    } else if (effectiveCounts.degraded > 0) {
      overallStatus = HEALTH_STATUS.DEGRADED;
    }

    // Generate recommendations
    const silentFailures = this.results.filter(r => r.details?.isSilentFailure);
    if (silentFailures.length > 0) {
      this.recommendations.push({
        severity: SEVERITY.HIGH,
        message: `Fix ${silentFailures.length} silent failure(s) - hooks that exit 0 but produce invalid output`,
        fix: 'Review hooks marked as silent failures and ensure they output valid JSON'
      });
    }

    const missingFiles = this.results.filter(r => r.message?.includes('not found'));
    if (missingFiles.length > 0) {
      this.recommendations.push({
        severity: SEVERITY.CRITICAL,
        message: `Create ${missingFiles.length} missing hook script(s)`,
        fix: missingFiles.map(r => r.fix).filter(Boolean).join('; ')
      });
    }

    const syntaxErrors = this.results.filter(r => r.message?.includes('Syntax error'));
    if (syntaxErrors.length > 0) {
      this.recommendations.push({
        severity: SEVERITY.CRITICAL,
        message: `Fix ${syntaxErrors.length} syntax error(s) in hook scripts`,
        fix: 'Run bash -n or node --check on flagged scripts'
      });
    }

    return {
      status: overallStatus,
      score,
      durationMs,
      timestamp: new Date().toISOString(),
      counts,
      effectiveCounts,
      environmentConstrainedChecks,
      results: this.results,
      recommendations: this.recommendations,
      hookConfigs: this.hookConfigs.length,
      pluginsScanned: this.pluginDirs.length,
      contextInjection: (() => {
        const results10 = this.results.filter(r => r.stage === 10);
        return {
          analyzed: results10.length > 0,
          issues: results10.filter(r => r.status !== HEALTH_STATUS.HEALTHY).length
        };
      })()
    };
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  _extractScriptPath(command, configPath = '', pluginRoot = null) {
    if (!command) return null;

    // Handle "bash -c '...'" patterns - skip these as inline scripts
    if (/bash\s+-c\s+/.test(command)) {
      return null;
    }

    // Handle "cat file" patterns
    if (/^cat\s+/.test(command)) {
      const match = command.match(/^cat\s+([^\s|]+)/);
      if (match) {
        return this._expandEnvVars(match[1], pluginRoot);
      }
    }

    // Handle "bash script.sh" or "node script.js"
    const match = command.match(/(?:bash|sh|node)\s+"?([^"\s]+\.(?:sh|js))"?/);
    if (match) {
      return this._expandEnvVars(match[1], pluginRoot);
    }

    // Handle "env VAR=val [VAR2=val2...] script.sh" pattern
    const envMatch = command.match(/^env\s+(?:\S+=\S+\s+)*([^\s]+\.(?:sh|js))/);
    if (envMatch) {
      return this._expandEnvVars(envMatch[1], pluginRoot);
    }

    // Handle direct script path
    if (command.endsWith('.sh') || command.endsWith('.js')) {
      const scriptPath = command.split(' ')[0];
      return this._expandEnvVars(scriptPath, pluginRoot);
    }

    return null;
  }

  _expandEnvVars(str, pluginRoot = null) {
    if (!str) return str;

    // Replace ${CLAUDE_PLUGIN_ROOT} with the plugin root or project root
    let result = str;

    // IMPORTANT: For validation, always prefer the explicit pluginRoot parameter
    // over the environment variable. This ensures we check the correct paths
    // for each plugin's hooks.json file.
    if (pluginRoot) {
      // Use the explicitly provided plugin root (e.g., plugins/opspal-hubspot)
      result = result.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot);
      result = result.replace(/\$CLAUDE_PLUGIN_ROOT/g, pluginRoot);
    } else if (process.env.CLAUDE_PLUGIN_ROOT) {
      // Fall back to environment variable
      result = result.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, process.env.CLAUDE_PLUGIN_ROOT);
      result = result.replace(/\$CLAUDE_PLUGIN_ROOT/g, process.env.CLAUDE_PLUGIN_ROOT);
    } else {
      // Default to project root
      result = result.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, this.projectRoot);
      result = result.replace(/\$CLAUDE_PLUGIN_ROOT/g, this.projectRoot);
    }

    // Handle other common env vars
    result = result.replace(/\$HOME/g, os.homedir());
    result = result.replace(/\$\{HOME\}/g, os.homedir());

    return result;
  }

  _getHookName(command, pluginRoot = null) {
    const scriptPath = this._extractScriptPath(command, '', pluginRoot);
    return scriptPath ? path.basename(scriptPath) : command?.slice(0, 50);
  }

  _collectAllScripts() {
    const scripts = new Set();

    for (const configEntry of this.hookConfigs) {
      const hooks = configEntry.config.hooks || {};

      for (const hookArray of Object.values(hooks)) {
        const hooksList = Array.isArray(hookArray) ? hookArray : [hookArray];

        for (const hookDef of hooksList) {
          const hooksToCheck = hookDef.hooks || [hookDef];

          for (const hook of hooksToCheck) {
            const command = hook.command;
            if (!command) continue;

            const scriptPath = this._extractScriptPath(command, configEntry.path, configEntry.pluginRoot);
            if (!scriptPath) continue;

            const fullPath = path.isAbsolute(scriptPath)
              ? scriptPath
              : path.join(configEntry.pluginRoot || this.projectRoot, scriptPath);

            if (fs.existsSync(fullPath)) {
              scripts.add(fullPath);
            }
          }
        }
      }
    }

    return [...scripts];
  }

  async _executeHook(command, input, timeout, options = {}) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const pluginRoot = options.pluginRoot || this.projectRoot;

      const proc = spawn('bash', ['-lc', command], {
        cwd: this.projectRoot,
        env: {
          ...process.env,
          CLAUDE_PLUGIN_ROOT: pluginRoot,
          HOOK_DIAGNOSTIC_MODE: '1'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Send input
      proc.stdin.write(JSON.stringify(input));
      proc.stdin.end();

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGKILL');
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code,
          stdout,
          stderr,
          timedOut,
          duration: Date.now() - startTime
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          exitCode: 1,
          stdout,
          stderr: err.message,
          timedOut: false,
          duration: Date.now() - startTime
        });
      });
    });
  }

  async _runCommand(command, args = [], options = {}) {
    const timeout = options.timeout || 5000;
    const cwd = options.cwd || this.projectRoot;
    const env = { ...process.env, ...(options.env || {}) };

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn(command, args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGKILL');
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code,
          stdout,
          stderr,
          timedOut,
          errorCode: null,
          errorMessage: ''
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          exitCode: 1,
          stdout,
          stderr,
          timedOut,
          errorCode: error.code || null,
          errorMessage: error.message || ''
        });
      });
    });
  }

  _extractErrorPattern(message) {
    if (!message) return 'UNKNOWN';
    if (/SOQL|query/i.test(message)) return 'SOQL_ERROR';
    if (/deploy/i.test(message)) return 'DEPLOYMENT_ERROR';
    if (/valid/i.test(message)) return 'VALIDATION_ERROR';
    if (/timeout/i.test(message)) return 'TIMEOUT_ERROR';
    if (/permission/i.test(message)) return 'PERMISSION_ERROR';
    if (/json|parse/i.test(message)) return 'PARSE_ERROR';
    return 'OTHER_ERROR';
  }

  // ---------------------------------------------------------------------------
  // Output Formatters
  // ---------------------------------------------------------------------------

  formatTerminal(summary) {
    const c = process.stdout.isTTY ? COLORS : { reset: '', bold: '', dim: '', red: '', green: '', yellow: '', blue: '', cyan: '', white: '' };
    const width = 68;
    let output = '';

    // Header
    output += '\n';
    output += `${BOX.doubleTL}${BOX.doubleH.repeat(width)}${BOX.doubleTR}\n`;
    output += `${BOX.doubleV}${' '.repeat(18)}HOOK SYSTEM HEALTH CHECK${' '.repeat(26)}${BOX.doubleV}\n`;
    output += `${BOX.doubleTeeR}${BOX.doubleH.repeat(width)}${BOX.doubleTeeL}\n`;

    // Status line
    const statusColor = summary.status === HEALTH_STATUS.HEALTHY ? c.green :
                        summary.status === HEALTH_STATUS.DEGRADED ? c.yellow : c.red;
    const statusText = `Status: ${statusColor}${summary.status}${c.reset}`;
    const scoreText = `Score: ${summary.score}/100`;
    const padding = width - 27;
    output += `${BOX.doubleV} ${statusText}${' '.repeat(padding)}${scoreText} ${BOX.doubleV}\n`;
    output += `${BOX.doubleBL}${BOX.doubleH.repeat(width)}${BOX.doubleBR}\n`;
    output += '\n';

    // Group results by stage
    const stages = {};
    for (const result of summary.results) {
      if (!stages[result.stage]) {
        stages[result.stage] = [];
      }
      stages[result.stage].push(result);
    }

    // Stage names
    const stageNames = {
      1: 'Configuration Discovery',
      2: 'File Permissions',
      3: 'Syntax Validation',
      4: 'Dependency Detection',
      5: 'Execution Test',
      6: 'Output Validation (Silent Failures)',
      7: 'Circuit Breaker State',
      8: 'Log Analysis',
      9: 'Cross-Reference Validation',
      10: 'Context Injection Diagnostic'
    };

    // Output each stage
    for (const [stageNum, results] of Object.entries(stages).sort((a, b) => a[0] - b[0])) {
      const stageName = stageNames[stageNum] || `Stage ${stageNum}`;
      const stageStatus = results.every(r => r.isHealthy()) ? '✓' :
                          results.some(r => r.status === HEALTH_STATUS.UNHEALTHY) ? '✗' : '⚠';
      const statusIcon = stageStatus === '✓' ? c.green + stageStatus + c.reset :
                         stageStatus === '✗' ? c.red + stageStatus + c.reset :
                         c.yellow + stageStatus + c.reset;

      output += `${BOX.topLeft}${BOX.horizontal.repeat(width)}${BOX.topRight}\n`;
      output += `${BOX.vertical} ${c.bold}Stage ${stageNum}: ${stageName}${c.reset}${' '.repeat(width - stageName.length - 14)}[${statusIcon}]  ${BOX.vertical}\n`;
      output += `${BOX.teeRight}${BOX.horizontal.repeat(width)}${BOX.teeLeft}\n`;

      for (const result of results) {
        const icon = result.isHealthy() ? c.green + '✓' + c.reset :
                     result.status === HEALTH_STATUS.DEGRADED ? c.yellow + '⚠' + c.reset :
                     c.red + '✗' + c.reset;

        // Truncate message if too long
        const maxMsgLen = width - 4;
        const msg = result.message.length > maxMsgLen
          ? result.message.slice(0, maxMsgLen - 3) + '...'
          : result.message;

        output += `${BOX.vertical} ${icon} ${msg}${' '.repeat(Math.max(0, width - msg.length - 4))}${BOX.vertical}\n`;

        // Show fix if available and not healthy
        if (result.fix && !result.isHealthy() && this.verbose) {
          const fixMsg = `  → Fix: ${result.fix}`;
          const truncFix = fixMsg.length > width - 2 ? fixMsg.slice(0, width - 5) + '...' : fixMsg;
          output += `${BOX.vertical} ${c.dim}${truncFix}${c.reset}${' '.repeat(Math.max(0, width - truncFix.length - 1))}${BOX.vertical}\n`;
        }
      }

      output += `${BOX.bottomLeft}${BOX.horizontal.repeat(width)}${BOX.bottomRight}\n`;
      output += '\n';
    }

    // Recommendations
    if (summary.recommendations.length > 0) {
      output += `${'═'.repeat(width + 2)}\n`;
      output += `${' '.repeat(25)}RECOMMENDATIONS\n`;
      output += `${'═'.repeat(width + 2)}\n\n`;

      for (let i = 0; i < summary.recommendations.length; i++) {
        const rec = summary.recommendations[i];
        const severityColor = rec.severity === SEVERITY.CRITICAL ? c.red :
                              rec.severity === SEVERITY.HIGH ? c.yellow :
                              c.cyan;
        output += `${i + 1}. [${severityColor}${rec.severity}${c.reset}] ${rec.message}\n`;
        if (rec.fix) {
          output += `   ${c.dim}Run: ${rec.fix}${c.reset}\n`;
        }
        output += '\n';
      }
    }

    // Footer
    if ((summary.environmentConstrainedChecks || 0) > 0) {
      output += `${c.dim}Environment-constrained checks (no score penalty): ${summary.environmentConstrainedChecks}${c.reset}\n`;
    }
    output += `${c.dim}Completed in ${summary.durationMs}ms | ${summary.hookConfigs} config(s) | ${summary.pluginsScanned} plugin(s)${c.reset}\n`;

    return output;
  }

  formatJson(summary) {
    return JSON.stringify(summary, null, 2);
  }

  formatMarkdown(summary) {
    let md = '# Hook System Health Check Report\n\n';
    md += `**Generated**: ${summary.timestamp}\n`;
    md += `**Status**: ${summary.status}\n`;
    md += `**Score**: ${summary.score}/100\n\n`;

    md += '## Summary\n\n';
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| Healthy Checks | ${summary.counts.healthy} |\n`;
    md += `| Degraded Checks | ${summary.counts.degraded} |\n`;
    md += `| Effective Degraded Checks | ${summary.effectiveCounts?.degraded ?? summary.counts.degraded} |\n`;
    md += `| Environment-constrained Checks | ${summary.environmentConstrainedChecks || 0} |\n`;
    md += `| Unhealthy Checks | ${summary.counts.unhealthy} |\n`;
    md += `| Hook Configs | ${summary.hookConfigs} |\n`;
    md += `| Plugins Scanned | ${summary.pluginsScanned} |\n`;
    md += `| Duration | ${summary.durationMs}ms |\n\n`;

    // Group by stage
    const stages = {};
    for (const result of summary.results) {
      if (!stages[result.stage]) {
        stages[result.stage] = [];
      }
      stages[result.stage].push(result);
    }

    const stageNames = {
      1: 'Configuration Discovery',
      2: 'File Permissions',
      3: 'Syntax Validation',
      4: 'Dependency Detection',
      5: 'Execution Test',
      6: 'Output Validation (Silent Failures)',
      7: 'Circuit Breaker State',
      8: 'Log Analysis',
      9: 'Cross-Reference Validation',
      10: 'Context Injection Diagnostic'
    };

    md += '## Detailed Results\n\n';

    for (const [stageNum, results] of Object.entries(stages).sort((a, b) => a[0] - b[0])) {
      const stageName = stageNames[stageNum] || `Stage ${stageNum}`;
      md += `### Stage ${stageNum}: ${stageName}\n\n`;

      for (const result of results) {
        const icon = result.isHealthy() ? '✅' :
                     result.status === HEALTH_STATUS.DEGRADED ? '⚠️' : '❌';
        md += `${icon} **${result.message}**\n`;

        if (!result.isHealthy() && result.fix) {
          md += `   - Fix: \`${result.fix}\`\n`;
        }

        if (result.details && Object.keys(result.details).length > 0 && !result.details.fix) {
          md += `   - Details: ${JSON.stringify(result.details)}\n`;
        }

        md += '\n';
      }
    }

    if (summary.recommendations.length > 0) {
      md += '## Recommendations\n\n';
      md += '| Priority | Issue | Fix |\n';
      md += '|----------|-------|-----|\n';

      for (const rec of summary.recommendations) {
        const fix = rec.fix ? `\`${rec.fix.slice(0, 60)}${rec.fix.length > 60 ? '...' : ''}\`` : '-';
        md += `| ${rec.severity} | ${rec.message} | ${fix} |\n`;
      }
    }

    return md;
  }
}

// =============================================================================
// CLI Interface
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const options = {
    projectRoot: process.cwd(),
    verbose: args.includes('--verbose') || args.includes('-v'),
    quick: args.includes('--quick') || args.includes('-q'),
    format: 'terminal',
    save: args.includes('--save'),
    watch: args.includes('--watch')
  };

  // Parse format
  const formatIdx = args.indexOf('--format');
  if (formatIdx !== -1 && args[formatIdx + 1]) {
    options.format = args[formatIdx + 1];
  }

  // Parse project root override
  const rootIdx = args.indexOf('--project-root');
  if (rootIdx !== -1 && args[rootIdx + 1]) {
    options.projectRoot = path.resolve(args[rootIdx + 1]);
  }

  // Help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Hook Health Checker - Comprehensive Hook System Diagnostics

Usage:
  node hook-health-checker.js [options]

Options:
  --quick, -q             Skip execution tests (faster)
  --verbose, -v           Include all details
  --format <type>         Output format: terminal, json, markdown
  --project-root <dir>    Override project root (default: cwd)
  --save                  Save report to file
  --watch [ms]            Real-time monitoring (default: 30000ms)
  --help, -h              Show this help

Examples:
  node hook-health-checker.js                    # Full diagnostic
  node hook-health-checker.js --quick            # Quick check
  node hook-health-checker.js --format json      # JSON output
  node hook-health-checker.js --format markdown --save
`);
    process.exit(0);
  }

  // Watch mode
  if (options.watch) {
    const interval = parseInt(args[args.indexOf('--watch') + 1]) || 30000;
    console.log(`Watching hook health every ${interval}ms. Press Ctrl+C to stop.\n`);

    const runCheck = async () => {
      process.stdout.write('\x1Bc'); // Clear screen
      const checker = new HookHealthChecker(options);
      const summary = await checker.runDiagnostics();
      console.log(checker.formatTerminal(summary));
      console.log(`\nNext check in ${interval / 1000}s...`);
    };

    await runCheck();
    setInterval(runCheck, interval);
    return;
  }

  // Single run
  const checker = new HookHealthChecker(options);
  const summary = await checker.runDiagnostics();

  // Format output
  let output;
  switch (options.format) {
    case 'json':
      output = checker.formatJson(summary);
      break;
    case 'markdown':
      output = checker.formatMarkdown(summary);
      break;
    default:
      output = checker.formatTerminal(summary);
  }

  console.log(output);

  // Save if requested
  if (options.save) {
    const reportsDir = path.join(os.homedir(), '.claude', 'reports', 'hooks');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const ext = options.format === 'json' ? 'json' : options.format === 'markdown' ? 'md' : 'txt';
    const filename = `hook-health-${new Date().toISOString().split('T')[0]}.${ext}`;
    const filepath = path.join(reportsDir, filename);
    fs.writeFileSync(filepath, output);
    console.log(`\n✅ Report saved to: ${filepath}`);
  }

  // Exit code based on status
  if (summary.status === HEALTH_STATUS.UNHEALTHY) {
    process.exit(2);
  } else if (summary.status === HEALTH_STATUS.DEGRADED) {
    process.exit(1);
  }
  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(2);
  });
}

module.exports = { HookHealthChecker, HEALTH_STATUS, SEVERITY };
