#!/usr/bin/env node

/**
 * Task Variant Field Selector
 *
 * Implements the field selection algorithm that combines:
 * - Task variant configuration
 * - Field policy constraints
 * - Object metadata
 * - PII classification
 *
 * Part of the Runbook Policy Infrastructure (Phase 2).
 *
 * Selection Algorithm:
 * 1. Start with mode-based selection (all, updateable, policy, etc.)
 * 2. Apply technical filters (data types, name patterns)
 * 3. Include required fields (always)
 * 4. Exclude sensitive fields (always)
 * 5. Apply object-specific overrides
 * 6. Enforce maxFields limit
 *
 * Usage:
 *   const TaskVariantFieldSelector = require('./task-variant-field-selector');
 *   const selector = new TaskVariantFieldSelector('my-org');
 *   const result = await selector.selectFields('Opportunity', 'backup', objectMetadata);
 *
 * @module task-variant-field-selector
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const FieldPolicyManager = require('./field-policy-manager');
const TaskVariantLoader = require('./task-variant-loader');

// ============================================================================
// CONSTANTS
// ============================================================================

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');

// System fields that are often filtered
const SYSTEM_FIELDS = [
  'SystemModstamp', 'IsDeleted', 'LastViewedDate', 'LastReferencedDate',
  'MasterRecordId', 'PhotoUrl', 'Jigsaw', 'JigsawCompanyId', 'CleanStatus'
];

// ============================================================================
// TASK VARIANT FIELD SELECTOR CLASS
// ============================================================================

class TaskVariantFieldSelector {
  /**
   * Create a TaskVariantFieldSelector
   * @param {string} org - Salesforce org alias
   * @param {Object} options - Configuration options
   */
  constructor(org, options = {}) {
    this.org = org;
    this.verbose = options.verbose || false;
    this.pluginRoot = options.pluginRoot || PLUGIN_ROOT;

    // Initialize dependent managers
    this.policyManager = new FieldPolicyManager(org, options);
    this.variantLoader = new TaskVariantLoader(org, options);
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Select fields for an operation
   * @param {string} objectName - Salesforce object API name
   * @param {string} taskType - Task variant ID
   * @param {Object} objectMetadata - Object describe result with fields array
   * @param {Object} options - Additional options
   * @returns {Object} Field selection result
   */
  async selectFields(objectName, taskType, objectMetadata, options = {}) {
    const startTime = Date.now();

    // Get task variant
    const variant = await this.variantLoader.getVariant(taskType);
    if (!variant) {
      throw new Error(`Unknown task variant: ${taskType}`);
    }

    // Get field policy
    const policy = await this.policyManager.getPolicy(objectName);

    // Get object-specific overrides
    const objectOverride = variant.objectOverrides?.[objectName] || {};

    // Build field selection result
    const result = {
      object: objectName,
      taskType,
      timestamp: new Date().toISOString(),
      variant: {
        id: variant.id,
        name: variant.name,
        fieldSelectionMode: objectOverride.fieldSelectionMode || variant.fieldSelectionMode,
        maxFields: objectOverride.maxFields || variant.maxFields
      },
      fields: {
        selected: [],
        excluded: [],
        required: [],
        reasons: {}
      },
      metadata: {
        totalAvailableFields: 0,
        policyVersion: policy.globalDefaults?.schemaVersion || '1.0',
        selectionDurationMs: 0
      }
    };

    // Get all fields from metadata
    const allFields = objectMetadata?.fields || [];
    result.metadata.totalAvailableFields = allFields.length;

    // Create field map for quick lookup
    const fieldMap = new Map(allFields.map(f => [f.name, f]));

    // Step 1: Apply mode-based selection
    let candidateFields = this._applySelectionMode(
      allFields,
      result.variant.fieldSelectionMode,
      variant,
      objectOverride,
      policy
    );

    // Step 2: Apply technical filters
    candidateFields = this._applyFilters(
      candidateFields,
      variant.fieldFilters || {},
      objectOverride
    );

    // Step 3: Build required fields set
    const requiredFields = this._buildRequiredFields(variant, objectOverride, policy);
    result.fields.required = [...requiredFields];

    // Step 4: Build exclusion set
    const exclusions = this._buildExclusionSet(variant, objectOverride, policy, options);

    // Step 5: Select fields with reasons
    for (const field of candidateFields) {
      const fieldName = field.name;
      const fieldMeta = fieldMap.get(fieldName);

      // Check if required
      if (requiredFields.has(fieldName)) {
        result.fields.selected.push(fieldName);
        result.fields.reasons[fieldName] = 'required';
        continue;
      }

      // Check exclusions
      const exclusionReason = this._checkExclusion(fieldName, fieldMeta, exclusions, policy);
      if (exclusionReason) {
        result.fields.excluded.push(fieldName);
        result.fields.reasons[fieldName] = exclusionReason;
        continue;
      }

      // Check field type filters
      if (!variant.includeFormulaFields && fieldMeta?.calculated) {
        result.fields.excluded.push(fieldName);
        result.fields.reasons[fieldName] = 'formula_field_excluded';
        continue;
      }

      if (!variant.includeSystemFields && SYSTEM_FIELDS.includes(fieldName)) {
        result.fields.excluded.push(fieldName);
        result.fields.reasons[fieldName] = 'system_field_excluded';
        continue;
      }

      if (!variant.includeRollupSummaryFields && fieldMeta?.type === 'currency' && fieldMeta?.aggregatable) {
        // Rough heuristic for rollup summary - could be improved
        // result.fields.excluded.push(fieldName);
        // result.fields.reasons[fieldName] = 'rollup_summary_excluded';
        // continue;
      }

      // Include the field
      result.fields.selected.push(fieldName);
      result.fields.reasons[fieldName] = 'selected';
    }

    // Ensure required fields are included (even if they weren't in candidates)
    for (const reqField of requiredFields) {
      if (!result.fields.selected.includes(reqField) && fieldMap.has(reqField)) {
        result.fields.selected.unshift(reqField);
        result.fields.reasons[reqField] = 'required';
      }
    }

    // Step 6: Enforce max fields
    const maxFields = result.variant.maxFields;
    if (result.fields.selected.length > maxFields) {
      const toRemove = result.fields.selected.slice(maxFields);
      result.fields.selected = result.fields.selected.slice(0, maxFields);

      for (const field of toRemove) {
        result.fields.excluded.push(field);
        result.fields.reasons[field] = `max_fields_exceeded (${maxFields})`;
      }
    }

    // Add timing
    result.metadata.selectionDurationMs = Date.now() - startTime;

    return result;
  }

  /**
   * Build SOQL query from field selection
   * @param {Object} fieldSelection - Result from selectFields
   * @param {Object} options - Query options (filters, orderBy, limit)
   * @returns {string} SOQL query string
   */
  buildQuery(fieldSelection, options = {}) {
    const fields = fieldSelection.fields.selected;
    const object = fieldSelection.object;

    if (fields.length === 0) {
      throw new Error('No fields selected for query');
    }

    let query = `SELECT ${fields.join(', ')} FROM ${object}`;

    if (options.where) {
      query += ` WHERE ${options.where}`;
    }

    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy}`;
    }

    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    return query;
  }

  /**
   * Validate that required fields are available in metadata
   * @param {string} objectName - Object name
   * @param {string} taskType - Task variant ID
   * @param {Object} objectMetadata - Object describe result
   * @returns {Object} Validation result
   */
  async validateRequirements(objectName, taskType, objectMetadata) {
    const variant = await this.variantLoader.getVariant(taskType);
    const policy = await this.policyManager.getPolicy(objectName);
    const objectOverride = variant?.objectOverrides?.[objectName] || {};

    const requiredFields = this._buildRequiredFields(variant, objectOverride, policy);
    const availableFields = new Set((objectMetadata?.fields || []).map(f => f.name));

    const missing = [];
    for (const field of requiredFields) {
      if (!availableFields.has(field)) {
        missing.push(field);
      }
    }

    return {
      valid: missing.length === 0,
      requiredFields: [...requiredFields],
      missingFields: missing,
      message: missing.length === 0
        ? 'All required fields are available'
        : `Missing required fields: ${missing.join(', ')}`
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  _applySelectionMode(allFields, mode, variant, objectOverride, policy) {
    switch (mode) {
      case 'all':
        return [...allFields];

      case 'updateable':
        return allFields.filter(f => f.updateable);

      case 'createable':
        return allFields.filter(f => f.createable);

      case 'readable':
        // All queryable fields
        return allFields.filter(f => !f.deprecatedAndHidden);

      case 'policy':
        // Use policy-defined default fields
        const policyFields = new Set([
          ...(policy.default_fields?.fields || []),
          ...(policy.required_fields?.fields || []),
          ...(policy.recommended_fields?.fields || [])
        ]);
        return allFields.filter(f => policyFields.has(f.name));

      case 'custom':
        // Use explicit field list from override
        if (objectOverride.customFields) {
          const customSet = new Set(objectOverride.customFields);
          return allFields.filter(f => customSet.has(f.name));
        }
        // Fallback to policy
        return this._applySelectionMode(allFields, 'policy', variant, objectOverride, policy);

      default:
        return allFields.filter(f => !f.deprecatedAndHidden);
    }
  }

  _applyFilters(fields, filters, objectOverride) {
    let result = [...fields];

    // Updateable filter
    if (filters.updateable) {
      result = result.filter(f => f.updateable);
    }

    // Createable filter
    if (filters.createable) {
      result = result.filter(f => f.createable);
    }

    // Nillable filter
    if (filters.nillable) {
      result = result.filter(f => f.nillable);
    }

    // External ID filter
    if (filters.externalId) {
      result = result.filter(f => f.externalId);
    }

    // Custom fields only
    if (filters.custom) {
      result = result.filter(f => f.custom);
    }

    // Standard fields only
    if (filters.standard) {
      result = result.filter(f => !f.custom);
    }

    // Data type filters
    if (filters.dataTypes && filters.dataTypes.length > 0) {
      const types = new Set(filters.dataTypes.map(t => t.toLowerCase()));
      result = result.filter(f => types.has(f.type?.toLowerCase()));
    }

    if (filters.excludeDataTypes && filters.excludeDataTypes.length > 0) {
      const excludeTypes = new Set(filters.excludeDataTypes.map(t => t.toLowerCase()));
      result = result.filter(f => !excludeTypes.has(f.type?.toLowerCase()));
    }

    // Name pattern filters
    if (filters.namePatterns && filters.namePatterns.length > 0) {
      const patterns = filters.namePatterns.map(p => new RegExp(p.replace(/\*/g, '.*'), 'i'));
      result = result.filter(f => patterns.some(p => p.test(f.name)));
    }

    if (filters.excludeNamePatterns && filters.excludeNamePatterns.length > 0) {
      const patterns = filters.excludeNamePatterns.map(p => new RegExp(p.replace(/\*/g, '.*'), 'i'));
      result = result.filter(f => !patterns.some(p => p.test(f.name)));
    }

    return result;
  }

  _buildRequiredFields(variant, objectOverride, policy) {
    const required = new Set();

    // From variant
    for (const field of (variant.requiredFields || [])) {
      required.add(field);
    }

    // From object override
    for (const field of (objectOverride.additionalRequired || [])) {
      required.add(field);
    }

    // From policy
    for (const field of (policy.required_fields?.fields || [])) {
      required.add(field);
    }

    // Always include Id
    required.add('Id');

    return required;
  }

  _buildExclusionSet(variant, objectOverride, policy, options) {
    const exclusions = {
      fields: new Set(),
      patterns: [],
      classifications: new Set()
    };

    // From variant
    for (const field of (variant.excludedFields || [])) {
      exclusions.fields.add(field);
    }

    // From object override
    for (const field of (objectOverride.additionalExcluded || [])) {
      exclusions.fields.add(field);
    }

    // From policy sensitive exclusions
    const policyExcl = policy.sensitive_field_exclusions || {};
    for (const field of (policyExcl.fields || [])) {
      exclusions.fields.add(field);
    }
    for (const pattern of (policyExcl.patterns || [])) {
      exclusions.patterns.push(pattern);
    }
    for (const classification of (policyExcl.classifications || [])) {
      exclusions.classifications.add(classification);
    }

    // From global defaults
    for (const pattern of (policy.globalDefaults?.alwaysExclude || [])) {
      if (pattern.includes('*')) {
        exclusions.patterns.push(pattern);
      } else {
        exclusions.fields.add(pattern);
      }
    }

    // User-specified
    for (const field of (options.excludeFields || [])) {
      exclusions.fields.add(field);
    }

    return exclusions;
  }

  _checkExclusion(fieldName, fieldMeta, exclusions, policy) {
    // Explicit field exclusion
    if (exclusions.fields.has(fieldName)) {
      return 'explicit_exclusion';
    }

    // Pattern exclusion
    for (const pattern of exclusions.patterns) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
      if (regex.test(fieldName)) {
        return `pattern_exclusion: ${pattern}`;
      }
    }

    // Classification-based exclusion
    if (policy.globalDefaults?.piiDetectionEnabled) {
      const classification = this._classifyField(fieldName, fieldMeta);
      if (classification && exclusions.classifications.has(classification)) {
        return `classification_exclusion: ${classification}`;
      }
    }

    return null;
  }

  _classifyField(fieldName, fieldMeta) {
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
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const printUsage = () => {
    console.log(`
Task Variant Field Selector - Select fields based on task variant and policy

Usage:
  node task-variant-field-selector.js <command> [options]

Commands:
  select <org> <object> <taskType>  Select fields for an operation
  query <org> <object> <taskType>   Build SOQL query for selection
  validate <org> <object> <taskType>  Validate required fields exist

Options:
  --verbose                Enable verbose output
  --json                   Output as JSON
  --metadata <path>        Path to object metadata JSON file

Examples:
  node task-variant-field-selector.js select my-sandbox Opportunity backup
  node task-variant-field-selector.js query my-sandbox Account export
  node task-variant-field-selector.js validate my-sandbox Lead migration
    `);
  };

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  const verbose = args.includes('--verbose');
  const jsonOutput = args.includes('--json');

  // Get metadata path if provided
  const metadataIdx = args.indexOf('--metadata');
  let metadataPath = null;
  if (metadataIdx !== -1 && args[metadataIdx + 1]) {
    metadataPath = args[metadataIdx + 1];
  }

  try {
    switch (command) {
      case 'select': {
        const org = args[1];
        const objectName = args[2];
        const taskType = args[3] || 'backup';

        if (!org || !objectName) {
          console.error('❌ Missing org or object argument');
          process.exit(1);
        }

        const selector = new TaskVariantFieldSelector(org, { verbose });

        // Load metadata
        let objectMetadata = { fields: [] };
        if (metadataPath && fs.existsSync(metadataPath)) {
          objectMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        } else {
          // Try to load from cache
          const cachePath = path.join(PLUGIN_ROOT, 'instances', org, 'cache', `${objectName}-describe.json`);
          if (fs.existsSync(cachePath)) {
            objectMetadata = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
          }
        }

        const result = await selector.selectFields(objectName, taskType, objectMetadata);

        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\n📋 Field Selection: ${objectName} (${taskType})\n`);
          console.log(`Mode: ${result.variant.fieldSelectionMode}`);
          console.log(`Max Fields: ${result.variant.maxFields}`);
          console.log(`\nSelected: ${result.fields.selected.length} fields`);
          console.log(`Excluded: ${result.fields.excluded.length} fields`);
          console.log(`Required: ${result.fields.required.join(', ')}`);
          console.log(`\nFields: ${result.fields.selected.slice(0, 20).join(', ')}`);
          if (result.fields.selected.length > 20) {
            console.log(`  ... and ${result.fields.selected.length - 20} more`);
          }
          console.log(`\nDuration: ${result.metadata.selectionDurationMs}ms`);
        }
        break;
      }

      case 'query': {
        const org = args[1];
        const objectName = args[2];
        const taskType = args[3] || 'backup';

        if (!org || !objectName) {
          console.error('❌ Missing org or object argument');
          process.exit(1);
        }

        const selector = new TaskVariantFieldSelector(org, { verbose });

        // Load metadata
        let objectMetadata = { fields: [] };
        if (metadataPath && fs.existsSync(metadataPath)) {
          objectMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        } else {
          const cachePath = path.join(PLUGIN_ROOT, 'instances', org, 'cache', `${objectName}-describe.json`);
          if (fs.existsSync(cachePath)) {
            objectMetadata = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
          }
        }

        const selection = await selector.selectFields(objectName, taskType, objectMetadata);
        const query = selector.buildQuery(selection, { limit: 1000 });

        console.log(query);
        break;
      }

      case 'validate': {
        const org = args[1];
        const objectName = args[2];
        const taskType = args[3] || 'backup';

        if (!org || !objectName) {
          console.error('❌ Missing org or object argument');
          process.exit(1);
        }

        const selector = new TaskVariantFieldSelector(org, { verbose });

        // Load metadata
        let objectMetadata = { fields: [] };
        if (metadataPath && fs.existsSync(metadataPath)) {
          objectMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        } else {
          const cachePath = path.join(PLUGIN_ROOT, 'instances', org, 'cache', `${objectName}-describe.json`);
          if (fs.existsSync(cachePath)) {
            objectMetadata = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
          }
        }

        const result = await selector.validateRequirements(objectName, taskType, objectMetadata);

        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (result.valid) {
            console.log(`✅ ${result.message}`);
          } else {
            console.log(`❌ ${result.message}`);
            process.exit(1);
          }
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

module.exports = TaskVariantFieldSelector;

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  });
}
