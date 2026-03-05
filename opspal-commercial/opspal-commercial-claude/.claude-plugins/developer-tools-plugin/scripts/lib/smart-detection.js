#!/usr/bin/env node

/**
 * Smart Detection
 *
 * Determines when response validation is needed based on operation risk,
 * content patterns, and context.
 *
 * @module smart-detection
 * @version 1.0.0
 */

const fs = require('fs');

/**
 * Detection rules and patterns
 */
const DETECTION_RULES = {
  // Production environment patterns
  production: {
    patterns: [
      /\b(?:prod|production|main|master)\b/i,
      /\bproduction\s+(?:org|environment|instance)/i,
      /\bdeploy(?:ing|ment)?\s+to\s+production/i
    ],
    weight: 1.0,
    reason: 'Production environment detected'
  },

  // Bulk operation patterns
  bulk: {
    patterns: [
      /\b(?:bulk|mass|batch)\s+(?:update|delete|insert|merge)/i,
      /\b(?:\d+(?:,\d+)*)\s+records?\s+(?:affected|updated|deleted|merged)/i,
      /\b(?:update|delete|merge)\s+(?:all|\d+(?:,\d+)*)\s+records?/i
    ],
    threshold: 100, // Flag if >100 records mentioned
    weight: 0.9,
    reason: 'Bulk operation detected'
  },

  // Statistical claims
  statistical: {
    patterns: [
      /\b\d+(?:\.\d+)?%/,
      /\b\d+(?:,\d+)*\s+out of\s+\d+(?:,\d+)*/i,
      /\b\d+:\d+\s+ratio/i,
      /\b(?:orphan|unused|inactive|dormant)\s+(?:records?|fields?|accounts?)/i
    ],
    weight: 0.8,
    reason: 'Statistical claims detected'
  },

  // Destructive operations
  destructive: {
    patterns: [
      /\bDELETE\b/,
      /\bTRUNCATE\b/,
      /\bDROP\b/,
      /\bmerge\s+(?:duplicate|records?)/i,
      /\bdelete\s+(?:all|bulk|records?)/i
    ],
    weight: 1.0,
    reason: 'Destructive operation detected'
  },

  // Field usage analysis
  fieldAnalysis: {
    patterns: [
      /\b(?:field|property)\s+usage/i,
      /\b(?:adoption|utilization)\s+rate/i,
      /\borphaned?\s+(?:fields?|records?)/i,
      /\bunused\s+(?:fields?|properties?)/i,
      /\b0\s+records?\s+use/i
    ],
    weight: 0.7,
    reason: 'Field usage analysis detected'
  },

  // High/extreme percentages
  extremePercentages: {
    patterns: [
      /\b(?:9[0-9]|100)%/,
      /\b[0-4]%/
    ],
    weight: 0.9,
    reason: 'Extreme percentage detected (>90% or <5%)'
  },

  // Zero counts
  zeroCounts: {
    patterns: [
      /\b0\s+(?:records?|fields?|items?)/i,
      /\bno\s+(?:records?|fields?|items?)\s+(?:found|exist|use)/i,
      /\bzero\s+(?:records?|fields?|items?)/i
    ],
    weight: 0.8,
    reason: 'Zero count claim detected'
  }
};

/**
 * Skip validation patterns (low-risk operations)
 */
const SKIP_PATTERNS = {
  readOnly: [
    /\bSELECT\b(?!.*(?:DELETE|UPDATE|INSERT))/i,
    /\bread-only/i,
    /\bquery\s+only/i,
    /\bview\s+only/i
  ],
  documentation: [
    /\bdocumentation/i,
    /\bexplanation/i,
    /\bexample/i,
    /\btutorial/i
  ],
  sandbox: [
    /\bsandbox\b/i,
    /\bdev\b(?!.*production)/i,
    /\btest\b(?!.*production)/i
  ],
  singleRecord: [
    /\b1\s+record/i,
    /\bsingle\s+record/i
  ]
};

