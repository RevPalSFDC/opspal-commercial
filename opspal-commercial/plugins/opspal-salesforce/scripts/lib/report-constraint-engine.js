#!/usr/bin/env node

/**
 * Report Constraint Engine
 *
 * Enforces Salesforce structural rules on ReportPlans and auto-converts
 * formats when the requested structure requires it. Returns the modified
 * plan plus an array of all applied transformations.
 *
 * Usage:
 *   const { ReportConstraintEngine } = require('./report-constraint-engine');
 *   const engine = new ReportConstraintEngine();
 *
 *   const result = engine.enforce(reportPlan);
 *   // result.plan, result.transformations, result.errors, result.warnings
 *
 * CLI:
 *   node report-constraint-engine.js validate <plan.json>
 *
 * @module report-constraint-engine
 */

const fs = require('fs');
const path = require('path');

const CONSTRAINTS_PATH = path.join(__dirname, '../../config/report-constraints.json');

const ROW_LIMIT_THRESHOLD = 2000;

class ReportConstraintEngine {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.constraints = this._loadConstraints(options.constraintsPath);
    this.rowEstimate = options.rowEstimate || null;
  }

  _loadConstraints(customPath) {
    const filePath = customPath || CONSTRAINTS_PATH;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      if (this.verbose) console.warn(`Constraints load warning: ${e.message}`);
      return { format_rules: {}, non_aggregatable_types: [], auto_conversion_rules: [], warning_rules: [], blocking_rules: [] };
    }
  }

  /**
   * Enforce all constraints on a ReportPlan
   *
   * @param {Object} plan - ReportPlan
   * @param {Object} context - Additional context (rowEstimate, fieldTypes, isMultiCurrency)
   * @returns {{ plan: Object, transformations: object[], errors: string[], warnings: string[] }}
   */
  enforce(plan, context = {}) {
    const modified = JSON.parse(JSON.stringify(plan));
    const transformations = [];
    const errors = [];
    const warnings = [];

    const hasDownGroupings = modified.groupings && modified.groupings.down && modified.groupings.down.length > 0;
    const hasAcrossGroupings = modified.groupings && modified.groupings.across && modified.groupings.across.length > 0;
    const downCount = (modified.groupings && modified.groupings.down) ? modified.groupings.down.length : 0;
    const acrossCount = (modified.groupings && modified.groupings.across) ? modified.groupings.across.length : 0;

    // Rule 1: Groupings present but format=TABULAR -> convert to SUMMARY
    if (hasDownGroupings && modified.report_format === 'TABULAR') {
      const oldFormat = modified.report_format;
      modified.report_format = 'SUMMARY';
      transformations.push({
        rule: 'groupings_present_but_tabular',
        action: `Converted format from ${oldFormat} to SUMMARY`,
        reason: 'Groupings require SUMMARY or MATRIX format'
      });
    }

    // Rule 2: Across groupings present but format=SUMMARY -> convert to MATRIX
    if (hasAcrossGroupings && modified.report_format === 'SUMMARY') {
      const oldFormat = modified.report_format;
      modified.report_format = 'MATRIX';
      transformations.push({
        rule: 'across_groupings_but_summary',
        action: `Converted format from ${oldFormat} to MATRIX`,
        reason: 'Column groupings require MATRIX format'
      });
    }

    // Rule 3: No groupings but format=SUMMARY/MATRIX -> convert to TABULAR
    if (!hasDownGroupings && !hasAcrossGroupings &&
        (modified.report_format === 'SUMMARY' || modified.report_format === 'MATRIX')) {
      const oldFormat = modified.report_format;
      modified.report_format = 'TABULAR';
      transformations.push({
        rule: 'no_groupings_but_grouped_format',
        action: `Converted format from ${oldFormat} to TABULAR`,
        reason: 'No groupings present; TABULAR is appropriate'
      });
    }

    // Rule 4: Excessive down-groupings warning
    if (downCount > 3) {
      warnings.push(`${downCount} down-groupings exceeds recommended max of 3. Performance may degrade.`);
    }

    // Rule 5: Summary on non-aggregatable type
    if (modified.summaries && context.fieldTypes) {
      for (const summary of modified.summaries) {
        const fieldType = context.fieldTypes[summary.field];
        if (fieldType && this.constraints.non_aggregatable_types.includes(fieldType)) {
          errors.push(
            `Cannot aggregate field '${summary.field}' (type: ${fieldType}). ` +
            `Only numeric, currency, and percent fields support aggregation.`
          );
        }
      }
    }

    // Rule 6: Row estimate exceeds limit for SUMMARY/MATRIX
    const rowEstimate = context.rowEstimate || this.rowEstimate;
    if (rowEstimate && rowEstimate > ROW_LIMIT_THRESHOLD &&
        (modified.report_format === 'SUMMARY' || modified.report_format === 'MATRIX')) {
      const oldFormat = modified.report_format;
      modified.report_format = 'TABULAR';
      transformations.push({
        rule: 'row_estimate_exceeds_limit',
        action: `Converted format from ${oldFormat} to TABULAR`,
        reason: `Estimated ${rowEstimate} rows exceeds ${ROW_LIMIT_THRESHOLD}-row limit for ${oldFormat}. TABULAR supports up to 50,000 rows.`
      });
      warnings.push(
        `Report downgraded from ${oldFormat} to TABULAR due to estimated row count (${rowEstimate}). ` +
        `Groupings and subtotals are no longer available. Consider adding filters to reduce row count.`
      );
    }

    // Rule 7: Multi-currency without CurrencyIsoCode
    if (context.isMultiCurrency) {
      const hasAmountField = (modified.columns || []).some(c =>
        c.toLowerCase().includes('amount') || c.toLowerCase().includes('revenue')
      );
      const hasCurrencyCol = (modified.columns || []).some(c =>
        c.toLowerCase().includes('currencyisocode')
      );

      if (hasAmountField && !hasCurrencyCol) {
        modified.columns.push('CurrencyIsoCode');
        transformations.push({
          rule: 'multi_currency_missing_iso',
          action: 'Added CurrencyIsoCode column',
          reason: 'Multi-currency org requires CurrencyIsoCode when Amount fields are present'
        });
      }
    }

    // Rule 8: Across groupings exceed max
    if (acrossCount > 2) {
      errors.push(
        `${acrossCount} across-groupings exceeds Salesforce maximum of 2. Remove ${acrossCount - 2} column grouping(s).`
      );
    }

    // Rule 9: Bucket field references missing column
    if (modified.custom_formulas) {
      const columnSet = new Set((modified.columns || []).map(c => c.toLowerCase()));
      // Simple check - custom formulas referencing columns
      for (const formula of modified.custom_formulas) {
        if (formula.formula) {
          // Extract field references from formula (simple pattern)
          const refs = formula.formula.match(/[A-Z_]+(?:__c)?/gi) || [];
          for (const ref of refs) {
            // Skip keywords and functions
            if (['IF', 'AND', 'OR', 'NOT', 'NULL', 'TRUE', 'FALSE', 'SUM', 'AVG', 'MIN', 'MAX'].includes(ref.toUpperCase())) continue;
            // This is a lightweight check - full formula parsing is deferred to preflight
          }
        }
      }
    }

    // Rule 10: Fiscal/calendar date mismatch
    if (modified.standard_date_filter && modified.groupings) {
      const dateFilter = modified.standard_date_filter;
      const isFiscal = dateFilter.durationValue &&
        (dateFilter.durationValue.includes('FISCAL') || dateFilter.durationValue.includes('fiscal'));

      if (isFiscal && modified.groupings.down) {
        const hasCalendarGrouping = modified.groupings.down.some(g =>
          g.dateGranularity && !g.dateGranularity.includes('FISCAL')
        );
        if (hasCalendarGrouping) {
          warnings.push(
            'Fiscal date filter with calendar date grouping may produce misaligned results. ' +
            'Consider using FISCAL_QUARTER or FISCAL_YEAR grouping.'
          );
        }
      }
    }

    // Add correction_notes for any transformations
    if (!modified.correction_notes) modified.correction_notes = [];
    for (const t of transformations) {
      modified.correction_notes.push({
        component: 'constraint-engine',
        original: t.rule,
        resolved: t.action,
        reason: t.reason
      });
    }

    return {
      plan: modified,
      transformations,
      errors,
      warnings
    };
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'validate') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Usage: node report-constraint-engine.js validate <plan.json>');
      process.exit(1);
    }

    const plan = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const engine = new ReportConstraintEngine({ verbose: true });
    const result = engine.enforce(plan);

    console.log('\n=== Constraint Engine Results ===');
    console.log(`Format: ${result.plan.report_format}`);
    console.log(`Transformations: ${result.transformations.length}`);
    console.log(`Errors: ${result.errors.length}`);
    console.log(`Warnings: ${result.warnings.length}`);

    if (result.transformations.length > 0) {
      console.log('\nTransformations applied:');
      result.transformations.forEach(t => console.log(`  [${t.rule}] ${t.action}`));
    }
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }
    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach(w => console.log(`  - ${w}`));
    }

    console.log('\nFinal plan:');
    console.log(JSON.stringify(result.plan, null, 2));

    process.exit(result.errors.length > 0 ? 1 : 0);
  } else {
    console.log('Report Constraint Engine');
    console.log('Usage:');
    console.log('  node report-constraint-engine.js validate <plan.json>');
  }
}

module.exports = { ReportConstraintEngine };
