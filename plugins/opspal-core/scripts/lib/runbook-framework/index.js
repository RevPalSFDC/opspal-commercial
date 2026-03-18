#!/usr/bin/env node

/**
 * Cross-Platform Runbook Framework
 *
 * Unified runbook generation system that works across Salesforce, HubSpot,
 * and future platforms through a plugin adapter architecture.
 *
 * Features:
 * - Platform-agnostic core components (observer, synthesizer, renderer, versioner, differ)
 * - Platform-specific adapters for Salesforce and HubSpot
 * - Auto-tailoring sections based on detected features
 * - Semantic versioning with history tracking
 * - Section-aware diffing for change tracking
 *
 * Usage:
 *   const { createRunbookSystem } = require('./runbook-framework');
 *
 *   // Create system for Salesforce
 *   const sf = createRunbookSystem('salesforce', { identifier: 'myOrg' });
 *   const runbook = await sf.generate();
 *
 *   // Create system for HubSpot
 *   const hs = createRunbookSystem('hubspot', { identifier: '12345678' });
 *   const runbook = await hs.generate();
 *
 * @module runbook-framework
 */

// Core components
const RunbookVersioner = require('./core/versioner');
const RunbookRenderer = require('./core/renderer');
const RunbookDiffer = require('./core/differ');

// Adapters
const BaseAdapter = require('./adapters/base-adapter');

// Lazy-load platform adapters to avoid circular dependencies
let SalesforceAdapter = null;
let HubSpotAdapter = null;

/**
 * Available platform adapters
 */
const ADAPTERS = {
  salesforce: () => {
    if (!SalesforceAdapter) {
      SalesforceAdapter = require('./adapters/salesforce-adapter');
    }
    return SalesforceAdapter;
  },
  hubspot: () => {
    if (!HubSpotAdapter) {
      HubSpotAdapter = require('./adapters/hubspot-adapter');
    }
    return HubSpotAdapter;
  }
};

/**
 * Create a runbook system for a specific platform
 *
 * @param {string} platform - Platform name ('salesforce' or 'hubspot')
 * @param {Object} options - Configuration options
 * @param {string} options.identifier - Instance identifier (org alias or portal ID)
 * @param {string} [options.pluginRoot] - Plugin root directory
 * @returns {Object} Runbook system with adapter and components
 */
function createRunbookSystem(platform, options = {}) {
  if (!ADAPTERS[platform]) {
    const available = Object.keys(ADAPTERS).join(', ');
    throw new Error(`Unknown platform: ${platform}. Available: ${available}`);
  }

  const AdapterClass = ADAPTERS[platform]();
  const adapter = new AdapterClass(options);

  return {
    adapter,
    versioner: new RunbookVersioner(adapter),
    renderer: new RunbookRenderer(adapter),
    differ: new RunbookDiffer(adapter),

    /**
     * Generate a complete runbook for this instance
     * @param {Object} [genOptions] - Generation options
     * @param {Object} [genOptions.reflectionSections] - Reflection data
     * @param {string} [genOptions.templatePath] - Custom template path
     * @returns {Promise<Object>} Generation result
     */
    async generate(genOptions = {}) {
      // Load observations
      const observations = adapter.loadObservations();

      // Detect features for auto-tailoring
      let features = {};
      try {
        features = await adapter.detectFeatures();
      } catch (err) {
        console.warn(`Feature detection failed: ${err.message}`);
      }

      // Synthesize platform-specific content
      let synthesis = {};
      try {
        synthesis = await adapter.synthesizePlatformSpecifics(
          observations,
          genOptions.reflectionSections || {}
        );
      } catch (err) {
        console.warn(`Synthesis failed: ${err.message}`);
      }

      // Merge all data
      const data = {
        platform: adapter.platform,
        platformDisplayName: adapter.getPlatformDisplayName(),
        identifier: adapter.getInstanceIdentifier(),
        lastUpdated: new Date().toISOString().split('T')[0],
        observationCount: observations.length,
        ...features,
        ...synthesis,
        ...(genOptions.additionalData || {})
      };

      // Validate data
      const validation = adapter.validatePlatformData(data);
      if (!validation.valid) {
        console.warn('Validation warnings:', validation.errors);
      }

      // Render runbook
      const content = await this.renderer.render(data, genOptions.templatePath);

      // Save runbook
      const runbookPath = adapter.getRunbookPath();
      adapter.ensureInstancePath();
      require('fs').writeFileSync(runbookPath, content, 'utf-8');

      // Create version snapshot
      const versionResult = this.versioner.createSnapshot({
        notes: genOptions.notes || `Generated on ${data.lastUpdated}`
      });

      return {
        success: true,
        path: runbookPath,
        version: versionResult.version,
        observationCount: observations.length,
        featuresDetected: Object.keys(features).filter(k => features[k] === true).length,
        validation
      };
    },

    /**
     * View the current runbook
     * @returns {string} Runbook content
     */
    view() {
      const runbookPath = adapter.getRunbookPath();
      if (!require('fs').existsSync(runbookPath)) {
        throw new Error(`Runbook not found: ${runbookPath}`);
      }
      return require('fs').readFileSync(runbookPath, 'utf-8');
    },

    /**
     * Compare runbook versions
     * @param {string} [fromVersion] - Starting version (default: previous)
     * @param {string} [toVersion] - Ending version (default: current)
     * @returns {Object} Diff result
     */
    diff(fromVersion, toVersion) {
      return this.differ.compare(fromVersion, toVersion);
    },

    /**
     * List all runbook versions
     * @returns {Object} Version index
     */
    listVersions() {
      return this.versioner.listVersions();
    }
  };
}

/**
 * Get list of available platforms
 * @returns {string[]} Platform names
 */
function getAvailablePlatforms() {
  return Object.keys(ADAPTERS);
}

/**
 * Check if a platform is supported
 * @param {string} platform - Platform name
 * @returns {boolean} True if supported
 */
function isPlatformSupported(platform) {
  return platform in ADAPTERS;
}

// Export everything
module.exports = {
  // Factory
  createRunbookSystem,

  // Utilities
  getAvailablePlatforms,
  isPlatformSupported,

  // Core components (for direct use if needed)
  RunbookVersioner,
  RunbookRenderer,
  RunbookDiffer,

  // Base adapter (for creating new platform adapters)
  BaseAdapter
};
