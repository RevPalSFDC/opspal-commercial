/**
 * Test Suite: Batch Associations v4
 *
 * Tests the HubSpot v4 Associations API wrapper with batch operations.
 * v4 API requires BOTH associationCategory AND associationTypeId.
 *
 * Coverage Target: >90%
 * Priority: Tier 1 (HIGH - v4 API quirks, type requirements)
 */

const BatchAssociationsV4 = require('../scripts/lib/batch-associations-v4');
const { ASSOCIATION_TYPES } = require('../scripts/lib/batch-associations-v4');

// Mock global fetch
global.fetch = jest.fn();

describe('BatchAssociationsV4', () => {
  let associator;

  beforeEach(() => {
    jest.clearAllMocks();
    associator = new BatchAssociationsV4('test-access-token');
  });

  describe('Constructor', () => {
    it('should require accessToken', () => {
      expect(() => new BatchAssociationsV4()).toThrow('BatchAssociationsV4 requires accessToken');
      expect(() => new BatchAssociationsV4('')).toThrow('BatchAssociationsV4 requires accessToken');
      expect(() => new BatchAssociationsV4(null)).toThrow('BatchAssociationsV4 requires accessToken');
    });

    it('should store accessToken', () => {
      expect(associator.accessToken).toBe('test-access-token');
    });

    it('should use default batch size of 100', () => {
      expect(associator.batchSize).toBe(100);
    });

    it('should use default max concurrent of 10', () => {
      expect(associator.maxConcurrent).toBe(10);
    });

    it('should allow custom options', () => {
      const custom = new BatchAssociationsV4('token', {
        batchSize: 50,
        maxConcurrent: 5,
        retryAttempts: 5,
        retryDelay: 2000,
        verbose: true
      });

      expect(custom.batchSize).toBe(50);
      expect(custom.maxConcurrent).toBe(5);
      expect(custom.retryAttempts).toBe(5);
      expect(custom.retryDelay).toBe(2000);
      expect(custom.verbose).toBe(true);
    });

    it('should initialize stats object', () => {
      expect(associator.stats).toEqual({
        totalAssociations: 0,
        successfulBatches: 0,
        failedBatches: 0,
        totalApiCalls: 0,
        startTime: null,
        endTime: null,
        rateLimitHits: 0
      });
    });
  });

  describe('ASSOCIATION_TYPES', () => {
    it('should include contact to company types', () => {
      expect(ASSOCIATION_TYPES.CONTACT_TO_COMPANY_PRIMARY).toEqual({
        category: 'HUBSPOT_DEFINED',
        typeId: 1
      });
      expect(ASSOCIATION_TYPES.CONTACT_TO_COMPANY_UNLABELED).toEqual({
        category: 'HUBSPOT_DEFINED',
        typeId: 279
      });
    });

    it('should include company to contact types', () => {
      expect(ASSOCIATION_TYPES.COMPANY_TO_CONTACT_PRIMARY).toEqual({
        category: 'HUBSPOT_DEFINED',
        typeId: 2
      });
    });

    it('should include contact to deal types', () => {
      expect(ASSOCIATION_TYPES.CONTACT_TO_DEAL).toEqual({
        category: 'HUBSPOT_DEFINED',
        typeId: 3
      });
      expect(ASSOCIATION_TYPES.DEAL_TO_CONTACT).toEqual({
        category: 'HUBSPOT_DEFINED',
        typeId: 4
      });
    });

    it('should include company to deal types', () => {
      expect(ASSOCIATION_TYPES.COMPANY_TO_DEAL).toEqual({
        category: 'HUBSPOT_DEFINED',
        typeId: 5
      });
      expect(ASSOCIATION_TYPES.DEAL_TO_COMPANY).toEqual({
        category: 'HUBSPOT_DEFINED',
        typeId: 6
      });
    });

    it('should include deal to line item types', () => {
      expect(ASSOCIATION_TYPES.DEAL_TO_LINE_ITEM).toEqual({
        category: 'HUBSPOT_DEFINED',
        typeId: 19
      });
    });
  });

  describe('static getAssociationType()', () => {
    it('should return association type by name', () => {
      const type = BatchAssociationsV4.getAssociationType('CONTACT_TO_COMPANY_PRIMARY');
      expect(type).toEqual({ category: 'HUBSPOT_DEFINED', typeId: 1 });
    });

    it('should return null for unknown type', () => {
      const type = BatchAssociationsV4.getAssociationType('UNKNOWN_TYPE');
      expect(type).toBeNull();
    });
  });

  describe('static listAssociationTypes()', () => {
    it('should return array of type names', () => {
      const types = BatchAssociationsV4.listAssociationTypes();
      expect(types).toContain('CONTACT_TO_COMPANY_PRIMARY');
      expect(types).toContain('COMPANY_TO_DEAL');
      expect(Array.isArray(types)).toBe(true);
    });
  });

  describe('validateAssociations()', () => {
    it('should pass for valid associations', () => {
      const associations = [{
        fromId: '123',
        toId: '456',
        associationCategory: 'HUBSPOT_DEFINED',
        associationTypeId: 1
      }];

      expect(() => associator.validateAssociations(associations)).not.toThrow();
    });

    it('should throw for missing fromId', () => {
      const associations = [{
        toId: '456',
        associationCategory: 'HUBSPOT_DEFINED',
        associationTypeId: 1
      }];

      expect(() => associator.validateAssociations(associations))
        .toThrow('Missing fromId');
    });

    it('should throw for missing toId', () => {
      const associations = [{
        fromId: '123',
        associationCategory: 'HUBSPOT_DEFINED',
        associationTypeId: 1
      }];

      expect(() => associator.validateAssociations(associations))
        .toThrow('Missing toId');
    });

    it('should throw for missing associationCategory (v4 requirement)', () => {
      const associations = [{
        fromId: '123',
        toId: '456',
        associationTypeId: 1
      }];

      expect(() => associator.validateAssociations(associations))
        .toThrow('Missing associationCategory');
    });

    it('should throw for missing associationTypeId (v4 requirement)', () => {
      const associations = [{
        fromId: '123',
        toId: '456',
        associationCategory: 'HUBSPOT_DEFINED'
      }];

      expect(() => associator.validateAssociations(associations))
        .toThrow('Missing associationTypeId');
    });

    it('should report multiple validation errors', () => {
      const associations = [
        { fromId: '123' }, // Missing toId, category, typeId
        { toId: '456' }    // Missing fromId, category, typeId
      ];

      expect(() => associator.validateAssociations(associations))
        .toThrow(/Association 0/);
    });

    it('should allow associationTypeId of 0', () => {
      const associations = [{
        fromId: '123',
        toId: '456',
        associationCategory: 'HUBSPOT_DEFINED',
        associationTypeId: 0 // Valid - 0 is a valid type ID
      }];

      expect(() => associator.validateAssociations(associations)).not.toThrow();
    });
  });

  describe('batchCreateAssociations()', () => {
    const mockSuccessResponse = () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] })
      });
    };

    describe('input validation', () => {
      it('should throw for missing config fields', async () => {
        await expect(associator.batchCreateAssociations({}))
          .rejects.toThrow('requires fromObjectType, toObjectType, and associations');
      });

      it('should throw for empty associations array', async () => {
        await expect(associator.batchCreateAssociations({
          fromObjectType: 'companies',
          toObjectType: 'contacts',
          associations: []
        })).rejects.toThrow('requires fromObjectType, toObjectType, and associations');
      });
    });

    describe('API calls', () => {
      it('should call v4 batch create endpoint', async () => {
        mockSuccessResponse();

        const config = {
          fromObjectType: 'companies',
          toObjectType: 'contacts',
          associations: [{
            fromId: '123',
            toId: '456',
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 2
          }]
        };

        await associator.batchCreateAssociations(config);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.hubapi.com/crm/v4/associations/companies/contacts/batch/create',
          expect.any(Object)
        );
      });

      it('should format payload correctly for v4 API', async () => {
        mockSuccessResponse();

        const config = {
          fromObjectType: 'companies',
          toObjectType: 'contacts',
          associations: [{
            fromId: '123',
            toId: '456',
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 2
          }]
        };

        await associator.batchCreateAssociations(config);

        const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(callBody.inputs[0]).toEqual({
          from: { id: '123' },
          to: { id: '456' },
          types: [{
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 2
          }]
        });
      });

      it('should convert IDs to strings', async () => {
        mockSuccessResponse();

        const config = {
          fromObjectType: 'companies',
          toObjectType: 'contacts',
          associations: [{
            fromId: 123, // Number
            toId: 456,   // Number
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 2
          }]
        };

        await associator.batchCreateAssociations(config);

        const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(callBody.inputs[0].from.id).toBe('123');
        expect(callBody.inputs[0].to.id).toBe('456');
      });
    });

    describe('batch chunking', () => {
      it('should split large batches', async () => {
        mockSuccessResponse();
        associator.batchSize = 2;

        const associations = Array.from({ length: 5 }, (_, i) => ({
          fromId: `from-${i}`,
          toId: `to-${i}`,
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: 1
        }));

        await associator.batchCreateAssociations({
          fromObjectType: 'companies',
          toObjectType: 'contacts',
          associations
        });

        // 5 associations / 2 per batch = 3 batches
        expect(global.fetch).toHaveBeenCalledTimes(3);
      });
    });

    describe('result aggregation', () => {
      it('should count successful batches', async () => {
        mockSuccessResponse();

        const result = await associator.batchCreateAssociations({
          fromObjectType: 'companies',
          toObjectType: 'contacts',
          associations: [{
            fromId: '1',
            toId: '2',
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 1
          }]
        });

        expect(result.success).toBe(1);
        expect(result.failed).toBe(0);
      });
    });
  });

  describe('batchDeleteAssociations()', () => {
    const mockSuccessResponse = () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] })
      });
    };

    it('should call v4 batch archive endpoint', async () => {
      mockSuccessResponse();

      const config = {
        fromObjectType: 'companies',
        toObjectType: 'contacts',
        associations: [{
          fromId: '123',
          toId: '456',
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: 2
        }]
      };

      await associator.batchDeleteAssociations(config);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hubapi.com/crm/v4/associations/companies/contacts/batch/archive',
        expect.any(Object)
      );
    });

    it('should throw for missing config fields', async () => {
      await expect(associator.batchDeleteAssociations({}))
        .rejects.toThrow('requires fromObjectType, toObjectType, and associations');
    });
  });

  describe('makeRequest()', () => {
    it('should retry on failure', async () => {
      global.fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [] })
        });

      associator.retryDelay = 10;
      associator.retryAttempts = 3;

      const result = await associator.makeRequest(
        'https://api.hubapi.com/test',
        { inputs: [] },
        'POST',
        0,
        'create'
      );

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result.status).toBe('success');
    });

    it('should fail after max retries', async () => {
      global.fetch.mockRejectedValue(new Error('Persistent error'));

      associator.retryDelay = 10;
      associator.retryAttempts = 2;

      const result = await associator.makeRequest(
        'https://api.hubapi.com/test',
        { inputs: [] },
        'POST',
        0,
        'create'
      );

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Persistent error');
    });

    it('should handle HTTP errors', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request: Missing associationTypeId')
      });

      associator.retryAttempts = 1;

      const result = await associator.makeRequest(
        'https://api.hubapi.com/test',
        { inputs: [] },
        'POST',
        0,
        'create'
      );

      expect(result.status).toBe('failed');
      expect(result.error).toContain('HTTP 400');
    });
  });

  describe('getStats()', () => {
    it('should calculate associations per second', () => {
      associator.stats.totalAssociations = 1000;
      associator.stats.startTime = Date.now() - 2000;
      associator.stats.endTime = Date.now();

      const stats = associator.getStats();

      expect(parseFloat(stats.associationsPerSecond)).toBeGreaterThan(400);
    });

    it('should calculate success rate', () => {
      associator.stats.successfulBatches = 9;
      associator.stats.failedBatches = 1;

      const stats = associator.getStats();

      expect(stats.successRate).toBe('90.00%');
    });
  });

  describe('chunkArray()', () => {
    it('should split array correctly', () => {
      const arr = [1, 2, 3, 4, 5];
      const chunks = associator.chunkArray(arr, 2);

      expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle company-to-contact associations', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: '1' }, { id: '2' }] })
      });

      // Note: ASSOCIATION_TYPES uses 'category' and 'typeId' keys
      // but validation expects 'associationCategory' and 'associationTypeId'
      const type = ASSOCIATION_TYPES.COMPANY_TO_CONTACT_PRIMARY;
      const result = await associator.batchCreateAssociations({
        fromObjectType: 'companies',
        toObjectType: 'contacts',
        associations: [
          {
            fromId: 'company-1',
            toId: 'contact-1',
            associationCategory: type.category,
            associationTypeId: type.typeId
          },
          {
            fromId: 'company-1',
            toId: 'contact-2',
            associationCategory: type.category,
            associationTypeId: type.typeId
          }
        ]
      });

      expect(result.success).toBe(1);
    });
  });
});
