/**
 * DependencyResolver.js
 *
 * Resolves component dependencies and determines optimal deployment order using
 * topological sorting (DAG). Detects circular dependencies and validates
 * dependency references.
 *
 * @module solution-template-system/core/DependencyResolver
 */

'use strict';

/**
 * Resolves component dependencies and determines deployment order
 */
class DependencyResolver {
  constructor(options = {}) {
    this.options = {
      strictMode: options.strictMode !== false, // Fail on missing dependencies
      allowSelfReference: options.allowSelfReference || false,
      maxDepth: options.maxDepth || 100, // Prevent infinite recursion
      ...options
    };

    // Track resolution state
    this.graph = new Map();
    this.inDegree = new Map();
    this.resolved = [];
    this.visited = new Set();
    this.recursionStack = new Set();
  }

  /**
   * Build dependency graph from components
   * @param {Array} components - Solution components with dependsOn/dependencies
   * @returns {Object} Graph analysis result
   */
  buildGraph(components) {
    this.reset();

    const errors = [];
    const warnings = [];
    const componentMap = new Map();

    // Index all components by ID
    for (const component of components) {
      if (!component.id) {
        errors.push({ type: 'missing_id', component });
        continue;
      }

      if (componentMap.has(component.id)) {
        errors.push({
          type: 'duplicate_id',
          id: component.id,
          message: `Duplicate component ID: ${component.id}`
        });
        continue;
      }

      componentMap.set(component.id, component);
      this.graph.set(component.id, []);
      this.inDegree.set(component.id, 0);
    }

    // Build edges from dependencies
    for (const component of components) {
      if (!component.id) continue;

      const deps = component.dependsOn || component.dependencies || [];

      for (const dep of deps) {
        // Validate self-reference
        if (dep === component.id && !this.options.allowSelfReference) {
          errors.push({
            type: 'self_reference',
            component: component.id,
            message: `Component ${component.id} references itself`
          });
          continue;
        }

        // Validate dependency exists
        if (!componentMap.has(dep)) {
          if (this.options.strictMode) {
            errors.push({
              type: 'missing_dependency',
              component: component.id,
              dependency: dep,
              message: `Component ${component.id} depends on non-existent ${dep}`
            });
          } else {
            warnings.push({
              type: 'missing_dependency',
              component: component.id,
              dependency: dep,
              message: `Component ${component.id} depends on non-existent ${dep} (ignored)`
            });
          }
          continue;
        }

        // Add edge: dep -> component (component depends on dep)
        this.graph.get(dep).push(component.id);
        this.inDegree.set(component.id, (this.inDegree.get(component.id) || 0) + 1);
      }
    }

    return {
      componentMap,
      nodeCount: componentMap.size,
      edgeCount: Array.from(this.graph.values()).reduce((sum, edges) => sum + edges.length, 0),
      errors,
      warnings
    };
  }

