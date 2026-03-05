#!/usr/bin/env node

/**
 * Funnel Data Validator
 *
 * Pre-flight data quality validation before running funnel diagnostics. Validates
 * data completeness, statistical significance, field requirements, and date ranges.
 *
 * @module funnel-data-validator
 * @version 1.0.0
 * @author RevPal Engineering
 *
 * Features:
 * - Data completeness validation (minimum records required)
 * - Statistical significance checks (sample size validation)
 * - Field requirement validation (required fields present)
 * - Date range validation (sufficient historical data)
 * - Missing data detection (gaps in time series)
 * - Activity tracking validation (Tasks, Events enabled)
 * - Data quality scoring (0-100)
 * - Remediation recommendations
 * - CLI interface for pre-flight checks
 *
 * Usage:
 *   const DataValidator = require('./funnel-data-validator');
 *   const validator = new DataValidator({ platform: 'salesforce' });
 *   const validation = validator.validate(orgData);
 *
 * CLI:
 *   node funnel-data-validator.js --platform salesforce --org production
 */

const fs = require('fs');
const path = require('path');

/**
 * Funnel Data Validator
 */
class FunnelDataValidator {
  constructor(options = {}) {
    this.platform = options.platform || 'salesforce';
    this.verbose = options.verbose || false;

    // Validation thresholds
    this.thresholds = {
      minOpportunities: 100,
      minActivities: 1000,
      minMeetings: 50,
      minLeads: 200,
      minDateRangeDays: 90,
      maxDateRangeDays: 730, // 2 years
      activityTrackingRate: 0.70 // 70% of records should have activities
    };

    if (this.verbose) {
      console.log(`FunnelDataValidator initialized for ${this.platform}`);
    }
  }

  /**
   * Main validation function
   *
   * @param {Object} orgData - Data from CRM org
   * @returns {Object} Validation results with errors, warnings, and recommendations
   */
  validate(orgData) {
    if (this.verbose) {
      console.log('\n=== Running Data Validation ===\n');
    }

    const validation = {
      passed: true,
      errors: [],
      warnings: [],
      info: [],
      checks: {},
      qualityScore: 100,
      recommendations: []
    };

    // Run validation checks
    this.validateDataCompleteness(orgData, validation);
    this.validateStatisticalSignificance(orgData, validation);
    this.validateDateRange(orgData, validation);
    this.validateActivityTracking(orgData, validation);
    this.validateFieldRequirements(orgData, validation);
    this.detectMissingData(orgData, validation);

    // Calculate overall quality score
    validation.qualityScore = this.calculateQualityScore(validation);

    // Determine overall pass/fail
    validation.passed = validation.errors.length === 0;

    // Generate recommendations
    this.generateRecommendations(validation);

    if (this.verbose) {
      console.log(`\n✓ Validation complete. Quality Score: ${validation.qualityScore}/100`);
    }

    return validation;
  }

  /**
   * Validate data completeness
   */
  validateDataCompleteness(orgData, validation) {
    const check = {
      name: 'Data Completeness',
      passed: true,
      details: {}
    };

    // Opportunities
    const oppCount = orgData.opportunities?.length || 0;
    check.details.opportunities = {
      count: oppCount,
      required: this.thresholds.minOpportunities,
      sufficient: oppCount >= this.thresholds.minOpportunities
    };

    if (oppCount < this.thresholds.minOpportunities) {
      validation.errors.push(`Insufficient opportunities: ${oppCount} (minimum ${this.thresholds.minOpportunities})`);
      check.passed = false;
    } else if (oppCount < this.thresholds.minOpportunities * 1.5) {
      validation.warnings.push(`Low opportunity count: ${oppCount} (recommended ${this.thresholds.minOpportunities * 2})`);
    }

    // Activities
    const activityCount = (orgData.activities?.length || 0);
    check.details.activities = {
      count: activityCount,
      required: this.thresholds.minActivities,
      sufficient: activityCount >= this.thresholds.minActivities
    };

    if (activityCount < this.thresholds.minActivities) {
      validation.errors.push(`Insufficient activities: ${activityCount} (minimum ${this.thresholds.minActivities})`);
      check.passed = false;
    }

    // Meetings
    const meetingCount = orgData.meetings?.length || 0;
    check.details.meetings = {
      count: meetingCount,
      required: this.thresholds.minMeetings,
      sufficient: meetingCount >= this.thresholds.minMeetings
    };

    if (meetingCount < this.thresholds.minMeetings) {
      validation.warnings.push(`Low meeting count: ${meetingCount} (recommended ${this.thresholds.minMeetings})`);
    }

    // Leads/Contacts
    const leadCount = orgData.leads?.length || orgData.contacts?.length || 0;
    check.details.leads = {
      count: leadCount,
      required: this.thresholds.minLeads,
      sufficient: leadCount >= this.thresholds.minLeads
    };

    if (leadCount < this.thresholds.minLeads) {
      validation.warnings.push(`Low lead/contact count: ${leadCount} (recommended ${this.thresholds.minLeads})`);
    }

    validation.checks.dataCompleteness = check;
  }

