#!/usr/bin/env node

/**
 * Runbook Policy Retriever
 *
 * Implements the RUNBOOK_REQUEST protocol for retrieving field policies
 * before operational agents select fields. This is the core integration
 * point between runbooks, field policies, and task variants.
 *
 * Part of the Runbook Policy Infrastructure (Phase 3).
 *
 * Features:
 * - Retrieves field policies from runbooks and policy files
 * - Integrates task variant configuration
 * - Provides compliance rules and exclusions
 * - Supports caching with configurable TTL
 * - Escalation flow for missing policies
 *
 * Usage:
 *   const RunbookPolicyRetriever = require('./runbook-policy-retriever');
 *   const retriever = new RunbookPolicyRetriever();
 *
 *   const request = {
 *     org: 'my-org',
 *     object: 'Opportunity',
 *     task_type: 'backup'
 *   };
 *
 *   const response = await retriever.retrieve(request);
 *
 * @module runbook-policy-retriever
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Import dependent modules
const FieldPolicyManager = require('./field-policy-manager');
const TaskVariantLoader = require('./task-variant-loader');

// Try to import runbook context extractor
let extractRunbookContext;
try {
  const extractor = require('./runbook-context-extractor');
  extractRunbookContext = extractor.extractRunbookContext;
} catch (e) {
  extractRunbookContext = () => ({ exists: false });
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Plugin root is always relative to this script's location
const PLUGIN_ROOT = path.resolve(__dirname, '../..');
// Use CLAUDE_PLUGIN_ROOT for instance data
const INSTANCES_ROOT = process.env.CLAUDE_PLUGIN_ROOT || PLUGIN_ROOT;

// Cache configuration
const CACHE_TTL = parseInt(process.env.RUNBOOK_POLICY_CACHE_TTL || '300', 10) * 1000; // 5 minutes default
const MAX_CACHE_ENTRIES = 100;

// Policy retrieval cache
const policyCache = new Map();

// ============================================================================
// RUNBOOK POLICY RETRIEVER CLASS
// ============================================================================

class RunbookPolicyRetriever {
  /**
   * Create a RunbookPolicyRetriever
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.strictMode = options.strictMode || false;
    this.autoGenerate = options.autoGenerate || false;
    this.pluginRoot = options.pluginRoot || PLUGIN_ROOT;
    this.instancesRoot = options.instancesRoot || INSTANCES_ROOT;
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Retrieve runbook policy for an operation
   * @param {Object} request - RUNBOOK_REQUEST object
   * @returns {Object} RUNBOOK_RESPONSE object
   */
  async retrieve(request) {
    const startTime = Date.now();

    // Validate request
    const validationResult = this._validateRequest(request);
    if (!validationResult.valid) {
      return this._buildErrorResponse(request, 'INVALID_REQUEST', validationResult.message);
    }

    // Generate request ID if not provided
    const requestId = request.request_id || this._generateRequestId();

    // Check cache
    const cacheKey = this._buildCacheKey(request);
    const cached = this._checkCache(cacheKey);
    if (cached) {
      return {
        ...cached,
        request_id: requestId,
        cache_metadata: {
          from_cache: true,
          cache_key: cacheKey,
          cache_ttl: CACHE_TTL / 1000,
          expires_at: new Date(cached._cache_timestamp + CACHE_TTL).toISOString()
        }
      };
    }

    try {
      // Initialize managers for the org
      const policyManager = new FieldPolicyManager(request.org, { verbose: this.verbose, pluginRoot: this.pluginRoot, instancesRoot: this.instancesRoot });
      const variantLoader = new TaskVariantLoader(request.org, { verbose: this.verbose, pluginRoot: this.pluginRoot, instancesRoot: this.instancesRoot });

      // Get field policy
      const fieldPolicy = await policyManager.getPolicy(request.object);

      // Get task variant
      const taskVariant = await variantLoader.getVariant(request.task_type);

      // Get runbook context
      const runbookContext = extractRunbookContext(request.org, {
        operationType: request.task_type,
        objects: [request.object]
      });

      // Check if we have meaningful policy data
      const hasPolicyData = fieldPolicy.required_fields?.fields?.length > 0 ||
                           fieldPolicy.default_fields?.fields?.length > 0 ||
                           taskVariant !== null;

      if (!hasPolicyData && !runbookContext.exists) {
        // No policy found - handle based on mode
        if (this.strictMode) {
          return this._buildEscalationResponse(request, requestId);
        }

        if (this.autoGenerate) {
          // Would trigger /generate-runbook here
          return this._buildGeneratedResponse(request, requestId, fieldPolicy, taskVariant);
        }

        return this._buildNotFoundResponse(request, requestId);
      }

      // Build successful response
      const response = this._buildSuccessResponse(
        request,
        requestId,
        fieldPolicy,
        taskVariant,
        runbookContext
      );

      // Cache the response
      this._cacheResponse(cacheKey, response);

      // Add timing
      response._retrieval_duration_ms = Date.now() - startTime;

      return response;

    } catch (error) {
      if (this.verbose) {
        console.error(`Policy retrieval error: ${error.message}`);
      }
      return this._buildErrorResponse(request, 'RETRIEVAL_ERROR', error.message);
    }
  }

  /**
   * Invalidate cache for an org/object combination
   * @param {string} org - Org alias
   * @param {string} object - Object name (optional, clears all if not provided)
   */
  invalidateCache(org, object = null) {
    if (object) {
      const keyPrefix = `${org}:${object}:`;
      for (const key of policyCache.keys()) {
        if (key.startsWith(keyPrefix)) {
          policyCache.delete(key);
        }
      }
    } else {
      const keyPrefix = `${org}:`;
      for (const key of policyCache.keys()) {
        if (key.startsWith(keyPrefix)) {
          policyCache.delete(key);
        }
      }
    }
  }

  /**
   * Clear entire cache
   */
  clearCache() {
    policyCache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const [key, value] of policyCache.entries()) {
      if (now - value._cache_timestamp < CACHE_TTL) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: policyCache.size,
      validEntries,
      expiredEntries,
      maxEntries: MAX_CACHE_ENTRIES,
      ttlSeconds: CACHE_TTL / 1000
    };
  }

  // ============================================================================
  // PRIVATE METHODS - Response Builders
  // ============================================================================

  _buildSuccessResponse(request, requestId, fieldPolicy, taskVariant, runbookContext) {
    const objectOverride = taskVariant?.objectOverrides?.[request.object] || {};

    // Build required fields list
    const requiredFields = new Set([
      ...(fieldPolicy.required_fields?.fields || []),
      ...(taskVariant?.requiredFields || []),
      ...(objectOverride.additionalRequired || [])
    ]);

    // Build prohibited fields list
    const prohibitedFields = new Set([
      ...(fieldPolicy.sensitive_field_exclusions?.fields || []),
      ...(taskVariant?.excludedFields || []),
      ...(objectOverride.additionalExcluded || [])
    ]);

    // Build recommended fields
    const recommendedFields = new Set([
      ...(fieldPolicy.default_fields?.fields || []),
      ...(fieldPolicy.recommended_fields?.fields || [])
    ]);

    // Remove required/prohibited from recommended
    for (const f of requiredFields) recommendedFields.delete(f);
    for (const f of prohibitedFields) recommendedFields.delete(f);

    // Build compliance rules
    const complianceRules = this._buildComplianceRules(
      fieldPolicy,
      request.context?.compliance_requirements || []
    );

    return {
      status: 'found',
      request_id: requestId,
      timestamp: new Date().toISOString(),
      runbook_version: runbookContext.metadata?.version || '1.0.0',

      field_policy: {
        required_fields: [...requiredFields],
        recommended_fields: [...recommendedFields],
        prohibited_fields: [...prohibitedFields],
        max_fields: objectOverride.maxFields || taskVariant?.maxFields || fieldPolicy.maxFields || 100,
        field_aliases: fieldPolicy.field_aliases || {}
      },

      task_variant: {
        variant_id: taskVariant?.id || request.task_type,
        variant_name: taskVariant?.name || request.task_type,
        field_selection_mode: objectOverride.fieldSelectionMode || taskVariant?.fieldSelectionMode || 'policy',
        workflow_steps: (taskVariant?.workflowSteps || []).map(s => ({
          id: s.id,
          name: s.name,
          action: s.action,
          on_failure: s.onFailure
        })),
        quality_gates: (taskVariant?.qualityGates || []).map(g => ({
          id: g.id,
          name: g.name,
          condition: g.condition,
          severity: g.severity,
          on_failure: g.onFailure
        })),
        rollback_strategy: taskVariant?.rollbackStrategy ? {
          type: taskVariant.rollbackStrategy.type,
          snapshot_retention: taskVariant.rollbackStrategy.snapshotRetention,
          auto_rollback: taskVariant.rollbackStrategy.autoRollbackOnFailure
        } : null,
        risk_level: taskVariant?.riskLevel || 'low',
        approval_required: taskVariant?.approvalRequired || false
      },

      exclusions: {
        record_types: [],
        filter_conditions: [],
        owners_excluded: []
      },

      compliance_rules: complianceRules,

      operational_context: {
        known_exceptions: (runbookContext.knownExceptions || []).map(e => ({
          name: e.name,
          recommendation: e.recommendation,
          is_recurring: e.isRecurring
        })),
        object_quirks: {},
        performance_hints: runbookContext.recommendations || []
      },

      cache_metadata: {
        from_cache: false,
        cache_key: this._buildCacheKey(request),
        cache_ttl: CACHE_TTL / 1000,
        expires_at: new Date(Date.now() + CACHE_TTL).toISOString()
      }
    };
  }

  _buildNotFoundResponse(request, requestId) {
    return {
      status: 'not_found',
      request_id: requestId,
      timestamp: new Date().toISOString(),

      field_policy: {
        required_fields: ['Id'],
        recommended_fields: [],
        prohibited_fields: [],
        max_fields: 100,
        field_aliases: {}
      },

      task_variant: {
        variant_id: request.task_type,
        variant_name: request.task_type,
        field_selection_mode: 'all',
        workflow_steps: [],
        quality_gates: [],
        rollback_strategy: null,
        risk_level: 'medium',
        approval_required: false
      },

      exclusions: {
        record_types: [],
        filter_conditions: [],
        owners_excluded: []
      },

      compliance_rules: {
        frameworks: [],
        pii_handling: {
          mask_fields: [],
          exclude_from_exports: [],
          encryption_required: []
        }
      },

      operational_context: {
        known_exceptions: [],
        object_quirks: {},
        performance_hints: [
          'No org-specific runbook found. Consider running /generate-runbook to capture operational knowledge.'
        ]
      },

      cache_metadata: {
        from_cache: false,
        cache_key: this._buildCacheKey(request),
        cache_ttl: CACHE_TTL / 1000,
        expires_at: new Date(Date.now() + CACHE_TTL).toISOString()
      }
    };
  }

  _buildEscalationResponse(request, requestId) {
    return {
      status: 'escalated',
      request_id: requestId,
      timestamp: new Date().toISOString(),

      escalation: {
        escalation_id: `esc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        reason: `No field policy found for ${request.object} in org ${request.org}. Strict mode requires policy before operation.`,
        suggested_action: 'Create a field policy for this object or disable strict mode',
        command_to_fix: `node scripts/lib/field-policy-manager.js init ${request.org}`
      },

      field_policy: null,
      task_variant: null,
      exclusions: null,
      compliance_rules: null
    };
  }

  _buildGeneratedResponse(request, requestId, fieldPolicy, taskVariant) {
    // Would auto-generate policy here - for now return basic response
    return {
      ...this._buildSuccessResponse(request, requestId, fieldPolicy, taskVariant, { exists: false }),
      status: 'generated'
    };
  }

  _buildErrorResponse(request, code, message) {
    return {
      status: 'error',
      request_id: request.request_id || this._generateRequestId(),
      timestamp: new Date().toISOString(),

      error: {
        code,
        message,
        recoverable: code !== 'INVALID_REQUEST'
      },

      field_policy: null,
      task_variant: null,
      exclusions: null,
      compliance_rules: null
    };
  }

  _buildComplianceRules(fieldPolicy, requestedFrameworks) {
    const rules = {
      frameworks: requestedFrameworks,
      pii_handling: {
        mask_fields: [],
        exclude_from_exports: [],
        encryption_required: []
      },
      audit_requirements: {
        log_level: 'summary',
        retention_days: 365,
        fields_to_track: []
      }
    };

    // Apply classification-based rules
    const exclusions = fieldPolicy.sensitive_field_exclusions || {};

    if (exclusions.classifications?.includes('DIRECT_IDENTIFIER')) {
      rules.pii_handling.exclude_from_exports.push('*SSN*', '*Email*', '*Phone*');
      rules.audit_requirements.log_level = 'detailed';
    }

    if (exclusions.classifications?.includes('FINANCIAL')) {
      rules.pii_handling.encryption_required.push('*CreditCard*', '*BankAccount*');
      rules.audit_requirements.log_level = 'full';
      rules.audit_requirements.retention_days = 730; // SOX requirement
    }

    if (exclusions.classifications?.includes('HEALTH')) {
      rules.pii_handling.encryption_required.push('*Diagnosis*', '*Medical*', '*Treatment*');
      rules.audit_requirements.log_level = 'full';
      rules.audit_requirements.retention_days = 2555; // HIPAA 7-year requirement
    }

    // Add explicit exclusions
    if (exclusions.fields) {
      rules.pii_handling.exclude_from_exports.push(...exclusions.fields);
    }

    return rules;
  }

  // ============================================================================
  // PRIVATE METHODS - Utilities
  // ============================================================================

  _validateRequest(request) {
    if (!request) {
      return { valid: false, message: 'Request is required' };
    }
    if (!request.org) {
      return { valid: false, message: 'org is required' };
    }
    if (!request.object) {
      return { valid: false, message: 'object is required' };
    }
    if (!request.task_type) {
      return { valid: false, message: 'task_type is required' };
    }
    return { valid: true };
  }

  _generateRequestId() {
    return `req-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  _buildCacheKey(request) {
    return `${request.org}:${request.object}:${request.task_type}`;
  }

  _checkCache(key) {
    const cached = policyCache.get(key);
    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached._cache_timestamp >= CACHE_TTL) {
      policyCache.delete(key);
      return null;
    }

    return cached;
  }

  _cacheResponse(key, response) {
    // LRU eviction if cache is full
    if (policyCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = policyCache.keys().next().value;
      policyCache.delete(oldestKey);
    }

    policyCache.set(key, {
      ...response,
      _cache_timestamp: Date.now()
    });
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
Runbook Policy Retriever - Retrieve field policies for operations

Usage:
  node runbook-policy-retriever.js <command> [options]

Commands:
  retrieve <org> <object> <task_type>  Retrieve policy for an operation
  cache-stats                          Show cache statistics
  clear-cache                          Clear the policy cache

Options:
  --verbose                            Enable verbose output
  --json                               Output as JSON
  --strict                             Enable strict mode (block if no policy)

Examples:
  node runbook-policy-retriever.js retrieve my-sandbox Opportunity backup
  node runbook-policy-retriever.js retrieve my-prod Account export --strict
  node runbook-policy-retriever.js cache-stats
    `);
  };

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  const verbose = args.includes('--verbose');
  const jsonOutput = args.includes('--json');
  const strictMode = args.includes('--strict');

  try {
    switch (command) {
      case 'retrieve': {
        const org = args[1];
        const object = args[2];
        const taskType = args[3] || 'backup';

        if (!org || !object) {
          console.error('❌ Missing org or object argument');
          process.exit(1);
        }

        const retriever = new RunbookPolicyRetriever({ verbose, strictMode });
        const response = await retriever.retrieve({
          org,
          object,
          task_type: taskType,
          request_id: `cli-${Date.now()}`
        });

        if (jsonOutput) {
          console.log(JSON.stringify(response, null, 2));
        } else {
          console.log(`\n📋 Policy Response for ${object} (${taskType})\n`);
          console.log(`Status: ${response.status}`);

          if (response.status === 'found' || response.status === 'generated') {
            console.log(`\nRequired Fields: ${response.field_policy?.required_fields?.join(', ') || 'None'}`);
            console.log(`Prohibited Fields: ${response.field_policy?.prohibited_fields?.length || 0}`);
            console.log(`Max Fields: ${response.field_policy?.max_fields}`);
            console.log(`\nTask Variant: ${response.task_variant?.variant_name}`);
            console.log(`Risk Level: ${response.task_variant?.risk_level}`);
            console.log(`Workflow Steps: ${response.task_variant?.workflow_steps?.length || 0}`);
            console.log(`Quality Gates: ${response.task_variant?.quality_gates?.length || 0}`);
          } else if (response.status === 'escalated') {
            console.log(`\n⚠️  ${response.escalation?.reason}`);
            console.log(`\nTo fix: ${response.escalation?.command_to_fix}`);
          } else if (response.status === 'error') {
            console.log(`\n❌ Error: ${response.error?.message}`);
          }
        }
        break;
      }

      case 'cache-stats': {
        const retriever = new RunbookPolicyRetriever();
        const stats = retriever.getCacheStats();

        if (jsonOutput) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          console.log('\n📊 Cache Statistics\n');
          console.log(`Total Entries: ${stats.totalEntries}`);
          console.log(`Valid Entries: ${stats.validEntries}`);
          console.log(`Expired Entries: ${stats.expiredEntries}`);
          console.log(`Max Entries: ${stats.maxEntries}`);
          console.log(`TTL: ${stats.ttlSeconds} seconds`);
        }
        break;
      }

      case 'clear-cache': {
        const retriever = new RunbookPolicyRetriever();
        retriever.clearCache();
        console.log('✅ Cache cleared');
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

module.exports = RunbookPolicyRetriever;

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  });
}
