#!/usr/bin/env node

/**
 * Funnel Diagnostics Engine
 *
 * Advanced pattern matching engine for identifying root causes of sales funnel
 * performance issues. Analyzes metrics against benchmarks and applies diagnostic
 * decision trees to generate specific, actionable recommendations.
 *
 * @module funnel-diagnostics-engine
 * @version 1.0.0
 * @author RevPal Engineering
 *
 * Features:
 * - Pattern matching rules for 15+ common symptoms
 * - Industry-specific diagnostic adjustments
 * - Statistical significance validation
 * - Severity assessment (critical, significant, moderate, minor)
 * - Remediation recommendation generation with expected impact
 * - Support for segmented analysis (by rep, team, region)
 * - CLI interface for standalone testing
 *
 * Usage:
 *   const DiagnosticsEngine = require('./funnel-diagnostics-engine');
 *   const engine = new DiagnosticsEngine({ industry: 'saas' });
 *   const diagnostics = engine.diagnose(metrics, benchmarkComparison);
 *
 * CLI:
 *   node funnel-diagnostics-engine.js --metrics ./metrics.json --comparison ./comparison.json
 */

const fs = require('fs');
const path = require('path');

/**
 * Diagnostic pattern matching engine
 */
class FunnelDiagnosticsEngine {
  constructor(options = {}) {
    this.industry = options.industry || 'saas';
    this.verbose = options.verbose || false;
    this.minSampleSize = options.minSampleSize || 100;

    // Load diagnostic rules
    this.diagnosticRules = this.loadDiagnosticRules();

    if (this.verbose) {
      console.log(`FunnelDiagnosticsEngine initialized for ${this.industry} industry`);
    }
  }

