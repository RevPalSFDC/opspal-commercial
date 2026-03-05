#!/usr/bin/env node

/**
 * Operation Sequencer Framework
 * 
 * Orchestrates complex multi-phase operations with dependency tracking,
 * validation bypass management, and intelligent rollback capabilities.
 * Integrates all operational intelligence components into a cohesive execution engine.
 */

const EventEmitter = require('events');
const { DependencyGraph } = require('./operation-dependency-graph');
const { ValidationBypassManager } = require('./validation-bypass-manager');
const { DataSequencePlanner } = require('./data-sequence-planner');
const { getMonitor } = require('./execution-monitor');
const { SharedStateManager } = require('./shared-state-manager');

class OperationSequencer extends EventEmitter {
  constructor(org, options = {}) {
    super();
    this.org = org;
    this.monitor = getMonitor();
    this.stateManager = new SharedStateManager();
    this.bypassManager = new ValidationBypassManager(org);
    this.sequencePlanner = new DataSequencePlanner(org);
    this.dependencyGraph = new DependencyGraph();
    
    this.options = {
      maxRetries: 3,
      retryDelay: 2000,
      parallelThreshold: 5,
      bypassStrategy: 'auto',
      rollbackOnFailure: true,
      checkpointInterval: 10,
      ...options
    };
    
    this.executionContext = {
      operationId: null,
      phases: [],
      currentPhase: 0,
      checkpoints: [],
      bypasses: [],
      errors: [],
      rollbackStack: []
    };
  }

  /**
   * Plan and execute a complex operation
   */
  async executeOperation(operation) {
    const operationId = `op_${Date.now()}_${operation.type}`;
    this.executionContext.operationId = operationId;
    
    try {
      // Start monitoring
      this.monitor.startOperation(operationId, {
        type: operation.type,
        metadata: operation.metadata,
        totalRecords: operation.data?.length || 0
      });
      
      // Phase 1: Dependency Analysis
      const dependencies = await this.analyzeDependencies(operation);
      
      // Phase 2: Conflict Detection
      const conflicts = await this.detectConflicts(operation, dependencies);
      if (conflicts.length > 0) {
        await this.resolveConflicts(conflicts);
      }
      
      // Phase 3: Sequence Planning
      const executionPlan = await this.planExecutionSequence(operation, dependencies);
      
      // Phase 4: Validation Strategy
      const validationStrategy = await this.determineValidationStrategy(operation);
      
      // Phase 5: Execute Plan
      const result = await this.executePlan(executionPlan, validationStrategy);
      
      // Complete operation
      this.monitor.completeOperation(operationId, 'COMPLETED');
      
      return {
        success: true,
        operationId,
        result,
        metrics: this.monitor.getOperationStatus(operationId)
      };
      
    } catch (error) {
      this.monitor.addError(operationId, error);
      
      if (this.options.rollbackOnFailure) {
        await this.rollback();
      }
      
      this.monitor.completeOperation(operationId, 'FAILED');
      
      throw error;
    }
  }

  /**
   * Analyze dependencies for the operation
   */
  async analyzeDependencies(operation) {
    const phaseId = this.monitor.updatePhase(this.executionContext.operationId, {
      name: 'Dependency Analysis',
      objects: operation.objects || []
    });
    
    try {
      // Build dependency graph
      for (const obj of operation.objects || []) {
        this.dependencyGraph.addNode(obj.name, obj);
        
        // Add dependencies
        if (obj.dependencies) {
          for (const dep of obj.dependencies) {
            this.dependencyGraph.addEdge(obj.name, dep);
          }
        }
        
        // Analyze field dependencies
        if (obj.fields) {
          for (const field of obj.fields) {
            if (field.formula || field.lookup) {
              const deps = this.extractFieldDependencies(field);
              deps.forEach(dep => this.dependencyGraph.addEdge(obj.name, dep));
            }
          }
        }
      }
      
      // Check for circular dependencies
      const cycles = this.dependencyGraph.detectCycles();
      if (cycles.length > 0) {
        this.monitor.addWarning(this.executionContext.operationId, {
          message: 'Circular dependencies detected',
          cycles
        });
        
        // Break cycles using minimal edge removal
        await this.resolveCycles(cycles);
      }
      
      // Generate execution order
      const executionOrder = this.dependencyGraph.topologicalSort();
      
      // Identify parallel phases
      const phases = this.dependencyGraph.generateExecutionPhases();
      
      this.monitor.completePhase(this.executionContext.operationId, phaseId);
      
      return {
        graph: this.dependencyGraph,
        executionOrder,
        phases,
        cycles
      };
      
    } catch (error) {
      this.monitor.completePhase(this.executionContext.operationId, phaseId, 'FAILED');
      throw error;
    }
  }

