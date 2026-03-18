#!/usr/bin/env node

/**
 * YAML Metadata Loader
 *
 * Loads and parses org.yaml and instance.yaml metadata files
 * from the org-centric folder structure.
 *
 * Usage:
 *   const { MetadataLoader } = require('./metadata-loader');
 *   const loader = new MetadataLoader();
 *   const orgMeta = await loader.loadOrgMetadata('acme');
 *   const instanceMeta = await loader.loadInstanceMetadata('acme', 'salesforce', 'production');
 *
 * @module metadata-loader
 */

const fs = require('fs');
const path = require('path');

// Try to load js-yaml, fall back to basic YAML parsing if not available
let yaml;
try {
  yaml = require('js-yaml');
} catch (e) {
  // Provide basic YAML parsing fallback
  yaml = {
    load: (content) => {
      // Very basic YAML parser for simple key-value structures
      const result = {};
      const lines = content.split('\n');
      let currentKey = null;
      let currentIndent = 0;
      const stack = [result];

      for (const line of lines) {
        // Skip comments and empty lines
        if (line.trim().startsWith('#') || line.trim() === '') continue;

        const match = line.match(/^(\s*)([^:]+):\s*(.*)$/);
        if (match) {
          const indent = match[1].length;
          const key = match[2].trim();
          let value = match[3].trim();

          // Handle quoted strings
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          // Handle simple types
          if (value === 'null' || value === '~') value = null;
          else if (value === 'true') value = true;
          else if (value === 'false') value = false;
          else if (value !== '' && !isNaN(value)) value = Number(value);

          // For simplicity, add to result at top level
          // This is a basic fallback - install js-yaml for full support
          result[key] = value || {};
        }
      }

      return result;
    },
    dump: (obj) => {
      // Basic YAML serialization
      const lines = [];
      const serialize = (o, indent = 0) => {
        const prefix = '  '.repeat(indent);
        for (const [key, value] of Object.entries(o)) {
          if (value === null) {
            lines.push(`${prefix}${key}: null`);
          } else if (typeof value === 'object' && !Array.isArray(value)) {
            lines.push(`${prefix}${key}:`);
            serialize(value, indent + 1);
          } else if (Array.isArray(value)) {
            lines.push(`${prefix}${key}:`);
            for (const item of value) {
              if (typeof item === 'object') {
                lines.push(`${prefix}  -`);
                serialize(item, indent + 2);
              } else {
                lines.push(`${prefix}  - ${item}`);
              }
            }
          } else {
            lines.push(`${prefix}${key}: ${value}`);
          }
        }
      };
      serialize(obj);
      return lines.join('\n');
    }
  };
}

/**
 * MetadataLoader class for loading org and instance metadata
 */
class MetadataLoader {
  /**
   * Create a MetadataLoader instance
   *
   * @param {Object} options - Configuration options
   * @param {string} [options.basePath] - Base path for resolution (default: cwd)
   * @param {boolean} [options.createIfMissing] - Create metadata files if missing (default: false)
   * @param {boolean} [options.verbose] - Enable verbose logging (default: false)
   */
  constructor(options = {}) {
    this.basePath = options.basePath || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
    this.createIfMissing = options.createIfMissing || false;
    this.verbose = options.verbose || false;
    this.cache = new Map();
  }

  /**
   * Log message if verbose mode enabled
   * @private
   */
  _log(msg) {
    if (this.verbose) {
      console.log(`[MetadataLoader] ${msg}`);
    }
  }

  /**
   * Get the path to org metadata file
   *
   * @param {string} orgSlug - Org slug
   * @returns {string} Path to org.yaml
   */
  getOrgMetadataPath(orgSlug) {
    return path.join(this.basePath, 'orgs', orgSlug, '_meta', 'org.yaml');
  }

