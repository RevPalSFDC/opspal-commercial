#!/usr/bin/env node

/**
 * Plugin Path Resolver
 *
 * Resolves script paths across plugins with multiple fallback strategies.
 * Prevents "Sibling tool call errored" issues when sub-agents can't find scripts.
 *
 * Resolution strategies (in priority order):
 * 1. CLAUDE_PLUGIN_ROOT environment variable
 * 2. Home directory installed plugins (~/.claude/plugins/opspal-{plugin}@...)
 * 3. Current working directory plugins (.claude-plugins/opspal-{plugin}/)
 * 4. Symlinked plugins directory (plugins/opspal-{plugin}/)
 * 5. Script dirname traversal (find plugin root from __dirname)
 *
 * Usage:
 *   const { resolvePluginScript, resolvePluginRoot } = require('./plugin-path-resolver');
 *
 *   // Resolve a specific script
 *   const scriptPath = resolvePluginScript('opspal-salesforce', 'scripts/lib/org-metadata-cache.js');
 *
 *   // Resolve the plugin root
 *   const pluginRoot = resolvePluginRoot('opspal-salesforce');
 *
 * @module plugin-path-resolver
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Known plugin names and their common aliases
 */
const PLUGIN_ALIASES = {
  'salesforce': 'opspal-salesforce',
  'opspal-salesforce': 'opspal-salesforce',
  'salesforce-plugin': 'opspal-salesforce',
  'hubspot': 'opspal-hubspot',
  'opspal-hubspot': 'opspal-hubspot',
  'hubspot-plugin': 'opspal-hubspot',
  'marketo': 'opspal-marketo',
  'opspal-marketo': 'opspal-marketo',
  'marketo-plugin': 'opspal-marketo',
  'core': 'opspal-core',
  'opspal-core': 'opspal-core',
  'gtm-planning': 'opspal-gtm-planning',
  'opspal-gtm-planning': 'opspal-gtm-planning'
};

/**
 * Reverse alias map: canonical name → all alternate directory names
 * Used to search marketplace installs where dir names may differ from canonical.
 */
const PLUGIN_DIR_NAMES = {
  'opspal-salesforce': ['opspal-salesforce', 'salesforce-plugin'],
  'opspal-hubspot': ['opspal-hubspot', 'hubspot-plugin'],
  'opspal-marketo': ['opspal-marketo', 'marketo-plugin'],
  'opspal-core': ['opspal-core', 'core'],
  'opspal-gtm-planning': ['opspal-gtm-planning', 'gtm-planning-plugin'],
  'opspal-monday': ['opspal-monday', 'monday-plugin'],
  'opspal-ai-consult': ['opspal-ai-consult', 'ai-consult-plugin']
};

/**
 * Cache for resolved plugin roots
 */
const pluginRootCache = new Map();

/**
 * Normalize plugin name to canonical form
 *
 * @param {string} pluginName - Plugin name or alias
 * @returns {string} Canonical plugin name
 */
function normalizePluginName(pluginName) {
  return PLUGIN_ALIASES[pluginName] || pluginName;
}

/**
 * Find plugins directory in home (~/.claude/plugins/)
 *
 * Searches:
 * 1. ~/.claude/plugins/{name} or {name}@{version} (direct installs)
 * 2. ~/.claude/plugins/marketplaces/{marketplace}/.claude-plugins/{name}/ (marketplace installs)
 * 3. ~/.claude/plugins/cache/{marketplace}/{name}/{version}/ (cached installs)
 *
 * @param {string} pluginName - Canonical plugin name
 * @returns {string|null} Plugin directory path or null
 */
