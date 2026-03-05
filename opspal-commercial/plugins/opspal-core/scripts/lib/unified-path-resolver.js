#!/usr/bin/env node

/**
 * Unified Path Resolver
 *
 * Wrapper around plugin-path-resolver.js that provides:
 * - Shell-exportable environment variables
 * - Component path resolution (scripts, agents, hooks, commands)
 * - Path validation with expected contents
 * - CLI interface for shell integration
 *
 * Used by hooks and shell scripts to consistently resolve plugin paths
 * regardless of installation method (marketplace vs dev vs symlink).
 *
 * @module unified-path-resolver
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');

// Import the base resolver
const {
  resolvePluginRoot,
  resolvePluginScript,
  normalizePluginName,
  isPluginAvailable,
  listAvailablePlugins,
  clearCache,
  PLUGIN_ALIASES
} = require('./plugin-path-resolver');

/**
 * Component types and their expected directory names
 */
const COMPONENT_TYPES = {
  scripts: 'scripts',
  agents: 'agents',
  hooks: 'hooks',
  commands: 'commands',
  skills: 'skills',
  config: 'config',
  templates: 'templates',
  docs: 'docs'
};

/**
 * Unified Path Resolver class
 */
class UnifiedPathResolver {
  /**
   * Resolve plugin root directory
   *
   * @param {string} pluginName - Plugin name or alias
   * @param {Object} [options] - Options passed to base resolver
   * @returns {string|null} Absolute path to plugin root or null
   */
  static resolvePluginPath(pluginName, options = {}) {
    return resolvePluginRoot(pluginName, options);
  }

  /**
   * Resolve a component path within a plugin
   *
   * @param {string} pluginName - Plugin name or alias
   * @param {string} componentType - Type of component (scripts, agents, hooks, etc.)
   * @param {string} [componentName] - Specific component name/path
   * @returns {string|null} Absolute path or null if not found
   */
  static resolveComponentPath(pluginName, componentType, componentName = '') {
    const pluginRoot = resolvePluginRoot(pluginName);
    if (!pluginRoot) {
      return null;
    }

    const componentDir = COMPONENT_TYPES[componentType] || componentType;
    const componentPath = componentName
      ? path.join(pluginRoot, componentDir, componentName)
      : path.join(pluginRoot, componentDir);

    return fs.existsSync(componentPath) ? componentPath : null;
  }

  /**
   * Generate shell export commands for all installed plugins
   *
   * @returns {string} Shell export commands
   */
  static generateShellExports() {
    const plugins = listAvailablePlugins();
    const exports = [];

    // Global plugin root (workspace)
    const workspaceRoot = process.cwd();
    exports.push(`export CLAUDE_WORKSPACE_ROOT="${workspaceRoot}"`);

    // Export each plugin root
    plugins.forEach(plugin => {
      const envVarName = plugin.name.toUpperCase().replace(/-/g, '_') + '_ROOT';
      exports.push(`export ${envVarName}="${plugin.path}"`);
    });

    // Export helper function
    exports.push(`
# Helper function to resolve plugin paths
resolve_plugin_path() {
  local plugin_name="\$1"
  local component_type="\$2"
  local component_name="\$3"

  local env_var="$(echo "\$plugin_name" | tr '[:lower:]-' '[:upper:]_')_ROOT"
  local plugin_root="\${!env_var}"

  if [ -z "\$plugin_root" ]; then
    echo "Error: Plugin \$plugin_name not found" >&2
    return 1
  fi

  if [ -n "\$component_type" ] && [ -n "\$component_name" ]; then
    echo "\$plugin_root/\$component_type/\$component_name"
  elif [ -n "\$component_type" ]; then
    echo "\$plugin_root/\$component_type"
  else
    echo "\$plugin_root"
  fi
}`);

    return exports.join('\n');
  }

  /**
   * Validate a path exists and optionally contains expected contents
   *
   * @param {string} pathToValidate - Path to validate
   * @param {string[]} [expectedContents] - Array of expected files/directories
   * @returns {Object} Validation result
   */
  static validatePath(pathToValidate, expectedContents = []) {
    const result = {
      valid: false,
      path: pathToValidate,
      exists: false,
      isDirectory: false,
      missingContents: [],
      foundContents: []
    };

    if (!pathToValidate || !fs.existsSync(pathToValidate)) {
      return result;
    }

    result.exists = true;
    const stats = fs.statSync(pathToValidate);
    result.isDirectory = stats.isDirectory();

    if (expectedContents.length === 0) {
      result.valid = true;
      return result;
    }

    if (!result.isDirectory) {
      result.valid = false;
      return result;
    }

    // Check expected contents
    expectedContents.forEach(item => {
      const itemPath = path.join(pathToValidate, item);
      if (fs.existsSync(itemPath)) {
        result.foundContents.push(item);
      } else {
        result.missingContents.push(item);
      }
    });

    result.valid = result.missingContents.length === 0;
    return result;
  }

  /**
   * Get all resolved paths for a list of plugins
   *
   * @param {string[]} pluginNames - List of plugin names
   * @returns {Object} Map of plugin name to resolved path
   */
  static resolveAll(pluginNames) {
    const resolved = {};
    pluginNames.forEach(name => {
      const canonicalName = normalizePluginName(name);
      resolved[canonicalName] = resolvePluginRoot(name);
    });
    return resolved;
  }

