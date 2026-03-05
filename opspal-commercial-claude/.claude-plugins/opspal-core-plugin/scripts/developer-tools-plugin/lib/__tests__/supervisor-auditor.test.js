/**
 * supervisor-auditor.test.js
 *
 * Comprehensive test suite for Supervisor-Auditor system
 * Target: 80%+ coverage
 */

const assert = require('assert');
const SupervisorAuditor = require('../supervisor-auditor');
const { TaskDecomposer, AgentMatcher, PlanGenerator } = SupervisorAuditor;
const SupervisorExecutor = require('../supervisor-executor');
const { CircuitBreaker } = SupervisorExecutor;
const AuditReporter = require('../audit-reporter');

// Test utilities
function createMockInventory() {
  return {
    agent_count: 5,
    agents: [
      {
        name: 'test-agent-1',
        strengths: ['data operations', 'bulk processing'],
        weaknesses: ['metadata'],
        tools: ['Read', 'Write'],
        latency_hint: 'low',
        avg_duration_ms: 1000,
        success_rate: 0.95
      },
      {
        name: 'test-agent-2',
        strengths: ['quality analysis', 'reporting'],
        weaknesses: [],
        tools: ['Read', 'Grep'],
        latency_hint: 'med',
        avg_duration_ms: 3000,
        success_rate: 0.90
      },
      {
        name: 'test-agent-3',
        strengths: ['deployment', 'production'],
        weaknesses: [],
        tools: ['Bash'],
        latency_hint: 'high',
        avg_duration_ms: 8000,
        success_rate: 0.85
      },
      {
        name: 'test-agent-fallback',
        strengths: ['general operations'],
        weaknesses: [],
        tools: ['Read'],
        latency_hint: 'low',
        avg_duration_ms: 500,
        success_rate: 0.80
      },
      {
        name: 'test-agent-slow',
        strengths: ['quality analysis'],
        weaknesses: [],
        tools: ['Read'],
        latency_hint: 'high',
        avg_duration_ms: 10000,
        success_rate: 0.70
      }
    ]
  };
}

function createMockAgentInvoker(options = {}) {
  const { successRate = 1.0, delay = 10 } = options;

  return async (agent, inputs) => {
    await new Promise(resolve => setTimeout(resolve, delay));

    if (Math.random() > successRate) {
      throw new Error(`Mock failure for ${agent}`);
    }

    return {
      agent,
      inputs,
      result: `Success from ${agent}`,
      timestamp: new Date().toISOString()
    };
  };
}

// ═══════════════════════════════════════════════════════════════
// TASK DECOMPOSER TESTS
// ═══════════════════════════════════════════════════════════════

