/**
 * Tests for UAT HubSpot Adapter
 *
 * Tests HubSpot-specific UAT operations including:
 * - Record CRUD operations via HubSpot API
 * - Field verification with multiple operators
 * - Rollup calculations (associations-based)
 * - Permission checking (scope-based)
 * - Dry run mode
 * - Object name normalization
 */

const https = require('https');
const HubSpotUATAdapter = require('../uat-hubspot-adapter');

// Mock https module
jest.mock('https', () => ({
  request: jest.fn()
}));

/**
 * Helper to mock https.request responses
 */
function mockHttpsResponse(statusCode, body) {
  return (options, callback) => {
    const mockResponse = {
      statusCode,
      on: jest.fn((event, handler) => {
        if (event === 'data') {
          handler(JSON.stringify(body));
        }
        if (event === 'end') {
          handler();
        }
      })
    };

    process.nextTick(() => callback(mockResponse));

    return {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn()
    };
  };
}

/**
 * Helper to mock https.request for DELETE (204 No Content)
 */
function mockDeleteResponse() {
  return (options, callback) => {
    const mockResponse = {
      statusCode: 204,
      on: jest.fn((event, handler) => {
        if (event === 'data') {
          // No data for 204
        }
        if (event === 'end') {
          handler();
        }
      })
    };

    process.nextTick(() => callback(mockResponse));

    return {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn()
    };
  };
}

/**
 * Helper to mock https.request errors
 */
function mockHttpsError(errorMessage) {
  return (options, callback) => {
    const req = {
      on: jest.fn((event, handler) => {
        if (event === 'error') {
          process.nextTick(() => handler(new Error(errorMessage)));
        }
      }),
      write: jest.fn(),
      end: jest.fn()
    };
    return req;
  };
}

