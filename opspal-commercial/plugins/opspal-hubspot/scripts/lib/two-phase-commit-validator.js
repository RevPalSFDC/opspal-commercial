/**
 * Two-Phase Commit Validator
 *
 * Generic validation gate for destructive operations that ensures prerequisites
 * are met before allowing phase 2 (deletion, modification, etc.)
 *
 * Usage Pattern:
 * 1. Phase 1: Prepare operation (migrate data, copy records, etc.)
 * 2. Validation Gate: Verify phase 1 completed successfully
 * 3. Phase 2: Execute destructive operation (delete, modify, etc.)
 *
 * This pattern prevents data loss by ensuring all preparatory steps succeed
 * before any destructive actions are taken.
 */

class TwoPhaseCommitValidator {
  constructor(options = {}) {
    this.sessionId = options.sessionId || this.generateSessionId();
    this.checkpoints = new Map();
    this.strictMode = options.strictMode !== false; // Default to strict
    this.logCallback = options.logCallback || console.log;
  }

  generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Register a checkpoint for phase 1 operation
   * @param {string} checkpointId - Unique identifier for this checkpoint
   * @param {object} metadata - Additional context about the checkpoint
   */
  registerCheckpoint(checkpointId, metadata = {}) {
    this.checkpoints.set(checkpointId, {
      id: checkpointId,
      status: 'pending',
      metadata,
      registeredAt: new Date().toISOString()
    });
  }

  /**
   * Mark a checkpoint as completed successfully
   * @param {string} checkpointId
   * @param {object} result - Result data from the operation
   */
  completeCheckpoint(checkpointId, result = {}) {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not registered: ${checkpointId}`);
    }

    checkpoint.status = 'completed';
    checkpoint.result = result;
    checkpoint.completedAt = new Date().toISOString();

    this.logCallback(`✅ Checkpoint completed: ${checkpointId}`);
  }

  /**
   * Mark a checkpoint as failed
   * @param {string} checkpointId
   * @param {Error|string} error - Error that caused failure
   */
  failCheckpoint(checkpointId, error) {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not registered: ${checkpointId}`);
    }

    checkpoint.status = 'failed';
    checkpoint.error = error instanceof Error ? error.message : error;
    checkpoint.failedAt = new Date().toISOString();

    this.logCallback(`❌ Checkpoint failed: ${checkpointId} - ${checkpoint.error}`);
  }

  /**
   * Validate that all checkpoints have completed successfully
   * @param {object} options - Validation options
   * @returns {object} Validation result with canProceed flag
   */
  validatePhase1(options = {}) {
    const required = options.required || Array.from(this.checkpoints.keys());
    const allowPartial = options.allowPartial || false;

    const results = {
      sessionId: this.sessionId,
      totalCheckpoints: this.checkpoints.size,
      requiredCheckpoints: required.length,
      completed: 0,
      failed: 0,
      pending: 0,
      canProceed: false,
      failures: [],
      warnings: []
    };

    // Count checkpoint statuses
    for (const checkpointId of required) {
      const checkpoint = this.checkpoints.get(checkpointId);

      if (!checkpoint) {
        results.failures.push({
          checkpointId,
          reason: 'Checkpoint not registered'
        });
        results.failed++;
        continue;
      }

      switch (checkpoint.status) {
        case 'completed':
          results.completed++;
          break;
        case 'failed':
          results.failed++;
          results.failures.push({
            checkpointId,
            reason: checkpoint.error
          });
          break;
        case 'pending':
          results.pending++;
          results.failures.push({
            checkpointId,
            reason: 'Checkpoint still pending'
          });
          break;
      }
    }

    // Determine if we can proceed
    if (this.strictMode) {
      // Strict mode: ALL checkpoints must complete
      results.canProceed = results.completed === required.length && results.failed === 0;
    } else if (allowPartial) {
      // Partial mode: At least one checkpoint completed
      results.canProceed = results.completed > 0;
      if (results.failed > 0) {
        results.warnings.push(`${results.failed} checkpoint(s) failed but proceeding in partial mode`);
      }
    } else {
      // Default: All required checkpoints completed, but can have non-required failures
      results.canProceed = results.completed === required.length;
    }

    return results;
  }

  /**
   * Execute phase 2 operation with validation gate
   * @param {Function} phase2Operation - Async function to execute in phase 2
   * @param {object} validationOptions - Options for validatePhase1
   * @returns {Promise<object>} Result of phase 2 operation
   */
  async executePhase2(phase2Operation, validationOptions = {}) {
    const validation = this.validatePhase1(validationOptions);

    if (!validation.canProceed) {
      const error = new Error('Phase 1 validation failed - cannot proceed to phase 2');
      error.validation = validation;

      this.logCallback(`\n❌ TWO-PHASE COMMIT VALIDATION FAILED`);
      this.logCallback(`   Session: ${this.sessionId}`);
      this.logCallback(`   Completed: ${validation.completed}/${validation.requiredCheckpoints}`);
      this.logCallback(`   Failed: ${validation.failed}`);
      this.logCallback(`   Pending: ${validation.pending}`);

      if (validation.failures.length > 0) {
        this.logCallback(`\n   Failures:`);
        validation.failures.forEach(f => {
          this.logCallback(`     - ${f.checkpointId}: ${f.reason}`);
        });
      }

      this.logCallback(`\n   🛑 Phase 2 operation BLOCKED to prevent data loss\n`);

      throw error;
    }

    // Validation passed - execute phase 2
    this.logCallback(`\n✅ Phase 1 validation passed - proceeding to phase 2`);
    this.logCallback(`   Session: ${this.sessionId}`);
    this.logCallback(`   Completed: ${validation.completed}/${validation.requiredCheckpoints}`);

    try {
      const result = await phase2Operation();
      this.logCallback(`✅ Phase 2 completed successfully\n`);
      return {
        success: true,
        validation,
        result
      };
    } catch (error) {
      this.logCallback(`❌ Phase 2 failed: ${error.message}\n`);
      throw error;
    }
  }

  /**
   * Get summary of all checkpoints
   * @returns {object} Summary statistics
   */
  getSummary() {
    const summary = {
      sessionId: this.sessionId,
      checkpoints: [],
      stats: {
        total: this.checkpoints.size,
        completed: 0,
        failed: 0,
        pending: 0
      }
    };

    for (const [id, checkpoint] of this.checkpoints) {
      summary.checkpoints.push({
        id,
        status: checkpoint.status,
        metadata: checkpoint.metadata,
        result: checkpoint.result,
        error: checkpoint.error
      });

      summary.stats[checkpoint.status]++;
    }

    return summary;
  }

  /**
   * Reset all checkpoints for retry
   */
  reset() {
    for (const checkpoint of this.checkpoints.values()) {
      checkpoint.status = 'pending';
      delete checkpoint.result;
      delete checkpoint.error;
      delete checkpoint.completedAt;
      delete checkpoint.failedAt;
    }
  }
}

