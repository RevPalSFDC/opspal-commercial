#!/usr/bin/env node

/**
 * HubSpot Platform Adapter
 *
 * Implements the BaseAdapter interface for HubSpot-specific runbook generation.
 * Handles portal identification, feature detection, observation loading, and template rendering.
 *
 * Features:
 * - Portal ID-based identification
 * - MCP-based feature detection (Contact lifecycle, Deal pipeline, Marketing, etc.)
 * - HubSpot-specific section templates
 * - Integration with existing path-conventions.js
 * - Observation loading from instances/hubspot/{portal-id}/observations/
 *
 * @module runbook-framework/adapters/hubspot-adapter
 */

const fs = require('fs');
const path = require('path');
const BaseAdapter = require('./base-adapter');
const { HubSpotFeatureDetector } = require('../core/feature-detector');

/**
 * HubSpot-specific adapter for runbook generation
 */
class HubSpotAdapter extends BaseAdapter {
  /**
   * Create a new HubSpot adapter
   * @param {Object} options - Configuration options
   * @param {string} options.identifier - HubSpot portal ID
   * @param {string} [options.pluginRoot] - Plugin root directory
   */
  constructor(options = {}) {
    super('hubspot', options);

    // Validate identifier (portal ID)
    if (this.identifier && !/^\d+$/.test(this.identifier)) {
      console.warn(`HubSpot identifier should be a portal ID (numeric). Got: ${this.identifier}`);
    }
  }

  /**
   * Get the display name for this platform
   * @returns {string} Display name
   */
  getPlatformDisplayName() {
    return 'HubSpot';
  }

  /**
   * Get HubSpot-specific sections for runbooks
   * @returns {Object} Section definitions with conditional flags
   */
  getPlatformSections() {
    return {
      // Contact Lifecycle (conditional on hasContactLifecycle)
      contactLifecycle: {
        title: 'Contact Lifecycle',
        description: 'Lifecycle stages, lead scoring, and contact management',
        condition: 'hasContactLifecycle',
        subsections: ['stages', 'leadScoring', 'segmentation', 'nurturing']
      },

      // Deal Pipeline (conditional on hasDealPipeline)
      dealPipeline: {
        title: 'Deal Pipeline',
        description: 'Deal stages, forecasting, and sales process',
        condition: 'hasDealPipeline',
        subsections: ['stages', 'forecasting', 'winRate', 'products']
      },

      // Marketing Automation (conditional on hasMarketingAutomation)
      marketingAutomation: {
        title: 'Marketing Automation',
        description: 'Workflows, sequences, and automated campaigns',
        condition: 'hasMarketingAutomation',
        subsections: ['workflows', 'sequences', 'emailCampaigns', 'forms']
      },

      // Content Strategy (conditional on hasContentStrategy)
      contentStrategy: {
        title: 'Content & Blog',
        description: 'Blog posts, landing pages, and content management',
        condition: 'hasContentStrategy',
        subsections: ['blog', 'landingPages', 'ctaButtons', 'seo']
      },

      // Integrations (conditional on hasIntegrations)
      integrations: {
        title: 'Integrations',
        description: 'Connected apps, APIs, and data sync',
        condition: 'hasIntegrations',
        subsections: ['connectedApps', 'apiIntegrations', 'dataSync']
      },

      // Always included sections
      dataModel: {
        title: 'Object Model',
        description: 'Custom objects, properties, and associations',
        condition: null, // Always included
        subsections: ['objects', 'properties', 'associations']
      },

      workflows: {
        title: 'Automation',
        description: 'Workflows, sequences, and scheduled actions',
        condition: null,
        subsections: ['workflows', 'sequences', 'scheduledActions']
      },

      knownExceptions: {
        title: 'Known Exceptions',
        description: 'Documented issues and workarounds',
        condition: null,
        subsections: []
      },

      recommendations: {
        title: 'Recommendations',
        description: 'Operational improvements and best practices',
        condition: null,
        subsections: []
      }
    };
  }

