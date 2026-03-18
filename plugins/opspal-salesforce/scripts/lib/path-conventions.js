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
 *
 * Legacy patterns (instances/{platform}/{instance}) are maintained for
 * backward compatibility. New org-centric patterns (orgs/{org}/platforms/...)
 * are preferred for new projects.
 */
const PATH_CONVENTIONS = {
  // Legacy patterns (backward compatibility)
  salesforce: (identifier) => `instances/salesforce/${identifier}`,
  hubspot: (identifier) => `instances/hubspot/${identifier}`,
  crossPlatform: () => 'instances/cross-platform',

  // NEW: Org-centric patterns (preferred)
  orgSalesforce: (org, instance) => `orgs/${org}/platforms/salesforce/${instance}`,
  orgHubspot: (org, instance) => `orgs/${org}/platforms/hubspot/${instance}`,
  orgMarketo: (org, instance) => `orgs/${org}/platforms/marketo/${instance}`,
  orgCrossPlatform: (org) => `orgs/${org}/delivery/cross-platform`,
  orgAnalysis: (org) => `orgs/${org}/analysis`,
  orgPlanning: (org) => `orgs/${org}/planning`
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
  exports: 'exports',
  traces: 'traces',           // Execution traces (Runbook Policy Infrastructure)
  traceAnalytics: 'traces/analytics'  // Trace analysis outputs
};

/**
 * Standard instance-level files
 *
 * These files exist directly in the instance root, not in subdirectories.
 * Part of the Runbook Policy Infrastructure (Phase 3).
 */
const INSTANCE_FILES = {
  runbook: 'RUNBOOK.md',
  fieldPolicy: 'field-policy.json',     // Per-instance field policies
  taskVariantOverrides: 'task-variant-overrides.json',  // Task variant customizations
  traceIndex: 'traces/trace-index.json' // Trace index for fast lookups
};

/**
 * Get the base instances directory
 *
 * @param {string} pluginRoot - Plugin root directory (defaults to cwd or CLAUDE_PLUGIN_ROOT)
 * @returns {string} Absolute path to instances directory
 */
function getInstancesBase(pluginRoot) {
  const base = pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
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
  const base = pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();

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
 * Get the traces directory for an instance
 *
 * Part of the Runbook Policy Infrastructure (Phase 3).
 *
 * @param {string} platform - Platform name
 * @param {string} identifier - Instance identifier
 * @param {string} [pluginRoot] - Optional plugin root directory
 * @returns {string} Absolute path to traces directory
 */
function getTracesDir(platform, identifier, pluginRoot) {
  return getInstancePath(platform, identifier, 'traces', pluginRoot);
}

/**
 * Get path to a standard instance file
 *
 * Part of the Runbook Policy Infrastructure (Phase 3).
 *
 * @param {string} platform - Platform name
 * @param {string} identifier - Instance identifier
 * @param {string} fileKey - File key from INSTANCE_FILES (e.g., 'fieldPolicy', 'runbook')
 * @param {string} [pluginRoot] - Optional plugin root directory
 * @returns {string} Absolute path to the file
 */
function getInstanceFile(platform, identifier, fileKey, pluginRoot) {
  const base = pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();

  if (!INSTANCE_FILES[fileKey]) {
    throw new Error(`Unknown instance file: ${fileKey}. Valid: ${Object.keys(INSTANCE_FILES).join(', ')}`);
  }

  let instancePath;
  if (platform === 'crossPlatform' || platform === 'cross-platform') {
    instancePath = path.join(base, PATH_CONVENTIONS.crossPlatform());
  } else if (PATH_CONVENTIONS[platform]) {
    instancePath = path.join(base, PATH_CONVENTIONS[platform](identifier));
  } else {
    throw new Error(`Unknown platform: ${platform}. Valid: salesforce, hubspot, crossPlatform`);
  }

  return path.join(instancePath, INSTANCE_FILES[fileKey]);
}

/**
 * Get the field policy file path for an instance
 *
 * Part of the Runbook Policy Infrastructure (Phase 3).
 *
 * @param {string} platform - Platform name
 * @param {string} identifier - Instance identifier
 * @param {string} [pluginRoot] - Optional plugin root directory
 * @returns {string} Absolute path to field-policy.json
 */
function getFieldPolicyPath(platform, identifier, pluginRoot) {
  return getInstanceFile(platform, identifier, 'fieldPolicy', pluginRoot);
}

/**
 * Get the task variant overrides file path for an instance
 *
 * Part of the Runbook Policy Infrastructure (Phase 3).
 *
 * @param {string} platform - Platform name
 * @param {string} identifier - Instance identifier
 * @param {string} [pluginRoot] - Optional plugin root directory
 * @returns {string} Absolute path to task-variant-overrides.json
 */
function getTaskVariantOverridesPath(platform, identifier, pluginRoot) {
  return getInstanceFile(platform, identifier, 'taskVariantOverrides', pluginRoot);
}

/**
 * Determine plugin root from a file path within the plugin
 *
 * @param {string} currentFilePath - Path to current file (__dirname or __filename)
 * @returns {string} Plugin root directory
 */
function resolvePluginRoot(currentFilePath) {
  // Check environment variable first
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return process.env.CLAUDE_PLUGIN_ROOT;
  }

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
        return dir;
      }
    }
    dir = path.dirname(dir);
    depth++;
  }

  // Fallback to cwd
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
  const base = pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();

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

