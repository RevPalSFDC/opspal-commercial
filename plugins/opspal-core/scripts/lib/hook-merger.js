#!/usr/bin/env node

/**
 * Hook Merger
 *
 * Discovers all plugin hooks.json files and merges them into .claude/settings.json
 *
 * Problem: Plugin hooks defined in plugins/<name>/.claude-plugin/hooks.json are not
 * automatically registered by Claude Code. Only hooks in .claude/settings.json run.
 *
 * Solution: This script:
 * 1. Discovers all installed plugins with hooks.json
 * 2. Reads and validates each hooks.json
 * 3. Resolves CLAUDE_PLUGIN_ROOT variable to absolute plugin paths
 * 4. Merges into .claude/settings.json preserving existing hooks
 * 5. Handles conflicts by preferring plugin-specific matchers
 *
 * Usage:
 *   node hook-merger.js --dry-run     Preview what would be merged
 *   node hook-merger.js --write       Merge and write to settings.json
 *   node hook-merger.js --verbose     Show detailed output
 *
 * @version 1.0.0
 * @date 2026-02-04
 */

const fs = require('fs');
const path = require('path');

// ANSI colors
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
  info: `${colors.blue}ℹ️${colors.reset}`,
  merge: `${colors.cyan}🔄${colors.reset}`
};

const CROSS_PLUGIN_REFERENCE_PATTERN = /\$\{CLAUDE_PLUGIN_ROOT\}[\\/]\.\.[\\/]/;

// Configuration
const CONFIG = {
  // Path to plugins directory (relative to this script)
  pluginsDir: path.resolve(__dirname, '../../../'),

  // Path to project settings
  projectSettingsPath: path.resolve(__dirname, '../../../../.claude/settings.json'),

  // Glob pattern for plugin hooks
  hooksGlob: 'plugins/*/.claude-plugin/hooks.json',

  // Backup suffix
  backupSuffix: '.backup'
};

/**
 * Hook Merger Class
 */
class HookMerger {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.write = options.write || false;

