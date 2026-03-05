#!/usr/bin/env node

/**
 * Data Sequence Planner
 * 
 * Plans optimal data loading sequences based on object dependencies,
 * validation requirements, and relationship constraints. Handles
 * parent-child relationships, self-references, and circular dependencies.
 */

const OperationDependencyGraph = require('./operation-dependency-graph');

class DataSequencePlanner {
  constructor(orgAlias) {
    this.orgAlias = orgAlias;
    this.objectMetadata = new Map();
    this.relationshipMap = new Map();
    this.validationRequirements = new Map();
  }

  /**
   * Main entry point - plan complete data sequence
   */
  async planSequence(objects, data, relationships, validationRules = {}) {
    console.log('📊 Planning optimal data loading sequence...');
    
    const plan = {
      timestamp: new Date().toISOString(),
      totalRecords: data.length,
      objects: objects,
      phases: [],
      dependencies: new Map(),
      validationStrategies: new Map(),
      warnings: [],
      summary: null
    };

    try {
      // Step 1: Analyze object relationships
      const dependencyGraph = await this.buildDependencyGraph(objects, relationships);
      
      // Step 2: Detect circular dependencies
      const cycles = dependencyGraph.detectCircularDependencies();
      if (cycles.length > 0) {
        plan.warnings.push({
          type: 'CIRCULAR_DEPENDENCY',
          cycles: cycles,
          resolution: 'Will use staged loading approach'
        });
      }
      
      // Step 3: Generate execution phases
      const phases = dependencyGraph.generateExecutionPhases();
      
      // Step 4: Assign data to phases
      for (const phase of phases) {
        const phaseData = await this.assignDataToPhase(
          phase,
          data,
          validationRules,
          relationships
        );
        plan.phases.push(phaseData);
      }
      
      // Step 5: Handle self-references
      const selfRefPhase = await this.planSelfReferencePhase(objects, data, relationships);
      if (selfRefPhase) {
        plan.phases.push(selfRefPhase);
      }
      
      // Step 6: Plan validation strategies
      for (const object of objects) {
        if (validationRules[object]) {
          const strategy = await this.planValidationStrategy(
            object,
            validationRules[object],
            plan.phases
          );
          plan.validationStrategies.set(object, strategy);
        }
      }
      
      // Step 7: Optimize phase ordering
      plan.phases = this.optimizePhaseOrder(plan.phases);
      
      // Generate summary
      plan.summary = this.generatePlanSummary(plan);
      
    } catch (error) {
      console.error('Error planning data sequence:', error);
      throw error;
    }
    
    return plan;
  }

  /**
   * Build dependency graph from object relationships
   */
  async buildDependencyGraph(objects, relationships) {
    const graph = new OperationDependencyGraph();
    
    // Add all objects as nodes
    for (const obj of objects) {
      graph.addNode(obj, { type: 'object', name: obj });
    }
    
    // Add relationship dependencies
    for (const rel of relationships) {
      if (rel.type === 'MasterDetail' || (rel.type === 'Lookup' && rel.required)) {
        // Required parent relationship
        graph.addDependency(rel.childObject, rel.parentObject, 'required_parent', {
          field: rel.field,
          required: true
        });
      } else if (rel.type === 'Lookup' && !rel.required) {
        // Optional parent relationship
        graph.addDependency(rel.childObject, rel.parentObject, 'optional_parent', {
          field: rel.field,
          required: false,
          optional: true
        });
      }
    }
    
    return graph;
  }