/**
 * Get instance path with multi-pattern fallback
 *
 * Tries paths in priority order:
 * 1. Org-centric: orgs/{org}/platforms/{platform}/{instance}
 * 2. Legacy platform: instances/{platform}/{instance}
 * 3. Legacy simple: instances/{instance}
 *
 * @param {string} platform - Platform name ('salesforce', 'hubspot', etc.)
 * @param {string} identifier - Instance identifier
 * @param {Object} [options] - Options
 * @param {string} [options.org] - Org slug (for org-centric pattern)
 * @param {string} [options.subdir] - Subdirectory within instance
 * @param {string} [options.pluginRoot] - Plugin root directory
 * @returns {string} Resolved path (first existing or first candidate)
 */
function getInstancePathWithFallback(platform, identifier, options = {}) {
  const { org, subdir, pluginRoot } = options;
  const base = pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();

  const candidates = [];

  // Priority 1: Org-centric (if org provided or detected from env)
  const effectiveOrg = org || process.env.ORG_SLUG || process.env.CLIENT_ORG;
  if (effectiveOrg) {
    candidates.push(path.join(base, `orgs/${effectiveOrg}/platforms/${platform}/${identifier}`));
  }

  // Priority 2: Legacy platform convention
  candidates.push(path.join(base, `instances/${platform}/${identifier}`));

  // Priority 3: Legacy simple convention
  candidates.push(path.join(base, `instances/${identifier}`));

  // Return first existing path or first candidate for creation
  for (const candidate of candidates) {
    const targetPath = subdir ? path.join(candidate, subdir) : candidate;
    if (fs.existsSync(targetPath)) {
      return targetPath;
    }
  }

  // No existing path found, return first candidate (for creation)
  const firstCandidate = candidates[0];
  return subdir ? path.join(firstCandidate, subdir) : firstCandidate;
}

/**
 * Extract org, platform, and instance from any path format
 *
 * Supports:
 * - New: orgs/{org}/platforms/{platform}/{instance}
 * - Legacy: instances/{platform}/{instance}
 * - Legacy simple: instances/{instance}
 *
 * @param {string} instancePath - Path to parse
 * @returns {Object|null} Parsed components or null if not recognized
 */
function extractOrgFromPath(instancePath) {
  const normalized = instancePath.replace(/\\/g, '/');

  // New: orgs/{org}/platforms/{platform}/{instance}
  const newMatch = normalized.match(/orgs\/([^/]+)\/platforms\/([^/]+)\/([^/]+)/);
  if (newMatch) {
    return {
      org: newMatch[1],
      platform: newMatch[2],
      instance: newMatch[3],
      format: 'org-centric'
    };
  }

  // Legacy: instances/{platform}/{instance}
  const legacyPlatformMatch = normalized.match(/instances\/(salesforce|hubspot|marketo)\/([^/]+)/);
  if (legacyPlatformMatch) {
    return {
      org: null,
      platform: legacyPlatformMatch[1],
      instance: legacyPlatformMatch[2],
      format: 'legacy-platform'
    };
  }

  // Legacy simple: instances/{instance}
  const legacySimpleMatch = normalized.match(/instances\/([^/]+)/);
  if (legacySimpleMatch) {
    return {
      org: null,
      platform: null,
      instance: legacySimpleMatch[1],
      format: 'legacy-simple'
    };
  }

  return null;
}

