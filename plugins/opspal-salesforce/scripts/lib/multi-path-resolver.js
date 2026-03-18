#!/usr/bin/env node

/**
 * Multi-Path Resolver
 *
 * Purpose: Resolve instance paths across different project structures
 *
 * Problem Solved (11 reflections):
 * - Path convention mismatch: instances/{org} vs instances/salesforce/{org}
 * - Plugin scripts fail to find instance directories
 * - Relative vs absolute path confusion
 * - Cross-project path references
 *
 * Usage:
 *   const { PathResolver } = require('./multi-path-resolver');
 *   const resolver = new PathResolver();
 *   const instancePath = resolver.findInstancePath('orgAlias');
 *
 * ROI: Prevents 11 path errors, $900/year
 */

const fs = require('fs');
const path = require('path');

class PathNotFoundError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PathNotFoundError';
    this.details = details;
  }
}

class PathResolver {
  constructor(options = {}) {
    this.verbose = options.verbose !== false; // Verbose by default
    this.throwOnNotFound = options.throwOnNotFound !== false; // Throw by default
    this.cacheEnabled = options.cache !== false; // Cache enabled by default
    this._cache = new Map();
  }

  /**
   * Find instance directory path for an org alias
   *
   * Tries multiple path conventions in order:
   * 1. instances/{org} (plugin convention)
   * 2. instances/salesforce/{org} (project convention)
   * 3. instances/hubspot/{org} (HubSpot convention)
   * 4. ../instances/salesforce/{org} (relative from plugin)
   * 5. ../../instances/salesforce/{org} (deeper relative)
   * 6. Custom paths from options
   *
   * @param {string} orgAlias - Organization alias
   * @param {object} options - Search options
   * @returns {string} Resolved path
   */
  findInstancePath(orgAlias, options = {}) {
    const {
      platform = null, // 'salesforce', 'hubspot', or null for auto-detect
      customPaths = [],
      fromDirectory = process.cwd()
    } = options;

    // Check cache first
    const cacheKey = `${orgAlias}:${platform}:${fromDirectory}`;
    if (this.cacheEnabled && this._cache.has(cacheKey)) {
      const cached = this._cache.get(cacheKey);
      if (this.verbose) {
        console.log(`✓ Using cached path: ${cached}`);
      }
      return cached;
    }

    // Build candidate list based on platform
    const candidates = this._buildCandidates(orgAlias, platform, fromDirectory, customPaths);

    if (this.verbose) {
      console.log(`\nSearching for instance directory: ${orgAlias}`);
      console.log(`  From directory: ${fromDirectory}`);
      console.log(`  Platform filter: ${platform || 'any'}`);
      console.log(`  Trying ${candidates.length} candidate paths...\n`);
    }

    // Try each candidate
    for (const candidate of candidates) {
      const absPath = path.resolve(fromDirectory, candidate);

      if (fs.existsSync(absPath) && fs.statSync(absPath).isDirectory()) {
        if (this.verbose) {
          console.log(`✓ Found instance at: ${candidate}`);
          console.log(`  Absolute path: ${absPath}\n`);
        }

        // Cache the result
        if (this.cacheEnabled) {
          this._cache.set(cacheKey, candidate);
        }

        return candidate;
      } else if (this.verbose) {
        console.log(`  ✗ Not found: ${candidate}`);
      }
    }

    // Not found
    const error = new PathNotFoundError(
      `Could not find instance directory for "${orgAlias}"`,
      {
        orgAlias,
        platform,
        fromDirectory,
        candidatesTried: candidates,
        suggestion: this._getSuggestion(orgAlias, fromDirectory)
      }
    );

    if (this.throwOnNotFound) {
      console.error(`\n❌ ${error.message}`);
      console.error(`\nTried ${candidates.length} locations:`);
      candidates.forEach(c => console.error(`  - ${c}`));
      console.error(`\n${error.details.suggestion}\n`);
      throw error;
    }

    return null;
  }

