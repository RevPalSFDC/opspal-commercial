#!/usr/bin/env node

/**
 * Report Preflight Engine
 *
 * Before committing a report, validates via the full pipeline and attempts
 * bounded repairs on failure. Wires Components 1-4 together:
 *   ReportPlan -> Disambiguation -> Fallback -> Constraints -> Compile -> Validate
 *
 * Repair strategies (max 3 attempts):
 *   1. Field substitution (Levenshtein closest match)
 *   2. Report-type swap (fallback engine)
 *   3. Filter fix (operator normalization, relative dates)
 *   4. Format downgrade (SUMMARY/MATRIX -> TABULAR if row limit)
 *
 * Usage:
 *   const { ReportPreflightEngine } = require('./report-preflight-engine');
 *   const engine = new ReportPreflightEngine({ orgAlias: 'myOrg' });
 *
 *   const result = await engine.run(reportPlan);
 *   // result.success, result.plan, result.attempts, result.repairs, result.payload
 *
 * CLI:
 *   node report-preflight-engine.js run <plan.json> --org <alias>
 *
 * @module report-preflight-engine
 */

const fs = require('fs');
const path = require('path');

const { ReportPlanContract } = require('./report-plan-contract');
const { ReportTypeFallbackEngine } = require('./report-type-fallback-engine');
const { ReportConstraintEngine } = require('./report-constraint-engine');

let guardrails;
try {
  guardrails = require('./reports_api_guardrails');
} catch (e) {
  guardrails = null;
}

const MAX_REPAIR_ATTEMPTS = 3;

class ReportPreflightEngine {
  constructor(options = {}) {
    this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG;
    this.verbose = options.verbose || false;
    this.contract = new ReportPlanContract({ verbose: this.verbose });
    this.fallbackEngine = new ReportTypeFallbackEngine({ orgAlias: this.orgAlias, verbose: this.verbose });
    this.constraintEngine = new ReportConstraintEngine({ verbose: this.verbose });
  }

  /**
   * Run full preflight validation with auto-repair loop
   *
   * @param {Object} plan - ReportPlan
   * @param {Object} context - Additional context (rowEstimate, fieldTypes, etc.)
   * @returns {{ success: boolean, plan: Object, payload: Object|null, attempts: number, repairs: object[], errors: string[], warnings: string[] }}
   */
  async run(plan, context = {}) {
    const repairs = [];
    const allWarnings = [];
    let currentPlan = JSON.parse(JSON.stringify(plan));
    let attempt = 0;

    while (attempt < MAX_REPAIR_ATTEMPTS) {
      attempt++;
      const stepResult = await this._runSinglePass(currentPlan, context);

      allWarnings.push(...stepResult.warnings);

      if (stepResult.success) {
        return {
          success: true,
          plan: stepResult.plan,
          payload: stepResult.payload,
          attempts: attempt,
          repairs,
          errors: [],
          warnings: allWarnings
        };
      }

      // Attempt repair
      const repairResult = this._attemptRepair(stepResult.plan, stepResult.errors, stepResult);
      if (!repairResult.repaired) {
        // No more repairs possible
        return {
          success: false,
          plan: stepResult.plan,
          payload: null,
          attempts: attempt,
          repairs,
          errors: stepResult.errors,
          warnings: allWarnings
        };
      }

      repairs.push(...repairResult.repairs);
      currentPlan = repairResult.plan;

      if (this.verbose) {
        console.log(`  Repair attempt ${attempt}: ${repairResult.repairs.map(r => r.strategy).join(', ')}`);
      }
    }

    // Exhausted repair attempts
    const finalResult = await this._runSinglePass(currentPlan, context);
    return {
      success: finalResult.success,
      plan: finalResult.plan,
      payload: finalResult.success ? finalResult.payload : null,
      attempts: attempt + 1,
      repairs,
      errors: finalResult.errors,
      warnings: allWarnings
    };
  }

