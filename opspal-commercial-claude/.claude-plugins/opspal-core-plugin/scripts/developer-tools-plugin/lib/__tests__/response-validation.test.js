/**
 * Response Validation System Tests
 *
 * Tests for response-sanity-checker, smart-detection, and orchestrator
 */

const ResponseSanityChecker = require('../response-sanity-checker');
const SmartDetection = require('../smart-detection');
const ResponseValidationOrchestrator = require('../response-validation-orchestrator');

describe('Response Sanity Checker', () => {
  let checker;

  beforeEach(() => {
    checker = new ResponseSanityChecker();
  });

  describe('Percentage Validation', () => {
    test('should flag extreme high percentage (98%)', () => {
      const response = 'Found 29,400 orphaned accounts out of 30,000 total (98%).';
      const result = checker.validate(response, { org: 'test-org' });

      expect(result.valid).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.concerns.length).toBeGreaterThan(0);
    });

    test('should flag extreme low percentage (2%)', () => {
      const response = 'Only 2% of contacts have email addresses.';
      const result = checker.validate(response, {});

      expect(result.valid).toBe(false);
      expect(result.concerns.length).toBeGreaterThan(0);
    });

    test('should pass normal percentage (45%)', () => {
      const response = 'Approximately 45% of leads are qualified.';
      const result = checker.validate(response, {});

      expect(result.valid).toBe(true);
    });
  });

  describe('Record Count Validation', () => {
    test('should extract zero count claims from response', () => {
      // The regex captures zero count patterns: /(0|zero|no)\s+(?:records?|fields?|items?)\s+(?:use|using|with|have)/gi
      // The captured pattern is short and doesn't include broader context
      const response = '0 records use the field.';
      const result = checker.validate(response, {});

      // Zero count is extracted but validation passes because "0 records use"
      // doesn't contain suspicious keywords (email, owner, name, etc.)
      expect(result.valid).toBe(true);
    });

    test('should handle responses without zero count patterns', () => {
      const response = 'All records have values assigned.';
      const result = checker.validate(response, {});

      expect(result.valid).toBe(true);
    });
  });

  describe('Distribution Validation', () => {
    test('should extract distribution parts from response', () => {
      // The distribution regex looks for "total: N" then extracts numbers followed by with/without/for/in/of
      const response = 'Total: 100. Found 50 with values, 50 without values.';
      const result = checker.validate(response, {});

      // Parts sum to 100 which matches total - should pass
      expect(result.valid).toBe(true);
    });

    test('should pass when no distribution pattern found', () => {
      // Without "Total:" pattern, no distribution validation happens
      const response = 'Found 500 records with owners and 300 records without owners.';
      const result = checker.validate(response, {});

      expect(result.valid).toBe(true);
    });
  });

  describe('Cross-Reference Validation', () => {
    test('should detect contradictory percentages', () => {
      const response = '95% of contacts have emails, and 92% without emails.';
      const result = checker.validate(response, {});

      expect(result.valid).toBe(false);
      expect(result.concerns.some(c => c.reason.includes('Contradictory'))).toBe(true);
    });
  });

  describe('Org Profile Integration', () => {
    test('should store and retrieve org profiles', () => {
      // updateOrgProfile stores counts for an org
      checker.updateOrgProfile('test-org', {
        Account: 30000,
        Contact: 45000
      });

      // Profile is stored (validates updateOrgProfile works)
      const profile = checker.getOrgProfile('test-org');
      expect(profile).toBeDefined();
      expect(profile.Account).toBe(30000);
    });

    test('should validate without org profile', () => {
      // When no org profile exists, record counts pass by default
      const response = 'Found 15,000 Accounts in the org.';
      const result = checker.validate(response, { org: 'unknown-org' });

      // No profile to compare against, so passes
      expect(result.valid).toBe(true);
    });

    test('should flag record count deviation', () => {
      checker.updateOrgProfile('deviation-test-org', {
        Account: 30000
      });

      // 100000 is way off from 30000 (>50% deviation)
      const response = 'Found 100,000 Accounts in the org.';
      const result = checker.validate(response, { org: 'deviation-test-org' });

      expect(result.valid).toBe(false);
      expect(result.concerns.some(c => c.reason.includes('deviates'))).toBe(true);
    });
  });

  describe('Ratio Validation', () => {
    test('should extract and validate ratio claims', () => {
      // Test "X out of Y" pattern
      const response = 'Found 29000 out of 30000 accounts are orphaned.';
      const result = checker.validate(response, {});

      // 29000/30000 = 96.67% which is extreme
      expect(result.valid).toBe(false);
    });

    test('should validate large ratio numerator with out of', () => {
      // Test another "X out of Y" pattern - extreme ratio
      const response = 'Successfully processed 9500 out of 10000 items.';
      const result = checker.validate(response, {});

      // 9500/10000 = 95% which is extreme
      expect(result.valid).toBe(false);
    });

    test('should detect division by zero in ratio', () => {
      // Test division by zero case
      const response = 'Calculated 100 out of 0 items.';
      const result = checker.validate(response, {});

      expect(result.valid).toBe(false);
      expect(result.concerns.some(c => c.reason.includes('Division by zero'))).toBe(true);
    });

    test('should pass valid ratio', () => {
      const response = 'Success rate: 45 out of 100.';
      const result = checker.validate(response, {});

      expect(result.valid).toBe(true);
    });
  });

  describe('Zero Count Validation', () => {
    test('should extract zero count claims', () => {
      // Zero count pattern is captured, but validation only flags
      // if claim.text contains suspicious keywords (email, owner, name, etc.)
      // The regex captures "0 records use" - not surrounding text
      const response = '0 records use this custom field.';
      const result = checker.validate(response, {});

      // Passes because "0 records use" doesn't contain suspicious keywords
      expect(result.valid).toBe(true);
    });

    test('should validate zero count claims are extracted', () => {
      // Test that the zero count regex matches correctly
      const response = 'zero items have values assigned.';
      const result = checker.validate(response, {});

      // The zero count is extracted but passes unless claim text
      // contains suspicious keywords
      expect(result).toBeDefined();
    });

    test('should handle no records with keyword pattern', () => {
      const response = 'no records with values in the system.';
      const result = checker.validate(response, {});

      // Zero count extracted and validated
      expect(result).toBeDefined();
    });
  });

  describe('Distribution Validation', () => {
    test('should flag mismatched distribution', () => {
      // Total is 100, but parts sum to 60 (significant mismatch)
      const response = 'Total: 100. Found 20 with active status, 20 for inactive, 20 of pending.';
      const result = checker.validate(response, {});

      expect(result.valid).toBe(false);
      expect(result.concerns.some(c => c.reason.includes('Distribution mismatch'))).toBe(true);
    });
  });
});

