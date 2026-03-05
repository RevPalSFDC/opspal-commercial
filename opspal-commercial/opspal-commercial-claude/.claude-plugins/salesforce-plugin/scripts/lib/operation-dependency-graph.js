#!/usr/bin/env node

/**
 * Operation Dependency Graph Framework
 * 
 * Provides dependency analysis, topological sorting, and execution ordering
 * for Salesforce operations with circular dependency detection and resolution.
 */

class OperationDependencyGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.reverseEdges = new Map();
    this.nodeMetadata = new Map();
    this.cycleResolutionStrategies = new Map();
  }

  /**
   * Add a node to the graph
   */
  addNode(id, metadata = {}) {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, {
        id: id,
        type: metadata.type || 'operation',
        object: metadata.object,
        operation: metadata.operation,
        data: metadata.data || {},
        status: 'pending'
      });
      this.nodeMetadata.set(id, metadata);
    }
    return this.nodes.get(id);
  }

  /**
   * Add a dependency edge
   */
  addDependency(fromId, toId, type = 'requires', metadata = {}) {
    // Ensure nodes exist
    this.addNode(fromId);
    this.addNode(toId);
    
    // Add forward edge
    if (!this.edges.has(fromId)) {
      this.edges.set(fromId, new Set());
    }
    this.edges.get(fromId).add({
      to: toId,
      type: type,
      metadata: metadata
    });
    
    // Add reverse edge for traversal
    if (!this.reverseEdges.has(toId)) {
      this.reverseEdges.set(toId, new Set());
    }
    this.reverseEdges.get(toId).add({
      from: fromId,
      type: type,
      metadata: metadata
    });
  }

  /**
   * Add multiple dependencies
   */
  addDependencies(dependencies) {
    for (const dep of dependencies) {
      this.addDependency(dep.from, dep.to, dep.type, dep.metadata);
    }
  }

  /**
   * Get all dependencies for a node
   */
  getDependencies(nodeId) {
    return Array.from(this.edges.get(nodeId) || []);
  }

  /**
   * Get all dependents of a node
   */
  getDependents(nodeId) {
    return Array.from(this.reverseEdges.get(nodeId) || []);
  }

  /**
   * Check if node has dependencies
   */
  hasDependencies(nodeId) {
    const deps = this.reverseEdges.get(nodeId);
    return deps && deps.size > 0;
  }

  /**
   * Detect circular dependencies using DFS
   */
  detectCircularDependencies() {
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];
    
    const detectCycle = (nodeId, path = []) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);
      
      const dependencies = this.edges.get(nodeId) || new Set();
      for (const dep of dependencies) {
        if (!visited.has(dep.to)) {
          if (detectCycle(dep.to, [...path])) {
            return true;
          }
        } else if (recursionStack.has(dep.to)) {
          // Found a cycle
          const cycleStart = path.indexOf(dep.to);
          const cycle = path.slice(cycleStart);
          cycle.push(dep.to); // Complete the cycle
          
          cycles.push({
            nodes: cycle,
            edges: this.getCycleEdges(cycle),
            resolutionStrategy: this.determineCycleResolution(cycle)
          });
          return true;
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    // Check all nodes
    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        detectCycle(nodeId);
      }
    }
    
    return cycles;
  }

  /**
   * Get edges that form a cycle
   */
  getCycleEdges(cycle) {
    const edges = [];
    for (let i = 0; i < cycle.length - 1; i++) {
      const from = cycle[i];
      const to = cycle[i + 1];
      const edge = Array.from(this.edges.get(from) || [])
        .find(e => e.to === to);
      if (edge) {
        edges.push({ from, to, type: edge.type, metadata: edge.metadata });
      }
    }
    return edges;
  }

  /**
   * Determine resolution strategy for a cycle
   */
  determineCycleResolution(cycle) {
    const strategies = [];
    
    // Check if any edges are optional
    const edges = this.getCycleEdges(cycle);
    const hasOptional = edges.some(e => e.metadata?.optional);
    
    if (hasOptional) {
      strategies.push({
        type: 'BREAK_OPTIONAL',
        description: 'Break cycle by removing optional dependencies',
        edges: edges.filter(e => e.metadata?.optional)
      });
    }
    
    // Check for self-references
    const selfRefs = cycle.filter((node, i) => 
      cycle.indexOf(node, i + 1) !== -1
    );
    
    if (selfRefs.length > 0) {
      strategies.push({
        type: 'DEFER_SELF_REFERENCE',
        description: 'Defer self-referential updates',
        nodes: selfRefs
      });
    }
    
    // Default strategy: staged execution
    strategies.push({
      type: 'STAGED_EXECUTION',
      description: 'Execute in stages with temporary nulls',
      stages: this.planStagedExecution(cycle)
    });
    
    return strategies[0] || { type: 'MANUAL', description: 'Requires manual intervention' };
  }

  /**
   * Plan staged execution for circular dependencies
   */
  planStagedExecution(cycle) {
    return [
      {
        phase: 1,
        action: 'INSERT_MINIMAL',
        description: 'Insert with nullable references as null',
        nodes: cycle
      },
      {
        phase: 2,
        action: 'UPDATE_REFERENCES',
        description: 'Update with actual references',
        nodes: cycle
      },
      {
        phase: 3,
        action: 'VALIDATE',
        description: 'Validate referential integrity',
        nodes: cycle
      }
    ];
  }

  /**
   * Perform topological sort (Kahn's algorithm)
   */
  topologicalSort() {
    // Calculate in-degree for each node
    const inDegree = new Map();
    for (const nodeId of this.nodes.keys()) {
      inDegree.set(nodeId, 0);
    }
    
    for (const edges of this.edges.values()) {
      for (const edge of edges) {
        inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
      }
    }
    
    // Find nodes with no dependencies
    const queue = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }
    
    const sorted = [];
    
    while (queue.length > 0) {
      const nodeId = queue.shift();
      sorted.push(nodeId);
      
      // Process dependent nodes
      const dependencies = this.edges.get(nodeId) || new Set();
      for (const dep of dependencies) {
        const newDegree = inDegree.get(dep.to) - 1;
        inDegree.set(dep.to, newDegree);
        
        if (newDegree === 0) {
          queue.push(dep.to);
        }
      }
    }
    
    // Check if all nodes were processed (no cycles)
    if (sorted.length !== this.nodes.size) {
      const unprocessed = Array.from(this.nodes.keys())
        .filter(id => !sorted.includes(id));
      
      return {
        sorted: sorted,
        hasCycles: true,
        unprocessed: unprocessed,
        cycles: this.detectCircularDependencies()
      };
    }
    
    return {
      sorted: sorted,
      hasCycles: false,
      unprocessed: [],
      cycles: []
    };
  }

  /**
   * Generate execution phases for parallel execution
   */
  generateExecutionPhases() {
    const phases = [];
    const processed = new Set();
    const inDegree = new Map();
    
    // Calculate initial in-degrees
    for (const nodeId of this.nodes.keys()) {
      const deps = this.reverseEdges.get(nodeId) || new Set();
      inDegree.set(nodeId, deps.size);
    }
    
    let phaseNumber = 0;
    
    while (processed.size < this.nodes.size) {
      // Find nodes ready for execution
      const ready = [];
      
      for (const nodeId of this.nodes.keys()) {
        if (processed.has(nodeId)) continue;
        
        const dependencies = Array.from(this.reverseEdges.get(nodeId) || []);
        const allDepsSatisfied = dependencies.every(dep => processed.has(dep.from));
        
        if (allDepsSatisfied) {
          ready.push(nodeId);
        }
      }
      
      if (ready.length === 0) {
        // Circular dependency detected
        const remaining = Array.from(this.nodes.keys())
          .filter(id => !processed.has(id));
        
        phases.push({
          phase: ++phaseNumber,
          nodes: remaining,
          parallel: false,
          warning: 'Circular dependency - requires special handling',
          strategy: 'RESOLVE_CYCLES',
          cycles: this.detectCircularDependencies()
        });
        
        break;
      }
      
      // Create phase with ready nodes
      phases.push({
        phase: ++phaseNumber,
        nodes: ready,
        parallel: ready.length > 1,
        dependencies: ready.map(nodeId => ({
          node: nodeId,
          requires: Array.from(this.reverseEdges.get(nodeId) || [])
            .map(dep => dep.from)
            .filter(id => processed.has(id))
        }))
      });
      
      // Mark as processed
      ready.forEach(id => processed.add(id));
    }
    
    return phases;
  }

  /**
   * Optimize execution plan for performance
   */
  optimizeExecutionPlan(phases) {
    const optimized = [];
    
    for (const phase of phases) {
      if (phase.parallel && phase.nodes.length > 1) {
        // Group by operation type for batch processing
        const groups = this.groupByOperationType(phase.nodes);
        
        for (const [type, nodes] of groups.entries()) {
          optimized.push({
            ...phase,
            nodes: nodes,
            optimization: 'BATCHED_BY_TYPE',
            operationType: type
          });
        }
      } else {
        optimized.push(phase);
      }
    }
    
    return optimized;
  }

  /**
   * Group nodes by operation type
   */
  groupByOperationType(nodeIds) {
    const groups = new Map();
    
    for (const nodeId of nodeIds) {
      const node = this.nodes.get(nodeId);
      const type = `${node.type}_${node.operation}`;
      
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type).push(nodeId);
    }
    
    return groups;
  }

  /**
   * Find critical path (longest path through graph)
   */
  findCriticalPath() {
    const distances = new Map();
    const paths = new Map();
    
    // Initialize distances
    for (const nodeId of this.nodes.keys()) {
      distances.set(nodeId, 0);
      paths.set(nodeId, [nodeId]);
    }
    
    // Topological sort first
    const { sorted, hasCycles } = this.topologicalSort();
    
    if (hasCycles) {
      return {
        success: false,
        reason: 'Graph contains cycles',
        cycles: this.detectCircularDependencies()
      };
    }
    
    // Calculate longest paths
    for (const nodeId of sorted) {
      const dependencies = this.edges.get(nodeId) || new Set();
      
      for (const dep of dependencies) {
        const newDistance = distances.get(nodeId) + 1;
        
        if (newDistance > distances.get(dep.to)) {
          distances.set(dep.to, newDistance);
          paths.set(dep.to, [...paths.get(nodeId), dep.to]);
        }
      }
    }
    
    // Find the longest path
    let maxDistance = 0;
    let criticalPath = [];
    
    for (const [nodeId, distance] of distances.entries()) {
      if (distance > maxDistance) {
        maxDistance = distance;
        criticalPath = paths.get(nodeId);
      }
    }
    
    return {
      success: true,
      path: criticalPath,
      length: maxDistance,
      nodes: criticalPath.map(id => this.nodes.get(id))
    };
  }

  /**
   * Validate execution order
   */
  validateExecutionOrder(order) {
    const executed = new Set();
    const violations = [];
    
    for (const nodeId of order) {
      const dependencies = Array.from(this.reverseEdges.get(nodeId) || []);
      
      for (const dep of dependencies) {
        if (!executed.has(dep.from)) {
          violations.push({
            node: nodeId,
            dependency: dep.from,
            type: dep.type,
            message: `${nodeId} depends on ${dep.from} which hasn't been executed`
          });
        }
      }
      
      executed.add(nodeId);
    }
    
    return {
      valid: violations.length === 0,
      violations: violations
    };
  }

  /**
   * Generate execution report
   */
  generateExecutionReport() {
    const phases = this.generateExecutionPhases();
    const cycles = this.detectCircularDependencies();
    const criticalPath = this.findCriticalPath();
    
    return {
      summary: {
        totalNodes: this.nodes.size,
        totalEdges: Array.from(this.edges.values())
          .reduce((sum, edges) => sum + edges.size, 0),
        phases: phases.length,
        hasCycles: cycles.length > 0,
        criticalPathLength: criticalPath.length || 0
      },
      
      phases: phases.map(phase => ({
        phase: phase.phase,
        nodeCount: phase.nodes.length,
        canParallelize: phase.parallel,
        nodes: phase.nodes.map(id => ({
          id: id,
          ...this.nodes.get(id)
        })),
        dependencies: phase.dependencies
      })),
      
      cycles: cycles.map(cycle => ({
        nodes: cycle.nodes,
        resolution: cycle.resolutionStrategy,
        edges: cycle.edges
      })),
      
      criticalPath: criticalPath.success ? {
        path: criticalPath.path,
        length: criticalPath.length,
        nodes: criticalPath.nodes
      } : null,
      
      recommendations: this.generateRecommendations(phases, cycles)
    };
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(phases, cycles) {
    const recommendations = [];
    
    // Parallelization opportunities
    const parallelPhases = phases.filter(p => p.parallel && p.nodes.length > 1);
    if (parallelPhases.length > 0) {
      recommendations.push({
        type: 'PERFORMANCE',
        priority: 'HIGH',
        message: `${parallelPhases.length} phases can be executed in parallel`,
        details: `Potential time savings by parallelizing ${parallelPhases.reduce((sum, p) => sum + p.nodes.length, 0)} operations`
      });
    }
    
    // Cycle resolution
    if (cycles.length > 0) {
      recommendations.push({
        type: 'CRITICAL',
        priority: 'URGENT',
        message: `${cycles.length} circular dependencies detected`,
        details: 'Requires resolution strategy before execution',
        strategies: cycles.map(c => c.resolutionStrategy)
      });
    }
    
    // Optimization opportunities
    if (phases.length > 5) {
      recommendations.push({
        type: 'OPTIMIZATION',
        priority: 'MEDIUM',
        message: 'Consider consolidating operations',
        details: `${phases.length} phases detected - may benefit from consolidation`
      });
    }
    
    return recommendations;
  }

  /**
   * Export graph for visualization
   */
  exportForVisualization() {
    const nodes = Array.from(this.nodes.values()).map(node => ({
      id: node.id,
      label: node.id,
      type: node.type,
      metadata: this.nodeMetadata.get(node.id)
    }));
    
    const edges = [];
    for (const [fromId, edgeSet] of this.edges.entries()) {
      for (const edge of edgeSet) {
        edges.push({
          from: fromId,
          to: edge.to,
          type: edge.type,
          metadata: edge.metadata
        });
      }
    }
    
    return {
      nodes: nodes,
      edges: edges,
      layout: 'hierarchical'
    };
  }
}

// Export for use in other modules
module.exports = OperationDependencyGraph;

// CLI interface for testing
if (require.main === module) {
  // Example usage
  const graph = new OperationDependencyGraph();
  
  // Add sample nodes and dependencies
  graph.addNode('Account', { type: 'object', operation: 'create' });
  graph.addNode('Contact', { type: 'object', operation: 'create' });
  graph.addNode('Opportunity', { type: 'object', operation: 'create' });
  graph.addNode('Case', { type: 'object', operation: 'create' });
  
  graph.addDependency('Contact', 'Account', 'parent');
  graph.addDependency('Opportunity', 'Account', 'parent');
  graph.addDependency('Case', 'Contact', 'parent');
  
  // Generate report
  const report = graph.generateExecutionReport();
  console.log(JSON.stringify(report, null, 2));
}

// Export for use in other modules
const DependencyGraph = OperationDependencyGraph;
module.exports = { DependencyGraph, OperationDependencyGraph };