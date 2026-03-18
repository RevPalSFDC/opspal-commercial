#!/usr/bin/env node

/**
 * Report Evaluation Harness
 *
 * Automated tests verifying reports are executable and semantically correct.
 * Runs config-driven scenarios, tracks failure classes, and reports results.
 *
 * Usage:
 *   const { ReportEvalHarness } = require('./report-eval-harness');
 *   const harness = new ReportEvalHarness();
 *
 *   const results = await harness.runAll();
 *   const results = await harness.runScenario('basic-pipeline');
 *
 * CLI:
 *   node report-eval-harness.js run [--org <alias>]
 *   node report-eval-harness.js run --scenario basic-pipeline [--org <alias>]
 *   node report-eval-harness.js list
 *
 * @module report-eval-harness
 */

const fs = require('fs');
const path = require('path');

const { ReportPlanContract } = require('./report-plan-contract');
const { ReportSemanticDisambiguator } = require('./report-semantic-disambiguator');
const { ReportConstraintEngine } = require('./report-constraint-engine');
const { ReportPreflightEngine } = require('./report-preflight-engine');

const SCENARIOS_PATH = path.join(__dirname, '../../config/report-eval-scenarios.json');

class ReportEvalHarness {
  constructor(options = {}) {
    this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG;
    this.verbose = options.verbose || false;
    this.scenarios = this._loadScenarios(options.scenariosPath);

    this.contract = new ReportPlanContract({ verbose: false });
    this.disambiguator = new ReportSemanticDisambiguator({ verbose: false });
    this.constraintEngine = new ReportConstraintEngine({ verbose: false });
    this.preflight = new ReportPreflightEngine({ orgAlias: this.orgAlias, verbose: false });
  }