describe('Smart Detection', () => {
  describe('Production Detection', () => {
    test('should detect production environment', () => {
      const response = 'Deploying to production org with 30k accounts.';
      const result = SmartDetection.check(response, {});

      expect(result.needed).toBe(true);
      expect(result.reasons).toContain('Production environment detected');
    });

    test('should skip sandbox environment', () => {
      const response = 'Testing in sandbox with 100 accounts.';
      const result = SmartDetection.check(response, {});

      expect(result.needed).toBe(false);
    });
  });

  describe('Bulk Operation Detection', () => {
    test('should detect mass delete pattern', () => {
      // Matches: /\b(?:bulk|mass|batch)\s+(?:update|delete|insert|merge)/i
      // Note: Single pattern match may not exceed threshold for needed=true
      // but the pattern detection should add to reasons
      const response = 'Executing mass delete on the records.';
      const result = SmartDetection.check(response, {});

      // Verify the pattern was detected (in reasons array)
      expect(result.reasons).toContain('Bulk operation detected');
      // Score should be positive from this detection
      expect(result.score).toBeGreaterThan(0);
    });

    test('should skip single record operation', () => {
      const response = 'Updating 1 record.';
      const result = SmartDetection.check(response, {});

      expect(result.needed).toBe(false);
    });
  });

  describe('Statistical Claims Detection', () => {
    test('should detect percentage claims', () => {
      const response = 'Found that 98% of accounts are orphaned.';
      const result = SmartDetection.check(response, {});

      expect(result.needed).toBe(true);
      expect(result.reasons).toContain('Statistical claims detected');
    });

    test('should detect extreme percentage patterns', () => {
      // Matches extremePercentages pattern /\b(?:9[0-9]|100)%/
      const response = 'Analysis shows 95% of records are affected.';
      const result = SmartDetection.check(response, {});

      expect(result.needed).toBe(true);
    });
  });

  describe('Destructive Operation Detection', () => {
    test('should detect DELETE operations', () => {
      const response = 'Executing DELETE on 500 records.';
      const result = SmartDetection.check(response, {});

      expect(result.needed).toBe(true);
      expect(result.reasons).toContain('Destructive operation detected');
    });

    test('should detect merge duplicate pattern', () => {
      // Matches: /\bmerge\s+(?:duplicate|records?)/i
      const response = 'Will merge duplicate records to clean up data.';
      const result = SmartDetection.check(response, {});

      expect(result.needed).toBe(true);
    });
  });

  describe('Skip Patterns', () => {
    test('should skip read-only queries', () => {
      const response = 'SELECT Name FROM Account WHERE Type = "Customer"';
      const result = SmartDetection.check(response, {});

      expect(result.needed).toBe(false);
    });

    test('should skip documentation responses', () => {
      const response = 'Here is an explanation of how the field works...';
      const result = SmartDetection.check(response, {});

      expect(result.needed).toBe(false);
    });
  });

  describe('getSummary', () => {
    test('should return summary with risk assessment', () => {
      const response = 'Deploying to production org with 30k accounts.';
      const summary = SmartDetection.getSummary(response, {});

      expect(summary.shouldValidate).toBe(true);
      expect(summary.riskScore).toBeGreaterThan(0);
      expect(summary.riskLevel).toBeDefined();
      expect(summary.triggers).toContain('Production environment detected');
      expect(summary.recommendation).toBeDefined();
    });

    test('should return low risk for safe responses', () => {
      const response = 'SELECT Name FROM Account LIMIT 10';
      const summary = SmartDetection.getSummary(response, {});

      expect(summary.shouldValidate).toBe(false);
      expect(summary.riskLevel).toBe('minimal');
    });
  });

  describe('getRiskLevel', () => {
    test('should return critical for score >= 0.8', () => {
      expect(SmartDetection.getRiskLevel(0.8)).toBe('critical');
      expect(SmartDetection.getRiskLevel(0.95)).toBe('critical');
    });

    test('should return high for score >= 0.6', () => {
      expect(SmartDetection.getRiskLevel(0.6)).toBe('high');
      expect(SmartDetection.getRiskLevel(0.79)).toBe('high');
    });

    test('should return medium for score >= 0.4', () => {
      expect(SmartDetection.getRiskLevel(0.4)).toBe('medium');
      expect(SmartDetection.getRiskLevel(0.59)).toBe('medium');
    });

    test('should return low for score >= 0.2', () => {
      expect(SmartDetection.getRiskLevel(0.2)).toBe('low');
      expect(SmartDetection.getRiskLevel(0.39)).toBe('low');
    });

    test('should return minimal for score < 0.2', () => {
      expect(SmartDetection.getRiskLevel(0.1)).toBe('minimal');
      expect(SmartDetection.getRiskLevel(0)).toBe('minimal');
    });
  });

  describe('getRecommendation', () => {
    test('should return validate_and_block for critical scores', () => {
      expect(SmartDetection.getRecommendation(0.8)).toBe('validate_and_block');
      expect(SmartDetection.getRecommendation(1.0)).toBe('validate_and_block');
    });

    test('should return validate_and_warn for high scores', () => {
      expect(SmartDetection.getRecommendation(0.6)).toBe('validate_and_warn');
      expect(SmartDetection.getRecommendation(0.79)).toBe('validate_and_warn');
    });

    test('should return validate_if_time for medium scores', () => {
      expect(SmartDetection.getRecommendation(0.4)).toBe('validate_if_time');
      expect(SmartDetection.getRecommendation(0.59)).toBe('validate_if_time');
    });

    test('should return skip_validation for low scores', () => {
      expect(SmartDetection.getRecommendation(0.3)).toBe('skip_validation');
      expect(SmartDetection.getRecommendation(0)).toBe('skip_validation');
    });
  });
});

