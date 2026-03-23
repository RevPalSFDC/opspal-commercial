/**
 * Tests for RevenueContextDetector
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock dependencies before requiring the module
jest.mock('../path-conventions', () => {
  const mockPath = require('path');
  return {
    getInstancePath: (platform, org, subDir, root) => {
      return mockPath.join(root || '/tmp', 'instances', platform, org);
    }
  };
});

jest.mock('../metric-field-resolver', () => {
  const mockOriginal = jest.requireActual('../metric-field-resolver');
  return {
    ...mockOriginal,
    loadMapping: jest.fn().mockReturnValue({
      schemaVersion: '1.0',
      org: 'test-org',
      lastUpdated: new Date().toISOString(),
      metrics: {},
      reportOverrides: {}
    }),
    saveMapping: jest.fn()
  };
});

const { RevenueContextDetector } = require('../revenue-context-detector');
const { loadMapping, saveMapping } = require('../metric-field-resolver');

describe('RevenueContextDetector', () => {
  let tmpDir;
  let detector;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcd-test-'));
    detector = new RevenueContextDetector('test-org', {
      workspaceRoot: tmpDir,
      force: true
    });
    jest.clearAllMocks();
    loadMapping.mockReturnValue({
      schemaVersion: '1.0',
      org: 'test-org',
      lastUpdated: new Date().toISOString(),
      metrics: {},
      reportOverrides: {}
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('detectRevenueField', () => {
    test('selects custom field with high confidence when populated', async () => {
      // Mock: FieldDefinition returns ARR__c and Amount
      const queryResults = [];
      let callCount = 0;
      detector.executeQuery = jest.fn((query) => {
        if (query.includes('FieldDefinition')) {
          return {
            records: [
              { QualifiedApiName: 'ARR__c', Label: 'ARR', DataType: 'Currency' },
              { QualifiedApiName: 'Amount', Label: 'Amount', DataType: 'Currency' },
              { QualifiedApiName: 'ExpectedRevenue', Label: 'Expected Revenue', DataType: 'Currency' }
            ]
          };
        }
        if (query.includes('COUNT()') && query.includes('ARR__c')) {
          return { totalSize: 500 };
        }
        if (query.includes('COUNT()') && query.includes('Amount')) {
          return { totalSize: 0 };
        }
        return null;
      });

      const result = await detector.detectRevenueField();

      expect(result.field).toBe('ARR__c');
      expect(result.source).toBeDefined();
      expect(saveMapping).toHaveBeenCalled();
    });

    test('defaults to Amount when only Amount is populated', async () => {
      detector.executeQuery = jest.fn((query) => {
        if (query.includes('FieldDefinition')) {
          return {
            records: [
              { QualifiedApiName: 'Amount', Label: 'Amount', DataType: 'Currency' },
              { QualifiedApiName: 'ExpectedRevenue', Label: 'Expected Revenue', DataType: 'Currency' }
            ]
          };
        }
        if (query.includes('COUNT()') && query.includes('Amount')) {
          return { totalSize: 300 };
        }
        return { totalSize: 0 };
      });

      const result = await detector.detectRevenueField();

      expect(result.field).toBe('Amount');
    });

    test('falls back to sf sobject describe when FieldDefinition fails', async () => {
      // Mock: FieldDefinition returns null, but _queryFieldsViaDescribe finds fields
      detector.executeQuery = jest.fn((query) => {
        if (query.includes('FieldDefinition')) {
          return null; // Tooling API fails
        }
        if (query.includes('COUNT()') && query.includes('ARR__c')) {
          return { totalSize: 200 };
        }
        if (query.includes('COUNT()') && query.includes('Amount')) {
          return { totalSize: 0 };
        }
        return null;
      });
      // Mock the describe fallback
      detector._queryFieldsViaDescribe = jest.fn().mockReturnValue([
        { name: 'ARR__c', label: 'ARR', type: 'Currency', custom: true },
        { name: 'Amount', label: 'Amount', type: 'Currency', custom: false },
        { name: 'ExpectedRevenue', label: 'Expected Revenue', type: 'Currency', custom: false }
      ]);

      const result = await detector.detectRevenueField();

      expect(detector._queryFieldsViaDescribe).toHaveBeenCalled();
      expect(result.field).toBe('ARR__c');
    });

    test('returns default when all field metadata queries fail', async () => {
      detector.executeQuery = jest.fn(() => null);
      detector._queryFieldsViaDescribe = jest.fn().mockReturnValue(null);

      const result = await detector.detectRevenueField();

      expect(result.field).toBe('Amount');
      expect(result.source).toBe('default');
      expect(result.confidence).toBe(1);
    });

    test('uses cached mapping when fresh and force=false', async () => {
      const freshDetector = new RevenueContextDetector('test-org', {
        workspaceRoot: tmpDir,
        force: false
      });
      freshDetector.executeQuery = jest.fn();

      loadMapping.mockReturnValue({
        schemaVersion: '1.0',
        org: 'test-org',
        lastUpdated: new Date().toISOString(),
        metrics: {
          'pipeline.arr': {
            resolved: {
              amount: { field: 'Net_New_ARR__c', confidence: 0.9, source: 'confirmed' }
            }
          }
        }
      });

      const result = await freshDetector.detectRevenueField();

      expect(result.field).toBe('Net_New_ARR__c');
      expect(result.source).toBe('confirmed');
      // Should not have queried the org
      expect(freshDetector.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('detectSalesProcesses', () => {
    test('maps multiple processes to their record types', async () => {
      detector.executeQuery = jest.fn((query) => {
        if (query.includes('FROM BusinessProcess')) {
          return {
            records: [
              { Id: 'bp1', Name: 'Housing/Core' },
              { Id: 'bp2', Name: 'DeepSMB' }
            ]
          };
        }
        if (query.includes('FROM RecordType')) {
          return {
            records: [
              { Id: 'rt1', Name: 'Core Opportunity', DeveloperName: 'Core', BusinessProcessId: 'bp1' },
              { Id: 'rt2', Name: 'Housing Opportunity', DeveloperName: 'Housing', BusinessProcessId: 'bp1' },
              { Id: 'rt3', Name: 'SMB Opportunity', DeveloperName: 'SMB', BusinessProcessId: 'bp2' }
            ]
          };
        }
        return null;
      });

      const result = await detector.detectSalesProcesses();

      expect(result.processes).toHaveLength(2);
      expect(result.processes[0].name).toBe('Housing/Core');
      expect(result.processes[0].recordTypeIds).toEqual(['rt1', 'rt2']);
      expect(result.processes[1].name).toBe('DeepSMB');
      expect(result.processes[1].recordTypeIds).toEqual(['rt3']);
      // Non-interactive: mode is null (pending user choice)
      expect(result.mode).toBeNull();
    });

    test('returns single mode when only one process exists', async () => {
      detector.executeQuery = jest.fn((query) => {
        if (query.includes('FROM BusinessProcess')) {
          return {
            records: [
              { Id: 'bp1', Name: 'Standard Sales Process' }
            ]
          };
        }
        if (query.includes('FROM RecordType')) {
          return {
            records: [
              { Id: 'rt1', Name: 'Opportunity', DeveloperName: 'Opportunity', BusinessProcessId: 'bp1' }
            ]
          };
        }
        return null;
      });

      const result = await detector.detectSalesProcesses();

      expect(result.processes).toHaveLength(1);
      expect(result.mode).toBe('single');
    });

    test('returns single mode when no BusinessProcess records exist', async () => {
      detector.executeQuery = jest.fn(() => ({ records: [] }));

      const result = await detector.detectSalesProcesses();

      expect(result.processes).toEqual([]);
      expect(result.mode).toBe('single');
    });

    test('gracefully degrades on query failure', async () => {
      detector.executeQuery = jest.fn(() => { throw new Error('API timeout'); });

      const result = await detector.detectSalesProcesses();

      expect(result.processes).toEqual([]);
      expect(result.mode).toBe('single');
    });
  });

  describe('persistence', () => {
    test('saves sales process config to disk', async () => {
      // Create the cache dir
      const cacheDir = path.join(tmpDir, 'instances', 'salesforce', 'test-org', '.metadata-cache');
      fs.mkdirSync(cacheDir, { recursive: true });

      detector.executeQuery = jest.fn((query) => {
        if (query.includes('FROM BusinessProcess')) {
          return {
            records: [
              { Id: 'bp1', Name: 'Core' },
              { Id: 'bp2', Name: 'Expansion' }
            ]
          };
        }
        if (query.includes('FROM RecordType')) {
          return {
            records: [
              { Id: 'rt1', Name: 'Core Opp', DeveloperName: 'Core_Opp', BusinessProcessId: 'bp1' },
              { Id: 'rt2', Name: 'Expansion Opp', DeveloperName: 'Expansion_Opp', BusinessProcessId: 'bp2' }
            ]
          };
        }
        return null;
      });

      await detector.detectSalesProcesses();

      const configPath = path.join(cacheDir, 'sales-process-config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.schemaVersion).toBe('1.0');
      expect(config.org).toBe('test-org');
      expect(config.detectedProcesses).toHaveLength(2);
      expect(config.recordTypeFiltersByProcess['Core']).toEqual(['rt1']);
      expect(config.recordTypeFiltersByProcess['Expansion']).toEqual(['rt2']);
    });

    test('uses cached sales process config when fresh', async () => {
      const cacheDir = path.join(tmpDir, 'instances', 'salesforce', 'test-org', '.metadata-cache');
      fs.mkdirSync(cacheDir, { recursive: true });

      const config = {
        schemaVersion: '1.0',
        org: 'test-org',
        lastUpdated: new Date().toISOString(),
        detectedProcesses: [{ id: 'bp1', name: 'Cached Process', recordTypeIds: ['rt1'], recordTypeNames: ['RT1'] }],
        selectedMode: 'per-process',
        recordTypeFiltersByProcess: { 'Cached Process': ['rt1'] }
      };
      fs.writeFileSync(path.join(cacheDir, 'sales-process-config.json'), JSON.stringify(config), 'utf8');

      const cachedDetector = new RevenueContextDetector('test-org', {
        workspaceRoot: tmpDir,
        force: false
      });
      cachedDetector.executeQuery = jest.fn();

      const result = await cachedDetector.detectSalesProcesses();

      expect(result.mode).toBe('per-process');
      expect(result.processes[0].name).toBe('Cached Process');
      expect(cachedDetector.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('detect() integration', () => {
    test('returns complete result structure', async () => {
      detector.executeQuery = jest.fn((query) => {
        if (query.includes('FieldDefinition')) {
          return {
            records: [
              { QualifiedApiName: 'Amount', Label: 'Amount', DataType: 'Currency' }
            ]
          };
        }
        if (query.includes('COUNT()') && query.includes('Amount')) {
          return { totalSize: 100 };
        }
        if (query.includes('FROM BusinessProcess')) {
          return { records: [] };
        }
        return null;
      });

      const result = await detector.detect();

      expect(result).toHaveProperty('revenueField');
      expect(result).toHaveProperty('revenueFieldConfidence');
      expect(result).toHaveProperty('revenueFieldSource');
      expect(result).toHaveProperty('salesProcesses');
      expect(result).toHaveProperty('salesProcessMode');
      expect(result).toHaveProperty('detectedAt');
      expect(result.revenueField).toBe('Amount');
      expect(result.salesProcessMode).toBe('single');
    });
  });
});
