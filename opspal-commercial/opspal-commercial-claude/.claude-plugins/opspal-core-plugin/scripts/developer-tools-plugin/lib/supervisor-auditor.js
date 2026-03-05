#!/usr/bin/env node

/**
 * supervisor-auditor.js
 *
 * Core Supervisor-Auditor engine for complex multi-agent orchestration.
 * Maximizes parallelization, enforces sub-agent usage, audits execution compliance.
 *
 * @module supervisor-auditor
 */

const InventoryCache = require('./inventory-cache');

/**
 * Task Decomposer - Breaks tasks into atomic units with dependency analysis
 */
class TaskDecomposer {
  constructor() {
    this.actionVerbs = [
      'analyze', 'generate', 'create', 'update', 'deploy', 'fetch',
      'summarize', 'compare', 'validate', 'process', 'build', 'test',
      'review', 'audit', 'check', 'scan', 'detect', 'report'
    ];
  }

  /**
   * Decompose task into atomic units
   * @param {string} task - User task description
   * @param {number} complexity - Complexity score (0-1)
   * @returns {array} Array of task units
   */
  decompose(task, complexity) {
    const units = [];

    // Check for explicit parallelization hints
    const parallelHints = /\b(in parallel|concurrently|simultaneously|all.*at once)\b/i;
    const forceParallel = parallelHints.test(task);

    // Pattern 1: Multiple explicit targets (e.g., "analyze plugin-a, plugin-b, plugin-c")
    // Or "all X" pattern (e.g., "analyze all 5 plugins")
    const listPattern = /\b(for|across|on|in)\s+.*(,|and\s+)/i;
    const allPattern = /\ball\s+\d+/i;
    const match = task.match(listPattern) || task.match(allPattern);

    if (match) {
      const targets = this._extractTargets(task);

      if (targets.length > 1) {
        const action = this._extractAction(task);

        targets.forEach((target, i) => {
          units.push({
            id: `U${i + 1}`,
            action: action,
            target: target,
            description: `${action} ${target}`,
            inputs: [target],
            outputs: [`${action}_result_${target}`],
            side_effects: this._determineSideEffects(action, target)
          });
        });

        return units;
      }
    }

    // Pattern 2: Multiple actions in sequence (e.g., "analyze AND deploy")
    const actions = this._extractMultipleActions(task);

    if (actions.length > 1) {
      actions.forEach((action, i) => {
        units.push({
          id: `U${i + 1}`,
          action: action.verb,
          target: action.target || 'system',
          description: action.text,
          inputs: i > 0 ? [`U${i}`] : [],
          outputs: [`${action.verb}_result`],
          side_effects: this._determineSideEffects(action.verb, action.target)
        });
      });

      return units;
    }

    // Pattern 3: Single complex task (create single unit)
    units.push({
      id: 'U1',
      action: this._extractAction(task),
      target: 'system',
      description: task,
      inputs: [],
      outputs: ['result'],
      side_effects: this._determineSideEffects(this._extractAction(task), 'system')
    });

    return units;
  }

  /**
   * Extract targets from task (e.g., plugin names, file names)
   */
  _extractTargets(task) {
    const targets = [];

    // Pattern: "all 8 plugins" (check this first as it's more specific)
    const allPattern = /\ball\s+(\d+)\s+(\w+)/i;
    const allMatch = task.match(allPattern);
    if (allMatch && targets.length === 0) {
      const count = parseInt(allMatch[1]);
      const type = allMatch[2];

      // Generate placeholder targets
      for (let i = 1; i <= Math.min(count, 20); i++) {
        targets.push(`${type}-${i}`);
      }
      return targets;
    }

    // Pattern: "plugin-a, plugin-b, and plugin-c"
    // Split on commas and "and" to get all items
    const parts = task.split(/,\s*(?:and\s+)?|\s+and\s+/);

    for (const part of parts) {
      // Extract hyphenated names or simple identifiers
      const nameMatch = part.match(/\b([a-z0-9]+-[a-z0-9-]+(?:-plugin)?)\b/i);
      if (nameMatch) {
        targets.push(nameMatch[1]);
      }
    }

    return targets.length > 0 ? targets : ['default'];
  }

