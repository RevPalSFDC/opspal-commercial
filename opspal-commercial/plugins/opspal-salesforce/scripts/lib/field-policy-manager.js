#!/usr/bin/env node

/**
 * Field Policy Manager
 *
 * Manages field policies for Salesforce objects. Provides loading, saving,
 * merging, and validation of per-object field policies that define which
 * fields are required, recommended, or excluded for different operations.
 *
 * Part of the Runbook Policy Infrastructure (Phase 1).
 *
 * Key Features:
 * - Load global defaults + org-specific policies
 * - Merge policies with org overrides (org can ADD exclusions, never REMOVE)
 * - Validate policies against JSON Schema
 * - Integrate with data-classification-framework for PII detection
 * - Apply policies to field selection operations
 *
 * Usage:
 *   const FieldPolicyManager = require('./field-policy-manager');
 *   const manager = new FieldPolicyManager('my-org');
 *   const policy = await manager.getPolicy('Opportunity');
 *   const fields = manager.selectFields('Opportunity', 'backup', objectMetadata);
 *
 * CLI:
 *   node field-policy-manager.js init <org>     # Initialize org policy
 *   node field-policy-manager.js get <org> <object>  # Get policy
 *   node field-policy-manager.js validate <org> # Validate org policy
 *   node field-policy-manager.js merge <org>    # Show merged policy
 *
 * @module field-policy-manager
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Schema validation (optional - graceful fallback)
let Ajv;
try {
  Ajv = require('ajv');
} catch (e) {
  // Ajv not available - validation will be skipped
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Plugin root is always relative to this script's location
const PLUGIN_ROOT = path.resolve(__dirname, '../..');
// Use CLAUDE_PLUGIN_ROOT for instance data, but config files are always in plugin
const INSTANCES_ROOT = process.env.CLAUDE_PLUGIN_ROOT || PLUGIN_ROOT;
const SCHEMA_PATH = path.join(PLUGIN_ROOT, 'config', 'field-policy.schema.json');
const DEFAULTS_PATH = path.join(PLUGIN_ROOT, 'config', 'field-policy-defaults.json');

// Cache for loaded policies
const policyCache = new Map();
const CACHE_TTL = 300000; // 5 minutes

// ============================================================================
// FIELD POLICY MANAGER CLASS
// ============================================================================

class FieldPolicyManager {
  /**
   * Create a FieldPolicyManager
   * @param {string} org - Salesforce org alias
   * @param {Object} options - Configuration options
   */
  constructor(org, options = {}) {
    this.org = org;
    this.verbose = options.verbose || false;
    this.pluginRoot = options.pluginRoot || PLUGIN_ROOT;
    this.instancesRoot = options.instancesRoot || INSTANCES_ROOT;
    this.enablePiiDetection = options.enablePiiDetection !== false;

    // Paths
    this.defaultsPath = DEFAULTS_PATH;
    this.schemaPath = SCHEMA_PATH;

    // Determine org policy path (supports both legacy and org-centric)
    this.orgPolicyPath = this._resolveOrgPolicyPath(org);

    // Load schema validator
    this.validator = this._initValidator();
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Get the merged policy for an object
   * @param {string} objectName - Salesforce object API name
   * @returns {Object} Merged policy for the object
   */
  async getPolicy(objectName) {
    const mergedPolicy = await this.getMergedPolicy();
    const objectPolicy = mergedPolicy.policies[objectName] || {};

    return {
      object: objectName,
      required_fields: objectPolicy.required_fields || { fields: [], source: 'default' },
      default_fields: objectPolicy.default_fields || { fields: [], source: 'default' },
      recommended_fields: objectPolicy.recommended_fields || { fields: [], source: 'default' },
      sensitive_field_exclusions: this._mergeSensitiveExclusions(
        mergedPolicy.globalDefaults,
        objectPolicy.sensitive_field_exclusions
      ),
      field_aliases: objectPolicy.field_aliases || {},
      maxFields: objectPolicy.maxFields || mergedPolicy.globalDefaults.maxFieldsDefault || 100,
      globalDefaults: mergedPolicy.globalDefaults
    };
  }

  /**
   * Get the fully merged policy (defaults + org-specific)
   * @returns {Object} Complete merged policy
   */
  async getMergedPolicy() {
    const cacheKey = `merged-${this.org}`;

    // Check cache
    const cached = policyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.policy;
    }

    // Load defaults
    const defaults = this._loadDefaults();

    // Load org-specific policy
    const orgPolicy = this._loadOrgPolicy();

    // Merge (org overrides but cannot remove global exclusions)
    const merged = this._mergePolicies(defaults, orgPolicy);

    // Cache
    policyCache.set(cacheKey, { policy: merged, timestamp: Date.now() });

    return merged;
  }

  /**
   * Select fields for an operation based on policy
   * @param {string} objectName - Salesforce object API name
   * @param {string} taskType - Task type (backup, migration, enrichment, export, audit)
   * @param {Object} objectMetadata - Object describe metadata (fields array)
   * @param {Object} options - Additional options
   * @returns {Object} Selected fields with rationale
   */
  async selectFields(objectName, taskType, objectMetadata, options = {}) {
    const policy = await this.getPolicy(objectName);
    const mergedPolicy = await this.getMergedPolicy();
    const taskOverride = mergedPolicy.taskVariantOverrides?.[taskType] || {};

    const result = {
      object: objectName,
      taskType,
      timestamp: new Date().toISOString(),
      fields: {
        selected: [],
        excluded: [],
        reasons: {}
      }
    };

    // Get all available fields from metadata
    const allFields = objectMetadata?.fields || [];
    const fieldMap = new Map(allFields.map(f => [f.name, f]));

    // Start with required fields (always included)
    const requiredFields = new Set([
      ...(policy.required_fields?.fields || []),
      ...(policy.globalDefaults?.alwaysInclude || []),
      ...(taskOverride.additionalRequired || [])
    ]);

    for (const field of requiredFields) {
      if (fieldMap.has(field)) {
        result.fields.selected.push(field);
        result.fields.reasons[field] = 'required';
      }
    }

    // Build exclusion set
    const exclusions = this._buildExclusionSet(policy, taskOverride, options);

    // Add default/recommended fields based on task type
    const candidateFields = new Set([
      ...(policy.default_fields?.fields || []),
      ...(options.includeRecommended ? (policy.recommended_fields?.fields || []) : [])
    ]);

    // Add all fields if task type requires it
    if (taskType === 'backup' || taskType === 'migration' || taskType === 'audit') {
      for (const field of allFields) {
        candidateFields.add(field.name);
      }
    }

    // Filter candidates
    for (const fieldName of candidateFields) {
      if (result.fields.selected.includes(fieldName)) continue;

      const fieldMeta = fieldMap.get(fieldName);
      if (!fieldMeta) continue;

      // Check exclusions
      const exclusionReason = this._checkExclusion(fieldName, fieldMeta, exclusions, policy, taskOverride);

      if (exclusionReason) {
        result.fields.excluded.push(fieldName);
        result.fields.reasons[fieldName] = exclusionReason;
        continue;
      }

      // Check field type filters
      if (!taskOverride.includeFormulaFields && fieldMeta.calculated) {
        result.fields.excluded.push(fieldName);
        result.fields.reasons[fieldName] = 'formula_field_excluded';
        continue;
      }

      if (!taskOverride.includeSystemFields && this._isSystemField(fieldName)) {
        result.fields.excluded.push(fieldName);
        result.fields.reasons[fieldName] = 'system_field_excluded';
        continue;
      }

      result.fields.selected.push(fieldName);
      result.fields.reasons[fieldName] = candidateFields.has(fieldName) ? 'default' : 'included';
    }

    // Enforce max fields
    const maxFields = taskOverride.maxFields || policy.maxFields;
    if (result.fields.selected.length > maxFields) {
      const toRemove = result.fields.selected.slice(maxFields);
      result.fields.selected = result.fields.selected.slice(0, maxFields);

      for (const field of toRemove) {
        result.fields.excluded.push(field);
        result.fields.reasons[field] = `max_fields_exceeded (${maxFields})`;
      }
    }

    // Add metadata
    result.policyVersion = mergedPolicy.schemaVersion;
    result.appliedTaskOverride = taskType;

    return result;
  }

  /**
   * Initialize org policy from defaults
   * @returns {Object} Initialized policy
   */
  initOrgPolicy() {
    const defaults = this._loadDefaults();

    const orgPolicy = {
      schemaVersion: defaults.schemaVersion,
      org: this.org,
      lastUpdated: new Date().toISOString(),
      globalDefaults: {
        alwaysExclude: [],
        alwaysInclude: [],
        piiDetectionEnabled: true,
        maxFieldsDefault: 100
      },
      policies: {},
      taskVariantOverrides: {}
    };

    // Ensure directory exists
    const policyDir = path.dirname(this.orgPolicyPath);
    if (!fs.existsSync(policyDir)) {
      fs.mkdirSync(policyDir, { recursive: true });
    }

    // Write initial policy
    fs.writeFileSync(this.orgPolicyPath, JSON.stringify(orgPolicy, null, 2));

    if (this.verbose) {
      console.log(`✅ Initialized field policy at: ${this.orgPolicyPath}`);
    }

    return orgPolicy;
  }

  /**
   * Save org policy
   * @param {Object} policy - Policy to save
   */
  saveOrgPolicy(policy) {
    policy.lastUpdated = new Date().toISOString();

    // Validate before saving
    if (this.validator) {
      const valid = this.validator(policy);
      if (!valid) {
        throw new Error(`Invalid policy: ${JSON.stringify(this.validator.errors)}`);
      }
    }

    // Ensure directory exists
    const policyDir = path.dirname(this.orgPolicyPath);
    if (!fs.existsSync(policyDir)) {
      fs.mkdirSync(policyDir, { recursive: true });
    }

    fs.writeFileSync(this.orgPolicyPath, JSON.stringify(policy, null, 2));

    // Invalidate cache
    policyCache.delete(`merged-${this.org}`);

    if (this.verbose) {
      console.log(`✅ Saved field policy to: ${this.orgPolicyPath}`);
    }
  }

  /**
   * Add exclusion to org policy
   * @param {string} objectName - Object to add exclusion for (or '*' for global)
   * @param {Object} exclusion - Exclusion to add
   */
  addExclusion(objectName, exclusion) {
    let orgPolicy = this._loadOrgPolicy() || this.initOrgPolicy();

    if (objectName === '*') {
      // Global exclusion
      if (!orgPolicy.globalDefaults) {
        orgPolicy.globalDefaults = { alwaysExclude: [] };
      }
      if (!orgPolicy.globalDefaults.alwaysExclude) {
        orgPolicy.globalDefaults.alwaysExclude = [];
      }

      if (exclusion.field) {
        if (!orgPolicy.globalDefaults.alwaysExclude.includes(exclusion.field)) {
          orgPolicy.globalDefaults.alwaysExclude.push(exclusion.field);
        }
      }
      if (exclusion.pattern) {
        if (!orgPolicy.globalDefaults.alwaysExclude.includes(exclusion.pattern)) {
          orgPolicy.globalDefaults.alwaysExclude.push(exclusion.pattern);
        }
      }
    } else {
      // Object-specific exclusion
      if (!orgPolicy.policies) {
        orgPolicy.policies = {};
      }
      if (!orgPolicy.policies[objectName]) {
        orgPolicy.policies[objectName] = {};
      }
      if (!orgPolicy.policies[objectName].sensitive_field_exclusions) {
        orgPolicy.policies[objectName].sensitive_field_exclusions = {
          fields: [],
          patterns: [],
          classifications: []
        };
      }

      const exc = orgPolicy.policies[objectName].sensitive_field_exclusions;

      if (exclusion.field && !exc.fields.includes(exclusion.field)) {
        exc.fields.push(exclusion.field);
      }
      if (exclusion.pattern && !exc.patterns.includes(exclusion.pattern)) {
        exc.patterns.push(exclusion.pattern);
      }
      if (exclusion.classification && !exc.classifications.includes(exclusion.classification)) {
        exc.classifications.push(exclusion.classification);
      }
      if (exclusion.complianceReason) {
        exc.complianceReason = exclusion.complianceReason;
      }
    }

    this.saveOrgPolicy(orgPolicy);
  }

  /**
   * Validate policy against schema
   * @param {Object} policy - Policy to validate
   * @returns {Object} Validation result
   */
  validate(policy) {
    if (!this.validator) {
      return { valid: true, warnings: ['Schema validation skipped - ajv not installed'] };
    }

    const valid = this.validator(policy);
    return {
      valid,
      errors: this.validator.errors || [],
      warnings: []
    };
  }

  /**
   * Get policy file path for org
   * @returns {string} Path to org policy file
   */
  getPolicyPath() {
    return this.orgPolicyPath;
  }

  /**
   * Clear cache
   */
  clearCache() {
    policyCache.clear();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  _resolveOrgPolicyPath(org) {
    // Try org-centric path first
    const orgSlug = process.env.ORG_SLUG || '';
    const basePaths = [
      // Org-centric (new structure) - relative to instances root
      path.join(this.instancesRoot, 'orgs', orgSlug, 'platforms', 'salesforce', org, 'configs', 'field-policy.json'),
      path.join(this.instancesRoot, 'orgs', org, 'platforms', 'salesforce', org, 'configs', 'field-policy.json'),
      // Legacy instance structure - check both plugin-local and global
      path.join(this.instancesRoot, 'instances', 'salesforce', org, 'field-policy.json'),
      path.join(this.instancesRoot, 'instances', org, 'field-policy.json'),
      path.join(this.pluginRoot, 'instances', 'salesforce', org, 'field-policy.json'),
      path.join(this.pluginRoot, 'instances', org, 'field-policy.json')
    ];

    // Return first existing or first candidate
    for (const p of basePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    // Default to instancesRoot for new orgs
    return path.join(this.instancesRoot, 'instances', 'salesforce', org, 'field-policy.json');
  }

  _initValidator() {
    if (!Ajv) return null;

    try {
      if (fs.existsSync(this.schemaPath)) {
        const schema = JSON.parse(fs.readFileSync(this.schemaPath, 'utf-8'));
        const ajv = new Ajv({ allErrors: true });
        return ajv.compile(schema);
      }
    } catch (e) {
      if (this.verbose) {
        console.warn(`⚠️  Failed to load schema: ${e.message}`);
      }
    }

    return null;
  }

  _loadDefaults() {
    if (!fs.existsSync(this.defaultsPath)) {
      throw new Error(`Default policy not found: ${this.defaultsPath}`);
    }

    return JSON.parse(fs.readFileSync(this.defaultsPath, 'utf-8'));
  }

  _loadOrgPolicy() {
    if (!fs.existsSync(this.orgPolicyPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(this.orgPolicyPath, 'utf-8'));
    } catch (e) {
      if (this.verbose) {
        console.warn(`⚠️  Failed to load org policy: ${e.message}`);
      }
      return null;
    }
  }

  _mergePolicies(defaults, orgPolicy) {
    if (!orgPolicy) {
      return defaults;
    }

    const merged = JSON.parse(JSON.stringify(defaults));

    // Merge global defaults (org can ADD exclusions, not remove)
    if (orgPolicy.globalDefaults) {
      if (orgPolicy.globalDefaults.alwaysExclude) {
        merged.globalDefaults.alwaysExclude = [
          ...new Set([
            ...merged.globalDefaults.alwaysExclude,
            ...orgPolicy.globalDefaults.alwaysExclude
          ])
        ];
      }
      if (orgPolicy.globalDefaults.alwaysInclude) {
        merged.globalDefaults.alwaysInclude = [
          ...new Set([
            ...merged.globalDefaults.alwaysInclude,
            ...orgPolicy.globalDefaults.alwaysInclude
          ])
        ];
      }
      if (orgPolicy.globalDefaults.piiDetectionEnabled !== undefined) {
        merged.globalDefaults.piiDetectionEnabled = orgPolicy.globalDefaults.piiDetectionEnabled;
      }
      if (orgPolicy.globalDefaults.maxFieldsDefault) {
        merged.globalDefaults.maxFieldsDefault = orgPolicy.globalDefaults.maxFieldsDefault;
      }
    }

    // Merge object policies
    if (orgPolicy.policies) {
      for (const [objectName, objectPolicy] of Object.entries(orgPolicy.policies)) {
        if (!merged.policies[objectName]) {
          merged.policies[objectName] = {};
        }

        // Override field sets (org takes precedence)
        if (objectPolicy.required_fields) {
          merged.policies[objectName].required_fields = objectPolicy.required_fields;
        }
        if (objectPolicy.default_fields) {
          merged.policies[objectName].default_fields = objectPolicy.default_fields;
        }
        if (objectPolicy.recommended_fields) {
          merged.policies[objectName].recommended_fields = objectPolicy.recommended_fields;
        }

        // Merge exclusions (additive)
        if (objectPolicy.sensitive_field_exclusions) {
          merged.policies[objectName].sensitive_field_exclusions =
            this._mergeExclusions(
              merged.policies[objectName].sensitive_field_exclusions,
              objectPolicy.sensitive_field_exclusions
            );
        }

        // Override other settings
        if (objectPolicy.field_aliases) {
          merged.policies[objectName].field_aliases = {
            ...(merged.policies[objectName].field_aliases || {}),
            ...objectPolicy.field_aliases
          };
        }
        if (objectPolicy.maxFields) {
          merged.policies[objectName].maxFields = objectPolicy.maxFields;
        }
      }
    }

    // Merge task variant overrides
    if (orgPolicy.taskVariantOverrides) {
      merged.taskVariantOverrides = {
        ...merged.taskVariantOverrides,
        ...orgPolicy.taskVariantOverrides
      };
    }

    merged.org = this.org;
    merged.lastUpdated = new Date().toISOString();

    return merged;
  }

  _mergeExclusions(baseExclusion, orgExclusion) {
    if (!baseExclusion && !orgExclusion) return {};
    if (!baseExclusion) return orgExclusion;
    if (!orgExclusion) return baseExclusion;

    return {
      fields: [...new Set([...(baseExclusion.fields || []), ...(orgExclusion.fields || [])])],
      patterns: [...new Set([...(baseExclusion.patterns || []), ...(orgExclusion.patterns || [])])],
      classifications: [...new Set([...(baseExclusion.classifications || []), ...(orgExclusion.classifications || [])])],
      complianceReason: orgExclusion.complianceReason || baseExclusion.complianceReason,
      excludeFromTaskTypes: [...new Set([
        ...(baseExclusion.excludeFromTaskTypes || []),
        ...(orgExclusion.excludeFromTaskTypes || [])
      ])]
    };
  }

  _mergeSensitiveExclusions(globalDefaults, objectExclusions) {
    const merged = {
      fields: [],
      patterns: [...(globalDefaults.alwaysExclude || [])],
      classifications: []
    };

    if (objectExclusions) {
      merged.fields = [...(objectExclusions.fields || [])];
      merged.patterns = [...merged.patterns, ...(objectExclusions.patterns || [])];
      merged.classifications = [...(objectExclusions.classifications || [])];
      merged.complianceReason = objectExclusions.complianceReason;
    }

    return merged;
  }

  _buildExclusionSet(policy, taskOverride, options) {
    const exclusions = {
      fields: new Set(),
      patterns: [],
      classifications: new Set()
    };

    // Global exclusions
    for (const pattern of (policy.globalDefaults?.alwaysExclude || [])) {
      if (pattern.includes('*')) {
        exclusions.patterns.push(pattern);
      } else {
        exclusions.fields.add(pattern);
      }
    }

    // Object exclusions
    const objExcl = policy.sensitive_field_exclusions || {};
    for (const field of (objExcl.fields || [])) {
      exclusions.fields.add(field);
    }
    for (const pattern of (objExcl.patterns || [])) {
      exclusions.patterns.push(pattern);
    }
    for (const classification of (objExcl.classifications || [])) {
      exclusions.classifications.add(classification);
    }

    // Task-specific exclusions
    for (const field of (taskOverride.additionalExcluded || [])) {
      exclusions.fields.add(field);
    }

    // User-specified exclusions
    for (const field of (options.excludeFields || [])) {
      exclusions.fields.add(field);
    }

    return exclusions;
  }

  _checkExclusion(fieldName, fieldMeta, exclusions, policy, taskOverride) {
    // Check explicit field exclusion
    if (exclusions.fields.has(fieldName)) {
      return 'explicit_exclusion';
    }

    // Check pattern exclusion
    for (const pattern of exclusions.patterns) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
      if (regex.test(fieldName)) {
        return `pattern_exclusion: ${pattern}`;
      }
    }

    // Check classification-based exclusion (if PII detection enabled)
    if (policy.globalDefaults?.piiDetectionEnabled && this.enablePiiDetection) {
      const classification = this._classifyField(fieldName, fieldMeta);
      if (classification && exclusions.classifications.has(classification)) {
        return `classification_exclusion: ${classification}`;
      }
    }

    return null;
  }

  _classifyField(fieldName, fieldMeta) {
    // Simplified PII classification based on field name patterns
    // Full classification uses data-classification-framework.js
    const patterns = {
      DIRECT_IDENTIFIER: /email|ssn|social.*security|passport|driver.*license|tax.*id/i,
      CONTACT_INFO: /phone|mobile|fax|address|street|city|state|zip|postal/i,
      DEMOGRAPHIC: /birth.*date|dob|age|gender|sex|race|ethnicity/i,
      FINANCIAL: /credit.*card|bank.*account|routing.*number|salary|income/i,
      HEALTH: /diagnosis|medication|treatment|insurance|medical|health/i
    };

    const combined = `${fieldName} ${fieldMeta?.label || ''}`;

    for (const [classification, pattern] of Object.entries(patterns)) {
      if (pattern.test(combined)) {
        return classification;
      }
    }

    return null;
  }

  _isSystemField(fieldName) {
    const systemFields = [
      'SystemModstamp', 'IsDeleted', 'LastViewedDate', 'LastReferencedDate',
      'MasterRecordId', 'PhotoUrl', 'Jigsaw', 'JigsawCompanyId'
    ];
    return systemFields.includes(fieldName);
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
Field Policy Manager - Manage per-object field policies

Usage:
  node field-policy-manager.js <command> [options]

Commands:
  init <org>                Initialize field policy for an org
  get <org> <object>        Get merged policy for an object
  select <org> <object> <taskType>  Get field selection for operation
  validate <org>            Validate org policy against schema
  merge <org>               Show fully merged policy
  add-exclusion <org> <object> <field>  Add field exclusion
  path <org>                Show policy file path
  clear-cache               Clear policy cache

Options:
  --verbose                 Enable verbose output
  --json                    Output as JSON

Examples:
  # Initialize new org
  node field-policy-manager.js init my-sandbox

  # Get policy for Opportunity
  node field-policy-manager.js get my-sandbox Opportunity

  # Get field selection for backup
  node field-policy-manager.js select my-sandbox Opportunity backup

  # Add exclusion
  node field-policy-manager.js add-exclusion my-sandbox Account Internal_Notes__c
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
      case 'init': {
        const org = args[1];
        if (!org) {
          console.error('❌ Missing org argument');
          process.exit(1);
        }
        const manager = new FieldPolicyManager(org, { verbose });
        const policy = manager.initOrgPolicy();
        console.log(`✅ Initialized field policy for ${org}`);
        console.log(`   Path: ${manager.getPolicyPath()}`);
        break;
      }

      case 'get': {
        const org = args[1];
        const objectName = args[2];
        if (!org || !objectName) {
          console.error('❌ Missing org or object argument');
          process.exit(1);
        }
        const manager = new FieldPolicyManager(org, { verbose });
        const policy = await manager.getPolicy(objectName);

        if (jsonOutput) {
          console.log(JSON.stringify(policy, null, 2));
        } else {
          console.log(`\n📋 Field Policy for ${objectName} (${org})\n`);
          console.log('Required Fields:', policy.required_fields?.fields?.join(', ') || 'None');
          console.log('Default Fields:', policy.default_fields?.fields?.length || 0);
          console.log('Recommended Fields:', policy.recommended_fields?.fields?.length || 0);
          console.log('Exclusions:', (policy.sensitive_field_exclusions?.fields?.length || 0) + ' fields, ' +
                      (policy.sensitive_field_exclusions?.patterns?.length || 0) + ' patterns');
          console.log('Max Fields:', policy.maxFields);
        }
        break;
      }

      case 'select': {
        const org = args[1];
        const objectName = args[2];
        const taskType = args[3] || 'backup';
        if (!org || !objectName) {
          console.error('❌ Missing org or object argument');
          process.exit(1);
        }

        const manager = new FieldPolicyManager(org, { verbose });

        // Get object metadata from cache or simple stub
        let objectMetadata = { fields: [] };
        try {
          const cachePath = path.join(manager.pluginRoot, 'instances', org, 'cache', `${objectName}-describe.json`);
          if (fs.existsSync(cachePath)) {
            objectMetadata = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
          }
        } catch (e) {
          // Use empty metadata
        }

        const selection = await manager.selectFields(objectName, taskType, objectMetadata);

        if (jsonOutput) {
          console.log(JSON.stringify(selection, null, 2));
        } else {
          console.log(`\n📋 Field Selection for ${objectName} (${taskType})\n`);
          console.log('Selected Fields:', selection.fields.selected.length);
          console.log('Excluded Fields:', selection.fields.excluded.length);
          console.log('\nSelected:', selection.fields.selected.join(', '));
          if (selection.fields.excluded.length > 0) {
            console.log('\nExcluded:');
            for (const field of selection.fields.excluded.slice(0, 10)) {
              console.log(`  - ${field}: ${selection.fields.reasons[field]}`);
            }
            if (selection.fields.excluded.length > 10) {
              console.log(`  ... and ${selection.fields.excluded.length - 10} more`);
            }
          }
        }
        break;
      }

      case 'validate': {
        const org = args[1];
        if (!org) {
          console.error('❌ Missing org argument');
          process.exit(1);
        }
        const manager = new FieldPolicyManager(org, { verbose });
        const mergedPolicy = await manager.getMergedPolicy();
        const result = manager.validate(mergedPolicy);

        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (result.valid) {
            console.log(`✅ Policy for ${org} is valid`);
          } else {
            console.log(`❌ Policy for ${org} has errors:`);
            for (const error of result.errors) {
              console.log(`  - ${error.instancePath}: ${error.message}`);
            }
          }
          for (const warning of result.warnings) {
            console.log(`⚠️  ${warning}`);
          }
        }
        break;
      }

      case 'merge': {
        const org = args[1];
        if (!org) {
          console.error('❌ Missing org argument');
          process.exit(1);
        }
        const manager = new FieldPolicyManager(org, { verbose });
        const merged = await manager.getMergedPolicy();
        console.log(JSON.stringify(merged, null, 2));
        break;
      }

      case 'add-exclusion': {
        const org = args[1];
        const objectName = args[2];
        const field = args[3];
        if (!org || !objectName || !field) {
          console.error('❌ Missing org, object, or field argument');
          process.exit(1);
        }
        const manager = new FieldPolicyManager(org, { verbose });
        manager.addExclusion(objectName, { field });
        console.log(`✅ Added exclusion for ${field} on ${objectName}`);
        break;
      }

      case 'path': {
        const org = args[1];
        if (!org) {
          console.error('❌ Missing org argument');
          process.exit(1);
        }
        const manager = new FieldPolicyManager(org, { verbose });
        console.log(manager.getPolicyPath());
        break;
      }

      case 'clear-cache': {
        policyCache.clear();
        console.log('✅ Policy cache cleared');
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

module.exports = FieldPolicyManager;

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  });
}
