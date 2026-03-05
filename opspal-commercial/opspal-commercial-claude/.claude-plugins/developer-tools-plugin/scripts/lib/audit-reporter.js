#!/usr/bin/env node

/**
 * audit-reporter.js
 *
 * Compares plan vs actual execution, calculates utilization scores,
 * detects gaps, and generates recommendations.
 *
 * @module audit-reporter
 */

/**
 * Audit Reporter - Analyzes execution compliance
 */
class AuditReporter {
  constructor() {}

  /**
   * Generate audit report from plan and execution results
   * @param {Object} plan - Original execution plan
   * @param {Object} executionResults - Results from executor
   * @returns {Object} Audit report
   */
  generateReport(plan, executionResults) {
    const audit = {
      timestamp: new Date().toISOString(),
      plan_id: executionResults.plan_id,
      duration_ms: executionResults.total_duration_ms,
      success: executionResults.success,

      // Plan vs Actual comparison
      plan_vs_actual: this._comparePlanToActual(plan, executionResults),

      // Utilization scores
      utilization_scores: this._calculateUtilization(plan, executionResults),

      // Gap analysis
      gaps: this._detectGaps(plan, executionResults),

      // Recommendations
      recommendations: this._generateRecommendations(plan, executionResults),

      // Next actions
      next_actions: this._determineNextActions(plan, executionResults)
    };

    return audit;
  }

  /**
   * Compare plan to actual execution
   * @param {Object} plan - Original plan
   * @param {Object} results - Execution results
   * @returns {Array} Comparison entries
   */
  _comparePlanToActual(plan, results) {
    const comparison = [];

    // Get all planned units
    const plannedUnits = [];
    for (const group of plan.PLAN.parallel_groups) {
      for (const unit of group.units) {
        plannedUnits.push({
          unit_id: unit.unit_id,
          planned_agent: unit.agent_or_tool,
          group_id: group.group_id
        });
      }
    }

    // Get all executed units
    const executedUnits = new Map();
    for (const group of results.groups) {
      for (const unit of group.units) {
        executedUnits.set(unit.unit_id, unit);
      }
    }

    // Compare each planned unit
    for (const planned of plannedUnits) {
      const actual = executedUnits.get(planned.unit_id);

      comparison.push({
        unit_id: planned.unit_id,
        executed: !!actual,
        as_planned: actual ? (actual.agent_used === planned.planned_agent) : false,
        planned_agent: planned.planned_agent,
        actual_agent: actual ? actual.agent_used : null,
        latency_ms: actual ? actual.duration_ms : null,
        attempts: actual ? actual.attempts : 0,
        success: actual ? actual.success : false
      });
    }

    return comparison;
  }

  /**
   * Calculate utilization scores
   * @param {Object} plan - Original plan
   * @param {Object} results - Execution results
   * @returns {Object} Utilization metrics
   */
  _calculateUtilization(plan, results) {
    // Count total units
    let totalUnits = 0;
    let unitsViaSubagents = 0;
    let unitsInParallel = 0;

    for (const group of plan.PLAN.parallel_groups) {
      totalUnits += group.units.length;

      // All units are via sub-agents (by design of Supervisor)
      unitsViaSubagents += group.units.length;

      // Units in parallel groups
      if (group.runs_in_parallel && group.units.length > 1) {
        unitsInParallel += group.units.length;
      }
    }

    const subagentUtilization = totalUnits > 0 ?
      (unitsViaSubagents / totalUnits) * 100 : 0;

    const parallelizationRatio = totalUnits > 0 ?
      (unitsInParallel / totalUnits) * 100 : 0;

    return {
      total_units: totalUnits,
      units_via_subagents: unitsViaSubagents,
      units_in_parallel: unitsInParallel,
      subagent_utilization_percent: subagentUtilization,
      parallelization_ratio_percent: parallelizationRatio,
      targets: {
        subagent_utilization_target: 70,
        parallelization_ratio_target: 60
      },
      meets_targets: {
        subagent_utilization: subagentUtilization >= 70,
        parallelization_ratio: parallelizationRatio >= 60 || totalUnits < 2
      }
    };
  }