  /**
   * Extract primary action verb from task
   */
  _extractAction(task) {
    for (const verb of this.actionVerbs) {
      const pattern = new RegExp(`\\b${verb}\\b`, 'i');
      if (pattern.test(task)) {
        return verb;
      }
    }

    return 'process';
  }

  /**
   * Extract multiple sequential actions (e.g., "analyze AND deploy")
   */
  _extractMultipleActions(task) {
    const actions = [];

    // Check for explicit AND/THEN connectors
    const andPattern = /\b(and then|then|and)\b/i;
    if (!andPattern.test(task)) {
      return actions;
    }

    // Split on connectors
    const segments = task.split(/\b(?:and then|then|and)\b/i);

    segments.forEach(segment => {
      const verb = this._extractAction(segment);
      const target = this._extractTargets(segment)[0];

      actions.push({
        verb: verb,
        target: target,
        text: segment.trim()
      });
    });

    return actions;
  }

  /**
   * Determine side effects of an action
   */
  _determineSideEffects(action, target) {
    const writeActions = ['create', 'update', 'deploy', 'delete', 'modify', 'build'];
    const readActions = ['analyze', 'fetch', 'read', 'query', 'scan', 'check'];

    if (writeActions.some(v => action.toLowerCase().includes(v))) {
      return [target]; // Writing to specific target
    }

    return []; // Read-only
  }

  /**
   * Detect dependencies between units
   */
  detectDependencies(units) {
    const dependencies = [];

    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const unit1 = units[i];
        const unit2 = units[j];

        // Check if unit2 depends on unit1
        const dependsOn = this._checkDependency(unit1, unit2);

        if (dependsOn) {
          dependencies.push({
            from: unit1.id,
            to: unit2.id,
            reason: dependsOn.reason
          });
        }
      }
    }

    return dependencies;
  }

  /**
   * Check if unit2 depends on unit1
   */
  _checkDependency(unit1, unit2) {
    // Rule 1: Output of unit1 is input to unit2
    for (const output of unit1.outputs) {
      if (unit2.inputs.includes(output) || unit2.inputs.includes(unit1.id)) {
        return { reason: 'data_dependency', detail: `${unit2.id} requires output from ${unit1.id}` };
      }
    }

    // Rule 2: Same target with write/read sequence
    const unit1Writes = unit1.side_effects.length > 0;
    const unit2Reads = unit2.side_effects.length === 0;

    if (unit1Writes && unit2Reads) {
      const sharedTarget = unit1.side_effects.some(se => unit2.target.includes(se) || se.includes(unit2.target));

      if (sharedTarget) {
        return { reason: 'side_effect_dependency', detail: `${unit2.id} reads what ${unit1.id} writes` };
      }
    }

    // Rule 3: Sequential action pattern (analyze THEN deploy)
    const sequentialActions = [
      ['analyze', 'deploy'],
      ['fetch', 'summarize'],
      ['generate', 'validate'],
      ['create', 'test']
    ];

    for (const [first, second] of sequentialActions) {
      if (unit1.action.toLowerCase().includes(first) &&
          unit2.action.toLowerCase().includes(second)) {
        return { reason: 'sequential_action', detail: `${second} follows ${first}` };
      }
    }

    return null;
  }

  /**
   * Check if units can run in parallel
   */
  canRunInParallel(unit1, unit2, dependencies) {
    // Check for dependency
    const hasDependency = dependencies.some(d =>
      (d.from === unit1.id && d.to === unit2.id) ||
      (d.from === unit2.id && d.to === unit1.id)
    );

    if (hasDependency) {
      return { parallel: false, reason: 'dependency_exists' };
    }

    // Check for shared side effects (both writing to same target)
    const sharedSideEffects = unit1.side_effects.some(se => unit2.side_effects.includes(se));

    if (sharedSideEffects) {
      return { parallel: false, reason: 'shared_side_effects' };
    }

    // Check for shared inputs that might conflict
    const sharedInputs = unit1.inputs.some(inp => unit2.inputs.includes(inp));

    if (sharedInputs && (unit1.side_effects.length > 0 || unit2.side_effects.length > 0)) {
      return { parallel: false, reason: 'conflicting_inputs' };
    }

    return { parallel: true, reason: 'independent' };
  }
}

