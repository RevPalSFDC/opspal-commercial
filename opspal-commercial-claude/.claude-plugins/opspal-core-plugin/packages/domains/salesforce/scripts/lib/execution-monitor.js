#!/usr/bin/env node

/**
 * Execution Monitor System
 * 
 * Real-time monitoring and tracking of Salesforce operations across
 * all phases, including dependency satisfaction, validation bypasses,
 * and progress tracking.
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class ExecutionMonitor extends EventEmitter {
  constructor() {
    super();
    this.activeOperations = new Map();
    this.completedOperations = new Map();
    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageDuration: 0,
      bypassesUsed: 0
    };
    this.startTime = Date.now();
  }

  /**
   * Start monitoring a new operation
   */
  startOperation(operationId, metadata = {}) {
    const operation = {
      id: operationId,
      type: metadata.type || 'unknown',
      object: metadata.object,
      phase: metadata.phase || 1,
      status: 'STARTED',
      startTime: new Date().toISOString(),
      endTime: null,
      duration: null,
      metadata: metadata,
      phases: [],
      dependencies: {
        required: metadata.dependencies || [],
        satisfied: [],
        pending: metadata.dependencies || []
      },
      validationBypasses: {
        active: [],
        scheduled: metadata.bypasses || [],
        history: []
      },
      progress: {
        totalRecords: metadata.totalRecords || 0,
        processedRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
        percentage: 0
      },
      errors: [],
      warnings: [],
      checkpoints: []
    };

    this.activeOperations.set(operationId, operation);
    this.metrics.totalOperations++;
    
    this.emit('operation:started', operation);
    
    return operation;
  }

  /**
   * Update operation phase
   */
  updatePhase(operationId, phaseData) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const phase = {
      number: phaseData.number || operation.phases.length + 1,
      name: phaseData.name,
      status: 'IN_PROGRESS',
      startTime: new Date().toISOString(),
      endTime: null,
      objects: phaseData.objects || [],
      parallel: phaseData.parallel || false,
      tasks: []
    };

    operation.phases.push(phase);
    operation.currentPhase = phase.number;
    
    this.emit('phase:started', { operationId, phase });
    
    return phase;
  }

  /**
   * Complete a phase
   */
  completePhase(operationId, phaseNumber, status = 'COMPLETED') {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const phase = operation.phases.find(p => p.number === phaseNumber);
    if (!phase) {
      throw new Error(`Phase ${phaseNumber} not found`);
    }

    phase.status = status;
    phase.endTime = new Date().toISOString();
    phase.duration = new Date(phase.endTime) - new Date(phase.startTime);
    
    this.emit('phase:completed', { operationId, phase });
    
    return phase;
  }

  /**
   * Track dependency satisfaction
   */
  satisfyDependency(operationId, dependencyId) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const index = operation.dependencies.pending.indexOf(dependencyId);
    if (index !== -1) {
      operation.dependencies.pending.splice(index, 1);
      operation.dependencies.satisfied.push(dependencyId);
      
      this.emit('dependency:satisfied', { 
        operationId, 
        dependencyId,
        remaining: operation.dependencies.pending.length
      });
    }
    
    return operation.dependencies;
  }

  /**
   * Enable validation bypass
   */
  enableBypass(operationId, bypassType, details = {}) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const bypass = {
      type: bypassType,
      enabledAt: new Date().toISOString(),
      disabledAt: null,
      details: details,
      active: true
    };

    operation.validationBypasses.active.push(bypass);
    operation.validationBypasses.history.push(bypass);
    this.metrics.bypassesUsed++;
    
    this.emit('bypass:enabled', { operationId, bypass });
    
    return bypass;
  }

  /**
   * Disable validation bypass
   */
  disableBypass(operationId, bypassType) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const bypass = operation.validationBypasses.active.find(b => b.type === bypassType);
    if (bypass) {
      bypass.active = false;
      bypass.disabledAt = new Date().toISOString();
      
      const index = operation.validationBypasses.active.indexOf(bypass);
      operation.validationBypasses.active.splice(index, 1);
      
      this.emit('bypass:disabled', { operationId, bypass });
    }
    
    return bypass;
  }

  /**
   * Update progress
   */
  updateProgress(operationId, progressData) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    Object.assign(operation.progress, progressData);
    
    if (operation.progress.totalRecords > 0) {
      operation.progress.percentage = Math.round(
        (operation.progress.processedRecords / operation.progress.totalRecords) * 100
      );
    }
    
    this.emit('progress:updated', { 
      operationId, 
      progress: operation.progress 
    });
    
    return operation.progress;
  }

  /**
   * Add error to operation
   */
  addError(operationId, error) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const errorEntry = {
      timestamp: new Date().toISOString(),
      message: error.message || error,
      type: error.type || 'ERROR',
      stack: error.stack,
      phase: operation.currentPhase,
      context: error.context
    };

    operation.errors.push(errorEntry);
    
    this.emit('error:added', { operationId, error: errorEntry });
    
    return errorEntry;
  }

  /**
   * Add warning to operation
   */
  addWarning(operationId, warning) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const warningEntry = {
      timestamp: new Date().toISOString(),
      message: warning.message || warning,
      type: warning.type || 'WARNING',
      phase: operation.currentPhase,
      context: warning.context
    };

    operation.warnings.push(warningEntry);
    
    this.emit('warning:added', { operationId, warning: warningEntry });
    
    return warningEntry;
  }

  /**
   * Create checkpoint
   */
  createCheckpoint(operationId, label) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const checkpoint = {
      id: `cp_${Date.now()}`,
      label: label,
      timestamp: new Date().toISOString(),
      phase: operation.currentPhase,
      progress: { ...operation.progress },
      dependencies: { ...operation.dependencies },
      bypasses: [...operation.validationBypasses.active]
    };

    operation.checkpoints.push(checkpoint);
    
    this.emit('checkpoint:created', { operationId, checkpoint });
    
    return checkpoint;
  }

  /**
   * Complete operation
   */
  completeOperation(operationId, status = 'COMPLETED') {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    operation.status = status;
    operation.endTime = new Date().toISOString();
    operation.duration = new Date(operation.endTime) - new Date(operation.startTime);
    
    // Update metrics
    if (status === 'COMPLETED') {
      this.metrics.successfulOperations++;
    } else if (status === 'FAILED') {
      this.metrics.failedOperations++;
    }
    
    // Calculate average duration
    const completedCount = this.metrics.successfulOperations + this.metrics.failedOperations;
    this.metrics.averageDuration = 
      (this.metrics.averageDuration * (completedCount - 1) + operation.duration) / completedCount;
    
    // Move to completed
    this.activeOperations.delete(operationId);
    this.completedOperations.set(operationId, operation);
    
    this.emit('operation:completed', operation);
    
    return operation;
  }

  /**
   * Get operation status
   */
  getOperationStatus(operationId) {
    let operation = this.activeOperations.get(operationId);
    if (!operation) {
      operation = this.completedOperations.get(operationId);
    }
    
    if (!operation) {
      return null;
    }
    
    return {
      id: operation.id,
      status: operation.status,
      phase: operation.currentPhase,
      progress: operation.progress,
      dependencies: {
        total: operation.dependencies.required.length,
        satisfied: operation.dependencies.satisfied.length,
        pending: operation.dependencies.pending.length
      },
      bypasses: {
        active: operation.validationBypasses.active.length,
        total: operation.validationBypasses.history.length
      },
      errors: operation.errors.length,
      warnings: operation.warnings.length,
      duration: operation.duration
    };
  }

  /**
   * Get all active operations
   */
  getActiveOperations() {
    const operations = [];
    for (const [id, operation] of this.activeOperations) {
      operations.push(this.getOperationStatus(id));
    }
    return operations;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeOperations: this.activeOperations.size,
      completedOperations: this.completedOperations.size,
      uptime: Date.now() - this.startTime,
      successRate: this.metrics.totalOperations > 0 
        ? (this.metrics.successfulOperations / this.metrics.totalOperations) * 100 
        : 0
    };
  }

  /**
   * Generate operation report
   */
  generateOperationReport(operationId) {
    let operation = this.activeOperations.get(operationId);
    if (!operation) {
      operation = this.completedOperations.get(operationId);
    }
    
    if (!operation) {
      return null;
    }
    
    const report = {
      summary: {
        id: operation.id,
        type: operation.type,
        object: operation.object,
        status: operation.status,
        startTime: operation.startTime,
        endTime: operation.endTime,
        duration: operation.duration ? `${Math.round(operation.duration / 1000)}s` : 'In Progress'
      },
      
      phases: operation.phases.map(phase => ({
        number: phase.number,
        name: phase.name,
        status: phase.status,
        duration: phase.duration ? `${Math.round(phase.duration / 1000)}s` : 'In Progress',
        objects: phase.objects,
        parallel: phase.parallel
      })),
      
      progress: {
        ...operation.progress,
        successRate: operation.progress.processedRecords > 0
          ? Math.round((operation.progress.successfulRecords / operation.progress.processedRecords) * 100)
          : 0
      },
      
      dependencies: operation.dependencies,
      
      validationBypasses: {
        used: operation.validationBypasses.history.length > 0,
        types: [...new Set(operation.validationBypasses.history.map(b => b.type))],
        totalDuration: operation.validationBypasses.history.reduce((sum, bypass) => {
          if (bypass.disabledAt) {
            return sum + (new Date(bypass.disabledAt) - new Date(bypass.enabledAt));
          }
          return sum;
        }, 0)
      },
      
      issues: {
        errors: operation.errors.length,
        warnings: operation.warnings.length,
        errorTypes: [...new Set(operation.errors.map(e => e.type))]
      },
      
      checkpoints: operation.checkpoints.length,
      
      recommendations: this.generateRecommendations(operation)
    };
    
    return report;
  }

  /**
   * Generate recommendations based on operation
   */
  generateRecommendations(operation) {
    const recommendations = [];
    
    // Check for high error rate
    if (operation.progress.failedRecords > operation.progress.successfulRecords) {
      recommendations.push({
        type: 'HIGH_ERROR_RATE',
        priority: 'HIGH',
        message: 'High failure rate detected',
        suggestion: 'Review error patterns and consider adjusting validation bypass strategy'
      });
    }
    
    // Check for long-running bypasses
    const longBypasses = operation.validationBypasses.history.filter(b => {
      if (b.disabledAt) {
        const duration = new Date(b.disabledAt) - new Date(b.enabledAt);
        return duration > 300000; // 5 minutes
      }
      return false;
    });
    
    if (longBypasses.length > 0) {
      recommendations.push({
        type: 'LONG_BYPASS_DURATION',
        priority: 'MEDIUM',
        message: 'Validation bypasses active for extended periods',
        suggestion: 'Consider using more targeted bypass strategies'
      });
    }
    
    // Check for dependency issues
    if (operation.dependencies.pending.length > 0 && operation.status === 'COMPLETED') {
      recommendations.push({
        type: 'UNSATISFIED_DEPENDENCIES',
        priority: 'HIGH',
        message: 'Operation completed with unsatisfied dependencies',
        suggestion: 'Review dependency analysis and execution order'
      });
    }
    
    return recommendations;
  }

  /**
   * Export monitoring data
   */
  async exportMonitoringData(filepath) {
    const data = {
      metrics: this.getMetrics(),
      activeOperations: Array.from(this.activeOperations.values()),
      completedOperations: Array.from(this.completedOperations.values()).slice(-100), // Last 100
      timestamp: new Date().toISOString()
    };
    
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    return data;
  }

  /**
   * Stream monitoring events
   */
  streamEvents(callback) {
    const events = [
      'operation:started',
      'operation:completed',
      'phase:started',
      'phase:completed',
      'dependency:satisfied',
      'bypass:enabled',
      'bypass:disabled',
      'progress:updated',
      'error:added',
      'warning:added',
      'checkpoint:created'
    ];
    
    events.forEach(event => {
      this.on(event, data => callback(event, data));
    });
  }
}

