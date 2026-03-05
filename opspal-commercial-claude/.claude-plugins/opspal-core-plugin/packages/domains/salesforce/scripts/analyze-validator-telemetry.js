#!/usr/bin/env node

/**
 * Validator Telemetry Analysis & ROI Calculation
 *
 * Generates comprehensive reports on validator effectiveness and ROI.
 *
 * Usage:
 *   # Generate report for all validators
 *   node analyze-validator-telemetry.js --all
 *
 *   # Generate report for specific validator
 *   node analyze-validator-telemetry.js --validator metadata-dependency-analyzer
 *
 *   # Generate report for date range
 *   node analyze-validator-telemetry.js --all --since 2025-11-01 --until 2025-11-30
 *
 *   # Calculate ROI
 *   node analyze-validator-telemetry.js --roi --since 2025-11-01
 */

const ValidatorTelemetry = require('./lib/validator-telemetry');

const VALIDATORS = [
  'metadata-dependency-analyzer',
  'flow-xml-validator',
  'csv-parser-safe',
  'automation-feasibility-analyzer'
];

// ROI Configuration (from PHASE_1_PRODUCTION_VALIDATION_PLAN.md)
const ROI_CONFIG = {
  'metadata-dependency-analyzer': {
    name: 'Metadata Dependency Analyzer',
    annualTarget: 68000,
    costPerError: 1300, // 2 hours × $150/hr + $1,000 delay
    resolutionTimeHours: 2
  },
  'flow-xml-validator': {
    name: 'Flow XML Validator',
    annualTarget: 58000,
    costPerError: 725, // 1.5 hours × $150/hr + $500
    resolutionTimeHours: 1.5
  },
  'csv-parser-safe': {
    name: 'CSV Parser Safe',
    annualTarget: 59000,
    costPerError: 650, // 3 hours × $150/hr + $200
    resolutionTimeHours: 3
  },
  'automation-feasibility-analyzer': {
    name: 'Automation Feasibility Analyzer',
    annualTarget: 58000,
    costPerError: 2750, // 5 hours × $150/hr + $2,000
    resolutionTimeHours: 5
  }
};

const HOURLY_RATE = 150; // $150/hour

class TelemetryAnalyzer {
  constructor(options = {}) {
    this.options = options;
    this.validators = options.all
      ? VALIDATORS
      : [options.validator];
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  VALIDATOR TELEMETRY ANALYSIS REPORT');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (this.options.since) {
      console.log(`Date Range: ${this.options.since} to ${this.options.until || 'present'}\n`);
    }

    const allStats = {};
    const allFeedback = {};

    for (const validatorName of this.validators) {
      const telemetry = new ValidatorTelemetry(validatorName);
      const stats = telemetry.getStatistics({
        since: this.options.since,
        until: this.options.until
      });
      const feedback = telemetry.getFeedbackStatistics();

      allStats[validatorName] = stats;
      allFeedback[validatorName] = feedback;

      this.printValidatorSection(validatorName, stats, feedback);
    }

    // Overall summary
    this.printOverallSummary(allStats, allFeedback);

    // ROI calculation
    if (this.options.roi) {
      this.printROIAnalysis(allStats, allFeedback);
    }

    // Success criteria evaluation
    this.printSuccessCriteria(allStats, allFeedback);