describe('HubSpotUATAdapter', () => {
  let adapter;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create adapter with test token
    adapter = new HubSpotUATAdapter({
      accessToken: 'test-token-123',
      portalId: '12345678',
      verbose: false
    });
  });

  describe('constructor', () => {
    it('should create adapter with access token', () => {
      const a = new HubSpotUATAdapter({ accessToken: 'test-token' });
      expect(a.accessToken).toBe('test-token');
    });

    it('should create adapter with portalId', () => {
      const a = new HubSpotUATAdapter({ accessToken: 'test', portalId: '999' });
      expect(a.portalId).toBe('999');
    });

    it('should throw error without access token (when not dry run)', () => {
      expect(() => new HubSpotUATAdapter({})).toThrow('access token is required');
    });

    it('should allow creation without token in dry run mode', () => {
      const a = new HubSpotUATAdapter({ dryRun: true });
      expect(a.dryRun).toBe(true);
    });

    it('should initialize with empty createdRecords array', () => {
      expect(adapter.createdRecords).toEqual([]);
    });

    it('should use environment variable for access token', () => {
      const originalEnv = process.env.HUBSPOT_ACCESS_TOKEN;
      process.env.HUBSPOT_ACCESS_TOKEN = 'env-token';

      const a = new HubSpotUATAdapter({});
      expect(a.accessToken).toBe('env-token');

      process.env.HUBSPOT_ACCESS_TOKEN = originalEnv;
    });
  });

  describe('normalizeObjectName()', () => {
    it('should normalize contact to contacts', () => {
      expect(adapter.normalizeObjectName('contact')).toBe('contacts');
    });

    it('should normalize company to companies', () => {
      expect(adapter.normalizeObjectName('company')).toBe('companies');
    });

    it('should normalize deal to deals', () => {
      expect(adapter.normalizeObjectName('deal')).toBe('deals');
    });

    it('should normalize ticket to tickets', () => {
      expect(adapter.normalizeObjectName('ticket')).toBe('tickets');
    });

    it('should normalize line_item variants', () => {
      expect(adapter.normalizeObjectName('lineitem')).toBe('line_items');
      expect(adapter.normalizeObjectName('line_item')).toBe('line_items');
      expect(adapter.normalizeObjectName('line_items')).toBe('line_items');
    });

    it('should handle case insensitivity', () => {
      expect(adapter.normalizeObjectName('CONTACT')).toBe('contacts');
      expect(adapter.normalizeObjectName('Company')).toBe('companies');
    });

    it('should pass through unknown types', () => {
      expect(adapter.normalizeObjectName('custom_object')).toBe('custom_object');
    });
  });

  describe('dry run mode', () => {
    beforeEach(() => {
      adapter = new HubSpotUATAdapter({ accessToken: 'test', dryRun: true });
    });

    it('should return fake ID for createRecord', async () => {
      const result = await adapter.createRecord('contacts', { email: 'test@test.com' });
      expect(result.success).toBe(true);
      expect(result.id).toMatch(/^DRYRUN_\d+$/);
      expect(result.dryRun).toBe(true);
    });

    it('should return success for updateRecord', async () => {
      const result = await adapter.updateRecord('contacts', '123', { firstname: 'Test' });
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
    });

    it('should return empty record for queryRecord', async () => {
      const result = await adapter.queryRecord('contacts', '123');
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
    });

    it('should return success for deleteRecord', async () => {
      const result = await adapter.deleteRecord('contacts', '123');
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
    });
  });

  describe('generateDryRunId()', () => {
    it('should generate ID with DRYRUN prefix', () => {
      const id = adapter.generateDryRunId('contacts');
      expect(id).toMatch(/^DRYRUN_\d+$/);
    });

    it('should generate unique IDs', () => {
      const id1 = adapter.generateDryRunId('contacts');
      const id2 = adapter.generateDryRunId('contacts');
      expect(id1).not.toBe(id2);
    });
  });

  describe('createRecord()', () => {
    it('should call HubSpot API with correct parameters', async () => {
      https.request.mockImplementation(mockHttpsResponse(200, {
        id: '501',
        properties: { email: 'test@example.com' }
      }));

      const result = await adapter.createRecord('contacts', { email: 'test@example.com' });

      expect(result.success).toBe(true);
      expect(result.id).toBe('501');
      expect(https.request).toHaveBeenCalled();

      const callArgs = https.request.mock.calls[0][0];
      expect(callArgs.method).toBe('POST');
      expect(callArgs.path).toBe('/crm/v3/objects/contacts');
    });

    it('should track created records', async () => {
      https.request.mockImplementation(mockHttpsResponse(200, {
        id: '502',
        properties: {}
      }));

      await adapter.createRecord('contacts', { email: 'test@example.com' });

      expect(adapter.createdRecords.length).toBe(1);
      expect(adapter.createdRecords[0].id).toBe('502');
      expect(adapter.createdRecords[0].objectType).toBe('contacts');
    });

    it('should handle API errors', async () => {
      https.request.mockImplementation(mockHttpsResponse(400, {
        message: 'Invalid email format'
      }));

      const result = await adapter.createRecord('contacts', { email: 'invalid' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid email format');
    });

    it('should normalize object type', async () => {
      https.request.mockImplementation(mockHttpsResponse(200, {
        id: '503',
        properties: {}
      }));

      await adapter.createRecord('company', { name: 'Test Co' });

      const callArgs = https.request.mock.calls[0][0];
      expect(callArgs.path).toBe('/crm/v3/objects/companies');
    });
  });

  describe('updateRecord()', () => {
    it('should call PATCH endpoint', async () => {
      https.request.mockImplementation(mockHttpsResponse(200, {
        id: '123',
        properties: { firstname: 'Updated' }
      }));

      const result = await adapter.updateRecord('contacts', '123', { firstname: 'Updated' });

      expect(result.success).toBe(true);
      const callArgs = https.request.mock.calls[0][0];
      expect(callArgs.method).toBe('PATCH');
      expect(callArgs.path).toBe('/crm/v3/objects/contacts/123');
    });

    it('should handle update errors', async () => {
      https.request.mockImplementation(mockHttpsResponse(404, {
        message: 'Record not found'
      }));

      const result = await adapter.updateRecord('contacts', '999', { firstname: 'Test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Record not found');
    });
  });

  describe('queryRecord()', () => {
    it('should query single record by ID', async () => {
      https.request.mockImplementation(mockHttpsResponse(200, {
        id: '123',
        properties: { email: 'test@test.com', firstname: 'John' }
      }));

      const result = await adapter.queryRecord('contacts', '123');

      expect(result.success).toBe(true);
      expect(result.record.id).toBe('123');
      expect(result.record.email).toBe('test@test.com');
    });

    it('should request specific properties', async () => {
      https.request.mockImplementation(mockHttpsResponse(200, {
        id: '123',
        properties: { email: 'test@test.com' }
      }));

      await adapter.queryRecord('contacts', '123', ['email', 'firstname']);

      const callArgs = https.request.mock.calls[0][0];
      expect(callArgs.path).toContain('properties=email,firstname');
    });

    it('should handle not found', async () => {
      https.request.mockImplementation(mockHttpsResponse(404, {
        message: 'Record not found'
      }));

      const result = await adapter.queryRecord('contacts', '999');

      expect(result.success).toBe(false);
    });
  });

  describe('searchRecords()', () => {
    it('should search with filters', async () => {
      https.request.mockImplementation(mockHttpsResponse(200, {
        results: [
          { id: '1', properties: { email: 'test@test.com' } }
        ],
        total: 1
      }));

      const result = await adapter.searchRecords('contacts', { email: 'test@test.com' });

      expect(result.success).toBe(true);
      expect(result.records.length).toBe(1);
      expect(result.total).toBe(1);
    });

    it('should return empty results in dry run', async () => {
      adapter = new HubSpotUATAdapter({ accessToken: 'test', dryRun: true });

      const result = await adapter.searchRecords('contacts', { email: 'test@test.com' });

      expect(result.success).toBe(true);
      expect(result.records).toEqual([]);
      expect(result.dryRun).toBe(true);
    });
  });

  describe('verifyField()', () => {
    beforeEach(() => {
      https.request.mockImplementation(mockHttpsResponse(200, {
        id: '123',
        properties: { amount: '1000', dealname: 'Test Deal' }
      }));
    });

    it('should verify field equals expected value', async () => {
      const result = await adapter.verifyField('deals', '123', 'amount', '1000');

      expect(result.passed).toBe(true);
      expect(result.actual).toBe('1000');
      expect(result.expected).toBe('1000');
    });

    it('should fail when value does not match', async () => {
      const result = await adapter.verifyField('deals', '123', 'amount', '2000');

      expect(result.passed).toBe(false);
      expect(result.actual).toBe('1000');
      expect(result.expected).toBe('2000');
    });

    it('should handle contains operator', async () => {
      const result = await adapter.verifyField('deals', '123', 'dealname', 'Test', 'contains');

      expect(result.passed).toBe(true);
    });

    it('should handle greaterThan operator', async () => {
      const result = await adapter.verifyField('deals', '123', 'amount', '500', 'greaterThan');

      expect(result.passed).toBe(true);
    });

    it('should handle lessThan operator', async () => {
      const result = await adapter.verifyField('deals', '123', 'amount', '2000', 'lessThan');

      expect(result.passed).toBe(true);
    });
  });

  describe('compareValues()', () => {
    it('should handle equals operator', () => {
      expect(adapter.compareValues('test', 'test', 'equals')).toBe(true);
      expect(adapter.compareValues('test', 'other', 'equals')).toBe(false);
    });

    it('should handle = shorthand', () => {
      expect(adapter.compareValues('100', 100, '=')).toBe(true);
    });

    it('should handle strictEquals', () => {
      expect(adapter.compareValues('100', '100', 'strictEquals')).toBe(true);
      expect(adapter.compareValues('100', 100, 'strictEquals')).toBe(false);
    });

    it('should handle notEquals', () => {
      expect(adapter.compareValues('a', 'b', 'notEquals')).toBe(true);
      expect(adapter.compareValues('a', 'a', 'notEquals')).toBe(false);
    });

    it('should handle greaterThan', () => {
      expect(adapter.compareValues('100', '50', 'greaterThan')).toBe(true);
      expect(adapter.compareValues('50', '100', 'greaterThan')).toBe(false);
    });

    it('should handle lessThan', () => {
      expect(adapter.compareValues('50', '100', 'lessThan')).toBe(true);
    });

    it('should handle greaterOrEqual', () => {
      expect(adapter.compareValues('100', '100', 'greaterOrEqual')).toBe(true);
      expect(adapter.compareValues('101', '100', 'greaterOrEqual')).toBe(true);
    });

    it('should handle lessOrEqual', () => {
      expect(adapter.compareValues('100', '100', 'lessOrEqual')).toBe(true);
      expect(adapter.compareValues('99', '100', 'lessOrEqual')).toBe(true);
    });

    it('should handle contains', () => {
      expect(adapter.compareValues('hello world', 'world', 'contains')).toBe(true);
      expect(adapter.compareValues('hello', 'world', 'contains')).toBe(false);
    });

    it('should handle startsWith', () => {
      expect(adapter.compareValues('hello world', 'hello', 'startsWith')).toBe(true);
    });

    it('should handle endsWith', () => {
      expect(adapter.compareValues('hello world', 'world', 'endsWith')).toBe(true);
    });

    it('should handle isNull', () => {
      expect(adapter.compareValues(null, null, 'isNull')).toBe(true);
      expect(adapter.compareValues(undefined, null, 'isNull')).toBe(true);
      expect(adapter.compareValues('', null, 'isNull')).toBe(true);
      expect(adapter.compareValues('value', null, 'isNull')).toBe(false);
    });

    it('should handle isNotNull', () => {
      expect(adapter.compareValues('value', null, 'isNotNull')).toBe(true);
      expect(adapter.compareValues(null, null, 'isNotNull')).toBe(false);
    });

    it('should handle matches (regex)', () => {
      expect(adapter.compareValues('test123', '\\d+', 'matches')).toBe(true);
      expect(adapter.compareValues('test', '\\d+', 'matches')).toBe(false);
    });

    it('should handle exists', () => {
      expect(adapter.compareValues('value', null, 'exists')).toBe(true);
      expect(adapter.compareValues(0, null, 'exists')).toBe(true);
      expect(adapter.compareValues(null, null, 'exists')).toBe(false);
    });

    it('should handle context variable references', () => {
      expect(adapter.compareValues('anything', '{ContactId}', 'equals')).toBe(true);
    });
  });

  describe('verifyRollup()', () => {
    it('should verify sum rollup', async () => {
      // First call: parent record
      // Second call: associations
      // Third call: batch read children
      let callCount = 0;
      https.request.mockImplementation((options, callback) => {
        callCount++;

        let response;
        if (callCount === 1) {
          // Parent record
          response = { id: '123', properties: { total_value: '300' } };
        } else if (callCount === 2) {
          // Associations
          response = { results: [{ toObjectId: '1' }, { toObjectId: '2' }] };
        } else {
          // Batch read children
          response = {
            results: [
              { id: '1', properties: { amount: '100' } },
              { id: '2', properties: { amount: '200' } }
            ]
          };
        }

        return mockHttpsResponse(200, response)(options, callback);
      });

      const result = await adapter.verifyRollup('companies', '123', 'deals', {
        parentField: 'total_value',
        childField: 'amount',
        type: 'sum'
      });

      expect(result.passed).toBe(true);
      expect(result.calculatedValue).toBe(300);
      expect(result.childCount).toBe(2);
    });

    it('should verify count rollup', async () => {
      let callCount = 0;
      https.request.mockImplementation((options, callback) => {
        callCount++;

        let response;
        if (callCount === 1) {
          response = { id: '123', properties: { deal_count: '3' } };
        } else if (callCount === 2) {
          response = { results: [{ toObjectId: '1' }, { toObjectId: '2' }, { toObjectId: '3' }] };
        } else {
          response = {
            results: [
              { id: '1', properties: {} },
              { id: '2', properties: {} },
              { id: '3', properties: {} }
            ]
          };
        }

        return mockHttpsResponse(200, response)(options, callback);
      });

      const result = await adapter.verifyRollup('companies', '123', 'deals', {
        parentField: 'deal_count',
        childField: 'id',
        type: 'count'
      });

      expect(result.passed).toBe(true);
      expect(result.calculatedValue).toBe(3);
    });

    it('should handle tolerance for currency', async () => {
      let callCount = 0;
      https.request.mockImplementation((options, callback) => {
        callCount++;

        let response;
        if (callCount === 1) {
          response = { id: '123', properties: { total: '100.01' } };
        } else if (callCount === 2) {
          response = { results: [{ toObjectId: '1' }] };
        } else {
          response = { results: [{ id: '1', properties: { amount: '100' } }] };
        }

        return mockHttpsResponse(200, response)(options, callback);
      });

      const result = await adapter.verifyRollup('companies', '123', 'deals', {
        parentField: 'total',
        childField: 'amount',
        type: 'sum',
        tolerance: 0.02
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('checkPermission()', () => {
    it('should check read permission via search API', async () => {
      https.request.mockImplementation(mockHttpsResponse(200, {
        results: [],
        total: 0
      }));

      const result = await adapter.checkPermission('crm.objects.contacts.read', 'contacts', 'read');

      expect(result.allowed).toBe(true);
      expect(result.action).toBe('read');
    });

    it('should return false for write permission in dry run', async () => {
      adapter = new HubSpotUATAdapter({ accessToken: 'test', dryRun: true });

      const result = await adapter.checkPermission('crm.objects.contacts.write', 'contacts', 'write');

      expect(result.allowed).toBe(false);
    });

    it('should handle 403 forbidden', async () => {
      https.request.mockImplementation(mockHttpsResponse(403, {
        message: 'forbidden'
      }));

      const result = await adapter.checkPermission('crm.objects.contacts.read', 'contacts', 'read');

      expect(result.allowed).toBe(false);
    });
  });

  describe('deleteRecord()', () => {
    it('should call DELETE endpoint', async () => {
      https.request.mockImplementation(mockDeleteResponse());

      const result = await adapter.deleteRecord('contacts', '123');

      expect(result.success).toBe(true);
      expect(result.id).toBe('123');

      const callArgs = https.request.mock.calls[0][0];
      expect(callArgs.method).toBe('DELETE');
      expect(callArgs.path).toBe('/crm/v3/objects/contacts/123');
    });

    it('should handle delete errors', async () => {
      https.request.mockImplementation(mockHttpsResponse(404, {
        message: 'Record not found'
      }));

      const result = await adapter.deleteRecord('contacts', '999');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Record not found');
    });
  });

  describe('getRecordUrl()', () => {
    it('should generate contact URL', () => {
      const url = adapter.getRecordUrl('contacts', '123');
      expect(url).toBe('/contacts/12345678/contact/123');
    });

    it('should generate company URL', () => {
      const url = adapter.getRecordUrl('companies', '456');
      expect(url).toBe('/contacts/12345678/company/456');
    });

    it('should generate deal URL', () => {
      const url = adapter.getRecordUrl('deals', '789');
      expect(url).toBe('/contacts/12345678/deal/789');
    });

    it('should normalize object name in URL', () => {
      const url = adapter.getRecordUrl('contact', '123');
      expect(url).toContain('/contact/');
    });
  });

  describe('getInstanceUrl()', () => {
    it('should return HubSpot app URL', async () => {
      const url = await adapter.getInstanceUrl();
      expect(url).toBe('https://app.hubspot.com');
    });
  });

  describe('record tracking', () => {
    it('should track created records', async () => {
      https.request.mockImplementation(mockHttpsResponse(200, {
        id: '123',
        properties: {}
      }));

      await adapter.createRecord('contacts', { email: 'test@test.com' });
      await adapter.createRecord('companies', { name: 'Test Co' });

      const records = adapter.getCreatedRecords();
      expect(records.length).toBe(2);
      expect(records[0].objectType).toBe('contacts');
      expect(records[1].objectType).toBe('companies');
    });

    it('should include createdAt timestamp', async () => {
      https.request.mockImplementation(mockHttpsResponse(200, {
        id: '123',
        properties: {}
      }));

      await adapter.createRecord('contacts', { email: 'test@test.com' });

      const records = adapter.getCreatedRecords();
      expect(records[0].createdAt).toBeDefined();
      expect(new Date(records[0].createdAt)).toBeInstanceOf(Date);
    });
  });

  describe('API error handling', () => {
    it('should handle network errors', async () => {
      https.request.mockImplementation(mockHttpsError('Network error'));

      const result = await adapter.createRecord('contacts', { email: 'test@test.com' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle rate limiting', async () => {
      https.request.mockImplementation(mockHttpsResponse(429, {
        message: 'Rate limit exceeded'
      }));

      const result = await adapter.createRecord('contacts', { email: 'test@test.com' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit');
    });

    it('should handle malformed JSON response', async () => {
      https.request.mockImplementation((options, callback) => {
        const mockResponse = {
          statusCode: 200,
          on: jest.fn((event, handler) => {
            if (event === 'data') {
              handler('not valid json');
            }
            if (event === 'end') {
              handler();
            }
          })
        };

        process.nextTick(() => callback(mockResponse));

        return {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn()
        };
      });

      // Should resolve without crashing
      const result = await adapter.createRecord('contacts', { email: 'test@test.com' });
      expect(result).toBeDefined();
    });
  });

  describe('verbose logging', () => {
    it('should log when verbose is true', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      adapter = new HubSpotUATAdapter({
        accessToken: 'test',
        verbose: true
      });

      https.request.mockImplementation(mockHttpsResponse(200, {
        id: '123',
        properties: {}
      }));

      await adapter.createRecord('contacts', { email: 'test@test.com' });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should not log when verbose is false', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      adapter = new HubSpotUATAdapter({
        accessToken: 'test',
        verbose: false
      });

      https.request.mockImplementation(mockHttpsResponse(200, {
        id: '123',
        properties: {}
      }));

      await adapter.createRecord('contacts', { email: 'test@test.com' });

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
