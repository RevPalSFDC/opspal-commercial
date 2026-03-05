#!/usr/bin/env node

/**
 * Unified Path Resolver
 *
 * Centralized path resolution with support for both:
 * - New: orgs/{org}/platforms/{platform}/{instance}
 * - Legacy: instances/{platform}/{instance}
 *
 * Resolution priority:
 * 1. Environment variable override (INSTANCE_PATH, ORG_PATH)
 * 2. Org-centric path (orgs/...)
 * 3. Legacy platform path (instances/{platform}/...)
 * 4. Legacy simple path (instances/...)
 * 5. Plugin-specific path (.claude-plugins/{plugin}/instances/...)
 *
 * Usage:
 *   const { PathResolver } = require('./path-resolver');
 *   const resolver = new PathResolver();
 *   const result = await resolver.resolveOrgPath('acme');
 *
 * @module path-resolver
 */

const fs = require('fs');
const path = require('path');

/**
 * PathResolver class for unified path resolution
 */
class PathResolver {
  /**
   * Create a PathResolver instance
   *
   * @param {Object} options - Configuration options
   * @param {string} [options.basePath] - Base path for resolution (default: cwd)
   * @param {boolean} [options.preferOrgCentric] - Prefer org-centric paths (default: true)
   * @param {boolean} [options.verbose] - Enable verbose logging (default: false)
   */
  constructor(options = {}) {
    this.basePath = options.basePath || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
    this.preferOrgCentric = options.preferOrgCentric !== false;
    this.verbose = options.verbose || false;
    this.config = this._loadConfig();
  }

  /**
   * Load path resolution configuration
   * @private
   */
  _loadConfig() {
    const configPaths = [
      path.join(this.basePath, '.claude-plugins/opspal-core/config/path-resolution-config.json'),
      path.join(this.basePath, 'config/path-resolution-config.json'),
      path.join(__dirname, '../../config/path-resolution-config.json')
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        try {
          return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) {
          this._log(`Failed to load config from ${configPath}: ${e.message}`);
        }
      }
    }

