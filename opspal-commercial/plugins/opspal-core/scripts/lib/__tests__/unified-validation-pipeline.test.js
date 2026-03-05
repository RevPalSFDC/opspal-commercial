/**
 * Unit Tests for UnifiedValidationPipeline
 *
 * Tests pipeline orchestration and stage execution
 */

const UnifiedValidationPipeline = require('../unified-validation-pipeline');

describe('UnifiedValidationPipeline', () => {
  let pipeline;

  beforeEach(() => {
    pipeline = new UnifiedValidationPipeline({ verbose: false });
  });

  describe('Pipeline Initialization', () => {
    test('should initialize with default config', () => {
      expect(pipeline.config).toBeDefined();
      expect(pipeline.validators).toBeDefined();
      expect(pipeline.stats).toBeDefined();
    });

    test('should load validators', () => {
      expect(pipeline.validators.schema).toBeDefined();
      expect(pipeline.validators.parse).toBeDefined();
      expect(pipeline.validators.toolContract).toBeDefined();
    });
  });

  describe('Stage Determination', () => {
    test('should determine schema stage when schemaName provided', () => {
      const context = {
        type: 'reflection',
        data: { test: 'data' },
        schemaName: 'task-spec'
      };

      const stages = pipeline.determineStages(context);
      expect(stages.some(s => s.name === 'schema')).toBe(true);
    });

    test('should determine parse stage when format provided', () => {
      const context = {
        type: 'data',
        data: '{"test": "data"}',
        format: 'json'
      };

      const stages = pipeline.determineStages(context);
      expect(stages.some(s => s.name === 'parse')).toBe(true);
    });

    test('should determine tool contract stage when toolName provided', () => {
      const context = {
        type: 'tool',
        toolName: 'sf_data_query',
        toolParams: { query: 'SELECT Id FROM Account' }
      };

      const stages = pipeline.determineStages(context);
      expect(stages.some(s => s.name === 'toolContract')).toBe(true);
    });
  });

  describe('Validation - Simple Cases', () => {
    test('should validate tool contract successfully', async () => {
      const context = {
        type: 'tool',
        toolName: 'sf_data_query',
        toolParams: {
          query: 'SELECT Id FROM Account'
        }
      };

      const result = await pipeline.validate(context);
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('blocked');
      expect(result).toHaveProperty('stages');
      expect(result).toHaveProperty('summary');
    });

    test('should block on CRITICAL tool contract errors', async () => {
      const context = {
        type: 'tool',
        toolName: 'sf_data_query',
        toolParams: {
          query: 'SELECT Id FROM FlowDefinitionView' // Missing --use-tooling-api
        }
      };

      const result = await pipeline.validate(context);
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.summary.criticalErrors).toBeGreaterThan(0);
    });
  });

  describe('Validation - Complex Cases', () => {
    test('should validate multiple stages in parallel', async () => {
      const context = {
        type: 'data',
        data: { id: 'test_123', description: 'Test' },
        schemaName: 'task-spec',
        toolName: 'sf_data_query',
        toolParams: { query: 'SELECT Id FROM Account' }
      };

      const result = await pipeline.validate(context);
      expect(Object.keys(result.stages).length).toBeGreaterThan(1);
    });

    test('should short-circuit on CRITICAL errors when enabled', async () => {
      // Configure to block on CRITICAL
      pipeline.config.stages.toolContract.blocking = true;

      const context = {
        type: 'tool',
        toolName: 'sf_data_query',
        toolParams: {
          query: 'SELECT Id FROM FlowDefinitionView' // CRITICAL error
        }
      };

      const result = await pipeline.validate(context);
      expect(result.blocked).toBe(true);
    });
  });

  describe('Result Aggregation', () => {
    test('should aggregate errors from all stages', async () => {
      const context = {
        type: 'tool',
        toolName: 'sf_data_query',
        toolParams: {} // Missing query
      };

      const result = await pipeline.validate(context);
      expect(result.errors).toBeDefined();
      expect(result.summary.totalErrors).toBeGreaterThan(0);
    });

    test('should calculate worst severity', async () => {
      const context = {
        type: 'tool',
        toolName: 'sf_data_query',
        toolParams: {} // Missing query - CRITICAL
      };

      const result = await pipeline.validate(context);
      expect(result.summary.worstSeverity).toBe('CRITICAL');
    });
  });

  describe('Statistics Tracking', () => {
    test('should track validation counts', async () => {
      const initialCount = pipeline.stats.totalValidations;

      await pipeline.validate({
        type: 'tool',
        toolName: 'sf_data_query',
        toolParams: { query: 'SELECT Id FROM Account' }
      });

      expect(pipeline.stats.totalValidations).toBe(initialCount + 1);
    });

    test('should track pass/fail counts', async () => {
      const initialPassed = pipeline.stats.passed;
      const initialFailed = pipeline.stats.failed;

      // Pass
      await pipeline.validate({
        type: 'tool',
        toolName: 'sf_data_query',
        toolParams: { query: 'SELECT Id FROM Account' }
      });

      // Fail
      await pipeline.validate({
        type: 'tool',
        toolName: 'sf_data_query',
        toolParams: {} // Missing query
      });

      expect(pipeline.stats.passed).toBeGreaterThan(initialPassed);
      expect(pipeline.stats.failed).toBeGreaterThan(initialFailed);
    });
  });

  describe('Performance', () => {
    test('should validate within timeout threshold', async () => {
      const context = {
        type: 'tool',
        toolName: 'sf_data_query',
        toolParams: { query: 'SELECT Id FROM Account' }
      };

      const result = await pipeline.validate(context);
      expect(result.validationTime).toBeLessThan(500); // <500ms
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty context', async () => {
      const result = await pipeline.validate({});
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('blocked');
    });

    test('should handle invalid context gracefully', async () => {
      const result = await pipeline.validate({ type: 'unknown' });
      expect(result).toHaveProperty('valid');
    });
  });
});
