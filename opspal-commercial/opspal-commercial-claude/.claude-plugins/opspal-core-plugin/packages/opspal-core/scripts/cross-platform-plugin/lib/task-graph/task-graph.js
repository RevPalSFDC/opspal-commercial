/**
 * TaskGraph - Directed Acyclic Graph representation for task orchestration
 *
 * Provides:
 * - Task node management with TaskSpec contracts
 * - Explicit dependency tracking
 * - Topological sorting for execution order
 * - Cycle detection to prevent deadlocks
 * - Parallelization analysis
 */

const fs = require('fs');
const path = require('path');

class TaskGraph {
  constructor(options = {}) {
    this.tasks = new Map();        // task_id -> TaskSpec
    this.edges = new Map();        // task_id -> Set of dependent task_ids
    this.reverseEdges = new Map(); // task_id -> Set of prerequisite task_ids
    this.metadata = {
      name: options.name || 'unnamed-graph',
      created_at: new Date().toISOString(),
      version: '1.0.0',
      ...options.metadata
    };
  }

  /**
   * Add a task to the graph
   * @param {Object} taskSpec - TaskSpec object conforming to schema
   * @returns {TaskGraph} this for chaining
   */
  addTask(taskSpec) {
    if (!taskSpec.id) {
      throw new Error('TaskSpec must have an id');
    }
    if (this.tasks.has(taskSpec.id)) {
      throw new Error(`Task ${taskSpec.id} already exists in graph`);
    }

    // Validate id format
    if (!/^T-[0-9]{2,4}$/.test(taskSpec.id)) {
      throw new Error(`Invalid task id format: ${taskSpec.id}. Must match T-XX or T-XXXX`);
    }

    // Store task with defaults
    this.tasks.set(taskSpec.id, {
      ...taskSpec,
      dependencies: taskSpec.dependencies || [],
      can_run_in_parallel_with: taskSpec.can_run_in_parallel_with || [],
      concurrency_group: taskSpec.concurrency_group || 'none',
      risk_level: taskSpec.risk_level || 'medium',
      tool_policy: taskSpec.tool_policy || {},
      stop_points: taskSpec.stop_points || [],
      status: 'pending'
    });

    // Initialize edge sets
    this.edges.set(taskSpec.id, new Set());
    this.reverseEdges.set(taskSpec.id, new Set());

    // Add dependency edges
    for (const depId of (taskSpec.dependencies || [])) {
      this.addDependency(depId, taskSpec.id);
    }

    return this;
  }

  /**
   * Add multiple tasks at once
   * @param {Array<Object>} taskSpecs - Array of TaskSpec objects
   * @returns {TaskGraph} this for chaining
   */
  addTasks(taskSpecs) {
    for (const spec of taskSpecs) {
      this.addTask(spec);
    }
    return this;
  }

  /**
   * Add a dependency edge (fromId must complete before toId can start)
   * @param {string} fromId - Prerequisite task ID
   * @param {string} toId - Dependent task ID
   * @returns {TaskGraph} this for chaining
   */
  addDependency(fromId, toId) {
    // Initialize edge sets if needed (for dependencies added before tasks)
    if (!this.edges.has(fromId)) {
      this.edges.set(fromId, new Set());
    }
    if (!this.reverseEdges.has(toId)) {
      this.reverseEdges.set(toId, new Set());
    }

    this.edges.get(fromId).add(toId);
    this.reverseEdges.get(toId).add(fromId);

    // Update task's dependencies array if task exists
    if (this.tasks.has(toId)) {
      const task = this.tasks.get(toId);
      if (!task.dependencies.includes(fromId)) {
        task.dependencies.push(fromId);
      }
    }

    return this;
  }

  /**
   * Remove a dependency edge
   * @param {string} fromId - Prerequisite task ID
   * @param {string} toId - Dependent task ID
   * @returns {TaskGraph} this for chaining
   */
  removeDependency(fromId, toId) {
    if (this.edges.has(fromId)) {
      this.edges.get(fromId).delete(toId);
    }
    if (this.reverseEdges.has(toId)) {
      this.reverseEdges.get(toId).delete(fromId);
    }

    // Update task's dependencies array
    if (this.tasks.has(toId)) {
      const task = this.tasks.get(toId);
      task.dependencies = task.dependencies.filter(d => d !== fromId);
    }

    return this;
  }

  /**
   * Get a task by ID
   * @param {string} taskId - Task ID
   * @returns {Object|null} TaskSpec or null if not found
   */
  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Get all tasks
   * @returns {Array<Object>} Array of TaskSpec objects
   */
  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks that have no dependencies (entry points)
   * @returns {Array<Object>} Array of TaskSpec objects
   */
  getRootTasks() {
    return this.getAllTasks().filter(task => {
      const prereqs = this.reverseEdges.get(task.id);
      return !prereqs || prereqs.size === 0;
    });
  }