  /**
   * Detect potential conflicts
   */
  async detectConflicts(operation, dependencies) {
    const phaseId = this.monitor.updatePhase(this.executionContext.operationId, {
      name: 'Conflict Detection'
    });
    
    const conflicts = [];
    
    try {
      // Check for field type conflicts
      for (const obj of operation.objects || []) {
        if (obj.fields) {
          for (const field of obj.fields) {
            const existing = await this.checkExistingField(obj.name, field.name);
            if (existing && existing.type !== field.type) {
              conflicts.push({
                type: 'FIELD_TYPE_MISMATCH',
                object: obj.name,
                field: field.name,
                current: existing.type,
                proposed: field.type
              });
            }
          }
        }
      }
      
      // Check for validation rule conflicts
      const validationRules = await this.getValidationRules(operation.objects);
      for (const rule of validationRules) {
        if (rule.formula.includes('PRIORVALUE') || rule.formula.includes('ISCHANGED')) {
          conflicts.push({
            type: 'VALIDATION_RULE_BLOCKER',
            rule: rule.name,
            object: rule.object,
            pattern: rule.formula.includes('PRIORVALUE') ? 'PRIORVALUE' : 'ISCHANGED'
          });
        }
      }
      
      // Check for permission conflicts
      const permissions = await this.checkPermissions(operation.objects);
      for (const perm of permissions) {
        if (!perm.hasAccess) {
          conflicts.push({
            type: 'PERMISSION_CONFLICT',
            object: perm.object,
            permission: perm.type,
            profile: perm.profile
          });
        }
      }
      
      this.monitor.completePhase(this.executionContext.operationId, phaseId);
      
      return conflicts;
      
    } catch (error) {
      this.monitor.completePhase(this.executionContext.operationId, phaseId, 'FAILED');
      throw error;
    }
  }

  /**
   * Resolve detected conflicts
   */
  async resolveConflicts(conflicts) {
    const phaseId = this.monitor.updatePhase(this.executionContext.operationId, {
      name: 'Conflict Resolution',
      objects: conflicts.map(c => c.object).filter(Boolean)
    });
    
    try {
      for (const conflict of conflicts) {
        let resolution;
        
        switch (conflict.type) {
          case 'FIELD_TYPE_MISMATCH':
            resolution = await this.resolveFieldTypeConflict(conflict);
            break;
            
          case 'VALIDATION_RULE_BLOCKER':
            resolution = await this.resolveValidationConflict(conflict);
            break;
            
          case 'PERMISSION_CONFLICT':
            resolution = await this.resolvePermissionConflict(conflict);
            break;
            
          default:
            this.monitor.addWarning(this.executionContext.operationId, {
              message: `Unknown conflict type: ${conflict.type}`,
              conflict
            });
        }
        
        if (resolution) {
          this.executionContext.rollbackStack.push(resolution.rollback);
        }
      }
      
      this.monitor.completePhase(this.executionContext.operationId, phaseId);
      
    } catch (error) {
      this.monitor.completePhase(this.executionContext.operationId, phaseId, 'FAILED');
      throw error;
    }
  }