  /**
   * Get the path to instance metadata file
   *
   * @param {string} orgSlug - Org slug
   * @param {string} platform - Platform name
   * @param {string} instance - Instance name
   * @returns {string} Path to instance.yaml
   */
  getInstanceMetadataPath(orgSlug, platform, instance) {
    return path.join(
      this.basePath,
      'orgs',
      orgSlug,
      'platforms',
      platform,
      instance,
      '_meta',
      'instance.yaml'
    );
  }

  /**
   * Load org metadata from org.yaml
   *
   * @param {string} orgSlug - Org slug to load
   * @returns {Promise<Object|null>} Org metadata or null if not found
   */
  async loadOrgMetadata(orgSlug) {
    const cacheKey = `org:${orgSlug}`;
    if (this.cache.has(cacheKey)) {
      this._log(`Cache hit for ${cacheKey}`);
      return this.cache.get(cacheKey);
    }

    const metadataPath = this.getOrgMetadataPath(orgSlug);
    this._log(`Loading org metadata from ${metadataPath}`);

    if (!fs.existsSync(metadataPath)) {
      this._log(`Org metadata not found: ${metadataPath}`);

      if (this.createIfMissing) {
        const defaultMetadata = this._createDefaultOrgMetadata(orgSlug);
        await this.saveOrgMetadata(orgSlug, defaultMetadata);
        return defaultMetadata;
      }

      return null;
    }

    try {
      const content = fs.readFileSync(metadataPath, 'utf8');
      const metadata = yaml.load(content);
      this.cache.set(cacheKey, metadata);
      return metadata;
    } catch (error) {
      this._log(`Error loading org metadata: ${error.message}`);
      return null;
    }
  }

  /**
   * Load instance metadata from instance.yaml
   *
   * @param {string} orgSlug - Org slug
   * @param {string} platform - Platform name
   * @param {string} instance - Instance name
   * @returns {Promise<Object|null>} Instance metadata or null if not found
   */
  async loadInstanceMetadata(orgSlug, platform, instance) {
    const cacheKey = `instance:${orgSlug}:${platform}:${instance}`;
    if (this.cache.has(cacheKey)) {
      this._log(`Cache hit for ${cacheKey}`);
      return this.cache.get(cacheKey);
    }

    const metadataPath = this.getInstanceMetadataPath(orgSlug, platform, instance);
    this._log(`Loading instance metadata from ${metadataPath}`);

    if (!fs.existsSync(metadataPath)) {
      this._log(`Instance metadata not found: ${metadataPath}`);

      if (this.createIfMissing) {
        const defaultMetadata = this._createDefaultInstanceMetadata(orgSlug, platform, instance);
        await this.saveInstanceMetadata(orgSlug, platform, instance, defaultMetadata);
        return defaultMetadata;
      }

      return null;
    }

    try {
      const content = fs.readFileSync(metadataPath, 'utf8');
      const metadata = yaml.load(content);
      this.cache.set(cacheKey, metadata);
      return metadata;
    } catch (error) {
      this._log(`Error loading instance metadata: ${error.message}`);
      return null;
    }
  }

  /**
   * Save org metadata to org.yaml
   *
   * @param {string} orgSlug - Org slug
   * @param {Object} metadata - Metadata to save
   * @returns {Promise<boolean>} Success status
   */
  async saveOrgMetadata(orgSlug, metadata) {
    const metadataPath = this.getOrgMetadataPath(orgSlug);
    const metadataDir = path.dirname(metadataPath);

    try {
      if (!fs.existsSync(metadataDir)) {
        fs.mkdirSync(metadataDir, { recursive: true });
      }

      const content = yaml.dump(metadata);
      fs.writeFileSync(metadataPath, content, 'utf8');

      // Update cache
      this.cache.set(`org:${orgSlug}`, metadata);

      this._log(`Saved org metadata to ${metadataPath}`);
      return true;
    } catch (error) {
      this._log(`Error saving org metadata: ${error.message}`);
      return false;
    }
  }