  /**
   * Assign data records to execution phase
   */
  async assignDataToPhase(phase, allData, validationRules, relationships) {
    const phaseData = {
      phase: phase.phase,
      objects: phase.nodes,
      parallel: phase.parallel,
      data: [],
      strategy: phase.strategy || 'STANDARD',
      validationBypasses: [],
      estimatedTime: 0
    };
    
    // Process each object in the phase
    for (const objectName of phase.nodes) {
      const objectData = allData.filter(record => record.objectType === objectName);
      
      if (objectData.length === 0) continue;
      
      // Split data by dependencies and validation requirements
      const splitData = await this.splitDataByRequirements(
        objectData,
        objectName,
        relationships,
        validationRules[objectName]
      );
      
      phaseData.data.push({
        object: objectName,
        recordCount: objectData.length,
        immediate: splitData.immediate,
        deferred: splitData.deferred,
        staged: splitData.staged,
        strategy: splitData.strategy,
        batches: this.calculateBatches(splitData)
      });
      
      // Add validation bypasses if needed
      if (splitData.requiresBypass) {
        phaseData.validationBypasses.push({
          object: objectName,
          rules: validationRules[objectName],
          strategy: splitData.bypassStrategy
        });
      }
    }
    
    // Calculate estimated time
    phaseData.estimatedTime = this.estimatePhaseTime(phaseData);
    
    return phaseData;
  }

  /**
   * Split data by dependencies and validation requirements
   */
  async splitDataByRequirements(data, objectName, relationships, validationRules) {
    const split = {
      immediate: [],
      deferred: [],
      staged: [],
      strategy: 'DIRECT',
      requiresBypass: false,
      bypassStrategy: null
    };
    
    // Get object relationships
    const parentRels = relationships.filter(r => 
      r.childObject === objectName && r.required
    );
    
    const selfRefs = relationships.filter(r => 
      r.childObject === objectName && r.parentObject === objectName
    );
    
    // Analyze validation requirements
    const validationAnalysis = this.analyzeValidationRequirements(validationRules);
    
    // Process each record
    for (const record of data) {
      let category = 'immediate';
      
      // Check parent dependencies
      for (const rel of parentRels) {
        if (!record[rel.field] && rel.required) {
          category = 'deferred';
          break;
        }
      }
      
      // Check self-references
      for (const rel of selfRefs) {
        if (record[rel.field]) {
          category = 'staged';
          split.strategy = 'STAGED_WITH_UPDATES';
          break;
        }
      }
      
      // Check validation requirements
      if (validationAnalysis.hasBlockingRules) {
        if (validationAnalysis.blockingPattern === 'PRIORVALUE') {
          split.requiresBypass = true;
          split.bypassStrategy = 'CUSTOM_SETTING';
        } else if (validationAnalysis.blockingPattern === 'ISCHANGED') {
          category = 'staged';
          split.strategy = 'STAGED_TO_AVOID_ISCHANGED';
        }
      }
      
      split[category].push(record);
    }
    
    return split;
  }

  /**
   * Plan self-reference update phase
   */
  async planSelfReferencePhase(objects, data, relationships) {
    const selfRefUpdates = [];
    
    for (const obj of objects) {
      const selfRefs = relationships.filter(r => 
        r.childObject === obj && r.parentObject === obj
      );
      
      if (selfRefs.length > 0) {
        const objectData = data.filter(d => d.objectType === obj);
        const updates = [];
        
        for (const record of objectData) {
          for (const ref of selfRefs) {
            if (record[ref.field]) {
              updates.push({
                id: record.id || record.tempId,
                field: ref.field,
                value: record[ref.field],
                reference: true
              });
            }
          }
        }
        
        if (updates.length > 0) {
          selfRefUpdates.push({
            object: obj,
            updates: updates,
            fields: selfRefs.map(r => r.field)
          });
        }
      }
    }
    
    if (selfRefUpdates.length === 0) return null;
    
    return {
      phase: 'SELF_REFERENCE_UPDATE',
      objects: selfRefUpdates.map(u => u.object),
      parallel: false,
      data: selfRefUpdates,
      strategy: 'UPDATE_ONLY',
      description: 'Update self-referential fields after initial insert',
      estimatedTime: this.estimateUpdateTime(selfRefUpdates)
    };
  }

