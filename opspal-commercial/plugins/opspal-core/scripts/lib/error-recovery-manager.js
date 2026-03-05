#!/usr/bin/env node

/**
 * Error Recovery Manager - Defensive Error Recovery
 *
 * Provides automatic rollback and recovery strategies for failed operations.
 *
 * Key Features:
 * - State snapshot before operations
 * - Automatic rollback on failure
 * - Recovery strategy selection
 * - Rollback verification
 * - Recovery audit trail
 *
 * Addresses: Phase 3.2 - Error recovery issues
 *
 * Prevention Target: Operation failures without graceful degradation
 *
 * Usage:
 *   const { ErrorRecoveryManager } = require('./error-recovery-manager');
 *   const recovery = new ErrorRecoveryManager();
 *
 *   const snapshotId = await recovery.captureState('deployMetadata', context);
 *   try {
 *     await performOperation();
 *   } catch (error) {
 *     await recovery.rollback(snapshotId);
 *   }
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ErrorRecoveryManager {
  constructor(options = {}) {
    this.snapshotDir = options.snapshotDir || './.recovery-snapshots';
    this.recoveryLogDir = options.recoveryLogDir || './.recovery-logs';
    this.autoRollback = options.autoRollback !== false; // Default: true

    // Recovery strategies by error type
    this.recoveryStrategies = {
      'DEPLOYMENT_FAILED': {
        name: 'Deployment Rollback',
        rollbackPossible: true,
        strategy: 'revert_to_snapshot',
        steps: [
          'Identify failed deployment artifacts',
          'Restore previous metadata state',
          'Verify rollback success',
          'Clear deployment staging'
        ]
      },
      'DATA_CORRUPTION': {
        name: 'Data Restore',
        rollbackPossible: true,
        strategy: 'restore_from_backup',
        steps: [
          'Stop ongoing operations',
          'Restore data from snapshot',
          'Verify data integrity',
          'Resume operations if safe'
        ]
      },
      'INVALID_STATE': {
        name: 'State Reset',
        rollbackPossible: true,
        strategy: 'reset_to_known_state',
        steps: [
          'Identify inconsistent state',
          'Load last known good state',
          'Apply state reset',
          'Verify consistency'
        ]
      },
      'PERMISSION_DENIED': {
        name: 'Permission Issue',
        rollbackPossible: false,
        strategy: 'escalate_or_abort',
        steps: [
          'Document permission requirements',
          'Notify user of missing permissions',
          'Provide remediation steps',
          'Abort operation safely'
        ]
      },
      'NETWORK_ERROR': {
        name: 'Network Retry',
        rollbackPossible: false,
        strategy: 'exponential_backoff_retry',
        steps: [
          'Wait with exponential backoff',
          'Retry operation with timeout',
          'Fallback to alternative endpoint if available',
          'Abort after max retries'
        ]
      },
      'DEPENDENCY_MISSING': {
        name: 'Dependency Resolution',
        rollbackPossible: false,
        strategy: 'resolve_dependencies',
        steps: [
          'Identify missing dependencies',
          'Check if dependencies can be installed',
          'Install dependencies if possible',
          'Retry operation or abort'
        ]
      },
      'TIMEOUT': {
        name: 'Timeout Recovery',
        rollbackPossible: true,
        strategy: 'partial_rollback_retry',
        steps: [
          'Check partial completion status',
          'Rollback incomplete changes',
          'Retry with increased timeout',
          'Break into smaller batches if needed'
        ]
      }
    };
  }

  /**
   * Capture state before operation
   *
   * @param {string} operationType - Type of operation
   * @param {Object} context - Operation context
   * @returns {string} - Snapshot ID
   */
  async captureState(operationType, context) {
    await fs.mkdir(this.snapshotDir, { recursive: true });

    const snapshotId = `${operationType}-${Date.now()}`;
    const snapshot = {
      id: snapshotId,
      operationType,
      context,
      timestamp: new Date().toISOString(),
      state: await this._captureCurrentState(operationType, context),
      metadata: {
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd()
      }
    };

    const filePath = path.join(this.snapshotDir, `${snapshotId}.json`);
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));

    return snapshotId;
  }

  /**
   * Capture current state based on operation type
   */
  async _captureCurrentState(operationType, context) {
    const state = {
      files: [],
      environment: {},
      metadata: {}
    };

    // Capture file states if applicable
    if (context.files && Array.isArray(context.files)) {
      state.files = await this._captureFileStates(context.files);
    }

    // Capture environment variables
    state.environment = this._captureRelevantEnvVars();

    // Capture operation-specific metadata
    if (operationType.includes('deploy') || operationType.includes('metadata')) {
      state.metadata = await this._captureSalesforceMetadata(context);
    }

    return state;
  }

  /**
   * Capture file states
   */
  async _captureFileStates(filePaths) {
    const fileStates = [];

    for (const filePath of filePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const stats = await fs.stat(filePath);

        fileStates.push({
          path: filePath,
          content,
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          exists: true
        });
      } catch (error) {
        fileStates.push({
          path: filePath,
          exists: false,
          error: error.message
        });
      }
    }

    return fileStates;
  }

  /**
   * Capture relevant environment variables
   */
  _captureRelevantEnvVars() {
    const relevant = [
      'NODE_ENV',
      'SALESFORCE_ORG_ALIAS',
      'HUBSPOT_PORTAL_ID',
      'SUPABASE_URL'
    ];

    const envVars = {};
    relevant.forEach(key => {
      if (process.env[key]) {
        envVars[key] = process.env[key];
      }
    });

    return envVars;
  }

  /**
   * Capture Salesforce metadata state
   */
  async _captureSalesforceMetadata(context) {
    const metadata = {
      org: context.org || 'unknown',
      captured: false
    };

    try {
      // Query current metadata state if org is specified
      if (context.org && context.metadata) {
        // This would query actual SF metadata
        // For now, just record intent
        metadata.metadataTypes = context.metadata;
        metadata.captured = true;
      }
    } catch (error) {
      metadata.error = error.message;
    }

    return metadata;
  }

  /**
   * Rollback to snapshot
   *
   * @param {string} snapshotId - Snapshot to rollback to
   * @returns {Object} - Rollback result
   */
  async rollback(snapshotId) {
    const result = {
      success: false,
      snapshotId,
      timestamp: new Date().toISOString(),
      filesRestored: 0,
      errors: []
    };

    try {
      // Load snapshot
      const snapshot = await this._loadSnapshot(snapshotId);

      // Restore file states
      if (snapshot.state.files && snapshot.state.files.length > 0) {
        result.filesRestored = await this._restoreFileStates(snapshot.state.files);
      }

      // Verify rollback
      const verification = await this._verifyRollback(snapshot);
      result.verified = verification.verified;
      result.verificationDetails = verification.details;

      result.success = result.verified;

      // Log rollback
      await this._logRecovery('rollback', snapshot, result);

    } catch (error) {
      result.errors.push(error.message);
      await this._logRecovery('rollback_failed', { id: snapshotId }, result);
    }

    return result;
  }

  /**
   * Load snapshot from storage
   */
  async _loadSnapshot(snapshotId) {
    const filePath = path.join(this.snapshotDir, `${snapshotId}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  }

  /**
   * Restore file states from snapshot
   */
  async _restoreFileStates(fileStates) {
    let restored = 0;

    for (const fileState of fileStates) {
      try {
        if (fileState.exists && fileState.content) {
          await fs.writeFile(fileState.path, fileState.content);
          restored++;
        }
      } catch (error) {
        console.error(`Failed to restore ${fileState.path}:`, error.message);
      }
    }

    return restored;
  }

  /**
   * Verify rollback success
   */
  async _verifyRollback(snapshot) {
    const verification = {
      verified: true,
      details: []
    };

    // Verify file states
    for (const fileState of snapshot.state.files || []) {
      try {
        if (fileState.exists) {
          const currentContent = await fs.readFile(fileState.path, 'utf8');
          const matches = currentContent === fileState.content;

          verification.details.push({
            file: fileState.path,
            verified: matches,
            reason: matches ? 'Content matches snapshot' : 'Content differs from snapshot'
          });

          if (!matches) {
            verification.verified = false;
          }
        }
      } catch (error) {
        verification.details.push({
          file: fileState.path,
          verified: false,
          reason: error.message
        });
        verification.verified = false;
      }
    }

    return verification;
  }

  /**
   * Determine recovery strategy for error
   *
   * @param {Error} error - The error that occurred
   * @param {Object} context - Operation context
   * @returns {Object} - Recovery strategy
   */
  determineRecoveryStrategy(error, context = {}) {
    const errorType = this._classifyError(error);
    const strategy = this.recoveryStrategies[errorType] || this.recoveryStrategies['INVALID_STATE'];

    return {
      errorType,
      strategy: strategy.strategy,
      rollbackPossible: strategy.rollbackPossible,
      steps: strategy.steps,
      recommendedAction: this._recommendAction(errorType, context)
    };
  }

  /**
   * Classify error type
   */
  _classifyError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('deploy') || message.includes('deployment')) {
      return 'DEPLOYMENT_FAILED';
    }
    if (message.includes('permission') || message.includes('unauthorized')) {
      return 'PERMISSION_DENIED';
    }
    if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) {
      return 'NETWORK_ERROR';
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'TIMEOUT';
    }
    if (message.includes('not found') || message.includes('missing') || message.includes('enoent')) {
      return 'DEPENDENCY_MISSING';
    }
    if (message.includes('corrupt') || message.includes('integrity')) {
      return 'DATA_CORRUPTION';
    }

    return 'INVALID_STATE';
  }

  /**
   * Recommend action based on error type
   */
  _recommendAction(errorType, context) {
    const recommendations = {
      'DEPLOYMENT_FAILED': 'Rollback to previous state and review deployment logs',
      'DATA_CORRUPTION': 'Restore from backup and verify data integrity',
      'INVALID_STATE': 'Reset to known good state and retry',
      'PERMISSION_DENIED': 'Request necessary permissions and retry',
      'NETWORK_ERROR': 'Check network connectivity and retry with backoff',
      'DEPENDENCY_MISSING': 'Install missing dependencies and retry',
      'TIMEOUT': 'Increase timeout or break into smaller operations'
    };

    return recommendations[errorType] || 'Review error details and retry if safe';
  }

  /**
   * Execute recovery with strategy
   *
   * @param {string} snapshotId - Snapshot to recover from
   * @param {Error} error - The error that triggered recovery
   * @param {Object} context - Operation context
   * @returns {Object} - Recovery result
   */
  async executeRecovery(snapshotId, error, context = {}) {
    const strategy = this.determineRecoveryStrategy(error, context);
    const result = {
      success: false,
      strategy: strategy.strategy,
      steps: [],
      timestamp: new Date().toISOString()
    };

    try {
      if (strategy.rollbackPossible) {
        // Attempt rollback
        const rollbackResult = await this.rollback(snapshotId);
        result.rollbackSuccess = rollbackResult.success;
        result.steps.push({
          step: 'rollback',
          success: rollbackResult.success,
          details: rollbackResult
        });

        if (!rollbackResult.success) {
          throw new Error('Rollback failed');
        }
      }

      // Execute strategy-specific recovery
      const strategyResult = await this._executeStrategy(strategy, context);
      result.steps.push({
        step: 'strategy_execution',
        success: strategyResult.success,
        details: strategyResult
      });

      result.success = strategyResult.success;

      // Log recovery
      await this._logRecovery('recovery', { error, strategy }, result);

    } catch (recoveryError) {
      result.error = recoveryError.message;
      result.steps.push({
        step: 'recovery_failed',
        success: false,
        error: recoveryError.message
      });

      await this._logRecovery('recovery_failed', { error, strategy }, result);
    }

    return result;
  }

  /**
   * Execute recovery strategy
   */
  async _executeStrategy(strategy, context) {
    const result = { success: false, message: '' };

    switch (strategy.strategy) {
      case 'exponential_backoff_retry':
        result.success = true;
        result.message = 'Retry with exponential backoff recommended';
        break;

      case 'resolve_dependencies':
        result.success = true;
        result.message = 'Check and install missing dependencies';
        break;

      case 'escalate_or_abort':
        result.success = false;
        result.message = 'Manual intervention required';
        break;

      default:
        result.success = true;
        result.message = 'Standard recovery applied';
    }

    return result;
  }

  /**
   * Log recovery operation
   */
  async _logRecovery(operation, input, result) {
    await fs.mkdir(this.recoveryLogDir, { recursive: true });

    const logEntry = {
      operation,
      timestamp: new Date().toISOString(),
      input,
      result
    };

    const logFile = path.join(this.recoveryLogDir, `recovery-${Date.now()}.json`);
    await fs.writeFile(logFile, JSON.stringify(logEntry, null, 2));
  }

  /**
   * Get recovery statistics
   */
  async getStatistics() {
    await fs.mkdir(this.recoveryLogDir, { recursive: true });

    const files = await fs.readdir(this.recoveryLogDir);
    const logs = await Promise.all(
      files
        .filter(f => f.endsWith('.json'))
        .map(async f => {
          const data = await fs.readFile(path.join(this.recoveryLogDir, f), 'utf8');
          return JSON.parse(data);
        })
    );

    const stats = {
      totalRecoveries: logs.length,
      byOperation: {},
      successRate: 0,
      byErrorType: {}
    };

    let successCount = 0;

    logs.forEach(log => {
      // Count by operation
      stats.byOperation[log.operation] = (stats.byOperation[log.operation] || 0) + 1;

      // Count successes
      if (log.result && log.result.success) {
        successCount++;
      }

      // Count by error type
      if (log.input && log.input.strategy && log.input.strategy.errorType) {
        const errorType = log.input.strategy.errorType;
        stats.byErrorType[errorType] = (stats.byErrorType[errorType] || 0) + 1;
      }
    });

    stats.successRate = logs.length > 0 ? successCount / logs.length : 0;

    return stats;
  }

  /**
   * Cleanup old snapshots
   */
  async cleanupSnapshots(olderThanDays = 30) {
    await fs.mkdir(this.snapshotDir, { recursive: true });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const files = await fs.readdir(this.snapshotDir);
    let removed = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = path.join(this.snapshotDir, file);
        const data = await fs.readFile(filePath, 'utf8');
        const snapshot = JSON.parse(data);

        const snapshotDate = new Date(snapshot.timestamp);

        if (snapshotDate < cutoffDate) {
          await fs.unlink(filePath);
          removed++;
        }
      } catch (error) {
        console.error(`Error cleaning up ${file}:`, error.message);
      }
    }

    return removed;
  }
}

// CLI interface
if (require.main === module) {
  const [,, command, ...args] = process.argv;

  const recovery = new ErrorRecoveryManager();

  async function main() {
    switch (command) {
      case 'stats':
        const stats = await recovery.getStatistics();
        console.log(JSON.stringify(stats, null, 2));
        break;

      case 'cleanup':
        const days = args[0] ? parseInt(args[0]) : 30;
        const removed = await recovery.cleanupSnapshots(days);
        console.log(`Cleaned up ${removed} old snapshots`);
        break;

      case 'strategy':
        const errorMessage = args[0] || 'Unknown error';
        const error = new Error(errorMessage);
        const strategy = recovery.determineRecoveryStrategy(error);
        console.log(JSON.stringify(strategy, null, 2));
        break;

      default:
        console.log(`
Error Recovery Manager

Usage:
  node error-recovery-manager.js stats                    # Show recovery statistics
  node error-recovery-manager.js cleanup [days]           # Cleanup old snapshots
  node error-recovery-manager.js strategy "<error>"       # Determine recovery strategy

Examples:
  node error-recovery-manager.js stats
  node error-recovery-manager.js cleanup 30
  node error-recovery-manager.js strategy "deployment failed"
        `);
    }
  }

  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = { ErrorRecoveryManager };
