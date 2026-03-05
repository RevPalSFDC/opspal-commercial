#!/usr/bin/env node

/**
 * Shared State Manager for Salesforce Operations
 * 
 * Provides centralized state management for multi-agent operations,
 * ensuring consistency and coordination across all Salesforce agents.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class SharedStateManager {
  constructor(instanceName) {
    this.instanceName = instanceName;
    this.statePath = path.join(
      process.cwd(),
      'instances',
      instanceName,
      '.state'
    );
    this.currentState = null;
    this.lockFile = path.join(this.statePath, '.lock');
  }

  /**
   * Initialize state management for a new operation
   */
  async initializeState(operation, metadata = {}) {
    await this.ensureStateDirectory();
    
    const stateId = this.generateStateId();
    const state = {
      id: stateId,
      operation: operation,
      instance: this.instanceName,
      metadata: metadata,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      status: 'INITIALIZED',
      phases: [],
      checkpoints: [],
      conflicts: [],
      resolutions: [],
      validations: [],
      errors: [],
      warnings: []
    };
    
    await this.saveState(state);
    this.currentState = state;
    
    return state;
  }

  /**
   * Load existing state
   */
  async loadState(stateId) {
    const statefile = path.join(this.statePath, `${stateId}.json`);
    
    try {
      const data = await fs.readFile(statefile, 'utf8');
      this.currentState = JSON.parse(data);
      return this.currentState;
    } catch (error) {
      throw new Error(`Failed to load state ${stateId}: ${error.message}`);
    }
  }

  /**
   * Get current active state
   */
  async getCurrentState() {
    if (!this.currentState) {
      const activeFile = path.join(this.statePath, 'active.json');
      try {
        const data = await fs.readFile(activeFile, 'utf8');
        const active = JSON.parse(data);
        await this.loadState(active.stateId);
      } catch (error) {
        return null;
      }
    }
    return this.currentState;
  }

  /**
   * Update state with new phase
   */
  async addPhase(phaseName, status = 'PENDING', details = {}) {
    if (!this.currentState) {
      throw new Error('No active state to update');
    }
    
    const phase = {
      name: phaseName,
      status: status,
      started: status === 'IN_PROGRESS' ? new Date().toISOString() : null,
      completed: null,
      details: details,
      tasks: []
    };
    
    this.currentState.phases.push(phase);
    this.currentState.updated = new Date().toISOString();
    
    await this.saveState(this.currentState);
    return phase;
  }

  /**
   * Update phase status
   */
  async updatePhase(phaseName, status, details = {}) {
    if (!this.currentState) {
      throw new Error('No active state to update');
    }
    
    const phase = this.currentState.phases.find(p => p.name === phaseName);
    if (!phase) {
      throw new Error(`Phase ${phaseName} not found`);
    }
    
    phase.status = status;
    phase.details = { ...phase.details, ...details };
    
    if (status === 'IN_PROGRESS' && !phase.started) {
      phase.started = new Date().toISOString();
    } else if (status === 'COMPLETED' || status === 'FAILED') {
      phase.completed = new Date().toISOString();
    }
    
    this.currentState.updated = new Date().toISOString();
    await this.saveState(this.currentState);
    
    return phase;
  }

  /**
   * Add task to current phase
   */
  async addTask(phaseName, task) {
    if (!this.currentState) {
      throw new Error('No active state to update');
    }
    
    const phase = this.currentState.phases.find(p => p.name === phaseName);
    if (!phase) {
      throw new Error(`Phase ${phaseName} not found`);
    }
    
    const taskEntry = {
      id: this.generateTaskId(),
      description: task.description,
      agent: task.agent,
      status: 'PENDING',
      created: new Date().toISOString(),
      result: null,
      error: null
    };
    
    phase.tasks.push(taskEntry);
    this.currentState.updated = new Date().toISOString();
    await this.saveState(this.currentState);
    
    return taskEntry;
  }

  /**
   * Update task status
   */
  async updateTask(taskId, status, result = null, error = null) {
    if (!this.currentState) {
      throw new Error('No active state to update');
    }
    
    let task = null;
    for (const phase of this.currentState.phases) {
      task = phase.tasks.find(t => t.id === taskId);
      if (task) break;
    }
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    task.status = status;
    task.updated = new Date().toISOString();
    
    if (result) task.result = result;
    if (error) task.error = error;
    
    if (status === 'COMPLETED' || status === 'FAILED') {
      task.completed = new Date().toISOString();
    }
    
    this.currentState.updated = new Date().toISOString();
    await this.saveState(this.currentState);
    
    return task;
  }

  /**
   * Add conflict to state
   */
  async addConflict(conflict) {
    if (!this.currentState) {
      throw new Error('No active state to update');
    }
    
    const conflictEntry = {
      id: this.generateConflictId(),
      type: conflict.type,
      severity: conflict.severity,
      description: conflict.description,
      field: conflict.field,
      details: conflict.details,
      detected: new Date().toISOString(),
      resolved: false,
      resolution: null
    };
    
    this.currentState.conflicts.push(conflictEntry);
    this.currentState.updated = new Date().toISOString();
    await this.saveState(this.currentState);
    
    return conflictEntry;
  }

  /**
   * Resolve conflict
   */
  async resolveConflict(conflictId, resolution) {
    if (!this.currentState) {
      throw new Error('No active state to update');
    }
    
    const conflict = this.currentState.conflicts.find(c => c.id === conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }
    
    conflict.resolved = true;
    conflict.resolution = {
      strategy: resolution.strategy,
      details: resolution.details,
      appliedAt: new Date().toISOString()
    };
    
    this.currentState.resolutions.push({
      conflictId: conflictId,
      ...resolution,
      timestamp: new Date().toISOString()
    });
    
    this.currentState.updated = new Date().toISOString();
    await this.saveState(this.currentState);
    
    return conflict;
  }

  /**
   * Add checkpoint
   */
  async addCheckpoint(label, snapshot = {}) {
    if (!this.currentState) {
      throw new Error('No active state to update');
    }
    
    const checkpoint = {
      id: this.generateCheckpointId(),
      label: label,
      timestamp: new Date().toISOString(),
      snapshot: snapshot,
      restored: false
    };
    
    this.currentState.checkpoints.push(checkpoint);
    this.currentState.updated = new Date().toISOString();
    await this.saveState(this.currentState);
    
    return checkpoint;
  }

  /**
   * Add validation result
   */
  async addValidation(validation) {
    if (!this.currentState) {
      throw new Error('No active state to update');
    }
    
    const validationEntry = {
      id: this.generateValidationId(),
      type: validation.type,
      target: validation.target,
      timestamp: new Date().toISOString(),
      passed: validation.passed,
      checks: validation.checks || [],
      issues: validation.issues || []
    };
    
    this.currentState.validations.push(validationEntry);
    this.currentState.updated = new Date().toISOString();
    await this.saveState(this.currentState);
    
    return validationEntry;
  }

  /**
   * Add error to state
   */
  async addError(error) {
    if (!this.currentState) {
      throw new Error('No active state to update');
    }
    
    const errorEntry = {
      id: this.generateErrorId(),
      message: error.message || error,
      type: error.type || 'UNKNOWN',
      stack: error.stack,
      context: error.context,
      timestamp: new Date().toISOString(),
      recovered: false
    };
    
    this.currentState.errors.push(errorEntry);
    this.currentState.status = 'ERROR';
    this.currentState.updated = new Date().toISOString();
    await this.saveState(this.currentState);
    
    return errorEntry;
  }

  /**
   * Add warning to state
   */
  async addWarning(warning) {
    if (!this.currentState) {
      throw new Error('No active state to update');
    }
    
    const warningEntry = {
      id: this.generateWarningId(),
      message: warning.message || warning,
      type: warning.type || 'UNKNOWN',
      context: warning.context,
      timestamp: new Date().toISOString()
    };
    
    this.currentState.warnings.push(warningEntry);
    this.currentState.updated = new Date().toISOString();
    await this.saveState(this.currentState);
    
    return warningEntry;
  }

  /**
   * Update overall state status
   */
  async updateStatus(status) {
    if (!this.currentState) {
      throw new Error('No active state to update');
    }
    
    this.currentState.status = status;
    this.currentState.updated = new Date().toISOString();
    
    if (status === 'COMPLETED' || status === 'FAILED') {
      this.currentState.completed = new Date().toISOString();
    }
    
    await this.saveState(this.currentState);
    return this.currentState;
  }

  /**
   * Get state summary
   */
  async getStateSummary() {
    if (!this.currentState) {
      return null;
    }
    
    return {
      id: this.currentState.id,
      operation: this.currentState.operation,
      status: this.currentState.status,
      created: this.currentState.created,
      updated: this.currentState.updated,
      completed: this.currentState.completed,
      phases: {
        total: this.currentState.phases.length,
        completed: this.currentState.phases.filter(p => p.status === 'COMPLETED').length,
        failed: this.currentState.phases.filter(p => p.status === 'FAILED').length,
        inProgress: this.currentState.phases.filter(p => p.status === 'IN_PROGRESS').length
      },
      conflicts: {
        total: this.currentState.conflicts.length,
        resolved: this.currentState.conflicts.filter(c => c.resolved).length,
        unresolved: this.currentState.conflicts.filter(c => !c.resolved).length
      },
      validations: {
        total: this.currentState.validations.length,
        passed: this.currentState.validations.filter(v => v.passed).length,
        failed: this.currentState.validations.filter(v => !v.passed).length
      },
      errors: this.currentState.errors.length,
      warnings: this.currentState.warnings.length,
      checkpoints: this.currentState.checkpoints.length
    };
  }

  /**
   * Export state for reporting
   */
  async exportState(format = 'json') {
    if (!this.currentState) {
      throw new Error('No active state to export');
    }
    
    if (format === 'json') {
      return JSON.stringify(this.currentState, null, 2);
    } else if (format === 'summary') {
      return this.generateReadableReport();
    }
    
    throw new Error(`Unsupported export format: ${format}`);
  }

  /**
   * Generate human-readable report
   */
  generateReadableReport() {
    const state = this.currentState;
    let report = [];
    
    report.push('=' .repeat(80));
    report.push(`OPERATION: ${state.operation}`);
    report.push(`STATE ID: ${state.id}`);
    report.push(`STATUS: ${state.status}`);
    report.push(`STARTED: ${state.created}`);
    report.push(`LAST UPDATED: ${state.updated}`);
    report.push('=' .repeat(80));
    
    report.push('\nPHASES:');
    report.push('-' .repeat(40));
    for (const phase of state.phases) {
      report.push(`  ${phase.name}: ${phase.status}`);
      if (phase.tasks.length > 0) {
        report.push(`    Tasks: ${phase.tasks.length} (Completed: ${phase.tasks.filter(t => t.status === 'COMPLETED').length})`);
      }
    }
    
    if (state.conflicts.length > 0) {
      report.push('\nCONFLICTS:');
      report.push('-' .repeat(40));
      for (const conflict of state.conflicts) {
        report.push(`  [${conflict.severity}] ${conflict.description}`);
        report.push(`    Status: ${conflict.resolved ? 'RESOLVED' : 'UNRESOLVED'}`);
      }
    }
    
    if (state.validations.length > 0) {
      report.push('\nVALIDATIONS:');
      report.push('-' .repeat(40));
      for (const validation of state.validations) {
        report.push(`  ${validation.type}: ${validation.passed ? 'PASSED' : 'FAILED'}`);
        if (!validation.passed && validation.issues.length > 0) {
          validation.issues.forEach(issue => {
            report.push(`    - ${issue}`);
          });
        }
      }
    }
    
    if (state.errors.length > 0) {
      report.push('\nERRORS:');
      report.push('-' .repeat(40));
      for (const error of state.errors) {
        report.push(`  ${error.message}`);
      }
    }
    
    if (state.warnings.length > 0) {
      report.push('\nWARNINGS:');
      report.push('-' .repeat(40));
      for (const warning of state.warnings) {
        report.push(`  ${warning.message}`);
      }
    }
    
    report.push('\n' + '=' .repeat(80));
    
    return report.join('\n');
  }

  // Private helper methods

  async ensureStateDirectory() {
    try {
      await fs.mkdir(this.statePath, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create state directory: ${error.message}`);
    }
  }

  async saveState(state) {
    const statefile = path.join(this.statePath, `${state.id}.json`);
    const activeFile = path.join(this.statePath, 'active.json');
    
    try {
      // Acquire lock
      await this.acquireLock();
      
      // Save state file
      await fs.writeFile(statefile, JSON.stringify(state, null, 2));
      
      // Update active pointer
      await fs.writeFile(activeFile, JSON.stringify({ stateId: state.id }));
      
      // Release lock
      await this.releaseLock();
    } catch (error) {
      await this.releaseLock();
      throw new Error(`Failed to save state: ${error.message}`);
    }
  }

  async acquireLock(maxWait = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      try {
        await fs.writeFile(this.lockFile, process.pid.toString(), { flag: 'wx' });
        return;
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    throw new Error('Failed to acquire state lock');
  }

  async releaseLock() {
    try {
      await fs.unlink(this.lockFile);
    } catch (error) {
      // Lock might already be released
    }
  }

  generateStateId() {
    return `state_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateTaskId() {
    return `task_${crypto.randomBytes(8).toString('hex')}`;
  }

  generateConflictId() {
    return `conflict_${crypto.randomBytes(8).toString('hex')}`;
  }

  generateCheckpointId() {
    return `checkpoint_${crypto.randomBytes(8).toString('hex')}`;
  }

  generateValidationId() {
    return `validation_${crypto.randomBytes(8).toString('hex')}`;
  }

  generateErrorId() {
    return `error_${crypto.randomBytes(8).toString('hex')}`;
  }

  generateWarningId() {
    return `warning_${crypto.randomBytes(8).toString('hex')}`;
  }
}

// CLI interface
if (require.main === module) {
  const [,, command, ...args] = process.argv;
  
  async function main() {
    const instanceName = process.env.SALESFORCE_INSTANCE || 'default';
    const manager = new SharedStateManager(instanceName);
    
    try {
      switch (command) {
        case 'init':
          const operation = args[0] || 'unnamed_operation';
          const state = await manager.initializeState(operation);
          console.log(`State initialized: ${state.id}`);
          break;
          
        case 'status':
          const currentState = await manager.getCurrentState();
          if (currentState) {
            const summary = await manager.getStateSummary();
            console.log(JSON.stringify(summary, null, 2));
          } else {
            console.log('No active state');
          }
          break;
          
        case 'report':
          const stateForReport = await manager.getCurrentState();
          if (stateForReport) {
            const report = manager.generateReadableReport();
            console.log(report);
          } else {
            console.log('No active state');
          }
          break;
          
        case 'export':
          const stateForExport = await manager.getCurrentState();
          if (stateForExport) {
            const format = args[0] || 'json';
            const exported = await manager.exportState(format);
            console.log(exported);
          } else {
            console.log('No active state');
          }
          break;
          
        default:
          console.log('Usage: shared-state-manager.js [init|status|report|export] [args...]');
          process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
  
  main();
}

module.exports = { SharedStateManager };