  /**
   * Get environment variable name for a plugin
   *
   * @param {string} pluginName - Plugin name
   * @returns {string} Environment variable name
   */
  static getEnvVarName(pluginName) {
    const canonical = normalizePluginName(pluginName);
    return canonical.toUpperCase().replace(/-/g, '_') + '_ROOT';
  }

  /**
   * Clear the resolution cache
   */
  static clearCache() {
    clearCache();
  }
}

/**
 * CLI handler
 */
function runCli() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Unified Path Resolver - Consistent plugin path resolution

USAGE:
  node unified-path-resolver.js <command> [arguments]

COMMANDS:
  resolve-root <plugin>
    Resolve and print the root directory of a plugin

  resolve <plugin> [component-type] [component-name]
    Resolve a component path within a plugin
    Example: resolve opspal-salesforce scripts/lib/foo.js

  export-all
    Print shell export commands for all plugins (source this output)

  export <plugin>
    Print shell export command for a specific plugin

  list
    List all available plugins with their paths

  validate <path> [expected-contents...]
    Validate a path exists and contains expected items

  env-var <plugin>
    Print the environment variable name for a plugin

EXAMPLES:
  # Resolve plugin root
  node unified-path-resolver.js resolve-root opspal-salesforce

  # Resolve script path
  node unified-path-resolver.js resolve opspal-salesforce scripts lib/org-metadata-cache.js

  # Export all paths (source in shell)
  eval "$(node unified-path-resolver.js export-all)"

  # Validate plugin structure
  node unified-path-resolver.js validate ./plugins/opspal-core scripts agents hooks

  # List all plugins
  node unified-path-resolver.js list
`);
    return;
  }

  switch (command) {
    case 'resolve-root': {
      const pluginName = args[1];
      if (!pluginName) {
        console.error('Error: Plugin name required');
        process.exit(1);
      }
      const root = UnifiedPathResolver.resolvePluginPath(pluginName);
      if (root) {
        console.log(root);
      } else {
        console.error(`Error: Could not resolve plugin: ${pluginName}`);
        process.exit(1);
      }
      break;
    }

    case 'resolve': {
      const pluginName = args[1];
      const componentType = args[2];
      const componentName = args[3];

      if (!pluginName) {
        console.error('Error: Plugin name required');
        process.exit(1);
      }

      if (componentType) {
        const componentPath = UnifiedPathResolver.resolveComponentPath(
          pluginName,
          componentType,
          componentName
        );
        if (componentPath) {
          console.log(componentPath);
        } else {
          // Fall back to resolvePluginScript for backwards compatibility
          const scriptPath = resolvePluginScript(
            pluginName,
            componentType + (componentName ? `/${componentName}` : '')
          );
          if (scriptPath) {
            console.log(scriptPath);
          } else {
            console.error(`Error: Could not resolve path`);
            process.exit(1);
          }
        }
      } else {
        const root = UnifiedPathResolver.resolvePluginPath(pluginName);
        if (root) {
          console.log(root);
        } else {
          console.error(`Error: Could not resolve plugin: ${pluginName}`);
          process.exit(1);
        }
      }
      break;
    }

    case 'export-all': {
      console.log(UnifiedPathResolver.generateShellExports());
      break;
    }

    case 'export': {
      const pluginName = args[1];
      if (!pluginName) {
        console.error('Error: Plugin name required');
        process.exit(1);
      }
      const root = UnifiedPathResolver.resolvePluginPath(pluginName);
      if (root) {
        const envVar = UnifiedPathResolver.getEnvVarName(pluginName);
        console.log(`export ${envVar}="${root}"`);
      } else {
        console.error(`Error: Could not resolve plugin: ${pluginName}`);
        process.exit(1);
      }
      break;
    }

    case 'list': {
      const plugins = listAvailablePlugins();
      if (plugins.length === 0) {
        console.log('No plugins found');
      } else {
        console.log('Available plugins:');
        plugins.forEach(p => {
          const envVar = UnifiedPathResolver.getEnvVarName(p.name);
          console.log(`  ${p.name}`);
          console.log(`    Path: ${p.path}`);
          console.log(`    Location: ${p.location}`);
          console.log(`    Env Var: ${envVar}`);
        });
      }
      break;
    }

    case 'validate': {
      const pathToValidate = args[1];
      const expectedContents = args.slice(2);

      if (!pathToValidate) {
        console.error('Error: Path required');
        process.exit(1);
      }

      const result = UnifiedPathResolver.validatePath(pathToValidate, expectedContents);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
      break;
    }

    case 'env-var': {
      const pluginName = args[1];
      if (!pluginName) {
        console.error('Error: Plugin name required');
        process.exit(1);
      }
      console.log(UnifiedPathResolver.getEnvVarName(pluginName));
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run with --help for usage information');
      process.exit(1);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  runCli();
}

module.exports = {
  UnifiedPathResolver,
  COMPONENT_TYPES,
  // Re-export base resolver functions
  resolvePluginRoot,
  resolvePluginScript,
  normalizePluginName,
  isPluginAvailable,
  listAvailablePlugins,
  clearCache,
  PLUGIN_ALIASES
};