function findHomePluginDir(pluginName) {
  const homePluginsDir = path.join(os.homedir(), '.claude', 'plugins');

  if (!fs.existsSync(homePluginsDir)) {
    return null;
  }

  // All directory names to search for this plugin
  const dirNames = PLUGIN_DIR_NAMES[pluginName] || [pluginName];

  try {
    // Strategy 1: Direct top-level match (opspal-salesforce or opspal-salesforce@version)
    const topEntries = fs.readdirSync(homePluginsDir);
    for (const dirName of dirNames) {
      for (const entry of topEntries) {
        if (entry === dirName || entry.startsWith(`${dirName}@`)) {
          const fullPath = path.join(homePluginsDir, entry);
          if (fs.statSync(fullPath).isDirectory()) {
            return fullPath;
          }
        }
      }
    }

    // Strategy 2: Marketplace installs (~/.claude/plugins/marketplaces/*/. claude-plugins/{name}/)
    const marketplacesDir = path.join(homePluginsDir, 'marketplaces');
    if (fs.existsSync(marketplacesDir)) {
      const marketplaces = fs.readdirSync(marketplacesDir);
      for (const marketplace of marketplaces) {
        const pluginsSubdir = path.join(marketplacesDir, marketplace, '.claude-plugins');
        if (fs.existsSync(pluginsSubdir)) {
          for (const dirName of dirNames) {
            const candidate = path.join(pluginsSubdir, dirName);
            if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
              return candidate;
            }
          }
        }
        // Also check plugins/ subdir directly
        const pluginsDirect = path.join(marketplacesDir, marketplace, 'plugins');
        if (fs.existsSync(pluginsDirect)) {
          for (const dirName of dirNames) {
            const candidate = path.join(pluginsDirect, dirName);
            if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
              return candidate;
            }
          }
        }
      }
    }

    // Strategy 3: Cache installs (~/.claude/plugins/cache/{marketplace}/{name}/{version}/)
    const cacheDir = path.join(homePluginsDir, 'cache');
    if (fs.existsSync(cacheDir)) {
      const cacheMarketplaces = fs.readdirSync(cacheDir);
      for (const marketplace of cacheMarketplaces) {
        for (const dirName of dirNames) {
          const pluginCacheDir = path.join(cacheDir, marketplace, dirName);
          if (fs.existsSync(pluginCacheDir)) {
            // Get latest version (most recent directory)
            const versions = fs.readdirSync(pluginCacheDir)
              .filter(v => fs.statSync(path.join(pluginCacheDir, v)).isDirectory());
            if (versions.length > 0) {
              return path.join(pluginCacheDir, versions[versions.length - 1]);
            }
          }
        }
      }
    }
  } catch (e) {
    // Ignore errors, return null
  }

  return null;
}

/**
 * Find plugins in various common locations
 *
 * @param {string} pluginName - Canonical plugin name
 * @param {string} [basePath] - Optional base path to search from
 * @returns {string|null} Plugin directory path or null
 */
function findPluginDir(pluginName, basePath) {
  const searchBase = basePath || process.cwd();

  // Common plugin directory patterns
  const patterns = [
    // Direct plugins directory
    path.join(searchBase, 'plugins', pluginName),
    // .claude-plugins symlink/directory
    path.join(searchBase, '.claude-plugins', pluginName),
    // Parent plugins directory (if running from within a plugin)
    path.join(searchBase, '..', pluginName),
    // Grandparent (if in scripts/lib/)
    path.join(searchBase, '..', '..', pluginName),
    // Three levels up (if in scripts/lib/subdir/)
    path.join(searchBase, '..', '..', '..', pluginName)
  ];

  for (const pattern of patterns) {
    const resolved = path.resolve(pattern);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      // Verify it's actually a plugin directory (has scripts/ or agents/)
      if (fs.existsSync(path.join(resolved, 'scripts')) ||
          fs.existsSync(path.join(resolved, 'agents')) ||
          fs.existsSync(path.join(resolved, '.claude-plugin'))) {
        return resolved;
      }
    }
  }

  return null;
}

/**
 * Resolve the root directory for a plugin
 *
 * Resolution order:
 * 1. CLAUDE_PLUGIN_ROOT env var (if matches plugin name)
 * 2. Plugin-specific env var (e.g., OPSPAL_SALESFORCE_ROOT)
 * 3. Home plugins directory (~/.claude/plugins/)
 * 4. Current working directory patterns
 * 5. Script dirname traversal
 *
 * @param {string} pluginName - Plugin name (can be alias)
 * @param {Object} [options] - Options
 * @param {boolean} [options.useCache=true] - Use cached results
 * @param {string} [options.basePath] - Base path for relative searches
 * @returns {string|null} Absolute path to plugin root or null
 */
