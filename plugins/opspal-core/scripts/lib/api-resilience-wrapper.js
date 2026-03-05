#!/usr/bin/env node

/**
 * API Resilience Wrapper
 *
 * Provides resilient API call patterns to prevent external API failures:
 * - Retry with exponential backoff
 * - Circuit breaker pattern
 * - Rate limit pre-flight checks
 * - Request queuing and throttling
 *
 * Addresses: Cohort 5 (external-api) - 3 reflections, $15K ROI
 *
 * Prevention Targets:
 * - API rate limit violations (429 errors)
 * - Transient network failures
 * - Service degradation cascades
 * - Timeout handling
 *
 * Usage:
 *   const { ResilientClient } = require('./api-resilience-wrapper');
 *
 *   const client = new ResilientClient({
 *     baseUrl: 'https://api.example.com',
 *     retries: 3,
 *     circuitBreaker: { threshold: 5, timeout: 30000 }
 *   });
 *
 *   const result = await client.request('/endpoint', { method: 'GET' });
 *
 * CLI:
 *   node api-resilience-wrapper.js test <url>
 *   node api-resilience-wrapper.js status
 *   node api-resilience-wrapper.js reset <serviceName>
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// Default configuration
const DEFAULT_CONFIG = {
  retries: 3,
  initialDelay: 1000, // ms
  maxDelay: 30000, // ms
  backoffMultiplier: 2,
  timeout: 30000, // ms
  circuitBreaker: {
    enabled: true,
    threshold: 5, // failures before opening
    timeout: 30000, // time before attempting reset
    halfOpenRequests: 1 // requests to allow in half-open state
  },
  rateLimiter: {
    enabled: true,
    requestsPerSecond: 10,
    burstSize: 20
  },
  // Memory management - prevent unbounded Map growth
  maxCircuitBreakers: 100, // Maximum number of circuit breakers to keep
  maxRateLimiters: 100 // Maximum number of rate limiters to keep
};

// State storage path
const STATE_PATH = path.join(process.env.HOME || '/tmp', '.claude', 'api-resilience-state.json');

/**
 * Circuit Breaker States
 */
const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

/**
 * Circuit Breaker Implementation
 */
class CircuitBreaker {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.threshold = options.threshold || 5;
    this.timeout = options.timeout || 30000;
    this.halfOpenRequests = options.halfOpenRequests || 1;

    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
  }

  /**
   * Check if request is allowed
   */
  isAllowed() {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // Check if timeout has elapsed
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.timeout) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenAttempts = 0;
        return true;
      }
      return false;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // Allow limited requests in half-open state
      return this.halfOpenAttempts < this.halfOpenRequests;
    }

    return false;
  }

  /**
   * Record a successful request
   */
  recordSuccess() {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.halfOpenRequests) {
        // Circuit healed
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
      }
    }
    this.failures = Math.max(0, this.failures - 1); // Gradual recovery
  }

  /**
   * Record a failed request
   */
  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during recovery - open circuit
      this.state = CircuitState.OPEN;
      this.halfOpenAttempts = 0;
    } else if (this.failures >= this.threshold) {
      this.state = CircuitState.OPEN;
    }
  }

  /**
   * Get current state
   */
  getStatus() {
    return {
      serviceName: this.serviceName,
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      timeSinceLastFailure: this.lastFailureTime
        ? Date.now() - this.lastFailureTime
        : null
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
  }
}

/**
 * Token Bucket Rate Limiter
 */
class RateLimiter {
  constructor(options = {}) {
    this.requestsPerSecond = options.requestsPerSecond || 10;
    this.burstSize = options.burstSize || 20;
    this.tokens = this.burstSize;
    this.lastRefill = Date.now();
    this.queue = [];
    this.processing = false;
  }

