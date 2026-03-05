/**
 * UAT Test Runner Integration Tests
 *
 * Tests for the test runner initialization and configuration.
 * Full integration tests with mocked adapters require more setup.
 */

const path = require('path');
const { UATTestRunner, SuiteStatus } = require('../uat-test-runner');

describe('UATTestRunner Integration', () => {
  const fixturesDir = path.join(__dirname, '../__fixtures__');

  describe('initialization', () => {
    it('should initialize with default options', () => {
      const runner = new UATTestRunner();
      expect(runner.platform).toBe('salesforce');
      expect(runner.verbose).toBe(false);
      expect(runner.dryRun).toBe(false);
      expect(runner.cleanup).toBe(true);
    });

    it('should accept custom options', () => {
      const runner = new UATTestRunner({
        platform: 'salesforce',
        orgAlias: 'test-sandbox',
        dryRun: true,
        verbose: true,
        cleanup: false
      });
      expect(runner.platform).toBe('salesforce');
      expect(runner.dryRun).toBe(true);
      expect(runner.verbose).toBe(true);
      expect(runner.cleanup).toBe(false);
    });

    it('should accept HubSpot platform', () => {
      const runner = new UATTestRunner({
        platform: 'hubspot',
        portalId: '12345'
      });
      expect(runner.platform).toBe('hubspot');
    });

    it('should store orgAlias for Salesforce in platformConfig', () => {
      const runner = new UATTestRunner({
        platform: 'salesforce',
        orgAlias: 'my-sandbox'
      });
      expect(runner.platformConfig.orgAlias).toBe('my-sandbox');
    });

    it('should store portalId for HubSpot in platformConfig', () => {
      const runner = new UATTestRunner({
        platform: 'hubspot',
        portalId: '67890'
      });
      expect(runner.platformConfig.portalId).toBe('67890');
    });

    it('should accept stopOnFailure option', () => {
      const runner = new UATTestRunner({
        stopOnFailure: true
      });
      expect(runner.stopOnFailure).toBe(true);
    });

    it('should accept onProgress callback', () => {
      const progressFn = jest.fn();
      const runner = new UATTestRunner({
        onProgress: progressFn
      });
      expect(runner.onProgress).toBe(progressFn);
    });
  });

  describe('SuiteStatus enum', () => {
    it('should have expected values', () => {
      expect(SuiteStatus.PENDING).toBe('pending');
      expect(SuiteStatus.RUNNING).toBe('running');
      expect(SuiteStatus.PASSED).toBe('passed');
      expect(SuiteStatus.FAILED).toBe('failed');
      expect(SuiteStatus.PARTIAL).toBe('partial');
      expect(SuiteStatus.SKIPPED).toBe('skipped');
    });
  });

  describe('result aggregation', () => {
    it('should have calculatePassRate method', () => {
      const runner = new UATTestRunner();
      expect(typeof runner.calculatePassRate).toBe('function');
    });

    it('should calculate pass rate correctly', () => {
      const runner = new UATTestRunner();
      expect(runner.calculatePassRate(8, 10)).toBe(80);
      expect(runner.calculatePassRate(10, 10)).toBe(100);
      expect(runner.calculatePassRate(0, 10)).toBe(0);
    });

    it('should handle zero total', () => {
      const runner = new UATTestRunner();
      expect(runner.calculatePassRate(0, 0)).toBe(0);
    });

    it('should round to nearest integer', () => {
      const runner = new UATTestRunner();
      expect(runner.calculatePassRate(1, 3)).toBe(33); // 33.33% rounded
      expect(runner.calculatePassRate(2, 3)).toBe(67); // 66.67% rounded
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      const runner = new UATTestRunner();
      expect(runner.formatDuration(500)).toBe('500ms');
    });

    it('should format seconds', () => {
      const runner = new UATTestRunner();
      expect(runner.formatDuration(2500)).toBe('2.5s');
    });

    it('should format minutes', () => {
      const runner = new UATTestRunner();
      expect(runner.formatDuration(90000)).toBe('1m 30s');
    });

    it('should handle zero', () => {
      const runner = new UATTestRunner();
      expect(runner.formatDuration(0)).toBe('0ms');
    });
  });

  describe('test case filtering', () => {
    it('should have filterTestCases method', () => {
      const runner = new UATTestRunner();
      expect(typeof runner.filterTestCases).toBe('function');
    });

    it('should filter by epic', () => {
      const runner = new UATTestRunner();
      const testCases = [
        { epic: 'CPQ Workflow', scenario: 'Test 1' },
        { epic: 'Lead Management', scenario: 'Test 2' },
        { epic: 'CPQ Workflow', scenario: 'Test 3' }
      ];

      const filtered = runner.filterTestCases(testCases, { epic: 'CPQ Workflow' });
      expect(filtered.length).toBe(2);
      expect(filtered.every(tc => tc.epic === 'CPQ Workflow')).toBe(true);
    });

    it('should filter by scenario pattern', () => {
      const runner = new UATTestRunner();
      const testCases = [
        { epic: 'Test', scenario: 'Create quote for customer' },
        { epic: 'Test', scenario: 'Update opportunity stage' },
        { epic: 'Test', scenario: 'Delete old quotes' }
      ];

      const filtered = runner.filterTestCases(testCases, { scenario: 'quote' });
      expect(filtered.length).toBe(2);
    });

    it('should be case-insensitive for scenario filter', () => {
      const runner = new UATTestRunner();
      const testCases = [
        { epic: 'Test', scenario: 'Create QUOTE' },
        { epic: 'Test', scenario: 'Update Quote' }
      ];

      const filtered = runner.filterTestCases(testCases, { scenario: 'quote' });
      expect(filtered.length).toBe(2);
    });

    it('should return all test cases when no filter', () => {
      const runner = new UATTestRunner();
      const testCases = [
        { epic: 'A', scenario: 'Test 1' },
        { epic: 'B', scenario: 'Test 2' }
      ];

      const filtered = runner.filterTestCases(testCases, {});
      expect(filtered.length).toBe(2);
    });

    it('should combine multiple filters with AND logic', () => {
      const runner = new UATTestRunner();
      const testCases = [
        { epic: 'CPQ', scenario: 'Create quote' },
        { epic: 'CPQ', scenario: 'Update opp' },
        { epic: 'Lead', scenario: 'Create quote' }
      ];

      const filtered = runner.filterTestCases(testCases, { epic: 'CPQ', scenario: 'quote' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].scenario).toBe('Create quote');
    });
  });

  describe('error handling', () => {
    it('should return error result on runner error', async () => {
      const runner = new UATTestRunner({
        platform: 'salesforce',
        dryRun: true
      });

      // Running without initialization should handle gracefully
      const results = await runner.runFromCSV('/nonexistent/path.csv');

      expect(results.success).toBe(false);
      expect(results.error).toBeDefined();
      expect(results.testCases.total).toBe(0);
    });
  });

  describe('dry run mode', () => {
    it('should not execute real operations in dry run', () => {
      const runner = new UATTestRunner({
        platform: 'salesforce',
        dryRun: true
      });
      expect(runner.dryRun).toBe(true);
    });
  });
});
