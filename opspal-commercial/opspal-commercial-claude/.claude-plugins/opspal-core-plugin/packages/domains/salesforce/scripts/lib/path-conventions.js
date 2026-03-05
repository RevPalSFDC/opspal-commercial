#!/usr/bin/env node

/**
 * Path Conventions Utility
 *
 * Standardized path patterns for instance-based storage across the plugin ecosystem.
 * Addresses 11 reflections showing path inconsistency issues.
 *
 * Usage:
 *   const { getInstancePath, PATH_CONVENTIONS } = require('./path-conventions');
 *   const obsDir = getInstancePath('salesforce', 'orgAlias', 'observations');
 *
 * Path Structure:
 *   instances/
 *   ├── salesforce/{org-alias}/
 *   │   ├── observations/     - Operation observations
 *   │   ├── runbooks/         - Generated runbooks
 *   │   ├── reports/          - Assessment reports
 *   │   ├── snapshots/        - Point-in-time snapshots
 *   │   └── cache/            - Metadata cache
 *   ├── hubspot/{portal-id}/
 *   │   ├── observations/
 *   │   ├── runbooks/
 *   │   └── reports/
 *   └── cross-platform/
 *       ├── observations/
 *       └── reports/
 *
 * @module path-conventions
 */

const fs = require('fs');
const path = require('path');

/**
 * Path convention patterns by platform
 */
const PATH_CONVENTIONS = {
  salesforce: (identifier) => `instances/salesforce/${identifier}`,
  hubspot: (identifier) => `instances/hubspot/${identifier}`,
  crossPlatform: () => 'instances/cross-platform'
};

/**
 * Standard subdirectories within each instance
 */
const INSTANCE_SUBDIRS = {
  observations: 'observations',
  runbooks: 'runbooks',
  reports: 'reports',
  snapshots: 'snapshots',
  cache: 'cache',
  diagrams: 'diagrams',
  exports: 'exports'
};

/**
 * Get the base instances directory
 *
 * @param {string} pluginRoot - Plugin root directory (defaults to cwd or CLAUDE_PLUGIN_ROOT)
 * @returns {string} Absolute path to instances directory
 */
function getInstancesBase(pluginRoot) {
  const base = pluginRoot || resolvePluginRoot(process.cwd());
  return path.join(base, 'instances');
}

/**
 * Get the path for a specific platform instance
 *
 * @param {string} platform - Platform name ('salesforce', 'hubspot', 'crossPlatform')
 * @param {string} identifier - Instance identifier (org alias for SF, portal ID for HS)
 * @param {string} [subdir] - Optional subdirectory (observations, runbooks, reports, etc.)
 * @param {string} [pluginRoot] - Optional plugin root directory
 * @returns {string} Absolute path to the instance directory or subdirectory
 *
 * @example
 * // Get observations directory for a Salesforce org
 * getInstancePath('salesforce', 'myOrg', 'observations')
 * // => '/path/to/plugin/instances/salesforce/myOrg/observations'
 *
 * @example
 * // Get instance root for HubSpot
 * getInstancePath('hubspot', '12345678')
 * // => '/path/to/plugin/instances/hubspot/12345678'
 */
function getInstancePath(platform, identifier, subdir, pluginRoot) {
  const base = pluginRoot || resolvePluginRoot(process.cwd());

  let instancePath;

  if (platform === 'crossPlatform' || platform === 'cross-platform') {
    instancePath = path.join(base, PATH_CONVENTIONS.crossPlatform());
  } else if (PATH_CONVENTIONS[platform]) {
    instancePath = path.join(base, PATH_CONVENTIONS[platform](identifier));
  } else {
    throw new Error(`Unknown platform: ${platform}. Valid: salesforce, hubspot, crossPlatform`);
  }

  if (subdir) {
    if (!INSTANCE_SUBDIRS[subdir]) {
      console.warn(`⚠️  Non-standard subdirectory '${subdir}'. Standard: ${Object.keys(INSTANCE_SUBDIRS).join(', ')}`);
    }
    return path.join(instancePath, subdir);
  }

  return instancePath;
}

/**
 * Ensure an instance directory exists, creating it if necessary
 *
 * @param {string} platform - Platform name
 * @param {string} identifier - Instance identifier
 * @param {string} [subdir] - Optional subdirectory
 * @param {string} [pluginRoot] - Optional plugin root directory
 * @returns {string} Absolute path to the created directory
 */
function ensureInstancePath(platform, identifier, subdir, pluginRoot) {
  const targetPath = getInstancePath(platform, identifier, subdir, pluginRoot);

  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  return targetPath;
}

