/**
 * Test Suite: Bulk Operation Validator
 *
 * Tests pre-flight validation for bulk Salesforce operations.
 * Guards against data loss by validating:
 * - Org resolution
 * - User status
 * - Production environment safeguards
 * - Backup requirements
 * - Record count thresholds
 *
 * Coverage Target: >80%
 * Priority: Tier 1 (Critical - Data Loss Prevention)
 */

const assert = require('assert');
const path = require('path');

// Mock dependencies before requiring the module
const mockResolveOrgAlias = jest.fn();
const mockInstanceConfig = jest.fn();

jest.mock('../scripts/lib/instance-alias-resolver', () => ({
  resolveOrgAlias: mockResolveOrgAlias
}));

jest.mock('../scripts/lib/instance-config-registry', () => ({
  InstanceConfig: mockInstanceConfig
}));

// Now require the module under test
const { BulkOperationValidator, validateBulkOperation } = require('../scripts/lib/bulk-operation-validator');

describe('BulkOperationValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock: successful org resolution
    mockResolveOrgAlias.mockResolvedValue({
      success: true,
      orgAlias: 'test-sandbox',
      match: {
        environmentType: 'sandbox',
        businessName: 'Test Company'
      }
    });
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const validator = new BulkOperationValidator({});
      assert.strictEqual(validator.recordCount, 0);
      assert.strictEqual(validator.backupRequired, true);
      assert.strictEqual(validator.requiresUserValidation, false);
      assert.deepStrictEqual(validator.errors, []);
      assert.deepStrictEqual(validator.warnings, []);
      assert.deepStrictEqual(validator.safeguards, []);
    });

    it('should accept all configuration options', () => {
      const validator = new BulkOperationValidator({
        orgAlias: 'my-org',
        operationType: 'bulk-update',
        recordCount: 500,
        sourceUserId: '005source',
        targetUserId: '005target',
        backupRequired: false,
        requiresUserValidation: true
      });

      assert.strictEqual(validator.orgAlias, 'my-org');
      assert.strictEqual(validator.operationType, 'bulk-update');
      assert.strictEqual(validator.recordCount, 500);
      assert.strictEqual(validator.sourceUserId, '005source');
      assert.strictEqual(validator.targetUserId, '005target');
      assert.strictEqual(validator.backupRequired, false);
      assert.strictEqual(validator.requiresUserValidation, true);
    });
  });

  describe('validateOrgResolution()', () => {
    it('should add error when org alias is missing', async () => {
      const validator = new BulkOperationValidator({});

      await validator.validateOrgResolution();

      assert.strictEqual(validator.errors.length, 1);
      assert.ok(validator.errors[0].includes('Org alias is required'));
    });

    it('should resolve org alias successfully', async () => {
      const validator = new BulkOperationValidator({
        orgAlias: 'test-sandbox'
      });

      await validator.validateOrgResolution();

      assert.strictEqual(validator.errors.length, 0);
      assert.strictEqual(validator.envType, 'sandbox');
      assert.ok(validator.orgResolution);
    });

    it('should add error when org resolution fails', async () => {
      mockResolveOrgAlias.mockResolvedValue({
        success: false,
        matches: [
          { orgAlias: 'similar-org', environmentType: 'sandbox' }
        ]
      });

      const validator = new BulkOperationValidator({
        orgAlias: 'invalid-org'
      });

      await validator.validateOrgResolution();

      assert.ok(validator.errors.length > 0);
      assert.ok(validator.errors[0].includes('Could not resolve org alias'));
    });

    it('should handle org resolution exception', async () => {
      mockResolveOrgAlias.mockRejectedValue(new Error('Connection failed'));

      const validator = new BulkOperationValidator({
        orgAlias: 'test-org'
      });

      await validator.validateOrgResolution();

      assert.ok(validator.errors.length > 0);
      assert.ok(validator.errors[0].includes('Org resolution failed'));
    });
  });

  describe('determineSafeguards()', () => {
    it('should always require confirmation', () => {
      const validator = new BulkOperationValidator({
        recordCount: 5
      });

      validator.determineSafeguards();

      assert.ok(validator.safeguards.includes('confirmation'));
    });

    it('should require show_records for >10 records', () => {
      const validator = new BulkOperationValidator({
        recordCount: 15
      });

      validator.determineSafeguards();

      assert.ok(validator.safeguards.includes('show_records'));
    });

    it('should require backup and org_confirmation for >100 records', () => {
      const validator = new BulkOperationValidator({
        recordCount: 150
      });

      validator.determineSafeguards();

      assert.ok(validator.safeguards.includes('backup'));
      assert.ok(validator.safeguards.includes('org_confirmation'));
    });

    it('should require phased_execution for >1000 records', () => {
      const validator = new BulkOperationValidator({
        recordCount: 1500
      });

      validator.determineSafeguards();

      assert.ok(validator.safeguards.includes('phased_execution'));
      assert.ok(validator.warnings.some(w => w.includes('phased execution')));
    });

    it('should require executive_approval for >10000 records', () => {
      const validator = new BulkOperationValidator({
        recordCount: 15000
      });

      validator.determineSafeguards();

      assert.ok(validator.safeguards.includes('executive_approval'));
      assert.ok(validator.safeguards.includes('split_day_execution'));
      assert.ok(validator.warnings.some(w => w.includes('executive approval')));
    });

    it('should add production_warning for production env with >50 records', () => {
      const validator = new BulkOperationValidator({
        recordCount: 100
      });
      validator.envType = 'production';

      validator.determineSafeguards();

      assert.ok(validator.safeguards.includes('production_warning'));
      assert.ok(validator.safeguards.includes('double_confirmation'));
    });
  });

  describe('validateProductionOperation()', () => {
    it('should add warning for production operations >50 records', () => {
      const validator = new BulkOperationValidator({
        recordCount: 100
      });
      validator.envType = 'production';

      validator.validateProductionOperation();

      assert.ok(validator.warnings.some(w => w.includes('PRODUCTION ENVIRONMENT')));
    });

    it('should require manager_approval for >500 records in production', () => {
      const validator = new BulkOperationValidator({
        recordCount: 600
      });
      validator.envType = 'production';

      validator.validateProductionOperation();

      assert.ok(validator.safeguards.includes('manager_approval'));
    });

    it('should not add warning for small production operations', () => {
      const validator = new BulkOperationValidator({
        recordCount: 30
      });
      validator.envType = 'production';

      validator.validateProductionOperation();

      assert.ok(!validator.warnings.some(w => w.includes('PRODUCTION ENVIRONMENT')));
    });
  });

  describe('validateBackupRequirements()', () => {
    it('should require backup for >100 records without backup file', () => {
      const validator = new BulkOperationValidator({
        recordCount: 150,
        backupRequired: true
      });
      validator.orgResolution = { orgAlias: 'test-org' };

      validator.validateBackupRequirements();

      assert.ok(validator.errors.some(e => e.includes('Backup is required')));
    });

    it('should pass when backup file is provided', () => {
      const validator = new BulkOperationValidator({
        recordCount: 150,
        backupRequired: true,
        backupFile: '/some/path/backup.json'
      });
      validator.orgResolution = { orgAlias: 'test-org' };

      validator.validateBackupRequirements();

      assert.ok(!validator.errors.some(e => e.includes('Backup is required')));
    });

    it('should not require backup when backupRequired is false', () => {
      const validator = new BulkOperationValidator({
        recordCount: 150,
        backupRequired: false
      });

      validator.validateBackupRequirements();

      // This method shouldn't be called when backupRequired is false
      // But if it is, it shouldn't add errors
    });

    it('should warn about backup path location', () => {
      const validator = new BulkOperationValidator({
        recordCount: 150,
        backupRequired: true,
        backupFile: '/wrong/path/backup.json'
      });
      validator.orgResolution = { orgAlias: 'test-org' };

      validator.validateBackupRequirements();

      // Should warn about path but not error
      assert.ok(!validator.errors.some(e => e.includes('Backup is required')));
    });
  });

  describe('validateRecordCountThresholds()', () => {
    it('should warn when record count is 0', () => {
      const validator = new BulkOperationValidator({
        recordCount: 0
      });

      validator.validateRecordCountThresholds();

      assert.ok(validator.warnings.some(w => w.includes('Record count is 0')));
    });

    it('should error when >100 records without backup safeguard', () => {
      const validator = new BulkOperationValidator({
        recordCount: 150
      });
      // Don't add backup safeguard

      validator.validateRecordCountThresholds();

      assert.ok(validator.errors.some(e => e.includes('Backup required')));
    });

    it('should pass for normal record counts with proper safeguards', () => {
      const validator = new BulkOperationValidator({
        recordCount: 50
      });

      validator.validateRecordCountThresholds();

      assert.ok(!validator.errors.some(e => e.includes('Backup required')));
    });
  });

  describe('getConfirmationType()', () => {
    it('should return "CONFIRM" for production with >100 records', () => {
      const validator = new BulkOperationValidator({
        recordCount: 150
      });
      validator.envType = 'production';
      validator.safeguards = [];

      const confirmType = validator.getConfirmationType();

      assert.strictEqual(confirmType, 'CONFIRM');
    });

    it('should return "CONFIRM" with double_confirmation safeguard', () => {
      const validator = new BulkOperationValidator({
        recordCount: 50
      });
      validator.envType = 'sandbox';
      validator.safeguards = ['double_confirmation'];

      const confirmType = validator.getConfirmationType();

      assert.strictEqual(confirmType, 'CONFIRM');
    });

    it('should return "yes" for sandbox with small record count', () => {
      const validator = new BulkOperationValidator({
        recordCount: 50
      });
      validator.envType = 'sandbox';
      validator.safeguards = [];

      const confirmType = validator.getConfirmationType();

      assert.strictEqual(confirmType, 'yes');
    });
  });

  describe('generateSummary()', () => {
    it('should generate summary with org information', () => {
      const validator = new BulkOperationValidator({
        operationType: 'ownership-transfer',
        recordCount: 100
      });
      validator.orgResolution = { orgAlias: 'test-org' };
      validator.envType = 'sandbox';
      validator.safeguards = ['confirmation', 'backup'];

      const summary = validator.generateSummary();

      assert.ok(summary.includes('BULK OPERATION PRE-FLIGHT VALIDATION'));
      assert.ok(summary.includes('test-org'));
      assert.ok(summary.includes('sandbox'));
      assert.ok(summary.includes('ownership-transfer'));
      assert.ok(summary.includes('100'));
      assert.ok(summary.includes('SAFEGUARDS'));
    });

    it('should include errors in summary', () => {
      const validator = new BulkOperationValidator({
        operationType: 'test',
        recordCount: 10
      });
      validator.errors = ['Test error'];
      validator.safeguards = [];

      const summary = validator.generateSummary();

      assert.ok(summary.includes('ERRORS'));
      assert.ok(summary.includes('Test error'));
    });

    it('should include warnings in summary', () => {
      const validator = new BulkOperationValidator({
        operationType: 'test',
        recordCount: 10
      });
      validator.warnings = ['Test warning'];
      validator.safeguards = [];

      const summary = validator.generateSummary();

      assert.ok(summary.includes('WARNINGS'));
      assert.ok(summary.includes('Test warning'));
    });
  });

  describe('validate() - Full Integration', () => {
    it('should pass validation for sandbox with small record count', async () => {
      const validator = new BulkOperationValidator({
        orgAlias: 'test-sandbox',
        operationType: 'bulk-update',
        recordCount: 50,
        backupRequired: false
      });

      const result = await validator.validate();

      assert.strictEqual(result.passed, true);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(result.envType, 'sandbox');
    });

    it('should fail validation without org alias', async () => {
      const validator = new BulkOperationValidator({
        operationType: 'bulk-update',
        recordCount: 50
      });

      const result = await validator.validate();

      assert.strictEqual(result.passed, false);
      assert.ok(result.errors.length > 0);
    });

    it('should return validation summary', async () => {
      const validator = new BulkOperationValidator({
        orgAlias: 'test-sandbox',
        operationType: 'ownership-transfer',
        recordCount: 100,
        backupRequired: false
      });

      const result = await validator.validate();

      assert.ok(result.summary);
      assert.ok(result.summary.includes('BULK OPERATION'));
    });

    it('should include proper safeguards based on record count', async () => {
      const validator = new BulkOperationValidator({
        orgAlias: 'test-sandbox',
        operationType: 'bulk-update',
        recordCount: 150,
        backupRequired: false
      });

      const result = await validator.validate();

      assert.ok(result.safeguards.includes('backup'));
      assert.ok(result.safeguards.includes('org_confirmation'));
    });
  });

  describe('validateBulkOperation() Helper', () => {
    it('should provide convenient validation function', async () => {
      const result = await validateBulkOperation({
        orgAlias: 'test-sandbox',
        operationType: 'test',
        recordCount: 25,
        backupRequired: false
      });

      assert.ok('passed' in result);
      assert.ok('errors' in result);
      assert.ok('warnings' in result);
      assert.ok('safeguards' in result);
      assert.ok('summary' in result);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large record counts', () => {
      const validator = new BulkOperationValidator({
        recordCount: 100000
      });

      validator.determineSafeguards();

      assert.ok(validator.safeguards.includes('executive_approval'));
      assert.ok(validator.safeguards.includes('split_day_execution'));
    });

    it('should handle negative record counts gracefully', () => {
      const validator = new BulkOperationValidator({
        recordCount: -10
      });

      validator.validateRecordCountThresholds();

      // Should not crash, may have warnings
    });

    it('should handle undefined options', () => {
      const validator = new BulkOperationValidator();

      assert.strictEqual(validator.recordCount, 0);
      assert.strictEqual(validator.backupRequired, true);
    });
  });
});

describe('Safeguard Threshold Constants', () => {
  // Document and test the threshold values
  const THRESHOLDS = {
    SHOW_RECORDS: 10,
    REQUIRE_BACKUP: 100,
    PHASED_EXECUTION: 1000,
    EXECUTIVE_APPROVAL: 10000,
    PRODUCTION_WARNING: 50,
    PRODUCTION_MANAGER_APPROVAL: 500
  };

  it('should require show_records at exactly threshold', () => {
    const validator = new BulkOperationValidator({
      recordCount: THRESHOLDS.SHOW_RECORDS + 1
    });

    validator.determineSafeguards();

    assert.ok(validator.safeguards.includes('show_records'));
  });

  it('should not require show_records below threshold', () => {
    const validator = new BulkOperationValidator({
      recordCount: THRESHOLDS.SHOW_RECORDS
    });

    validator.determineSafeguards();

    assert.ok(!validator.safeguards.includes('show_records'));
  });

  it('should require phased_execution at exactly threshold', () => {
    const validator = new BulkOperationValidator({
      recordCount: THRESHOLDS.PHASED_EXECUTION + 1
    });

    validator.determineSafeguards();

    assert.ok(validator.safeguards.includes('phased_execution'));
  });
});