  _loadScenarios(customPath) {
    const filePath = customPath || SCENARIOS_PATH;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      return { scenarios: [] };
    }
  }

  /**
   * Run all scenarios
   */
  async runAll() {
    const results = [];
    for (const scenario of this.scenarios.scenarios) {
      const result = await this.runScenario(scenario.id);
      results.push(result);
    }
    return {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      results,
      failure_classes: this._aggregateFailureClasses(results)
    };
  }

  /**
   * Run a single scenario
   */
  async runScenario(scenarioId) {
    const scenario = this.scenarios.scenarios.find(s => s.id === scenarioId);
    if (!scenario) {
      return { id: scenarioId, passed: false, error: 'Scenario not found', assertions: [] };
    }

    const assertions = [];
    let plan;

    try {
      // Build plan from input
      plan = this.contract.build({
        intent: scenario.input.intent || 'create',
        ...scenario.input
      });

      // Run disambiguation if business_question present
      if (scenario.input.business_question) {
        const disamb = this.disambiguator.resolve(scenario.input.business_question);
        if (disamb.unresolved.length > 0) {
          plan.unresolved_semantics = this.disambiguator.toUnresolvedSemantics(disamb.unresolved);
        }
        if (disamb.resolved.length > 0) {
          plan = this.disambiguator.applyToPlan(plan, disamb.resolved);
        }
      }

      // Apply patch if present
      if (scenario.patch) {
        plan = this.contract.applyPatch(plan, scenario.patch);
      }

      // Run constraint engine
      const constraintResult = this.constraintEngine.enforce(plan);
      plan = constraintResult.plan;

      // Check execution gate
      const gate = this.contract.checkExecutionGate(plan);

      // Run assertions against expected
      const expected = scenario.expected;

      if (expected.report_type) {
        assertions.push(this._assert(
          'report_type',
          plan.report_type === expected.report_type,
          `Expected type '${expected.report_type}', got '${plan.report_type}'`
        ));
      }

      if (expected.report_type_not) {
        assertions.push(this._assert(
          'report_type_not',
          plan.report_type !== expected.report_type_not,
          `Type should NOT be '${expected.report_type_not}', but it is`
        ));
      }

      if (expected.format) {
        assertions.push(this._assert(
          'format',
          plan.report_format === expected.format,
          `Expected format '${expected.format}', got '${plan.report_format}'`
        ));
      }

      if (expected.has_grouping) {
        const hasGrouping = (plan.groupings.down || []).some(g => g.field === expected.has_grouping);
        assertions.push(this._assert(
          'has_grouping',
          hasGrouping,
          `Expected grouping '${expected.has_grouping}' not found`
        ));
      }

      if (expected.has_filter_excluding_closed_lost) {
        const hasFilter = (plan.filters || []).some(f =>
          f.column === 'STAGE_NAME' && (f.operator === 'notEqual' || f.operator === 'excludes') &&
          (f.value === 'Closed Lost' || (Array.isArray(f.value) && f.value.includes('Closed Lost')))
        );
        assertions.push(this._assert(
          'has_filter_excluding_closed_lost',
          hasFilter,
          'Missing filter excluding Closed Lost'
        ));
      }

      if (expected.executable !== undefined) {
        assertions.push(this._assert(
          'executable',
          gate.canExecute === expected.executable,
          `Expected executable=${expected.executable}, got ${gate.canExecute}. Blockers: ${gate.blockers.join('; ')}`
        ));
      }

      if (expected.column_count_min) {
        assertions.push(this._assert(
          'column_count_min',
          (plan.columns || []).length >= expected.column_count_min,
          `Expected >= ${expected.column_count_min} columns, got ${(plan.columns || []).length}`
        ));
      }

      if (expected.has_correction_note) {
        assertions.push(this._assert(
          'has_correction_note',
          (plan.correction_notes || []).length > 0,
          'Expected correction notes but found none'
        ));
      }

      if (expected.has_unresolved_semantics !== undefined) {
        const hasUnresolved = (plan.unresolved_semantics || []).length > 0;
        assertions.push(this._assert(
          'has_unresolved_semantics',
          hasUnresolved === expected.has_unresolved_semantics,
          `Expected unresolved_semantics=${expected.has_unresolved_semantics}, got ${hasUnresolved}`
        ));
      }

      if (expected.unresolved_term) {
        const hasTerm = (plan.unresolved_semantics || []).some(u => u.term === expected.unresolved_term);
        assertions.push(this._assert(
          'unresolved_term',
          hasTerm,
          `Expected unresolved term '${expected.unresolved_term}' not found`
        ));
      }

      if (expected.has_assumption_about_churn) {
        const hasAssumption = (plan.assumptions || []).some(a =>
          a.toLowerCase().includes('churn')
        );
        assertions.push(this._assert(
          'has_assumption_about_churn',
          hasAssumption,
          'Expected assumption about churn interpretation not found'
        ));
      }

      if (expected.blocked_by === 'confidence') {
        const blockedByConfidence = gate.blockers.some(b => b.includes('Confidence'));
        assertions.push(this._assert(
          'blocked_by_confidence',
          blockedByConfidence,
          'Expected to be blocked by confidence but was not'
        ));
      }

      if (expected.has_column) {
        assertions.push(this._assert(
          'has_column',
          (plan.columns || []).includes(expected.has_column),
          `Expected column '${expected.has_column}' not found`
        ));
      }

      if (expected.has_column_preserved) {
        assertions.push(this._assert(
          'has_column_preserved',
          (plan.columns || []).includes(expected.has_column_preserved),
          `Expected preserved column '${expected.has_column_preserved}' was lost`
        ));
      }

    } catch (e) {
      assertions.push(this._assert('no_exception', false, `Exception: ${e.message}`));
    }

    const passed = assertions.every(a => a.passed);
    return {
      id: scenario.id,
      description: scenario.description,
      passed,
      failure_class: passed ? null : scenario.failure_class,
      assertions,
      plan_summary: plan ? {
        format: plan.report_format,
        type: plan.report_type,
        columns: (plan.columns || []).length,
        filters: (plan.filters || []).length,
        corrections: (plan.correction_notes || []).length,
        unresolved: (plan.unresolved_semantics || []).length
      } : null
    };
  }

  _assert(name, condition, message) {
    return { name, passed: condition, message: condition ? 'OK' : message };
  }

  _aggregateFailureClasses(results) {
    const classes = {};
    for (const r of results) {
      if (!r.passed && r.failure_class) {
        classes[r.failure_class] = (classes[r.failure_class] || 0) + 1;
      }
    }
    return classes;
  }

  /**
   * List all scenarios
   */
  listScenarios() {
    return this.scenarios.scenarios.map(s => ({
      id: s.id,
      description: s.description,
      failure_class: s.failure_class
    }));
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
  const scenarioFlag = args.indexOf('--scenario');
  const scenarioId = scenarioFlag >= 0 ? args[scenarioFlag + 1] : null;

  const harness = new ReportEvalHarness({ orgAlias, verbose: true });

  if (command === 'run') {
    const runFn = scenarioId
      ? harness.runScenario(scenarioId).then(r => ({
          total: 1, passed: r.passed ? 1 : 0, failed: r.passed ? 0 : 1, results: [r], failure_classes: {}
        }))
      : harness.runAll();

    runFn.then(results => {
      console.log(`\n=== Report Eval Results ===`);
      console.log(`Total: ${results.total} | Passed: ${results.passed} | Failed: ${results.failed}`);

      for (const r of results.results) {
        const status = r.passed ? 'PASS' : 'FAIL';
        const icon = r.passed ? '+' : '-';
        console.log(`\n  [${icon}] ${r.id}: ${status}`);
        if (!r.passed) {
          r.assertions.filter(a => !a.passed).forEach(a => {
            console.log(`      ${a.name}: ${a.message}`);
          });
        }
      }

      if (Object.keys(results.failure_classes).length > 0) {
        console.log(`\nFailure classes:`);
        for (const [cls, count] of Object.entries(results.failure_classes)) {
          console.log(`  ${cls}: ${count}`);
        }
      }

      // Check silent_drop specifically
      const silentDropFailures = results.results.filter(r =>
        !r.passed && r.failure_class === 'silent_drop'
      );
      if (silentDropFailures.length > 0) {
        console.log(`\nCRITICAL: ${silentDropFailures.length} silent drop failure(s) detected!`);
      }

      process.exit(results.failed > 0 ? 1 : 0);
    }).catch(e => {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    });
  } else if (command === 'list') {
    const scenarios = harness.listScenarios();
    console.log(`\n=== Eval Scenarios (${scenarios.length}) ===`);
    scenarios.forEach(s => {
      console.log(`  ${s.id}: ${s.description}${s.failure_class ? ` [${s.failure_class}]` : ''}`);
    });
  } else {
    console.log('Report Evaluation Harness');
    console.log('Usage:');
    console.log('  node report-eval-harness.js run [--org <alias>]');
    console.log('  node report-eval-harness.js run --scenario basic-pipeline');
    console.log('  node report-eval-harness.js list');
  }
}

module.exports = { ReportEvalHarness };
