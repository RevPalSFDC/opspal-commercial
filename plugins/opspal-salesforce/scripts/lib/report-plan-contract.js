#!/usr/bin/env node

/**
 * ReportPlan Contract - Validator + Builder
 *
 * Strict intermediate contract between user intent and Salesforce Report API call.
 * Execution is blocked if required fields are missing, confidence is below threshold,
 * or unresolved semantics exist.
 *
 * Usage:
 *   const { ReportPlanContract } = require('./report-plan-contract');
 *   const contract = new ReportPlanContract();
 *
 *   // Build a plan
 *   const plan = contract.build({ intent: 'create', primary_object: 'Opportunity', ... });
 *
 *   // Validate
 *   const result = contract.validate(plan);
 *   if (!result.valid) console.error(result.errors);
 *
 *   // Check execution gate
 *   const gate = contract.checkExecutionGate(plan);
 *   if (!gate.canExecute) console.error(gate.blockers);
 *
 * CLI:
 *   node report-plan-contract.js validate <plan.json>
 *   node report-plan-contract.js build --intent create --object Opportunity
 *
 * @module report-plan-contract
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '../../config/report-plan.schema.json');
const CONFIDENCE_THRESHOLD = 0.7;

const REQUIRED_FIELDS = [
  'intent',
  'primary_object',
  'grain',
  'report_type',
  'columns',
  'filters',
  'assumptions',
  'confidence'
];

const VALID_INTENTS = ['create', 'update', 'clone'];
const VALID_FORMATS = ['TABULAR', 'SUMMARY', 'MATRIX', 'MULTI_BLOCK'];
const VALID_AGGREGATES = ['SUM', 'AVG', 'MIN', 'MAX', 'UNIQUE', 'RowCount'];
const VALID_OPERATORS = [
  'equals', 'notEqual', 'lessThan', 'greaterThan',
  'lessOrEqual', 'greaterOrEqual', 'contains',
  'notContain', 'startsWith', 'includes', 'excludes', 'within'
];

class ReportPlanContract {
  constructor(options = {}) {
    this.confidenceThreshold = options.confidenceThreshold || CONFIDENCE_THRESHOLD;
    this.verbose = options.verbose || false;
    this.schema = null;

    try {
      this.schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    } catch (e) {
      if (this.verbose) console.warn(`Schema load warning: ${e.message}`);
    }
  }

  /**
   * Build a ReportPlan from partial input with defaults
   */
  build(input) {
    const plan = {
      intent: input.intent || 'create',
      business_question: input.business_question || null,
      primary_object: input.primary_object || null,
      grain: input.grain || (input.primary_object ? input.primary_object.toLowerCase() : null),
      report_type: input.report_type || input.primary_object || null,
      report_format: input.report_format || 'TABULAR',
      columns: input.columns || [],
      filters: (input.filters || []).map(f => this._normalizeFilter(f)),
      boolean_filter: input.boolean_filter || null,
      standard_date_filter: input.standard_date_filter || null,
      groupings: {
        down: (input.groupings && input.groupings.down) || [],
        across: (input.groupings && input.groupings.across) || []
      },
      summaries: (input.summaries || []).map(s => this._normalizeSummary(s)),
      custom_formulas: input.custom_formulas || [],
      chart: input.chart || null,
      assumptions: input.assumptions || [],
      confidence: typeof input.confidence === 'number' ? input.confidence : 0.5,
      financial_authority_flag: input.financial_authority_flag || false,
      unresolved_semantics: input.unresolved_semantics || [],
      report_name: input.report_name || null,
      folder_id: input.folder_id || null,
      source_report_id: input.source_report_id || null,
      patch: input.patch || null,
      correction_notes: input.correction_notes || []
    };

    // Auto-infer format from groupings if not explicitly set
    if (!input.report_format && plan.groupings) {
      if (plan.groupings.across && plan.groupings.across.length > 0) {
        plan.report_format = 'MATRIX';
      } else if (plan.groupings.down && plan.groupings.down.length > 0) {
        plan.report_format = 'SUMMARY';
      }
    }

    return plan;
  }

  /**
   * Validate a ReportPlan against the schema
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  validate(plan) {
    const errors = [];
    const warnings = [];

    // Required fields
    for (const field of REQUIRED_FIELDS) {
      if (plan[field] === undefined || plan[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Intent
    if (plan.intent && !VALID_INTENTS.includes(plan.intent)) {
      errors.push(`Invalid intent: ${plan.intent}. Must be one of: ${VALID_INTENTS.join(', ')}`);
    }

    // Format
    if (plan.report_format && !VALID_FORMATS.includes(plan.report_format)) {
      errors.push(`Invalid report_format: ${plan.report_format}. Must be one of: ${VALID_FORMATS.join(', ')}`);
    }

    // Columns
    if (plan.columns && plan.columns.length === 0) {
      errors.push('columns array must contain at least one column');
    }
    if (plan.columns) {
      plan.columns.forEach((col, i) => {
        if (typeof col !== 'string' || col.trim() === '') {
          errors.push(`columns[${i}] must be a non-empty string`);
        }
      });
    }

    // Filters
    if (plan.filters) {
      plan.filters.forEach((f, i) => {
        if (!f.column) errors.push(`filters[${i}] missing column`);
        if (!f.operator) errors.push(`filters[${i}] missing operator`);
        if (f.operator && !VALID_OPERATORS.includes(f.operator)) {
          warnings.push(`filters[${i}] operator '${f.operator}' may not be valid SF operator`);
        }
      });
    }

    // Groupings
    if (plan.groupings) {
      if (plan.groupings.down && plan.groupings.down.length > 3) {
        warnings.push(`${plan.groupings.down.length} down-groupings exceeds recommended max of 3`);
      }
      if (plan.groupings.across && plan.groupings.across.length > 2) {
        errors.push(`${plan.groupings.across.length} across-groupings exceeds SF max of 2`);
      }
    }

    // Summaries
    if (plan.summaries) {
      plan.summaries.forEach((s, i) => {
        if (!s.field) errors.push(`summaries[${i}] missing field`);
        if (s.aggregate && !VALID_AGGREGATES.includes(s.aggregate)) {
          errors.push(`summaries[${i}] invalid aggregate: ${s.aggregate}`);
        }
      });
    }

    // Confidence
    if (typeof plan.confidence === 'number') {
      if (plan.confidence < 0 || plan.confidence > 1) {
        errors.push('confidence must be between 0 and 1');
      }
    }

    // Assumptions
    if (plan.assumptions && plan.assumptions.length === 0) {
      warnings.push('No assumptions documented - consider adding at least one');
    }

    // Clone/update need source
    if ((plan.intent === 'clone' || plan.intent === 'update') && !plan.source_report_id) {
      errors.push(`intent '${plan.intent}' requires source_report_id`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check execution gate - the final go/no-go decision
   * @returns {{ canExecute: boolean, blockers: string[], warnings: string[] }}
   */
  checkExecutionGate(plan) {
    const validation = this.validate(plan);
    const blockers = [...validation.errors];
    const warnings = [...validation.warnings];

    // Confidence gate
    if (typeof plan.confidence === 'number' && plan.confidence < this.confidenceThreshold) {
      blockers.push(
        `Confidence ${plan.confidence.toFixed(2)} below threshold ${this.confidenceThreshold}. ` +
        `Needs more context or user confirmation.`
      );
    }

    // Unresolved semantics gate
    if (plan.unresolved_semantics && plan.unresolved_semantics.length > 0) {
      const terms = plan.unresolved_semantics.map(s => s.term).join(', ');
      blockers.push(
        `Unresolved business terms: ${terms}. User disambiguation required.`
      );
    }

    return {
      canExecute: blockers.length === 0,
      blockers,
      warnings
    };
  }

  /**
   * Get all elements in the plan (for silent-drop detection)
   * @returns {{ columns: string[], filters: object[], groupings: object[], summaries: object[] }}
   */
  getElements(plan) {
    return {
      columns: [...(plan.columns || [])],
      filters: [...(plan.filters || [])],
      groupings_down: [...((plan.groupings && plan.groupings.down) || [])],
      groupings_across: [...((plan.groupings && plan.groupings.across) || [])],
      summaries: [...(plan.summaries || [])],
      custom_formulas: [...(plan.custom_formulas || [])]
    };
  }

  /**
   * Compare plan elements vs final report elements to detect silent drops
   * @returns {{ silent_drops: object[], count: number }}
   */
  detectSilentDrops(plan, finalReport) {
    const drops = [];
    const planElements = this.getElements(plan);
    const finalColumns = new Set((finalReport.columns || []).map(c =>
      typeof c === 'string' ? c : c.field || c.name || ''
    ));

    for (const col of planElements.columns) {
      if (!finalColumns.has(col)) {
        drops.push({ type: 'column', element: col, reason: 'Missing from final report' });
      }
    }

    const finalFilterFields = new Set((finalReport.filters || []).map(f => f.column || f.field || ''));
    for (const filter of planElements.filters) {
      if (!finalFilterFields.has(filter.column)) {
        drops.push({ type: 'filter', element: filter.column, reason: 'Filter missing from final report' });
      }
    }

    return {
      silent_drops: drops,
      count: drops.length
    };
  }

  /**
   * Merge a patch into an existing plan (for updates)
   */
  applyPatch(existingPlan, patch) {
    const merged = JSON.parse(JSON.stringify(existingPlan));

    if (patch.add_columns) {
      merged.columns = [...new Set([...merged.columns, ...patch.add_columns])];
    }
    if (patch.remove_columns) {
      const removeSet = new Set(patch.remove_columns);
      merged.columns = merged.columns.filter(c => !removeSet.has(c));
    }
    if (patch.add_filters) {
      merged.filters = [...merged.filters, ...patch.add_filters.map(f => this._normalizeFilter(f))];
    }
    if (patch.remove_filters) {
      const removeKeys = new Set(patch.remove_filters.map(f => `${f.column}:${f.operator}`));
      merged.filters = merged.filters.filter(f => !removeKeys.has(`${f.column}:${f.operator}`));
    }
    if (patch.update_groupings) {
      if (patch.update_groupings.down !== undefined) {
        merged.groupings.down = patch.update_groupings.down;
      }
      if (patch.update_groupings.across !== undefined) {
        merged.groupings.across = patch.update_groupings.across;
      }
    }
    if (patch.update_summaries) {
      merged.summaries = patch.update_summaries;
    }
    if (patch.update_chart !== undefined) {
      merged.chart = patch.update_chart;
    }

    merged.intent = 'update';
    return merged;
  }

  _normalizeFilter(filter) {
    return {
      column: filter.column || '',
      operator: filter.operator || 'equals',
      value: filter.value !== undefined ? filter.value : null
    };
  }

  _normalizeSummary(summary) {
    return {
      field: summary.field || '',
      aggregate: summary.aggregate || 'SUM'
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
      console.error('Usage: node report-plan-contract.js validate <plan.json>');
      process.exit(1);
    }
    try {
      const plan = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const contract = new ReportPlanContract({ verbose: true });
      const validation = contract.validate(plan);
      const gate = contract.checkExecutionGate(plan);

      console.log('\n=== ReportPlan Validation ===');
      console.log(`Valid: ${validation.valid}`);
      console.log(`Can Execute: ${gate.canExecute}`);

      if (validation.errors.length > 0) {
        console.log('\nErrors:');
        validation.errors.forEach(e => console.log(`  - ${e}`));
      }
      if (validation.warnings.length > 0) {
        console.log('\nWarnings:');
        validation.warnings.forEach(w => console.log(`  - ${w}`));
      }
      if (gate.blockers.length > 0) {
        console.log('\nExecution Blockers:');
        gate.blockers.forEach(b => console.log(`  - ${b}`));
      }

      process.exit(gate.canExecute ? 0 : 1);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  } else if (command === 'build') {
    const input = {};
    for (let i = 1; i < args.length; i += 2) {
      const key = args[i].replace(/^--/, '');
      const value = args[i + 1];
      if (key === 'columns' || key === 'assumptions') {
        input[key] = value.split(',');
      } else if (key === 'confidence') {
        input[key] = parseFloat(value);
      } else {
        input[key] = value;
      }
    }
    const contract = new ReportPlanContract();
    const plan = contract.build(input);
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log('ReportPlan Contract');
    console.log('Usage:');
    console.log('  node report-plan-contract.js validate <plan.json>');
    console.log('  node report-plan-contract.js build --intent create --primary_object Opportunity --columns "AMOUNT,STAGE_NAME" --confidence 0.9 --assumptions "Pipeline = open opps"');
  }
}

module.exports = { ReportPlanContract, CONFIDENCE_THRESHOLD, VALID_INTENTS, VALID_FORMATS, VALID_AGGREGATES, VALID_OPERATORS };