describe('TaskDecomposer', () => {
  const decomposer = new TaskDecomposer();

  test('should decompose comma-separated targets', () => {
    const task = 'Generate READMEs for plugin-a, plugin-b, plugin-c';
    const units = decomposer.decompose(task, 0.5);

    assert.strictEqual(units.length, 3, 'Should create 3 units');
    assert.strictEqual(units[0].target, 'plugin-a');
    assert.strictEqual(units[1].target, 'plugin-b');
    assert.strictEqual(units[2].target, 'plugin-c');
    assert.strictEqual(units[0].action, 'generate');
  });

  test('should decompose "all X" pattern', () => {
    const task = 'Analyze all 5 plugins';
    const units = decomposer.decompose(task, 0.6);

    assert.strictEqual(units.length, 5, 'Should create 5 units');
    units.forEach((unit, i) => {
      assert.strictEqual(unit.target, `plugins-${i + 1}`);
      assert.strictEqual(unit.action, 'analyze');
    });
  });

  test('should decompose sequential actions (AND/THEN)', () => {
    const task = 'Analyze quality and then generate reports';
    const units = decomposer.decompose(task, 0.7);

    assert.strictEqual(units.length, 2, 'Should create 2 units');
    assert.ok(units[0].description.toLowerCase().includes('analyze'));
    assert.ok(units[1].description.toLowerCase().includes('generate'));
  });

  test('should create single unit for simple task', () => {
    const task = 'Deploy metadata to production';
    const units = decomposer.decompose(task, 0.8);

    assert.strictEqual(units.length, 1, 'Should create 1 unit');
    assert.strictEqual(units[0].action, 'deploy');
  });

  test('should detect dependencies between units', () => {
    const units = [
      {
        id: 'U1',
        action: 'analyze',
        outputs: ['analysis_result'],
        inputs: [],
        side_effects: []
      },
      {
        id: 'U2',
        action: 'deploy',
        outputs: ['deploy_result'],
        inputs: ['analysis_result'],
        side_effects: []
      }
    ];

    const dependencies = decomposer.detectDependencies(units);

    assert.strictEqual(dependencies.length, 1, 'Should detect 1 dependency');
    assert.strictEqual(dependencies[0].from, 'U1');
    assert.strictEqual(dependencies[0].to, 'U2');
    assert.strictEqual(dependencies[0].reason, 'data_dependency');
  });

  test('should detect no dependencies for independent units', () => {
    const units = [
      {
        id: 'U1',
        action: 'generate',
        outputs: ['result1'],
        inputs: [],
        side_effects: ['plugin-a']
      },
      {
        id: 'U2',
        action: 'generate',
        outputs: ['result2'],
        inputs: [],
        side_effects: ['plugin-b']
      }
    ];

    const dependencies = decomposer.detectDependencies(units);

    assert.strictEqual(dependencies.length, 0, 'Should detect no dependencies');
  });

  test('should correctly identify parallel units', () => {
    const unit1 = {
      id: 'U1',
      inputs: ['input1'],
      outputs: ['output1'],
      side_effects: []
    };

    const unit2 = {
      id: 'U2',
      inputs: ['input2'],
      outputs: ['output2'],
      side_effects: []
    };

    const result = decomposer.canRunInParallel(unit1, unit2, []);

    assert.strictEqual(result.parallel, true);
    assert.strictEqual(result.reason, 'independent');
  });

  test('should detect shared side effects preventing parallelization', () => {
    const unit1 = {
      id: 'U1',
      inputs: [],
      outputs: ['output1'],
      side_effects: ['shared-resource']
    };

    const unit2 = {
      id: 'U2',
      inputs: [],
      outputs: ['output2'],
      side_effects: ['shared-resource']
    };

    const result = decomposer.canRunInParallel(unit1, unit2, []);

    assert.strictEqual(result.parallel, false);
    assert.strictEqual(result.reason, 'shared_side_effects');
  });
});

// ═══════════════════════════════════════════════════════════════
// AGENT MATCHER TESTS
// ═══════════════════════════════════════════════════════════════

describe('AgentMatcher', () => {
  const inventory = createMockInventory();
  const matcher = new AgentMatcher(inventory);

  test('should match agent by capability', () => {
    const unit = {
      id: 'U1',
      action: 'process',
      target: 'data',
      description: 'Process bulk data operations'
    };

    const match = matcher.findBestAgent(unit);

    assert.ok(match, 'Should find a match');
    assert.strictEqual(match.agent, 'test-agent-1', 'Should match data operations agent');
    assert.ok(match.confidence > 0.5, 'Should have reasonable confidence');
  });

  test('should match agent by action keyword', () => {
    const unit = {
      id: 'U1',
      action: 'analyze',
      target: 'quality',
      description: 'Analyze quality metrics'
    };

    const match = matcher.findBestAgent(unit);

    assert.ok(match, 'Should find a match');
    assert.strictEqual(match.agent, 'test-agent-2', 'Should match quality analysis agent');
  });

  test('should prefer fast agents for similar capability', () => {
    const unit = {
      id: 'U1',
      action: 'analyze',
      target: 'quality',
      description: 'Analyze quality'
    };

    const match = matcher.findBestAgent(unit);

    // test-agent-2 (med latency, 90% success) should beat test-agent-slow (high latency, 70% success)
    assert.notStrictEqual(match.agent, 'test-agent-slow', 'Should prefer faster agent');
  });

  test('should provide alternatives', () => {
    const unit = {
      id: 'U1',
      action: 'process',
      target: 'data',
      description: 'Process data'
    };

    const match = matcher.findBestAgent(unit);

    assert.ok(match.alternatives, 'Should provide alternatives');
    assert.ok(match.alternatives.length >= 2, 'Should have at least 2 alternatives');
  });

  test('should exclude specified agents', () => {
    const unit = {
      id: 'U1',
      action: 'process',
      target: 'data',
      description: 'Process bulk data operations'
    };

    const match = matcher.findBestAgent(unit, ['test-agent-1']);

    assert.notStrictEqual(match.agent, 'test-agent-1', 'Should exclude specified agent');
  });
});

