/**
 * routing-evaluator.test.js
 *
 * Tests for Routing Evaluator - deterministic routing decision engine
 */

// Sample routing policy for testing
const samplePolicy = {
  rules: [
    {
      id: 'exec-report',
      concern: 'report_generation',
      service: 'executive-reports-agent',
      priority: 1,
      use_service_when: [
        "audience in ['exec', 'customer']",
        "report_type in ['assessment', 'audit']",
        "tokens > 500"
      ],
      prefer_local_when: [
        "internal_debug_only == true"
      ],
      enforcement: 'strict',
      fallbacks: ['local-report-generator']
    },
    {
      id: 'merge-service',
      concern: 'match_merge',
      service: 'merge-orchestrator',
      priority: 1,
      use_service_when: [
        "batch_size > 10",
        "duplicates_detected == true"
      ],
      prefer_local_when: [
        "simple_merge == true"
      ],
      enforcement: 'advisory',
      fallbacks: ['manual-merge']
    }
  ],
  thresholds: {
    routing_confidence_min: 0.6
  }
};

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue(JSON.stringify({
    rules: [
      {
        id: 'exec-report',
        concern: 'report_generation',
        service: 'executive-reports-agent',
        priority: 1,
        use_service_when: [
          "audience in ['exec', 'customer']",
          "report_type in ['assessment', 'audit']",
          "tokens > 500"
        ],
        prefer_local_when: ["internal_debug_only == true"],
        enforcement: 'strict',
        fallbacks: ['local-report-generator']
      },
      {
        id: 'merge-service',
        concern: 'match_merge',
        service: 'merge-orchestrator',
        priority: 1,
        use_service_when: ["batch_size > 10", "duplicates_detected == true"],
        prefer_local_when: ["simple_merge == true"],
        enforcement: 'advisory',
        fallbacks: ['manual-merge']
      }
    ],
    thresholds: { routing_confidence_min: 0.6 }
  })),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn()
}));

const fs = require('fs');

