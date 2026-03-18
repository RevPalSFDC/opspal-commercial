/**
 * Task Graph Unit Tests
 * Tests DAG operations, topological sorting, and validation
 */

const { TaskGraph } = require('../../scripts/lib/task-graph');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

describe('TaskGraph', () => {
  let taskGraph;

  beforeEach(() => {
    taskGraph = new TaskGraph({ name: 'test-graph' });
  });

  describe('addTask', () => {
    it('should add a valid task to the graph', () => {
      const task = {
        id: 'T-01',
        title: 'Test Task',
        domain: 'salesforce-apex',
        goal: 'Test goal',
        inputs: ['input.txt'],
        outputs: ['output.txt'],
        acceptance_criteria: ['Criteria 1'],
        dependencies: [],
        concurrency_group: 'apex',
        risk_level: 'low'
      };

      taskGraph.addTask(task);
      expect(taskGraph.tasks.has('T-01')).toBe(true);
      expect(taskGraph.getTask('T-01')).toEqual(expect.objectContaining({
        id: 'T-01',
        title: 'Test Task',
        domain: 'salesforce-apex'
      }));
    });

    it('should reject task with invalid ID format', () => {
      const task = {
        id: 'INVALID',
        title: 'Test Task',
        domain: 'salesforce-apex',
        goal: 'Test goal',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Criteria 1']
      };

      expect(() => taskGraph.addTask(task)).toThrow(/Invalid task id format/i);
    });

    it('should reject duplicate task IDs', () => {
      const task = {
        id: 'T-01',
        title: 'Test Task',
        domain: 'salesforce-apex',
        goal: 'Test goal',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Criteria 1']
      };

      taskGraph.addTask(task);
      expect(() => taskGraph.addTask(task)).toThrow(/already exists/);
    });

    it('should reject task without id', () => {
      const task = {
        title: 'Test Task',
        domain: 'salesforce-apex'
      };

      expect(() => taskGraph.addTask(task)).toThrow(/must have an id/);
    });

    it('should set defaults for optional fields', () => {
      const task = {
        id: 'T-01',
        title: 'Test Task',
        domain: 'salesforce-apex',
        goal: 'Test goal',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Criteria 1']
        // Missing: dependencies, concurrency_group, risk_level
      };

      taskGraph.addTask(task);
      const added = taskGraph.getTask('T-01');

      expect(added.dependencies).toEqual([]);
      expect(added.concurrency_group).toBe('none');
      expect(added.risk_level).toBe('medium'); // default
      expect(added.status).toBe('pending');
    });
  });

  describe('addDependency', () => {
    beforeEach(() => {
      taskGraph.addTask({
        id: 'T-01',
        title: 'Task 1',
        domain: 'salesforce-apex',
        goal: 'Goal 1',
        inputs: [],
        outputs: ['file.txt'],
        acceptance_criteria: ['Done']
      });
      taskGraph.addTask({
        id: 'T-02',
        title: 'Task 2',
        domain: 'salesforce-apex',
        goal: 'Goal 2',
        inputs: ['file.txt'],
        outputs: [],
        acceptance_criteria: ['Done']
      });
    });

    it('should add valid dependency', () => {
      // addDependency(fromId, toId) means toId depends on fromId
      taskGraph.addDependency('T-01', 'T-02');
      expect(taskGraph.getDependencies('T-02')).toContain('T-01');
    });

    it('should update task dependencies array', () => {
      taskGraph.addDependency('T-01', 'T-02');
      const task = taskGraph.getTask('T-02');
      expect(task.dependencies).toContain('T-01');
    });

    it('should support dependency chaining', () => {
      taskGraph.addTask({
        id: 'T-03',
        title: 'Task 3',
        domain: 'salesforce-apex',
        goal: 'Goal 3',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done']
      });

      taskGraph.addDependency('T-01', 'T-02');
      taskGraph.addDependency('T-02', 'T-03');

      expect(taskGraph.getDependencies('T-02')).toContain('T-01');
      expect(taskGraph.getDependencies('T-03')).toContain('T-02');
    });
  });

  describe('validateAcyclic', () => {
    beforeEach(() => {
      ['T-01', 'T-02', 'T-03'].forEach((id, index) => {
        taskGraph.addTask({
          id,
          title: `Task ${index + 1}`,
          domain: 'salesforce-apex',
          goal: `Goal ${index + 1}`,
          inputs: [],
          outputs: [],
          acceptance_criteria: ['Done']
        });
      });
    });

    it('should pass for valid acyclic graph', () => {
      taskGraph.addDependency('T-01', 'T-02');
      taskGraph.addDependency('T-02', 'T-03');

      const result = taskGraph.validateAcyclic();
      expect(result.valid).toBe(true);
    });

    it('should detect direct circular dependency', () => {
      // Create circular: T-01 -> T-02 -> T-01
      taskGraph.addDependency('T-01', 'T-02');
      taskGraph.addDependency('T-02', 'T-01');

      const result = taskGraph.validateAcyclic();
      expect(result.valid).toBe(false);
      expect(result.cycle).toBeDefined();
    });

    it('should detect indirect circular dependency', () => {
      // Create circular: T-01 -> T-02 -> T-03 -> T-01
      taskGraph.addDependency('T-01', 'T-02');
      taskGraph.addDependency('T-02', 'T-03');
      taskGraph.addDependency('T-03', 'T-01');

      const result = taskGraph.validateAcyclic();
      expect(result.valid).toBe(false);
    });

    it('should pass for graph with no dependencies', () => {
      const result = taskGraph.validateAcyclic();
      expect(result.valid).toBe(true);
    });
  });

  describe('getTopologicalOrder', () => {
    beforeEach(() => {
      // Create a more complex graph
      ['T-01', 'T-02', 'T-03', 'T-04', 'T-05'].forEach((id, index) => {
        taskGraph.addTask({
          id,
          title: `Task ${index + 1}`,
          domain: 'salesforce-apex',
          goal: `Goal ${index + 1}`,
          inputs: [],
          outputs: [],
          acceptance_criteria: ['Done']
        });
      });
    });

    it('should return correct order for linear chain', () => {
      taskGraph.addDependency('T-01', 'T-02');
      taskGraph.addDependency('T-02', 'T-03');
      taskGraph.addDependency('T-03', 'T-04');
      taskGraph.addDependency('T-04', 'T-05');

      const order = taskGraph.getTopologicalOrder();

      expect(order.indexOf('T-01')).toBeLessThan(order.indexOf('T-02'));
      expect(order.indexOf('T-02')).toBeLessThan(order.indexOf('T-03'));
      expect(order.indexOf('T-03')).toBeLessThan(order.indexOf('T-04'));
      expect(order.indexOf('T-04')).toBeLessThan(order.indexOf('T-05'));
    });

    it('should handle diamond dependency pattern', () => {
      // T-01 -> T-02 -> T-04
      // T-01 -> T-03 -> T-04
      taskGraph.addDependency('T-01', 'T-02');
      taskGraph.addDependency('T-01', 'T-03');
      taskGraph.addDependency('T-02', 'T-04');
      taskGraph.addDependency('T-03', 'T-04');

      const order = taskGraph.getTopologicalOrder();

      expect(order.indexOf('T-01')).toBeLessThan(order.indexOf('T-02'));
      expect(order.indexOf('T-01')).toBeLessThan(order.indexOf('T-03'));
      expect(order.indexOf('T-02')).toBeLessThan(order.indexOf('T-04'));
      expect(order.indexOf('T-03')).toBeLessThan(order.indexOf('T-04'));
    });

    it('should return any valid order for independent tasks', () => {
      // No dependencies - any order is valid
      const order = taskGraph.getTopologicalOrder();
      expect(order).toHaveLength(5);
      expect(new Set(order)).toEqual(new Set(['T-01', 'T-02', 'T-03', 'T-04', 'T-05']));
    });

    it('should throw for cyclic graph', () => {
      taskGraph.addDependency('T-01', 'T-02');
      taskGraph.addDependency('T-02', 'T-01');

      expect(() => taskGraph.getTopologicalOrder()).toThrow(/cycle/i);
    });
  });

  describe('getReadyTasks', () => {
    beforeEach(() => {
      taskGraph.addTask({
        id: 'T-01',
        title: 'Discovery 1',
        domain: 'salesforce-flow',
        goal: 'Discover flows',
        inputs: [],
        outputs: ['flow_inventory.json'],
        acceptance_criteria: ['Done'],
        concurrency_group: 'none'
      });
      taskGraph.addTask({
        id: 'T-02',
        title: 'Discovery 2',
        domain: 'salesforce-apex',
        goal: 'Discover triggers',
        inputs: [],
        outputs: ['trigger_inventory.json'],
        acceptance_criteria: ['Done'],
        concurrency_group: 'none'
      });
      taskGraph.addTask({
        id: 'T-03',
        title: 'Implementation',
        domain: 'salesforce-flow',
        goal: 'Implement changes',
        inputs: ['flow_inventory.json', 'trigger_inventory.json'],
        outputs: ['updated_flow.xml'],
        acceptance_criteria: ['Done'],
        dependencies: ['T-01', 'T-02'],
        concurrency_group: 'flow-xml'
      });
    });

    it('should return tasks with no dependencies initially', () => {
      const ready = taskGraph.getReadyTasks(new Set());
      const readyIds = ready.map(t => t.id);

      expect(readyIds).toContain('T-01');
      expect(readyIds).toContain('T-02');
      expect(readyIds).not.toContain('T-03');
    });

    it('should return dependent tasks after dependencies complete', () => {
      const ready = taskGraph.getReadyTasks(new Set(['T-01', 'T-02']));
      const readyIds = ready.map(t => t.id);

      expect(readyIds).toContain('T-03');
    });

    it('should not return already completed tasks', () => {
      // Mark T-01 as completed via status
      taskGraph.setTaskStatus('T-01', 'completed');

      const ready = taskGraph.getReadyTasks(new Set());
      const readyIds = ready.map(t => t.id);

      expect(readyIds).not.toContain('T-01');
    });
  });

  describe('getParallelizableWaves', () => {
    beforeEach(() => {
      ['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06'].forEach((id, index) => {
        taskGraph.addTask({
          id,
          title: `Task ${index + 1}`,
          domain: 'salesforce-apex',
          goal: `Goal ${index + 1}`,
          inputs: [],
          outputs: [],
          acceptance_criteria: ['Done'],
          concurrency_group: 'none'
        });
      });
    });

    it('should group independent tasks into waves', () => {
      // Wave 1: T-01, T-02, T-03 (no deps)
      // Wave 2: T-04, T-05 (depend on wave 1)
      // Wave 3: T-06 (depends on wave 2)
      taskGraph.addDependency('T-01', 'T-04');
      taskGraph.addDependency('T-02', 'T-04');
      taskGraph.addDependency('T-03', 'T-05');
      taskGraph.addDependency('T-04', 'T-06');
      taskGraph.addDependency('T-05', 'T-06');

      const waves = taskGraph.getParallelizableWaves();

      expect(waves).toHaveLength(3);
      expect(waves[0]).toEqual(expect.arrayContaining(['T-01', 'T-02', 'T-03']));
      expect(waves[1]).toEqual(expect.arrayContaining(['T-04', 'T-05']));
      expect(waves[2]).toEqual(['T-06']);
    });

    it('should handle fully sequential graph', () => {
      taskGraph.addDependency('T-01', 'T-02');
      taskGraph.addDependency('T-02', 'T-03');
      taskGraph.addDependency('T-03', 'T-04');
      taskGraph.addDependency('T-04', 'T-05');
      taskGraph.addDependency('T-05', 'T-06');

      const waves = taskGraph.getParallelizableWaves();

      expect(waves).toHaveLength(6);
      waves.forEach(wave => {
        expect(wave).toHaveLength(1);
      });
    });

    it('should handle fully parallel graph', () => {
      const waves = taskGraph.getParallelizableWaves();

      expect(waves).toHaveLength(1);
      expect(waves[0]).toHaveLength(6);
    });
  });

  describe('applyConcurrencyConstraints', () => {
    it('should filter wave by concurrency groups', () => {
      taskGraph.addTask({
        id: 'T-01',
        title: 'Flow A',
        domain: 'salesforce-flow',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        concurrency_group: 'flow-xml'
      });
      taskGraph.addTask({
        id: 'T-02',
        title: 'Flow B',
        domain: 'salesforce-flow',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        concurrency_group: 'flow-xml'
      });
      taskGraph.addTask({
        id: 'T-03',
        title: 'Apex A',
        domain: 'salesforce-apex',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        concurrency_group: 'apex'
      });

      // Both T-01 and T-02 are flow-xml, only one should be allowed
      const filtered = taskGraph.applyConcurrencyConstraints(['T-01', 'T-02', 'T-03']);

      // Should have at most one flow-xml task
      const flowXmlCount = filtered.filter(id => {
        const task = taskGraph.getTask(id);
        return task.concurrency_group === 'flow-xml';
      }).length;

      expect(flowXmlCount).toBeLessThanOrEqual(1);
      // Should include apex task (different group)
      expect(filtered).toContain('T-03');
    });
  });

  describe('toMermaid', () => {
    beforeEach(() => {
      taskGraph.addTask({
        id: 'T-01',
        title: 'Discovery',
        domain: 'salesforce-flow',
        goal: 'Discover',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        risk_level: 'low'
      });
      taskGraph.addTask({
        id: 'T-02',
        title: 'Implementation',
        domain: 'salesforce-apex',
        goal: 'Implement',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        risk_level: 'medium'
      });
      taskGraph.addTask({
        id: 'T-03',
        title: 'Deployment',
        domain: 'salesforce-metadata',
        goal: 'Deploy',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        risk_level: 'high'
      });
      taskGraph.addDependency('T-01', 'T-02');
      taskGraph.addDependency('T-02', 'T-03');
    });

    it('should generate valid mermaid graph', () => {
      const mermaid = taskGraph.toMermaid();

      expect(mermaid).toContain('graph TD');
      expect(mermaid).toContain('T-01');
      expect(mermaid).toContain('T-02');
      expect(mermaid).toContain('T-03');
      expect(mermaid).toContain('-->');
    });

    it('should include task titles', () => {
      const mermaid = taskGraph.toMermaid();

      expect(mermaid).toContain('Discovery');
      expect(mermaid).toContain('Implementation');
      expect(mermaid).toContain('Deployment');
    });

    it('should include style classes for risk levels', () => {
      const mermaid = taskGraph.toMermaid();

      expect(mermaid).toContain('classDef low');
      expect(mermaid).toContain('classDef medium');
      expect(mermaid).toContain('classDef high');
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      taskGraph.addTask({
        id: 'T-01',
        title: 'Low Risk',
        domain: 'salesforce-flow',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        risk_level: 'low'
      });
      taskGraph.addTask({
        id: 'T-02',
        title: 'Medium Risk',
        domain: 'salesforce-apex',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        risk_level: 'medium'
      });
      taskGraph.addTask({
        id: 'T-03',
        title: 'High Risk',
        domain: 'salesforce-flow',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        risk_level: 'high'
      });
      taskGraph.addDependency('T-01', 'T-02');
      taskGraph.addDependency('T-02', 'T-03');
    });

    it('should calculate correct task counts', () => {
      const stats = taskGraph.getStats();

      expect(stats.task_count).toBe(3);
      expect(stats.edge_count).toBe(2);
    });

    it('should group by domain', () => {
      const stats = taskGraph.getStats();

      expect(stats.by_domain['salesforce-flow']).toBe(2);
      expect(stats.by_domain['salesforce-apex']).toBe(1);
    });

    it('should group by risk level', () => {
      const stats = taskGraph.getStats();

      expect(stats.by_risk_level.low).toBe(1);
      expect(stats.by_risk_level.medium).toBe(1);
      expect(stats.by_risk_level.high).toBe(1);
    });

    it('should calculate wave count', () => {
      const stats = taskGraph.getStats();

      expect(stats.wave_count).toBe(3); // Sequential graph
    });
  });

  describe('serialization', () => {
    beforeEach(() => {
      taskGraph.addTask({
        id: 'T-01',
        title: 'Task 1',
        domain: 'salesforce-flow',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done']
      });
      taskGraph.addTask({
        id: 'T-02',
        title: 'Task 2',
        domain: 'salesforce-apex',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        dependencies: ['T-01']
      });
    });

    it('should serialize to JSON', () => {
      const json = taskGraph.toJSON();

      expect(json.metadata).toBeDefined();
      expect(json.tasks).toHaveLength(2);
      expect(json.stats).toBeDefined();
    });

    it('should deserialize from JSON', () => {
      const json = taskGraph.toJSON();
      const restored = TaskGraph.fromJSON(json);

      expect(restored.tasks.size).toBe(2);
      expect(restored.getTask('T-01')).toBeDefined();
      expect(restored.getTask('T-02')).toBeDefined();
    });
  });

  describe('fixture loading', () => {
    const fixturesDir = path.join(__dirname, 'fixtures');

    it('should load and parse flow task fixture', () => {
      const fixturePath = path.join(fixturesDir, 'sample-flow-task.yaml');
      if (!fs.existsSync(fixturePath)) {
        console.log('Fixture not found, skipping');
        return;
      }

      // Use loadAll for multi-document YAML
      const docs = yaml.loadAll(fs.readFileSync(fixturePath, 'utf8'));
      const fixture = docs.find(d => d && d.simple_flow_task);

      if (!fixture) {
        console.log('simple_flow_task not found in fixture');
        return;
      }

      const simpleTask = fixture.simple_flow_task;
      expect(simpleTask.id).toBe('T-01');
      expect(simpleTask.domain).toBe('salesforce-flow');
      expect(simpleTask.risk_level).toBe('medium');
    });

    it('should validate fixture tasks can be added to graph', () => {
      const fixturePath = path.join(fixturesDir, 'sample-apex-task.yaml');
      if (!fs.existsSync(fixturePath)) {
        console.log('Fixture not found, skipping');
        return;
      }

      // Use loadAll for multi-document YAML
      const docs = yaml.loadAll(fs.readFileSync(fixturePath, 'utf8'));

      // Collect all tasks from all documents
      const tasks = [];
      docs.forEach(doc => {
        if (doc) {
          if (doc.simple_trigger_task) tasks.push(doc.simple_trigger_task);
          if (doc.apex_test_task) tasks.push(doc.apex_test_task);
          if (doc.apex_batch_task) tasks.push(doc.apex_batch_task);
          if (doc.apex_service_task) tasks.push(doc.apex_service_task);
        }
      });

      tasks.forEach(task => {
        expect(() => taskGraph.addTask(task)).not.toThrow();
      });
    });
  });
});