/**
 * Agent Matcher - Finds best agents from INVENTORY for each unit
 */
class AgentMatcher {
  constructor(inventory) {
    this.inventory = inventory;
  }

  /**
   * Find best agent for a task unit
   * @param {object} unit - Task unit
   * @param {array} excludeAgents - Agents to exclude
   * @returns {object} Agent match with confidence
   */
  findBestAgent(unit, excludeAgents = []) {
    const candidates = [];

    // Score each agent
    for (const agent of this.inventory.agents) {
      if (excludeAgents.includes(agent.name)) {
        continue;
      }

      const score = this._scoreAgent(agent, unit);

      candidates.push({
        agent: agent.name,
        score: score.total,
        breakdown: score,
        latency: agent.latency_hint,
        success_rate: agent.success_rate,
        alternatives: []
      });
    }

    // Sort by score (highest first)
    candidates.sort((a, b) => b.score - a.score);

    // Get top match
    const best = candidates[0];

    if (!best) {
      return null;
    }

    // Add alternatives (next 2 candidates)
    best.alternatives = candidates.slice(1, 3).map(c => ({
      agent: c.agent,
      score: c.score,
      reason: `Alternative with ${(c.score * 100).toFixed(0)}% match`
    }));

    // Calculate confidence (0-1)
    const confidence = best.score;

    return {
      agent: best.agent,
      confidence: confidence,
      reason: this._explainMatch(best.breakdown),
      latency: best.latency,
      success_rate: best.success_rate,
      alternatives: best.alternatives
    };
  }

  /**
   * Score an agent for a task unit
   */
  _scoreAgent(agent, unit) {
    let capabilityScore = 0;
    let latencyScore = 0;
    let successScore = 0;

    // Capability match (70% weight)
    const action = unit.action.toLowerCase();
    const target = unit.target.toLowerCase();
    const description = unit.description.toLowerCase();

    for (const strength of agent.strengths) {
      const strengthLower = strength.toLowerCase();

      if (action.includes(strengthLower) || strengthLower.includes(action)) {
        capabilityScore += 0.3;
      }

      if (target.includes(strengthLower) || strengthLower.includes(target)) {
        capabilityScore += 0.2;
      }

      if (description.includes(strengthLower)) {
        capabilityScore += 0.2;
      }
    }

    capabilityScore = Math.min(capabilityScore, 0.7);

    // Latency score (20% weight)
    const latencyWeights = {
      'low': 0.20,
      'med': 0.15,
      'high': 0.10
    };
    latencyScore = latencyWeights[agent.latency_hint] || 0.15;

    // Success rate score (10% weight)
    successScore = agent.success_rate * 0.1;

    return {
      capability: capabilityScore,
      latency: latencyScore,
      success: successScore,
      total: capabilityScore + latencyScore + successScore
    };
  }

  /**
   * Explain why an agent matched
   */
  _explainMatch(breakdown) {
    const parts = [];

    if (breakdown.capability > 0.5) {
      parts.push('strong capability match');
    } else if (breakdown.capability > 0.3) {
      parts.push('moderate capability match');
    }

    if (breakdown.latency > 0.15) {
      parts.push('fast execution');
    }

    if (breakdown.success > 0.08) {
      parts.push('high success rate');
    }

    return parts.join(', ') || 'general match';
  }
}

/**
 * Plan Generator - Creates execution plan with parallel groups
 */
class PlanGenerator {
  constructor() {}