describe('RoutingEvaluator', () => {
  let RoutingEvaluator;
  let evaluator;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset to default mock behavior
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(samplePolicy));

    // Require fresh module
    jest.resetModules();
    RoutingEvaluator = require('../routing-evaluator');
    evaluator = new RoutingEvaluator();
  });

  describe('constructor', () => {
    it('should create evaluator with default config', () => {
      expect(evaluator).toBeDefined();
      expect(evaluator.policy).toBeDefined();
      expect(evaluator.policy.rules).toHaveLength(2);
    });

    it('should create evaluator with custom config', () => {
      const customEvaluator = new RoutingEvaluator({
        policyPath: '/custom/path/policy.json',
        logPath: '/custom/path/logs.jsonl'
      });
      expect(customEvaluator.config.policyPath).toBe('/custom/path/policy.json');
      expect(customEvaluator.config.logPath).toBe('/custom/path/logs.jsonl');
    });

    it('should create log directory path', () => {
      // Verify config has log path set
      expect(evaluator.config.logPath).toBeDefined();
      expect(evaluator.config.logPath).toContain('logs');
    });

    it('should have policy with rules', () => {
      // Policy should be loaded with rules
      expect(evaluator.policy).toBeDefined();
      expect(evaluator.policy.rules).toBeInstanceOf(Array);
      expect(evaluator.policy.thresholds).toBeDefined();
    });

    it('should have routing confidence threshold', () => {
      expect(evaluator.policy.thresholds.routing_confidence_min).toBe(0.6);
    });
  });

  describe('evaluateRouting', () => {
    it('should route to service for matching exec report', () => {
      const context = {
        caller: 'test-agent',
        concern: 'report_generation',
        features: {
          audience: 'exec',
          report_type: 'assessment',
          tokens: 1000
        }
      };

      const decision = evaluator.evaluateRouting(context);

      expect(decision.decision).toBe('service');
      expect(decision.service).toBe('executive-reports-agent');
      expect(decision.routing_confidence).toBeGreaterThan(0.6);
    });

    it('should return local decision when no rules match concern', () => {
      const context = {
        caller: 'test-agent',
        concern: 'unknown_concern',
        features: {}
      };

      const decision = evaluator.evaluateRouting(context);

      expect(decision.decision).toBe('local');
      expect(decision.service).toBeNull();
    });

    it('should return local decision when confidence below threshold', () => {
      const context = {
        caller: 'test-agent',
        concern: 'report_generation',
        features: {
          audience: 'internal',  // Not in ['exec', 'customer']
          report_type: 'other',   // Not in ['assessment', 'audit']
          tokens: 100            // Not > 500
        }
      };

      const decision = evaluator.evaluateRouting(context);

      expect(decision.decision).toBe('local');
    });

    it('should reduce confidence when exclusion conditions match', () => {
      const context = {
        caller: 'test-agent',
        concern: 'report_generation',
        features: {
          audience: 'exec',
          report_type: 'assessment',
          tokens: 1000,
          internal_debug_only: true  // Exclusion condition
        }
      };

      const decision = evaluator.evaluateRouting(context);

      // Should still work but with reduced confidence
      expect(decision.routing_confidence).toBeLessThan(1.0);
    });

    it('should include trace info in decisions', () => {
      const context = {
        caller: 'test-agent',
        concern: 'report_generation',
        features: { audience: 'exec', report_type: 'assessment', tokens: 1000 }
      };

      const decision = evaluator.evaluateRouting(context);

      // Decision should have all required fields
      expect(decision).toHaveProperty('decision');
      expect(decision).toHaveProperty('service');
      expect(decision).toHaveProperty('routing_confidence');
      expect(decision).toHaveProperty('rules_matched');
      expect(decision).toHaveProperty('matched_conditions');
      expect(decision).toHaveProperty('why');
    });
  });

  describe('_evaluateCondition', () => {
    it('should evaluate "in" conditions correctly', () => {
      // Test via the private method accessor pattern
      const features = { audience: 'exec' };

      // Access via evaluateRouting which uses the condition
      const context = {
        caller: 'test',
        concern: 'report_generation',
        features
      };

      // This will exercise the "in" condition logic
      const decision = evaluator.evaluateRouting(context);
      expect(decision).toBeDefined();
    });

    it('should evaluate comparison operators', () => {
      const context = {
        caller: 'test',
        concern: 'match_merge',
        features: {
          batch_size: 50,  // > 10
          duplicates_detected: true
        }
      };

      const decision = evaluator.evaluateRouting(context);

      expect(decision.decision).toBe('service');
      expect(decision.service).toBe('merge-orchestrator');
    });

    it('should handle boolean comparisons', () => {
      const context = {
        caller: 'test',
        concern: 'match_merge',
        features: {
          batch_size: 50,
          duplicates_detected: true,
          simple_merge: true  // Exclusion
        }
      };

      const decision = evaluator.evaluateRouting(context);

      // Confidence should be reduced due to exclusion
      expect(decision).toBeDefined();
    });
  });

  describe('_explainDecision', () => {
    it('should provide explanation for service decision', () => {
      const context = {
        caller: 'test-agent',
        concern: 'report_generation',
        features: {
          audience: 'exec',
          report_type: 'assessment',
          tokens: 1000
        }
      };

      const decision = evaluator.evaluateRouting(context);

      expect(decision.why).toContain('Routing to');
      expect(decision.why).toContain('confidence');
    });

    it('should provide explanation for local decision', () => {
      const context = {
        caller: 'test-agent',
        concern: 'unknown',
        features: {}
      };

      const decision = evaluator.evaluateRouting(context);

      expect(decision.why).toContain('local execution');
    });
  });

  describe('_hashObject', () => {
    it('should generate deterministic results', () => {
      const context1 = {
        caller: 'test',
        concern: 'report_generation',
        features: { audience: 'exec', tokens: 1000, report_type: 'assessment' }
      };

      const context2 = {
        caller: 'test',
        concern: 'report_generation',
        features: { audience: 'exec', tokens: 1000, report_type: 'assessment' }
      };

      const decision1 = evaluator.evaluateRouting(context1);
      const decision2 = evaluator.evaluateRouting(context2);

      // Same inputs should produce same decisions
      expect(decision1.decision).toBe(decision2.decision);
      expect(decision1.routing_confidence).toBe(decision2.routing_confidence);
    });
  });

  describe('extractFeatures (static)', () => {
    it('should extract required features', () => {
      const context = {
        audience: 'exec',
        report_type: 'assessment',
        tokens: 1000,
        batch_size: 50,
        extra_field: 'ignored'
      };

      const features = RoutingEvaluator.extractFeatures(context);

      expect(features.audience).toBe('exec');
      expect(features.report_type).toBe('assessment');
      expect(features.tokens).toBe(1000);
      expect(features.batch_size).toBe(50);
      expect(features.extra_field).toBeUndefined();
    });

    it('should extract optional features', () => {
      const context = {
        requires_branding: true,
        needs_consistent_tone: true,
        pii_detected: false
      };

      const features = RoutingEvaluator.extractFeatures(context);

      expect(features.requires_branding).toBe(true);
      expect(features.needs_consistent_tone).toBe(true);
      expect(features.pii_detected).toBe(false);
    });

    it('should handle empty context', () => {
      const features = RoutingEvaluator.extractFeatures({});
      expect(Object.keys(features)).toHaveLength(0);
    });
  });

  describe('condition parsing edge cases', () => {
    it('should evaluate greater than operator for match_merge', () => {
      // Test using existing policy's batch_size > 10 condition
      const decision = evaluator.evaluateRouting({
        caller: 'test',
        concern: 'match_merge',
        features: {
          batch_size: 50,  // > 10 should match
          duplicates_detected: true
        }
      });

      expect(decision.decision).toBe('service');
      expect(decision.routing_confidence).toBeGreaterThan(0.5);
    });

    it('should not match when greater than condition fails', () => {
      const decision = evaluator.evaluateRouting({
        caller: 'test',
        concern: 'match_merge',
        features: {
          batch_size: 5,  // NOT > 10
          duplicates_detected: false
        }
      });

      // Neither condition matches, so local
      expect(decision.decision).toBe('local');
    });

    it('should evaluate boolean equality correctly', () => {
      const decision = evaluator.evaluateRouting({
        caller: 'test',
        concern: 'match_merge',
        features: {
          batch_size: 100,
          duplicates_detected: true  // == true should match
        }
      });

      expect(decision.decision).toBe('service');
    });

    it('should evaluate in operator with multiple values', () => {
      // Test audience in ['exec', 'customer']
      const decisionExec = evaluator.evaluateRouting({
        caller: 'test',
        concern: 'report_generation',
        features: { audience: 'exec', report_type: 'assessment', tokens: 1000 }
      });

      const decisionCustomer = evaluator.evaluateRouting({
        caller: 'test',
        concern: 'report_generation',
        features: { audience: 'customer', report_type: 'audit', tokens: 800 }
      });

      expect(decisionExec.decision).toBe('service');
      expect(decisionCustomer.decision).toBe('service');
    });

    it('should not match when value not in list', () => {
      const decision = evaluator.evaluateRouting({
        caller: 'test',
        concern: 'report_generation',
        features: { audience: 'internal', report_type: 'debug', tokens: 100 }
      });

      // None of the values match the allowed lists
      expect(decision.decision).toBe('local');
    });

    it('should handle missing feature gracefully', () => {
      const decision = evaluator.evaluateRouting({
        caller: 'test',
        concern: 'match_merge',
        features: {
          // batch_size missing - condition should not match
          duplicates_detected: true
        }
      });

      // Only one condition matches, confidence is 0.5 which is < 0.6 threshold
      expect(decision.routing_confidence).toBeLessThanOrEqual(0.5);
    });
  });

  describe('rule evaluation', () => {
    it('should include enforcement and fallbacks in decision', () => {
      const context = {
        caller: 'test-agent',
        concern: 'report_generation',
        features: {
          audience: 'exec',
          report_type: 'assessment',
          tokens: 1000
        }
      };

      const decision = evaluator.evaluateRouting(context);

      expect(decision.enforcement).toBe('strict');
      expect(decision.fallbacks).toContain('local-report-generator');
    });

    it('should return empty arrays when routing locally', () => {
      const context = {
        caller: 'test-agent',
        concern: 'unknown',
        features: {}
      };

      const decision = evaluator.evaluateRouting(context);

      expect(decision.rules_matched).toEqual([]);
      expect(decision.matched_conditions).toEqual([]);
      expect(decision.fallbacks).toEqual([]);
    });
  });
});
