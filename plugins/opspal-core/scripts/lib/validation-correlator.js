#!/usr/bin/env node
/**
 * Validation Correlator
 *
 * Aggregates results from all validation stages and identifies when multiple
 * stages flag the same root cause. Provides unified remediation suggestions.
 *
 * Addresses: Cross-stage correlation gap identified in reflection cohorts
 *
 * Usage:
 *   const { ValidationCorrelator } = require('./validation-correlator');
 *   const correlator = new ValidationCorrelator();
 *   const correlated = correlator.correlate(validationResults);
 *
 * CLI:
 *   node validation-correlator.js <results.json>
 *   node validation-correlator.js --stdin < results.jsonl
 *
 * @module validation-correlator
 * @version 1.0.0
 * @created 2026-01-24
 */

const fs = require('fs');
const path = require('path');

/**
 * Root cause patterns that can be identified across stages
 */
const ROOT_CAUSE_PATTERNS = {
  missing_env_var: {
    pattern: /missing.*environment|env.*not\s+set|undefined.*variable/i,
    stages: ['env_config', 'tool_contract'],
    category: 'configuration',
    unifiedMessage: 'Missing environment configuration',
    remediation: 'Check .env file and ensure all required environment variables are set.'
  },
  invalid_json: {
    pattern: /json.*parse|syntax\s*error|unexpected\s+token/i,
    stages: ['schema_parse', 'data_quality'],
    category: 'data_format',
    unifiedMessage: 'Invalid JSON format',
    remediation: 'Validate JSON syntax. Run: node parse-error-handler.js auto-fix <file>'
  },
  missing_field: {
    pattern: /missing.*required|field.*not\s+found|undefined.*field/i,
    stages: ['tool_contract', 'schema_parse', 'data_quality'],
    category: 'data_completeness',
    unifiedMessage: 'Missing required fields',
    remediation: 'Check data structure against schema requirements.'
  },
  auth_failure: {
    pattern: /auth.*fail|unauthorized|401|403|permission\s+denied/i,
    stages: ['env_config', 'api_limit'],
    category: 'authentication',
    unifiedMessage: 'Authentication or authorization failure',
    remediation: 'Verify credentials and permissions. Check token expiration.'
  },
  rate_limit: {
    pattern: /rate\s*limit|429|too\s+many\s+requests|throttl/i,
    stages: ['api_limit'],
    category: 'capacity',
    unifiedMessage: 'API rate limit reached',
    remediation: 'Wait before retrying. Consider batching or scheduling operations.'
  },
  synthetic_data: {
    pattern: /synthetic|fake|mock|placeholder|test\s+data/i,
    stages: ['data_quality'],
    category: 'data_integrity',
    unifiedMessage: 'Synthetic or test data detected',
    remediation: 'Use real data for production operations. Remove mock data.'
  },
  orphan_records: {
    pattern: /orphan|missing.*relationship|null.*id|dangling/i,
    stages: ['data_quality', 'tool_contract'],
    category: 'data_integrity',
    unifiedMessage: 'Orphan records or missing relationships',
    remediation: 'Verify lookup relationships. Ensure parent records exist.'
  },
  duplicate_operation: {
    pattern: /duplicate|already\s+exists|idempotency|repeat/i,
    stages: ['idempotency'],
    category: 'operation_state',
    unifiedMessage: 'Duplicate operation detected',
    remediation: 'Operation may have already been performed. Check operation status.'
  },
  deployment_conflict: {
    pattern: /deploy.*fail|conflict|component.*error|metadata/i,
    stages: ['tool_contract', 'schema_parse'],
    category: 'deployment',
    unifiedMessage: 'Deployment conflict or metadata issue',
    remediation: 'Check for component dependencies and conflicts.'
  }
};

/**
 * Severity levels
 */
const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO'
};

/**
 * Validation Correlator Class
 */
