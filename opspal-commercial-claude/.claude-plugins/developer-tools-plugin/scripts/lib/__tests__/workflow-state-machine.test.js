/**
 * workflow-state-machine.test.js
 *
 * Tests for WorkflowStateMachine class
 * Validates state transitions, evidence validation, and rollback behavior
 */

const fs = require('fs').promises;
const path = require('path');

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn(),
    stat: jest.fn()
  }
}));

const {
  WorkflowStateMachine,
  WorkflowState,
  EvidenceType
} = require('../workflow-state-machine');

describe('WorkflowStateMachine', () => {
  let machine;

  beforeEach(() => {
    jest.clearAllMocks();
    machine = new WorkflowStateMachine({
      workflowId: 'test-workflow-001',
      workflowType: 'backup',
      metadata: { org: 'test-org' }
    });
  });

  describe('Constructor', () => {
    it('should create instance with required config', () => {
      expect(machine.workflowId).toBe('test-workflow-001');
      expect(machine.workflowType).toBe('backup');
      expect(machine.currentState).toBe(WorkflowState.PENDING);
    });

    it('should initialize with empty arrays', () => {
      expect(machine.stateHistory).toEqual([]);
      expect(machine.evidence).toEqual([]);
      expect(machine.validationResults).toEqual([]);
    });

    it('should set timestamps on creation', () => {
      expect(machine.createdAt).toBeDefined();
      expect(machine.updatedAt).toBeDefined();
    });

    it('should accept metadata', () => {
      expect(machine.metadata.org).toBe('test-org');
    });

    it('should handle missing metadata', () => {
      const m = new WorkflowStateMachine({
        workflowId: 'test',
        workflowType: 'test'
      });
      expect(m.metadata).toEqual({});
    });
  });

  describe('State Transitions', () => {
    it('should transition from pending to in_progress', async () => {
      await machine.transition(WorkflowState.IN_PROGRESS);
      expect(machine.currentState).toBe(WorkflowState.IN_PROGRESS);
    });

    it('should record transition in history', async () => {
      await machine.transition(WorkflowState.IN_PROGRESS);
      expect(machine.stateHistory.length).toBe(1);
      expect(machine.stateHistory[0].from).toBe(WorkflowState.PENDING);
      expect(machine.stateHistory[0].to).toBe(WorkflowState.IN_PROGRESS);
    });

    it('should update timestamp on transition', async () => {
      const beforeUpdate = machine.updatedAt;
      await new Promise(resolve => setTimeout(resolve, 10));
      await machine.transition(WorkflowState.IN_PROGRESS);
      expect(machine.updatedAt).not.toBe(beforeUpdate);
    });

    it('should throw error for invalid state', async () => {
      await expect(machine.transition('invalid_state'))
        .rejects.toThrow('Invalid state');
    });

    it('should prevent invalid transitions', async () => {
      // Cannot go directly from pending to complete
      await expect(machine.transition(WorkflowState.COMPLETE))
        .rejects.toThrow('Invalid transition');
    });

    it('should prevent skipping validation state', async () => {
      await machine.transition(WorkflowState.IN_PROGRESS);
      // Cannot go directly to complete - must go through validating first
      await expect(machine.transition(WorkflowState.COMPLETE))
        .rejects.toThrow('Invalid transition');
    });

    it('should require validation evidence before completing', async () => {
      await machine.transition(WorkflowState.IN_PROGRESS);
      await machine.transition(WorkflowState.VALIDATING);
      // Cannot complete without evidence
      await expect(machine.transition(WorkflowState.COMPLETE))
        .rejects.toThrow('Cannot transition to COMPLETE without validation evidence');
    });

    it('should transition through full workflow', async () => {
      await machine.transition(WorkflowState.IN_PROGRESS);
      await machine.transition(WorkflowState.VALIDATING);

      // Add mock evidence
      machine.evidence.push({
        type: EvidenceType.FILE_EXISTS,
        path: '/test/file.csv',
        valid: true
      });

      await machine.transition(WorkflowState.COMPLETE);
      expect(machine.currentState).toBe(WorkflowState.COMPLETE);
    });

    it('should allow transition to failed from in_progress', async () => {
      await machine.transition(WorkflowState.IN_PROGRESS);
      await machine.transition(WorkflowState.FAILED);
      expect(machine.currentState).toBe(WorkflowState.FAILED);
    });
  });

  describe('Validation', () => {
    beforeEach(async () => {
      await machine.transition(WorkflowState.IN_PROGRESS);
    });

    it('should validate file_exists evidence', async () => {
      fs.access.mockResolvedValue(undefined);

      const result = await machine.validate([
        { type: EvidenceType.FILE_EXISTS, path: '/test/file.csv' }
      ]);

      expect(result).toBe(true);
      expect(machine.evidence.length).toBe(1);
    });

    it('should fail validation when file does not exist', async () => {
      fs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await machine.validate([
        { type: EvidenceType.FILE_EXISTS, path: '/test/missing.csv' }
      ]);

      expect(result).toBe(false);
    });

    it('should validate record_count evidence', async () => {
      const result = await machine.validate([
        { type: EvidenceType.RECORD_COUNT, expected: 100, actual: 100 }
      ]);

      expect(result).toBe(true);
    });

    it('should fail when record counts do not match', async () => {
      const result = await machine.validate([
        { type: EvidenceType.RECORD_COUNT, expected: 100, actual: 50 }
      ]);

      expect(result).toBe(false);
    });

    it('should validate file_size evidence', async () => {
      fs.stat.mockResolvedValue({ size: 1024 });

      const result = await machine.validate([
        { type: EvidenceType.FILE_SIZE, path: '/test/file.csv', minSize: 100 }
      ]);

      expect(result).toBe(true);
    });

    it('should fail when file is too small', async () => {
      fs.stat.mockResolvedValue({ size: 10 });

      const result = await machine.validate([
        { type: EvidenceType.FILE_SIZE, path: '/test/file.csv', minSize: 100 }
      ]);

      expect(result).toBe(false);
    });

    it('should validate custom evidence', async () => {
      // Custom validation uses 'validate' property (sync function) not 'validator'
      const result = await machine.validate([
        { type: EvidenceType.CUSTOM, validate: () => true, reason: 'Custom check passed' }
      ]);

      expect(result).toBe(true);
    });

    it('should auto-complete on successful validation', async () => {
      fs.access.mockResolvedValue(undefined);

      await machine.validate([
        { type: EvidenceType.FILE_EXISTS, path: '/test/file.csv' }
      ]);

      // validate() auto-transitions to COMPLETE if all validations pass
      expect(machine.currentState).toBe(WorkflowState.COMPLETE);
    });

    it('should require all evidence to pass', async () => {
      fs.access.mockResolvedValue(undefined);

      const result = await machine.validate([
        { type: EvidenceType.FILE_EXISTS, path: '/test/file.csv' },
        { type: EvidenceType.RECORD_COUNT, expected: 100, actual: 50 }
      ]);

      expect(result).toBe(false);
    });

    it('should validate checksum evidence (placeholder)', async () => {
      // CHECKSUM validation is a placeholder that always passes
      const result = await machine.validate([
        { type: EvidenceType.CHECKSUM, expected: 'abc123', actual: 'abc123' }
      ]);

      // Checksum validation is currently a placeholder that always passes
      expect(result).toBe(true);
    });

    it('should validate API_RESPONSE evidence with success status', async () => {
      const result = await machine.validate([
        { type: EvidenceType.API_RESPONSE, statusCode: 200 }
      ]);

      expect(result).toBe(true);
    });

    it('should fail API_RESPONSE evidence with error status', async () => {
      const result = await machine.validate([
        { type: EvidenceType.API_RESPONSE, statusCode: 500 }
      ]);

      expect(result).toBe(false);
    });

    it('should fail on unknown evidence type', async () => {
      const result = await machine.validate([
        { type: 'UNKNOWN_TYPE' }
      ]);

      expect(result).toBe(false);
    });

    it('should handle validation errors gracefully', async () => {
      // Test error handling in validation
      fs.access.mockRejectedValue(new Error('Access denied'));

      const result = await machine.validate([
        { type: EvidenceType.FILE_EXISTS, path: '/nonexistent/file.csv' }
      ]);

      expect(result).toBe(false);
    });
  });

  describe('Rollback', () => {
    beforeEach(async () => {
      await machine.transition(WorkflowState.IN_PROGRESS);
    });

    it('should rollback to pending state by default', async () => {
      await machine.rollback();
      expect(machine.currentState).toBe(WorkflowState.PENDING);
    });

    it('should rollback to specified state', async () => {
      await machine.rollback(WorkflowState.FAILED);
      expect(machine.currentState).toBe(WorkflowState.FAILED);
    });

    it('should preserve evidence on rollback', async () => {
      machine.evidence.push({ type: 'test' });
      await machine.rollback();
      expect(machine.evidence.length).toBe(1);
    });

    it('should record rollback in history with type', async () => {
      await machine.rollback();
      const lastEntry = machine.stateHistory[machine.stateHistory.length - 1];
      expect(lastEntry.to).toBe(WorkflowState.PENDING);
      expect(lastEntry.type).toBe('rollback');
    });
  });

  describe('State Persistence', () => {
    it('should auto-persist state on transition when stateFile configured', async () => {
      const machineWithFile = new WorkflowStateMachine({
        workflowId: 'test',
        workflowType: 'backup',
        stateFile: '/tmp/test-state.json'
      });

      fs.mkdir.mockResolvedValue(undefined);
      fs.writeFile.mockResolvedValue(undefined);

      // _persistState is called automatically during transition
      await machineWithFile.transition(WorkflowState.IN_PROGRESS);

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should load state from file', async () => {
      const savedState = JSON.stringify({
        workflowId: 'test',
        currentState: WorkflowState.IN_PROGRESS,
        stateHistory: [{ from: 'pending', to: 'in_progress' }],
        evidence: [],
        validationResults: []
      });

      fs.readFile.mockResolvedValue(savedState);

      const loadedMachine = await WorkflowStateMachine.load('/tmp/test-state.json');

      expect(loadedMachine.currentState).toBe(WorkflowState.IN_PROGRESS);
    });

    it('should handle missing state file', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT'));

      await expect(WorkflowStateMachine.load('/tmp/missing.json'))
        .rejects.toThrow();
    });
  });

  describe('getState', () => {
    it('should return current state summary', () => {
      const state = machine.getState();

      expect(state.workflowId).toBe('test-workflow-001');
      expect(state.currentState).toBe(WorkflowState.PENDING);
      expect(state.stateHistory).toEqual([]);
    });

    it('should update state after transitions', async () => {
      await machine.transition(WorkflowState.IN_PROGRESS);
      const state = machine.getState();

      expect(state.currentState).toBe(WorkflowState.IN_PROGRESS);
      expect(state.stateHistory.length).toBe(1);
    });

    it('should include isComplete and isFailed flags', () => {
      const state = machine.getState();

      expect(state.isComplete).toBe(false);
      expect(state.isFailed).toBe(false);
    });
  });

  describe('getAllowedTransitions', () => {
    it('should return allowed transitions from pending', () => {
      const allowed = machine._getAllowedTransitions();
      expect(allowed).toContain(WorkflowState.IN_PROGRESS);
    });

    it('should return allowed transitions from in_progress', async () => {
      await machine.transition(WorkflowState.IN_PROGRESS);
      const allowed = machine._getAllowedTransitions();
      expect(allowed).toContain(WorkflowState.VALIDATING);
      expect(allowed).toContain(WorkflowState.FAILED);
    });
  });
});

describe('WorkflowState Constants', () => {
  it('should export all state constants', () => {
    expect(WorkflowState.PENDING).toBe('pending');
    expect(WorkflowState.IN_PROGRESS).toBe('in_progress');
    expect(WorkflowState.VALIDATING).toBe('validating');
    expect(WorkflowState.COMPLETE).toBe('complete');
    expect(WorkflowState.FAILED).toBe('failed');
  });
});

describe('EvidenceType Constants', () => {
  it('should export all evidence type constants', () => {
    expect(EvidenceType.FILE_EXISTS).toBe('file_exists');
    expect(EvidenceType.FILE_SIZE).toBe('file_size');
    expect(EvidenceType.RECORD_COUNT).toBe('record_count');
    expect(EvidenceType.CHECKSUM).toBe('checksum');
    expect(EvidenceType.API_RESPONSE).toBe('api_response');
    expect(EvidenceType.CUSTOM).toBe('custom');
  });
});
