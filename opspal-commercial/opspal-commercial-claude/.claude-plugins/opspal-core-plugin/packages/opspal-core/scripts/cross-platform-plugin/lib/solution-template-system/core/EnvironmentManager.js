#!/usr/bin/env node

/**
 * EnvironmentManager - Environment Profile Management
 *
 * Manages environment profiles with inheritance support for solution deployments.
 * Handles credential resolution, field mappings, and environment-specific configuration.
 *
 * Features:
 * - Profile inheritance (extends property)
 * - Environment variable resolution
 * - Field mapping management
 * - Credential validation (without exposing secrets)
 * - Profile caching for performance
 *
 * @module solution-template-system/core/EnvironmentManager
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Default environments directory
const DEFAULT_ENVIRONMENTS_DIR = path.resolve(__dirname, '../../../solutions/environments');

/**
 * Environment Profile Manager
 */
class EnvironmentManager {
  /**
   * Create a new EnvironmentManager instance
   * @param {Object} options - Manager options
   * @param {string} [options.environmentsDir] - Path to environments directory
   * @param {boolean} [options.cacheProfiles=true] - Cache loaded profiles
   * @param {boolean} [options.validateOnLoad=true] - Validate profiles when loading
   */
  constructor(options = {}) {
    this.environmentsDir = options.environmentsDir || DEFAULT_ENVIRONMENTS_DIR;
    this.cacheProfiles = options.cacheProfiles !== false;
    this.validateOnLoad = options.validateOnLoad !== false;

    // Profile cache
    this.cache = new Map();

    // Ensure environments directory exists
    if (!fs.existsSync(this.environmentsDir)) {
      fs.mkdirSync(this.environmentsDir, { recursive: true });
    }
  }

  /**
   * Load an environment profile by name
   * @param {string} profileName - Profile name (without .json extension)
   * @param {Object} [options] - Load options
   * @param {boolean} [options.resolveInheritance=true] - Resolve profile inheritance
   * @param {boolean} [options.resolveEnvVars=true] - Resolve environment variables
   * @returns {Object} Loaded and merged profile
   */
  loadProfile(profileName, options = {}) {
    const resolveInheritance = options.resolveInheritance !== false;
    const resolveEnvVars = options.resolveEnvVars !== false;

    // Check cache first
    const cacheKey = `${profileName}-${resolveInheritance}-${resolveEnvVars}`;
    if (this.cacheProfiles && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Find profile file
    const profilePath = this.resolveProfilePath(profileName);
    if (!profilePath) {
      throw new Error(`Environment profile not found: ${profileName}`);
    }

    // Load profile
    let profile = this.loadProfileFile(profilePath);

    // Resolve inheritance
    if (resolveInheritance && profile.extends) {
      profile = this.resolveInheritance(profile, profilePath);
    }

    // Resolve environment variables
    if (resolveEnvVars) {
      profile = this.resolveEnvironmentVariables(profile);
    }

    // Validate if enabled
    if (this.validateOnLoad) {
      const validation = this.validateProfile(profile);
      if (!validation.valid) {
        console.warn(`Profile validation warnings for ${profileName}:`, validation.warnings);
      }
    }

    // Cache result
    if (this.cacheProfiles) {
      this.cache.set(cacheKey, profile);
    }

    return profile;
  }

  /**
   * Resolve the path to a profile file
   * @param {string} profileName - Profile name or path
   * @returns {string|null} Full path to profile file or null if not found
   */
  resolveProfilePath(profileName) {
    // Check if it's an absolute path
    if (path.isAbsolute(profileName)) {
      return fs.existsSync(profileName) ? profileName : null;
    }

    // Check if it already has .json extension
    const nameWithExt = profileName.endsWith('.json') ? profileName : `${profileName}.json`;

    // Check in main environments directory
    let fullPath = path.join(this.environmentsDir, nameWithExt);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }

    // Check in clients subdirectory
    fullPath = path.join(this.environmentsDir, 'clients', nameWithExt);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }

