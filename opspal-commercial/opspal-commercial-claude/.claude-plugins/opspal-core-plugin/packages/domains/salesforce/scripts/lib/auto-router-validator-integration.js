#!/usr/bin/env node

/**
 * Auto Router - Validator Integration
 *
 * Extends auto-agent-router with response validation capabilities.
 * Automatically validates agent responses for plausibility and accuracy.
 *
 * @module auto-router-validator-integration
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * Response Validation Integration for Auto-Agent-Router
 *
 * This module extends the existing auto-agent-router with automatic
 * response validation capabilities.
 */
class AutoRouterValidatorIntegration {
  constructor(routerInstance) {
    this.router = routerInstance;
    this.validationEnabled = true;
    this.validationMode = 'block_and_retry';

    // Load validation modules
    this.loadValidationModules();

    // Validation analytics
    this.validationStats = this.loadValidationStats();
  }

  /**
   * Load validation modules
   */
  loadValidationModules() {
    try {
      // Load validation modules from local salesforce-plugin lib
      const ResponseValidationOrchestrator = require('./response-validation-orchestrator');
      const SmartDetection = require('./smart-detection');
      const ResponseSanityChecker = require('./response-sanity-checker');

      this.orchestrator = new ResponseValidationOrchestrator();
      this.smartDetection = SmartDetection;
      this.sanityChecker = new ResponseSanityChecker();

      console.log('✓ Validation modules loaded successfully');
    } catch (error) {
      console.warn('⚠ Warning: Could not load validation modules:', error.message);
      this.validationEnabled = false;
    }
  }

  /**
   * Load validation statistics
   */
  loadValidationStats() {
    const statsPath = path.join(__dirname, '../../.claude/validation-stats.json');
    try {
      if (fs.existsSync(statsPath)) {
        return JSON.parse(fs.readFileSync(statsPath, 'utf8'));
      }
    } catch (error) {
      // Ignore
    }
    return {
      totalValidations: 0,
      validationCatches: 0,
      autoRetries: 0,
      warnings: 0,
      passThrough: 0
    };
  }