  /**
   * Get template paths for HubSpot runbooks
   * @returns {Object} Template path configuration
   */
  getTemplatePaths() {
    const frameworkRoot = path.resolve(__dirname, '..');
    const hubspotPluginRoot = this.findHubSpotPlugin();

    return {
      // Primary template in hubspot-plugin or framework
      base: hubspotPluginRoot
        ? path.join(hubspotPluginRoot, 'templates', 'runbook', 'hubspot-runbook.md')
        : path.join(frameworkRoot, 'templates', 'hubspot', 'runbook-base.md'),

      // Partial templates
      partials: {
        shared: path.join(frameworkRoot, 'templates', 'shared'),
        platform: path.join(frameworkRoot, 'templates', 'hubspot')
      }
    };
  }

  /**
   * Find the HubSpot domain directory
   * @returns {string|null} HubSpot domain root or null
   */
  findHubSpotPlugin() {
    const candidates = [
      path.resolve(this.pluginRoot, 'packages', 'domains', 'hubspot'),
      path.resolve(this.pluginRoot, '..', 'domains', 'hubspot'),
      path.join(process.cwd(), '.claude-plugins', 'opspal-core-plugin', 'packages', 'domains', 'hubspot'),
      path.resolve(__dirname, '../../../../hubspot-plugin'),
      path.resolve(this.pluginRoot, '../hubspot-plugin'),
      path.join(process.cwd(), '.claude-plugins', 'hubspot-plugin')
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Detect HubSpot-specific features
   * Note: Currently placeholder - requires MCP integration for full functionality
   * @returns {Promise<Object>} Feature flags and details
   */
  async detectFeatures() {
    const detector = new HubSpotFeatureDetector(this);
    return detector.detectFeatures();
  }

  /**
   * Load observations from disk
   * @returns {Array} Array of observation objects
   */
  loadObservations() {
    const observationsDir = this.getObservationsDir();

    if (!fs.existsSync(observationsDir)) {
      return [];
    }

    const files = fs.readdirSync(observationsDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .map(f => path.join(observationsDir, f));

    return files.map(file => {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
      } catch (err) {
        console.warn(`⚠️  Failed to parse ${file}: ${err.message}`);
        return null;
      }
    }).filter(Boolean);
  }

  /**
   * Synthesize HubSpot-specific content from observations and reflections
   * @param {Array} observations - Loaded observations
   * @param {Object} reflectionSections - Reflection data (optional)
   * @returns {Promise<Object>} Synthesized content for templates
   */
  async synthesizePlatformSpecifics(observations, reflectionSections = {}) {
    // Basic pattern analysis
    const basicPatterns = this.analyzeBasicPatterns(observations);

    // Generate platform description
    const platformDescription = this.generatePlatformDescription(basicPatterns, reflectionSections);

    // Generate workflow insights
    const workflows = this.generateWorkflowInsights(observations);

    // Generate exception summaries
    const knownExceptions = this.generateExceptionSummaries(
      reflectionSections?.known_exceptions || [],
      observations
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(basicPatterns, reflectionSections);

    // Generate best practices
    const bestPractices = this.generateBestPractices(basicPatterns, reflectionSections);

    // Extract objects from observations
    const objects = this.extractObjectsFromObservations(observations);

    return {
      platformDescription,
      objects,
      workflows,
      known_exceptions: knownExceptions,
      recommendations,
      best_practices: bestPractices,
      patterns: basicPatterns,
      synthesis_timestamp: new Date().toISOString()
    };
  }

  /**
   * Analyze basic patterns from observations
   * @param {Array} observations - Observations array
   * @returns {Object} Pattern analysis
   */
  analyzeBasicPatterns(observations) {
    const patterns = {
      total_operations: observations.length,
      operation_types: {},
      agents_used: new Set(),
      objects_touched: new Set(),
      workflows_modified: new Set(),
      success_rate: 0,
      timeframe: { first: null, last: null }
    };

    observations.forEach(obs => {
      // Count operation types
      patterns.operation_types[obs.operation] = (patterns.operation_types[obs.operation] || 0) + 1;

      // Track agents
      if (obs.agent && obs.agent !== 'unknown') {
        patterns.agents_used.add(obs.agent);
      }

      // Track objects
      if (obs.context?.objects) {
        obs.context.objects.forEach(obj => patterns.objects_touched.add(obj));
      }

      // Track workflows
      if (obs.context?.workflows) {
        obs.context.workflows.forEach(wf => patterns.workflows_modified.add(wf));
      }

      // Calculate success rate
      if (obs.outcome === 'success') {
        patterns.success_rate++;
      }

      // Track timeframe
      const timestamp = new Date(obs.timestamp);
      if (!patterns.timeframe.first || timestamp < patterns.timeframe.first) {
        patterns.timeframe.first = timestamp;
      }
      if (!patterns.timeframe.last || timestamp > patterns.timeframe.last) {
        patterns.timeframe.last = timestamp;
      }
    });

    patterns.success_rate = observations.length > 0
      ? Math.round((patterns.success_rate / observations.length) * 100)
      : 0;

    // Convert sets to arrays
    patterns.agents_used = Array.from(patterns.agents_used);
    patterns.objects_touched = Array.from(patterns.objects_touched);
    patterns.workflows_modified = Array.from(patterns.workflows_modified);

    return patterns;
  }

  /**
   * Generate intelligent platform description
   * @param {Object} patterns - Basic patterns
   * @param {Object} reflectionSections - Reflection data
   * @returns {string} Platform description
   */
  generatePlatformDescription(patterns, reflectionSections) {
    const daysSinceFirst = patterns.timeframe.first
      ? Math.round((Date.now() - patterns.timeframe.first.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const operationTypes = Object.entries(patterns.operation_types)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${count} ${type} operation${count > 1 ? 's' : ''}`)
      .join(', ');

    let description = `This HubSpot portal has been observed over ${daysSinceFirst} day${daysSinceFirst !== 1 ? 's' : ''}, `;
    description += `with ${patterns.total_operations} recorded operation${patterns.total_operations !== 1 ? 's' : ''} `;

    if (operationTypes) {
      description += `(${operationTypes}). `;
    }

    if (patterns.success_rate > 0) {
      description += `Operations have a ${patterns.success_rate}% success rate. `;
    }

    if (patterns.objects_touched.length > 0) {
      description += `Primary objects include ${patterns.objects_touched.slice(0, 3).join(', ')}`;
      if (patterns.objects_touched.length > 3) {
        description += `, and ${patterns.objects_touched.length - 3} more`;
      }
      description += '. ';
    }

    if (patterns.agents_used.length > 0) {
      description += `Agents deployed: ${patterns.agents_used.join(', ')}. `;
    }

    if (reflectionSections?.patterns?.common_errors?.length > 0) {
      const topError = reflectionSections.patterns.common_errors[0];
      description += `Most common issue: ${topError.taxonomy} (${topError.count} occurrence${topError.count > 1 ? 's' : ''}). `;
    }

    return description;
  }

  /**
   * Generate workflow insights from observations
   * @param {Array} observations - Observations array
   * @returns {Array} Workflow objects for template
   */
  generateWorkflowInsights(observations) {
    const workflows = {};

    observations.forEach(obs => {
      if (!obs.context?.workflows) return;

      obs.context.workflows.forEach(wf => {
        if (!workflows[wf]) {
          workflows[wf] = {
            name: wf,
            type: 'Workflow', // Default, could be Sequence
            status: 'Active',
            observations: 0,
            success_count: 0,
            operations: new Set()
          };
        }

        workflows[wf].observations++;
        workflows[wf].operations.add(obs.operation);
        if (obs.outcome === 'success') {
          workflows[wf].success_count++;
        }
      });
    });

    return Object.values(workflows).map(wf => {
      const successRate = wf.observations > 0
        ? Math.round((wf.success_count / wf.observations) * 100)
        : 0;

      return {
        name: wf.name,
        type: wf.type,
        status: successRate === 100 ? 'Active' : 'Active (with issues)',
        description: `Observed in ${wf.observations} operation(s). Success rate: ${successRate}%.`
      };
    });
  }

  /**
   * Generate exception summaries
   * @param {Array} knownExceptions - Known exceptions from reflections
   * @param {Array} observations - Observations array
   * @returns {Array} Exception objects for template
   */
  generateExceptionSummaries(knownExceptions, observations) {
    if (!knownExceptions || knownExceptions.length === 0) {
      return [];
    }

    return knownExceptions.map(exc => ({
      name: exc.name,
      description: exc.context || exc.description || 'See observations for details',
      workaround: exc.recommendation || exc.workaround || 'Manual intervention required',
      frequency: exc.frequency || 'Unknown'
    }));
  }

  /**
   * Generate operational recommendations
   * @param {Object} patterns - Basic patterns
   * @param {Object} reflectionSections - Reflection data
   * @returns {Array} Recommendation strings
   */
  generateRecommendations(patterns, reflectionSections) {
    const recommendations = [];

    // Success rate recommendations
    if (patterns.success_rate < 100 && patterns.success_rate > 0) {
      recommendations.push(
        `Improve operation success rate from ${patterns.success_rate}% to >95% by adding pre-flight validation`
      );
    }

    // Error pattern recommendations
    if (reflectionSections?.patterns?.common_errors) {
      reflectionSections.patterns.common_errors.slice(0, 2).forEach(err => {
        recommendations.push(
          `Address recurring ${err.taxonomy} errors (${err.count} occurrences) - implement validation guards`
        );
      });
    }

    // HubSpot-specific recommendations
    if (patterns.objects_touched.includes('Contact') && !patterns.objects_touched.includes('Company')) {
      recommendations.push(
        'Consider associating Contacts with Companies for better organization'
      );
    }

    if (patterns.workflows_modified.length > 10) {
      recommendations.push(
        'High number of workflows detected - consider consolidation or documentation review'
      );
    }

    // General recommendations
    if (patterns.total_operations < 10) {
      recommendations.push(
        'Increase observation coverage by triggering runbook capture after more operations'
      );
    }

    // Default if none generated
    if (recommendations.length === 0) {
      recommendations.push(
        'Continue capturing observations through agent operations',
        'Document workflows manually in runbook for reference',
        'Enable `/reflect` after sessions to improve pattern detection'
      );
    }

    return recommendations;
  }

  /**
   * Generate best practices
   * @param {Object} patterns - Basic patterns
   * @param {Object} reflectionSections - Reflection data
   * @returns {Array} Best practice strings
   */
  generateBestPractices(patterns, reflectionSections) {
    const practices = [
      'Review this runbook before major workflow changes',
      'Run `/reflect` after development sessions to capture patterns',
      'Update workflow documentation when making configuration changes',
      'Test workflows in sandbox before activating in production',
      'Document property dependencies for complex automation'
    ];

    // Context-specific practices
    if (reflectionSections?.known_exceptions?.length > 3) {
      practices.push(
        'High number of exceptions detected - schedule quarterly runbook review'
      );
    }

    if (patterns.success_rate < 95) {
      practices.push(
        'Implement pre-deployment validation checklist to improve success rate'
      );
    }

    return practices;
  }

  /**
   * Extract objects from observations
   * @param {Array} observations - Observations array
   * @returns {Array} Object details for template
   */
  extractObjectsFromObservations(observations) {
    const objectMap = {};

    observations.forEach(obs => {
      if (!obs.context?.objects) return;

      obs.context.objects.forEach(objName => {
        if (!objectMap[objName]) {
          objectMap[objName] = {
            name: objName,
            api_name: objName.toLowerCase(),
            record_count: 'N/A',
            custom_properties_count: 'N/A',
            observation_count: 0
          };
        }
        objectMap[objName].observation_count++;
      });
    });

    return Object.values(objectMap)
      .sort((a, b) => b.observation_count - a.observation_count);
  }

  /**
   * Validate HubSpot-specific data
   * @param {Object} data - Data to validate
   * @returns {Object} Validation result
   */
  validatePlatformData(data) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!data.identifier) {
      errors.push('Missing portal ID');
    } else if (!/^\d+$/.test(data.identifier)) {
      warnings.push('Portal ID should be numeric');
    }

    // Recommended fields
    if (!data.platformDescription) {
      warnings.push('Missing platform description - consider adding observations');
    }

    if (!data.objects || data.objects.length === 0) {
      warnings.push('No objects documented - consider running discovery');
    }

    if (!data.workflows || data.workflows.length === 0) {
      warnings.push('No workflows documented - consider auditing automation');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Export
module.exports = HubSpotAdapter;
