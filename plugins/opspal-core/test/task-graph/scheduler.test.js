/**
 * Task Scheduler Unit Tests
 * Tests concurrency management, scheduling, and lock handling
 */

const { TaskScheduler, TaskGraph } = require('../../scripts/lib/task-graph');

describe('TaskScheduler', () => {
  let scheduler;
  let taskGraph;

  /**
   * Helper to create a standard test graph
   */
  function createTestGraph() {
    const graph = new TaskGraph({ name: 'test-graph' });

    // Set up a standard test graph
    graph.addTask({
      id: 'T-01',
      title: 'Discovery 1',
      domain: 'salesforce-flow',
      goal: 'Discover flows',
      inputs: [],
      outputs: ['flow_inventory.json'],
      acceptance_criteria: ['Done'],
      concurrency_group: 'none',
      risk_level: 'low'
    });
    graph.addTask({
      id: 'T-02',
      title: 'Discovery 2',
      domain: 'salesforce-apex',
      goal: 'Discover apex',
      inputs: [],
      outputs: ['apex_inventory.json'],
      acceptance_criteria: ['Done'],
      concurrency_group: 'none',
      risk_level: 'low'
    });
    graph.addTask({
      id: 'T-03',
      title: 'Discovery 3',
      domain: 'salesforce-data',
      goal: 'Discover data',
      inputs: [],
      outputs: ['data_inventory.json'],
      acceptance_criteria: ['Done'],
      concurrency_group: 'none',
      risk_level: 'low'
    });
    graph.addTask({
      id: 'T-04',
      title: 'Implementation',
      domain: 'salesforce-flow',
      goal: 'Implement changes',
      inputs: ['flow_inventory.json', 'apex_inventory.json'],
      outputs: ['updated_flow.xml'],
      acceptance_criteria: ['Done'],
      dependencies: ['T-01', 'T-02'],
      concurrency_group: 'flow-xml',
      risk_level: 'medium'
    });
    graph.addTask({
      id: 'T-05',
      title: 'Testing',
      domain: 'salesforce-apex',
      goal: 'Run tests',
      inputs: ['updated_flow.xml'],
      outputs: ['test_results.json'],
      acceptance_criteria: ['Done'],
      dependencies: ['T-04'],
      concurrency_group: 'apex',
      risk_level: 'low'
    });

    return graph;
  }

  beforeEach(() => {
    taskGraph = createTestGraph();
    scheduler = new TaskScheduler(taskGraph, { maxConcurrency: 3 });
  });

  describe('constructor', () => {
    it('should initialize with TaskGraph instance', () => {
      const graph = new TaskGraph({ name: 'simple' });
      graph.addTask({
        id: 'T-01',
        title: 'Simple task',
        domain: 'salesforce-flow',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done']
      });

      const sched = new TaskScheduler(graph);
      expect(sched).toBeDefined();
      expect(sched.graph).toBe(graph);
    });

    it('should throw error without TaskGraph instance', () => {
      expect(() => new TaskScheduler()).toThrow('TaskScheduler requires a TaskGraph instance');
      expect(() => new TaskScheduler({})).toThrow('TaskScheduler requires a TaskGraph instance');
    });

    it('should accept custom settings', () => {
      const graph = new TaskGraph({ name: 'test' });
      graph.addTask({
        id: 'T-01',
        title: 'Test',
        domain: 'salesforce-flow',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done']
      });

      const customScheduler = new TaskScheduler(graph, {
        maxConcurrency: 2,
        timeoutMs: 30000
      });
      expect(customScheduler.options.maxConcurrency).toBe(2);
      expect(customScheduler.options.timeoutMs).toBe(30000);
    });
  });

  describe('getReadyToRun', () => {
    it('should return all tasks with no dependencies initially', () => {
      const ready = scheduler.getReadyToRun();

      // T-01, T-02, T-03 have no dependencies and should be ready
      expect(ready.length).toBe(3);
      const readyIds = ready.map(t => t.id);
      expect(readyIds).toContain('T-01');
      expect(readyIds).toContain('T-02');
      expect(readyIds).toContain('T-03');
    });

    it('should not return tasks with unmet dependencies', () => {
      const ready = scheduler.getReadyToRun();
      const readyIds = ready.map(t => t.id);

      // T-04 depends on T-01 and T-02, T-05 depends on T-04
      expect(readyIds).not.toContain('T-04');
      expect(readyIds).not.toContain('T-05');
    });
  });

  describe('acquireLock / releaseLock', () => {
    it('should acquire lock for concurrency group', () => {
      scheduler.acquireLock('flow-xml', 'T-04');
      expect(scheduler.groupLocks.has('flow-xml')).toBe(true);
      expect(scheduler.groupLocks.get('flow-xml')).toBe('T-04');
    });

    it('should throw on second lock attempt for same group', () => {
      scheduler.acquireLock('flow-xml', 'T-04');
      expect(() => scheduler.acquireLock('flow-xml', 'T-06'))
        .toThrow('Lock already held for group flow-xml');
    });

    it('should release lock properly', () => {
      scheduler.acquireLock('flow-xml', 'T-04');
      scheduler.releaseLock('flow-xml', 'T-04');
      expect(scheduler.groupLocks.has('flow-xml')).toBe(false);
    });

    it('should allow lock after release', () => {
      scheduler.acquireLock('flow-xml', 'T-04');
      scheduler.releaseLock('flow-xml', 'T-04');
      scheduler.acquireLock('flow-xml', 'T-06');
      expect(scheduler.groupLocks.get('flow-xml')).toBe('T-06');
    });

    it('should handle "none" concurrency group without locking', () => {
      // "none" group should not actually create a lock
      scheduler.acquireLock('none', 'T-01');
      scheduler.acquireLock('none', 'T-02');
      scheduler.acquireLock('none', 'T-03');

      // None of these should have created locks
      expect(scheduler.groupLocks.has('none')).toBe(false);
    });
  });

  describe('canAcquireLock', () => {
    it('should return true for unlocked groups', () => {
      expect(scheduler.canAcquireLock('flow-xml')).toBe(true);
      expect(scheduler.canAcquireLock('apex')).toBe(true);
    });

    it('should return false for locked groups', () => {
      scheduler.acquireLock('flow-xml', 'T-04');
      expect(scheduler.canAcquireLock('flow-xml')).toBe(false);
    });

    it('should always return true for "none" group', () => {
      expect(scheduler.canAcquireLock('none')).toBe(true);
      // Even after "acquiring" - none is special
      scheduler.acquireLock('none', 'T-01');
      expect(scheduler.canAcquireLock('none')).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return current execution state', () => {
      const state = scheduler.getState();

      expect(state.pending).toHaveLength(5);
      expect(state.running).toHaveLength(0);
      expect(state.completed).toHaveLength(0);
      expect(state.failed).toHaveLength(0);
      expect(state.blocked).toHaveLength(0);
    });
  });

  describe('getRunningTasks', () => {
    it('should return empty array initially', () => {
      expect(scheduler.getRunningTasks()).toHaveLength(0);
    });
  });

  describe('getSummary', () => {
    it('should return execution summary', () => {
      const summary = scheduler.getSummary();

      expect(summary.stats).toBeDefined();
      expect(summary.stats.tasks_total).toBe(5);
      expect(summary.state).toBeDefined();
      expect(summary.execution_log).toBeDefined();
    });
  });

  describe('execute (integration)', () => {
    it('should execute complete graph with simple executor', async () => {
      const executionOrder = [];

      const executor = async (task) => {
        executionOrder.push(task.id);
        await new Promise(resolve => setTimeout(resolve, 10));
        return { task_id: task.id, status: 'success', summary: 'Done' };
      };

      const summary = await scheduler.execute(executor);

      // Verify all tasks completed
      expect(summary.stats.tasks_completed).toBe(5);
      expect(summary.stats.tasks_failed).toBe(0);

      // Verify dependency order
      expect(executionOrder.indexOf('T-01')).toBeLessThan(executionOrder.indexOf('T-04'));
      expect(executionOrder.indexOf('T-02')).toBeLessThan(executionOrder.indexOf('T-04'));
      expect(executionOrder.indexOf('T-04')).toBeLessThan(executionOrder.indexOf('T-05'));
    }, 10000);

    it('should handle task failures', async () => {
      // Use scheduler with no retries for faster failure handling
      const noRetryScheduler = new TaskScheduler(taskGraph, { maxConcurrency: 3, retryLimit: 0 });

      const executor = async (task) => {
        if (task.id === 'T-02') {
          throw new Error('Simulated failure');
        }
        return { task_id: task.id, status: 'success', summary: 'Done' };
      };

      // Note: Default behavior continues on failure and marks dependent tasks as blocked
      const summary = await noRetryScheduler.execute(executor);

      expect(summary.stats.tasks_failed).toBeGreaterThan(0);
      expect(summary.state.failed).toContain('T-02');
    }, 10000);

    it('should block dependent tasks when dependency fails', async () => {
      // Use scheduler with no retries for faster failure handling
      const noRetryScheduler = new TaskScheduler(taskGraph, { maxConcurrency: 3, retryLimit: 0 });

      const executor = async (task) => {
        if (task.id === 'T-01') {
          throw new Error('T-01 failed');
        }
        return { task_id: task.id, status: 'success', summary: 'Done' };
      };

      const summary = await noRetryScheduler.execute(executor);

      // T-01 failed, so T-04 and T-05 should be blocked
      expect(summary.state.failed).toContain('T-01');
      expect(summary.stats.tasks_blocked).toBeGreaterThanOrEqual(1);
    }, 10000);
  });

  describe('dryRun (static method)', () => {
    it('should simulate execution without real work', async () => {
      const summary = await TaskScheduler.dryRun(taskGraph);

      expect(summary.stats.tasks_completed).toBe(5);
      expect(summary.stats.tasks_failed).toBe(0);
    }, 10000);
  });

  describe('concurrency group enforcement', () => {
    it('should not allow parallel execution of same concurrency group', async () => {
      // Add another task with flow-xml group but no dependencies
      const graph = new TaskGraph({ name: 'concurrent-test' });
      graph.addTask({
        id: 'T-01',
        title: 'Flow A',
        domain: 'salesforce-flow',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        concurrency_group: 'flow-xml'
      });
      graph.addTask({
        id: 'T-02',
        title: 'Flow B',
        domain: 'salesforce-flow',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        concurrency_group: 'flow-xml'
      });

      const concurrent = [];
      const maxConcurrent = { value: 0 };

      const sched = new TaskScheduler(graph, { maxConcurrency: 5 });
      const executor = async (task) => {
        concurrent.push(task.id);
        maxConcurrent.value = Math.max(maxConcurrent.value, concurrent.length);
        await new Promise(resolve => setTimeout(resolve, 50));
        concurrent.splice(concurrent.indexOf(task.id), 1);
        return { task_id: task.id, status: 'success', summary: 'Done' };
      };

      await sched.execute(executor);

      // Since both tasks are in flow-xml group, they should NOT run concurrently
      expect(maxConcurrent.value).toBe(1);
    }, 10000);

    it('should allow parallel execution of different concurrency groups', async () => {
      const graph = new TaskGraph({ name: 'different-groups-test' });
      graph.addTask({
        id: 'T-01',
        title: 'Flow task',
        domain: 'salesforce-flow',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        concurrency_group: 'flow-xml'
      });
      graph.addTask({
        id: 'T-02',
        title: 'Apex task',
        domain: 'salesforce-apex',
        goal: 'Test',
        inputs: [],
        outputs: [],
        acceptance_criteria: ['Done'],
        concurrency_group: 'apex'
      });

      const concurrent = [];
      const maxConcurrent = { value: 0 };

      const sched = new TaskScheduler(graph, { maxConcurrency: 5 });
      const executor = async (task) => {
        concurrent.push(task.id);
        maxConcurrent.value = Math.max(maxConcurrent.value, concurrent.length);
        await new Promise(resolve => setTimeout(resolve, 50));
        concurrent.splice(concurrent.indexOf(task.id), 1);
        return { task_id: task.id, status: 'success', summary: 'Done' };
      };

      await sched.execute(executor);

      // Different groups should run concurrently
      expect(maxConcurrent.value).toBe(2);
    }, 10000);
  });

  describe('event emission', () => {
    it('should emit task:start events', async () => {
      const startEvents = [];
      scheduler.on('task:start', (data) => startEvents.push(data));

      const executor = async (task) => {
        return { task_id: task.id, status: 'success', summary: 'Done' };
      };

      await scheduler.execute(executor);

      expect(startEvents.length).toBe(5);
      expect(startEvents.map(e => e.taskId)).toContain('T-01');
    }, 10000);

    it('should emit task:complete events', async () => {
      const completeEvents = [];
      scheduler.on('task:complete', (data) => completeEvents.push(data));

      const executor = async (task) => {
        return { task_id: task.id, status: 'success', summary: 'Done' };
      };

      await scheduler.execute(executor);

      expect(completeEvents.length).toBe(5);
    }, 10000);

    it('should emit task:fail events on failure', async () => {
      // Use scheduler with no retries for faster failure handling
      const noRetryScheduler = new TaskScheduler(taskGraph, { maxConcurrency: 3, retryLimit: 0 });

      const failEvents = [];
      noRetryScheduler.on('task:fail', (data) => failEvents.push(data));

      const executor = async (task) => {
        if (task.id === 'T-01') throw new Error('Failed');
        return { task_id: task.id, status: 'success', summary: 'Done' };
      };

      await noRetryScheduler.execute(executor);

      expect(failEvents.some(e => e.taskId === 'T-01')).toBe(true);
    }, 10000);
  });
});
