/**
 * Test Utilities - Shared testing helpers
 *
 * Purpose: Provide consistent test assertions and utilities
 * Used by: golden-test-suite.js, test-data-operations-api.js, and other test files
 *
 * @version 1.0.0
 */

// Color codes for output
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

/**
 * Create a test function with automatic pass/fail handling
 *
 * @param {string} name - Test name
 * @param {Function} fn - Test function (async)
 * @returns {Function} Wrapped test function
 */
function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`${c.green}✓${c.reset} ${name}`);
    } catch (error) {
      console.log(`${c.red}✗${c.reset} ${name}`);
      console.log(`  ${c.red}Error: ${error.message}${c.reset}`);
      throw error;  // Re-throw to be caught by runner
    }
  };
}

/**
 * Skip a test (useful for temporary disabling)
 *
 * @param {string} name - Test name
 * @returns {Function} Skip function
 */
function skip(name) {
  return () => {
    console.log(`${c.yellow}⊘${c.reset} ${name} (skipped)`);
  };
}

/**
 * Assert a condition is true
 *
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message if false
 * @throws {Error} If condition is false
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * Assert two values are equal
 *
 * @param {*} actual - Actual value
 * @param {*} expected - Expected value
 * @param {string} message - Optional custom error message
 * @throws {Error} If values don't match
 */
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    const defaultMessage = `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    throw new Error(message || defaultMessage);
  }
}

/**
 * Assert two values are deeply equal (objects/arrays)
 *
 * @param {*} actual - Actual value
 * @param {*} expected - Expected value
 * @param {string} message - Optional custom error message
 * @throws {Error} If values don't match
 */
function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);

  if (actualStr !== expectedStr) {
    const defaultMessage = `Expected ${expectedStr}, got ${actualStr}`;
    throw new Error(message || defaultMessage);
  }
}

/**
 * Assert a value exists (not null/undefined)
 *
 * @param {*} value - Value to check
 * @param {string} message - Optional custom error message
 * @throws {Error} If value is null/undefined
 */
function assertExists(value, message) {
  if (value === null || value === undefined) {
    throw new Error(message || 'Expected value to exist');
  }
}

/**
 * Assert a value is null or undefined
 *
 * @param {*} value - Value to check
 * @param {string} message - Optional custom error message
 * @throws {Error} If value exists
 */
function assertNotExists(value, message) {
  if (value !== null && value !== undefined) {
    throw new Error(message || `Expected value to not exist, got ${JSON.stringify(value)}`);
  }
}

/**
 * Assert a function throws an error
 *
 * @param {Function} fn - Function to test
 * @param {string|RegExp} expectedError - Expected error message or pattern
 * @param {string} message - Optional custom error message
 * @throws {Error} If function doesn't throw or throws wrong error
 */
async function assertThrows(fn, expectedError, message) {
  let threw = false;
  let error;

  try {
    await fn();
  } catch (e) {
    threw = true;
    error = e;
  }

  if (!threw) {
    throw new Error(message || 'Expected function to throw an error');
  }

  if (expectedError) {
    if (typeof expectedError === 'string') {
      if (!error.message.includes(expectedError)) {
        throw new Error(
          message || `Expected error containing "${expectedError}", got "${error.message}"`
        );
      }
    } else if (expectedError instanceof RegExp) {
      if (!expectedError.test(error.message)) {
        throw new Error(
          message || `Expected error matching ${expectedError}, got "${error.message}"`
        );
      }
    }
  }
}

/**
 * Assert a value is within a range
 *
 * @param {number} value - Value to check
 * @param {number} min - Minimum (inclusive)
 * @param {number} max - Maximum (inclusive)
 * @param {string} message - Optional custom error message
 * @throws {Error} If value is out of range
 */
function assertInRange(value, min, max, message) {
  if (value < min || value > max) {
    const defaultMessage = `Expected value to be between ${min} and ${max}, got ${value}`;
    throw new Error(message || defaultMessage);
  }
}

/**
 * Assert array contains a specific value
 *
 * @param {Array} array - Array to search
 * @param {*} value - Value to find
 * @param {string} message - Optional custom error message
 * @throws {Error} If value not in array
 */
function assertContains(array, value, message) {
  if (!Array.isArray(array)) {
    throw new Error('First argument must be an array');
  }

  if (!array.includes(value)) {
    const defaultMessage = `Expected array to contain ${JSON.stringify(value)}`;
    throw new Error(message || defaultMessage);
  }
}

/**
 * Assert string matches a pattern
 *
 * @param {string} str - String to test
 * @param {RegExp} pattern - Pattern to match
 * @param {string} message - Optional custom error message
 * @throws {Error} If string doesn't match pattern
 */
function assertMatches(str, pattern, message) {
  if (!pattern.test(str)) {
    const defaultMessage = `Expected "${str}" to match ${pattern}`;
    throw new Error(message || defaultMessage);
  }
}

/**
 * Measure execution time of a function
 *
 * @param {Function} fn - Function to measure
 * @returns {Promise<{result: *, duration: number}>} Result and duration in ms
 */
async function measureTime(fn) {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;

  return { result, duration };
}

/**
 * Create a mock function that tracks calls
 *
 * @param {*} returnValue - Value to return when called
 * @returns {Function} Mock function with call tracking
 */
function createMock(returnValue) {
  const mock = function(...args) {
    mock.calls.push(args);
    mock.callCount++;
    return typeof returnValue === 'function' ? returnValue(...args) : returnValue;
  };

  mock.calls = [];
  mock.callCount = 0;
  mock.reset = () => {
    mock.calls = [];
    mock.callCount = 0;
  };

  return mock;
}

/**
 * Wait for a condition to be true (polling)
 *
 * @param {Function} condition - Function that returns boolean
 * @param {number} timeout - Timeout in ms (default 5000)
 * @param {number} interval - Polling interval in ms (default 100)
 * @returns {Promise<void>}
 * @throws {Error} If condition not met within timeout
 */
async function waitFor(condition, timeout = 5000, interval = 100) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

// Export all utilities
module.exports = {
  test,
  skip,
  assert,
  assertEqual,
  assertDeepEqual,
  assertExists,
  assertNotExists,
  assertThrows,
  assertInRange,
  assertContains,
  assertMatches,
  measureTime,
  createMock,
  waitFor,
  colors: c
};
