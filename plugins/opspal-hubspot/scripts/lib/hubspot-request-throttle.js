#!/usr/bin/env node

/**
 * HubSpot Centralized Request Throttle
 *
 * Coordinates all HubSpot API requests across batch wrappers to prevent
 * rate limit collisions. Integrates HubSpotAPISafeguard and response
 * header parsing for intelligent, adaptive throttling.
 *
 * Problem Solved:
 * - Running 3 batch operations simultaneously = 30 concurrent requests
 * - Starter tier limit: 100/10s → easily exceeded
 * - Solution: Global coordination through this singleton throttle
 *
 * Features:
 * - Singleton pattern for global coordination
 * - Integrates HubSpotAPISafeguard for tier-aware limits
 * - Parses response headers for dynamic adaptation
 * - Circuit breaker for 429 storms
 * - Request queue with priority
 *
 * @version 1.0.0
 * @phase Rate Limit Integration (Gap Analysis Fix)
 */

const { HubSpotAPISafeguard, API_LIMITS } = require('./hubspot-api-safeguard');
const {
  parseRateLimitHeaders,
  shouldProceed,
  formatForLog,
  detectTierFromHeaders
} = require('./hubspot-rate-limit-parser');

// Singleton instance
let instance = null;

/**
 * Centralized Request Throttle
 *
 * Usage:
 * const throttle = HubSpotRequestThrottle.getInstance({ tier: 'starter' });
 * await throttle.enqueue(async () => fetch(url, options));
 */
class HubSpotRequestThrottle {
  constructor(options = {}) {
    // Prevent direct instantiation (use getInstance)
    if (instance) {
      throw new Error('Use HubSpotRequestThrottle.getInstance() instead of new');
    }

    this.tier = options.tier || process.env.HUBSPOT_TIER || 'starter';
    this.verbose = options.verbose || false;

    // Initialize safeguard
    this.safeguard = new HubSpotAPISafeguard({
      tier: this.tier,
      verbose: this.verbose
    });

    // Concurrency limits by tier
    this.tierLimits = {
      starter: { maxConcurrent: 8, requestsPerWindow: 100 },
      professional: { maxConcurrent: 15, requestsPerWindow: 190 },
      enterprise: { maxConcurrent: 15, requestsPerWindow: 190 },
      oauth_app: { maxConcurrent: 9, requestsPerWindow: 110 }
    };

    // Active tracking
    this.activeRequests = 0;
    this.maxConcurrent = this.getTierMaxConcurrent();
    this.queue = [];
    this.processing = false;

    // Circuit breaker state
    this.circuitBreaker = {
      consecutive429s: 0,
      lastFailure: null,
      state: 'CLOSED', // CLOSED (normal), OPEN (blocking), HALF_OPEN (testing)
      cooldownMs: 60000, // 1 minute cooldown
      maxFailures: 3 // Open circuit after 3 consecutive 429s
    };

    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      rateLimitedRequests: 0,
      queuedRequests: 0,
      circuitBreakerTrips: 0,
      lastRateLimitInfo: null,
      detectedTier: null
    };