  /**
   * Detect gaps (missed opportunities)
   * @param {Object} plan - Original plan
   * @param {Object} results - Execution results
   * @returns {Array} Detected gaps
   */
  _detectGaps(plan, results) {
    const gaps = [];

    // Gap 1: Units that ran sequentially without dependencies
    const independentUnits = plan.AUDIT.independence_check.filter(check =>
      check.can_run_in_parallel
    );

    const sequentialGroups = plan.PLAN.parallel_groups.filter(g =>
      !g.runs_in_parallel && g.units.length === 1
    );

    if (independentUnits.length > 1 && sequentialGroups.length > 0) {
      gaps.push({
        type: 'missed_parallelization',
        severity: 'medium',
        description: `${sequentialGroups.length} units ran sequentially despite being independent`,
        impact: 'Slower execution than necessary',
        recommendation: 'Combine independent units into parallel groups'
      });
    }

    // Gap 2: Low parallelization ratio
    const utilization = this._calculateUtilization(plan, results);

    if (!utilization.meets_targets.parallelization_ratio && utilization.total_units >= 2) {
      gaps.push({
        type: 'low_parallelization',
        severity: 'high',
        description: `Parallelization ratio is ${utilization.parallelization_ratio_percent.toFixed(1)}% (target: ≥60%)`,
        impact: 'Significant performance opportunity missed',
        recommendation: 'Increase parallel execution via better task decomposition'
      });
    }

    // Gap 3: Agent mismatches (fallbacks used)
    const agentMismatches = results.groups.flatMap(group =>
      group.units.filter(unit => {
        const planned = plan.PLAN.parallel_groups
          .flatMap(g => g.units)
          .find(u => u.unit_id === unit.unit_id);

        return planned && unit.agent_used !== planned.agent_or_tool;
      })
    );

    if (agentMismatches.length > 0) {
      gaps.push({
        type: 'agent_mismatch',
        severity: 'low',
        description: `${agentMismatches.length} units used fallback agents`,
        impact: 'Potential capability mismatch or slower execution',
        recommendation: 'Review agent selection criteria and improve primary agent reliability'
      });
    }

    // Gap 4: High failure rate
    const failedUnits = results.groups.flatMap(group =>
      group.units.filter(unit => !unit.success)
    );

    if (failedUnits.length > 0) {
      gaps.push({
        type: 'high_failure_rate',
        severity: 'critical',
        description: `${failedUnits.length} units failed to execute`,
        impact: 'Incomplete results and potential data inconsistency',
        recommendation: 'Investigate root causes and improve error handling'
      });
    }

    return gaps.length > 0 ? gaps : [{
      type: 'none',
      severity: 'info',
      description: 'No significant gaps detected',
      impact: 'Execution met quality targets',
      recommendation: 'Continue current approach'
    }];
  }

  /**
   * Generate recommendations
   * @param {Object} plan - Original plan
   * @param {Object} results - Execution results
   * @returns {Array} Recommendations
   */
  _generateRecommendations(plan, results) {
    const recommendations = [];

    const utilization = this._calculateUtilization(plan, results);

    // Recommendation 1: Parallelization
    if (!utilization.meets_targets.parallelization_ratio && utilization.total_units >= 2) {
      recommendations.push({
        priority: 'high',
        category: 'parallelization',
        title: 'Increase parallelization',
        description: `Current ratio: ${utilization.parallelization_ratio_percent.toFixed(1)}%, target: ≥60%`,
        actions: [
          'Re-analyze task decomposition to identify more independent units',
          'Check for false dependencies in dependency detection',
          'Consider breaking large units into smaller parallelizable chunks'
        ]
      });
    }

    // Recommendation 2: Execution time
    if (results.total_duration_ms > 30000) { // > 30s
      recommendations.push({
        priority: 'medium',
        category: 'performance',
        title: 'Optimize execution time',
        description: `Total duration: ${(results.total_duration_ms / 1000).toFixed(1)}s`,
        actions: [
          'Profile slow agents to identify bottlenecks',
          'Consider caching for repeated operations',
          'Review timeout settings (may be too conservative)'
        ]
      });
    }

    // Recommendation 3: Failure handling
    const failedUnits = results.groups.flatMap(g => g.units).filter(u => !u.success);

    if (failedUnits.length > 0) {
      recommendations.push({
        priority: 'critical',
        category: 'reliability',
        title: 'Improve failure handling',
        description: `${failedUnits.length} units failed`,
        actions: [
          'Review error messages for common failure patterns',
          'Add more fallback agents for high-risk operations',
          'Implement retry with exponential backoff',
          'Consider circuit breaker adjustment'
        ]
      });
    }

    // Recommendation 4: Agent selection
    const agentMismatches = results.groups.flatMap(group =>
      group.units.filter(unit => {
        const planned = plan.PLAN.parallel_groups
          .flatMap(g => g.units)
          .find(u => u.unit_id === unit.unit_id);

        return planned && unit.agent_used !== planned.agent_or_tool && unit.attempts > 1;
      })
    );

    if (agentMismatches.length > 0) {
      recommendations.push({
        priority: 'low',
        category: 'agent_selection',
        title: 'Review agent matching',
        description: `${agentMismatches.length} units required fallbacks`,
        actions: [
          'Improve capability matching algorithm',
          'Update agent INVENTORY with more accurate strengths/weaknesses',
          'Consider training data for better agent selection'
        ]
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'info',
        category: 'success',
        title: 'Execution met all quality targets',
        description: 'No issues detected',
        actions: ['Continue monitoring for future improvements']
      });
    }

    return recommendations;
  }