  /**
   * Save instance metadata to instance.yaml
   *
   * @param {string} orgSlug - Org slug
   * @param {string} platform - Platform name
   * @param {string} instance - Instance name
   * @param {Object} metadata - Metadata to save
   * @returns {Promise<boolean>} Success status
   */
  async saveInstanceMetadata(orgSlug, platform, instance, metadata) {
    const metadataPath = this.getInstanceMetadataPath(orgSlug, platform, instance);
    const metadataDir = path.dirname(metadataPath);

    try {
      if (!fs.existsSync(metadataDir)) {
        fs.mkdirSync(metadataDir, { recursive: true });
      }

      const content = yaml.dump(metadata);
      fs.writeFileSync(metadataPath, content, 'utf8');

      // Update cache
      this.cache.set(`instance:${orgSlug}:${platform}:${instance}`, metadata);

      this._log(`Saved instance metadata to ${metadataPath}`);
      return true;
    } catch (error) {
      this._log(`Error saving instance metadata: ${error.message}`);
      return false;
    }
  }

  /**
   * Enrich a context object with org and instance metadata
   *
   * @param {Object} context - Existing context to enrich
   * @param {string} orgSlug - Org slug
   * @param {string} platform - Platform name
   * @param {string} instance - Instance name
   * @returns {Promise<Object>} Enriched context
   */
  async enrichContextWithMetadata(context, orgSlug, platform, instance) {
    const enrichedContext = { ...context };

    // Load org metadata
    const orgMetadata = await this.loadOrgMetadata(orgSlug);
    if (orgMetadata) {
      enrichedContext.org = {
        ...enrichedContext.org,
        slug: orgSlug,
        displayName: orgMetadata.display_name,
        industry: orgMetadata.business?.industry,
        tags: orgMetadata.tags || [],
        relationships: orgMetadata.relationships || {},
        platforms: orgMetadata.platforms || {}
      };
    }

    // Load instance metadata
    const instanceMetadata = await this.loadInstanceMetadata(orgSlug, platform, instance);
    if (instanceMetadata) {
      enrichedContext.instance = {
        ...enrichedContext.instance,
        name: instance,
        platform: platform,
        environmentType: instanceMetadata.environment_type,
        platformIds: instanceMetadata.platform_ids || {},
        config: instanceMetadata.config || {},
        quirks: instanceMetadata.quirks || {},
        assessments: instanceMetadata.assessments || []
      };
    }

    // Add metadata paths for reference
    enrichedContext._metadata = {
      orgPath: this.getOrgMetadataPath(orgSlug),
      instancePath: this.getInstanceMetadataPath(orgSlug, platform, instance),
      loaded: {
        org: !!orgMetadata,
        instance: !!instanceMetadata
      }
    };

    return enrichedContext;
  }

  /**
   * Create default org metadata structure
   * @private
   */
  _createDefaultOrgMetadata(orgSlug) {
    return {
      schema_version: '1.0.0',
      org_slug: orgSlug,
      display_name: this._slugToDisplayName(orgSlug),
      created_at: new Date().toISOString(),
      business: {
        industry: null,
        size: null,
        region: null
      },
      platforms: {},
      relationships: {
        salesforce_hubspot_sync: false,
        primary_crm: null
      },
      tags: [],
      migration: {
        migrated_at: new Date().toISOString(),
        source_locations: [],
        files_migrated: 0
      }
    };
  }

  /**
   * Create default instance metadata structure
   * @private
   */
  _createDefaultInstanceMetadata(orgSlug, platform, instance) {
    return {
      schema_version: '1.0.0',
      instance_name: instance,
      platform: platform,
      org_slug: orgSlug,
      environment_type: this._detectEnvironmentType(instance),
      platform_ids: this._getDefaultPlatformIds(platform),
      config: {
        api_version: this._getDefaultApiVersion(platform)
      },
      quirks: {},
      assessments: [],
      migration: {
        migrated_at: new Date().toISOString(),
        source_path: null
      }
    };
  }