  /**
   * Build list of candidate paths to try
   *
   * Priority order:
   * 1. Custom paths (explicit overrides)
   * 2. Environment-provided paths
   * 3. Org-centric paths: orgs/{org}/platforms/{platform}/ (NEW - preferred)
   * 4. Legacy paths: instances/{platform}/{org}/ (backward compatibility)
   */
  _buildCandidates(orgAlias, platform, fromDirectory, customPaths) {
    const candidates = [];

    // Custom paths (highest priority)
    customPaths.forEach(p => {
      candidates.push(path.join(p, orgAlias));
    });

    // Environment-provided root paths
    this._getEnvRoots().forEach(root => {
      candidates.push(path.join(root, orgAlias));
    });

    // Get org slug from environment (for org-centric paths)
    const orgSlug = process.env.ORG_SLUG || process.env.CLIENT_ORG || orgAlias;

    // NEW: Org-centric paths (PREFERRED - check these first)
    if (!platform || platform === 'salesforce') {
      candidates.push(
        `orgs/${orgSlug}/platforms/salesforce/${orgAlias}`,  // Org-centric with instance
        `orgs/${orgSlug}/platforms/salesforce/production`,    // Common production alias
        `orgs/${orgAlias}/platforms/salesforce/production`,   // orgAlias as org
        `../orgs/${orgSlug}/platforms/salesforce/${orgAlias}`,  // Relative from plugin
        `../../orgs/${orgSlug}/platforms/salesforce/${orgAlias}`,  // Deeper relative
      );
    }

    if (!platform || platform === 'hubspot') {
      candidates.push(
        `orgs/${orgSlug}/platforms/hubspot/${orgAlias}`,
        `orgs/${orgAlias}/platforms/hubspot/main`,
        `../orgs/${orgSlug}/platforms/hubspot/${orgAlias}`,
      );
    }

    // LEGACY: Platform-specific paths (backward compatibility)
    if (!platform || platform === 'salesforce') {
      candidates.push(
        `instances/${orgAlias}`,  // Plugin convention (legacy)
        `instances/salesforce/${orgAlias}`,  // Project convention (legacy)
        `../instances/salesforce/${orgAlias}`,  // Relative from plugin
        `../../instances/salesforce/${orgAlias}`,  // Deeper relative
        `../../../instances/salesforce/${orgAlias}`,  // Even deeper
      );
    }

    if (!platform || platform === 'hubspot') {
      candidates.push(
        `instances/hubspot/${orgAlias}`,
        `../instances/hubspot/${orgAlias}`,
        `../../instances/hubspot/${orgAlias}`
      );
    }

    // SFDC-specific alternate naming (legacy)
    if (!platform || platform === 'salesforce') {
      candidates.push(
        `SFDC/instances/${orgAlias}`,
        `opspal-internal/SFDC/instances/${orgAlias}`,
        `../SFDC/instances/${orgAlias}`
      );
    }

    // Remove duplicates while preserving order
    return [...new Set(candidates)];
  }

  /**
   * Get suggestion message for user
   */
  _getSuggestion(orgAlias, fromDirectory) {
    const orgSlug = process.env.ORG_SLUG || process.env.CLIENT_ORG || orgAlias;
    const suggestions = [
      `\nSuggestions:`,
      `1. Create the instance directory (RECOMMENDED - org-centric):`,
      `   mkdir -p orgs/${orgSlug}/platforms/salesforce/${orgAlias}`,
      `   mkdir -p orgs/${orgSlug}/platforms/hubspot/${orgAlias}`,
      ``,
      `   Or legacy format (still supported):`,
      `   mkdir -p instances/salesforce/${orgAlias}`,
      ``,
      `2. Set ORG_SLUG environment variable:`,
      `   export ORG_SLUG=${orgSlug}`,
      ``,
      `3. Specify custom path with --instances-path option:`,
      `   --instances-path=/path/to/instances`,
      ``,
      `4. Check if org alias is correct:`,
      `   sf org list`,
      `   sf org display --target-org ${orgAlias}`,
      ``,
      `5. Verify you're in the correct project directory:`,
      `   Current: ${fromDirectory}`,
      ``
    ];

    return suggestions.join('\n');
  }

  /**
   * Find all instance directories (discovery mode)
   *
   * @param {object} options - Search options
   * @returns {object[]} Array of found instances
   */
  discoverInstances(options = {}) {
    const {
      platform = null,
      fromDirectory = process.cwd()
    } = options;

    const instances = [];

    // Get org slug from environment
    const orgSlug = process.env.ORG_SLUG || process.env.CLIENT_ORG;

    // Build base paths in priority order (org-centric first)
    const basePaths = [];

    // NEW: Org-centric paths (preferred)
    if (orgSlug) {
      basePaths.push(
        `orgs/${orgSlug}/platforms/salesforce`,
        `orgs/${orgSlug}/platforms/hubspot`,
        `../orgs/${orgSlug}/platforms/salesforce`,
        `../orgs/${orgSlug}/platforms/hubspot`
      );
    }
    // Also search orgs/ directory directly
    basePaths.push(
      'orgs',
      '../orgs'
    );

    // Legacy paths (backward compatibility)
    basePaths.push(
      'instances',
      'instances/salesforce',
      'instances/hubspot',
      '../instances/salesforce',
      '../instances/hubspot',
      'SFDC/instances',
      'opspal-internal/SFDC/instances'
    );

    this._getEnvRoots().forEach(root => {
      basePaths.push(root);
    });

    basePaths.forEach(basePath => {
      const absPath = path.resolve(fromDirectory, basePath);

      if (fs.existsSync(absPath) && fs.statSync(absPath).isDirectory()) {
        const dirs = fs.readdirSync(absPath);

        dirs.forEach(dir => {
          const instancePath = path.join(basePath, dir);
          const absInstancePath = path.resolve(fromDirectory, instancePath);

          if (fs.statSync(absInstancePath).isDirectory()) {
            // Detect platform from path
            const detectedPlatform = this._detectPlatform(instancePath);

            if (!platform || platform === detectedPlatform) {
              instances.push({
                orgAlias: dir,
                path: instancePath,
                absolutePath: absInstancePath,
                platform: detectedPlatform
              });
            }
          }
        });
      }
    });

    // Remove duplicates (same org in multiple locations)
    const uniqueInstances = [];
    const seen = new Set();

    instances.forEach(inst => {
      if (!seen.has(inst.orgAlias)) {
        seen.add(inst.orgAlias);
        uniqueInstances.push(inst);
      }
    });

    return uniqueInstances;
  }

