#!/usr/bin/env node

/**
 * Task Variant Loader
 *
 * Loads task variant definitions with org-specific overrides.
 * Provides caching and validation.
 *
 * Part of the Runbook Policy Infrastructure (Phase 2).
 *
 * Usage:
 *   const TaskVariantLoader = require('./task-variant-loader');
 *   const loader = new TaskVariantLoader('my-org');
 *   const variant = await loader.getVariant('backup');
 *   const allVariants = await loader.getAllVariants();
 *
 * @module task-variant-loader
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONSTANTS
// ============================================================================

// Plugin root is always relative to this script's location
const PLUGIN_ROOT = path.resolve(__dirname, '../..');
// Use CLAUDE_PLUGIN_ROOT for instance data, but config files are always in plugin
const INSTANCES_ROOT = process.env.CLAUDE_PLUGIN_ROOT || PLUGIN_ROOT;
const DEFAULTS_PATH = path.join(PLUGIN_ROOT, 'config', 'task-variant-defaults.json');
const SCHEMA_PATH = path.join(PLUGIN_ROOT, 'config', 'task-variant.schema.json');

// Cache
const variantCache = new Map();
const CACHE_TTL = 300000; // 5 minutes

// ============================================================================
// TASK VARIANT LOADER CLASS
// ============================================================================

class TaskVariantLoader {
  /**
   * Create a TaskVariantLoader
   * @param {string} org - Salesforce org alias
   * @param {Object} options - Configuration options
   */
  constructor(org, options = {}) {
    this.org = org;
    this.verbose = options.verbose || false;
    this.pluginRoot = options.pluginRoot || PLUGIN_ROOT;
    this.instancesRoot = options.instancesRoot || INSTANCES_ROOT;

    // Determine org override path
    this.orgOverridePath = this._resolveOrgOverridePath(org);
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Get a specific task variant
   * @param {string} variantId - Task variant identifier
   * @returns {Object|null} Task variant or null if not found
   */
  async getVariant(variantId) {
    const allVariants = await this.getAllVariants();
    return allVariants.taskVariants[variantId] || null;
  }

  /**
   * Get all task variants with org overrides applied
   * @returns {Object} Complete task variant configuration
   */
  async getAllVariants() {
    const cacheKey = `variants-${this.org}`;

    // Check cache
    const cached = variantCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.variants;
    }

    // Load defaults
    const defaults = this._loadDefaults();

    // Load org overrides
    const orgOverrides = this._loadOrgOverrides();

    // Merge
    const merged = this._mergeVariants(defaults, orgOverrides);

    // Cache
    variantCache.set(cacheKey, { variants: merged, timestamp: Date.now() });

    return merged;
  }

  /**
   * Get list of available variant IDs
   * @returns {string[]} Array of variant identifiers
   */
  async getVariantIds() {
    const variants = await this.getAllVariants();
    return Object.keys(variants.taskVariants);
  }

  /**
   * Get default variant for when none is specified
   * @returns {Object} Default task variant
   */
  async getDefaultVariant() {
    const variants = await this.getAllVariants();
    const defaultId = variants.defaultVariant || 'backup';
    return variants.taskVariants[defaultId];
  }

  /**
   * Check if a variant exists
   * @param {string} variantId - Variant ID to check
   * @returns {boolean} True if variant exists
   */
  async variantExists(variantId) {
    const variants = await this.getAllVariants();
    return !!variants.taskVariants[variantId];
  }

  /**
   * Get workflow steps for a variant
   * @param {string} variantId - Variant ID
   * @returns {Array} Workflow steps
   */
  async getWorkflowSteps(variantId) {
    const variant = await this.getVariant(variantId);
    return variant?.workflowSteps || [];
  }

  /**
   * Get quality gates for a variant
   * @param {string} variantId - Variant ID
   * @returns {Array} Quality gates
   */
  async getQualityGates(variantId) {
    const variant = await this.getVariant(variantId);
    return variant?.qualityGates || [];
  }

  /**
   * Get object-specific override for a variant
   * @param {string} variantId - Variant ID
   * @param {string} objectName - Salesforce object name
   * @returns {Object|null} Object override or null
   */
  async getObjectOverride(variantId, objectName) {
    const variant = await this.getVariant(variantId);
    return variant?.objectOverrides?.[objectName] || null;
  }

  /**
   * Save org-specific overrides
   * @param {Object} overrides - Overrides to save
   */
  saveOrgOverrides(overrides) {
    overrides.lastUpdated = new Date().toISOString();

    // Ensure directory exists
    const overrideDir = path.dirname(this.orgOverridePath);
    if (!fs.existsSync(overrideDir)) {
      fs.mkdirSync(overrideDir, { recursive: true });
    }

    fs.writeFileSync(this.orgOverridePath, JSON.stringify(overrides, null, 2));

    // Invalidate cache
    variantCache.delete(`variants-${this.org}`);

    if (this.verbose) {
      console.log(`✅ Saved task variant overrides to: ${this.orgOverridePath}`);
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    variantCache.clear();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  _resolveOrgOverridePath(org) {
    const orgSlug = process.env.ORG_SLUG || '';
    const basePaths = [
      // Org-centric (new structure) - relative to instances root
      path.join(this.instancesRoot, 'orgs', orgSlug, 'platforms', 'salesforce', org, 'configs', 'task-variant-overrides.json'),
      path.join(this.instancesRoot, 'orgs', org, 'platforms', 'salesforce', org, 'configs', 'task-variant-overrides.json'),
      // Legacy structure - check both global and plugin-local
      path.join(this.instancesRoot, 'instances', 'salesforce', org, 'task-variant-overrides.json'),
      path.join(this.instancesRoot, 'instances', org, 'task-variant-overrides.json'),
      path.join(this.pluginRoot, 'instances', 'salesforce', org, 'task-variant-overrides.json'),
      path.join(this.pluginRoot, 'instances', org, 'task-variant-overrides.json')
    ];

    for (const p of basePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    // Default path for new files
    return path.join(this.instancesRoot, 'instances', 'salesforce', org, 'task-variant-overrides.json');
  }

  _loadDefaults() {
    if (!fs.existsSync(DEFAULTS_PATH)) {
      throw new Error(`Task variant defaults not found: ${DEFAULTS_PATH}`);
    }

    return JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf-8'));
  }

  _loadOrgOverrides() {
    if (!fs.existsSync(this.orgOverridePath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(this.orgOverridePath, 'utf-8'));
    } catch (e) {
      if (this.verbose) {
        console.warn(`⚠️  Failed to load org overrides: ${e.message}`);
      }
      return null;
    }
  }

  _mergeVariants(defaults, orgOverrides) {
    if (!orgOverrides) {
      return defaults;
    }

    const merged = JSON.parse(JSON.stringify(defaults));

    // Override default variant
    if (orgOverrides.defaultVariant) {
      merged.defaultVariant = orgOverrides.defaultVariant;
    }

    // Merge variant overrides
    if (orgOverrides.taskVariants) {
      for (const [variantId, variantOverride] of Object.entries(orgOverrides.taskVariants)) {
        if (!merged.taskVariants[variantId]) {
          // New variant
          merged.taskVariants[variantId] = variantOverride;
        } else {
          // Merge with existing
          merged.taskVariants[variantId] = this._mergeVariant(
            merged.taskVariants[variantId],
            variantOverride
          );
        }
      }
    }

    merged.lastUpdated = new Date().toISOString();
    return merged;
  }

  _mergeVariant(baseVariant, override) {
    const merged = { ...baseVariant };

    // Simple overrides
    const simpleFields = [
      'name', 'description', 'fieldSelectionMode',
      'includeSystemFields', 'includeFormulaFields', 'includeRollupSummaryFields',
      'maxFields', 'riskLevel', 'approvalRequired', 'auditLogging'
    ];

    for (const field of simpleFields) {
      if (override[field] !== undefined) {
        merged[field] = override[field];
      }
    }

    // Merge arrays (additive)
    if (override.requiredFields) {
      merged.requiredFields = [...new Set([
        ...(merged.requiredFields || []),
        ...override.requiredFields
      ])];
    }

    if (override.excludedFields) {
      merged.excludedFields = [...new Set([
        ...(merged.excludedFields || []),
        ...override.excludedFields
      ])];
    }

    // Merge field filters
    if (override.fieldFilters) {
      merged.fieldFilters = {
        ...(merged.fieldFilters || {}),
        ...override.fieldFilters
      };
    }

    // Merge object overrides
    if (override.objectOverrides) {
      merged.objectOverrides = {
        ...(merged.objectOverrides || {}),
        ...override.objectOverrides
      };
    }

    // Override workflow steps and quality gates (full replacement)
    if (override.workflowSteps) {
      merged.workflowSteps = override.workflowSteps;
    }

    if (override.qualityGates) {
      merged.qualityGates = override.qualityGates;
    }

    if (override.rollbackStrategy) {
      merged.rollbackStrategy = override.rollbackStrategy;
    }

    return merged;
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const printUsage = () => {
    console.log(`
Task Variant Loader - Load and manage task variant definitions

Usage:
  node task-variant-loader.js <command> [options]

Commands:
  list <org>               List all available task variants
  get <org> <variantId>    Get a specific task variant
  workflow <org> <variantId>  Get workflow steps for a variant
  gates <org> <variantId>  Get quality gates for a variant
  default <org>            Get the default task variant

Options:
  --verbose                Enable verbose output
  --json                   Output as JSON

Examples:
  node task-variant-loader.js list my-sandbox
  node task-variant-loader.js get my-sandbox backup
  node task-variant-loader.js workflow my-sandbox migration
    `);
  };

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  const verbose = args.includes('--verbose');
  const jsonOutput = args.includes('--json');

  try {
    switch (command) {
      case 'list': {
        const org = args[1];
        if (!org) {
          console.error('❌ Missing org argument');
          process.exit(1);
        }
        const loader = new TaskVariantLoader(org, { verbose });
        const variants = await loader.getAllVariants();

        if (jsonOutput) {
          console.log(JSON.stringify(Object.keys(variants.taskVariants), null, 2));
        } else {
          console.log(`\n📋 Task Variants for ${org}\n`);
          console.log(`Default: ${variants.defaultVariant}\n`);
          for (const [id, variant] of Object.entries(variants.taskVariants)) {
            console.log(`  ${id.padEnd(15)} - ${variant.name}`);
            console.log(`                   Risk: ${variant.riskLevel}, Approval: ${variant.approvalRequired ? 'Yes' : 'No'}`);
          }
        }
        break;
      }

      case 'get': {
        const org = args[1];
        const variantId = args[2];
        if (!org || !variantId) {
          console.error('❌ Missing org or variantId argument');
          process.exit(1);
        }
        const loader = new TaskVariantLoader(org, { verbose });
        const variant = await loader.getVariant(variantId);

        if (!variant) {
          console.error(`❌ Variant not found: ${variantId}`);
          process.exit(1);
        }

        if (jsonOutput) {
          console.log(JSON.stringify(variant, null, 2));
        } else {
          console.log(`\n📋 Task Variant: ${variant.name} (${variant.id})\n`);
          console.log(`Description: ${variant.description}`);
          console.log(`Field Selection: ${variant.fieldSelectionMode}`);
          console.log(`Max Fields: ${variant.maxFields}`);
          console.log(`Risk Level: ${variant.riskLevel}`);
          console.log(`Approval Required: ${variant.approvalRequired ? 'Yes' : 'No'}`);
          console.log(`Required Fields: ${(variant.requiredFields || []).join(', ')}`);
          console.log(`Workflow Steps: ${(variant.workflowSteps || []).length}`);
          console.log(`Quality Gates: ${(variant.qualityGates || []).length}`);
        }
        break;
      }

      case 'workflow': {
        const org = args[1];
        const variantId = args[2];
        if (!org || !variantId) {
          console.error('❌ Missing org or variantId argument');
          process.exit(1);
        }
        const loader = new TaskVariantLoader(org, { verbose });
        const steps = await loader.getWorkflowSteps(variantId);

        if (jsonOutput) {
          console.log(JSON.stringify(steps, null, 2));
        } else {
          console.log(`\n📋 Workflow Steps for ${variantId}\n`);
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            console.log(`  ${i + 1}. ${step.name} (${step.action})`);
            console.log(`     On Failure: ${step.onFailure}`);
          }
        }
        break;
      }

      case 'gates': {
        const org = args[1];
        const variantId = args[2];
        if (!org || !variantId) {
          console.error('❌ Missing org or variantId argument');
          process.exit(1);
        }
        const loader = new TaskVariantLoader(org, { verbose });
        const gates = await loader.getQualityGates(variantId);

        if (jsonOutput) {
          console.log(JSON.stringify(gates, null, 2));
        } else {
          console.log(`\n📋 Quality Gates for ${variantId}\n`);
          for (const gate of gates) {
            console.log(`  ${gate.name}`);
            console.log(`    Condition: ${gate.condition}`);
            console.log(`    Severity: ${gate.severity}, On Failure: ${gate.onFailure}`);
          }
        }
        break;
      }

      case 'default': {
        const org = args[1];
        if (!org) {
          console.error('❌ Missing org argument');
          process.exit(1);
        }
        const loader = new TaskVariantLoader(org, { verbose });
        const variant = await loader.getDefaultVariant();

        if (jsonOutput) {
          console.log(JSON.stringify(variant, null, 2));
        } else {
          console.log(`\n📋 Default Task Variant: ${variant.name} (${variant.id})\n`);
          console.log(`Description: ${variant.description}`);
        }
        break;
      }

      default:
        console.error(`❌ Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = TaskVariantLoader;

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  });
}