function resolvePluginRoot(pluginName, options = {}) {
  const { useCache = true, basePath } = options;
  const canonicalName = normalizePluginName(pluginName);

  // Check cache
  if (useCache && pluginRootCache.has(canonicalName)) {
    return pluginRootCache.get(canonicalName);
  }

  let resolved = null;

  // Strategy 1: CLAUDE_PLUGIN_ROOT env var
  const envRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (envRoot && fs.existsSync(envRoot)) {
    // Check if this root contains our plugin
    const pluginInRoot = path.join(envRoot, 'plugins', canonicalName);
    if (fs.existsSync(pluginInRoot)) {
      resolved = pluginInRoot;
    } else if (path.basename(envRoot) === canonicalName ||
               envRoot.includes(canonicalName)) {
      // The env var points directly to the plugin
      resolved = envRoot;
    }
  }

  // Strategy 2: Plugin-specific env var
  if (!resolved) {
    const envVarName = canonicalName.toUpperCase().replace(/-/g, '_') + '_ROOT';
    const specificRoot = process.env[envVarName];
    if (specificRoot && fs.existsSync(specificRoot)) {
      resolved = specificRoot;
    }
  }

  // Strategy 3: Home plugins directory
  if (!resolved) {
    resolved = findHomePluginDir(canonicalName);
  }

  // Strategy 4: CWD-based search
  if (!resolved) {
    resolved = findPluginDir(canonicalName, basePath);
  }

  // Strategy 5: __dirname-based search (useful when running from within plugin)
  if (!resolved && typeof __dirname !== 'undefined') {
    // Walk up from __dirname looking for plugin root
    let dir = __dirname;
    const maxDepth = 10;
    let depth = 0;

    while (dir !== path.dirname(dir) && depth < maxDepth) {
      if (path.basename(dir) === canonicalName) {
        resolved = dir;
        break;
      }
      // Check if we're in a plugins directory
      const parentName = path.basename(path.dirname(dir));
      if (parentName === 'plugins' && path.basename(dir) === canonicalName) {
        resolved = dir;
        break;
      }
      dir = path.dirname(dir);
      depth++;
    }
  }

  // Cache and return
  if (resolved) {
    pluginRootCache.set(canonicalName, resolved);
  }

  return resolved;
}

/**
 * Resolve a script path within a plugin
 *
 * @param {string} pluginName - Plugin name (can be alias)
 * @param {string} scriptPath - Relative path to script within plugin
 * @param {Object} [options] - Options
 * @param {boolean} [options.mustExist=false] - Throw if script doesn't exist
 * @param {boolean} [options.useCache=true] - Use cached plugin root
 * @returns {string|null} Absolute path to script or null
 */
function resolvePluginScript(pluginName, scriptPath, options = {}) {
  const { mustExist = false, useCache = true } = options;

  const pluginRoot = resolvePluginRoot(pluginName, { useCache });

  if (!pluginRoot) {
    if (mustExist) {
      throw new Error(`Cannot resolve plugin root for: ${pluginName}`);
    }
    return null;
  }

  const fullPath = path.join(pluginRoot, scriptPath);

  if (mustExist && !fs.existsSync(fullPath)) {
    throw new Error(`Script not found: ${fullPath}`);
  }

  return fs.existsSync(fullPath) ? fullPath : null;
}

/**
 * Get environment variable command for setting CLAUDE_PLUGIN_ROOT
 *
 * @param {string} pluginName - Plugin name
 * @returns {string|null} Export command or null
 */
function getPluginRootExportCommand(pluginName) {
  const root = resolvePluginRoot(pluginName);
  if (!root) {
    return null;
  }
  return `export CLAUDE_PLUGIN_ROOT="${root}"`;
}

/**
 * Check if a plugin is available
 *
 * @param {string} pluginName - Plugin name
 * @returns {boolean} True if plugin can be resolved
 */
function isPluginAvailable(pluginName) {
  return resolvePluginRoot(pluginName) !== null;
}

/**
 * List all available plugins
 *
 * @returns {Object[]} Array of { name, path } objects
 */