class ValidationCorrelator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.patterns = options.patterns || ROOT_CAUSE_PATTERNS;
  }

  /**
   * Correlate validation results from multiple stages
   *
   * @param {Object|Array} results - Validation results (object keyed by stage or array of results)
   * @returns {Object} Correlated analysis with unified recommendations
   */
  correlate(results) {
    const normalized = this.normalizeResults(results);
    const analysis = {
      timestamp: new Date().toISOString(),
      totalStages: Object.keys(normalized).length,
      totalErrors: 0,
      totalWarnings: 0,
      correlations: [],
      uncorrelatedErrors: [],
      rootCauses: {},
      unifiedRemediation: [],
      overallStatus: 'passed',
      summary: ''
    };

    // Count errors and warnings
    const allErrors = [];
    const allWarnings = [];

    for (const [stage, result] of Object.entries(normalized)) {
      if (result.errors && result.errors.length > 0) {
        for (const error of result.errors) {
          allErrors.push({ stage, ...error });
        }
      }
      if (result.warnings && result.warnings.length > 0) {
        for (const warning of result.warnings) {
          allWarnings.push({ stage, ...warning });
        }
      }
    }

    analysis.totalErrors = allErrors.length;
    analysis.totalWarnings = allWarnings.length;

    // Identify correlations
    const correlatedErrorIds = new Set();

    for (const [causeId, causePattern] of Object.entries(this.patterns)) {
      const matchingErrors = allErrors.filter(e =>
        causePattern.pattern.test(e.message || '') ||
        causePattern.pattern.test(JSON.stringify(e))
      );

      if (matchingErrors.length > 0) {
        const affectedStages = [...new Set(matchingErrors.map(e => e.stage))];

        // Check if errors span multiple stages (true correlation)
        const isMultiStageCorrelation = affectedStages.length > 1;

        analysis.correlations.push({
          rootCauseId: causeId,
          category: causePattern.category,
          unifiedMessage: causePattern.unifiedMessage,
          remediation: causePattern.remediation,
          affectedStages,
          errorCount: matchingErrors.length,
          isMultiStageCorrelation,
          severity: this.determineSeverity(matchingErrors, isMultiStageCorrelation),
          errors: matchingErrors.map(e => ({
            stage: e.stage,
            message: e.message,
            type: e.type
          }))
        });

        // Track which errors have been correlated
        matchingErrors.forEach(e => {
          correlatedErrorIds.add(`${e.stage}:${e.message}`);
        });

        // Add to root causes summary
        analysis.rootCauses[causeId] = {
          category: causePattern.category,
          count: matchingErrors.length,
          stages: affectedStages
        };

        // Add unified remediation if multi-stage
        if (isMultiStageCorrelation) {
          analysis.unifiedRemediation.push({
            rootCause: causePattern.unifiedMessage,
            remediation: causePattern.remediation,
            affectedStages
          });
        }
      }
    }

    // Find uncorrelated errors
    analysis.uncorrelatedErrors = allErrors.filter(e =>
      !correlatedErrorIds.has(`${e.stage}:${e.message}`)
    );

    // Determine overall status
    if (analysis.totalErrors > 0) {
      const hasCritical = analysis.correlations.some(c => c.severity === SEVERITY.CRITICAL);
      analysis.overallStatus = hasCritical ? 'blocked' : 'warning';
    }

    // Generate summary
    analysis.summary = this.generateSummary(analysis);

    return analysis;
  }

  /**
   * Normalize various result formats into standard structure
   */
  normalizeResults(results) {
    const normalized = {};

    if (Array.isArray(results)) {
      // Array of result objects with 'stage' property
      for (const result of results) {
        if (result.stage) {
          normalized[result.stage] = result;
        }
      }
    } else if (typeof results === 'object') {
      // Object keyed by stage name
      for (const [key, value] of Object.entries(results)) {
        if (typeof value === 'object') {
          normalized[key] = {
            status: value.status || 'unknown',
            errors: this.extractErrors(value),
            warnings: this.extractWarnings(value)
          };
        }
      }
    }

    return normalized;
  }

  /**
   * Extract errors from various result formats
   */
  extractErrors(result) {
    if (result.errors && Array.isArray(result.errors)) {
      return result.errors;
    }
    if (result.error) {
      return [typeof result.error === 'string' ? { message: result.error } : result.error];
    }
    if (result.status === 'blocked' && result.message) {
      return [{ message: result.message, type: 'blocking' }];
    }
    return [];
  }

  /**
   * Extract warnings from various result formats
   */
  extractWarnings(result) {
    if (result.warnings && Array.isArray(result.warnings)) {
      return result.warnings;
    }
    if (result.warning) {
      return [typeof result.warning === 'string' ? { message: result.warning } : result.warning];
    }
    return [];
  }

  /**
   * Determine severity based on errors and correlation
   */
  determineSeverity(errors, isMultiStage) {
    // Check for explicit severity in errors
    const severities = errors.map(e => e.severity).filter(Boolean);
    if (severities.includes(SEVERITY.CRITICAL)) return SEVERITY.CRITICAL;

    // Multi-stage correlations are more severe
    if (isMultiStage) return SEVERITY.HIGH;

    // Single stage with multiple errors
    if (errors.length > 2) return SEVERITY.MEDIUM;

    return SEVERITY.LOW;
  }

  /**
   * Generate human-readable summary
   */
  generateSummary(analysis) {
    const parts = [];

    if (analysis.totalErrors === 0 && analysis.totalWarnings === 0) {
      return 'All validation stages passed with no issues.';
    }

    if (analysis.totalErrors > 0) {
      parts.push(`${analysis.totalErrors} error(s) detected`);
    }
    if (analysis.totalWarnings > 0) {
      parts.push(`${analysis.totalWarnings} warning(s)`);
    }

    const correlationCount = analysis.correlations.filter(c => c.isMultiStageCorrelation).length;
    if (correlationCount > 0) {
      parts.push(`${correlationCount} correlated root cause(s) identified`);
    }

    if (analysis.unifiedRemediation.length > 0) {
      parts.push(`${analysis.unifiedRemediation.length} unified fix(es) recommended`);
    }

    return parts.join('. ') + '.';
  }

  /**
   * Format correlations for display
   */
  formatForDisplay(analysis) {
    const lines = [];

    lines.push('═══════════════════════════════════════════════════════════════════');
    lines.push('  VALIDATION CORRELATION ANALYSIS');
    lines.push('═══════════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Status: ${analysis.overallStatus.toUpperCase()}`);
    lines.push(`Errors: ${analysis.totalErrors} | Warnings: ${analysis.totalWarnings}`);
    lines.push(`Summary: ${analysis.summary}`);
    lines.push('');

    if (analysis.correlations.length > 0) {
      lines.push('─────────────────────────────────────────────────────────────────');
      lines.push('  CORRELATED ROOT CAUSES');
      lines.push('─────────────────────────────────────────────────────────────────');

      for (const correlation of analysis.correlations) {
        const icon = correlation.severity === SEVERITY.CRITICAL ? '❌' :
          correlation.severity === SEVERITY.HIGH ? '⚠️' : 'ℹ️';

        lines.push('');
        lines.push(`${icon} ${correlation.unifiedMessage}`);
        lines.push(`   Category: ${correlation.category}`);
        lines.push(`   Affected stages: ${correlation.affectedStages.join(', ')}`);
        lines.push(`   Severity: ${correlation.severity}`);
        lines.push(`   💡 ${correlation.remediation}`);
      }
    }

    if (analysis.uncorrelatedErrors.length > 0) {
      lines.push('');
      lines.push('─────────────────────────────────────────────────────────────────');
      lines.push('  UNCORRELATED ERRORS');
      lines.push('─────────────────────────────────────────────────────────────────');

      for (const error of analysis.uncorrelatedErrors) {
        lines.push(`  [${error.stage}] ${error.message}`);
      }
    }

    if (analysis.unifiedRemediation.length > 0) {
      lines.push('');
      lines.push('─────────────────────────────────────────────────────────────────');
      lines.push('  UNIFIED REMEDIATION STEPS');
      lines.push('─────────────────────────────────────────────────────────────────');

      for (let i = 0; i < analysis.unifiedRemediation.length; i++) {
        const rem = analysis.unifiedRemediation[i];
        lines.push(`  ${i + 1}. ${rem.rootCause}`);
        lines.push(`     Fix: ${rem.remediation}`);
        lines.push(`     Affects: ${rem.affectedStages.join(', ')}`);
      }
    }

    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  const correlator = new ValidationCorrelator({ verbose: true });

  if (args.includes('--stdin') || args.length === 0) {
    // Read from stdin
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        input += chunk;
      }
    });
    process.stdin.on('end', () => {
      try {
        // Try to parse as JSON or JSONL
        let results;
        if (input.trim().startsWith('{')) {
          results = JSON.parse(input);
        } else {
          // JSONL format
          results = input.trim().split('\n').map(line => JSON.parse(line));
        }

        const analysis = correlator.correlate(results);

        if (args.includes('--json')) {
          console.log(JSON.stringify(analysis, null, 2));
        } else {
          console.log(correlator.formatForDisplay(analysis));
        }

        process.exit(analysis.overallStatus === 'blocked' ? 1 : 0);
      } catch (e) {
        console.error('Error parsing input:', e.message);
        process.exit(1);
      }
    });
  } else {
    // Read from file
    const filePath = args[0];
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const results = JSON.parse(content);
      const analysis = correlator.correlate(results);

      if (args.includes('--json')) {
        console.log(JSON.stringify(analysis, null, 2));
      } else {
        console.log(correlator.formatForDisplay(analysis));
      }

      process.exit(analysis.overallStatus === 'blocked' ? 1 : 0);
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  }
}

module.exports = { ValidationCorrelator, ROOT_CAUSE_PATTERNS, SEVERITY };