  /**
   * Convert slug to display name
   * @private
   */
  _slugToDisplayName(slug) {
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Detect environment type from instance name
   * @private
   */
  _detectEnvironmentType(instance) {
    const lowerInstance = instance.toLowerCase();
    if (lowerInstance.includes('prod')) return 'production';
    if (lowerInstance.includes('sandbox') || lowerInstance.includes('sbx')) return 'sandbox';
    if (lowerInstance.includes('dev')) return 'development';
    if (lowerInstance.includes('test') || lowerInstance.includes('qa')) return 'test';
    if (lowerInstance.includes('uat') || lowerInstance.includes('staging')) return 'staging';
    if (lowerInstance === 'main' || lowerInstance === 'default') return 'production';
    return 'unknown';
  }

  /**
   * Get default platform IDs structure
   * @private
   */
  _getDefaultPlatformIds(platform) {
    switch (platform) {
      case 'salesforce':
        return {
          salesforce: {
            org_id: null,
            instance_url: null
          }
        };
      case 'hubspot':
        return {
          hubspot: {
            portal_id: null,
            hub_id: null
          }
        };
      case 'marketo':
        return {
          marketo: {
            munchkin_id: null,
            instance_id: null
          }
        };
      default:
        return {};
    }
  }

  /**
   * Get default API version for platform
   * @private
   */
  _getDefaultApiVersion(platform) {
    switch (platform) {
      case 'salesforce':
        return '62.0';
      case 'hubspot':
        return 'v3';
      case 'marketo':
        return 'v1';
      default:
        return null;
    }
  }

  /**
   * List all orgs with metadata
   *
   * @returns {Promise<Object[]>} Array of org metadata objects
   */
  async listOrgsWithMetadata() {
    const orgsDir = path.join(this.basePath, 'orgs');

    if (!fs.existsSync(orgsDir)) {
      return [];
    }

    const orgDirs = fs.readdirSync(orgsDir)
      .filter(f => {
        const fullPath = path.join(orgsDir, f);
        return fs.statSync(fullPath).isDirectory() && !f.startsWith('_') && !f.startsWith('.');
      });

    const orgs = [];
    for (const orgSlug of orgDirs) {
      const metadata = await this.loadOrgMetadata(orgSlug);
      orgs.push({
        slug: orgSlug,
        metadata: metadata,
        hasMetadata: !!metadata
      });
    }

    return orgs;
  }

  /**
   * List all instances for an org with metadata
   *
   * @param {string} orgSlug - Org slug
   * @param {string} [platform] - Optional platform filter
   * @returns {Promise<Object[]>} Array of instance metadata objects
   */
  async listInstancesWithMetadata(orgSlug, platform = null) {
    const platformsDir = path.join(this.basePath, 'orgs', orgSlug, 'platforms');

    if (!fs.existsSync(platformsDir)) {
      return [];
    }

    const platforms = platform
      ? [platform]
      : fs.readdirSync(platformsDir).filter(f => {
          const fullPath = path.join(platformsDir, f);
          return fs.statSync(fullPath).isDirectory();
        });

    const instances = [];
    for (const plat of platforms) {
      const platDir = path.join(platformsDir, plat);
      if (!fs.existsSync(platDir)) continue;

      const instanceDirs = fs.readdirSync(platDir)
        .filter(f => {
          const fullPath = path.join(platDir, f);
          return fs.statSync(fullPath).isDirectory() && !f.startsWith('_');
        });

      for (const inst of instanceDirs) {
        const metadata = await this.loadInstanceMetadata(orgSlug, plat, inst);
        instances.push({
          org: orgSlug,
          platform: plat,
          instance: inst,
          metadata: metadata,
          hasMetadata: !!metadata
        });
      }
    }

    return instances;
  }

  /**
   * Clear the metadata cache
   */
  clearCache() {
    this.cache.clear();
    this._log('Cache cleared');
  }

  /**
   * Update assessment record in instance metadata
   *
   * @param {string} orgSlug - Org slug
   * @param {string} platform - Platform name
   * @param {string} instance - Instance name
   * @param {Object} assessment - Assessment record to add
   * @returns {Promise<boolean>} Success status
   */
  async addAssessment(orgSlug, platform, instance, assessment) {
    const metadata = await this.loadInstanceMetadata(orgSlug, platform, instance);
    if (!metadata) {
      this._log(`Cannot add assessment: instance metadata not found`);
      return false;
    }

    if (!metadata.assessments) {
      metadata.assessments = [];
    }

    metadata.assessments.push({
      type: assessment.type,
      date: assessment.date || new Date().toISOString().split('T')[0],
      path: assessment.path,
      status: assessment.status || 'completed',
      findings: assessment.findings || null
    });

    return this.saveInstanceMetadata(orgSlug, platform, instance, metadata);
  }

  /**
   * Get recent assessments for an instance
   *
   * @param {string} orgSlug - Org slug
   * @param {string} platform - Platform name
   * @param {string} instance - Instance name
   * @param {string} [type] - Optional assessment type filter
   * @param {number} [limit] - Maximum number to return
   * @returns {Promise<Object[]>} Array of assessment records
   */
  async getAssessments(orgSlug, platform, instance, type = null, limit = 10) {
    const metadata = await this.loadInstanceMetadata(orgSlug, platform, instance);
    if (!metadata || !metadata.assessments) {
      return [];
    }

    let assessments = metadata.assessments;

    if (type) {
      assessments = assessments.filter(a => a.type === type);
    }

    // Sort by date descending
    assessments.sort((a, b) => new Date(b.date) - new Date(a.date));

    return assessments.slice(0, limit);
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const loader = new MetadataLoader({ verbose: args.includes('--verbose') });

  async function run() {
    if (command === 'load-org' && args.length >= 2) {
      const orgSlug = args[1];
      const metadata = await loader.loadOrgMetadata(orgSlug);
      console.log(JSON.stringify(metadata, null, 2));

    } else if (command === 'load-instance' && args.length >= 4) {
      const [, orgSlug, platform, instance] = args;
      const metadata = await loader.loadInstanceMetadata(orgSlug, platform, instance);
      console.log(JSON.stringify(metadata, null, 2));

    } else if (command === 'list-orgs') {
      const orgs = await loader.listOrgsWithMetadata();
      console.log(JSON.stringify(orgs, null, 2));

    } else if (command === 'list-instances' && args.length >= 2) {
      const [, orgSlug, platform] = args;
      const instances = await loader.listInstancesWithMetadata(orgSlug, platform);
      console.log(JSON.stringify(instances, null, 2));

    } else if (command === 'enrich' && args.length >= 4) {
      const [, orgSlug, platform, instance] = args;
      const enriched = await loader.enrichContextWithMetadata({}, orgSlug, platform, instance);
      console.log(JSON.stringify(enriched, null, 2));

    } else {
      console.log(`Usage:
  node metadata-loader.js load-org <org-slug> [--verbose]
  node metadata-loader.js load-instance <org-slug> <platform> <instance> [--verbose]
  node metadata-loader.js list-orgs [--verbose]
  node metadata-loader.js list-instances <org-slug> [platform] [--verbose]
  node metadata-loader.js enrich <org-slug> <platform> <instance> [--verbose]

Examples:
  node metadata-loader.js load-org acme
  node metadata-loader.js load-instance acme salesforce production
  node metadata-loader.js list-orgs
  node metadata-loader.js list-instances acme salesforce
  node metadata-loader.js enrich acme salesforce production
`);
    }
  }

  run().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = { MetadataLoader };