// ═══════════════════════════════════════════════════════════════
// PLAN GENERATOR TESTS
// ═══════════════════════════════════════════════════════════════

describe('PlanGenerator', () => {
  const generator = new PlanGenerator();

  test('should create parallel group for independent units', () => {
    const units = [
      { id: 'U1', action: 'generate', outputs: ['r1'], inputs: [], side_effects: [] },
      { id: 'U2', action: 'generate', outputs: ['r2'], inputs: [], side_effects: [] },
      { id: 'U3', action: 'generate', outputs: ['r3'], inputs: [], side_effects: [] }
    ];

    const agentMatches = units.map((unit, i) => ({
      unitId: unit.id,
      agent: `agent-${i}`,
      confidence: 0.8,
      alternatives: []
    }));

    const plan = generator.generate(units, [], agentMatches);

    assert.strictEqual(plan.parallel_groups.length, 1, 'Should create 1 parallel group');
    assert.strictEqual(plan.parallel_groups[0].units.length, 3, 'Group should have 3 units');
    assert.strictEqual(plan.sequential_barriers.length, 0, 'Should have no barriers');
  });

  test('should create sequential groups with barriers for dependent units', () => {
    const units = [
      { id: 'U1', action: 'analyze', outputs: ['analysis'], inputs: [], side_effects: [] },
      { id: 'U2', action: 'deploy', outputs: ['result'], inputs: ['U1'], side_effects: [] }
    ];

    const dependencies = [
      { from: 'U1', to: 'U2', reason: 'data_dependency' }
    ];

    const agentMatches = units.map((unit, i) => ({
      unitId: unit.id,
      agent: `agent-${i}`,
      confidence: 0.8,
      alternatives: []
    }));

    const plan = generator.generate(units, dependencies, agentMatches);

    assert.strictEqual(plan.parallel_groups.length, 2, 'Should create 2 groups');
    assert.strictEqual(plan.sequential_barriers.length, 1, 'Should have 1 barrier');
    assert.deepStrictEqual(plan.sequential_barriers[0].after_groups, ['G1']);
  });

  test('should include fallbacks in plan', () => {
    const units = [
      { id: 'U1', action: 'process', outputs: ['r1'], inputs: [], side_effects: [] }
    ];

    const agentMatches = [{
      unitId: 'U1',
      agent: 'primary-agent',
      confidence: 0.9,
      alternatives: [
        { agent: 'fallback-1', score: 0.7 },
        { agent: 'fallback-2', score: 0.5 }
      ]
    }];

    const plan = generator.generate(units, [], agentMatches);

    assert.ok(plan.parallel_groups[0].units[0].fallbacks, 'Should include fallbacks');
    assert.strictEqual(plan.parallel_groups[0].units[0].fallbacks.length, 2, 'Should have 2 fallbacks');
  });
});

// ═══════════════════════════════════════════════════════════════
// SUPERVISOR AUDITOR INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════