  /**
   * Generate execution plan from units and agent matches
   * @param {array} units - Task units
   * @param {array} dependencies - Unit dependencies
   * @param {array} agentMatches - Agent matches for each unit
   * @returns {object} Execution plan
   */
  generate(units, dependencies, agentMatches) {
    const plan = {
      parallel_groups: [],
      sequential_barriers: [],
      budget: {
        max_latency_seconds: 60,
        max_calls: units.length * 2 // Allow retries
      }
    };

    // Build dependency graph
    const graph = this._buildDependencyGraph(units, dependencies);

    // Topological sort to determine execution order
    const layers = this._topologicalSort(graph, units);

    // Create parallel groups from layers
    layers.forEach((layer, i) => {
      const groupId = `G${i + 1}`;
      const groupUnits = [];

      layer.forEach(unitId => {
        const unit = units.find(u => u.id === unitId);
        const match = agentMatches.find(m => m.unitId === unitId);

        if (unit && match) {
          groupUnits.push({
            unit_id: unit.id,
            agent_or_tool: match.agent,
            inputs: unit.inputs,
            expected_output: unit.outputs[0],
            fallbacks: match.alternatives.map(alt => ({
              on_fail_of: unit.id,
              fallback: alt.agent,
              trigger: 'timeout>30s OR error'
            }))
          });
        }
      });

      plan.parallel_groups.push({
        group_id: groupId,
        runs_in_parallel: groupUnits.length > 1,
        units: groupUnits
      });

      // Add barrier if not last group
      if (i < layers.length - 1) {
        plan.sequential_barriers.push({
          after_groups: [groupId],
          reason: `Dependencies require ${groupId} to complete first`
        });
      }
    });

    return plan;
  }

  /**
   * Build dependency graph
   */
  _buildDependencyGraph(units, dependencies) {
    const graph = {};

    // Initialize graph
    units.forEach(unit => {
      graph[unit.id] = {
        dependencies: [],
        dependents: []
      };
    });

    // Add dependencies
    dependencies.forEach(dep => {
      graph[dep.to].dependencies.push(dep.from);
      graph[dep.from].dependents.push(dep.to);
    });

    return graph;
  }

  /**
   * Topological sort to determine execution layers
   */
  _topologicalSort(graph, units) {
    const layers = [];
    const completed = new Set();
    const remaining = new Set(units.map(u => u.id));

    while (remaining.size > 0) {
      const layer = [];

      // Find units with no pending dependencies
      for (const unitId of remaining) {
        const deps = graph[unitId].dependencies;
        const allDepsMet = deps.every(dep => completed.has(dep));

        if (allDepsMet) {
          layer.push(unitId);
        }
      }

      if (layer.length === 0 && remaining.size > 0) {
        // Circular dependency detected - break with warning
        console.warn('Circular dependency detected, forcing sequential execution');
        layer.push(Array.from(remaining)[0]);
      }

      // Add layer
      layers.push(layer);

      // Mark as completed
      layer.forEach(unitId => {
        completed.add(unitId);
        remaining.delete(unitId);
      });
    }

    return layers;
  }
}

/**
 * Supervisor-Auditor Main Class
 */
class SupervisorAuditor {
  constructor(options = {}) {
    this.inventoryCache = InventoryCache.getInstance(options.inventoryCache);
    this.decomposer = new TaskDecomposer();
    this.planGenerator = new PlanGenerator();
  }

  /**
   * Create execution plan for a task
   * @param {object} inputs - Planning inputs
   * @returns {object} Complete plan with AUDIT, PLAN, EXECUTION_POLICY, CYCLE_AUDIT_TEMPLATE
   */
  plan(inputs) {
    const { task, complexity, constraints = {} } = inputs;

    // Get INVENTORY
    const inventory = this.inventoryCache.get();

    // Decompose task
    const units = this.decomposer.decompose(task, complexity);

    // Detect dependencies
    const dependencies = this.decomposer.detectDependencies(units);

    // Check independence for parallelization
    const independenceCheck = this._analyzeIndependence(units, dependencies);

    // Match agents to units
    const matcher = new AgentMatcher(inventory);
    const agentMatches = units.map(unit => {
      const match = matcher.findBestAgent(unit);

      return {
        unitId: unit.id,
        ...match
      };
    });

    // Subagent matching analysis
    const subagentMatch = this._analyzeSubagentMatch(units, agentMatches);

    // Risk checks
    const riskChecks = this._performRiskChecks(units, agentMatches, dependencies);

    // Success criteria
    const successCriteria = this._defineSuccessCriteria(units);

    // Generate plan
    const executionPlan = this.planGenerator.generate(units, dependencies, agentMatches);

    // Build complete output
    return {
      AUDIT: {
        problem_decomposition: units.map(u => u.description),
        independence_check: independenceCheck,
        subagent_match: subagentMatch,
        risk_checks: riskChecks,
        success_criteria: successCriteria
      },
      PLAN: executionPlan,
      EXECUTION_POLICY: {
        parallelism_target: 'max',
        retry_policy: {
          retries: 1,
          backoff_seconds: 3
        },
        dedupe_policy: 'cancel slower duplicate if faster result passes validation',
        circuit_breakers: [
          'stop if >3 consecutive tool failures',
          'stop if total execution time exceeds budget'
        ]
      },
      CYCLE_AUDIT_TEMPLATE: {
        plan_vs_actual: [],
        utilization_scores: {
          subagent_utilization: 0,
          parallelization_ratio: 0
        },
        gaps: [],
        next_actions: []
      }
    };
  }

