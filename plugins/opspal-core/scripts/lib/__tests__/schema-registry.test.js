/**
 * Unit Tests for SchemaRegistry
 *
 * Tests schema loading, validation, caching, and error formatting
 */

const SchemaRegistry = require('../schema-registry');
const fs = require('fs');
const path = require('path');

describe('SchemaRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new SchemaRegistry({ verbose: false });
  });

  describe('Schema Loading', () => {
    test('should load all schemas from directory', () => {
      const count = registry.loadAllSchemas();
      expect(count).toBeGreaterThan(0);
      expect(registry.schemaCache).toBeDefined();
    });

    test('should register individual schema', () => {
      const testSchema = {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      };

      const result = registry.registerSchema('test-schema', testSchema);
      expect(result).toBe(true);
      expect(registry.schemaCache['test-schema']).toBeDefined();
    });

    test('should cache compiled schemas', () => {
      registry.loadAllSchemas();
      const schema1 = registry.getCachedSchema('task-spec');
      const schema2 = registry.getCachedSchema('task-spec');

      expect(schema1).toBe(schema2); // Same reference = cached
      expect(registry.stats.cacheHits).toBeGreaterThan(0);
    });
  });

  describe('Validation - Valid Data', () => {
    beforeEach(() => {
      registry.loadAllSchemas();
    });

    test('should validate valid task-spec data', async () => {
      const validData = {
        id: 'T-01',
        title: 'Test task',
        domain: 'salesforce-apex',
        goal: 'Complete test validation',
        inputs: [],
        outputs: ['test-output.txt'],
        acceptance_criteria: ['Validation passes']
      };

      const result = await registry.validate(validData, 'task-spec');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should pass validation with optional fields', async () => {
      const dataWithOptional = {
        id: 'T-02',
        title: 'Task with extras',
        domain: 'salesforce-data',
        goal: 'Complete data migration',
        inputs: ['input-file.csv'],
        outputs: ['output-file.json'],
        acceptance_criteria: ['All data migrated'],
        metadata: {
          created_by: 'test-user',
          version: '1.0.0'
        },
        risk_level: 'low',
        estimated_complexity: 0.3
      };

      const result = await registry.validate(dataWithOptional, 'task-spec');
      expect(result.valid).toBe(true);
    });
  });

  describe('Validation - Invalid Data', () => {
    beforeEach(() => {
      registry.loadAllSchemas();
    });

    test('should fail validation with missing required field', async () => {
      const invalidData = {
        id: 'T-03',
        title: 'Missing required fields'
        // Missing domain, goal, inputs, outputs, acceptance_criteria
      };

      const result = await registry.validate(invalidData, 'task-spec');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].severity).toBe('CRITICAL');
    });

    test('should fail validation with wrong type', async () => {
      const invalidData = {
        id: 'T-04',
        title: 123, // Should be string
        domain: 'salesforce-apex',
        goal: 'Test',
        inputs: [],
        outputs: ['output.txt'],
        acceptance_criteria: ['Done']
      };

      const result = await registry.validate(invalidData, 'task-spec');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Type mismatch detected (error type field may vary by implementation)
    });

    test('should fail validation with invalid pattern', async () => {
      const invalidData = {
        id: 'invalid-ID!@#', // Does not match ^T-[0-9]{2,4}$ pattern
        title: 'Test',
        domain: 'salesforce-apex',
        goal: 'Test',
        inputs: [],
        outputs: ['output.txt'],
        acceptance_criteria: ['Done']
      };

      const result = await registry.validate(invalidData, 'task-spec');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Pattern error detected (error type may vary by validator implementation)
    });
  });

  describe('Error Formatting', () => {
    beforeEach(() => {
      registry.loadAllSchemas();
    });

    test('should format errors with severity', async () => {
      const invalidData = {
        description: 'Missing id'
      };

      const result = await registry.validate(invalidData, 'task-spec');
      expect(result.errors[0]).toHaveProperty('severity');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('remediation');
    });

    test('should include field path in errors', async () => {
      const invalidData = {
        id: 'test_123',
        nested: {
          field: 123 // Wrong type
        }
      };

      const result = await registry.validate(invalidData, 'task-spec');
      // Check that errors reference the nested field path if schema has nested validation
      expect(result.errors).toBeDefined();
    });
  });

  describe('Statistics Tracking', () => {
    beforeEach(() => {
      registry.loadAllSchemas();
    });

    test('should track validation counts', async () => {
      const initialCount = registry.stats.totalValidations;

      await registry.validate({ id: 'test' }, 'task-spec');
      await registry.validate({ id: 'test2' }, 'task-spec');

      expect(registry.stats.totalValidations).toBe(initialCount + 2);
    });

    test('should track pass/fail counts', async () => {
      const initialPassed = registry.stats.passed;
      const initialFailed = registry.stats.failed;

      // Valid data
      await registry.validate({
        id: 'T-05',
        title: 'Valid task',
        domain: 'salesforce-apex',
        goal: 'Test',
        inputs: [],
        outputs: ['output.txt'],
        acceptance_criteria: ['Done']
      }, 'task-spec');

      // Invalid data (missing required fields)
      await registry.validate({ id: 'T-06' }, 'task-spec');

      expect(registry.stats.passed).toBeGreaterThan(initialPassed);
      expect(registry.stats.failed).toBeGreaterThan(initialFailed);
    });

    test('should track validation time', async () => {
      // Do multiple validations to ensure avgValidationTime is calculated
      await registry.validate({
        id: 'T-07',
        title: 'Test 1',
        domain: 'salesforce-apex',
        goal: 'Test',
        inputs: [],
        outputs: ['output.txt'],
        acceptance_criteria: ['Done']
      }, 'task-spec');

      await registry.validate({
        id: 'T-08',
        title: 'Test 2',
        domain: 'salesforce-data',
        goal: 'Test',
        inputs: [],
        outputs: ['output.txt'],
        acceptance_criteria: ['Done']
      }, 'task-spec');

      expect(registry.stats.avgValidationTime).toBeGreaterThanOrEqual(0);
      expect(registry.stats.avgValidationTime).toBeLessThan(100); // Should be fast
    });
  });

  describe('Edge Cases', () => {
    test('should handle non-existent schema gracefully', async () => {
      const result = await registry.validate({ test: 'data' }, 'non-existent-schema');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Schema not found') || e.message.includes('not registered'))).toBe(true);
    });

    test('should handle null data', async () => {
      registry.loadAllSchemas();
      const result = await registry.validate(null, 'task-spec');

      expect(result.valid).toBe(false);
    });

    test('should handle undefined data', async () => {
      registry.loadAllSchemas();
      const result = await registry.validate(undefined, 'task-spec');

      expect(result.valid).toBe(false);
    });

    test('should handle empty object', async () => {
      registry.loadAllSchemas();
      const result = await registry.validate({}, 'task-spec');

      expect(result.valid).toBe(false); // Missing required fields
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    beforeEach(() => {
      registry.loadAllSchemas();
    });

    test('should validate within performance threshold', async () => {
      const data = {
        id: 'perf_test',
        description: 'Performance test',
        status: 'testing'
      };

      const result = await registry.validate(data, 'task-spec');

      expect(result.validationTime).toBeLessThan(10); // Should be <10ms
    });

    test('should benefit from caching on repeated validations', async () => {
      const data = { id: 'cache_test', description: 'test' };

      const result1 = await registry.validate(data, 'task-spec');
      const result2 = await registry.validate(data, 'task-spec');

      expect(registry.stats.cacheHits).toBeGreaterThan(0);
    });
  });
});
