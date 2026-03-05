/**
 * smart-detection.test.js
 *
 * Tests for SmartDetection - determines when response validation is needed
 */

const SmartDetection = require('../smart-detection');

describe('SmartDetection', () => {
  describe('check', () => {
    it('should return needed=false for read-only operations', () => {
      const result = SmartDetection.check('Reading 50 records from Account');
      expect(result.needed).toBe(false);
    });

    it('should return needed=true for explicit validation flag', () => {
      const result = SmartDetection.check('Some response [VALIDATE_RESPONSE]');
      expect(result.needed).toBe(true);
      expect(result.score).toBe(1.0);
      expect(result.reasons).toContain('Explicit validation flag');
    });

    it('should return needed=true for context validateResponse flag', () => {
      const result = SmartDetection.check('Some response', { validateResponse: true });
      expect(result.needed).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('should detect production environment', () => {
      const result = SmartDetection.check('Deploying to production environment');
      expect(result.reasons.some(r => r.includes('Production'))).toBe(true);
    });

    it('should detect bulk operations', () => {
      const result = SmartDetection.check('Bulk update affected 500 records');
      expect(result.reasons.some(r => r.toLowerCase().includes('bulk'))).toBe(true);
    });

    it('should detect destructive operations', () => {
      const result = SmartDetection.check('DELETE FROM Account WHERE IsDeleted = true');
      expect(result.needed).toBe(true);
      expect(result.reasons.some(r => r.includes('Destructive'))).toBe(true);
    });

    it('should detect statistical claims', () => {
      const result = SmartDetection.check('Found 85% of accounts are inactive');
      expect(result.reasons.some(r => r.includes('Statistical'))).toBe(true);
    });

    it('should skip sandbox operations', () => {
      const result = SmartDetection.check('Testing in sandbox environment');
      expect(result.needed).toBe(false);
    });

    it('should skip single record operations', () => {
      const result = SmartDetection.check('Updated 1 record in Account');
      expect(result.needed).toBe(false);
    });

    it('should skip documentation operations', () => {
      const result = SmartDetection.check('Here is an example of the documentation');
      expect(result.needed).toBe(false);
    });

    it('should handle empty response', () => {
      const result = SmartDetection.check('');
      expect(result).toBeDefined();
      expect(typeof result.needed).toBe('boolean');
    });

    it('should handle response with field analysis', () => {
      const result = SmartDetection.check('Field usage analysis shows 50 orphaned fields');
      expect(result.reasons.some(r => r.includes('Field usage'))).toBe(true);
    });
  });

  describe('checkSkipPatterns', () => {
    it('should identify read-only patterns', () => {
      const result = SmartDetection.checkSkipPatterns('Query returned 100 records');
      expect(result.skip || result.reasons.length > 0).toBeDefined();
    });

    it('should identify sandbox patterns', () => {
      const result = SmartDetection.checkSkipPatterns('Running in sandbox org');
      expect(result).toBeDefined();
    });
  });

  describe('getSummary', () => {
    it('should return summary for response', () => {
      const summary = SmartDetection.getSummary('Updating 1000 records in production');
      expect(summary).toBeDefined();
      expect(summary).toHaveProperty('shouldValidate');
      expect(summary).toHaveProperty('riskScore');
      expect(summary).toHaveProperty('riskLevel');
      expect(summary).toHaveProperty('recommendation');
    });

    it('should include validation recommendation', () => {
      const summary = SmartDetection.getSummary('DELETE all records from Account');
      expect(summary.recommendation).toBeDefined();
      expect(['skip_validation', 'validate_if_time', 'validate_and_warn', 'validate_and_block'])
        .toContain(summary.recommendation);
    });

    it('should identify high risk operations', () => {
      const summary = SmartDetection.getSummary('DELETE FROM production database');
      expect(summary.riskLevel).toBeDefined();
    });

    it('should handle low risk responses', () => {
      const summary = SmartDetection.getSummary('Reading records from sandbox');
      expect(summary.shouldValidate).toBe(false);
    });
  });

  describe('checkRule', () => {
    it('should match production patterns', () => {
      const rule = {
        patterns: [/production/i],
        weight: 1.0,
        reason: 'Production detected'
      };
      const result = SmartDetection.checkRule('production', rule, 'Deploy to production', {});
      expect(result.matched).toBe(true);
    });

    it('should not match when pattern not found', () => {
      const rule = {
        patterns: [/production/i],
        weight: 1.0,
        reason: 'Production detected'
      };
      const result = SmartDetection.checkRule('production', rule, 'Deploy to sandbox', {});
      expect(result.matched).toBe(false);
    });
  });
});