/**
 * Get the observations directory for an instance
 * Convenience method for the most common use case
 *
 * @param {string} platform - Platform name
 * @param {string} identifier - Instance identifier
 * @param {string} [pluginRoot] - Optional plugin root directory
 * @returns {string} Absolute path to observations directory
 */
function getObservationsDir(platform, identifier, pluginRoot) {
  return getInstancePath(platform, identifier, 'observations', pluginRoot);
}

/**
 * Get the runbooks directory for an instance
 *
 * @param {string} platform - Platform name
 * @param {string} identifier - Instance identifier
 * @param {string} [pluginRoot] - Optional plugin root directory
 * @returns {string} Absolute path to runbooks directory
 */
function getRunbooksDir(platform, identifier, pluginRoot) {
  return getInstancePath(platform, identifier, 'runbooks', pluginRoot);
}

/**
 * Get the reports directory for an instance
 *
 * @param {string} platform - Platform name
 * @param {string} identifier - Instance identifier
 * @param {string} [pluginRoot] - Optional plugin root directory
 * @returns {string} Absolute path to reports directory
 */
function getReportsDir(platform, identifier, pluginRoot) {
  return getInstancePath(platform, identifier, 'reports', pluginRoot);
}

/**
 * Determine plugin root from a file path within the plugin
 *
 * @param {string} currentFilePath - Path to current file (__dirname or __filename)
 * @returns {string} Plugin root directory
 */
function resolvePluginRoot(currentFilePath) {
  const envRoot = process.env.CLAUDE_PLUGIN_ROOT
    ? path.resolve(process.env.CLAUDE_PLUGIN_ROOT)
    : '';

  // Walk up looking for plugin.json or CLAUDE.md
  let dir = path.isAbsolute(currentFilePath) ? currentFilePath : path.resolve(currentFilePath);

  // If it's a file, start from its directory
  if (fs.existsSync(dir) && fs.statSync(dir).isFile()) {
    dir = path.dirname(dir);
  }

  const markers = ['.claude-plugin/plugin.json', 'CLAUDE.md', 'plugin.json'];
  const maxDepth = 10;
  let depth = 0;

  while (dir !== path.dirname(dir) && depth < maxDepth) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(dir, marker))) {
        if (envRoot && envRoot === dir) {
          return envRoot;
        }
        return dir;
      }
    }
    dir = path.dirname(dir);
    depth++;
  }

  if (envRoot) {
    return envRoot;
  }

  return process.cwd();
}

/**
 * List all instances for a platform
 *
 * @param {string} platform - Platform name
 * @param {string} [pluginRoot] - Optional plugin root directory
 * @returns {string[]} Array of instance identifiers
 */
function listInstances(platform, pluginRoot) {
  const base = pluginRoot || resolvePluginRoot(process.cwd());

  let platformDir;
  if (platform === 'crossPlatform' || platform === 'cross-platform') {
    platformDir = path.join(base, 'instances', 'cross-platform');
    return fs.existsSync(platformDir) ? ['cross-platform'] : [];
  } else {
    platformDir = path.join(base, 'instances', platform);
  }

  if (!fs.existsSync(platformDir)) {
    return [];
  }

  return fs.readdirSync(platformDir)
    .filter(f => {
      const fullPath = path.join(platformDir, f);
      return fs.statSync(fullPath).isDirectory();
    });
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'get' && args.length >= 3) {
    const [, platform, identifier, subdir] = args;
    console.log(getInstancePath(platform, identifier, subdir));
  } else if (command === 'list' && args.length >= 2) {
    const platform = args[1];
    const instances = listInstances(platform);
    console.log(instances.join('\n'));
  } else if (command === 'ensure' && args.length >= 3) {
    const [, platform, identifier, subdir] = args;
    console.log(ensureInstancePath(platform, identifier, subdir));
  } else {
    console.log(`Usage:
  node path-conventions.js get <platform> <identifier> [subdir]
  node path-conventions.js list <platform>
  node path-conventions.js ensure <platform> <identifier> [subdir]

Platforms: salesforce, hubspot, crossPlatform
Subdirs: observations, runbooks, reports, snapshots, cache, diagrams, exports

Examples:
  node path-conventions.js get salesforce myOrg observations
  node path-conventions.js list salesforce
  node path-conventions.js ensure hubspot 12345678 reports
`);
  }
}

module.exports = {
  PATH_CONVENTIONS,
  INSTANCE_SUBDIRS,
  getInstancesBase,
  getInstancePath,
  ensureInstancePath,
  getObservationsDir,
  getRunbooksDir,
  getReportsDir,
  resolvePluginRoot,
  listInstances
};
