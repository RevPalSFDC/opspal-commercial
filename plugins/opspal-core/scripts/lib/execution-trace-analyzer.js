#!/usr/bin/env node

/**
 * Execution Trace Analyzer
 *
 * Analyzes execution traces to identify patterns, policy drift, and
 * user override signals that indicate policy updates may be needed.
 *
 * Part of the Runbook Policy Infrastructure (Phase 4).
 *
 * Features:
 * - Query traces by various filters
 * - Analyze user override patterns (signals for policy updates)
 * - Detect policy drift over time
 * - Generate compliance reports
 * - Identify recurring errors
 *
 * Usage:
 *   const ExecutionTraceAnalyzer = require('./execution-trace-analyzer');
 *   const analyzer = new ExecutionTraceAnalyzer('my-org');
 *
 *   // Query traces
 *   const traces = await analyzer.query({ operation_type: 'data_export', days: 30 });
 *
 *   // Analyze overrides
 *   const overrides = await analyzer.analyzeOverrides({ days: 30, threshold: 3 });
 *
 *   // Detect drift
 *   const drift = await analyzer.detectDrift({ months: 3 });
 *
 * @module execution-trace-analyzer
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONSTANTS
// ============================================================================

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');

// ============================================================================
// EXECUTION TRACE ANALYZER CLASS
// ============================================================================

class ExecutionTraceAnalyzer {
  /**
   * Create an ExecutionTraceAnalyzer
   * @param {string} org - Salesforce org alias
   * @param {Object} options - Configuration options
   */
  constructor(org, options = {}) {
    this.org = org;
    this.verbose = options.verbose || false;
    this.pluginRoot = options.pluginRoot || PLUGIN_ROOT;

    // Determine trace storage path
    this.tracePath = this._resolveTracePath(org);
  }

  // ============================================================================
  // PUBLIC METHODS - Querying
  // ============================================================================

  /**
   * Query traces with filters
   * @param {Object} filters - Query filters
   * @returns {Array} Matching traces
   */
  async query(filters = {}) {
    const traces = await this._loadTraces(filters.days || 30);

    return traces.filter(trace => {
      // Filter by operation type
      if (filters.operation_type && trace.operation_type !== filters.operation_type) {
        return false;
      }

      // Filter by agent
      if (filters.agent_id && trace.agent_id !== filters.agent_id) {
        return false;
      }

      // Filter by object
      if (filters.object && trace.object !== filters.object) {
        return false;
      }

      // Filter by outcome
      if (filters.outcome && trace.operation_outcome !== filters.outcome) {
        return false;
      }

      // Filter by field (in excluded or selected)
      if (filters.field) {
        const hasField =
          trace.field_decisions?.fields_auto_selected?.some(f => f.field === filters.field) ||
          trace.field_decisions?.fields_excluded?.some(f => f.field === filters.field) ||
          trace.field_decisions?.user_overrides?.some(f => f.field === filters.field);
        if (!hasField) return false;
      }

      // Filter by action (excluded, included, overridden)
      if (filters.action === 'excluded') {
        const hasExcluded = trace.field_decisions?.fields_excluded?.some(f =>
          !filters.field || f.field === filters.field
        );
        if (!hasExcluded) return false;
      }

      if (filters.action === 'overridden') {
        const hasOverride = trace.field_decisions?.user_overrides?.length > 0;
        if (!hasOverride) return false;
      }

      // Filter by error presence
      if (filters.has_errors === true && (!trace.errors || trace.errors.length === 0)) {
        return false;
      }
      if (filters.has_errors === false && trace.errors && trace.errors.length > 0) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get a specific trace by ID
   * @param {string} traceId - Trace identifier
   * @returns {Object|null} Trace or null
   */
  async getTrace(traceId) {
    const traces = await this._loadTraces(90); // Search last 90 days
    return traces.find(t => t.trace_id === traceId) || null;
  }

  /**
   * Debug a specific trace
   * @param {string} traceId - Trace identifier
   * @returns {Object} Detailed debug information
   */
  async debugTrace(traceId) {
    const trace = await this.getTrace(traceId);
    if (!trace) {
      return { error: `Trace not found: ${traceId}` };
    }

    return {
      trace_id: trace.trace_id,
      summary: {
        agent: trace.agent_id,
        operation: trace.operation_type,
        outcome: trace.operation_outcome,
        duration_ms: trace.duration_ms,
        timestamp: trace.timestamp
      },
      field_selection: {
        fields_selected: trace.field_decisions?.fields_auto_selected?.length || 0,
        fields_excluded: trace.field_decisions?.fields_excluded?.length || 0,
        user_overrides: trace.field_decisions?.user_overrides?.length || 0,
        selection_ratio: trace.field_decisions?.selection_ratio || 0
      },
      policy_used: {
        field_policy_version: trace.policy_application?.field_policy_version,
        task_variant: trace.policy_application?.task_variant_used,
        compliance_rules: trace.policy_application?.compliance_rules_applied || []
      },
      data_metrics: trace.data_metrics,
      errors: trace.errors || [],
      warnings: trace.warnings || [],
      workflow_summary: {
        total_steps: trace.workflow_execution?.total_steps || 0,
        successful: trace.workflow_execution?.successful_steps || 0,
        failed: trace.workflow_execution?.failed_steps || 0
      }
    };
  }

  // ============================================================================
  // PUBLIC METHODS - Analysis
  // ============================================================================

  /**
   * Analyze user override patterns
   * @param {Object} options - Analysis options
   * @returns {Object} Override analysis results
   */
  async analyzeOverrides(options = {}) {
    const days = options.days || 30;
    const threshold = options.threshold || 3;

    const traces = await this._loadTraces(days);

    // Collect all overrides
    const overrideMap = new Map();

    for (const trace of traces) {
      const overrides = trace.field_decisions?.user_overrides || [];

      for (const override of overrides) {
        const key = `${trace.object}:${override.field}:${override.action}`;

        if (!overrideMap.has(key)) {
          overrideMap.set(key, {
            object: trace.object,
            field: override.field,
            action: override.action,
            count: 0,
            agents: new Set(),
            justifications: [],
            first_seen: trace.timestamp,
            last_seen: trace.timestamp
          });
        }

        const entry = overrideMap.get(key);
        entry.count++;
        entry.agents.add(trace.agent_id);
        entry.last_seen = trace.timestamp;

        if (override.user_justification) {
          entry.justifications.push(override.user_justification);
        }
      }
    }

    // Filter by threshold and format results
    const frequentOverrides = [];
    for (const [key, entry] of overrideMap.entries()) {
      if (entry.count >= threshold) {
        frequentOverrides.push({
          object: entry.object,
          field: entry.field,
          action: entry.action,
          count: entry.count,
          agents: [...entry.agents],
          unique_justifications: [...new Set(entry.justifications)].slice(0, 5),
          first_seen: entry.first_seen,
          last_seen: entry.last_seen,
          recommendation: entry.action === 'include'
            ? `Consider adding ${entry.field} to default fields for ${entry.object}`
            : `Consider adding ${entry.field} to exclusions for ${entry.object}`
        });
      }
    }

    // Sort by count descending
    frequentOverrides.sort((a, b) => b.count - a.count);

    return {
      analysis_period: `${days} days`,
      threshold,
      total_overrides_analyzed: traces.reduce(
        (sum, t) => sum + (t.field_decisions?.user_overrides?.length || 0), 0
      ),
      frequent_overrides: frequentOverrides,
      policy_update_signals: frequentOverrides.length,
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Detect policy drift over time
   * @param {Object} options - Analysis options
   * @returns {Object} Drift analysis results
   */
  async detectDrift(options = {}) {
    const months = options.months || 3;
    const days = months * 30;

    const traces = await this._loadTraces(days);

    // Group by month
    const monthlyStats = new Map();

    for (const trace of traces) {
      const month = trace.timestamp.substring(0, 7); // YYYY-MM

      if (!monthlyStats.has(month)) {
        monthlyStats.set(month, {
          month,
          total_operations: 0,
          success_count: 0,
          failure_count: 0,
          override_count: 0,
          avg_fields_selected: 0,
          total_fields: 0,
          excluded_field_reasons: {},
          compliance_violations: 0
        });
      }

      const stats = monthlyStats.get(month);
      stats.total_operations++;

      if (trace.operation_outcome === 'success') {
        stats.success_count++;
      } else if (trace.operation_outcome === 'failure') {
        stats.failure_count++;
      }

      stats.override_count += trace.field_decisions?.user_overrides?.length || 0;
      stats.total_fields += trace.field_decisions?.total_fields_selected || 0;

      // Track exclusion reasons
      for (const excl of (trace.field_decisions?.fields_excluded || [])) {
        const reason = excl.reason || 'unknown';
        stats.excluded_field_reasons[reason] = (stats.excluded_field_reasons[reason] || 0) + 1;
      }

      // Count compliance violations (operations with compliance rules that failed)
      if (trace.policy_application?.compliance_rules_applied?.length > 0 &&
          trace.operation_outcome === 'failure') {
        stats.compliance_violations++;
      }
    }

    // Calculate averages and detect drift
    const monthlyData = [];
    for (const [month, stats] of monthlyStats.entries()) {
      stats.avg_fields_selected = stats.total_operations > 0
        ? Math.round(stats.total_fields / stats.total_operations)
        : 0;
      stats.success_rate = stats.total_operations > 0
        ? (stats.success_count / stats.total_operations * 100).toFixed(1)
        : 0;
      stats.override_rate = stats.total_operations > 0
        ? (stats.override_count / stats.total_operations * 100).toFixed(1)
        : 0;

      monthlyData.push(stats);
    }

    // Sort by month
    monthlyData.sort((a, b) => a.month.localeCompare(b.month));

    // Detect drift (significant changes between months)
    const driftIndicators = [];
    for (let i = 1; i < monthlyData.length; i++) {
      const prev = monthlyData[i - 1];
      const curr = monthlyData[i];

      // Check for significant override rate increase
      if (parseFloat(curr.override_rate) - parseFloat(prev.override_rate) > 10) {
        driftIndicators.push({
          type: 'override_rate_increase',
          from_month: prev.month,
          to_month: curr.month,
          change: `${prev.override_rate}% → ${curr.override_rate}%`,
          severity: 'warning'
        });
      }

      // Check for success rate decrease
      if (parseFloat(prev.success_rate) - parseFloat(curr.success_rate) > 5) {
        driftIndicators.push({
          type: 'success_rate_decrease',
          from_month: prev.month,
          to_month: curr.month,
          change: `${prev.success_rate}% → ${curr.success_rate}%`,
          severity: 'warning'
        });
      }

      // Check for significant field count change
      if (Math.abs(curr.avg_fields_selected - prev.avg_fields_selected) > 10) {
        driftIndicators.push({
          type: 'field_count_change',
          from_month: prev.month,
          to_month: curr.month,
          change: `${prev.avg_fields_selected} → ${curr.avg_fields_selected} fields`,
          severity: 'info'
        });
      }
    }

    return {
      analysis_period: `${months} months`,
      monthly_statistics: monthlyData,
      drift_indicators: driftIndicators,
      drift_detected: driftIndicators.length > 0,
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Generate compliance report
   * @param {Object} options - Report options
   * @returns {Object} Compliance report
   */
  async generateComplianceReport(options = {}) {
    const days = options.days || 30;
    const traces = await this._loadTraces(days);

    // Analyze compliance-related traces
    const complianceStats = {
      total_operations: traces.length,
      operations_with_compliance_rules: 0,
      compliance_rules_frequency: {},
      pii_field_exclusions: 0,
      sensitive_field_exclusions: [],
      operations_by_risk_level: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      }
    };

    for (const trace of traces) {
      const rules = trace.policy_application?.compliance_rules_applied || [];
      if (rules.length > 0) {
        complianceStats.operations_with_compliance_rules++;

        for (const rule of rules) {
          complianceStats.compliance_rules_frequency[rule] =
            (complianceStats.compliance_rules_frequency[rule] || 0) + 1;
        }
      }

      // Count PII exclusions
      for (const excl of (trace.field_decisions?.fields_excluded || [])) {
        if (excl.reason === 'classification_exclusion') {
          complianceStats.pii_field_exclusions++;
          complianceStats.sensitive_field_exclusions.push({
            field: excl.field,
            rule: excl.rule_reference,
            object: trace.object
          });
        }
      }

      // Count by risk level
      const riskLevel = trace.policy_application?.risk_level || 'low';
      complianceStats.operations_by_risk_level[riskLevel]++;
    }

    // Dedupe sensitive field exclusions
    const uniqueExclusions = new Map();
    for (const excl of complianceStats.sensitive_field_exclusions) {
      const key = `${excl.object}:${excl.field}`;
      if (!uniqueExclusions.has(key)) {
        uniqueExclusions.set(key, excl);
      }
    }
    complianceStats.sensitive_field_exclusions = [...uniqueExclusions.values()];

    return {
      report_period: `${days} days`,
      generated_at: new Date().toISOString(),
      org: this.org,
      statistics: complianceStats,
      compliance_coverage: complianceStats.total_operations > 0
        ? ((complianceStats.operations_with_compliance_rules / complianceStats.total_operations) * 100).toFixed(1) + '%'
        : '0%',
      recommendations: this._generateComplianceRecommendations(complianceStats)
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  _resolveTracePath(org) {
    const orgSlug = process.env.ORG_SLUG || '';
    const basePaths = [
      path.join(this.pluginRoot, '..', '..', 'orgs', orgSlug, 'platforms', 'salesforce', org, 'traces'),
      path.join(this.pluginRoot, '..', '..', 'orgs', org, 'platforms', 'salesforce', org, 'traces'),
      path.join(this.pluginRoot, '..', 'opspal-salesforce', 'instances', 'salesforce', org, 'traces'),
      path.join(this.pluginRoot, '..', 'opspal-salesforce', 'instances', org, 'traces')
    ];

    for (const p of basePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return basePaths[basePaths.length - 1];
  }

  async _loadTraces(days) {
    const traces = [];
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    if (!fs.existsSync(this.tracePath)) {
      return traces;
    }

    const files = fs.readdirSync(this.tracePath)
      .filter(f => f.startsWith('execution-trace-') && f.endsWith('.jsonl'))
      .sort()
      .reverse();

    for (const file of files) {
      // Check if file is within date range
      const dateMatch = file.match(/execution-trace-(\d{4}-\d{2}-\d{2})\.jsonl/);
      if (dateMatch) {
        const fileDate = new Date(dateMatch[1]);
        if (fileDate < cutoffDate) {
          continue;
        }
      }

      try {
        const content = fs.readFileSync(path.join(this.tracePath, file), 'utf-8');
        for (const line of content.split('\n').filter(l => l.trim())) {
          try {
            const trace = JSON.parse(line);

            // Filter by date
            const traceDate = new Date(trace.timestamp);
            if (traceDate >= cutoffDate) {
              traces.push(trace);
            }
          } catch (e) {
            // Skip malformed lines
          }
        }
      } catch (e) {
        if (this.verbose) {
          console.warn(`Failed to read trace file ${file}: ${e.message}`);
        }
      }
    }

    return traces;
  }

  _generateComplianceRecommendations(stats) {
    const recommendations = [];

    // Check compliance coverage
    const coverage = stats.total_operations > 0
      ? stats.operations_with_compliance_rules / stats.total_operations
      : 0;

    if (coverage < 0.5) {
      recommendations.push({
        priority: 'high',
        recommendation: 'Increase compliance rule coverage',
        reason: `Only ${(coverage * 100).toFixed(0)}% of operations have compliance rules applied`
      });
    }

    // Check high-risk operations
    const highRiskRatio = stats.total_operations > 0
      ? (stats.operations_by_risk_level.high + stats.operations_by_risk_level.critical) / stats.total_operations
      : 0;

    if (highRiskRatio > 0.2) {
      recommendations.push({
        priority: 'medium',
        recommendation: 'Review high-risk operations',
        reason: `${(highRiskRatio * 100).toFixed(0)}% of operations are high or critical risk`
      });
    }

    // Check PII protection
    if (stats.pii_field_exclusions === 0 && stats.total_operations > 10) {
      recommendations.push({
        priority: 'high',
        recommendation: 'Verify PII detection is enabled',
        reason: 'No PII field exclusions detected - may indicate disabled protection'
      });
    }

    return recommendations;
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
Execution Trace Analyzer - Analyze execution traces for patterns and drift

Usage:
  node execution-trace-analyzer.js <command> [options]

Commands:
  query <org>                Query traces with filters
  debug <org> <trace_id>     Debug a specific trace
  overrides <org>            Analyze user override patterns
  drift <org>                Detect policy drift over time
  compliance <org>           Generate compliance report

Options:
  --days <n>                 Number of days to analyze (default: 30)
  --months <n>               Number of months for drift analysis (default: 3)
  --threshold <n>            Minimum count for override detection (default: 3)
  --field <name>             Filter by field name
  --action <type>            Filter by action (excluded, overridden)
  --verbose                  Enable verbose output
  --json                     Output as JSON

Examples:
  node execution-trace-analyzer.js query my-sandbox --days 7 --action overridden
  node execution-trace-analyzer.js overrides my-sandbox --threshold 3
  node execution-trace-analyzer.js drift my-sandbox --months 6
  node execution-trace-analyzer.js compliance my-sandbox
    `);
  };

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  const verbose = args.includes('--verbose');
  const jsonOutput = args.includes('--json');

  // Parse options
  const getOption = (name, defaultVal) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
  };

  try {
    switch (command) {
      case 'query': {
        const org = args[1];
        if (!org) {
          console.error('❌ Missing org argument');
          process.exit(1);
        }

        const analyzer = new ExecutionTraceAnalyzer(org, { verbose });
        const traces = await analyzer.query({
          days: parseInt(getOption('days', '30'), 10),
          field: getOption('field', null),
          action: getOption('action', null),
          operation_type: getOption('operation', null)
        });

        if (jsonOutput) {
          console.log(JSON.stringify(traces, null, 2));
        } else {
          console.log(`\n📋 Found ${traces.length} traces\n`);
          for (const trace of traces.slice(0, 20)) {
            console.log(`  ${trace.trace_id.substring(0, 20)}... ${trace.operation_type.padEnd(15)} ${trace.operation_outcome.padEnd(10)} ${trace.timestamp}`);
          }
          if (traces.length > 20) {
            console.log(`\n  ... and ${traces.length - 20} more`);
          }
        }
        break;
      }

      case 'debug': {
        const org = args[1];
        const traceId = args[2];

        if (!org || !traceId) {
          console.error('❌ Missing org or trace_id argument');
          process.exit(1);
        }

        const analyzer = new ExecutionTraceAnalyzer(org, { verbose });
        const debug = await analyzer.debugTrace(traceId);

        console.log(JSON.stringify(debug, null, 2));
        break;
      }

      case 'overrides': {
        const org = args[1];
        if (!org) {
          console.error('❌ Missing org argument');
          process.exit(1);
        }

        const analyzer = new ExecutionTraceAnalyzer(org, { verbose });
        const result = await analyzer.analyzeOverrides({
          days: parseInt(getOption('days', '30'), 10),
          threshold: parseInt(getOption('threshold', '3'), 10)
        });

        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\n📊 Override Analysis (${result.analysis_period})\n`);
          console.log(`Total overrides analyzed: ${result.total_overrides_analyzed}`);
          console.log(`Policy update signals: ${result.policy_update_signals}\n`);

          if (result.frequent_overrides.length > 0) {
            console.log('Frequent Overrides (potential policy updates):\n');
            for (const override of result.frequent_overrides) {
              console.log(`  ${override.object}.${override.field} (${override.action})`);
              console.log(`    Count: ${override.count}, Agents: ${override.agents.join(', ')}`);
              console.log(`    Recommendation: ${override.recommendation}\n`);
            }
          } else {
            console.log('No frequent overrides detected.\n');
          }
        }
        break;
      }

      case 'drift': {
        const org = args[1];
        if (!org) {
          console.error('❌ Missing org argument');
          process.exit(1);
        }

        const analyzer = new ExecutionTraceAnalyzer(org, { verbose });
        const result = await analyzer.detectDrift({
          months: parseInt(getOption('months', '3'), 10)
        });

        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\n📈 Drift Analysis (${result.analysis_period})\n`);

          if (result.monthly_statistics.length > 0) {
            console.log('Monthly Statistics:\n');
            console.log('Month      | Operations | Success | Override | Avg Fields');
            console.log('-----------|------------|---------|----------|----------');
            for (const month of result.monthly_statistics) {
              console.log(`${month.month.padEnd(10)} | ${String(month.total_operations).padEnd(10)} | ${month.success_rate.padEnd(7)}% | ${month.override_rate.padEnd(8)}% | ${month.avg_fields_selected}`);
            }
          }

          if (result.drift_indicators.length > 0) {
            console.log('\n⚠️  Drift Indicators:\n');
            for (const indicator of result.drift_indicators) {
              console.log(`  [${indicator.severity}] ${indicator.type}: ${indicator.change} (${indicator.from_month} → ${indicator.to_month})`);
            }
          } else {
            console.log('\n✅ No significant drift detected.\n');
          }
        }
        break;
      }

      case 'compliance': {
        const org = args[1];
        if (!org) {
          console.error('❌ Missing org argument');
          process.exit(1);
        }

        const analyzer = new ExecutionTraceAnalyzer(org, { verbose });
        const report = await analyzer.generateComplianceReport({
          days: parseInt(getOption('days', '30'), 10)
        });

        if (jsonOutput) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(`\n📋 Compliance Report (${report.report_period})\n`);
          console.log(`Org: ${report.org}`);
          console.log(`Compliance Coverage: ${report.compliance_coverage}\n`);

          const stats = report.statistics;
          console.log('Statistics:');
          console.log(`  Total Operations: ${stats.total_operations}`);
          console.log(`  With Compliance Rules: ${stats.operations_with_compliance_rules}`);
          console.log(`  PII Exclusions: ${stats.pii_field_exclusions}`);
          console.log(`  Risk Levels: Low=${stats.operations_by_risk_level.low}, Med=${stats.operations_by_risk_level.medium}, High=${stats.operations_by_risk_level.high}, Critical=${stats.operations_by_risk_level.critical}`);

          if (report.recommendations.length > 0) {
            console.log('\nRecommendations:');
            for (const rec of report.recommendations) {
              console.log(`  [${rec.priority}] ${rec.recommendation}`);
              console.log(`    Reason: ${rec.reason}`);
            }
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

module.exports = ExecutionTraceAnalyzer;

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  });
}