describe('SupervisorAuditor Integration', () => {
  test('should generate complete plan from task', () => {
    // Mock inventory cache
    const originalGetInstance = require('../inventory-cache').getInstance;
    require('../inventory-cache').getInstance = () => ({
      get: () => createMockInventory()
    });

    const supervisor = new SupervisorAuditor();
    const plan = supervisor.plan({
      task: 'Generate READMEs for plugin-a, plugin-b, plugin-c',
      complexity: 0.6
    });

    assert.ok(plan.AUDIT, 'Should have AUDIT section');
    assert.ok(plan.PLAN, 'Should have PLAN section');
    assert.ok(plan.EXECUTION_POLICY, 'Should have EXECUTION_POLICY section');
    assert.ok(plan.CYCLE_AUDIT_TEMPLATE, 'Should have CYCLE_AUDIT_TEMPLATE section');

    assert.ok(plan.AUDIT.problem_decomposition.length > 0, 'Should decompose problem');
    assert.ok(plan.AUDIT.independence_check.length > 0, 'Should check independence');
    assert.ok(plan.AUDIT.subagent_match.length > 0, 'Should match subagents');

    // Restore
    require('../inventory-cache').getInstance = originalGetInstance;
  });

  test('should detect high parallelization for independent units', () => {
    const originalGetInstance = require('../inventory-cache').getInstance;
    require('../inventory-cache').getInstance = () => ({
      get: () => createMockInventory()
    });

    const supervisor = new SupervisorAuditor();
    const plan = supervisor.plan({
      task: 'Generate READMEs for plugin-a, plugin-b, plugin-c',
      complexity: 0.5
    });

    const parallelUnits = plan.AUDIT.independence_check.filter(c => c.can_run_in_parallel);
    const totalUnits = plan.AUDIT.independence_check.length;

    assert.ok(parallelUnits.length / totalUnits >= 0.6, 'Should have ≥60% parallelizable units');

    require('../inventory-cache').getInstance = originalGetInstance;
  });
});

// ═══════════════════════════════════════════════════════════════
// SUPERVISOR EXECUTOR TESTS
// ═══════════════════════════════════════════════════════════════

describe('SupervisorExecutor', () => {
  test('should execute parallel units concurrently', async () => {
    const plan = {
      PLAN: {
        parallel_groups: [
          {
            group_id: 'G1',
            units: [
              { unit_id: 'U1', agent_or_tool: 'agent-1', inputs: [], fallbacks: [] },
              { unit_id: 'U2', agent_or_tool: 'agent-2', inputs: [], fallbacks: [] },
              { unit_id: 'U3', agent_or_tool: 'agent-3', inputs: [], fallbacks: [] }
            ]
          }
        ]
      }
    };

    const executor = new SupervisorExecutor({ timeout: 5000 });
    const agentInvoker = createMockAgentInvoker({ delay: 100 });

    const startTime = Date.now();
    const results = await executor.execute(plan, agentInvoker);
    const duration = Date.now() - startTime;

    assert.ok(results.success, 'Execution should succeed');
    assert.ok(duration < 300, 'Parallel execution should be faster than 3×100ms');
    assert.strictEqual(results.groups[0].units.length, 3, 'Should execute all 3 units');
  });

  test('should use fallback agent on primary failure', async () => {
    const plan = {
      PLAN: {
        parallel_groups: [
          {
            group_id: 'G1',
            units: [
              {
                unit_id: 'U1',
                agent_or_tool: 'failing-agent',
                inputs: [],
                fallbacks: [
                  { fallback: 'fallback-agent', trigger: 'error' }
                ]
              }
            ]
          }
        ]
      }
    };

    const executor = new SupervisorExecutor({ timeout: 5000 });

    const agentInvoker = async (agent, inputs) => {
      if (agent === 'failing-agent') {
        throw new Error('Primary agent failed');
      }
      return { agent, result: 'success' };
    };

    const results = await executor.execute(plan, agentInvoker);

    assert.ok(results.success, 'Should succeed with fallback');
    assert.strictEqual(results.groups[0].units[0].agent_used, 'fallback-agent', 'Should use fallback');
    assert.ok(results.groups[0].units[0].attempts > 1, 'Should have multiple attempts');
  });

  test('should respect timeout', async () => {
    const plan = {
      PLAN: {
        parallel_groups: [
          {
            group_id: 'G1',
            units: [
              { unit_id: 'U1', agent_or_tool: 'slow-agent', inputs: [], fallbacks: [] }
            ]
          }
        ]
      }
    };

    const executor = new SupervisorExecutor({ timeout: 50, retries: 0 });

    let timeoutId;
    const agentInvoker = async () => {
      return new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve({ result: 'success' }), 200);
      });
    };

    const results = await executor.execute(plan, agentInvoker);
    clearTimeout(timeoutId); // Clean up pending timer

    assert.strictEqual(results.success, false, 'Should fail due to timeout');
    assert.ok(results.groups[0].units[0].error.includes('Timeout'), 'Should have timeout error');
  }, 10000);

  test('should trigger circuit breaker after consecutive failures', async () => {
    const plan = {
      PLAN: {
        parallel_groups: [
          { group_id: 'G1', units: [{ unit_id: 'U1', agent_or_tool: 'a1', inputs: [], fallbacks: [] }] },
          { group_id: 'G2', units: [{ unit_id: 'U2', agent_or_tool: 'a2', inputs: [], fallbacks: [] }] },
          { group_id: 'G3', units: [{ unit_id: 'U3', agent_or_tool: 'a3', inputs: [], fallbacks: [] }] },
          { group_id: 'G4', units: [{ unit_id: 'U4', agent_or_tool: 'a4', inputs: [], fallbacks: [] }] }
        ]
      }
    };

    const executor = new SupervisorExecutor({ timeout: 5000, retries: 0 });

    const agentInvoker = async () => {
      throw new Error('Consistent failure');
    };

    const results = await executor.execute(plan, agentInvoker);

    assert.strictEqual(results.circuit_breaker_triggered, true, 'Circuit breaker should trigger');
    assert.ok(results.groups.length < 4, 'Should stop before executing all groups');
  });
});

