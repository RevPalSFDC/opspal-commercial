#!/usr/bin/env node
'use strict';

/**
 * SOP Runtime
 *
 * Central orchestrator for the SOP subsystem.
 * Receives canonical events, coordinates:
 *   context resolution -> policy evaluation -> action execution -> audit
 *
 * Supports dry-run mode and CLI entrypoint.
 *
 * @module sop-runtime
 * @version 1.0.0
 */

const path = require('path');
const crypto = require('crypto');

const { SopRegistry } = require('./sop-registry');
const { SopEvaluator } = require('./sop-evaluator');
const { SopContextResolver } = require('./sop-context-resolver');
const { SopMappingResolver } = require('./sop-mapping-resolver');
const { SopAudit } = require('./sop-audit');
const executors = require('./sop-executors');

class SopRuntime {
  constructor(options = {}) {
    this.pluginRoot = options.pluginRoot ||
      process.env.CLAUDE_PLUGIN_ROOT ||
      path.join(__dirname, '../../..');
    this.dryRun = options.dry_run || false;
    this.verbose = options.verbose || false;

    // Resolve opspal-core root relative to this file (3 dirs up from scripts/lib/sop/)
    // CLAUDE_PLUGIN_ROOT may point to a different plugin, so SOP config must be __dirname-relative
    const coreRoot = path.join(__dirname, '../../..');

    // Initialize or accept injected dependencies
    this.registry = options.registry || new SopRegistry({
      sopConfigDir: path.join(coreRoot, 'config', 'sop'),
      schemasDir: path.join(coreRoot, 'schemas'),
      verbose: this.verbose
    });

    this.mappingResolver = options.mappingResolver || new SopMappingResolver({
      registry: this.registry
    });

    this.evaluator = options.evaluator || new SopEvaluator({
      registry: this.registry,
      mappingResolver: this.mappingResolver
    });

    this.contextResolver = options.contextResolver || new SopContextResolver({
      pluginRoot: this.pluginRoot,
      verbose: this.verbose
    });

    this.audit = options.audit || new SopAudit({ verbose: this.verbose });

    // Idempotency manager (lazy-loaded)
    this._idempotencyManager = options.idempotencyManager || null;
  }

