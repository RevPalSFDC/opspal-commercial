/**
 * TaskScheduler - Manages concurrent execution of tasks from a TaskGraph
 *
 * Provides:
 * - Concurrency limit enforcement
 * - Concurrency group locking (mutex per group)
 * - Execution scheduling based on dependencies
 * - Task state management
 * - Event emission for monitoring
 */

const EventEmitter = require('events');
const { TaskGraph } = require('./task-graph');

class TaskScheduler extends EventEmitter {
  constructor(taskGraph, options = {}) {
    super();

    if (!(taskGraph instanceof TaskGraph)) {
      throw new Error('TaskScheduler requires a TaskGraph instance');
    }

    this.graph = taskGraph;
    this.options = {
      maxConcurrency: options.maxConcurrency || 5,
      retryLimit: options.retryLimit || 2,
      retryDelayMs: options.retryDelayMs || 1000,
      timeoutMs: options.timeoutMs || 300000, // 5 minutes default
      ...options
    };

    // State tracking
    this.completed = new Set();
    this.failed = new Set();
    this.running = new Map();  // task_id -> { startTime, promise }
    this.blocked = new Set();
    this.pending = new Set(taskGraph.getAllTasks().map(t => t.id));

    // Concurrency group locks
    this.groupLocks = new Map();

    // Execution log
    this.executionLog = [];

    // Statistics
    this.stats = {
      started_at: null,
      completed_at: null,
      tasks_total: taskGraph.getAllTasks().length,
      tasks_completed: 0,
      tasks_failed: 0,
      tasks_blocked: 0,
      total_execution_time_ms: 0,
      retries: 0
    };
  }

  /**
   * Start executing the task graph
   * @param {Function} executor - Async function that executes a task: (taskSpec) => Promise<ResultBundle>
   * @returns {Promise<Object>} Execution summary
   */
  async execute(executor) {
    if (typeof executor !== 'function') {
      throw new Error('Executor must be a function');
    }

    this.stats.started_at = new Date().toISOString();
    this.emit('execution:start', { graph: this.graph.metadata });

    try {
      await this.runScheduleLoop(executor);
    } catch (error) {
      this.emit('execution:error', { error: error.message });
      throw error;
    }

    this.stats.completed_at = new Date().toISOString();
    this.stats.total_execution_time_ms =
      new Date(this.stats.completed_at) - new Date(this.stats.started_at);

    const summary = this.getSummary();
    this.emit('execution:complete', summary);

    return summary;
  }

  /**
   * Main scheduling loop
   * @private
   */
  async runScheduleLoop(executor) {
    while (this.pending.size > 0 || this.running.size > 0) {
      // Get ready tasks
      const readyTasks = this.getReadyToRun();

      // Start as many tasks as we can within concurrency limit
      const slotsAvailable = this.options.maxConcurrency - this.running.size;
      const tasksToStart = readyTasks.slice(0, slotsAvailable);

      for (const task of tasksToStart) {
        // Re-check lock availability (may have been acquired by previous task in this loop)
        if (!this.canAcquireLock(task.concurrency_group)) {
          continue;
        }
        this.startTask(task, executor);
      }

      // Wait for at least one task to complete if we have running tasks
      if (this.running.size > 0) {
        await this.waitForAnyTaskCompletion();
      } else if (this.pending.size > 0 && tasksToStart.length === 0) {
        // No tasks running and no tasks ready - check for deadlock
        const blockedTasks = this.checkForBlockedTasks();
        if (blockedTasks.length === this.pending.size) {
          throw new Error(`Scheduler deadlock: ${blockedTasks.length} tasks blocked`);
        }
        // Small delay to prevent tight loop
        await this.sleep(100);
      }
    }
  }

  /**
   * Get tasks that are ready to run
   * @returns {Array<Object>} Array of TaskSpec objects ready to execute
   */
  getReadyToRun() {
    const ready = [];

    for (const taskId of this.pending) {
      const task = this.graph.getTask(taskId);
      if (!task) continue;

      // Check dependencies
      const deps = this.graph.getDependencies(taskId);

      // Check for failed or blocked dependencies FIRST (cascade blocking)
      const anyDepFailed = deps.some(d => this.failed.has(d) || this.blocked.has(d));
      if (anyDepFailed) {
        this.pending.delete(taskId);
        this.blocked.add(taskId);
        this.stats.tasks_blocked++;
        this.emit('task:blocked', { taskId, reason: 'dependency_failed' });
        continue;
      }

      // Check if all dependencies are complete
      const allDepsComplete = deps.every(d => this.completed.has(d));
      if (!allDepsComplete) continue;

      // Check concurrency group lock
      if (!this.canAcquireLock(task.concurrency_group)) {
        continue;
      }

      ready.push(task);
    }

    return ready;
  }

  /**
   * Start executing a task
   * @private
   */
  startTask(task, executor) {
    const taskId = task.id;

    // Move from pending to running
    this.pending.delete(taskId);

    // Acquire concurrency group lock
    this.acquireLock(task.concurrency_group, taskId);

    const startTime = Date.now();

    // Create execution promise
    const promise = this.executeWithRetry(task, executor)
      .then(result => {
        this.handleTaskSuccess(taskId, result, startTime);
        return result;
      })
      .catch(error => {
        this.handleTaskFailure(taskId, error, startTime);
        throw error;
      })
      .finally(() => {
        this.releaseLock(task.concurrency_group, taskId);
        this.running.delete(taskId);
      });

    this.running.set(taskId, { startTime, promise, task });

    this.emit('task:start', {
      taskId,
      title: task.title,
      domain: task.domain,
      concurrency_group: task.concurrency_group
    });

    this.log('start', taskId, { domain: task.domain });
  }

