#!/usr/bin/env node

/**
 * Response Validation Orchestrator
 *
 * Coordinates the entire response validation workflow:
 * 1. Smart detection (should we validate?)
 * 2. Sanity checking (is response plausible?)
 * 3. Re-validation prompt generation
 * 4. Auto-retry coordination
 * 5. Final validation reporting
 *
 * @module response-validation-orchestrator
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const ResponseSanityChecker = require('./response-sanity-checker');
const SmartDetection = require('./smart-detection');

/**
 * Configuration
 */
const DEFAULT_CONFIG = {
  enabled: true,
  mode: 'block_and_retry',  // 'block_and_retry', 'warn_only', 'log_only'
  smartDetection: true,
  maxRetries: 1,
  timeoutMs: 30000,
  thresholds: {
    autoRetry: 0.8,    // Auto-retry if validation confidence > 80%
    warn: 0.5          // Warn if confidence > 50%
  }
};

class ResponseValidationOrchestrator {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.checker = new ResponseSanityChecker(config.thresholds);
  }

  /**
   * Main orchestration method
   * @param {string} response - Agent response text
   * @param {object} context - Context (agent, operation, org, etc.)
   * @returns {object} Validation result with final response
   */
  async orchestrate(response, context = {}) {
    if (!this.config.enabled) {
      return {
        validated: false,
        skipped: true,
        reason: 'Validation disabled',
        finalResponse: response
      };
    }

    // Step 1: Smart detection - should we validate?
    const detection = SmartDetection.check(response, context);

    if (!detection.needed && this.config.smartDetection) {
      return {
        validated: false,
        skipped: true,
        reason: 'Low-risk operation',
        detectionScore: detection.score,
        finalResponse: response
      };
    }

    // Step 2: Run sanity checker
    const validation = this.checker.validate(response, context);

    if (validation.valid) {
      return {
        validated: true,
        passed: true,
        confidence: validation.confidence,
        finalResponse: response
      };
    }

    // Step 3: Handle validation failure
    const action = this.determineAction(validation, detection);

    if (action === 'pass') {
      return {
        validated: true,
        passed: true,
        warnings: validation.concerns,
        confidence: validation.confidence,
        finalResponse: response
      };
    }

    if (action === 'warn') {
      const warningBanner = this.generateWarningBanner(validation);
      return {
        validated: true,
        passed: false,
        action: 'warned',
        warnings: validation.concerns,
        confidence: validation.confidence,
        finalResponse: warningBanner + '\n\n' + response
      };
    }

    if (action === 'retry') {
      // Generate re-validation prompt
      const revalidationPrompt = this.generateRevalidationPrompt(
        response,
        validation,
        context
      );

      return {
        validated: true,
        passed: false,
        action: 'retry_needed',
        concerns: validation.concerns,
        confidence: validation.confidence,
        revalidationPrompt: revalidationPrompt,
        originalResponse: response
      };
    }

    return {
      validated: true,
      passed: false,
      action: 'blocked',
      concerns: validation.concerns,
      confidence: validation.confidence,
      finalResponse: null
    };
  }

  /**
   * Determine action based on validation result
   */
  determineAction(validation, detection) {
    const { confidence } = validation;
    const { autoRetry, warn } = this.config.thresholds;

    if (this.config.mode === 'log_only') {
      return 'pass';
    }

    if (this.config.mode === 'warn_only') {
      return confidence >= warn ? 'warn' : 'pass';
    }

    if (this.config.mode === 'block_and_retry') {
      if (confidence >= autoRetry) {
        return 'retry';
      } else if (confidence >= warn) {
        return 'warn';
      } else {
        return 'pass';
      }
    }

    return 'pass';
  }

  /**
   * Generate re-validation prompt
   */
  generateRevalidationPrompt(response, validation, context) {
    const { concerns } = validation;

    // Extract primary concern
    const primaryConcern = concerns.reduce((max, c) =>
      c.confidence > max.confidence ? c : max
    );

    // Build re-validation prompt
    let prompt = `⚠️ RESPONSE VALIDATION REQUEST\n\n`;
    prompt += `Your previous response contains a claim that needs verification:\n\n`;
    prompt += `**Claim**: "${primaryConcern.claim}"\n`;
    prompt += `**Issue**: ${primaryConcern.reason}\n`;
    prompt += `**Confidence**: ${(primaryConcern.confidence * 100).toFixed(0)}% (validation failure)\n\n`;

    if (concerns.length > 1) {
      prompt += `**Additional Concerns**:\n`;
      for (const concern of concerns.slice(1)) {
        prompt += `- ${concern.reason}\n`;
      }
      prompt += `\n`;
    }

    prompt += `**Please re-validate by doing the following**:\n\n`;
    prompt += `1. **Re-run your query/analysis** and verify the exact numbers\n`;
    prompt += `2. **Check your logic** (especially WHERE clauses, filters, calculations)\n`;
    prompt += `3. **Provide the raw output** from your query/script\n`;
    prompt += `4. **Explain if the claim is actually correct** (and provide evidence)\n\n`;
    prompt += `**Context**:\n`;
    prompt += `- Operation: ${context.operation || 'unknown'}\n`;
    prompt += `- Org: ${context.org || 'unknown'}\n`;
    prompt += `- Agent: ${context.agent || 'unknown'}\n\n`;
    prompt += `Focus on **accuracy over speed**. If the original claim was incorrect, explain what went wrong.\n`;

    return prompt;
  }

  /**
   * Generate warning banner
   */
  generateWarningBanner(validation) {
    const { concerns, confidence } = validation;

    let banner = `┌${'─'.repeat(60)}┐\n`;
    banner += `│ ⚠️  VALIDATION NOTICE${' '.repeat(38)}│\n`;
    banner += `│${' '.repeat(62)}│\n`;
    banner += `│ This response contains claims that may need verification:${' '.repeat(4)}│\n`;

    for (const concern of concerns) {
      const line = `• ${concern.reason}`;
      const truncated = line.length > 60 ? line.substring(0, 57) + '...' : line;
      banner += `│ ${truncated.padEnd(61)}│\n`;
    }

    banner += `│${' '.repeat(62)}│\n`;
    banner += `│ Confidence: ${(confidence * 100).toFixed(0)}% (moderate concern)${' '.repeat(30 - (confidence * 100).toFixed(0).length)}│\n`;
    banner += `│ Consider double-checking before taking action${' '.repeat(16)}│\n`;
    banner += `└${'─'.repeat(60)}┘`;

    return banner;
  }

  /**
   * Generate validation report
   */
  generateValidationReport(result) {
    if (!result.validated) {
      return null;
    }

    let report = `\n${'='.repeat(60)}\n`;
    report += `RESPONSE VALIDATION REPORT\n`;
    report += `${'='.repeat(60)}\n\n`;

    if (result.passed) {
      report += `✅ Status: PASSED\n`;
      report += `Confidence: ${(result.confidence * 100).toFixed(0)}%\n`;
    } else {
      report += `⚠️  Status: FAILED\n`;
      report += `Action: ${result.action}\n`;
      report += `Confidence: ${(result.confidence * 100).toFixed(0)}%\n\n`;

      if (result.concerns) {
        report += `Concerns:\n`;
        for (const concern of result.concerns) {
          report += `- ${concern.reason} (${(concern.confidence * 100).toFixed(0)}%)\n`;
        }
      }
    }

    report += `\n${'='.repeat(60)}\n`;

    return report;
  }

  /**
   * Compare original and re-validated responses
   */
  compareResponses(original, revalidated) {
    const report = {
      changed: original !== revalidated,
      originalLength: original.length,
      revalidatedLength: revalidated.length,
      diff: null
    };

    if (report.changed) {
      // Simple diff - extract numerical claims
      const originalClaims = this.extractNumericClaims(original);
      const revalidatedClaims = this.extractNumericClaims(revalidated);

      report.diff = {
        original: originalClaims,
        revalidated: revalidatedClaims,
        changes: this.findChanges(originalClaims, revalidatedClaims)
      };
    }

    return report;
  }

  /**
   * Extract numeric claims from response
   */
  extractNumericClaims(response) {
    const claims = [];

    // Percentages
    const percentages = response.match(/\d+(?:\.\d+)?%/g) || [];
    claims.push(...percentages.map(p => ({ type: 'percentage', value: p })));

    // Ratios
    const ratios = response.match(/\d+(?:,\d+)*\s+(?:out of|\/)\s+\d+(?:,\d+)*/gi) || [];
    claims.push(...ratios.map(r => ({ type: 'ratio', value: r })));

    // Record counts
    const counts = response.match(/\d+(?:,\d+)*\s+(?:records?|accounts?|contacts?)/gi) || [];
    claims.push(...counts.map(c => ({ type: 'count', value: c })));

    return claims;
  }

  /**
   * Find changes between claim sets
   */
  findChanges(original, revalidated) {
    const changes = [];

    // Simple comparison - check if any values changed
    for (let i = 0; i < Math.max(original.length, revalidated.length); i++) {
      const orig = original[i];
      const reval = revalidated[i];

      if (orig && !reval) {
        changes.push({ type: 'removed', claim: orig });
      } else if (!orig && reval) {
        changes.push({ type: 'added', claim: reval });
      } else if (orig && reval && orig.value !== reval.value) {
        changes.push({ type: 'changed', from: orig, to: reval });
      }
    }

    return changes;
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
    console.log('  node response-validation-orchestrator.js validate --response <file> [options]');
    console.log('  node response-validation-orchestrator.js report --result <json-file>');
    console.log('');
    console.log('Options:');
    console.log('  --response <file>      Response file to validate');
    console.log('  --context <json>       Context JSON string');
    console.log('  --config <json-file>   Configuration file');
    console.log('  --mode <mode>          Validation mode (block_and_retry, warn_only, log_only)');
    console.log('');
    console.log('Examples:');
    console.log('  node response-validation-orchestrator.js validate --response response.txt');
    console.log('  node response-validation-orchestrator.js validate --response response.txt --mode warn_only');
    process.exit(0);
  }

  (async () => {
    const orchestrator = new ResponseValidationOrchestrator();

    if (command === 'validate') {
      const responseFile = args[args.indexOf('--response') + 1];
      const contextArg = args.indexOf('--context') !== -1 ? args[args.indexOf('--context') + 1] : null;
      const mode = args.indexOf('--mode') !== -1 ? args[args.indexOf('--mode') + 1] : null;

      if (!responseFile) {
        console.error('Error: --response required');
        process.exit(1);
      }

      if (mode) {
        orchestrator.config.mode = mode;
      }

      const response = fs.readFileSync(responseFile, 'utf8');
      const context = contextArg ? JSON.parse(contextArg) : {};

      const result = await orchestrator.orchestrate(response, context);
      console.log(JSON.stringify(result, null, 2));

    } else if (command === 'report') {
      const resultFile = args[args.indexOf('--result') + 1];

      if (!resultFile) {
        console.error('Error: --result required');
        process.exit(1);
      }

      const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      const report = orchestrator.generateValidationReport(result);
      console.log(report);

    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }
  })();
}

module.exports = ResponseValidationOrchestrator;