    console.log('\n═══════════════════════════════════════════════════════════\n');
  }

  /**
   * Print validator section
   */
  printValidatorSection(validatorName, stats, feedback) {
    const config = ROI_CONFIG[validatorName];

    console.log(`\n📊 ${config.name.toUpperCase()}`);
    console.log('─────────────────────────────────────────────────────────');

    // Execution stats
    console.log('\n   Execution Statistics:');
    console.log(`     Total Validations: ${stats.totalValidations}`);
    console.log(`     Blocked: ${stats.blocked} (${stats.errorRate}%)`);
    console.log(`     Passed: ${stats.passed}`);
    console.log(`     Warnings Only: ${stats.warningsOnly}`);
    console.log(`     Average Execution Time: ${stats.averageExecutionTime}ms`);
    console.log(`     Total Errors Found: ${stats.totalErrors}`);
    console.log(`     Total Warnings Found: ${stats.totalWarnings}`);

    // Performance indicator
    if (stats.averageExecutionTime <= 2000) {
      console.log(`     Performance: ✅ Excellent (<2s)`);
    } else if (stats.averageExecutionTime <= 5000) {
      console.log(`     Performance: ⚠️  Acceptable (<5s)`);
    } else {
      console.log(`     Performance: ❌ Slow (>5s) - Needs optimization`);
    }

    // Feedback stats
    if (feedback.totalFeedback > 0) {
      console.log('\n   User Feedback:');
      console.log(`     Total Responses: ${feedback.totalFeedback}`);
      console.log(`     Accuracy Rate: ${feedback.accuracyRate}%`);
      console.log(`     False Positive Rate: ${feedback.falsePositiveRate}%`);
      console.log(`     False Negative Rate: ${feedback.falseNegativeRate}%`);
      console.log(`     Average Time Saved: ${feedback.averageTimeSaved} minutes`);
      console.log(`     Satisfaction: ${feedback.satisfactionRate}/5 stars`);

      // Quality indicators
      if (feedback.falsePositiveRate <= 5) {
        console.log(`     False Positives: ✅ Excellent (≤5%)`);
      } else if (feedback.falsePositiveRate <= 10) {
        console.log(`     False Positives: ⚠️  Acceptable (≤10%)`);
      } else {
        console.log(`     False Positives: ❌ High (>10%) - Needs tuning`);
      }

      if (feedback.falseNegativeRate <= 10) {
        console.log(`     False Negatives: ✅ Acceptable (≤10%)`);
      } else {
        console.log(`     False Negatives: ❌ High (>10%) - Needs improvement`);
      }
    } else {
      console.log('\n   User Feedback: No feedback collected yet');
    }
  }

  /**
   * Print overall summary
   */
  printOverallSummary(allStats, allFeedback) {
    console.log('\n\n📈 OVERALL SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');

    let totalValidations = 0;
    let totalBlocked = 0;
    let totalExecutionTime = 0;
    let totalFeedback = 0;
    let totalAccurate = 0;
    let totalFalsePositives = 0;
    let totalFalseNegatives = 0;
    let totalTimeSaved = 0;
    let totalSatisfaction = 0;

    for (const validatorName of this.validators) {
      const stats = allStats[validatorName];
      const feedback = allFeedback[validatorName];

      totalValidations += stats.totalValidations;
      totalBlocked += stats.blocked;
      totalExecutionTime += stats.averageExecutionTime * stats.totalValidations;
      totalFeedback += feedback.totalFeedback;

      if (feedback.totalFeedback > 0) {
        totalAccurate += Math.round((feedback.accuracyRate / 100) * feedback.totalFeedback);
        totalFalsePositives += Math.round((feedback.falsePositiveRate / 100) * feedback.totalFeedback);
        totalFalseNegatives += Math.round((feedback.falseNegativeRate / 100) * feedback.totalFeedback);
        totalTimeSaved += feedback.averageTimeSaved * feedback.totalFeedback;
        totalSatisfaction += feedback.satisfactionRate * feedback.totalFeedback;
      }
    }

    console.log(`\n   Total Validations Across All Validators: ${totalValidations}`);
    console.log(`   Total Errors Prevented: ${totalBlocked}`);

    if (totalValidations > 0) {
      const avgExecTime = Math.round(totalExecutionTime / totalValidations);
      const errorPreventionRate = Math.round((totalBlocked / totalValidations) * 100);
      console.log(`   Error Prevention Rate: ${errorPreventionRate}%`);
      console.log(`   Average Execution Time: ${avgExecTime}ms`);
    }

    if (totalFeedback > 0) {
      const accuracyRate = Math.round((totalAccurate / totalFeedback) * 100);
      const fpRate = Math.round((totalFalsePositives / totalFeedback) * 100);
      const fnRate = Math.round((totalFalseNegatives / totalFeedback) * 100);
      const avgTimeSaved = Math.round(totalTimeSaved / totalFeedback);
      const avgSatisfaction = (totalSatisfaction / totalFeedback).toFixed(2);

      console.log(`\n   User Feedback Summary:`);
      console.log(`     Total Feedback Responses: ${totalFeedback}`);
      console.log(`     Accuracy Rate: ${accuracyRate}%`);
      console.log(`     False Positive Rate: ${fpRate}%`);
      console.log(`     False Negative Rate: ${fnRate}%`);
      console.log(`     Average Time Saved: ${avgTimeSaved} minutes`);
      console.log(`     Average Satisfaction: ${avgSatisfaction}/5 stars`);
    }
  }

  /**
   * Print ROI analysis
   */
  printROIAnalysis(allStats, allFeedback) {
    console.log('\n\n💰 ROI ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════');

    let totalROI = 0;
    let totalTarget = 0;

    for (const validatorName of this.validators) {
      const stats = allStats[validatorName];
      const feedback = allFeedback[validatorName];
      const config = ROI_CONFIG[validatorName];

      // Calculate actual ROI
      const errorsBlocked = stats.blocked;
      const costSavings = errorsBlocked * config.costPerError;

      // Adjust for time period if specified
      let annualizedROI = costSavings;
      if (this.options.since) {
        const daysInRange = this.calculateDaysInRange();
        annualizedROI = Math.round((costSavings / daysInRange) * 365);
      }

      totalROI += annualizedROI;
      totalTarget += config.annualTarget;

      const percentOfTarget = ((annualizedROI / config.annualTarget) * 100).toFixed(1);

      console.log(`\n   ${config.name}:`);
      console.log(`     Errors Blocked: ${errorsBlocked}`);
      console.log(`     Cost Savings: $${costSavings.toLocaleString()}`);
      console.log(`     Annualized ROI: $${annualizedROI.toLocaleString()}`);
      console.log(`     Target ROI: $${config.annualTarget.toLocaleString()}`);
      console.log(`     Achievement: ${percentOfTarget}% of target`);

      if (annualizedROI >= config.annualTarget) {
        console.log(`     Status: ✅ Target Met`);
      } else if (annualizedROI >= config.annualTarget * 0.75) {
        console.log(`     Status: ⚠️  Close to Target (≥75%)`);
      } else {
        console.log(`     Status: ❌ Below Target (<75%)`);
      }

      // Time saved
      if (feedback.totalFeedback > 0 && feedback.averageTimeSaved > 0) {
        const totalMinutesSaved = feedback.averageTimeSaved * stats.blocked;
        const totalHoursSaved = (totalMinutesSaved / 60).toFixed(1);
        const laborCostSaved = Math.round((totalMinutesSaved / 60) * HOURLY_RATE);

        console.log(`     Time Saved: ${totalHoursSaved} hours`);
        console.log(`     Labor Cost Saved: $${laborCostSaved.toLocaleString()}`);
      }
    }

    console.log(`\n   ─────────────────────────────────────────────────────────`);
    console.log(`   TOTAL COMBINED ROI: $${totalROI.toLocaleString()}`);
    console.log(`   TOTAL TARGET ROI: $${totalTarget.toLocaleString()}`);

    const percentOfTotal = ((totalROI / totalTarget) * 100).toFixed(1);
    console.log(`   Achievement: ${percentOfTotal}% of $243K target`);

    if (totalROI >= totalTarget) {
      console.log(`   Status: ✅ TARGET MET - Production validation successful!`);
    } else if (totalROI >= totalTarget * 0.82) {
      console.log(`   Status: ⚠️  CLOSE TO TARGET (≥$200K minimum)`);
    } else {
      console.log(`   Status: ❌ BELOW TARGET - Needs improvement`);
    }
  }

  /**
   * Print success criteria evaluation
   */
  printSuccessCriteria(allStats, allFeedback) {
    console.log('\n\n✅ SUCCESS CRITERIA EVALUATION');
    console.log('═══════════════════════════════════════════════════════════');

    // Calculate overall metrics
    let totalValidations = 0;
    let totalBlocked = 0;
    let totalExecutionTime = 0;
    let totalFeedback = 0;
    let totalFalsePositives = 0;
    let totalFalseNegatives = 0;
    let totalSatisfaction = 0;

    for (const validatorName of this.validators) {
      const stats = allStats[validatorName];
      const feedback = allFeedback[validatorName];

      totalValidations += stats.totalValidations;
      totalBlocked += stats.blocked;
      totalExecutionTime += stats.averageExecutionTime * stats.totalValidations;
      totalFeedback += feedback.totalFeedback;

      if (feedback.totalFeedback > 0) {
        totalFalsePositives += Math.round((feedback.falsePositiveRate / 100) * feedback.totalFeedback);
        totalFalseNegatives += Math.round((feedback.falseNegativeRate / 100) * feedback.totalFeedback);
        totalSatisfaction += feedback.satisfactionRate * feedback.totalFeedback;
      }
    }

    const criteria = [];

    // Error Prevention Rate ≥75%
    if (totalValidations > 0) {
      const errorRate = (totalBlocked / totalValidations) * 100;
      const status = errorRate >= 75 ? '✅ PASS' : '❌ FAIL';
      criteria.push({
        name: 'Error Prevention Rate ≥75%',
        actual: `${errorRate.toFixed(1)}%`,
        status
      });
    }

    // False Positive Rate <5%
    if (totalFeedback > 0) {
      const fpRate = (totalFalsePositives / totalFeedback) * 100;
      const status = fpRate < 5 ? '✅ PASS' : '❌ FAIL';
      criteria.push({
        name: 'False Positive Rate <5%',
        actual: `${fpRate.toFixed(1)}%`,
        status
      });
    }

    // False Negative Rate <10%
    if (totalFeedback > 0) {
      const fnRate = (totalFalseNegatives / totalFeedback) * 100;
      const status = fnRate < 10 ? '✅ PASS' : '❌ FAIL';
      criteria.push({
        name: 'False Negative Rate <10%',
        actual: `${fnRate.toFixed(1)}%`,
        status
      });
    }

    // Average Execution Time <2s
    if (totalValidations > 0) {
      const avgTime = totalExecutionTime / totalValidations;
      const status = avgTime < 2000 ? '✅ PASS' : '❌ FAIL';
      criteria.push({
        name: 'Average Execution Time <2s',
        actual: `${avgTime.toFixed(0)}ms`,
        status
      });
    }

    // User Satisfaction ≥80% (4/5 stars)
    if (totalFeedback > 0) {
      const avgSatisfaction = totalSatisfaction / totalFeedback;
      const status = avgSatisfaction >= 4.0 ? '✅ PASS' : '❌ FAIL';
      criteria.push({
        name: 'User Satisfaction ≥4.0/5',
        actual: `${avgSatisfaction.toFixed(2)}/5`,
        status
      });
    }

    // Print criteria
    console.log('');
    for (const criterion of criteria) {
      console.log(`   ${criterion.status} ${criterion.name}`);
      console.log(`      Actual: ${criterion.actual}`);
    }

    // Overall assessment
    const passedCount = criteria.filter(c => c.status.includes('✅')).length;
    const totalCount = criteria.length;

    console.log(`\n   ─────────────────────────────────────────────────────────`);
    console.log(`   Overall: ${passedCount}/${totalCount} criteria met`);

    if (passedCount === totalCount) {
      console.log(`   Assessment: ✅ READY FOR GENERAL AVAILABILITY`);
    } else if (passedCount >= totalCount * 0.8) {
      console.log(`   Assessment: ⚠️  NEEDS MINOR IMPROVEMENTS`);
    } else {
      console.log(`   Assessment: ❌ NEEDS SIGNIFICANT IMPROVEMENTS`);
    }
  }

  /**
   * Calculate days in date range
   */
  calculateDaysInRange() {
    if (!this.options.since) {
      return 30; // Default to 30 days
    }

    const sinceDate = new Date(this.options.since);
    const untilDate = this.options.until ? new Date(this.options.until) : new Date();
    const diffTime = Math.abs(untilDate - sinceDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays || 1;
  }
}