  /**
   * Refill tokens based on elapsed time
   */
  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.requestsPerSecond;
    this.tokens = Math.min(this.burstSize, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /**
   * Check if request is allowed immediately
   */
  canProceed() {
    this.refill();
    return this.tokens >= 1;
  }

  /**
   * Consume a token for a request
   */
  consume() {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Get time until next token available
   */
  getWaitTime() {
    if (this.canProceed()) {
      return 0;
    }
    return Math.ceil((1 - this.tokens) / this.requestsPerSecond * 1000);
  }

  /**
   * Wait for rate limit clearance
   */
  async waitForToken() {
    while (!this.consume()) {
      const waitTime = this.getWaitTime();
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    this.refill();
    return {
      tokens: Math.floor(this.tokens),
      maxTokens: this.burstSize,
      requestsPerSecond: this.requestsPerSecond,
      waitTime: this.getWaitTime()
    };
  }
}

/**
 * Resilient HTTP Client
 */
class ResilientClient {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.baseUrl = options.baseUrl || '';
    this.circuitBreakers = new Map();
    this.rateLimiters = new Map();
    // Track access order for LRU eviction
    this.circuitBreakerAccessOrder = [];
    this.rateLimiterAccessOrder = [];

    // Load persisted state
    this.loadState();
  }

  /**
   * Evict oldest entry from a Map if at capacity (LRU eviction)
   * @private
   */
  _evictIfNeeded(map, accessOrder, maxSize) {
    while (map.size >= maxSize && accessOrder.length > 0) {
      const oldest = accessOrder.shift();
      if (map.has(oldest)) {
        map.delete(oldest);
      }
    }
  }

  /**
   * Update access order for LRU tracking
   * @private
   */
  _updateAccessOrder(accessOrder, serviceName) {
    // Remove existing entry if present
    const idx = accessOrder.indexOf(serviceName);
    if (idx !== -1) {
      accessOrder.splice(idx, 1);
    }
    // Add to end (most recently used)
    accessOrder.push(serviceName);
  }

  /**
   * Get or create circuit breaker for service
   */
  getCircuitBreaker(serviceName) {
    if (!this.circuitBreakers.has(serviceName)) {
      // Evict oldest if at capacity (LRU eviction to prevent memory leaks)
      this._evictIfNeeded(
        this.circuitBreakers,
        this.circuitBreakerAccessOrder,
        this.config.maxCircuitBreakers
      );
      this.circuitBreakers.set(
        serviceName,
        new CircuitBreaker(serviceName, this.config.circuitBreaker)
      );
    }
    // Update access order for LRU
    this._updateAccessOrder(this.circuitBreakerAccessOrder, serviceName);
    return this.circuitBreakers.get(serviceName);
  }

  /**
   * Get or create rate limiter for service
   */
  getRateLimiter(serviceName) {
    if (!this.rateLimiters.has(serviceName)) {
      // Evict oldest if at capacity (LRU eviction to prevent memory leaks)
      this._evictIfNeeded(
        this.rateLimiters,
        this.rateLimiterAccessOrder,
        this.config.maxRateLimiters
      );
      this.rateLimiters.set(
        serviceName,
        new RateLimiter(this.config.rateLimiter)
      );
    }
    // Update access order for LRU
    this._updateAccessOrder(this.rateLimiterAccessOrder, serviceName);
    return this.rateLimiters.get(serviceName);
  }

  /**
   * Extract service name from URL
   */
  getServiceName(url) {
    try {
      const parsed = new URL(url, this.baseUrl || 'http://localhost');
      return parsed.hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Calculate delay with exponential backoff
   */
  calculateDelay(attempt, retryAfter = null) {
    if (retryAfter) {
      return Math.min(retryAfter * 1000, this.config.maxDelay);
    }

    const delay = this.config.initialDelay *
      Math.pow(this.config.backoffMultiplier, attempt);

    // Add jitter (10-20% randomization)
    const jitter = delay * (0.1 + Math.random() * 0.1);

    return Math.min(delay + jitter, this.config.maxDelay);
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error, statusCode) {
    // Network errors are retryable
    if (error && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(error.code)) {
      return true;
    }

    // Server errors are usually retryable
    if (statusCode >= 500 && statusCode < 600) {
      return true;
    }

    // Rate limit is retryable after waiting
    if (statusCode === 429) {
      return true;
    }

    // Request timeout
    if (statusCode === 408) {
      return true;
    }

    return false;
  }

  /**
   * Make HTTP request with resilience
   */
  async request(endpoint, options = {}) {
    const url = this.baseUrl ? new URL(endpoint, this.baseUrl).toString() : endpoint;
    const serviceName = this.getServiceName(url);
    const circuitBreaker = this.getCircuitBreaker(serviceName);
    const rateLimiter = this.getRateLimiter(serviceName);

    // Circuit breaker check
    if (this.config.circuitBreaker.enabled && !circuitBreaker.isAllowed()) {
      const status = circuitBreaker.getStatus();
      throw new Error(`Circuit breaker OPEN for ${serviceName}. ` +
        `${status.failures} failures, retry in ${Math.ceil((status.timeSinceLastFailure - this.config.circuitBreaker.timeout) / -1000)}s`);
    }

    // Rate limiter check
    if (this.config.rateLimiter.enabled) {
      await rateLimiter.waitForToken();
    }

    let lastError = null;
    let lastStatusCode = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const result = await this.executeRequest(url, options);

        // Success - record and return
        circuitBreaker.recordSuccess();
        this.saveState();

        return result;
      } catch (error) {
        lastError = error;
        lastStatusCode = error.statusCode;

        // Record failure
        if (this.config.circuitBreaker.enabled) {
          circuitBreaker.recordFailure();
        }

        // Check if retryable
        if (!this.isRetryable(error, error.statusCode)) {
          this.saveState();
          throw error;
        }

        // Last attempt - don't wait
        if (attempt === this.config.retries) {
          this.saveState();
          throw new Error(`All ${this.config.retries + 1} attempts failed for ${url}. ` +
            `Last error: ${error.message}`);
        }

        // Calculate delay
        const retryAfter = error.headers?.['retry-after'];
        const delay = this.calculateDelay(attempt, retryAfter ? parseInt(retryAfter) : null);

        console.error(`[api-resilience] Attempt ${attempt + 1}/${this.config.retries + 1} failed ` +
          `(${error.statusCode || error.code || 'error'}), retrying in ${Math.round(delay)}ms`);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Execute single HTTP request
   */
  executeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'api-resilience-wrapper/1.0',
          ...options.headers
        },
        timeout: options.timeout || this.config.timeout
      };

      const req = client.request(requestOptions, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          const statusCode = res.statusCode;

          if (statusCode >= 200 && statusCode < 300) {
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch {
              resolve(data);
            }
          } else {
            const error = new Error(`HTTP ${statusCode}: ${data.substring(0, 200)}`);
            error.statusCode = statusCode;
            error.headers = res.headers;
            error.body = data;
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        const error = new Error(`Request timeout after ${requestOptions.timeout}ms`);
        error.code = 'ETIMEDOUT';
        reject(error);
      });

      // Write request body
      if (options.body) {
        const body = typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body);
        req.write(body);
      }

      req.end();
    });
  }

  /**
   * Convenience method for GET requests
   */
  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  /**
   * Convenience method for POST requests
   */
  async post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
  }

  /**
   * Get status of all circuit breakers and rate limiters
   */
  getStatus() {
    const status = {
      circuitBreakers: {},
      rateLimiters: {},
      config: {
        retries: this.config.retries,
        timeout: this.config.timeout,
        circuitBreaker: this.config.circuitBreaker,
        rateLimiter: this.config.rateLimiter
      }
    };

    for (const [name, cb] of this.circuitBreakers) {
      status.circuitBreakers[name] = cb.getStatus();
    }

    for (const [name, rl] of this.rateLimiters) {
      status.rateLimiters[name] = rl.getStatus();
    }

    return status;
  }

  /**
   * Reset circuit breaker for service
   */
  resetCircuitBreaker(serviceName) {
    if (this.circuitBreakers.has(serviceName)) {
      this.circuitBreakers.get(serviceName).reset();
      this.saveState();
      return true;
    }
    return false;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const cb of this.circuitBreakers.values()) {
      cb.reset();
    }
    this.saveState();
  }

  /**
   * Load persisted state
   */
  loadState() {
    try {
      if (fs.existsSync(STATE_PATH)) {
        const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));

        for (const [name, cbState] of Object.entries(state.circuitBreakers || {})) {
          const cb = this.getCircuitBreaker(name);
          cb.state = cbState.state;
          cb.failures = cbState.failures;
          cb.lastFailureTime = cbState.lastFailureTime;
        }
      }
    } catch (error) {
      console.error(`[api-resilience] Failed to load state: ${error.message}`);
    }
  }

  /**
   * Save state to disk
   */
  saveState() {
    try {
      const state = {
        circuitBreakers: {},
        savedAt: new Date().toISOString()
      };

      for (const [name, cb] of this.circuitBreakers) {
        state.circuitBreakers[name] = {
          state: cb.state,
          failures: cb.failures,
          lastFailureTime: cb.lastFailureTime
        };
      }

      const dir = path.dirname(STATE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error(`[api-resilience] Failed to save state: ${error.message}`);
    }
  }
}