    // Check relative to current working directory
    fullPath = path.resolve(process.cwd(), nameWithExt);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }

    return null;
  }

  /**
   * Load a profile file from disk
   * @param {string} profilePath - Path to profile file
   * @returns {Object} Profile data
   */
  loadProfileFile(profilePath) {
    try {
      const content = fs.readFileSync(profilePath, 'utf-8');
      const profile = JSON.parse(content);
      profile._sourcePath = profilePath;
      return profile;
    } catch (e) {
      throw new Error(`Failed to load profile ${profilePath}: ${e.message}`);
    }
  }

  /**
   * Resolve profile inheritance chain
   * @param {Object} profile - Profile with extends property
   * @param {string} currentPath - Path of current profile (for relative resolution)
   * @param {Set} [visited] - Set of visited profiles (to detect cycles)
   * @returns {Object} Merged profile
   */
  resolveInheritance(profile, currentPath, visited = new Set()) {
    if (!profile.extends) {
      return profile;
    }

    // Detect cycles
    const profileId = profile.name || currentPath;
    if (visited.has(profileId)) {
      throw new Error(`Circular inheritance detected: ${Array.from(visited).join(' -> ')} -> ${profileId}`);
    }
    visited.add(profileId);

    // Resolve parent path relative to current profile
    const parentPath = path.isAbsolute(profile.extends)
      ? profile.extends
      : path.resolve(path.dirname(currentPath), profile.extends);

    // Load parent profile
    let parent = this.loadProfileFile(parentPath);

    // Recursively resolve parent's inheritance
    if (parent.extends) {
      parent = this.resolveInheritance(parent, parentPath, visited);
    }

    // Deep merge: child properties override parent
    const merged = this.deepMerge(parent, profile);

    // Remove extends from merged result
    delete merged.extends;

    return merged;
  }

  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object (overrides target)
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      if (source[key] === null || source[key] === undefined) {
        continue;
      }

      if (
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        // Recursively merge objects
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        // Override with source value
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Resolve environment variable references in profile
   * Syntax: {{env.VAR_NAME}} or ${VAR_NAME}
   * @param {Object} profile - Profile with env var references
   * @returns {Object} Profile with resolved values
   */
  resolveEnvironmentVariables(profile) {
    const resolved = JSON.parse(JSON.stringify(profile));

    const resolveValue = (value) => {
      if (typeof value === 'string') {
        // Handle {{env.VAR_NAME}} syntax
        value = value.replace(/\{\{env\.(\w+)\}\}/g, (match, varName) => {
          return process.env[varName] || match;
        });

        // Handle ${VAR_NAME} syntax
        value = value.replace(/\$\{(\w+)\}/g, (match, varName) => {
          return process.env[varName] || match;
        });

        return value;
      }

      if (Array.isArray(value)) {
        return value.map(resolveValue);
      }

      if (typeof value === 'object' && value !== null) {
        const resolvedObj = {};
        for (const key of Object.keys(value)) {
          resolvedObj[key] = resolveValue(value[key]);
        }
        return resolvedObj;
      }

      return value;
    };

    return resolveValue(resolved);
  }

  /**
   * Validate a profile against the schema
   * @param {Object} profile - Profile to validate
   * @returns {Object} Validation result with valid boolean and warnings array
   */
  validateProfile(profile) {
    const warnings = [];

    // Check required fields
    if (!profile.name) {
      warnings.push('Profile missing required "name" field');
    }

    // Check credentials structure
    if (profile.credentials) {
      for (const platform of Object.keys(profile.credentials)) {
        const creds = profile.credentials[platform];

        // Check for raw secrets (should use env vars)
        for (const key of Object.keys(creds)) {
          const value = creds[key];
          if (
            typeof value === 'string' &&
            !value.startsWith('{{env.') &&
            !value.startsWith('${') &&
            (key.toLowerCase().includes('token') ||
              key.toLowerCase().includes('secret') ||
              key.toLowerCase().includes('password') ||
              key.toLowerCase().includes('key'))
          ) {
            warnings.push(
              `Potential secret in credentials.${platform}.${key} - consider using environment variable reference`
            );
          }
        }
      }
    }

    // Check environment type
    if (profile.type && !['development', 'sandbox', 'staging', 'uat', 'production', 'client'].includes(profile.type)) {
      warnings.push(`Unknown environment type: ${profile.type}`);
    }

    return {
      valid: true, // Warnings don't invalidate the profile
      warnings
    };
  }

  /**
   * List available environment profiles
   * @returns {Array<Object>} List of profile metadata
   */
  listProfiles() {
    const profiles = [];

    const scanDir = (dir, prefix = '') => {
      if (!fs.existsSync(dir)) return;

      for (const file of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && file !== 'clients') {
          scanDir(fullPath, `${prefix}${file}/`);
        } else if (file.endsWith('.json') && !file.startsWith('_')) {
          try {
            const profile = this.loadProfileFile(fullPath);
            profiles.push({
              name: profile.name || path.basename(file, '.json'),
              type: profile.type || 'unknown',
              description: profile.description || '',
              path: fullPath,
              extends: profile.extends || null
            });
          } catch (e) {
            // Skip invalid profiles
          }
        }
      }
    };

    scanDir(this.environmentsDir);
    scanDir(path.join(this.environmentsDir, 'clients'));

    return profiles;
  }

  /**
   * Save a profile to disk
   * @param {Object} profile - Profile to save
   * @param {string} [profileName] - Profile name (uses profile.name if not provided)
   * @param {Object} [options] - Save options
   * @param {boolean} [options.isClient=false] - Save to clients subdirectory
   * @returns {string} Path where profile was saved
   */
  saveProfile(profile, profileName = null, options = {}) {
    const name = profileName || profile.name;
    if (!name) {
      throw new Error('Profile name is required');
    }

    const fileName = name.endsWith('.json') ? name : `${name}.json`;
    const targetDir = options.isClient
      ? path.join(this.environmentsDir, 'clients')
      : this.environmentsDir;

    // Ensure directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = path.join(targetDir, fileName);

    // Remove internal properties
    const profileToSave = { ...profile };
    delete profileToSave._sourcePath;

    fs.writeFileSync(targetPath, JSON.stringify(profileToSave, null, 2));

    // Clear cache
    this.clearCache();

    return targetPath;
  }

  /**
   * Delete a profile
   * @param {string} profileName - Profile name to delete
   * @returns {boolean} True if deleted
   */
  deleteProfile(profileName) {
    const profilePath = this.resolveProfilePath(profileName);
    if (!profilePath) {
      return false;
    }

    fs.unlinkSync(profilePath);
    this.clearCache();

    return true;
  }

  /**
   * Get field mapping for a specific object/field
   * @param {Object} profile - Environment profile
   * @param {string} objectName - Object name
   * @param {string} fieldName - Field name
   * @returns {string} Mapped field name or original if no mapping
   */
  getFieldMapping(profile, objectName, fieldName) {
    const fieldMappings = profile.fieldMappings || {};
    const objectMappings = fieldMappings[objectName];

    if (objectMappings && objectMappings[fieldName]) {
      return objectMappings[fieldName];
    }

    return fieldName;
  }

  /**
   * Get object mapping
   * @param {Object} profile - Environment profile
   * @param {string} objectName - Template object name
   * @returns {string} Mapped object API name or original
   */
  getObjectMapping(profile, objectName) {
    const objectMappings = profile.objectMappings || {};
    return objectMappings[objectName] || objectName;
  }

  /**
   * Merge solution parameters with environment overrides
   * @param {Object} solutionParams - Parameters from solution manifest
   * @param {Object} profile - Environment profile
   * @param {Object} [runtimeParams] - Runtime parameter overrides
   * @returns {Object} Merged parameters
   */
  mergeParameters(solutionParams, profile, runtimeParams = {}) {
    const envParams = profile.parameters || {};

    // Start with solution defaults
    const merged = {};
    for (const [key, config] of Object.entries(solutionParams)) {
      merged[key] = config.default;
    }

    // Override with environment parameters
    Object.assign(merged, envParams);

    // Override with runtime parameters
    Object.assign(merged, runtimeParams);

    return merged;
  }

  /**
   * Check if a feature flag is enabled
   * @param {Object} profile - Environment profile
   * @param {string} featureName - Feature flag name
   * @param {boolean} [defaultValue=false] - Default if not set
   * @returns {boolean} Feature flag value
   */
  isFeatureEnabled(profile, featureName, defaultValue = false) {
    const featureFlags = profile.featureFlags || {};
    return featureFlags[featureName] !== undefined ? featureFlags[featureName] : defaultValue;
  }

  /**
   * Get deployment defaults for a platform
   * @param {Object} profile - Environment profile
   * @param {string} platform - Platform name (salesforce, hubspot, n8n)
   * @returns {Object} Platform-specific deployment defaults
   */
  getDeploymentDefaults(profile, platform) {
    const defaults = profile.defaults || {};
    const platformDefaults = defaults[platform] || {};
    const deploymentDefaults = defaults.deployment || {};

    return {
      ...deploymentDefaults,
      ...platformDefaults
    };
  }

  /**
   * Clear the profile cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Create default environment profile files
   * @returns {Array<string>} Paths of created files
   */
  createDefaultProfiles() {
    const created = [];

    // Default profile
    const defaultProfile = {
      name: 'default',
      description: 'Base environment configuration - extend this for specific environments',
      type: 'development',
      credentials: {
        salesforce: {
          orgAlias: '{{env.SF_ORG_ALIAS}}',
          apiVersion: '62.0'
        },
        hubspot: {
          portalId: '{{env.HUBSPOT_PORTAL_ID}}',
          accessToken: '{{env.HUBSPOT_ACCESS_TOKEN}}'
        },
        n8n: {
          baseUrl: '{{env.N8N_BASE_URL}}',
          apiKey: '{{env.N8N_API_KEY}}'
        }
      },
      defaults: {
        salesforce: {
          testLevel: 'RunLocalTests',
          checkOnly: false,
          waitTime: 30
        },
        deployment: {
          dryRun: false,
          activateFlows: true,
          createCheckpoint: true
        }
      },
      featureFlags: {}
    };

    // Development profile
    const devProfile = {
      name: 'development',
      extends: 'default.json',
      description: 'Development/sandbox environment',
      type: 'sandbox',
      defaults: {
        salesforce: {
          testLevel: 'NoTestRun',
          checkOnly: false
        },
        deployment: {
          dryRun: false,
          activateFlows: true
        }
      }
    };

    // Production profile
    const prodProfile = {
      name: 'production',
      extends: 'default.json',
      description: 'Production environment - requires approval',
      type: 'production',
      defaults: {
        salesforce: {
          testLevel: 'RunLocalTests',
          checkOnly: false,
          waitTime: 60
        },
        deployment: {
          dryRun: false,
          activateFlows: false,
          runPostDeployTests: true
        }
      },
      restrictions: {
        requireApproval: true
      }
    };

    // Save profiles
    for (const profile of [defaultProfile, devProfile, prodProfile]) {
      const filePath = path.join(this.environmentsDir, `${profile.name}.json`);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));
        created.push(filePath);
      }
    }

    // Create clients directory
    const clientsDir = path.join(this.environmentsDir, 'clients');
    if (!fs.existsSync(clientsDir)) {
      fs.mkdirSync(clientsDir, { recursive: true });
    }

    return created;
  }
}

// Export
module.exports = EnvironmentManager;
module.exports.EnvironmentManager = EnvironmentManager;