    return this._getDefaultConfig();
  }

  /**
   * Get default configuration
   * @private
   */
  _getDefaultConfig() {
    return {
      resolution_order: [
        'env-override',
        'orgs-platform',
        'project-platform',
        'project-simple',
        'plugin-instances'
      ],
      patterns: [
        { name: 'orgs-platform', template: 'orgs/{org}/platforms/{platform}/{instance}' },
        { name: 'project-platform', template: 'instances/{platform}/{instance}' },
        { name: 'project-simple', template: 'instances/{instance}' },
        { name: 'plugin-instances', template: '.claude-plugins/{plugin}/instances/{instance}' }
      ]
    };
  }

  /**
   * Log message if verbose mode enabled
   * @private
   */
  _log(msg) {
    if (this.verbose) {
      console.log(`[PathResolver] ${msg}`);
    }
  }

  /**
   * Check if a path exists (async-safe wrapper)
   *
   * @param {string} p - Path to check
   * @returns {Promise<boolean>} True if exists
   */
  async exists(p) {
    return fs.existsSync(p);
  }

  /**
   * Resolve org directory path
   *
   * @param {string} orgSlug - Org slug to resolve
   * @returns {Promise<Object|null>} Resolution result with path and structure type
   */
  async resolveOrgPath(orgSlug) {
    // Check environment override
    const envPath = process.env.ORG_PATH;
    if (envPath && fs.existsSync(envPath)) {
      return { path: envPath, structure: 'env-override', found: true };
    }

    // Try new org-centric structure
    const newPath = path.join(this.basePath, 'orgs', orgSlug);
    if (await this.exists(newPath)) {
      return { path: newPath, structure: 'org-centric', found: true };
    }

    // Not found - return expected path for creation
    return { path: newPath, structure: 'org-centric', found: false };
  }

  /**
   * Resolve platform instance path
   *
   * @param {string} orgSlug - Org slug
   * @param {string} platform - Platform name (salesforce, hubspot, marketo)
   * @param {string} instance - Instance name
   * @returns {Promise<Object|null>} Resolution result
   */
  async resolvePlatformInstancePath(orgSlug, platform, instance) {
    // Check environment override
    const envPath = process.env.INSTANCE_PATH;
    if (envPath && fs.existsSync(envPath)) {
      return { path: envPath, structure: 'env-override', found: true };
    }

    // Build candidate paths in priority order
    const candidates = this._buildCandidates(orgSlug, platform, instance);

    // Try each candidate
    for (const candidate of candidates) {
      if (await this.exists(candidate.path)) {
        this._log(`Resolved ${instance} to ${candidate.path} (${candidate.structure})`);
        return { ...candidate, found: true };
      }
    }

    // Not found - return first candidate (preferred structure)
    const preferred = candidates[0];
    this._log(`${instance} not found, will use ${preferred.path}`);
    return { ...preferred, found: false };
  }

  /**
   * Build candidate paths in priority order
   * @private
   */
  _buildCandidates(orgSlug, platform, instance) {
    const candidates = [];

    // Priority 1: Org-centric (if orgSlug provided)
    if (orgSlug && this.preferOrgCentric) {
      candidates.push({
        path: path.join(this.basePath, 'orgs', orgSlug, 'platforms', platform, instance),
        structure: 'org-centric'
      });
    }

    // Priority 2: Org-centric with env var org
    const envOrg = process.env.ORG_SLUG || process.env.CLIENT_ORG;
    if (envOrg && envOrg !== orgSlug && this.preferOrgCentric) {
      candidates.push({
        path: path.join(this.basePath, 'orgs', envOrg, 'platforms', platform, instance),
        structure: 'org-centric'
      });
    }

    // Priority 3: Legacy platform pattern
    candidates.push({
      path: path.join(this.basePath, 'instances', platform, instance),
      structure: 'legacy-platform'
    });

    // Priority 4: Legacy simple pattern
    candidates.push({
      path: path.join(this.basePath, 'instances', instance),
      structure: 'legacy-simple'
    });

    // Priority 5: Plugin-specific paths
    const plugins = ['salesforce-plugin', 'hubspot-plugin', 'marketo-plugin'];
    for (const plugin of plugins) {
      candidates.push({
        path: path.join(this.basePath, '.claude-plugins', plugin, 'instances', instance),
        structure: 'plugin-specific'
      });
      candidates.push({
        path: path.join(this.basePath, '.claude-plugins', plugin, 'instances', platform, instance),
        structure: 'plugin-specific'
      });
    }

    return candidates;
  }

  /**
   * Resolve instance path (auto-detect org from instance name)
   *
   * @param {string} instance - Instance identifier (may include org prefix)
   * @param {string} platform - Platform name
   * @returns {Promise<Object>} Resolution result
   */
  async resolveInstancePath(instance, platform) {
    // Try to detect org from instance name
    const parts = instance.split('-');
    const envSuffixes = ['production', 'sandbox', 'main', 'dev', 'test', 'staging', 'uat'];

    let orgSlug = null;
    let instanceName = instance;

    // Check if instance name contains org prefix
    if (parts.length > 1 && envSuffixes.includes(parts[parts.length - 1])) {
      orgSlug = parts.slice(0, -1).join('-');
      instanceName = parts[parts.length - 1];
    }

    return this.resolvePlatformInstancePath(orgSlug, platform, instance);
  }

  /**
   * Get all legacy platform paths for an instance
   *
   * @param {string} platform - Platform name
   * @param {string} instance - Instance name
   * @returns {string[]} Array of legacy paths to check
   */
  getLegacyPlatformPaths(platform, instance) {
    const paths = [];

    // Standard legacy paths
    paths.push(path.join(this.basePath, 'instances', platform, instance));
    paths.push(path.join(this.basePath, 'instances', instance));

    // Plugin-specific legacy paths
    const pluginMap = {
      salesforce: 'salesforce-plugin',
      hubspot: 'hubspot-plugin',
      marketo: 'marketo-plugin'
    };

    const pluginName = pluginMap[platform];
    if (pluginName) {
      paths.push(path.join(this.basePath, '.claude-plugins', pluginName, 'instances', instance));
      paths.push(path.join(this.basePath, '.claude-plugins', pluginName, 'instances', platform, instance));

      // HubSpot uses 'portals' instead of 'instances'
      if (platform === 'hubspot') {
        paths.push(path.join(this.basePath, '.claude-plugins', pluginName, 'portals', instance));
      }
    }

    return paths;
  }

  /**
   * List all orgs in the orgs/ directory
   *
   * @returns {Promise<string[]>} Array of org slugs
   */
  async listOrgs() {
    const orgsDir = path.join(this.basePath, 'orgs');

    if (!fs.existsSync(orgsDir)) {
      return [];
    }

    return fs.readdirSync(orgsDir)
      .filter(f => {
        const fullPath = path.join(orgsDir, f);
        return fs.statSync(fullPath).isDirectory() && !f.startsWith('_') && !f.startsWith('.');
      });
  }

  /**
   * List all instances for a platform within an org
   *
   * @param {string} orgSlug - Org slug
   * @param {string} platform - Platform name
   * @returns {Promise<string[]>} Array of instance names
   */
  async listOrgInstances(orgSlug, platform) {
    const platformDir = path.join(this.basePath, 'orgs', orgSlug, 'platforms', platform);

    if (!fs.existsSync(platformDir)) {
      return [];
    }

    return fs.readdirSync(platformDir)
      .filter(f => {
        const fullPath = path.join(platformDir, f);
        return fs.statSync(fullPath).isDirectory() && !f.startsWith('_') && !f.startsWith('.');
      });
  }

  /**
   * List all instances across all orgs for a platform
   *
   * @param {string} platform - Platform name
   * @returns {Promise<Object[]>} Array of { org, instance, path } objects
   */
  async listAllInstances(platform) {
    const instances = [];

    // Check org-centric structure
    const orgs = await this.listOrgs();
    for (const org of orgs) {
      const orgInstances = await this.listOrgInstances(org, platform);
      for (const instance of orgInstances) {
        instances.push({
          org,
          instance,
          path: path.join(this.basePath, 'orgs', org, 'platforms', platform, instance),
          structure: 'org-centric'
        });
      }
    }

    // Check legacy structure
    const legacyDir = path.join(this.basePath, 'instances', platform);
    if (fs.existsSync(legacyDir)) {
      const legacyInstances = fs.readdirSync(legacyDir)
        .filter(f => {
          const fullPath = path.join(legacyDir, f);
          return fs.statSync(fullPath).isDirectory();
        });

      for (const instance of legacyInstances) {
        // Check if already in org-centric structure
        const alreadyFound = instances.some(i => i.instance === instance);
        if (!alreadyFound) {
          instances.push({
            org: null,
            instance,
            path: path.join(legacyDir, instance),
            structure: 'legacy-platform'
          });
        }
      }
    }

    return instances;
  }

  /**
   * Extract org, platform, and instance from any path format
   *
   * @param {string} instancePath - Path to parse
   * @returns {Object|null} Parsed components or null
   */
  extractFromPath(instancePath) {
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

    // Plugin-specific: .claude-plugins/{plugin}/instances/{instance}
    const pluginMatch = normalized.match(/\.claude-plugins\/([^/]+)\/(?:instances|portals)\/([^/]+)/);
    if (pluginMatch) {
      const plugin = pluginMatch[1];
      const instance = pluginMatch[2];
      const platformMap = {
        'salesforce-plugin': 'salesforce',
        'hubspot-plugin': 'hubspot',
        'marketo-plugin': 'marketo'
      };
      return {
        org: null,
        platform: platformMap[plugin] || null,
        instance,
        format: 'plugin-specific'
      };
    }

    return null;
  }

  /**
   * Get the org-centric path for an instance (create path even if doesn't exist)
   *
   * @param {string} orgSlug - Org slug
   * @param {string} platform - Platform name
   * @param {string} instance - Instance name
   * @param {string} [subdir] - Optional subdirectory
   * @returns {string} Org-centric path
   */
  getOrgCentricPath(orgSlug, platform, instance, subdir) {
    let instancePath = path.join(this.basePath, 'orgs', orgSlug, 'platforms', platform, instance);

    if (subdir) {
      instancePath = path.join(instancePath, subdir);
    }

    return instancePath;
  }

  /**
   * Ensure org-centric path exists
   *
   * @param {string} orgSlug - Org slug
   * @param {string} platform - Platform name
   * @param {string} instance - Instance name
   * @param {string} [subdir] - Optional subdirectory
   * @returns {string} Created path
   */
  ensureOrgCentricPath(orgSlug, platform, instance, subdir) {
    const targetPath = this.getOrgCentricPath(orgSlug, platform, instance, subdir);

    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    return targetPath;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const resolver = new PathResolver({ verbose: args.includes('--verbose') });

  async function run() {
    if (command === 'resolve' && args.length >= 3) {
      const [, platform, instance, org] = args;
      const result = await resolver.resolvePlatformInstancePath(org || null, platform, instance);
      console.log(JSON.stringify(result, null, 2));

    } else if (command === 'list-orgs') {
      const orgs = await resolver.listOrgs();
      console.log(orgs.join('\n') || '(no orgs found)');

    } else if (command === 'list-instances' && args.length >= 2) {
      const [, platform, org] = args;
      if (org) {
        const instances = await resolver.listOrgInstances(org, platform);
        console.log(instances.join('\n') || '(no instances found)');
      } else {
        const instances = await resolver.listAllInstances(platform);
        instances.forEach(i => console.log(`${i.org || '(legacy)'}/${i.instance}: ${i.path}`));
      }

    } else if (command === 'extract' && args.length >= 2) {
      const instancePath = args[1];
      const result = resolver.extractFromPath(instancePath);
      console.log(JSON.stringify(result, null, 2));

    } else {
      console.log(`Usage:
  node path-resolver.js resolve <platform> <instance> [org] [--verbose]
  node path-resolver.js list-orgs [--verbose]
  node path-resolver.js list-instances <platform> [org] [--verbose]
  node path-resolver.js extract <path> [--verbose]

Examples:
  node path-resolver.js resolve salesforce production acme
  node path-resolver.js list-orgs
  node path-resolver.js list-instances salesforce acme-corp
  node path-resolver.js extract "orgs/acme/platforms/salesforce/production"
`);
    }
  }

  run().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = { PathResolver };