  /**
   * Analyze independence for parallelization
   */
  _analyzeIndependence(units, dependencies) {
    return units.map((unit, i) => {
      const otherUnits = units.filter((_, j) => j !== i);
      const canParallel = otherUnits.every(other => {
        const result = this.decomposer.canRunInParallel(unit, other, dependencies);
        return result.parallel;
      });

      return {
        unit: unit.id,
        can_run_in_parallel: canParallel,
        why: canParallel ?
          'No dependencies, independent inputs/outputs, no shared side effects' :
          'Has dependencies or shared side effects'
      };
    });
  }

  /**
   * Analyze subagent matching
   */
  _analyzeSubagentMatch(units, agentMatches) {
    return units.map((unit, i) => {
      const match = agentMatches[i];

      return {
        unit: unit.id,
        chosen: match.agent,
        alternatives_considered: match.alternatives.map(a => a.agent),
        why: match.reason,
        non_use_justification: null
      };
    });
  }

  /**
   * Perform risk checks
   */
  _performRiskChecks(units, agentMatches, dependencies) {
    const risks = [];

    // Check for latency hotspots
    const highLatencyUnits = agentMatches.filter(m => m.latency === 'high');
    if (highLatencyUnits.length > 0) {
      risks.push(`Latency hotspots: ${highLatencyUnits.length} high-latency agents`);
    }

    // Check for low confidence matches
    const lowConfidence = agentMatches.filter(m => m.confidence < 0.5);
    if (lowConfidence.length > 0) {
      risks.push(`Low confidence matches: ${lowConfidence.length} units with <50% match`);
    }

    // Check for sequential depth
    const maxDepth = this._calculateMaxDepth(dependencies);
    if (maxDepth > 3) {
      risks.push(`Sequential depth: ${maxDepth} layers (>3 may indicate over-serialization)`);
    }

    return risks.length > 0 ? risks : ['No significant risks detected'];
  }

  /**
   * Calculate maximum dependency depth
   */
  _calculateMaxDepth(dependencies) {
    if (dependencies.length === 0) return 1;

    // Build adjacency list
    const graph = {};
    dependencies.forEach(dep => {
      if (!graph[dep.from]) graph[dep.from] = [];
      graph[dep.from].push(dep.to);
    });

    // Find max path length
    let maxDepth = 0;

    const dfs = (node, depth) => {
      maxDepth = Math.max(maxDepth, depth);

      if (graph[node]) {
        graph[node].forEach(next => dfs(next, depth + 1));
      }
    };

    // Start from all roots
    const roots = Object.keys(graph).filter(node =>
      !dependencies.some(d => d.to === node)
    );

    roots.forEach(root => dfs(root, 1));

    return maxDepth;
  }

  /**
   * Define success criteria
   */
  _defineSuccessCriteria(units) {
    return [
      `All ${units.length} units complete successfully`,
      'No circuit breaker triggers',
      'Parallelization ratio ≥ 60% (if ≥2 independent units)',
      'Sub-agent utilization ≥ 70%'
    ];
  }
}

module.exports = SupervisorAuditor;
module.exports.TaskDecomposer = TaskDecomposer;
module.exports.AgentMatcher = AgentMatcher;
module.exports.PlanGenerator = PlanGenerator;