  /**
   * Plan execution sequence
   */
  async planExecutionSequence(operation, dependencies) {
    const phaseId = this.monitor.updatePhase(this.executionContext.operationId, {
      name: 'Sequence Planning'
    });
    
    try {
      // Use DataSequencePlanner for data operations
      if (operation.type === 'DATA_LOAD' || operation.type === 'DATA_MIGRATION') {
        const sequence = await this.sequencePlanner.planSequence(
          operation.objects,
          operation.data,
          dependencies.graph.getRelationships(),
          operation.validationRules
        );
        
        this.executionContext.phases = sequence.phases;
        this.monitor.completePhase(this.executionContext.operationId, phaseId);
        return sequence;
      }
      
      // Use dependency phases for metadata operations
      const phases = dependencies.phases.map((phase, index) => ({
        number: index + 1,
        operations: phase.map(nodeId => {
          const node = dependencies.graph.getNode(nodeId);
          return {
            type: operation.type,
            object: nodeId,
            data: node.data,
            parallel: phase.length > 1
          };
        }),
        parallel: phase.length > 1 && phase.length <= this.options.parallelThreshold
      }));
      
      this.executionContext.phases = phases;
      this.monitor.completePhase(this.executionContext.operationId, phaseId);
      
      return { phases };
      
    } catch (error) {
      this.monitor.completePhase(this.executionContext.operationId, phaseId, 'FAILED');
      throw error;
    }
  }

  /**
   * Determine validation bypass strategy
   */
  async determineValidationStrategy(operation) {
    const phaseId = this.monitor.updatePhase(this.executionContext.operationId, {
      name: 'Validation Strategy'
    });
    
    try {
      let strategy;
      
      if (this.options.bypassStrategy === 'auto') {
        // Analyze validation rules and recommend strategy
        const validationRules = operation.validationRules || [];
        strategy = await this.bypassManager.analyzeAndRecommendStrategy(
          operation.objects[0]?.name,
          validationRules
        );
      } else {
        strategy = {
          type: this.options.bypassStrategy,
          rules: operation.validationRules || []
        };
      }
      
      // Prepare bypass
      if (strategy.type !== 'none') {
        const bypass = await this.bypassManager.prepareBypass(
          strategy.type,
          strategy.rules
        );
        
        this.executionContext.bypasses.push(bypass);
        this.monitor.enableBypass(this.executionContext.operationId, strategy.type, {
          rules: strategy.rules.map(r => r.name)
        });
      }
      
      this.monitor.completePhase(this.executionContext.operationId, phaseId);
      
      return strategy;
      
    } catch (error) {
      this.monitor.completePhase(this.executionContext.operationId, phaseId, 'FAILED');
      throw error;
    }
  }

  /**
   * Execute the planned sequence
   */
  async executePlan(plan, validationStrategy) {
    const executionPhaseId = this.monitor.updatePhase(this.executionContext.operationId, {
      name: 'Execution',
      objects: plan.phases.flatMap(p => p.operations.map(op => op.object))
    });
    
    try {
      // Enable validation bypass
      if (validationStrategy.type !== 'none') {
        await this.enableValidationBypass(validationStrategy);
      }
      
      // Execute each phase
      for (const [index, phase] of plan.phases.entries()) {
        this.executionContext.currentPhase = index;
        
        // Create checkpoint before phase
        if (index % this.options.checkpointInterval === 0) {
          const checkpoint = this.monitor.createCheckpoint(
            this.executionContext.operationId,
            `Phase ${index + 1}`
          );
          this.executionContext.checkpoints.push(checkpoint);
        }
        
        // Update phase monitoring
        const phaseMonitorId = this.monitor.updatePhase(this.executionContext.operationId, {
          name: `Phase ${index + 1}`,
          number: index + 1,
          objects: phase.operations.map(op => op.object),
          parallel: phase.parallel
        });
        
        try {
          if (phase.parallel) {
            // Execute operations in parallel
            await this.executeParallelOperations(phase.operations);
          } else {
            // Execute operations sequentially
            await this.executeSequentialOperations(phase.operations);
          }
          
          this.monitor.completePhase(this.executionContext.operationId, phaseMonitorId);
          
        } catch (error) {
          this.monitor.completePhase(this.executionContext.operationId, phaseMonitorId, 'FAILED');
          
          // Retry logic
          if (await this.shouldRetry(error, index)) {
            await this.retryPhase(phase, index);
          } else {
            throw error;
          }
        }
        
        // Update progress
        this.monitor.updateProgress(this.executionContext.operationId, {
          processedRecords: this.calculateProcessedRecords(index + 1, plan.phases.length),
          successfulRecords: this.calculateSuccessfulRecords(index + 1, plan.phases.length),
          failedRecords: 0
        });
      }
      
      // Disable validation bypass
      if (validationStrategy.type !== 'none') {
        await this.disableValidationBypass(validationStrategy);
      }
      
      this.monitor.completePhase(this.executionContext.operationId, executionPhaseId);
      
      return {
        phases: plan.phases.length,
        operations: plan.phases.reduce((sum, p) => sum + p.operations.length, 0),
        checkpoints: this.executionContext.checkpoints.length
      };
      
    } catch (error) {
      this.monitor.completePhase(this.executionContext.operationId, executionPhaseId, 'FAILED');
      
      // Disable bypasses on error
      if (validationStrategy.type !== 'none') {
        await this.disableValidationBypass(validationStrategy).catch(console.error);
      }
      
      throw error;
    }
  }

