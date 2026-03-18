/**
 * Task Retry Helper
 *
 * Provides retry logic for Task tool operations to handle transient
 * failures like network timeouts and temporary unavailability.
 *
 * Related reflections: f3a68c5e
 * ROI: $2,250/yr
 *
 * @module task-retry-helper
 */

// Default retry configuration
const DEFAULT_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ESOCKETTIMEDOUT',
    'EAI_AGAIN',
    'timeout',
    'Task execution timeout',
    'Connection reset',
    '429',
    '500',
    '502',
    '503',
    '504'
  ],
  nonRetryableErrors: [
    'INVALID_SESSION_ID',
    'INVALID_CREDENTIALS',
    'INVALID_LOGIN',
    '401',
    '403',
    'Permission denied',
    'Unauthorized'
  ]
};

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt, config = DEFAULT_CONFIG) {
  // Exponential backoff: baseDelay * (multiplier ^ attempt)
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);

  // Add jitter (±20% random variation)
  const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);

  // Cap at maxDelayMs
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Determine if an error is retryable
 * @param {Error|string} error - The error to check
 * @param {Object} config - Retry configuration
 * @returns {Object} Retryability determination
 */
function isRetryable(error, config = DEFAULT_CONFIG) {
  const result = {
    retryable: false,
    reason: null,
    suggestedDelay: null
  };

  const errorStr = typeof error === 'string' ? error : (error.message || error.code || String(error));

  // Check for non-retryable errors first
  for (const pattern of config.nonRetryableErrors) {
    if (errorStr.includes(pattern)) {
      result.retryable = false;
      result.reason = `Non-retryable error: ${pattern}`;
      return result;
    }
  }

  // Check for retryable errors
  for (const pattern of config.retryableErrors) {
    if (errorStr.includes(pattern)) {
      result.retryable = true;
      result.reason = `Retryable error: ${pattern}`;

      // Special handling for rate limits (429)
      if (errorStr.includes('429')) {
        // Check for Retry-After header if available
        const retryAfterMatch = errorStr.match(/Retry-After:\s*(\d+)/i);
        if (retryAfterMatch) {
          result.suggestedDelay = parseInt(retryAfterMatch[1]) * 1000;
        } else {
          result.suggestedDelay = 60000; // Default 60s for rate limits
        }
      }

      return result;
    }
  }

  // Default: not retryable
  result.reason = 'Error does not match retryable patterns';
  return result;
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @returns {Promise<Object>} Execution result
 */
async function executeWithRetry(fn, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const result = {
    success: false,
    result: null,
    attempts: [],
    totalAttempts: 0,
    totalTimeMs: 0
  };

  const startTime = Date.now();

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const attemptStart = Date.now();
    const attemptInfo = {
      attempt: attempt + 1,
      startedAt: new Date(attemptStart).toISOString(),
      success: false,
      error: null,
      durationMs: 0
    };

    try {
      const fnResult = await fn();
      attemptInfo.success = true;
      attemptInfo.durationMs = Date.now() - attemptStart;
      result.attempts.push(attemptInfo);
      result.success = true;
      result.result = fnResult;
      break;
    } catch (error) {
      attemptInfo.error = error.message || String(error);
      attemptInfo.durationMs = Date.now() - attemptStart;
      result.attempts.push(attemptInfo);

      // Check if we should retry
      const retryability = isRetryable(error, config);

      if (!retryability.retryable || attempt === config.maxRetries) {
        // No more retries
        result.error = attemptInfo.error;
        result.retryable = retryability.retryable;
        result.reason = retryability.reason;
        break;
      }

      // Calculate and wait for delay
      const delay = retryability.suggestedDelay || calculateDelay(attempt, config);
      attemptInfo.nextRetryDelay = delay;

      if (config.onRetry) {
        config.onRetry(attempt + 1, error, delay);
      }

      await sleep(delay);
    }
  }

  result.totalAttempts = result.attempts.length;
  result.totalTimeMs = Date.now() - startTime;

  return result;
}

/**
 * Create a retryable wrapper for an async function
 * @param {Function} fn - Async function to wrap
 * @param {Object} options - Retry options
 * @returns {Function} Wrapped function with retry logic
 */
function withRetry(fn, options = {}) {
  return async (...args) => {
    return executeWithRetry(() => fn(...args), options);
  };
}

/**
 * Execute multiple operations with retry, stopping on first success
 * @param {Function[]} operations - Array of async functions to try
 * @param {Object} options - Retry options
 * @returns {Promise<Object>} First successful result or all failures
 */
async function executeWithFallback(operations, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const result = {
    success: false,
    result: null,
    operationAttempts: []
  };

  for (let i = 0; i < operations.length; i++) {
    const operation = operations[i];
    const opResult = await executeWithRetry(operation, {
      ...config,
      maxRetries: config.maxRetriesPerOperation || 1
    });

    result.operationAttempts.push({
      operationIndex: i,
      ...opResult
    });

    if (opResult.success) {
      result.success = true;
      result.result = opResult.result;
      result.successfulOperation = i;
      break;
    }
  }

  return result;
}