class SmartDetection {
  /**
   * Check if response needs validation
   * @param {string} response - Agent response text
   * @param {object} context - Context (agent, operation, org, etc.)
   * @returns {object} Detection result { needed, score, reasons }
   */
  static check(response, context = {}) {
    let score = 0;
    const reasons = [];
    const matches = {};

    // Check if explicitly flagged
    if (context.validateResponse || /\[VALIDATE_RESPONSE\]/i.test(response)) {
      return {
        needed: true,
        score: 1.0,
        reasons: ['Explicit validation flag'],
        matches: {}
      };
    }

    // Check skip patterns first
    const shouldSkip = this.checkSkipPatterns(response, context);
    if (shouldSkip.skip && !context.forceValidation) {
      return {
        needed: false,
        score: 0,
        reasons: shouldSkip.reasons,
        matches: {}
      };
    }

    // Check detection rules
    for (const [ruleName, rule] of Object.entries(DETECTION_RULES)) {
      const result = this.checkRule(ruleName, rule, response, context);
      if (result.matched) {
        score += rule.weight;
        reasons.push(result.reason || rule.reason);
        matches[ruleName] = result.details;
      }
    }

    // Normalize score to 0-1
    const normalizedScore = Math.min(score / 2, 1.0); // Divide by 2 since max weight sum could be > 1

    return {
      needed: normalizedScore >= 0.5, // Validate if score >= 0.5
      score: normalizedScore,
      reasons: reasons,
      matches: matches
    };
  }

  /**
   * Check skip patterns
   */
  static checkSkipPatterns(response, context) {
    const reasons = [];

    // Check read-only
    if (SKIP_PATTERNS.readOnly.some(p => p.test(response))) {
      reasons.push('Read-only operation');
    }

    // Check documentation
    if (SKIP_PATTERNS.documentation.some(p => p.test(response))) {
      reasons.push('Documentation/explanation response');
    }

    // Check sandbox (unless production also mentioned)
    if (SKIP_PATTERNS.sandbox.some(p => p.test(response)) &&
        !DETECTION_RULES.production.patterns.some(p => p.test(response))) {
      reasons.push('Sandbox environment');
    }

    // Check single record
    if (SKIP_PATTERNS.singleRecord.some(p => p.test(response))) {
      reasons.push('Single record operation');
    }

    return {
      skip: reasons.length > 0,
      reasons: reasons
    };
  }

  /**
   * Check individual detection rule
   */
  static checkRule(ruleName, rule, response, context) {
    const matches = [];

    for (const pattern of rule.patterns) {
      const match = response.match(pattern);
      if (match) {
        matches.push({
          pattern: pattern.toString(),
          match: match[0],
          index: match.index
        });
      }
    }

    if (matches.length === 0) {
      return { matched: false };
    }

    // Special handling for bulk operations (check threshold)
    if (ruleName === 'bulk' && rule.threshold) {
      const countMatch = response.match(/(\d+(?:,\d+)*)\s+records?/i);
      if (countMatch) {
        const count = parseInt(countMatch[1].replace(/,/g, ''));
        if (count < rule.threshold) {
          return { matched: false };
        }
        return {
          matched: true,
          reason: `${rule.reason} (${count} records)`,
          details: { count, matches }
        };
      }
    }

    return {
      matched: true,
      reason: rule.reason,
      details: { matches }
    };
  }

  /**
   * Get detection summary
   */
  static getSummary(response, context = {}) {
    const result = this.check(response, context);

    return {
      shouldValidate: result.needed,
      riskScore: result.score,
      riskLevel: this.getRiskLevel(result.score),
      triggers: result.reasons,
      recommendation: this.getRecommendation(result.score)
    };
  }

  /**
   * Get risk level
   */
  static getRiskLevel(score) {
    if (score >= 0.8) return 'critical';
    if (score >= 0.6) return 'high';
    if (score >= 0.4) return 'medium';
    if (score >= 0.2) return 'low';
    return 'minimal';
  }

  /**
   * Get recommendation
   */
  static getRecommendation(score) {
    if (score >= 0.8) return 'validate_and_block';
    if (score >= 0.6) return 'validate_and_warn';
    if (score >= 0.4) return 'validate_if_time';
    return 'skip_validation';
  }
}

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help') {
    console.log('Usage:');
    console.log('  node smart-detection.js check --response <file> [--context <json>]');
    console.log('  node smart-detection.js summary --response <file> [--context <json>]');
    console.log('');
    console.log('Options:');
    console.log('  --response <file>    Response file to check');
    console.log('  --context <json>     Context JSON string (optional)');
    console.log('');
    console.log('Examples:');
    console.log('  node smart-detection.js check --response response.txt');
    console.log('  node smart-detection.js summary --response response.txt --context \'{"org":"prod"}\'');
    process.exit(0);
  }

  const responseFile = args[args.indexOf('--response') + 1];
  const contextArg = args.indexOf('--context') !== -1 ? args[args.indexOf('--context') + 1] : null;

  if (!responseFile) {
    console.error('Error: --response required');
    process.exit(1);
  }

  const response = fs.readFileSync(responseFile, 'utf8');
  const context = contextArg ? JSON.parse(contextArg) : {};

  if (command === 'check') {
    const result = SmartDetection.check(response, context);
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'summary') {
    const summary = SmartDetection.getSummary(response, context);
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}

module.exports = SmartDetection;