/**
 * Create pre-configured clients for common APIs
 */
const createSalesforceClient = (instanceUrl, accessToken) => {
  return new ResilientClient({
    baseUrl: instanceUrl,
    rateLimiter: {
      enabled: true,
      requestsPerSecond: 25, // Salesforce limit per user
      burstSize: 50
    },
    circuitBreaker: {
      enabled: true,
      threshold: 3,
      timeout: 60000
    }
  });
};

const createHubSpotClient = (accessToken) => {
  return new ResilientClient({
    baseUrl: 'https://api.hubapi.com',
    rateLimiter: {
      enabled: true,
      requestsPerSecond: 10, // HubSpot default
      burstSize: 20
    }
  });
};

const createAsanaClient = (accessToken) => {
  return new ResilientClient({
    baseUrl: 'https://app.asana.com/api/1.0',
    rateLimiter: {
      enabled: true,
      requestsPerSecond: 150 / 60, // 150 per minute
      burstSize: 30
    }
  });
};

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const client = new ResilientClient();

  switch (command) {
    case 'test': {
      const url = args[1];
      if (!url) {
        console.error('Usage: api-resilience-wrapper.js test <url>');
        process.exit(1);
      }

      console.log(`Testing URL: ${url}`);
      client.get(url)
        .then(result => {
          console.log('\nSuccess!');
          console.log('Response:', typeof result === 'string' ? result.substring(0, 500) : JSON.stringify(result, null, 2).substring(0, 500));
          console.log('\nStatus:', JSON.stringify(client.getStatus(), null, 2));
        })
        .catch(error => {
          console.error('\nFailed:', error.message);
          console.error('\nStatus:', JSON.stringify(client.getStatus(), null, 2));
          process.exit(1);
        });
      break;
    }

    case 'status': {
      console.log('API Resilience Status:');
      console.log(JSON.stringify(client.getStatus(), null, 2));
      break;
    }

    case 'reset': {
      const serviceName = args[1];
      if (serviceName) {
        if (client.resetCircuitBreaker(serviceName)) {
          console.log(`Reset circuit breaker for: ${serviceName}`);
        } else {
          console.log(`No circuit breaker found for: ${serviceName}`);
        }
      } else {
        client.resetAll();
        console.log('Reset all circuit breakers');
      }
      break;
    }

    default:
      console.log(`
API Resilience Wrapper - Robust API client with retry, circuit breaker, and rate limiting

Commands:
  test <url>          Test URL with resilience wrapper
  status              Show circuit breaker and rate limiter status
  reset [service]     Reset circuit breaker (all if no service specified)

Configuration (environment variables):
  API_RESILIENCE_RETRIES=3          Number of retry attempts
  API_RESILIENCE_TIMEOUT=30000      Request timeout in ms
  API_RESILIENCE_CB_THRESHOLD=5     Circuit breaker failure threshold
  API_RESILIENCE_CB_TIMEOUT=30000   Circuit breaker reset timeout in ms
  API_RESILIENCE_RATE_RPS=10        Requests per second limit
  API_RESILIENCE_RATE_BURST=20      Burst size for rate limiter

Examples:
  node api-resilience-wrapper.js test https://api.example.com/health
  node api-resilience-wrapper.js status
  node api-resilience-wrapper.js reset api.example.com
`);
  }
}

module.exports = {
  ResilientClient,
  CircuitBreaker,
  RateLimiter,
  CircuitState,
  createSalesforceClient,
  createHubSpotClient,
  createAsanaClient
};
