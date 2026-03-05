#!/usr/bin/env node
/**
 * Salesforce API Version Detector
 *
 * Dynamically detects the highest available API version for an org
 * instead of hardcoding version numbers. Caches results per org
 * to avoid repeated calls.
 *
 * Features:
 * - Queries Organization object for current API version
 * - Falls back to /services/data/ endpoint if query fails
 * - Caches version per org (in-memory)
 * - Defaults to v59.0 if all detection methods fail
 *
 * Usage:
 *   const detector = new SalesforceApiDetector();
 *   const version = await detector.getApiVersion('myorg');
 *   console.log(`Using API version: ${version}`);
 *
 * @version 1.0.0
 * @date 2025-10-20
 */

const { execSync } = require('child_process');

class SalesforceApiDetector {
  constructor() {
    // In-memory cache: orgAlias → apiVersion
    this.cache = {};
    this.defaultVersion = 'v59.0';
  }

  /**
   * Get the highest available API version for an org
   * @param {string} orgAlias - Salesforce org alias
   * @param {object} options - Configuration options
   * @param {boolean} options.forceRefresh - Bypass cache and detect fresh
   * @returns {Promise<string>} API version (e.g., 'v65.0')
   */
  async getApiVersion(orgAlias, options = {}) {
    if (!orgAlias) {
      throw new Error('orgAlias is required');
    }

    // Check cache unless force refresh
    if (!options.forceRefresh && this.cache[orgAlias]) {
      console.log(`✓ Using cached API version for ${orgAlias}: ${this.cache[orgAlias]}`);
      return this.cache[orgAlias];
    }

    console.log(`🔍 Detecting API version for org: ${orgAlias}...`);

    // Method 1: Query Organization object (most reliable)
    try {
      const version = await this.detectViaOrganizationQuery(orgAlias);
      if (version) {
        this.cache[orgAlias] = version;
        console.log(`✓ Detected API version: ${version}`);
        return version;
      }
    } catch (error) {
      console.warn('⚠️  Organization query method failed:', error.message);
    }

    // Method 2: Query /services/data/ endpoint
    try {
      const version = await this.detectViaServicesData(orgAlias);
      if (version) {
        this.cache[orgAlias] = version;
        console.log(`✓ Detected API version via services endpoint: ${version}`);
        return version;
      }
    } catch (error) {
      console.warn('⚠️  Services data endpoint method failed:', error.message);
    }

    // Fallback: Use default version
    console.warn(`⚠️  Could not detect API version, using default: ${this.defaultVersion}`);
    this.cache[orgAlias] = this.defaultVersion;
    return this.defaultVersion;
  }

  /**
   * Detect API version by querying Organization object
   * @private
   */
  async detectViaOrganizationQuery(orgAlias) {
    const command = [
      'sf data query',
      '--query', '"SELECT ApiVersion FROM Organization LIMIT 1"',
      '--json',
      '--target-org', orgAlias
    ].join(' ');

    try {
      const output = execSync(command, {
        encoding: 'utf8',
        timeout: 10000
      });

      const parsed = JSON.parse(output);

      if (parsed.status === 0 && parsed.result?.records?.length > 0) {
        const apiVersion = parsed.result.records[0].ApiVersion;
        if (apiVersion) {
          // Convert "59.0" to "v59.0" format
          return apiVersion.startsWith('v') ? apiVersion : `v${apiVersion}`;
        }
      }

      return null;
    } catch (error) {
      // If query fails, try fallback method
      return null;
    }
  }

  /**
   * Detect API version via /services/data/ REST endpoint
   * @private
   */
  async detectViaServicesData(orgAlias) {
    const command = [
      'sf org display',
      '--json',
      '--target-org', orgAlias
    ].join(' ');

    try {
      const output = execSync(command, {
        encoding: 'utf8',
        timeout: 10000
      });

      const parsed = JSON.parse(output);

      if (parsed.status === 0 && parsed.result?.apiVersion) {
        const apiVersion = parsed.result.apiVersion;
        // Convert "59.0" to "v59.0" format
        return apiVersion.startsWith('v') ? apiVersion : `v${apiVersion}`;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all cached API versions
   * @returns {object} Map of orgAlias → apiVersion
   */
  getCachedVersions() {
    return { ...this.cache };
  }

  /**
   * Clear cache for specific org or all orgs
   * @param {string} orgAlias - Optional org alias to clear
   */
  clearCache(orgAlias = null) {
    if (orgAlias) {
      delete this.cache[orgAlias];
      console.log(`✓ Cleared cache for ${orgAlias}`);
    } else {
      this.cache = {};
      console.log('✓ Cleared all cached API versions');
    }
  }

  /**
   * Get version comparison information
   * @param {string} version - API version (e.g., 'v59.0')
   * @returns {object} Version metadata
   */
  getVersionMetadata(version) {
    const numericVersion = parseFloat(version.replace('v', ''));

    return {
      version,
      numericVersion,
      supportsFlowDefinitionView: numericVersion >= 57.0,
      supportsEnhancedMetadata: numericVersion >= 59.0,
      supportsFlexiPages: numericVersion >= 40.0,
      releaseYear: this.estimateReleaseYear(numericVersion)
    };
  }

  /**
   * Estimate Salesforce release year from API version
   * @private
   */
  estimateReleaseYear(numericVersion) {
    // Salesforce releases 3 versions per year (Spring, Summer, Winter)
    // v59.0 = 2024, v62.0 = 2025, etc.
    const baseYear = 2024;
    const baseVersion = 59.0;
    const versionsPerYear = 3;

    const yearsSince = (numericVersion - baseVersion) / versionsPerYear;
    return Math.floor(baseYear + yearsSince);
  }
}

// CLI Execution
if (require.main === module) {
  const orgAlias = process.argv[2];
  const action = process.argv[3];

  if (!orgAlias) {
    console.error('Usage: node salesforce-api-detector.js <org-alias> [action]');
    console.error('');
    console.error('Actions:');
    console.error('  detect       - Detect and display API version (default)');
    console.error('  metadata     - Show version metadata and capabilities');
    console.error('  clear-cache  - Clear cached version for org');
    console.error('');
    console.error('Examples:');
    console.error('  node salesforce-api-detector.js myorg');
    console.error('  node salesforce-api-detector.js myorg metadata');
    console.error('  node salesforce-api-detector.js myorg clear-cache');
    process.exit(1);
  }

  const detector = new SalesforceApiDetector();

  (async () => {
    try {
      switch (action) {
        case 'metadata':
          const version = await detector.getApiVersion(orgAlias);
          const metadata = detector.getVersionMetadata(version);
          console.log('\n📊 API Version Metadata:');
          console.log(`  Version: ${metadata.version}`);
          console.log(`  Numeric: ${metadata.numericVersion}`);
          console.log(`  Release Year: ${metadata.releaseYear}`);
          console.log('\n🎯 Feature Support:');
          console.log(`  FlowDefinitionView: ${metadata.supportsFlowDefinitionView ? '✅' : '❌'}`);
          console.log(`  Enhanced Metadata: ${metadata.supportsEnhancedMetadata ? '✅' : '❌'}`);
          console.log(`  FlexiPages: ${metadata.supportsFlexiPages ? '✅' : '❌'}`);
          break;

        case 'clear-cache':
          detector.clearCache(orgAlias);
          break;

        case 'detect':
        default:
          const detectedVersion = await detector.getApiVersion(orgAlias);
          console.log(`\n📌 API Version for ${orgAlias}: ${detectedVersion}`);
          break;
      }

      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = SalesforceApiDetector;