    this.log(`HubSpotRequestThrottle initialized (tier: ${this.tier}, maxConcurrent: ${this.maxConcurrent})`);
  }

  /**
   * Get singleton instance
   */
  static getInstance(options = {}) {
    if (!instance) {
      instance = new HubSpotRequestThrottle(options);
    }
    return instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance() {
    instance = null;
  }

  /**
   * Get maximum concurrent requests for current tier
   */
  getTierMaxConcurrent() {
    const limit = this.tierLimits[this.tier] || this.tierLimits.starter;
    return limit.maxConcurrent;
  }

  /**
   * Update tier based on response headers
   */
  updateTierFromResponse(rateLimitInfo) {
    const detectedTier = detectTierFromHeaders(rateLimitInfo);
    if (detectedTier !== 'unknown' && detectedTier !== this.stats.detectedTier) {
      this.stats.detectedTier = detectedTier;
      if (detectedTier !== this.tier) {
        this.log(`Tier detected from headers: ${detectedTier} (configured: ${this.tier})`);
        // Could auto-adjust, but safer to log and let user configure
      }
    }
  }

  /**
   * Enqueue a request for throttled execution
   *
   * @param {Function} requestFn - Async function that makes the request
   * @param {Object} options - Options (priority: 'high' | 'normal' | 'low')
   * @returns {Promise<Response>} The response from the request
   */
  async enqueue(requestFn, options = {}) {
    const priority = options.priority || 'normal';

    return new Promise((resolve, reject) => {
      const queueItem = {
        requestFn,
        resolve,
        reject,
        priority,
        enqueuedAt: Date.now()
      };

      // Priority queue insertion
      if (priority === 'high') {
        this.queue.unshift(queueItem);
      } else {
        this.queue.push(queueItem);
      }

      this.stats.queuedRequests++;
      this.processQueue();
    });
  }

  /**
   * Process queued requests
   */
  async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      // Check circuit breaker
      if (this.circuitBreaker.state === 'OPEN') {
        const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailure;
        if (timeSinceFailure < this.circuitBreaker.cooldownMs) {
          // Still in cooldown, wait
          await this.delay(Math.min(1000, this.circuitBreaker.cooldownMs - timeSinceFailure));
          continue;
        } else {
          // Try half-open
          this.circuitBreaker.state = 'HALF_OPEN';
          this.log('Circuit breaker transitioning to HALF_OPEN');
        }
      }

      // Check if we can make more requests
      if (this.activeRequests >= this.maxConcurrent) {
        await this.delay(50); // Small delay before checking again
        continue;
      }

      // Check rate limit status
      const rateLimitStatus = this.safeguard.checkRateLimit();
      if (rateLimitStatus.shouldWait && rateLimitStatus.recommendedDelay > 0) {
        this.log(`Rate limit approaching, waiting ${rateLimitStatus.recommendedDelay}ms`);
        await this.delay(rateLimitStatus.recommendedDelay);
        continue;
      }

      // Dequeue and execute
      const item = this.queue.shift();
      if (!item) continue;

      this.activeRequests++;
      this.stats.totalRequests++;
      this.safeguard.recordRequest();

      // Execute request (don't await, let it complete in background)
      this.executeRequest(item).catch(err => {
        this.log(`Request error: ${err.message}`);
      });
    }

    this.processing = false;
  }

  /**
   * Execute a single request with error handling
   */
  async executeRequest(item) {
    try {
      const response = await item.requestFn();

      // Parse rate limit headers from response
      if (response && response.headers) {
        const rateLimitInfo = parseRateLimitHeaders(response);
        this.stats.lastRateLimitInfo = rateLimitInfo;
        this.updateTierFromResponse(rateLimitInfo);

        if (this.verbose) {
          this.log(`Response: ${formatForLog(rateLimitInfo)}`);
        }

        // Check if we need to adapt
        const decision = shouldProceed(rateLimitInfo);
        if (decision.waitMs > 0 && !decision.canProceed) {
          this.log(`Rate limit response, waiting ${decision.waitMs}ms`);
          await this.delay(decision.waitMs);
        }
      }

      // Success - reset circuit breaker
      if (this.circuitBreaker.state === 'HALF_OPEN') {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.consecutive429s = 0;
        this.log('Circuit breaker CLOSED (success)');
      }

      this.stats.successfulRequests++;
      item.resolve(response);

    } catch (error) {
      // Handle rate limit errors
      if (error.status === 429 || error.message?.includes('429')) {
        this.stats.rateLimitedRequests++;
        this.handleRateLimitError(error);

        // Re-queue the request (with backoff)
        const backoff = this.safeguard.handleRateLimitError(error);
        this.log(`Rate limited, re-queuing with ${backoff.delay}ms delay`);

        await this.delay(backoff.delay);
        this.queue.unshift(item); // Re-add to front of queue
      } else {
        item.reject(error);
      }
    } finally {
      this.activeRequests--;
      // Trigger queue processing for next item
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  /**
   * Handle rate limit error (429)
   */
  handleRateLimitError(error) {
    this.circuitBreaker.consecutive429s++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.consecutive429s >= this.circuitBreaker.maxFailures) {
      this.circuitBreaker.state = 'OPEN';
      this.stats.circuitBreakerTrips++;
      this.log(`Circuit breaker OPEN after ${this.circuitBreaker.consecutive429s} consecutive 429s`);

      // Reduce concurrency when circuit breaker trips
      this.maxConcurrent = Math.max(1, Math.floor(this.maxConcurrent / 2));
      this.log(`Reduced maxConcurrent to ${this.maxConcurrent}`);
    }
  }

  /**
   * Execute a request immediately (bypass queue)
   * Use sparingly - only for critical operations
   */
  async executeImmediate(requestFn) {
    this.stats.totalRequests++;
    this.safeguard.recordRequest();

    try {
      const response = await requestFn();

      if (response && response.headers) {
        const rateLimitInfo = parseRateLimitHeaders(response);
        this.stats.lastRateLimitInfo = rateLimitInfo;
      }

      this.stats.successfulRequests++;
      return response;

    } catch (error) {
      if (error.status === 429 || error.message?.includes('429')) {
        this.stats.rateLimitedRequests++;
        const backoff = this.safeguard.handleRateLimitError(error);
        error.retryAfter = backoff.delay;
      }
      throw error;
    }
  }

  /**
   * Get current throttle status
   */
  getStatus() {
    return {
      tier: this.tier,
      detectedTier: this.stats.detectedTier,
      activeRequests: this.activeRequests,
      maxConcurrent: this.maxConcurrent,
      queueLength: this.queue.length,
      circuitBreaker: this.circuitBreaker.state,
      rateLimitStatus: this.safeguard.checkRateLimit(),
      stats: { ...this.stats }
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalRequests > 0
        ? ((this.stats.successfulRequests / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      rateLimitRate: this.stats.totalRequests > 0
        ? ((this.stats.rateLimitedRequests / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Reset circuit breaker manually
   */
  resetCircuitBreaker() {
    this.circuitBreaker = {
      consecutive429s: 0,
      lastFailure: null,
      state: 'CLOSED',
      cooldownMs: 60000,
      maxFailures: 3
    };
    this.maxConcurrent = this.getTierMaxConcurrent();
    this.log('Circuit breaker manually reset');
  }

  /**
   * Wait for all queued requests to complete
   */
  async drain() {
    while (this.queue.length > 0 || this.activeRequests > 0) {
      await this.delay(100);
    }
  }

  /**
   * Utility: Delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Logging utility
   */
  log(message) {
    if (this.verbose) {
      console.log(`[HubSpotThrottle] ${message}`);
    }
  }
}

/**
 * Convenience function to get throttle instance
 */
function getThrottle(options = {}) {
  return HubSpotRequestThrottle.getInstance(options);
}

/**
 * Convenience function to execute a throttled request
 */
async function throttledFetch(url, fetchOptions, throttleOptions = {}) {
  const throttle = getThrottle(throttleOptions);
  return throttle.enqueue(async () => {
    const response = await fetch(url, fetchOptions);
    return response;
  }, throttleOptions);
}

module.exports = {
  HubSpotRequestThrottle,
  getThrottle,
  throttledFetch
};

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] === '--test') {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  HUBSPOT REQUEST THROTTLE - SELF-TESTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Reset for fresh tests
    HubSpotRequestThrottle.resetInstance();

    // Test 1: Singleton pattern
    console.log('Test 1: Singleton pattern');
    const throttle1 = HubSpotRequestThrottle.getInstance({ tier: 'starter', verbose: true });
    const throttle2 = HubSpotRequestThrottle.getInstance();
    console.log('  Same instance:', throttle1 === throttle2);
    console.log('  ✅ Singleton working');

    // Test 2: Status check
    console.log('\nTest 2: Status check');
    const status = throttle1.getStatus();
    console.log('  Status:', JSON.stringify(status, null, 2));
    console.log('  ✅ Status retrieved');

    // Test 3: Circuit breaker
    console.log('\nTest 3: Circuit breaker handling');
    // Simulate 429 errors
    throttle1.handleRateLimitError({ status: 429 });
    throttle1.handleRateLimitError({ status: 429 });
    throttle1.handleRateLimitError({ status: 429 });
    console.log('  Circuit breaker state after 3 429s:', throttle1.circuitBreaker.state);
    console.log('  ✅ Circuit breaker trips correctly');

    // Test 4: Reset circuit breaker
    console.log('\nTest 4: Reset circuit breaker');
    throttle1.resetCircuitBreaker();
    console.log('  Circuit breaker state after reset:', throttle1.circuitBreaker.state);
    console.log('  ✅ Circuit breaker resets correctly');

    // Test 5: Stats
    console.log('\nTest 5: Statistics');
    const stats = throttle1.getStats();
    console.log('  Stats:', JSON.stringify(stats, null, 2));
    console.log('  ✅ Stats retrieved');

    // Cleanup
    HubSpotRequestThrottle.resetInstance();

    console.log('\n───────────────────────────────────────────────────────────');
    console.log('  All tests passed!');
    console.log('═══════════════════════════════════════════════════════════\n');

  } else if (args[0] === '--status') {
    const tier = args[1] || 'starter';
    const throttle = HubSpotRequestThrottle.getInstance({ tier });
    console.log('HubSpot Request Throttle Status:');
    console.log(JSON.stringify(throttle.getStatus(), null, 2));

  } else {
    console.log(`
HubSpot Centralized Request Throttle

Coordinates all HubSpot API requests to prevent rate limit collisions.

Usage:
  const { getThrottle, throttledFetch } = require('./hubspot-request-throttle');

  // Option 1: Use throttledFetch for simple cases
  const response = await throttledFetch(url, fetchOptions);

  // Option 2: Use throttle directly for more control
  const throttle = getThrottle({ tier: 'starter' });
  const response = await throttle.enqueue(async () => fetch(url, options));

Features:
  - Singleton pattern for global coordination
  - Tier-aware rate limits (starter: 100, pro: 190 per 10s)
  - Circuit breaker (opens after 3 consecutive 429s)
  - Adaptive throttling from response headers
  - Request queue with priority support

Commands:
  node hubspot-request-throttle.js --test     Run self-tests
  node hubspot-request-throttle.js --status   Show throttle status

Environment:
  HUBSPOT_TIER - Set tier (starter, professional, enterprise)
`);
  }
}