  /**
   * Plan validation strategy for an object
   */
  async planValidationStrategy(objectName, validationRules, phases) {
    const strategy = {
      object: objectName,
      rules: validationRules.length,
      approach: null,
      bypasses: [],
      phases: []
    };
    
    // Analyze validation rules
    const patterns = [];
    for (const rule of validationRules) {
      if (rule.ErrorConditionFormula.includes('PRIORVALUE')) {
        patterns.push('PRIORVALUE');
      }
      if (rule.ErrorConditionFormula.includes('ISCHANGED')) {
        patterns.push('ISCHANGED');
      }
      if (rule.ErrorConditionFormula.includes('ISNEW')) {
        patterns.push('ISNEW');
      }
    }
    
    // Determine strategy based on patterns
    if (patterns.includes('PRIORVALUE')) {
      strategy.approach = 'BYPASS_REQUIRED';
      strategy.bypasses.push({
        type: 'CUSTOM_SETTING',
        reason: 'PRIORVALUE blocks flows and triggers',
        phases: ['ALL']
      });
    } else if (patterns.includes('ISCHANGED')) {
      strategy.approach = 'STAGED_LOADING';
      strategy.phases = [
        { phase: 1, action: 'INSERT_MINIMAL' },
        { phase: 2, action: 'UPDATE_COMPLETE' }
      ];
    } else if (patterns.includes('ISNEW')) {
      strategy.approach = 'INITIAL_BYPASS';
      strategy.bypasses.push({
        type: 'PERMISSION_SET',
        reason: 'ISNEW only affects inserts',
        phases: [1]
      });
    } else {
      strategy.approach = 'STANDARD';
    }
    
    return strategy;
  }

  /**
   * Optimize phase ordering for performance
   */
  optimizePhaseOrder(phases) {
    const optimized = [...phases];
    
    // Sort phases by:
    // 1. Required dependencies first
    // 2. Parallel operations together
    // 3. Largest datasets first (for parallel phases)
    
    optimized.sort((a, b) => {
      // Self-reference updates always last
      if (a.phase === 'SELF_REFERENCE_UPDATE') return 1;
      if (b.phase === 'SELF_REFERENCE_UPDATE') return -1;
      
      // Phases with validation bypasses first
      const aBypass = a.validationBypasses.length;
      const bBypass = b.validationBypasses.length;
      if (aBypass !== bBypass) return bBypass - aBypass;
      
      // Parallel phases before sequential
      if (a.parallel !== b.parallel) {
        return a.parallel ? -1 : 1;
      }
      
      // Larger datasets first for parallel
      if (a.parallel && b.parallel) {
        const aRecords = a.data.reduce((sum, d) => sum + d.recordCount, 0);
        const bRecords = b.data.reduce((sum, d) => sum + d.recordCount, 0);
        return bRecords - aRecords;
      }
      
      // Keep original order otherwise
      return 0;
    });
    
    // Re-number phases
    optimized.forEach((phase, index) => {
      if (phase.phase !== 'SELF_REFERENCE_UPDATE') {
        phase.phase = index + 1;
      }
    });
    
    return optimized;
  }

  /**
   * Calculate batches for data loading
   */
  calculateBatches(splitData) {
    const batches = [];
    const batchSize = 200; // Salesforce DML limit
    
    // Batch immediate records
    if (splitData.immediate.length > 0) {
      const immediateBatches = Math.ceil(splitData.immediate.length / batchSize);
      for (let i = 0; i < immediateBatches; i++) {
        batches.push({
          type: 'IMMEDIATE',
          batch: i + 1,
          size: Math.min(batchSize, splitData.immediate.length - (i * batchSize)),
          records: splitData.immediate.slice(i * batchSize, (i + 1) * batchSize)
        });
      }
    }
    
    // Batch deferred records
    if (splitData.deferred.length > 0) {
      const deferredBatches = Math.ceil(splitData.deferred.length / batchSize);
      for (let i = 0; i < deferredBatches; i++) {
        batches.push({
          type: 'DEFERRED',
          batch: i + 1,
          size: Math.min(batchSize, splitData.deferred.length - (i * batchSize)),
          records: splitData.deferred.slice(i * batchSize, (i + 1) * batchSize)
        });
      }
    }
    
    // Handle staged records specially
    if (splitData.staged.length > 0) {
      batches.push({
        type: 'STAGED',
        batch: 1,
        size: splitData.staged.length,
        records: splitData.staged,
        strategy: 'INSERT_THEN_UPDATE'
      });
    }
    
    return batches;
  }