// Example usage
async function exampleUsage() {
  console.log('Two-Phase Commit Validator - Example Usage\n');

  // Create validator
  const validator = new TwoPhaseCommitValidator({
    sessionId: 'example-session',
    strictMode: true
  });

  // Phase 1: Register and execute preparatory operations
  console.log('PHASE 1: Preparatory Operations\n');

  validator.registerCheckpoint('migrate-contacts', {
    description: 'Migrate contacts from duplicate to master',
    expected: 10
  });

  validator.registerCheckpoint('migrate-deals', {
    description: 'Migrate deals from duplicate to master',
    expected: 5
  });

  validator.registerCheckpoint('migrate-tickets', {
    description: 'Migrate tickets from duplicate to master',
    expected: 2
  });

  // Simulate operations
  try {
    // Success: Contacts migrated
    await new Promise(resolve => setTimeout(resolve, 100));
    validator.completeCheckpoint('migrate-contacts', { migrated: 10 });

    // Success: Deals migrated
    await new Promise(resolve => setTimeout(resolve, 100));
    validator.completeCheckpoint('migrate-deals', { migrated: 5 });

    // Success: Tickets migrated
    await new Promise(resolve => setTimeout(resolve, 100));
    validator.completeCheckpoint('migrate-tickets', { migrated: 2 });

    // Phase 2: Execute destructive operation with validation
    console.log('\nPHASE 2: Destructive Operation (with validation gate)\n');

    const result = await validator.executePhase2(async () => {
      console.log('  🗑️  Deleting duplicate company...');
      await new Promise(resolve => setTimeout(resolve, 100));
      return { deleted: true, companyId: '12345' };
    });

    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run example if called directly
if (require.main === module) {
  exampleUsage();
}

module.exports = TwoPhaseCommitValidator;
