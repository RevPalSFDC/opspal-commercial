/**
 * Rate Limiter with Exponential Backoff and Circuit Breaker
 * Handles HubSpot API rate limits intelligently
 */

const config = require('./config');

class RateLimiter {
    constructor(options = {}) {
        this.config = { ...config.rateLimit, ...options };

        // Burst limits
        this.secondCounter = { count: 0, resetTime: Date.now() + 1000 };
        this.tenSecondCounter = { count: 0, resetTime: Date.now() + 10000 };

        // Daily limits
        this.dailyCounter = { count: 0, resetTime: this.getNextDayReset() };

        // Circuit breaker
        this.circuitBreaker = {
            failures: 0,
            lastFailure: null,
            state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
            openUntil: null
        };

        // Retry state
        this.retryState = {
            consecutiveRetries: 0,
            lastRetryTime: null
        };
    }

    /**
     * Check if request can proceed, wait if needed
     */
    async checkLimit() {
        // Check circuit breaker
        if (this.circuitBreaker.state === 'OPEN') {
            if (Date.now() < this.circuitBreaker.openUntil) {
                throw new Error(`Circuit breaker open until ${new Date(this.circuitBreaker.openUntil).toISOString()}`);
            }
            // Try half-open
            this.circuitBreaker.state = 'HALF_OPEN';
        }

        const now = Date.now();

        // Reset counters if needed
        if (now >= this.secondCounter.resetTime) {
            this.secondCounter = { count: 0, resetTime: now + 1000 };
        }
        if (now >= this.tenSecondCounter.resetTime) {
            this.tenSecondCounter = { count: 0, resetTime: now + 10000 };
        }
        if (now >= this.dailyCounter.resetTime) {
            this.dailyCounter = { count: 0, resetTime: this.getNextDayReset() };
        }

        // Check daily limit
        if (this.dailyCounter.count >= this.config.daily.requestsPerDay) {
            const waitTime = this.dailyCounter.resetTime - now;
            throw new Error(`Daily limit reached. Reset in ${Math.round(waitTime / 1000 / 60)} minutes`);
        }

        // Check and wait for burst limits
        if (this.secondCounter.count >= this.config.burst.requestsPerSecond) {
            const waitTime = this.secondCounter.resetTime - now;
            await this.wait(waitTime);
            this.secondCounter = { count: 0, resetTime: Date.now() + 1000 };
        }

        if (this.tenSecondCounter.count >= this.config.burst.requestsPer10Seconds) {
            const waitTime = this.tenSecondCounter.resetTime - now;
            await this.wait(waitTime);
            this.tenSecondCounter = { count: 0, resetTime: Date.now() + 10000 };
        }

        // Increment counters
        this.secondCounter.count++;
        this.tenSecondCounter.count++;
        this.dailyCounter.count++;

        // Mark success if circuit was half-open
        if (this.circuitBreaker.state === 'HALF_OPEN') {
            this.circuitBreaker.state = 'CLOSED';
            this.circuitBreaker.failures = 0;
        }
    }

    /**
     * Handle rate limit response (429)
     * @param {Object} response Response object with headers
     */
    async handleRateLimitResponse(response) {
        const retryAfter = response.headers?.get?.('retry-after') ||
                          response.headers?.['retry-after'] ||
                          this.config.retryAfterDefault;

        const waitTime = parseInt(retryAfter) * 1000;

        // Update circuit breaker
        this.circuitBreaker.failures++;
        this.circuitBreaker.lastFailure = Date.now();

        if (this.circuitBreaker.failures >= 5) {
            this.circuitBreaker.state = 'OPEN';
            this.circuitBreaker.openUntil = Date.now() + (waitTime * 2); // Double the wait time
        }

        // Calculate backoff with jitter
        const backoffTime = this.calculateBackoff(waitTime);

        await this.wait(backoffTime);

        // Reset burst counters after waiting
        const now = Date.now();
        this.secondCounter = { count: 0, resetTime: now + 1000 };
        this.tenSecondCounter = { count: 0, resetTime: now + 10000 };
    }

    /**
     * Calculate exponential backoff with jitter
     */
    calculateBackoff(baseWaitTime) {
        const { backoff } = this.config;

        // Exponential backoff
        let delay = Math.min(
            backoff.initialDelayMs * Math.pow(backoff.multiplier, this.retryState.consecutiveRetries),
            backoff.maxDelayMs
        );

        // Use provided wait time if larger
        delay = Math.max(delay, baseWaitTime);

        // Add jitter (±10%)
        const jitter = delay * backoff.jitterFactor;
        delay = delay + (Math.random() * jitter * 2 - jitter);

        this.retryState.consecutiveRetries++;
        this.retryState.lastRetryTime = Date.now();

        return Math.round(delay);
    }

    /**
     * Reset retry state on success
     */
    resetRetryState() {
        this.retryState.consecutiveRetries = 0;
        this.retryState.lastRetryTime = null;
    }

    /**
     * Create idempotent retry wrapper
     */
    createRetryWrapper(fn, maxAttempts = 3) {
        return async (...args) => {
            let lastError;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                try {
                    await this.checkLimit();
                    const result = await fn(...args);
                    this.resetRetryState();
                    return result;
                } catch (error) {
                    lastError = error;

                    // Check if rate limited
                    if (error.statusCode === 429 || error.code === 'RATE_LIMITED') {
                        await this.handleRateLimitResponse(error);
                        continue;
                    }

                    // Check if retryable
                    if (this.isRetryableError(error) && attempt < maxAttempts - 1) {
                        const backoff = this.calculateBackoff(0);
                        await this.wait(backoff);
                        continue;
                    }

                    // Non-retryable error
                    throw error;
                }
            }

            throw lastError;
        };
    }

    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
        const retryableCodes = [502, 503, 504, 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];

        return retryableCodes.includes(error.statusCode) ||
               retryableCodes.includes(error.code) ||
               error.statusCode >= 500;
    }

    /**
     * Get next day reset time (midnight UTC)
     */
    getNextDayReset() {
        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(0, 0, 0, 0);
        return tomorrow.getTime();
    }

    /**
     * Get current rate limit status
     */
    getStatus() {
        const now = Date.now();
        return {
            burst: {
                second: `${this.secondCounter.count}/${this.config.burst.requestsPerSecond}`,
                tenSeconds: `${this.tenSecondCounter.count}/${this.config.burst.requestsPer10Seconds}`
            },
            daily: {
                used: this.dailyCounter.count,
                limit: this.config.daily.requestsPerDay,
                remaining: this.config.daily.requestsPerDay - this.dailyCounter.count,
                resetIn: Math.round((this.dailyCounter.resetTime - now) / 1000 / 60) + ' minutes'
            },
            circuitBreaker: this.circuitBreaker.state,
            retries: this.retryState.consecutiveRetries
        };
    }

    wait(ms) {
        if (ms <= 0) return Promise.resolve();
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = RateLimiter;