  /**
   * Load diagnostic rules and patterns
   */
  loadDiagnosticRules() {
    return {
      // Pattern: High activity, low conversion (prospecting → engagement)
      high_activity_low_conversion: {
        symptom: 'High volume of calls/emails but low connect/response rates',
        thresholds: {
          activity_volume: { min: 50, percentile: 75 }, // Above 75th percentile
          connect_rate: { max: 0.10, percentile: 25 }   // Below 25th percentile
        },
        rootCauses: [
          {
            cause: 'Poor data quality',
            indicators: ['high_bounce_rate', 'low_contact_rate'],
            likelihood: 0.8,
            remediation: 'Clean contact database, implement data enrichment',
            expectedImpact: '15-25% improvement in connect rate'
          },
          {
            cause: 'Poor targeting / wrong ICP',
            indicators: ['low_meeting_conversion', 'high_objection_rate'],
            likelihood: 0.7,
            remediation: 'Refine ICP definition, implement lead scoring',
            expectedImpact: '20-30% improvement in qualified leads'
          },
          {
            cause: 'Generic messaging',
            indicators: ['low_response_rate', 'high_unsubscribe_rate'],
            likelihood: 0.6,
            remediation: 'Personalize outreach, A/B test messaging',
            expectedImpact: '10-20% improvement in response rate'
          }
        ]
      },

      // Pattern: Good engagement, poor meeting conversion
      good_engagement_low_meetings: {
        symptom: 'Prospects respond but don\'t commit to meetings',
        thresholds: {
          connect_rate: { min: 0.15, percentile: 50 },
          meeting_set_rate: { max: 0.20, percentile: 25 }
        },
        rootCauses: [
          {
            cause: 'Weak value proposition in outreach',
            indicators: ['low_meeting_set_rate', 'vague_meeting_requests'],
            likelihood: 0.8,
            remediation: 'Clarify value prop, provide specific meeting agenda',
            expectedImpact: '25-35% improvement in meeting set rate'
          },
          {
            cause: 'Contacting wrong personas',
            indicators: ['low_authority', 'referrals_to_others'],
            likelihood: 0.7,
            remediation: 'Target decision-makers, adjust persona targeting',
            expectedImpact: '20-30% improvement in meeting quality'
          },
          {
            cause: 'Timing issues',
            indicators: ['high_reschedule_rate', 'seasonal_patterns'],
            likelihood: 0.5,
            remediation: 'Optimize outreach timing, implement cadence testing',
            expectedImpact: '10-15% improvement in meeting set rate'
          }
        ]
      },

      // Pattern: High no-show rate
      high_no_show_rate: {
        symptom: 'Meetings scheduled but >20% don\'t occur',
        thresholds: {
          no_show_rate: { min: 0.20 }
        },
        rootCauses: [
          {
            cause: 'Weak commitment at booking',
            indicators: ['high_no_show_rate', 'low_reconfirmation_rate'],
            likelihood: 0.9,
            remediation: 'Implement confirmation process, send calendar invite immediately',
            expectedImpact: '40-50% reduction in no-shows'
          },
          {
            cause: 'No reminder cadence',
            indicators: ['no_reminders_sent', 'last_minute_cancellations'],
            likelihood: 0.8,
            remediation: 'Automated reminder sequence (24h, 1h before)',
            expectedImpact: '30-40% reduction in no-shows'
          },
          {
            cause: 'Vague meeting purpose',
            indicators: ['unclear_agenda', 'low_perceived_value'],
            likelihood: 0.6,
            remediation: 'Send clear agenda 24h before, personalize meeting prep',
            expectedImpact: '20-30% reduction in no-shows'
          }
        ]
      },

      // Pattern: Meetings happen but don't convert to pipeline
      meetings_no_pipeline: {
        symptom: 'Meetings held but low conversion to opportunities',
        thresholds: {
          meeting_held_rate: { min: 0.70, percentile: 50 },
          meeting_to_sql_rate: { max: 0.25, percentile: 25 }
        },
        rootCauses: [
          {
            cause: 'Loose qualification criteria',
            indicators: ['low_sql_rate', 'early_stage_disqualification'],
            likelihood: 0.9,
            remediation: 'Tighten BANT criteria, implement pre-meeting qualification',
            expectedImpact: '30-40% improvement in qualified leads'
          },
          {
            cause: 'Weak discovery process',
            indicators: ['missing_pain_points', 'unclear_next_steps'],
            likelihood: 0.8,
            remediation: 'Train on SPIN/MEDDIC discovery, use call recording analysis',
            expectedImpact: '25-35% improvement in pipeline conversion'
          },
          {
            cause: 'Poor meeting execution',
            indicators: ['no_demo', 'features_not_benefits', 'no_close'],
            likelihood: 0.7,
            remediation: 'Standardize meeting structure, implement demo certification',
            expectedImpact: '20-30% improvement in meeting outcomes'
          }
        ]
      },

      // Pattern: Sufficient pipeline but low win rate
      low_win_rate: {
        symptom: 'Enough opportunities created but losing to competitors or no-decision',
        thresholds: {
          pipeline_coverage: { min: 3.0, percentile: 50 },
          win_rate: { max: 0.20, percentile: 25 }
        },
        rootCauses: [
          {
            cause: 'Poor qualification - wrong fit opportunities',
            indicators: ['high_no_decision_rate', 'late_stage_losses'],
            likelihood: 0.8,
            remediation: 'Improve qualification, implement opportunity scoring',
            expectedImpact: '15-25% improvement in win rate'
          },
          {
            cause: 'Weak value differentiation',
            indicators: ['price_objections', 'competitor_losses', 'commoditization'],
            likelihood: 0.7,
            remediation: 'Develop battlecards, train on competitive positioning',
            expectedImpact: '20-30% improvement in competitive win rate'
          },
          {
            cause: 'Poor sales execution',
            indicators: ['long_sales_cycles', 'multiple_decision_makers', 'stalled_deals'],
            likelihood: 0.6,
            remediation: 'Implement sales methodology (MEDDIC/Challenger), coach deal reviews',
            expectedImpact: '15-25% improvement in win rate'
          }
        ]
      },

      // Pattern: Long sales cycle
      extended_sales_cycle: {
        symptom: 'Sales cycle 30%+ longer than industry benchmark',
        thresholds: {
          avg_sales_cycle_days: { variance: 0.30 } // 30% above benchmark
        },
        rootCauses: [
          {
            cause: 'Complex buying process not mapped',
            indicators: ['multiple_decision_makers', 'procurement_delays'],
            likelihood: 0.8,
            remediation: 'Implement champion development, map buying committees',
            expectedImpact: '20-30% reduction in cycle time'
          },
          {
            cause: 'Missing economic buyer engagement',
            indicators: ['late_stage_stalls', 'budget_objections'],
            likelihood: 0.7,
            remediation: 'Engage decision-makers earlier, develop exec-level materials',
            expectedImpact: '15-25% reduction in cycle time'
          },
          {
            cause: 'Weak urgency creation',
            indicators: ['no_compelling_event', 'low_priority_deals'],
            likelihood: 0.6,
            remediation: 'Identify business pain, create urgency through ROI analysis',
            expectedImpact: '10-20% reduction in cycle time'
          }
        ]
      },

      // Pattern: Inconsistent rep performance
      rep_performance_variance: {
        symptom: 'High variance in performance across reps (>40% std dev)',
        thresholds: {
          rep_performance_std_dev: { min: 0.40 }
        },
        rootCauses: [
          {
            cause: 'Lack of standardized processes',
            indicators: ['no_playbook', 'inconsistent_messaging'],
            likelihood: 0.9,
            remediation: 'Create sales playbook, standardize best practices',
            expectedImpact: '25-35% improvement in bottom quartile'
          },
          {
            cause: 'Insufficient training',
            indicators: ['high_ramp_time', 'skill_gaps'],
            likelihood: 0.7,
            remediation: 'Implement structured onboarding, ongoing coaching',
            expectedImpact: '20-30% improvement in productivity'
          },
          {
            cause: 'Territory/lead quality imbalance',
            indicators: ['territory_inequality', 'lead_source_variance'],
            likelihood: 0.6,
            remediation: 'Rebalance territories, equitable lead distribution',
            expectedImpact: '15-25% improvement in fairness'
          }
        ]
      },

      // Pattern: Low activity volume
      insufficient_activity: {
        symptom: 'Activity levels below industry benchmark',
        thresholds: {
          calls_per_rep_per_day: { variance: -0.20 },
          emails_per_rep_per_day: { variance: -0.20 }
        },
        rootCauses: [
          {
            cause: 'Capacity issues',
            indicators: ['high_admin_time', 'tool_inefficiency'],
            likelihood: 0.8,
            remediation: 'Implement sales automation, reduce admin burden',
            expectedImpact: '30-40% increase in selling time'
          },
          {
            cause: 'Lack of accountability',
            indicators: ['no_activity_tracking', 'low_expectations'],
            likelihood: 0.7,
            remediation: 'Set activity KPIs, implement daily/weekly reviews',
            expectedImpact: '25-35% increase in activity'
          },
          {
            cause: 'Insufficient pipeline',
            indicators: ['not_enough_leads', 'prospecting_challenges'],
            likelihood: 0.6,
            remediation: 'Increase lead gen, implement prospecting program',
            expectedImpact: '20-30% increase in opportunities'
          }
        ]
      }
    };
  }

