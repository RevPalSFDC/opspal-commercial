#!/usr/bin/env node

/**
 * supervisor-executor.js
 *
 * Executes Supervisor-Auditor plans with parallel Promise.all(),
 * timeouts, fallbacks, and circuit breakers.
 *
 * @module supervisor-executor
 */

/**
 * Execution Result
 * @typedef {Object} ExecutionResult
 * @property {string} unit_id - Unit ID
 * @property {boolean} success - Execution success
 * @property {any} result - Execution result
 * @property {string} agent_used - Agent that was used
 * @property {number} duration_ms - Execution duration
 * @property {Error} error - Error if failed
 */

/**
 * Circuit Breaker - Prevents cascading failures
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.maxFailures = options.maxFailures || 3;
    this.consecutiveFailures = 0;
    this.state = 'closed'; // closed, open, half-open
  }

  /**
   * Record success - resets failure count
   */
  recordSuccess() {
    this.consecutiveFailures = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
    }
  }

  /**
   * Record failure - increments failure count
   */
  recordFailure() {
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= this.maxFailures) {
      this.state = 'open';
    }
  }

  /**
   * Check if circuit is open (should stop execution)
   */
  isOpen() {
    return this.state === 'open';
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      maxFailures: this.maxFailures
    };
  }
}

/**
 * Supervisor Executor - Executes plans with parallelization
 */
class SupervisorExecutor {
  constructor(options = {}) {
    this.timeout = options.timeout || 60000; // 60s default
    this.retries = options.retries !== undefined ? options.retries : 1;
    this.backoffMs = options.backoffMs || 3000;
    this.circuitBreaker = new CircuitBreaker({
      maxFailures: options.maxFailures || 3
    });
  }

  /**
   * Execute a plan
   * @param {Object} plan - Execution plan from Supervisor
   * @param {Function} agentInvoker - Function to invoke agents (Task tool)
   * @returns {Promise<Object>} Execution results
   */
  async execute(plan, agentInvoker) {
    if (!plan || !plan.PLAN || !plan.PLAN.parallel_groups) {
      throw new Error('Invalid plan structure');
    }

    const results = {
      plan_id: Date.now().toString(),
      start_time: Date.now(),
      end_time: null,
      total_duration_ms: 0,
      groups: [],
      success: true,
      circuit_breaker_triggered: false,
      error: null
    };

    try {
      // Execute each parallel group in sequence (groups are sequential, units within are parallel)
      for (const group of plan.PLAN.parallel_groups) {
        // Check circuit breaker before each group
        if (this.circuitBreaker.isOpen()) {
          results.circuit_breaker_triggered = true;
          results.success = false;
          results.error = 'Circuit breaker triggered - too many consecutive failures';
          break;
        }

        const groupResult = await this._executeGroup(group, agentInvoker);
        results.groups.push(groupResult);

        // Update circuit breaker based on group success
        if (groupResult.success) {
          this.circuitBreaker.recordSuccess();
        } else {
          this.circuitBreaker.recordFailure();
        }
      }

      results.end_time = Date.now();
      results.total_duration_ms = results.end_time - results.start_time;

      // Overall success is true only if all groups succeeded
      results.success = results.groups.every(g => g.success);

      return results;
    } catch (error) {
      results.end_time = Date.now();
      results.total_duration_ms = results.end_time - results.start_time;
      results.success = false;
      results.error = error.message;

      throw error;
    }
  }

  /**
   * Execute a parallel group
   * @param {Object} group - Parallel group from plan
   * @param {Function} agentInvoker - Agent invocation function
   * @returns {Promise<Object>} Group execution result
   */
  async _executeGroup(group, agentInvoker) {
    const groupResult = {
      group_id: group.group_id,
      start_time: Date.now(),
      end_time: null,
      duration_ms: 0,
      units: [],
      success: true
    };

    try {
      // Execute units in parallel (Promise.all)
      const unitPromises = group.units.map(unit =>
        this._executeUnit(unit, agentInvoker)
      );

      const unitResults = await Promise.all(unitPromises);

      groupResult.units = unitResults;
      groupResult.end_time = Date.now();
      groupResult.duration_ms = groupResult.end_time - groupResult.start_time;

      // Group succeeds only if all units succeeded
      groupResult.success = unitResults.every(u => u.success);

      return groupResult;
    } catch (error) {
      groupResult.end_time = Date.now();
      groupResult.duration_ms = groupResult.end_time - groupResult.start_time;
      groupResult.success = false;
      groupResult.error = error.message;

      throw error;
    }
  }