  /**
   * Get tasks that no other task depends on (exit points)
   * @returns {Array<Object>} Array of TaskSpec objects
   */
  getLeafTasks() {
    return this.getAllTasks().filter(task => {
      const dependents = this.edges.get(task.id);
      return !dependents || dependents.size === 0;
    });
  }

  /**
   * Get direct dependencies of a task
   * @param {string} taskId - Task ID
   * @returns {Array<string>} Array of prerequisite task IDs
   */
  getDependencies(taskId) {
    const deps = this.reverseEdges.get(taskId);
    return deps ? Array.from(deps) : [];
  }

  /**
   * Get tasks that depend on a given task
   * @param {string} taskId - Task ID
   * @returns {Array<string>} Array of dependent task IDs
   */
  getDependents(taskId) {
    const deps = this.edges.get(taskId);
    return deps ? Array.from(deps) : [];
  }

  /**
   * Check if adding an edge would create a cycle
   * @param {string} fromId - Source task ID
   * @param {string} toId - Target task ID
   * @returns {boolean} true if adding edge would create cycle
   */
  wouldCreateCycle(fromId, toId) {
    // Adding edge from->to would create cycle if there's already a path from to->from
    return this.hasPath(toId, fromId);
  }

  /**
   * Check if there's a path from one task to another
   * @param {string} fromId - Source task ID
   * @param {string} toId - Target task ID
   * @returns {boolean} true if path exists
   */
  hasPath(fromId, toId) {
    const visited = new Set();
    const queue = [fromId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === toId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const dependents = this.edges.get(current);
      if (dependents) {
        for (const dep of dependents) {
          queue.push(dep);
        }
      }
    }

    return false;
  }