  /**
   * Analyze validation requirements
   */
  analyzeValidationRequirements(validationRules) {
    if (!validationRules || validationRules.length === 0) {
      return {
        hasBlockingRules: false,
        blockingPattern: null,
        requiredFields: []
      };
    }
    
    const analysis = {
      hasBlockingRules: false,
      blockingPattern: null,
      requiredFields: new Set()
    };
    
    for (const rule of validationRules) {
      const formula = rule.ErrorConditionFormula;
      
      // Check for blocking patterns
      if (formula.includes('PRIORVALUE')) {
        analysis.hasBlockingRules = true;
        analysis.blockingPattern = 'PRIORVALUE';
      } else if (formula.includes('ISCHANGED') && !analysis.blockingPattern) {
        analysis.hasBlockingRules = true;
        analysis.blockingPattern = 'ISCHANGED';
      }
      
      // Extract required fields
      const fieldPattern = /ISBLANK\s*\(\s*([A-Za-z_][A-Za-z0-9_]*__c)\s*\)/g;
      let match;
      while ((match = fieldPattern.exec(formula)) !== null) {
        analysis.requiredFields.add(match[1]);
      }
    }
    
    analysis.requiredFields = Array.from(analysis.requiredFields);
    return analysis;
  }

  /**
   * Estimate time for a phase
   */
  estimatePhaseTime(phaseData) {
    let totalTime = 0;
    const timePerRecord = 50; // milliseconds
    
    for (const objectData of phaseData.data) {
      const recordCount = objectData.recordCount;
      const batchCount = objectData.batches.length;
      
      // Base time for records
      totalTime += recordCount * timePerRecord;
      
      // Add overhead for batching
      totalTime += batchCount * 2000; // 2 seconds per batch
      
      // Add time for validation bypasses
      if (phaseData.validationBypasses.length > 0) {
        totalTime += 5000; // 5 seconds for bypass setup
      }
    }
    
    // Reduce time for parallel execution
    if (phaseData.parallel && phaseData.objects.length > 1) {
      totalTime = totalTime / Math.min(phaseData.objects.length, 5); // Max 5 parallel
    }
    
    return Math.round(totalTime / 1000); // Return in seconds
  }

  /**
   * Estimate update time for self-references
   */
  estimateUpdateTime(selfRefUpdates) {
    let totalTime = 0;
    const timePerUpdate = 30; // milliseconds
    
    for (const update of selfRefUpdates) {
      totalTime += update.updates.length * timePerUpdate;
    }
    
    return Math.round(totalTime / 1000); // Return in seconds
  }

  /**
   * Generate plan summary
   */
  generatePlanSummary(plan) {
    const totalRecords = plan.phases.reduce((sum, phase) => {
      return sum + phase.data.reduce((phaseSum, obj) => phaseSum + obj.recordCount, 0);
    }, 0);
    
    const totalTime = plan.phases.reduce((sum, phase) => sum + phase.estimatedTime, 0);
    
    return {
      totalPhases: plan.phases.length,
      totalRecords: totalRecords,
      estimatedTime: `${Math.round(totalTime)} seconds`,
      parallelPhases: plan.phases.filter(p => p.parallel).length,
      validationBypasses: Array.from(plan.validationStrategies.values())
        .filter(s => s.approach === 'BYPASS_REQUIRED').length,
      warnings: plan.warnings.length,
      complexity: this.assessComplexity(plan)
    };
  }