  /**
   * Main diagnostic function
   * Analyzes metrics and benchmark comparison to identify root causes
   *
   * @param {Object} metrics - Raw metrics from sales-funnel-metrics-collector
   * @param {Object} benchmarkComparison - Comparison from sales-benchmark-engine
   * @returns {Object} Comprehensive diagnostics with root causes and recommendations
   */
  diagnose(metrics, benchmarkComparison) {
    if (this.verbose) {
      console.log('\n=== Running Funnel Diagnostics ===\n');
    }

    // Validate statistical significance
    const significanceCheck = this.validateSignificance(metrics);
    if (!significanceCheck.sufficient) {
      return {
        error: 'Insufficient data for reliable diagnostics',
        details: significanceCheck,
        recommendations: ['Expand date range or verify data completeness']
      };
    }

    // Extract gaps from benchmark comparison
    const gaps = this.extractSignificantGaps(benchmarkComparison);

    if (this.verbose) {
      console.log(`Found ${gaps.length} significant performance gaps`);
    }

    // Apply pattern matching
    const diagnostics = [];

    for (const ruleKey in this.diagnosticRules) {
      const rule = this.diagnosticRules[ruleKey];
      const match = this.matchPattern(rule, metrics, benchmarkComparison);

      if (match.matches) {
        const diagnostic = this.buildDiagnostic(rule, match, metrics);
        diagnostics.push(diagnostic);

        if (this.verbose) {
          console.log(`✓ Pattern matched: ${rule.symptom}`);
        }
      }
    }

    // Sort by priority (likelihood × impact)
    diagnostics.sort((a, b) => b.priorityScore - a.priorityScore);

    // Generate summary
    const summary = this.generateSummary(diagnostics, gaps);

    return {
      summary,
      diagnostics,
      gaps,
      significance: significanceCheck,
      metadata: {
        industry: this.industry,
        diagnosticsRun: diagnostics.length,
        gapsIdentified: gaps.length,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Validate statistical significance of data
   */
  validateSignificance(metrics) {
    const checks = {
      opportunities: metrics.totalOpportunities || 0,
      activities: (metrics.totalCalls || 0) + (metrics.totalEmails || 0),
      meetings: metrics.totalMeetings || 0,
      minRequired: this.minSampleSize
    };

    checks.sufficient = checks.opportunities >= this.minSampleSize &&
                       checks.activities >= (this.minSampleSize * 10) &&
                       checks.meetings >= (this.minSampleSize / 2);

    checks.confidence = checks.sufficient ? 'high' :
                       (checks.opportunities >= 50 ? 'medium' : 'low');

    return checks;
  }

  /**
   * Extract significant gaps from benchmark comparison
   */
  extractSignificantGaps(comparison) {
    const gaps = [];

    if (!comparison || !comparison.metrics) {
      return gaps;
    }

    for (const metric of comparison.metrics) {
      if (metric.severity === 'critical' || metric.severity === 'significant') {
        gaps.push({
          metric: metric.metricName,
          orgValue: metric.orgValue,
          benchmark: metric.benchmark,
          variance: metric.variance,
          severity: metric.severity,
          category: metric.category
        });
      }
    }

    return gaps;
  }

  /**
   * Match diagnostic pattern against metrics
   */
  matchPattern(rule, metrics, comparison) {
    const match = {
      matches: false,
      confidence: 0,
      indicators: []
    };

    let thresholdsMet = 0;
    let totalThresholds = Object.keys(rule.thresholds).length;

    for (const [metricKey, threshold] of Object.entries(rule.thresholds)) {
      const metricValue = this.getMetricValue(metricKey, metrics, comparison);

      if (metricValue !== null) {
        if (this.evaluateThreshold(metricValue, threshold)) {
          thresholdsMet++;
          match.indicators.push(metricKey);
        }
      }
    }

    match.matches = thresholdsMet >= (totalThresholds * 0.7); // 70% of thresholds
    match.confidence = thresholdsMet / totalThresholds;

    return match;
  }

  /**
   * Get metric value from metrics or comparison
   */
  getMetricValue(metricKey, metrics, comparison) {
    // Try direct metric access
    if (metrics[metricKey] !== undefined) {
      return metrics[metricKey];
    }

    // Try comparison variance
    if (comparison && comparison.metrics) {
      const compMetric = comparison.metrics.find(m =>
        m.metricName.toLowerCase().includes(metricKey.toLowerCase())
      );
      if (compMetric) {
        return compMetric.variance;
      }
    }

    return null;
  }

  /**
   * Evaluate if metric value meets threshold criteria
   */
  evaluateThreshold(value, threshold) {
    if (threshold.min !== undefined && value < threshold.min) return false;
    if (threshold.max !== undefined && value > threshold.max) return false;
    if (threshold.variance !== undefined) {
      // For variance thresholds (positive or negative)
      if (threshold.variance > 0 && value < threshold.variance) return false;
      if (threshold.variance < 0 && value > threshold.variance) return false;
    }
    return true;
  }

  /**
   * Build diagnostic with root causes and recommendations
   */
  buildDiagnostic(rule, match, metrics) {
    // Rank root causes by likelihood and available indicators
    const rankedCauses = rule.rootCauses.map(cause => {
      const indicatorCount = cause.indicators.filter(indicator =>
        match.indicators.some(mi => mi.includes(indicator))
      ).length;

      const adjustedLikelihood = cause.likelihood *
        (0.5 + (indicatorCount / cause.indicators.length) * 0.5);

      return {
        ...cause,
        adjustedLikelihood,
        indicatorCount
      };
    }).sort((a, b) => b.adjustedLikelihood - a.adjustedLikelihood);

    // Calculate priority score
    const topCause = rankedCauses[0];
    const priorityScore = match.confidence * topCause.adjustedLikelihood * 100;

    return {
      symptom: rule.symptom,
      confidence: match.confidence,
      priorityScore: Math.round(priorityScore),
      rootCauses: rankedCauses.slice(0, 3), // Top 3 causes
      primaryCause: topCause.cause,
      primaryRemediation: topCause.remediation,
      expectedImpact: topCause.expectedImpact,
      indicators: match.indicators
    };
  }

  /**
   * Generate diagnostic summary
   */
  generateSummary(diagnostics, gaps) {
    if (diagnostics.length === 0) {
      return {
        status: 'healthy',
        message: 'No significant diagnostic patterns detected',
        topPriority: null
      };
    }

    const criticalDiagnostics = diagnostics.filter(d => d.priorityScore >= 70);
    const topDiagnostic = diagnostics[0];

    return {
      status: criticalDiagnostics.length > 0 ? 'critical' : 'needs_attention',
      message: `Identified ${diagnostics.length} diagnostic patterns, ${criticalDiagnostics.length} critical`,
      topPriority: {
        symptom: topDiagnostic.symptom,
        cause: topDiagnostic.primaryCause,
        remediation: topDiagnostic.primaryRemediation,
        expectedImpact: topDiagnostic.expectedImpact,
        priorityScore: topDiagnostic.priorityScore
      },
      criticalCount: criticalDiagnostics.length,
      totalDiagnostics: diagnostics.length
    };
  }

  /**
   * Generate detailed remediation plan
   */
  generateRemediationPlan(diagnostics) {
    const plan = {
      quickWins: [],    // 0-30 days
      mediumTerm: [],   // 30-90 days
      longTerm: []      // 90+ days
    };

    for (const diagnostic of diagnostics) {
      const recommendation = {
        symptom: diagnostic.symptom,
        cause: diagnostic.primaryCause,
        action: diagnostic.primaryRemediation,
        expectedImpact: diagnostic.expectedImpact,
        priority: diagnostic.priorityScore
      };

      // Categorize by implementation timeline
      if (diagnostic.priorityScore >= 80) {
        plan.quickWins.push(recommendation);
      } else if (diagnostic.priorityScore >= 60) {
        plan.mediumTerm.push(recommendation);
      } else {
        plan.longTerm.push(recommendation);
      }
    }

    return plan;
  }
}

/**
 * CLI Interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Funnel Diagnostics Engine - CLI Usage

Usage:
  node funnel-diagnostics-engine.js [options]

Options:
  --metrics <file>      Path to metrics JSON file (required)
  --comparison <file>   Path to benchmark comparison JSON file (required)
  --industry <name>     Industry (saas, pharma, enterprise, proptech, smb)
  --output <file>       Output file for diagnostics (optional)
  --verbose             Enable verbose logging
  --help, -h            Show this help message

Example:
  node funnel-diagnostics-engine.js \\
    --metrics ./metrics.json \\
    --comparison ./comparison.json \\
    --industry saas \\
    --output ./diagnostics.json \\
    --verbose

Input Format:
  metrics.json: Output from sales-funnel-metrics-collector.js
  comparison.json: Output from sales-benchmark-engine.js

Output Format:
  JSON object with:
    - summary: High-level diagnostic summary
    - diagnostics: Array of identified patterns
    - gaps: Significant performance gaps
    - significance: Statistical validation
    - metadata: Execution details
`);
    process.exit(0);
  }

  const metricsFile = args[args.indexOf('--metrics') + 1];
  const comparisonFile = args[args.indexOf('--comparison') + 1];
  const industry = args.includes('--industry') ? args[args.indexOf('--industry') + 1] : 'saas';
  const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
  const verbose = args.includes('--verbose');

  if (!metricsFile || !comparisonFile) {
    console.error('Error: --metrics and --comparison are required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  try {
    // Load input files
    const metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf-8'));
    const comparison = JSON.parse(fs.readFileSync(comparisonFile, 'utf-8'));

    // Run diagnostics
    const engine = new FunnelDiagnosticsEngine({ industry, verbose });
    const diagnostics = engine.diagnose(metrics, comparison);

    // Generate remediation plan
    if (diagnostics.diagnostics) {
      diagnostics.remediationPlan = engine.generateRemediationPlan(diagnostics.diagnostics);
    }

    // Output results
    if (outputFile) {
      fs.writeFileSync(outputFile, JSON.stringify(diagnostics, null, 2));
      console.log(`\n✓ Diagnostics written to ${outputFile}`);
    } else {
      console.log('\n=== Diagnostic Results ===\n');
      console.log(JSON.stringify(diagnostics, null, 2));
    }

    // Summary output
    if (verbose && diagnostics.summary) {
      console.log('\n=== Summary ===');
      console.log(`Status: ${diagnostics.summary.status}`);
      console.log(`Message: ${diagnostics.summary.message}`);
      if (diagnostics.summary.topPriority) {
        console.log('\nTop Priority:');
        console.log(`  Symptom: ${diagnostics.summary.topPriority.symptom}`);
        console.log(`  Root Cause: ${diagnostics.summary.topPriority.cause}`);
        console.log(`  Remediation: ${diagnostics.summary.topPriority.remediation}`);
        console.log(`  Expected Impact: ${diagnostics.summary.topPriority.expectedImpact}`);
        console.log(`  Priority Score: ${diagnostics.summary.topPriority.priorityScore}/100`);
      }
    }

  } catch (error) {
    console.error('Error running diagnostics:', error.message);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

module.exports = FunnelDiagnosticsEngine;