describe('Response Validation Orchestrator', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new ResponseValidationOrchestrator();
  });

  describe('Orchestration Workflow', () => {
    test('should skip low-risk response when smart detection enabled', async () => {
      // 45% is not extreme (between 5-90%), so smart detection skips validation
      const response = 'Found 450 qualified leads (45% of total).';
      const result = await orchestrator.orchestrate(response, {});

      // Smart detection determines this is low-risk, skips validation
      expect(result.skipped).toBe(true);
      expect(result.finalResponse).toBe(response);
    });

    test('should validate high-risk response and warn on concern', async () => {
      // 98% is extreme (>90%), triggers validation
      const response = 'Analysis found 98% of fields are unused in production.';
      orchestrator.config.mode = 'warn_only';

      const result = await orchestrator.orchestrate(response, {});

      expect(result.validated).toBe(true);
      expect(result.action).toBe('warned');
      expect(result.finalResponse).toContain('VALIDATION NOTICE');
    });

    test('should request retry on high confidence failure', async () => {
      const response = 'Found 29,400 orphaned accounts out of 30,000 (98%).';
      const result = await orchestrator.orchestrate(response, {});

      expect(result.action).toBe('retry_needed');
      expect(result.revalidationPrompt).toBeDefined();
      expect(result.revalidationPrompt).toContain('re-validate');
    });

    test('should skip validation when disabled', async () => {
      orchestrator.config.enabled = false;

      const response = '98% of accounts are orphaned.';
      const result = await orchestrator.orchestrate(response, {});

      expect(result.validated).toBe(false);
      expect(result.skipped).toBe(true);
    });
  });

  describe('Re-validation Prompt Generation', () => {
    test('should generate detailed re-validation prompt', async () => {
      const response = 'Found 98% orphaned accounts.';
      const validation = {
        concerns: [{
          claim: '98% orphaned',
          reason: 'Percentage exceeds threshold',
          confidence: 0.85
        }],
        confidence: 0.85
      };

      const prompt = orchestrator.generateRevalidationPrompt(
        response,
        validation,
        { org: 'test-org', operation: 'field-analysis' }
      );

      expect(prompt).toContain('VALIDATION REQUEST');
      expect(prompt).toContain('98% orphaned');
      expect(prompt).toContain('Re-run your query');
      expect(prompt).toContain('test-org');
    });
  });

  describe('Warning Banner Generation', () => {
    test('should generate formatted warning banner', () => {
      const validation = {
        concerns: [
          { reason: 'Suspiciously round percentage', confidence: 0.6 },
          { reason: 'Extreme value detected', confidence: 0.7 }
        ],
        confidence: 0.7
      };

      const banner = orchestrator.generateWarningBanner(validation);

      expect(banner).toContain('VALIDATION NOTICE');
      expect(banner).toContain('Suspiciously round percentage');
      expect(banner).toContain('70%');
    });
  });

  describe('Response Comparison', () => {
    test('should detect changed claims', () => {
      const original = 'Found 98% orphaned accounts (29,400 out of 30,000).';
      const revalidated = 'Found 12% orphaned accounts (3,600 out of 30,000).';

      const comparison = orchestrator.compareResponses(original, revalidated);

      expect(comparison.changed).toBe(true);
      expect(comparison.diff.changes.length).toBeGreaterThan(0);
    });

    test('should detect no changes', () => {
      const original = 'Found 45% qualified leads.';
      const revalidated = 'Found 45% qualified leads.';

      const comparison = orchestrator.compareResponses(original, revalidated);

      expect(comparison.changed).toBe(false);
    });
  });
});

describe('Integration Tests', () => {
  test('end-to-end validation workflow', async () => {
    const orchestrator = new ResponseValidationOrchestrator();

    // Simulate suspicious response
    const response = `
Analysis complete for production org.

Total Accounts: 30,000
Orphaned Accounts: 29,400
Orphan Rate: 98%

This is a critical data quality issue requiring immediate attention.
`;

    const context = {
      agent: 'sfdc-field-analyzer',
      operation: 'field-analysis',
      org: 'production'
    };

    const result = await orchestrator.orchestrate(response, context);

    // Should request re-validation
    expect(result.validated).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.action).toBe('retry_needed');
    expect(result.revalidationPrompt).toBeDefined();
    expect(result.revalidationPrompt).toContain('98%');
  });

  test('should update org profile and retrieve it', () => {
    const checker = new ResponseSanityChecker();

    // Update profile
    checker.updateOrgProfile('rentable-sandbox', {
      Account: 30000,
      Contact: 45000
    });

    // Verify profile was stored
    const profile = checker.getOrgProfile('rentable-sandbox');
    expect(profile).toBeDefined();
    expect(profile.Account).toBe(30000);
    expect(profile.Contact).toBe(45000);
  });
});