function listAvailablePlugins() {
  const plugins = [];
  const seen = new Set();

  // Build reverse lookup: directory name → canonical name
  const dirToCanonical = {};
  for (const [canonical, dirs] of Object.entries(PLUGIN_DIR_NAMES)) {
    for (const dir of dirs) {
      dirToCanonical[dir] = canonical;
    }
  }

  function addPlugin(dirName, fullPath, location) {
    const canonical = dirToCanonical[dirName] || dirName;
    if (!seen.has(canonical) && fs.statSync(fullPath).isDirectory()) {
      seen.add(canonical);
      plugins.push({ name: canonical, path: fullPath, location });
    }
  }

  const homePluginsDir = path.join(os.homedir(), '.claude', 'plugins');
  if (fs.existsSync(homePluginsDir)) {
    try {
      // Check top-level home plugins
      const entries = fs.readdirSync(homePluginsDir);
      for (const entry of entries) {
        if (entry.startsWith('opspal-')) {
          const name = entry.split('@')[0];
          addPlugin(name, path.join(homePluginsDir, entry), 'home');
        }
      }

      // Check marketplace installs
      const marketplacesDir = path.join(homePluginsDir, 'marketplaces');
      if (fs.existsSync(marketplacesDir)) {
        for (const marketplace of fs.readdirSync(marketplacesDir)) {
          const pluginsSubdir = path.join(marketplacesDir, marketplace, '.claude-plugins');
          if (fs.existsSync(pluginsSubdir)) {
            for (const entry of fs.readdirSync(pluginsSubdir)) {
              const fullPath = path.join(pluginsSubdir, entry);
              if (dirToCanonical[entry] || entry.startsWith('opspal-')) {
                addPlugin(entry, fullPath, 'marketplace');
              }
            }
          }
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  // Check CWD plugins
  const cwdPatterns = [
    path.join(process.cwd(), 'plugins'),
    path.join(process.cwd(), '.claude-plugins')
  ];

  for (const dir of cwdPatterns) {
    if (fs.existsSync(dir)) {
      try {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          if ((entry.startsWith('opspal-') || dirToCanonical[entry]) && !seen.has(dirToCanonical[entry] || entry)) {
            addPlugin(entry, path.join(dir, entry), dir.includes('.claude-plugins') ? 'symlink' : 'local');
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  }

  return plugins;
}

/**
 * Clear the plugin root cache
 */
function clearCache() {
  pluginRootCache.clear();
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'resolve-root' && args[1]) {
    const root = resolvePluginRoot(args[1]);
    if (root) {
      console.log(root);
    } else {
      console.error(`Could not resolve plugin: ${args[1]}`);
      process.exit(1);
    }

  } else if (command === 'resolve-script' && args[1] && args[2]) {
    const scriptPath = resolvePluginScript(args[1], args[2]);
    if (scriptPath) {
      console.log(scriptPath);
    } else {
      console.error(`Could not resolve script: ${args[1]}/${args[2]}`);
      process.exit(1);
    }

  } else if (command === 'export' && args[1]) {
    const exportCmd = getPluginRootExportCommand(args[1]);
    if (exportCmd) {
      console.log(exportCmd);
    } else {
      console.error(`Could not resolve plugin: ${args[1]}`);
      process.exit(1);
    }

  } else if (command === 'list') {
    const plugins = listAvailablePlugins();
    if (plugins.length === 0) {
      console.log('No plugins found');
    } else {
      console.log('Available plugins:');
      plugins.forEach(p => {
        console.log(`  ${p.name} (${p.location}): ${p.path}`);
      });
    }

  } else if (command === 'check' && args[1]) {
    const available = isPluginAvailable(args[1]);
    console.log(available ? 'available' : 'not found');
    process.exit(available ? 0 : 1);

  } else {
    console.log(`Plugin Path Resolver

Usage:
  node plugin-path-resolver.js resolve-root <plugin-name>
    Resolve the root directory of a plugin

  node plugin-path-resolver.js resolve-script <plugin-name> <script-path>
    Resolve a script within a plugin

  node plugin-path-resolver.js export <plugin-name>
    Print export command for CLAUDE_PLUGIN_ROOT

  node plugin-path-resolver.js list
    List all available plugins

  node plugin-path-resolver.js check <plugin-name>
    Check if a plugin is available

Examples:
  node plugin-path-resolver.js resolve-root opspal-salesforce
  node plugin-path-resolver.js resolve-script opspal-salesforce scripts/lib/org-metadata-cache.js
  node plugin-path-resolver.js export opspal-salesforce
  node plugin-path-resolver.js list
  node plugin-path-resolver.js check salesforce
`);
  }
}

module.exports = {
  resolvePluginRoot,
  resolvePluginScript,
  normalizePluginName,
  getPluginRootExportCommand,
  isPluginAvailable,
  listAvailablePlugins,
  clearCache,
  PLUGIN_ALIASES
};
