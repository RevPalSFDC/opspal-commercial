/**
 * two-phase-migration.test.js
 *
 * Tests for TwoPhaseMigration - safe migration pattern: Migrate → Validate → Delete
 */

describe('TwoPhaseMigration', () => {
  let migration;
  let validator;
  let fs;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock fs before requiring module
    jest.doMock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(true),
      mkdirSync: jest.fn(),
      writeFileSync: jest.fn()
    }));

    // Mock validator before requiring module
    jest.doMock('../universal-schema-validator', () => ({
      validateAgainstSchema: jest.fn().mockReturnValue({ valid: true, errors: [] })
    }));

    // Now require the module
    migration = require('../two-phase-migration');
    validator = require('../universal-schema-validator');
    fs = require('fs');

    // Suppress console output during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
  });

  describe('executePhase1', () => {
    it('should migrate valid records', async () => {
      const records = [
        { id: 1, name: 'Record 1' },
        { id: 2, name: 'Record 2' }
      ];
      const schema = { properties: { id: { type: 'integer' }, name: { type: 'string' } } };

      const result = await migration.executePhase1({
        records,
        schema,
        transformFn: (r) => r,
        sourceName: 'source',
        targetName: 'target',
        options: {}
      });

      expect(result.success).toBe(true);
      expect(result.migrated.length).toBe(2);
      expect(result.failed.length).toBe(0);
    });

    it('should track failed records on validation error', async () => {
      validator.validateAgainstSchema.mockReturnValue({
        valid: false,
        errors: ['Invalid field type']
      });

      const records = [{ id: 1, name: 'Record 1' }];
      const schema = {};

      const result = await migration.executePhase1({
        records,
        schema,
        transformFn: (r) => r,
        sourceName: 'source',
        targetName: 'target',
        options: {}
      });

      expect(result.success).toBe(false);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0].errors).toContain('Invalid field type');
    });

    it('should catch transform errors', async () => {
      const records = [{ id: 1 }];
      const schema = {};

      const result = await migration.executePhase1({
        records,
        schema,
        transformFn: () => { throw new Error('Transform failed'); },
        sourceName: 'source',
        targetName: 'target',
        options: {}
      });

      expect(result.success).toBe(false);
      expect(result.failed[0].errors).toContain('Transform failed');
    });

    it('should include summary statistics', async () => {
      const records = [{ id: 1 }, { id: 2 }, { id: 3 }];

      // First two pass, third fails
      validator.validateAgainstSchema
        .mockReturnValueOnce({ valid: true, errors: [] })
        .mockReturnValueOnce({ valid: true, errors: [] })
        .mockReturnValueOnce({ valid: false, errors: ['Error'] });

      const result = await migration.executePhase1({
        records,
        schema: {},
        transformFn: (r) => r,
        sourceName: 'source',
        targetName: 'target',
        options: {}
      });

      expect(result.summary.total).toBe(3);
      expect(result.summary.migrated).toBe(2);
      expect(result.summary.failed).toBe(1);
      expect(result.summary.successRate).toBe(67);
    });

    it('should apply transform function', async () => {
      const records = [{ id: 1, value: 10 }];
      const transformFn = (r) => ({ ...r, value: r.value * 2 });

      const result = await migration.executePhase1({
        records,
        schema: {},
        transformFn,
        sourceName: 'source',
        targetName: 'target',
        options: {}
      });

      expect(result.migrated[0].target.value).toBe(20);
    });
  });

  describe('validationCheckpoint', () => {
    it('should pass when record counts match and validations pass', async () => {
      const sourceRecords = [{ id: 1 }, { id: 2 }];
      const migratedRecords = [
        { source: { id: 1 }, target: { id: 1 } },
        { source: { id: 2 }, target: { id: 2 } }
      ];

      const result = await migration.validationCheckpoint({
        migratedRecords,
        sourceRecords,
        validationFn: () => ({ valid: true }),
        sourceName: 'source',
        targetName: 'target'
      });

      expect(result.valid).toBe(true);
      expect(result.checks).toContain('record_count');
      expect(result.checks).toContain('custom_validation');
    });

    it('should fail on record count mismatch', async () => {
      const sourceRecords = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const migratedRecords = [{ source: { id: 1 }, target: { id: 1 } }];

      const result = await migration.validationCheckpoint({
        migratedRecords,
        sourceRecords,
        validationFn: () => ({ valid: true }),
        sourceName: 'source',
        targetName: 'target'
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Record count mismatch');
    });

    it('should fail when custom validation fails', async () => {
      const sourceRecords = [{ id: 1 }];
      const migratedRecords = [{ source: { id: 1 }, target: { id: 1 } }];

      const result = await migration.validationCheckpoint({
        migratedRecords,
        sourceRecords,
        validationFn: () => ({ valid: false, errors: ['Custom validation failed'] }),
        sourceName: 'source',
        targetName: 'target'
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe('Custom validation failed');
    });

    it('should use default error message for custom validation', async () => {
      const sourceRecords = [{ id: 1 }];
      const migratedRecords = [{ source: { id: 1 }, target: { id: 1 } }];

      const result = await migration.validationCheckpoint({
        migratedRecords,
        sourceRecords,
        validationFn: () => ({ valid: false }),  // No errors array
        sourceName: 'source',
        targetName: 'target'
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe('Custom validation failed');
    });
  });

  describe('verifyDataIntegrity', () => {
    it('should detect null values in migrated data', () => {
      const migratedRecords = [
        { target: { id: 1, name: null } }
      ];
      const sourceRecords = [{ id: 1, name: 'Test' }];

      const errors = migration.verifyDataIntegrity(migratedRecords, sourceRecords);

      expect(errors.some(e => e.includes('null values'))).toBe(true);
    });

    it('should detect undefined values', () => {
      const migratedRecords = [
        { target: { id: 1, name: undefined } }
      ];
      const sourceRecords = [{ id: 1, name: 'Test' }];

      const errors = migration.verifyDataIntegrity(migratedRecords, sourceRecords);

      expect(errors.some(e => e.includes('null values'))).toBe(true);
    });

    it('should detect type inconsistencies', () => {
      const migratedRecords = [
        { target: { id: '1' } }  // string instead of number
      ];
      const sourceRecords = [{ id: 1 }];  // number

      const errors = migration.verifyDataIntegrity(migratedRecords, sourceRecords);

      expect(errors.some(e => e.includes('Type inconsistencies'))).toBe(true);
    });

    it('should pass for valid data', () => {
      const migratedRecords = [
        { target: { id: 1, name: 'Test' } }
      ];
      const sourceRecords = [{ id: 1, name: 'Test' }];

      const errors = migration.verifyDataIntegrity(migratedRecords, sourceRecords);

      expect(errors.length).toBe(0);
    });

    it('should handle empty records', () => {
      const errors = migration.verifyDataIntegrity([], []);
      expect(errors.length).toBe(0);
    });
  });

  describe('executePhase2', () => {
    it('should fail without delete function', async () => {
      const result = await migration.executePhase2({
        records: [{ id: 1 }],
        deleteSourceFn: null,
        sourceName: 'source',
        targetName: 'target'
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No delete function provided');
    });

    it('should execute delete function', async () => {
      const records = [{ id: 1 }, { id: 2 }];
      const deleteSourceFn = jest.fn().mockResolvedValue(records);

      const result = await migration.executePhase2({
        records,
        deleteSourceFn,
        sourceName: 'source',
        targetName: 'target'
      });

      expect(result.success).toBe(true);
      expect(result.deleted.length).toBe(2);
      expect(deleteSourceFn).toHaveBeenCalledWith(records);
    });

    it('should handle delete function errors', async () => {
      const deleteSourceFn = jest.fn().mockRejectedValue(new Error('Delete failed'));

      const result = await migration.executePhase2({
        records: [{ id: 1 }],
        deleteSourceFn,
        sourceName: 'source',
        targetName: 'target'
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Delete failed');
    });

    it('should handle non-array delete return', async () => {
      const records = [{ id: 1 }];
      const deleteSourceFn = jest.fn().mockResolvedValue(true);  // Returns boolean

      const result = await migration.executePhase2({
        records,
        deleteSourceFn,
        sourceName: 'source',
        targetName: 'target'
      });

      expect(result.success).toBe(true);
      expect(result.deleted).toEqual(records);  // Falls back to records array
    });
  });

  describe('createRollbackPlan', () => {
    it('should create rollback plan file', () => {
      const phase1Result = {
        migrated: [{ source: { id: 1 }, target: { id: 1 } }],
        summary: { total: 1, migrated: 1, failed: 0 }
      };

      const plan = migration.createRollbackPlan(phase1Result, '/tmp/rollback.json');

      expect(plan.migratedRecords).toEqual(phase1Result.migrated);
      expect(plan.instructions).toBeDefined();
      expect(plan.timestamp).toBeDefined();
    });

    it('should include rollback instructions', () => {
      const phase1Result = { migrated: [], summary: {} };
      const plan = migration.createRollbackPlan(phase1Result, '/tmp/rollback.json');

      expect(plan.instructions.length).toBeGreaterThan(0);
      expect(plan.instructions.some(i => i.includes('rollback'))).toBe(true);
    });
  });

  describe('execute (full workflow)', () => {
    it('should complete full migration with phase2Confirmed', async () => {
      const records = [{ id: 1 }];
      const schema = {};
      const deleteSourceFn = jest.fn().mockResolvedValue(records);

      const result = await migration.execute({
        sourceName: 'source',
        targetName: 'target',
        records,
        schema,
        transformFn: (r) => r,
        validationFn: () => ({ valid: true }),
        deleteSourceFn,
        options: { phase2Confirmed: true, skipPhase2Confirmation: true }
      });

      expect(result.success).toBe(true);
      expect(result.phase1.migrated.length).toBe(1);
      expect(result.phase2.deleted.length).toBe(1);
      expect(result.summary.migrated).toBe(1);
    });

    it('should stop at phase1 on validation failure', async () => {
      validator.validateAgainstSchema.mockReturnValue({
        valid: false,
        errors: ['Validation error']
      });

      const result = await migration.execute({
        sourceName: 'source',
        targetName: 'target',
        records: [{ id: 1 }],
        schema: {},
        options: {}
      });

      expect(result.success).toBe(false);
      expect(result.phase).toBe('phase1');
      expect(result.phase2).toBeNull();
    });

    it('should pause at confirmation checkpoint when not confirmed', async () => {
      const result = await migration.execute({
        sourceName: 'source',
        targetName: 'target',
        records: [{ id: 1 }],
        schema: {},
        validationFn: () => ({ valid: true }),
        options: { phase2Confirmed: false }
      });

      expect(result.success).toBe(false);
      expect(result.phase).toBe('confirmation');
      expect(result.message).toContain('confirmation');
    });

    it('should stop at validation checkpoint on failure', async () => {
      const result = await migration.execute({
        sourceName: 'source',
        targetName: 'target',
        records: [{ id: 1 }],
        schema: {},
        transformFn: (r) => r,
        validationFn: () => ({ valid: false, errors: ['Validation failed'] }),
        options: {}
      });

      expect(result.success).toBe(false);
      expect(result.phase).toBe('validation');
    });

    it('should handle phase2 failure', async () => {
      const deleteSourceFn = jest.fn().mockRejectedValue(new Error('Delete error'));

      const result = await migration.execute({
        sourceName: 'source',
        targetName: 'target',
        records: [{ id: 1 }],
        schema: {},
        transformFn: (r) => r,
        validationFn: () => ({ valid: true }),
        deleteSourceFn,
        options: { phase2Confirmed: true, skipPhase2Confirmation: true }
      });

      expect(result.success).toBe(false);
      expect(result.phase).toBe('phase2');
    });

    it('should use default transformFn if not provided', async () => {
      const records = [{ id: 1 }];
      const deleteSourceFn = jest.fn().mockResolvedValue(records);

      const result = await migration.execute({
        sourceName: 'source',
        targetName: 'target',
        records,
        schema: {},
        deleteSourceFn,
        options: { phase2Confirmed: true, skipPhase2Confirmation: true }
      });

      expect(result.success).toBe(true);
    });
  });
});
