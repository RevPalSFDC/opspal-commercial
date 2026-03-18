/**
 * Rate Limit Manager for Marketo API
 *
 * Implements sliding window rate limiting for Marketo's 100 calls/20 seconds limit.
 * Pattern based on HubSpot hubspot-client-v3.js.
 *
 * Features:
 * - Sliding window rate limiting
 * - Automatic throttling
 * - Rate limit header parsing
 * - Quota tracking and reporting
 * - Configurable limits
 *
 * @module rate-limit-manager
 * @version 1.0.0
 */

/**
 * Default rate limit configuration
 * Marketo: 100 calls per 20 seconds
 */
const DEFAULT_CONFIG = {
  maxCalls: 100,
  windowMs: 20000,  // 20 seconds
  safetyMargin: 0.1, // Leave 10% buffer
  dailyLimit: 50000, // Daily API limit
};

/**
 * Rate limit state
 */
let state = {
  callTimestamps: [],
  dailyCalls: 0,
  dailyReset: null,
  config: { ...DEFAULT_CONFIG },
};

/**
 * Initialize or reset the rate limit manager
 *
 * @param {Object} config - Rate limit configuration
 */
function initialize(config = {}) {
  state = {
    callTimestamps: [],
    dailyCalls: 0,
    dailyReset: getNextDayReset(),
    config: { ...DEFAULT_CONFIG, ...config },
  };
}

/**
 * Get next day reset timestamp (midnight UTC)
 */
function getNextDayReset() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  return tomorrow.getTime();
}

/**
 * Record an API call
 */
function recordCall() {
  const now = Date.now();

  // Check for daily reset
  if (now >= state.dailyReset) {
    state.dailyCalls = 0;
    state.dailyReset = getNextDayReset();
  }

  state.callTimestamps.push(now);
  state.dailyCalls++;

  // Clean old timestamps
  pruneOldTimestamps();
}

/**
 * Remove timestamps outside the current window
 */
function pruneOldTimestamps() {
  const cutoff = Date.now() - state.config.windowMs;
  state.callTimestamps = state.callTimestamps.filter((ts) => ts > cutoff);
}

/**
 * Get current call count in window
 *
 * @returns {number} Calls in current window
 */
function getCurrentWindowCount() {
  pruneOldTimestamps();
  return state.callTimestamps.length;
}

/**
 * Get effective limit (with safety margin)
 *
 * @returns {number} Effective call limit
 */
function getEffectiveLimit() {
  return Math.floor(state.config.maxCalls * (1 - state.config.safetyMargin));
}

/**
 * Check if we're at the rate limit
 *
 * @returns {boolean} True if at limit
 */
function isAtLimit() {
  return getCurrentWindowCount() >= getEffectiveLimit();
}

/**
 * Check if we're approaching the limit (>80%)
 *
 * @returns {boolean} True if approaching limit
 */
function isApproachingLimit() {
  return getCurrentWindowCount() >= getEffectiveLimit() * 0.8;
}

/**
 * Get time until next available slot
 *
 * @returns {number} Milliseconds to wait (0 if available)
 */
function getWaitTime() {
  if (!isAtLimit()) return 0;

  const oldestTimestamp = state.callTimestamps[0];
  if (!oldestTimestamp) return 0;

  const expiryTime = oldestTimestamp + state.config.windowMs;
  const waitTime = expiryTime - Date.now();

  return Math.max(0, waitTime);
}

/**
 * Wait if needed before making a call
 *
 * @returns {Promise<void>}
 */
async function waitIfNeeded() {
  const waitTime = getWaitTime();
  if (waitTime > 0) {
    await sleep(waitTime);
  }
}

/**
 * Get current usage statistics
 *
 * @returns {Object} Usage statistics
 */
function getUsage() {
  pruneOldTimestamps();

  const windowCount = state.callTimestamps.length;
  const effectiveLimit = getEffectiveLimit();

  return {
    window: {
      current: windowCount,
      limit: state.config.maxCalls,
      effectiveLimit,
      remaining: Math.max(0, effectiveLimit - windowCount),
      percentage: Math.round((windowCount / effectiveLimit) * 100),
    },
    daily: {
      current: state.dailyCalls,
      limit: state.config.dailyLimit,
      remaining: Math.max(0, state.config.dailyLimit - state.dailyCalls),
      percentage: Math.round((state.dailyCalls / state.config.dailyLimit) * 100),
      resetAt: new Date(state.dailyReset).toISOString(),
    },
    status: getStatus(),
  };
}

/**
 * Get current status string
 *
 * @returns {string} Status indicator
 */
