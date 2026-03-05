/**
 * UAT Step Executor Tests
 *
 * Unit tests for the UAT step executor module.
 * Coverage target: 85%+ (context management is pure, adapter calls mocked)
 */

const { UATStepExecutor, StepStatus } = require('../uat-step-executor');

describe('UATStepExecutor', () => {
  let executor;
  let mockAdapter;

  beforeEach(() => {
    // Create mock adapter with all required methods
    mockAdapter = {
      createRecord: jest.fn().mockResolvedValue({ success: true, id: '001xxx000000001' }),
      updateRecord: jest.fn().mockResolvedValue({ success: true }),
      verifyField: jest.fn().mockResolvedValue({ passed: true, actual: 100, expected: 100 }),
      queryRecord: jest.fn().mockResolvedValue({ success: true, record: { StageName: 'Qualification' } }),
      verifyRollup: jest.fn().mockResolvedValue({ passed: true }),
      checkPermission: jest.fn().mockResolvedValue({ allowed: true }),
      cleanup: jest.fn().mockResolvedValue({ success: true, deleted: [] })
    };

    executor = new UATStepExecutor(mockAdapter);
  });

  describe('constructor', () => {
    it('should require an adapter', () => {
      expect(() => new UATStepExecutor(null)).toThrow('Platform adapter is required');
    });

    it('should set default options', () => {
      expect(executor.verbose).toBe(false);
      expect(executor.stopOnFailure).toBe(true);
      expect(executor.collectEvidence).toBe(true);
    });

    it('should accept custom options', () => {
      const customExecutor = new UATStepExecutor(mockAdapter, {
        verbose: true,
        stopOnFailure: false,
        collectEvidence: false
      });
      expect(customExecutor.verbose).toBe(true);
      expect(customExecutor.stopOnFailure).toBe(false);
      expect(customExecutor.collectEvidence).toBe(false);
    });

    it('should initialize empty context', () => {
      expect(executor.getContext()).toEqual({});
    });

    it('should initialize empty evidence array', () => {
      expect(executor.getEvidence()).toEqual([]);
    });
  });

  describe('resolveContext()', () => {
    beforeEach(() => {
      executor.setContext('AccountId', '001xxx000000001');
      executor.setContext('OpportunityId', '006xxx000000002');
      executor.setContext('nested', { value: 'test' });
    });

    it('should replace {AccountId} with context value', () => {
      const data = { accountRef: '{AccountId}' };
      const resolved = executor.resolveContext(data);
      expect(resolved.accountRef).toBe('001xxx000000001');
    });

    it('should replace multiple variables', () => {
      const data = {
        account: '{AccountId}',
        opp: '{OpportunityId}'
      };
      const resolved = executor.resolveContext(data);
      expect(resolved.account).toBe('001xxx000000001');
      expect(resolved.opp).toBe('006xxx000000002');
    });

    it('should handle nested objects', () => {
      const data = {
        parent: {
          child: '{AccountId}'
        }
      };
      const resolved = executor.resolveContext(data);
      expect(resolved.parent.child).toBe('001xxx000000001');
    });

    it('should leave unknown variables unchanged', () => {
      const data = { unknown: '{UnknownVar}' };
      const resolved = executor.resolveContext(data);
      expect(resolved.unknown).toBe('{UnknownVar}');
    });

    it('should handle null/undefined data', () => {
      expect(executor.resolveContext(null)).toBe(null);
      expect(executor.resolveContext(undefined)).toBe(undefined);
    });

    it('should preserve non-variable strings', () => {
      const data = { name: 'Test Account', amount: 100 };
      const resolved = executor.resolveContext(data);
      expect(resolved.name).toBe('Test Account');
      expect(resolved.amount).toBe(100);
    });

    it('should handle partial variable syntax', () => {
      const data = { notVar: '{incomplete', alsoNotVar: 'incomplete}' };
      const resolved = executor.resolveContext(data);
      expect(resolved.notVar).toBe('{incomplete');
      expect(resolved.alsoNotVar).toBe('incomplete}');
    });
  });

  describe('mergeData()', () => {
    it('should merge step and test data', () => {
      const stepData = { field1: 'step' };
      const testData = { field2: 'test' };
      const merged = executor.mergeData(stepData, testData);
      expect(merged).toEqual({ field1: 'step', field2: 'test' });
    });

    it('should prioritize test data over step data', () => {
      const stepData = { field: 'step' };
      const testData = { field: 'test' };
      const merged = executor.mergeData(stepData, testData);
      expect(merged.field).toBe('test');
    });

    it('should handle empty objects', () => {
      const merged = executor.mergeData({}, {});
      expect(merged).toEqual({});
    });
  });

  describe('isStageAtOrAfter()', () => {
    it('should return true for same stage', () => {
      expect(executor.isStageAtOrAfter('Qualification', 'Qualification')).toBe(true);
    });

    it('should return true for later stage', () => {
      expect(executor.isStageAtOrAfter('Proposal', 'Qualification')).toBe(true);
      expect(executor.isStageAtOrAfter('Closed Won', 'Qualification')).toBe(true);
    });

    it('should return false for earlier stage', () => {
      expect(executor.isStageAtOrAfter('Qualification', 'Proposal')).toBe(false);
      expect(executor.isStageAtOrAfter('Discovery', 'Negotiation')).toBe(false);
    });

    it('should return true for unknown stages', () => {
      expect(executor.isStageAtOrAfter('CustomStage', 'Qualification')).toBe(true);
      expect(executor.isStageAtOrAfter('Qualification', 'UnknownStage')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(executor.isStageAtOrAfter('qualification', 'QUALIFICATION')).toBe(true);
      expect(executor.isStageAtOrAfter('PROPOSAL', 'qualification')).toBe(true);
    });
  });

  describe('normalizeFieldName()', () => {
    it('should normalize Primary to SBQQ__Primary__c for quotes', () => {
      expect(executor.normalizeFieldName('Primary', 'SBQQ__Quote__c')).toBe('SBQQ__Primary__c');
      expect(executor.normalizeFieldName('primary', 'SBQQ__Quote__c')).toBe('SBQQ__Primary__c');
    });

    it('should pass through unknown field names', () => {
      expect(executor.normalizeFieldName('CustomField', 'Account')).toBe('CustomField');
    });

    it('should pass through fields for objects without mappings', () => {
      expect(executor.normalizeFieldName('Primary', 'Opportunity')).toBe('Primary');
    });
  });

  describe('executeStep() with mocked adapter', () => {
    it('should call adapter.createRecord for create action', async () => {
      const step = {
        stepNumber: 1,
        raw: 'Create Account',
        action: 'create',
        object: 'Account',
        data: {}
      };
      const testData = { Name: 'Test Account' };

      const result = await executor.executeStep(step, testData);

      expect(mockAdapter.createRecord).toHaveBeenCalledWith('Account', expect.objectContaining({ Name: 'Test Account' }));
      expect(result.status).toBe(StepStatus.PASSED);
    });

    it('should update context with created record ID', async () => {
      const step = {
        stepNumber: 1,
        raw: 'Create Account',
        action: 'create',
        object: 'Account',
        data: {}
      };

      await executor.executeStep(step, { Name: 'Test' });

      expect(executor.getContext().AccountId).toBe('001xxx000000001');
      expect(executor.getContext().lastRecordId).toBe('001xxx000000001');
    });

    it('should skip step when precondition not met', async () => {
      // Set up context without opportunity
      executor.clearContext();

      const step = {
        stepNumber: 1,
        raw: 'Add products after Qualification',
        action: 'create',
        object: 'OpportunityLineItem',
        precondition: { stage: 'Qualification' },
        data: {}
      };

      mockAdapter.queryRecord.mockResolvedValue({
        success: true,
        record: { StageName: 'Discovery' } // Earlier stage
      });

      // Need OpportunityId in context for precondition check
      executor.setContext('OpportunityId', '006xxx');

      const result = await executor.executeStep(step);

      expect(result.status).toBe(StepStatus.SKIPPED);
    });

    it('should collect evidence', async () => {
      mockAdapter.createRecord.mockResolvedValue({
        success: true,
        id: '001xxx',
        recordUrl: '/lightning/r/Account/001xxx/view'
      });

      const step = {
        stepNumber: 1,
        raw: 'Create Account',
        action: 'create',
        object: 'Account',
        data: {}
      };

      const result = await executor.executeStep(step, { Name: 'Test' });

      expect(result.evidence.recordId).toBe('001xxx');
      expect(result.evidence.timestamp).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      mockAdapter.createRecord.mockRejectedValue(new Error('API Error'));

      const step = {
        stepNumber: 1,
        raw: 'Create Account',
        action: 'create',
        object: 'Account',
        data: {}
      };

      const result = await executor.executeStep(step);

      expect(result.status).toBe(StepStatus.FAILED);
      expect(result.error).toBe('API Error');
    });

    it('should handle update action', async () => {
      executor.setContext('AccountId', '001xxx');
      executor.setContext('lastRecordType', 'Account');

      const step = {
        stepNumber: 1,
        raw: 'Update Account',
        action: 'update',
        object: 'Account',
        data: {}
      };

      await executor.executeStep(step, { Name: 'Updated' });

      expect(mockAdapter.updateRecord).toHaveBeenCalled();
    });

    it('should handle navigate action', async () => {
      const step = {
        stepNumber: 1,
        raw: 'From Account',
        action: 'navigate',
        object: 'Account'
      };

      const result = await executor.executeStep(step);

      expect(result.status).toBe(StepStatus.PASSED);
      expect(executor.getContext().currentObject).toBe('Account');
    });

    it('should handle verify action with target', async () => {
      executor.setContext('AccountId', '001xxx');
      executor.setContext('lastRecordType', 'Account');

      const step = {
        stepNumber: 1,
        raw: 'Verify rollups',
        action: 'verify',
        target: 'rollups'
      };

      const result = await executor.executeStep(step);

      // Verify action returns result
      expect(result.status).toBeDefined();
      expect(['passed', 'failed', 'manual'].includes(result.status)).toBe(true);
    });

    it('should handle manual action', async () => {
      const step = {
        stepNumber: 1,
        raw: 'Do something manually',
        action: 'manual'
      };

      const result = await executor.executeStep(step);

      expect(result.status).toBe(StepStatus.MANUAL);
      expect(result.result.message.toLowerCase()).toContain('manual');
    });
  });

  describe('context management', () => {
    it('should get context', () => {
      executor.setContext('key', 'value');
      expect(executor.getContext().key).toBe('value');
    });

    it('should set context', () => {
      executor.setContext('key', 'value');
      expect(executor.getContext().key).toBe('value');
    });

    it('should clear context', () => {
      executor.setContext('key', 'value');
      executor.clearContext();
      expect(executor.getContext()).toEqual({});
    });

    it('should return copy of context', () => {
      executor.setContext('key', 'value');
      const context = executor.getContext();
      context.key = 'modified';
      expect(executor.getContext().key).toBe('value');
    });
  });

  describe('evidence collection', () => {
    it('should collect evidence from executed steps', async () => {
      const step = {
        stepNumber: 1,
        raw: 'Create Account',
        action: 'create',
        object: 'Account',
        data: {}
      };

      await executor.executeStep(step);

      const evidence = executor.getEvidence();
      expect(evidence).toHaveLength(1);
      expect(evidence[0].stepNumber).toBe(1);
    });

    it('should return copy of evidence', () => {
      const evidence = executor.getEvidence();
      evidence.push({ fake: true });
      expect(executor.getEvidence()).toHaveLength(0);
    });
  });

  describe('created records tracking', () => {
    it('should track created records', async () => {
      const step = {
        stepNumber: 1,
        raw: 'Create Account',
        action: 'create',
        object: 'Account',
        data: {}
      };

      await executor.executeStep(step);

      const created = executor.getCreatedRecords();
      expect(created).toHaveLength(1);
      expect(created[0].objectType).toBe('Account');
      expect(created[0].id).toBe('001xxx000000001');
    });

    it('should return copy of created records', () => {
      const records = executor.getCreatedRecords();
      records.push({ fake: true });
      expect(executor.getCreatedRecords()).toHaveLength(0);
    });
  });

  describe('StepStatus enum', () => {
    it('should have expected values', () => {
      expect(StepStatus.PENDING).toBe('pending');
      expect(StepStatus.RUNNING).toBe('running');
      expect(StepStatus.PASSED).toBe('passed');
      expect(StepStatus.FAILED).toBe('failed');
      expect(StepStatus.SKIPPED).toBe('skipped');
      expect(StepStatus.MANUAL).toBe('manual');
    });
  });
});
