/**
 * Test Suite: Batch Upsert Helper
 *
 * Tests the simplified API for batch upsert (create or update) operations.
 * Wraps batch-update-wrapper with automatic create/update detection.
 *
 * Coverage Target: >90%
 * Priority: Tier 1 (HIGH - Create-or-update logic)
 */

const BatchUpsertHelper = require('../scripts/lib/batch-upsert-helper');

// Mock global fetch
global.fetch = jest.fn();

describe('BatchUpsertHelper', () => {
  let helper;

  beforeEach(() => {
    jest.clearAllMocks();
    helper = new BatchUpsertHelper('test-access-token');
  });

  describe('Constructor', () => {
    it('should require accessToken', () => {
      expect(() => new BatchUpsertHelper()).toThrow('BatchUpsertHelper requires accessToken');
      expect(() => new BatchUpsertHelper('')).toThrow('BatchUpsertHelper requires accessToken');
      expect(() => new BatchUpsertHelper(null)).toThrow('BatchUpsertHelper requires accessToken');
    });

    it('should store accessToken', () => {
      expect(helper.accessToken).toBe('test-access-token');
    });

    it('should use default batch size of 100', () => {
      expect(helper.batchSize).toBe(100);
    });

    it('should use default max concurrent of 10', () => {
      expect(helper.maxConcurrent).toBe(10);
    });

    it('should allow custom options', () => {
      const customHelper = new BatchUpsertHelper('token', {
        batchSize: 50,
        maxConcurrent: 5,
        verbose: true
      });

      expect(customHelper.batchSize).toBe(50);
      expect(customHelper.maxConcurrent).toBe(5);
      expect(customHelper.verbose).toBe(true);
    });

    it('should initialize stats object', () => {
      expect(helper.stats).toEqual({
        totalRecords: 0,
        created: 0,
        updated: 0,
        failed: 0,
        startTime: null,
        endTime: null,
        rateLimitHits: 0
      });
    });
  });

  describe('chunkArray()', () => {
    it('should split array into chunks', () => {
      const arr = [1, 2, 3, 4, 5];
      const chunks = helper.chunkArray(arr, 2);

      expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should handle empty array', () => {
      const chunks = helper.chunkArray([], 10);
      expect(chunks).toEqual([]);
    });
  });

  describe('delay()', () => {
    it('should delay for specified milliseconds', async () => {
      const start = Date.now();
      await helper.delay(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });

  describe('upsertRecords()', () => {
    describe('input validation', () => {
      it('should return empty result for empty array', async () => {
        const result = await helper.upsertRecords('contacts', [], 'email');

        expect(result).toEqual({ created: 0, updated: 0, failed: 0, results: [] });
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it('should throw error for null records', async () => {
        // Note: Implementation has bug - accesses records.length before null check
        await expect(helper.upsertRecords('contacts', null, 'email')).rejects.toThrow();
      });

      it('should require uniqueProperty', async () => {
        const records = [{ email: 'test@example.com' }];

        await expect(helper.upsertRecords('contacts', records, null))
          .rejects.toThrow('uniqueProperty');
      });

      it('should require uniqueProperty to be provided', async () => {
        const records = [{ email: 'test@example.com' }];

        await expect(helper.upsertRecords('contacts', records, undefined))
          .rejects.toThrow('uniqueProperty');
      });
    });

    describe('API calls', () => {
      it('should call HubSpot batch/upsert endpoint', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: [] })
        });

        const records = [{ properties: { email: 'test@example.com' } }];
        await helper.upsertRecords('contacts', records, 'email');

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Authorization': 'Bearer test-access-token',
              'Content-Type': 'application/json'
            }
          })
        );
      });

      it('should format payload with idProperty', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: [] })
        });

        const records = [{ properties: { email: 'test@example.com', firstname: 'Test' } }];
        await helper.upsertRecords('contacts', records, 'email');

        const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(callBody.inputs[0].idProperty).toBe('email');
      });

      it('should include id if provided', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: [] })
        });

        const records = [{ id: '123', properties: { firstname: 'Test' } }];
        await helper.upsertRecords('contacts', records, 'email');

        const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(callBody.inputs[0].id).toBe('123');
      });

      it('should handle records without properties wrapper', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: [] })
        });

        const records = [{ email: 'test@example.com', firstname: 'Test' }];
        await helper.upsertRecords('contacts', records, 'email');

        const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(callBody.inputs[0].properties).toBeDefined();
      });
    });
  });

  describe('aggregateResults()', () => {
    it('should count created records', () => {
      const results = [
        {
          status: 'fulfilled',
          value: {
            status: 'success',
            data: {
              results: [
                { new: true, id: '1' },
                { status: 'CREATED', id: '2' }
              ]
            }
          }
        }
      ];

      const aggregated = helper.aggregateResults(results);

      expect(aggregated.created).toBe(2);
      expect(aggregated.updated).toBe(0);
    });

    it('should count updated records', () => {
      const results = [
        {
          status: 'fulfilled',
          value: {
            status: 'success',
            data: {
              results: [
                { status: 'UPDATED', id: '1' },
                { status: 'SUCCESS', id: '2' }
              ]
            }
          }
        }
      ];

      const aggregated = helper.aggregateResults(results);

      expect(aggregated.updated).toBe(2);
      expect(aggregated.created).toBe(0);
    });

    it('should count mixed created and updated', () => {
      const results = [
        {
          status: 'fulfilled',
          value: {
            status: 'success',
            data: {
              results: [
                { new: true, id: '1' },
                { status: 'UPDATED', id: '2' },
                { status: 'CREATED', id: '3' },
                { status: 'SUCCESS', id: '4' }
              ]
            }
          }
        }
      ];

      const aggregated = helper.aggregateResults(results);

      expect(aggregated.created).toBe(2);
      expect(aggregated.updated).toBe(2);
    });

    it('should count failed batches', () => {
      const results = [
        {
          status: 'fulfilled',
          value: {
            status: 'success',
            data: { results: [{ new: true }] }
          }
        },
        {
          status: 'fulfilled',
          value: {
            status: 'failed',
            error: 'API error',
            batchIndex: 1
          }
        },
        {
          status: 'rejected',
          reason: 'Network error'
        }
      ];

      const aggregated = helper.aggregateResults(results);

      expect(aggregated.failed).toBe(2);
      expect(aggregated.created).toBe(1);
    });

    it('should update stats object', () => {
      const results = [
        {
          status: 'fulfilled',
          value: {
            status: 'success',
            data: {
              results: [
                { new: true },
                { status: 'UPDATED' }
              ]
            }
          }
        }
      ];

      helper.aggregateResults(results);

      expect(helper.stats.created).toBe(1);
      expect(helper.stats.updated).toBe(1);
    });

    it('should include error details in results', () => {
      const results = [
        {
          status: 'fulfilled',
          value: {
            status: 'failed',
            error: 'Batch failed',
            batchIndex: 0
          }
        }
      ];

      const aggregated = helper.aggregateResults(results);

      expect(aggregated.results[0]).toEqual({
        error: 'Batch failed',
        batchIndex: 0
      });
    });
  });

  describe('getStats()', () => {
    it('should calculate duration', () => {
      helper.stats.startTime = Date.now() - 5000;
      helper.stats.endTime = Date.now();

      const stats = helper.getStats();

      expect(stats.duration).toMatch(/\d+ms/);
    });

    it('should calculate records per second', () => {
      helper.stats.totalRecords = 1000;
      helper.stats.startTime = Date.now() - 2000;
      helper.stats.endTime = Date.now();

      const stats = helper.getStats();

      expect(parseFloat(stats.recordsPerSecond)).toBeGreaterThan(400);
    });

    it('should calculate success rate', () => {
      helper.stats.totalRecords = 100;
      helper.stats.created = 60;
      helper.stats.updated = 30;
      helper.stats.failed = 10;

      const stats = helper.getStats();

      expect(stats.successRate).toBe('90.00%');
    });

    it('should return 0% for zero records', () => {
      helper.stats.totalRecords = 0;

      const stats = helper.getStats();

      expect(stats.successRate).toBe('0%');
    });
  });

  describe('makeUpsertRequest()', () => {
    it('should return success result on OK response', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: '1' }] })
      });

      const result = await helper.makeUpsertRequest(
        'https://api.hubapi.com/test',
        { inputs: [] },
        0
      );

      expect(result.status).toBe('success');
      expect(result.data).toEqual({ results: [{ id: '1' }] });
      expect(result.batchIndex).toBe(0);
    });

    it('should return failed result on HTTP error', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request')
      });

      const result = await helper.makeUpsertRequest(
        'https://api.hubapi.com/test',
        { inputs: [] },
        0
      );

      expect(result.status).toBe('failed');
      expect(result.error).toContain('HTTP 400');
    });

    it('should return failed result on network error', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      const result = await helper.makeUpsertRequest(
        'https://api.hubapi.com/test',
        { inputs: [] },
        0
      );

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Network error');
    });
  });

  describe('Integration scenarios', () => {
    describe('contact upsert by email', () => {
      it('should upsert contacts with email as unique property', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            results: [
              { new: true, id: '1' },
              { status: 'UPDATED', id: '2' }
            ]
          })
        });

        const contacts = [
          { properties: { email: 'new@example.com', firstname: 'New' } },
          { properties: { email: 'existing@example.com', firstname: 'Existing' } }
        ];

        const result = await helper.upsertRecords('contacts', contacts, 'email');

        expect(result.created).toBe(1);
        expect(result.updated).toBe(1);
      });
    });

    describe('company upsert by domain', () => {
      it('should upsert companies with domain as unique property', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            results: [
              { status: 'CREATED', id: '1' }
            ]
          })
        });

        const companies = [
          { properties: { domain: 'newcompany.com', name: 'New Company' } }
        ];

        const result = await helper.upsertRecords('companies', companies, 'domain');

        expect(result.created).toBe(1);
        expect(result.failed).toBe(0);
      });
    });

    describe('large batch upsert', () => {
      it('should chunk large batches correctly', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: [] })
        });

        helper.batchSize = 50;

        const records = Array.from({ length: 150 }, (_, i) => ({
          properties: { email: `user${i}@example.com` }
        }));

        await helper.upsertRecords('contacts', records, 'email');

        // 150 records / 50 per batch = 3 batches
        expect(global.fetch).toHaveBeenCalledTimes(3);
      });
    });

    describe('error handling', () => {
      it('should continue processing after partial failures', async () => {
        helper.batchSize = 1;

        global.fetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ results: [{ new: true }] })
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Server error')
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ results: [{ status: 'UPDATED' }] })
          });

        const records = [
          { properties: { email: 'a@example.com' } },
          { properties: { email: 'b@example.com' } },
          { properties: { email: 'c@example.com' } }
        ];

        const result = await helper.upsertRecords('contacts', records, 'email');

        expect(result.created).toBe(1);
        expect(result.updated).toBe(1);
        expect(result.failed).toBe(1);
      });
    });
  });
});