  /**
   * Save validation statistics
   */
  saveValidationStats() {
    const statsPath = path.join(__dirname, '../../.claude/validation-stats.json');
    try {
      const dir = path.dirname(statsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(statsPath, JSON.stringify(this.validationStats, null, 2));
    } catch (error) {
      // Ignore save errors
    }
  }

  /**
   * Determine if response should be validated
   * @param {string} response - Agent response
   * @param {object} context - Routing context
   * @returns {boolean} Whether to validate
   */
  shouldValidateResponse(response, context) {
    if (!this.validationEnabled) {
      return false;
    }

    // Use smart detection from validation system
    const detection = this.smartDetection.check(response, {
      agent: context.agent,
      operation: context.operation,
      org: context.org,
      complexity: context.complexity
    });

    return detection.needed;
  }

  /**
   * Validate agent response
   * @param {string} response - Agent response text
   * @param {object} context - Context from routing
   * @returns {object} Validation result
   */
  async validateAgentResponse(response, context) {
    if (!this.validationEnabled) {
      return {
        validated: false,
        skipped: true,
        reason: 'Validation disabled',
        finalResponse: response
      };
    }

    // Check if validation needed
    if (!this.shouldValidateResponse(response, context)) {
      return {
        validated: false,
        skipped: true,
        reason: 'Low-risk operation',
        finalResponse: response
      };
    }

    // Run validation orchestrator
    const result = await this.orchestrator.orchestrate(response, {
      agent: context.agent,
      operation: context.operation,
      org: context.org,
      complexity: context.complexity
    });

    // Update statistics
    this.validationStats.totalValidations++;

    if (!result.passed) {
      this.validationStats.validationCatches++;

      if (result.action === 'retry_needed') {
        this.validationStats.autoRetries++;
      } else if (result.action === 'warned') {
        this.validationStats.warnings++;
      }
    } else {
      this.validationStats.passThrough++;
    }

    this.saveValidationStats();

    return result;
  }

  /**
   * Get validation context from routing decision
   */
  getValidationContext(operation, routingResult) {
    return {
      agent: routingResult.agent,
      operation: operation,
      org: this.extractOrgFromOperation(operation),
      complexity: routingResult.complexity,
      confidence: routingResult.confidence
    };
  }

  /**
   * Extract org alias from operation text
   */
  extractOrgFromOperation(operation) {
    // Look for common org patterns
    const patterns = [
      /\borg[:\s]+([a-z0-9-]+)/i,
      /\binstance[:\s]+([a-z0-9-]+)/i,
      /\benvironment[:\s]+([a-z0-9-]+)/i,
      /\b(production|prod|sandbox|dev|uat|staging)\b/i
    ];

    for (const pattern of patterns) {
      const match = operation.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return 'unknown';
  }

  /**
   * Display validation result
   */
  displayValidationResult(result) {
    if (!result.validated) {
      return; // Validation was skipped
    }

    console.log('\n' + '═'.repeat(60));
    console.log('🔍 RESPONSE VALIDATION RESULT');
    console.log('═'.repeat(60));

    if (result.passed) {
      console.log('✅ Status: PASSED');
      console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    } else {
      console.log('⚠️  Status: FAILED');
      console.log(`Action: ${result.action}`);
      console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);

      if (result.concerns && result.concerns.length > 0) {
        console.log('\nConcerns:');
        result.concerns.forEach(concern => {
          console.log(`  • ${concern.reason} (${(concern.confidence * 100).toFixed(0)}%)`);
        });
      }

      if (result.action === 'retry_needed') {
        console.log('\n🔄 AUTO-RETRY TRIGGERED');
        console.log('The agent will be prompted to re-validate the response...');
      } else if (result.action === 'warned') {
        console.log('\n⚠️  WARNING ADDED');
        console.log('Response shown with validation notice...');
      }
    }

    console.log('═'.repeat(60) + '\n');
  }

  /**
   * Update org profile with response data
   * Learns typical record counts from responses
   */
  async updateOrgProfileFromResponse(response, org) {
    if (!org || org === 'unknown') {
      return;
    }

    // Extract record counts from response
    const countPattern = /(\d+(?:,\d+)*)\s+(Account|Contact|Lead|Opportunity|Case)s?/gi;
    const matches = [...response.matchAll(countPattern)];

    if (matches.length > 0) {
      const counts = {};
      matches.forEach(match => {
        const count = parseInt(match[1].replace(/,/g, ''));
        const objectType = match[2];
        counts[objectType] = count;
      });

      // Update sanity checker with learned counts
      this.sanityChecker.updateOrgProfile(org, counts);

      console.log(`📊 Updated org profile for ${org}:`, counts);
    }
  }

  /**
   * Generate validation report
   */
  generateValidationReport() {
    const report = [];
    report.push('\n📋 VALIDATION STATISTICS');
    report.push('═'.repeat(50));

    const stats = this.validationStats;
    report.push(`Total Validations: ${stats.totalValidations}`);
    report.push(`Validation Catches: ${stats.validationCatches}`);
    report.push(`Auto-Retries: ${stats.autoRetries}`);
    report.push(`Warnings: ${stats.warnings}`);
    report.push(`Pass-Through: ${stats.passThrough}`);

    if (stats.totalValidations > 0) {
      const catchRate = ((stats.validationCatches / stats.totalValidations) * 100).toFixed(1);
      const retryRate = ((stats.autoRetries / stats.totalValidations) * 100).toFixed(1);

      report.push('\nRates:');
      report.push(`  Catch Rate: ${catchRate}%`);
      report.push(`  Auto-Retry Rate: ${retryRate}%`);
    }

    report.push('═'.repeat(50));

    return report.join('\n');
  }

  /**
   * Complete workflow: Route + Validate
   *
   * This is the main integration point.
   * Usage:
   *   const result = await integration.routeAndValidate(userRequest, agentResponse);
   */
  async routeAndValidate(operation, agentResponse) {
    // Step 1: Get routing decision (if not already done)
    const routingResult = await this.router.routeOperation(operation, true);

    if (!routingResult || !routingResult.routed) {
      return {
        routed: false,
        validated: false,
        reason: 'No agent matched',
        validation: {
          validated: false,
          skipped: true,
          passed: true,
          finalResponse: agentResponse
        },
        finalResponse: agentResponse
      };
    }

    // Step 2: Get validation context
    const context = this.getValidationContext(operation, routingResult);

    // Step 3: Validate response
    const validationResult = await this.validateAgentResponse(agentResponse, context);

    // Step 4: Update org profile (learning)
    if (validationResult.passed) {
      await this.updateOrgProfileFromResponse(agentResponse, context.org);
    }

    // Step 5: Display validation result
    this.displayValidationResult(validationResult);

    return {
      routed: true,
      validated: true,
      routing: routingResult,
      validation: validationResult,
      finalResponse: validationResult.finalResponse,
      requiresRetry: validationResult.action === 'retry_needed',
      revalidationPrompt: validationResult.revalidationPrompt
    };
  }
}

module.exports = AutoRouterValidatorIntegration;