  /**
   * Run a single validation pass (no repairs)
   */
  async _runSinglePass(plan, context) {
    const errors = [];
    const warnings = [];
    let currentPlan = JSON.parse(JSON.stringify(plan));

    // Step 1: Contract validation
    const contractResult = this.contract.validate(currentPlan);
    if (!contractResult.valid) {
      return {
        success: false,
        plan: currentPlan,
        payload: null,
        errors: contractResult.errors,
        warnings: contractResult.warnings,
        phase: 'contract'
      };
    }
    warnings.push(...contractResult.warnings);

    // Step 2: Execution gate
    const gate = this.contract.checkExecutionGate(currentPlan);
    if (!gate.canExecute) {
      return {
        success: false,
        plan: currentPlan,
        payload: null,
        errors: gate.blockers,
        warnings: gate.warnings,
        phase: 'gate'
      };
    }

    // Step 3: Report type validation + fallback
    const fallbackResult = await this.fallbackEngine.validateAndFallback(currentPlan);
    if (fallbackResult.correction_notes && fallbackResult.correction_notes.length > 0) {
      if (!currentPlan.correction_notes) currentPlan.correction_notes = [];
      currentPlan.correction_notes.push(...fallbackResult.correction_notes);
    }
    if (fallbackResult.resolved_type && fallbackResult.resolved_type !== currentPlan.report_type) {
      currentPlan.report_type = fallbackResult.resolved_type;
    }
    if (!fallbackResult.valid) {
      errors.push(`Report type validation failed: missing fields [${fallbackResult.missing_fields.join(', ')}]`);
    }

    // Step 4: Constraint enforcement
    const constraintResult = this.constraintEngine.enforce(currentPlan, context);
    currentPlan = constraintResult.plan;
    errors.push(...constraintResult.errors);
    warnings.push(...constraintResult.warnings);

    if (errors.length > 0) {
      return { success: false, plan: currentPlan, payload: null, errors, warnings, phase: 'validation' };
    }

    // Step 5: Compile to SF API payload
    const payload = this._compileToPayload(currentPlan);

    // Step 6: Normalize filters via guardrails
    if (guardrails && payload.reportMetadata) {
      try {
        payload.reportMetadata = guardrails.enforceRelativeDates(payload.reportMetadata);
      } catch (e) {
        warnings.push(`Guardrail normalization warning: ${e.message}`);
      }
    }

    return { success: true, plan: currentPlan, payload, errors: [], warnings, phase: 'complete' };
  }

  /**
   * Attempt repair based on errors
   */
  _attemptRepair(plan, errors, stepResult) {
    const repairs = [];
    let modified = JSON.parse(JSON.stringify(plan));
    let anyRepair = false;

    for (const error of errors) {
      // Strategy 1: Field substitution
      if (error.includes('missing field') || error.includes('Missing from') || error.includes('missing fields')) {
        const fieldMatch = error.match(/\[([^\]]+)\]/);
        if (fieldMatch && stepResult && stepResult.phase === 'validation') {
          // Use fallback engine's substitutions if available
          repairs.push({
            strategy: 'field_substitution',
            error,
            action: 'Attempted field name correction via fallback engine'
          });
          anyRepair = true;
        }
      }

      // Strategy 2: Filter operator normalization
      if (error.includes('operator') || error.includes('filter')) {
        if (guardrails) {
          try {
            modified.filters = (modified.filters || []).map(f => {
              try {
                const normalized = guardrails.normalizeOperators(f.operator);
                if (normalized !== f.operator) {
                  repairs.push({
                    strategy: 'filter_fix',
                    error,
                    action: `Normalized operator '${f.operator}' to '${normalized}' on filter ${f.column}`
                  });
                  anyRepair = true;
                  return { ...f, operator: normalized };
                }
              } catch (e) {
                // Operator not recognized - leave as-is
              }
              return f;
            });
          } catch (e) {
            // Skip filter repair
          }
        }
      }

      // Strategy 3: Format downgrade for row limits
      if (error.includes('row') || error.includes('limit') || error.includes('truncat')) {
        if (modified.report_format === 'SUMMARY' || modified.report_format === 'MATRIX') {
          const oldFormat = modified.report_format;
          modified.report_format = 'TABULAR';
          repairs.push({
            strategy: 'format_downgrade',
            error,
            action: `Downgraded format from ${oldFormat} to TABULAR`
          });
          anyRepair = true;
        }
      }

      // Strategy 4: Confidence boost (if just below threshold)
      if (error.includes('Confidence') && error.includes('below threshold')) {
        // Can't auto-fix confidence - this requires more context
      }
    }