  /**
   * Execute task with retry logic
   * @private
   */
  async executeWithRetry(task, executor) {
    let lastError;
    let attempt = 0;

    while (attempt <= this.options.retryLimit) {
      try {
        // Create timeout wrapper
        const result = await this.withTimeout(
          executor(task),
          this.options.timeoutMs
        );

        return result;
      } catch (error) {
        lastError = error;
        attempt++;

        if (attempt <= this.options.retryLimit) {
          this.stats.retries++;
          this.emit('task:retry', {
            taskId: task.id,
            attempt,
            error: error.message
          });
          await this.sleep(this.options.retryDelayMs * attempt);
        }
      }
    }

    throw lastError;
  }

  /**
   * Wrap promise with timeout
   * @private
   */
  async withTimeout(promise, timeoutMs) {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Task execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Handle successful task completion
   * @private
   */
  handleTaskSuccess(taskId, result, startTime) {
    const duration = Date.now() - startTime;

    this.completed.add(taskId);
    this.graph.setTaskStatus(taskId, 'completed');
    this.stats.tasks_completed++;

    this.emit('task:complete', {
      taskId,
      duration_ms: duration,
      result
    });

    this.log('complete', taskId, { duration_ms: duration, status: result?.status });
  }

  /**
   * Handle task failure
   * @private
   */
  handleTaskFailure(taskId, error, startTime) {
    const duration = Date.now() - startTime;

    this.failed.add(taskId);
    this.graph.setTaskStatus(taskId, 'failed');
    this.stats.tasks_failed++;

    this.emit('task:fail', {
      taskId,
      duration_ms: duration,
      error: error.message
    });

    this.log('fail', taskId, { duration_ms: duration, error: error.message });
  }

  /**
   * Wait for any running task to complete
   * @private
   */
  async waitForAnyTaskCompletion() {
    const promises = Array.from(this.running.values()).map(r => r.promise.catch(() => {}));
    await Promise.race(promises);
  }

  /**
   * Check for tasks that can't make progress
   * @private
   */
  checkForBlockedTasks() {
    const blocked = [];

    for (const taskId of this.pending) {
      const deps = this.graph.getDependencies(taskId);
      const anyDepFailed = deps.some(d => this.failed.has(d) || this.blocked.has(d));
      if (anyDepFailed) {
        blocked.push(taskId);
      }
    }

    return blocked;
  }

  /**
   * Check if we can acquire a concurrency group lock
   * @param {string} group - Concurrency group name
   * @returns {boolean} true if lock can be acquired
   */
  canAcquireLock(group) {
    if (group === 'none') return true;
    return !this.groupLocks.has(group);
  }

  /**
   * Acquire a concurrency group lock
   * @param {string} group - Concurrency group name
   * @param {string} taskId - Task ID acquiring the lock
   */
  acquireLock(group, taskId) {
    if (group === 'none') return;

    if (this.groupLocks.has(group)) {
      throw new Error(`Lock already held for group ${group}`);
    }

    this.groupLocks.set(group, taskId);
    this.emit('lock:acquire', { group, taskId });
  }

  /**
   * Release a concurrency group lock
   * @param {string} group - Concurrency group name
   * @param {string} taskId - Task ID releasing the lock
   */
  releaseLock(group, taskId) {
    if (group === 'none') return;

    const holder = this.groupLocks.get(group);
    if (holder !== taskId) {
      throw new Error(`Task ${taskId} cannot release lock held by ${holder}`);
    }

    this.groupLocks.delete(group);
    this.emit('lock:release', { group, taskId });
  }

  /**
   * Get current execution state
   * @returns {Object} Current state
   */
  getState() {
    return {
      pending: Array.from(this.pending),
      running: Array.from(this.running.keys()),
      completed: Array.from(this.completed),
      failed: Array.from(this.failed),
      blocked: Array.from(this.blocked),
      locks: Object.fromEntries(this.groupLocks)
    };
  }

  /**
   * Get running tasks
   * @returns {Array<Object>} Array of running task info
   */
  getRunningTasks() {
    return Array.from(this.running.entries()).map(([taskId, info]) => ({
      taskId,
      startTime: new Date(info.startTime).toISOString(),
      elapsedMs: Date.now() - info.startTime,
      task: info.task
    }));
  }

  /**
   * Get execution summary
   * @returns {Object} Execution summary
   */
  getSummary() {
    return {
      stats: { ...this.stats },
      state: this.getState(),
      execution_log: this.executionLog,
      graph_stats: this.graph.getStats()
    };
  }

  /**
   * Add entry to execution log
   * @private
   */
  log(event, taskId, data = {}) {
    this.executionLog.push({
      timestamp: new Date().toISOString(),
      event,
      taskId,
      ...data
    });
  }

  /**
   * Utility sleep function
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cancel execution (best effort)
   */
  cancel() {
    this.emit('execution:cancel');
    // Note: Cancellation is best-effort - running tasks will complete
    // Future enhancement: Support AbortController for true cancellation
  }

  /**
   * Create a dry-run scheduler that simulates execution
   * @param {TaskGraph} graph - Task graph to simulate
   * @param {Object} options - Scheduler options
   * @returns {Promise<Object>} Simulated execution summary
   */
  static async dryRun(graph, options = {}) {
    const scheduler = new TaskScheduler(graph, options);

    const mockExecutor = async (task) => {
      // Simulate execution time based on complexity
      const delay = (task.estimated_complexity || 0.5) * 1000;
      await scheduler.sleep(delay);

      return {
        task_id: task.id,
        status: 'success',
        summary: `[DRY RUN] Task ${task.id} completed`,
        files_changed: [],
        evidence: []
      };
    };

    return scheduler.execute(mockExecutor);
  }
}

module.exports = { TaskScheduler };