  /**
   * Determine next actions
   * @param {Object} plan - Original plan
   * @param {Object} results - Execution results
   * @returns {Array} Next actions
   */
  _determineNextActions(plan, results) {
    if (results.success) {
      return ['proceed', 'log_success', 'update_metrics'];
    }

    if (results.circuit_breaker_triggered) {
      return ['stop', 'investigate_failures', 're-plan'];
    }

    const failedCount = results.groups.flatMap(g => g.units).filter(u => !u.success).length;

    if (failedCount > 0) {
      return ['retry_failed_units', 'review_errors', 'adjust_plan'];
    }

    return ['proceed'];
  }

  /**
   * Format report as human-readable text
   * @param {Object} audit - Audit report
   * @returns {string} Formatted report
   */
  formatReport(audit) {
    const lines = [];

    lines.push('═'.repeat(60));
    lines.push('AUDIT REPORT');
    lines.push('═'.repeat(60));

    lines.push(`\nTimestamp: ${audit.timestamp}`);
    lines.push(`Duration: ${audit.duration_ms}ms`);
    lines.push(`Success: ${audit.success ? '✓' : '✗'}`);

    lines.push('\nPlan vs Actual:');
    audit.plan_vs_actual.forEach(entry => {
      const status = entry.success ? '✓' : '✗';
      const agentMatch = entry.as_planned ? '' : ` (used ${entry.actual_agent})`;
      lines.push(`  ${status} ${entry.unit_id}: ${entry.latency_ms}ms${agentMatch}`);
    });

    lines.push('\nUtilization Scores:');
    lines.push(`  Sub-agent Utilization: ${audit.utilization_scores.subagent_utilization_percent.toFixed(1)}% (target: ≥70%)`);
    lines.push(`  Parallelization Ratio: ${audit.utilization_scores.parallelization_ratio_percent.toFixed(1)}% (target: ≥60%)`);

    if (audit.gaps && audit.gaps.length > 0) {
      lines.push('\nGaps Detected:');
      audit.gaps.forEach(gap => {
        lines.push(`  [${gap.severity.toUpperCase()}] ${gap.description}`);
        lines.push(`    Impact: ${gap.impact}`);
        lines.push(`    Recommendation: ${gap.recommendation}`);
      });
    }

    if (audit.recommendations && audit.recommendations.length > 0) {
      lines.push('\nRecommendations:');
      audit.recommendations.forEach((rec, i) => {
        lines.push(`\n  ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
        lines.push(`     ${rec.description}`);
        if (rec.actions && rec.actions.length > 0) {
          lines.push('     Actions:');
          rec.actions.forEach(action => {
            lines.push(`       - ${action}`);
          });
        }
      });
    }

    lines.push('\nNext Actions:');
    audit.next_actions.forEach(action => {
      lines.push(`  - ${action}`);
    });

    lines.push('\n' + '═'.repeat(60));

    return lines.join('\n');
  }
}

module.exports = AuditReporter;