/**
 * Batch execute operations with retry and concurrency control
 * @param {Function[]} operations - Array of async functions
 * @param {Object} options - Execution options
 * @returns {Promise<Object[]>} Array of results
 */
async function batchExecuteWithRetry(operations, options = {}) {
  const config = {
    concurrency: 5,
    stopOnError: false,
    ...options
  };

  const results = [];
  const queue = [...operations.map((op, i) => ({ op, index: i }))];

  const executeNext = async () => {
    while (queue.length > 0) {
      const { op, index } = queue.shift();

      const result = await executeWithRetry(op, options);
      results[index] = result;

      if (!result.success && config.stopOnError) {
        // Clear remaining queue
        queue.length = 0;
        break;
      }
    }
  };

  // Start concurrent workers
  const workers = Array(Math.min(config.concurrency, operations.length))
    .fill(null)
    .map(() => executeNext());

  await Promise.all(workers);

  return results;
}

/**
 * Create a circuit breaker wrapper
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Circuit breaker options
 * @returns {Object} Circuit breaker instance
 */
function createCircuitBreaker(fn, options = {}) {
  const config = {
    failureThreshold: 5,
    recoveryTime: 60000,
    halfOpenRetries: 1,
    ...options
  };

  let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  let failures = 0;
  let lastFailureTime = null;
  let halfOpenAttempts = 0;

  return {
    getState: () => state,
    getFailures: () => failures,

    async execute(...args) {
      // Check if circuit should transition from OPEN to HALF_OPEN
      if (state === 'OPEN') {
        const timeSinceFailure = Date.now() - lastFailureTime;
        if (timeSinceFailure >= config.recoveryTime) {
          state = 'HALF_OPEN';
          halfOpenAttempts = 0;
        } else {
          throw new Error(`Circuit breaker OPEN - retry in ${Math.ceil((config.recoveryTime - timeSinceFailure) / 1000)}s`);
        }
      }

      try {
        const result = await fn(...args);

        // Success resets the circuit
        if (state === 'HALF_OPEN') {
          state = 'CLOSED';
          failures = 0;
        } else {
          failures = Math.max(0, failures - 1);
        }

        return result;
      } catch (error) {
        failures++;
        lastFailureTime = Date.now();

        if (state === 'HALF_OPEN') {
          halfOpenAttempts++;
          if (halfOpenAttempts >= config.halfOpenRetries) {
            state = 'OPEN';
          }
        } else if (failures >= config.failureThreshold) {
          state = 'OPEN';
        }

        throw error;
      }
    },

    reset() {
      state = 'CLOSED';
      failures = 0;
      lastFailureTime = null;
      halfOpenAttempts = 0;
    }
  };
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'test':
      // Test retry logic with simulated failures
      let attempts = 0;
      const testFn = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('ETIMEDOUT');
        }
        return 'success';
      };

      executeWithRetry(testFn, { maxRetries: 5 }).then(result => {
        console.log(JSON.stringify(result, null, 2));
      });
      break;

    case 'calculate-delay':
      const attempt = parseInt(args[1]) || 0;
      const delay = calculateDelay(attempt);
      console.log(`Attempt ${attempt + 1} delay: ${delay}ms`);
      break;

    case 'is-retryable':
      if (!args[1]) {
        console.error('Usage: task-retry-helper.js is-retryable "<error-message>"');
        process.exit(1);
      }
      const check = isRetryable(args.slice(1).join(' '));
      console.log(JSON.stringify(check, null, 2));
      break;

    default:
      console.log(`Task Retry Helper

Usage:
  task-retry-helper.js test                        Test retry logic
  task-retry-helper.js calculate-delay <attempt>   Calculate delay for attempt
  task-retry-helper.js is-retryable "<error>"      Check if error is retryable

Features:
  - Exponential backoff with jitter
  - Configurable retry patterns
  - Non-retryable error detection
  - Circuit breaker pattern
  - Batch execution with concurrency
  - Fallback operation support

Retryable Errors:
  ETIMEDOUT, ECONNRESET, ECONNREFUSED, ENOTFOUND, timeout, 429, 500-504

Non-Retryable Errors:
  INVALID_SESSION_ID, 401, 403, Permission denied

Examples:
  # In code
  const { executeWithRetry } = require('./task-retry-helper');
  const result = await executeWithRetry(myAsyncFn, { maxRetries: 3 });

  # With circuit breaker
  const cb = createCircuitBreaker(myAsyncFn, { failureThreshold: 5 });
  const result = await cb.execute();
`);
  }
}

module.exports = {
  DEFAULT_CONFIG,
  calculateDelay,
  isRetryable,
  sleep,
  executeWithRetry,
  withRetry,
  executeWithFallback,
  batchExecuteWithRetry,
  createCircuitBreaker
};
