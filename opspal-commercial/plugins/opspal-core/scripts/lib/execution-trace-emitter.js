#!/usr/bin/env node

/**
 * Execution Trace Emitter
 *
 * Emits structured execution traces for operational agent operations.
 * Captures field decisions, policy application, and operation outcomes
 * for audit and analysis.
 *
 * Part of the Runbook Policy Infrastructure (Phase 4).
 *
 * Features:
 * - Emit traces with decision rationale
 * - Store traces in daily JSONL files
 * - Maintain trace index for quick lookups
 * - Support for distributed tracing (parent/child traces)
 *
 * Usage:
 *   const ExecutionTraceEmitter = require('./execution-trace-emitter');
 *   const emitter = new ExecutionTraceEmitter('my-org');
 *
 *   // Start a trace
 *   const trace = emitter.startTrace('sfdc-data-export-manager', 'data_export', {
 *     object: 'Opportunity'
 *   });
 *
 *   // Add field decisions
 *   emitter.recordFieldDecisions(trace.trace_id, {
 *     fields_auto_selected: [...],
 *     fields_excluded: [...]
 *   });
 *
 *   // Complete the trace
 *   emitter.completeTrace(trace.trace_id, 'success', { records_processed: 1000 });
 *
 * @module execution-trace-emitter
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// ============================================================================
// CONSTANTS
// ============================================================================

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');

// In-memory trace buffer
const activeTraces = new Map();

// ============================================================================
// EXECUTION TRACE EMITTER CLASS
// ============================================================================

class ExecutionTraceEmitter {
  /**
   * Create an ExecutionTraceEmitter
   * @param {string} org - Salesforce org alias
   * @param {Object} options - Configuration options
   */
  constructor(org, options = {}) {
    this.org = org;
    this.verbose = options.verbose || false;
    this.pluginRoot = options.pluginRoot || PLUGIN_ROOT;

    // Determine trace storage path
    this.tracePath = this._resolveTracePath(org);

    // Ensure directory exists
    this._ensureTraceDirectory();
  }

  // ============================================================================
  // PUBLIC METHODS - Trace Lifecycle
  // ============================================================================

  /**
   * Start a new execution trace
   * @param {string} agentId - Agent identifier
   * @param {string} operationType - Type of operation
   * @param {Object} context - Additional context
   * @returns {Object} Trace object with trace_id
   */
  startTrace(agentId, operationType, context = {}) {
    const traceId = this._generateTraceId();
    const timestamp = new Date().toISOString();

    const trace = {
      trace_id: traceId,
      parent_trace_id: context.parent_trace_id || null,
      correlation_id: context.correlation_id || null,
      timestamp,
      agent_id: agentId,
      org: this.org,
      object: context.object || null,
      operation_type: operationType,
      operation_outcome: 'pending',
      duration_ms: 0,
      _start_time: Date.now(),

      runbook_reference: null,
      field_decisions: {
        fields_auto_selected: [],
        fields_excluded: [],
        user_overrides: [],
        total_fields_selected: 0,
        total_fields_available: 0,
        selection_ratio: 0
      },
      policy_application: {
        field_policy_version: null,
        task_variant_used: null,
        object_override_applied: false,
        compliance_rules_applied: [],
        quality_gates_evaluated: []
      },
      workflow_execution: {
        steps_executed: [],
        total_steps: 0,
        successful_steps: 0,
        failed_steps: 0,
        skipped_steps: 0
      },
      data_metrics: {
        records_queried: 0,
        records_processed: 0,
        records_succeeded: 0,
        records_failed: 0,
        error_rate: 0,
        batch_count: 0,
        api_calls_made: 0
      },
      errors: [],
      warnings: [],
      user_context: {
        user_id: context.user_id || process.env.USER || null,
        session_id: context.session_id || null,
        request_source: context.request_source || 'cli'
      },
      environment: {
        plugin_version: this._getPluginVersion(),
        node_version: process.version,
        platform: os.platform()
      }
    };

    // Store in active traces
    activeTraces.set(traceId, trace);

    if (this.verbose) {
      console.log(`[trace] Started trace: ${traceId} (${agentId}/${operationType})`);
    }

    return trace;
  }

  /**
   * Record runbook reference
   * @param {string} traceId - Trace identifier
   * @param {Object} runbookRef - Runbook reference data
   */
  recordRunbookReference(traceId, runbookRef) {
    const trace = activeTraces.get(traceId);
    if (!trace) {
      if (this.verbose) console.warn(`[trace] Unknown trace: ${traceId}`);
      return;
    }

    trace.runbook_reference = {
      runbook_version_used: runbookRef.version || null,
      runbook_path: runbookRef.path || null,
      sections_retrieved: runbookRef.sections || [],
      context_injected: runbookRef.context_injected || false
    };
  }

  /**
   * Record field decisions
   * @param {string} traceId - Trace identifier
   * @param {Object} decisions - Field decision data
   */
  recordFieldDecisions(traceId, decisions) {
    const trace = activeTraces.get(traceId);
    if (!trace) {
      if (this.verbose) console.warn(`[trace] Unknown trace: ${traceId}`);
      return;
    }

    trace.field_decisions = {
      fields_auto_selected: decisions.fields_auto_selected || [],
      fields_excluded: decisions.fields_excluded || [],
      user_overrides: decisions.user_overrides || [],
      total_fields_selected: decisions.total_fields_selected ||
        (decisions.fields_auto_selected?.length || 0),
      total_fields_available: decisions.total_fields_available || 0,
      selection_ratio: decisions.selection_ratio || 0
    };
  }

  /**
   * Record policy application
   * @param {string} traceId - Trace identifier
   * @param {Object} policyApp - Policy application data
   */
  recordPolicyApplication(traceId, policyApp) {
    const trace = activeTraces.get(traceId);
    if (!trace) {
      if (this.verbose) console.warn(`[trace] Unknown trace: ${traceId}`);
      return;
    }

    trace.policy_application = {
      field_policy_version: policyApp.field_policy_version || null,
      field_policy_path: policyApp.field_policy_path || null,
      task_variant_used: policyApp.task_variant_used || null,
      task_variant_name: policyApp.task_variant_name || null,
      object_override_applied: policyApp.object_override_applied || false,
      compliance_rules_applied: policyApp.compliance_rules_applied || [],
      quality_gates_evaluated: policyApp.quality_gates_evaluated || []
    };
  }

  /**
   * Record workflow step execution
   * @param {string} traceId - Trace identifier
   * @param {Object} step - Step execution data
   */
  recordWorkflowStep(traceId, step) {
    const trace = activeTraces.get(traceId);
    if (!trace) {
      if (this.verbose) console.warn(`[trace] Unknown trace: ${traceId}`);
      return;
    }

    trace.workflow_execution.steps_executed.push({
      step_id: step.step_id,
      step_name: step.step_name,
      status: step.status,
      duration_ms: step.duration_ms || 0,
      error_message: step.error_message || null,
      retry_count: step.retry_count || 0
    });

    trace.workflow_execution.total_steps = trace.workflow_execution.steps_executed.length;

    // Update counts
    const statuses = trace.workflow_execution.steps_executed.map(s => s.status);
    trace.workflow_execution.successful_steps = statuses.filter(s => s === 'success').length;
    trace.workflow_execution.failed_steps = statuses.filter(s => s === 'failed').length;
    trace.workflow_execution.skipped_steps = statuses.filter(s => s === 'skipped').length;
  }

  /**
   * Record data metrics
   * @param {string} traceId - Trace identifier
   * @param {Object} metrics - Data metrics
   */
  recordDataMetrics(traceId, metrics) {
    const trace = activeTraces.get(traceId);
    if (!trace) {
      if (this.verbose) console.warn(`[trace] Unknown trace: ${traceId}`);
      return;
    }

    trace.data_metrics = {
      records_queried: metrics.records_queried || 0,
      records_processed: metrics.records_processed || 0,
      records_succeeded: metrics.records_succeeded || 0,
      records_failed: metrics.records_failed || 0,
      error_rate: metrics.records_processed > 0
        ? metrics.records_failed / metrics.records_processed
        : 0,
      batch_count: metrics.batch_count || 0,
      api_calls_made: metrics.api_calls_made || 0
    };
  }

  /**
   * Record an error
   * @param {string} traceId - Trace identifier
   * @param {Object} error - Error details
   */
  recordError(traceId, error) {
    const trace = activeTraces.get(traceId);
    if (!trace) {
      if (this.verbose) console.warn(`[trace] Unknown trace: ${traceId}`);
      return;
    }

    trace.errors.push({
      error_code: error.code || 'UNKNOWN',
      error_message: error.message || String(error),
      error_category: error.category || 'system',
      field_affected: error.field || null,
      recoverable: error.recoverable !== false,
      recovery_action: error.recovery_action || null
    });
  }

  /**
   * Record a warning
   * @param {string} traceId - Trace identifier
   * @param {Object} warning - Warning details
   */
  recordWarning(traceId, warning) {
    const trace = activeTraces.get(traceId);
    if (!trace) {
      if (this.verbose) console.warn(`[trace] Unknown trace: ${traceId}`);
      return;
    }

    trace.warnings.push({
      warning_code: warning.code || 'WARN',
      warning_message: warning.message || String(warning),
      field_affected: warning.field || null
    });
  }

  /**
   * Complete and emit a trace
   * @param {string} traceId - Trace identifier
   * @param {string} outcome - Operation outcome
   * @param {Object} finalMetrics - Final metrics to merge
   * @returns {Object} Completed trace
   */
  completeTrace(traceId, outcome, finalMetrics = {}) {
    const trace = activeTraces.get(traceId);
    if (!trace) {
      throw new Error(`Unknown trace: ${traceId}`);
    }

    // Update final state
    trace.operation_outcome = outcome;
    trace.duration_ms = Date.now() - trace._start_time;

    // Merge final metrics
    if (finalMetrics.records_processed !== undefined) {
      trace.data_metrics.records_processed = finalMetrics.records_processed;
    }
    if (finalMetrics.records_succeeded !== undefined) {
      trace.data_metrics.records_succeeded = finalMetrics.records_succeeded;
    }
    if (finalMetrics.records_failed !== undefined) {
      trace.data_metrics.records_failed = finalMetrics.records_failed;
    }

    // Recalculate error rate
    if (trace.data_metrics.records_processed > 0) {
      trace.data_metrics.error_rate =
        trace.data_metrics.records_failed / trace.data_metrics.records_processed;
    }

    // Remove internal fields
    delete trace._start_time;

    // Emit to storage
    this._emitTrace(trace);

    // Remove from active traces
    activeTraces.delete(traceId);

    if (this.verbose) {
      console.log(`[trace] Completed trace: ${traceId} (${outcome}, ${trace.duration_ms}ms)`);
    }

    return trace;
  }

  /**
   * Abort a trace (for failed operations)
   * @param {string} traceId - Trace identifier
   * @param {string} reason - Abort reason
   */
  abortTrace(traceId, reason) {
    this.recordError(traceId, {
      code: 'ABORTED',
      message: reason,
      category: 'system',
      recoverable: false
    });

    return this.completeTrace(traceId, 'aborted');
  }

  /**
   * Get an active trace
   * @param {string} traceId - Trace identifier
   * @returns {Object|null} Trace or null
   */
  getTrace(traceId) {
    return activeTraces.get(traceId) || null;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  _resolveTracePath(org) {
    const orgSlug = process.env.ORG_SLUG || '';
    const basePaths = [
      // Org-centric
      path.join(this.pluginRoot, '..', '..', 'orgs', orgSlug, 'platforms', 'salesforce', org, 'traces'),
      path.join(this.pluginRoot, '..', '..', 'orgs', org, 'platforms', 'salesforce', org, 'traces'),
      // Legacy
      path.join(this.pluginRoot, '..', 'opspal-salesforce', 'instances', 'salesforce', org, 'traces'),
      path.join(this.pluginRoot, '..', 'opspal-salesforce', 'instances', org, 'traces')
    ];

    for (const p of basePaths) {
      if (fs.existsSync(path.dirname(p))) {
        return p;
      }
    }

    // Default
    return path.join(this.pluginRoot, '..', 'opspal-salesforce', 'instances', org, 'traces');
  }

  _ensureTraceDirectory() {
    if (!fs.existsSync(this.tracePath)) {
      fs.mkdirSync(this.tracePath, { recursive: true });
    }
  }

  _generateTraceId() {
    return `trace-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  _getPluginVersion() {
    try {
      const packagePath = path.join(this.pluginRoot, 'package.json');
      if (fs.existsSync(packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        return pkg.version || '0.0.0';
      }
    } catch (e) {
      // Ignore
    }
    return '0.0.0';
  }

  _emitTrace(trace) {
    const date = new Date().toISOString().split('T')[0];
    const traceFile = path.join(this.tracePath, `execution-trace-${date}.jsonl`);

    try {
      fs.appendFileSync(traceFile, JSON.stringify(trace) + '\n');

      // Update index
      this._updateIndex(trace);
    } catch (error) {
      console.error(`[trace] Failed to emit trace: ${error.message}`);
    }
  }

  _updateIndex(trace) {
    const indexFile = path.join(this.tracePath, 'trace-index.json');

    let index = { traces: {}, last_updated: null };
    try {
      if (fs.existsSync(indexFile)) {
        index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
      }
    } catch (e) {
      // Start fresh
    }

    // Add to index
    index.traces[trace.trace_id] = {
      timestamp: trace.timestamp,
      agent_id: trace.agent_id,
      operation_type: trace.operation_type,
      outcome: trace.operation_outcome,
      object: trace.object
    };

    // Prune old entries (keep last 1000)
    const traceIds = Object.keys(index.traces);
    if (traceIds.length > 1000) {
      const toRemove = traceIds.slice(0, traceIds.length - 1000);
      for (const id of toRemove) {
        delete index.traces[id];
      }
    }

    index.last_updated = new Date().toISOString();

    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
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
Execution Trace Emitter - Emit and manage execution traces

Usage:
  node execution-trace-emitter.js <command> [options]

Commands:
  emit <org> <agent> <operation>  Emit a test trace
  list <org>                      List recent traces
  get <org> <trace_id>           Get a specific trace

Options:
  --verbose                       Enable verbose output
  --json                          Output as JSON

Examples:
  node execution-trace-emitter.js emit my-sandbox sfdc-data-export data_export
  node execution-trace-emitter.js list my-sandbox
  node execution-trace-emitter.js get my-sandbox trace-1234567890-abcd
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
      case 'emit': {
        const org = args[1];
        const agent = args[2] || 'test-agent';
        const operation = args[3] || 'other';

        if (!org) {
          console.error('❌ Missing org argument');
          process.exit(1);
        }

        const emitter = new ExecutionTraceEmitter(org, { verbose });

        // Create and complete a test trace
        const trace = emitter.startTrace(agent, operation, {
          object: 'TestObject'
        });

        emitter.recordFieldDecisions(trace.trace_id, {
          fields_auto_selected: [
            { field: 'Id', source: 'field_policy', rationale: 'required' },
            { field: 'Name', source: 'field_policy', rationale: 'default' }
          ],
          fields_excluded: [
            { field: 'SSN__c', reason: 'classification_exclusion', rule_reference: 'DIRECT_IDENTIFIER' }
          ]
        });

        emitter.recordDataMetrics(trace.trace_id, {
          records_queried: 100,
          records_processed: 100,
          records_succeeded: 98,
          records_failed: 2
        });

        const completed = emitter.completeTrace(trace.trace_id, 'success');

        if (jsonOutput) {
          console.log(JSON.stringify(completed, null, 2));
        } else {
          console.log(`✅ Emitted trace: ${completed.trace_id}`);
          console.log(`   Duration: ${completed.duration_ms}ms`);
          console.log(`   Outcome: ${completed.operation_outcome}`);
        }
        break;
      }

      case 'list': {
        const org = args[1];
        if (!org) {
          console.error('❌ Missing org argument');
          process.exit(1);
        }

        const emitter = new ExecutionTraceEmitter(org, { verbose });
        const indexPath = path.join(emitter.tracePath, 'trace-index.json');

        if (!fs.existsSync(indexPath)) {
          console.log('No traces found');
          process.exit(0);
        }

        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        const traceIds = Object.keys(index.traces).slice(-20);

        if (jsonOutput) {
          console.log(JSON.stringify(traceIds.map(id => index.traces[id]), null, 2));
        } else {
          console.log(`\n📋 Recent Traces for ${org}\n`);
          for (const id of traceIds) {
            const t = index.traces[id];
            console.log(`  ${id.substring(0, 25)}... ${t.operation_type.padEnd(15)} ${t.outcome.padEnd(10)} ${t.timestamp}`);
          }
        }
        break;
      }

      case 'get': {
        const org = args[1];
        const traceId = args[2];

        if (!org || !traceId) {
          console.error('❌ Missing org or trace_id argument');
          process.exit(1);
        }

        const emitter = new ExecutionTraceEmitter(org, { verbose });

        // Find the trace in daily files
        const files = fs.readdirSync(emitter.tracePath)
          .filter(f => f.startsWith('execution-trace-') && f.endsWith('.jsonl'))
          .sort()
          .reverse();

        let foundTrace = null;
        for (const file of files) {
          const content = fs.readFileSync(path.join(emitter.tracePath, file), 'utf-8');
          for (const line of content.split('\n').filter(l => l.trim())) {
            try {
              const trace = JSON.parse(line);
              if (trace.trace_id === traceId) {
                foundTrace = trace;
                break;
              }
            } catch (e) {
              // Skip malformed lines
            }
          }
          if (foundTrace) break;
        }

        if (!foundTrace) {
          console.error(`❌ Trace not found: ${traceId}`);
          process.exit(1);
        }

        if (jsonOutput) {
          console.log(JSON.stringify(foundTrace, null, 2));
        } else {
          console.log(`\n📋 Trace: ${foundTrace.trace_id}\n`);
          console.log(`Agent: ${foundTrace.agent_id}`);
          console.log(`Operation: ${foundTrace.operation_type}`);
          console.log(`Outcome: ${foundTrace.operation_outcome}`);
          console.log(`Duration: ${foundTrace.duration_ms}ms`);
          console.log(`\nFields Selected: ${foundTrace.field_decisions?.total_fields_selected || 0}`);
          console.log(`Records Processed: ${foundTrace.data_metrics?.records_processed || 0}`);
          console.log(`Errors: ${foundTrace.errors?.length || 0}`);
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

module.exports = ExecutionTraceEmitter;

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  });
}