  /**
   * Execute a single unit with timeout and fallback
   * @param {Object} unit - Unit from plan
   * @param {Function} agentInvoker - Agent invocation function
   * @returns {Promise<ExecutionResult>} Unit execution result
   */
  async _executeUnit(unit, agentInvoker) {
    const result = {
      unit_id: unit.unit_id,
      success: false,
      result: null,
      agent_used: unit.agent_or_tool,
      duration_ms: 0,
      attempts: 0,
      error: null
    };

    const startTime = Date.now();

    try {
      // Primary attempt with timeout
      result.result = await this._executeWithTimeout(
        unit.agent_or_tool,
        unit.inputs,
        this.timeout,
        agentInvoker
      );

      result.success = true;
      result.attempts = 1;
    } catch (primaryError) {
      result.error = primaryError.message;
      result.attempts = 1;

      // Try fallbacks if available
      if (unit.fallbacks && unit.fallbacks.length > 0) {
        for (const fallback of unit.fallbacks) {
          try {
            console.log(`Attempting fallback: ${fallback.fallback} for ${unit.unit_id}`);

            result.result = await this._executeWithTimeout(
              fallback.fallback,
              unit.inputs,
              this.timeout,
              agentInvoker
            );

            result.success = true;
            result.agent_used = fallback.fallback;
            result.attempts++;
            result.error = null;
            break;
          } catch (fallbackError) {
            result.attempts++;
            result.error = fallbackError.message;
          }
        }
      }

      // If still failed after fallbacks, try retry with backoff
      if (!result.success && this.retries > 0) {
        await this._sleep(this.backoffMs);

        try {
          console.log(`Retry attempt for ${unit.unit_id} with ${unit.agent_or_tool}`);

          result.result = await this._executeWithTimeout(
            unit.agent_or_tool,
            unit.inputs,
            this.timeout,
            agentInvoker
          );

          result.success = true;
          result.attempts++;
          result.error = null;
        } catch (retryError) {
          result.attempts++;
          result.error = retryError.message;
        }
      }
    }

    result.duration_ms = Date.now() - startTime;

    return result;
  }

  /**
   * Execute with timeout
   * @param {string} agent - Agent name
   * @param {Array} inputs - Input parameters
   * @param {number} timeout - Timeout in ms
   * @param {Function} agentInvoker - Agent invocation function
   * @returns {Promise<any>} Execution result
   */
  async _executeWithTimeout(agent, inputs, timeout, agentInvoker) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout after ${timeout}ms for agent ${agent}`));
      }, timeout);

      agentInvoker(agent, inputs)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Sleep for specified duration
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get circuit breaker status
   * @returns {Object} Circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStatus();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    this.circuitBreaker = new CircuitBreaker({
      maxFailures: this.circuitBreaker.maxFailures
    });
  }
}

/**
 * Default agent invoker (stub for testing)
 * In production, this would call the Task tool
 * @param {string} agent - Agent name
 * @param {Array} inputs - Input parameters
 * @returns {Promise<any>} Mock result
 */
async function defaultAgentInvoker(agent, inputs) {
  // Simulate execution delay
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));

  // Simulate 85% success rate
  if (Math.random() > 0.15) {
    return {
      agent: agent,
      inputs: inputs,
      result: `Success from ${agent}`,
      timestamp: new Date().toISOString()
    };
  } else {
    throw new Error(`Simulated failure from ${agent}`);
  }
}

/**
 * CLI interface for testing
 */
if (require.main === module) {
  const SupervisorAuditor = require('./supervisor-auditor');

  // Create a test plan
  const supervisor = new SupervisorAuditor();

  const task = 'Generate READMEs for plugin-a, plugin-b, plugin-c';

  const plan = supervisor.plan({
    task: task,
    complexity: 0.6
  });

  console.log('Generated Plan:');
  console.log(JSON.stringify(plan.PLAN, null, 2));

  // Execute the plan
  console.log('\nExecuting Plan...\n');

  const executor = new SupervisorExecutor({
    timeout: 5000, // 5s for testing
    retries: 1
  });

  executor.execute(plan, defaultAgentInvoker)
    .then(results => {
      console.log('\n' + '='.repeat(60));
      console.log('EXECUTION RESULTS');
      console.log('='.repeat(60));

      console.log(`\nTotal Duration: ${results.total_duration_ms}ms`);
      console.log(`Success: ${results.success ? '✓' : '✗'}`);
      console.log(`Circuit Breaker: ${results.circuit_breaker_triggered ? 'TRIGGERED' : 'OK'}`);

      console.log(`\nGroups: ${results.groups.length}`);
      results.groups.forEach(group => {
        console.log(`\n  ${group.group_id}: ${group.duration_ms}ms (${group.success ? '✓' : '✗'})`);

        group.units.forEach(unit => {
          const status = unit.success ? '✓' : '✗';
          console.log(`    ${status} ${unit.unit_id}: ${unit.agent_used} (${unit.duration_ms}ms, ${unit.attempts} attempts)`);

          if (unit.error) {
            console.log(`      Error: ${unit.error}`);
          }
        });
      });

      console.log('\n' + '='.repeat(60));
    })
    .catch(error => {
      console.error('\nExecution failed:', error.message);
      process.exit(1);
    });
}

module.exports = SupervisorExecutor;
module.exports.CircuitBreaker = CircuitBreaker;
module.exports.defaultAgentInvoker = defaultAgentInvoker;