  /**
   * Validate statistical significance
   */
  validateStatisticalSignificance(orgData, validation) {
    const check = {
      name: 'Statistical Significance',
      passed: true,
      details: {}
    };

    const oppCount = orgData.opportunities?.length || 0;
    const activityCount = orgData.activities?.length || 0;

    // Calculate confidence level
    let confidence = 'high';

    if (oppCount < 100) {
      confidence = 'low';
      validation.warnings.push('Low statistical confidence: < 100 opportunities');
      check.passed = false;
    } else if (oppCount < 200) {
      confidence = 'medium';
      validation.info.push('Medium statistical confidence: 100-200 opportunities');
    }

    // Check for sufficient activity per opportunity
    const activityPerOpp = oppCount > 0 ? activityCount / oppCount : 0;

    check.details = {
      opportunityCount: oppCount,
      activityCount: activityCount,
      activityPerOpportunity: activityPerOpp.toFixed(1),
      confidence
    };

    if (activityPerOpp < 10) {
      validation.warnings.push(`Low activity per opportunity: ${activityPerOpp.toFixed(1)} (recommended 10+)`);
    }

    validation.checks.statisticalSignificance = check;
  }

  /**
   * Validate date range
   */
  validateDateRange(orgData, validation) {
    const check = {
      name: 'Date Range',
      passed: true,
      details: {}
    };

    if (!orgData.dateRange || !orgData.dateRange.start || !orgData.dateRange.end) {
      validation.warnings.push('Date range not specified');
      check.passed = false;
      validation.checks.dateRange = check;
      return;
    }

    const startDate = new Date(orgData.dateRange.start);
    const endDate = new Date(orgData.dateRange.end);
    const daysDiff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));

    check.details = {
      start: orgData.dateRange.start,
      end: orgData.dateRange.end,
      days: daysDiff,
      minRequired: this.thresholds.minDateRangeDays,
      maxAllowed: this.thresholds.maxDateRangeDays
    };

    if (daysDiff < this.thresholds.minDateRangeDays) {
      validation.errors.push(`Date range too short: ${daysDiff} days (minimum ${this.thresholds.minDateRangeDays})`);
      check.passed = false;
    } else if (daysDiff > this.thresholds.maxDateRangeDays) {
      validation.warnings.push(`Date range very long: ${daysDiff} days (may include stale data)`);
    }

    // Check if date range is in the past
    const now = new Date();
    if (endDate > now) {
      validation.warnings.push('Date range extends into the future');
    }

    validation.checks.dateRange = check;
  }

  /**
   * Validate activity tracking
   */
  validateActivityTracking(orgData, validation) {
    const check = {
      name: 'Activity Tracking',
      passed: true,
      details: {}
    };

    const oppCount = orgData.opportunities?.length || 0;
    const activityCount = orgData.activities?.length || 0;

    if (oppCount === 0) {
      validation.checks.activityTracking = check;
      return;
    }

    // Calculate tracking rate
    const trackingRate = activityCount / (oppCount * 10); // Assume 10 activities per opp is baseline

    check.details = {
      opportunities: oppCount,
      activities: activityCount,
      trackingRate: (trackingRate * 100).toFixed(1) + '%',
      sufficient: trackingRate >= this.thresholds.activityTrackingRate
    };

    if (trackingRate < 0.30) {
      validation.errors.push('Activity tracking appears disabled or very low');
      check.passed = false;
    } else if (trackingRate < this.thresholds.activityTrackingRate) {
      validation.warnings.push(`Low activity tracking rate: ${(trackingRate * 100).toFixed(1)}%`);
    }

    validation.checks.activityTracking = check;
  }

  /**
   * Validate field requirements
   */
  validateFieldRequirements(orgData, validation) {
    const check = {
      name: 'Field Requirements',
      passed: true,
      details: {
        missingFields: [],
        optionalFields: []
      }
    };

    // Required fields for opportunities
    const requiredOppFields = ['Id', 'CreatedDate', 'StageName', 'CloseDate'];
    const opportunities = orgData.opportunities || [];

    if (opportunities.length > 0) {
      const sampleOpp = opportunities[0];

      for (const field of requiredOppFields) {
        if (!sampleOpp[field] && !sampleOpp[field.toLowerCase()]) {
          check.details.missingFields.push(`Opportunity.${field}`);
          validation.warnings.push(`Missing required field: Opportunity.${field}`);
        }
      }
    }

    // Optional but recommended fields
    const optionalOppFields = ['Amount', 'Probability', 'Type', 'LeadSource'];
    if (opportunities.length > 0) {
      const sampleOpp = opportunities[0];

      for (const field of optionalOppFields) {
        if (!sampleOpp[field] && !sampleOpp[field.toLowerCase()]) {
          check.details.optionalFields.push(`Opportunity.${field}`);
        }
      }
    }

    if (check.details.optionalFields.length > 0) {
      validation.info.push(`Optional fields missing: ${check.details.optionalFields.join(', ')}`);
    }

    validation.checks.fieldRequirements = check;
  }

  /**
   * Detect missing data (gaps in time series)
   */
  detectMissingData(orgData, validation) {
    const check = {
      name: 'Missing Data Detection',
      passed: true,
      details: {
        gaps: []
      }
    };

    // Check for time gaps in activities
    const activities = orgData.activities || [];

    if (activities.length > 10) {
      const dates = activities
        .map(a => new Date(a.timestamp || a.activityDate || a.createdDate))
        .filter(d => !isNaN(d.getTime()))
        .sort((a, b) => a - b);

      if (dates.length >= 2) {
        const startDate = dates[0];
        const endDate = dates[dates.length - 1];
        const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));

        // Check for significant gaps (> 7 days between activities)
        for (let i = 1; i < dates.length; i++) {
          const gap = Math.floor((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));

          if (gap > 7) {
            check.details.gaps.push({
              from: dates[i - 1].toISOString().split('T')[0],
              to: dates[i].toISOString().split('T')[0],
              days: gap
            });
          }
        }

        if (check.details.gaps.length > 0) {
          validation.warnings.push(`Found ${check.details.gaps.length} gaps (>7 days) in activity data`);
        }
      }
    }

    validation.checks.missingData = check;
  }

  /**
   * Calculate overall quality score
   */
  calculateQualityScore(validation) {
    let score = 100;

    // Deduct for errors (20 points each)
    score -= validation.errors.length * 20;

    // Deduct for warnings (5 points each)
    score -= validation.warnings.length * 5;

    // Check pass rate
    const checks = Object.values(validation.checks);
    const passedChecks = checks.filter(c => c.passed).length;
    const passRate = checks.length > 0 ? passedChecks / checks.length : 1;

    score = Math.max(0, score * passRate);

    return Math.round(score);
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(validation) {
    const recommendations = [];

    // Data completeness recommendations
    if (validation.errors.some(e => e.includes('Insufficient opportunities'))) {
      recommendations.push({
        category: 'Data Completeness',
        action: 'Expand date range to capture more opportunities',
        priority: 'High',
        expectedImpact: 'Increase statistical significance'
      });
    }

    if (validation.errors.some(e => e.includes('Insufficient activities'))) {
      recommendations.push({
        category: 'Activity Tracking',
        action: 'Verify activity tracking is enabled (Tasks, Events)',
        priority: 'Critical',
        expectedImpact: 'Enable funnel analysis'
      });
    }

    // Date range recommendations
    if (validation.errors.some(e => e.includes('Date range too short'))) {
      recommendations.push({
        category: 'Date Range',
        action: 'Increase date range to minimum 90 days',
        priority: 'High',
        expectedImpact: 'Improve trend analysis accuracy'
      });
    }

    // Activity tracking recommendations
    if (validation.warnings.some(w => w.includes('Low activity tracking'))) {
      recommendations.push({
        category: 'Activity Tracking',
        action: 'Enable automatic activity logging or train reps on manual logging',
        priority: 'Medium',
        expectedImpact: 'More accurate activity metrics'
      });
    }

    // Field requirements recommendations
    if (validation.warnings.some(w => w.includes('Missing required field'))) {
      recommendations.push({
        category: 'Data Quality',
        action: 'Ensure required fields are populated (StageName, CloseDate, etc.)',
        priority: 'Medium',
        expectedImpact: 'Complete funnel analysis'
      });
    }

    validation.recommendations = recommendations;
  }
}