function getStatus() {
  const windowUsage = getCurrentWindowCount() / getEffectiveLimit();
  const dailyUsage = state.dailyCalls / state.config.dailyLimit;

  if (windowUsage >= 1 || dailyUsage >= 0.95) return 'CRITICAL';
  if (windowUsage >= 0.8 || dailyUsage >= 0.8) return 'WARNING';
  if (windowUsage >= 0.5 || dailyUsage >= 0.5) return 'MODERATE';
  return 'HEALTHY';
}

/**
 * Parse rate limit headers from API response
 *
 * @param {Object} headers - Response headers
 * @returns {Object} Parsed rate limit info
 */
function parseRateLimitHeaders(headers) {
  if (!headers) return null;

  return {
    limit: parseInt(headers['x-ratelimit-limit']) || null,
    remaining: parseInt(headers['x-ratelimit-remaining']) || null,
    reset: parseInt(headers['x-ratelimit-reset']) || null,
    retryAfter: parseInt(headers['retry-after']) || null,
  };
}

/**
 * Update state from API response headers
 *
 * @param {Object} headers - Response headers
 */
function updateFromHeaders(headers) {
  const parsed = parseRateLimitHeaders(headers);
  if (!parsed) return;

  // If API reports lower remaining than our count, adjust
  if (parsed.remaining !== null && parsed.remaining < (getEffectiveLimit() - getCurrentWindowCount())) {
    // API says we have fewer calls available - be conservative
    const adjustedCount = state.config.maxCalls - parsed.remaining;
    if (adjustedCount > state.callTimestamps.length) {
      // Add phantom timestamps to match API's count
      const now = Date.now();
      const toAdd = adjustedCount - state.callTimestamps.length;
      for (let i = 0; i < toAdd; i++) {
        state.callTimestamps.push(now);
      }
    }
  }
}

/**
 * Handle rate limit error from API
 *
 * @param {Object} error - API error
 * @returns {number} Suggested wait time in ms
 */
function handleRateLimitError(error) {
  // Check for retry-after header
  if (error.headers?.['retry-after']) {
    return parseInt(error.headers['retry-after']) * 1000;
  }

  // Check for error code
  const code = error.code || error.errorCode;
  if (code === 606 || code === 607) {
    // Marketo rate limit errors - wait full window
    return state.config.windowMs;
  }

  // Default backoff
  return 5000;
}

/**
 * Estimate time to complete operations
 *
 * @param {number} operationCount - Number of operations
 * @returns {Object} Time estimate
 */
function estimateTime(operationCount) {
  const effectiveRate = getEffectiveLimit() / (state.config.windowMs / 1000);
  const seconds = operationCount / effectiveRate;

  return {
    operations: operationCount,
    effectiveRate: Math.round(effectiveRate * 100) / 100,
    estimatedSeconds: Math.ceil(seconds),
    estimatedMinutes: Math.ceil(seconds / 60),
    estimatedFormatted: formatDuration(seconds * 1000),
  };
}

/**
 * Format duration for display
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a rate-limited wrapper for API calls
 *
 * @param {Function} apiCall - API call function
 * @returns {Function} Rate-limited wrapper
 */
function createRateLimitedCall(apiCall) {
  return async function rateLimitedCall(...args) {
    await waitIfNeeded();
    recordCall();

    try {
      const result = await apiCall(...args);

      // Update from response headers if available
      if (result?.headers) {
        updateFromHeaders(result.headers);
      }

      return result;
    } catch (error) {
      // Handle rate limit errors
      if (isRateLimitError(error)) {
        const waitTime = handleRateLimitError(error);
        await sleep(waitTime);
        return rateLimitedCall(...args); // Retry
      }
      throw error;
    }
  };
}

/**
 * Check if error is rate limit related
 */
function isRateLimitError(error) {
  if (!error) return false;
  const code = error.code || error.errorCode;
  return code === 606 || code === 607 || error.message?.includes('rate limit');
}

/**
 * Get configuration
 */
function getConfig() {
  return { ...state.config };
}

/**
 * Update configuration
 */
function setConfig(newConfig) {
  state.config = { ...state.config, ...newConfig };
}

// Initialize on load
initialize();

module.exports = {
  initialize,
  recordCall,
  getCurrentWindowCount,
  isAtLimit,
  isApproachingLimit,
  getWaitTime,
  waitIfNeeded,
  getUsage,
  getStatus,
  parseRateLimitHeaders,
  updateFromHeaders,
  handleRateLimitError,
  estimateTime,
  createRateLimitedCall,
  getConfig,
  setConfig,
  DEFAULT_CONFIG,
};