// ═══════════════════════════════════════════════════════════════
// CIRCUIT BREAKER TESTS
// ═══════════════════════════════════════════════════════════════

describe('CircuitBreaker', () => {
  test('should remain closed on success', () => {
    const breaker = new CircuitBreaker({ maxFailures: 3 });

    breaker.recordSuccess();
    breaker.recordSuccess();

    assert.strictEqual(breaker.isOpen(), false, 'Should remain closed');
    assert.strictEqual(breaker.getStatus().consecutiveFailures, 0);
  });

  test('should open after max failures', () => {
    const breaker = new CircuitBreaker({ maxFailures: 3 });

    breaker.recordFailure();
    breaker.recordFailure();
    assert.strictEqual(breaker.isOpen(), false, 'Should still be closed at 2 failures');

    breaker.recordFailure();
    assert.strictEqual(breaker.isOpen(), true, 'Should open at 3 failures');
  });

  test('should reset on success', () => {
    const breaker = new CircuitBreaker({ maxFailures: 3 });

    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();

    assert.strictEqual(breaker.getStatus().consecutiveFailures, 0, 'Should reset count');
    assert.strictEqual(breaker.isOpen(), false, 'Should remain closed');
  });
});

// ═══════════════════════════════════════════════════════════════
// AUDIT REPORTER TESTS
// ═══════════════════════════════════════════════════════════════