  /**
   * Detect circular dependencies using DFS
   * @returns {Array} Array of cycles found (each cycle is an array of component IDs)
   */
  detectCycles() {
    const cycles = [];
    const visited = new Set();
    const recursionStack = new Set();
    const path = [];

    const dfs = (node) => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = this.graph.get(node) || [];

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const result = dfs(neighbor);
          if (result) return result;
        } else if (recursionStack.has(neighbor)) {
          // Found cycle - extract cycle from path
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          cycle.push(neighbor); // Complete the cycle
          cycles.push(cycle);
        }
      }

      path.pop();
      recursionStack.delete(node);
      return null;
    };

    for (const node of this.graph.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * Perform topological sort using Kahn's algorithm
   * @returns {Object} Sort result with order and any unresolved components
   */
  topologicalSort() {
    const order = [];
    const queue = [];
    const inDegreeCopy = new Map(this.inDegree);

    // Find all nodes with no dependencies (in-degree = 0)
    for (const [node, degree] of inDegreeCopy) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    while (queue.length > 0) {
      const node = queue.shift();
      order.push(node);

      const neighbors = this.graph.get(node) || [];
      for (const neighbor of neighbors) {
        const newDegree = inDegreeCopy.get(neighbor) - 1;
        inDegreeCopy.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Check for cycles (nodes that couldn't be processed)
    const unresolved = [];
    for (const [node, degree] of inDegreeCopy) {
      if (degree > 0) {
        unresolved.push(node);
      }
    }

    return {
      order,
      unresolved,
      hasCycles: unresolved.length > 0,
      totalNodes: this.graph.size
    };
  }

  /**
   * Resolve deployment order for components
   * @param {Array} components - Solution components
   * @returns {Object} Resolution result with ordered components and metadata
   */
  resolve(components) {
    // Build the dependency graph
    const graphResult = this.buildGraph(components);

    if (graphResult.errors.length > 0 && this.options.strictMode) {
      return {
        success: false,
        orderedComponents: [],
        errors: graphResult.errors,
        warnings: graphResult.warnings,
        cycles: [],
        metadata: {
          nodeCount: graphResult.nodeCount,
          edgeCount: graphResult.edgeCount
        }
      };
    }

    // Detect cycles
    const cycles = this.detectCycles();

    if (cycles.length > 0) {
      return {
        success: false,
        orderedComponents: [],
        errors: [
          ...graphResult.errors,
          ...cycles.map(cycle => ({
            type: 'circular_dependency',
            cycle,
            message: `Circular dependency detected: ${cycle.join(' -> ')}`
          }))
        ],
        warnings: graphResult.warnings,
        cycles,
        metadata: {
          nodeCount: graphResult.nodeCount,
          edgeCount: graphResult.edgeCount
        }
      };
    }

    // Perform topological sort
    const sortResult = this.topologicalSort();

    if (sortResult.hasCycles) {
      return {
        success: false,
        orderedComponents: [],
        errors: [
          ...graphResult.errors,
          {
            type: 'unresolved_dependencies',
            components: sortResult.unresolved,
            message: `Could not resolve dependencies for: ${sortResult.unresolved.join(', ')}`
          }
        ],
        warnings: graphResult.warnings,
        cycles: [],
        metadata: {
          nodeCount: graphResult.nodeCount,
          edgeCount: graphResult.edgeCount
        }
      };
    }

    // Build ordered component list with order numbers
    const orderedComponents = sortResult.order.map((id, index) => {
      const component = graphResult.componentMap.get(id);
      return {
        ...component,
        resolvedOrder: index + 1,
        dependencyDepth: this.calculateDepth(id, graphResult.componentMap)
      };
    });

    return {
      success: true,
      orderedComponents,
      errors: graphResult.errors,
      warnings: graphResult.warnings,
      cycles: [],
      metadata: {
        nodeCount: graphResult.nodeCount,
        edgeCount: graphResult.edgeCount,
        maxDepth: Math.max(...orderedComponents.map(c => c.dependencyDepth)),
        deploymentPhases: this.groupByPhases(orderedComponents)
      }
    };
  }

  /**
   * Calculate dependency depth for a component
   * @param {string} componentId - Component ID
   * @param {Map} componentMap - Map of all components
   * @returns {number} Depth in dependency tree
   */
  calculateDepth(componentId, componentMap) {
    const component = componentMap.get(componentId);
    if (!component) return 0;

    const deps = component.dependsOn || component.dependencies || [];
    if (deps.length === 0) return 0;

    let maxDepth = 0;
    for (const dep of deps) {
      if (componentMap.has(dep)) {
        const depDepth = this.calculateDepth(dep, componentMap);
        maxDepth = Math.max(maxDepth, depDepth + 1);
      }
    }

    return maxDepth;
  }

  /**
   * Group components into deployment phases (parallel-safe groups)
   * @param {Array} orderedComponents - Components in dependency order
   * @returns {Array} Array of phases, each containing components that can deploy in parallel
   */
  groupByPhases(orderedComponents) {
    const phases = [];
    const deployed = new Set();

    // Create component lookup by ID
    const componentMap = new Map();
    for (const comp of orderedComponents) {
      componentMap.set(comp.id, comp);
    }

    let remaining = [...orderedComponents];
    let phaseNumber = 1;

    while (remaining.length > 0) {
      const phase = {
        phase: phaseNumber,
        components: [],
        parallelSafe: true
      };

      const toRemove = [];

      for (const component of remaining) {
        const deps = component.dependsOn || component.dependencies || [];
        const allDepsDeployed = deps.every(dep => deployed.has(dep));

        if (allDepsDeployed) {
          phase.components.push(component.id);
          toRemove.push(component);
        }
      }

      // Mark as deployed
      for (const comp of toRemove) {
        deployed.add(comp.id);
        remaining = remaining.filter(c => c.id !== comp.id);
      }

      if (phase.components.length > 0) {
        phases.push(phase);
        phaseNumber++;
      } else if (remaining.length > 0) {
        // Safety check - shouldn't happen if topological sort succeeded
        break;
      }
    }

    return phases;
  }

  /**
   * Get all dependencies (transitive) for a component
   * @param {string} componentId - Component ID
   * @param {Array} components - All components
   * @returns {Array} All dependencies including transitive ones
   */
  getAllDependencies(componentId, components) {
    const componentMap = new Map();
    for (const comp of components) {
      componentMap.set(comp.id, comp);
    }

    const allDeps = new Set();
    const visited = new Set();

    const collect = (id) => {
      if (visited.has(id)) return;
      visited.add(id);

      const component = componentMap.get(id);
      if (!component) return;

      const deps = component.dependsOn || component.dependencies || [];
      for (const dep of deps) {
        allDeps.add(dep);
        collect(dep);
      }
    };

    collect(componentId);
    return Array.from(allDeps);
  }

  /**
   * Get all dependents (components that depend on this one)
   * @param {string} componentId - Component ID
   * @param {Array} components - All components
   * @returns {Array} All dependent components including transitive ones
   */
  getAllDependents(componentId, components) {
    const dependents = new Set();
    const visited = new Set();

    const collect = (id) => {
      if (visited.has(id)) return;
      visited.add(id);

      for (const comp of components) {
        const deps = comp.dependsOn || comp.dependencies || [];
        if (deps.includes(id)) {
          dependents.add(comp.id);
          collect(comp.id);
        }
      }
    };

    collect(componentId);
    return Array.from(dependents);
  }

  /**
   * Validate that existing order numbers are consistent with dependencies
   * @param {Array} components - Components with existing order fields
   * @returns {Object} Validation result
   */
  validateExistingOrder(components) {
    const violations = [];

    for (const component of components) {
      if (component.order === undefined) continue;

      const deps = component.dependsOn || component.dependencies || [];
      for (const dep of deps) {
        const depComponent = components.find(c => c.id === dep);
        if (depComponent && depComponent.order !== undefined) {
          if (depComponent.order >= component.order) {
            violations.push({
              component: component.id,
              dependency: dep,
              componentOrder: component.order,
              dependencyOrder: depComponent.order,
              message: `${component.id} (order ${component.order}) depends on ${dep} (order ${depComponent.order}) but is ordered before it`
            });
          }
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Generate deployment plan with rollback information
   * @param {Array} components - Solution components
   * @returns {Object} Deployment plan with phases and rollback order
   */
  generateDeploymentPlan(components) {
    const resolution = this.resolve(components);

    if (!resolution.success) {
      return {
        success: false,
        plan: null,
        errors: resolution.errors
      };
    }

    const plan = {
      deployOrder: resolution.orderedComponents.map(c => ({
        id: c.id,
        type: c.type,
        order: c.resolvedOrder,
        dependencies: c.dependsOn || c.dependencies || []
      })),
      rollbackOrder: [...resolution.orderedComponents]
        .sort((a, b) => b.resolvedOrder - a.resolvedOrder)
        .map(c => ({
          id: c.id,
          type: c.type,
          order: c.resolvedOrder
        })),
      phases: resolution.metadata.deploymentPhases,
      statistics: {
        totalComponents: resolution.orderedComponents.length,
        maxDependencyDepth: resolution.metadata.maxDepth,
        phaseCount: resolution.metadata.deploymentPhases.length,
        averageComponentsPerPhase: (
          resolution.orderedComponents.length /
          resolution.metadata.deploymentPhases.length
        ).toFixed(2)
      }
    };

    return {
      success: true,
      plan,
      errors: []
    };
  }

  /**
   * Reset internal state for new resolution
   */
  reset() {
    this.graph = new Map();
    this.inDegree = new Map();
    this.resolved = [];
    this.visited = new Set();
    this.recursionStack = new Set();
  }

  /**
   * Visualize dependency graph as Mermaid diagram
   * @param {Array} components - Solution components
   * @returns {string} Mermaid graph definition
   */
  toMermaid(components) {
    this.buildGraph(components);

    const lines = ['graph TD'];
    const addedNodes = new Set();

    // Add nodes
    for (const component of components) {
      if (!component.id) continue;

      const label = component.type
        ? `${component.id}["${component.id}<br/>${component.type}"]`
        : component.id;

      if (!addedNodes.has(component.id)) {
        lines.push(`    ${label}`);
        addedNodes.add(component.id);
      }
    }

    // Add edges
    for (const component of components) {
      if (!component.id) continue;

      const deps = component.dependsOn || component.dependencies || [];
      for (const dep of deps) {
        lines.push(`    ${dep} --> ${component.id}`);
      }
    }

    return lines.join('\n');
  }
}

module.exports = DependencyResolver;