  /**
   * Assess plan complexity
   */
  assessComplexity(plan) {
    let score = 0;
    
    // Factor in number of phases
    score += plan.phases.length * 10;
    
    // Factor in validation bypasses
    score += Array.from(plan.validationStrategies.values())
      .filter(s => s.approach !== 'STANDARD').length * 20;
    
    // Factor in circular dependencies
    score += plan.warnings.filter(w => w.type === 'CIRCULAR_DEPENDENCY').length * 30;
    
    // Factor in staged loading
    score += plan.phases.filter(p => p.strategy === 'STAGED_WITH_UPDATES').length * 15;
    
    if (score < 30) return 'LOW';
    if (score < 70) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * Generate execution script from plan
   */
  generateExecutionScript(plan) {
    const script = [];
    
    script.push('#!/bin/bash');
    script.push('# Data Loading Execution Script');
    script.push(`# Generated: ${new Date().toISOString()}`);
    script.push(`# Total Phases: ${plan.phases.length}`);
    script.push(`# Estimated Time: ${plan.summary.estimatedTime}`);
    script.push('');
    
    // Add validation bypass setup
    const bypassObjects = Array.from(plan.validationStrategies.entries())
      .filter(([obj, strategy]) => strategy.approach === 'BYPASS_REQUIRED');
    
    if (bypassObjects.length > 0) {
      script.push('# Setup validation bypasses');
      for (const [obj, strategy] of bypassObjects) {
        script.push(`echo "Enabling bypass for ${obj}"...`);
        script.push(`sf apex run --file enable_bypass_${obj}.apex`);
      }
      script.push('');
    }
    
    // Add phase execution
    for (const phase of plan.phases) {
      script.push(`# Phase ${phase.phase}: ${phase.objects.join(', ')}`);
      
      if (phase.parallel) {
        script.push('# Execute in parallel');
        for (const objData of phase.data) {
          script.push(`(sf data import --sobject ${objData.object} --file ${objData.object}_phase${phase.phase}.csv &)`);
        }
        script.push('wait # Wait for parallel operations');
      } else {
        script.push('# Execute sequentially');
        for (const objData of phase.data) {
          script.push(`sf data import --sobject ${objData.object} --file ${objData.object}_phase${phase.phase}.csv`);
        }
      }
      script.push('');
    }
    
    // Add validation bypass cleanup
    if (bypassObjects.length > 0) {
      script.push('# Cleanup validation bypasses');
      for (const [obj] of bypassObjects) {
        script.push(`echo "Disabling bypass for ${obj}"...`);
        script.push(`sf apex run --file disable_bypass_${obj}.apex`);
      }
    }
    
    return script.join('\n');
  }
}

// Export for use in other modules
module.exports = DataSequencePlanner;

// CLI interface
if (require.main === module) {
  async function main() {
    // Example usage
    const planner = new DataSequencePlanner('myorg');
    
    // Sample data
    const objects = ['Account', 'Contact', 'Opportunity'];
    const data = [
      { objectType: 'Account', name: 'Acme Corp' },
      { objectType: 'Contact', name: 'John Doe', accountId: '@Account.1' },
      { objectType: 'Opportunity', name: 'Big Deal', accountId: '@Account.1' }
    ];
    const relationships = [
      { childObject: 'Contact', parentObject: 'Account', field: 'AccountId', type: 'Lookup', required: false },
      { childObject: 'Opportunity', parentObject: 'Account', field: 'AccountId', type: 'Lookup', required: true }
    ];
    
    const plan = await planner.planSequence(objects, data, relationships);
    console.log(JSON.stringify(plan, null, 2));
    
    // Generate execution script
    const script = planner.generateExecutionScript(plan);
    console.log('\nExecution Script:\n', script);
  }
  
  main().catch(console.error);
}

// Export for use in other modules
module.exports = { DataSequencePlanner };