// CLI Interface
const args = process.argv.slice(2);

const options = {
  all: args.includes('--all'),
  validator: null,
  since: null,
  until: null,
  roi: args.includes('--roi')
};

const validatorIndex = args.indexOf('--validator');
if (validatorIndex !== -1 && args[validatorIndex + 1]) {
  options.validator = args[validatorIndex + 1];
}

const sinceIndex = args.indexOf('--since');
if (sinceIndex !== -1 && args[sinceIndex + 1]) {
  options.since = args[sinceIndex + 1];
}

const untilIndex = args.indexOf('--until');
if (untilIndex !== -1 && args[untilIndex + 1]) {
  options.until = args[untilIndex + 1];
}

if (!options.all && !options.validator) {
  console.error('Usage: node analyze-validator-telemetry.js [OPTIONS]');
  console.error('\nOptions:');
  console.error('  --all                    Analyze all validators');
  console.error('  --validator <name>       Analyze specific validator');
  console.error('  --since <YYYY-MM-DD>     Start date for analysis');
  console.error('  --until <YYYY-MM-DD>     End date for analysis');
  console.error('  --roi                    Include ROI calculation');
  console.error('\nExamples:');
  console.error('  node analyze-validator-telemetry.js --all --roi');
  console.error('  node analyze-validator-telemetry.js --validator metadata-dependency-analyzer');
  console.error('  node analyze-validator-telemetry.js --all --since 2025-11-01 --until 2025-11-30 --roi');
  process.exit(1);
}

const analyzer = new TelemetryAnalyzer(options);
analyzer.generateReport();
