/**
 * Unit Tests for ToolContractValidator
 *
 * Tests tool contract validation for Salesforce and other platform tools
 */

const ToolContractValidator = require('../tool-contract-validator');

describe('ToolContractValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new ToolContractValidator({ verbose: false });
    validator.loadContracts();
  });

  describe('Contract Loading', () => {
    test('should load contracts from directory', () => {
      const contracts = validator.listContracts();
      expect(contracts).toBeDefined();
      expect(Array.isArray(contracts)).toBe(true);
      expect(contracts.length).toBeGreaterThan(0);
    });

    test('should load sf_data_query contract', () => {
      const contracts = validator.listContracts();
      expect(contracts).toContain('sf_data_query');
    });
  });

  describe('sf_data_query Validation', () => {
    test('should pass validation with valid params', async () => {
      const params = {
        query: 'SELECT Id, Name FROM Account'
      };

      const result = await validator.validate('sf_data_query', params);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail validation with missing required query param', async () => {
      const params = {
        'target-org': 'my-org'
      };

      const result = await validator.validate('sf_data_query', params);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'missing_required')).toBe(true);
    });

    test('should warn when querying metadata without --use-tooling-api', async () => {
      const params = {
        query: 'SELECT Id, DeveloperName FROM FlowDefinitionView'
      };

      const result = await validator.validate('sf_data_query', params);
      expect(result.valid).toBe(false); // CRITICAL error
      expect(result.errors.some(e =>
        e.message.includes('use-tooling-api') || e.message.includes('tooling')
      )).toBe(true);
    });

    test('should pass validation with metadata query and --use-tooling-api', async () => {
      const params = {
        query: 'SELECT Id, DeveloperName FROM FlowDefinitionView',
        'use-tooling-api': true
      };

      const result = await validator.validate('sf_data_query', params);
      expect(result.valid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle non-existent tool', async () => {
      const result = await validator.validate('non_existent_tool', {});

      expect(result.valid).toBe(true); // No contract = pass with warning
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('should handle empty params', async () => {
      const result = await validator.validate('sf_data_query', {});

      expect(result.valid).toBe(false); // Missing required query
    });
  });

  describe('Performance', () => {
    test('should validate within performance threshold', async () => {
      const params = {
        query: 'SELECT Id FROM Account'
      };

      const result = await validator.validate('sf_data_query', params);

      expect(result.validationTime).toBeLessThan(5); // Should be <5ms
    });
  });
});
