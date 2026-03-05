#!/usr/bin/env node

/**
 * Base Adapter Interface
 *
 * Abstract base class that all platform adapters must implement.
 * Provides the contract for platform-specific runbook generation.
 *
 * Platform adapters handle:
 * - Instance identification (org alias, portal ID, etc.)
 * - Platform-specific template sections
 * - Feature detection queries
 * - Platform-specific synthesis logic
 * - Path conventions for instance storage
 *
 * @module runbook-framework/adapters/base-adapter
 */

const path = require('path');
const fs = require('fs');

/**
 * Base adapter class - all platform adapters must extend this
 */
class BaseAdapter {
  /**
   * Create a new adapter instance
   * @param {Object} options - Adapter configuration
   * @param {string} [options.pluginRoot] - Plugin root directory
   */
  constructor(options = {}) {
    this.options = options;
    this.platform = 'unknown';
    this.pluginRoot = options.pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  }

  // =========================================================================
  // REQUIRED METHODS - Must be implemented by all adapters
  // =========================================================================

  /**
   * Get the unique identifier for this instance
   * @returns {string} Instance identifier (e.g., org alias for SF, portal ID for HS)
   * @abstract
   */
  getInstanceIdentifier() {
    throw new Error('BaseAdapter.getInstanceIdentifier() must be implemented');
  }

  /**
   * Get the list of platform-specific template sections to include
   * @returns {string[]} Array of section template names
   * @abstract
   */
  getPlatformSections() {
    throw new Error('BaseAdapter.getPlatformSections() must be implemented');
  }

  /**
   * Detect features available in this instance
   * Used for auto-tailoring runbook sections
   * @returns {Promise<Object>} Feature flags object
   * @abstract
   */
  async detectFeatures() {
    throw new Error('BaseAdapter.detectFeatures() must be implemented');
  }

  /**
   * Synthesize platform-specific content from observations
   * @param {Object[]} observations - Array of observation objects
   * @param {Object} reflectionSections - Reflection data from database
   * @returns {Promise<Object>} Platform-specific synthesis output
   * @abstract
   */
  async synthesizePlatformSpecifics(observations, reflectionSections) {
    throw new Error('BaseAdapter.synthesizePlatformSpecifics() must be implemented');
  }

  /**
   * Validate platform-specific data before rendering
   * @param {Object} data - Data to validate
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   * @abstract
   */
  validatePlatformData(data) {
    throw new Error('BaseAdapter.validatePlatformData() must be implemented');
  }

  // =========================================================================
  // OPTIONAL METHODS - Can be overridden by adapters
  // =========================================================================

  /**
   * Get the observation schema for this platform
   * Default schema covers common fields; override for platform-specific fields
   * @returns {Object} JSON schema for observations
   */
  getObservationSchema() {
    return {
      type: 'object',
      required: ['timestamp', 'operation', 'outcome'],
      properties: {
        timestamp: { type: 'string', format: 'date-time' },
        org: { type: 'string' },
        agent: { type: 'string' },
        operation: { type: 'string' },
        context: {
          type: 'object',
          properties: {
            objects: { type: 'array', items: { type: 'string' } },
            fields: { type: 'array', items: { type: 'string' } },
            workflows: { type: 'array', items: { type: 'string' } }
          }
        },
        outcome: { type: 'string', enum: ['success', 'failure', 'partial'] },
        notes: { type: 'string' }
      }
    };
  }

  /**
   * Get template paths for this platform
   * @returns {Object} Paths to template files
   */
  getTemplatePaths() {
    const frameworkRoot = path.resolve(__dirname, '..');
    return {
      base: path.join(frameworkRoot, 'templates', 'runbook-base.md'),
      sections: path.join(frameworkRoot, 'templates', this.platform)
    };
  }

  // =========================================================================
  // PATH UTILITIES - Standardized path handling
  // =========================================================================

  /**
   * Standard subdirectories within each instance
   */
  static INSTANCE_SUBDIRS = {
    observations: 'observations',
    runbooks: 'runbooks',
    reports: 'reports',
    snapshots: 'snapshots',
    cache: 'cache',
    diagrams: 'diagrams',
    exports: 'exports',
    'runbook-history': 'runbook-history'
  };

  /**
   * Get the path for this instance
   * @param {string} [subdir] - Optional subdirectory
   * @returns {string} Absolute path to instance directory
   */
  getInstancePath(subdir) {
    const identifier = this.getInstanceIdentifier();
    const basePath = path.join(this.pluginRoot, 'instances', this.platform, identifier);

    if (subdir) {
      if (!BaseAdapter.INSTANCE_SUBDIRS[subdir]) {
        console.warn(`Non-standard subdirectory '${subdir}'. Standard: ${Object.keys(BaseAdapter.INSTANCE_SUBDIRS).join(', ')}`);
      }
      return path.join(basePath, subdir);
    }

    return basePath;
  }

  /**
   * Ensure an instance directory exists
   * @param {string} [subdir] - Optional subdirectory
   * @returns {string} Absolute path to created directory
   */
  ensureInstancePath(subdir) {
    const targetPath = this.getInstancePath(subdir);

    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    return targetPath;
  }

  /**
   * Get observations directory for this instance
   * @returns {string} Absolute path to observations directory
   */
  getObservationsDir() {
    return this.getInstancePath('observations');
  }

  /**
   * Get runbooks directory for this instance
   * @returns {string} Absolute path to runbooks directory
   */
  getRunbooksDir() {
    return this.getInstancePath('runbooks');
  }

  /**
   * Get reports directory for this instance
   * @returns {string} Absolute path to reports directory
   */
  getReportsDir() {
    return this.getInstancePath('reports');
  }

  /**
   * Get runbook history directory for this instance
   * @returns {string} Absolute path to runbook-history directory
   */
  getRunbookHistoryDir() {
    return this.getInstancePath('runbook-history');
  }

  /**
   * Get the main runbook path for this instance
   * @returns {string} Absolute path to RUNBOOK.md
   */
  getRunbookPath() {
    return path.join(this.getInstancePath(), 'RUNBOOK.md');
  }

  // =========================================================================
  // SHARED UTILITIES
  // =========================================================================

  /**
   * Load all observations for this instance
   * @returns {Object[]} Array of observation objects
   */
  loadObservations() {
    const obsDir = this.getObservationsDir();

    if (!fs.existsSync(obsDir)) {
      return [];
    }

    const files = fs.readdirSync(obsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(obsDir, f));

    return files.map(file => {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
      } catch (err) {
        console.warn(`Failed to parse ${file}: ${err.message}`);
        return null;
      }
    }).filter(Boolean);
  }

  /**
   * Get platform display name
   * @returns {string} Human-readable platform name
   */
  getPlatformDisplayName() {
    const names = {
      salesforce: 'Salesforce',
      hubspot: 'HubSpot',
      unknown: 'Unknown'
    };
    return names[this.platform] || this.platform;
  }

  /**
   * Create a summary of this adapter's configuration
   * @returns {Object} Configuration summary
   */
  getConfigSummary() {
    return {
      platform: this.platform,
      displayName: this.getPlatformDisplayName(),
      identifier: this.getInstanceIdentifier(),
      instancePath: this.getInstancePath(),
      pluginRoot: this.pluginRoot
    };
  }
}

module.exports = BaseAdapter;