  /**
   * Execute operations in parallel
   */
  async executeParallelOperations(operations) {
    const promises = operations.map(async (operation) => {
      try {
        return await this.executeOperation(operation);
      } catch (error) {
        this.monitor.addError(this.executionContext.operationId, {
          message: `Failed to execute ${operation.type} on ${operation.object}`,
          error: error.message,
          operation
        });
        throw error;
      }
    });
    
    const results = await Promise.allSettled(promises);
    
    // Check for failures
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      throw new Error(`${failures.length} operations failed in parallel execution`);
    }
    
    return results.map(r => r.value);
  }

  /**
   * Execute operations sequentially
   */
  async executeSequentialOperations(operations) {
    const results = [];
    
    for (const operation of operations) {
      try {
        const result = await this.executeOperation(operation);
        results.push(result);
      } catch (error) {
        this.monitor.addError(this.executionContext.operationId, {
          message: `Failed to execute ${operation.type} on ${operation.object}`,
          error: error.message,
          operation
        });
        throw error;
      }
    }
    
    return results;
  }

  /**
   * Execute a single operation
   */
  async executeOperation(operation) {
    // This would be implemented based on operation type
    // For now, simulate execution
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      success: true,
      operation: operation.type,
      object: operation.object,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Enable validation bypass
   */
  async enableValidationBypass(strategy) {
    const bypass = await this.bypassManager.enableBypass(
      strategy.type,
      strategy.rules.map(r => r.object)
    );
    
    this.executionContext.bypasses.push({
      strategy,
      bypass,
      enabledAt: new Date().toISOString()
    });
    
    return bypass;
  }

  /**
   * Disable validation bypass
   */
  async disableValidationBypass(strategy) {
    const bypass = this.executionContext.bypasses.find(b => b.strategy === strategy);
    if (bypass) {
      await this.bypassManager.disableBypass(bypass.bypass);
      
      this.monitor.disableBypass(
        this.executionContext.operationId,
        strategy.type
      );
    }
  }

  /**
   * Rollback on failure
   */
  async rollback() {
    const rollbackPhaseId = this.monitor.updatePhase(this.executionContext.operationId, {
      name: 'Rollback'
    });
    
    try {
      // Execute rollback stack in reverse order
      while (this.executionContext.rollbackStack.length > 0) {
        const rollbackOp = this.executionContext.rollbackStack.pop();
        try {
          await rollbackOp();
        } catch (error) {
          this.monitor.addError(this.executionContext.operationId, {
            message: 'Rollback operation failed',
            error: error.message
          });
        }
      }
      
      // Disable any active bypasses
      for (const bypass of this.executionContext.bypasses) {
        try {
          await this.bypassManager.disableBypass(bypass.bypass);
        } catch (error) {
          console.error('Failed to disable bypass during rollback:', error);
        }
      }
      
      this.monitor.completePhase(this.executionContext.operationId, rollbackPhaseId);
      
    } catch (error) {
      this.monitor.completePhase(this.executionContext.operationId, rollbackPhaseId, 'FAILED');
      throw error;
    }
  }

  /**
   * Helper methods
   */
  
  extractFieldDependencies(field) {
    const dependencies = [];
    
    if (field.formula) {
      // Extract object references from formula
      const matches = field.formula.match(/(\w+)__c\.\w+/g) || [];
      matches.forEach(match => {
        const obj = match.split('.')[0];
        if (!dependencies.includes(obj)) {
          dependencies.push(obj);
        }
      });
    }
    
    if (field.lookup) {
      dependencies.push(field.lookup);
    }
    
    return dependencies;
  }

  async resolveCycles(cycles) {
    // Implement cycle resolution strategy
    for (const cycle of cycles) {
      // Find the weakest link (optional dependency)
      const weakestEdge = this.findWeakestEdge(cycle);
      if (weakestEdge) {
        this.dependencyGraph.removeEdge(weakestEdge.from, weakestEdge.to);
        this.monitor.addWarning(this.executionContext.operationId, {
          message: 'Removed edge to break cycle',
          edge: weakestEdge,
          cycle
        });
      }
    }
  }

  findWeakestEdge(cycle) {
    // Simple strategy: remove the last edge in the cycle
    if (cycle.length >= 2) {
      return {
        from: cycle[cycle.length - 2],
        to: cycle[cycle.length - 1]
      };
    }
    return null;
  }

  async checkExistingField(objectName, fieldName) {
    // Simulate field check
    return null;
  }

  async getValidationRules(objects) {
    // Simulate getting validation rules
    return [];
  }

  async checkPermissions(objects) {
    // Simulate permission check
    return objects.map(obj => ({
      object: obj.name,
      hasAccess: true,
      type: 'CRUD',
      profile: 'System Administrator'
    }));
  }

  async resolveFieldTypeConflict(conflict) {
    // Implement field type conflict resolution
    return {
      resolved: true,
      rollback: async () => {
        // Rollback logic
      }
    };
  }

  async resolveValidationConflict(conflict) {
    // Implement validation conflict resolution
    return {
      resolved: true,
      rollback: async () => {
        // Rollback logic
      }
    };
  }

  async resolvePermissionConflict(conflict) {
    // Implement permission conflict resolution
    return {
      resolved: true,
      rollback: async () => {
        // Rollback logic
      }
    };
  }

  async shouldRetry(error, phaseIndex) {
    // Implement retry logic
    return false;
  }

  async retryPhase(phase, index) {
    // Implement phase retry
    await this.executeSequentialOperations(phase.operations);
  }

  calculateProcessedRecords(completed, total) {
    return Math.round((completed / total) * 100);
  }

  calculateSuccessfulRecords(completed, total) {
    return Math.round((completed / total) * 100);
  }
}