    this.stats = {
      pluginsScanned: 0,
      pluginsWithHooks: 0,
      hooksDiscovered: 0,
      hooksMerged: 0,
      hooksSkipped: 0,
      hooksRejected: 0,
      errors: []
    };
  }

  /**
   * Main execution
   */
  async run() {
    console.log(`\n${colors.bold}Hook Merger${colors.reset}`);
    console.log('='.repeat(50));

    // 1. Discover plugin hooks
    const pluginHooks = this.discoverPluginHooks();

    // 2. Load existing settings
    const settings = this.loadProjectSettings();
    if (!settings) {
      console.log(`${icons.fail} Could not load project settings`);
      return 1;
    }

    // 3. Merge hooks
    const mergedSettings = this.mergeHooks(settings, pluginHooks);

    // 4. Write or preview
    if (this.write && !this.dryRun) {
      this.writeSettings(mergedSettings);
    } else {
      this.previewMerge(settings, mergedSettings);
    }

    // 5. Report
    this.printReport();

    return this.stats.errors.length > 0 ? 1 : 0;
  }

  /**
   * Discover all plugin hooks.json files
   */
  discoverPluginHooks() {
    const pluginHooks = [];
    const pluginsDir = CONFIG.pluginsDir;

    if (this.verbose) {
      console.log(`\n${colors.blue}## Discovering Plugin Hooks${colors.reset}`);
      console.log(`  Scanning: ${pluginsDir}`);
    }

    // Find all plugin directories
    const entries = fs.readdirSync(pluginsDir);

    for (const entry of entries) {
      const pluginPath = path.join(pluginsDir, entry);
      const hooksPath = path.join(pluginPath, '.claude-plugin', 'hooks.json');

      // Check if it's a plugin directory
      const pluginJsonPath = path.join(pluginPath, '.claude-plugin', 'plugin.json');
      if (!fs.existsSync(pluginJsonPath)) continue;

      this.stats.pluginsScanned++;

      // Check for hooks.json
      if (!fs.existsSync(hooksPath)) {
        if (this.verbose) {
          console.log(`  ${icons.info} ${entry}: no hooks.json`);
        }
        continue;
      }

      // Load and validate hooks.json
      try {
        const hooksContent = fs.readFileSync(hooksPath, 'utf8');
        const hooksConfig = JSON.parse(hooksContent);

        if (!hooksConfig.hooks || typeof hooksConfig.hooks !== 'object') {
          if (this.verbose) {
            console.log(`  ${icons.warn} ${entry}: hooks.json has no 'hooks' object`);
          }
          continue;
        }

        // Count hooks in this plugin
        let hookCount = 0;
        for (const eventType in hooksConfig.hooks) {
          const eventHooks = hooksConfig.hooks[eventType];
          if (Array.isArray(eventHooks)) {
            for (const hookGroup of eventHooks) {
              if (hookGroup.hooks && Array.isArray(hookGroup.hooks)) {
                hookCount += hookGroup.hooks.length;
              }
            }
          }
        }

        this.stats.pluginsWithHooks++;
        this.stats.hooksDiscovered += hookCount;

        pluginHooks.push({
          name: entry,
          path: pluginPath,
          hooksPath: hooksPath,
          hooks: hooksConfig.hooks,
          hookCount: hookCount
        });

        if (this.verbose) {
          console.log(`  ${icons.pass} ${entry}: ${hookCount} hooks`);
        }

      } catch (error) {
        this.stats.errors.push({
          plugin: entry,
          error: `Failed to parse hooks.json: ${error.message}`
        });
        if (this.verbose) {
          console.log(`  ${icons.fail} ${entry}: ${error.message}`);
        }
      }
    }

    return pluginHooks;
  }

  /**
   * Load project settings.json
   */
  loadProjectSettings() {
    const settingsPath = CONFIG.projectSettingsPath;

    if (this.verbose) {
      console.log(`\n${colors.blue}## Loading Project Settings${colors.reset}`);
      console.log(`  Path: ${settingsPath}`);
    }

    if (!fs.existsSync(settingsPath)) {
      // Create minimal settings
      return {
        hooks: {}
      };
    }

    try {
      const content = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(content);

      // Ensure hooks object exists
      if (!settings.hooks) {
        settings.hooks = {};
      }

      // Count existing hooks
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

      if (this.verbose) {
        console.log(`  ${icons.pass} Loaded: ${existingCount} existing hooks`);
      }

      return settings;

    } catch (error) {
      this.stats.errors.push({
        plugin: 'project-settings',
        error: `Failed to parse settings.json: ${error.message}`
      });
      return null;
    }
  }

  /**
   * Resolve ${CLAUDE_PLUGIN_ROOT} in hook command
   */
  resolveHookPath(command, pluginRoot) {
    const absPluginRoot = path.resolve(pluginRoot);
    const resolvedCommand = command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, absPluginRoot);
    const scriptPath = this.extractScriptPath(resolvedCommand);

    if (!scriptPath || !path.isAbsolute(scriptPath)) {
      return resolvedCommand;
    }

    const canonicalScriptPath = path.resolve(scriptPath);
    return resolvedCommand.replace(scriptPath, canonicalScriptPath);
  }

  /**
   * Enforce plugin path isolation in hooks.json declarations.
   */
  hasCrossPluginReference(command) {
    if (typeof command !== 'string') return false;
    return CROSS_PLUGIN_REFERENCE_PATTERN.test(command);
  }

  /**
   * Generate a unique key for a hook (for deduplication)
   */
  getHookKey(hook, matcher, eventType = '*') {
    const command = typeof hook.command === 'string' ? hook.command.trim() : '';
    const scriptPath = this.extractScriptPath(command);

    if (scriptPath && path.isAbsolute(scriptPath)) {
      return `${eventType}:${matcher}:script:${path.resolve(scriptPath)}`;
    }

    return `${eventType}:${matcher}:command:${command}`;
  }

  /**
   * Merge plugin hooks into settings
   */
  mergeHooks(settings, pluginHooks) {
    if (this.verbose) {
      console.log(`\n${colors.blue}## Merging Hooks${colors.reset}`);
    }

    // Clone settings to avoid mutation
    const merged = JSON.parse(JSON.stringify(settings));

    // Track existing hooks for deduplication
    const existingKeys = new Set();

    // Build set of existing hook keys
    for (const eventType in merged.hooks) {
      const eventHooks = merged.hooks[eventType];
      if (Array.isArray(eventHooks)) {
        for (const hookGroup of eventHooks) {
          const matcher = hookGroup.matcher || '*';
          if (hookGroup.hooks && Array.isArray(hookGroup.hooks)) {
            for (const hook of hookGroup.hooks) {
              const key = this.getHookKey(hook, matcher, eventType);
              existingKeys.add(key);
            }
          }
        }
      }
    }

    // Process each plugin
    for (const plugin of pluginHooks) {
      if (this.verbose) {
        console.log(`\n  ${colors.cyan}${plugin.name}${colors.reset}`);
      }

      for (const eventType in plugin.hooks) {
        const eventHooks = plugin.hooks[eventType];

        // Ensure event type exists in merged
        if (!merged.hooks[eventType]) {
          merged.hooks[eventType] = [];
        }

        if (!Array.isArray(eventHooks)) continue;

        for (const hookGroup of eventHooks) {
          const matcher = hookGroup.matcher || '*';

          if (!hookGroup.hooks || !Array.isArray(hookGroup.hooks)) continue;

          for (const hook of hookGroup.hooks) {
            if (this.hasCrossPluginReference(hook.command)) {
              this.stats.hooksRejected++;
              this.stats.errors.push({
                plugin: plugin.name,
                error: `Rejected cross-plugin hook command in ${eventType}/${matcher}: ${hook.command}`
              });
              if (this.verbose) {
                console.log(`    ${icons.fail} ${eventType}/${matcher}: cross-plugin path reference rejected`);
              }
              continue;
            }

            // Resolve plugin root path
            const resolvedHook = {
              ...hook,
              command: this.resolveHookPath(hook.command, plugin.path)
            };

            // Check for duplicate
            const key = this.getHookKey(resolvedHook, matcher, eventType);
            if (existingKeys.has(key)) {
              this.stats.hooksSkipped++;
              if (this.verbose) {
                console.log(`    ${icons.info} ${eventType}/${matcher}: duplicate, skipped`);
              }
              continue;
            }

            // Validate hook script exists
            const scriptPath = this.extractScriptPath(resolvedHook.command);
            if (scriptPath && !fs.existsSync(scriptPath)) {
              this.stats.errors.push({
                plugin: plugin.name,
                error: `Hook script not found: ${scriptPath}`
              });
              if (this.verbose) {
                console.log(`    ${icons.warn} ${eventType}/${matcher}: script not found`);
              }
              continue;
            }

            // Find or create hook group with this matcher
            let targetGroup = merged.hooks[eventType].find(g => g.matcher === matcher);
            if (!targetGroup) {
              targetGroup = { matcher, hooks: [] };
              merged.hooks[eventType].push(targetGroup);
            }

            // Add hook
            targetGroup.hooks.push(resolvedHook);
            existingKeys.add(key);
            this.stats.hooksMerged++;

            if (this.verbose) {
              const hookName = path.basename(scriptPath || hook.command);
              console.log(`    ${icons.merge} ${eventType}/${matcher}: ${hookName}`);
            }
          }
        }
      }
    }

    // Sort hook groups: specific matchers before wildcard
    for (const eventType in merged.hooks) {
      merged.hooks[eventType].sort((a, b) => {
        if (a.matcher === '*' && b.matcher !== '*') return 1;
        if (a.matcher !== '*' && b.matcher === '*') return -1;
        return 0;
      });
    }

    return merged;
  }

  /**
   * Extract script path from command
   */
  extractScriptPath(command) {
    // Handle bash -c 'script'
    const bashMatch = command.match(/bash\s+(?:-c\s+)?["']?([^"'\s;]+\.sh)/);
    if (bashMatch) return bashMatch[1];

    // Handle node script
    const nodeMatch = command.match(/node\s+["']?([^"'\s;]+\.js)/);
    if (nodeMatch) return nodeMatch[1];

    // Handle direct script path
    if (command.endsWith('.sh') || command.endsWith('.js')) {
      return command.split(' ')[0];
    }

    // Handle complex bash -c commands
    const complexMatch = command.match(/["']([^"']+\.sh)['"]/);
    if (complexMatch) return complexMatch[1];

    return null;
  }

  /**
   * Preview merge without writing
   */
  previewMerge(before, after) {
    console.log(`\n${colors.blue}## Preview (Dry Run)${colors.reset}`);

    // Count hooks before and after
    const countHooks = (settings) => {
      let count = 0;
      for (const eventType in settings.hooks) {
        const eventHooks = settings.hooks[eventType];
        if (Array.isArray(eventHooks)) {
          for (const hookGroup of eventHooks) {
            if (hookGroup.hooks && Array.isArray(hookGroup.hooks)) {
              count += hookGroup.hooks.length;
            }
          }
        }
      }
      return count;
    };

    const beforeCount = countHooks(before);
    const afterCount = countHooks(after);

    console.log(`\n  Hooks before: ${beforeCount}`);
    console.log(`  Hooks after:  ${afterCount}`);
    console.log(`  Net change:   +${afterCount - beforeCount}`);

    if (!this.write) {
      console.log(`\n  ${colors.yellow}Run with --write to apply changes${colors.reset}`);
    }
  }

  /**
   * Write merged settings to file
   */
  writeSettings(settings) {
    const settingsPath = CONFIG.projectSettingsPath;

    console.log(`\n${colors.blue}## Writing Settings${colors.reset}`);

    // Create backup
    if (fs.existsSync(settingsPath)) {
      const backupPath = settingsPath + CONFIG.backupSuffix;
      fs.copyFileSync(settingsPath, backupPath);
      console.log(`  ${icons.pass} Backup created: ${path.basename(backupPath)}`);
    }

    // Write settings
    try {
      const content = JSON.stringify(settings, null, 2);
      fs.writeFileSync(settingsPath, content, 'utf8');
      console.log(`  ${icons.pass} Written: ${settingsPath}`);
    } catch (error) {
      this.stats.errors.push({
        plugin: 'output',
        error: `Failed to write settings: ${error.message}`
      });
      console.log(`  ${icons.fail} Failed: ${error.message}`);
    }
  }

  /**
   * Print summary report
   */
  printReport() {
    console.log('\n' + '='.repeat(50));
    console.log(`${colors.bold}Summary${colors.reset}`);
    console.log('='.repeat(50));

    console.log(`\n  Plugins scanned:     ${this.stats.pluginsScanned}`);
    console.log(`  Plugins with hooks:  ${this.stats.pluginsWithHooks}`);
    console.log(`  Hooks discovered:    ${this.stats.hooksDiscovered}`);
    console.log(`  Hooks merged:        ${this.stats.hooksMerged}`);
    console.log(`  Hooks skipped:       ${this.stats.hooksSkipped} (duplicates)`);
    console.log(`  Hooks rejected:      ${this.stats.hooksRejected} (policy violations)`);

    if (this.stats.errors.length > 0) {
      console.log(`\n${colors.red}Errors (${this.stats.errors.length}):${colors.reset}`);
      for (const error of this.stats.errors) {
        console.log(`  - ${error.plugin}: ${error.error}`);
      }
    }

    // Overall status
    const status = this.stats.errors.length === 0 ?
      `${icons.pass} Complete` :
      `${icons.warn} Complete with ${this.stats.errors.length} errors`;

    console.log(`\n${status}`);
    console.log('');
  }
}

// CLI Interface
function parseArgs(args) {
  const options = {
    dryRun: false,
    write: false,
    verbose: false,
    help: false
  };

  for (const arg of args) {
    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--write':
        options.write = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Hook Merger - Merge plugin hooks into project settings

Usage:
  node hook-merger.js [options]

Options:
  --dry-run      Preview changes without writing
  --write        Merge and write to settings.json
  --verbose, -v  Show detailed output
  --help, -h     Show this help message

Examples:
  # Preview what would be merged
  node hook-merger.js --dry-run --verbose

  # Merge and write to settings.json
  node hook-merger.js --write --verbose

  # Quick merge (minimal output)
  node hook-merger.js --write
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

  // Default to dry-run if neither specified
  if (!options.write && !options.dryRun) {
    options.dryRun = true;
  }

  const merger = new HookMerger(options);
  const exitCode = await merger.run();
  process.exit(exitCode);
}

// Export for use as module
module.exports = { HookMerger };

// Run if called directly
if (require.main === module) {
  main();
}
