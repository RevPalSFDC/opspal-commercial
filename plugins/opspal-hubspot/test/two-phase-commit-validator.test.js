/**
 * Test Suite: Two-Phase Commit Validator
 *
 * Tests the validation gate for destructive operations that ensures
 * prerequisites are met before allowing phase 2 (deletion, modification, etc.)
 *
 * CRITICAL: This validator prevents data loss by blocking destructive
 * operations until all preparatory steps succeed.
 *
 * Coverage Target: >90%
 * Priority: Tier 1 (CRITICAL - Checkpoint Validation Gates)
 */

const TwoPhaseCommitValidator = require('../scripts/lib/two-phase-commit-validator');

describe('TwoPhaseCommitValidator', () => {
  let validator;
  let mockLogCallback;

  beforeEach(() => {
    mockLogCallback = jest.fn();
    validator = new TwoPhaseCommitValidator({
      sessionId: 'test-session-123',
      logCallback: mockLogCallback
    });
  });

  describe('Constructor', () => {
    it('should use provided sessionId', () => {
      const v = new TwoPhaseCommitValidator({ sessionId: 'custom-id' });
      expect(v.sessionId).toBe('custom-id');
    });

    it('should generate sessionId if not provided', () => {
      const v = new TwoPhaseCommitValidator();
      expect(v.sessionId).toBeDefined();
      expect(v.sessionId.length).toBeGreaterThan(0);
    });

    it('should default strictMode to true', () => {
      const v = new TwoPhaseCommitValidator();
      expect(v.strictMode).toBe(true);
    });

    it('should allow strictMode to be disabled', () => {
      const v = new TwoPhaseCommitValidator({ strictMode: false });
      expect(v.strictMode).toBe(false);
    });

    it('should use provided logCallback', () => {
      const customLog = jest.fn();
      const v = new TwoPhaseCommitValidator({ logCallback: customLog });
      v.registerCheckpoint('test');
      v.completeCheckpoint('test');
      expect(customLog).toHaveBeenCalled();
    });

    it('should default logCallback to console.log', () => {
      const v = new TwoPhaseCommitValidator();
      expect(v.logCallback).toBe(console.log);
    });

    it('should initialize with empty checkpoints', () => {
      expect(validator.checkpoints.size).toBe(0);
    });
  });

  describe('generateSessionId()', () => {
    it('should generate unique session IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(validator.generateSessionId());
      }
      expect(ids.size).toBe(100);
    });

    it('should include timestamp in session ID', () => {
      const beforeTime = Date.now();
      const sessionId = validator.generateSessionId();
      const afterTime = Date.now();

      const timestamp = parseInt(sessionId.split('-')[0], 10);
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('registerCheckpoint()', () => {
    it('should register checkpoint with pending status', () => {
      validator.registerCheckpoint('cp-1');

      const checkpoint = validator.checkpoints.get('cp-1');
      expect(checkpoint).toBeDefined();
      expect(checkpoint.status).toBe('pending');
    });

    it('should store checkpoint metadata', () => {
      validator.registerCheckpoint('cp-1', {
        description: 'Test checkpoint',
        expected: 10
      });

      const checkpoint = validator.checkpoints.get('cp-1');
      expect(checkpoint.metadata.description).toBe('Test checkpoint');
      expect(checkpoint.metadata.expected).toBe(10);
    });

    it('should record registration timestamp', () => {
      const beforeTime = new Date().toISOString();
      validator.registerCheckpoint('cp-1');
      const afterTime = new Date().toISOString();

      const checkpoint = validator.checkpoints.get('cp-1');
      expect(checkpoint.registeredAt).toBeDefined();
      expect(checkpoint.registeredAt >= beforeTime).toBe(true);
      expect(checkpoint.registeredAt <= afterTime).toBe(true);
    });

    it('should allow multiple checkpoints', () => {
      validator.registerCheckpoint('cp-1');
      validator.registerCheckpoint('cp-2');
      validator.registerCheckpoint('cp-3');

      expect(validator.checkpoints.size).toBe(3);
    });

    it('should overwrite existing checkpoint if re-registered', () => {
      validator.registerCheckpoint('cp-1', { version: 1 });
      validator.completeCheckpoint('cp-1');

      validator.registerCheckpoint('cp-1', { version: 2 });

      const checkpoint = validator.checkpoints.get('cp-1');
      expect(checkpoint.status).toBe('pending');
      expect(checkpoint.metadata.version).toBe(2);
    });
  });

  describe('completeCheckpoint()', () => {
    beforeEach(() => {
      validator.registerCheckpoint('cp-1');
    });

    it('should mark checkpoint as completed', () => {
      validator.completeCheckpoint('cp-1');

      const checkpoint = validator.checkpoints.get('cp-1');
      expect(checkpoint.status).toBe('completed');
    });

    it('should store completion result', () => {
      validator.completeCheckpoint('cp-1', { migrated: 10, successful: true });

      const checkpoint = validator.checkpoints.get('cp-1');
      expect(checkpoint.result.migrated).toBe(10);
      expect(checkpoint.result.successful).toBe(true);
    });

    it('should record completion timestamp', () => {
      const beforeTime = new Date().toISOString();
      validator.completeCheckpoint('cp-1');
      const afterTime = new Date().toISOString();

      const checkpoint = validator.checkpoints.get('cp-1');
      expect(checkpoint.completedAt).toBeDefined();
      expect(checkpoint.completedAt >= beforeTime).toBe(true);
      expect(checkpoint.completedAt <= afterTime).toBe(true);
    });

    it('should log completion message', () => {
      validator.completeCheckpoint('cp-1');

      expect(mockLogCallback).toHaveBeenCalledWith(
        expect.stringContaining('Checkpoint completed: cp-1')
      );
    });

    it('should throw error for unregistered checkpoint', () => {
      expect(() => {
        validator.completeCheckpoint('unknown');
      }).toThrow('Checkpoint not registered: unknown');
    });
  });

  describe('failCheckpoint()', () => {
    beforeEach(() => {
      validator.registerCheckpoint('cp-1');
    });

    it('should mark checkpoint as failed', () => {
      validator.failCheckpoint('cp-1', 'Something went wrong');

      const checkpoint = validator.checkpoints.get('cp-1');
      expect(checkpoint.status).toBe('failed');
    });

    it('should store error message from string', () => {
      validator.failCheckpoint('cp-1', 'API error');

      const checkpoint = validator.checkpoints.get('cp-1');
      expect(checkpoint.error).toBe('API error');
    });

    it('should store error message from Error object', () => {
      validator.failCheckpoint('cp-1', new Error('Connection failed'));

      const checkpoint = validator.checkpoints.get('cp-1');
      expect(checkpoint.error).toBe('Connection failed');
    });

    it('should record failure timestamp', () => {
      const beforeTime = new Date().toISOString();
      validator.failCheckpoint('cp-1', 'Error');
      const afterTime = new Date().toISOString();

      const checkpoint = validator.checkpoints.get('cp-1');
      expect(checkpoint.failedAt).toBeDefined();
      expect(checkpoint.failedAt >= beforeTime).toBe(true);
      expect(checkpoint.failedAt <= afterTime).toBe(true);
    });

    it('should log failure message', () => {
      validator.failCheckpoint('cp-1', 'Network timeout');

      expect(mockLogCallback).toHaveBeenCalledWith(
        expect.stringContaining('Checkpoint failed: cp-1')
      );
    });

    it('should throw error for unregistered checkpoint', () => {
      expect(() => {
        validator.failCheckpoint('unknown', 'error');
      }).toThrow('Checkpoint not registered: unknown');
    });
  });

  describe('validatePhase1()', () => {
    describe('with all checkpoints completed', () => {
      beforeEach(() => {
        validator.registerCheckpoint('cp-1');
        validator.registerCheckpoint('cp-2');
        validator.completeCheckpoint('cp-1');
        validator.completeCheckpoint('cp-2');
      });

      it('should allow proceeding in strict mode', () => {
        const result = validator.validatePhase1();

        expect(result.canProceed).toBe(true);
        expect(result.completed).toBe(2);
        expect(result.failed).toBe(0);
      });

      it('should include session ID in result', () => {
        const result = validator.validatePhase1();
        expect(result.sessionId).toBe('test-session-123');
      });

      it('should count total and required checkpoints', () => {
        const result = validator.validatePhase1();

        expect(result.totalCheckpoints).toBe(2);
        expect(result.requiredCheckpoints).toBe(2);
      });
    });

    describe('with failed checkpoints', () => {
      beforeEach(() => {
        validator.registerCheckpoint('cp-1');
        validator.registerCheckpoint('cp-2');
        validator.completeCheckpoint('cp-1');
        validator.failCheckpoint('cp-2', 'Failed to migrate');
      });

      it('should block proceeding in strict mode', () => {
        const result = validator.validatePhase1();

        expect(result.canProceed).toBe(false);
        expect(result.completed).toBe(1);
        expect(result.failed).toBe(1);
      });

      it('should include failure details', () => {
        const result = validator.validatePhase1();

        expect(result.failures.length).toBe(1);
        expect(result.failures[0].checkpointId).toBe('cp-2');
        expect(result.failures[0].reason).toBe('Failed to migrate');
      });
    });

    describe('with pending checkpoints', () => {
      beforeEach(() => {
        validator.registerCheckpoint('cp-1');
        validator.registerCheckpoint('cp-2');
        validator.completeCheckpoint('cp-1');
        // cp-2 left pending
      });

      it('should block proceeding in strict mode', () => {
        const result = validator.validatePhase1();

        expect(result.canProceed).toBe(false);
        expect(result.pending).toBe(1);
      });

      it('should include pending checkpoint in failures', () => {
        const result = validator.validatePhase1();

        expect(result.failures).toContainEqual({
          checkpointId: 'cp-2',
          reason: 'Checkpoint still pending'
        });
      });
    });

    describe('with required checkpoints option', () => {
      beforeEach(() => {
        validator.registerCheckpoint('cp-1');
        validator.registerCheckpoint('cp-2');
        validator.registerCheckpoint('cp-3');
        validator.completeCheckpoint('cp-1');
        validator.completeCheckpoint('cp-2');
        // cp-3 left pending
      });

      it('should only check required checkpoints', () => {
        const result = validator.validatePhase1({
          required: ['cp-1', 'cp-2']
        });

        expect(result.canProceed).toBe(true);
        expect(result.requiredCheckpoints).toBe(2);
      });

      it('should fail if required checkpoint not registered', () => {
        const result = validator.validatePhase1({
          required: ['cp-1', 'unknown-cp']
        });

        expect(result.canProceed).toBe(false);
        expect(result.failures).toContainEqual({
          checkpointId: 'unknown-cp',
          reason: 'Checkpoint not registered'
        });
      });
    });

    describe('with allowPartial option', () => {
      beforeEach(() => {
        validator = new TwoPhaseCommitValidator({
          sessionId: 'test-session',
          strictMode: false,
          logCallback: mockLogCallback
        });
        validator.registerCheckpoint('cp-1');
        validator.registerCheckpoint('cp-2');
        validator.completeCheckpoint('cp-1');
        validator.failCheckpoint('cp-2', 'Error');
      });

      it('should allow proceeding with partial completion', () => {
        const result = validator.validatePhase1({ allowPartial: true });

        expect(result.canProceed).toBe(true);
      });

      it('should include warning about failures', () => {
        const result = validator.validatePhase1({ allowPartial: true });

        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('failed');
      });

      it('should not allow if no checkpoints completed', () => {
        validator.reset();
        validator.failCheckpoint('cp-1', 'Error');
        validator.failCheckpoint('cp-2', 'Error');

        const result = validator.validatePhase1({ allowPartial: true });

        expect(result.canProceed).toBe(false);
      });
    });

    describe('non-strict mode', () => {
      beforeEach(() => {
        validator = new TwoPhaseCommitValidator({
          sessionId: 'test-session',
          strictMode: false,
          logCallback: mockLogCallback
        });
        validator.registerCheckpoint('cp-1');
        validator.registerCheckpoint('cp-2');
        validator.completeCheckpoint('cp-1');
        validator.completeCheckpoint('cp-2');
      });

      it('should require all checkpoints completed', () => {
        const result = validator.validatePhase1();
        expect(result.canProceed).toBe(true);
      });
    });
  });

  describe('executePhase2()', () => {
    describe('when validation passes', () => {
      beforeEach(() => {
        validator.registerCheckpoint('cp-1');
        validator.completeCheckpoint('cp-1');
      });

      it('should execute phase 2 operation', async () => {
        const phase2Op = jest.fn().mockResolvedValue({ deleted: true });

        const result = await validator.executePhase2(phase2Op);

        expect(phase2Op).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.result).toEqual({ deleted: true });
      });

      it('should include validation in result', async () => {
        const result = await validator.executePhase2(async () => 'done');

        expect(result.validation).toBeDefined();
        expect(result.validation.canProceed).toBe(true);
      });

      it('should log success messages', async () => {
        await validator.executePhase2(async () => 'done');

        expect(mockLogCallback).toHaveBeenCalledWith(
          expect.stringContaining('Phase 1 validation passed')
        );
        expect(mockLogCallback).toHaveBeenCalledWith(
          expect.stringContaining('Phase 2 completed successfully')
        );
      });
    });

    describe('when validation fails', () => {
      beforeEach(() => {
        validator.registerCheckpoint('cp-1');
        validator.failCheckpoint('cp-1', 'Migration failed');
      });

      it('should throw error with validation details', async () => {
        const phase2Op = jest.fn();

        await expect(validator.executePhase2(phase2Op)).rejects.toThrow(
          'Phase 1 validation failed'
        );

        expect(phase2Op).not.toHaveBeenCalled();
      });

      it('should include validation in error', async () => {
        try {
          await validator.executePhase2(async () => {});
        } catch (error) {
          expect(error.validation).toBeDefined();
          expect(error.validation.canProceed).toBe(false);
        }
      });

      it('should log failure details', async () => {
        try {
          await validator.executePhase2(async () => {});
        } catch (error) {
          // Expected
        }

        expect(mockLogCallback).toHaveBeenCalledWith(
          expect.stringContaining('TWO-PHASE COMMIT VALIDATION FAILED')
        );
        expect(mockLogCallback).toHaveBeenCalledWith(
          expect.stringContaining('Phase 2 operation BLOCKED')
        );
      });
    });

    describe('when phase 2 operation fails', () => {
      beforeEach(() => {
        validator.registerCheckpoint('cp-1');
        validator.completeCheckpoint('cp-1');
      });

      it('should propagate phase 2 error', async () => {
        const phase2Op = jest.fn().mockRejectedValue(new Error('Delete failed'));

        await expect(validator.executePhase2(phase2Op)).rejects.toThrow('Delete failed');
      });

      it('should log phase 2 failure', async () => {
        const phase2Op = jest.fn().mockRejectedValue(new Error('Delete failed'));

        try {
          await validator.executePhase2(phase2Op);
        } catch (error) {
          // Expected
        }

        expect(mockLogCallback).toHaveBeenCalledWith(
          expect.stringContaining('Phase 2 failed: Delete failed')
        );
      });
    });

    describe('with validation options', () => {
      beforeEach(() => {
        validator.registerCheckpoint('cp-1');
        validator.registerCheckpoint('cp-2');
        validator.completeCheckpoint('cp-1');
        // cp-2 left pending
      });

      it('should pass validation options to validatePhase1', async () => {
        const phase2Op = jest.fn().mockResolvedValue('done');

        const result = await validator.executePhase2(phase2Op, {
          required: ['cp-1']
        });

        expect(result.success).toBe(true);
      });
    });
  });

  describe('getSummary()', () => {
    beforeEach(() => {
      validator.registerCheckpoint('cp-1', { desc: 'First' });
      validator.registerCheckpoint('cp-2', { desc: 'Second' });
      validator.registerCheckpoint('cp-3', { desc: 'Third' });
      validator.completeCheckpoint('cp-1', { count: 10 });
      validator.failCheckpoint('cp-2', 'Error occurred');
      // cp-3 left pending
    });

    it('should include session ID', () => {
      const summary = validator.getSummary();
      expect(summary.sessionId).toBe('test-session-123');
    });

    it('should list all checkpoints with status', () => {
      const summary = validator.getSummary();

      expect(summary.checkpoints.length).toBe(3);

      const cp1 = summary.checkpoints.find(c => c.id === 'cp-1');
      expect(cp1.status).toBe('completed');
      expect(cp1.result).toEqual({ count: 10 });

      const cp2 = summary.checkpoints.find(c => c.id === 'cp-2');
      expect(cp2.status).toBe('failed');
      expect(cp2.error).toBe('Error occurred');

      const cp3 = summary.checkpoints.find(c => c.id === 'cp-3');
      expect(cp3.status).toBe('pending');
    });

    it('should include correct stats', () => {
      const summary = validator.getSummary();

      expect(summary.stats.total).toBe(3);
      expect(summary.stats.completed).toBe(1);
      expect(summary.stats.failed).toBe(1);
      expect(summary.stats.pending).toBe(1);
    });

    it('should include checkpoint metadata', () => {
      const summary = validator.getSummary();

      const cp1 = summary.checkpoints.find(c => c.id === 'cp-1');
      expect(cp1.metadata).toEqual({ desc: 'First' });
    });
  });

  describe('reset()', () => {
    beforeEach(() => {
      validator.registerCheckpoint('cp-1');
      validator.registerCheckpoint('cp-2');
      validator.completeCheckpoint('cp-1', { count: 10 });
      validator.failCheckpoint('cp-2', 'Error');
    });

    it('should reset all checkpoints to pending', () => {
      validator.reset();

      const cp1 = validator.checkpoints.get('cp-1');
      const cp2 = validator.checkpoints.get('cp-2');

      expect(cp1.status).toBe('pending');
      expect(cp2.status).toBe('pending');
    });

    it('should clear result data', () => {
      validator.reset();

      const cp1 = validator.checkpoints.get('cp-1');
      expect(cp1.result).toBeUndefined();
    });

    it('should clear error data', () => {
      validator.reset();

      const cp2 = validator.checkpoints.get('cp-2');
      expect(cp2.error).toBeUndefined();
    });

    it('should clear completion timestamps', () => {
      validator.reset();

      const cp1 = validator.checkpoints.get('cp-1');
      const cp2 = validator.checkpoints.get('cp-2');

      expect(cp1.completedAt).toBeUndefined();
      expect(cp2.failedAt).toBeUndefined();
    });

    it('should preserve checkpoint registration', () => {
      validator.reset();

      expect(validator.checkpoints.size).toBe(2);
      expect(validator.checkpoints.has('cp-1')).toBe(true);
      expect(validator.checkpoints.has('cp-2')).toBe(true);
    });

    it('should preserve checkpoint metadata', () => {
      validator.registerCheckpoint('cp-3', { important: true });
      validator.completeCheckpoint('cp-3');

      validator.reset();

      const cp3 = validator.checkpoints.get('cp-3');
      expect(cp3.metadata.important).toBe(true);
    });
  });

  describe('Integration scenarios', () => {
    describe('full merge workflow', () => {
      it('should complete successful two-phase merge', async () => {
        // Phase 1: Register and complete preparatory checkpoints
        validator.registerCheckpoint('migrate-contacts', { expected: 10 });
        validator.registerCheckpoint('migrate-deals', { expected: 5 });
        validator.registerCheckpoint('migrate-tickets', { expected: 2 });

        validator.completeCheckpoint('migrate-contacts', { migrated: 10 });
        validator.completeCheckpoint('migrate-deals', { migrated: 5 });
        validator.completeCheckpoint('migrate-tickets', { migrated: 2 });

        // Phase 2: Execute destructive operation
        const result = await validator.executePhase2(async () => {
          return { deleted: true, companyId: '12345' };
        });

        expect(result.success).toBe(true);
        expect(result.result.deleted).toBe(true);
        expect(result.validation.completed).toBe(3);
      });

      it('should block deletion when migration fails', async () => {
        validator.registerCheckpoint('migrate-contacts', { expected: 10 });
        validator.registerCheckpoint('migrate-deals', { expected: 5 });

        validator.completeCheckpoint('migrate-contacts', { migrated: 10 });
        validator.failCheckpoint('migrate-deals', 'API rate limit exceeded');

        const deleteOp = jest.fn();

        await expect(validator.executePhase2(deleteOp)).rejects.toThrow(
          'Phase 1 validation failed'
        );

        // Critical: Delete should NEVER be called
        expect(deleteOp).not.toHaveBeenCalled();
      });
    });

    describe('retry workflow', () => {
      it('should allow retry after reset', async () => {
        // First attempt fails
        validator.registerCheckpoint('cp-1');
        validator.failCheckpoint('cp-1', 'Network error');

        const validation1 = validator.validatePhase1();
        expect(validation1.canProceed).toBe(false);

        // Reset and retry
        validator.reset();
        validator.completeCheckpoint('cp-1', { success: true });

        const validation2 = validator.validatePhase1();
        expect(validation2.canProceed).toBe(true);
      });
    });

    describe('selective checkpoint validation', () => {
      it('should allow proceeding with only required checkpoints', async () => {
        validator.registerCheckpoint('critical-migration');
        validator.registerCheckpoint('optional-cleanup');

        validator.completeCheckpoint('critical-migration');
        // optional-cleanup left pending

        const result = await validator.executePhase2(
          async () => ({ done: true }),
          { required: ['critical-migration'] }
        );

        expect(result.success).toBe(true);
      });
    });
  });
});
