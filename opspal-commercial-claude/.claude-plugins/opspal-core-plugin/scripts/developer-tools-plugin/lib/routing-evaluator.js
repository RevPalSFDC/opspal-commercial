#!/usr/bin/env node
/**
 * Routing Evaluator - Deterministic routing decision engine
 *
 * Evaluates routing_policy.json rules to determine whether to use
 * central services or allow local execution. Called by the routing
 * enforcer hook before every operation.
 *
 * @module routing-evaluator
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * Routing Evaluator Class
 *
 * Implements the routing decision logic specified in routing_policy.json.
 * Sub-agents call this before executing report generation or match/merge operations.
 */
class RoutingEvaluator {
  constructor(config = {}) {
    this.config = {
      policyPath: config.policyPath || path.join(__dirname, '../../config/routing_policy.json'),
      logPath: config.logPath || path.join(__dirname, '../../logs/routing_decisions.jsonl'),
      ...config
    };

    // Load routing policy
    this.policy = this._loadPolicy();

    // Ensure log directory exists
    const logDir = path.dirname(this.config.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Evaluate Routing Decision (Main Entry Point)
   *
   * @param {Object} context - Execution context
   * @param {string} context.caller - Name of calling agent
   * @param {string} context.concern - Operation type (report_generation, match_merge, etc.)
   * @param {Object} context.features - Extracted features for rule evaluation
   * @returns {Object} Routing decision with confidence and explanation
   */
  evaluateRouting(context) {
    const { caller, concern, features } = context;

    // Step 1: Find applicable rules
    const applicableRules = this.policy.rules.filter(rule => rule.concern === concern);

    if (applicableRules.length === 0) {
      return this._createLocalDecision(caller, concern, 'no_rules_found', 0.0, features);
    }

    // Step 2: Evaluate each rule
    const ruleEvaluations = applicableRules.map(rule => this._evaluateRule(rule, features));

    // Step 3: Select best match
    const bestMatch = ruleEvaluations.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    // Step 4: Determine final decision
    const decision = this._makeDecision(bestMatch, applicableRules[0], features);

    // Step 5: Log decision
    this._logDecision(caller, concern, decision, features);

    return decision;
  }

  /**
   * Evaluate Single Rule
   */
  _evaluateRule(rule, features) {
    let mandatoryMatches = 0;
    let mandatoryTotal = 0;
    let exclusionMatches = 0;
    const matchedConditions = [];

    // Evaluate "use_service_when" conditions
    for (const condition of rule.use_service_when) {
      mandatoryTotal++;
      if (this._evaluateCondition(condition, features)) {
        mandatoryMatches++;
        matchedConditions.push(condition);
      }
    }

    // Evaluate "prefer_local_when" conditions (exclusions)
    for (const condition of rule.prefer_local_when || []) {
      if (this._evaluateCondition(condition, features)) {
        exclusionMatches++;
        matchedConditions.push(`NOT(${condition})`);
      }
    }

    // Calculate confidence using formula from policy
    // confidence = (matched_mandatory / total_mandatory) - (exclusion_matches * 0.3)
    const baseConfidence = mandatoryTotal > 0 ? mandatoryMatches / mandatoryTotal : 0;
    const confidence = Math.max(0, baseConfidence - (exclusionMatches * 0.3));

    return {
      rule_id: rule.id,
      service: rule.service,
      confidence,
      matched_conditions: matchedConditions,
      enforcement: rule.enforcement,
      fallbacks: rule.fallbacks,
      priority: rule.priority || 0
    };
  }

  /**
   * Evaluate Single Condition
   *
   * Supports conditions like:
   * - "audience in ['exec', 'customer']"
   * - "batch_size > 10"
   * - "requires_branding == true"
   * - "pii_policy != 'allow_internal'"
   */
  _evaluateCondition(condition, features) {
    try {
      // Parse condition
      const inMatch = condition.match(/^(\w+) in \[(.*)\]$/);
      if (inMatch) {
        const field = inMatch[1];
        const values = inMatch[2].split(',').map(v => v.trim().replace(/['"]/g, ''));
        return values.includes(features[field]);
      }

      const comparisonMatch = condition.match(/^(\w+) ([><=!]+) (.+)$/);
      if (comparisonMatch) {
        const field = comparisonMatch[1];
        const operator = comparisonMatch[2];
        let expectedValue = comparisonMatch[3].trim().replace(/['"]/g, '');

        // Convert to appropriate type
        if (expectedValue === 'true') expectedValue = true;
        else if (expectedValue === 'false') expectedValue = false;
        else if (!isNaN(expectedValue)) expectedValue = Number(expectedValue);

        const actualValue = features[field];

        // Evaluate comparison
        switch (operator) {
          case '>': return actualValue > expectedValue;
          case '>=': return actualValue >= expectedValue;
          case '<': return actualValue < expectedValue;
          case '<=': return actualValue <= expectedValue;
          case '==': return actualValue == expectedValue;
          case '!=': return actualValue != expectedValue;
          default: return false;
        }
      }

      // Boolean shorthand (e.g., "requires_branding == true")
      if (condition.includes('==')) {
        const [field, value] = condition.split('==').map(s => s.trim());
        const expectedValue = value.replace(/['"]/g, '') === 'true';
        return features[field] === expectedValue;
      }

      return false;
    } catch (error) {
      console.error(`Error evaluating condition: ${condition}`, error);
      return false;
    }
  }

  /**
   * Make Final Decision
   */
  _makeDecision(bestMatch, firstRule, features) {
    const minConfidence = this.policy.thresholds.routing_confidence_min;

    if (bestMatch.confidence >= minConfidence) {
      // Use service
      return {
        decision: 'service',
        service: bestMatch.service,
        routing_confidence: bestMatch.confidence,
        rules_matched: [bestMatch.rule_id],
        matched_conditions: bestMatch.matched_conditions,
        enforcement: bestMatch.enforcement,
        fallbacks: bestMatch.fallbacks,
        why: this._explainDecision(bestMatch, 'service')
      };
    } else {
      // Use local
      return this._createLocalDecision(
        'evaluator',
        firstRule.concern,
        'confidence_below_threshold',
        bestMatch.confidence,
        features
      );
    }
  }

  /**
   * Create Local Decision
   */
  _createLocalDecision(caller, concern, reason, confidence, features) {
    return {
      decision: 'local',
      service: null,
      routing_confidence: confidence,
      rules_matched: [],
      matched_conditions: [],
      enforcement: 'advisory',
      fallbacks: [],
      why: `Routing to local execution: ${reason} (confidence: ${confidence.toFixed(2)})`
    };
  }

  /**
   * Explain Decision
   */
  _explainDecision(match, decision) {
    if (decision === 'service') {
      return `Routing to ${match.service}: ${match.matched_conditions.join(', ')} (confidence: ${match.confidence.toFixed(2)})`;
    } else {
      return `Local execution preferred (confidence: ${match.confidence.toFixed(2)})`;
    }
  }

  /**
   * Log Decision
   */
  _logDecision(caller, concern, decision, features) {
    const log = {
      timestamp: new Date().toISOString(),
      caller,
      concern,
      decision: decision.decision,
      service: decision.service,
      routing_confidence: decision.routing_confidence,
      rules_matched: decision.rules_matched,
      matched_conditions: decision.matched_conditions,
      enforcement: decision.enforcement,
      why: decision.why,
      features_hash: this._hashObject(features),
      trace_ids: []
    };

    fs.appendFileSync(this.config.logPath, JSON.stringify(log) + '\n');
  }

  /**
   * Load Routing Policy
   */
  _loadPolicy() {
    if (!fs.existsSync(this.config.policyPath)) {
      throw new Error(`Routing policy not found: ${this.config.policyPath}`);
    }

    const policy = JSON.parse(fs.readFileSync(this.config.policyPath, 'utf-8'));

    // Validate policy structure
    if (!policy.rules || !Array.isArray(policy.rules)) {
      throw new Error('Invalid routing policy: missing rules array');
    }

    return policy;
  }

  /**
   * Hash Object
   */
  _hashObject(obj) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').substr(0, 16);
  }

  /**
   * Extract Features from Context
   *
   * Helper method for sub-agents to extract routing features.
   */
  static extractFeatures(context) {
    const features = {};

    // Required features from policy
    const requiredFeatures = [
      'audience', 'report_type', 'output_format', 'tokens', 'pii_policy',
      'batch_size', 'platform', 'duplicates_detected', 'fuzzy_match_required', 'cross_platform'
    ];

    // Optional features
    const optionalFeatures = [
      'requires_branding', 'needs_consistent_tone', 'includes_citations',
      'ultra_low_latency_required', 'internal_debug_only', 'exact_ids_known',
      'simple_merge', 'requires_rollback', 'id_conflicts_present',
      'survivor_selection_complex', 'pii_detected', 'external_distribution',
      'stakeholder_distribution'
    ];

    // Extract from context
    [...requiredFeatures, ...optionalFeatures].forEach(feature => {
      if (context.hasOwnProperty(feature)) {
        features[feature] = context[feature];
      }
    });

    return features;
  }
}

// CLI Interface
if (require.main === module) {
  const evaluator = new RoutingEvaluator();

  // Example 1: Executive report generation
  console.log('=== Example 1: Executive Report ===');
  const execReportContext = {
    caller: 'sfdc-revops-auditor',
    concern: 'report_generation',
    features: {
      audience: 'exec',
      report_type: 'assessment',
      output_format: 'pdf',
      tokens: 2500,
      pii_policy: 'mask',
      requires_branding: true
    }
  };
  const decision1 = evaluator.evaluateRouting(execReportContext);
  console.log(JSON.stringify(decision1, null, 2));

  // Example 2: Internal debug report
  console.log('\n=== Example 2: Internal Debug Report ===');
  const debugReportContext = {
    caller: 'test-agent',
    concern: 'report_generation',
    features: {
      audience: 'internal',
      report_type: 'debug',
      output_format: 'markdown',
      tokens: 150,
      pii_policy: 'allow_internal',
      internal_debug_only: true
    }
  };
  const decision2 = evaluator.evaluateRouting(debugReportContext);
  console.log(JSON.stringify(decision2, null, 2));

  // Example 3: Large merge operation
  console.log('\n=== Example 3: Large Merge Operation ===');
  const mergeContext = {
    caller: 'sfdc-merge-orchestrator',
    concern: 'match_merge',
    features: {
      platform: 'salesforce',
      batch_size: 347,
      duplicates_detected: true,
      fuzzy_match_required: true,
      requires_rollback: true
    }
  };
  const decision3 = evaluator.evaluateRouting(mergeContext);
  console.log(JSON.stringify(decision3, null, 2));
}

module.exports = RoutingEvaluator;
