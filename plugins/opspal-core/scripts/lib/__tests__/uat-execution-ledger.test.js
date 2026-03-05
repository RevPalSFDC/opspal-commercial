/**
 * Tests for UAT Execution Ledger
 *
 * Tests crash recovery ledger functionality including:
 * - Session ID generation
 * - Step completion tracking
 * - Context persistence
 * - Created records tracking
 * - Session resumption
 * - Cleanup functionality
 */

const path = require('path');
const fs = require('fs');
const { UATExecutionLedger, LedgerStatus } = require('../uat-execution-ledger');

describe('UATExecutionLedger', () => {
  const testOutputDir = path.join(__dirname, '.test-sessions');

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Final cleanup
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
  });

  describe('constructor', () => {
    it('should generate session ID if not provided', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      expect(ledger.sessionId).toBeDefined();
      expect(ledger.sessionId).toMatch(/^uat-\d+-[a-z0-9]+$/);
    });

    it('should use provided session ID', () => {
      const ledger = new UATExecutionLedger('my-session-123', testOutputDir);
      expect(ledger.sessionId).toBe('my-session-123');
    });

    it('should create new ledger with correct initial state', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      expect(ledger.ledger.status).toBe(LedgerStatus.IN_PROGRESS);
      expect(ledger.ledger.completedSteps).toEqual([]);
      expect(ledger.ledger.createdRecords).toEqual([]);
      expect(ledger.ledger.errors).toEqual([]);
    });

    it('should set default output directory', () => {
      const ledger = new UATExecutionLedger('test');
      expect(ledger.outputDir).toBe('.uat-sessions');
    });
  });

  describe('generateSessionId()', () => {
    it('should generate unique session IDs', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      const id1 = ledger.generateSessionId();
      const id2 = ledger.generateSessionId();
      expect(id1).not.toBe(id2);
    });

    it('should include timestamp in session ID', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      const id = ledger.generateSessionId();
      const parts = id.split('-');
      const timestamp = parseInt(parts[1], 10);
      expect(timestamp).toBeGreaterThan(Date.now() - 10000);
    });
  });

  describe('initialize()', () => {
    it('should set test run metadata', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.initialize({
        csvPath: '/test/file.csv',
        platform: 'salesforce',
        orgAlias: 'my-sandbox',
        totalTests: 10,
        totalSteps: 50,
        filters: { epic: 'CPQ' }
      });

      expect(ledger.ledger.csvPath).toBe('/test/file.csv');
      expect(ledger.ledger.platform).toBe('salesforce');
      expect(ledger.ledger.orgAlias).toBe('my-sandbox');
      expect(ledger.ledger.metadata.totalTests).toBe(10);
      expect(ledger.ledger.metadata.totalSteps).toBe(50);
      expect(ledger.ledger.metadata.filters).toEqual({ epic: 'CPQ' });
    });
  });

  describe('recordStepComplete()', () => {
    it('should record step completion', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.recordStepComplete(0, 1, { status: 'passed', duration: 100 });

      expect(ledger.ledger.completedSteps.length).toBe(1);
      expect(ledger.ledger.completedSteps[0].testIndex).toBe(0);
      expect(ledger.ledger.completedSteps[0].stepNumber).toBe(1);
      expect(ledger.ledger.completedSteps[0].status).toBe('passed');
    });

    it('should not record duplicate completions', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.recordStepComplete(0, 1, { status: 'passed' });
      ledger.recordStepComplete(0, 1, { status: 'passed' });

      expect(ledger.ledger.completedSteps.length).toBe(1);
    });

    it('should update lastCompletedStep', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.recordStepComplete(0, 1, { status: 'passed' });
      ledger.recordStepComplete(0, 2, { status: 'passed' });

      expect(ledger.ledger.lastCompletedStep.stepNumber).toBe(2);
    });
  });

  describe('recordCreatedRecord()', () => {
    it('should track created records', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.recordCreatedRecord('Account', '001ABC123', { testIndex: 0 });

      expect(ledger.ledger.createdRecords.length).toBe(1);
      expect(ledger.ledger.createdRecords[0].objectType).toBe('Account');
      expect(ledger.ledger.createdRecords[0].recordId).toBe('001ABC123');
    });

    it('should include metadata in created records', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.recordCreatedRecord('Account', '001ABC123', { testIndex: 0, stepNumber: 3 });

      expect(ledger.ledger.createdRecords[0].testIndex).toBe(0);
      expect(ledger.ledger.createdRecords[0].stepNumber).toBe(3);
    });
  });

  describe('isStepComplete()', () => {
    it('should return true for completed steps', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.recordStepComplete(0, 1, { status: 'passed' });

      expect(ledger.isStepComplete(0, 1)).toBe(true);
    });

    it('should return false for incomplete steps', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      expect(ledger.isStepComplete(0, 1)).toBe(false);
    });
  });

  describe('context management', () => {
    it('should update single context value', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.updateContext('AccountId', '001ABC');

      expect(ledger.ledger.context.AccountId).toBe('001ABC');
    });

    it('should set multiple context values', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.setContext({ AccountId: '001ABC', OpportunityId: '006XYZ' });

      expect(ledger.ledger.context.AccountId).toBe('001ABC');
      expect(ledger.ledger.context.OpportunityId).toBe('006XYZ');
    });

    it('should get context copy', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.updateContext('key', 'value');

      const context = ledger.getContext();
      context.key = 'modified';

      expect(ledger.getContext().key).toBe('value'); // Original unchanged
    });
  });

  describe('getNextStep()', () => {
    const testCases = [
      {
        steps: [
          { stepNumber: 1 },
          { stepNumber: 2 },
          { stepNumber: 3 }
        ]
      }
    ];

    it('should return first step when none completed', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      const next = ledger.getNextStep(testCases);

      expect(next.testIndex).toBe(0);
      expect(next.stepNumber).toBe(1);
    });

    it('should return next incomplete step', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.recordStepComplete(0, 1, { status: 'passed' });

      const next = ledger.getNextStep(testCases);
      expect(next.stepNumber).toBe(2);
    });

    it('should return null when all complete', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.recordStepComplete(0, 1, { status: 'passed' });
      ledger.recordStepComplete(0, 2, { status: 'passed' });
      ledger.recordStepComplete(0, 3, { status: 'passed' });

      const next = ledger.getNextStep(testCases);
      expect(next).toBeNull();
    });
  });

  describe('status management', () => {
    it('should mark as complete', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.markComplete();

      expect(ledger.getStatus()).toBe(LedgerStatus.COMPLETED);
      expect(ledger.ledger.completedAt).toBeDefined();
    });

    it('should mark as failed', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.markFailed('Test failed');

      expect(ledger.getStatus()).toBe(LedgerStatus.FAILED);
      expect(ledger.ledger.failureReason).toBe('Test failed');
    });

    it('should mark as abandoned', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.markAbandoned();

      expect(ledger.getStatus()).toBe(LedgerStatus.ABANDONED);
    });
  });

  describe('isResumable()', () => {
    it('should return true for in-progress sessions', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      expect(ledger.isResumable()).toBe(true);
    });

    it('should return false for completed sessions', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.markComplete();
      expect(ledger.isResumable()).toBe(false);
    });

    it('should return false for failed sessions', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.markFailed('Error');
      expect(ledger.isResumable()).toBe(false);
    });
  });

  describe('recordError()', () => {
    it('should record error with timestamp', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.recordError({
        testIndex: 0,
        stepNumber: 2,
        message: 'Field not found'
      });

      expect(ledger.ledger.errors.length).toBe(1);
      expect(ledger.ledger.errors[0].message).toBe('Field not found');
      expect(ledger.ledger.errors[0].recordedAt).toBeDefined();
    });
  });

  describe('getSummary()', () => {
    it('should return summary object', () => {
      const ledger = new UATExecutionLedger('test-session', testOutputDir);
      ledger.initialize({ csvPath: '/test.csv', platform: 'salesforce' });
      ledger.recordStepComplete(0, 1, { status: 'passed' });

      const summary = ledger.getSummary();

      expect(summary.sessionId).toBe('test-session');
      expect(summary.status).toBe(LedgerStatus.IN_PROGRESS);
      expect(summary.completedSteps).toBe(1);
      expect(summary.csvPath).toBe('/test.csv');
      expect(summary.platform).toBe('salesforce');
    });
  });

  describe('getRecordsForCleanup()', () => {
    it('should return copy of created records', () => {
      const ledger = new UATExecutionLedger(null, testOutputDir);
      ledger.recordCreatedRecord('Account', '001');
      ledger.recordCreatedRecord('Contact', '003');

      const records = ledger.getRecordsForCleanup();
      expect(records.length).toBe(2);
    });
  });

  describe('save() and load()', () => {
    it('should persist ledger to disk', () => {
      const ledger = new UATExecutionLedger('persist-test', testOutputDir);
      ledger.recordStepComplete(0, 1, { status: 'passed' });
      ledger.save();

      const filePath = path.join(testOutputDir, 'persist-test.ledger.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should load existing ledger', () => {
      // Create and save a ledger
      const ledger1 = new UATExecutionLedger('load-test', testOutputDir);
      ledger1.recordStepComplete(0, 1, { status: 'passed' });
      ledger1.updateContext('key', 'value');
      ledger1.save();

      // Load it
      const ledger2 = UATExecutionLedger.load('load-test', testOutputDir);
      expect(ledger2).not.toBeNull();
      expect(ledger2.getCompletedSteps().length).toBe(1);
      expect(ledger2.getContext().key).toBe('value');
    });

    it('should return null for non-existent session', () => {
      const ledger = UATExecutionLedger.load('non-existent', testOutputDir);
      expect(ledger).toBeNull();
    });
  });

  describe('delete()', () => {
    it('should remove ledger file', () => {
      const ledger = new UATExecutionLedger('delete-test', testOutputDir);
      ledger.save();

      const filePath = path.join(testOutputDir, 'delete-test.ledger.json');
      expect(fs.existsSync(filePath)).toBe(true);

      ledger.delete();
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  describe('findResumable()', () => {
    it('should find in-progress sessions', () => {
      // Create multiple sessions
      const ledger1 = new UATExecutionLedger('resumable-1', testOutputDir);
      ledger1.save();

      const ledger2 = new UATExecutionLedger('completed-1', testOutputDir);
      ledger2.markComplete();
      ledger2.save();

      const ledger3 = new UATExecutionLedger('resumable-2', testOutputDir);
      ledger3.save();

      const resumable = UATExecutionLedger.findResumable(testOutputDir);
      expect(resumable.length).toBe(2);
      expect(resumable.some(r => r.sessionId === 'resumable-1')).toBe(true);
      expect(resumable.some(r => r.sessionId === 'resumable-2')).toBe(true);
    });

    it('should return empty array for non-existent directory', () => {
      const resumable = UATExecutionLedger.findResumable('/non/existent');
      expect(resumable).toEqual([]);
    });

    it('should sort by most recent first', () => {
      const ledger1 = new UATExecutionLedger('old-session', testOutputDir);
      ledger1.ledger.startedAt = '2025-01-01T00:00:00.000Z';
      ledger1.save();

      const ledger2 = new UATExecutionLedger('new-session', testOutputDir);
      ledger2.ledger.startedAt = '2025-11-26T00:00:00.000Z';
      ledger2.save();

      const resumable = UATExecutionLedger.findResumable(testOutputDir);
      expect(resumable[0].sessionId).toBe('new-session');
    });
  });

  describe('cleanup()', () => {
    it('should delete old completed sessions', () => {
      // Create old completed session
      const ledger = new UATExecutionLedger('old-completed', testOutputDir);
      ledger.markComplete();
      // Manually set old date
      ledger.ledger.completedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      ledger.save();

      const deleted = UATExecutionLedger.cleanup(testOutputDir, 7);
      expect(deleted).toBe(1);
    });

    it('should not delete in-progress sessions', () => {
      const ledger = new UATExecutionLedger('in-progress', testOutputDir);
      ledger.save();

      const deleted = UATExecutionLedger.cleanup(testOutputDir, 0);
      expect(deleted).toBe(0);
    });

    it('should return 0 for non-existent directory', () => {
      const deleted = UATExecutionLedger.cleanup('/non/existent', 7);
      expect(deleted).toBe(0);
    });
  });
});

describe('LedgerStatus', () => {
  it('should have correct status values', () => {
    expect(LedgerStatus.IN_PROGRESS).toBe('in_progress');
    expect(LedgerStatus.COMPLETED).toBe('completed');
    expect(LedgerStatus.FAILED).toBe('failed');
    expect(LedgerStatus.ABANDONED).toBe('abandoned');
  });
});