  /**
   * Validate that the graph is acyclic
   * @returns {Object} { valid: boolean, cycle?: Array<string> }
   */
  validateAcyclic() {
    const visited = new Set();
    const recursionStack = new Set();
    const cyclePath = [];

    const hasCycle = (taskId, path = []) => {
      visited.add(taskId);
      recursionStack.add(taskId);
      path.push(taskId);

      const dependents = this.edges.get(taskId) || new Set();
      for (const dependent of dependents) {
        if (!visited.has(dependent)) {
          const result = hasCycle(dependent, [...path]);
          if (result) {
            cyclePath.push(...result);
            return result;
          }
        } else if (recursionStack.has(dependent)) {
          // Found cycle - return the path from dependent back to dependent
          const cycleStart = path.indexOf(dependent);
          return path.slice(cycleStart).concat(dependent);
        }
      }

      recursionStack.delete(taskId);
      return null;
    };

    for (const taskId of this.tasks.keys()) {
      if (!visited.has(taskId)) {
        const cycle = hasCycle(taskId);
        if (cycle) {
          return { valid: false, cycle };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Get topological order of tasks (Kahn's algorithm)
   * @returns {Array<string>} Array of task IDs in execution order
   * @throws {Error} if graph contains cycles
   */
  getTopologicalOrder() {
    const validation = this.validateAcyclic();
    if (!validation.valid) {
      throw new Error(`Graph contains cycle: ${validation.cycle.join(' -> ')}`);
    }

    const inDegree = new Map();
    const order = [];
    const queue = [];

    // Calculate in-degree for each node
    for (const taskId of this.tasks.keys()) {
      const deps = this.reverseEdges.get(taskId);
      inDegree.set(taskId, deps ? deps.size : 0);
    }

    // Start with nodes that have no dependencies
    for (const [taskId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(taskId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      order.push(current);

      const dependents = this.edges.get(current) || new Set();
      for (const dependent of dependents) {
        const newDegree = inDegree.get(dependent) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    return order;
  }

  /**
   * Get tasks that can be executed in parallel at any point
   * Returns tasks grouped by "wave" - tasks in same wave can run concurrently
   * @returns {Array<Array<string>>} Array of waves, each containing parallelizable task IDs
   */
  getParallelizableWaves() {
    const validation = this.validateAcyclic();
    if (!validation.valid) {
      throw new Error(`Graph contains cycle: ${validation.cycle.join(' -> ')}`);
    }

    const waves = [];
    const completed = new Set();
    const remaining = new Set(this.tasks.keys());

    while (remaining.size > 0) {
      const wave = [];

      // Find all tasks whose dependencies are satisfied
      for (const taskId of remaining) {
        const deps = this.reverseEdges.get(taskId) || new Set();
        const allDepsComplete = Array.from(deps).every(d => completed.has(d));
        if (allDepsComplete) {
          wave.push(taskId);
        }
      }

      if (wave.length === 0) {
        throw new Error('Unable to make progress - possible circular dependency');
      }

      // Apply concurrency group constraints within wave
      const filteredWave = this.applyConcurrencyConstraints(wave);
      waves.push(filteredWave);

      // Mark wave tasks as completed
      for (const taskId of filteredWave) {
        completed.add(taskId);
        remaining.delete(taskId);
      }
    }

    return waves;
  }

  /**
   * Filter a wave of tasks to respect concurrency group constraints
   * @param {Array<string>} wave - Task IDs that could run in parallel
   * @returns {Array<string>} Filtered task IDs respecting concurrency groups
   */
  applyConcurrencyConstraints(wave) {
    const groupsUsed = new Set();
    const result = [];

    for (const taskId of wave) {
      const task = this.tasks.get(taskId);
      const group = task.concurrency_group;

      if (group === 'none' || !groupsUsed.has(group)) {
        result.push(taskId);
        if (group !== 'none') {
          groupsUsed.add(group);
        }
      }
    }

    return result;
  }

  /**
   * Get tasks ready to execute given current completed tasks
   * @param {Set<string>} completedTasks - Set of completed task IDs
   * @returns {Array<Object>} Array of ready TaskSpec objects
   */
  getReadyTasks(completedTasks = new Set()) {
    const ready = [];

    for (const [taskId, task] of this.tasks) {
      if (completedTasks.has(taskId)) continue;
      if (task.status === 'completed') continue;

      const deps = this.reverseEdges.get(taskId) || new Set();
      const allDepsComplete = Array.from(deps).every(d => completedTasks.has(d));

      if (allDepsComplete) {
        ready.push(task);
      }
    }

    return ready;
  }

  /**
   * Update task status
   * @param {string} taskId - Task ID
   * @param {string} status - New status
   * @returns {TaskGraph} this for chaining
   */
  setTaskStatus(taskId, status) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    task.status = status;
    return this;
  }

  /**
   * Get graph statistics
   * @returns {Object} Graph statistics
   */
  getStats() {
    const tasks = this.getAllTasks();
    let totalEdges = 0;
    for (const edges of this.edges.values()) {
      totalEdges += edges.size;
    }

    const byStatus = {};
    const byDomain = {};
    const byRiskLevel = {};

    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;
      byDomain[task.domain] = (byDomain[task.domain] || 0) + 1;
      byRiskLevel[task.risk_level] = (byRiskLevel[task.risk_level] || 0) + 1;
    }

    const waves = this.getParallelizableWaves();
    const maxParallelism = Math.max(...waves.map(w => w.length));
    const criticalPathLength = waves.length;

    return {
      task_count: tasks.length,
      edge_count: totalEdges,
      root_count: this.getRootTasks().length,
      leaf_count: this.getLeafTasks().length,
      wave_count: waves.length,
      max_parallelism: maxParallelism,
      critical_path_length: criticalPathLength,
      by_status: byStatus,
      by_domain: byDomain,
      by_risk_level: byRiskLevel
    };
  }

  /**
   * Generate Mermaid diagram of the graph
   * @returns {string} Mermaid flowchart syntax
   */
  toMermaid() {
    const lines = ['graph TD'];

    // Add nodes with styling based on risk level
    for (const [taskId, task] of this.tasks) {
      const label = task.title.replace(/"/g, "'");
      const style = this.getMermaidStyle(task.risk_level);
      lines.push(`    ${taskId}["${taskId}: ${label}"]${style}`);
    }

    // Add edges
    for (const [fromId, toIds] of this.edges) {
      for (const toId of toIds) {
        lines.push(`    ${fromId} --> ${toId}`);
      }
    }

    // Add style classes
    lines.push('');
    lines.push('    classDef low fill:#90EE90,stroke:#228B22');
    lines.push('    classDef medium fill:#FFE4B5,stroke:#FF8C00');
    lines.push('    classDef high fill:#FFB6C1,stroke:#DC143C');
    lines.push('    classDef critical fill:#FF6B6B,stroke:#8B0000,stroke-width:3px');

    return lines.join('\n');
  }

  getMermaidStyle(riskLevel) {
    const styles = {
      low: ':::low',
      medium: ':::medium',
      high: ':::high',
      critical: ':::critical'
    };
    return styles[riskLevel] || '';
  }

  /**
   * Serialize graph to JSON
   * @returns {Object} Serialized graph
   */
  toJSON() {
    return {
      metadata: this.metadata,
      tasks: Array.from(this.tasks.values()),
      stats: this.getStats()
    };
  }

  /**
   * Create graph from JSON
   * @param {Object} json - Serialized graph
   * @returns {TaskGraph} New TaskGraph instance
   */
  static fromJSON(json) {
    const graph = new TaskGraph({ metadata: json.metadata });
    graph.addTasks(json.tasks);
    return graph;
  }

  /**
   * Save graph to file
   * @param {string} filePath - Output file path
   */
  save(filePath) {
    fs.writeFileSync(filePath, JSON.stringify(this.toJSON(), null, 2));
  }

  /**
   * Load graph from file
   * @param {string} filePath - Input file path
   * @returns {TaskGraph} Loaded TaskGraph
   */
  static load(filePath) {
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return TaskGraph.fromJSON(json);
  }
}

module.exports = { TaskGraph };