// Export for use in other modules
module.exports = { OperationSequencer };

// CLI interface
if (require.main === module) {
  async function example() {
    const sequencer = new OperationSequencer('myOrg', {
      parallelThreshold: 3,
      bypassStrategy: 'auto'
    });
    
    // Example operation
    const operation = {
      type: 'DATA_MIGRATION',
      objects: [
        {
          name: 'Account',
          fields: [
            { name: 'Name', type: 'Text', required: true },
            { name: 'Industry', type: 'Picklist' }
          ]
        },
        {
          name: 'Contact',
          dependencies: ['Account'],
          fields: [
            { name: 'FirstName', type: 'Text' },
            { name: 'LastName', type: 'Text', required: true },
            { name: 'AccountId', type: 'Lookup', lookup: 'Account' }
          ]
        },
        {
          name: 'Opportunity',
          dependencies: ['Account', 'Contact'],
          fields: [
            { name: 'Name', type: 'Text', required: true },
            { name: 'AccountId', type: 'Lookup', lookup: 'Account' }
          ]
        }
      ],
      data: [
        // Sample data
      ],
      validationRules: [
        {
          name: 'Account_Validation',
          object: 'Account',
          formula: 'ISCHANGED(Industry)'
        }
      ]
    };
    
    try {
      console.log('Starting operation sequencer...');
      const result = await sequencer.executeOperation(operation);
      console.log('Operation completed:', JSON.stringify(result, null, 2));
      
      // Get final report
      const report = sequencer.monitor.generateOperationReport(result.operationId);
      console.log('\nOperation Report:', JSON.stringify(report, null, 2));
      
    } catch (error) {
      console.error('Operation failed:', error);
      
      // Get failure report
      const metrics = sequencer.monitor.getMetrics();
      console.log('\nMetrics:', JSON.stringify(metrics, null, 2));
    }
  }
  
  example().catch(console.error);
}