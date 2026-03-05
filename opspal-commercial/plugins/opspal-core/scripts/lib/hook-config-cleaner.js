#!/usr/bin/env node

/**
 * Hook Configuration Cleaner
 *
 * Cleans up hooks.json files by removing references to non-existent hook scripts.
 *
 * Usage:
 *   node hook-config-cleaner.js                   # Audit mode (dry-run)
 *   node hook-config-cleaner.js --fix             # Actually remove dead references
 *   node hook-config-cleaner.js --verbose         # Show all details
 *   node hook-config-cleaner.js --plugin <name>   # Target specific plugin
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// Configuration
// =============================================================================

const HOOK_TYPES = [
  'UserPromptSubmit',
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'PreCommit',
  'PostCommit',
  'PreCompact',
  'Stop'
];

// =============================================================================
// Utilities
// =============================================================================

function log(msg, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[type] || colors.info}${msg}${colors.reset}`);
}

function expandEnvVars(str, pluginRoot = null) {
  if (!str) return str;
  let result = str;

  // Expand ${CLAUDE_PLUGIN_ROOT}
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    result = result.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, process.env.CLAUDE_PLUGIN_ROOT);
  } else if (pluginRoot) {
    result = result.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot);
  }

  // Expand other env vars
  result = result.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (match, name) => {
    return process.env[name] || match;
  });

  return result;
}

function extractScriptPath(command, pluginRoot = null) {
  if (!command) return null;

  // Handle "bash -c '...'" patterns - these are inline scripts, not file references
  if (/bash\s+-c\s+/.test(command)) {
    return null;
  }

  // Expand environment variables
  const expanded = expandEnvVars(command, pluginRoot);

  // Extract the executable path
  // Handle: node /path/script.js, bash /path/script.sh, /path/script.sh
  const parts = expanded.split(/\s+/);

  for (const part of parts) {
    // Skip interpreters and common flags
    if (['node', 'bash', 'sh', 'python', 'python3'].includes(part)) continue;
    if (part.startsWith('-')) continue;
    if (part.startsWith('$')) continue;  // Unexpanded variable

    // Check if this looks like a file path
    if (part.includes('/') || part.endsWith('.js') || part.endsWith('.sh')) {
      // Remove quotes if present
      return part.replace(/^['"]|['"]$/g, '');
    }
  }

  return null;
}

function scriptExists(scriptPath, projectRoot) {
  if (!scriptPath) return true;  // Can't validate, assume it exists

  // Handle absolute paths
  if (path.isAbsolute(scriptPath)) {
    return fs.existsSync(scriptPath);
  }

  // Handle relative paths
  const fullPath = path.join(projectRoot, scriptPath);
  return fs.existsSync(fullPath);
}

// =============================================================================
// Hook Config Discovery
// =============================================================================

function discoverHookConfigs(projectRoot) {
  const configs = [];

  // Project-level hooks.json
  const projectHooksPath = path.join(projectRoot, '.claude', 'hooks', 'hooks.json');
  if (fs.existsSync(projectHooksPath)) {
    try {
      const content = JSON.parse(fs.readFileSync(projectHooksPath, 'utf8'));
      configs.push({
        source: 'project',
        path: projectHooksPath,
        pluginRoot: projectRoot,
        config: content,
        isProjectLevel: true
      });
    } catch (e) {
      log(`Error parsing ${projectHooksPath}: ${e.message}`, 'error');
    }
  }

  // Plugin-level hooks.json files
  const pluginDirs = [
    path.join(projectRoot, '.claude-plugins'),
    path.join(projectRoot, 'plugins')
  ];

  for (const pluginsDir of pluginDirs) {
    if (!fs.existsSync(pluginsDir)) continue;

    const plugins = fs.readdirSync(pluginsDir);
    for (const plugin of plugins) {
      const pluginPath = path.join(pluginsDir, plugin);
      if (!fs.statSync(pluginPath).isDirectory()) continue;

      // Check both .claude-plugin/hooks.json and hooks.json
      const hooksPaths = [
        path.join(pluginPath, '.claude-plugin', 'hooks.json'),
        path.join(pluginPath, 'hooks.json')
      ];

      for (const hooksPath of hooksPaths) {
        if (fs.existsSync(hooksPath)) {
          try {
            const content = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
            configs.push({
              source: `plugin:${plugin}`,
              path: hooksPath,
              pluginRoot: pluginPath,
              config: content,
              isProjectLevel: false,
              pluginName: plugin
            });
          } catch (e) {
            log(`Error parsing ${hooksPath}: ${e.message}`, 'error');
          }
          break;  // Found hooks.json for this plugin
        }
      }
    }
  }

  return configs;
}

// =============================================================================
// Audit and Clean
// =============================================================================

function auditHookConfig(hookConfig, options = {}) {
  const issues = [];
  const { config, pluginRoot, path: configPath, source } = hookConfig;

  for (const hookType of HOOK_TYPES) {
    if (!config.hooks || !config.hooks[hookType]) continue;

    const hooks = config.hooks[hookType];
    if (!Array.isArray(hooks)) continue;

    for (let i = 0; i < hooks.length; i++) {
      const hook = hooks[i];
      const command = hook.command;

      if (!command) continue;

      const scriptPath = extractScriptPath(command, pluginRoot);

      if (scriptPath && !scriptExists(scriptPath, pluginRoot)) {
        issues.push({
          hookType,
          index: i,
          command,
          scriptPath,
          reason: 'Script file not found'
        });
      }
    }
  }

  return {
    source,
    path: configPath,
    pluginRoot,
    totalHooks: Object.values(config.hooks || {}).flat().length,
    issues
  };
}

function cleanHookConfig(hookConfig, issues, options = {}) {
  const { config, path: configPath } = hookConfig;
  const { dryRun = true, verbose = false } = options;

  // Group issues by hook type for efficient removal
  const issuesByType = {};
  for (const issue of issues) {
    if (!issuesByType[issue.hookType]) {
      issuesByType[issue.hookType] = new Set();
    }
    issuesByType[issue.hookType].add(issue.index);
  }

  // Create cleaned config
  const cleanedConfig = JSON.parse(JSON.stringify(config));
  let removedCount = 0;

  for (const [hookType, indices] of Object.entries(issuesByType)) {
    if (!cleanedConfig.hooks || !cleanedConfig.hooks[hookType]) continue;

    // Filter out hooks with issues (working backwards to preserve indices)
    const originalHooks = cleanedConfig.hooks[hookType];
    cleanedConfig.hooks[hookType] = originalHooks.filter((_, idx) => !indices.has(idx));
    removedCount += indices.size;

    // Remove empty arrays
    if (cleanedConfig.hooks[hookType].length === 0) {
      delete cleanedConfig.hooks[hookType];
    }
  }

  // Remove empty hooks object
  if (cleanedConfig.hooks && Object.keys(cleanedConfig.hooks).length === 0) {
    delete cleanedConfig.hooks;
  }

  if (!dryRun && removedCount > 0) {
    // Create backup
    const backupPath = configPath + '.backup-' + Date.now();
    fs.copyFileSync(configPath, backupPath);
    if (verbose) {
      log(`Created backup: ${backupPath}`, 'info');
    }

    // Write cleaned config
    fs.writeFileSync(configPath, JSON.stringify(cleanedConfig, null, 2) + '\n');
  }

  return {
    removedCount,
    cleanedConfig,
    wouldRemove: dryRun ? removedCount : 0
  };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const options = {
    fix: args.includes('--fix'),
    verbose: args.includes('--verbose'),
    dryRun: !args.includes('--fix'),
    targetPlugin: null
  };

  // Parse --plugin flag
  const pluginIdx = args.indexOf('--plugin');
  if (pluginIdx !== -1 && args[pluginIdx + 1]) {
    options.targetPlugin = args[pluginIdx + 1];
  }

  const projectRoot = process.cwd();

  console.log('');
  log('╔══════════════════════════════════════════════════════════════════╗', 'info');
  log('║                   HOOK CONFIGURATION CLEANER                     ║', 'info');
  log('╚══════════════════════════════════════════════════════════════════╝', 'info');
  console.log('');

  if (options.dryRun) {
    log('Running in AUDIT MODE (dry-run). Use --fix to actually clean configs.', 'warn');
  } else {
    log('Running in FIX MODE. Configs will be modified (backups created).', 'warn');
  }
  console.log('');

  // Discover hook configs
  let configs = discoverHookConfigs(projectRoot);

  if (options.targetPlugin) {
    configs = configs.filter(c =>
      c.pluginName === options.targetPlugin ||
      c.source === `plugin:${options.targetPlugin}`
    );
    if (configs.length === 0) {
      log(`No configs found for plugin: ${options.targetPlugin}`, 'error');
      process.exit(1);
    }
  }

  log(`Found ${configs.length} hook configuration file(s)`, 'info');
  console.log('');

  // Audit each config
  const allResults = [];
  let totalIssues = 0;
  let totalRemoved = 0;

  for (const hookConfig of configs) {
    const audit = auditHookConfig(hookConfig, options);

    if (audit.issues.length > 0) {
      log(`┌─────────────────────────────────────────────────────────────────┐`, 'warn');
      log(`│ ${audit.source.padEnd(63)} │`, 'warn');
      log(`├─────────────────────────────────────────────────────────────────┤`, 'warn');
      log(`│ Path: ${audit.path.slice(-56).padEnd(56)} │`, 'warn');
      log(`│ Total hooks: ${String(audit.totalHooks).padEnd(49)} │`, 'warn');
      log(`│ Issues found: ${String(audit.issues.length).padEnd(48)} │`, 'warn');
      log(`└─────────────────────────────────────────────────────────────────┘`, 'warn');

      if (options.verbose) {
        for (const issue of audit.issues) {
          log(`  ⚠ ${issue.hookType}[${issue.index}]: ${issue.reason}`, 'warn');
          log(`    Command: ${issue.command.slice(0, 60)}...`, 'info');
          if (issue.scriptPath) {
            log(`    Missing: ${issue.scriptPath}`, 'error');
          }
        }
      }

      // Clean if --fix
      if (options.fix) {
        const cleanResult = cleanHookConfig(hookConfig, audit.issues, { dryRun: false, verbose: options.verbose });
        log(`  ✓ Removed ${cleanResult.removedCount} dead reference(s)`, 'success');
        totalRemoved += cleanResult.removedCount;
      }

      totalIssues += audit.issues.length;
      console.log('');
    } else if (options.verbose) {
      log(`✓ ${audit.source}: ${audit.totalHooks} hooks, no issues`, 'success');
    }

    allResults.push(audit);
  }

  // Summary
  console.log('');
  log('═══════════════════════════════════════════════════════════════════', 'info');
  log('                           SUMMARY', 'info');
  log('═══════════════════════════════════════════════════════════════════', 'info');
  console.log('');

  const configsWithIssues = allResults.filter(r => r.issues.length > 0).length;

  if (totalIssues === 0) {
    log('✓ All hook configurations are clean! No dead references found.', 'success');
  } else {
    log(`Configs scanned: ${configs.length}`, 'info');
    log(`Configs with issues: ${configsWithIssues}`, 'warn');
    log(`Total dead references: ${totalIssues}`, 'warn');

    if (options.fix) {
      log(`References removed: ${totalRemoved}`, 'success');
      log('', 'info');
      log('Backup files created with .backup-<timestamp> extension.', 'info');
    } else {
      log('', 'info');
      log('Run with --fix to remove dead references:', 'info');
      log(`  node ${path.basename(__filename)} --fix`, 'info');
    }
  }

  console.log('');

  // Exit code
  process.exit(totalIssues > 0 && !options.fix ? 1 : 0);
}

main().catch(err => {
  log(`Fatal error: ${err.message}`, 'error');
  process.exit(2);
});