/**
 * CLI Interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Funnel Data Validator - CLI Usage

Usage:
  node funnel-data-validator.js [options]

Options:
  --platform <name>     Platform (salesforce or hubspot) (required)
  --org <alias>         Org alias or portal ID (required)
  --date-range <range>  Date range (e.g., 90d, 6m, 1y) (default: 90d)
  --output <file>       Output file for validation results (optional)
  --verbose             Enable verbose logging
  --help, -h            Show this help message

Example:
  node funnel-data-validator.js \\
    --platform salesforce \\
    --org production \\
    --date-range 90d \\
    --output ./validation.json \\
    --verbose

Output Format:
  JSON object with:
    - passed: Boolean (overall pass/fail)
    - errors: Array of error messages
    - warnings: Array of warning messages
    - checks: Detailed check results
    - qualityScore: 0-100 score
    - recommendations: Remediation actions
`);
    process.exit(0);
  }

  const platform = args.includes('--platform') ? args[args.indexOf('--platform') + 1] : null;
  const org = args.includes('--org') ? args[args.indexOf('--org') + 1] : null;
  const dateRange = args.includes('--date-range') ? args[args.indexOf('--date-range') + 1] : '90d';
  const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
  const verbose = args.includes('--verbose');

  if (!platform || !org) {
    console.error('Error: --platform and --org are required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  (async () => {
    try {
      console.log(`\n=== Validating ${platform} data for ${org} (${dateRange}) ===\n`);

      // Placeholder: In real implementation, this would query the CRM
      // For now, provide a sample validation
      const orgData = {
        opportunities: [],
        activities: [],
        meetings: [],
        leads: [],
        dateRange: {
          start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString()
        }
      };

      console.log('ℹ Note: This is a dry-run validation with sample data');
      console.log('ℹ Real implementation would query CRM for actual data\n');

      const validator = new FunnelDataValidator({ platform, verbose });
      const validation = validator.validate(orgData);

      // Output results
      if (outputFile) {
        fs.writeFileSync(outputFile, JSON.stringify(validation, null, 2));
        console.log(`\n✓ Validation results written to ${outputFile}`);
      }

      // Console summary
      console.log('=== Validation Summary ===\n');
      console.log(`Status: ${validation.passed ? '✓ PASSED' : '✗ FAILED'}`);
      console.log(`Quality Score: ${validation.qualityScore}/100\n`);

      if (validation.errors.length > 0) {
        console.log('Errors:');
        validation.errors.forEach(err => console.log(`  ✗ ${err}`));
        console.log();
      }

      if (validation.warnings.length > 0) {
        console.log('Warnings:');
        validation.warnings.forEach(warn => console.log(`  ⚠ ${warn}`));
        console.log();
      }

      if (validation.recommendations.length > 0) {
        console.log('Recommendations:');
        validation.recommendations.forEach(rec => {
          console.log(`  → [${rec.priority}] ${rec.action}`);
          console.log(`    Impact: ${rec.expectedImpact}`);
        });
      }

      process.exit(validation.passed ? 0 : 1);

    } catch (error) {
      console.error('Error:', error.message);
      if (verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}

module.exports = FunnelDataValidator;
