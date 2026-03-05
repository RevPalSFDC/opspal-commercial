/**
 * Instrumentation - Automatic metrics collection wrapper
 *
 * Purpose: Transparently collect metrics from function executions
 * Usage:
 *   const { instrument, instrumentAsync } = require('./instrumentation');
 *   const wrappedFn = instrumentAsync('agent-name', myAsyncFunction);
 *
 * @version 1.0.0
 */

const MetricsCollector = require('./metrics-collector');

/**
 * Instrument a synchronous function
 *
 * @param {string} name - Metric name
 * @param {Function} fn - Function to instrument
 * @param {Object} options - Instrumentation options
 * @returns {Function} Instrumented function
 */
function instrument(name, fn, options = {}) {
  return function(...args) {
    const collector = MetricsCollector.getInstance();
    const startTime = Date.now();
    const metricType = options.type || 'operation';

    try {
      const result = fn.apply(this, args);
      const duration = Date.now() - startTime;

      // Record success
      if (metricType === 'agent') {
        collector.recordAgentExecution(name, {
          duration,
          success: true,
          metadata: options.metadata || {}
        });
      } else if (metricType === 'hook') {
        collector.recordHookExecution(name, {
          duration,
          success: true
        });
      } else {
        collector.recordOperation(name, {
          duration,
          successCount: 1,
          failureCount: 0
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Record failure
      if (metricType === 'agent') {
        collector.recordAgentExecution(name, {
          duration,
          success: false,
          error: error.message
        });
      } else if (metricType === 'hook') {
        collector.recordHookExecution(name, {
          duration,
          success: false,
          error: error.message
        });
      } else {
        collector.recordOperation(name, {
          duration,
          successCount: 0,
          failureCount: 1
        });
      }

      collector.recordError(name, error, options.metadata || {});

      throw error;
    }
  };
}

/**
 * Instrument an asynchronous function
 *
 * @param {string} name - Metric name
 * @param {Function} fn - Async function to instrument
 * @param {Object} options - Instrumentation options
 * @returns {Function} Instrumented async function
 */
function instrumentAsync(name, fn, options = {}) {
  return async function(...args) {
    const collector = MetricsCollector.getInstance();
    const startTime = Date.now();
    const metricType = options.type || 'operation';

    try {
      const result = await fn.apply(this, args);
      const duration = Date.now() - startTime;

      // Record success
      if (metricType === 'agent') {
        collector.recordAgentExecution(name, {
          duration,
          success: true,
          metadata: options.metadata || {}
        });
      } else if (metricType === 'hook') {
        collector.recordHookExecution(name, {
          duration,
          success: true
        });
      } else {
        collector.recordOperation(name, {
          duration,
          recordCount: result?.summary?.total || 0,
          successCount: result?.summary?.success || 1,
          failureCount: result?.summary?.failed || 0,
          safetyLevel: result?.config?.safetyLevel || options.safetyLevel || 'unknown',
          executionMode: result?.config?.executionMode || options.executionMode || 'unknown'
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Record failure
      if (metricType === 'agent') {
        collector.recordAgentExecution(name, {
          duration,
          success: false,
          error: error.message
        });
      } else if (metricType === 'hook') {
        collector.recordHookExecution(name, {
          duration,
          success: false,
          error: error.message
        });
      } else {
        collector.recordOperation(name, {
          duration,
          successCount: 0,
          failureCount: 1
        });
      }

      collector.recordError(name, error, options.metadata || {});

      throw error;
    }
  };
}

/**
 * Create instrumented metrics recorder for specific context
 *
 * @param {string} contextName - Context name (e.g., agent name)
 * @param {string} contextType - Context type (agent, hook, operation)
 * @returns {Object} Metrics recorder functions
 */
function createMetricsRecorder(contextName, contextType = 'operation') {
  const collector = MetricsCollector.getInstance();

  return {
    /**
     * Record successful operation
     *
     * @param {number} duration - Duration in ms
     * @param {Object} data - Additional data
     */
    recordSuccess(duration, data = {}) {
      if (contextType === 'agent') {
        collector.recordAgentExecution(contextName, {
          duration,
          success: true,
          metadata: data
        });
      } else if (contextType === 'hook') {
        collector.recordHookExecution(contextName, {
          duration,
          success: true,
          ...data
        });
      } else {
        collector.recordOperation(contextName, {
          duration,
          successCount: 1,
          failureCount: 0,
          ...data
        });
      }
    },

    /**
     * Record failed operation
     *
     * @param {number} duration - Duration in ms
     * @param {Error|string} error - Error
     * @param {Object} data - Additional data
     */
    recordFailure(duration, error, data = {}) {
      if (contextType === 'agent') {
        collector.recordAgentExecution(contextName, {
          duration,
          success: false,
          error: error.message || error,
          metadata: data
        });
      } else if (contextType === 'hook') {
        collector.recordHookExecution(contextName, {
          duration,
          success: false,
          error: error.message || error,
          ...data
        });
      } else {
        collector.recordOperation(contextName, {
          duration,
          successCount: 0,
          failureCount: 1,
          ...data
        });
      }

      collector.recordError(contextName, error, data);
    },

    /**
     * Record error
     *
     * @param {Error|string} error - Error
     * @param {Object} context - Error context
     */
    recordError(error, context = {}) {
      collector.recordError(contextName, error, context);
    },

    /**
     * Get start time for manual timing
     *
     * @returns {number} Start timestamp
     */
    startTimer() {
      return Date.now();
    },

    /**
     * Calculate duration from start time
     *
     * @param {number} startTime - Start timestamp
     * @returns {number} Duration in ms
     */
    getDuration(startTime) {
      return Date.now() - startTime;
    }
  };
}

module.exports = {
  instrument,
  instrumentAsync,
  createMetricsRecorder
};