describe('AuditReporter', () => {
  const reporter = new AuditReporter();

  test('should calculate utilization scores correctly', () => {
    const plan = {
      PLAN: {
        parallel_groups: [
          {
            group_id: 'G1',
            runs_in_parallel: true,
            units: [
              { unit_id: 'U1', agent_or_tool: 'agent-1' },
              { unit_id: 'U2', agent_or_tool: 'agent-2' },
              { unit_id: 'U3', agent_or_tool: 'agent-3' }
            ]
          }
        ]
      },
      AUDIT: { independence_check: [] }
    };

    const results = {
      plan_id: '123',
      total_duration_ms: 300,
      success: true,
      groups: [
        {
          group_id: 'G1',
          units: [
            { unit_id: 'U1', success: true, agent_used: 'agent-1', duration_ms: 100 },
            { unit_id: 'U2', success: true, agent_used: 'agent-2', duration_ms: 120 },
            { unit_id: 'U3', success: true, agent_used: 'agent-3', duration_ms: 110 }
          ]
        }
      ]
    };

    const audit = reporter.generateReport(plan, results);

    assert.strictEqual(audit.utilization_scores.subagent_utilization_percent, 100, 'Should be 100% sub-agent usage');
    assert.strictEqual(audit.utilization_scores.parallelization_ratio_percent, 100, 'Should be 100% parallel');
    assert.strictEqual(audit.utilization_scores.meets_targets.subagent_utilization, true);
    assert.strictEqual(audit.utilization_scores.meets_targets.parallelization_ratio, true);
  });

  test('should detect gaps for low parallelization', () => {
    const plan = {
      PLAN: {
        parallel_groups: [
          { group_id: 'G1', runs_in_parallel: false, units: [{ unit_id: 'U1', agent_or_tool: 'a1' }] },
          { group_id: 'G2', runs_in_parallel: false, units: [{ unit_id: 'U2', agent_or_tool: 'a2' }] },
          { group_id: 'G3', runs_in_parallel: false, units: [{ unit_id: 'U3', agent_or_tool: 'a3' }] }
        ]
      },
      AUDIT: {
        independence_check: [
          { unit: 'U1', can_run_in_parallel: true },
          { unit: 'U2', can_run_in_parallel: true },
          { unit: 'U3', can_run_in_parallel: true }
        ]
      }
    };

    const results = {
      plan_id: '123',
      total_duration_ms: 900,
      success: true,
      groups: [
        { group_id: 'G1', units: [{ unit_id: 'U1', success: true, agent_used: 'a1', duration_ms: 300 }] },
        { group_id: 'G2', units: [{ unit_id: 'U2', success: true, agent_used: 'a2', duration_ms: 300 }] },
        { group_id: 'G3', units: [{ unit_id: 'U3', success: true, agent_used: 'a3', duration_ms: 300 }] }
      ]
    };

    const audit = reporter.generateReport(plan, results);

    const lowParallelGap = audit.gaps.find(g => g.type === 'low_parallelization');
    assert.ok(lowParallelGap, 'Should detect low parallelization gap');
    assert.strictEqual(lowParallelGap.severity, 'high');
  });

  test('should generate recommendations for failures', () => {
    const plan = {
      PLAN: {
        parallel_groups: [
          { group_id: 'G1', units: [{ unit_id: 'U1', agent_or_tool: 'a1' }] }
        ]
      },
      AUDIT: { independence_check: [] }
    };

    const results = {
      plan_id: '123',
      total_duration_ms: 100,
      success: false,
      groups: [
        { group_id: 'G1', units: [{ unit_id: 'U1', success: false, agent_used: 'a1', duration_ms: 100 }] }
      ]
    };

    const audit = reporter.generateReport(plan, results);

    const reliabilityRec = audit.recommendations.find(r => r.category === 'reliability');
    assert.ok(reliabilityRec, 'Should recommend reliability improvements');
    assert.strictEqual(reliabilityRec.priority, 'critical');
  });

  test('should format report as readable text', () => {
    const plan = {
      PLAN: {
        parallel_groups: [
          { group_id: 'G1', units: [{ unit_id: 'U1', agent_or_tool: 'a1' }] }
        ]
      },
      AUDIT: { independence_check: [] }
    };

    const results = {
      plan_id: '123',
      total_duration_ms: 100,
      success: true,
      groups: [
        { group_id: 'G1', units: [{ unit_id: 'U1', success: true, agent_used: 'a1', duration_ms: 100, attempts: 1 }] }
      ]
    };

    const audit = reporter.generateReport(plan, results);
    const formatted = reporter.formatReport(audit);

    assert.ok(formatted.includes('AUDIT REPORT'), 'Should have title');
    assert.ok(formatted.includes('Duration:'), 'Should include duration');
    assert.ok(formatted.includes('Utilization Scores:'), 'Should include scores');
  });
});

// Tests use Jest's built-in describe/test/expect
// Custom test runner removed for Jest compatibility