  /**
   * Run the SOP pipeline for an event.
   *
   * @param {Object} event - Canonical SOP event { event_id, event_type, confidence, scope, payload, timestamp, source }
   * @param {Object} [contextOverrides={}] - Explicit context overrides
   * @returns {Object} SopRuntimeResult
   */
  async run(event, contextOverrides = {}) {
    const startTime = Date.now();
    const traceId = process.env.TRACE_ID || process.env.CLAUDE_TRACE_ID ||
      crypto.randomBytes(16).toString('hex');

    // Validate minimal event shape
    if (!event || !event.event_type) {
      return this._errorResult(event, traceId, startTime, 'Missing event_type');
    }

    // Assign event_id if missing
    if (!event.event_id) {
      event.event_id = `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    }

    // Assign defaults
    event.confidence = event.confidence || 'explicit';
    event.timestamp = event.timestamp || new Date().toISOString();

    try {
      // 1. Context resolution
      const resolvedContext = this.contextResolver.resolve(event, contextOverrides);

      // 2. Policy evaluation (pure, sync)
      const plan = this.evaluator.evaluate(event, resolvedContext);

      // 3. Action execution
      const executionResults = [];

      if (!this.dryRun && plan.actions.length > 0) {
        const idempotencyManager = await this._getIdempotencyManager();

        for (const actionSpec of plan.actions) {
          const result = await executors.executeAction(actionSpec, resolvedContext, {
            idempotencyManager,
            verbose: this.verbose
          });
          executionResults.push(result);
        }
      }

      // Build system message for recommend-mode policies and Asana MCP directives
      const systemMessage = this._buildSystemMessage(plan, event, executionResults);

      // 4. Build result
      const runtimeResult = {
        event_id: event.event_id,
        event_type: event.event_type,
        trace_id: traceId,
        confidence: event.confidence,
        resolved_context: resolvedContext,
        plan,
        execution_results: executionResults,
        dry_run: this.dryRun,
        duration_ms: Date.now() - startTime,
        system_message: systemMessage
      };

      // 5. Audit
      try {
        this.audit.record(runtimeResult);
      } catch (e) {
        if (this.verbose) {
          process.stderr.write(`[sop-runtime] Audit write failed: ${e.message}\n`);
        }
      }

      return runtimeResult;
    } catch (e) {
      return this._errorResult(event, traceId, startTime, e.message);
    }
  }

  // --- Private methods ---

  async _getIdempotencyManager() {
    if (this._idempotencyManager) return this._idempotencyManager;

    try {
      const { IdempotencyStateManager } = require('../idempotency-state-manager');
      this._idempotencyManager = new IdempotencyStateManager({
        verbose: this.verbose
      });
      return this._idempotencyManager;
    } catch {
      return null;
    }
  }

  _buildSystemMessage(plan, event, executionResults) {
    const lines = [];

    // Recommend-mode policy notifications
    const recommendPolicies = plan.matched.filter(m => m.mode === 'recommend');
    if (recommendPolicies.length > 0) {
      lines.push(`[SOP] ${event.event_type} — ${recommendPolicies.length} policy recommendation(s):`);
      for (const p of recommendPolicies) {
        lines.push(`  - ${p.policy_id} (${p.original_mode}${p.original_mode !== p.mode ? ` -> ${p.mode}` : ''})`);
      }
    }

    // Asana MCP action directives for enforce-mode (hooks can't call MCP directly)
    const asanaActions = (executionResults || []).filter(
      r => r.executor_type === 'asana' && r.status === 'executed' && r.details && r.details.mcp_tool
    );
    if (asanaActions.length > 0) {
      lines.push(`[SOP] ${asanaActions.length} Asana action(s) to execute:`);
      for (const a of asanaActions) {
        lines.push(`  - Call ${a.details.mcp_tool} with params: ${JSON.stringify(a.details.mcp_params)}`);
      }
    }

    if (plan.warnings.length > 0) {
      lines.push('Warnings:');
      for (const w of plan.warnings) {
        lines.push(`  - ${w}`);
      }
    }

    return lines.length > 0 ? lines.join('\n') : null;
  }

  _errorResult(event, traceId, startTime, errorMessage) {
    const result = {
      event_id: event && event.event_id || null,
      event_type: event && event.event_type || null,
      trace_id: traceId,
      confidence: event && event.confidence || null,
      resolved_context: null,
      plan: { matched: [], skipped: [], actions: [], warnings: [`Runtime error: ${errorMessage}`] },
      execution_results: [],
      dry_run: this.dryRun,
      duration_ms: Date.now() - startTime,
      system_message: null,
      error: errorMessage
    };

    // Still audit errors
    try {
      this.audit.record(result);
    } catch {
      // Can't audit — nothing to do
    }

    return result;
  }
}

// --- CLI entrypoint ---
async function cli() {
  const args = process.argv.slice(2);

  const eventType = getArg(args, '--event');
  const confidence = getArg(args, '--confidence') || 'explicit';
  const contextJson = getArg(args, '--context') || '{}';
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  if (!eventType) {
    process.stderr.write('Usage: node sop-runtime.js --event <event_type> [--confidence <level>] [--context <json>] [--dry-run] [--verbose]\n');
    process.exit(1);
  }

  let contextOverrides;
  try {
    contextOverrides = JSON.parse(contextJson);
  } catch (e) {
    process.stderr.write(`Invalid --context JSON: ${e.message}\n`);
    process.exit(1);
  }

  const event = {
    event_type: eventType,
    confidence,
    payload: contextOverrides,
    source: 'cli'
  };

  const runtime = new SopRuntime({ dry_run: dryRun, verbose });
  const result = await runtime.run(event, contextOverrides);

  process.stdout.write(JSON.stringify(result, null, verbose ? 2 : 0) + '\n');
  process.exit(0);
}

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

module.exports = { SopRuntime };

if (require.main === module) {
  cli().catch(err => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  });
}
