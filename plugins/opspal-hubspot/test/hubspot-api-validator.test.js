/**
 * Test Suite: HubSpot API Validator
 *
 * Tests the pre-flight validation library for HubSpot API calls.
 * Validates payloads before API calls to catch quirks early and
 * prevent 400/422 API errors.
 *
 * Coverage Target: >90%
 * Priority: Tier 1 (HIGH - Prevents API errors)
 */

const hubspotValidator = require('../scripts/lib/hubspot-api-validator');

describe('HubSpotAPIValidator', () => {
  describe('validateAssociationPayload()', () => {
    describe('inputs array validation', () => {
      it('should reject payload without inputs array', () => {
        const result = hubspotValidator.validateAssociationPayload({});

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing inputs array');
      });

      it('should reject payload with null inputs', () => {
        const result = hubspotValidator.validateAssociationPayload({ inputs: null });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing inputs array');
      });

      it('should reject payload with non-array inputs', () => {
        const result = hubspotValidator.validateAssociationPayload({ inputs: 'not-array' });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing inputs array');
      });

      it('should accept payload with empty inputs array', () => {
        const result = hubspotValidator.validateAssociationPayload({ inputs: [] });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('types array validation', () => {
      it('should reject input without types array', () => {
        const payload = {
          inputs: [
            { from: { id: '123' }, to: { id: '456' } }
          ]
        };

        const result = hubspotValidator.validateAssociationPayload(payload);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Input 0: Missing types array');
      });

      it('should reject input with null types', () => {
        const payload = {
          inputs: [
            { from: { id: '123' }, to: { id: '456' }, types: null }
          ]
        };

        const result = hubspotValidator.validateAssociationPayload(payload);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Input 0: Missing types array');
      });

      it('should accept input with empty types array', () => {
        const payload = {
          inputs: [
            { from: { id: '123' }, to: { id: '456' }, types: [] }
          ]
        };

        const result = hubspotValidator.validateAssociationPayload(payload);

        expect(result.valid).toBe(true);
      });
    });

    describe('v4 API required fields', () => {
      it('should reject type without associationCategory', () => {
        const payload = {
          inputs: [{
            from: { id: '123' },
            to: { id: '456' },
            types: [{
              associationTypeId: 1
            }]
          }]
        };

        const result = hubspotValidator.validateAssociationPayload(payload);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          'Input 0, type 0: Missing associationCategory (required for v4)'
        );
      });

      it('should reject type without associationTypeId', () => {
        const payload = {
          inputs: [{
            from: { id: '123' },
            to: { id: '456' },
            types: [{
              associationCategory: 'HUBSPOT_DEFINED'
            }]
          }]
        };

        const result = hubspotValidator.validateAssociationPayload(payload);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          'Input 0, type 0: Missing associationTypeId'
        );
      });

      it('should reject type missing both fields', () => {
        const payload = {
          inputs: [{
            from: { id: '123' },
            to: { id: '456' },
            types: [{}]
          }]
        };

        const result = hubspotValidator.validateAssociationPayload(payload);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(2);
        expect(result.errors).toContain(
          'Input 0, type 0: Missing associationCategory (required for v4)'
        );
        expect(result.errors).toContain(
          'Input 0, type 0: Missing associationTypeId'
        );
      });

      it('should accept valid v4 association payload', () => {
        const payload = {
          inputs: [{
            from: { id: '123' },
            to: { id: '456' },
            types: [{
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 1
            }]
          }]
        };

        const result = hubspotValidator.validateAssociationPayload(payload);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('multiple inputs validation', () => {
      it('should validate all inputs in batch', () => {
        const payload = {
          inputs: [
            {
              from: { id: '1' },
              to: { id: '2' },
              types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }]
            },
            {
              from: { id: '3' },
              to: { id: '4' },
              types: [{ associationTypeId: 2 }] // Missing category
            },
            {
              from: { id: '5' },
              to: { id: '6' },
              types: [{ associationCategory: 'USER_DEFINED' }] // Missing typeId
            }
          ]
        };

        const result = hubspotValidator.validateAssociationPayload(payload);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(2);
        expect(result.errors).toContain(
          'Input 1, type 0: Missing associationCategory (required for v4)'
        );
        expect(result.errors).toContain(
          'Input 2, type 0: Missing associationTypeId'
        );
      });

      it('should validate multiple types within single input', () => {
        const payload = {
          inputs: [{
            from: { id: '123' },
            to: { id: '456' },
            types: [
              { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 },
              { associationTypeId: 2 }, // Missing category
              { associationCategory: 'USER_DEFINED', associationTypeId: 3 }
            ]
          }]
        };

        const result = hubspotValidator.validateAssociationPayload(payload);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors).toContain(
          'Input 0, type 1: Missing associationCategory (required for v4)'
        );
      });
    });
  });

  describe('validateListOperators()', () => {
    describe('basic filter validation', () => {
      it('should accept empty filter object', () => {
        const result = hubspotValidator.validateListOperators({});

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should accept filter with no filters array', () => {
        const result = hubspotValidator.validateListOperators({
          filterBranchType: 'AND'
        });

        expect(result.valid).toBe(true);
      });
    });

    describe('nested OR inside AND detection', () => {
      it('should warn about nested OR inside AND', () => {
        const filters = {
          filterBranchType: 'AND',
          filterBranches: [{
            filterBranchType: 'OR',
            filterType: 'PROPERTY',
            filters: []
          }]
        };

        const result = hubspotValidator.validateListOperators(filters);

        expect(result.warnings).toContainEqual(
          expect.stringContaining('Nested OR inside AND not supported via API')
        );
      });

      it('should not warn for ASSOCIATION filter type', () => {
        const filters = {
          filterBranchType: 'AND',
          filterBranches: [{
            filterBranchType: 'OR',
            filterType: 'ASSOCIATION',
            filters: []
          }]
        };

        const result = hubspotValidator.validateListOperators(filters);

        expect(result.warnings.filter(w => w.includes('Nested OR'))).toHaveLength(0);
      });

      it('should not warn for UNIFIED_EVENTS filter type', () => {
        const filters = {
          filterBranchType: 'AND',
          filterBranches: [{
            filterBranchType: 'OR',
            filterType: 'UNIFIED_EVENTS',
            filters: []
          }]
        };

        const result = hubspotValidator.validateListOperators(filters);

        expect(result.warnings.filter(w => w.includes('Nested OR'))).toHaveLength(0);
      });
    });

    describe('recursive filter validation', () => {
      it('should validate deeply nested filters', () => {
        const filters = {
          filterBranchType: 'AND',
          filterBranches: [{
            filterBranchType: 'OR',
            filterType: 'ASSOCIATION',
            filterBranches: [{
              filterBranchType: 'AND',
              filters: []
            }]
          }]
        };

        const result = hubspotValidator.validateListOperators(filters);

        // Should complete without errors
        expect(result.errors).toHaveLength(0);
      });

      it('should validate OR branch recursively', () => {
        const filters = {
          filterBranchType: 'OR',
          filterBranches: [{
            filterBranchType: 'AND',
            filters: []
          }]
        };

        const result = hubspotValidator.validateListOperators(filters);

        expect(result.valid).toBe(true);
      });
    });

    describe('operator mappings loading', () => {
      it('should handle missing operator mappings file gracefully', () => {
        const filters = {
          filters: [{
            property: 'email',
            propertyType: 'STRING',
            operator: 'EQ'
          }]
        };

        const result = hubspotValidator.validateListOperators(filters);

        // When operator mappings file is missing, it adds a warning and skips validation
        // OR if mappings exist but operator not found, it adds an error
        // Either way, the function should complete without throwing
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
      });

      it('should return result with all expected properties', () => {
        const filters = {};

        const result = hubspotValidator.validateListOperators(filters);

        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
        expect(Array.isArray(result.errors)).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
      });
    });
  });

  describe('validateBulkOperation()', () => {
    describe('DELETE operation validation', () => {
      it('should require backup for DELETE operations', () => {
        const result = hubspotValidator.validateBulkOperation({
          action: 'DELETE',
          count: 10,
          validated: true
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('DELETE operations require backup file path');
      });

      it('should require validation checkpoint for DELETE operations', () => {
        const result = hubspotValidator.validateBulkOperation({
          action: 'DELETE',
          count: 10,
          backup: '/path/to/backup.json'
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          'DELETE operations require validation checkpoint (e.g., associations transferred)'
        );
      });

      it('should accept valid DELETE operation', () => {
        const result = hubspotValidator.validateBulkOperation({
          action: 'DELETE',
          count: 10,
          backup: '/path/to/backup.json',
          validated: true
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should report both errors if both missing', () => {
        const result = hubspotValidator.validateBulkOperation({
          action: 'DELETE',
          count: 10
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(2);
      });
    });

    describe('confirmation requirement', () => {
      it('should require confirmation for operations over 100 records', () => {
        const result = hubspotValidator.validateBulkOperation({
          action: 'UPDATE',
          count: 101
        });

        expect(result.requiresConfirmation).toBe(true);
      });

      it('should not require confirmation for 100 or fewer records', () => {
        const result = hubspotValidator.validateBulkOperation({
          action: 'UPDATE',
          count: 100
        });

        expect(result.requiresConfirmation).toBe(false);
      });

      it('should not require confirmation for small operations', () => {
        const result = hubspotValidator.validateBulkOperation({
          action: 'UPDATE',
          count: 10
        });

        expect(result.requiresConfirmation).toBe(false);
      });
    });

    describe('non-DELETE operations', () => {
      it('should accept UPDATE operation without backup', () => {
        const result = hubspotValidator.validateBulkOperation({
          action: 'UPDATE',
          count: 50
        });

        expect(result.valid).toBe(true);
      });

      it('should accept CREATE operation without validation', () => {
        const result = hubspotValidator.validateBulkOperation({
          action: 'CREATE',
          count: 50
        });

        expect(result.valid).toBe(true);
      });
    });
  });

  describe('logValidation()', () => {
    let consoleSpy;
    let errorSpy;
    let warnSpy;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should log success for valid result', () => {
      hubspotValidator.logValidation('Association', {
        valid: true,
        errors: []
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Association validation passed')
      );
    });

    it('should log errors for invalid result', () => {
      hubspotValidator.logValidation('Association', {
        valid: false,
        errors: ['Error 1', 'Error 2']
      });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Association validation failed')
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error 1')
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error 2')
      );
    });

    it('should log warnings when present', () => {
      hubspotValidator.logValidation('List', {
        valid: true,
        errors: [],
        warnings: ['Warning 1']
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('List warnings')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning 1')
      );
    });

    it('should not log warnings when array is empty', () => {
      hubspotValidator.logValidation('List', {
        valid: true,
        errors: [],
        warnings: []
      });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should not log warnings when not present', () => {
      hubspotValidator.logValidation('List', {
        valid: true,
        errors: []
      });

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Integration scenarios', () => {
    describe('company-to-contact association flow', () => {
      it('should validate complete association batch', () => {
        const batchPayload = {
          inputs: [
            {
              from: { id: 'company-1' },
              to: { id: 'contact-1' },
              types: [{
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 2
              }]
            },
            {
              from: { id: 'company-1' },
              to: { id: 'contact-2' },
              types: [{
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 2
              }]
            }
          ]
        };

        const result = hubspotValidator.validateAssociationPayload(batchPayload);

        expect(result.valid).toBe(true);
      });
    });

    describe('bulk delete with safety checks', () => {
      it('should enforce all safety requirements for delete', () => {
        // First attempt - missing requirements
        const attempt1 = hubspotValidator.validateBulkOperation({
          action: 'DELETE',
          count: 500
        });

        expect(attempt1.valid).toBe(false);
        expect(attempt1.requiresConfirmation).toBe(true);

        // Second attempt - with backup but no validation
        const attempt2 = hubspotValidator.validateBulkOperation({
          action: 'DELETE',
          count: 500,
          backup: '/backups/companies-2024-01-15.json'
        });

        expect(attempt2.valid).toBe(false);

        // Third attempt - all requirements met
        const attempt3 = hubspotValidator.validateBulkOperation({
          action: 'DELETE',
          count: 500,
          backup: '/backups/companies-2024-01-15.json',
          validated: true
        });

        expect(attempt3.valid).toBe(true);
        expect(attempt3.requiresConfirmation).toBe(true);
      });
    });
  });
});