/**
 * Get the org-centric instance path
 *
 * @param {string} org - Org slug
 * @param {string} platform - Platform name
 * @param {string} instance - Instance name
 * @param {string} [subdir] - Optional subdirectory
 * @param {string} [pluginRoot] - Optional plugin root
 * @returns {string} Org-centric path
 */
function getOrgInstancePath(org, platform, instance, subdir, pluginRoot) {
  const base = pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  let instancePath;

  if (PATH_CONVENTIONS[`org${platform.charAt(0).toUpperCase() + platform.slice(1)}`]) {
    const convention = PATH_CONVENTIONS[`org${platform.charAt(0).toUpperCase() + platform.slice(1)}`];
    instancePath = path.join(base, convention(org, instance));
  } else {
    instancePath = path.join(base, `orgs/${org}/platforms/${platform}/${instance}`);
  }

  if (subdir) {
    return path.join(instancePath, subdir);
  }

  return instancePath;
}

/**
 * Ensure an org-centric instance path exists
 *
 * @param {string} org - Org slug
 * @param {string} platform - Platform name
 * @param {string} instance - Instance name
 * @param {string} [subdir] - Optional subdirectory
 * @param {string} [pluginRoot] - Optional plugin root
 * @returns {string} Created path
 */
function ensureOrgInstancePath(org, platform, instance, subdir, pluginRoot) {
  const targetPath = getOrgInstancePath(org, platform, instance, subdir, pluginRoot);

  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  return targetPath;
}

/**
 * List all orgs in the orgs/ directory
 *
 * @param {string} [pluginRoot] - Optional plugin root
 * @returns {string[]} Array of org slugs
 */
function listOrgs(pluginRoot) {
  const base = pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const orgsDir = path.join(base, 'orgs');

  if (!fs.existsSync(orgsDir)) {
    return [];
  }

  return fs.readdirSync(orgsDir)
    .filter(f => {
      const fullPath = path.join(orgsDir, f);
      return fs.statSync(fullPath).isDirectory() && !f.startsWith('.');
    });
}

/**
 * List all instances for a platform within an org
 *
 * @param {string} org - Org slug
 * @param {string} platform - Platform name
 * @param {string} [pluginRoot] - Optional plugin root
 * @returns {string[]} Array of instance names
 */
function listOrgInstances(org, platform, pluginRoot) {
  const base = pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const platformDir = path.join(base, 'orgs', org, 'platforms', platform);

  if (!fs.existsSync(platformDir)) {
    return [];
  }

  return fs.readdirSync(platformDir)
    .filter(f => {
      const fullPath = path.join(platformDir, f);
      return fs.statSync(fullPath).isDirectory() && !f.startsWith('_');
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
  } else if (command === 'file' && args.length >= 3) {
    const [, platform, identifier, fileKey] = args;
    console.log(getInstanceFile(platform, identifier, fileKey || 'runbook'));
  } else {
    console.log(`Usage:
  node path-conventions.js get <platform> <identifier> [subdir]
  node path-conventions.js list <platform>
  node path-conventions.js ensure <platform> <identifier> [subdir]
  node path-conventions.js file <platform> <identifier> <fileKey>

Platforms: salesforce, hubspot, crossPlatform
Subdirs: observations, runbooks, reports, snapshots, cache, diagrams, exports, traces
Files: runbook, fieldPolicy, taskVariantOverrides, traceIndex

Examples:
  node path-conventions.js get salesforce myOrg observations
  node path-conventions.js get salesforce myOrg traces
  node path-conventions.js list salesforce
  node path-conventions.js ensure hubspot 12345678 reports
  node path-conventions.js file salesforce myOrg fieldPolicy
`);
  }
}

module.exports = {
  PATH_CONVENTIONS,
  INSTANCE_SUBDIRS,
  INSTANCE_FILES,
  getInstancesBase,
  getInstancePath,
  ensureInstancePath,
  getObservationsDir,
  getRunbooksDir,
  getReportsDir,
  getTracesDir,
  getInstanceFile,
  getFieldPolicyPath,
  getTaskVariantOverridesPath,
  resolvePluginRoot,
  listInstances,
  // Org-centric methods
  getInstancePathWithFallback,
  extractOrgFromPath,
  getOrgInstancePath,
  ensureOrgInstancePath,
  listOrgs,
  listOrgInstances
};
