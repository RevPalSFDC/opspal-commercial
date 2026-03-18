/**
 * Task Graph Orchestration Framework
 *
 * A comprehensive framework for decomposing complex tasks into
 * directed acyclic graphs (DAGs) with:
 * - Explicit dependency tracking
 * - Safe parallel execution
 * - Risk-based tool policies
 * - Deterministic verification gates
 * - Auditable execution traces
 *
 * @module task-graph
 * @version 1.0.0
 */

const { TaskGraph } = require('./task-graph');
const { TaskScheduler } = require('./task-scheduler');
const { WorkPacketBuilder } = require('./work-packet-builder');
const { ResultStore } = require('./result-store');
const { ResultMerger } = require('./result-merger');
const { Verifier } = require('./verifier');
const { TraceLogger } = require('./trace-logger');
const { ComplexityCalculator } = require('./complexity-calculator');

/**
 * Create a complete orchestration context
 * @param {Object} options - Configuration options
 * @returns {Object} Orchestration context with all components
 */
function createOrchestrationContext(options = {}) {
  const traceLogger = new TraceLogger({
    logDir: options.logDir,
    ...options.traceOptions
  });

  const resultStore = new ResultStore({
    persistDir: options.resultDir,
    ...options.resultOptions
  });

  const verifier = new Verifier({
    workingDir: options.workingDir || process.cwd(),
    ...options.verifierOptions
  });

  const workPacketBuilder = new WorkPacketBuilder({
    ...options.packetOptions
  });

  const complexityCalculator = new ComplexityCalculator({
    ...options.complexityOptions
  });

  const resultMerger = new ResultMerger({
    workingDir: options.workingDir || process.cwd(),
    backupDir: options.backupDir,
    conflictStrategy: options.conflictStrategy || 'fail',
    ...options.mergerOptions
  });

  return {
    traceLogger,
    resultStore,
    resultMerger,
    verifier,
    workPacketBuilder,
    complexityCalculator,

    /**
     * Create a new task graph
     * @param {Object} graphOptions - Graph options
     * @returns {TaskGraph} New task graph
     */
    createGraph(graphOptions = {}) {
      return new TaskGraph(graphOptions);
    },

    /**
     * Create a scheduler for a task graph
     * @param {TaskGraph} graph - Task graph to schedule
     * @param {Object} schedulerOptions - Scheduler options
     * @returns {TaskScheduler} New scheduler
     */
    createScheduler(graph, schedulerOptions = {}) {
      const scheduler = new TaskScheduler(graph, {
        maxConcurrency: options.maxConcurrency || 5,
        ...schedulerOptions
      });

      // Wire up trace logging
      scheduler.on('task:start', (data) => traceLogger.taskStart(data.taskId, data));
      scheduler.on('task:complete', (data) => traceLogger.taskComplete(data.taskId, data.result));
      scheduler.on('task:fail', (data) => traceLogger.taskFailed(data.taskId, { message: data.error }));
      scheduler.on('lock:acquire', (data) => traceLogger.scheduleEvent('lock_acquire', data));
      scheduler.on('lock:release', (data) => traceLogger.scheduleEvent('lock_release', data));

      return scheduler;
    },

    /**
     * Assess task complexity
     * @param {string} taskDescription - Task description
     * @param {Object} context - Additional context
     * @returns {Object} Complexity assessment
     */
    assessComplexity(taskDescription, context = {}) {
      return complexityCalculator.calculate(taskDescription, context);
    },

    /**
     * Build work packet for a task
     * @param {Object} taskSpec - Task specification
     * @param {Object} context - Execution context
     * @returns {Object} Work packet
     */
    buildWorkPacket(taskSpec, context = {}) {
      return workPacketBuilder.buildPacket(taskSpec, {
        ...context,
        resultStore
      });
    },

    /**
     * Verify a task result
     * @param {Object} taskSpec - Task specification
     * @param {Object} resultBundle - Task result
     * @returns {Promise<Object>} Verification result
     */
    async verifyResult(taskSpec, resultBundle) {
      traceLogger.verificationStart(taskSpec.id);
      const result = await verifier.verify(taskSpec, resultBundle);
      traceLogger.verificationComplete(taskSpec.id, result.passed);
      return result;
    },

    /**
     * Store a task result
     * @param {string} taskId - Task ID
     * @param {Object} resultBundle - Result bundle
     */
    storeResult(taskId, resultBundle) {
      resultStore.storeResult(taskId, resultBundle);
    },

    /**
     * Merge results from multiple tasks
     * @param {Array<Object>} resultBundles - Array of result bundles
     * @returns {Object} Merge result
     */
    mergeResults(resultBundles) {
      traceLogger.scheduleEvent('merge_start', { bundleCount: resultBundles.length });
      const result = resultMerger.merge(resultBundles);
      traceLogger.scheduleEvent('merge_complete', {
        success: result.success,
        conflicts: result.conflicts?.length || 0
      });
      return result;
    },

    /**
     * Generate execution report
     * @returns {Object} Execution report
     */
    generateReport() {
      return {
        trace: traceLogger.generateAuditReport(),
        results: resultStore.generateReport(),
        mergeReport: resultMerger.generateReport()
      };
    }
  };
}

/**
 * Quick complexity check (standalone utility)
 * @param {string} taskDescription - Task description
 * @returns {Object} Complexity assessment
 */
function quickComplexityCheck(taskDescription) {
  const calculator = new ComplexityCalculator();
  return calculator.calculate(taskDescription);
}

/**
 * Create a simple task graph from a list of task specs
 * @param {Array<Object>} taskSpecs - Array of task specifications
 * @param {Object} options - Graph options
 * @returns {TaskGraph} Populated task graph
 */
function createGraphFromSpecs(taskSpecs, options = {}) {
  const graph = new TaskGraph(options);
  graph.addTasks(taskSpecs);
  return graph;
}

module.exports = {
  // Core classes
  TaskGraph,
  TaskScheduler,
  WorkPacketBuilder,
  ResultStore,
  ResultMerger,
  Verifier,
  TraceLogger,
  ComplexityCalculator,

  // Factory functions
  createOrchestrationContext,
  createGraphFromSpecs,

  // Utilities
  quickComplexityCheck,

  // Version
  VERSION: '1.0.0'
};