// Singleton instance
let monitorInstance = null;

function getMonitor() {
  if (!monitorInstance) {
    monitorInstance = new ExecutionMonitor();
  }
  return monitorInstance;
}

// Export for use in other modules
module.exports = { ExecutionMonitor, getMonitor };

// CLI interface
if (require.main === module) {
  const monitor = getMonitor();
  
  // Set up event logging
  monitor.streamEvents((event, data) => {
    console.log(`[${new Date().toISOString()}] ${event}:`, JSON.stringify(data, null, 2));
  });
  
  // Example monitoring session
  async function exampleMonitoring() {
    // Start an operation
    const opId = 'op_' + Date.now();
    monitor.startOperation(opId, {
      type: 'DATA_LOAD',
      object: 'Account',
      totalRecords: 1000,
      dependencies: ['dep1', 'dep2'],
      bypasses: ['CUSTOM_SETTING']
    });
    
    // Update phase
    monitor.updatePhase(opId, {
      name: 'Data Preparation',
      objects: ['Account'],
      parallel: false
    });
    
    // Satisfy dependencies
    monitor.satisfyDependency(opId, 'dep1');
    monitor.satisfyDependency(opId, 'dep2');
    
    // Enable bypass
    monitor.enableBypass(opId, 'CUSTOM_SETTING', { object: 'Account' });
    
    // Update progress
    for (let i = 0; i <= 10; i++) {
      monitor.updateProgress(opId, {
        processedRecords: i * 100,
        successfulRecords: i * 95,
        failedRecords: i * 5
      });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Complete phase
    monitor.completePhase(opId, 1);
    
    // Disable bypass
    monitor.disableBypass(opId, 'CUSTOM_SETTING');
    
    // Complete operation
    monitor.completeOperation(opId);
    
    // Generate report
    const report = monitor.generateOperationReport(opId);
    console.log('\nOperation Report:', JSON.stringify(report, null, 2));
    
    // Show metrics
    console.log('\nMetrics:', monitor.getMetrics());
  }
  
  // Run example if called directly
  exampleMonitoring().catch(console.error);
}