/**
 * Tests for UAT Salesforce Adapter
 *
 * Tests Salesforce-specific UAT operations including:
 * - Record CRUD operations (create, read, update, delete)
 * - Field verification
 * - Rollup verification
 * - Permission checking
 * - Dry run mode
 * - Object name normalization
 */

const SalesforceUATAdapter = require('../uat-salesforce-adapter');

// Mock child_process exec
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

const { exec } = require('child_process');
const { promisify } = require('util');

// Helper to create mock exec response
function mockExecResponse(result) {
  return (cmd, opts, callback) => {
    if (typeof opts === 'function') {
      callback = opts;
    }
    process.nextTick(() => {
      callback(null, { stdout: JSON.stringify(result), stderr: '' });
    });
  };
}

// Helper to create mock exec error
function mockExecError(message) {
  return (cmd, opts, callback) => {
    if (typeof opts === 'function') {
      callback = opts;
    }
    process.nextTick(() => {
      callback(new Error(message), { stdout: '', stderr: message });
    });
  };
}

describe('SalesforceUATAdapter', () => {
  let adapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new SalesforceUATAdapter('test-sandbox', {
      verbose: false,
      dryRun: false,
      useOOO: false // Disable OOO for direct testing
    });
  });

  describe('constructor', () => {
    it('should require orgAlias', () => {
      expect(() => new SalesforceUATAdapter()).toThrow('orgAlias is required');
      expect(() => new SalesforceUATAdapter('')).toThrow('orgAlias is required');
      expect(() => new SalesforceUATAdapter(null)).toThrow('orgAlias is required');
    });

    it('should set default options', () => {
      const a = new SalesforceUATAdapter('test');
      expect(a.orgAlias).toBe('test');
      expect(a.verbose).toBe(false);
      expect(a.dryRun).toBe(false);
      expect(a.useOOO).toBe(true); // Default is true
    });

    it('should accept custom options', () => {
      const a = new SalesforceUATAdapter('test', {
        verbose: true,
        dryRun: true,
        useOOO: false
      });
      expect(a.verbose).toBe(true);
      expect(a.dryRun).toBe(true);
      expect(a.useOOO).toBe(false);
    });

    it('should initialize empty createdRecords array', () => {
      expect(adapter.createdRecords).toEqual([]);
    });
  });

  describe('normalizeObjectName()', () => {
    it('should normalize friendly names to API names', () => {
      expect(adapter.normalizeObjectName('account')).toBe('Account');
      expect(adapter.normalizeObjectName('contact')).toBe('Contact');
      expect(adapter.normalizeObjectName('opp')).toBe('Opportunity');
      expect(adapter.normalizeObjectName('opportunity')).toBe('Opportunity');
      expect(adapter.normalizeObjectName('quote')).toBe('SBQQ__Quote__c');
      expect(adapter.normalizeObjectName('quoteline')).toBe('SBQQ__QuoteLine__c');
    });

    it('should be case insensitive', () => {
      expect(adapter.normalizeObjectName('ACCOUNT')).toBe('Account');
      expect(adapter.normalizeObjectName('Account')).toBe('Account');
      expect(adapter.normalizeObjectName('aCcOuNt')).toBe('Account');
    });

    it('should pass through unknown names', () => {
      expect(adapter.normalizeObjectName('CustomObject__c')).toBe('CustomObject__c');
      expect(adapter.normalizeObjectName('Unknown')).toBe('Unknown');
    });
  });

  describe('dry run mode', () => {
    let dryRunAdapter;

    beforeEach(() => {
      dryRunAdapter = new SalesforceUATAdapter('test-sandbox', {
        dryRun: true,
        useOOO: false
      });
    });

    it('should generate fake ID for create in dry run', async () => {
      const result = await dryRunAdapter.createRecord('Account', { Name: 'Test' });

      expect(result.success).toBe(true);
      expect(result.id).toMatch(/^001DRYRUN/);
      expect(result.dryRun).toBe(true);
      expect(result.recordUrl).toContain('/lightning/r/Account/');
    });

    it('should track records in dry run', async () => {
      await dryRunAdapter.createRecord('Account', { Name: 'Test' });
      await dryRunAdapter.createRecord('Contact', { LastName: 'Test' });

      const records = dryRunAdapter.getCreatedRecords();
      expect(records.length).toBe(2);
      expect(records[0].objectType).toBe('Account');
      expect(records[1].objectType).toBe('Contact');
    });

    it('should return success for update in dry run', async () => {
      const result = await dryRunAdapter.updateRecord('Account', '001xxx', { Name: 'New' });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
    });

    it('should return success for delete in dry run', async () => {
      const result = await dryRunAdapter.deleteRecord('Account', '001xxx');

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
    });
  });

  describe('generateDryRunId()', () => {
    it('should generate IDs with correct prefixes', () => {
      expect(adapter.generateDryRunId('Account')).toMatch(/^001DRYRUN/);
      expect(adapter.generateDryRunId('Contact')).toMatch(/^003DRYRUN/);
      expect(adapter.generateDryRunId('Opportunity')).toMatch(/^006DRYRUN/);
      expect(adapter.generateDryRunId('Lead')).toMatch(/^00QDRYRUN/);
      expect(adapter.generateDryRunId('Case')).toMatch(/^500DRYRUN/);
      expect(adapter.generateDryRunId('SBQQ__Quote__c')).toMatch(/^a0QDRYRUN/);
    });

    it('should generate 18-character IDs', () => {
      const id = adapter.generateDryRunId('Account');
      expect(id.length).toBe(18);
    });

    it('should generate unique IDs', () => {
      const id1 = adapter.generateDryRunId('Account');
      const id2 = adapter.generateDryRunId('Account');
      expect(id1).not.toBe(id2);
    });
  });

  describe('createRecordDirect()', () => {
    it('should call SF CLI with correct parameters', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: { id: '001ABC123456789' }
      }));

      const result = await adapter.createRecordDirect('Account', { Name: 'Test Account' });

      expect(exec).toHaveBeenCalled();
      const cmd = exec.mock.calls[0][0];
      expect(cmd).toContain('sf data create record');
      expect(cmd).toContain('--sobject Account');
      expect(cmd).toContain("Name='Test Account'");
      expect(cmd).toContain('--target-org test-sandbox');
      expect(cmd).toContain('--json');
    });

    it('should return success with record ID', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: { id: '001ABC123456789' }
      }));

      const result = await adapter.createRecordDirect('Account', { Name: 'Test' });

      expect(result.success).toBe(true);
      expect(result.id).toBe('001ABC123456789');
      expect(result.recordUrl).toContain('/lightning/r/Account/001ABC123456789/view');
    });

    it('should handle errors', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 1,
        message: 'REQUIRED_FIELD_MISSING: Name'
      }));

      const result = await adapter.createRecordDirect('Account', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('REQUIRED_FIELD_MISSING');
    });

    it('should handle CLI exceptions', async () => {
      exec.mockImplementation(mockExecError('Command not found'));

      const result = await adapter.createRecordDirect('Account', { Name: 'Test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command not found');
    });

    it('should escape single quotes in values', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: { id: '001ABC123456789' }
      }));

      await adapter.createRecordDirect('Account', { Name: "Test's Account" });

      const cmd = exec.mock.calls[0][0];
      expect(cmd).toContain("Test\\'s Account");
    });
  });

  describe('updateRecord()', () => {
    it('should call SF CLI with correct parameters', async () => {
      exec.mockImplementation(mockExecResponse({ status: 0 }));

      await adapter.updateRecord('Account', '001ABC', { Name: 'Updated' });

      const cmd = exec.mock.calls[0][0];
      expect(cmd).toContain('sf data update record');
      expect(cmd).toContain('--sobject Account');
      expect(cmd).toContain('--record-id 001ABC');
      expect(cmd).toContain("Name='Updated'");
    });

    it('should return success on update', async () => {
      exec.mockImplementation(mockExecResponse({ status: 0 }));

      const result = await adapter.updateRecord('Account', '001ABC', { Name: 'Updated' });

      expect(result.success).toBe(true);
      expect(result.id).toBe('001ABC');
    });

    it('should handle update errors', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 1,
        message: 'INVALID_FIELD'
      }));

      const result = await adapter.updateRecord('Account', '001ABC', { BadField: 'value' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('INVALID_FIELD');
    });
  });

  describe('queryRecord()', () => {
    it('should query with specific fields', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: {
          records: [{ Id: '001ABC', Name: 'Test', Industry: 'Tech' }]
        }
      }));

      const result = await adapter.queryRecord('Account', '001ABC', ['Name', 'Industry']);

      expect(result.success).toBe(true);
      expect(result.record.Name).toBe('Test');
      expect(result.record.Industry).toBe('Tech');

      const cmd = exec.mock.calls[0][0];
      expect(cmd).toContain('SELECT Name, Industry FROM Account');
    });

    it('should query all fields when none specified', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: {
          records: [{ Id: '001ABC', Name: 'Test' }]
        }
      }));

      await adapter.queryRecord('Account', '001ABC');

      const cmd = exec.mock.calls[0][0];
      expect(cmd).toContain('SELECT FIELDS(ALL)');
    });

    it('should return error when record not found', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: { records: [] }
      }));

      const result = await adapter.queryRecord('Account', '001NOTFOUND');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('verifyField()', () => {
    beforeEach(() => {
      // Ensure snapshot is not used (fallback to direct query)
      adapter.snapshot = null;
    });

    it('should verify field equals expected value', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: {
          records: [{ Id: '001ABC', Status__c: 'Active' }]
        }
      }));

      const result = await adapter.verifyField('Account', '001ABC', 'Status__c', 'Active', 'equals');

      expect(result.passed).toBe(true);
      expect(result.actual).toBe('Active');
      expect(result.expected).toBe('Active');
    });

    it('should fail when values do not match', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: {
          records: [{ Id: '001ABC', Status__c: 'Inactive' }]
        }
      }));

      const result = await adapter.verifyField('Account', '001ABC', 'Status__c', 'Active', 'equals');

      expect(result.passed).toBe(false);
      expect(result.actual).toBe('Inactive');
    });

    it('should handle query errors', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: { records: [] }
      }));

      const result = await adapter.verifyField('Account', '001NOTFOUND', 'Status__c', 'Active');

      expect(result.passed).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('compareValues()', () => {
    it('should handle equals operators', () => {
      expect(adapter.compareValues('test', 'test', 'equals')).toBe(true);
      expect(adapter.compareValues('test', 'test', '=')).toBe(true);
      expect(adapter.compareValues('test', 'test', '==')).toBe(true);
      expect(adapter.compareValues('test', 'other', 'equals')).toBe(false);
    });

    it('should handle strictEquals', () => {
      expect(adapter.compareValues(1, '1', '==')).toBe(true);
      expect(adapter.compareValues(1, '1', '===')).toBe(false);
      expect(adapter.compareValues(1, 1, 'strictEquals')).toBe(true);
    });

    it('should handle notEquals', () => {
      expect(adapter.compareValues('a', 'b', 'notEquals')).toBe(true);
      expect(adapter.compareValues('a', 'a', '!=')).toBe(false);
    });

    it('should handle numeric comparisons', () => {
      expect(adapter.compareValues(10, 5, 'greaterThan')).toBe(true);
      expect(adapter.compareValues(10, 5, '>')).toBe(true);
      expect(adapter.compareValues(5, 10, 'lessThan')).toBe(true);
      expect(adapter.compareValues(5, 10, '<')).toBe(true);
      expect(adapter.compareValues(10, 10, '>=')).toBe(true);
      expect(adapter.compareValues(10, 10, '<=')).toBe(true);
    });

    it('should handle string comparisons', () => {
      expect(adapter.compareValues('hello world', 'world', 'contains')).toBe(true);
      expect(adapter.compareValues('hello', 'hel', 'startsWith')).toBe(true);
      expect(adapter.compareValues('hello', 'lo', 'endsWith')).toBe(true);
    });

    it('should handle null checks', () => {
      expect(adapter.compareValues(null, null, 'isNull')).toBe(true);
      expect(adapter.compareValues(undefined, null, 'isNull')).toBe(true);
      expect(adapter.compareValues('value', null, 'isNotNull')).toBe(true);
      expect(adapter.compareValues(null, null, 'isNotNull')).toBe(false);
    });

    it('should handle context variable references', () => {
      // Context variables should always return true (resolved by executor)
      expect(adapter.compareValues('any', '{AccountId}', 'equals')).toBe(true);
      expect(adapter.compareValues('any', '{OpportunityId}', 'equals')).toBe(true);
    });
  });

  describe('verifyRollup()', () => {
    it('should verify sum rollup', async () => {
      // Mock parent query
      exec.mockImplementationOnce(mockExecResponse({
        status: 0,
        result: { records: [{ SBQQ__NetTotal__c: 300 }] }
      }));
      // Mock child query
      exec.mockImplementationOnce(mockExecResponse({
        status: 0,
        result: {
          records: [
            { SBQQ__NetTotal__c: 100 },
            { SBQQ__NetTotal__c: 200 }
          ]
        }
      }));

      const result = await adapter.verifyRollup('SBQQ__Quote__c', 'a0Q123', 'SBQQ__QuoteLine__c', {
        parentField: 'SBQQ__NetTotal__c',
        childField: 'SBQQ__NetTotal__c',
        type: 'sum'
      });

      expect(result.passed).toBe(true);
      expect(result.parentValue).toBe(300);
      expect(result.calculatedValue).toBe(300);
      expect(result.childCount).toBe(2);
    });

    it('should verify count rollup', async () => {
      exec.mockImplementationOnce(mockExecResponse({
        status: 0,
        result: { records: [{ LineCount__c: 3 }] }
      }));
      exec.mockImplementationOnce(mockExecResponse({
        status: 0,
        result: {
          records: [{ Id: '1' }, { Id: '2' }, { Id: '3' }]
        }
      }));

      const result = await adapter.verifyRollup('Quote', 'a0Q123', 'QuoteLine', {
        parentField: 'LineCount__c',
        childField: 'Id',
        type: 'count'
      });

      expect(result.passed).toBe(true);
      expect(result.calculatedValue).toBe(3);
      expect(result.rollupType).toBe('count');
    });

    it('should handle tolerance for currency', async () => {
      exec.mockImplementationOnce(mockExecResponse({
        status: 0,
        result: { records: [{ Total__c: 100.005 }] }
      }));
      exec.mockImplementationOnce(mockExecResponse({
        status: 0,
        result: { records: [{ Amount__c: 100 }] }
      }));

      const result = await adapter.verifyRollup('Account', '001ABC', 'Opportunity', {
        parentField: 'Total__c',
        childField: 'Amount__c',
        type: 'sum',
        tolerance: 0.01
      });

      expect(result.passed).toBe(true);
      expect(result.difference).toBeLessThanOrEqual(0.01);
    });
  });

  describe('checkPermission()', () => {
    it('should check object permissions', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: {
          records: [{ PermissionsCreate: true }]
        }
      }));

      const result = await adapter.checkPermission('Sales Rep', 'Account', 'create');

      expect(result.allowed).toBe(true);
      expect(result.profile).toBe('Sales Rep');
      expect(result.objectType).toBe('Account');
      expect(result.action).toBe('create');
    });

    it('should handle edit/update action', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: { records: [{ PermissionsEdit: true }] }
      }));

      const result = await adapter.checkPermission('Sales Rep', 'Account', 'edit');
      expect(result.allowed).toBe(true);
    });

    it('should return false for denied permission', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: { records: [{ PermissionsDelete: false }] }
      }));

      const result = await adapter.checkPermission('Sales Rep', 'Account', 'delete');
      expect(result.allowed).toBe(false);
    });

    it('should handle unknown action', async () => {
      const result = await adapter.checkPermission('Sales Rep', 'Account', 'unknown');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Unknown action');
    });
  });

  describe('deleteRecord()', () => {
    it('should call SF CLI delete command', async () => {
      exec.mockImplementation(mockExecResponse({ status: 0 }));

      await adapter.deleteRecord('Account', '001ABC');

      const cmd = exec.mock.calls[0][0];
      expect(cmd).toContain('sf data delete record');
      expect(cmd).toContain('--sobject Account');
      expect(cmd).toContain('--record-id 001ABC');
    });

    it('should return success on deletion', async () => {
      exec.mockImplementation(mockExecResponse({ status: 0 }));

      const result = await adapter.deleteRecord('Account', '001ABC');

      expect(result.success).toBe(true);
      expect(result.id).toBe('001ABC');
    });

    it('should handle delete errors', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 1,
        message: 'ENTITY_IS_DELETED'
      }));

      const result = await adapter.deleteRecord('Account', '001ABC');

      expect(result.success).toBe(false);
      expect(result.error).toContain('ENTITY_IS_DELETED');
    });
  });

  describe('getRecordUrl()', () => {
    it('should generate Lightning URL', () => {
      const url = adapter.getRecordUrl('Account', '001ABC123456789');
      expect(url).toBe('/lightning/r/Account/001ABC123456789/view');
    });

    it('should normalize object name in URL', () => {
      const url = adapter.getRecordUrl('quote', 'a0QABC');
      expect(url).toBe('/lightning/r/SBQQ__Quote__c/a0QABC/view');
    });
  });

  describe('getInstanceUrl()', () => {
    it('should return cached instance URL', async () => {
      adapter.instanceUrl = 'https://cached.salesforce.com';

      const url = await adapter.getInstanceUrl();

      expect(url).toBe('https://cached.salesforce.com');
      expect(exec).not.toHaveBeenCalled();
    });

    it('should fetch and cache instance URL', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: { instanceUrl: 'https://na123.salesforce.com' }
      }));

      const url = await adapter.getInstanceUrl();

      expect(url).toBe('https://na123.salesforce.com');
      expect(adapter.instanceUrl).toBe('https://na123.salesforce.com');
    });

    it('should return empty string on error', async () => {
      exec.mockImplementation(mockExecError('Not authenticated'));

      const url = await adapter.getInstanceUrl();

      expect(url).toBe('');
    });
  });

  describe('record tracking', () => {
    it('should track created records', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: { id: '001ABC' }
      }));

      await adapter.createRecord('Account', { Name: 'Test' });
      await adapter.createRecord('Contact', { LastName: 'Test' });

      const records = adapter.getCreatedRecords();
      expect(records.length).toBe(2);
      expect(records[0].objectType).toBe('Account');
      expect(records[0].id).toBe('001ABC');
      expect(records[0].createdAt).toBeDefined();
      expect(records[1].objectType).toBe('Contact');
    });

    it('should include createdAt timestamp', async () => {
      exec.mockImplementation(mockExecResponse({
        status: 0,
        result: { id: '001ABC' }
      }));

      const before = new Date().toISOString();
      await adapter.createRecord('Account', { Name: 'Test' });
      const after = new Date().toISOString();

      const records = adapter.getCreatedRecords();
      expect(records[0].createdAt >= before).toBe(true);
      expect(records[0].createdAt <= after).toBe(true);
    });
  });
});
