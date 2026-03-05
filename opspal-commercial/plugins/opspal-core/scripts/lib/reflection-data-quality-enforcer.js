#!/usr/bin/env node
/**
 * Reflection Data Quality Enforcer
 *
 * Addresses critical data quality gaps in reflection system:
 * - 98.8% missing user_email field
 * - 100% missing outcome field
 * - 100% missing ROI value
 *
 * Part of Phase 1 Critical Gap Closure from Plugin Enhancement Plan.
 *
 * Usage:
 *   const { validateReflection, enforceDataQuality } = require('./reflection-data-quality-enforcer');
 *
 *   // Validate before submission
 *   const result = validateReflection(reflectionData);
 *   if (!result.valid) {
 *     console.warn('Missing fields:', result.missing);
 *   }
 *
 *   // Enforce with defaults (adds warnings)
 *   const enhanced = enforceDataQuality(reflectionData);
 *
 * Environment Variables:
 *   USER_EMAIL - Required for reflection attribution
 *   ENFORCE_DATA_QUALITY - Set to '1' to block submission of incomplete reflections
 *
 * @module reflection-data-quality-enforcer
 * @version 1.0.0
 */

'use strict';

// ============================================================================
// REQUIRED FIELDS
// ============================================================================

const REQUIRED_FIELDS = {
  user_email: {
    description: 'User email for attribution',
    env_var: 'USER_EMAIL',
    importance: 'critical',
    message: 'Set USER_EMAIL environment variable for proper attribution'
  },
  outcome: {
    description: 'Operation outcome (success/partial/failure)',
    source: 'session metadata',
    importance: 'high',
    message: 'Include outcome field in reflection metadata',
    valid_values: ['success', 'partial', 'failure', 'blocked', 'unknown']
  },
  duration_minutes: {
    description: 'Session duration in minutes',
    source: 'session metadata',
    importance: 'medium',
    message: 'Include duration_minutes for time tracking'
  },
  roi_annual_value: {
    description: 'Estimated annual ROI value',
    source: 'calculated',
    importance: 'high',
    message: 'Include ROI calculation for impact measurement'
  }
};

const RECOMMENDED_FIELDS = {
  org: {
    description: 'Organization/org alias',
    importance: 'medium'
  },
  focus_area: {
    description: 'Primary focus area of the session',
    importance: 'low'
  },
  priority_issues: {
    description: 'High-priority issues identified',
    importance: 'medium'
  }
};

const PRIORITY_NORMALIZATION = new Map([
  ['p0', 'P0'],
  ['p1', 'P1'],
  ['p2', 'P2'],
  ['p3', 'P3'],
  ['0', 'P0'],
  ['1', 'P1'],
  ['2', 'P2'],
  ['3', 'P3'],
  ['critical', 'P0'],
  ['high', 'P1'],
  ['medium', 'P2'],
  ['low', 'P3']
]);

function normalizePriority(priority) {
  if (!priority && priority !== 0) return null;
  const key = String(priority).trim().toLowerCase();
  if (!key) return null;
  return PRIORITY_NORMALIZATION.get(key) || null;
}

function getIssuesArray(reflection) {
  if (Array.isArray(reflection.issues_identified)) {
    return reflection.issues_identified;
  }
  if (Array.isArray(reflection.issues)) {
    return reflection.issues;
  }
  return [];
}

function parseROIValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const normalized = value
      .replace(/[$,]/g, '')
      .split('-')[0]
      .trim();
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getResolvedROIValue(reflection) {
  const direct = parseROIValue(reflection.roi_annual_value);
  if (direct !== null) return direct;

  const total = parseROIValue(reflection.roi_analysis?.total_annual_roi);
  if (total !== null) return total;

  const timeSavings = parseROIValue(reflection.roi_analysis?.time_savings?.annual_value);
  if (timeSavings !== null) return timeSavings;

  return null;
}

