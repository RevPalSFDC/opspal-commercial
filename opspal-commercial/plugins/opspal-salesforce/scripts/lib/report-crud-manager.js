#!/usr/bin/env node

/**
 * Report CRUD Manager
 *
 * Full lifecycle management for Salesforce reports with versioning,
 * patch-based updates, dependency-aware deletion, and silent-drop detection.
 *
 * Operations:
 *   CREATE: Build plan -> Disambiguate -> Validate -> Preflight -> Deploy -> Store version
 *   READ:   Fetch metadata -> Parse -> Annotate
 *   UPDATE: Read current -> Apply patch -> Validate -> Preflight -> Deploy -> Store delta
 *   DELETE: Check dependencies -> Archive -> Execute delete -> Log
 *
 * Usage:
 *   const { ReportCrudManager } = require('./report-crud-manager');
 *   const manager = new ReportCrudManager({ orgAlias: 'myOrg' });
 *
 *   const created = await manager.create(reportPlan);
 *   const report = await manager.read(reportId);
 *   const updated = await manager.update(reportId, patch);
 *   const deleted = await manager.delete(reportId);
 *
 * CLI:
 *   node report-crud-manager.js create <plan.json> --org <alias>
 *   node report-crud-manager.js read <reportId> --org <alias>
 *   node report-crud-manager.js update <reportId> <patch.json> --org <alias>
 *   node report-crud-manager.js delete <reportId> --org <alias>
 *
 * @module report-crud-manager
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { ReportPlanContract } = require('./report-plan-contract');
const { ReportSemanticDisambiguator } = require('./report-semantic-disambiguator');
const { ReportPreflightEngine } = require('./report-preflight-engine');
const { ReportDependencyChecker } = require('./report-dependency-checker');
const { ReportArchiveManager } = require('./report-archive-manager');

let ReportTelemetryTracker;
try {
  ReportTelemetryTracker = require('./report-telemetry-tracker').ReportTelemetryTracker;
} catch (e) {
  ReportTelemetryTracker = null;
}

class ReportCrudManager {
  constructor(options = {}) {
    this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG;
    this.orgSlug = options.orgSlug || process.env.ORG_SLUG || 'default';
    this.instance = options.instance || 'production';
    this.verbose = options.verbose || false;

    this.contract = new ReportPlanContract({ verbose: this.verbose });
    this.disambiguator = new ReportSemanticDisambiguator({ verbose: this.verbose });
    this.preflight = new ReportPreflightEngine({ orgAlias: this.orgAlias, verbose: this.verbose });
    this.depChecker = new ReportDependencyChecker({ orgAlias: this.orgAlias, verbose: this.verbose });
    this.archive = new ReportArchiveManager({
      orgSlug: this.orgSlug,
      instance: this.instance,
      verbose: this.verbose
    });

    this.telemetry = null;
    if (ReportTelemetryTracker) {
      try {
        this.telemetry = new ReportTelemetryTracker({
          orgSlug: this.orgSlug,
          instance: this.instance,
          verbose: this.verbose
        });
      } catch (e) {
        // Telemetry optional
      }
    }
  }

  /**
   * CREATE a new report
   *
   * @param {Object} planInput - ReportPlan input (can be partial)
   * @param {Object} context - Additional context for disambiguation
   * @returns {{ success: boolean, reportId: string|null, plan: Object, errors: string[], warnings: string[] }}
   */
  async create(planInput, context = {}) {
    const startTime = Date.now();
    const result = { success: false, reportId: null, plan: null, errors: [], warnings: [] };

    try {
      // Step 1: Build plan
      let plan = this.contract.build({ ...planInput, intent: 'create' });

      // Step 2: Disambiguate business terms
      if (planInput.business_question) {
        const disamb = this.disambiguator.resolve(planInput.business_question, context);
        if (disamb.unresolved.length > 0) {
          plan.unresolved_semantics = this.disambiguator.toUnresolvedSemantics(disamb.unresolved);
        }
        if (disamb.resolved.length > 0) {
          plan = this.disambiguator.applyToPlan(plan, disamb.resolved);
        }
      }

      // Step 3: Preflight (validates + constrains + compiles)
      const preflightResult = await this.preflight.run(plan, context);
      result.warnings.push(...preflightResult.warnings);

      if (!preflightResult.success) {
        result.errors = preflightResult.errors;
        result.plan = preflightResult.plan;
        this._logTelemetry('create', 'failed', startTime, preflightResult);
        return result;
      }

      plan = preflightResult.plan;
      const payload = preflightResult.payload;

      // Step 4: Execute create via SF API
      const reportId = await this._executeCreate(payload);

      if (reportId) {
        result.success = true;
        result.reportId = reportId;
        result.plan = plan;

        // Step 5: Store versioned definition
        this.archive.storeDefinition(reportId, plan, 'create');

        // Step 6: Silent drop detection
        const finalReport = await this._fetchReportMetadata(reportId);
        if (finalReport) {
          const drops = this.contract.detectSilentDrops(plan, finalReport);
          if (drops.count > 0) {
            result.warnings.push(
              `SILENT DROP DETECTED: ${drops.count} element(s) missing from final report: ` +
              drops.silent_drops.map(d => `${d.type}:${d.element}`).join(', ')
            );
          }
        }

        this._logTelemetry('create', 'success', startTime, preflightResult, { reportId, silent_drops: 0 });
      } else {
        result.errors.push('Report creation API call failed');
        this._logTelemetry('create', 'api_error', startTime, preflightResult);
      }
    } catch (e) {
      result.errors.push(`Create error: ${e.message}`);
      this._logTelemetry('create', 'exception', startTime, null, { error: e.message });
    }

    return result;
  }

  /**
   * READ a report's metadata
   *
   * @param {string} reportId - Salesforce report ID
   * @returns {{ success: boolean, metadata: Object|null, annotated: Object|null, errors: string[] }}
   */
  async read(reportId) {
    try {
      const metadata = await this._fetchReportMetadata(reportId);
      if (!metadata) {
        return { success: false, metadata: null, annotated: null, errors: ['Report not found or API error'] };
      }

      // Annotate
      const annotated = this._annotateMetadata(metadata, reportId);

      return { success: true, metadata, annotated, errors: [] };
    } catch (e) {
      return { success: false, metadata: null, annotated: null, errors: [`Read error: ${e.message}`] };
    }
  }

  /**
   * UPDATE a report via patch
   *
   * @param {string} reportId - Report to update
   * @param {Object} patch - Patch object { add_columns, remove_columns, add_filters, ... }
   * @param {Object} context - Additional context
   * @returns {{ success: boolean, plan: Object, errors: string[], warnings: string[] }}
   */
  async update(reportId, patch, context = {}) {
    const startTime = Date.now();
    const result = { success: false, plan: null, errors: [], warnings: [] };

    try {
      // Step 1: Read current
      const current = await this.read(reportId);
      if (!current.success) {
        result.errors = current.errors;
        return result;
      }

      // Step 2: Convert current metadata to plan
      const currentPlan = this._metadataToPlan(current.metadata, reportId);

      // Step 3: Apply patch
      const mergedPlan = this.contract.applyPatch(currentPlan, patch);
      mergedPlan.source_report_id = reportId;

      // Step 4: Preflight
      const preflightResult = await this.preflight.run(mergedPlan, context);
      result.warnings.push(...preflightResult.warnings);

      if (!preflightResult.success) {
        result.errors = preflightResult.errors;
        result.plan = preflightResult.plan;
        this._logTelemetry('update', 'failed', startTime, preflightResult);
        return result;
      }

      // Step 5: Execute update
      const updated = await this._executeUpdate(reportId, preflightResult.payload);

      if (updated) {
        result.success = true;
        result.plan = preflightResult.plan;

        // Step 6: Store version delta
        this.archive.storeDefinition(reportId, preflightResult.plan, 'update');

        // Step 7: Silent drop detection
        const finalReport = await this._fetchReportMetadata(reportId);
        if (finalReport) {
          const drops = this.contract.detectSilentDrops(preflightResult.plan, finalReport);
          if (drops.count > 0) {
            result.warnings.push(
              `SILENT DROP DETECTED: ${drops.count} element(s) lost during update: ` +
              drops.silent_drops.map(d => `${d.type}:${d.element}`).join(', ')
            );
          }
        }

        this._logTelemetry('update', 'success', startTime, preflightResult, { reportId });
      } else {
        result.errors.push('Report update API call failed');
        this._logTelemetry('update', 'api_error', startTime, preflightResult);
      }
    } catch (e) {
      result.errors.push(`Update error: ${e.message}`);
      this._logTelemetry('update', 'exception', startTime, null, { error: e.message });
    }

    return result;
  }

  /**
   * DELETE a report (with dependency check and archival)
   *
   * @param {string} reportId - Report to delete
   * @param {Object} options - { forceDelete: false }
   * @returns {{ success: boolean, archived: boolean, dependencies: Object|null, errors: string[] }}
   */
  async delete(reportId, options = {}) {
    const startTime = Date.now();
    const result = { success: false, archived: false, dependencies: null, errors: [] };

    try {
      // Step 1: Check dependencies
      const deps = await this.depChecker.check(reportId);
      result.dependencies = deps;

      if (deps.hasDependencies && !options.forceDelete) {
        result.errors.push(deps.summary);
        this._logTelemetry('delete', 'blocked_dependencies', startTime, null, {
          reportId,
          dashboards: deps.dashboards.length,
          subscriptions: deps.subscriptions.length
        });
        return result;
      }

      // Step 2: Archive
      const metadata = await this._fetchReportMetadata(reportId);
      if (metadata) {
        await this.archive.archive(reportId, metadata, {
          reason: options.forceDelete ? 'force-delete (dependencies exist)' : 'pre-deletion archive'
        });
        result.archived = true;
      }

      // Step 3: Execute delete
      const deleted = await this._executeDelete(reportId);

      if (deleted) {
        result.success = true;
        this._logTelemetry('delete', 'success', startTime, null, {
          reportId,
          forceDelete: !!options.forceDelete,
          hadDependencies: deps.hasDependencies
        });
      } else {
        result.errors.push('Report deletion API call failed');
        this._logTelemetry('delete', 'api_error', startTime);
      }
    } catch (e) {
      result.errors.push(`Delete error: ${e.message}`);
      this._logTelemetry('delete', 'exception', startTime, null, { error: e.message });
    }

    return result;
  }

  // ========================================================================
  // PRIVATE: Salesforce API Operations
  // ========================================================================

  async _executeCreate(payload) {
    if (!this.orgAlias) return null;

    try {
      const payloadFile = path.join('/tmp', `report-create-${Date.now()}.json`);
      fs.writeFileSync(payloadFile, JSON.stringify(payload));

      const cmd = `sf api request rest "/analytics/reports" --method POST --body @${payloadFile} --target-org ${this.orgAlias} --json 2>/dev/null`;
      const result = JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: 60000 }));

      // Cleanup temp file
      try { fs.unlinkSync(payloadFile); } catch (e) { /* ignore */ }

      if (result.result && result.result.reportMetadata && result.result.reportMetadata.id) {
        return result.result.reportMetadata.id;
      }
      return null;
    } catch (e) {
      if (this.verbose) console.error(`Create API error: ${e.message}`);
      return null;
    }
  }

  async _executeUpdate(reportId, payload) {
    if (!this.orgAlias) return false;

    try {
      const payloadFile = path.join('/tmp', `report-update-${Date.now()}.json`);
      fs.writeFileSync(payloadFile, JSON.stringify(payload));

      const cmd = `sf api request rest "/analytics/reports/${reportId}" --method PATCH --body @${payloadFile} --target-org ${this.orgAlias} --json 2>/dev/null`;
      execSync(cmd, { encoding: 'utf8', timeout: 60000 });

      try { fs.unlinkSync(payloadFile); } catch (e) { /* ignore */ }
      return true;
    } catch (e) {
      if (this.verbose) console.error(`Update API error: ${e.message}`);
      return false;
    }
  }

  async _executeDelete(reportId) {
    if (!this.orgAlias) return false;

    try {
      const cmd = `sf api request rest "/analytics/reports/${reportId}" --method DELETE --target-org ${this.orgAlias} --json 2>/dev/null`;
      execSync(cmd, { encoding: 'utf8', timeout: 30000 });
      return true;
    } catch (e) {
      if (this.verbose) console.error(`Delete API error: ${e.message}`);
      return false;
    }
  }

  async _fetchReportMetadata(reportId) {
    if (!this.orgAlias) return null;

    try {
      const cmd = `sf api request rest "/analytics/reports/${reportId}/describe" --method GET --target-org ${this.orgAlias} --json 2>/dev/null`;
      const result = JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: 30000 }));
      return result.result || null;
    } catch (e) {
      if (this.verbose) console.warn(`Fetch metadata error: ${e.message}`);
      return null;
    }
  }

  // ========================================================================
  // PRIVATE: Helpers
  // ========================================================================

  _annotateMetadata(metadata, reportId) {
    const rm = metadata.reportMetadata || metadata;
    return {
      reportId,
      name: rm.name,
      format: rm.reportFormat,
      type: rm.reportType ? rm.reportType.type : null,
      columns: (rm.detailColumns || []).map(c => ({
        field: c,
        source: 'user_added'
      })),
      filters: (rm.reportFilters || []).map(f => ({
        column: f.column,
        operator: f.operator,
        value: f.value,
        source: 'user_added'
      })),
      groupings_down: (rm.groupingsDown || []).map(g => ({
        field: g.name,
        dateGranularity: g.dateGranularity,
        source: 'user_added'
      })),
      groupings_across: (rm.groupingsAcross || []).map(g => ({
        field: g.name,
        dateGranularity: g.dateGranularity,
        source: 'user_added'
      })),
      summaries: (rm.aggregates || []).map(a => ({
        expression: a,
        source: 'user_added'
      }))
    };
  }

  _metadataToPlan(metadata, reportId) {
    const rm = metadata.reportMetadata || metadata;
    return this.contract.build({
      intent: 'update',
      primary_object: rm.reportType ? rm.reportType.type : null,
      grain: rm.reportType ? rm.reportType.type.toLowerCase() : null,
      report_type: rm.reportType ? rm.reportType.type : null,
      report_format: rm.reportFormat,
      columns: rm.detailColumns || [],
      filters: (rm.reportFilters || []).map(f => ({
        column: f.column,
        operator: f.operator,
        value: f.value
      })),
      groupings: {
        down: (rm.groupingsDown || []).map(g => ({
          field: g.name,
          dateGranularity: g.dateGranularity,
          sortOrder: g.sortOrder
        })),
        across: (rm.groupingsAcross || []).map(g => ({
          field: g.name,
          dateGranularity: g.dateGranularity,
          sortOrder: g.sortOrder
        }))
      },
      summaries: (rm.aggregates || []).map(a => {
        const parts = a.split('!');
        return { aggregate: parts[0] || 'SUM', field: parts[1] || a };
      }),
      assumptions: ['Converted from existing report metadata'],
      confidence: 0.95,
      report_name: rm.name,
      source_report_id: reportId,
      folder_id: rm.folderId || null
    });
  }

  _logTelemetry(operation, outcome, startTime, preflightResult, extra = {}) {
    if (!this.telemetry) return;

    try {
      this.telemetry.logEvent({
        operation,
        outcome,
        duration_ms: Date.now() - startTime,
        preflight_attempts: preflightResult ? preflightResult.attempts : 0,
        repairs_applied: preflightResult ? preflightResult.repairs.length : 0,
        ...extra
      });
    } catch (e) {
      // Telemetry failure should never block operations
    }
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const orgFlag = args.indexOf('--org');
  const orgAlias = orgFlag >= 0 ? args[orgFlag + 1] : process.env.SF_TARGET_ORG;

  const manager = new ReportCrudManager({ orgAlias, verbose: true });

  if (command === 'create') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Usage: node report-crud-manager.js create <plan.json> --org <alias>');
      process.exit(1);
    }
    const plan = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    manager.create(plan).then(result => {
      console.log('\n=== CREATE Result ===');
      console.log(`Success: ${result.success}`);
      if (result.reportId) console.log(`Report ID: ${result.reportId}`);
      if (result.errors.length > 0) console.log(`Errors: ${result.errors.join(', ')}`);
      if (result.warnings.length > 0) console.log(`Warnings: ${result.warnings.join(', ')}`);
      process.exit(result.success ? 0 : 1);
    });
  } else if (command === 'read') {
    const reportId = args[1];
    if (!reportId) {
      console.error('Usage: node report-crud-manager.js read <reportId> --org <alias>');
      process.exit(1);
    }
    manager.read(reportId).then(result => {
      if (result.success) {
        console.log(JSON.stringify(result.annotated, null, 2));
      } else {
        console.error(`Errors: ${result.errors.join(', ')}`);
        process.exit(1);
      }
    });
  } else if (command === 'update') {
    const reportId = args[1];
    const patchFile = args[2];
    if (!reportId || !patchFile) {
      console.error('Usage: node report-crud-manager.js update <reportId> <patch.json> --org <alias>');
      process.exit(1);
    }
    const patch = JSON.parse(fs.readFileSync(patchFile, 'utf8'));
    manager.update(reportId, patch).then(result => {
      console.log('\n=== UPDATE Result ===');
      console.log(`Success: ${result.success}`);
      if (result.errors.length > 0) console.log(`Errors: ${result.errors.join(', ')}`);
      if (result.warnings.length > 0) console.log(`Warnings: ${result.warnings.join(', ')}`);
      process.exit(result.success ? 0 : 1);
    });
  } else if (command === 'delete') {
    const reportId = args[1];
    const force = args.includes('--force');
    if (!reportId) {
      console.error('Usage: node report-crud-manager.js delete <reportId> --org <alias> [--force]');
      process.exit(1);
    }
    manager.delete(reportId, { forceDelete: force }).then(result => {
      console.log('\n=== DELETE Result ===');
      console.log(`Success: ${result.success}`);
      console.log(`Archived: ${result.archived}`);
      if (result.dependencies) console.log(`Dependencies: ${result.dependencies.summary}`);
      if (result.errors.length > 0) console.log(`Errors: ${result.errors.join(', ')}`);
      process.exit(result.success ? 0 : 1);
    });
  } else {
    console.log('Report CRUD Manager');
    console.log('Usage:');
    console.log('  node report-crud-manager.js create <plan.json> --org <alias>');
    console.log('  node report-crud-manager.js read <reportId> --org <alias>');
    console.log('  node report-crud-manager.js update <reportId> <patch.json> --org <alias>');
    console.log('  node report-crud-manager.js delete <reportId> --org <alias> [--force]');
  }
}

module.exports = { ReportCrudManager };