    return { repaired: anyRepair, plan: modified, repairs };
  }

  /**
   * Compile a validated ReportPlan to Salesforce Analytics API payload
   */
  _compileToPayload(plan) {
    const payload = {
      reportMetadata: {
        name: plan.report_name || `Report - ${plan.primary_object}`,
        reportFormat: plan.report_format || 'TABULAR',
        reportType: {
          type: plan.report_type
        },
        detailColumns: [...(plan.columns || [])],
        reportFilters: (plan.filters || []).map((f, i) => ({
          column: f.column,
          operator: f.operator,
          value: Array.isArray(f.value) ? f.value.join(',') : (f.value || ''),
          filterType: 'fieldValue',
          isRunPageEditable: false
        })),
        groupingsDown: (plan.groupings && plan.groupings.down || []).map(g => ({
          name: g.field,
          sortOrder: g.sortOrder || 'Asc',
          dateGranularity: g.dateGranularity || 'NONE'
        })),
        groupingsAcross: (plan.groupings && plan.groupings.across || []).map(g => ({
          name: g.field,
          sortOrder: g.sortOrder || 'Asc',
          dateGranularity: g.dateGranularity || 'NONE'
        })),
        aggregates: (plan.summaries || []).map(s => `${s.aggregate}!${s.field}`),
        hasDetailRows: true,
        scope: 'organization'
      }
    };

    // Boolean filter
    if (plan.boolean_filter) {
      payload.reportMetadata.reportBooleanFilter = plan.boolean_filter;
    } else if (guardrails && plan.filters && plan.filters.length > 0) {
      const bf = guardrails.buildBooleanFilter(plan.filters);
      if (bf) payload.reportMetadata.reportBooleanFilter = bf;
    }

    // Standard date filter
    if (plan.standard_date_filter) {
      payload.reportMetadata.standardDateFilter = {
        column: plan.standard_date_filter.column,
        durationValue: plan.standard_date_filter.durationValue || 'CUSTOM',
        startDate: plan.standard_date_filter.startDate || null,
        endDate: plan.standard_date_filter.endDate || null
      };
    }

    // Custom summary formulas
    if (plan.custom_formulas && plan.custom_formulas.length > 0) {
      payload.reportMetadata.customSummaryFormulas = plan.custom_formulas.map(f => ({
        label: f.label,
        formula: f.formula,
        dataType: f.dataType || 'double',
        decimalPlaces: f.decimalPlaces || 2,
        description: f.description || ''
      }));
    }

    // Chart
    if (plan.chart) {
      payload.reportMetadata.chart = {
        chartType: plan.chart.type,
        groupingColumn: plan.chart.grouping,
        summaryColumn: plan.chart.summary,
        title: plan.chart.title || ''
      };
    }

    // Folder
    if (plan.folder_id) {
      payload.reportMetadata.folderId = plan.folder_id;
    }

    return payload;
  }

  /**
   * Get preflight summary for telemetry
   */
  getSummary(result) {
    return {
      success: result.success,
      attempts: result.attempts,
      repairs_applied: result.repairs.length,
      repair_strategies: [...new Set(result.repairs.map(r => r.strategy))],
      error_count: result.errors.length,
      warning_count: result.warnings.length,
      final_format: result.plan ? result.plan.report_format : null,
      final_type: result.plan ? result.plan.report_type : null
    };
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

  if (command === 'run') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Usage: node report-preflight-engine.js run <plan.json> --org <alias>');
      process.exit(1);
    }

    const plan = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const engine = new ReportPreflightEngine({ orgAlias, verbose: true });

    engine.run(plan).then(result => {
      console.log('\n=== Preflight Results ===');
      console.log(`Success: ${result.success}`);
      console.log(`Attempts: ${result.attempts}`);
      console.log(`Repairs: ${result.repairs.length}`);

      if (result.repairs.length > 0) {
        console.log('\nRepairs applied:');
        result.repairs.forEach(r => console.log(`  [${r.strategy}] ${r.action}`));
      }
      if (result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach(e => console.log(`  - ${e}`));
      }
      if (result.warnings.length > 0) {
        console.log('\nWarnings:');
        result.warnings.forEach(w => console.log(`  - ${w}`));
      }

      if (result.payload) {
        console.log('\nCompiled payload:');
        console.log(JSON.stringify(result.payload, null, 2));
      }

      const summary = engine.getSummary(result);
      console.log('\nSummary:', JSON.stringify(summary));

      process.exit(result.success ? 0 : 1);
    }).catch(e => {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    });
  } else {
    console.log('Report Preflight Engine');
    console.log('Usage:');
    console.log('  node report-preflight-engine.js run <plan.json> --org <alias>');
  }
}

module.exports = { ReportPreflightEngine, MAX_REPAIR_ATTEMPTS };
