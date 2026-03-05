/**
 * Tests for UAT Pre-flight Validator
 *
 * Tests pre-flight validation before test execution including:
 * - Authentication checks
 * - API connectivity verification
 * - Object accessibility checks
 * - Permission validation
 * - Result formatting
 */

const { UATPreflightValidator } = require('../uat-preflight-validator');

// Mock execAsync for testing without actual SF CLI
jest.mock('util', () => ({
  promisify: () => jest.fn()
}));

describe('UATPreflightValidator', () => {
  describe('constructor', () => {
    it('should create validator with default options', () => {
      const validator = new UATPreflightValidator();
      expect(validator.platform).toBe('salesforce');
      expect(validator.verbose).toBe(false);
      expect(validator.timeout).toBe(30000);
    });

    it('should accept custom options', () => {
      const validator = new UATPreflightValidator({
        platform: 'hubspot',
        orgAlias: 'my-sandbox',
        portalId: '12345',
        verbose: true,
        timeout: 60000
      });
      expect(validator.platform).toBe('hubspot');
      expect(validator.orgAlias).toBe('my-sandbox');
      expect(validator.portalId).toBe('12345');
      expect(validator.verbose).toBe(true);
      expect(validator.timeout).toBe(60000);
    });

    it('should accept objects to check', () => {
      const validator = new UATPreflightValidator({
        objectsToCheck: ['Account', 'Opportunity']
      });
      expect(validator.objectsToCheck).toEqual(['Account', 'Opportunity']);
    });
  });

  describe('checkAuthentication()', () => {
    it('should fail when no org alias provided for Salesforce', async () => {
      const validator = new UATPreflightValidator({
        platform: 'salesforce'
      });

      const result = await validator.checkAuthentication();
      expect(result.passed).toBe(false);
      expect(result.message).toContain('No org alias');
      expect(result.suggestion).toBeDefined();
    });

    it('should pass for HubSpot with portal ID', async () => {
      const validator = new UATPreflightValidator({
        platform: 'hubspot',
        portalId: '12345'
      });

      const result = await validator.checkAuthentication();
      expect(result.passed).toBe(true);
      expect(result.message).toContain('HubSpot portal 12345');
    });

    it('should pass for HubSpot without portal ID (default portal)', async () => {
      const validator = new UATPreflightValidator({
        platform: 'hubspot'
      });

      const result = await validator.checkAuthentication();
      expect(result.passed).toBe(true);
      expect(result.message).toContain('default portal');
    });

    it('should pass for unknown platform', async () => {
      const validator = new UATPreflightValidator({
        platform: 'unknown'
      });

      const result = await validator.checkAuthentication();
      expect(result.passed).toBe(true);
      expect(result.message).toContain('unknown platform');
    });

    it('should include duration in result', async () => {
      const validator = new UATPreflightValidator({
        platform: 'hubspot'
      });

      const result = await validator.checkAuthentication();
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkAPIConnectivity()', () => {
    it('should skip for non-Salesforce platforms', async () => {
      const validator = new UATPreflightValidator({
        platform: 'hubspot'
      });

      const result = await validator.checkAPIConnectivity();
      expect(result.passed).toBe(true);
      expect(result.message).toContain('skipped');
    });

    it('should include duration in result', async () => {
      const validator = new UATPreflightValidator({
        platform: 'hubspot'
      });

      const result = await validator.checkAPIConnectivity();
      expect(typeof result.duration).toBe('number');
    });
  });

  describe('checkObjectAccess()', () => {
    it('should skip when no objects specified', async () => {
      const validator = new UATPreflightValidator({
        platform: 'salesforce',
        orgAlias: 'test-org'
      });

      const result = await validator.checkObjectAccess();
      expect(result.passed).toBe(true);
      expect(result.message).toContain('skipped');
    });

    it('should skip for non-Salesforce platforms', async () => {
      const validator = new UATPreflightValidator({
        platform: 'hubspot',
        objectsToCheck: ['Contact', 'Company']
      });

      const result = await validator.checkObjectAccess();
      expect(result.passed).toBe(true);
      expect(result.message).toContain('skipped');
    });
  });

  describe('checkPermissions()', () => {
    it('should pass for non-Salesforce platforms', async () => {
      const validator = new UATPreflightValidator({
        platform: 'hubspot'
      });

      const result = await validator.checkPermissions();
      expect(result.passed).toBe(true);
      expect(result.message).toContain('skipped');
    });
  });

  describe('addObjectsToCheck()', () => {
    it('should add objects to check list', () => {
      const validator = new UATPreflightValidator();
      validator.addObjectsToCheck(['Account', 'Contact']);

      expect(validator.objectsToCheck).toContain('Account');
      expect(validator.objectsToCheck).toContain('Contact');
    });

    it('should return this for chaining', () => {
      const validator = new UATPreflightValidator();
      const result = validator.addObjectsToCheck(['Account']);

      expect(result).toBe(validator);
    });

    it('should deduplicate objects', () => {
      const validator = new UATPreflightValidator({
        objectsToCheck: ['Account']
      });
      validator.addObjectsToCheck(['Account', 'Contact']);

      expect(validator.objectsToCheck.filter(o => o === 'Account').length).toBe(1);
    });
  });

  describe('formatReport()', () => {
    it('should format passed results', () => {
      const validator = new UATPreflightValidator();
      const results = {
        passed: true,
        checks: [
          { name: 'Authentication', passed: true, message: 'Logged in' },
          { name: 'API', passed: true, message: 'Connected' }
        ],
        blockers: [],
        warnings: [],
        duration: 150
      };

      const report = validator.formatReport(results);
      expect(report).toContain('PASSED');
      expect(report).toContain('Authentication');
      expect(report).toContain('150ms');
    });

    it('should format failed results with blockers', () => {
      const validator = new UATPreflightValidator();
      const results = {
        passed: false,
        checks: [
          { name: 'Authentication', passed: false, message: 'Not logged in', suggestion: 'Run sf login' }
        ],
        blockers: ['Not authenticated'],
        warnings: [],
        duration: 100
      };

      const report = validator.formatReport(results);
      expect(report).toContain('FAILED');
      expect(report).toContain('BLOCKERS');
      expect(report).toContain('Not authenticated');
    });

    it('should include suggestions', () => {
      const validator = new UATPreflightValidator();
      const results = {
        passed: false,
        checks: [
          { name: 'Auth', passed: false, message: 'Failed', suggestion: 'Try logging in' }
        ],
        blockers: [],
        warnings: [],
        duration: 50
      };

      const report = validator.formatReport(results);
      expect(report).toContain('SUGGESTIONS');
      expect(report).toContain('Try logging in');
    });

    it('should include warnings', () => {
      const validator = new UATPreflightValidator();
      const results = {
        passed: true,
        checks: [],
        blockers: [],
        warnings: ['Low API quota'],
        duration: 75
      };

      const report = validator.formatReport(results);
      expect(report).toContain('WARNINGS');
      expect(report).toContain('Low API quota');
    });
  });

  describe('runAllChecks() integration', () => {
    it('should return structured results for HubSpot', async () => {
      const validator = new UATPreflightValidator({
        platform: 'hubspot',
        portalId: '12345',
        verbose: false
      });

      const results = await validator.runAllChecks();

      expect(results).toHaveProperty('passed');
      expect(results).toHaveProperty('checks');
      expect(results).toHaveProperty('blockers');
      expect(results).toHaveProperty('warnings');
      expect(results).toHaveProperty('duration');
      expect(Array.isArray(results.checks)).toBe(true);
    });

    it('should fail for Salesforce without org alias', async () => {
      const validator = new UATPreflightValidator({
        platform: 'salesforce',
        verbose: false
      });

      const results = await validator.runAllChecks();

      expect(results.passed).toBe(false);
      expect(results.blockers.length).toBeGreaterThan(0);
    });

    it('should include auth check in results', async () => {
      const validator = new UATPreflightValidator({
        platform: 'hubspot'
      });

      const results = await validator.runAllChecks();
      const authCheck = results.checks.find(c => c.name === 'Authentication');

      expect(authCheck).toBeDefined();
      expect(authCheck.passed).toBe(true);
    });
  });
});