  /**
   * Detect platform from path
   * Supports both org-centric (orgs/{org}/platforms/{platform}/) and legacy patterns
   */
  _detectPlatform(instancePath) {
    // Check for org-centric pattern: orgs/{org}/platforms/{platform}/
    const orgCentricMatch = instancePath.match(/orgs\/[^/]+\/platforms\/([^/]+)/);
    if (orgCentricMatch) {
      return orgCentricMatch[1];  // Return the platform name directly
    }

    // Legacy detection
    if (instancePath.includes('salesforce') || instancePath.includes('SFDC')) {
      return 'salesforce';
    }
    if (instancePath.includes('hubspot')) {
      return 'hubspot';
    }
    if (instancePath.includes('marketo')) {
      return 'marketo';
    }
    return 'unknown';
  }

  /**
   * Clear path cache
   */
  clearCache() {
    this._cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this._cache.size,
      keys: Array.from(this._cache.keys())
    };
  }

  _getEnvRoots() {
    return [
      process.env.SFDC_INSTANCES_ROOT,
      process.env.SFDC_INSTANCES_DIR,
      process.env.INSTANCES_DIR
    ].filter(Boolean);
  }
}

/**
 * Convenience function for one-off lookups
 */
function findInstancePath(orgAlias, options = {}) {
  const resolver = new PathResolver(options);
  return resolver.findInstancePath(orgAlias, options);
}

/**
 * Convenience function for instance discovery
 */
function discoverInstances(options = {}) {
  const resolver = new PathResolver(options);
  return resolver.discoverInstances(options);
}

module.exports = {
  PathResolver,
  PathNotFoundError,
  findInstancePath,
  discoverInstances
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log('Usage: node multi-path-resolver.js [command] [options]');
    console.log('');
    console.log('Commands:');
    console.log('  find <org-alias>       Find instance path for org');
    console.log('  discover               List all discovered instances');
    console.log('');
    console.log('Options:');
    console.log('  --platform=<name>      Filter by platform (salesforce, hubspot)');
    console.log('  --custom-path=<path>   Add custom search path');
    console.log('  --quiet                Suppress verbose output');
    console.log('');
    console.log('Examples:');
    console.log('  node multi-path-resolver.js find production');
    console.log('  node multi-path-resolver.js find gamma-corp --platform=salesforce');
    console.log('  node multi-path-resolver.js discover');
    console.log('  node multi-path-resolver.js discover --platform=salesforce');
    process.exit(0);
  }

  const command = args[0];
  const verbose = !args.includes('--quiet');

  const platformArg = args.find(a => a.startsWith('--platform='));
  const platform = platformArg ? platformArg.split('=')[1] : null;

  const customPathArg = args.find(a => a.startsWith('--custom-path='));
  const customPaths = customPathArg ? [customPathArg.split('=')[1]] : [];

  const resolver = new PathResolver({ verbose, throwOnNotFound: false });

  if (command === 'find') {
    const orgAlias = args[1];
    if (!orgAlias) {
      console.error('Error: org-alias required for find command');
      process.exit(1);
    }

    const result = resolver.findInstancePath(orgAlias, {
      platform,
      customPaths
    });

    if (result) {
      console.log(`\n✅ Instance path: ${result}`);
      process.exit(0);
    } else {
      console.log(`\n❌ Instance not found: ${orgAlias}`);
      process.exit(1);
    }

  } else if (command === 'discover') {
    console.log('\n🔍 Discovering instances...\n');

    const instances = resolver.discoverInstances({ platform });

    if (instances.length === 0) {
      console.log('No instances found.');
      process.exit(0);
    }

    console.log(`Found ${instances.length} instance(s):\n`);

    instances.forEach((inst, index) => {
      console.log(`${index + 1}. ${inst.orgAlias}`);
      console.log(`   Platform: ${inst.platform}`);
      console.log(`   Path: ${inst.path}`);
      console.log(`   Absolute: ${inst.absolutePath}`);
      console.log('');
    });

    process.exit(0);

  } else {
    console.error(`Error: Unknown command: ${command}`);
    console.error('Use --help for usage information');
    process.exit(1);
  }
}