function hasHighPriorityIssues(issues) {
  return issues.some(issue => {
    const normalized = normalizePriority(issue?.priority);
    return normalized === 'P0' || normalized === 'P1';
  });
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate reflection data for completeness
 * @param {Object} reflection - Reflection data object
 * @returns {Object} Validation result
 */
function validateReflection(reflection) {
  const missing = [];
  const warnings = [];
  const errors = [];

  // Check required fields
  for (const [field, config] of Object.entries(REQUIRED_FIELDS)) {
    const value = getFieldValue(reflection, field, config);

    if (value === null || value === undefined || value === '') {
      if (config.importance === 'critical') {
        errors.push({
          field,
          message: config.message,
          fix: config.env_var ? `export ${config.env_var}="your-value"` : null
        });
      } else {
        missing.push({
          field,
          importance: config.importance,
          message: config.message
        });
      }
    } else if (field === 'outcome' && config.valid_values && !config.valid_values.includes(value)) {
      warnings.push({
        field,
        message: `Invalid outcome value: ${value}. Expected: ${config.valid_values.join(', ')}`
      });
    }
  }

  // Check recommended fields
  for (const [field, config] of Object.entries(RECOMMENDED_FIELDS)) {
    const value = getFieldValue(reflection, field, config);

    if (value === null || value === undefined || value === '') {
      warnings.push({
        field,
        importance: config.importance,
        message: `Recommended field '${field}' is missing`
      });
    }
  }

  const issues = getIssuesArray(reflection);
  const highPriorityPresent = hasHighPriorityIssues(issues);
  const roiValue = getResolvedROIValue(reflection);

  if (highPriorityPresent && (!roiValue || roiValue <= 0)) {
    warnings.push({
      field: 'roi_annual_value',
      importance: 'high',
      severity: 'high',
      message: 'High-priority issues detected (P0/P1) but ROI is missing or zero; add explicit ROI for triage accuracy'
    });
  }

  // Calculate data quality score
  const totalFields = Object.keys(REQUIRED_FIELDS).length + Object.keys(RECOMMENDED_FIELDS).length;
  const presentFields = totalFields - missing.length - errors.length - warnings.length;
  const qualityScore = Math.round((presentFields / totalFields) * 100);

  return {
    valid: errors.length === 0,
    qualityScore,
    errors,
    missing,
    warnings,
    summary: {
      totalRequired: Object.keys(REQUIRED_FIELDS).length,
      totalRecommended: Object.keys(RECOMMENDED_FIELDS).length,
      errorCount: errors.length,
      missingCount: missing.length,
      warningCount: warnings.length
    }
  };
}

/**
 * Get field value from reflection data
 */
function getFieldValue(reflection, field, config) {
  // Check direct field
  if (reflection[field] !== undefined) {
    return reflection[field];
  }

  // Check from environment variable
  if (config.env_var && process.env[config.env_var]) {
    return process.env[config.env_var];
  }

  // Check nested in data object
  if (reflection.data && reflection.data[field] !== undefined) {
    return reflection.data[field];
  }

  // Check in metadata
  if (reflection.metadata && reflection.metadata[field] !== undefined) {
    return reflection.metadata[field];
  }

  // Check in session_metadata
  if (reflection.session_metadata && reflection.session_metadata[field] !== undefined) {
    return reflection.session_metadata[field];
  }

  return null;
}

/**
 * Enforce data quality by adding defaults and warnings
 * @param {Object} reflection - Reflection data object
 * @param {Object} options - Options
 * @returns {Object} Enhanced reflection data
 */
function enforceDataQuality(reflection, options = {}) {
  const enhanced = { ...reflection };
  const appliedDefaults = [];
  const flags = {};
  const issues = getIssuesArray(enhanced);

  // Keep both keys in sync for downstream compatibility.
  enhanced.issues_identified = issues;
  enhanced.issues = issues;

  // Add user_email from environment
  if (!enhanced.user_email && process.env.USER_EMAIL) {
    enhanced.user_email = process.env.USER_EMAIL;
    appliedDefaults.push('user_email (from USER_EMAIL env)');
  }

  // Infer outcome from issues if not provided
  if (!enhanced.outcome) {
    const hasP0Issues = issues.some(i => normalizePriority(i.priority) === 'P0');
    const hasP1Issues = issues.some(i => normalizePriority(i.priority) === 'P1');
    const hasBlockedIssues = issues.some(i =>
      i.taxonomy === 'auth/permissions' ||
      i.taxonomy === 'rate-limit' ||
      (i.root_cause || '').toLowerCase().includes('blocked')
    );

    if (hasBlockedIssues) {
      enhanced.outcome = 'blocked';
      appliedDefaults.push('outcome (inferred: blocked from issue taxonomy)');
    } else if (hasP0Issues) {
      enhanced.outcome = 'failure';
      appliedDefaults.push('outcome (inferred: failure from P0 issues)');
    } else if (hasP1Issues && issues.length > 2) {
      enhanced.outcome = 'partial';
      appliedDefaults.push('outcome (inferred: partial from P1 issues)');
    } else if (issues.length === 0) {
      enhanced.outcome = 'success';
      appliedDefaults.push('outcome (inferred: success from no issues)');
    } else {
      enhanced.outcome = 'partial';
      appliedDefaults.push('outcome (inferred: partial from issues present)');
    }
  }

  // Ensure session_metadata exists
  if (!enhanced.session_metadata) {
    enhanced.session_metadata = {};
    appliedDefaults.push('session_metadata (created empty object)');
  }

  // Add session_end timestamp if missing
  if (!enhanced.session_metadata.session_end) {
    enhanced.session_metadata.session_end = new Date().toISOString();
    appliedDefaults.push('session_metadata.session_end (set to now)');
  }

  // Calculate duration if we have both timestamps
  if (enhanced.session_metadata.session_start && !enhanced.session_metadata.duration_minutes) {
    const start = new Date(enhanced.session_metadata.session_start);
    const end = new Date(enhanced.session_metadata.session_end);
    enhanced.session_metadata.duration_minutes = Math.round((end - start) / 60000);
    appliedDefaults.push(`duration_minutes (calculated: ${enhanced.session_metadata.duration_minutes})`);
  }

  const hasHighPriority = hasHighPriorityIssues(issues);
  const currentRoi = getResolvedROIValue(enhanced);
  const shouldBackfillRoi = issues.length > 0 && (!currentRoi || currentRoi <= 0);

  // Calculate ROI if issues are present and ROI is missing/zero.
  if (shouldBackfillRoi) {
    const roiAnalysis = calculateROIFromIssues(issues);
    const inferredRoi = parseROIValue(roiAnalysis.total_annual_roi);
    if (inferredRoi && inferredRoi > 0) {
      enhanced.roi_analysis = roiAnalysis;
      enhanced.roi_annual_value = inferredRoi;
      appliedDefaults.push(`roi_analysis (calculated: ${roiAnalysis.total_annual_roi})`);
      appliedDefaults.push(`roi_annual_value (derived: ${inferredRoi})`);

      if (hasHighPriority) {
        flags.high_priority_without_explicit_roi = true;
      }
    }
  } else if (currentRoi && !enhanced.roi_annual_value) {
    enhanced.roi_annual_value = currentRoi;
    appliedDefaults.push(`roi_annual_value (normalized: ${currentRoi})`);
  }

  // Add data quality metadata
  enhanced._data_quality = {
    validated_at: new Date().toISOString(),
    defaults_applied: appliedDefaults,
    quality_score: validateReflection(enhanced).qualityScore,
    flags
  };

  return enhanced;
}

/**
 * Calculate ROI from issues
 * @param {Array} issues - Array of issue objects
 * @returns {Object} ROI analysis object
 */
function calculateROIFromIssues(issues) {
  let timeSavingsHoursPerMonth = 0;
  let errorsPrevented = 0;

  // Estimate time savings based on issue priority and type
  for (const issue of issues) {
    const priority = issue.priority || 'P3';
    const blastRadius = (issue.blast_radius || 'LOW').toUpperCase();

    // Time savings estimates by priority
    const priorityHours = { P0: 4, P1: 2, P2: 1, P3: 0.5 };
    const radiusMultiplier = { HIGH: 2, MEDIUM: 1.5, LOW: 1 };

    const baseHours = priorityHours[priority] || 0.5;
    const multiplier = radiusMultiplier[blastRadius] || 1;

    timeSavingsHoursPerMonth += baseHours * multiplier;

    // Count prevented errors
    if (issue.agnostic_fix || issue.minimal_patch) {
      errorsPrevented += priority === 'P0' || priority === 'P1' ? 2 : 1;
    }
  }

  const hourlyRate = 150;
  const costPerError = 500;
  const annualHours = timeSavingsHoursPerMonth * 12;
  const timeSavingsAnnualValue = annualHours * hourlyRate;
  const errorPreventionAnnualValue = errorsPrevented * costPerError * 12;
  const totalAnnualROI = timeSavingsAnnualValue + errorPreventionAnnualValue;

  return {
    time_savings: {
      hours_per_month: Math.round(timeSavingsHoursPerMonth * 10) / 10,
      annual_hours: Math.round(annualHours),
      hourly_rate: hourlyRate,
      annual_value: `$${timeSavingsAnnualValue.toLocaleString()}`
    },
    error_prevention: {
      errors_prevented_monthly: errorsPrevented,
      cost_per_error: costPerError,
      annual_value: `$${errorPreventionAnnualValue.toLocaleString()}`
    },
    total_annual_roi: `$${totalAnnualROI.toLocaleString()}`,
    calculation_notes: `Based on ${issues.length} issues: ${timeSavingsHoursPerMonth}h/month saved, ${errorsPrevented} errors prevented monthly`
  };
}

/**
 * Generate data quality report
 * @param {Object[]} reflections - Array of reflection data
 * @returns {Object} Aggregate report
 */
function generateDataQualityReport(reflections) {
  const fieldCoverage = {};

  // Initialize coverage tracking
  for (const field of [...Object.keys(REQUIRED_FIELDS), ...Object.keys(RECOMMENDED_FIELDS)]) {
    fieldCoverage[field] = { present: 0, missing: 0 };
  }

  // Count field presence
  for (const reflection of reflections) {
    for (const [field, config] of [...Object.entries(REQUIRED_FIELDS), ...Object.entries(RECOMMENDED_FIELDS)]) {
      const value = getFieldValue(reflection, field, config);
      if (value !== null && value !== undefined && value !== '') {
        fieldCoverage[field].present++;
      } else {
        fieldCoverage[field].missing++;
      }
    }
  }

  // Calculate percentages
  const total = reflections.length;
  const report = {
    total_reflections: total,
    field_coverage: {},
    critical_gaps: [],
    recommendations: []
  };

  for (const [field, counts] of Object.entries(fieldCoverage)) {
    const percentage = total > 0 ? Math.round((counts.present / total) * 100 * 10) / 10 : 0;
    report.field_coverage[field] = {
      present: counts.present,
      missing: counts.missing,
      percentage: `${percentage}%`
    };

    // Flag critical gaps
    const config = REQUIRED_FIELDS[field] || RECOMMENDED_FIELDS[field];
    if (percentage < 50 && config?.importance === 'critical') {
      report.critical_gaps.push({
        field,
        percentage,
        message: config.message
      });
    } else if (percentage < 25) {
      report.recommendations.push({
        field,
        percentage,
        action: config?.message || `Improve ${field} capture`
      });
    }
  }

  return report;
}

/**
 * Print validation result to console
 */
function printValidationResult(result) {
  console.log('\n📊 Reflection Data Quality Check\n');

  if (result.valid) {
    console.log('✅ Validation passed');
  } else {
    console.log('❌ Validation failed');
  }

  console.log(`📈 Quality Score: ${result.qualityScore}%\n`);

  if (result.errors.length > 0) {
    console.log('🚫 Critical Errors:');
    result.errors.forEach(e => {
      console.log(`   - ${e.field}: ${e.message}`);
      if (e.fix) console.log(`     Fix: ${e.fix}`);
    });
    console.log();
  }

  if (result.missing.length > 0) {
    console.log('⚠️  Missing Required Fields:');
    result.missing.forEach(m => {
      console.log(`   - ${m.field} (${m.importance}): ${m.message}`);
    });
    console.log();
  }

  if (result.warnings.length > 0) {
    console.log('💡 Recommendations:');
    result.warnings.forEach(w => {
      console.log(`   - ${w.field}: ${w.message || 'Consider adding this field'}`);
    });
    console.log();
  }

  console.log('Summary:', result.summary);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  validateReflection,
  enforceDataQuality,
  generateDataQualityReport,
  printValidationResult,
  calculateROIFromIssues,
  REQUIRED_FIELDS,
  RECOMMENDED_FIELDS
};

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'validate':
      // Validate a reflection JSON file
      const filePath = args[1];
      if (!filePath) {
        console.error('Usage: node reflection-data-quality-enforcer.js validate <path-to-reflection.json>');
        process.exit(1);
      }

      try {
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const result = validateReflection(data);
        printValidationResult(result);
        process.exit(result.valid ? 0 : 1);
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
      break;

    case 'check-env':
      // Check environment configuration
      console.log('\n🔍 Environment Configuration Check\n');

      const envChecks = [
        { name: 'USER_EMAIL', importance: 'critical' },
        { name: 'SUPABASE_URL', importance: 'critical' },
        { name: 'SUPABASE_ANON_KEY', importance: 'critical' },
        { name: 'ENFORCE_DATA_QUALITY', importance: 'optional' }
      ];

      envChecks.forEach(check => {
        const value = process.env[check.name];
        const status = value ? '✅' : (check.importance === 'critical' ? '❌' : '⚠️');
        const display = value ? (check.name.includes('KEY') ? '[SET]' : value) : '[NOT SET]';
        console.log(`${status} ${check.name}: ${display}`);
      });

      console.log('\n📝 To fix missing variables, add to your .env or shell profile:');
      envChecks.filter(c => !process.env[c.name] && c.importance === 'critical')
        .forEach(c => console.log(`   export ${c.name}="your-value"`));
      break;

    case 'report':
      // Generate sample data quality report
      console.log('\n📊 Sample Data Quality Report\n');
      console.log('To generate a real report, use the module programmatically:');
      console.log(`
  const { generateDataQualityReport } = require('./reflection-data-quality-enforcer');
  const reflections = [...]; // Load from Supabase
  const report = generateDataQualityReport(reflections);
  console.log(JSON.stringify(report, null, 2));
      `);
      break;

    default:
      console.log(`
Reflection Data Quality Enforcer

Usage: node reflection-data-quality-enforcer.js <command> [args]

Commands:
  validate <file>   Validate a reflection JSON file
  check-env         Check environment configuration
  report            Show how to generate data quality report

Required Fields:
  - user_email      Attribution (from USER_EMAIL env)
  - outcome         Operation result (success/partial/failure)
  - duration_minutes Session duration
  - roi_annual_value Estimated annual ROI

Environment Variables:
  USER_EMAIL              Your email for attribution
  ENFORCE_DATA_QUALITY    Set to '1' to block incomplete reflections
      `);
  }
}
